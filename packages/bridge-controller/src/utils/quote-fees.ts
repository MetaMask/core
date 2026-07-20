import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { TransactionController } from '@metamask/transaction-controller';
import type { CaipChainId } from '@metamask/utils';

import { CHAIN_IDS } from '../constants/chains';
import type {
  L1GasFees,
  NonEvmFees,
  BridgeControllerMessenger,
} from '../types';
import type { QuoteResponseV1 } from '../validators/quote-response-v1';
import { isTronTrade } from '../validators/trade';
import type { TxData } from '../validators/trade';
import { isNonEvmChainId, sumHexes } from './bridge';
import { formatChainIdToCaip, formatChainIdToHex } from './caip-formatters';
import { computeFeeRequest } from './snaps';
import { extractTradeData } from './trade-utils';

/**
 * Appends transaction fees for EVM chains to quotes
 *
 * @param chainId - The CAIP srcChainId of the quotes
 * @param quotes - Array of quote responses to append fees to
 * @param getLayer1GasFee - The function to use to get the layer 1 gas fee
 * @returns Array of quotes with fees appended, or undefined if quotes are for non-EVM chains
 */
const appendL1GasFees = async <
  QuoteType extends Omit<QuoteResponseV1, 'quote'>,
>(
  chainId: CaipChainId,
  quotes: QuoteType[],
  getLayer1GasFee: typeof TransactionController.prototype.getLayer1GasFee,
): Promise<(QuoteType & L1GasFees)[] | undefined> => {
  // Indicates whether some of the quotes are not for optimism or base
  const hasInvalidQuotes = ![CHAIN_IDS.OPTIMISM, CHAIN_IDS.BASE]
    .map(formatChainIdToCaip)
    .includes(chainId);

  // Only append L1 gas fees if all quotes are for either optimism or base
  if (hasInvalidQuotes) {
    return undefined;
  }

  const hexChainId = formatChainIdToHex(chainId);
  const l1GasFeePromises = Promise.allSettled(
    quotes.map(async (quoteResponse) => {
      const { trade, approval } = quoteResponse;

      const getTxParams = (txData: TxData) => ({
        from: txData.from,
        to: txData.to,
        value: txData.value,
        data: txData.data,
        gasLimit: txData.gasLimit?.toString(),
      });
      const approvalL1GasFees = approval
        ? await getLayer1GasFee({
            transactionParams: getTxParams(approval as TxData),
            chainId: hexChainId,
          })
        : '0x0';
      const tradeL1GasFees = await getLayer1GasFee({
        transactionParams: getTxParams(trade as TxData),
        chainId: hexChainId,
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
    (QuoteType & L1GasFees)[]
  >((acc, result) => {
    if (result.status === 'fulfilled' && result.value) {
      acc.push(result.value);
    } else if (result.status === 'rejected') {
      console.error('Error calculating L1 gas fees for quote', result.reason);
    }
    return acc;
  }, []);

  if (quotesWithL1GasFees.length) {
    return quotesWithL1GasFees;
  }
  return undefined;
};

/**
 * Appends transaction fees for non-EVM chains to quotes
 *
 * @param chainId - The CAIP chain ID of the quotes
 * @param quotes - Array of quote responses to append fees to
 * @param messenger - The messaging system to use to call the snap controller
 * @param selectedAccount - The selected account for which the quotes were requested
 * @returns Array of quotes with fees appended, or undefined if quotes are for EVM chains
 */
const appendNonEvmFees = async <
  QuoteType extends Omit<QuoteResponseV1, 'quote'>,
>(
  chainId: CaipChainId,
  quotes: QuoteType[],
  messenger: BridgeControllerMessenger,
  selectedAccount?: InternalAccount,
): Promise<(QuoteType & NonEvmFees)[] | undefined> => {
  if (!isNonEvmChainId(chainId)) {
    return undefined;
  }

  const nonEvmFeePromises = Promise.allSettled(
    quotes.map(async (quoteResponse) => {
      const { trade } = quoteResponse;

      // Skip fee computation if no snap account or trade data
      if (!selectedAccount?.metadata?.snap?.id || !trade) {
        return quoteResponse;
      }

      try {
        const transaction = extractTradeData(trade);

        // Tron trades need the visible flag and contract type to be included in the request options
        const options = isTronTrade(trade)
          ? {
              visible: trade.visible,
              type: trade.raw_data?.contract?.[0]?.type,
              feeLimit: trade.raw_data?.fee_limit,
            }
          : undefined;

        const response = (await messenger.call(
          'SnapController:handleRequest',
          computeFeeRequest(
            selectedAccount?.metadata?.snap?.id,
            transaction,
            selectedAccount?.id,
            chainId,
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
          `Failed to compute non-EVM fees for quote in ${chainId}:`,
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
    (QuoteType & NonEvmFees)[]
  >((acc, result) => {
    if (result.status === 'fulfilled' && result.value) {
      acc.push(result.value);
    }
    return acc;
  }, []);

  return quotesWithNonEvmFees;
};

/**
 * Appends transaction fees to quotes
 *
 * @param chainId - The CAIP chain ID of the quotes
 * @param quotes - Array of quote responses to append fees to
 * @param messenger - The bridge controller to use to call the snap controller
 * @param getLayer1GasFee - The function to use to get the layer 1 gas fee
 * @param selectedAccount - The selected account for which the quotes were requested
 * @returns Array of quotes with fees appended, or undefined if quotes are for EVM chains
 */
export const appendFeesToQuotes = async <
  QuoteType extends Omit<QuoteResponseV1, 'quote'>,
>(
  chainId: CaipChainId,
  quotes: QuoteType[],
  messenger: BridgeControllerMessenger,
  getLayer1GasFee: typeof TransactionController.prototype.getLayer1GasFee,
  selectedAccount?: InternalAccount,
): Promise<(QuoteType & L1GasFees & NonEvmFees)[]> => {
  // Safe to cast: appendL1GasFees checks if all quotes are EVM and returns undefined otherwise
  const quotesWithL1GasFees = await appendL1GasFees(
    chainId,
    quotes,
    getLayer1GasFee,
  );

  const quotesWithNonEvmFees = await appendNonEvmFees(
    chainId,
    quotes,
    messenger,
    selectedAccount,
  );

  return quotesWithL1GasFees ?? quotesWithNonEvmFees ?? quotes;
};
