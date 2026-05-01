import { defaultAbiCoder } from '@ethersproject/abi';
import type { Hex } from '@metamask/utils';

import { createModuleLogger, projectLogger } from '../logger';
import type { TransactionControllerMessenger } from '../TransactionController';
import type { Revert, TransactionMeta } from '../types';
import { rpcRequest } from './provider';

const log = createModuleLogger(projectLogger, 'revert');

const ERROR_SELECTOR = '0x08c379a0';
const PANIC_SELECTOR = '0x4e487b71';

/**
 * Solidity panic code descriptions.
 *
 * @see https://docs.soliditylang.org/en/latest/control-structures.html#panic-via-assert-and-error-via-require
 */
const PANIC_CODE_MESSAGES: Record<string, string> = {
  '0x00': 'Generic compiler panic',
  '0x01': 'Assertion failed',
  '0x11': 'Arithmetic overflow or underflow',
  '0x12': 'Division or modulo by zero',
  '0x21': 'Invalid enum value',
  '0x22': 'Incorrectly encoded storage byte array',
  '0x31': 'Pop on empty array',
  '0x32': 'Array index out of bounds',
  '0x41': 'Memory allocation overflow',
  '0x51': 'Call to zero-initialized function',
};

export type RevertSource = 'gas' | 'simulation' | 'receipt';

/**
 * Decode raw EVM revert data into a `Revert` containing both the decoded
 * human-readable message and the original raw `data`. Handles
 * `Error(string)`, `Panic(uint256)`, and falls back to a raw
 * `Custom error: 0x<selector>` reference for unknown custom errors.
 *
 * @param data - Raw revert data hex.
 * @returns A `Revert` if any data was provided, otherwise `undefined`.
 */
export function decodeRevert(data: unknown): Revert | undefined {
  const dataHex = isHex(data) && data !== '0x' ? (data as Hex) : undefined;
  const message = decodeMessage(dataHex);

  if (!message && !dataHex) {
    return undefined;
  }

  return {
    ...(message ? { message } : {}),
    ...(dataHex ? { data: dataHex } : {}),
  };
}

/**
 * Emit a structured single-line debug log for one revert source under
 * `metamask:transaction-controller:revert`.
 *
 * @param source - Which source emitted the log.
 * @param transactionId - The transaction's id.
 * @param revert - Resolved Revert (or undefined).
 */
export function logRevert(
  source: RevertSource,
  transactionId: string,
  revert: Revert | undefined,
): void {
  log('source=%s tx=%s %o', source, transactionId, {
    decoded: revert?.message,
    data: revert?.data,
    populated: Boolean(revert),
  });
}

/**
 * Replay a transaction that failed on-chain via `eth_estimateGas` to
 * recover the revert reason. `eth_estimateGas` is used instead of
 * `eth_call` to avoid `RetryOnEmptyMiddleware`, which retries reverted
 * `eth_call` responses 10 times and discards the original error data.
 *
 * Always resolves; never throws.
 *
 * @param input - Extraction inputs.
 * @param input.messenger - Transaction controller messenger.
 * @param input.transactionMeta - Transaction metadata for the failed tx.
 * @returns A `Revert`, or `undefined` if none could be observed.
 */
export async function extractRevert({
  messenger,
  transactionMeta,
}: {
  messenger: TransactionControllerMessenger;
  transactionMeta: TransactionMeta;
}): Promise<Revert | undefined> {
  const { networkClientId, txParams, id } = transactionMeta;

  if (!txParams?.to && !txParams?.data) {
    return undefined;
  }

  const callParams: Record<string, string> = {};
  if (txParams.from) {
    callParams.from = txParams.from;
  }
  if (txParams.to) {
    callParams.to = txParams.to;
  }
  if (txParams.data) {
    callParams.data = txParams.data;
  }
  if (txParams.value) {
    callParams.value = txParams.value;
  }

  try {
    await rpcRequest({
      messenger,
      networkClientId,
      method: 'eth_estimateGas',
      params: [callParams],
    });
    return undefined;
  } catch (error: unknown) {
    return decodeRevert(extractErrorData(error));
  } finally {
    log('extracted receipt revert for tx=%s', id);
  }
}

/**
 * Build a `Revert` from a thrown JSON-RPC error's `data` payload.
 *
 * @param error - The thrown error.
 * @returns A `Revert`, or `undefined` if no revert data was present.
 */
export function revertFromError(error: unknown): Revert | undefined {
  return decodeRevert(extractErrorData(error));
}

/**
 * Error thrown by `PendingTransactionTracker` when a transaction failed
 * on-chain, carrying any decoded revert.
 */
export class OnChainFailureError extends Error {
  readonly revert?: Revert;

  constructor(revert?: Revert) {
    const suffix = revert?.message ? `: ${revert.message}` : '';
    super(`Transaction failed on-chain${suffix}`);
    this.name = 'OnChainFailureError';
    this.revert = revert;
  }
}

/**
 * Pull the revert data hex string from a thrown JSON-RPC error.
 * Standard nodes put the hex on `error.data`; some older forks wrap it
 * one level deeper as `error.data.data`.
 *
 * @param error - The thrown error.
 * @returns The revert data hex, or `undefined`.
 */
function extractErrorData(error: unknown): string | undefined {
  const data = (error as { data?: unknown } | null)?.data;
  if (isHex(data)) {
    return data;
  }

  const nested = (data as { data?: unknown } | null)?.data;
  if (isHex(nested)) {
    return nested;
  }

  return undefined;
}

/**
 * Decode raw revert data into a human-readable string.
 *
 * @param data - Raw revert data hex.
 * @returns Decoded message, or `undefined` if undecodable.
 */
function decodeMessage(data: Hex | undefined): string | undefined {
  if (!data || data === '0x') {
    return undefined;
  }

  if (data.length < 10) {
    return `execution reverted (${data})`;
  }

  const selector = data.slice(0, 10).toLowerCase();
  const payload = `0x${data.slice(10)}`;

  if (selector === ERROR_SELECTOR) {
    try {
      const [reason] = defaultAbiCoder.decode(['string'], payload);
      return typeof reason === 'string' ? reason : undefined;
    } catch {
      return undefined;
    }
  }

  if (selector === PANIC_SELECTOR) {
    try {
      const [code] = defaultAbiCoder.decode(['uint256'], payload) as [
        { toHexString: () => string },
      ];
      const codeHex = code.toHexString().toLowerCase() as Hex;
      const description = PANIC_CODE_MESSAGES[codeHex] ?? 'Unknown panic code';
      return `Panic (${codeHex}): ${description}`;
    } catch {
      return undefined;
    }
  }

  return `Custom error: ${selector}`;
}

/**
 * Type guard for `0x`-prefixed hex strings.
 *
 * @param value - Value to test.
 * @returns Whether the value is a hex string.
 */
function isHex(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('0x');
}
