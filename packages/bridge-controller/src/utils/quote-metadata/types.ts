import type { DeepPartial } from '../../types.js';

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
  valueInCurrency: string;
  /**
   * The amount of the token in USD
   *
   * @example "1.234"
   */
  usd: string;
};

/**
 * Values derived from the quote response
 *
 * @deprecated Avoid introducing new usages and use the QuoteResponse V2 type instead
 */
type QuoteMetadataV1 = {
  /**
   * If gas is included, this is the value of the src or dest token that was used to pay for the gas.
   * Show this value to indicate transaction fees for gasless quotes.
   */
  includedTxFees?: Partial<TokenAmountValues>;
  /**
   * The gas fee for the bridge transaction.
   * effective is the gas fee that is shown to the user. If this value is not
   * included in the trade, the calculation falls back to the gasLimit (total)
   * total is the gas fee that is spent by the user, including refunds.
   * max is the max gas fee that will be used by the transaction.
   */
  gasFee: Record<'total', TokenAmountValues>;
  relayerFee?: Partial<TokenAmountValues>; // relayer/provider fee in native units
  /**
   * The total network fee required to submit the trade and any approvals. This includes
   * the relayer fee or other native fees. Should be used for balance checks and tx submission.
   * Note: This is only accurate for non-gasless transactions. Use {@link QuoteMetadata.includedTxFees} to
   * get the total network fee for gasless transactions.
   */
  totalNetworkFee: TokenAmountValues; // gasFee.total + relayerFee
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

  /**
   * The price impact for the quote.
   */
  priceImpact: Omit<TokenAmountValues, 'amount'>; // abs(sentAmount - toTokenAmount);
};

export type QuoteMetadata = DeepPartial<QuoteMetadataV1>;
