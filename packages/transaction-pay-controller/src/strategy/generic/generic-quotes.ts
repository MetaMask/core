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
  getGenericProviderPriority,
  getSlippage,
} from '../../utils/feature-flags';
import { calculateGasCost } from '../../utils/gas';
import {
  getGasStationCostInSourceTokenRaw,
  getGasStationEligibility,
} from '../../utils/gas-station';
import { estimateQuoteGasLimits } from '../../utils/quote-gas';
import type { QuoteGasTransaction } from '../../utils/quote-gas';
import { getNativeToken, getTokenBalance } from '../../utils/token';
import { fetchGenericQuote } from './generic-api';
import type {
  GenericQuote,
  GenericQuoteRequest,
  GenericQuoteResult,
  GenericQuoteStep,
} from './types';
import { GenericTradeType } from './types';

const log = createModuleLogger(projectLogger, 'generic-quotes');
const TOKEN_TRANSFER_FOUR_BYTE = '0xa9059cbb';
const TRANSFER_INTERFACE = new Interface([
  'function transfer(address to, uint256 amount)',
]);
const ZERO_AMOUNT = { fiat: '0', human: '0', raw: '0', usd: '0' };
const ZERO_FIAT_VALUE = { fiat: '0', usd: '0' };

type FulfilledGenericQuoteResult = GenericQuoteResult & {
  id: string;
  input: NonNullable<GenericQuoteResult['input']>;
  output: NonNullable<GenericQuoteResult['output']>;
  status: 'fulfilled';
};

/**
 * Fetch generic intents-api quotes and normalize them into Transaction Pay quotes.
 *
 * @param request - Quote request context.
 * @returns Normalized generic strategy quotes.
 */
export async function getGenericQuotes(
  request: PayStrategyGetQuotesRequest,
): Promise<TransactionPayQuote<GenericQuote>[]> {
  const providerPriority = getGenericProviderPriority(request.messenger);
  const quoteRequests = request.requests.filter(shouldRequestQuote);

  log('Fetching quotes', { providerPriority, quoteRequests });

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
): Promise<TransactionPayQuote<GenericQuote>[]> {
  const { messenger, signal, transaction } = fullRequest;
  const providerPriority = getGenericProviderPriority(messenger);

  for (const provider of providerPriority) {
    const body = await buildGenericQuoteRequest(
      quoteRequest,
      transaction,
      messenger,
      provider,
    );

    try {
      log('Request body', body);

      const response = await fetchGenericQuote(messenger, body, signal);
      const fulfilledResults = response.results.filter(isFulfilledResult);

      if (fulfilledResults.length > 0) {
        return await Promise.all(
          fulfilledResults.map((result) =>
            normalizeQuote(result, quoteRequest, messenger),
          ),
        );
      }

      log('Provider returned no fulfilled quote results', {
        error: response.results.find((result) => result.status === 'rejected')
          ?.error,
        provider,
      });
    } catch (error) {
      log('Error fetching provider quote', { error, provider });
    }
  }

  return [];
}

