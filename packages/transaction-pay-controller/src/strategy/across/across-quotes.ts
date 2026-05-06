import { successfulFetch, toHex } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { TransactionPayStrategy } from '../../constants';
import { projectLogger } from '../../logger';
import type {
  Amount,
  FiatRates,
  PayStrategyGetQuotesRequest,
  QuoteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import { getFiatValueFromUsd, sumAmounts } from '../../utils/amounts';
import { getPayStrategiesConfig, getSlippage } from '../../utils/feature-flags';
import { calculateGasCost } from '../../utils/gas';
import {
  getGasStationCostInSourceTokenRaw,
  getGasStationEligibility,
} from '../../utils/gas-station';
import { estimateQuoteGasLimits } from '../../utils/quote-gas';
import {
  getNativeToken,
  getTokenBalance,
  getTokenFiatRate,
} from '../../utils/token';
import { getAcrossDestination } from './across-actions';
import { normalizeAcrossRequest } from './perps';
import { isAcrossQuoteRequest } from './requests';
import { getAcrossOrderedTransactions } from './transactions';
import type {
  AcrossAction,
  AcrossActionRequestBody,
  AcrossGasLimits,
  AcrossQuote,
  AcrossSwapApprovalResponse,
} from './types';

const log = createModuleLogger(projectLogger, 'across-strategy');

const UNSUPPORTED_AUTHORIZATION_LIST_ERROR =
  'Across does not support type-4/EIP-7702 authorization lists yet';

type AcrossQuoteWithoutMetaMask = Omit<AcrossQuote, 'metamask'>;

/**
 * Fetch Across quotes.
 *
 * @param request - Request object.
 * @returns Array of quotes.
 */
export async function getAcrossQuotes(
  request: PayStrategyGetQuotesRequest,
): Promise<TransactionPayQuote<AcrossQuote>[]> {
  const { requests } = request;

  log('Fetching quotes', requests);

  try {
    const normalizedRequests = requests.filter(isAcrossQuoteRequest);

    if (normalizedRequests.length === 0) {
      return [];
    }

    if (request.transaction.txParams?.authorizationList?.length) {
      throw new Error(UNSUPPORTED_AUTHORIZATION_LIST_ERROR);
    }

    return await Promise.all(
      normalizedRequests.map((singleRequest) =>
        getQuoteWithGasStationHandling(singleRequest, request),
      ),
    );
  } catch (error) {
    log('Error fetching quotes', { error });
    throw new Error(`Failed to fetch Across quotes: ${String(error)}`);
  }
}

async function getSingleQuote(
  request: QuoteRequest,
  fullRequest: PayStrategyGetQuotesRequest,
): Promise<TransactionPayQuote<AcrossQuote>> {
  const { messenger, signal, transaction } = fullRequest;
  const normalizedRequest = normalizeAcrossRequest(request, transaction.type);
  const {
    from,
    isMaxAmount,
    sourceChainId,
    sourceTokenAddress,
    sourceTokenAmount,
    targetAmountMinimum,
    targetChainId,
    targetTokenAddress,
  } = normalizedRequest;

  const config = getPayStrategiesConfig(messenger);
  const slippageDecimal = getSlippage(
    messenger,
    sourceChainId,
    sourceTokenAddress,
  );

  const amount = isMaxAmount ? sourceTokenAmount : targetAmountMinimum;
  const tradeType = isMaxAmount ? 'exactInput' : 'exactOutput';
  const destination = getAcrossDestination(transaction, request);
  const quote = await requestAcrossApproval({
    actions: destination.actions,
    amount,
    apiBase: config.across.apiBase,
    depositor: from,
    destinationChainId: targetChainId,
    inputToken: sourceTokenAddress,
    originChainId: sourceChainId,
    outputToken: targetTokenAddress,
    recipient: destination.recipient,
    signal,
    slippage: slippageDecimal,
    tradeType,
  });

  const originalQuote: AcrossQuoteWithoutMetaMask = {
    quote,
    request: {
      amount,
      tradeType,
    },
  };

  return await normalizeQuote(originalQuote, normalizedRequest, fullRequest);
}

async function getQuoteWithGasStationHandling(
  request: QuoteRequest,
  fullRequest: PayStrategyGetQuotesRequest,
): Promise<TransactionPayQuote<AcrossQuote>> {
  const phase1Quote = await getSingleQuote(request, fullRequest);

  if (!request.isMaxAmount || !phase1Quote.fees.isSourceGasFeeToken) {
    return phase1Quote;
  }

  const adjustedSourceAmount = new BigNumber(request.sourceTokenAmount)
    .minus(phase1Quote.fees.sourceNetwork.max.raw)
    .integerValue(BigNumber.ROUND_DOWN);

  if (!adjustedSourceAmount.isGreaterThan(0)) {
    log('Insufficient balance after gas subtraction for Across max quote');
    return phase1Quote;
  }

  log('Subtracting gas from source for Across max quote', {
    adjustedSourceAmount: adjustedSourceAmount.toString(10),
    gasCostRaw: phase1Quote.fees.sourceNetwork.max.raw,
    originalSourceAmount: request.sourceTokenAmount,
  });

  try {
    const phase2Quote = await getSingleQuote(
      {
        ...request,
        sourceTokenAmount: adjustedSourceAmount.toFixed(
          0,
          BigNumber.ROUND_DOWN,
        ),
      },
      fullRequest,
    );

    if (!phase2Quote.fees.isSourceGasFeeToken) {
      log('Across max phase 2 lost gas fee token eligibility');
      return phase1Quote;
    }

    const phase2GasCost = new BigNumber(phase2Quote.fees.sourceNetwork.max.raw);

    if (
      adjustedSourceAmount
        .plus(phase2GasCost)
        .isGreaterThan(request.sourceTokenAmount)
    ) {
      log('Across max phase 2 quote exceeds original source amount', {
        adjustedSourceAmount: adjustedSourceAmount.toString(10),
        gasCostRaw: phase2GasCost.toString(10),
        originalSourceAmount: request.sourceTokenAmount,
      });
      return phase1Quote;
    }

    return phase2Quote;
  } catch (error) {
    log('Across max phase 2 quote failed, falling back to phase 1', { error });
    return phase1Quote;
  }
}

type AcrossApprovalRequest = {
  actions: AcrossAction[];
  amount: string;
  apiBase: string;
  depositor: Hex;
  destinationChainId: Hex;
  inputToken: Hex;
  originChainId: Hex;
  outputToken: Hex;
  recipient: Hex;
  signal?: AbortSignal;
  slippage?: number;
  tradeType: 'exactInput' | 'exactOutput';
};

async function requestAcrossApproval(
  request: AcrossApprovalRequest,
): Promise<AcrossSwapApprovalResponse> {
  const {
    actions,
    amount,
    apiBase,
    depositor,
    destinationChainId,
    inputToken,
    originChainId,
    outputToken,
    recipient,
    signal,
    slippage,
    tradeType,
  } = request;

  const params = new URLSearchParams();
  params.set('tradeType', tradeType);
  params.set('amount', amount);
  params.set('inputToken', inputToken);
  params.set('outputToken', outputToken);
  params.set('originChainId', String(parseInt(originChainId, 16)));
  params.set('destinationChainId', String(parseInt(destinationChainId, 16)));
  params.set('depositor', depositor);
  params.set('recipient', recipient);

  if (slippage !== undefined) {
    params.set('slippage', String(slippage));
  }

  const body: AcrossActionRequestBody = { actions };
  const url = `${apiBase}/swap/approval?${params.toString()}`;
  const options: RequestInit = {
    body: JSON.stringify(body),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    method: 'POST',
    signal,
  };
  const response = await successfulFetch(url, options);

  return (await response.json()) as AcrossSwapApprovalResponse;
}

async function normalizeQuote(
  original: AcrossQuoteWithoutMetaMask,
  request: QuoteRequest,
  fullRequest: PayStrategyGetQuotesRequest,
): Promise<TransactionPayQuote<AcrossQuote>> {
  const { messenger } = fullRequest;
  const { quote } = original;

  const { usdToFiatRate, sourceFiatRate, targetFiatRate } = getFiatRates(
    messenger,
    quote,
  );

  const dustUsd = calculateDustUsd(quote, request, targetFiatRate);
  const dust = getFiatValueFromUsd(dustUsd, usdToFiatRate);

  const {
    gasLimits,
    is7702,
    isGasFeeToken: isSourceGasFeeToken,
    requiresAuthorizationList,
    sourceNetwork,
  } = await calculateSourceNetworkCost(quote, messenger, request);

  const targetNetwork = getFiatValueFromUsd(new BigNumber(0), usdToFiatRate);

  const inputAmountRaw = quote.inputAmount ?? '0';
  const outputAmountRaw = new BigNumber(
    quote.expectedOutputAmount ??
      quote.minOutputAmount ??
      request.targetAmountMinimum ??
      '0',
  ).toString(10);

  const sourceAmount = getAmountFromTokenAmount({
    amountRaw: inputAmountRaw,
    decimals: quote.inputToken.decimals,
    fiatRate: sourceFiatRate,
  });

  const providerUsd = calculateProviderUsd(
    quote,
    inputAmountRaw,
    sourceFiatRate,
    targetFiatRate,
    quote.expectedOutputAmount,
  );
  const provider = getFiatValueFromUsd(providerUsd, usdToFiatRate);
  const metaMaskFee = getFiatValueFromUsd(
    new BigNumber(quote.fees?.app?.amountUsd ?? '0').abs(),
    usdToFiatRate,
  );

  const targetAmount = getAmountFromTokenAmount({
    amountRaw: outputAmountRaw,
    decimals: quote.outputToken.decimals,
    fiatRate: targetFiatRate,
  });

  const metamask = {
    gasLimits,
    is7702,
    ...(requiresAuthorizationList ? { requiresAuthorizationList } : {}),
  };

  return {
    dust,
    estimatedDuration: quote.expectedFillTime ?? 0,
    fees: {
      isSourceGasFeeToken,
      metaMask: metaMaskFee,
      provider,
      sourceNetwork,
      targetNetwork,
    },
    original: {
      ...original,
      metamask,
    },
    request,
    sourceAmount,
    targetAmount,
    strategy: TransactionPayStrategy.Across,
  } as TransactionPayQuote<AcrossQuote>;
}

function getFiatRates(
  messenger: TransactionPayControllerMessenger,
  quote: AcrossSwapApprovalResponse,
): {
  sourceFiatRate: FiatRates;
  targetFiatRate: FiatRates;
  usdToFiatRate: BigNumber;
} {
  const sourceFiatRate = getTokenFiatRate(
    messenger,
    quote.inputToken.address,
    toHex(quote.inputToken.chainId),
  );

  if (!sourceFiatRate) {
    throw new Error('Source token fiat rate not found');
  }

  const targetFiatRate =
    getTokenFiatRate(
      messenger,
      quote.outputToken.address,
      toHex(quote.outputToken.chainId),
    ) ?? sourceFiatRate;

  const usdToFiatRate = new BigNumber(sourceFiatRate.fiatRate).dividedBy(
    sourceFiatRate.usdRate,
  );

  return { sourceFiatRate, targetFiatRate, usdToFiatRate };
}

function calculateDustUsd(
  quote: AcrossSwapApprovalResponse,
  request: QuoteRequest,
  targetFiatRate: FiatRates,
): BigNumber {
  const expectedOutputRaw = quote.expectedOutputAmount;

  if (expectedOutputRaw === undefined) {
    return new BigNumber(0);
  }

  const expectedOutput = new BigNumber(expectedOutputRaw);
  const minimumOutput = new BigNumber(
    quote.minOutputAmount ?? request.targetAmountMinimum ?? '0',
  );

  const dustRaw = expectedOutput.minus(minimumOutput).isNegative()
    ? new BigNumber(0)
    : expectedOutput.minus(minimumOutput);
  const dustHuman = dustRaw.shiftedBy(-quote.outputToken.decimals);

  return dustHuman.multipliedBy(targetFiatRate.usdRate);
}

function calculateProviderUsd(
  quote: AcrossSwapApprovalResponse,
  inputAmountRaw: string,
  sourceFiatRate: FiatRates,
  targetFiatRate: FiatRates,
  expectedOutputRaw?: string,
): BigNumber {
  const totalFeeUsd = quote.fees?.total?.amountUsd;

  if (totalFeeUsd !== undefined) {
    return new BigNumber(totalFeeUsd).abs();
  }

  if (expectedOutputRaw === undefined) {
    return new BigNumber(0);
  }

  const expectedOutput = new BigNumber(expectedOutputRaw);

  if (expectedOutput.lte(0)) {
    return new BigNumber(0);
  }

  const inputAmountUsd = new BigNumber(inputAmountRaw)
    .shiftedBy(-quote.inputToken.decimals)
    .multipliedBy(sourceFiatRate.usdRate);
  const expectedOutputUsd = expectedOutput
    .shiftedBy(-quote.outputToken.decimals)
    .multipliedBy(targetFiatRate.usdRate);
  const providerFeeUsd = inputAmountUsd.minus(expectedOutputUsd);

  return providerFeeUsd.isNegative() ? new BigNumber(0) : providerFeeUsd;
}

function getAmountFromTokenAmount({
  amountRaw,
  decimals,
  fiatRate,
}: {
  amountRaw: string;
  decimals: number;
  fiatRate: FiatRates;
}): Amount {
  const rawValue = new BigNumber(amountRaw);
  const raw = rawValue.toString(10);

  const humanValue = rawValue.shiftedBy(-decimals);
  const human = humanValue.toString(10);

  const usd = humanValue.multipliedBy(fiatRate.usdRate).toString(10);
  const fiat = humanValue.multipliedBy(fiatRate.fiatRate).toString(10);

  return {
    fiat,
    human,
    raw,
    usd,
  };
}

async function calculateSourceNetworkCost(
  quote: AcrossSwapApprovalResponse,
  messenger: TransactionPayControllerMessenger,
  request: QuoteRequest,
): Promise<{
  sourceNetwork: TransactionPayQuote<AcrossQuote>['fees']['sourceNetwork'];
  gasLimits: AcrossGasLimits;
  isGasFeeToken?: boolean;
  is7702: boolean;
  requiresAuthorizationList?: true;
}> {
  const acrossFallbackGas =
    getPayStrategiesConfig(messenger).across.fallbackGas;
  const { from, sourceChainId, sourceTokenAddress } = request;
  const orderedTransactions = getAcrossOrderedTransactions({ quote });
  const { swapTx } = quote;
  const swapChainId = toHex(swapTx.chainId);
  const gasEstimates = await estimateQuoteGasLimits({
    fallbackGas: acrossFallbackGas,
    messenger,
    transactions: orderedTransactions.map((transaction) => ({
      chainId: toHex(transaction.chainId),
      data: transaction.data,
      from,
      gas: transaction.gas,
      to: transaction.to,
      value: transaction.value ?? '0x0',
    })),
  });
  const { batchGasLimit, is7702, requiresAuthorizationList, totalGasEstimate } =
    gasEstimates;

  let sourceNetwork: TransactionPayQuote<AcrossQuote>['fees']['sourceNetwork'];
  let gasLimits: AcrossGasLimits;

  if (is7702) {
    if (!batchGasLimit) {
      throw new Error('Across combined batch gas estimate missing');
    }

    const estimate = calculateGasCost({
      chainId: swapChainId,
      gas: batchGasLimit.estimate,
      maxFeePerGas: swapTx.maxFeePerGas,
      maxPriorityFeePerGas: swapTx.maxPriorityFeePerGas,
      messenger,
    });
    const max = calculateGasCost({
      chainId: swapChainId,
      gas: batchGasLimit.max,
      isMax: true,
      maxFeePerGas: swapTx.maxFeePerGas,
      maxPriorityFeePerGas: swapTx.maxPriorityFeePerGas,
      messenger,
    });

    sourceNetwork = {
      estimate,
      max,
    };
    gasLimits = [
      {
        estimate: batchGasLimit.estimate,
        max: batchGasLimit.max,
      },
    ];
  } else {
    const transactionGasLimits = orderedTransactions.map(
      (transaction, index) => ({
        gasEstimate: gasEstimates.gasLimits[index],
        transaction,
      }),
    );

    const estimate = sumAmounts(
      transactionGasLimits.map(({ gasEstimate, transaction }) =>
        calculateGasCost({
          chainId: toHex(transaction.chainId),
          gas: gasEstimate.estimate,
          maxFeePerGas: transaction.maxFeePerGas,
          maxPriorityFeePerGas: transaction.maxPriorityFeePerGas,
          messenger,
        }),
      ),
    );

    const max = sumAmounts(
      transactionGasLimits.map(({ gasEstimate, transaction }) =>
        calculateGasCost({
          chainId: toHex(transaction.chainId),
          gas: gasEstimate.max,
          isMax: true,
          maxFeePerGas: transaction.maxFeePerGas,
          maxPriorityFeePerGas: transaction.maxPriorityFeePerGas,
          messenger,
        }),
      ),
    );

    sourceNetwork = {
      estimate,
      max,
    };
    gasLimits = transactionGasLimits.map(({ gasEstimate }) => ({
      estimate: gasEstimate.estimate,
      max: gasEstimate.max,
    }));
  }

  const result = {
    sourceNetwork,
    is7702,
    ...(requiresAuthorizationList ? { requiresAuthorizationList } : {}),
    gasLimits,
  };

  const nativeBalance = getTokenBalance(
    messenger,
    from,
    sourceChainId,
    getNativeToken(sourceChainId),
  );

  if (
    new BigNumber(nativeBalance).isGreaterThanOrEqualTo(sourceNetwork.max.raw)
  ) {
    return result;
  }

  const gasStationEligibility = getGasStationEligibility(
    messenger,
    sourceChainId,
  );

  if (gasStationEligibility.isDisabledChain) {
    log('Skipping Across gas station as disabled chain', { sourceChainId });
    return result;
  }

  if (!gasStationEligibility.chainSupportsGasStation) {
    log('Skipping Across gas station as chain does not support EIP-7702', {
      sourceChainId,
    });
    return result;
  }

  const firstTransaction = orderedTransactions[0];

  const gasFeeTokenCost = await getGasStationCostInSourceTokenRaw({
    firstStepData: {
      data: firstTransaction.data,
      to: firstTransaction.to,
      value: firstTransaction.value,
    },
    messenger,
    request: {
      from,
      sourceChainId,
      sourceTokenAddress,
    },
    totalGasEstimate,
    totalItemCount: Math.max(orderedTransactions.length, gasLimits.length),
  });

  if (!gasFeeTokenCost) {
    return result;
  }

  log('Using gas fee token for Across source network', {
    gasFeeTokenCost,
  });

  return {
    isGasFeeToken: true,
    sourceNetwork: {
      estimate: gasFeeTokenCost,
      max: gasFeeTokenCost,
    },
    is7702,
    ...(requiresAuthorizationList ? { requiresAuthorizationList } : {}),
    gasLimits,
  };
}
