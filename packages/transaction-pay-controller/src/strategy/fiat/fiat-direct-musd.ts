import { ORIGIN_METAMASK } from '@metamask/controller-utils';
import type {
  Quote as RampsQuote,
  RampsOrder,
} from '@metamask/ramps-controller';
import { TransactionType } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { TransactionPayStrategy } from '../../constants';
import { projectLogger } from '../../logger';
import type {
  PayStrategyExecuteRequest,
  PayStrategyGetQuotesRequest,
  TransactionFiatPayment,
  TransactionPayRequiredToken,
  TransactionPayQuote,
} from '../../types';
import { prefixError } from '../../utils/error-prefix';
import { getFiatVaultDisabled } from '../../utils/feature-flags';
import { getNetworkClientId } from '../../utils/provider';
import { buildCaipAssetType, getTokenInfo } from '../../utils/token';
import {
  collectTransactionIds,
  getTransaction,
  updateTransaction,
  waitForTransactionConfirmed,
} from '../../utils/transaction';
import { MUSD_MONAD_FIAT_ASSET } from './constants';
import type { FiatQuote } from './types';
import {
  getRampsQuote,
  getRawSourceAmountFromOrderCryptoAmount,
  resolveSourceAmountRaw,
  validateOrderAsset,
} from './utils';

const log = createModuleLogger(projectLogger, 'fiat-direct-musd');
const DIRECT_MUSD_ERROR_PREFIX = 'Direct mUSD: ';
const VAULT_ERROR_PREFIX = 'Vault: ';

/**
 * Returns a direct mUSD fiat quote to the Money Account.
 *
 * @param options - Direct quote options.
 * @param options.amountFiat - Fiat amount entered by the user.
 * @param options.fiatPaymentMethod - Selected fiat payment method.
 * @param options.messenger - Controller messenger.
 * @param options.moneyAccountAddress - Money Account receiving the on-ramped mUSD.
 * @param options.requiredToken - Required token from the original Money Account transaction.
 * @param options.transactionId - Transaction ID for state updates and logs.
 * @returns Direct mUSD Fiat quote, or undefined when unavailable.
 */
export async function getDirectMusdFiatQuote({
  amountFiat,
  fiatPaymentMethod,
  messenger,
  moneyAccountAddress,
  requiredToken,
  transactionId,
}: {
  amountFiat: string;
  fiatPaymentMethod: string;
  messenger: PayStrategyGetQuotesRequest['messenger'];
  moneyAccountAddress: Hex;
  requiredToken: TransactionPayRequiredToken;
  transactionId: string;
}): Promise<TransactionPayQuote<FiatQuote> | undefined> {
  try {
    const adjustedAmount = Number(amountFiat);

    if (!Number.isFinite(adjustedAmount) || adjustedAmount <= 0) {
      throw new Error('Invalid fiat amount for direct mUSD quote');
    }

    const fiatQuote = await getRampsQuote({
      adjustedAmount,
      errorMessage: 'No matching ramps quote found for direct mUSD provider',
      fiatAsset: MUSD_MONAD_FIAT_ASSET,
      fiatPaymentMethod,
      messenger,
      walletAddress: moneyAccountAddress,
    });

    messenger.call('TransactionPayController:updateFiatPayment', {
      callback: (fiatPayment: TransactionFiatPayment) => {
        fiatPayment.rampsQuote = fiatQuote;
        fiatPayment.caipAssetId = buildCaipAssetType(
          MUSD_MONAD_FIAT_ASSET.chainId,
          MUSD_MONAD_FIAT_ASSET.address,
        );
      },
      transactionId,
    });

    log('Direct mUSD fiat quote flow', {
      amountFiat,
      moneyAccountAddress,
      transactionId,
    });

    return combineDirectMusdFiatQuote({
      amountFiat,
      fiatQuote,
      messenger,
      moneyAccountAddress,
      requiredToken,
    });
  } catch (error) {
    log('Direct mUSD fiat quote failed', { error, transactionId });
    return undefined;
  }
}

/**
 * Detects a direct mUSD Money Account quote from its stored request marker.
 *
 * @param quote - Quote to inspect.
 * @returns True when the quote originated from the direct mUSD fiat path.
 */
export function isDirectMusdMoneyAccountQuote(
  quote: Pick<TransactionPayQuote<unknown>, 'request'> | undefined,
): boolean {
  return quote?.request.isDirectMusdMoneyAccount === true;
}

/**
 * Submits the direct mUSD post-Ramp path after fiat settlement.
 *
 * @param options - Submit options.
 * @param options.order - Completed fiat order.
 * @param options.request - Strategy execute request.
 * @returns Hash of the submitted direct mUSD transaction, if available.
 */
