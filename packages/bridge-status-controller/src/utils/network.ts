/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { formatChainIdToHex } from '@metamask/bridge-controller';
import type { GenericQuoteRequest } from '@metamask/bridge-controller';
import type { NetworkClient } from '@metamask/network-controller';

import type { BridgeStatusControllerMessenger } from '../types';

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

export const getNetworkClientIdByChainId = (
  messenger: BridgeStatusControllerMessenger,
  chainId: GenericQuoteRequest['srcChainId'],
) => {
  const hexChainId = formatChainIdToHex(chainId);
  return messenger.call(
    'NetworkController:findNetworkClientIdByChainId',
    hexChainId,
  );
};

export const getNetworkClientByChainId = (
  messenger: BridgeStatusControllerMessenger,
  chainId: GenericQuoteRequest['srcChainId'],
): NetworkClient['provider'] => {
  const networkClientId = getNetworkClientIdByChainId(messenger, chainId);

  const networkClient = messenger.call(
    'NetworkController:getNetworkClientById',
    networkClientId,
  );
  return networkClient.provider;
};
