import type { InfuraNetworkType } from '@metamask/controller-utils';
import type { BlockTracker as BaseBlockTracker } from '@metamask/eth-block-tracker';
import type { SafeEventEmitterProvider } from '@metamask/eth-json-rpc-provider';
import type { Hex } from '@metamask/utils';

export type Provider = SafeEventEmitterProvider;

export type BlockTracker = BaseBlockTracker & {
  checkForLatestBlock(): Promise<string>;
};

/**
 * The type of network client that can be created.
 */
export enum NetworkClientType {
  Custom = 'custom',
  Infura = 'infura',
}

/**
 * A configuration object that can be used to create a client for a network.
 */
type CommonNetworkClientConfiguration = {
  chainId: Hex;
  failoverRpcUrls: string[];
  ticker: string;
};

/**
 * A configuration object that can be used to create a client for a custom
 * network.
 */
export type CustomNetworkClientConfiguration =
  CommonNetworkClientConfiguration & {
    rpcUrl: string;
    type: NetworkClientType.Custom;
  };

/**
 * A configuration object that can be used to create a client for an Infura
 * network.
 */
export type InfuraNetworkClientConfiguration =
  CommonNetworkClientConfiguration & {
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
