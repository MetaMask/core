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
      throw new TransactionPaySimulationError(responseTransaction.error);
    }
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
