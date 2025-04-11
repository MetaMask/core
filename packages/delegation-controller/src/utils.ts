import type { TypedMessageParams } from '@metamask/keyring-controller';

import { SIGNABLE_DELEGATION_TYPED_DATA } from './constants';
import type { Address, Delegation } from './types';

/**
 * Checks if two addresses are equal.
 *
 * @param a - The first address.
 * @param b - The second address.
 * @returns True if the addresses are equal, false otherwise.
 */
export function isAddressEqual(a: Address, b: Address) {
  return a.toLowerCase() === b.toLowerCase();
}

type CreateTypedMessageParamsOptions = {
  chainId: number;
  from: Address;
  delegation: Delegation;
  verifyingContract: Address;
};

/**
 *
 * @param opts - The options for creating typed message params.
 * @returns The typed message params.
 */
export function createTypedMessageParams(
  opts: CreateTypedMessageParamsOptions,
): TypedMessageParams {
  const { chainId, from, delegation, verifyingContract } = opts;

  const data: TypedMessageParams = {
    data: {
      types: SIGNABLE_DELEGATION_TYPED_DATA,
      primaryType: 'Delegation',
      domain: {
        chainId,
        name: 'DelegationManager',
        version: '1',
        verifyingContract,
      },
      message: delegation,
    },
    from,
  };

  return data;
}
