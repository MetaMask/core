import type { TypedMessageParams } from '@metamask/keyring-controller';

import { SIGNABLE_DELEGATION_TYPED_DATA } from './constants';
import { getDeleGatorEnvironment, type Delegation } from './sdk';
import type { Address } from './types';

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
  const delegatorEnv = getDeleGatorEnvironment(chainId);

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
