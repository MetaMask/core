import type { NetworkConfiguration } from '@metamask/network-controller';
import { RpcEndpointType } from '@metamask/network-controller';

import type { RemoteNetworkConfiguration } from '../types';

export type RPCEndpoint = NetworkConfiguration['rpcEndpoints'][number];

export const createMockNetworkConfiguration = (
  override?: Partial<NetworkConfiguration>,
): NetworkConfiguration => {
  return {
    chainId: '0x1337',
    blockExplorerUrls: ['https://etherscan.io'],
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

export const createMockCustomRpcEndpoint = (
  override: Partial<Extract<RPCEndpoint, { type: RpcEndpointType.Custom }>>,
): RPCEndpoint => {
  return {
    type: RpcEndpointType.Custom,
    networkClientId: '1111-1111-1111',
    url: `https://FAKE_RPC/`,
    ...override,
  } as RPCEndpoint;
};

export const createMockInfuraRpcEndpoint = (): RPCEndpoint => {
  return {
    type: RpcEndpointType.Infura,
    networkClientId: 'mainnet',
    url: `https://mainnet.infura.io/v3/{infuraProjectId}`,
  };
};
