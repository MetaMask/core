import * as sdk from '@metamask-private/delegator-core-viem';

import type { Address, Delegation, Hex } from './types';
import { parseDelegation, serializeDelegation } from './utils';

export { sdk };

type CreateDelegationOptions = {
  delegator: Address;
  delegate?: Address;
  caveats: sdk.Caveats;
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
  let _delegation: sdk.DelegationStruct;

  if (authority && delegate) {
    _delegation = sdk.createDelegation(
      delegate,
      delegator,
      authority,
      caveats,
      _salt,
    );
  } else if (authority && !delegate) {
    _delegation = sdk.createOpenDelegation(
      delegator,
      authority,
      caveats,
      _salt,
    );
  } else if (!authority && delegate) {
    _delegation = sdk.createRootDelegation(delegate, delegator, caveats, _salt);
  } else {
    // !authority && !delegate
    _delegation = sdk.createOpenRootDelegation(delegator, caveats, _salt);
  }

  return serializeDelegation(_delegation);
}

/**
 *
 * @param chainId - The chain ID.
 * @returns The caveat builder.
 */
export function createCaveatBuilder(chainId: number) {
  const env = sdk.getDeleGatorEnvironment(chainId);
  return sdk.createCaveatBuilder(env);
}

type EncodeRedeemDelegationsOptions = {
  delegations: Delegation[][];
  modes: sdk.ExecutionMode[];
  executions: sdk.ExecutionStruct[][];
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

  return sdk.DelegationFramework.encode.redeemDelegations(
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
  return sdk.getDelegationHashOffchain(_delegation);
}
