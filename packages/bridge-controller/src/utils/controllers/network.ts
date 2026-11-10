/* eslint-disable @typescript-eslint/explicit-function-return-type */

import type { BridgeControllerMessenger } from '../../types.js';

const getNetworkClientIdByChainId = (
  messenger: BridgeControllerMessenger,
  chainId: `0x${string}`,
) => {
  return messenger.call(
    'NetworkController:findNetworkClientIdByChainId',
    chainId,
  );
};

export const getNetworkClientByChainId = (
  messenger: BridgeControllerMessenger,
  chainId: `0x${string}`,
) => {
  const networkClientId = getNetworkClientIdByChainId(messenger, chainId);
  if (!networkClientId) {
    throw new Error(`No network client found for chainId: ${chainId}`);
  }

  return messenger.call(
    'NetworkController:getNetworkClientById',
    networkClientId,
  );
};
