import {
  convertHexToDecimal,
  toHex,
  weiHexToGweiDec,
} from '@metamask/controller-utils';
import { KnownCaipNamespace } from '@metamask/utils';
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { BigNumber } from 'bignumber.js';

import type {
  ExchangeRate,
  GenericQuoteRequest,
  L1GasFees,
  NonEvmFees,
} from '../types';
import type { BridgeAssetV2 } from '../validators/bridge-asset';
import { FeatureId } from '../validators/feature-flags';
import type { QuoteResponseV1 } from '../validators/quote-response';
import type { QuoteResponse } from '../validators/quote-response-v2';
import { isNativeAddress, isNonEvmChainId } from './bridge';

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
  // If bridging between different chain types or different non-EVM chains, require dest wallet address
  // Cases that need destWalletAddress:
  // 1. EVM -> non-EVM
  // 2. non-EVM -> EVM
  // 3. non-EVM -> different non-EVM (e.g., SOL -> BTC)
  // Only same-chain swaps don't need destWalletAddress
  if (
    partialRequest.destChainId &&
    partialRequest.srcChainId &&
    partialRequest.destChainId !== partialRequest.srcChainId && // Different chains
    (isNonEvmChainId(partialRequest.destChainId) ||
      isNonEvmChainId(partialRequest.srcChainId)) // At least one is non-EVM
  ) {
    stringFields.push('destWalletAddress');
    if (!partialRequest.destWalletAddress) {
      return false;
    }
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

export const isValidBatchSellQuoteRequest = (
  quoteRequests: Partial<GenericQuoteRequest>[],
  requireAmount = true,
): quoteRequests is GenericQuoteRequest[] =>
  quoteRequests.every((req) => isValidQuoteRequest(req, requireAmount));

/**
 * Generates a pseudo-unique string that identifies each quote by aggregator, bridge, and steps
 *
 * @deprecated No longer used
 *
 * @param quote - The quote to generate an identifier for
 * @returns A pseudo-unique string that identifies the quote
 */
export const getQuoteIdentifier = (quote: QuoteResponseV1['quote']) =>
  `${quote.bridgeId}-${quote.bridges[0]}-${quote.steps.length}`;

const calcTokenAmount = (value: string | BigNumber, decimals: number) => {
  const divisor = new BigNumber(10).pow(decimals ?? 0);
  return new BigNumber(value).div(divisor);
};

export const calcTokenValue = (value: string | BigNumber, decimals: number) => {
  const divisor = new BigNumber(10).pow(decimals ?? 0);
  return new BigNumber(value).times(divisor).toFixed();
};

export const calcNonEvmTotalNetworkFee = (
  bridgeQuote: QuoteResponse & NonEvmFees,
  { exchangeRate, usdExchangeRate }: ExchangeRate,
) => {
  const { nonEvmFeesInNative } = bridgeQuote;
  // Fees are now stored directly in native units (SOL, BTC) without conversion
  const feeInNative = new BigNumber(nonEvmFeesInNative ?? '0');

  return {
    amount: feeInNative.toFixed(),
    valueInCurrency: exchangeRate
      ? feeInNative.times(exchangeRate).toFixed()
      : null,
    usd: usdExchangeRate ? feeInNative.times(usdExchangeRate).toFixed() : null,
  };
};

export const calcToAmount = (
  destTokenAmount: string,
  destAsset: BridgeAssetV2,
  { exchangeRate, usdExchangeRate }: ExchangeRate,
) => {
  const normalizedDestAmount = calcTokenAmount(
    destTokenAmount,
    destAsset.decimals,
  );
  return {
    amount: normalizedDestAmount.toFixed(),
    valueInCurrency: exchangeRate
      ? normalizedDestAmount.times(exchangeRate).toFixed()
      : null,
    usd: usdExchangeRate
      ? normalizedDestAmount.times(usdExchangeRate).toFixed()
      : null,
  };
};

export const calcSentAmount = (
  {
    src: { amount: srcTokenAmount, asset: srcAsset },
    feeData,
    intent,
  }: QuoteResponse['quote'],
  { exchangeRate, usdExchangeRate }: ExchangeRate,
) => {
  // For intent-based swaps (e.g. CoW Protocol), srcTokenAmount is the total
  // fixed commitment the user makes to the protocol — the protocol fee is
  // already baked in. Adding feeData fees on top would double-count them.
  // For conventional swaps, srcTokenAmount is the net routing amount (fees
  // excluded), so the src-token fees must be added to get the wallet deduction.
  const sentAmount = intent
    ? new BigNumber(srcTokenAmount)
    : Object.values(feeData)
        .flat()
        .filter((fee) => fee?.amount && fee.asset?.assetId === srcAsset.assetId)
        .reduce(
          (acc, { amount }) => acc.plus(amount),
          new BigNumber(srcTokenAmount),
        );
  const normalizedSentAmount = calcTokenAmount(sentAmount, srcAsset.decimals);
  return {
    amount: normalizedSentAmount.toFixed(),
    valueInCurrency: exchangeRate
      ? normalizedSentAmount.times(exchangeRate).toFixed()
      : null,
    usd: usdExchangeRate
      ? normalizedSentAmount.times(usdExchangeRate).toFixed()
      : null,
  };
};

export const calcBatchFees = (
  amount: string,
  asset: BridgeAssetV2,
  { exchangeRate, usdExchangeRate }: ExchangeRate,
) => {
  const normalizedAmount = calcTokenAmount(amount, asset.decimals);

  return {
    amount,
    normalizedAmount: normalizedAmount.toFixed(),
    valueInCurrency: exchangeRate
      ? normalizedAmount.times(exchangeRate).toFixed()
      : null,
    usd: usdExchangeRate
      ? normalizedAmount.times(usdExchangeRate).toFixed()
      : null,
    asset,
  };
};

export const calcRelayerFee = (
  quoteResponse: QuoteResponse & { namespace: KnownCaipNamespace.Eip155 },
  { exchangeRate, usdExchangeRate }: ExchangeRate,
) => {
  const { quote, trade } = quoteResponse;
  const relayerFeeAmount = new BigNumber(
    convertHexToDecimal(trade.value || '0x0'),
  );
  let relayerFeeInNative = calcTokenAmount(relayerFeeAmount, 18);
  if (relayerFeeInNative.lte(0)) {
    return { amount: '0', valueInCurrency: '0', usd: '0' };
  }

  // Subtract srcAmount and other fees from trade value if srcAsset is native
  if (isNativeAddress(quote.src.asset.assetId)) {
    const sentAmountInNative = calcSentAmount(quote, {
      exchangeRate,
      usdExchangeRate,
    }).amount;
    relayerFeeInNative = relayerFeeInNative.minus(sentAmountInNative);
  }

  return {
    amount: relayerFeeInNative.toFixed(),
    valueInCurrency: exchangeRate
      ? relayerFeeInNative.times(exchangeRate).toFixed()
      : null,
    usd: usdExchangeRate
      ? relayerFeeInNative.times(usdExchangeRate).toFixed()
      : null,
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
  const totalGasLimitInDec = new BigNumber(tradeGasLimit?.toString() ?? '0')
    .plus(approvalGasLimit?.toString() ?? '0')
    .plus(resetApprovalGasLimit?.toString() ?? '0');

  const l1GasFeesInDecGWei = weiHexToGweiDec(toHex(l1GasFeesInHexWei ?? '0'));
  const gasFeesInDecGwei = totalGasLimitInDec
    .times(feePerGasInDecGwei ?? '0')
    .plus(l1GasFeesInDecGWei);
  const gasFeesInDecEth = gasFeesInDecGwei.times(new BigNumber(10).pow(-9));

  const gasFeesInDisplayCurrency = nativeToDisplayCurrencyExchangeRate
    ? gasFeesInDecEth.times(nativeToDisplayCurrencyExchangeRate.toString())
    : null;
  const gasFeesInUSD = nativeToUsdExchangeRate
    ? gasFeesInDecEth.times(nativeToUsdExchangeRate.toString())
    : null;

  return {
    amount: gasFeesInDecEth.toFixed(),
    valueInCurrency: gasFeesInDisplayCurrency?.toFixed() ?? null,
    usd: gasFeesInUSD?.toFixed() ?? null,
  };
};

export const calcEstimatedAndMaxTotalGasFee = ({
  bridgeQuote: { approval, trade, l1GasFeesInHexWei, resetApproval },
  feePerGasInDecGwei,
  maxFeePerGasInDecGwei,
  exchangeRate: nativeToDisplayCurrencyExchangeRate,
  usdExchangeRate: nativeToUsdExchangeRate,
}: {
  bridgeQuote: QuoteResponse & {
    namespace: KnownCaipNamespace.Eip155;
  } & L1GasFees;
  maxFeePerGasInDecGwei?: string;
  feePerGasInDecGwei?: string;
} & ExchangeRate) => {
  // Estimated gas fees spent after receiving refunds, this is shown to the user
  const {
    amount: amountEffective,
    valueInCurrency: valueInCurrencyEffective,
    usd: usdEffective,
  } = calcTotalGasFee({
    // Fallback to gasLimit if effectiveGas is not available
    approvalGasLimit: approval?.effectiveGas ?? approval?.gasLimit,
    resetApprovalGasLimit:
      resetApproval?.effectiveGas ?? resetApproval?.gasLimit,
    tradeGasLimit: trade?.effectiveGas ?? trade?.gasLimit,
    l1GasFeesInHexWei,
    feePerGasInDecGwei,
    nativeToDisplayCurrencyExchangeRate,
    nativeToUsdExchangeRate,
  });

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

  // Max gas fee (high), used to disable submission of the transaction
  const {
    amount: amountMax,
    valueInCurrency: valueInCurrencyMax,
    usd: usdMax,
  } = calcTotalGasFee({
    approvalGasLimit: approval?.gasLimit,
    resetApprovalGasLimit: resetApproval?.gasLimit,
    tradeGasLimit: trade?.gasLimit,
    l1GasFeesInHexWei,
    feePerGasInDecGwei: maxFeePerGasInDecGwei,
    nativeToDisplayCurrencyExchangeRate,
    nativeToUsdExchangeRate,
  });

  return {
    effective: {
      amount: amountEffective,
      valueInCurrency: valueInCurrencyEffective,
      usd: usdEffective,
    },
    total: {
      amount,
      valueInCurrency,
      usd,
    },
    max: {
      amount: amountMax,
      valueInCurrency: valueInCurrencyMax,
      usd: usdMax,
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
  { total: gasFeeToDisplay }: ReturnType<typeof calcEstimatedAndMaxTotalGasFee>,
  relayerFee: ReturnType<typeof calcRelayerFee>,
) => {
  return {
    amount: new BigNumber(gasFeeToDisplay?.amount ?? '0')
      .plus(relayerFee.amount)
      .toFixed(),
    valueInCurrency: gasFeeToDisplay?.valueInCurrency
      ? new BigNumber(gasFeeToDisplay.valueInCurrency)
          .plus(relayerFee.valueInCurrency ?? '0')
          .toFixed()
      : null,
    usd: gasFeeToDisplay?.usd
      ? new BigNumber(gasFeeToDisplay.usd).plus(relayerFee.usd ?? '0').toFixed()
      : null,
  };
};

export const calcTotalMaxNetworkFee = (
  gasFee: ReturnType<typeof calcEstimatedAndMaxTotalGasFee>,
  relayerFee: ReturnType<typeof calcRelayerFee>,
) => {
  return {
    amount: new BigNumber(gasFee.max.amount).plus(relayerFee.amount).toFixed(),
    valueInCurrency: gasFee.max.valueInCurrency
      ? new BigNumber(gasFee.max.valueInCurrency)
          .plus(relayerFee.valueInCurrency ?? '0')
          .toFixed()
      : null,
    usd: gasFee.max.usd
      ? new BigNumber(gasFee.max.usd).plus(relayerFee.usd ?? '0').toFixed()
      : null,
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
    return null;
  }
  // Use exchange rate of the token that is being used to pay for the transaction
  const { exchangeRate, usdExchangeRate } =
    txFee[0].asset.assetId === srcAsset.assetId
      ? srcTokenExchangeRate
      : destTokenExchangeRate;
  const normalizedTxFeeAmount = calcTokenAmount(
    txFee[0].amount,
    txFee[0].asset.decimals,
  );

  return {
    amount: normalizedTxFeeAmount.toFixed(),
    valueInCurrency: exchangeRate
      ? normalizedTxFeeAmount.times(exchangeRate).toFixed()
      : null,
    usd: usdExchangeRate
      ? normalizedTxFeeAmount.times(usdExchangeRate).toFixed()
      : null,
  };
};

export const calcAdjustedReturn = (
  toTokenAmount: ReturnType<typeof calcToAmount>,
  totalEstimatedNetworkFee: ReturnType<typeof calcTotalEstimatedNetworkFee>,
  {
    feeData: { txFee },
    dest: {
      asset: { assetId: destAssetId },
    },
  }: QuoteResponse['quote'],
) => {
  // If gas is included and is taken from the dest token, don't subtract network fee from return
  if (txFee?.[0]?.asset?.assetId === destAssetId) {
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
            .toFixed()
        : null,
    usd:
      toTokenAmount.usd && totalEstimatedNetworkFee.usd
        ? new BigNumber(toTokenAmount.usd)
            .minus(totalEstimatedNetworkFee.usd)
            .toFixed()
        : null,
  };
};

export const calcSwapRate = (sentAmount: string, destTokenAmount: string) =>
  new BigNumber(destTokenAmount).div(sentAmount).toFixed();

export const calcCost = (
  adjustedReturn: ReturnType<typeof calcAdjustedReturn>,
  sentAmount: ReturnType<typeof calcSentAmount>,
) => ({
  valueInCurrency:
    adjustedReturn.valueInCurrency && sentAmount.valueInCurrency
      ? new BigNumber(sentAmount.valueInCurrency)
          .minus(adjustedReturn.valueInCurrency)
          .toFixed()
      : null,
  usd:
    adjustedReturn.usd && sentAmount.usd
      ? new BigNumber(sentAmount.usd).minus(adjustedReturn.usd).toFixed()
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

export const formatEtaInMinutes = (
  estimatedProcessingTimeInSeconds: number,
) => {
  if (estimatedProcessingTimeInSeconds < 60) {
    return `< 1`;
  }
  return (estimatedProcessingTimeInSeconds / 60).toFixed();
};

export const sortQuotes = (
  quotes: QuoteResponseV1[],
  featureId: FeatureId | null,
) => {
  // Sort perps quotes by increasing estimated processing time (fastest first)
  if (featureId === FeatureId.PERPS) {
    return quotes.sort((a, b) => {
      return (
        a.estimatedProcessingTimeInSeconds - b.estimatedProcessingTimeInSeconds
      );
    });
  }
  return quotes;
};
