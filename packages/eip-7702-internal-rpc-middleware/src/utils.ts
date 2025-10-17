import { providerErrors, rpcErrors } from '@metamask/rpc-errors';
import type { Struct, StructError } from '@metamask/superstruct';
import { validate } from '@metamask/superstruct';
import type { Hex } from '@metamask/utils';
import { isHexAddress } from '@metamask/utils';

/**
 * Validates address format, checks user eth_accounts permissions.
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
    typeof address !== 'string' ||
    address.length === 0 ||
    !isHexAddress(address)
  ) {
    throw rpcErrors.invalidParams({
      message: `Invalid parameters: must provide an EVM address.`,
    });
  }

  // Ensure that an "unauthorized" error is thrown if the requester
  // does not have the `eth_accounts` permission.
  const accounts = await getPermittedAccountsForOrigin(origin);

  // Validate and convert each account address to normalized Hex
  const normalizedAccounts: string[] = accounts.map((accountAddress) =>
    accountAddress.toLowerCase(),
  );

  if (!normalizedAccounts.includes(address.toLowerCase())) {
    throw providerErrors.unauthorized();
  }

  return address;
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
