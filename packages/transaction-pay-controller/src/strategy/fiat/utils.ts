import type {
  Quote as RampsQuote,
  RampsOrder,
  RampsOrderCryptoCurrency,
} from '@metamask/ramps-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { TransactionType } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { projectLogger } from '../../logger.js';
import type { TransactionPayControllerMessenger } from '../../types.js';
import {
  getFiatAssetPerTransactionType,
  getFiatEnabledTypes,
} from '../../utils/feature-flags.js';
import { buildCaipAssetType, getTokenInfo } from '../../utils/token.js';
import { getTransferredAmountFromTxHash } from '../../utils/transaction.js';
import type { RelayQuote } from '../relay/types.js';
import type { TransactionPayFiatAsset } from './constants.js';
import { DEFAULT_FIAT_CURRENCY, FIAT_ENABLED_TYPES } from './constants.js';

const log = createModuleLogger(projectLogger, 'fiat-utils');

export function deriveFiatAssetForFiatPayment(
  transaction: TransactionMeta,
  messenger: TransactionPayControllerMessenger,
): TransactionPayFiatAsset {
  const enabledTypes = getFiatEnabledTypes(messenger);
  const txType = resolveTransactionType(transaction, enabledTypes);

  return getFiatAssetPerTransactionType(messenger, txType);
}

/**
 * Resolves the effective transaction type for fiat strategy purposes.
 *
 * For non-batch transactions returns the transaction's own type.
 * For batch transactions returns the first nested transaction type
 * that appears in the enabled types list, or the batch type itself
 * if no nested type matches.
 *
 * @param transaction - The transaction metadata to inspect.
 * @param enabledTypes - Transaction types eligible for fiat payment.
 * @returns The resolved transaction type, or `undefined`.
 */
export function resolveTransactionType(
  transaction: TransactionMeta,
  enabledTypes: TransactionType[],
): TransactionType | undefined {
  if (transaction.type !== TransactionType.batch) {
    return transaction.type;
  }

  const nestedType = transaction.nestedTransactions?.find(
    (tx) => tx.type && enabledTypes.includes(tx.type),
  )?.type;

  return nestedType ?? transaction.type;
}

/**
 * Checks whether a transaction is a Money Account deposit.
 *
 * Handles both direct `moneyAccountDeposit` transactions and EIP-7702
 * batch transactions that contain a `moneyAccountDeposit` nested call.
 * Uses {@link resolveTransactionType} with `FIAT_ENABLED_TYPES` to
 * correctly skip non-deposit nested types (e.g. `tokenMethodApprove`).
 *
 * @param transaction - The transaction metadata to inspect.
 * @returns `true` if the transaction is a Money Account deposit.
 */
export function isMoneyAccountDepositTransaction(
  transaction: TransactionMeta,
): boolean {
  return (
    resolveTransactionType(transaction, FIAT_ENABLED_TYPES) ===
    TransactionType.moneyAccountDeposit
  );
}

/**
 * Fetches the first matching Ramps quote for a fiat asset and payment method.
 *
 * @param options - Quote options.
 * @param options.adjustedAmount - Fiat amount sent to Ramps.
 * @param options.errorMessage - Error thrown when no matching quote is returned.
 * @param options.fiatAsset - Fiat asset to buy.
 * @param options.fiatPaymentMethod - Selected fiat payment method.
 * @param options.messenger - Controller messenger.
 * @param options.walletAddress - Wallet address that receives the on-ramped asset.
 * @returns The first matching Ramps quote.
 */
export async function getRampsQuote({
  adjustedAmount,
  errorMessage = 'No matching ramps quote found for selected provider',
  fiatAsset,
  fiatPaymentMethod,
  messenger,
  walletAddress,
}: {
  adjustedAmount: number;
  errorMessage?: string;
  fiatAsset: TransactionPayFiatAsset;
  fiatPaymentMethod: string;
  messenger: TransactionPayControllerMessenger;
  walletAddress: string;
}): Promise<RampsQuote> {
  const quotes = await messenger.call('RampsController:getQuotes', {
    amount: adjustedAmount,
    assetId: buildCaipAssetType(fiatAsset.chainId, fiatAsset.address),
    autoSelectProvider: true,
    fiat: DEFAULT_FIAT_CURRENCY,
    // Request fee-on-top quoting so the on-ramp adds its fees on top of the
    // requested amount instead of deducting them from the crypto output. This
    // keeps the funded amount aligned with the target and surfaces itemized
    // provider/network fees in the quote.
    isFeeExcludedFromFiat: true,
    paymentMethods: [fiatPaymentMethod],
    restrictToKnownOrNativeProviders: true,
    walletAddress,
  });

  log('Fetched ramps quotes', {
    quotesCount: quotes.success?.length ?? 0,
  });

  const quote = quotes.success?.[0];

  if (!quote) {
    throw new Error(errorMessage);
  }

  return quote;
}

