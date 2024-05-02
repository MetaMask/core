import type { InfuraNetworkType } from '@metamask/controller-utils';
import {
  BUILT_IN_NETWORKS,
  isInfuraNetworkType,
  toHex,
} from '@metamask/controller-utils';

import { FakeBlockTracker } from '../../../tests/fake-block-tracker';
import { FakeProvider } from '../../../tests/fake-provider';
import type { FakeProviderStub } from '../../../tests/fake-provider';
import type {
  BuiltInNetworkClientId,
  CustomNetworkClientId,
  NetworkClient,
  NetworkClientConfiguration,
  NetworkClientId,
  NetworkController,
} from '../src';
import type { AutoManagedNetworkClient } from '../src/create-auto-managed-network-client';
import type {
  CustomNetworkClientConfiguration,
  InfuraNetworkClientConfiguration,
} from '../src/types';
import { NetworkClientType } from '../src/types';

/**
 * Builds an object that satisfies the NetworkClient shape, but using a fake
 * provider and block tracker which doesn't make any requests.
 *
 * @param args - Arguments to this function.
 * @param args.configuration - The desired network client configuration.
 * @param args.providerStubs - Objects that allow for stubbing specific provider
 * requests.
 * @returns The fake network client.
 */
function buildFakeNetworkClient({
  configuration,
  providerStubs = [],
}: {
  configuration: NetworkClientConfiguration;
  providerStubs?: FakeProviderStub[];
}): NetworkClient {
  return {
    configuration,
    provider: new FakeProvider({ stubs: providerStubs }),
    blockTracker: new FakeBlockTracker(),
    destroy: () => {
      // do nothing
    },
  };
}

/**
 * The `getNetworkClientById` method on NetworkController (and thus, the
 * `NetworkController:getNetworkClientById` controller action) is difficult to
 * mock because it needs to be able to return either an Infura network client or
 * a custom network client. However, a test may want to return specific network
 * clients with specific network client configurations for specific network
 * client IDs. This function makes that easier by allowing the consumer to
 * specify a map of network client ID to network client configuration, handling
 * the logic appropriately as well as defining the correct overloads for the
 * mock version of `getNetworkClientById`.
 *
 * @param mockNetworkClientConfigurationsByNetworkClientId - Allows for defining
 * the network client configuration — and thus the network client itself — that
 * belongs to a particular network client ID.
 * @returns The mock version of `getNetworkClientById`.
 */
export function buildMockGetNetworkClientById(
  mockNetworkClientConfigurationsByNetworkClientId: Record<
    NetworkClientId,
    NetworkClientConfiguration
  >,
): NetworkController['getNetworkClientById'] {
  function getNetworkClientById(
    networkClientId: BuiltInNetworkClientId,
  ): AutoManagedNetworkClient<InfuraNetworkClientConfiguration>;
  function getNetworkClientById(
    networkClientId: CustomNetworkClientId,
  ): AutoManagedNetworkClient<CustomNetworkClientConfiguration>;
  // eslint-disable-next-line jsdoc/require-jsdoc
  function getNetworkClientById(networkClientId: string): NetworkClient {
    const mockNetworkClientConfiguration =
      mockNetworkClientConfigurationsByNetworkClientId[networkClientId];

    if (mockNetworkClientConfiguration === undefined) {
      throw new Error(
        `Unknown network client ID '${networkClientId}'. Please add it to mockNetworkClientConfigurationsByNetworkClientId.`,
      );
    }

    if (
      mockNetworkClientConfiguration.type === NetworkClientType.Infura &&
      isInfuraNetworkType(networkClientId)
    ) {
      return buildFakeNetworkClient({
        configuration: mockNetworkClientConfiguration,
      });
    }

    return buildFakeNetworkClient({
      configuration: mockNetworkClientConfiguration,
    });
  }

  return getNetworkClientById;
}

/**
 * Builds a configuration object for an Infura network client based on the name
 * of an Infura network.
 *
 * @param network - The name of an Infura network.
 * @returns the Infura network client configuration.
 */
export function buildInfuraNetworkClientConfiguration(
  network: InfuraNetworkType,
): InfuraNetworkClientConfiguration {
  return {
    type: NetworkClientType.Infura,
    network,
    infuraProjectId: 'test-infura-project-id',
    chainId: BUILT_IN_NETWORKS[network].chainId,
    ticker: BUILT_IN_NETWORKS[network].ticker,
  };
}

/**
 * Builds a configuration object for a custom network client based on any
 * overrides provided.
 *
 * @param overrides - Properties to merge into the configuration object.
 * @returns the complete custom network client configuration.
 */
export function buildCustomNetworkClientConfiguration(
  overrides: Partial<CustomNetworkClientConfiguration> = {},
): CustomNetworkClientConfiguration {
  return {
    chainId: toHex(1337),
    rpcUrl: 'https://example.test',
    ticker: 'TEST',
    ...overrides,
    type: NetworkClientType.Custom,
  };
}
