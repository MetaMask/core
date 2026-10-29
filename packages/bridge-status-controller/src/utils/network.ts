/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { getNetworkClientIdByChainId } from '@metamask/bridge-controller';
import type { GenericQuoteRequest } from '@metamask/bridge-controller';
import type { NetworkClient } from '@metamask/network-controller';

import type { BridgeStatusControllerMessenger } from '../types.js';

export const getSelectedChainId = (
  messenger: BridgeStatusControllerMessenger,
) => {
  const { selectedNetworkClientId } = messenger.call(
    'NetworkController:getState',
  );
  const networkClient = messenger.call(
    'NetworkController:getNetworkClientById',
    selectedNetworkClientId,
  );
  return networkClient.configuration.chainId;
};

export const getNetworkProviderByChainId = (
  messenger: BridgeStatusControllerMessenger,
  chainId: GenericQuoteRequest['srcChainId'],
): NetworkClient['provider'] => {
  const networkClientId = getNetworkClientIdByChainId(messenger, chainId);
  if (!networkClientId) {
    throw new Error(`No network client found for chainId: ${chainId}`);
  }

  return messenger.call(
    'NetworkController:getNetworkClientById',
    networkClientId,
  ).provider;
};
