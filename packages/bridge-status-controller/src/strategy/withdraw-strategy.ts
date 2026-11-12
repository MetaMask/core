import { Web3Provider } from '@ethersproject/providers';
import {
  assetIdsMatch,
  formatAddressToAssetId,
  getFeatureFlags,
} from '@metamask/bridge-controller';
import type { Trade } from '@metamask/bridge-controller';
import {
  buildMoneyAccountWithdrawBatch,
  getMoneyAccountVaultConfig,
} from '@metamask/money-account-utils';
import type { MoneyAccountVaultConfig } from '@metamask/money-account-utils';
import { CHAIN_IDS, generateBatchId } from '@metamask/transaction-controller';

import { Operation } from '../types.js';
import { getPrimaryMoneyAccount } from '../utils/money-account.js';
import { getNetworkClientByChainId } from '../utils/network.js';
import { waitForMMPayFeeQuotes } from '../utils/subscriptions.js';
import {
  getAddTransactionBatchParams,
  getTransactionMetaByBatchId,
  shouldDisable7702,
} from '../utils/transaction.js';
import { SubmitStep } from './types.js';
import type { SubmitStrategyParams, SubmitStepResult } from './types.js';

const generateWithdrawTxData = async (
  args: SubmitStrategyParams<Trade>,
  vaultConfig: MoneyAccountVaultConfig,
  primaryMoneyAccount: { address: `0x${string}` },
) => {
  const {
    quoteResponses: [quoteResponse],
    messenger,
    selectedAccount,
  } = args;

  // Get provider for the src chain
  const provider = getNetworkClientByChainId(
    messenger,
    quoteResponse.quote.srcChainId,
  );
  if (!provider) {
    throw new Error(
      `No provider available for chain ${quoteResponse.quote.srcChainId}`,
    );
  }
  const ethersProvider = new Web3Provider(provider);

  const { chainId, tellerAddress, accountantAddress } = vaultConfig;
  const { withdrawTx, transferTx } = await buildMoneyAccountWithdrawBatch({
    amount: BigInt(quoteResponse.quote.srcTokenAmount),
    chainId,
    tellerAddress,
    accountantAddress,
    moneyAccountAddress: primaryMoneyAccount.address,
    recipient: selectedAccount?.address as `0x${string}`,
    provider: ethersProvider,
  });

  return [
    {
      quoteResponse,
      tx: {
        ...withdrawTx.params,
        from: primaryMoneyAccount.address,
        chainId: quoteResponse.quote.srcChainId,
        gasLimit: null,
      },
      type: withdrawTx.type,
    },
    {
      quoteResponse,
      tx: {
        ...transferTx.params,
        from: primaryMoneyAccount.address,
        chainId: quoteResponse.quote.srcChainId,
        gasLimit: null,
      },
      type: transferTx.type,
    },
  ];
};

/**
 * Submits a pre-swap EVM withdraw batch to the TransactionController
 *
 * UI: Money is src token
 * moneyAccount withdraw MUSD to wallet evmAddress (srcWalletAddress)
 * If destToken assetId assetIdsMatch MUSD@moneyChain, noop
 * wallet evmAddress swap MUSD to destToken at destWalletAddress (swap + send)
 *
 * @param args - The parameters for the transaction
 * @yields The approvalMeta and tradeMeta for the batched transaction
 */
export async function* submitWithdrawHandler(
  args: SubmitStrategyParams<Trade>,
): AsyncGenerator<SubmitStepResult, void, void> {
  const {
    quoteResponses: [quoteResponse],
    messenger,
    addTransactionBatchFn,
    isDelegatedAccount,
  } = args;

  // Get vault config
  const featureFlags = getFeatureFlags(messenger);
  const vaultConfig = getMoneyAccountVaultConfig(featureFlags);
  if (!vaultConfig?.underlyingToken) {
    throw new Error('Failed to get vault config');
  }

  const { chainId, underlyingToken } = vaultConfig;

  // Skip swap if dest asset is the underlying token
  const isDestAssetMUSD = underlyingToken
    ? assetIdsMatch(
        formatAddressToAssetId(underlyingToken, chainId),
        quoteResponse.quote.destAsset.assetId,
      )
    : false;
  const next = isDestAssetMUSD ? [] : args.next;

  const batchId = generateBatchId();
  const historyKey = args.historyKey ?? batchId;

  yield {
    type: SubmitStep.AddHistoryItem,
    payload: {
      historyKey,
      withdrawTxMeta: {
        batchId,
      },
      next,
      quoteResponse,
    },
  };

  const primaryMoneyAccount = getPrimaryMoneyAccount(messenger);
  if (!primaryMoneyAccount) {
    throw new Error('Failed to get primary money account');
  }

  const tradeData = await generateWithdrawTxData(
    args,
    vaultConfig,
    primaryMoneyAccount,
  );

  const transactionParams = await getAddTransactionBatchParams({
    tradeData,
    // Always require approval for withdraw batch because we need to add MM Pay
    // quotes before approving the batch
    requireApproval: true,
    isDelegatedAccount,
    disableHook: true,
    disableSequential: true,
    messenger,
    atomic: true,
    disable7702: shouldDisable7702(
      quoteResponse.quote.gasIncluded7702,
      quoteResponse.quote.gasIncluded,
      isDelegatedAccount,
    ),
    selectedAccount: primaryMoneyAccount,
    isGasFeeSponsored: CHAIN_IDS.MONAD === chainId,
    batchId,
  });

  try {
    // After TransactionController adds the unapproved transaction,
    // this updates the txMeta with MM Pay quotes,
    // then approves tx batch
    waitForMMPayFeeQuotes({
      messenger,
      batchId,
      primaryMoneyAccount,
      underlyingToken,
      chainId,
      operation: Operation.WITHDRAW,
    });

    await addTransactionBatchFn(transactionParams);

    const tradeMeta = getTransactionMetaByBatchId({
      messenger,
      batchId,
    })[0];

    // TODO find transferTx meta specifically
    if (!tradeMeta) {
      throw new Error('Failed to find trade meta after withdraw batch added');
    }

    yield {
      type: SubmitStep.SetTradeMeta,
      payload: { tradeMeta },
    };

    yield {
      type: SubmitStep.UpdateHistoryItem,
      payload: {
        historyKey,
        historyItemOverrides: {
          withdrawTxMeta: {
            id: tradeMeta.id,
          },
        },
      },
    };
  } catch (error) {
    const tradeMeta = getTransactionMetaByBatchId({
      messenger,
      batchId,
    })[0];
    // If txMeta has not been added to the TransactionController, propagate the error
    if (!tradeMeta) {
      throw error;
    }
  }
}
