import type { NetworkConfiguration as _NetworkConfiguration } from '@metamask/network-controller';

// TODO - replace shim once we update NetworkController type
export type NetworkConfiguration = _NetworkConfiguration & {
  lastUpdatedAt?: number;
};

export type RemoteNetworkConfiguration = NetworkConfiguration & {
  /**
   * `version` property. Enables future versioning of the `NetworkConfiguration` shape
   */
  v: '1';
  /**
   * isDeleted property, used for soft deletion & for correct syncing
   * (delete vs upload network)
   */
  d?: boolean;
};

export const toRemoteNetworkConfiguration = (
  network: NetworkConfiguration,
): RemoteNetworkConfiguration => {
  return {
    ...network,
    v: '1',
  };
};

export const toNetworkConfiguration = (
  network: RemoteNetworkConfiguration,
): NetworkConfiguration => {
  const { v: _v, d: _d, ...originalNetwork } = network;
  return originalNetwork;
};
