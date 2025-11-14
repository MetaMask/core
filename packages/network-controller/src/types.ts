import type { InfuraNetworkType, ChainId } from '@metamask/controller-utils';
import type { BlockTracker as BaseBlockTracker } from '@metamask/eth-block-tracker';
import type { InternalProvider } from '@metamask/eth-json-rpc-provider';
import type { MiddlewareContext } from '@metamask/json-rpc-engine/v2';
import type { Hex } from '@metamask/utils';

export type Provider = InternalProvider<
  MiddlewareContext<
    { origin: string; skipCache: boolean } & Record<string, unknown>
  >
>;

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
  failoverRpcUrls?: string[];
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

/**
 * The Chain ID representing the additional networks to be included as default.
 */
export type AdditionalDefaultNetwork = (typeof ChainId)[
  | 'megaeth-testnet'
  | 'monad-testnet'];
