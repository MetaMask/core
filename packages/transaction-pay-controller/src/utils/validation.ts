import { Interface } from '@ethersproject/abi';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import type { Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { createModuleLogger, projectLogger } from '../logger.js';
import type {
  QuoteErrorInfo,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../types.js';
import {
  SimulationTransaction,
  simulateQuoteTransactions,
  TransactionPaySimulationError,
} from './simulation.js';
import {
  getLiveTokenBalance,
  getNativeToken,
  getTokenInfo,
  normalizeTokenAddress,
  TokenAddressTarget,
} from './token.js';

const log = createModuleLogger(projectLogger, 'validation');

const erc20Interface = new Interface(abiERC20);

export type QuoteSimulation = {
  transactions: SimulationTransaction[];
};

export type QuoteExecutionRequest = {
  messenger: TransactionPayControllerMessenger;
  quote: TransactionPayQuote<unknown>;
  signal?: AbortSignal;
  simulation: QuoteSimulation;
};

export class QuoteError extends Error {
  readonly info: QuoteErrorInfo;

  constructor(info: QuoteErrorInfo) {
    super(info.message);
    this.name = 'QuoteError';
    this.info = info;
  }
}

export async function validateQuoteExecution({
  messenger,
  quote,
  signal,
  simulation,
}: QuoteExecutionRequest): Promise<void> {
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

  validateRequiredSourceAmount(messenger, quote, liveBalance);

  log('Quote source amount check passed');

  log('Checking decoded source transfers', {
    sourceChainId: quote.request.sourceChainId,
    sourceTokenAddress: quote.request.sourceTokenAddress,
    transactionCount: simulation.transactions.length,
  });

  validateDecodedSourceTransfers(
    messenger,
    quote,
    liveBalance,
    simulation.transactions,
  );

  log('Decoded source transfers check passed');

  throwIfAborted(signal);

  log('Starting simulation', {
    chainId: quote.request.sourceChainId,
    transactions: simulation.transactions,
  });

  try {
    await simulateQuoteTransactions({
      chainId: quote.request.sourceChainId,
      messenger,
      transactions: simulation.transactions,
    });

    log('Simulation passed');
  } catch (error) {
    throwIfAborted(signal);

    if (error instanceof TransactionPaySimulationError) {
      throw new QuoteError({
        message: 'Quote simulation failed',
        reason: 'simulation-failed',
        detail: [error.message],
      });
    }

    throw error;
  }
}

export function isQuoteError(error: unknown): error is QuoteError {
  return error instanceof QuoteError;
}

/**
 * Format an amount shortfall into display-ready detail rows.
 *
 * Amounts are formatted using the source token decimals and symbol when
 * available (e.g. `Required: 1.5 USDC`), falling back to the raw atomic values
 * otherwise.
 *
 * @param messenger - Controller messenger.
 * @param quote - Quote being validated.
 * @param required - Required amount (raw string).
 * @param balance - Current balance (raw string).
 * @returns Detail rows: Required / Current / Missing.
 */
function formatBalanceShortfall(
  messenger: TransactionPayControllerMessenger,
  quote: TransactionPayQuote<unknown>,
  required: string,
  balance: string,
): string[] {
  const { sourceChainId, sourceTokenAddress } = quote.request;
  const tokenInfo = getTokenInfo(messenger, sourceTokenAddress, sourceChainId);

  const requiredBn = new BigNumber(required);
  const balanceBn = new BigNumber(balance);

  // Only ever called when balance < required, so the shortfall is positive.
  const missing = requiredBn.minus(balanceBn);

  return [
    `Required: ${formatTokenAmount(requiredBn, tokenInfo)}`,
    `Current: ${formatTokenAmount(balanceBn, tokenInfo)}`,
    `Missing: ${formatTokenAmount(missing, tokenInfo)}`,
  ];
}

/**
 * Format an atomic token amount as a human-readable string with symbol.
 *
 * @param rawAmount - Amount in atomic units.
 * @param tokenInfo - Source token decimals and symbol, if available.
 * @returns Human-readable amount suffixed with the token symbol when known,
 * otherwise the raw atomic value.
 */
function formatTokenAmount(
  rawAmount: BigNumber,
  tokenInfo: { decimals: number; symbol: string } | undefined,
): string {
  if (!tokenInfo) {
    return rawAmount.toFixed();
  }

  const human = rawAmount.shiftedBy(-tokenInfo.decimals).toFixed();

  return `${human} ${tokenInfo.symbol}`;
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
    throw new QuoteError({
      message: 'Unable to verify balance',
      reason: 'balance-unavailable',
      detail: [(error as Error).message],
    });
  }
}

function validateRequiredSourceAmount(
  messenger: TransactionPayControllerMessenger,
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

  throw new QuoteError({
    message: 'Insufficient source balance for quote',
    reason: 'insufficient-source-balance',
    detail: formatBalanceShortfall(
      messenger,
      quote,
      requiredAmount.toFixed(),
      balance.toFixed(),
    ),
  });
}

function validateDecodedSourceTransfers(
  messenger: TransactionPayControllerMessenger,
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

  throw new QuoteError({
    message: 'Insufficient source balance for decoded transfer',
    reason: 'insufficient-transfer-balance',
    detail: formatBalanceShortfall(
      messenger,
      quote,
      requiredAmount,
      liveBalance,
    ),
  });
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

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('Quote validation aborted');
  }
}
