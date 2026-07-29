import { toHex } from '@metamask/controller-utils';
import { generateEIP7702BatchTransaction } from '@metamask/transaction-controller';
import type {
  TransactionMeta,
  TransactionParams,
} from '@metamask/transaction-controller';
import { createModuleLogger } from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { projectLogger } from '../../logger.js';
import type {
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types.js';
import { isRelayValidationEnabled } from '../../utils/feature-flags.js';
import {
  validateQuoteExecution,
  QuoteError,
  isQuoteError,
} from '../../utils/validation.js';
import type { QuoteSimulation } from '../../utils/validation.js';
import { getRelayExecuteRequest } from './relay-submit-execute.js';
import { getRelaySubmitCalls } from './relay-submit.js';
import type { RelayExecuteRequest, RelayQuote } from './types.js';

const log = createModuleLogger(projectLogger, 'relay-validation');

export type ValidateRelayQuotesRequest = {
  messenger: TransactionPayControllerMessenger;
  quotes: TransactionPayQuote<RelayQuote>[];
  signal?: AbortSignal;
  transaction: TransactionMeta;
};

export async function validateRelayQuotes(
  request: ValidateRelayQuotesRequest,
): Promise<void> {
  if (!isRelayValidationEnabled(request.messenger)) {
    return;
  }

  for (const quote of request.quotes) {
    if (shouldSkipValidation(quote)) {
      continue;
    }

    try {
      const { calls } = await getRelaySubmitCalls({
        messenger: request.messenger,
        quote,
        transaction: request.transaction,
      });

      const executeRequest = quote.original.metamask.isExecute
        ? await getRelayExecuteRequest({
            allParams: calls,
            messenger: request.messenger,
            quote,
            requestId: quote.original.steps[0].requestId,
            transaction: request.transaction,
          })
        : undefined;

      await validateQuoteExecution({
        messenger: request.messenger,
        quote,
        signal: request.signal,
        simulation: buildRelayValidationSimulation(
          quote,
          calls,
          executeRequest,
        ),
      });
    } catch (error) {
      if (request.signal?.aborted) {
        throw error;
      }
      throw toQuoteError(error);
    }
  }
}

function shouldSkipValidation(quote: TransactionPayQuote<RelayQuote>): boolean {
  const { request } = quote;
  return Boolean(
    request.isHyperliquidSource ?? request.isPolymarketDepositWallet ?? false,
  );
}

function toQuoteError(error: unknown): QuoteError {
  if (isQuoteError(error)) {
    return error;
  }
  return new QuoteError({
    message: 'Quote simulation failed',
    reason: 'simulation-failed',
    detail: [(error as Error).message],
  });
}

function buildRelayValidationSimulation(
  quote: TransactionPayQuote<RelayQuote>,
  calls: TransactionParams[],
  executeRequest?: Omit<RelayExecuteRequest, 'metamask'>,
): QuoteSimulation {
  const { from, sourceChainId, targetChainId } = quote.request;
  const context = { from, sourceChainId, targetChainId };

  if (executeRequest) {
    log('Building execute simulation', context);
    return buildRelayExecuteSimulation(quote, executeRequest);
  }
  if (quote.original.metamask.is7702) {
    log('Building 7702 batch simulation', context);
    return buildRelay7702BatchSimulation(quote, calls);
  }
  log('Building normal simulation', context);
  return buildRelayNormalSimulation(calls);
}

function buildRelayExecuteSimulation(
  quote: TransactionPayQuote<RelayQuote>,
  executeRequest: Omit<RelayExecuteRequest, 'metamask'>,
): QuoteSimulation {
  const { value } = executeRequest.data;
  const valueHex = new BigNumber(value).toString(16).replace(/^/u, '0x') as Hex;
  return {
    transactions: [
      {
        ...(executeRequest.data.authorizationList?.length
          ? {
              authorizationList: executeRequest.data.authorizationList.map(
                (auth) => ({ address: auth.address, from: quote.request.from }),
              ),
            }
          : {}),
        data: executeRequest.data.data,
        from: quote.request.from,
        to: executeRequest.data.to,
        value: valueHex,
      },
    ],
  };
}

function buildRelay7702BatchSimulation(
  quote: TransactionPayQuote<RelayQuote>,
  calls: TransactionParams[],
): QuoteSimulation {
  const { from } = quote.request;
  const gas = quote.original.metamask.gasLimits[0];

  const batchTx = generateEIP7702BatchTransaction(
    from,
    calls.map((params) => ({
      to: params.to as Hex,
      data: params.data as Hex,
      value: params.value as Hex,
    })),
  );

  const authList = quote.original.request.authorizationList?.length
    ? quote.original.request.authorizationList.map((auth) => ({
        address: auth.address,
        from,
      }))
    : undefined;

  return {
    transactions: [
      {
        ...(authList ? { authorizationList: authList } : {}),
        data: batchTx.data,
        from,
        ...(gas === undefined ? {} : { gas: toHex(gas) }),
        to: batchTx.to as Hex,
        value: '0x0',
      },
    ],
  };
}

function buildRelayNormalSimulation(
  calls: TransactionParams[],
): QuoteSimulation {
  return {
    transactions: calls.map((params) => ({
      data: params.data as Hex | undefined,
      from: params.from as Hex,
      gas: params.gas as Hex | undefined,
      maxFeePerGas: params.maxFeePerGas as Hex | undefined,
      maxPriorityFeePerGas: params.maxPriorityFeePerGas as Hex | undefined,
      to: params.to as Hex | undefined,
      value: params.value as Hex,
    })),
  };
}
