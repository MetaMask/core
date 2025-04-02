import type { TypedMessageParams } from '@metamask/keyring-controller';

import { SIGNABLE_DELEGATION_TYPED_DATA } from './constants';
import { sdk } from './sdk';
import type { Address, Delegation } from './types';

/**
 * Serializes a delegation to a form that can be stored in the controller state.
 *
 * @param delegation - DelegationStruct
 * @returns The serialized delegation (Delegation).
 */
export function serializeDelegation(
  delegation: sdk.DelegationStruct,
): Delegation {
  return {
    ...delegation,
    salt: `0x${delegation.salt.toString(16)}`,
  };
}

/**
 * Parses a delegation from a serialized form.
 *
 * @param delegation - The serialized delegation.
 * @returns The parsed delegation (DelegationStruct).
 */
export function parseDelegation(delegation: Delegation): sdk.DelegationStruct {
  return {
    ...delegation,
    salt: BigInt(delegation.salt),
  };
}

type CreateTypedMessageParamsOptions = {
  chainId: number;
  from: Address;
  delegation: Delegation;
};

/**
 *
 * @param opts - The options for creating typed message params.
 * @returns The typed message params.
 */
export function createTypedMessageParams(
  opts: CreateTypedMessageParamsOptions,
): TypedMessageParams {
  const { chainId, from, delegation } = opts;
  const delegatorEnv = sdk.getDeleGatorEnvironment(chainId);

  const data: TypedMessageParams = {
    data: {
      types: SIGNABLE_DELEGATION_TYPED_DATA,
      primaryType: 'Delegation',
      domain: {
        chainId,
        name: 'DelegationManager',
        version: '1',
        verifyingContract: delegatorEnv.DelegationManager,
      },
      message: delegation,
    },
    from,
  };

  return data;
}
