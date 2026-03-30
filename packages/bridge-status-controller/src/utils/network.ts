/* eslint-disable @typescript-eslint/explicit-function-return-type */
import {
  formatChainIdToHex,
  GenericQuoteRequest,
} from '@metamask/bridge-controller';

import { BridgeStatusControllerMessenger } from '../types';

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