export async function submitDirectMusdAfterFiatCompletion({
  order,
  request,
}: {
  order: RampsOrder;
  request: PayStrategyExecuteRequest<FiatQuote>;
}): Promise<{ transactionHash?: Hex }> {
  const { messenger, transaction } = request;

  try {
    validateOrderAsset({
      expectedAsset: MUSD_MONAD_FIAT_ASSET,
      orderCrypto: order.cryptoCurrency,
      transactionId: transaction.id,
    });

    const sourceAmountRaw = await resolveSourceAmountRaw({
      messenger,
      order,
      fiatAsset: MUSD_MONAD_FIAT_ASSET,
      walletAddress: transaction.txParams.from as Hex,
    });

    return await submitDirectMusdVaultDeposit({
      request,
      sourceAmountRaw,
      transaction,
    });
  } catch (error) {
    throw prefixError(error, DIRECT_MUSD_ERROR_PREFIX);
  }
}

/**
 * Submits the direct mUSD Money Account vault batch after fiat settlement.
 *
 * @param options - Submit options.
 * @param options.request - Strategy execute request.
 * @param options.sourceAmountRaw - Settled source amount in raw mUSD units.
 * @param options.transaction - Original Money Account transaction.
 * @returns Hash of the final submitted child transaction, if available.
 */
export async function submitDirectMusdVaultDeposit({
  request,
  sourceAmountRaw,
  transaction,
}: {
  request: PayStrategyExecuteRequest<FiatQuote>;
  sourceAmountRaw: string;
  transaction: PayStrategyExecuteRequest<FiatQuote>['transaction'];
}): Promise<{ transactionHash?: Hex }> {
  const { messenger } = request;
  const transactionId = transaction.id;
  const moneyAccountAddress = transaction.txParams.from as Hex | undefined;

  if (!moneyAccountAddress) {
    throw new Error('Missing Money Account address');
  }

  if (getFiatVaultDisabled(messenger)) {
    log('Skipping direct mUSD vault deposit because vaultDisabled is enabled', {
      moneyAccountAddress,
      sourceAmountRaw,
      transactionId,
    });

    return { transactionHash: '0x' };
  }

  const updatedTransaction =
    getTransaction(transactionId, messenger) ?? transaction;
  const { updates } = await messenger.call(
    'TransactionPayController:getAmountData',
    {
      amount: sourceAmountRaw,
      transaction: updatedTransaction,
    },
  );

  if (!updates.length) {
    throw new Error('No amount updates');
  }

  const nestedTransactions = updatedTransaction.nestedTransactions?.map(
    (nestedTransaction) => ({ ...nestedTransaction }),
  );

  if (!nestedTransactions?.length) {
    throw new Error('Missing nested transactions');
  }

  for (const { nestedTransactionIndex, data } of updates) {
    if (nestedTransactions[nestedTransactionIndex]) {
      nestedTransactions[nestedTransactionIndex].data = data;
    }
  }

  updateTransaction(
    {
      transactionId,
      messenger,
      note: 'Direct mUSD fiat: update vault amount',
    },
    (tx) => {
      for (const { nestedTransactionIndex, data } of updates) {
        if (tx.nestedTransactions?.[nestedTransactionIndex]) {
          tx.nestedTransactions[nestedTransactionIndex].data = data;
        }
      }

      if (tx.requiredAssets?.[0]) {
        tx.requiredAssets[0].amount = `0x${BigInt(sourceAmountRaw).toString(
          16,
        )}`;
      }
    },
  );

  const networkClientId = getNetworkClientId(
    messenger,
    MUSD_MONAD_FIAT_ASSET.chainId,
  );
  const transactionIds: string[] = [];
  const { end } = collectTransactionIds(
    MUSD_MONAD_FIAT_ASSET.chainId,
    moneyAccountAddress,
    messenger,
    (id) => {
      transactionIds.push(id);
      updateTransaction(
        {
          transactionId,
          messenger,
          note: 'Add required transaction ID from direct mUSD vault submission',
        },
        (tx) => {
          tx.requiredTransactionIds ??= [];
          tx.requiredTransactionIds.push(id);
        },
      );
    },
  );

  log('Submitting direct mUSD vault deposit', {
    moneyAccountAddress,
    nestedTransactionCount: nestedTransactions.length,
    networkClientId,
    sourceAmountRaw,
    transactionId,
  });

  try {
    await messenger.call('TransactionController:addTransactionBatch', {
      disableHook: true,
      disableSequential: true,
      disableUpgrade: true,
      from: moneyAccountAddress,
      isGasFeeSponsored: true,
      isInternal: true,
      networkClientId,
      origin: ORIGIN_METAMASK,
      requireApproval: false,
      skipInitialGasEstimate: true,
      transactions: nestedTransactions.map((nestedTransaction, index) => ({
        params: {
          data: nestedTransaction.data,
          to: nestedTransaction.to,
          value: nestedTransaction.value ?? '0x0',
        },
        type:
          index === 0
            ? (nestedTransaction.type ?? TransactionType.tokenMethodApprove)
            : TransactionType.contractInteraction,
      })),
    });
  } catch (error) {
    throw prefixError(error, VAULT_ERROR_PREFIX);
  } finally {
    end();
  }

  log('Submitted direct mUSD vault deposit', {
    moneyAccountAddress,
    nestedTransactionCount: nestedTransactions.length,
    networkClientId,
    sourceAmountRaw,
    transactionId,
    transactionIds,
  });

  if (!transactionIds.length) {
    throw new Error('No transactions submitted');
  }

  await Promise.all(
    transactionIds.map((id) => waitForTransactionConfirmed(id, messenger)),
  );

  const hash = getTransaction(transactionIds.slice(-1)[0], messenger)?.hash;

  if (!hash) {
    throw new Error('Missing transaction hash');
  }

  log('Confirmed direct mUSD vault deposit', {
    hash,
    moneyAccountAddress,
    nestedTransactionCount: nestedTransactions.length,
    networkClientId,
    sourceAmountRaw,
    transactionId,
    transactionIds,
  });

  return { transactionHash: hash as Hex };
}

