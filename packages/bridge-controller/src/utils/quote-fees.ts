import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { TransactionController } from '@metamask/transaction-controller';
import { numberToHex } from '@metamask/utils';

import { isNonEvmChainId, sumHexes } from './bridge';
import { formatChainIdToCaip } from './caip-formatters';
import { computeFeeRequest } from './snaps';
import { extractTradeData, isTronTrade } from './trade-utils';
import { CHAIN_IDS } from '../constants/chains';
import type {
  QuoteResponse,
  L1GasFees,
  NonEvmFees,
  TxData,
  BridgeControllerMessenger,
} from '../types';

/**
 * Appends transaction fees for EVM chains to quotes
 *
 * @param quotes - Array of quote responses to append fees to
 * @param getLayer1GasFee - The function to use to get the layer 1 gas fee
 * @returns Array of quotes with fees appended, or undefined if quotes are for non-EVM chains
 */
const appendL1GasFees = async (
  quotes: QuoteResponse<TxData, TxData>[],
  getLayer1GasFee: typeof TransactionController.prototype.getLayer1GasFee,
): Promise<(QuoteResponse<TxData, TxData> & L1GasFees)[] | undefined> => {
  // Indicates whether some of the quotes are not for optimism or base
  const hasInvalidQuotes = quotes.some(({ quote }) => {
    const chainId = formatChainIdToCaip(quote.srcChainId);
    return ![CHAIN_IDS.OPTIMISM, CHAIN_IDS.BASE]
      .map(formatChainIdToCaip)
      .includes(chainId);
  });

  // Only append L1 gas fees if all quotes are for either optimism or base
  if (hasInvalidQuotes) {
    return undefined;
  }

  const l1GasFeePromises = Promise.allSettled(
    quotes.map(async (quoteResponse) => {
      const { quote, trade, approval } = quoteResponse;
      const chainId = numberToHex(quote.srcChainId);

      const getTxParams = (txData: TxData) => ({
        from: txData.from,
        to: txData.to,
        value: txData.value,
        data: txData.data,
        gasLimit: txData.gasLimit?.toString(),
      });
      const approvalL1GasFees = approval
        ? await getLayer1GasFee({
            transactionParams: getTxParams(approval),
            chainId,
          })
        : '0x0';
      const tradeL1GasFees = await getLayer1GasFee({
        transactionParams: getTxParams(trade as TxData),
        chainId,
      });

      if (approvalL1GasFees === undefined || tradeL1GasFees === undefined) {
        return undefined;
      }

      return {
        ...quoteResponse,
        l1GasFeesInHexWei: sumHexes(approvalL1GasFees, tradeL1GasFees),
      };
    }),
  );

  const quotesWithL1GasFees = (await l1GasFeePromises).reduce<
    (QuoteResponse<TxData, TxData> & L1GasFees)[]
  >((acc, result) => {
    if (result.status === 'fulfilled' && result.value) {
      acc.push(result.value);
    } else if (result.status === 'rejected') {
      console.error('Error calculating L1 gas fees for quote', result.reason);
    }
    return acc;
  }, []);

  return quotesWithL1GasFees;
};

/**
 * Appends transaction fees for non-EVM chains to quotes
 *
 * @param quotes - Array of quote responses to append fees to
 * @param messenger - The messaging system to use to call the snap controller
 * @param selectedAccount - The selected account for which the quotes were requested
 * @returns Array of quotes with fees appended, or undefined if quotes are for EVM chains
 */
const appendNonEvmFees = async (
  quotes: QuoteResponse[],
  messenger: BridgeControllerMessenger,
  selectedAccount: InternalAccount,
): Promise<(QuoteResponse & NonEvmFees)[] | undefined> => {
  if (
    quotes.some(({ quote: { srcChainId } }) => !isNonEvmChainId(srcChainId))
  ) {
    return undefined;
  }

  const nonEvmFeePromises = Promise.allSettled(
    quotes.map(async (quoteResponse) => {
      const { trade, quote } = quoteResponse;

      // Skip fee computation if no snap account or trade data
      if (!selectedAccount?.metadata?.snap?.id || !trade) {
        return quoteResponse;
      }

      try {
        const scope = formatChainIdToCaip(quote.srcChainId);

        const transaction = extractTradeData(trade);

        // Tron trades need the visible flag and contract type to be included in the request options
        const options = isTronTrade(trade)
          ? {
              visible: trade.visible,
              type: trade.raw_data?.contract?.[0]?.type,
            }
          : undefined;

        const response = (await messenger.call(
          'SnapController:handleRequest',
          computeFeeRequest(
            selectedAccount.metadata.snap?.id,
            transaction,
            selectedAccount.id,
            scope,
            options,
          ),
        )) as {
          type: 'base' | 'priority';
          asset: {
            unit: string;
            type: string;
            amount: string;
            fungible: true;
          };
        }[];

        // Bitcoin snap returns 'priority' fee, Solana returns 'base' fee
        const fee =
          response?.find((f) => f.type === 'base') ||
          response?.find((f) => f.type === 'priority') ||
          response?.[0];
        const feeInNative = fee?.asset?.amount || '0';

        return {
          ...quoteResponse,
          nonEvmFeesInNative: feeInNative,
        };
      } catch (error) {
        // Return quote with undefined fee if snap fails (e.g., insufficient UTXO funds)
        // Client can render special UI or skip the quote card row for quotes with missing fee data
        console.error(
          `Failed to compute non-EVM fees for quote ${quote.requestId}:`,
          error,
        );
        return {
          ...quoteResponse,
          nonEvmFeesInNative: undefined,
        };
      }
    }),
  );

  const quotesWithNonEvmFees = (await nonEvmFeePromises).reduce<
    (QuoteResponse & NonEvmFees)[]
  >((acc, result) => {
    if (result.status === 'fulfilled' && result.value) {
      acc.push(result.value);
    } else if (result.status === 'rejected') {
      console.error('Error calculating non-EVM fees for quote', result.reason);
    }
    return acc;
  }, []);

  return quotesWithNonEvmFees;
};

/**
 * Appends transaction fees to quotes
 *
 * @param quotes - Array of quote responses to append fees to
 * @param messenger - The bridge controller to use to call the snap controller
 * @param getLayer1GasFee - The function to use to get the layer 1 gas fee
 * @param selectedAccount - The selected account for which the quotes were requested
 * @returns Array of quotes with fees appended, or undefined if quotes are for EVM chains
 */
export const appendFeesToQuotes = async (
  quotes: QuoteResponse[],
  messenger: BridgeControllerMessenger,
  getLayer1GasFee: typeof TransactionController.prototype.getLayer1GasFee,
  selectedAccount: InternalAccount,
): Promise<(QuoteResponse & L1GasFees & NonEvmFees)[]> => {
  // Safe to cast: appendL1GasFees checks if all quotes are EVM and returns undefined otherwise
  const quotesWithL1GasFees = await appendL1GasFees(
    quotes as QuoteResponse<TxData, TxData>[],
    getLayer1GasFee,
  );
  const quotesWithNonEvmFees = await appendNonEvmFees(
    quotes,
    messenger,
    selectedAccount,
  );

  return quotesWithL1GasFees ?? quotesWithNonEvmFees ?? quotes;
};
