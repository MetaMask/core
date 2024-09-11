import type { NetworkConfiguration } from '@metamask/network-controller';

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
