import { defaultAbiCoder } from '@ethersproject/abi';
import type { Hex } from '@metamask/utils';

import { createModuleLogger, projectLogger } from '../logger';
import type { TransactionControllerMessenger } from '../TransactionController';
import type { TransactionMeta } from '../types';
import { rpcRequest } from './provider';

const log = createModuleLogger(projectLogger, 'extract-revert-reason');

const ERROR_SELECTOR = '0x08c379a0';
const PANIC_SELECTOR = '0x4e487b71';

const PANIC_CODE_MESSAGES: Record<string, string> = {
  '0x00': 'generic compiler panic',
  '0x01': 'assertion failed',
  '0x11': 'arithmetic overflow or underflow',
  '0x12': 'division or modulo by zero',
  '0x21': 'invalid enum value',
  '0x22': 'storage byte array incorrectly encoded',
  '0x31': 'pop on empty array',
  '0x32': 'array index out of bounds',
  '0x41': 'memory allocation overflow',
  '0x51': 'invalid internal function pointer',
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
 * Attempt to extract a human-readable revert reason for a transaction that
 * failed on-chain. Replays the original transaction via `eth_estimateGas`
 * and decodes the returned revert data.
 *
 * `eth_estimateGas` is used instead of `eth_call` because the latter is
 * routed through `RetryOnEmptyMiddleware`, which retries reverted responses
 * 10 times and discards the original error. `eth_estimateGas` returns the
 * same revert payload (`error.data`) without going through that middleware.
 *
 * Always resolves; never throws. Returns `undefined` when no reason can be
 * extracted (e.g. the RPC does not surface revert data, or the call did not
 * revert when replayed).
 *
 * @param input - Extraction inputs.
 * @param input.messenger - Transaction controller messenger.
 * @param input.transactionMeta - Transaction metadata for the failed tx.
 * @returns A human-readable revert reason or `undefined`.
 */
export async function extractRevertReason({
  messenger,
  transactionMeta,
}: RevertExtractionInput): Promise<string | undefined> {
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
    return undefined;
  } catch (error: unknown) {
    const reason = decodeRevertReasonFromError(error);

    if (reason) {
      log('Extracted revert reason', { id, reason });
    } else {
      log('Could not extract revert reason', {
        id,
        errorMessage: (error as { message?: unknown })?.message,
        errorCode: (error as { code?: unknown })?.code,
      });
    }

    return reason;
  }
}

/**
 * Decode a human-readable revert reason from an RPC error thrown by
 * `eth_estimateGas` or `eth_call`. Looks at `error.data` first (full ABI
 * payload) and falls back to the message suffix many providers include.
 *
 * @param error - The thrown error.
 * @returns A revert reason string, or `undefined` if none can be extracted.
 */
export function decodeRevertReasonFromError(
  error: unknown,
): string | undefined {
  const data = extractErrorData(error);
  return decodeRevertData(data) ?? extractErrorMessage(error);
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
      const description = PANIC_CODE_MESSAGES[codeHex] ?? 'unknown panic';
      return `Panic: ${description} (${codeHex})`;
    } catch {
      return undefined;
    }
  }

  return `reverted with custom error ${selector}`;
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
 * Pull a useful message from a provider error when no revert data is
 * present. Many RPCs return a string message such as
 * `"execution reverted: ERC20: transfer amount exceeds balance"`.
 *
 * @param error - The thrown error from the RPC call.
 * @returns A trimmed message string, or `undefined`.
 */
function extractErrorMessage(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const { message } = error as { message?: unknown };

  if (typeof message !== 'string') {
    return undefined;
  }

  const match = /execution reverted:?\s*(.*)/iu.exec(message);
  const trimmed = match?.[1]?.trim();

  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Error thrown by `PendingTransactionTracker` when a transaction failed
 * on-chain. Carries the optional decoded revert reason so the controller
 * can persist it on `TransactionMeta` without parsing strings.
 */
export class OnChainFailureError extends Error {
  readonly revertReason?: string;

  constructor(revertReason?: string) {
    const suffix = revertReason ? `: ${revertReason}` : '';
    super(`Transaction failed on-chain${suffix}`);
    this.name = 'OnChainFailureError';
    this.revertReason = revertReason;
  }
}
