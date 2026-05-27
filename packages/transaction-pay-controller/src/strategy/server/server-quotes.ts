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
  getServerProviderPriority,
  getSlippage,
  isEIP7702Chain,
} from '../../utils/feature-flags';
import { calculateGasCost } from '../../utils/gas';
import {
  getGasStationCostInSourceTokenRaw,
  getGasStationEligibility,
} from '../../utils/gas-station';
import { estimateQuoteGasLimits } from '../../utils/quote-gas';
import type { QuoteGasTransaction } from '../../utils/quote-gas';
import { getNativeToken, getTokenBalance } from '../../utils/token';
import { fetchServerQuote } from "./server-api";
import { normalizeServerPerpsRequest } from './perps';
import type {
  ServerQuote,
  ServerQuoteFees,
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
  const providerPriority = getServerProviderPriority(request.messenger);
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
): Promise<TransactionPayQuote<ServerQuote>[]> {
  const { accountSupports7702, messenger, signal, transaction } = fullRequest;
  const providerPriority = getServerProviderPriority(messenger);

  for (const provider of providerPriority) {
    const body = await buildServerQuoteRequest(
      quoteRequest,
      transaction,
      messenger,
      [provider],
      accountSupports7702,
    );

    try {
      log('Request body', body);

      const response = await fetchServerQuote(messenger, body, signal);
      const fulfilledResults = response.results.filter(isFulfilledResult);

      if (fulfilledResults.length > 0) {
        return await Promise.all(
          fulfilledResults.map((result) =>
            normalizeQuote(result, quoteRequest, messenger),
          ),
        );
      }

      log('Provider returned no fulfilled quote results', {
        error: response.results.find((result) => result.error)?.error,
        provider,
      });
    } catch (error) {
      log('Error fetching provider quote', { error, provider });
    }
  }

  return [];
}

async function buildServerQuoteRequest(
  quoteRequest: QuoteRequest,
  transaction: TransactionMeta,
  messenger: TransactionPayControllerMessenger,
  providers: ServerQuoteRequest['providers'],
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
    providers,
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
  const gasless = quote.gasless === true;
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
  steps: ServerQuoteStep[];
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
  step: ServerQuoteStep,
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
  result: ServerQuoteResult,
): result is FulfilledServerQuoteResult {
  return (
    result.quote !== undefined &&
    result.quote.id !== undefined &&
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
