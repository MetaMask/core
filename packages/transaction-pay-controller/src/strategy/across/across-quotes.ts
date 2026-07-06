import { successfulFetch, toHex } from '@metamask/controller-utils';
import type { TransactionMeta } from '@metamask/transaction-controller';
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
import type { QuoteGasTransaction } from '../../utils/quote-gas';
import {
  getNativeToken,
  getTokenBalance,
  getTokenFiatRate,
} from '../../utils/token';
import { isPredictWithdrawTransaction } from '../../utils/transaction';
import type { AcrossDestination } from './across-actions';
import { getAcrossDestination } from './across-actions';
import { hasUnsupportedTransactionAuthorizationList } from './authorization-list';
import { normalizeAcrossRequest } from './perps';
import { isAcrossQuoteRequest } from './requests';
import {
  getAcrossOrderedTransactions,
  getOriginalTransactionGas,
} from './transactions';
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

    if (
      hasUnsupportedTransactionAuthorizationList(
        request.transaction,
        normalizedRequests,
      )
    ) {
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

  const useExactInput = isMaxAmount
    ? true
    : normalizedRequest.isPostQuote === true;
  const amount = useExactInput ? sourceTokenAmount : targetAmountMinimum;
  const tradeType = useExactInput ? 'exactInput' : 'exactOutput';
  const destination = getAcrossDestinationForRequest(
    transaction,
    request,
    from,
  );

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
    refundAddress: normalizedRequest.refundTo,
    slippage: slippageDecimal,
    tradeType,
  });

  const originalQuote: AcrossQuoteWithoutMetaMask = {
    quote,
    request: {
      actions: destination.actions,
      amount,
      tradeType,
    },
  };

  return await normalizeQuote(originalQuote, normalizedRequest, fullRequest);
}

function getAcrossDestinationForRequest(
  transaction: TransactionMeta,
  request: QuoteRequest,
  recipient: Hex,
): AcrossDestination {
  if (request.isPostQuote) {
    return {
      actions: [],
      recipient,
    };
  }

  return getAcrossDestination(transaction, request);
}

