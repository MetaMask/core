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

export type DelegationEntry = {
  tags: string[];
  chainId: number;
  data: Delegation;
  meta?: string;
};

export type DelegationFilter = {
  chainId?: number;
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
