import { TYPED_MESSAGE_SCHEMA } from '@metamask/eth-sig-util';
import { providerErrors, rpcErrors } from '@metamask/rpc-errors';
import type { Struct, StructError } from '@metamask/superstruct';
import {
  array,
  number,
  object,
  optional,
  string,
  union,
  validate,
} from '@metamask/superstruct';
import type { Hex } from '@metamask/utils';

import type { WalletMiddlewareContext } from '../wallet.js';
import { parseTypedMessage } from './normalize.js';

/**
 * Validates and normalizes a keyholder address for transaction- and
 * signature-related operations.
 *
 * @param address - The Ethereum address to validate and normalize.
 * @param context - The context of the request.
 * @param options - The options for the validation.
 * @param options.getAccounts - The function to get the accounts for the origin.
 * @returns The normalized address, if valid. Otherwise, throws
 * an error
 */
export async function validateAndNormalizeKeyholder(
  address: Hex,
  context: WalletMiddlewareContext,
  { getAccounts }: { getAccounts: (origin: string) => Promise<string[]> },
): Promise<Hex> {
  if (
    typeof address === 'string' &&
    address.length > 0 &&
    resemblesAddress(address)
  ) {
    // Ensure that an "unauthorized" error is thrown if the requester
    // does not have the `eth_accounts` permission.
    const accounts = await getAccounts(context.assertGet('origin'));

    const normalizedAccounts: string[] = accounts.map((_address) =>
      _address.toLowerCase(),
    );

    const normalizedAddress = address.toLowerCase() as Hex;

    if (normalizedAccounts.includes(normalizedAddress)) {
      return normalizedAddress;
    }

    throw providerErrors.unauthorized();
  }

  throw rpcErrors.invalidParams({
    message: `Invalid parameters: must provide an Ethereum address.`,
  });
}

/**
 * Validates the parameters of a request against a Superstruct schema.
 * Throws a JSON-RPC error if the parameters are invalid.
 *
 * @param value - The value to validate.
 * @param struct - The Superstruct schema to validate against.
 * @throws An error if the parameters are invalid.
 */
export function validateParams<ParamsType>(
  value: unknown | ParamsType,
  struct: Struct<ParamsType>,
): asserts value is ParamsType {
  const [error] = validate(value, struct);

  if (error) {
    throw rpcErrors.invalidParams(
      formatValidationError(error, `Invalid params`),
    );
  }
}

/**
 * Checks if a string resembles an Ethereum address.
 *
 * @param str - The string to check.
 * @returns True if the string resembles an Ethereum address, false otherwise.
 */
export function resemblesAddress(str: string): boolean {
  // hex prefix 2 + 20 bytes
  return str.length === 2 + 20 * 2;
}

/**
 * Formats a Superstruct validation error into a human-readable string.
 *
 * @param error - The Superstruct validation error.
 * @param message - The base error message to prepend to the formatted details.
 * @returns The formatted error.
 */
function formatValidationError(error: StructError, message: string): string {
  return `${message}\n\n${error
    .failures()
    .map(
      (failure) =>
        `${failure.path.join(' > ')}${failure.path.length ? ' - ' : ''}${failure.message}`,
    )
    .join('\n')}`;
}

export const DANGEROUS_PROTOTYPE_PROPERTIES = [
  '__proto__',
  'constructor',
  'prototype',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
] as const;

/**
 * Checks if a property name is dangerous for prototype pollution.
 *
 * @param key - The property name to check
 * @returns True if the property name is dangerous
 */
function isDangerousProperty(key: string): boolean {
  return (DANGEROUS_PROTOTYPE_PROPERTIES as readonly string[]).includes(key);
}

/**
 * Recursively checks an object for dangerous prototype pollution properties.
 *
 * @param obj - The object to check
 * @throws rpcErrors.invalidInput() if a dangerous property is found
 */
function checkObjectForPrototypePollution(obj: unknown): void {
  if (obj === null || obj === undefined) {
    return;
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      checkObjectForPrototypePollution(item);
    }
    return;
  }

  if (typeof obj === 'object') {
    for (const key of Object.getOwnPropertyNames(
      obj as Record<string, unknown>,
    )) {
      if (isDangerousProperty(key)) {
        throw rpcErrors.invalidInput();
      }
      checkObjectForPrototypePollution((obj as Record<string, unknown>)[key]);
    }
  }
}

/**
 * Validates V1 typed data (array format) for prototype pollution attacks.
 * V1 format: [{ type: 'string', name: 'fieldName', value: 'data' }, ...]
 *
 * @param data - The V1 typed data array to validate
 * @throws rpcErrors.invalidInput() if prototype pollution is detected
 */
export function validateTypedDataV1ForPrototypePollution(
  data: Record<string, unknown>[],
): void {
  if (!data || !Array.isArray(data)) {
    return;
  }

  for (const item of data) {
    if (item && typeof item === 'object') {
      // Only check the 'value' field (the message data) for dangerous properties
      if (item.value !== null && typeof item.value === 'object') {
        checkObjectForPrototypePollution(item.value);
      }
    }
  }
}

