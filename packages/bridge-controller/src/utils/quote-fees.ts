import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { TransactionController } from '@metamask/transaction-controller';
import { numberToHex } from '@metamask/utils';

import { isNonEvmChainId, sumHexes } from './bridge';
import { formatChainIdToCaip } from './caip-formatters';
import { computeFeeRequest } from './snaps';
import { CHAIN_IDS } from '../constants/chains';
import type {
  QuoteResponse,
  L1GasFees,
  NonEvmFees,
  TxData,
  BridgeControllerMessenger,
  BitcoinTradeData,
} from '../types';

/**
 * Appends transaction fees for EVM chains to quotes
 *
 * @param quotes - Array of quote responses to append fees to
 * @param getLayer1GasFee - The function to use to get the layer 1 gas fee
 * @returns Array of quotes with fees appended, or undefined if quotes are for non-EVM chains
 */
const appendL1GasFees = async (
  quotes: QuoteResponse[],
  getLayer1GasFee: typeof TransactionController.prototype.getLayer1GasFee,
): Promise<(QuoteResponse & L1GasFees)[] | undefined> => {
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
    (QuoteResponse & L1GasFees)[]
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

      if (selectedAccount?.metadata?.snap?.id && trade) {
        const scope = formatChainIdToCaip(quote.srcChainId);

        // Extract transaction string for snap
        // For Bitcoin: extract unsignedPsbtBase64 from the trade object
        // For Solana: trade is already a string
        const transaction =
          typeof trade === 'string'
            ? trade
            : (trade as BitcoinTradeData).unsignedPsbtBase64;

        const response = (await messenger.call(
          'SnapController:handleRequest',
          computeFeeRequest(
            selectedAccount.metadata.snap?.id,
            transaction,
            selectedAccount.id,
            scope,
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

        const baseFee = response?.find((fee) => fee.type === 'base');
        // Store fees in native units as returned by the snap (e.g., SOL, BTC)
        const feeInNative = baseFee?.asset?.amount || '0';

        return {
          ...quoteResponse,
          nonEvmFeesInNative: feeInNative,
        };
      }
      return quoteResponse;
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
  const quotesWithL1GasFees = await appendL1GasFees(quotes, getLayer1GasFee);
  const quotesWithNonEvmFees = await appendNonEvmFees(
    quotes,
    messenger,
    selectedAccount,
  );

  return quotesWithL1GasFees ?? quotesWithNonEvmFees ?? quotes;
};
