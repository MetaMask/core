import type { TransactionMeta } from '@metamask/transaction-controller';

import type {
  PayStrategyCheckQuoteSupportRequest,
  PayStrategyQuoteSupportResult,
  TransactionPayQuote,
} from '../../types';
import type { QuoteValidationSimulation } from '../../utils/validation';
import {
  isQuoteValidationError,
  QuoteValidationError,
  validateQuoteExecution,
} from '../../utils/validation';
import { getRelaySubmitCalls } from './relay-submit';
import type { RelayExecuteRequest, RelayQuote } from './types';

export { QuoteValidationError as RelayQuoteValidationError };

export async function validateRelayQuoteSupport(
  request: PayStrategyCheckQuoteSupportRequest<RelayQuote>,
): Promise<PayStrategyQuoteSupportResult> {
  for (const quote of request.quotes) {
    if (shouldSkipValidation(quote)) {
      continue;
    }

    try {
      const simulation = await buildRelayValidationSimulation({
        messenger: request.messenger,
        quote,
        transaction: request.transaction,
      });

      await validateQuoteExecution({
        messenger: request.messenger,
        quote,
        signal: request.signal,
        simulation,
      });
    } catch (error) {
      if (request.signal?.aborted) {
        throw error;
      }

      return {
        isSupported: false,
        validationError: getValidationError(error),
      };
    }
  }

  return { isSupported: true };
}

async function buildRelayValidationSimulation({
  messenger,
  quote,
  transaction,
}: {
  messenger: PayStrategyCheckQuoteSupportRequest<RelayQuote>['messenger'];
  quote: TransactionPayQuote<RelayQuote>;
  transaction: TransactionMeta;
}): Promise<QuoteValidationSimulation> {
  const submitCalls = await getRelaySubmitCalls({
    messenger,
    quote,
    transaction,
  });

  if (submitCalls.executeRequest) {
    validateAuthorizationList(submitCalls.executeRequest);
  }

  return submitCalls.getValidationSimulation();
}

function validateAuthorizationList(executeRequest: RelayExecuteRequest): void {
  for (const authorization of executeRequest.data.authorizationList ?? []) {
    if (
      authorization.address === undefined ||
      authorization.chainId === undefined ||
      authorization.nonce === undefined ||
      authorization.r === undefined ||
      authorization.s === undefined ||
      authorization.yParity === undefined
    ) {
      throw new QuoteValidationError(
        'Relay execute authorization list is incomplete',
      );
    }
  }
}

function shouldSkipValidation(quote: TransactionPayQuote<RelayQuote>): boolean {
  const { request } = quote;

  return Boolean(
    request.isHyperliquidSource ?? request.isPolymarketDepositWallet ?? false,
  );
}

function getValidationError(error: unknown): string {
  if (isQuoteValidationError(error)) {
    return error.validationError;
  }

  return (error as Error).message;
}
