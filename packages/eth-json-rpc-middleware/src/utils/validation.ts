import { providerErrors, rpcErrors } from '@metamask/rpc-errors';
import type { Struct, StructError } from '@metamask/superstruct';
import { validate } from '@metamask/superstruct';
import type { Hex } from '@metamask/utils';

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
