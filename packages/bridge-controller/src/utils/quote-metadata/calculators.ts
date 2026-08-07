/* eslint-disable @typescript-eslint/explicit-function-return-type */
import {
  convertHexToDecimal,
  toHex,
  weiHexToGweiDec,
} from '@metamask/controller-utils';
import { is } from '@metamask/superstruct';
import { BigNumber } from 'bignumber.js';

import { toQuoteResponseV1 } from '../../coercers/quote-response-v2-to-v1.js';
import type {
  L1GasFees,
  ExchangeRate,
  NonEvmFees,
  DeepPartial,
} from '../../types.js';
import type { BridgeAsset } from '../../validators/bridge-asset.js';
import { FloatStringSchema } from '../../validators/number.js';
import type { QuoteResponseV1 } from '../../validators/quote-response-v1.js';
import { QuoteResponseSchemaV2 } from '../../validators/quote-response.js';
import type { QuoteResponse } from '../../validators/quote-response.js';
import type { TxData } from '../../validators/trade.js';
import { isEvmQuoteResponse, isNativeAddress } from '../bridge.js';
import { calcNormalizedTokenAmount } from '../number-formatters.js';
import { includeIfTruthy } from './include-if-truthy.js';
import type { QuoteMetadata, TokenAmountValues } from './types.js';

export const calcNonEvmTotalNetworkFee = (
  bridgeQuote: QuoteResponseV1 & NonEvmFees,
  { exchangeRate, usdExchangeRate }: ExchangeRate,
) => {
  const { nonEvmFeesInNative } = bridgeQuote;
  // Fees are now stored directly in native units (SOL, BTC) without conversion
  const feeInNative = nonEvmFeesInNative
    ? new BigNumber(nonEvmFeesInNative)
    : undefined;

  return {
    amount: feeInNative?.toFixed(),
    valueInCurrency: exchangeRate && feeInNative?.times(exchangeRate).toFixed(),
    usd: usdExchangeRate && feeInNative?.times(usdExchangeRate).toFixed(),
  };
};

export const calcToAmount = (
  destTokenAmount: string | undefined,
  destAsset: BridgeAsset,
  { exchangeRate, usdExchangeRate }: ExchangeRate,
) => {
  const normalizedDestAmount = calcNormalizedTokenAmount(
    destTokenAmount,
    destAsset.decimals,
  );
  return {
    amount: normalizedDestAmount?.toFixed(),
    valueInCurrency:
      exchangeRate && normalizedDestAmount?.times(exchangeRate).toFixed(),
    usd:
      usdExchangeRate && normalizedDestAmount?.times(usdExchangeRate).toFixed(),
  };
};

export const calcSentAmount = (
  { srcTokenAmount, srcAsset, feeData, intent }: QuoteResponseV1['quote'],
  { exchangeRate, usdExchangeRate }: ExchangeRate,
  isQuoteV2: boolean = false,
) => {
  // For intent-based swaps or converted V2 quote responses, srcTokenAmount is the total
  // fixed commitment the user makes to the protocol — the protocol fee is
  // already baked in. Adding feeData fees on top would double-count them.
  // For conventional swaps, srcTokenAmount is the net routing amount (fees
  // excluded), so the src-token fees must be added to get the wallet deduction.
  const sentAmount =
    intent || isQuoteV2
      ? new BigNumber(srcTokenAmount)
      : Object.values(feeData)
          .filter(
            (fee) =>
              fee?.amount &&
              fee.asset?.assetId?.toLowerCase() ===
                srcAsset.assetId?.toLowerCase(),
          )
          .reduce(
            (acc, { amount }) => acc.plus(amount),
            new BigNumber(srcTokenAmount),
          );
  const normalizedSentAmount = calcNormalizedTokenAmount(
    sentAmount,
    srcAsset.decimals,
  );
  return {
    amount: normalizedSentAmount?.toFixed(),
    valueInCurrency:
      exchangeRate && normalizedSentAmount?.times(exchangeRate).toFixed(),
    usd:
      usdExchangeRate && normalizedSentAmount?.times(usdExchangeRate).toFixed(),
  };
};

export const calcBatchFees = (
  amount: string,
  asset: BridgeAsset,
  { exchangeRate, usdExchangeRate }: ExchangeRate,
) => {
  const normalizedAmount = calcNormalizedTokenAmount(amount, asset.decimals);

  return {
    amount: normalizedAmount?.toFixed(),
    valueInCurrency: exchangeRate
      ? normalizedAmount?.times(exchangeRate).toFixed()
      : null,
    usd: usdExchangeRate
      ? normalizedAmount?.times(usdExchangeRate).toFixed()
      : null,
    asset,
  };
};

