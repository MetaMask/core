/* eslint-disable @typescript-eslint/explicit-function-return-type */
import {
  convertHexToDecimal,
  toHex,
  weiHexToGweiDec,
} from '@metamask/controller-utils';
import { is } from '@metamask/superstruct';
import { KnownCaipNamespace } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import type {
  L1GasFees,
  ExchangeRate,
  NonEvmFees,
  DeepPartial,
} from '../../types';
import type { BridgeAsset, BridgeAssetV2 } from '../../validators/bridge-asset';
import { FloatStringSchema } from '../../validators/number';
import type { QuoteResponse } from '../../validators/quote-response';
import { isNativeAddress } from '../bridge';
import { calcTokenAmount } from '../number-formatters';
import type { QuoteMetadata, TokenAmountValues } from './types';
import { FeeType, toQuoteResponseV1, toQuoteResponseV2 } from '../..';

export const calcNonEvmTotalNetworkFee = (
  bridgeQuote: QuoteResponse & NonEvmFees,
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
  destAsset: BridgeAssetV2,
  { exchangeRate, usdExchangeRate }: ExchangeRate,
) => {
  const normalizedDestAmount = calcTokenAmount(
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
  { src: { amount, asset } }: QuoteResponse['quote'],
  { exchangeRate, usdExchangeRate }: ExchangeRate,
) => {
  const normalizedSentAmount = calcTokenAmount(amount, asset.decimals);
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
  const normalizedAmount = calcTokenAmount(amount, asset.decimals);

  return {
    amount,
    normalizedAmount: normalizedAmount?.toString(),
    valueInCurrency: exchangeRate
      ? normalizedAmount?.times(exchangeRate).toString()
      : null,
    usd: usdExchangeRate
      ? normalizedAmount?.times(usdExchangeRate).toString()
      : null,
    asset,
  };
};

export const calcRelayerFee = (
  quoteResponse: QuoteResponse & { namespace: KnownCaipNamespace.Eip155 },
  { exchangeRate, usdExchangeRate }: ExchangeRate,
) => {
  const { quote, trade } = quoteResponse;
  const relayerFeeAmount = trade.value
    ? new BigNumber(convertHexToDecimal(trade.value))
    : undefined;
  let relayerFeeInNative = relayerFeeAmount
    ? calcTokenAmount(relayerFeeAmount, 18)
    : undefined;

  // Subtract srcAmount and other fees from trade value if srcAsset is native
  if (isNativeAddress(quote.src.asset.assetId)) {
    const sentAmountInNative = calcSentAmount(quote, {
      exchangeRate,
      usdExchangeRate,
    }).amount;
    relayerFeeInNative = relayerFeeInNative?.minus(sentAmountInNative ?? '0');
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
      ? new BigNumber(tradeGasLimit?.toString() ?? '0')
          .plus(approvalGasLimit?.toString() ?? '0')
          .plus(resetApprovalGasLimit?.toString() ?? '0')
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
    ? gasFeesInDecEth?.times(nativeToDisplayCurrencyExchangeRate.toString())
    : undefined;
  const gasFeesInUSD = nativeToUsdExchangeRate
    ? gasFeesInDecEth?.times(nativeToUsdExchangeRate.toString())
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
  bridgeQuote: QuoteResponse & {
    namespace: KnownCaipNamespace.Eip155;
  } & L1GasFees;
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
    src: { asset: srcAsset },
    feeData: { txFee },
  }: QuoteResponse['quote'],
  srcTokenExchangeRate: ExchangeRate,
  destTokenExchangeRate: ExchangeRate,
) => {
  if (!txFee || !(gasIncluded || gasIncluded7702)) {
    return undefined;
  }
  // Use exchange rate of the token that is being used to pay for the transaction
  const { exchangeRate, usdExchangeRate } =
    txFee?.[0].asset.assetId === srcAsset.assetId
      ? srcTokenExchangeRate
      : destTokenExchangeRate;
  const normalizedTxFeeAmount = calcTokenAmount(
    txFee?.[0].amount,
    txFee?.[0].asset.decimals,
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
    dest: {
      asset: { assetId: destAssetId },
    },
  }: QuoteResponse['quote'],
) => {
  // If gas is included and is taken from the dest token, don't subtract network fee from return
  if (txFee?.[0]?.asset?.assetId?.toLowerCase() === destAssetId.toLowerCase()) {
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
  quote?: DeepPartial<QuoteResponse['quote']> | null,
) => {
  if (!quote?.src || !quote?.dest) {
    return undefined;
  }

  const sourceFiat = quote.src.valueInCurrency;
  const destFiat = quote.dest.valueInCurrency;
  const sourceUsd = quote.src.usd;
  const destUsd = quote.dest.usd;

  const isSourceFiatValid = (value: unknown): value is string[] =>
    is(value, FloatStringSchema);

  return {
    valueInCurrency:
      isSourceFiatValid(sourceFiat) && isSourceFiatValid(destFiat)
        ? new BigNumber(sourceFiat).minus(destFiat).abs().toFixed()
        : undefined,
    usd:
      isSourceFiatValid(sourceUsd) && isSourceFiatValid(destUsd)
        ? new BigNumber(sourceUsd).minus(destUsd).abs().toFixed()
        : undefined,
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
  quote: QuoteResponse,
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

  // const quote = toQuoteResponseV2(toQuoteResponseV1(baseQuote));
  const sentAmount = calcSentAmount(quote.quote, srcTokenExchangeRate);
  const toTokenAmount = calcToAmount(
    quote.quote.dest.amount,
    quote.quote.dest.asset,
    destTokenExchangeRate,
  );
  const minToTokenAmount = calcToAmount(
    quote.quote.dest.minAmount ?? quote.quote.dest.amount,
    quote.quote.dest.asset,
    destTokenExchangeRate,
  );

  const includedTxFees = calcIncludedTxFees(
    quote.quote,
    srcTokenExchangeRate,
    destTokenExchangeRate,
  );

  let totalEstimatedNetworkFee, relayerFee, gasFee;

  if (quote.namespace === KnownCaipNamespace.Eip155) {
    relayerFee = calcRelayerFee(quote, nativeExchangeRate);

    gasFee = calcEstimatedAndMaxTotalGasFee({
      bridgeQuote: quote,
      ...bridgeFeesPerGas,
      ...nativeExchangeRate,
    });
    // Uses total gasFee to calculate the total estimated network fee
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
  const priceImpact = calcPriceImpact({
    src: {
      valueInCurrency: sentAmount.valueInCurrency,
      usd: sentAmount.usd,
    },
    dest: {
      valueInCurrency: toTokenAmount.valueInCurrency,
      usd: toTokenAmount.usd,
    },
  });

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

export const calcQuoteMetadataV2 = (
  quote: QuoteResponse,
  usdToFiatExchangeRate: BigNumber,
): DeepPartial<QuoteResponse> => {
  // Calculate fiat based on usd value
  return {
    quote: {
      src: {
        valueInCurrency: usdToFiatExchangeRate
          .times(quote.quote.src.usd ?? '0')
          .toFixed(),
      },
      dest: {
        valueInCurrency: usdToFiatExchangeRate
          .times(quote.quote.dest.usd ?? '0')
          .toFixed(),
        minAmountValueInCurrency: usdToFiatExchangeRate
          .times(quote.quote.dest.minAmountUsd ?? '0')
          .toFixed(),
      },
      feeData: Object.fromEntries(
        Object.values(FeeType).map((feeType) => [
          feeType,
          quote.quote.feeData[feeType]?.map((fee) => ({
            valueInCurrency: usdToFiatExchangeRate
              .times(fee.usd ?? '0')
              .toFixed(),
          })),
        ]),
      ),
      priceData: {
        priceImpact: {
          valueInCurrency: usdToFiatExchangeRate
            .times(quote.quote.priceData?.priceImpact?.usd ?? '0')
            .toFixed(),
        },
      },
    },
  };
};
