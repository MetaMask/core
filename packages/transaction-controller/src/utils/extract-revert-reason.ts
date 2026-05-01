import { defaultAbiCoder } from '@ethersproject/abi';
import type { Hex } from '@metamask/utils';

import { createModuleLogger, projectLogger } from '../logger';
import type { TransactionControllerMessenger } from '../TransactionController';
import type { Revert, TransactionMeta } from '../types';
import { rpcRequest } from './provider';

const log = createModuleLogger(projectLogger, 'extract-revert-reason');

const revertLog = createModuleLogger(projectLogger, 'revert');

export type RevertSource = 'gas' | 'simulation' | 'receipt';

/**
 * Emit a structured, single-line log entry for one revert source. Logs
 * appear under `metamask:transaction-controller:revert` and follow the
 * same shape across all sources, so they can be easily filtered and
 * compared in a debug session.
 *
 * @param source - Which source this log is for.
 * @param transactionId - The transaction's id.
 * @param outcome - Either the resolved Revert (or undefined if none was
 * found) plus an optional rawError for diagnostics.
 * @param outcome.revert - Resolved Revert.
 * @param outcome.rawError - Raw error for diagnostics.
 */
export function logRevert(
  source: RevertSource,
  transactionId: string,
  outcome: { revert?: Revert; rawError?: unknown },
): void {
  const { revert, rawError } = outcome;

  const errorSummary = rawError
    ? {
        errorMessage: (rawError as { message?: unknown })?.message,
        errorCode: (rawError as { code?: unknown })?.code,
        errorDataPresent: Boolean((rawError as { data?: unknown })?.data),
      }
    : undefined;

  revertLog('source=%s tx=%s %o', source, transactionId, {
    decoded: revert?.message,
    data: revert?.data,
    populated: Boolean(revert),
    ...(errorSummary ?? {}),
  });
}

const ERROR_SELECTOR = '0x08c379a0';
const PANIC_SELECTOR = '0x4e487b71';

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

type RevertExtractionInput = {
  messenger: TransactionControllerMessenger;
  transactionMeta: TransactionMeta;
};

type EthCallParams = {
  from?: string;
  to?: string;
  data?: string;
  value?: string;
  gas?: string;
};

/**
 * Attempt to extract revert information for a transaction that failed
 * on-chain. Replays the original transaction via `eth_estimateGas` and
 * returns the decoded revert reason and/or raw revert data.
 *
 * `eth_estimateGas` is used instead of `eth_call` because the latter is
 * routed through `RetryOnEmptyMiddleware`, which retries reverted responses
 * 10 times and discards the original error. `eth_estimateGas` returns the
 * same revert payload (`error.data`) without going through that middleware.
 *
 * Always resolves; never throws. Returns `undefined` when no revert
 * information can be extracted (e.g. the RPC does not surface revert data,
 * or the call did not revert when replayed).
 *
 * @param input - Extraction inputs.
 * @param input.messenger - Transaction controller messenger.
 * @param input.transactionMeta - Transaction metadata for the failed tx.
 * @returns A `Revert` describing the decoded reason and/or raw data, or
 * `undefined` if no revert was observed.
 */
export async function extractRevert({
  messenger,
  transactionMeta,
}: RevertExtractionInput): Promise<Revert | undefined> {
  const { networkClientId, txParams, id } = transactionMeta;

  if (!txParams?.to && !txParams?.data) {
    log('Skipping extraction; no `to` or `data` in txParams', { id });
    return undefined;
  }

  const callParams: EthCallParams = {
    from: txParams.from,
    to: txParams.to,
    data: txParams.data,
    value: txParams.value,
  };

  log('Replaying failed transaction via eth_estimateGas', {
    id,
    networkClientId,
    callParams,
  });

  try {
    const result = await rpcRequest({
      messenger,
      networkClientId,
      method: 'eth_estimateGas',
      params: [callParams],
    });

    log('Replay did not revert; no revert reason available', { id, result });
    logRevert('receipt', id, { revert: undefined });
    return undefined;
  } catch (error: unknown) {
    const revert = revertFromError(error);
    logRevert('receipt', id, { revert, rawError: error });
    return revert;
  }
}

/**
 * Build a `Revert` from a thrown JSON-RPC error. Reads only the raw revert
 * data from `error.data` and decodes it locally; upstream message strings
 * are never parsed.
 *
 * @param error - The thrown error from the RPC call.
 * @returns A `Revert` containing the raw data and a decoded message when
 * possible, or `undefined` if no revert data was present.
 */
export function revertFromError(error: unknown): Revert | undefined {
  const data = extractErrorData(error) as Hex | undefined;

  if (data === undefined) {
    return undefined;
  }

  const message = decodeRevertData(data);

  return {
    ...(message === undefined ? {} : { message }),
    data,
  };
}

/**
 * Decode standard revert data (`Error(string)`, `Panic(uint256)`) and fall
 * back to a raw selector reference for unknown custom errors.
 *
 * @param data - The revert data hex string.
 * @returns A decoded reason string or `undefined`.
 */
export function decodeRevertData(data: unknown): string | undefined {
  if (typeof data !== 'string' || !data.startsWith('0x')) {
    return undefined;
  }

  if (data === '0x') {
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
 * Pull the revert data hex string from a thrown JSON-RPC error.
 *
 * We talk directly to RPC nodes via the network controller's provider, so
 * the error reaches us as an `EthereumRpcError` with `data` set to whatever
 * the node returned. Standard nodes (Geth, Erigon, Nethermind) put the hex
 * payload on `error.data` directly; a small number of older forks wrap it
 * one level deeper as `error.data.data`.
 *
 * @param error - The thrown error from the RPC call.
 * @returns The revert data hex string, or `undefined` if none was found.
 */
export function extractErrorData(error: unknown): string | undefined {
  const data = (error as { data?: unknown } | null)?.data;

  if (typeof data === 'string' && data.startsWith('0x')) {
    return data;
  }

  const nested = (data as { data?: unknown } | null)?.data;

  if (typeof nested === 'string' && nested.startsWith('0x')) {
    return nested;
  }

  return undefined;
}

/**
 * Error thrown by `PendingTransactionTracker` when a transaction failed
 * on-chain. Carries the optional decoded revert so the controller can
 * persist it on `TransactionMeta` without parsing strings.
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
