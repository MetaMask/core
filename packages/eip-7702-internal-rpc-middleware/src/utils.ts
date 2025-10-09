import { providerErrors, rpcErrors } from '@metamask/rpc-errors';
import type { Struct, StructError } from '@metamask/superstruct';
import { validate } from '@metamask/superstruct';
import type { Hex } from '@metamask/utils';

/**
 * Validates address format, checks user eth_accounts permissions, and normalizes to lowercase.
 *
 * @param address - The Ethereum address to validate and normalize.
 * @param origin - The origin string for permission checking.
 * @param getPermittedAccountsForOrigin - Function to retrieve permitted accounts for the origin.
 * @returns A normalized (lowercase) hex address if valid and authorized.
 * @throws JsonRpcError with unauthorized error if the requester doesn't have permission to access the address.
 * @throws JsonRpcError with invalid params if the address format is invalid.
 */
export async function validateAndNormalizeAddress(
  address: Hex,
  origin: string,
  getPermittedAccountsForOrigin: (origin: string) => Promise<string[]>,
): Promise<Hex> {
  if (
    typeof address === 'string' &&
    address.length > 0 &&
    resemblesAddress(address)
  ) {
    // Ensure that an "unauthorized" error is thrown if the requester
    // does not have the `eth_accounts` permission.
    const accounts = await getPermittedAccountsForOrigin(origin);

    const normalizedAccounts: Hex[] = accounts.map(
      (accountAddress) => accountAddress.toLowerCase() as Hex,
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
 * Validates parameters against a Superstruct schema and throws an error if validation fails.
 *
 * @param value - The value to validate against the struct schema.
 * @param struct - The Superstruct schema to validate against.
 * @throws JsonRpcError with invalid params if the value doesn't match the struct schema.
 */
export function validateParams<ParamsType>(
  value: unknown | ParamsType,
  struct: Struct<ParamsType>,
): asserts value is ParamsType {
  const [error] = validate(value, struct);

  if (error) {
    throw rpcErrors.invalidParams(
      formatValidationError(error, 'Invalid parameters'),
    );
  }
}

/**
 * Checks if a string resembles an Ethereum address format (basic check).
 *
 * @param str - The string to check for address-like format.
 * @returns True if the string has the correct length for an Ethereum address.
 */
export function resemblesAddress(str: string): boolean {
  // hex prefix 2 + 20 bytes
  return str.length === 2 + 20 * 2;
}

/**
 * Formats a Superstruct validation error into a human-readable string.
 *
 * @param error - The Superstruct validation error to format.
 * @param message - The base error message to prepend to the formatted details.
 * @returns A formatted error message string with validation failure details.
 */
function formatValidationError(error: StructError, message: string): string {
  return `${message}\n\n${error
    .failures()
    .map(
      (f) => `${f.path.join(' > ')}${f.path.length ? ' - ' : ''}${f.message}`,
    )
    .join('\n')}`;
}
