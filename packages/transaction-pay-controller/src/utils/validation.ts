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

  readonly quotes?: TransactionPayQuote<unknown>[];

  constructor(info: QuoteErrorInfo, quotes?: TransactionPayQuote<unknown>[]) {
    super(info.message);
    this.name = 'QuoteError';
    this.info = info;
    this.quotes = quotes;
  }
}

export async function validateQuoteExecution({
  messenger,
  quote,
  signal,
  simulation,
}: QuoteExecutionRequest): Promise<void> {
  throwIfAborted(signal);

  // Read the source-token balance at the account that actually holds it: the
  // simulation sender (`transactions[0].from`), which both executes the
  // transaction and holds the source token. For Safe-based Predict withdraws the
  // builder simulates the calls directly from the Safe proxy, so the sender is
  // already the source-token holder here too.
  const sourceAddress = simulation.transactions[0]?.from ?? quote.request.from;

  const liveBalance = await getLiveSourceBalance(
    quote,
    messenger,
    sourceAddress,
  );

  log('Live source balance', {
    from: sourceAddress,
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

  log('Checking decoded source transfers', {
    sourceChainId: quote.request.sourceChainId,
    sourceTokenAddress: quote.request.sourceTokenAddress,
    transactions: simulation.transactions,
  });

  validateDecodedSourceTransfers(
    messenger,
    quote,
    liveBalance,
    simulation.transactions,
  );

  throwIfAborted(signal);

  await validateSimulation(messenger, quote, simulation, signal);
}

async function validateSimulation(
  messenger: TransactionPayControllerMessenger,
  quote: TransactionPayQuote<unknown>,
  simulation: QuoteSimulation,
  signal?: AbortSignal,
): Promise<void> {
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
  sourceAddress: Hex,
): Promise<string> {
  const { sourceChainId, sourceTokenAddress } = quote.request;
  const normalizedSourceTokenAddress = normalizeTokenAddress(
    sourceTokenAddress,
    sourceChainId,
    TokenAddressTarget.MetaMask,
  );

  try {
    return await getLiveTokenBalance(
      messenger,
      sourceAddress,
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
    log('Skipping quote source amount check', {
      hasPaymentOverride: Boolean(quote.request.paymentOverride),
      isPostQuote: Boolean(quote.request.isPostQuote),
    });
    return;
  }

  const requiredAmount = new BigNumber(quote.sourceAmount.raw);
  const balance = new BigNumber(liveBalance);

  if (balance.isGreaterThanOrEqualTo(requiredAmount)) {
    log('Quote source amount check passed');
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
  // The decoded-transfer check compares a single source-token transfer amount
  // against the sender's *starting* balance. That is only valid for the simple
  // "spend what you already hold" case: exactly one transaction, and it is a
  // source-token transfer. Any multi-step batch (e.g. a Safe-based Predict
  // withdraw that unwraps legacy USDC into the source token before transferring
  // it, or swaps/approvals) produces or transforms the source-token balance
  // mid-batch, so the sender does not hold it up front and this static
  // comparison would wrongly report insufficient funds. In those cases we skip
  // the check and rely on the full on-chain simulation to catch real shortfalls.
  if (transactions.length !== 1 || !isSourceTokenTransfer(quote, transactions[0])) {
    log(
      'Skipping decoded source transfer check: not a single source-token transfer',
    );
    return;
  }

  // `isSourceTokenTransfer` has already confirmed the data decodes to a
  // transfer, so the amount is defined here.
  const requiredAmount = decodeTransferAmount(
    transactions[0].data as Hex,
  ) as string;

  const balance = new BigNumber(liveBalance);

  log('Decoded source transfer amount', {
    liveBalance,
    requiredAmount,
  });

  if (balance.isGreaterThanOrEqualTo(requiredAmount)) {
    log('Decoded source transfers check passed');
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

/**
 * Whether a simulation transaction is a transfer of the quote's source token.
 *
 * @param quote - Quote being validated (provides the source token + chain).
 * @param transaction - The simulation transaction to inspect.
 * @returns True when the transaction calls `transfer` on the source token.
 */
function isSourceTokenTransfer(
  quote: TransactionPayQuote<unknown>,
  transaction: SimulationTransaction | undefined,
): boolean {
  if (!transaction?.to || !transaction.data) {
    return false;
  }

  const { sourceChainId, sourceTokenAddress } = quote.request;

  const isNativeSource =
    sourceTokenAddress.toLowerCase() ===
    getNativeToken(sourceChainId).toLowerCase();

  if (isNativeSource) {
    return false;
  }

  const normalizedSourceTokenAddress = normalizeTokenAddress(
    sourceTokenAddress,
    sourceChainId,
    TokenAddressTarget.MetaMask,
  ).toLowerCase();

  const normalizedTo = normalizeTokenAddress(
    transaction.to,
    sourceChainId,
    TokenAddressTarget.MetaMask,
  ).toLowerCase();

  if (normalizedTo !== normalizedSourceTokenAddress) {
    return false;
  }

  return decodeTransferAmount(transaction.data) !== undefined;
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
