import { BigNumber } from '@ethersproject/bignumber';
import {
  convertHexToDecimal,
  toHex,
  weiHexToGweiDec,
} from '@metamask/controller-utils';

import { isNativeAddress } from './bridge';
import type {
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
  const divisor = BigNumber.from(10).pow(decimals ?? 0);
  return BigNumber.from(value.toString()).div(divisor);
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
  nativeToDisplayCurrencyExchangeRate?: number,
  nativeToUsdExchangeRate?: number,
) => {
  const { solanaFeesInLamports } = bridgeQuote;
  const solanaFeeInNative = calcTokenAmount(solanaFeesInLamports ?? '0', 9);
  return {
    amount: solanaFeeInNative.toString(),
    valueInCurrency: nativeToDisplayCurrencyExchangeRate
      ? solanaFeeInNative.mul(nativeToDisplayCurrencyExchangeRate).toString()
      : null,
    usd: nativeToUsdExchangeRate
      ? solanaFeeInNative.mul(nativeToUsdExchangeRate).toString()
      : null,
  };
};

export const calcToAmount = (
  { destTokenAmount, destAsset }: Quote,
  exchangeRate: string | null,
  usdExchangeRate: string | null,
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
  exchangeRate: string | null,
  usdExchangeRate: string | null,
) => {
  const normalizedSentAmount = calcTokenAmount(
    BigNumber.from(srcTokenAmount).add(feeData.metabridge.amount),
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
  nativeToDisplayCurrencyExchangeRate: string | null,
  nativeToUsdExchangeRate: string | null,
) => {
  const {
    quote: { srcAsset, srcTokenAmount, feeData },
    trade,
  } = bridgeQuote;
  const relayerFeeInNative = calcTokenAmount(
    BigNumber.from(convertHexToDecimal(trade.value)).sub(
      isNativeAddress(srcAsset.address)
        ? BigNumber.from(srcTokenAmount).add(feeData.metabridge.amount)
        : 0,
    ),
    18,
  );
  return {
    amount: relayerFeeInNative.toString(),
    valueInCurrency: nativeToDisplayCurrencyExchangeRate
      ? relayerFeeInNative.mul(nativeToDisplayCurrencyExchangeRate).toString()
      : null,
    usd: nativeToUsdExchangeRate
      ? relayerFeeInNative.mul(nativeToUsdExchangeRate).toString()
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
  nativeToDisplayCurrencyExchangeRate?: number;
  nativeToUsdExchangeRate?: number;
}) => {
  const { approval, trade, l1GasFeesInHexWei } = bridgeQuote;

  const totalGasLimitInDec = BigNumber.from(
    trade.gasLimit?.toString() ?? '0',
  ).add(approval?.gasLimit?.toString() ?? '0');

  const totalFeePerGasInDecGwei = BigNumber.from(feePerGasInDecGwei).add(
    priorityFeePerGasInDecGwei,
  );
  const l1GasFeesInDecGWei = weiHexToGweiDec(toHex(l1GasFeesInHexWei ?? '0'));
  const gasFeesInDecGwei = totalGasLimitInDec
    .mul(totalFeePerGasInDecGwei)
    .add(l1GasFeesInDecGWei);
  const gasFeesInDecEth = BigNumber.from(gasFeesInDecGwei.shl(9));

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
  nativeToDisplayCurrencyExchangeRate,
  nativeToUsdExchangeRate,
}: {
  bridgeQuote: QuoteResponse & L1GasFees;
  estimatedBaseFeeInDecGwei: string;
  maxFeePerGasInDecGwei: string;
  maxPriorityFeePerGasInDecGwei: string;
  nativeToDisplayCurrencyExchangeRate?: number;
  nativeToUsdExchangeRate?: number;
}) => {
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
    amount: BigNumber.from(gasFee.amount).add(relayerFee.amount).toString(),
    valueInCurrency: gasFee.valueInCurrency
      ? BigNumber.from(gasFee.valueInCurrency)
          .add(relayerFee.valueInCurrency || '0')
          .toString()
      : null,
    usd: gasFee.usd
      ? BigNumber.from(gasFee.usd)
          .add(relayerFee.usd || '0')
          .toString()
      : null,
  };
};

export const calcTotalMaxNetworkFee = (
  gasFee: ReturnType<typeof calcEstimatedAndMaxTotalGasFee>,
  relayerFee: ReturnType<typeof calcRelayerFee>,
) => {
  return {
    amount: BigNumber.from(gasFee.amountMax).add(relayerFee.amount).toString(),
    valueInCurrency: gasFee.valueInCurrencyMax
      ? BigNumber.from(gasFee.valueInCurrencyMax)
          .add(relayerFee.valueInCurrency || '0')
          .toString()
      : null,
    usd: gasFee.usdMax
      ? BigNumber.from(gasFee.usdMax)
          .add(relayerFee.usd || '0')
          .toString()
      : null,
  };
};

export const calcAdjustedReturn = (
  toTokenAmount: ReturnType<typeof calcToAmount>,
  totalEstimatedNetworkFee: ReturnType<typeof calcTotalEstimatedNetworkFee>,
) => ({
  valueInCurrency:
    toTokenAmount.valueInCurrency && totalEstimatedNetworkFee.valueInCurrency
      ? BigNumber.from(toTokenAmount.valueInCurrency)
          .sub(totalEstimatedNetworkFee.valueInCurrency)
          .toString()
      : null,
  usd:
    toTokenAmount.usd && totalEstimatedNetworkFee.usd
      ? BigNumber.from(toTokenAmount.usd)
          .sub(totalEstimatedNetworkFee.usd)
          .toString()
      : null,
});

export const calcSwapRate = (sentAmount: string, destTokenAmount: string) =>
  BigNumber.from(destTokenAmount).div(sentAmount).toString();

export const calcCost = (
  adjustedReturn: ReturnType<typeof calcAdjustedReturn>,
  sentAmount: ReturnType<typeof calcSentAmount>,
) => ({
  valueInCurrency:
    adjustedReturn.valueInCurrency && sentAmount.valueInCurrency
      ? BigNumber.from(sentAmount.valueInCurrency)
          .sub(adjustedReturn.valueInCurrency)
          .toString()
      : null,
  usd:
    adjustedReturn.usd && sentAmount.usd
      ? BigNumber.from(sentAmount.usd).sub(adjustedReturn.usd).toString()
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
