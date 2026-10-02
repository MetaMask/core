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

import type {
  AssetType,
  Fee,
  Status,
  TokenAmount,
  ValueTransfer,
} from '../../types.js';
import { nativeTokenDecimals } from '../constants.js';
import {
  formatAddressToAssetId,
  formatChainIdToCaip,
  getNativeAsset,
  resolveNativeAssetId,
  resolveNativeAssetIdForTokenAddress,
} from './caip.js';
import { getKnownTokenMetadata } from './token-metadata.js';

// Adds optional `isSmartTransaction` to `TransactionMeta`.
export type TransactionGroup = {
  hasCancelled: boolean;
  hasRetried: boolean;
  initialTransaction: TransactionMeta & { isSmartTransaction?: boolean };
  nonce: Hex;
  primaryTransaction: TransactionMeta;
  transactions: TransactionMeta[];
};

function calculateNetworkFee(
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

function toNetworkFee(
  amount: string,
  chainId: CaipChainId,
  symbol?: string,
): Fee {
  const nativeAsset = getNativeAsset(chainId);

  if (nativeAsset) {
    return {
      type: 'base',
      amount,
      decimals: nativeTokenDecimals,
      assetType: 'native',
      symbol: symbol ?? nativeAsset.symbol,
      assetId: nativeAsset.assetId,
    };
  }

  const assetId = symbol ? resolveNativeAssetId(chainId, symbol) : undefined;

  return {
    type: 'base',
    amount,
    decimals: nativeTokenDecimals,
    assetType: 'native',
    ...(symbol ? { symbol } : {}),
    ...(assetId ? { assetId } : {}),
  };
}

function getAssetTypeFromTransferType(
  transferType: string | undefined,
): AssetType | undefined {
  if (transferType === 'normal' || transferType === 'internal') {
    return 'native';
  }

  if (transferType === 'erc20') {
    return 'erc20';
  }

  if (transferType === ERC721.toLowerCase() || transferType === 'erc721') {
    return 'erc721';
  }

  if (transferType === ERC1155.toLowerCase() || transferType === 'erc1155') {
    return 'erc1155';
  }

  return undefined;
}

function getNetworkFee(
  transaction: V1TransactionByHashResponse,
): Fee | undefined {
  const chainId = formatChainIdToCaip(transaction.chainId);

  if (!chainId) {
    return undefined;
  }

  const amount = calculateNetworkFee(
    transaction.gasUsed,
    transaction.effectiveGasPrice,
  );

  if (!amount) {
    return undefined;
  }

  return toNetworkFee(amount, chainId);
}

export function getFees(
  transaction: V1TransactionByHashResponse,
): Fee[] | undefined {
  const networkFee = getNetworkFee(transaction);

  return networkFee ? [networkFee] : undefined;
}

export function getLocalTransactionFees(
  transactionGroup: Pick<TransactionGroup, 'primaryTransaction'> & {
    nativeAssetSymbol?: string;
  },
): Fee[] | undefined {
  const { primaryTransaction, nativeAssetSymbol } = transactionGroup;
  const chainId = formatChainIdToCaip(primaryTransaction.chainId);

  if (!chainId) {
    return undefined;
  }

  const amount = calculateNetworkFee(
    primaryTransaction.txReceipt?.gasUsed,
    primaryTransaction.txReceipt?.effectiveGasPrice ??
      primaryTransaction.txParams?.gasPrice,
  );

  if (!amount) {
    return undefined;
  }

  return [toNetworkFee(amount, chainId, nativeAssetSymbol)];
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
  contractAddress: string | undefined,
): string | undefined => {
  if (!contractAddress) {
    return undefined;
  }

  return formatAddressToAssetId(contractAddress, chainId);
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

/**
 * Optional host callback that resolves ERC-20 decimals (and optionally symbol)
 * when Accounts API enrichment omitted them on a value transfer.
 *
 * Hosts typically wire this to on-device token state (e.g. TokensController).
 * Do not use this to override a present-but-wrong `transfer.decimal`.
 */
export type GetKnownTokenDecimals = (
  chainId: CaipChainId,
  contractAddress: string,
) => { decimals?: number; symbol?: string } | undefined;

/**
 * Maps an Accounts API value transfer into a fungible/NFT {@link TokenAmount}.
 *
 * Fungible amounts are base units and are only emitted when a decimals scale is
 * known (from the transfer, native defaults, static metadata, or the optional
 * host hook). NFT amounts are token counts and are never fail-closed.
 *
 * @param transfer - Indexed value transfer, or undefined.
 * @param direction - Whether this leg is incoming or outgoing for the subject.
 * @param chainId - CAIP-2 chain id for the transaction.
 * @param getKnownTokenDecimals - Optional host lookup for missing ERC-20 metadata.
 * @returns A token amount, or undefined when nothing useful can be derived.
 */
export function getTokenAmountFromTransfer(
  transfer: ValueTransfer | undefined,
  direction: TokenAmount['direction'],
  chainId: CaipChainId,
  getKnownTokenDecimals?: GetKnownTokenDecimals,
): TokenAmount | undefined {
  if (!transfer) {
    return undefined;
  }

  const { transferType, amount } = transfer;
  const isNftTransfer = isNftStandard(transferType);
  const assetType = getAssetTypeFromTransferType(transferType);
  const isNative = assetType === 'native';

  const knownToken =
    !isNftTransfer && !isNative && transfer.contractAddress
      ? getKnownTokenMetadata(chainId, transfer.contractAddress)
      : undefined;
  const hostToken =
    !isNftTransfer && !isNative && transfer.contractAddress
      ? getKnownTokenDecimals?.(chainId, transfer.contractAddress)
      : undefined;

  const symbol = isNftTransfer
    ? (transfer.name ?? transfer.symbol)
    : (transfer.symbol ?? knownToken?.symbol ?? hostToken?.symbol);

  let decimals: number | undefined;
  if (transfer.decimal !== undefined) {
    decimals = transfer.decimal;
  } else if (isNative) {
    decimals = nativeTokenDecimals;
  } else if (!isNftTransfer) {
    decimals = knownToken?.decimals ?? hostToken?.decimals;
  }

  const hasScaledAmount =
    !isNftTransfer &&
    amount !== null &&
    amount !== undefined &&
    decimals !== undefined;
  // NFT amounts are counts, not base units — keep them even without decimals.
  const hasNftAmount = isNftTransfer && amount !== null && amount !== undefined;

  let assetId: string | undefined;
  const nativeAssetIdForTokenAddress =
    !isNative && !isNftTransfer
      ? resolveNativeAssetIdForTokenAddress(chainId, transfer.contractAddress)
      : undefined;
  if (isNative) {
    assetId = resolveNativeAssetId(chainId, symbol);
  } else if (!isNftTransfer) {
    assetId =
      nativeAssetIdForTokenAddress ??
      resolveAssetId(chainId, transfer.contractAddress);
  }
  const tokenAssetType: AssetType | undefined = nativeAssetIdForTokenAddress
    ? 'native'
    : assetType;

  if (!symbol && !hasScaledAmount && !hasNftAmount && !assetId) {
    return undefined;
  }

  return {
    direction,
    ...(hasScaledAmount || hasNftAmount ? { amount: String(amount) } : {}),
    ...(decimals === undefined ? {} : { decimals }),
    ...(symbol ? { symbol } : {}),
    ...(assetId ? { assetId } : {}),
    ...(tokenAssetType ? { assetType: tokenAssetType } : {}),
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
    assetType: 'erc20',
    ...(tokenMetadata.symbol ? { symbol: tokenMetadata.symbol } : {}),
    ...(tokenMetadata.decimals === undefined
      ? {}
      : { decimals: tokenMetadata.decimals }),
    ...(tokenMetadata.assetId ? { assetId: tokenMetadata.assetId } : {}),
  };
}
