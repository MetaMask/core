import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import type { KeyringControllerSignTypedMessageAction } from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';

import type { controllerName } from './DelegationController';
import type { DelegationControllerMethodActions } from './DelegationController-method-action-types';

type Hex = `0x${string}`;
type Address = `0x${string}`;

export type { Address, Hex };

/**
 * A version agnostic blob of contract addresses required for the DeleGator system to function.
 */
export type DeleGatorEnvironment = {
  DelegationManager: Hex;
  EntryPoint: Hex;
  SimpleFactory: Hex;
  implementations: {
    [implementation: string]: Hex;
  };
  caveatEnforcers: {
    [enforcer: string]: Hex;
  };
};

/**
 * A delegation caveat is a condition that must be met in order for a delegation
 * to be valid. The caveat is defined by an enforcer, terms, and arguments.
 *
 * @see https://docs.gator.metamask.io/concepts/caveat-enforcers
 */
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

// Empty controller state (signing-only; no persisted fields).
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type DelegationControllerState = {};

export type DelegationControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  DelegationControllerState
>;

export type DelegationControllerActions =
  | DelegationControllerGetStateAction
  | DelegationControllerMethodActions;

export type DelegationControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  DelegationControllerState
>;

export type DelegationControllerEvents = DelegationControllerStateChangeEvent;

type AllowedActions = KeyringControllerSignTypedMessageAction;

type AllowedEvents = never;

export type DelegationControllerMessenger = Messenger<
  typeof controllerName,
  DelegationControllerActions | AllowedActions,
  DelegationControllerEvents | AllowedEvents
>;
