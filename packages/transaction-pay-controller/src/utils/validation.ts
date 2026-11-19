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
import type { QuoteSimulation } from './simulation.js';
import {
  getEvmQuoteSource,
  getLiveTokenBalanceOrUndefined,
  getNativeToken,
  getTokenInfo,
  normalizeTokenAddress,
  TokenAddressTarget,
} from './token.js';

const log = createModuleLogger(projectLogger, 'validation');

const erc20Interface = new Interface(abiERC20);

export type QuoteExecutionRequest = {
  messenger: TransactionPayControllerMessenger;
  quote: TransactionPayQuote<unknown>;
  signal?: AbortSignal;
  simulation: QuoteSimulation;
};

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

export async function validateQuoteExecution({
  messenger,
  quote,
  signal,
  simulation,
}: QuoteExecutionRequest): Promise<void> {
  throwIfAborted(signal);

  const { chainId: sourceChainId, tokenAddress: sourceTokenAddress } =
    getEvmQuoteSource(quote.request);

  const liveBalance = await getLiveSourceBalance(quote, messenger);

  log('Live source balance', {
    from: quote.request.from,
    liveBalance,
    sourceChainId,
    sourceTokenAddress,
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
    sourceChainId,
    sourceTokenAddress,
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
  const { chainId } = getEvmQuoteSource(quote.request);

  log('Starting simulation', {
    chainId,
    transactions: simulation.transactions,
  });

  try {
    await simulateQuoteTransactions({
      chainId,
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
  const { chainId, tokenAddress } = getEvmQuoteSource(quote.request);
  const tokenInfo = getTokenInfo(messenger, tokenAddress, chainId);

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

/**
 * Read the live source token balance, or `undefined` if it cannot be read.
 *
 * @param quote - Quote being validated.
 * @param messenger - Controller messenger.
 * @returns Raw balance as a decimal string, or `undefined` when the RPC
 * request failed.
 */
async function getLiveSourceBalance(
  quote: TransactionPayQuote<unknown>,
  messenger: TransactionPayControllerMessenger,
): Promise<string | undefined> {
  const { from } = quote.request;
  const { chainId: sourceChainId, tokenAddress: sourceTokenAddress } =
    getEvmQuoteSource(quote.request);
  const normalizedSourceTokenAddress = normalizeTokenAddress(
    sourceTokenAddress,
    sourceChainId,
    TokenAddressTarget.MetaMask,
  );

  return await getLiveTokenBalanceOrUndefined(
    messenger,
    from,
    sourceChainId,
    normalizedSourceTokenAddress,
  );
}

function validateRequiredSourceAmount(
  messenger: TransactionPayControllerMessenger,
  quote: TransactionPayQuote<unknown>,
  liveBalance: string | undefined,
): void {
  if (liveBalance === undefined) {
    log('Skipping quote source amount check: live balance unavailable');
    return;
  }

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
  liveBalance: string | undefined,
  transactions: SimulationTransaction[],
): void {
  if (liveBalance === undefined) {
    log('Skipping decoded source transfer check: live balance unavailable');
    return;
  }

  // Only valid for a single source-token transfer. Multi-step batches produce
  // or transform the source-token balance mid-batch, so comparing against the
  // starting balance is wrong; rely on the full simulation instead.
  if (
    transactions.length !== 1 ||
    !isSourceTokenTransfer(quote, transactions[0])
  ) {
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

function isSourceTokenTransfer(
  quote: TransactionPayQuote<unknown>,
  transaction: SimulationTransaction | undefined,
): boolean {
  if (!transaction?.to || !transaction.data) {
    return false;
  }

  const { chainId: sourceChainId, tokenAddress: sourceTokenAddress } =
    getEvmQuoteSource(quote.request);

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

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('Quote validation aborted');
  }
}
