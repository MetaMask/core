import { Web3Provider } from '@ethersproject/providers';
import type { QuoteResponseV1, Trade } from '@metamask/bridge-controller';
import { buildMoneyAccountDepositBatch } from '@metamask/money-account-utils';
import type { MoneyAccountVaultConfig } from '@metamask/money-account-utils';
import { CHAIN_IDS } from '@metamask/transaction-controller';
import type { BigNumber } from 'bignumber.js';

import { Operation } from '../types.js';
import type { QuoteAndTxMetadata } from '../types.js';
import { getVaultConfig } from '../utils/feature-flags.js';
import { getPrimaryMoneyAccount } from '../utils/money-account.js';
import { getWeb3Provider } from '../utils/network.js';
import { waitForMMPayFeeQuotes } from '../utils/subscriptions.js';
import { getReceivedAmountFromTxHash } from '../utils/swap-received-amount.js';
import {
  findAllTransactionsInBatch,
  getAddTransactionBatchParams,
  getTransactionMetaByBatchId,
  shouldDisable7702,
} from '../utils/transaction.js';
import { SubmitStep } from './types.js';
import type { SubmitStrategyParams, SubmitStepResult } from './types.js';

const generateDepositTxs = async (
  quoteResponse: QuoteResponseV1,
  receivedAmount: BigNumber,
  moneyAccountAddress: `0x${string}`,
  vaultConfig: MoneyAccountVaultConfig,
  provider: Web3Provider,
): Promise<QuoteAndTxMetadata[]> => {
  const { quote } = quoteResponse;

  const {
    boringVault,
    tellerAddress,
    accountantAddress,
    lensAddress,
    underlyingToken,
    chainId,
  } = vaultConfig;

  if (!underlyingToken) {
    throw new Error('Failed to get underlying token');
  }

  // Build txs
  const { approveTx, depositTx } = await buildMoneyAccountDepositBatch({
    amount: BigInt(receivedAmount.toNumber()),
    chainId,
    provider,
    boringVault,
    tellerAddress,
    accountantAddress,
    lensAddress,
  });

  const sharedTxParams = {
    from: moneyAccountAddress,
    chainId: quote.destChainId,
    gasLimit: null,
  };
  const tradeData = [
    {
      quoteResponse,
      tx: {
        ...approveTx.params,
        ...sharedTxParams,
      },
      type: approveTx.type,
    },
    {
      quoteResponse,
      tx: {
        ...depositTx.params,
        ...sharedTxParams,
      },
      type: depositTx.type,
    },
  ];

  return tradeData;
};

/**
 * Submits a post-swap EVM deposit batch to the TransactionController
 *
 * @param args - The parameters for the transaction
 * @yields The approvalMeta and tradeMeta for the batched transaction
 */
export async function* submitDepositHandler(
  args: SubmitStrategyParams<Trade>,
): AsyncGenerator<SubmitStepResult, void, void> {
  const {
    quoteResponses: [quoteResponse],
    messenger,
    addTransactionBatchFn,
    isDelegatedAccount,
    selectedAccount,
    previousTxHash,
    historyKey,
    batchId,
    next,
  } = args;

  const {
    quote: {
      destChainId,
      destWalletAddress,
      destAsset: { address: destAssetAddress },
      walletAddress,
    },
  } = quoteResponse;

  if (!previousTxHash) {
    throw new Error('Previous transaction hash is required for deposit');
  }
  if (!historyKey) {
    throw new Error('History key is required for deposit');
  }
  if (!batchId) {
    throw new Error('Batch ID is required for deposit');
  }

  // Get primary money account for dest wallet address
  const primaryMoneyAccount = getPrimaryMoneyAccount(messenger);
  const moneyAccountAddress = primaryMoneyAccount?.address;
  if (!moneyAccountAddress) {
    throw new Error('Failed to get money account address');
  }

  const vaultConfig = getVaultConfig(messenger);
  if (!vaultConfig?.underlyingToken) {
    throw new Error('Failed to get money account deposit config');
  }

  // Read actual received amount from swap/bridge
  const provider = getWeb3Provider(messenger, destChainId);
  const receivedAmount = await getReceivedAmountFromTxHash(
    previousTxHash,
    destWalletAddress ?? walletAddress ?? selectedAccount.address,
    destAssetAddress,
    provider,
  );

  // Generate deposit txs for received amount
  const tradeData = await generateDepositTxs(
    quoteResponse,
    receivedAmount,
    moneyAccountAddress,
    vaultConfig,
    provider,
  );

  const transactionParams = await getAddTransactionBatchParams({
    tradeData,
    // Always require approval for deposit batch because we need to add MM Pay
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
    skipInitialGasEstimate: true,
    isGasFeeSponsored: CHAIN_IDS.MONAD === vaultConfig.chainId,
    requiredAssets: [
      {
        address: vaultConfig.underlyingToken,
        amount: `0x${receivedAmount.toString(16)}`,
        standard: 'erc20',
      },
    ],
    batchId,
  });

  try {
    // After TransactionController adds the unapproved transaction,
    // update the txMeta with MM Pay quotes then approve the batch
    waitForMMPayFeeQuotes({
      messenger,
      batchId,
      primaryMoneyAccount,
      underlyingToken: vaultConfig.underlyingToken,
      chainId: vaultConfig.chainId,
      operation: Operation.DEPOSIT,
    });

    await addTransactionBatchFn(transactionParams);

    const tradeMeta = getTransactionMetaByBatchId({
      messenger,
      batchId,
    })[0];
    if (!tradeMeta?.hash) {
      throw new Error('Failed to find deposit transaction meta in batch');
    }

    yield {
      type: SubmitStep.SetTradeMeta,
      payload: { tradeMeta },
    };

    yield {
      type: SubmitStep.UpdateHistoryItem,
      payload: {
        historyKey,
        depositTxMeta: {
          id: tradeMeta.id,
        },
        next,
      },
    };
  } catch (error) {
    const quoteAndTxMetas = findAllTransactionsInBatch({
      messenger,
      batchId,
      tradeData,
    });
    // If txMeta has not been added to the TransactionController, propagate the error
    if (!quoteAndTxMetas.some(({ txMeta }) => txMeta)) {
      throw error;
    }
  }
}
