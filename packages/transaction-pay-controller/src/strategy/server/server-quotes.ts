import { Interface } from '@ethersproject/abi';
import { toHex } from '@metamask/controller-utils';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { CHAIN_ID_HYPERCORE, TransactionPayStrategy } from '../../constants';
import { projectLogger } from '../../logger';
import type {
  PayStrategyGetQuotesRequest,
  QuoteRequest,
  TransactionPayControllerMessenger,
  TransactionPayFees,
  TransactionPayQuote,
} from '../../types';
import {
  getFeatureFlags,
  getSlippage,
  isEIP7702Chain,
} from '../../utils/feature-flags';
import { calculateGasCost, getGasFee } from '../../utils/gas';
import {
  getGasStationCostInSourceTokenRaw,
  getGasStationEligibility,
} from '../../utils/gas-station';
import { estimateQuoteGasLimits } from '../../utils/quote-gas';
import type { QuoteGasTransaction } from '../../utils/quote-gas';
import { getNativeToken, getTokenBalance } from '../../utils/token';
import { normalizeServerPerpsRequest } from './perps';
import { fetchServerQuote } from './server-api';
import type {
  ServerQuote,
  ServerQuoteRequest,
  ServerQuoteResult,
  ServerQuoteStep,
} from './types';
import { ServerTradeType } from './types';

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
    console.log(
      '[server-quotes] raw response',
      JSON.stringify(response, null, 2),
    );

    const fulfilledResults = response.results.filter(isFulfilledResult);

    const normalized = await Promise.all(
      fulfilledResults.map((result) =>
        normalizeQuote(result, quoteRequest, messenger),
      ),
    );

    log('Normalized quotes', normalized);
    console.log(
      '[server-quotes] normalized gasLimits',
      normalized.map((q) => q.original.client),
    );

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
    sourceChainId,
    sourceTokenAddress,
    sourceTokenAmount,
    targetAmountMinimum,
    targetChainId,
    targetTokenAddress,
  } = normalizedRequest;

  const useExactInput = (isMaxAmount ?? false) || (isPostQuote ?? false);
  const singleData = getSingleTransactionData(transaction);
  const isHypercore = targetChainId === CHAIN_ID_HYPERCORE;
  const isTokenTransfer =
    !isHypercore && Boolean(singleData?.startsWith(TOKEN_TRANSFER_FOUR_BYTE));

  let recipient = from;

  if (isTokenTransfer && singleData) {
    recipient = decodeTransferRecipient(singleData);
  }

  const supportsGasless =
    accountSupports7702 && isEIP7702Chain(messenger, sourceChainId);

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
    (isPostQuote ?? false) ||
    (isMaxAmount ?? false);

  if (!skipDelegation) {
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
      body.authorizationList = delegation.authorizationList.map((entry) => ({
        address: entry.address,
        chainId: Number(entry.chainId),
        nonce: Number(entry.nonce),
        r: entry.r as Hex,
        s: entry.s as Hex,
        yParity: Number(entry.yParity),
      }));
    }
  }

  return body;
}

function shouldRequestQuote(quoteRequest: QuoteRequest): boolean {
  return (
    quoteRequest.targetAmountMinimum !== '0' ||
    Boolean(quoteRequest.isPostQuote) ||
    Boolean(quoteRequest.isMaxAmount)
  );
}

async function normalizeQuote(
  result: FulfilledServerQuoteResult,
  quoteRequest: QuoteRequest,
  messenger: TransactionPayControllerMessenger,
): Promise<TransactionPayQuote<ServerQuote>> {
  const { quote } = result;
  const { gasless } = quote;
  const sourceNetwork = await calculateSourceNetworkCost({
    gasless,
    messenger,
    quoteRequest,
    steps: quote.steps,
  });

  return {
    dust: ZERO_FIAT_VALUE,
    estimatedDuration: quote.duration,
    fees: {
      ...(sourceNetwork.isSourceGasFeeToken
        ? { isSourceGasFeeToken: true }
        : {}),
      metaMask: ZERO_FIAT_VALUE,
      provider: {
        fiat: '0',
        usd: quote.fees.provider,
      },
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
      fiat: '0',
      human: quote.input.formatted,
      raw: quote.input.raw,
      usd: '0',
    },
    strategy: TransactionPayStrategy.Server,
    targetAmount: {
      fiat: '0',
      usd: '0',
    },
  };
}

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

async function calculateSourceNetworkCost({
  gasless,
  messenger,
  quoteRequest,
  steps,
}: {
  gasless: boolean;
  messenger: TransactionPayControllerMessenger;
  quoteRequest: QuoteRequest;
  steps: ServerQuoteStep[];
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

  if (steps.length === 0) {
    log('No quote steps; zeroing source network fees');
    return noFees;
  }

  const { from, sourceChainId, sourceTokenAddress } = quoteRequest;
  const firstStep = steps[0];
  const chainIdHex = toHex(firstStep.chainId);

  const gasFeeEstimate = getGasFee(chainIdHex, messenger);
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
  // TODO: remove — temporary 1.3x buffer to diagnose gas required exceeds allowance
  const rawGasLimits = gasResult.gasLimits.map((g) => Math.ceil(g.max * 1.3));
  const gasLimits = is7702 ? [rawGasLimits[0]] : rawGasLimits;

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
  step: ServerQuoteStep,
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
  return transaction.nestedTransactions?.length === 1
    ? transaction.nestedTransactions[0].data
    : (transaction.txParams?.data as Hex | undefined);
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
