import {
  isEqualCaseInsensitive as equalsIgnoreCase,
  isValidHexAddress,
} from '@metamask/controller-utils';
import type { V1TransactionByHashResponse } from '@metamask/core-backend';
import { KnownCaipNamespace, toCaipChainId } from '@metamask/utils';

import type {
  ActivityItem,
  Status,
  TokenAmount,
  ValueTransfer,
} from '../types';
import {
  nativeTokenAddress,
  supplyMethodIds,
  swapsWrappedTokensAddresses,
  withdrawMethodIds,
  wrapMethodIds,
} from './constants';
import { formatAddressToAssetId, getNativeAsset } from './helpers/caip';
import {
  getFees,
  getNftPaymentTransfer,
  getTokenAmountFromTransfer,
  getTokenMetadataFromKnownToken,
  parseValueTransfers,
  withFallbackTokenAssetId,
} from './helpers/transactions';

/**
 * Maps an indexed API transaction into the shared activity item shape.
 *
 * @param options - The mapping options.
 * @param options.transaction - The indexed API transaction to map.
 * @param options.subjectAddress - The account the activity is being mapped for.
 * @returns The normalized activity item.
 */
export function mapApiTransaction({
  transaction,
  subjectAddress,
}: {
  transaction: V1TransactionByHashResponse;
  subjectAddress: string;
}): ActivityItem {
  const { hash, transactionCategory, valueTransfers, from, methodId } =
    transaction;
  const normalizedMethodId = methodId?.toLowerCase() ?? '';
  const status: Status = transaction.isError ? 'failed' : 'success';
  const timestamp = new Date(transaction.timestamp).getTime();
  const chainId = toCaipChainId(
    KnownCaipNamespace.Eip155,
    transaction.chainId.toString(),
  );
  const getToken = (
    transfer: ValueTransfer | undefined,
    direction: TokenAmount['direction'],
  ): TokenAmount | undefined =>
    getTokenAmountFromTransfer(transfer, direction, chainId);

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
        fees: getFees(transaction, chainId),
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
        fees: getFees(transaction, chainId),
      },
    };
  }

  // Note: Categorize NFT in the backend
  if (sentNftTransfer || receivedNftTransfer) {
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
    const direction = isReceive ? 'in' : 'out';
    const nativeAsset = getNativeAsset(chainId);
    const nativeToken =
      transactionCategory === 'STANDARD' && nativeAsset
        ? ({
            ...nativeAsset,
            amount: transaction.value,
            direction,
          } as TokenAmount)
        : undefined;

    return {
      type: isReceive ? 'receive' : 'send',
      ...common,
      data: {
        from: transfer?.from ?? from,
        to: transfer?.to ?? transaction.to,
        token:
          withFallbackTokenAssetId(
            getToken(transfer, direction),
            transaction.to,
            transfer?.transferType,
            chainId,
          ) ?? nativeToken,
        fees: getFees(transaction, chainId),
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
        fees: getFees(transaction, chainId),
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
        fees: getFees(transaction, chainId),
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
        fees: getFees(transaction, chainId),
      },
    };
  }

  const wrappedNativeAddress =
    swapsWrappedTokensAddresses[
      `0x${transaction.chainId.toString(
        16,
      )}` as keyof typeof swapsWrappedTokensAddresses
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
        fees: getFees(transaction, chainId),
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
        fees: getFees(transaction, chainId),
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
        fees: getFees(transaction, chainId),
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
    },
  };
}