async function buildGenericQuoteRequest(
  quoteRequest: QuoteRequest,
  transaction: TransactionMeta,
  messenger: TransactionPayControllerMessenger,
  provider: GenericQuoteRequest['provider'],
): Promise<GenericQuoteRequest> {
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
  } = quoteRequest;

  const useExactInput = Boolean(
    (isMaxAmount ?? false) || (isPostQuote ?? false),
  );
  const singleData = getSingleTransactionData(transaction);
  const isHypercore = targetChainId === CHAIN_ID_HYPERCORE;
  const isTokenTransfer =
    !isHypercore && Boolean(singleData?.startsWith(TOKEN_TRANSFER_FOUR_BYTE));

  let recipient = from;

  if (isTokenTransfer && singleData) {
    recipient = decodeTransferRecipient(singleData);
  }

  const body: GenericQuoteRequest = {
    amount: useExactInput ? sourceTokenAmount : targetAmountMinimum,
    destinationChainId: Number(targetChainId),
    destinationToken: targetTokenAddress,
    originChainId: Number(sourceChainId),
    originToken: sourceTokenAddress,
    provider,
    recipient,
    sender: from,
    slippageBps: Math.round(
      getSlippage(messenger, sourceChainId, sourceTokenAddress) * 10000,
    ),
    tradeType: useExactInput
      ? GenericTradeType.ExactInput
      : GenericTradeType.ExpectedOutput,
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
  result: FulfilledGenericQuoteResult,
  quoteRequest: QuoteRequest,
  messenger: TransactionPayControllerMessenger,
): Promise<TransactionPayQuote<GenericQuote>> {
  const gasless = result.gasless === true;
  const sourceNetwork = await calculateSourceNetworkCost({
    gasless,
    messenger,
    quoteRequest,
    steps: result.steps ?? [],
  });

  return {
    dust: ZERO_FIAT_VALUE,
    estimatedDuration: result.duration ?? 0,
    fees: {
      ...(sourceNetwork.isSourceGasFeeToken
        ? { isSourceGasFeeToken: true }
        : {}),
      metaMask: ZERO_FIAT_VALUE,
      provider: {
        fiat: '0',
        usd: result.providerFeeUsd ?? '0',
      },
      sourceNetwork: {
        estimate: sourceNetwork.estimate,
        max: sourceNetwork.max,
      },
      targetNetwork: ZERO_FIAT_VALUE,
    },
    original: {
      duration: result.duration ?? 0,
      gasless,
      id: result.id,
      input: result.input,
      output: result.output,
      provider: result.provider,
      providerFeeUsd: result.providerFeeUsd,
      steps: result.steps ?? [],
    },
    request: quoteRequest,
    sourceAmount: {
      fiat: '0',
      human: result.input.formatted,
      raw: result.input.raw,
      usd: '0',
    },
    strategy: TransactionPayStrategy.Generic,
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
  isSourceGasFeeToken?: boolean;
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
  steps: GenericQuoteStep[];
}): Promise<SourceNetworkCost> {
  if (gasless) {
    log('Zeroing source network fees for gasless quote');
    return { estimate: ZERO_AMOUNT, max: ZERO_AMOUNT };
  }

  if (steps.length === 0) {
    log('No quote steps; zeroing source network fees');
    return { estimate: ZERO_AMOUNT, max: ZERO_AMOUNT };
  }

  const { from, sourceChainId, sourceTokenAddress } = quoteRequest;
  const firstStep = steps[0];
  const gasTransactions = steps.map((step) => stepToGasTransaction(step, from));

  const gasResult = await estimateQuoteGasLimits({
    fallbackGas: getFeatureFlags(messenger).relayFallbackGas,
    fallbackOnSimulationFailure: true,
    messenger,
    transactions: gasTransactions,
  });

  const chainIdHex = toHex(firstStep.chainId);

  const estimate = calculateGasCost({
    chainId: chainIdHex,
    gas: gasResult.totalGasEstimate,
    maxFeePerGas: firstStep.maxFeePerGas ?? '0',
    maxPriorityFeePerGas: firstStep.maxPriorityFeePerGas ?? '0',
    messenger,
  });

  const max = calculateGasCost({
    chainId: chainIdHex,
    gas: gasResult.totalGasLimit,
    isMax: true,
    maxFeePerGas: firstStep.maxFeePerGas ?? '0',
    maxPriorityFeePerGas: firstStep.maxPriorityFeePerGas ?? '0',
    messenger,
  });

  const nativeBalance = getTokenBalance(
    messenger,
    from,
    sourceChainId,
    getNativeToken(sourceChainId),
  );

  if (new BigNumber(nativeBalance).isGreaterThanOrEqualTo(max.raw)) {
    return { estimate, max };
  }

  const eligibility = getGasStationEligibility(messenger, sourceChainId);

  if (eligibility.isDisabledChain || !eligibility.chainSupportsGasStation) {
    log('Skipping gas station for source network', {
      isDisabledChain: eligibility.isDisabledChain,
      sourceChainId,
      supportsGasStation: eligibility.chainSupportsGasStation,
    });
    return { estimate, max };
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
    return { estimate, max };
  }

  log('Using gas fee token for source network', { gasFeeTokenCost });

  return {
    estimate: gasFeeTokenCost,
    isSourceGasFeeToken: true,
    max: gasFeeTokenCost,
  };
}

function stepToGasTransaction(
  step: GenericQuoteStep,
  from: Hex,
): QuoteGasTransaction {
  return {
    chainId: toHex(step.chainId),
    data: step.data,
    from,
    gas: step.gasLimit,
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
  result: GenericQuoteResult,
): result is FulfilledGenericQuoteResult {
  return (
    result.status === 'fulfilled' &&
    result.id !== undefined &&
    result.input !== undefined &&
    result.output !== undefined
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
