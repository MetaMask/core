import { isEqualCaseInsensitive as equalsIgnoreCase } from '@metamask/controller-utils';
import { TransactionType } from '@metamask/transaction-controller';
import { KnownCaipNamespace, toCaipChainId } from '@metamask/utils';

import type { Fee, ActivityItem, TokenAmount } from '../types.js';
import {
  permit2ApproveMethodId,
  swapsWrappedTokensAddresses,
  supplyMethodIds,
  tokenTransferLogTopicHash,
  unwrapMethodIds,
  withdrawMethodIds,
  wrapMethodIds,
} from './constants.js';
import { formatAddressToAssetId, getNativeAsset } from './helpers/caip.js';
import { getKnownTokenMetadata } from './helpers/token-metadata.js';
import {
  getLocalTransactionFees,
  getLocalTransactionStatus,
  isNftStandard,
} from './helpers/transactions.js';
import type { TransactionGroup } from './helpers/transactions.js';

const evmNativeDecimals = 18;

/**
 * Maps a local TransactionController group into the shared activity item shape.
 *
 * @param transactionGroup - The transaction group to map, optionally enriched by the client.
 * @returns The normalized activity item.
 */
export function mapLocalTransaction(
  transactionGroup: TransactionGroup & {
    sourceToken?: TokenAmount;
    destinationToken?: TokenAmount;
    nativeAssetSymbol?: string;
    contractTokenMetadata?: { symbol?: string; decimals?: number };
    activityStatus?: ActivityItem['status'];
    fees?: Fee[];
  },
): ActivityItem {
  const fees =
    transactionGroup.fees ?? getLocalTransactionFees(transactionGroup);
  const { initialTransaction, primaryTransaction } = transactionGroup;
  const {
    transferInformation,
    type: transactionType,
    simulationData,
    txReceipt,
    metamaskPay,
    txParams: { from = '', to = '', data: txData, value: txValue } = {},
  } = initialTransaction;
  const {
    time: primaryTime,
    hash: primaryHash,
    id: primaryId,
  } = primaryTransaction;
  const methodId = txData?.slice(0, 10);
  // Permit2 approvals use the Permit2 contract as `to`, not the approved token.
  // Keep this mapper thin: still classify the activity as an approve, but omit
  // the token rather than surfacing the wrong one — the API mapper provides
  // accurate token data.
  const isPermit2Approve = methodId === permit2ApproveMethodId;
  const tokenContractAddress = isPermit2Approve
    ? undefined
    : (transferInformation?.contractAddress ?? (to || undefined));
  const chainId = toCaipChainId(
    KnownCaipNamespace.Eip155,
    Number.parseInt(initialTransaction.chainId, 16).toString(),
  );
  const nativeAsset = getNativeAsset(initialTransaction.chainId);
  const nativeSymbol =
    transactionGroup.nativeAssetSymbol ?? nativeAsset?.symbol;

  const getNativeToken = (
    transaction: TransactionGroup['initialTransaction'],
    direction: TokenAmount['direction'],
  ): TokenAmount | undefined => {
    if (nativeSymbol === undefined) {
      return undefined;
    }

    return {
      direction,
      symbol: nativeSymbol,
      ...(transaction.txParams.value
        ? { amount: transaction.txParams.value }
        : {}),
      ...(nativeAsset?.assetId ? { assetId: nativeAsset.assetId } : {}),
      decimals: nativeAsset?.decimals ?? evmNativeDecimals,
    };
  };

  const getContractTokenFromTransaction = ({
    contractAddress,
    direction,
    transaction,
  }: {
    contractAddress?: string;
    direction: TokenAmount['direction'];
    transaction: TransactionGroup['initialTransaction'];
  }): TokenAmount | undefined => {
    if (!contractAddress) {
      return undefined;
    }

    const symbol =
      transaction.transferInformation?.symbol ??
      transactionGroup.contractTokenMetadata?.symbol;
    const decimals =
      transaction.transferInformation?.decimals ??
      transactionGroup.contractTokenMetadata?.decimals;
    const amount = transaction.transferInformation?.amount;
    const assetId = formatAddressToAssetId(contractAddress, chainId);

    return {
      direction,
      ...(symbol ? { symbol } : {}),
      ...(assetId ? { assetId } : {}),
      ...(amount ? { amount } : {}),
      ...(decimals === undefined ? {} : { decimals }),
    };
  };

  const getContractTokenWithKnownMetadata = ({
    amount,
    contractAddress,
    direction,
    transaction,
  }: {
    amount?: string;
    contractAddress?: string;
    direction: TokenAmount['direction'];
    transaction: TransactionGroup['initialTransaction'];
  }): TokenAmount | undefined => {
    if (!contractAddress) {
      return undefined;
    }

    const tokenMetadata = getKnownTokenMetadata(chainId, contractAddress);

    const isWrappedNativeToken = equalsIgnoreCase(
      contractAddress,
      swapsWrappedTokensAddresses[
        initialTransaction.chainId as keyof typeof swapsWrappedTokensAddresses
      ] || '',
    );
    const wrappedNativeTokenDecimals = isWrappedNativeToken
      ? (nativeAsset?.decimals ?? evmNativeDecimals)
      : undefined;

    const decimals =
      transaction.transferInformation?.amount === undefined
        ? (tokenMetadata?.decimals ??
          transactionGroup.contractTokenMetadata?.decimals ??
          wrappedNativeTokenDecimals)
        : transaction.transferInformation.decimals;
    const tokenAmount = transaction.transferInformation?.amount ?? amount;
    const symbol =
      transaction.transferInformation?.symbol ??
      tokenMetadata?.symbol ??
      transactionGroup.contractTokenMetadata?.symbol;
    const assetId = formatAddressToAssetId(contractAddress, chainId);

    return {
      direction,
      ...(symbol ? { symbol } : {}),
      ...(assetId ? { assetId } : {}),
      ...(tokenAmount ? { amount: tokenAmount } : {}),
      ...(decimals === undefined ? {} : { decimals }),
    };
  };

  const status =
    transactionGroup.activityStatus ??
    getLocalTransactionStatus({
      primaryTransaction,
      initialTransaction,
    });
  const timestamp = primaryTime ?? initialTransaction.time;
  const hash = primaryHash ?? initialTransaction.hash ?? primaryId;
  const common = { chainId, status, timestamp, hash };

  switch (transactionType) {
    case TransactionType.simpleSend: {
      return {
        type: 'send',
        ...common,
        data: {
          from,
          to,
          token: getNativeToken(initialTransaction, 'out'),
        },
      };
    }

    case TransactionType.swap:
    case TransactionType.swapAndSend:
    case TransactionType.bridge: {
      const { sourceToken, destinationToken } = transactionGroup;

      return {
        type: transactionType === TransactionType.bridge ? 'bridge' : 'swap',
        ...common,
        data: {
          from,
          sourceToken,
          destinationToken,
          fees,
        },
      };
    }

    case TransactionType.tokenMethodSafeTransferFrom:
    case TransactionType.tokenMethodTransfer:
    case TransactionType.tokenMethodTransferFrom: {
      return {
        type: 'send',
        ...common,
        data: {
          from,
          to,
          token: getContractTokenFromTransaction({
            transaction: initialTransaction,
            direction: 'out',
            contractAddress: tokenContractAddress,
          }),
        },
      };
    }

    case TransactionType.lendingDeposit:
    case TransactionType.stakingDeposit:
      return {
        type:
          transactionType === TransactionType.stakingDeposit
            ? 'deposit'
            : 'lendingDeposit',
        ...common,
        data: {
          from,
        },
      };

    case TransactionType.incoming: {
      return {
        type: 'receive',
        ...common,
        data: {
          from,
          to,
          token: transferInformation?.contractAddress
            ? getContractTokenFromTransaction({
                transaction: initialTransaction,
                direction: 'in',
                contractAddress: transferInformation.contractAddress,
              })
            : getNativeToken(initialTransaction, 'in'),
        },
      };
    }
    case TransactionType.musdClaim:
      return {
        type: 'claimMusdBonus',
        ...common,
        data: {
          from,
        },
      };

    case TransactionType.musdConversion: {
      let conversionAmount: string | undefined;

      if (txData && txData.length >= 138) {
        try {
          conversionAmount = BigInt(`0x${txData.slice(74, 138)}`).toString();
        } catch {
          conversionAmount = undefined;
        }
      }

      return {
        type: 'convert',
        ...common,
        data: {
          from,
          sourceToken: transactionGroup.sourceToken,
          destinationToken: getContractTokenWithKnownMetadata({
            amount: conversionAmount,
            transaction: initialTransaction,
            direction: 'in',
            contractAddress: to,
          }),
        },
      };
    }

    case TransactionType.bridgeApproval:
    case TransactionType.shieldSubscriptionApprove:
    case TransactionType.swapApproval:
    case TransactionType.tokenMethodSetApprovalForAll:
    case TransactionType.tokenMethodApprove:
    case TransactionType.tokenMethodIncreaseAllowance: {
      const approvalToken = getContractTokenFromTransaction({
        transaction: initialTransaction,
        direction: 'out',
        contractAddress: tokenContractAddress,
      });

      return {
        type:
          transactionType === TransactionType.tokenMethodIncreaseAllowance
            ? 'increaseSpendingCap'
            : 'approveSpendingCap',
        ...common,
        data: {
          from,
          token: approvalToken,
        },
      };
    }

    case TransactionType.perpsDeposit:
    case TransactionType.perpsDepositAndOrder:
    case TransactionType.perpsWithdraw: {
      const token = to
        ? {
            direction: 'out' as const,
            assetId: formatAddressToAssetId(to, chainId),
          }
        : undefined;

      const fiat = metamaskPay?.targetFiat
        ? { amount: metamaskPay.targetFiat }
        : undefined;
      const networkFee =
        typeof metamaskPay?.networkFeeFiat === 'string'
          ? { amount: metamaskPay.networkFeeFiat }
          : undefined;

      return {
        type:
          transactionType === TransactionType.perpsWithdraw
            ? 'perpsWithdraw'
            : 'perpsAddFunds',
        ...common,
        data: {
          from,
          token,
          fiat,
          networkFee,
        },
      };
    }

    default: {
      const isSupplyContractInteraction =
        transactionType === TransactionType.contractInteraction &&
        methodId &&
        supplyMethodIds.has(methodId.toLowerCase());
      const isWithdrawContractInteraction =
        transactionType === TransactionType.contractInteraction &&
        methodId &&
        withdrawMethodIds.has(methodId.toLowerCase());

      let hasNativeValue = false;

      try {
        hasNativeValue = BigInt(txValue ?? '0') > 0n;
      } catch {
        hasNativeValue = false;
      }

      // Confirm an outflow before labelling a supply, mirroring the API mapper's
      // `sentTransfer` guard: native stakes (e.g. Lido) decrease the native
      // balance, while ERC-20 supplies (e.g. Aave) show a token decrease.
      const isSupply =
        isSupplyContractInteraction &&
        (simulationData?.nativeBalanceChange?.isDecrease === true ||
          simulationData?.tokenBalanceChanges?.some(
            ({ isDecrease, standard }) => isDecrease && standard === 'erc20',
          ) === true);
      const incomingNftBalanceChange =
        transactionType === TransactionType.contractInteraction &&
        simulationData?.tokenBalanceChanges?.find(
          ({ isDecrease, standard }) => !isDecrease && isNftStandard(standard),
        );

      if (incomingNftBalanceChange && hasNativeValue) {
        // Keep this mapper thin: classify the activity as an NFT buy and let the
        // API mapper provide the token/payment details.
        return {
          type: 'nftBuy',
          ...common,
          data: {
            from,
          },
        };
      }

      if (isSupply) {
        return {
          type: 'lendingDeposit',
          ...common,
          data: {
            from,
          },
        };
      }

      // lending withdrawal - applies to Earn features only
      if (isWithdrawContractInteraction) {
        const fromAddress = from.toLowerCase();
        const receivedTokenLog = (txReceipt?.logs ?? []).find(
          ({ topics: [eventTopic, , logTo] = [] }) => {
            const toAddress = logTo
              ? `0x${logTo.slice(-40)}`.toLowerCase()
              : undefined;

            return (
              eventTopic?.toLowerCase() === tokenTransferLogTopicHash &&
              toAddress === fromAddress
            );
          },
        );
        let receivedAmount: string | undefined;

        if (receivedTokenLog) {
          try {
            receivedAmount = BigInt(String(receivedTokenLog.data)).toString();
          } catch {
            receivedAmount = undefined;
          }
        }

        const destinationToken = receivedTokenLog
          ? getContractTokenWithKnownMetadata({
              amount: receivedAmount,
              transaction: initialTransaction,
              direction: 'in',
              contractAddress: receivedTokenLog.address,
            })
          : undefined;

        return {
          type: 'lendingWithdrawal',
          ...common,
          data: {
            from,
            destinationToken,
          },
        };
      }

      // wrap and unwrap
      if (transactionType === TransactionType.contractInteraction && methodId) {
        const wrappedTokenAddress =
          swapsWrappedTokensAddresses[
            initialTransaction.chainId as keyof typeof swapsWrappedTokensAddresses
          ];

        if (wrappedTokenAddress && equalsIgnoreCase(to, wrappedTokenAddress)) {
          const normalizedMethodId = methodId.toLowerCase();

          if (wrapMethodIds.has(normalizedMethodId)) {
            try {
              if (txValue && BigInt(txValue) > 0n) {
                return {
                  type: 'wrap',
                  ...common,
                  data: {
                    from,
                    sourceToken: getNativeToken(initialTransaction, 'out'),
                    destinationToken: getContractTokenWithKnownMetadata({
                      amount: txValue,
                      transaction: initialTransaction,
                      direction: 'in',
                      contractAddress: wrappedTokenAddress,
                    }),
                  },
                };
              }
            } catch {
              // Invalid native value — fall through.
            }
          }

          if (unwrapMethodIds.has(normalizedMethodId)) {
            let unwrapAmount: string | undefined;

            if (txData && txData.length >= 74) {
              try {
                unwrapAmount = BigInt(`0x${txData.slice(10, 74)}`).toString();
              } catch {
                unwrapAmount = undefined;
              }
            }

            const nativeToken = getNativeToken(initialTransaction, 'in');

            return {
              type: 'unwrap',
              ...common,
              data: {
                from,
                sourceToken: getContractTokenWithKnownMetadata({
                  amount: unwrapAmount,
                  transaction: initialTransaction,
                  direction: 'out',
                  contractAddress: wrappedTokenAddress,
                }),
                destinationToken:
                  nativeToken && unwrapAmount
                    ? { ...nativeToken, amount: unwrapAmount }
                    : nativeToken,
              },
            };
          }
        }
      }

      const token = ((): TokenAmount | undefined => {
        if (txValue === undefined || txValue === '') {
          return undefined;
        }

        try {
          return BigInt(txValue) > 0n
            ? getNativeToken(initialTransaction, 'out')
            : undefined;
        } catch {
          return undefined;
        }
      })();

      return {
        type: 'contractInteraction',
        ...common,
        data: {
          from,
          to,
          ...(token ? { token } : {}),
          methodId,
        },
      };
    }
  }
}
