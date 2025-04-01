import type { AccountsControllerGetSelectedAccountAction } from '@metamask/accounts-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedMessenger,
} from '@metamask/base-controller';
import type { KeyringControllerSignTypedMessageAction } from '@metamask/keyring-controller';
import type { NetworkControllerGetSelectedChainIdAction } from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';
import {
  SIGNABLE_DELEGATION_TYPED_DATA as DELEGATION_TYPED_DATA,
  type DelegationStruct,
} from '@metamask-private/delegator-core-viem';

import type {
  controllerName,
  DelegationController,
} from './delegation-controller';

export type Delegation = Omit<DelegationStruct, 'salt'> & { salt: string };

export type DelegationMetadata = {
  chainId: number;
  label: string;
};

const EIP712Domain = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
];

export const SIGNABLE_DELEGATION_TYPED_DATA = {
  EIP712Domain,
  ...DELEGATION_TYPED_DATA,
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
  | AccountsControllerGetSelectedAccountAction
  | NetworkControllerGetSelectedChainIdAction;

type AllowedEvents = never;

export type DelegationControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  DelegationControllerActions | AllowedActions,
  DelegationControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;
