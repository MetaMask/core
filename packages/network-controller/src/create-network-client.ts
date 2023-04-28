import Subprovider from 'web3-provider-engine/subproviders/provider';
import createInfuraProvider from 'eth-json-rpc-infura/src/createProvider';
import createMetamaskProvider from 'web3-provider-engine/zero';
import { InfuraNetworkType } from '@metamask/controller-utils';
import { assert, hasProperty } from '@metamask/utils';
import type { BlockTracker, Provider } from './types';

/**
 * The type of network client that can be created.
 */
export enum NetworkClientType {
  Custom = 'custom',
  Infura = 'infura',
}

/**
 * A configuration object that can be used to create a provider engine for a
 * custom network.
 */
type CustomNetworkConfiguration = {
  chainId?: string;
  rpcUrl: string;
  nickname?: string;
  ticker?: string;
  type: NetworkClientType.Custom;
};

/**
 * A configuration object that can be used to create a provider engine for an
 * Infura network.
 */
type InfuraNetworkConfiguration = {
  network: InfuraNetworkType;
  infuraProjectId: string;
  type: NetworkClientType.Infura;
};

/**
 * Create a JSON-RPC network client for a specific network.
 *
 * @param networkConfig - The network configuration.
 * @returns The network client.
 */
export function createNetworkClient(
  networkConfig: CustomNetworkConfiguration | InfuraNetworkConfiguration,
): { provider: Provider; blockTracker: BlockTracker } {
  const providerConfig =
    networkConfig.type === NetworkClientType.Infura
      ? buildInfuraNetworkProviderConfig(networkConfig)
      : buildCustomNetworkProviderConfig(networkConfig);

  // Cast needed because the `web3-provider-engine` type for `sendAsync`
  // incorrectly suggests that an array is accepted as the first parameter
  // of `sendAsync`. This (along with the bad type) will go away when we replace
  // `web3-provider-engine`.
  const provider = createMetamaskProvider(providerConfig) as Provider;

  assert(
    hasProperty(provider, '_blockTracker'),
    'Provider is missing block tracker.',
  );

  return { provider, blockTracker: provider._blockTracker };
}

/**
 * Construct the configuration object for a provider engine that can be used to
 * interface with an Infura network.
 *
 * @param networkConfig - Network configuration.
 * @returns The complete provider engine configuration object.
 */
function buildInfuraNetworkProviderConfig(
  networkConfig: InfuraNetworkConfiguration,
) {
  const infuraProvider = createInfuraProvider({
    network: networkConfig.network,
    projectId: networkConfig.infuraProjectId,
  });
  const infuraSubprovider = new Subprovider(infuraProvider);
  return {
    dataSubprovider: infuraSubprovider,
    engineParams: {
      blockTrackerProvider: infuraProvider,
      pollingInterval: 12000,
    },
  };
}

/**
 * Construct the configuration object for a provider engine that can be used to
 * interface with a custom network.
 *
 * @param networkConfig - Network configuration.
 * @returns The complete provider engine configuration object.
 */
function buildCustomNetworkProviderConfig(
  networkConfig: CustomNetworkConfiguration,
) {
  return {
    ...networkConfig,
    engineParams: { pollingInterval: 12000 },
  };
}
