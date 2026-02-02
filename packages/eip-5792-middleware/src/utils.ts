import type { KeyringTypes } from '@metamask/keyring-controller';
import { JsonRpcError, providerErrors, rpcErrors } from '@metamask/rpc-errors';
import type { Struct, StructError } from '@metamask/superstruct';
import { validate } from '@metamask/superstruct';
import type { Hex, JsonRpcRequest } from '@metamask/utils';

import { EIP5792ErrorCode } from './constants';
import type { EIP5792Messenger } from './types';

/**
 * Retrieves the keyring type for a given account address.
 *
 * @param accountAddress - The account address to look up.
 * @param messenger - Messenger instance for controller communication.
 * @returns The keyring type associated with the account.
 * @throws JsonRpcError if the account type is unknown or not found.
 */
export function getAccountKeyringType(
  accountAddress: Hex,
  messenger: EIP5792Messenger,
): KeyringTypes {
  const { accounts } = messenger.call(
    'AccountsController:getState',
  ).internalAccounts;

  const account = Object.values(accounts).find(
    (acc) => acc.address.toLowerCase() === accountAddress.toLowerCase(),
  );

  const keyringType = account?.metadata?.keyring?.type;

  if (!keyringType) {
    throw new JsonRpcError(
      EIP5792ErrorCode.RejectedUpgrade,
      'EIP-7702 upgrade not supported as account type is unknown',
    );
  }

  return keyringType as KeyringTypes;
}

/**
 * Validates and normalizes a keyholder address for EIP-5792 operations.
 *
 * @param address - The Ethereum address to validate and normalize.
 * @param options - Configuration object containing the getPermittedAccountsForOrigin function.
 * @param options.getPermittedAccountsForOrigin - Function to retrieve permitted accounts for the requester's origin.
 * @returns A normalized (lowercase) hex address if valid and authorized.
 * @throws JsonRpcError with unauthorized error if the requester doesn't have      permission to access the address.
 * @throws JsonRpcError with invalid params if the address format is invalid.
 */
export async function validateAndNormalizeKeyholder(
  address: Hex,
  { getPermittedAccountsForOrigin }: { getPermittedAccountsForOrigin: () => Promise<string[]> },
): Promise<Hex> {
  if (
    typeof address === 'string' &&
    address.length > 0 &&
    resemblesAddress(address)
  ) {
    // Ensure that an "unauthorized" error is thrown if the requester
    // does not have the `eth_accounts` permission.
    const accounts = await getPermittedAccountsForOrigin();

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
      formatValidationError(error, `Invalid params`),
    );
  }
}

/**
 * Checks if a string resembles an Ethereum address format.
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
