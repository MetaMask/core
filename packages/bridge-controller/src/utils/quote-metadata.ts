import { QuoteResponse } from '..';
import { isEvmQuoteResponse } from './bridge';
import {
  calcAdjustedReturn,
  calcCost,
  calcEstimatedAndMaxTotalGasFee,
  calcIncludedTxFees,
  calcNonEvmTotalNetworkFee,
  calcRelayerFee,
  calcSentAmount,
  calcSwapRate,
  calcToAmount,
  calcTotalEstimatedNetworkFee,
  calcTotalMaxNetworkFee,
} from './quote';

/**
 * Asset exchange rate values for a given chain and address
 */
export type ExchangeRate = { exchangeRate?: string; usdExchangeRate?: string };

/**
 * The types of values for the token amount and its values when converted to the user's selected currency and USD
 */
export type TokenAmountValues = {
  /**
   * The amount of the token
   *
   * @example "1.005"
   */
  amount: string;
  /**
   * The amount of the token in the user's selected currency
   *
   * @example "4.55"
   */
  valueInCurrency: string | null;
  /**
   * The amount of the token in USD
   *
   * @example "1.234"
   */
  usd: string | null;
};

/**
 * Values derived from the quote response
 *
 * @deprecated Avoid introducing new usages and use the QuoteResponse V2 type instead
 */
export type QuoteMetadata = {
  /**
   * If gas is included, this is the value of the src or dest token that was used to pay for the gas.
   * Show this value to indicate transaction fees for gasless quotes.
   */
  includedTxFees?: TokenAmountValues | null;
  /**
   * The gas fee for the bridge transaction.
   * effective is the gas fee that is shown to the user. If this value is not
   * included in the trade, the calculation falls back to the gasLimit (total)
   * total is the gas fee that is spent by the user, including refunds.
   * max is the max gas fee that will be used by the transaction.
   */
  gasFee: Record<'effective' | 'total' | 'max', TokenAmountValues>;
  /**
   * The total network fee required to submit the trade and any approvals. This includes
   * the relayer fee or other native fees. Should be used for balance checks and tx submission.
   * Note: This is only accurate for non-gasless transactions. Use {@link QuoteMetadata.includedTxFees} to
   * get the total network fee for gasless transactions.
   */
  totalNetworkFee: TokenAmountValues; // estimatedGasFees + relayerFees
  totalMaxNetworkFee: TokenAmountValues; // maxGasFees + relayerFees

  /**
   * The amount that the user will receive (destTokenAmount)
   */
  toTokenAmount: TokenAmountValues;
  /**
   * The minimum amount that the user will receive (minDestTokenAmount)
   */
  minToTokenAmount: TokenAmountValues;
  /**
   * If gas is included: {@link QuoteMetadata.toTokenAmount} - {@link QuoteMetadata.includedTxFees}.
   * Otherwise: {@link QuoteMetadata.toTokenAmount} - {@link QuoteMetadata.totalNetworkFee}.
   */
  adjustedReturn: Omit<TokenAmountValues, 'amount'>;
  /**
   * The amount that the user will send, including fees that are paid in the src token
   * {@link Quote.srcTokenAmount} + {@link Quote.feeData[FeeType.METABRIDGE].amount} + {@link Quote.feeData[FeeType.TX_FEE].amount}
   */
  sentAmount: TokenAmountValues;
  /**
   * The swap rate is the amount that the user will receive per amount sent. Accounts for fees paid in the src or dest token.
   * This is calculated as {@link QuoteMetadata.toTokenAmount} / {@link QuoteMetadata.sentAmount}.
   */
  swapRate: string;
  /**
   * The cost of the trade, which is the difference between the amount sent and the adjusted return.
   * This is calculated as {@link QuoteMetadata.sentAmount} - {@link QuoteMetadata.adjustedReturn}.
   */
  cost: Omit<TokenAmountValues, 'amount'>; // sentAmount - adjustedReturn
};

export const mergeQuoteMetadata = (
  quote: QuoteResponse,
  quoteMetadata: QuoteMetadata,
) => {
  return {
    ...quote,
    ...quoteMetadata,
  };
};

export const calcQuoteMetadata = (
  quote: QuoteResponse,
  options: {
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
    bridgeFeesPerGas,
    srcTokenExchangeRate,
    destTokenExchangeRate,
    nativeExchangeRate,
  } = options;

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

  let totalEstimatedNetworkFee,
    totalMaxNetworkFee,
    relayerFee,
    gasFee: QuoteMetadata['gasFee'];

  if (isEvmQuoteResponse(quote)) {
    relayerFee = calcRelayerFee(quote, nativeExchangeRate);
    gasFee = calcEstimatedAndMaxTotalGasFee({
      bridgeQuote: quote,
      ...bridgeFeesPerGas,
      ...nativeExchangeRate,
    });
    // Uses effectiveGasFee to calculate the total estimated network fee
    totalEstimatedNetworkFee = calcTotalEstimatedNetworkFee(gasFee, relayerFee);
    totalMaxNetworkFee = calcTotalMaxNetworkFee(gasFee, relayerFee);
  } else {
    // Use the new generic function for all non-EVM chains
    totalEstimatedNetworkFee = calcNonEvmTotalNetworkFee(
      quote,
      nativeExchangeRate,
    );
    gasFee = {
      effective: totalEstimatedNetworkFee,
      total: totalEstimatedNetworkFee,
      max: totalEstimatedNetworkFee,
    };
    totalMaxNetworkFee = totalEstimatedNetworkFee;
  }

  const adjustedReturn = calcAdjustedReturn(
    toTokenAmount,
    totalEstimatedNetworkFee,
    quote.quote,
  );
  const cost = calcCost(adjustedReturn, sentAmount);

  return mergeQuoteMetadata(quote, {
    // QuoteMetadata fields
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
    totalMaxNetworkFee,
    /**
        This contains gas fee estimates for the bridge transaction
        Does not include the relayer fee (if needed), just the gasLimit and effectiveGas returned by the bridge API.
        Should only be used for display purposes.
     */
    gasFee,
    adjustedReturn,
    cost,
    includedTxFees,
  });
};
