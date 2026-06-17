import { Interface } from '@ethersproject/abi';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import type { Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { createModuleLogger, projectLogger } from '../logger';
import type {
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../types';
import {
  SimulationTransaction,
  simulateQuoteTransactions,
  TransactionPaySimulationError,
} from './simulation';
import {
  getLiveTokenBalance,
  getNativeToken,
  normalizeTokenAddress,
  TokenAddressTarget,
} from './token';

const log = createModuleLogger(projectLogger, 'validation');

const erc20Interface = new Interface(abiERC20);

export type QuoteValidationSimulation = {
  mock7702From?: Hex;
  transactions: SimulationTransaction[];
};

export type QuoteValidationRequest = {
  messenger: TransactionPayControllerMessenger;
  quote: TransactionPayQuote<unknown>;
  signal?: AbortSignal;
  simulation: QuoteValidationSimulation;
};

export class QuoteValidationError extends Error {
  readonly validationError: string;

  constructor(validationError: string) {
    super(validationError);
    this.name = 'QuoteValidationError';
    this.validationError = validationError;
  }
}

export async function validateQuoteExecution({
  messenger,
  quote,
  signal,
  simulation,
}: QuoteValidationRequest): Promise<void> {
  throwIfAborted(signal);

  const liveBalance = await getLiveSourceBalance(quote, messenger);

  log('Live source balance', {
    from: quote.request.from,
    liveBalance,
    sourceChainId: quote.request.sourceChainId,
    sourceTokenAddress: quote.request.sourceTokenAddress,
  });

  throwIfAborted(signal);

  log('Checking quote source amount', {
    hasPaymentOverride: Boolean(quote.request.paymentOverride),
    isPostQuote: Boolean(quote.request.isPostQuote),
    liveBalance,
    requiredAmount: quote.sourceAmount.raw,
  });

  validateRequiredSourceAmount(quote, liveBalance);

  log('Quote source amount check passed');

  log('Checking decoded source transfers', {
    sourceChainId: quote.request.sourceChainId,
    sourceTokenAddress: quote.request.sourceTokenAddress,
    transactionCount: simulation.transactions.length,
  });

  validateDecodedSourceTransfers(quote, liveBalance, simulation.transactions);

  log('Decoded source transfers check passed');

  throwIfAborted(signal);

  log('Starting simulation', {
    chainId: quote.request.sourceChainId,
    mock7702From: simulation.mock7702From,
    transactions: simulation.transactions,
  });

  try {
    await simulateQuoteTransactions({
      chainId: quote.request.sourceChainId,
      messenger,
      mock7702From: simulation.mock7702From,
      transactions: simulation.transactions,
    });

    log('Simulation passed');
  } catch (error) {
    throwIfAborted(signal);

    if (error instanceof TransactionPaySimulationError) {
      throw new QuoteValidationError(error.message);
    }

    throw error;
  }
}

export function isQuoteValidationError(
  error: unknown,
): error is QuoteValidationError {
  return error instanceof QuoteValidationError;
}

async function getLiveSourceBalance(
  quote: TransactionPayQuote<unknown>,
  messenger: TransactionPayControllerMessenger,
): Promise<string> {
  const { from, sourceChainId, sourceTokenAddress } = quote.request;
  const normalizedSourceTokenAddress = normalizeTokenAddress(
    sourceTokenAddress,
    sourceChainId,
    TokenAddressTarget.MetaMask,
  );

  try {
    return await getLiveTokenBalance(
      messenger,
      from,
      sourceChainId,
      normalizedSourceTokenAddress,
    );
  } catch (error) {
    throw new QuoteValidationError(
      `Cannot validate payment token balance - ${(error as Error).message}`,
    );
  }
}

function validateRequiredSourceAmount(
  quote: TransactionPayQuote<unknown>,
  liveBalance: string,
): void {
  if (quote.request.isPostQuote || quote.request.paymentOverride) {
    return;
  }

  const requiredAmount = new BigNumber(quote.sourceAmount.raw);
  const balance = new BigNumber(liveBalance);

  if (balance.isGreaterThanOrEqualTo(requiredAmount)) {
    return;
  }

  throwInsufficientBalanceError(
    `Insufficient quote source amount: required ${requiredAmount.toFixed()}, balance ${balance.toFixed()}`,
  );
}

function validateDecodedSourceTransfers(
  quote: TransactionPayQuote<unknown>,
  liveBalance: string,
  transactions: SimulationTransaction[],
): void {
  const decodedAmounts = getDecodedSourceTransferAmounts(quote, transactions);

  const requiredAmount = decodedAmounts
    .reduce((total, amount) => total.plus(amount), new BigNumber(0))
    .toString(10);

  const balance = new BigNumber(liveBalance);

  log('Decoded source transfer amounts', {
    decodedAmounts,
    liveBalance,
    requiredAmount,
  });

  if (balance.isGreaterThanOrEqualTo(requiredAmount)) {
    return;
  }

  throwInsufficientBalanceError(
    `Insufficient balance for decoded quote amount: required ${requiredAmount}, balance ${liveBalance}`,
  );
}

function getDecodedSourceTransferAmounts(
  quote: TransactionPayQuote<unknown>,
  transactions: SimulationTransaction[],
): string[] {
  const { sourceChainId, sourceTokenAddress } = quote.request;
  const isNativeSource =
    sourceTokenAddress.toLowerCase() ===
    getNativeToken(sourceChainId).toLowerCase();

  if (isNativeSource) {
    return [];
  }

  const normalizedSourceTokenAddress = normalizeTokenAddress(
    sourceTokenAddress,
    sourceChainId,
    TokenAddressTarget.MetaMask,
  ).toLowerCase();

  return transactions
    .filter(
      (transaction) =>
        transaction.to &&
        normalizeTokenAddress(
          transaction.to,
          sourceChainId,
          TokenAddressTarget.MetaMask,
        ).toLowerCase() === normalizedSourceTokenAddress,
    )
    .map((transaction) =>
      transaction.data ? decodeTransferAmount(transaction.data) : undefined,
    )
    .filter((amount): amount is string => amount !== undefined);
}

function decodeTransferAmount(data: Hex): string | undefined {
  try {
    const result = erc20Interface.decodeFunctionData('transfer', data);
    return new BigNumber(result._value.toString()).toString(10);
  } catch {
    return undefined;
  }
}

function throwInsufficientBalanceError(message: string): never {
  throw new QuoteValidationError(message);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('Quote validation aborted');
  }
}
