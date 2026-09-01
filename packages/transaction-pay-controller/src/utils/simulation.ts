import { SentinelChainNotSupportedError } from '@metamask/sentinel-api-service';
import type {
  SentinelSimulationRequest,
  SentinelSimulationResponseTransaction,
  SentinelSimulationTransaction,
} from '@metamask/sentinel-api-service';
import { createModuleLogger } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

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
      } as SentinelSimulationRequest,
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
