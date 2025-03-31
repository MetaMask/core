import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedMessenger,
} from '@metamask/base-controller';
import type { Hex } from '@metamask/utils';
import type { DelegationStruct } from '@metamask-private/delegator-core-viem';

import type {
  controllerName,
  DelegationController,
} from './delegation-controller';

export type Delegation = Omit<DelegationStruct, 'salt'> & { salt: string };

export type DelegationMetadata = {
  chainId: number;
  label: string;
};

export type DelegationEntry = {
  data: Delegation;
  meta: DelegationMetadata;
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

export type DelegationControllerActions =
  | DelegationControllerGetStateAction
  | DelegationControllerStoreAction;

export type DelegationControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  DelegationControllerState
>;

export type DelegationControllerEvents = DelegationControllerStateChangeEvent;

type AllowedActions = never;
type AllowedEvents = never;

export type DelegationControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  DelegationControllerActions | AllowedActions,
  DelegationControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;
