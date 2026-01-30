import { providerErrors, rpcErrors } from '@metamask/rpc-errors';
import type { Struct, StructError } from '@metamask/superstruct';
import { validate } from '@metamask/superstruct';
import type { Hex } from '@metamask/utils';

import { parseTypedMessage } from './normalize';
import type { WalletMiddlewareContext } from '../wallet';

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
