import { FeatureId } from '@metamask/bridge-controller';
import type { GenericQuoteRequest } from '@metamask/bridge-controller';
import type { QuoteResponse } from '@metamask/bridge-controller';
import { toChecksumHexAddress } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';
import { orderBy } from 'lodash';

import { getTransaction } from './transaction';
import { projectLogger } from '../logger';
import type {
  BridgeQuoteRequest,
  TransactionBridgeQuote,
  TransactionData,
  TransactionPayControllerMessenger,
  UpdateTransactionDataCallback,
} from '../types';
import { calculateTotals } from './totals';

const ERROR_MESSAGE_NO_QUOTES = 'No quotes found';
const ERROR_MESSAGE_ALL_QUOTES_UNDER_MINIMUM = 'All quotes under minimum';

const log = createModuleLogger(projectLogger, 'bridge-quotes');

export type UpdateQuotesRequest = {
  messenger: TransactionPayControllerMessenger;
  transactionData: TransactionData | undefined;
  transactionId: string;
  updateTransactionData: UpdateTransactionDataCallback;
};

/**
 * Update the quotes for a specific transaction.
 *
 * @param request - Request parameters.
 */
export async function updateQuotes(request: UpdateQuotesRequest) {
  const { messenger, transactionData, transactionId, updateTransactionData } =
    request;

  const transaction = getTransaction(transactionId, messenger);

  if (!transaction || !transactionData) {
    throw new Error('Transaction not found');
  }

  const { paymentToken, sourceAmounts, tokens } = transactionData;

  if (!paymentToken || !sourceAmounts?.length) {
    throw new Error(
      'Cannot update quotes without payment token and source amounts',
    );
  }

  const bridgeRequests: BridgeQuoteRequest[] = sourceAmounts.map(
    (sourceAmount, i) => {
      const token = tokens[i];

      return {
        attemptsMax: 5,
        bufferStep: 0.04,
        bufferInitial: 0.04,
        bufferSubsequent: 0.05,
        from: transaction.txParams.from as Hex,
        slippage: 0.005,
        sourceBalanceRaw: paymentToken.balanceRaw,
        sourceTokenAmount: sourceAmount.sourceAmountRaw,
        sourceChainId: paymentToken.chainId,
        sourceTokenAddress: paymentToken.address,
        targetAmountMinimum: token.amountRaw,
        targetChainId: token.chainId,
        targetTokenAddress: token.address,
      };
    },
  );

  let quotes: TransactionBridgeQuote[] | undefined;

  try {
    quotes = await getBridgeQuotes(bridgeRequests, messenger);
  } catch (error) {
    log('Error fetching quotes', { error, transactionId });
    return;
  }

  log('Updated', { transactionId, quotes });

  updateTransactionData(transactionId, (data) => {
    data.quotes = quotes;
    data.totals = calculateTotals(quotes ?? [], data.tokens, messenger);
  });
}

/**
 * Fetch bridge quotes for multiple requests.
 *
 * @param requests - An array of bridge quote requests.
 * @param messenger - Controller messenger.
 * @returns An array of bridge quotes.
 */
async function getBridgeQuotes(
  requests: BridgeQuoteRequest[],
  messenger: TransactionPayControllerMessenger,
): Promise<TransactionBridgeQuote[] | undefined> {
  log('Fetching quotes', requests);

  if (!requests?.length) {
    return [];
  }

  const finalRequests = getFinalRequests(requests);

  const result = await Promise.all(
    finalRequests.map((request, index) =>
      getSufficientSingleBridgeQuote(request, index, messenger),
    ),
  );

  return result;
}

/**
 * Refresh a bridge quote.
 *
 * @param quote - Quote to refresh.
 * @param messenger - Controller messenger.
 * @returns The refreshed quote.
 */
export async function refreshQuote(
  quote: TransactionBridgeQuote,
  messenger: TransactionPayControllerMessenger,
): Promise<TransactionBridgeQuote> {
  const newQuote = await getSingleBridgeQuote(quote.request, messenger);

  log('Refreshed quote', { old: quote, new: newQuote });

  return newQuote;
}

/**
 * Retry fetching a single bridge quote until it meets the minimum target amount.
 *
 * @param request - Original quote request.
 * @param index - Index of the request in the array.
 * @param messenger - Controller messenger.
 * @returns The sufficient bridge quote.
 */
