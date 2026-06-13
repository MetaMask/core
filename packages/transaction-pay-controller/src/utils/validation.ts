import { Interface } from '@ethersproject/abi';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import type { Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import type {
  TransactionPayControllerMessenger,
  TransactionPayQuote,
  TransactionPayQuoteValidationError,
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
  readonly validationError: TransactionPayQuoteValidationError;

  constructor(validationError: TransactionPayQuoteValidationError) {
    super(validationError.message);
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

  throwIfAborted(signal);

  validateRequiredSourceAmount(quote, liveBalance);
  validateDecodedSourceTransfers(quote, liveBalance, simulation.transactions);

  throwIfAborted(signal);

  try {
    await simulateQuoteTransactions({
      chainId: quote.request.sourceChainId,
      messenger,
      mock7702From: simulation.mock7702From,
      transactions: simulation.transactions,
    });
  } catch (error) {
    throwIfAborted(signal);

    if (error instanceof TransactionPaySimulationError) {
      throw new QuoteValidationError({
        chainId: quote.request.sourceChainId,
        code: error.code,
        message: error.message,
        strategy: quote.strategy,
        tokenAddress: quote.request.sourceTokenAddress,
      });
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
    throw new QuoteValidationError({
      chainId: sourceChainId,
      code: 'source_balance_unavailable',
      message: `Cannot validate payment token balance - ${
        (error as Error).message
      }`,
      strategy: quote.strategy,
      tokenAddress: normalizedSourceTokenAddress,
    });
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
    quote,
    liveBalance,
    requiredAmount.toString(10),
    'Insufficient quote source amount',
  );
}

function validateDecodedSourceTransfers(
  quote: TransactionPayQuote<unknown>,
  liveBalance: string,
  transactions: SimulationTransaction[],
): void {
  const requiredAmount = getDecodedSourceTransferAmounts(quote, transactions)
    .reduce((total, amount) => total.plus(amount), new BigNumber(0))
    .toString(10);
  const balance = new BigNumber(liveBalance);

  if (balance.isGreaterThanOrEqualTo(requiredAmount)) {
    return;
  }

  throwInsufficientBalanceError(
    quote,
    liveBalance,
    requiredAmount,
    'Insufficient balance for decoded quote amount',
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

function throwInsufficientBalanceError(
  quote: TransactionPayQuote<unknown>,
  liveBalance: string,
  requiredAmountRaw: string,
  message: string,
): never {
  const { sourceChainId, sourceTokenAddress } = quote.request;
  const normalizedSourceTokenAddress = normalizeTokenAddress(
    sourceTokenAddress,
    sourceChainId,
    TokenAddressTarget.MetaMask,
  );

  throw new QuoteValidationError({
    availableAmountRaw: liveBalance,
    chainId: sourceChainId,
    code: 'insufficient_source_balance',
    message,
    requiredAmountRaw,
    strategy: quote.strategy,
    tokenAddress: normalizedSourceTokenAddress,
  });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('Quote validation aborted');
  }
}
