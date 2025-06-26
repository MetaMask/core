import { toHex, weiHexToGweiDec } from '@metamask/controller-utils';
import { BigNumber } from 'bignumber.js';

import { isNativeAddress } from './bridge';
import type {
  ExchangeRate,
  GenericQuoteRequest,
  L1GasFees,
  Quote,
  QuoteResponse,
  SolanaFees,
} from '../types';

export const isValidQuoteRequest = (
  partialRequest: Partial<GenericQuoteRequest>,
  requireAmount = true,
): partialRequest is GenericQuoteRequest => {
  const stringFields = [
    'srcTokenAddress',
    'destTokenAddress',
    'srcChainId',
    'destChainId',
    'walletAddress',
  ];
  if (requireAmount) {
    stringFields.push('srcTokenAmount');
  }
  const numberFields = [];
  // if slippage is defined, require it to be a number
  if (partialRequest.slippage !== undefined) {
    numberFields.push('slippage');
  }

  return (
    stringFields.every(
      (field) =>
        field in partialRequest &&
        typeof partialRequest[field as keyof typeof partialRequest] ===
          'string' &&
        partialRequest[field as keyof typeof partialRequest] !== undefined &&
        partialRequest[field as keyof typeof partialRequest] !== '' &&
        partialRequest[field as keyof typeof partialRequest] !== null,
    ) &&
    numberFields.every(
      (field) =>
        field in partialRequest &&
        typeof partialRequest[field as keyof typeof partialRequest] ===
          'number' &&
        partialRequest[field as keyof typeof partialRequest] !== undefined &&
        !isNaN(Number(partialRequest[field as keyof typeof partialRequest])) &&
        partialRequest[field as keyof typeof partialRequest] !== null,
    ) &&
    (requireAmount
      ? Boolean((partialRequest.srcTokenAmount ?? '').match(/^[1-9]\d*$/u))
      : true)
  );
};

/**
 * Generates a pseudo-unique string that identifies each quote by aggregator, bridge, and steps
 *
 * @param quote - The quote to generate an identifier for
 * @returns A pseudo-unique string that identifies the quote
 */
export const getQuoteIdentifier = (quote: QuoteResponse['quote']) =>
  `${quote.bridgeId}-${quote.bridges[0]}-${quote.steps.length}`;

const calcTokenAmount = (value: string | BigNumber, decimals: number) => {
  const divisor = new BigNumber(10).pow(decimals ?? 0);
  return new BigNumber(value).div(divisor);
};

export const calcSolanaTotalNetworkFee = (
  bridgeQuote: QuoteResponse & SolanaFees,
  { exchangeRate, usdExchangeRate }: ExchangeRate,
) => {
  const { solanaFeesInLamports } = bridgeQuote;
  const solanaFeeInNative = calcTokenAmount(solanaFeesInLamports ?? '0', 9);
  return {
    amount: solanaFeeInNative.toString(),
    valueInCurrency: exchangeRate
      ? solanaFeeInNative.times(exchangeRate).toString()
      : null,
    usd: usdExchangeRate
      ? solanaFeeInNative.times(usdExchangeRate).toString()
      : null,
  };
};

export const calcToAmount = (
  { destTokenAmount, destAsset }: Quote,
  { exchangeRate, usdExchangeRate }: ExchangeRate,
) => {
  const normalizedDestAmount = calcTokenAmount(
    destTokenAmount,
    destAsset.decimals,
  );
  return {
    amount: normalizedDestAmount.toString(),
    valueInCurrency: exchangeRate
      ? normalizedDestAmount.times(exchangeRate).toString()
      : null,
    usd: usdExchangeRate
      ? normalizedDestAmount.times(usdExchangeRate).toString()
      : null,
  };
};

export const calcSentAmount = (
  { srcTokenAmount, srcAsset, feeData }: Quote,
  { exchangeRate, usdExchangeRate }: ExchangeRate,
) => {
  // Find all fees that will be taken from the src token
  const srcTokenFees = Object.values(feeData).filter(
    (fee) => fee && fee.amount && fee.asset?.assetId === srcAsset.assetId,
  );
  const sentAmount = srcTokenFees.reduce(
    (acc, { amount }) => acc.plus(amount),
    new BigNumber(srcTokenAmount),
  );
  const normalizedSentAmount = calcTokenAmount(sentAmount, srcAsset.decimals);
  return {
    amount: normalizedSentAmount.toString(),
    valueInCurrency: exchangeRate
      ? normalizedSentAmount.times(exchangeRate).toString()
      : null,
    usd: usdExchangeRate
      ? normalizedSentAmount.times(usdExchangeRate).toString()
      : null,
  };
};

