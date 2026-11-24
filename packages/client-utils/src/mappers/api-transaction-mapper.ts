import {
  isEqualCaseInsensitive as equalsIgnoreCase,
  isValidHexAddress,
} from '@metamask/controller-utils';
import type {
  V1TransactionByHashResponse,
  V5TransactionRecord,
} from '@metamask/core-backend';

import type { ActivityItem, TokenAmount } from '../types.js';
import {
  nativeTokenAddress,
  supplyMethodIds,
  swapsWrappedTokensAddresses,
  withdrawMethodIds,
  wrapMethodIds,
} from './constants.js';
import { formatAddressToAssetId, getNativeAsset } from './helpers/caip.js';
import {
  fromV1Transaction,
  fromV5TransactionRecord,
  toHexChainId,
} from './helpers/indexed-transaction.js';
import type {
  IndexedTransaction,
  IndexedValueTransfer,
} from './helpers/indexed-transaction.js';
import {
  getNftPaymentTransfer,
  getTokenAmountFromTransfer,
  getTokenMetadataFromKnownToken,
  parseValueTransfers,
} from './helpers/transactions.js';
import type { GetKnownTokenDecimals } from './helpers/transactions.js';

type MapIndexedTransactionOptions = {
  transaction: IndexedTransaction;
  subjectAddress: string;
  getKnownTokenDecimals?: GetKnownTokenDecimals;
};

/**
 * Maps an indexed API transaction into the shared activity item shape.
 *
 * Fungible token amounts are only emitted when a decimals scale is known
 * (transfer enrichment, native defaults, static metadata, or
 * `getKnownTokenDecimals`). Pass that optional hook so hosts can recover
 * decimals/symbol from on-device token state when the Accounts API omits them.
 *
 * @param options - The mapping options.
 * @param options.transaction - The indexed API transaction to map.
 * @param options.subjectAddress - The account the activity is being mapped for.
 * @param options.getKnownTokenDecimals - Optional host lookup for missing ERC-20 metadata.
 * @returns The normalized activity item.
 */
export function mapApiTransaction({
  transaction,
  subjectAddress,
  getKnownTokenDecimals,
}: {
  transaction: V1TransactionByHashResponse;
  subjectAddress: string;
  getKnownTokenDecimals?: GetKnownTokenDecimals;
}): ActivityItem {
  return mapIndexedTransaction({
    transaction: fromV1Transaction(transaction),
    subjectAddress,
    getKnownTokenDecimals,
  });
}

export function mapV5ApiTransaction({
  transaction,
  getKnownTokenDecimals,
}: {
  transaction: V5TransactionRecord;
  getKnownTokenDecimals?: GetKnownTokenDecimals;
}): ActivityItem {
  return mapIndexedTransaction({
    ...fromV5TransactionRecord(transaction),
    getKnownTokenDecimals,
  });
}

