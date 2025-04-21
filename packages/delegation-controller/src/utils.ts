import type { TypedMessageParams } from '@metamask/keyring-controller';
import { getChecksumAddress } from '@metamask/utils';

import { SIGNABLE_DELEGATION_TYPED_DATA } from './constants';
import type { Address, Delegation, DelegationStruct, Hex } from './types';

/**
 * Checks if two hex strings are equal.
 *
 * @param a - The first hex string.
 * @param b - The second hex string.
 * @returns True if the hex strings are equal, false otherwise.
 */
export function isHexEqual(a: Hex, b: Hex) {
  return a.toLowerCase() === b.toLowerCase();
}

type CreateTypedMessageParamsOptions = {
  chainId: number;
  from: Address;
  delegation: Delegation;
  verifyingContract: Address;
};

/**
 * Converts a Delegation to a DelegationStruct.
 * The DelegationStruct is the format used in the Delegation Framework.
 *
 * @param delegation the delegation to format
 * @returns the formatted delegation
 */
export const toDelegationStruct = (
  delegation: Delegation,
): DelegationStruct => {
  const caveats = delegation.caveats.map((caveat) => ({
    enforcer: getChecksumAddress(caveat.enforcer),
    terms: caveat.terms,
    args: caveat.args,
  }));

  const salt = delegation.salt === '0x' ? 0n : BigInt(delegation.salt);

  return {
    delegate: getChecksumAddress(delegation.delegate),
    delegator: getChecksumAddress(delegation.delegator),
    authority: delegation.authority,
    caveats,
    salt,
    signature: delegation.signature,
  };
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
      message: toDelegationStruct(delegation),
    },
    from,
  };

  return data;
}
