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

export const isQuoteExpired = (
  isQuoteGoingToRefresh: boolean,
  refreshRate: number,
  quotesLastFetchedMs?: number,
) =>
  Boolean(
    !isQuoteGoingToRefresh &&
      quotesLastFetchedMs &&
      Date.now() - quotesLastFetchedMs > refreshRate,
  );

export const calcSolanaTotalNetworkFee = (
  bridgeQuote: QuoteResponse & SolanaFees,
  { exchangeRate, usdExchangeRate }: ExchangeRate,
) => {
  const { solanaFeesInLamports } = bridgeQuote;
  const solanaFeeInNative = calcTokenAmount(solanaFeesInLamports ?? '0', 9);
  return {
    amount: solanaFeeInNative.toString(),
    valueInCurrency: exchangeRate
      ? solanaFeeInNative.mul(exchangeRate).toString()
      : null,
    usd: usdExchangeRate
      ? solanaFeeInNative.mul(usdExchangeRate).toString()
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
      ? normalizedDestAmount.mul(exchangeRate).toString()
      : null,
    usd: usdExchangeRate
      ? normalizedDestAmount.mul(usdExchangeRate).toString()
      : null,
  };
};

export const calcSentAmount = (
  { srcTokenAmount, srcAsset, feeData }: Quote,
  { exchangeRate, usdExchangeRate }: ExchangeRate,
) => {
  const normalizedSentAmount = calcTokenAmount(
    new BigNumber(srcTokenAmount).add(feeData.metabridge.amount),
    srcAsset.decimals,
  );
  return {
    amount: normalizedSentAmount.toString(),
    valueInCurrency: exchangeRate
      ? normalizedSentAmount.mul(exchangeRate).toString()
      : null,
    usd: usdExchangeRate
      ? normalizedSentAmount.mul(usdExchangeRate).toString()
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
    new BigNumber(trade.value, 16).sub(
      isNativeAddress(srcAsset.address)
        ? new BigNumber(srcTokenAmount).add(feeData.metabridge.amount)
        : 0,
    ),
    18,
  );
  return {
    amount: relayerFeeInNative.toString(),
    valueInCurrency: exchangeRate
      ? relayerFeeInNative.mul(exchangeRate).toString()
      : null,
    usd: usdExchangeRate
      ? relayerFeeInNative.mul(usdExchangeRate).toString()
      : null,
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
  ).add(approval?.gasLimit?.toString() ?? '0');

  const totalFeePerGasInDecGwei = new BigNumber(feePerGasInDecGwei).add(
    priorityFeePerGasInDecGwei,
  );
  const l1GasFeesInDecGWei = weiHexToGweiDec(toHex(l1GasFeesInHexWei ?? '0'));
  const gasFeesInDecGwei = totalGasLimitInDec
    .mul(totalFeePerGasInDecGwei)
    .add(l1GasFeesInDecGWei);
  const gasFeesInDecEth = gasFeesInDecGwei.shift(-9);

  const gasFeesInDisplayCurrency = nativeToDisplayCurrencyExchangeRate
    ? gasFeesInDecEth.mul(nativeToDisplayCurrencyExchangeRate.toString())
    : null;
  const gasFeesInUSD = nativeToUsdExchangeRate
    ? gasFeesInDecEth.mul(nativeToUsdExchangeRate.toString())
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
    amount: new BigNumber(gasFee.amount).add(relayerFee.amount).toString(),
    valueInCurrency: gasFee.valueInCurrency
      ? new BigNumber(gasFee.valueInCurrency)
          .add(relayerFee.valueInCurrency || '0')
          .toString()
      : null,
    usd: gasFee.usd
      ? new BigNumber(gasFee.usd).add(relayerFee.usd || '0').toString()
      : null,
  };
};

export const calcTotalMaxNetworkFee = (
  gasFee: ReturnType<typeof calcEstimatedAndMaxTotalGasFee>,
  relayerFee: ReturnType<typeof calcRelayerFee>,
) => {
  return {
    amount: new BigNumber(gasFee.amountMax).add(relayerFee.amount).toString(),
    valueInCurrency: gasFee.valueInCurrencyMax
      ? new BigNumber(gasFee.valueInCurrencyMax)
          .add(relayerFee.valueInCurrency || '0')
          .toString()
      : null,
    usd: gasFee.usdMax
      ? new BigNumber(gasFee.usdMax).add(relayerFee.usd || '0').toString()
      : null,
  };
};

export const calcAdjustedReturn = (
  toTokenAmount: ReturnType<typeof calcToAmount>,
  totalEstimatedNetworkFee: ReturnType<typeof calcTotalEstimatedNetworkFee>,
) => ({
  valueInCurrency:
    toTokenAmount.valueInCurrency && totalEstimatedNetworkFee.valueInCurrency
      ? new BigNumber(toTokenAmount.valueInCurrency)
          .sub(totalEstimatedNetworkFee.valueInCurrency)
          .toString()
      : null,
  usd:
    toTokenAmount.usd && totalEstimatedNetworkFee.usd
      ? new BigNumber(toTokenAmount.usd)
          .sub(totalEstimatedNetworkFee.usd)
          .toString()
      : null,
});

export const calcSwapRate = (sentAmount: string, destTokenAmount: string) =>
  new BigNumber(destTokenAmount).div(sentAmount).toString();

export const calcCost = (
  adjustedReturn: ReturnType<typeof calcAdjustedReturn>,
  sentAmount: ReturnType<typeof calcSentAmount>,
) => ({
  valueInCurrency:
    adjustedReturn.valueInCurrency && sentAmount.valueInCurrency
      ? new BigNumber(sentAmount.valueInCurrency)
          .sub(adjustedReturn.valueInCurrency)
          .toString()
      : null,
  usd:
    adjustedReturn.usd && sentAmount.usd
      ? new BigNumber(sentAmount.usd).sub(adjustedReturn.usd).toString()
      : null,
});

export const formatEtaInMinutes = (
  estimatedProcessingTimeInSeconds: number,
) => {
  if (estimatedProcessingTimeInSeconds < 60) {
    return `< 1`;
  }
  return (estimatedProcessingTimeInSeconds / 60).toFixed();
};
