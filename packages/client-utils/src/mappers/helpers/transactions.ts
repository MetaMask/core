import {
  ERC721,
  ERC1155,
  isEqualCaseInsensitive as equalsIgnoreCase,
} from '@metamask/controller-utils';
import type { V1TransactionByHashResponse } from '@metamask/core-backend';
import type { TransactionMeta } from '@metamask/transaction-controller';
import {
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';
import type { CaipChainId, Hex } from '@metamask/utils';

import type { Fee, Status, TokenAmount, ValueTransfer } from '../../types';
import { nativeTokenAddress } from '../constants';
import { formatAddressToAssetId, getNativeAsset } from './caip';
import { getKnownTokenMetadata } from './token-metadata';

// Adds optional `isSmartTransaction` to `TransactionMeta`.
export type TransactionGroup = {
  hasCancelled: boolean;
  hasRetried: boolean;
  initialTransaction: TransactionMeta & { isSmartTransaction?: boolean };
  nonce: Hex;
  primaryTransaction: TransactionMeta;
  transactions: TransactionMeta[];
};

const nativeTokenDecimals = 18;

/**
 * Receipt fields used for L1 / operator fee derivation. Kept local so this
 * package works before/alongside `@metamask/transaction-controller` typing
 * the Mantle Arsia receipt fields.
 */
type ReceiptFeeFields = {
  gasUsed?: string;
  l1Fee?: string;
  operatorFeeConstant?: string;
  operatorFeeScalar?: string;
};

function toNetworkFeeAmount(
  gasUsed: string | number | undefined,
  gasPrice: string | number | undefined,
): string | undefined {
  if (gasUsed === undefined || gasPrice === undefined) {
    return undefined;
  }

  try {
    return String(BigInt(gasUsed) * BigInt(gasPrice));
  } catch {
    return undefined;
  }
}

function parseHexQuantity(value: string | undefined): bigint | undefined {
  if (value === undefined || value === '' || value === '0x' || value === '0X') {
    return undefined;
  }

  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

/**
 * Derives L1 data fee + operator fee from a receipt (Mantle Arsia /
 * OP Stack). Mirrors `@metamask/transaction-controller`'s
 * `getLayer1FeeFromReceipt` so Activity Details stay correct even when
 * `layer1GasFee` was not refreshed on confirmation.
 *
 * @param receipt - Transaction receipt.
 * @returns Combined fee as a decimal wei string, or undefined.
 */
function getReceiptLayer1FeeAmount(
  receipt: ReceiptFeeFields,
): string | undefined {
  const l1Fee = parseHexQuantity(receipt.l1Fee);
  const gasUsed = parseHexQuantity(receipt.gasUsed);
  const operatorFeeScalar = parseHexQuantity(receipt.operatorFeeScalar);
  const operatorFeeConstant = parseHexQuantity(receipt.operatorFeeConstant);

  const operatorFee =
    gasUsed !== undefined &&
    operatorFeeScalar !== undefined &&
    operatorFeeConstant !== undefined
      ? gasUsed * operatorFeeScalar * 100n + operatorFeeConstant
      : undefined;

  if (l1Fee === undefined && operatorFee === undefined) {
    return undefined;
  }

  return String((l1Fee ?? 0n) + (operatorFee ?? 0n));
}

/**
 * Adds L1 / operator fee onto an L2 network fee (decimal wei string).
 * Prefers `layer1GasFee` from TransactionMeta over a receipt-derived fee
 * so values are not double-counted.
 *
 * @param networkFeeAmount - L2 network fee amount in decimal wei.
 * @param layer1GasFee - Optional hex wei L1 + operator fee from TransactionMeta.
 * @param receiptLayer1FeeAmount - Optional decimal wei L1 + operator from receipt.
 * @returns Combined fee amount in decimal wei, or the original L2 amount on failure.
 */
function addLayer1FeeToNetworkFeeAmount(
  networkFeeAmount: string,
  layer1GasFee: string | undefined,
  receiptLayer1FeeAmount: string | undefined,
): string {
  const layer1Amount =
    layer1GasFee === undefined
      ? receiptLayer1FeeAmount
      : (() => {
          try {
            return String(BigInt(layer1GasFee));
          } catch {
            return undefined;
          }
        })();

  if (!layer1Amount) {
    return networkFeeAmount;
  }

  try {
    return String(BigInt(networkFeeAmount) + BigInt(layer1Amount));
  } catch {
    return networkFeeAmount;
  }
}

function buildBaseNetworkFee(amount: string, chainId: string | number): Fee {
  const nativeAsset = getNativeAsset(chainId);

  return {
    type: 'base',
    amount,
    ...(nativeAsset?.decimals === undefined
      ? { decimals: nativeTokenDecimals }
      : { decimals: nativeAsset.decimals }),
    ...(nativeAsset?.symbol ? { symbol: nativeAsset.symbol } : {}),
    ...(nativeAsset?.assetId ? { assetId: nativeAsset.assetId } : {}),
  };
}

function getNetworkFee(
  transaction: V1TransactionByHashResponse,
  chainId: string,
): Fee | undefined {
  const amount = toNetworkFeeAmount(
    transaction.gasUsed,
    transaction.effectiveGasPrice,
  );

  return amount ? buildBaseNetworkFee(amount, chainId) : undefined;
}

export function getFees(
  transaction: V1TransactionByHashResponse,
  chainId: string,
): Fee[] | undefined {
  const networkFee = getNetworkFee(transaction, chainId);

  return networkFee ? [networkFee] : undefined;
}

/**
 * Builds the base network fee (in the chain's native token) for a local
 * transaction from its receipt (`gasUsed × effectiveGasPrice`), plus any
 * L1 / operator fee from `layer1GasFee` or receipt fields. Falls back to
 * `txParams.gasPrice` while pending.
 *
 * @param transactionGroup - Transaction group with the primary transaction.
 * @returns Activity fee list with a single base network fee, or undefined.
 */
export function getLocalTransactionFees(
  transactionGroup: Pick<TransactionGroup, 'primaryTransaction'>,
): Fee[] | undefined {
  const { primaryTransaction } = transactionGroup;
  const l2Amount = toNetworkFeeAmount(
    primaryTransaction.txReceipt?.gasUsed,
    primaryTransaction.txReceipt?.effectiveGasPrice ??
      primaryTransaction.txParams?.gasPrice,
  );

  if (!l2Amount) {
    return undefined;
  }

  const receiptLayer1FeeAmount = primaryTransaction.txReceipt
    ? getReceiptLayer1FeeAmount(primaryTransaction.txReceipt)
    : undefined;

  const amount = addLayer1FeeToNetworkFeeAmount(
    l2Amount,
    primaryTransaction.layer1GasFee,
    receiptLayer1FeeAmount,
  );

  return [buildBaseNetworkFee(amount, primaryTransaction.chainId)];
}

const inProgressTransactionStatuses = [
  TransactionStatus.unapproved,
  TransactionStatus.approved,
  TransactionStatus.signed,
  TransactionStatus.submitted,
];

const transactionGroupCancelledStatus = 'cancelled';

const smartTransactionStatus = {
  cancelled: 'cancelled',
  pending: 'pending',
  success: 'success',
} as const;

function getTransactionStatusKey(
  transaction: TransactionGroup['primaryTransaction'],
): string {
  const { type, status } = transaction;
  const receiptStatus = transaction.txReceipt?.status;

  if (receiptStatus === '0x0') {
    return TransactionStatus.failed;
  }

  if (
    status === TransactionStatus.confirmed &&
    type === TransactionType.cancel
  ) {
    return transactionGroupCancelledStatus;
  }

  return transaction.status;
}

export function getLocalTransactionStatus({
  primaryTransaction,
  initialTransaction,
}: {
  primaryTransaction: TransactionGroup['primaryTransaction'];
  initialTransaction: TransactionGroup['initialTransaction'];
}): Status {
  if (initialTransaction.isSmartTransaction) {
    const smartStatus = initialTransaction.status as string | undefined;

    if (smartStatus === smartTransactionStatus.pending) {
      return 'pending';
    }

    if (smartStatus === smartTransactionStatus.success) {
      return 'success';
    }

    if (smartStatus === smartTransactionStatus.cancelled) {
      return 'failed';
    }

    return 'pending';
  }

  const statusKey = getTransactionStatusKey(primaryTransaction);

  if (statusKey === TransactionStatus.confirmed) {
    return 'success';
  }

  if (
    statusKey === TransactionStatus.cancelled ||
    statusKey === transactionGroupCancelledStatus ||
    statusKey === TransactionStatus.dropped ||
    statusKey === TransactionStatus.failed ||
    statusKey === TransactionStatus.rejected
  ) {
    return 'failed';
  }

  if (
    inProgressTransactionStatuses.includes(
      statusKey as (typeof inProgressTransactionStatuses)[number],
    )
  ) {
    return 'pending';
  }

  return 'pending';
}

export function isNftStandard(value?: string): boolean {
  return value === ERC721.toLowerCase() || value === ERC1155.toLowerCase();
}

export function getNftPaymentTransfer({
  side,
  sentTransfer,
  receivedTransfer,
  sentNativeTransfer,
  nftCounterparty,
  transactionFrom,
  transactionTo,
  subjectAddress,
}: {
  side: 'buy' | 'sell';
  sentTransfer?: ValueTransfer;
  receivedTransfer?: ValueTransfer;
  sentNativeTransfer?: ValueTransfer;
  nftCounterparty: string;
  transactionFrom?: string;
  transactionTo?: string;
  subjectAddress: string;
}): ValueTransfer | undefined {
  const isFungible = (transfer?: ValueTransfer): boolean =>
    Boolean(transfer && !isNftStandard(transfer.transferType));

  if (side === 'buy') {
    for (const transfer of [sentNativeTransfer, sentTransfer]) {
      if (!transfer || !isFungible(transfer)) {
        continue;
      }

      // Only count a payment that goes to the NFT counterparty (direct sale) or
      // to the contract being called (marketplace/router). This avoids treating
      // an unrelated native send in the same transaction as the NFT payment.
      if (
        equalsIgnoreCase(transfer.to, nftCounterparty) ||
        equalsIgnoreCase(transfer.to, transactionTo as string)
      ) {
        return transfer;
      }
    }

    return undefined;
  }

  if (!receivedTransfer || !isFungible(receivedTransfer)) {
    return undefined;
  }

  if (
    equalsIgnoreCase(receivedTransfer.from, nftCounterparty) ||
    (transactionFrom &&
      !equalsIgnoreCase(transactionFrom, subjectAddress) &&
      equalsIgnoreCase(receivedTransfer.from, transactionFrom))
  ) {
    return receivedTransfer;
  }

  return undefined;
}

const resolveAssetId = (
  chainId: CaipChainId,
  {
    contractAddress,
    transferType,
  }: {
    contractAddress?: string;
    transferType?: string;
  },
): string | undefined => {
  if (contractAddress) {
    return formatAddressToAssetId(contractAddress, chainId);
  }

  if (transferType === 'normal' || transferType === 'internal') {
    return formatAddressToAssetId(nativeTokenAddress, chainId);
  }

  return undefined;
};

/**
 * Resolves the user's primary send and receive legs from indexed value transfers.
 * Prefers a receive whose symbol differs from the sent leg so dust does not win.
 *
 * @param valueTransfers - Indexed value transfers from the Accounts API.
 * @param subjectAddress - The account address to match transfers against.
 * @returns The primary sent and received transfers for the account.
 */
export function parseValueTransfers(
  valueTransfers: ValueTransfer[] | undefined,
  subjectAddress: string,
): {
  sentTransfer: ValueTransfer | undefined;
  receivedTransfer: ValueTransfer | undefined;
  sentNativeTransfer: ValueTransfer | undefined;
  sentNftTransfer: ValueTransfer | undefined;
  receivedNftTransfer: ValueTransfer | undefined;
} {
  const sent = valueTransfers?.filter(({ from }) =>
    equalsIgnoreCase(from, subjectAddress),
  );
  const received = valueTransfers?.filter(({ to }) =>
    equalsIgnoreCase(to, subjectAddress),
  );

  const sentTransfer = sent?.[0];

  const receivedTransfer =
    received?.find(({ symbol }) => symbol !== sentTransfer?.symbol) ??
    received?.[0];

  const sentNativeTransfer = sent?.find(
    ({ transferType }) => transferType === 'normal',
  );

  const sentNftTransfer = sent?.find(({ transferType }) =>
    isNftStandard(transferType),
  );
  const receivedNftTransfer = received?.find(({ transferType }) =>
    isNftStandard(transferType),
  );

  return {
    sentTransfer,
    receivedTransfer,
    sentNativeTransfer,
    sentNftTransfer,
    receivedNftTransfer,
  };
}

export function getTokenAmountFromTransfer(
  transfer: ValueTransfer | undefined,
  direction: TokenAmount['direction'],
  chainId: CaipChainId,
): TokenAmount | undefined {
  if (!transfer) {
    return undefined;
  }

  const { transferType, amount } = transfer;
  const isNftTransfer = isNftStandard(transferType);
  const symbol = isNftTransfer
    ? transfer.name || transfer.symbol
    : transfer.symbol;

  if (!symbol && amount === undefined) {
    return undefined;
  }

  const assetId =
    transfer && !isNftTransfer
      ? resolveAssetId(chainId, {
          contractAddress: transfer.contractAddress,
          transferType: transfer.transferType,
        })
      : undefined;

  const hasTransferAmount =
    !isNftTransfer && amount !== null && amount !== undefined;

  return {
    direction,
    ...(hasTransferAmount ? { amount: String(amount) } : {}),
    ...(transfer.decimal === undefined ? {} : { decimals: transfer.decimal }),
    ...(symbol ? { symbol } : {}),
    ...(assetId ? { assetId } : {}),
  };
}

export function getTokenMetadataFromKnownToken(
  contractAddress: string | undefined,
  direction: TokenAmount['direction'],
  chainId: CaipChainId,
): TokenAmount | undefined {
  const tokenMetadata = getKnownTokenMetadata(chainId, contractAddress);

  if (!tokenMetadata) {
    return undefined;
  }

  return {
    direction,
    ...(tokenMetadata.symbol ? { symbol: tokenMetadata.symbol } : {}),
    ...(tokenMetadata.decimals === undefined
      ? {}
      : { decimals: tokenMetadata.decimals }),
    ...(tokenMetadata.assetId ? { assetId: tokenMetadata.assetId } : {}),
  };
}

/**
 * When the transfer omits contractAddress, fall back to the indexed tx `to` field.
 *
 * @param token - Parsed token amount from the value transfer.
 * @param fallbackContractAddress - Indexed transaction `to` address used as ERC-20 fallback.
 * @param transferType - Value transfer type; native (`normal`) transfers skip the fallback.
 * @param chainId - CAIP-2 chain id for asset id encoding.
 * @returns Token amount with `assetId` set when a fallback address applies.
 */
export function withFallbackTokenAssetId(
  token: TokenAmount | undefined,
  fallbackContractAddress: string | undefined,
  transferType: string | undefined,
  chainId: CaipChainId,
): TokenAmount | undefined {
  if (
    !token ||
    token.assetId ||
    transferType === 'normal' ||
    !fallbackContractAddress
  ) {
    return token;
  }

  const assetId = formatAddressToAssetId(fallbackContractAddress, chainId);
  if (!assetId) {
    return token;
  }

  return { ...token, assetId };
}
