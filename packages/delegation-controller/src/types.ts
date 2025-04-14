import type { AccountsControllerGetSelectedAccountAction } from '@metamask/accounts-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedMessenger,
} from '@metamask/base-controller';
import type { KeyringControllerSignTypedMessageAction } from '@metamask/keyring-controller';

import type {
  controllerName,
  DelegationController,
} from './DelegationController';

type Hex = `0x${string}`;
type Address = `0x${string}`;

export type { Address, Hex };

export type Caveat = {
  enforcer: Hex;
  terms: Hex;
  args: Hex;
};

/**
 * A delegation is a signed statement that gives a delegate permission to
 * act on behalf of a delegator. The permissions are defined by a set of caveats.
 * The caveats are a set of conditions that must be met in order for the delegation
 * to be valid.
 *
 * @see https://docs.gator.metamask.io/concepts/delegation
 */
export type Delegation = {
  /** The address of the delegate. */
  delegate: Hex;
  /** The address of the delegator. */
  delegator: Hex;
  /** The hash of the parent delegation, or the root authority if this is the root delegation. */
  authority: Hex;
  /** The terms of the delegation. */
  caveats: Caveat[];
  /** The salt used to generate the delegation signature. */
  salt: Hex;
  /** The signature of the delegation. */
  signature: Hex;
};

/** An unsigned delegation is a delegation without a signature. */
export type UnsignedDelegation = Omit<Delegation, 'signature'>;

export type DelegationStruct = Omit<Delegation, 'salt'> & {
  salt: bigint;
};

export type DelegationEntry = {
  tags: string[];
  chainId: Hex;
  delegation: Delegation;
  meta?: string;
};

export type DelegationFilter = {
  chainId?: Hex;
  tags?: string[];
  from?: Address;
};

export type DelegationControllerState = {
  delegations: {
    [hash: Hex]: DelegationEntry;
  };
};

export type DelegationControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  DelegationControllerState
>;

export type DelegationControllerSignDelegationAction = {
  type: `${typeof controllerName}:signDelegation`;
  handler: DelegationController['signDelegation'];
};

export type DelegationControllerStoreAction = {
  type: `${typeof controllerName}:store`;
  handler: DelegationController['store'];
};

export type DelegationControllerListAction = {
  type: `${typeof controllerName}:list`;
  handler: DelegationController['list'];
};

export type DelegationControllerRetrieveAction = {
  type: `${typeof controllerName}:retrieve`;
  handler: DelegationController['retrieve'];
};

export type DelegationControllerChainAction = {
  type: `${typeof controllerName}:chain`;
  handler: DelegationController['chain'];
};

export type DelegationControllerDeleteAction = {
  type: `${typeof controllerName}:delete`;
  handler: DelegationController['delete'];
};

export type DelegationControllerActions =
  | DelegationControllerGetStateAction
  | DelegationControllerSignDelegationAction
  | DelegationControllerStoreAction
  | DelegationControllerListAction
  | DelegationControllerRetrieveAction
  | DelegationControllerChainAction
  | DelegationControllerDeleteAction;

export type DelegationControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  DelegationControllerState
>;

export type DelegationControllerEvents = DelegationControllerStateChangeEvent;

type AllowedActions =
  | KeyringControllerSignTypedMessageAction
  | AccountsControllerGetSelectedAccountAction;

type AllowedEvents = never;

export type DelegationControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  DelegationControllerActions | AllowedActions,
  DelegationControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;