/**
 * Validates V3/V4 typed data (EIP-712 format) for prototype pollution attacks.
 * Only checks the message field for dangerous properties.
 *
 * @param data - The stringified typed data to validate
 * @throws rpcErrors.invalidInput() if prototype pollution is detected
 */
export function validateTypedDataForPrototypePollution(data: string): void {
  const { message } = parseTypedMessage(data);

  // Check message recursively for dangerous properties
  if (message !== undefined) {
    checkObjectForPrototypePollution(message);
  }
}

/**
 * Validates that EIP-712 typed message data contains only keys defined in
 * the TYPED_MESSAGE_SCHEMA from `@metamask/eth-sig-util`. Rejects messages
 * with extraneous top-level keys.
 *
 * @param data - The stringified typed data to validate.
 * @throws rpcErrors.invalidInput() if extraneous keys are detected.
 */
export function validateTypedMessageKeys(data: string): void {
  const parsedData = parseTypedMessage(data);
  const allowedKeys = new Set([
    ...Object.keys(TYPED_MESSAGE_SCHEMA.properties),
    'metadata',
  ]);
  const hasExtraneousKey = Object.keys(parsedData).some(
    (key) => !allowedKeys.has(key),
  );

  if (hasExtraneousKey) {
    throw rpcErrors.invalidInput();
  }

  // Advanced Permissions adds `metadata: { justification: string, origin: string }` to eth_signTypedData requests.
  // see GatorPermissionsController.decodePermissionFromPermissionContextForOrigin for more details.
  const { metadata } = parsedData as { metadata?: unknown };
  if (metadata !== undefined) {
    if (typeof metadata !== 'object' || metadata === null) {
      throw rpcErrors.invalidInput();
    }

    const { justification, origin } = metadata as {
      justification?: unknown;
      origin?: unknown;
    };

    if (typeof justification !== 'string' || typeof origin !== 'string') {
      throw rpcErrors.invalidInput();
    }

    // we only need to check the keys length, because we already checked the known keys (justification and origin).
    if (Object.keys(metadata).length !== 2) {
      throw rpcErrors.invalidInput();
    }
  }
}

export const TransactionParamsStruct = object({
  accessList: optional(
    array(object({ address: string(), storageKeys: array(string()) })),
  ),
  authorizationList: optional(
    array(
      object({
        address: string(),
        chainId: optional(string()),
        nonce: optional(string()),
        r: optional(string()),
        s: optional(string()),
        yParity: optional(string()),
      }),
    ),
  ),
  chainId: optional(string()),
  data: optional(string()),
  from: string(),
  gas: optional(union([string(), number()])),
  gasLimit: optional(string()),
  gasPrice: optional(string()),
  maxFeePerGas: optional(string()),
  maxPriorityFeePerGas: optional(string()),
  nonce: optional(string()),
  to: optional(string()),
  type: optional(string()),
  value: optional(string()),
});

// Upper bound derived from the largest valid eth_sendTransaction payload:
// EIP-3860 caps initcode at 49,152 bytes → hex-encoded in 'data' field ≈ 98 KB of JSON.
// 200 KB is ~2× that ceiling, giving clear headroom above any protocol-legal
// transaction while blocking the padding attacks this cap defends against.
// TODO(CONF-1662): tighten once P99 production data is available.
export const MAX_TRANSACTION_PARAMS_SIZE_BYTES = 200 * 1024;

/**
 * Validates `eth_sendTransaction` / `eth_signTransaction` params against the
 * standard transaction schema and rejects payloads whose serialized size
 * exceeds `MAX_TRANSACTION_PARAMS_SIZE_BYTES`.
 *
 * Guards against two attack shapes:
 * - Size: valid-shaped but oversized payloads (e.g. `data` padded with
 *   millions of hex zeros) that exhaust memory in downstream code. Checked
 *   first via `JSON.stringify` so oversized input is rejected before schema
 *   work.
 * - Structural: extraneous top-level keys or ill-typed fields (e.g.
 *   `{ from, to, test: { b: { b: ... × 1200 } } }`) that would crash
 *   downstream normalization / PPOM WASM with `RangeError: Maximum call
 *   stack size exceeded`, silently bypassing security checks. Superstruct's
 *   `object()` rejects unknown keys by name without accessing their values,
 *   so hostile nested subtrees are never traversed by schema validation.
 *
 * @param params - The transaction params object supplied by the dapp.
 * @throws rpcErrors.invalidParams() if params is an array or exceeds the
 * serialized size limit.
 * @throws rpcErrors.invalidInput() if params fails schema validation
 * (wrong type, extraneous top-level key, or malformed nested field).
 */
export function validateTransactionParams(params: unknown): void {
  if (
    new TextEncoder().encode(JSON.stringify(params)).byteLength >
    MAX_TRANSACTION_PARAMS_SIZE_BYTES
  ) {
    throw rpcErrors.invalidInput('Request too large');
  }

  validateParams(params, TransactionParamsStruct);
}
