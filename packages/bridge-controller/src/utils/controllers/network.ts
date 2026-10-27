/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { NetworkControllerFindNetworkClientIdByChainIdAction } from '@metamask/network-controller';

import type {
  BridgeControllerMessenger,
  GenericQuoteRequest,
} from '../../types.js';
import { formatChainIdToHex } from '../caip-formatters.js';

export const getNetworkClientIdByChainId = <
  T extends {
    call(
      action: NetworkControllerFindNetworkClientIdByChainIdAction['type'],
      chainId: Parameters<
        NetworkControllerFindNetworkClientIdByChainIdAction['handler']
      >[0],
    ): ReturnType<
      NetworkControllerFindNetworkClientIdByChainIdAction['handler']
    >;
  },
>(
  messenger: T,
  chainId: GenericQuoteRequest['srcChainId'],
) => {
  const hexChainId = formatChainIdToHex(chainId);
  return messenger.call(
    'NetworkController:findNetworkClientIdByChainId',
    hexChainId,
  );
};

export const getNetworkClientByChainId = (
  messenger: BridgeControllerMessenger,
  chainId: GenericQuoteRequest['srcChainId'],
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