export const calcRelayerFee = (
  bridgeQuote: QuoteResponse,
  { exchangeRate, usdExchangeRate }: ExchangeRate,
) => {
  const {
    quote: { srcAsset, srcTokenAmount, feeData },
    trade,
  } = bridgeQuote;
  const relayerFeeInNative = calcTokenAmount(
    new BigNumber(trade.value || '0x0', 16).minus(
      isNativeAddress(srcAsset.address)
        ? new BigNumber(srcTokenAmount).plus(feeData.metabridge.amount)
        : 0,
    ),
    18,
  );
  return {
    amount: relayerFeeInNative,
    valueInCurrency: exchangeRate
      ? relayerFeeInNative.times(exchangeRate)
      : null,
    usd: usdExchangeRate ? relayerFeeInNative.times(usdExchangeRate) : null,
  };
};

const calcTotalGasFee = ({
  bridgeQuote,
  feePerGasInDecGwei,
  priorityFeePerGasInDecGwei,
  nativeToDisplayCurrencyExchangeRate,
  nativeToUsdExchangeRate,
}: {
  bridgeQuote: QuoteResponse & L1GasFees;
  feePerGasInDecGwei: string;
  priorityFeePerGasInDecGwei: string;
  nativeToDisplayCurrencyExchangeRate?: string;
  nativeToUsdExchangeRate?: string;
}) => {
  const { approval, trade, l1GasFeesInHexWei } = bridgeQuote;

  const totalGasLimitInDec = new BigNumber(
    trade.gasLimit?.toString() ?? '0',
  ).plus(approval?.gasLimit?.toString() ?? '0');

  const totalFeePerGasInDecGwei = new BigNumber(feePerGasInDecGwei).plus(
    priorityFeePerGasInDecGwei,
  );
  const l1GasFeesInDecGWei = weiHexToGweiDec(toHex(l1GasFeesInHexWei ?? '0'));
  const gasFeesInDecGwei = totalGasLimitInDec
    .times(totalFeePerGasInDecGwei)
    .plus(l1GasFeesInDecGWei);
  const gasFeesInDecEth = gasFeesInDecGwei.times(new BigNumber(10).pow(-9));

  const gasFeesInDisplayCurrency = nativeToDisplayCurrencyExchangeRate
    ? gasFeesInDecEth.times(nativeToDisplayCurrencyExchangeRate.toString())
    : null;
  const gasFeesInUSD = nativeToUsdExchangeRate
    ? gasFeesInDecEth.times(nativeToUsdExchangeRate.toString())
    : null;

  return {
    amount: gasFeesInDecEth.toString(),
    valueInCurrency: gasFeesInDisplayCurrency?.toString() ?? null,
    usd: gasFeesInUSD?.toString() ?? null,
  };
};

export const calcEstimatedAndMaxTotalGasFee = ({
  bridgeQuote,
  estimatedBaseFeeInDecGwei,
  maxFeePerGasInDecGwei,
  maxPriorityFeePerGasInDecGwei,
  exchangeRate: nativeToDisplayCurrencyExchangeRate,
  usdExchangeRate: nativeToUsdExchangeRate,
}: {
  bridgeQuote: QuoteResponse & L1GasFees;
  estimatedBaseFeeInDecGwei: string;
  maxFeePerGasInDecGwei: string;
  maxPriorityFeePerGasInDecGwei: string;
} & ExchangeRate) => {
  const { amount, valueInCurrency, usd } = calcTotalGasFee({
    bridgeQuote,
    feePerGasInDecGwei: estimatedBaseFeeInDecGwei,
    priorityFeePerGasInDecGwei: maxPriorityFeePerGasInDecGwei,
    nativeToDisplayCurrencyExchangeRate,
    nativeToUsdExchangeRate,
  });
  const {
    amount: amountMax,
    valueInCurrency: valueInCurrencyMax,
    usd: usdMax,
  } = calcTotalGasFee({
    bridgeQuote,
    feePerGasInDecGwei: maxFeePerGasInDecGwei,
    priorityFeePerGasInDecGwei: maxPriorityFeePerGasInDecGwei,
    nativeToDisplayCurrencyExchangeRate,
    nativeToUsdExchangeRate,
  });
  return {
    amount,
    amountMax,
    valueInCurrency,
    valueInCurrencyMax,
    usd,
    usdMax,
  };
};

