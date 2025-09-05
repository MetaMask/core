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
 *
 * @param address a
 * @param req a
 * @param param2 s
 * @param param2.getAccounts s
 * @returns s
 */
export async function validateAndNormalizeKeyholder(
  address: Hex,
  req: JsonRpcRequest,
  { getAccounts }: { getAccounts: (req: JsonRpcRequest) => Promise<string[]> },
): Promise<Hex> {
  if (
    typeof address === 'string' &&
    address.length > 0 &&
    resemblesAddress(address)
  ) {
    // Ensure that an "unauthorized" error is thrown if the requester
    // does not have the `eth_accounts` permission.
    const accounts = await getAccounts(req);

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
 *
 * @param value -
 * @param struct -
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
 *
 * @param str a
 * @returns a
 */
export function resemblesAddress(str: string): boolean {
  // hex prefix 2 + 20 bytes
  return str.length === 2 + 20 * 2;
}

/**
 *
 * @param error a
 * @param message s
 * @returns s
 */
function formatValidationError(error: StructError, message: string): string {
  return `${message}\n\n${error
    .failures()
    .map(
      (f) => `${f.path.join(' > ')}${f.path.length ? ' - ' : ''}${f.message}`,
    )
    .join('\n')}`;
}
