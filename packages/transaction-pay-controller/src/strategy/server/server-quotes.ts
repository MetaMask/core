import { Interface } from '@ethersproject/abi';
import { toHex } from '@metamask/controller-utils';
import type {
  AuthorizationList,
  TransactionMeta,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import {
  CHAIN_ID_HYPERCORE,
  PaymentOverride,
  TransactionPayStrategy,
} from '../../constants.js';
import { projectLogger } from '../../logger.js';
import type {
  PayStrategyGetQuotesRequest,
  QuoteRequest,
  TransactionPayControllerMessenger,
  TransactionPayFees,
  TransactionPayQuote,
} from '../../types.js';
import { getFiatValueFromUsd } from '../../utils/amounts.js';
import {
  getFeatureFlags,
  getSlippage,
  isEIP7702Chain,
} from '../../utils/feature-flags.js';
import {
  getGasStationCostInSourceTokenRaw,
  getGasStationEligibility,
} from '../../utils/gas-station.js';
import { calculateGasCost, getGasFee } from '../../utils/gas.js';
import { estimateQuoteGasLimits } from '../../utils/quote-gas.js';
import type { QuoteGasTransaction } from '../../utils/quote-gas.js';
import {
  getNativeToken,
  getTokenBalance,
  getTokenFiatRate,
} from '../../utils/token.js';
import { normalizeServerPerpsRequest } from './perps.js';
import { fetchServerQuote } from './server-api.js';
import type {
  ServerQuote,
  ServerQuoteRequest,
  ServerQuoteResult,
  ServerTransactionStep,
} from './types.js';
import { ServerTradeType } from './types.js';

const log = createModuleLogger(projectLogger, 'server-quotes');
const TOKEN_TRANSFER_FOUR_BYTE = '0xa9059cbb';
const TRANSFER_INTERFACE = new Interface([
  'function transfer(address to, uint256 amount)',
]);
const ZERO_AMOUNT = { fiat: '0', human: '0', raw: '0', usd: '0' };
const ZERO_FIAT_VALUE = { fiat: '0', usd: '0' };

type FulfilledServerQuoteResult = ServerQuoteResult & {
  quote: NonNullable<ServerQuoteResult['quote']>;
};

type SourceNetworkCost = Pick<
  TransactionPayFees['sourceNetwork'],
  'estimate' | 'max'
> & {
  gasLimits: number[];
  is7702: boolean;
  isSourceGasFeeToken?: boolean;
  maxFeePerGas: string | undefined;
  maxPriorityFeePerGas: string | undefined;
};

function isTransactionStep(
  step: ServerQuote['steps'][number],
): step is ServerTransactionStep {
  return step.type === 'transaction';
}

/**
 * Fetch server intents-api quotes and normalize them into Transaction Pay quotes.
 *
 * @param request - Quote request context.
 * @returns Normalized server strategy quotes.
 */
export async function getServerQuotes(
  request: PayStrategyGetQuotesRequest,
): Promise<TransactionPayQuote<ServerQuote>[]> {
  const quoteRequests = request.requests.filter(shouldRequestQuote);

  log('Fetching quotes', { quoteRequests });

  const quotes = await Promise.all(
    quoteRequests.map((quoteRequest) =>
      getQuotesForRequest(quoteRequest, request),
    ),
  );

  return quotes.flat();
}

async function getQuotesForRequest(
  quoteRequest: QuoteRequest,
  fullRequest: PayStrategyGetQuotesRequest,
): Promise<TransactionPayQuote<ServerQuote>[]> {
  const { accountSupports7702, messenger, signal, transaction } = fullRequest;

  const body = await buildServerQuoteRequest(
    quoteRequest,
    transaction,
    messenger,
    accountSupports7702,
  );

  try {
    log('Request body', body);

    const response = await fetchServerQuote(messenger, body, signal);

    log('Raw quote response', response);

    const fulfilledResults = response.results.filter(isFulfilledResult);

    const normalized = await Promise.all(
      fulfilledResults.map((result) =>
        normalizeQuote(result, quoteRequest, messenger),
      ),
    );

    log('Normalized quotes', normalized);

    return normalized;
  } catch (error) {
    log('Error fetching quotes', { error });
    return [];
  }
}

async function buildServerQuoteRequest(
  quoteRequest: QuoteRequest,
  transaction: TransactionMeta,
  messenger: TransactionPayControllerMessenger,
  accountSupports7702: boolean,
): Promise<ServerQuoteRequest> {
  const normalizedRequest = normalizeServerPerpsRequest(
    quoteRequest,
    transaction,
  );
  const {
    from,
    isMaxAmount,
    isPostQuote,
    paymentOverride,
    sourceChainId,
    sourceTokenAddress,
    sourceTokenAmount,
    targetAmountMinimum,
    targetChainId,
    targetTokenAddress,
  } = normalizedRequest;

  const useExactInput =
    (isMaxAmount ?? false) ||
    (isPostQuote ?? false) ||
    Boolean(normalizedRequest.isHyperliquidSource);
  const singleData = getSingleTransactionData(transaction);
  const isHypercore = targetChainId === CHAIN_ID_HYPERCORE;
  const isTokenTransfer =
    !isHypercore && Boolean(singleData?.startsWith(TOKEN_TRANSFER_FOUR_BYTE));

  let recipient = from;

  if (isTokenTransfer && singleData) {
    recipient = decodeTransferRecipient(singleData);
  }

  const isHypercoreSource = sourceChainId === CHAIN_ID_HYPERCORE;
  const supportsGasless =
    !isHypercoreSource &&
    accountSupports7702 &&
    isEIP7702Chain(messenger, sourceChainId);

  const body: ServerQuoteRequest = {
    source: { chainId: Number(sourceChainId), token: sourceTokenAddress },
    target: { chainId: Number(targetChainId), token: targetTokenAddress },
    amount: useExactInput ? sourceTokenAmount : targetAmountMinimum,
    tradeType: useExactInput
      ? ServerTradeType.ExactInput
      : ServerTradeType.ExpectedOutput,
    sender: from,
    recipient,
    slippage: Math.round(
      getSlippage(messenger, sourceChainId, sourceTokenAddress) * 10000,
    ),
    supportsGasless,
  };

  const hasNoData = singleData === undefined || singleData === '0x';
  const skipDelegation =
    hasNoData ||
    isTokenTransfer ||
    isHypercore ||
    isHypercoreSource ||
    (isPostQuote ?? false) ||
    (isMaxAmount ?? false);

  if (isPostQuote && paymentOverride === PaymentOverride.MoneyAccount) {
    await processMoneyAccountPostQuote(
      transaction,
      normalizedRequest,
      body,
      messenger,
    );
  } else if (!skipDelegation) {
    const delegation = await messenger.call(
      'TransactionPayController:getDelegationTransaction',
      { transaction },
    );

    body.calls = [
      {
        data: buildTransferData(from, targetAmountMinimum),
        to: targetTokenAddress,
        value: '0x0',
      },
      {
        data: delegation.data,
        to: delegation.to,
        value: delegation.value,
      },
    ];

    if (delegation.authorizationList?.length) {
      body.authorizationList = normalizeAuthorizationList(
        delegation.authorizationList,
      );
    }
  }

  return body;
}

function normalizeAuthorizationList(
  authorizationList: AuthorizationList,
): NonNullable<ServerQuoteRequest['authorizationList']> {
  return authorizationList.map((entry) => ({
    address: entry.address,
    chainId: Number(entry.chainId),
    nonce: Number(entry.nonce),
    r: entry.r as Hex,
    s: entry.s as Hex,
    yParity: Number(entry.yParity),
  }));
}

async function processMoneyAccountPostQuote(
  transaction: TransactionMeta,
  request: QuoteRequest,
  body: ServerQuoteRequest,
  messenger: TransactionPayControllerMessenger,
): Promise<void> {
  const { transactionData: transactionDataList } = messenger.call(
    'TransactionPayController:getState',
  );

  const transactionData = transactionDataList[transaction.id];
  const amountHuman = transactionData?.tokens?.[0]?.amountHuman ?? '0';

  const {
    calls: overrideCalls,
    recipient,
    authorizationList,
  } = await messenger.call('TransactionPayController:getPaymentOverrideData', {
    amount: amountHuman,
    transaction,
    transactionData,
  });

  if (!overrideCalls.length) {
    log('No payment override calls for money account post-quote');
    return;
  }

  const fundingRecipient = recipient ?? request.from;

  body.tradeType = ServerTradeType.ExactInput;
  body.amount = request.sourceTokenAmount;

  body.calls = [
    {
      data: buildTransferData(fundingRecipient, request.sourceTokenAmount),
      to: request.targetTokenAddress,
      value: '0x0',
    },
    ...overrideCalls.map((call) => ({
      data: call.data as Hex,
      to: call.to as Hex,
      value: call.value ?? '0x0',
    })),
  ];

  if (authorizationList?.length) {
    body.authorizationList = normalizeAuthorizationList(authorizationList);
  }

  log('Added money account post-quote calls to server quote body', {
    callCount: overrideCalls.length,
  });
}

function shouldRequestQuote(quoteRequest: QuoteRequest): boolean {
  return (
    quoteRequest.targetAmountMinimum !== '0' ||
    Boolean(quoteRequest.isPostQuote) ||
    Boolean(quoteRequest.isMaxAmount) ||
    Boolean(quoteRequest.isHyperliquidSource)
  );
}

async function normalizeQuote(
  result: FulfilledServerQuoteResult,
  quoteRequest: QuoteRequest,
  messenger: TransactionPayControllerMessenger,
): Promise<TransactionPayQuote<ServerQuote>> {
  const { quote } = result;
  const { gasless } = quote;
  const transactionSteps = quote.steps.filter(isTransactionStep);
  const isSignatureOnly = transactionSteps.length === 0;
  const sourceNetwork = await calculateSourceNetworkCost({
    gasless: gasless || isSignatureOnly,
    messenger,
    quoteRequest,
    steps: transactionSteps,
  });

  const sourceFiatRate = getTokenFiatRate(
    messenger,
    quoteRequest.sourceTokenAddress,
    quoteRequest.sourceChainId,
  );

  const usdToFiatRate = sourceFiatRate
    ? new BigNumber(sourceFiatRate.fiatRate).dividedBy(sourceFiatRate.usdRate)
    : new BigNumber(1);

  const metaMask = getFiatValueFromUsd(
    new BigNumber(quote.fees.metamask),
    usdToFiatRate,
  );

  const provider = getFiatValueFromUsd(
    new BigNumber(quote.fees.provider),
    usdToFiatRate,
  );

  return {
    dust: ZERO_FIAT_VALUE,
    estimatedDuration: quote.duration,
    fees: {
      ...(sourceNetwork.isSourceGasFeeToken
        ? { isSourceGasFeeToken: true }
        : {}),
      metaMask,
      provider,
      sourceNetwork: {
        estimate: sourceNetwork.estimate,
        max: sourceNetwork.max,
      },
      targetNetwork: ZERO_FIAT_VALUE,
    },
    original: {
      client: {
        gasLimits: sourceNetwork.gasLimits,
        is7702: sourceNetwork.is7702,
        maxFeePerGas: sourceNetwork.maxFeePerGas,
        maxPriorityFeePerGas: sourceNetwork.maxPriorityFeePerGas,
      },
      duration: quote.duration,
      fees: quote.fees,
      gasless,
      id: quote.id,
      input: quote.input,
      output: quote.output,
      provider: result.provider,
      steps: quote.steps,
    },
    request: quoteRequest,
    sourceAmount: {
      fiat: sourceFiatRate
        ? new BigNumber(quote.input.formatted)
            .multipliedBy(sourceFiatRate.fiatRate)
            .toString(10)
        : '0',
      human: quote.input.formatted,
      raw: quote.input.raw,
      usd: sourceFiatRate
        ? new BigNumber(quote.input.formatted)
            .multipliedBy(sourceFiatRate.usdRate)
            .toString(10)
        : '0',
    },
    strategy: TransactionPayStrategy.Server,
    targetAmount: {
      fiat: '0',
      usd: '0',
    },
  };
}

async function calculateSourceNetworkCost({
  gasless,
  messenger,
  quoteRequest,
  steps,
}: {
  gasless: boolean;
  messenger: TransactionPayControllerMessenger;
  quoteRequest: QuoteRequest;
  steps: ServerTransactionStep[];
}): Promise<SourceNetworkCost> {
  const noFees = {
    estimate: ZERO_AMOUNT,
    gasLimits: [],
    is7702: false,
    max: ZERO_AMOUNT,
    maxFeePerGas: undefined,
    maxPriorityFeePerGas: undefined,
  };

  if (gasless) {
    log('Zeroing source network fees for gasless quote');
    return noFees;
  }

  const { from, sourceChainId, sourceTokenAddress } = quoteRequest;
  const firstStep = steps[0];
  const chainIdHex = toHex(firstStep.chainId);

  const needsGasFeeEstimate =
    !firstStep.maxFeePerGas && !firstStep.maxPriorityFeePerGas;

  const gasFeeEstimate = needsGasFeeEstimate
    ? getGasFee(chainIdHex, messenger)
    : { maxFeePerGas: undefined, maxPriorityFeePerGas: undefined };

  const maxFeePerGas = firstStep.maxFeePerGas ?? gasFeeEstimate.maxFeePerGas;
  const maxPriorityFeePerGas =
    firstStep.maxPriorityFeePerGas ?? gasFeeEstimate.maxPriorityFeePerGas;

  const gasTransactions = steps.map((step) => stepToGasTransaction(step, from));

  const gasResult = await estimateQuoteGasLimits({
    fallbackGas: getFeatureFlags(messenger).relayFallbackGas,
    fallbackOnSimulationFailure: true,
    messenger,
    transactions: gasTransactions,
  });

  const { is7702 } = gasResult;
  const gasLimits = is7702
    ? [gasResult.gasLimits[0].max]
    : gasResult.gasLimits.map((gasLimit) => gasLimit.max);

  const estimate = calculateGasCost({
    chainId: chainIdHex,
    gas: gasResult.totalGasEstimate,
    maxFeePerGas: maxFeePerGas ?? '0',
    maxPriorityFeePerGas: maxPriorityFeePerGas ?? '0',
    messenger,
  });

  const max = calculateGasCost({
    chainId: chainIdHex,
    gas: gasResult.totalGasLimit,
    isMax: true,
    maxFeePerGas: maxFeePerGas ?? '0',
    maxPriorityFeePerGas: maxPriorityFeePerGas ?? '0',
    messenger,
  });

  const nativeBalance = getTokenBalance(
    messenger,
    from,
    sourceChainId,
    getNativeToken(sourceChainId),
  );

  const fees = { maxFeePerGas, maxPriorityFeePerGas };

  if (new BigNumber(nativeBalance).isGreaterThanOrEqualTo(max.raw)) {
    return { estimate, gasLimits, is7702, max, ...fees };
  }

  const eligibility = getGasStationEligibility(messenger, sourceChainId);

  if (eligibility.isDisabledChain || !eligibility.chainSupportsGasStation) {
    log('Skipping gas station for source network', {
      isDisabledChain: eligibility.isDisabledChain,
      sourceChainId,
      supportsGasStation: eligibility.chainSupportsGasStation,
    });
    return { estimate, gasLimits, is7702, max, ...fees };
  }

  log('Checking gas fee tokens due to insufficient native balance', {
    max: max.raw,
    nativeBalance,
  });

  const gasFeeTokenCost = await getGasStationCostInSourceTokenRaw({
    firstStepData: {
      data: firstStep.data,
      to: firstStep.to,
      value: firstStep.value as Hex,
    },
    messenger,
    request: {
      from,
      sourceChainId,
      sourceTokenAddress,
    },
    totalGasEstimate: gasResult.totalGasEstimate,
    totalItemCount: steps.length,
  });

  if (!gasFeeTokenCost) {
    return { estimate, gasLimits, is7702, max, ...fees };
  }

  log('Using gas fee token for source network', { gasFeeTokenCost });

  return {
    estimate: gasFeeTokenCost,
    gasLimits,
    is7702,
    isSourceGasFeeToken: true,
    max: gasFeeTokenCost,
    ...fees,
  };
}

function stepToGasTransaction(
  step: ServerTransactionStep,
  from: Hex,
): QuoteGasTransaction {
  return {
    chainId: toHex(step.chainId),
    data: step.data,
    from,
    to: step.to,
    value: step.value,
  };
}

function getSingleTransactionData(
  transaction: TransactionMeta,
): Hex | undefined {
  for (const nested of transaction.nestedTransactions ?? []) {
    if (nested.data && nested.data !== '0x') {
      return nested.data;
    }
  }

  return transaction.txParams?.data as Hex | undefined;
}

function isFulfilledResult(
  result: ServerQuoteResult,
): result is FulfilledServerQuoteResult {
  return (
    result.quote?.id !== undefined &&
    result.quote.input !== undefined &&
    result.quote.output !== undefined
  );
}

function decodeTransferRecipient(data: Hex): Hex {
  return TRANSFER_INTERFACE.decodeFunctionData(
    'transfer',
    data,
  ).to.toLowerCase() as Hex;
}

function buildTransferData(recipient: Hex, amountRaw: string): Hex {
  return TRANSFER_INTERFACE.encodeFunctionData('transfer', [
    recipient,
    amountRaw,
  ]) as Hex;
}
