import { InfuraNetworkType } from '@metamask/controller-utils';
import type { SafeEventEmitterProvider } from '@metamask/eth-json-rpc-provider';
import { CaipChainId } from '@metamask/utils';
import type { PollingBlockTracker } from 'eth-block-tracker';

export type Provider = SafeEventEmitterProvider;

export type BlockTracker = PollingBlockTracker;

/**
 * The type of network client that can be created.
 */
export enum NetworkClientType {
  Custom = 'custom',
  Infura = 'infura',
}

/**
 * A configuration object that can be used to create a client for a custom
 * network.
 */
export type CustomNetworkClientConfiguration = {
  caipChainId: CaipChainId;
  rpcUrl: string;
  type: NetworkClientType.Custom;
};

/**
 * A configuration object that can be used to create a client for an Infura
 * network.
 */
export type InfuraNetworkClientConfiguration = {
  network: InfuraNetworkType;
  infuraProjectId: string;
  type: NetworkClientType.Infura;
};

/**
 * A configuration object that can be used to create a client for a network.
 */
export type NetworkClientConfiguration =
  | CustomNetworkClientConfiguration
  | InfuraNetworkClientConfiguration;
