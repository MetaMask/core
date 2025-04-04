import type { AccountsControllerGetSelectedAccountAction } from '@metamask/accounts-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedMessenger,
} from '@metamask/base-controller';
import type { KeyringControllerSignTypedMessageAction } from '@metamask/keyring-controller';
import type { Address, Hex } from 'viem';

import type {
  controllerName,
  DelegationController,
} from './delegation-controller';
import type { Delegation } from './sdk';

export type { Address, Hex } from 'viem';

export type DelegationMetadata = {
  chainId: number;
  label: string;
};

export type DelegationEntry = {
  data: Delegation;
  meta: DelegationMetadata;
};

export type FilterByHash = {
  hash: Hex;
};

export type FilterByDelegator = {
  delegator: Address;
  delegate?: Address;
  label?: string;
};

export type FilterByDelegate = {
  delegate: Address;
  delegator?: Address;
  label?: string;
};

export type DelegationFilter =
  | FilterByHash
  | FilterByDelegator
  | FilterByDelegate;

export type DelegationControllerState = {
  delegations: {
    [hash: Hex]: DelegationEntry;
  };
};

export type DelegationControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  DelegationControllerState
>;

export type DelegationControllerStoreAction = {
  type: `${typeof controllerName}:store`;
  handler: DelegationController['store'];
};

export type DelegationControllerSignAction = {
  type: `${typeof controllerName}:sign`;
  handler: DelegationController['sign'];
};

export type DelegationControllerActions =
  | DelegationControllerGetStateAction
  | DelegationControllerStoreAction
  | DelegationControllerSignAction;

export type DelegationControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  DelegationControllerState
>;

export type DelegationControllerEvents = DelegationControllerStateChangeEvent;

export type AllowedActions =
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