async function getSufficientSingleBridgeQuote(
  request: BridgeQuoteRequest,
  index: number,
  messenger: TransactionPayControllerMessenger,
): Promise<TransactionBridgeQuote> {
  const {
    attemptsMax,
    bufferInitial,
    bufferStep,
    bufferSubsequent,
    sourceBalanceRaw,
    sourceTokenAmount,
    targetTokenAddress,
  } = request;

  const sourceAmountValue = new BigNumber(sourceTokenAmount);
  const buffer = index === 0 ? bufferInitial : bufferSubsequent;
  const originalSourceAmount = sourceAmountValue.div(1 + buffer);

  let currentSourceAmount = sourceTokenAmount;

  for (let i = 0; i < attemptsMax; i++) {
    const currentRequest = {
      ...request,
      sourceTokenAmount: currentSourceAmount,
    };

    try {
      log('Attempt', {
        attempt: i + 1,
        attemptsMax,
        bufferInitial,
        bufferStep,
        currentSourceAmount,
        target: targetTokenAddress,
      });

      const result = await getSingleBridgeQuote(currentRequest, messenger);

      const dust = new BigNumber(result.quote.minDestTokenAmount)
        .minus(request.targetAmountMinimum)
        .toString(10);

      log('Found valid quote', {
        attempt: i + 1,
        target: targetTokenAddress,
        targetAmount: result.quote.minDestTokenAmount,
        goalAmount: request.targetAmountMinimum,
        dust,
        quote: result,
      });

      return result;
    } catch (error) {
      const errorMessage = (error as { message: string }).message;

      if (errorMessage !== ERROR_MESSAGE_ALL_QUOTES_UNDER_MINIMUM) {
        throw error;
      }
    }

    if (
      new BigNumber(currentSourceAmount).isGreaterThanOrEqualTo(
        sourceBalanceRaw,
      )
    ) {
      log('Reached balance limit', targetTokenAddress);
      break;
    }

    const newSourceAmount = originalSourceAmount.multipliedBy(
      1 + buffer + bufferStep * (i + 1),
    );

    currentSourceAmount = newSourceAmount.isLessThan(sourceBalanceRaw)
      ? newSourceAmount.toFixed(0)
      : sourceBalanceRaw;
  }

  log('All attempts failed', request.targetTokenAddress);

  throw new Error(ERROR_MESSAGE_ALL_QUOTES_UNDER_MINIMUM);
}

/**
 * Fetch a single bridge quote.
 *
 * @param request - Quote request parameters.
 * @param messenger - Controller messenger.
 * @returns The bridge quote.
 */
async function getSingleBridgeQuote(
  request: BridgeQuoteRequest,
  messenger: TransactionPayControllerMessenger,
): Promise<TransactionBridgeQuote> {
  const {
    from,
    slippage,
    sourceChainId,
    sourceTokenAddress,
    sourceTokenAmount,
    targetChainId,
    targetTokenAddress,
  } = request;

  const quoteRequest: GenericQuoteRequest = {
    destChainId: targetChainId,
    destTokenAddress: toChecksumHexAddress(targetTokenAddress),
    destWalletAddress: from,
    gasIncluded: false,
    gasIncluded7702: false,
    insufficientBal: false,
    slippage: slippage * 100,
    srcChainId: sourceChainId,
    srcTokenAddress: toChecksumHexAddress(sourceTokenAddress),
    srcTokenAmount: sourceTokenAmount,
    walletAddress: from,
  };

  const quotes = await messenger.call(
    'BridgeController:fetchQuotes',
    quoteRequest,
  );

  if (!quotes.length) {
    throw new Error(ERROR_MESSAGE_NO_QUOTES);
  }

  return getBestQuote(quotes, request);
}

/**
 * Select the best quote from a list of quotes.
 *
 * @param quotes - List of quotes.
 * @param request - Original quote request.
 * @returns The best quote.
 */
function getBestQuote(
  quotes: QuoteResponse[],
  request: BridgeQuoteRequest,
): TransactionBridgeQuote {
  const fastestQuotes = orderBy(
    quotes,
    (quote) => quote.estimatedProcessingTimeInSeconds,
    'asc',
  ).slice(0, 3);

  const quotesOverMinimumTarget = fastestQuotes.filter((quote) =>
    new BigNumber(quote.quote.minDestTokenAmount).isGreaterThanOrEqualTo(
      request.targetAmountMinimum,
    ),
  );

  log('Finding best quote', {
    allQuotes: quotes,
    fastestQuotes,
    quotesOverMinimumTarget,
  });

  if (!quotesOverMinimumTarget.length) {
    throw new Error(ERROR_MESSAGE_ALL_QUOTES_UNDER_MINIMUM);
  }

  const cheapestQuote = orderBy(
    quotesOverMinimumTarget,
    (quote) => BigNumber(quote.quote.minDestTokenAmount).toNumber(),
    'desc',
  )[0];

  return {
    ...cheapestQuote,
    request,
  };
}

/**
 * Get the final bridge quote requests.
 * Subtracts subsequent source amounts from the availalble balance.
 *
 * @param requests - List of bridge quote requests.
 * @returns The final bridge quote requests.
 */
function getFinalRequests(
  requests: BridgeQuoteRequest[],
): BridgeQuoteRequest[] {
  return requests.map((request, index) => {
    const isFirstRequest = index === 0;
    const attemptsMax = isFirstRequest ? request.attemptsMax : 1;

    const sourceBalanceRaw = requests
      .reduce((acc, value, j) => {
        const isSameSource =
          value.sourceTokenAddress.toLowerCase() ===
            request.sourceTokenAddress.toLowerCase() &&
          value.sourceChainId === request.sourceChainId;

        if (isFirstRequest && j > index && isSameSource) {
          return acc.minus(value.sourceTokenAmount);
        }

        return acc;
      }, new BigNumber(request.sourceBalanceRaw))
      .toFixed(0);

    return {
      ...request,
      attemptsMax,
      sourceBalanceRaw,
    };
  });
}
