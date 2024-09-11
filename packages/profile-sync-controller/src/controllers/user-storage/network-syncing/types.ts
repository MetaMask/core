import type { NetworkConfiguration } from '@metamask/network-controller';

export type RemoteNetworkConfiguration = NetworkConfiguration & {
  v: '1';
  deleted?: boolean;
};