export const calcRelayerFee = (
  sentAmount: ReturnType<typeof calcSentAmount>,
  quoteResponse: QuoteResponseV1<TxData>,
  { exchangeRate, usdExchangeRate }: ExchangeRate,
) => {
  const { quote, trade } = quoteResponse;
  const relayerFeeAmount = trade.value
    ? new BigNumber(convertHexToDecimal(trade.value))
    : undefined;
  let relayerFeeInNative = relayerFeeAmount
    ? calcNormalizedTokenAmount(relayerFeeAmount, 18)
    : undefined;

  // Subtract srcAmount and other fees from trade value if srcAsset is native
  if (isNativeAddress(quote.srcAsset.assetId)) {
    relayerFeeInNative = relayerFeeInNative?.minus(sentAmount.amount ?? '0');
  }

  if (relayerFeeInNative?.lte(0)) {
    return undefined;
  }

  return {
    amount: relayerFeeInNative?.toFixed(),
    valueInCurrency:
      exchangeRate && relayerFeeInNative?.times(exchangeRate).toFixed(),
    usd:
      usdExchangeRate && relayerFeeInNative?.times(usdExchangeRate).toFixed(),
  };
};

const calcTotalGasFee = ({
  approvalGasLimit,
  resetApprovalGasLimit,
  tradeGasLimit,
  l1GasFeesInHexWei,
  feePerGasInDecGwei,
  nativeToDisplayCurrencyExchangeRate,
  nativeToUsdExchangeRate,
}: {
  approvalGasLimit?: number | null;
  resetApprovalGasLimit?: number | null;
  tradeGasLimit?: number | null;
  l1GasFeesInHexWei?: string | null;
  feePerGasInDecGwei?: string;
  nativeToDisplayCurrencyExchangeRate?: string;
  nativeToUsdExchangeRate?: string;
}) => {
  const totalGasLimitInDec =
    tradeGasLimit || approvalGasLimit || resetApprovalGasLimit
      ? new BigNumber(tradeGasLimit?.toFixed() ?? '0')
          .plus(approvalGasLimit?.toFixed() ?? '0')
          .plus(resetApprovalGasLimit?.toFixed() ?? '0')
      : undefined;

  const l1GasFeesInDecGWei = l1GasFeesInHexWei
    ? weiHexToGweiDec(toHex(l1GasFeesInHexWei))
    : undefined;

  const gasFeesInDecGwei = totalGasLimitInDec
    ? totalGasLimitInDec
        ?.times(feePerGasInDecGwei ?? '0')
        ?.plus(l1GasFeesInDecGWei ?? '0')
    : undefined;
  const gasFeesInDecEth = gasFeesInDecGwei?.times(new BigNumber(10).pow(-9));

  const gasFeesInDisplayCurrency = nativeToDisplayCurrencyExchangeRate
    ? gasFeesInDecEth?.times(nativeToDisplayCurrencyExchangeRate)
    : undefined;
  const gasFeesInUSD = nativeToUsdExchangeRate
    ? gasFeesInDecEth?.times(nativeToUsdExchangeRate)
    : undefined;

  return {
    amount: gasFeesInDecEth?.toFixed(),
    valueInCurrency: gasFeesInDisplayCurrency?.toFixed(),
    usd: gasFeesInUSD?.toFixed(),
  };
};

export const calcEstimatedAndMaxTotalGasFee = ({
  bridgeQuote: { approval, trade, l1GasFeesInHexWei, resetApproval },
  feePerGasInDecGwei,
  exchangeRate: nativeToDisplayCurrencyExchangeRate,
  usdExchangeRate: nativeToUsdExchangeRate,
}: {
  bridgeQuote: QuoteResponseV1<TxData, TxData> & L1GasFees;
  feePerGasInDecGwei?: string;
} & ExchangeRate) => {
  // Estimated total gas fee, including refunded fees (medium)
  const { amount, valueInCurrency, usd } = calcTotalGasFee({
    approvalGasLimit: approval?.gasLimit,
    resetApprovalGasLimit: resetApproval?.gasLimit,
    tradeGasLimit: trade?.gasLimit,
    l1GasFeesInHexWei,
    feePerGasInDecGwei,
    nativeToDisplayCurrencyExchangeRate,
    nativeToUsdExchangeRate,
  });

  return {
    total: {
      amount,
      valueInCurrency,
      usd,
    },
  };
};

/**
 * Calculates the total estimated network fees for the bridge transaction
 *
 * @param gasFee - The gas fee for the bridge transaction
 * @param gasFee.total - The fee to display to the user. If not available, this is equal to the gasLimit (total)
 * @param relayerFee - The relayer fee paid to bridge providers
 * @returns The total estimated network fee for the bridge transaction, including the relayer fee paid to bridge providers
 */
