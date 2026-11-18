import { toHex } from '@metamask/controller-utils';
import { SentinelChainNotSupportedError } from '@metamask/sentinel-api-service';
import type {
  SentinelSimulationRequest,
  SentinelSimulationResponseTransaction,
  SentinelSimulationTransaction,
} from '@metamask/sentinel-api-service';
import { generateEIP7702BatchTransaction } from '@metamask/transaction-controller';
import type {
  AuthorizationList,
  TransactionParams,
} from '@metamask/transaction-controller';
import { createModuleLogger } from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { projectLogger } from '../logger.js';
import type { TransactionPayControllerMessenger } from '../types.js';

export type { SentinelSimulationTransaction };

const log = createModuleLogger(projectLogger, 'simulation');

/**
 * The generic revert message returned by Sentinel when a transaction reverts
 * without a decoded reason. The `execution reverted` text is implied, so it is
 * replaced with the revert return data (if any) when surfaced to consumers.
 */
const EXECUTION_REVERTED_ERROR = 'execution reverted';

export type SimulationTransaction = SentinelSimulationTransaction;

export type QuoteSimulation = {
  transactions: SimulationTransaction[];
};

export type SimulationRequest = {
  chainId: Hex;
  messenger: TransactionPayControllerMessenger;
  transactions: SimulationTransaction[];
};

export class TransactionPaySimulationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransactionPaySimulationError';
  }
}

export async function simulateQuoteTransactions(
  request: SimulationRequest,
): Promise<void> {
  log('Simulating quote transactions', {
    chainId: request.chainId,
    transactions: request.transactions,
  });

  let responseTransactions: SentinelSimulationResponseTransaction[];

  try {
    const response = await request.messenger.call(
      'SentinelApiService:simulateTransactions',
      request.chainId,
      {
        transactions: request.transactions,
        withLogs: true,
      },
    );

    responseTransactions = response.transactions;

    log('Sentinel simulation succeeded', { responseTransactions });
  } catch (error) {
    log('Sentinel simulation failed', { error });

    if (error instanceof SentinelChainNotSupportedError) {
      log('Skipping validation for Sentinel-unsupported chain');
      return;
    }

    throw new TransactionPaySimulationError(getErrorMessage(error));
  }

  for (const responseTransaction of responseTransactions) {
    if (responseTransaction.error) {
      throw new TransactionPaySimulationError(
        getResponseErrorMessage(responseTransaction),
      );
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

/**
 * Build a user-facing error message from a reverted simulation response
 * transaction.
 *
 * The implied `execution reverted` prefix is always stripped. When a specific
 * reason follows the prefix (for example `execution reverted: insufficient
 * allowance`), that reason is surfaced directly. When the message is only
 * `execution reverted`, the revert return data is used instead: non-empty
 * return data becomes `Custom Error - <return>`, while an empty return
 * (`0x`) becomes `Reverted - Unknown Error`. Any error that does not start
 * with the prefix is returned unchanged.
 *
 * @param responseTransaction - The reverted simulation response transaction.
 * @returns The error message to throw.
 */
function getResponseErrorMessage(
  responseTransaction: SentinelSimulationResponseTransaction,
): string {
  const { error, return: returnData } = responseTransaction;
  const message = error as string;

  if (!message.startsWith(EXECUTION_REVERTED_ERROR)) {
    return message;
  }

  const reason = message
    .slice(EXECUTION_REVERTED_ERROR.length)
    .replace(/^:\s*/u, '')
    .trim();

  if (reason.length) {
    return reason;
  }

  if (returnData && returnData !== '0x') {
    return `Custom Error - ${returnData}`;
  }

  return 'Reverted - Unknown Error';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
