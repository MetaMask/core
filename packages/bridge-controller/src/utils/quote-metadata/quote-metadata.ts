import type { ExchangeRate } from '../../types';
import type { QuoteResponseV1 as QuoteResponse } from '../../validators/quote-response-v1';
import {
  calcAdjustedReturn,
  calcCost,
  calcEstimatedAndMaxTotalGasFee,
  calcIncludedTxFees,
  calcNonEvmTotalNetworkFee,
  calcPriceImpact,
  calcRelayerFee,
  calcSentAmount,
  calcSwapRate,
  calcToAmount,
  calcTotalEstimatedNetworkFee,
} from './calculators';
import type { QuoteMetadata } from './types';
import { isEvmQuoteResponse } from '../bridge';

/**
 * Calculates quote metadata, such as converted fiat amounts and fees,
 * based on the controller state and the quote response
 *
 * @param quote - The quote response to calculate the metadata for
 * @param options - The options for the calculation
 * @param options.bridgeFeesPerGas - The bridge fees per gas
 * @param options.srcTokenExchangeRate - The exchange rate for the source token
 * @param options.destTokenExchangeRate - The exchange rate for the destination token
 * @param options.nativeExchangeRate - The exchange rate for the native token
 * @returns The calculated metadata
 */
export const calcQuoteMetadata = (
  quote: QuoteResponse,
  options?: {
    bridgeFeesPerGas: null | {
      estimatedBaseFeeInDecGwei: string | null;
      feePerGasInDecGwei?: string;
      maxFeePerGasInDecGwei?: string;
    };
    srcTokenExchangeRate: ExchangeRate;
    destTokenExchangeRate: ExchangeRate;
    nativeExchangeRate: ExchangeRate;
  },
): QuoteMetadata => {
  const {
    bridgeFeesPerGas = {},
    srcTokenExchangeRate = {},
    destTokenExchangeRate = {},
    nativeExchangeRate = {},
  } = options ?? {};

  const sentAmount = calcSentAmount(quote.quote, srcTokenExchangeRate);
  const toTokenAmount = calcToAmount(
    quote.quote.destTokenAmount,
    quote.quote.destAsset,
    destTokenExchangeRate,
  );
  const minToTokenAmount = calcToAmount(
    quote.quote.minDestTokenAmount,
    quote.quote.destAsset,
    destTokenExchangeRate,
  );

  const includedTxFees = calcIncludedTxFees(
    quote.quote,
    srcTokenExchangeRate,
    destTokenExchangeRate,
  );

  let totalEstimatedNetworkFee, relayerFee, gasFee;

  if (isEvmQuoteResponse(quote)) {
    relayerFee = calcRelayerFee(quote, nativeExchangeRate);
    gasFee = calcEstimatedAndMaxTotalGasFee({
      bridgeQuote: quote,
      ...bridgeFeesPerGas,
      ...nativeExchangeRate,
    });
    // Uses effectiveGasFee to calculate the total estimated network fee
    totalEstimatedNetworkFee = calcTotalEstimatedNetworkFee(gasFee, relayerFee);
  } else {
    // Use the new generic function for all non-EVM chains
    totalEstimatedNetworkFee = calcNonEvmTotalNetworkFee(
      quote,
      nativeExchangeRate,
    );
    gasFee = {
      total: totalEstimatedNetworkFee,
    };
  }

  const adjustedReturn = calcAdjustedReturn(
    toTokenAmount,
    totalEstimatedNetworkFee,
    quote.quote,
  );
  const cost = calcCost(adjustedReturn, sentAmount);

  // The quote has not been updated at this point, so we need to calculate the price impact using sentAmount and toTokenAmount
  const priceImpact = calcPriceImpact({ sentAmount, toTokenAmount });

  return {
    sentAmount,
    toTokenAmount,
    minToTokenAmount,
    swapRate: calcSwapRate(sentAmount.amount, toTokenAmount.amount),
    /**
        This is the amount required to submit all the transactions.
        Includes the relayer fee or other native fees.
        Should be used for balance checks and tx submission.
     */
    totalNetworkFee: totalEstimatedNetworkFee,
    /**
        This contains gas fee estimates for the bridge transaction
        Does not include the relayer fee (if needed), just the gasLimit and effectiveGas returned by the bridge API.
        Should only be used for display purposes.
     */
    gasFee,
    ...(adjustedReturn && { adjustedReturn }),
    ...(cost && { cost }),
    ...(includedTxFees && { includedTxFees }),
    ...(relayerFee && { relayerFee }),
    ...((priceImpact?.valueInCurrency ?? priceImpact?.usd) && {
      priceImpact,
    }),
  };
};
