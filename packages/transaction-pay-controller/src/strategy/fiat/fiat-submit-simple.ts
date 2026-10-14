import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../../logger.js';
import type { PayStrategyExecuteRequest, QuoteRequest } from '../../types.js';
import { getFiatMaxRateDriftPercent } from '../../utils/feature-flags.js';
import { getRelayQuotes } from '../relay/relay-quotes.js';
import { submitRelayQuotes } from '../relay/relay-submit.js';
import type { FiatQuote } from './types.js';
import { validateRelayRateDrift } from './utils.js';

const log = createModuleLogger(projectLogger, 'fiat-submit-simple');

/**
 * Submits a single EXACT_INPUT relay quote for simple deposits
 * that don't require nested calldata re-encoding or delegation.
 *
 * @param options - The submission options.
 * @param options.baseRequest - The base quote request from the original fiat quote.
 * @param options.request - The original fiat strategy execute request.
 * @param options.sourceAmountRaw - The settled source amount in atomic units.
 * @param options.transaction - The transaction metadata.
 * @returns An object containing the relay transaction hash if available.
 */
export async function submitSimpleRelay({
  baseRequest,
  request,
  sourceAmountRaw,
  transaction,
}: {
  baseRequest: QuoteRequest;
  request: PayStrategyExecuteRequest<FiatQuote>;
  sourceAmountRaw: string;
  transaction: PayStrategyExecuteRequest<FiatQuote>['transaction'];
}): Promise<{ transactionHash?: Hex }> {
  const { messenger } = request;
  const transactionId = transaction.id;

  const originalRelayQuote = request.quotes[0].original.relayQuote;

  if (!originalRelayQuote) {
    throw new Error('Missing Relay quote');
  }

  const relayRequest: QuoteRequest = {
    ...baseRequest,
    isMaxAmount: false,
    isPostQuote: true,
    skipProcessTransactions: false,
    sourceBalanceRaw: sourceAmountRaw,
    sourceTokenAmount: sourceAmountRaw,
  };

  const relayQuotes = await getRelayQuotes({
    accountSupports7702: request.accountSupports7702,
    from: baseRequest.from,
    messenger,
    requests: [relayRequest],
    transaction,
  });

  if (!relayQuotes.length) {
    throw new Error('No relay quotes returned for completed fiat order');
  }

  validateRelayRateDrift({
    originalQuote: originalRelayQuote,
    discoveryQuote: relayQuotes[0].original,
    maxRateDriftPercent: getFiatMaxRateDriftPercent(messenger),
    transactionId,
  });

  log('Submitting simple relay after fiat settlement', {
    relayQuoteCount: relayQuotes.length,
    transactionId,
  });

  return await submitRelayQuotes({
    accountSupports7702: request.accountSupports7702,
    isSmartTransaction: request.isSmartTransaction,
    messenger,
    quotes: relayQuotes,
    transaction,
  });
}
