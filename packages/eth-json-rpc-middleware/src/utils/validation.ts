import { TYPED_MESSAGE_SCHEMA } from '@metamask/eth-sig-util';
import { providerErrors, rpcErrors } from '@metamask/rpc-errors';
import type { Struct, StructError } from '@metamask/superstruct';
import { validate } from '@metamask/superstruct';
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

/**
 * Top-level keys explicitly permitted on `eth_sendTransaction` and
 * `eth_signTransaction` params. Any additional top-level key causes the
 * request to be rejected before it reaches downstream consumers such as PPOM
 * or the Security Alerts API.
 *
 * Derived from the dapp-facing subset of `TransactionParams` in
 * `@metamask/transaction-controller`. Internal-only fields
 * (`estimateGasError`, `estimatedBaseFee`, `estimateSuggested`,
 * `estimateUsed`, `gasUsed`) are intentionally omitted — dapps should not be
 * able to inject them.
 */
export const ALLOWED_TRANSACTION_PARAM_KEYS = new Set<string>([
  'accessList',
  'authorizationList',
  'chainId',
  'data',
  'from',
  'gas',
  'gasLimit',
  'gasPrice',
  'maxFeePerGas',
  'maxPriorityFeePerGas',
  'nonce',
  'to',
  'type',
  'value',
]);

/**
 * Maximum nesting depth permitted anywhere inside a transaction params
 * object. Legitimate params (including `accessList` and
 * `authorizationList`) are at most ~4 levels deep. Anything beyond this is
 * treated as a denial-of-service attempt against downstream normalization
 * (which recurses and can overflow the call stack in native/WASM code).
 */
export const MAX_TRANSACTION_PARAM_DEPTH = 10;

/**
 * Recursively checks that a value does not nest beyond
 * `MAX_TRANSACTION_PARAM_DEPTH`.
 *
 * @param value - The value to check.
 * @param depth - The current depth. Callers should pass `0`.
 * @throws rpcErrors.invalidInput() if the value nests too deeply.
 */
function assertMaxDepth(value: unknown, depth: number): void {
  if (depth > MAX_TRANSACTION_PARAM_DEPTH) {
    throw rpcErrors.invalidInput();
  }

  if (value === null || typeof value !== 'object') {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      assertMaxDepth(item, depth + 1);
    }
    return;
  }

  for (const key of Object.getOwnPropertyNames(
    value as Record<string, unknown>,
  )) {
    assertMaxDepth((value as Record<string, unknown>)[key], depth + 1);
  }
}

/**
 * Validates that `eth_sendTransaction` / `eth_signTransaction` params contain
 * only spec-defined top-level keys and no excessively-nested structures.
 *
 * This guards against malicious dapps attaching deeply-nested junk fields
 * (e.g. `{ from, to, data, test: { b: { b: { b: /* ~1200 levels *\/ } } } }`)
 * that would otherwise crash downstream normalization or PPOM WASM with a
 * `RangeError: Maximum call stack size exceeded`, bypassing security checks.
 *
 * @param params - The transaction params object supplied by the dapp.
 * @throws rpcErrors.invalidInput() if params is not a plain object, contains
 * an extraneous top-level key, or nests beyond `MAX_TRANSACTION_PARAM_DEPTH`.
 */
export function validateTransactionParams(params: unknown): void {
  if (params === null || typeof params !== 'object' || Array.isArray(params)) {
    throw rpcErrors.invalidInput();
  }

  const hasExtraneousKey = Object.keys(params).some(
    (key) => !ALLOWED_TRANSACTION_PARAM_KEYS.has(key),
  );

  if (hasExtraneousKey) {
    throw rpcErrors.invalidInput();
  }

  assertMaxDepth(params, 0);
}
