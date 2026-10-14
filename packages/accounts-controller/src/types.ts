// This file contains duplicate code from MultichainNetworkController.ts to avoid circular dependencies
// It should be refactored to avoid duplication

import {
  SnapKeyringAccountAssetListUpdatedEvent,
  SnapKeyringAccountBalancesUpdatedEvent,
  SnapKeyringAccountTransactionsUpdatedEvent,
} from '@metamask/eth-snap-keyring';
import type { CaipChainId } from '@metamask/keyring-api';
import type { NetworkClientId } from '@metamask/network-controller';

export type MultichainNetworkControllerNetworkDidChangeEvent = {
  type: `MultichainNetworkController:networkDidChange`;
  payload: [NetworkClientId | CaipChainId];
};

export type SnapAccountServiceAccountBalancesUpdatedEvent = {
  type: `SnapAccountService:accountBalancesUpdated`;
  payload: SnapKeyringAccountBalancesUpdatedEvent['payload'];
};

export type SnapAccountServiceAccountTransactionsUpdatedEvent = {
  type: `SnapAccountService:accountTransactionsUpdated`;
  payload: SnapKeyringAccountTransactionsUpdatedEvent['payload'];
};

export type SnapAccountServiceAccountAssetListUpdatedEvent = {
  type: `SnapAccountService:accountAssetListUpdated`;
  payload: SnapKeyringAccountAssetListUpdatedEvent['payload'];
};
