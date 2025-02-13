// This file contains duplicate code from MultichainNetworkController.ts to avoid circular dependencies
// It should be refactored to avoid duplication

import type { CaipChainId } from '@metamask/keyring-api';
import type { NetworkClientId } from '@metamask/network-controller';

export type MultichainNetworkControllerNetworkDidChangeEvent = {
  type: `MultichainNetworkController:networkDidChange`;
  payload: [NetworkClientId | CaipChainId];
};
