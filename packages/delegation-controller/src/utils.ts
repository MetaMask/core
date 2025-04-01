import type { DelegationStruct } from '@metamask-private/delegator-core-viem';

import type { Delegation } from './types';

export { hexToNumber } from '@metamask/utils';

/**
 * Serializes a delegation to a form that can be stored in the controller state.
 *
 * @param delegation - DelegationStruct
 * @returns The serialized delegation (Delegation).
 */
export function serializeDelegation(delegation: DelegationStruct): Delegation {
  return {
    ...delegation,
    salt: delegation.salt.toString(),
  };
}

/**
 * Parses a delegation from a serialized form.
 *
 * @param delegation - The serialized delegation.
 * @returns The parsed delegation (DelegationStruct).
 */
export function parseDelegation(delegation: Delegation): DelegationStruct {
  return {
    ...delegation,
    salt: BigInt(delegation.salt),
  };
}