function mapIndexedTransaction({
  transaction,
  subjectAddress,
  getKnownTokenDecimals,
}: MapIndexedTransactionOptions): ActivityItem {
  const {
    hash,
    chainId,
    status,
    timestamp,
    transactionCategory,
    valueTransfers,
    from,
    methodId,
    fees,
  } = transaction;
  const normalizedMethodId = methodId?.toLowerCase() ?? '';
  const getToken = (
    transfer: IndexedValueTransfer | undefined,
    direction: TokenAmount['direction'],
  ): TokenAmount | undefined =>
    getTokenAmountFromTransfer(
      transfer,
      direction,
      chainId,
      getKnownTokenDecimals,
    );

  const {
    sentTransfer,
    receivedTransfer,
    sentNativeTransfer,
    sentNftTransfer,
    receivedNftTransfer,
  } = parseValueTransfers(valueTransfers, subjectAddress);

  const common = { chainId, status, timestamp, hash };

  if (transactionCategory === 'SWAP' || transactionCategory === 'EXCHANGE') {
    return {
      type: 'swap',
      ...common,
      data: {
        sourceToken: getToken(sentTransfer, 'out'),
        destinationToken: getToken(receivedTransfer, 'in'),
        fees,
        from,
      },
    };
  }

  if (transactionCategory === 'APPROVE') {
    // Note: Categorize REVOKE in the backend
    const direction = receivedTransfer && !sentTransfer ? 'in' : 'out';
    const valueTransferContractAddress = valueTransfers?.find(
      ({ contractAddress, transferType }) =>
        contractAddress &&
        transferType !== 'normal' &&
        transferType !== 'internal',
    )?.contractAddress;
    const contractAddress =
      (isValidHexAddress(transaction.to, { allowNonPrefixed: false })
        ? transaction.to
        : undefined) ??
      (valueTransferContractAddress &&
      isValidHexAddress(valueTransferContractAddress, {
        allowNonPrefixed: false,
      })
        ? valueTransferContractAddress
        : undefined);
    const assetId = contractAddress
      ? formatAddressToAssetId(contractAddress, chainId)
      : undefined;
    const token =
      getTokenMetadataFromKnownToken(contractAddress, direction, chainId) ??
      (assetId ? { direction, assetId } : undefined);

    return {
      type: 'approveSpendingCap',
      ...common,
      data: {
        from,
        token,
        fees,
      },
    };
  }

  // Note: Categorize NFT in the backend
  const isNftExchange = transactionCategory === 'NFT_EXCHANGE';

  if (receivedNftTransfer) {
    if (receivedNftTransfer.from === nativeTokenAddress) {
      return {
        type: 'nftMint',
        ...common,
        data: {
          from: receivedNftTransfer.from,
          to: receivedNftTransfer.to,
          token: getToken(receivedNftTransfer, 'in'),
        },
      };
    }

    const purchasePaymentTransfer = getNftPaymentTransfer({
      side: 'buy',
      sentTransfer,
      sentNativeTransfer,
      nftCounterparty: receivedNftTransfer.from,
      transactionTo: transaction.to,
      subjectAddress,
    });

    if (isNftExchange || purchasePaymentTransfer) {
      return {
        type: 'nftBuy',
        ...common,
        data: {
          from: receivedNftTransfer.from,
          to: receivedNftTransfer.to,
          token: getToken(receivedNftTransfer, 'in'),
          paymentToken: getToken(purchasePaymentTransfer, 'out'),
        },
      };
    }

    return {
      type: 'receive',
      ...common,
      data: {
        from: receivedNftTransfer.from,
        to: receivedNftTransfer.to,
        token: getToken(receivedNftTransfer, 'in'),
      },
    };
  }

  if (sentNftTransfer) {
    const saleProceedsTransfer = getNftPaymentTransfer({
      side: 'sell',
      receivedTransfer,
      nftCounterparty: sentNftTransfer.to,
      transactionFrom: from,
      subjectAddress,
    });

    if (isNftExchange || saleProceedsTransfer) {
      return {
        type: 'nftSell',
        ...common,
        data: {
          from: sentNftTransfer.from,
          to: sentNftTransfer.to,
          token: getToken(sentNftTransfer, 'out'),
          paymentToken: getToken(saleProceedsTransfer, 'in'),
        },
      };
    }

    return {
      type: 'send',
      ...common,
      data: {
        from: sentNftTransfer.from,
        to: sentNftTransfer.to,
        token: getToken(sentNftTransfer, 'out'),
      },
    };
  }

  const hasNativeTransferWithoutMethod =
    transactionCategory === 'CONTRACT_CALL' &&
    !methodId &&
    valueTransfers?.some(({ transferType }) => transferType === 'normal');

  if (
    transactionCategory === 'TRANSFER' ||
    transactionCategory === 'STANDARD' ||
    hasNativeTransferWithoutMethod
  ) {
    const isReceive =
      Boolean(receivedTransfer && !sentTransfer) ||
      (equalsIgnoreCase(transaction.to, subjectAddress) &&
        !equalsIgnoreCase(from, subjectAddress));

    const transfer = isReceive ? receivedTransfer : sentTransfer;
    const direction: TokenAmount['direction'] = isReceive ? 'in' : 'out';
    let token = getToken(transfer, direction);

    if (!token) {
      // Zero-value sends can omit valueTransfers
      if (transactionCategory === 'STANDARD') {
        const nativeAsset = getNativeAsset(chainId);
        if (nativeAsset) {
          token = {
            symbol: nativeAsset.symbol,
            decimals: nativeAsset.decimals,
            assetId: nativeAsset.assetId,
            amount: transaction.value,
            direction,
            assetType: 'native',
          };
        }
      }
    } else if (
      !token.assetId &&
      transfer?.transferType !== 'normal' &&
      transfer?.transferType !== 'internal'
    ) {
      // ERC-20 transfer missing contractAddress — fall back to tx.to.
      const assetId = formatAddressToAssetId(transaction.to, chainId);
      if (assetId) {
        token = { ...token, assetId };
      }
    }

    return {
      type: isReceive ? 'receive' : 'send',
      ...common,
      data: {
        from: transfer?.from ?? from,
        to: transfer?.to ?? transaction.to,
        token,
        fees,
      },
    };
  }

  if (transactionCategory === 'CLAIM_BONUS') {
    return {
      type: 'claimMusdBonus',
      ...common,
      data: {
        from,
        token: getToken(receivedTransfer, 'in'),
      },
    };
  }

  if (transactionCategory === 'CLAIM') {
    return {
      type: 'claim',
      ...common,
      data: {
        from,
        token: getToken(
          receivedTransfer ?? sentTransfer,
          receivedTransfer ? 'in' : 'out',
        ),
      },
    };
  }

  if (transactionCategory === 'BRIDGE_WITHDRAW') {
    return {
      type: 'bridge',
      ...common,
      data: {
        from,
        sourceToken: getToken(sentTransfer, 'out'),
        fees,
      },
    };
  }

  if (
    transactionCategory === 'WITHDRAW' &&
    withdrawMethodIds.has(normalizedMethodId)
  ) {
    return {
      type: 'lendingWithdrawal',
      ...common,
      data: {
        from,
        sourceToken: getToken(sentTransfer, 'out'),
        destinationToken: getToken(receivedTransfer, 'in'),
        fees,
      },
    };
  }

  // Note: Categorize Deposit/Stake in the backend
  if (sentTransfer && supplyMethodIds.has(normalizedMethodId)) {
    return {
      type: 'lendingDeposit',
      ...common,
      data: {
        from,
        sourceToken: getToken(sentTransfer, 'out'),
        destinationToken: getToken(receivedTransfer, 'in'),
        fees,
      },
    };
  }

  const wrappedNativeAddress =
    swapsWrappedTokensAddresses[
      toHexChainId(chainId) as keyof typeof swapsWrappedTokensAddresses
    ];

  if (
    receivedTransfer &&
    wrapMethodIds.has(normalizedMethodId) &&
    wrappedNativeAddress &&
    equalsIgnoreCase(transaction.to, wrappedNativeAddress)
  ) {
    return {
      type: 'wrap',
      ...common,
      data: {
        from,
        sourceToken: getToken(sentTransfer, 'out'),
        destinationToken: getToken(receivedTransfer, 'in'),
        fees,
      },
    };
  }

  if (transactionCategory === 'UNWRAP') {
    return {
      type: 'unwrap',
      ...common,
      data: {
        from,
        sourceToken: getToken(sentTransfer, 'out'),
        destinationToken: getToken(receivedTransfer, 'in'),
        fees,
      },
    };
  }

  // Note: Categorize these Swaps in the backend
  if (
    transactionCategory === 'CONTRACT_CALL' &&
    sentTransfer?.symbol &&
    receivedTransfer?.symbol &&
    sentTransfer.symbol !== receivedTransfer.symbol
  ) {
    return {
      type: 'swap',
      ...common,
      data: {
        from,
        sourceToken: getToken(sentTransfer, 'out'),
        destinationToken: getToken(receivedTransfer, 'in'),
        fees,
      },
    };
  }

  if (transactionCategory === 'DEPOSIT') {
    return {
      type: 'deposit',
      ...common,
      data: {
        from,
        token: getToken(sentTransfer, 'out'),
      },
    };
  }

  const token = getToken(
    sentTransfer ?? receivedTransfer,
    sentTransfer ? 'out' : 'in',
  );

  return {
    type: 'contractInteraction',
    ...common,
    data: {
      methodId,
      from,
      to: transaction.to,
      transactionCategory,
      transactionProtocol: transaction.transactionProtocol,
      ...(token ? { token } : {}),
      fees,
    },
  };
}
