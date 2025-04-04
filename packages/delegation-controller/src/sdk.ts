import * as SDK from '@metamask-private/delegator-core-viem';

import type { Address, Delegation, Hex } from './types';
import { parseDelegation, serializeDelegation } from './utils';

export { SDK };

type CreateDelegationOptions = {
  delegator: Address;
  delegate?: Address;
  caveats: SDK.Caveats;
  authority?: Hex;
  salt?: Hex;
};

/**
 *
 * @param opts - The options for creating a delegation.
 * @returns The delegation.
 */
export function createDelegation(opts: CreateDelegationOptions): Delegation {
  const { delegator, delegate, caveats, authority, salt } = opts;
  const _salt = salt ? BigInt(salt) : undefined;
  let _delegation: SDK.DelegationStruct;

  if (authority && delegate) {
    _delegation = SDK.createDelegation(
      delegate,
      delegator,
      authority,
      caveats,
      _salt,
    );
  } else if (authority && !delegate) {
    _delegation = SDK.createOpenDelegation(
      delegator,
      authority,
      caveats,
      _salt,
    );
  } else if (!authority && delegate) {
    _delegation = SDK.createRootDelegation(delegate, delegator, caveats, _salt);
  } else {
    // !authority && !delegate
    _delegation = SDK.createOpenRootDelegation(delegator, caveats, _salt);
  }

  return serializeDelegation(_delegation);
}

/**
 *
 * @param chainId - The chain ID.
 * @returns The caveat builder.
 */
export function createCaveatBuilder(chainId: number) {
  const env = SDK.getDeleGatorEnvironment(chainId);
  return SDK.createCaveatBuilder(env);
}

type EncodeRedeemDelegationsOptions = {
  delegations: Delegation[][];
  modes: SDK.ExecutionMode[];
  executions: SDK.ExecutionStruct[][];
};

/**
 *
 * @param opts - The options for encoding redeem delegations.
 * @returns The encoded redeem delegations.
 */
export function encodeRedeemDelegations(opts: EncodeRedeemDelegationsOptions) {
  const { delegations, modes, executions } = opts;
  const _delegations = delegations.map((delegation) =>
    delegation.map(parseDelegation),
  );

  return SDK.DelegationFramework.encode.redeemDelegations(
    _delegations,
    modes,
    executions,
  );
}

/**
 *
 * @param delegation - The delegation.
 * @returns The hash of the delegation.
 */
export function getDelegationHash(delegation: Delegation) {
  const _delegation = parseDelegation(delegation);
  return SDK.getDelegationHashOffchain(_delegation);
}
