import { defaultAbiCoder } from '@ethersproject/abi';
import type { NetworkClientId } from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';

import { createModuleLogger, projectLogger } from '../logger';
import type { TransactionControllerMessenger } from '../TransactionController';
import type { Revert, TransactionParams } from '../types';
import { rpcRequest } from './provider';

const log = createModuleLogger(projectLogger, 'revert-reason');

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

/**
 * Input accepted by `decodeRevert`. Either raw revert data hex, or a
 * thrown JSON-RPC error carrying the data on `data` (standard) or
 * nested `data.data` (some older node forks).
 */
type RevertInput =
  | Hex
  | undefined
  | { data?: Hex | { data?: Hex } | null }
  | null;

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
 * Decode an EVM revert into a `Revert` containing both the decoded
 * human-readable message and the original raw `data`. Accepts either a
 * raw revert data hex string, or a thrown JSON-RPC error of the shape
 * `{ data: Hex | { data: Hex } }`. Handles `Error(string)`,
 * `Panic(uint256)`, and falls back to a raw `Custom error: 0x<selector>`
 * reference for unknown custom errors.
 *
 * @param input - Raw revert data hex, or a thrown JSON-RPC error.
 * @param source - Optional label included in debug logs to identify the
 * caller (e.g. `gas`, `simulation`).
 * @returns A `Revert` if any data was found, otherwise `undefined`.
 */
export function decodeRevert(
  input: RevertInput,
  source?: string,
): Revert | undefined {
  const data = toRevertDataHex(input);
  if (!data) {
    return undefined;
  }

  const message = decodeMessage(data);
  const revert: Revert = {
    ...(message ? { message } : {}),
    data,
  };

  logRevert(source, revert);
  return revert;
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
 * @param input.networkClientId - Network client ID to replay against.
 * @param input.txParams - Transaction parameters for the failed tx.
 * @returns A `Revert`, or `undefined` if none could be observed.
 */
export async function extractRevert({
  messenger,
  networkClientId,
  txParams,
}: {
  messenger: TransactionControllerMessenger;
  networkClientId: NetworkClientId;
  txParams: TransactionParams;
}): Promise<Revert | undefined> {
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
      // `eth_estimateGas` is used instead of `eth_call` to bypass
      // `RetryOnEmptyMiddleware`, which retries reverted `eth_call`
      // responses and discards the original revert data.
      method: 'eth_estimateGas',
      params: [callParams],
    });
    return undefined;
  } catch (error: unknown) {
    return decodeRevert(error as RevertInput, 'receipt');
  }
}

/**
 * Coerce a `RevertInput` to a non-empty revert data hex string.
 *
 * @param input - Raw hex or thrown JSON-RPC error.
 * @returns The revert data hex, or `undefined`.
 */
function toRevertDataHex(input: RevertInput): Hex | undefined {
  if (isHex(input)) {
    return input;
  }

  if (typeof input !== 'object' || input === null) {
    return undefined;
  }

  const { data } = input;
  if (isHex(data)) {
    return data;
  }

  if (typeof data === 'object' && data !== null && isHex(data.data)) {
    return data.data;
  }

  return undefined;
}

/**
 * Type guard for non-empty `0x`-prefixed hex strings.
 *
 * @param value - Value to test.
 * @returns Whether the value is a non-empty hex string.
 */
function isHex(value: unknown): value is Hex {
  return typeof value === 'string' && value.startsWith('0x') && value !== '0x';
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
      const description = PANIC_CODE_MESSAGES[codeHex] ?? 'Unknown panic';
      return `Panic: ${description}`;
    } catch {
      return undefined;
    }
  }

  return `Custom error: ${selector}`;
}

/**
 * Emit a single structured debug line for a decoded revert.
 *
 * @param source - Source label, when known.
 * @param revert - Resolved Revert.
 */
function logRevert(source: string | undefined, revert: Revert): void {
  log('Decoded revert', source ?? 'unknown', revert);
}