async function getQuoteWithGasStationHandling(
  request: QuoteRequest,
  fullRequest: PayStrategyGetQuotesRequest,
): Promise<TransactionPayQuote<AcrossQuote>> {
  // Phase 1 uses the requested source amount to discover whether Across will
  // pay source-chain gas with the source token, and what the max gas cost is.
  // Phase 2 repeats the quote with that max gas cost reserved from the source
  // amount, so execution can fund both the Across deposit and token-paid gas.
  const phase1Quote = await getSingleQuote(request, fullRequest);

  if (
    (!request.isMaxAmount && !request.isPostQuote) ||
    !phase1Quote.fees.isSourceGasFeeToken
  ) {
    return phase1Quote;
  }

  const requiresSourceGasReservation =
    request.isPostQuote === true &&
    isPredictWithdrawTransaction(fullRequest.transaction);

  const adjustedSourceAmount = new BigNumber(request.sourceTokenAmount)
    .minus(phase1Quote.fees.sourceNetwork.max.raw)
    .integerValue(BigNumber.ROUND_DOWN);

  if (!adjustedSourceAmount.isGreaterThan(0)) {
    log('Insufficient balance after gas subtraction for Across quote');
    if (requiresSourceGasReservation) {
      throw new Error(
        'Across Predict withdraw source amount cannot cover source gas fee token',
      );
    }
    return phase1Quote;
  }

  log('Subtracting gas from source for Across quote', {
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
      log('Across phase 2 lost gas fee token eligibility');
      if (requiresSourceGasReservation) {
        throw new Error(
          'Across Predict withdraw quote lost source gas fee token eligibility',
        );
      }
      return phase1Quote;
    }

    const phase2GasCost = new BigNumber(phase2Quote.fees.sourceNetwork.max.raw);

    if (
      adjustedSourceAmount
        .plus(phase2GasCost)
        .isGreaterThan(request.sourceTokenAmount)
    ) {
      log('Across phase 2 quote exceeds original source amount', {
        adjustedSourceAmount: adjustedSourceAmount.toString(10),
        gasCostRaw: phase2GasCost.toString(10),
        originalSourceAmount: request.sourceTokenAmount,
      });
      if (requiresSourceGasReservation) {
        throw new Error(
          'Across Predict withdraw source gas fee token quote exceeds source amount',
        );
      }
      return phase1Quote;
    }

    return phase2Quote;
  } catch (error) {
    log(
      requiresSourceGasReservation
        ? 'Across phase 2 quote failed after source gas reservation'
        : 'Across phase 2 quote failed, falling back to phase 1',
      { error },
    );
    if (requiresSourceGasReservation) {
      throw error;
    }
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
  refundAddress?: Hex;
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
    refundAddress,
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

  if (refundAddress !== undefined) {
    params.set('refundAddress', refundAddress);
  }

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
  } = await calculateSourceNetworkCost(
    quote,
    messenger,
    request,
    fullRequest.transaction,
    fullRequest.accountSupports7702,
  );

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
  transaction: TransactionMeta,
  accountSupports7702: boolean,
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
  const isPredictWithdraw =
    request.isPostQuote === true && isPredictWithdrawTransaction(transaction);
  const relaxPrefundedSourceEstimate =
    isPredictWithdraw &&
    new BigNumber(request.sourceTokenAmount).gt(request.sourceBalanceRaw);
  const gasEstimateTransactions = orderedTransactions.map(
    (orderedTransaction) => ({
      chainId: toHex(orderedTransaction.chainId),
      data: orderedTransaction.data,
      from,
      gas: orderedTransaction.gas,
      to: orderedTransaction.to,
      value: orderedTransaction.value ?? '0x0',
    }),
  );

  const gasEstimates = await estimateAcrossQuoteGasLimits({
    fallbackGas: acrossFallbackGas,
    fallbackOnSimulationFailure: relaxPrefundedSourceEstimate,
    messenger,
    transactions: gasEstimateTransactions,
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
      (orderedTransaction, index) => ({
        gasEstimate: gasEstimates.gasLimits[index],
        orderedTransaction,
      }),
    );

    const estimate = sumAmounts(
      transactionGasLimits.map(({ gasEstimate, orderedTransaction }) =>
        calculateGasCost({
          chainId: toHex(orderedTransaction.chainId),
          gas: gasEstimate.estimate,
          maxFeePerGas: orderedTransaction.maxFeePerGas,
          maxPriorityFeePerGas: orderedTransaction.maxPriorityFeePerGas,
          messenger,
        }),
      ),
    );

    const max = sumAmounts(
      transactionGasLimits.map(({ gasEstimate, orderedTransaction }) =>
        calculateGasCost({
          chainId: toHex(orderedTransaction.chainId),
          gas: gasEstimate.max,
          isMax: true,
          maxFeePerGas: orderedTransaction.maxFeePerGas,
          maxPriorityFeePerGas: orderedTransaction.maxPriorityFeePerGas,
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
    totalGasEstimate,
    totalGasLimit: gasEstimates.totalGasLimit,
  };

  const finalResult = request.isPostQuote
    ? combinePostQuoteGas(result, transaction, swapTx, messenger)
    : result;

  const nativeBalance = getTokenBalance(
    messenger,
    from,
    sourceChainId,
    getNativeToken(sourceChainId),
  );
  const hasNativeBalance = new BigNumber(nativeBalance).isGreaterThanOrEqualTo(
    finalResult.sourceNetwork.max.raw,
  );

  if (isPredictWithdraw && !accountSupports7702) {
    return finalResult;
  }

  if (hasNativeBalance && !isPredictWithdraw) {
    return finalResult;
  }

  const gasStationEligibility = getGasStationEligibility(
    messenger,
    sourceChainId,
  );

  if (gasStationEligibility.isDisabledChain) {
    log('Skipping Across gas station as disabled chain', { sourceChainId });
    return finalResult;
  }

  if (!gasStationEligibility.chainSupportsGasStation) {
    log('Skipping Across gas station as chain does not support EIP-7702', {
      sourceChainId,
    });
    return finalResult;
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
    totalGasEstimate: finalResult.totalGasEstimate,
    totalItemCount: Math.max(
      orderedTransactions.length + (request.isPostQuote ? 1 : 0),
      finalResult.gasLimits.length,
    ),
  });

  let gasFeeTokenNetwork:
    | TransactionPayQuote<AcrossQuote>['fees']['sourceNetwork']
    | undefined;

  if (gasFeeTokenCost) {
    gasFeeTokenNetwork = {
      estimate: gasFeeTokenCost,
      max: gasFeeTokenCost,
    };
  } else if (isPredictWithdraw) {
    gasFeeTokenNetwork = calculateSourceGasFeeTokenNetworkFallback({
      messenger,
      nativeSourceNetwork: finalResult.sourceNetwork,
      quote,
      request,
    });
  }

  if (!gasFeeTokenNetwork) {
    return finalResult;
  }

  log('Using gas fee token for Across source network', {
    gasFeeTokenCost: gasFeeTokenNetwork.max,
  });

  return {
    isGasFeeToken: true,
    sourceNetwork: gasFeeTokenNetwork,
    is7702: finalResult.is7702,
    ...(requiresAuthorizationList ? { requiresAuthorizationList } : {}),
    gasLimits: finalResult.gasLimits,
  };
}

function calculateSourceGasFeeTokenNetworkFallback({
  messenger,
  nativeSourceNetwork,
  quote,
  request,
}: {
  messenger: TransactionPayControllerMessenger;
  nativeSourceNetwork: TransactionPayQuote<AcrossQuote>['fees']['sourceNetwork'];
  quote: AcrossSwapApprovalResponse;
  request: QuoteRequest;
}): TransactionPayQuote<AcrossQuote>['fees']['sourceNetwork'] | undefined {
  const sourceFiatRate = getTokenFiatRate(
    messenger,
    request.sourceTokenAddress,
    request.sourceChainId,
  );

  if (!sourceFiatRate) {
    return undefined;
  }

  const estimate = calculateSourceGasFeeTokenAmountFallback({
    decimals: quote.inputToken.decimals,
    fiatRate: sourceFiatRate,
    nativeGasCost: nativeSourceNetwork.estimate,
  });
  const max = calculateSourceGasFeeTokenAmountFallback({
    decimals: quote.inputToken.decimals,
    fiatRate: sourceFiatRate,
    nativeGasCost: nativeSourceNetwork.max,
  });

  if (!estimate || !max) {
    return undefined;
  }

  return { estimate, max };
}

function calculateSourceGasFeeTokenAmountFallback({
  decimals,
  fiatRate,
  nativeGasCost,
}: {
  decimals: number;
  fiatRate: FiatRates;
  nativeGasCost: Amount;
}): Amount | undefined {
  const usdRate = new BigNumber(fiatRate.usdRate);
  const nativeGasUsd = new BigNumber(nativeGasCost.usd);

  if (
    !usdRate.isFinite() ||
    !usdRate.isGreaterThan(0) ||
    !nativeGasUsd.isFinite() ||
    !nativeGasUsd.isGreaterThan(0)
  ) {
    return undefined;
  }

  const amountRaw = nativeGasUsd
    .dividedBy(usdRate)
    .shiftedBy(decimals)
    .integerValue(BigNumber.ROUND_CEIL)
    .toFixed(0);

  return getAmountFromTokenAmount({
    amountRaw,
    decimals,
    fiatRate,
  });
}

async function estimateAcrossQuoteGasLimits({
  fallbackGas,
  fallbackOnSimulationFailure,
  messenger,
  transactions,
}: {
  fallbackGas?: {
    estimate: number;
    max: number;
  };
  fallbackOnSimulationFailure: boolean;
  messenger: TransactionPayControllerMessenger;
  transactions: QuoteGasTransaction[];
}): Promise<Awaited<ReturnType<typeof estimateQuoteGasLimits>>> {
  try {
    const gasEstimates = await estimateQuoteGasLimits({
      fallbackGas,
      fallbackOnSimulationFailure,
      messenger,
      transactions,
    });

    if (
      fallbackOnSimulationFailure &&
      fallbackGas !== undefined &&
      gasEstimates.is7702 &&
      gasEstimates.batchGasLimit !== undefined &&
      gasEstimates.batchGasLimit.max > fallbackGas.max
    ) {
      // Prefunded Predict withdraws can produce inflated 7702 batch estimates
      // because the source account does not yet hold the funds. Keep the gas
      // reservation bounded by the configured Across fallback for this path.
      return {
        ...gasEstimates,
        batchGasLimit: fallbackGas,
        gasLimits: [fallbackGas],
        totalGasEstimate: fallbackGas.estimate,
        totalGasLimit: fallbackGas.max,
      };
    }

    return gasEstimates;
  } catch (error) {
    if (!fallbackOnSimulationFailure || transactions.length <= 1) {
      throw error;
    }

    const perTransactionGasEstimates = await Promise.all(
      transactions.map((transaction) =>
        estimateQuoteGasLimits({
          fallbackGas,
          fallbackOnSimulationFailure: true,
          messenger,
          transactions: [transaction],
        }),
      ),
    );
    const gasLimits = perTransactionGasEstimates.map(
      (estimate) => estimate.gasLimits[0],
    );
    const totalGasEstimate = gasLimits.reduce(
      (total, gasLimit) => total + gasLimit.estimate,
      0,
    );
    const totalGasLimit = gasLimits.reduce(
      (total, gasLimit) => total + gasLimit.max,
      0,
    );

    return {
      gasLimits,
      is7702: false,
      totalGasEstimate,
      totalGasLimit,
      usedBatch: false,
    };
  }
}

function combinePostQuoteGas(
  gasResult: {
    sourceNetwork: TransactionPayQuote<AcrossQuote>['fees']['sourceNetwork'];
    gasLimits: AcrossGasLimits;
    is7702: boolean;
    requiresAuthorizationList?: true;
    totalGasEstimate: number;
    totalGasLimit: number;
  },
  transaction: TransactionMeta,
  swapTx: AcrossSwapApprovalResponse['swapTx'],
  messenger: TransactionPayControllerMessenger,
): typeof gasResult {
  const originalTxGas = getOriginalTransactionGas(transaction);

  if (originalTxGas === undefined) {
    return gasResult;
  }

  const gasLimits = gasResult.is7702
    ? [
        {
          estimate: gasResult.gasLimits[0].estimate + originalTxGas,
          max: gasResult.gasLimits[0].max + originalTxGas,
        },
      ]
    : [
        {
          estimate: originalTxGas,
          max: originalTxGas,
        },
        ...gasResult.gasLimits,
      ];

  const totalGasEstimate = gasResult.totalGasEstimate + originalTxGas;
  const totalGasLimit = gasResult.totalGasLimit + originalTxGas;
  const originalSourceNetwork = calculateOriginalSourceNetworkCost({
    gas: originalTxGas,
    messenger,
    swapTx,
    transaction,
  });

  return {
    ...gasResult,
    sourceNetwork: {
      estimate: sumAmounts([
        gasResult.sourceNetwork.estimate,
        originalSourceNetwork.estimate,
      ]),
      max: sumAmounts([gasResult.sourceNetwork.max, originalSourceNetwork.max]),
    },
    gasLimits,
    totalGasEstimate,
    totalGasLimit,
  };
}

function calculateOriginalSourceNetworkCost({
  gas,
  messenger,
  swapTx,
  transaction,
}: {
  gas: number;
  messenger: TransactionPayControllerMessenger;
  swapTx: AcrossSwapApprovalResponse['swapTx'];
  transaction: TransactionMeta;
}): TransactionPayQuote<AcrossQuote>['fees']['sourceNetwork'] {
  const originalTransactionWithGas = transaction.nestedTransactions?.find(
    (tx) => tx.gas,
  );
  const maxFeePerGas =
    originalTransactionWithGas?.maxFeePerGas ??
    transaction.txParams.maxFeePerGas;
  const maxPriorityFeePerGas =
    originalTransactionWithGas?.maxPriorityFeePerGas ??
    transaction.txParams.maxPriorityFeePerGas;

  return {
    estimate: calculateGasCost({
      chainId: transaction.chainId ?? toHex(swapTx.chainId),
      gas,
      maxFeePerGas,
      maxPriorityFeePerGas,
      messenger,
    }),
    max: calculateGasCost({
      chainId: transaction.chainId ?? toHex(swapTx.chainId),
      gas,
      isMax: true,
      maxFeePerGas,
      maxPriorityFeePerGas,
      messenger,
    }),
  };
}