export const calcTotalEstimatedNetworkFee = (
  gasFee: ReturnType<typeof calcEstimatedAndMaxTotalGasFee>,
  relayerFee: ReturnType<typeof calcRelayerFee>,
) => {
  return {
    amount: new BigNumber(gasFee.amount).plus(relayerFee.amount).toString(),
    valueInCurrency: gasFee.valueInCurrency
      ? new BigNumber(gasFee.valueInCurrency)
          .plus(relayerFee.valueInCurrency || '0')
          .toString()
      : null,
    usd: gasFee.usd
      ? new BigNumber(gasFee.usd).plus(relayerFee.usd || '0').toString()
      : null,
  };
};

export const calcTotalMaxNetworkFee = (
  gasFee: ReturnType<typeof calcEstimatedAndMaxTotalGasFee>,
  relayerFee: ReturnType<typeof calcRelayerFee>,
) => {
  return {
    amount: new BigNumber(gasFee.amountMax).plus(relayerFee.amount).toString(),
    valueInCurrency: gasFee.valueInCurrencyMax
      ? new BigNumber(gasFee.valueInCurrencyMax)
          .plus(relayerFee.valueInCurrency || '0')
          .toString()
      : null,
    usd: gasFee.usdMax
      ? new BigNumber(gasFee.usdMax).plus(relayerFee.usd || '0').toString()
      : null,
  };
};

// Gas is included for some swap quotes and this is the value displayed in the client
export const calcIncludedTxFees = (
  { gasIncluded, srcAsset, feeData: { txFee } }: Quote,
  srcTokenExchangeRate: ExchangeRate,
  destTokenExchangeRate: ExchangeRate,
) => {
  if (!txFee || !gasIncluded) {
    return null;
  }
  // Use exchange rate of the token that is being used to pay for the transaction
  const { exchangeRate, usdExchangeRate } =
    txFee.asset.assetId === srcAsset.assetId
      ? srcTokenExchangeRate
      : destTokenExchangeRate;
  const normalizedTxFeeAmount = calcTokenAmount(
    txFee.amount,
    txFee.asset.decimals,
  );

  return {
    amount: normalizedTxFeeAmount.toString(),
    valueInCurrency: exchangeRate
      ? normalizedTxFeeAmount.times(exchangeRate).toString()
      : null,
    usd: usdExchangeRate
      ? normalizedTxFeeAmount.times(usdExchangeRate).toString()
      : null,
  };
};

export const calcAdjustedReturn = (
  toTokenAmount: ReturnType<typeof calcToAmount>,
  totalEstimatedNetworkFee: ReturnType<typeof calcTotalEstimatedNetworkFee>,
  { feeData: { txFee }, destAsset: { assetId: destAssetId } }: Quote,
) => {
  // If gas is included and is taken from the dest token, don't subtract network fee from return
  if (txFee?.asset?.assetId === destAssetId) {
    return {
      valueInCurrency: toTokenAmount.valueInCurrency,
      usd: toTokenAmount.usd,
    };
  }
  return {
    valueInCurrency:
      toTokenAmount.valueInCurrency && totalEstimatedNetworkFee.valueInCurrency
        ? new BigNumber(toTokenAmount.valueInCurrency)
            .minus(totalEstimatedNetworkFee.valueInCurrency)
            .toString()
        : null,
    usd:
      toTokenAmount.usd && totalEstimatedNetworkFee.usd
        ? new BigNumber(toTokenAmount.usd)
            .minus(totalEstimatedNetworkFee.usd)
            .toString()
        : null,
  };
};

export const calcSwapRate = (sentAmount: string, destTokenAmount: string) =>
  new BigNumber(destTokenAmount).div(sentAmount).toString();

export const calcCost = (
  adjustedReturn: ReturnType<typeof calcAdjustedReturn>,
  sentAmount: ReturnType<typeof calcSentAmount>,
) => ({
  valueInCurrency:
    adjustedReturn.valueInCurrency && sentAmount.valueInCurrency
      ? new BigNumber(sentAmount.valueInCurrency)
          .minus(adjustedReturn.valueInCurrency)
          .toString()
      : null,
  usd:
    adjustedReturn.usd && sentAmount.usd
      ? new BigNumber(sentAmount.usd).minus(adjustedReturn.usd).toString()
      : null,
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
      .toString();
  }

  if (cost.usd && sentAmount.usd) {
    return new BigNumber(cost.usd)
      .div(sentAmount.usd)
      .times(100)
      .abs()
      .toString();
  }

  return null;
};

export const formatEtaInMinutes = (
  estimatedProcessingTimeInSeconds: number,
) => {
  if (estimatedProcessingTimeInSeconds < 60) {
    return `< 1`;
  }
  return (estimatedProcessingTimeInSeconds / 60).toFixed();
};