export const calcTotalEstimatedNetworkFee = (
  gasFee: { total?: Partial<TokenAmountValues> } | undefined,
  relayerFee: ReturnType<typeof calcRelayerFee>,
) => {
  const { total: gasFeeToDisplay } = gasFee ?? {};
  return {
    amount:
      (gasFeeToDisplay?.amount ?? relayerFee?.amount) &&
      new BigNumber(gasFeeToDisplay?.amount ?? '0')
        .plus(relayerFee?.amount ?? '0')
        .toFixed(),
    valueInCurrency:
      (gasFeeToDisplay?.valueInCurrency ?? relayerFee?.valueInCurrency) &&
      new BigNumber(gasFeeToDisplay?.valueInCurrency ?? '0')
        .plus(relayerFee?.valueInCurrency ?? '0')
        .toFixed(),
    usd:
      (gasFeeToDisplay?.usd ?? relayerFee?.usd) &&
      new BigNumber(gasFeeToDisplay?.usd ?? '0')
        .plus(relayerFee?.usd ?? '0')
        .toFixed(),
  };
};

// Gas is included for some swap quotes and this is the value displayed in the client
export const calcIncludedTxFees = (
  {
    gasIncluded,
    gasIncluded7702,
    srcAsset,
    feeData: { txFee },
  }: QuoteResponseV1['quote'],
  srcTokenExchangeRate: ExchangeRate,
  destTokenExchangeRate: ExchangeRate,
) => {
  if (!txFee || !(gasIncluded || gasIncluded7702)) {
    return undefined;
  }
  // Use exchange rate of the token that is being used to pay for the transaction
  const { exchangeRate, usdExchangeRate } =
    txFee?.asset.assetId === srcAsset.assetId
      ? srcTokenExchangeRate
      : destTokenExchangeRate;
  const normalizedTxFeeAmount = calcNormalizedTokenAmount(
    txFee?.amount,
    txFee?.asset.decimals,
  );

  return {
    amount: normalizedTxFeeAmount?.toFixed(),
    valueInCurrency:
      exchangeRate && normalizedTxFeeAmount?.times(exchangeRate).toFixed(),
    usd:
      usdExchangeRate &&
      normalizedTxFeeAmount?.times(usdExchangeRate).toFixed(),
  };
};

export const calcAdjustedReturn = (
  toTokenAmount: Partial<TokenAmountValues>,
  totalEstimatedNetworkFee: Partial<TokenAmountValues>,
  {
    feeData: { txFee },
    destAsset: { assetId: destAssetId },
  }: QuoteResponseV1['quote'],
) => {
  // If gas is included and is taken from the dest token, don't subtract network fee from return
  if (txFee?.asset?.assetId?.toLowerCase() === destAssetId.toLowerCase()) {
    return {
      valueInCurrency: toTokenAmount.valueInCurrency,
      usd: toTokenAmount.usd,
    };
  }
  return {
    valueInCurrency:
      toTokenAmount.valueInCurrency &&
      totalEstimatedNetworkFee.valueInCurrency &&
      new BigNumber(toTokenAmount.valueInCurrency)
        .minus(totalEstimatedNetworkFee.valueInCurrency)
        .toFixed(),
    usd:
      toTokenAmount.usd &&
      totalEstimatedNetworkFee.usd &&
      new BigNumber(toTokenAmount.usd)
        .minus(totalEstimatedNetworkFee.usd)
        .toFixed(),
  };
};

export const calcSwapRate = (sentAmount?: string, destTokenAmount?: string) =>
  destTokenAmount && sentAmount
    ? new BigNumber(destTokenAmount).div(sentAmount).toFixed()
    : undefined;

export const calcCost = (
  adjustedReturn: ReturnType<typeof calcAdjustedReturn>,
  sentAmount: ReturnType<typeof calcSentAmount>,
) => ({
  valueInCurrency:
    adjustedReturn.valueInCurrency &&
    sentAmount.valueInCurrency &&
    new BigNumber(sentAmount.valueInCurrency)
      .minus(adjustedReturn.valueInCurrency)
      .toFixed(),
  usd:
    adjustedReturn.usd &&
    sentAmount.usd &&
    new BigNumber(sentAmount.usd).minus(adjustedReturn.usd).toFixed(),
});

/**
 * Calculates the slippage absolute value percentage based on the adjusted return and sent amount.
 *
 * @param adjustedReturn - Adjusted return value
 * @param sentAmount - Sent amount value
 * @returns the slippage in percentage
 */