/**
 * Validates that a completed order's crypto asset matches the expected fiat asset.
 *
 * @param options - The validation options.
 * @param options.expectedAsset - The expected fiat asset derived from the transaction type.
 * @param options.orderCrypto - The crypto currency information from the completed order.
 * @param options.transactionId - Transaction ID for error reporting.
 */
export function validateOrderAsset({
  expectedAsset,
  orderCrypto,
  transactionId,
}: {
  expectedAsset: TransactionPayFiatAsset;
  orderCrypto: RampsOrderCryptoCurrency | undefined;
  transactionId: string;
}): void {
  const orderAssetId = orderCrypto?.assetId?.toLowerCase();
  const expectedAssetId = buildCaipAssetType(
    expectedAsset.chainId,
    expectedAsset.address,
  ).toLowerCase();
  const expectedChainId = expectedAssetId.split('/')[0];
  const orderChainId = orderCrypto?.chainId?.toLowerCase();

  if (orderAssetId && orderAssetId !== expectedAssetId) {
    throw new Error(
      `Order asset mismatch for transaction ${transactionId}: ` +
        `expected ${expectedAssetId}, got ${orderAssetId}`,
    );
  }

  if (orderChainId && orderChainId !== expectedChainId) {
    throw new Error(
      `Order chain mismatch for transaction ${transactionId}: ` +
        `expected ${expectedChainId}, got ${orderChainId}`,
    );
  }
}

/**
 * Result from {@link resolveSourceAmountRaw}.
 */
export type ResolvedSourceAmount = {
  /** Raw (atomic) source amount as a decimal string. */
  amountRaw: string;
  /**
   * Block number of the ramps settlement transaction as a 0x-prefixed hex
   * string. Populated when `order.txHash` is present and the on-chain receipt
   * was successfully fetched (ERC-20 only). Use this as the `fromBlock` for
   * CHOMP idempotency log queries — it reuses the receipt already fetched for
   * the amount and requires no additional network request.
   */
  fromBlock: Hex | undefined;
};

/**
 * Resolves the raw source amount for a completed fiat order.
 *
 * Attempts to read the actual transferred amount from the on-chain transaction
 * identified by `order.txHash`. If the on-chain read fails or returns
 * no amount, falls back to computing the amount from `order.cryptoAmount`.
 *
 * Also returns the receipt `blockNumber` from the ramps tx when available, so
 * callers can use it as a CHOMP idempotency baseline without any extra request.
 *
 * @param options - The resolution options.
 * @param options.messenger - Controller messenger for network access.
 * @param options.order - The completed on-ramp order.
 * @param options.fiatAsset - The fiat asset describing the expected token.
 * @param options.walletAddress - Recipient wallet address for on-chain lookup.
 * @returns The raw (atomic) source amount and optional receipt block number.
 */
export async function resolveSourceAmountRaw({
  messenger,
  order,
  fiatAsset,
  walletAddress,
}: {
  messenger: TransactionPayControllerMessenger;
  order: RampsOrder;
  fiatAsset: TransactionPayFiatAsset;
  walletAddress: Hex;
}): Promise<ResolvedSourceAmount> {
  if (order.txHash) {
    try {
      const { amountRaw: onChainAmount, blockNumber } =
        await getTransferredAmountFromTxHash({
          messenger,
          txHash: order.txHash,
          chainId: fiatAsset.chainId,
          tokenAddress: fiatAsset.address,
          walletAddress,
        });

      if (onChainAmount) {
        log('Resolved source amount from on-chain transaction', {
          txHash: order.txHash,
          onChainAmount,
          blockNumber,
        });
        return { amountRaw: onChainAmount, fromBlock: blockNumber };
      }
    } catch (error) {
      log(
        'Failed to read on-chain amount, falling back to order.cryptoAmount',
        { txHash: order.txHash, error },
      );
    }
  }

  const tokenInfo = getTokenInfo(
    messenger,
    fiatAsset.address,
    fiatAsset.chainId,
  );

  if (!tokenInfo) {
    throw new Error(
      `Unable to resolve token info for fiat asset ${fiatAsset.address} on chain ${fiatAsset.chainId}`,
    );
  }

  const amountRaw = getRawSourceAmountFromOrderCryptoAmount({
    cryptoAmount: order.cryptoAmount,
    decimals: tokenInfo.decimals,
  });

  return { amountRaw, fromBlock: undefined };
}

