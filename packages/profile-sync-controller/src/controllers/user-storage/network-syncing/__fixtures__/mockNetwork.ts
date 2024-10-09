import type {
  NetworkConfiguration,
  RemoteNetworkConfiguration,
} from '../types';

export const createMockNetworkConfiguration = (
  override?: Partial<NetworkConfiguration>,
): NetworkConfiguration => {
  return {
    chainId: '0x1337',
    blockExplorerUrls: [],
    defaultRpcEndpointIndex: 0,
    name: 'Mock Network',
    nativeCurrency: 'MOCK TOKEN',
    rpcEndpoints: [],
    defaultBlockExplorerUrlIndex: 0,
    ...override,
  };
};

export const createMockRemoteNetworkConfiguration = (
  override?: Partial<RemoteNetworkConfiguration>,
): RemoteNetworkConfiguration => {
  return {
    v: '1',
    ...createMockNetworkConfiguration(),
    ...override,
  };
};
