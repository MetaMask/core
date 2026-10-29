import { toHex } from '@metamask/controller-utils';
import { generateEIP7702BatchTransaction } from '@metamask/transaction-controller';
import type {
  AuthorizationList,
  TransactionParams,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import type {
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../types.js';
import {
  isQuoteError,
  QuoteError,
  validateQuoteExecution,
} from './validation.js';
import type { QuoteSimulation } from './validation.js';

export type ValidateQuotesRequest<QuoteType> = {
  /**
   * Build the simulation for a quote, or return `undefined` to skip
   * validating it.
   */
  buildSimulation: (
    quote: TransactionPayQuote<QuoteType>,
  ) => Promise<QuoteSimulation | undefined>;
  messenger: TransactionPayControllerMessenger;
  quotes: TransactionPayQuote<QuoteType>[];
  signal?: AbortSignal;
};

/**
 * Validate each quote in turn by checking the live source balance and
 * simulating the transactions it would submit.
 *
 * @param request - Validation request.
 */
export async function validateQuotes<QuoteType>(
  request: ValidateQuotesRequest<QuoteType>,
): Promise<void> {
  const { buildSimulation, messenger, quotes, signal } = request;

  for (const quote of quotes) {
    try {
      const simulation = await buildSimulation(quote);

      if (!simulation) {
        continue;
      }

      await validateQuoteExecution({
        messenger,
        quote,
        signal,
        simulation,
      });
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }

      const quoteError = toQuoteError(error);

      if (quoteError.info.reason === 'insufficient-source-balance') {
        // Backwards compatibility: keep the entire quote batch (including
        // quotes that may have passed or not yet been validated) so that
        // clients can still show quote details alongside the balance error.
        throw new QuoteError(quoteError.info, quotes);
      }

      throw quoteError;
    }
  }
}

/**
 * Build a simulation of a single delegation transaction, such as one redeemed
 * by a gasless execute endpoint.
 *
 * @param options - Build options.
 * @param options.authorizationList - EIP-7702 authorizations to apply.
 * @param options.data - Transaction data.
 * @param options.from - Sender address.
 * @param options.to - Transaction recipient.
 * @param options.value - Transaction value.
 * @returns The simulation.
 */
export function buildDelegationSimulation({
  authorizationList,
  data,
  from,
  to,
  value,
}: {
  authorizationList?: Pick<AuthorizationList[number], 'address'>[];
  data: Hex;
  from: Hex;
  to: Hex;
  value: Hex;
}): QuoteSimulation {
  return {
    transactions: [
      {
        ...(authorizationList?.length
          ? {
              authorizationList: authorizationList.map(({ address }) => ({
                address,
                from,
              })),
            }
          : {}),
        data,
        from,
        to,
        value,
      },
    ],
  };
}

/**
 * Build a simulation of calls submitted as a single EIP-7702 batch from the
 * sender's own account.
 *
 * @param options - Build options.
 * @param options.authorizationAddress - Delegator address used to upgrade the
 * account for the simulation.
 * @param options.calls - Calls in the batch.
 * @param options.from - Sender address.
 * @param options.gas - Optional gas limit for the batch.
 * @returns The simulation.
 */
export function build7702BatchSimulation({
  authorizationAddress,
  calls,
  from,
  gas,
}: {
  authorizationAddress?: Hex;
  calls: TransactionParams[];
  from: Hex;
  gas?: number;
}): QuoteSimulation {
  const batchTx = generateEIP7702BatchTransaction(
    from,
    calls.map((params) => ({
      to: params.to as Hex,
      data: params.data as Hex,
      value: params.value as Hex,
    })),
  );

  return {
    transactions: [
      {
        ...(authorizationAddress
          ? { authorizationList: [{ address: authorizationAddress, from }] }
          : {}),
        data: batchTx.data,
        from,
        ...(gas === undefined || gas === 0 ? {} : { gas: toHex(gas) }),
        to: batchTx.to,
        value: '0x0',
      },
    ],
  };
}

/**
 * Build a simulation of calls submitted as individual transactions.
 *
 * @param calls - Transactions to simulate.
 * @returns The simulation.
 */
export function buildCallsSimulation(
  calls: TransactionParams[],
): QuoteSimulation {
  return {
    transactions: calls.map((params) => {
      const gas = params.gas as Hex | undefined;

      return {
        data: params.data as Hex | undefined,
        from: params.from as Hex,
        ...(gas === undefined || new BigNumber(gas).isZero() ? {} : { gas }),
        maxFeePerGas: params.maxFeePerGas as Hex | undefined,
        maxPriorityFeePerGas: params.maxPriorityFeePerGas as Hex | undefined,
        to: params.to as Hex | undefined,
        value: params.value as Hex,
      };
    }),
  };
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