export const calcSlippagePercentage = (
  adjustedReturn: ReturnType<typeof calcAdjustedReturn>,
  sentAmount: ReturnType<typeof calcSentAmount>,
): string | null => {
  const cost = calcCost(adjustedReturn, sentAmount);

  if (cost.valueInCurrency && sentAmount.valueInCurrency) {
    return new BigNumber(cost.valueInCurrency)
      .div(sentAmount.valueInCurrency)
      .times(100)
      .abs()
      .toFixed();
  }

  if (cost.usd && sentAmount.usd) {
    return new BigNumber(cost.usd)
      .div(sentAmount.usd)
      .times(100)
      .abs()
      .toFixed();
  }

  return null;
};

/**
 * Returns the fiat price impact for a bridge quote — the difference between
 * the source input fiat amount and the destination output fiat amount
 *
 * @param quote - The active quote
 * @returns Formatted fiat impact string, or `undefined` when either fiat value is unavailable.
 */
export const calcPriceImpact = (
  quote?: DeepPartial<
    Pick<QuoteMetadata, 'sentAmount' | 'toTokenAmount'>
  > | null,
) => {
  if (!quote?.sentAmount || !quote?.toTokenAmount) {
    return undefined;
  }

  const sourceFiat = quote.sentAmount.valueInCurrency;
  const destFiat = quote.toTokenAmount.valueInCurrency;
  const sourceUsd = quote.sentAmount.usd;
  const destUsd = quote.toTokenAmount.usd;

  const isSourceFiatValid = (value: unknown): value is string[] =>
    is(value, FloatStringSchema);

  const valueInCurrency =
    isSourceFiatValid(sourceFiat) && isSourceFiatValid(destFiat)
      ? new BigNumber(sourceFiat).minus(destFiat).abs().toFixed()
      : undefined;
  const usd =
    isSourceFiatValid(sourceUsd) && isSourceFiatValid(destUsd)
      ? new BigNumber(sourceUsd).minus(destUsd).abs().toFixed()
      : undefined;

  if (!valueInCurrency && !usd) {
    return undefined;
  }

  return {
    valueInCurrency,
    usd,
  };
};

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
  quote: QuoteResponseV1 | QuoteResponse,
  options: {
    bridgeFeesPerGas: null | {
      estimatedBaseFeeInDecGwei: string | null;
      feePerGasInDecGwei?: string;
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
  } = options;

  const isQuoteV2 = is(quote, QuoteResponseSchemaV2);
  const quoteV1 = isQuoteV2 ? toQuoteResponseV1(quote) : quote;

  const sentAmount = calcSentAmount(
    quoteV1.quote,
    srcTokenExchangeRate,
    isQuoteV2,
  );

  const toTokenAmount = calcToAmount(
    quoteV1.quote.destTokenAmount,
    quoteV1.quote.destAsset,
    destTokenExchangeRate,
  );
  const minToTokenAmount = calcToAmount(
    quoteV1.quote.minDestTokenAmount ?? quoteV1.quote.destTokenAmount,
    quoteV1.quote.destAsset,
    destTokenExchangeRate,
  );

  const includedTxFees = calcIncludedTxFees(
    quoteV1.quote,
    srcTokenExchangeRate,
    destTokenExchangeRate,
  );

  let totalEstimatedNetworkFee, relayerFee, gasFee;

  if (isEvmQuoteResponse(quoteV1)) {
    relayerFee = calcRelayerFee(sentAmount, quoteV1, nativeExchangeRate);
    gasFee = calcEstimatedAndMaxTotalGasFee({
      bridgeQuote: quoteV1,
      ...bridgeFeesPerGas,
      ...nativeExchangeRate,
    });
    // Uses total gasFee to calculate the total estimated network fee
    totalEstimatedNetworkFee = calcTotalEstimatedNetworkFee(gasFee, relayerFee);
  } else {
    // Use the new generic function for all non-EVM chains
    totalEstimatedNetworkFee = calcNonEvmTotalNetworkFee(
      quoteV1,
      nativeExchangeRate,
    );
    gasFee = {
      total: totalEstimatedNetworkFee,
    };
  }

  const adjustedReturn = calcAdjustedReturn(
    toTokenAmount,
    totalEstimatedNetworkFee,
    quoteV1.quote,
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
    ...includeIfTruthy(adjustedReturn, { adjustedReturn }),
    ...includeIfTruthy(cost, { cost }),
    ...includeIfTruthy(includedTxFees, { includedTxFees }),
    ...includeIfTruthy(relayerFee, { relayerFee }),
    ...includeIfTruthy(priceImpact, { priceImpact }),
  };
};