function combineDirectMusdFiatQuote({
  amountFiat,
  fiatQuote,
  messenger,
  moneyAccountAddress,
  requiredToken,
}: {
  amountFiat: string;
  fiatQuote: RampsQuote;
  messenger: PayStrategyGetQuotesRequest['messenger'];
  moneyAccountAddress: Hex;
  requiredToken: TransactionPayRequiredToken;
}): TransactionPayQuote<FiatQuote> {
  const tokenInfo = getTokenInfo(
    messenger,
    MUSD_MONAD_FIAT_ASSET.address,
    MUSD_MONAD_FIAT_ASSET.chainId,
  );

  if (!tokenInfo) {
    throw new Error('Unable to resolve mUSD token info for direct fiat quote');
  }

  const sourceAmountRaw = getRawSourceAmountFromOrderCryptoAmount({
    cryptoAmount: fiatQuote.quote.amountOut,
    decimals: tokenInfo.decimals,
  });
  const rampsProviderFee = getRampsProviderFee(fiatQuote).toString(10);
  const sourceAmountHuman = new BigNumber(sourceAmountRaw)
    .shiftedBy(-tokenInfo.decimals)
    .toString(10);

  return {
    dust: { fiat: '0', usd: '0' },
    estimatedDuration: 0,
    fees: {
      metaMask: { fiat: '0', usd: '0' },
      provider: { fiat: rampsProviderFee, usd: rampsProviderFee },
      providerFiat: { fiat: rampsProviderFee, usd: rampsProviderFee },
      sourceNetwork: {
        estimate: { fiat: '0', human: '0', raw: '0', usd: '0' },
        max: { fiat: '0', human: '0', raw: '0', usd: '0' },
      },
      targetNetwork: { fiat: '0', usd: '0' },
    },
    original: {
      rampsQuote: fiatQuote,
      relayQuote: undefined,
    },
    request: {
      from: moneyAccountAddress,
      isDirectMusdMoneyAccount: true,
      recipient: moneyAccountAddress,
      sourceBalanceRaw: sourceAmountRaw,
      sourceChainId: MUSD_MONAD_FIAT_ASSET.chainId,
      sourceTokenAddress: MUSD_MONAD_FIAT_ASSET.address,
      sourceTokenAmount: sourceAmountRaw,
      targetAmountMinimum: sourceAmountRaw,
      targetChainId: requiredToken.chainId,
      targetTokenAddress: requiredToken.address,
    },
    sourceAmount: {
      fiat: amountFiat,
      human: sourceAmountHuman,
      raw: sourceAmountRaw,
      usd: amountFiat,
    },
    strategy: TransactionPayStrategy.Fiat,
    targetAmount: { fiat: amountFiat, usd: amountFiat },
  };
}

function getRampsProviderFee(fiatQuote: RampsQuote): BigNumber {
  return new BigNumber(fiatQuote.quote.providerFee ?? 0).plus(
    fiatQuote.quote.networkFee ?? 0,
  );
}