/**
 * Converts the order's human-readable crypto amount to a raw token amount.
 *
 * @param options - The conversion options.
 * @param options.cryptoAmount - Human-readable crypto amount from the completed order.
 * @param options.decimals - Token decimals for the fiat asset.
 * @returns The raw token amount as a string.
 */
export function getRawSourceAmountFromOrderCryptoAmount({
  cryptoAmount,
  decimals,
}: {
  cryptoAmount: RampsOrder['cryptoAmount'];
  decimals: number;
}): string {
  const normalizedAmount = new BigNumber(String(cryptoAmount));

  if (!normalizedAmount.isFinite() || normalizedAmount.lte(0)) {
    throw new Error(
      `Invalid fiat order crypto amount: ${String(cryptoAmount)}`,
    );
  }

  const rawAmount = normalizedAmount
    .shiftedBy(decimals)
    .decimalPlaces(0, BigNumber.ROUND_DOWN)
    .toFixed(0);

  if (!new BigNumber(rawAmount).gt(0)) {
    throw new Error('Computed fiat order source amount is not positive');
  }

  return rawAmount;
}

/**
 * Validates that the relay exchange rate hasn't drifted significantly between
 * the original quoting phase and the post-settlement discovery quote.
 *
 * Compares the USD output/input ratio from both quotes. This normalises for
 * different source amounts (quoting phase uses a theoretical amount, discovery
 * uses the actual settled amount) so the comparison reflects genuine rate
 * movement rather than amount differences.
 *
 * @param options - The validation options.
 * @param options.originalQuote - Relay quote from the original quoting phase.
 * @param options.discoveryQuote - Relay quote from the post-settlement discovery.
 * @param options.maxRateDriftPercent - Maximum allowed rate drift percentage.
 * @param options.transactionId - Transaction ID for error reporting.
 */
export function validateRelayRateDrift({
  originalQuote,
  discoveryQuote,
  maxRateDriftPercent,
  transactionId,
}: {
  originalQuote: RelayQuote;
  discoveryQuote: RelayQuote;
  maxRateDriftPercent: number;
  transactionId: string;
}): void {
  const originalIn = new BigNumber(originalQuote.details.currencyIn.amountUsd);
  const originalOut = new BigNumber(
    originalQuote.details.currencyOut.amountUsd,
  );
  const discoveryIn = new BigNumber(
    discoveryQuote.details.currencyIn.amountUsd,
  );
  const discoveryOut = new BigNumber(
    discoveryQuote.details.currencyOut.amountUsd,
  );

  if (
    !originalIn.gt(0) ||
    !originalOut.gt(0) ||
    !discoveryIn.gt(0) ||
    !discoveryOut.gt(0)
  ) {
    return;
  }

  const originalRate = originalOut.dividedBy(originalIn);
  const discoveryRate = discoveryOut.dividedBy(discoveryIn);

  const driftPercent = originalRate
    .minus(discoveryRate)
    .dividedBy(originalRate)
    .multipliedBy(100);

  log('Relay rate drift check', {
    originalRate: originalRate.toFixed(6),
    discoveryRate: discoveryRate.toFixed(6),
    driftPercent: driftPercent.toFixed(2),
    maxRateDriftPercent,
    transactionId,
  });

  if (driftPercent.gt(maxRateDriftPercent)) {
    throw new Error(
      `Relay rate drift too high for transaction ` +
        `${driftPercent.toFixed(2)}% exceeds ${maxRateDriftPercent}% max`,
    );
  }
}

/**
 * Extracts the provider code from a ramps provider string.
 *
 * Accepts the canonical provider code (e.g. `transak-native`) and, for
 * backwards compatibility, the legacy path form (e.g. `/providers/transak-native`).
 *
 * @param provider - Canonical provider code, or legacy provider path.
 * @returns The provider code, or `null` if the format is invalid.
 */
export function extractProviderCode(
  provider: string | undefined,
): string | null {
  if (!provider) {
    return null;
  }

  const parts = provider.split('/').filter(Boolean);

  if (parts[0] === 'providers') {
    return parts[1] ?? null;
  }

  return parts.length === 1 ? parts[0] : null;
}
