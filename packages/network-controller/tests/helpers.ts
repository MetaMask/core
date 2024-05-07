import {
  ChainId,
  InfuraNetworkType,
  NetworkNickname,
  NetworksTicker,
  toHex,
} from '@metamask/controller-utils';
import { v4 as uuidV4 } from 'uuid';

import { FakeBlockTracker } from '../../../tests/fake-block-tracker';
import { FakeProvider } from '../../../tests/fake-provider';
import type { FakeProviderStub } from '../../../tests/fake-provider';
import { buildTestObject } from '../../../tests/helpers';
import type {
  BuiltInNetworkClientId,
  CustomNetworkClientId,
  NetworkClient,
  NetworkClientConfiguration,
  NetworkClientId,
  NetworkConfiguration,
  NetworkController,
} from '../src';
import type { AutoManagedNetworkClient } from '../src/create-auto-managed-network-client';
import type {
  AddNetworkCustomRpcEndpointFields,
  AddNetworkFields,
  CustomRpcEndpoint,
  InfuraRpcEndpoint,
  UpdateNetworkCustomRpcEndpointFields,
} from '../src/NetworkController';
import { RpcEndpointType } from '../src/NetworkController';
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
  const provider = new FakeProvider({ stubs: providerStubs });
  return {
    configuration,
    provider,
    blockTracker: new FakeBlockTracker({ provider }),
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
  > = {},
): NetworkController['getNetworkClientById'] {
  // Since we might want to access these network client IDs so often in tests,
  // register the network client configurations for all Infura networks by
  // default. This does introduce a bit of magic as we don't expect to actually
  // have a NetworkController in a test, but if we did, then we'd be able to
  // make the same assumption anyway (i.e., that we'd be able to access any
  // Infura network without having to add it explicitly to the controller). So
  // pre-registering these network client IDs provides consistency from a mental
  // model perspective at the expense of debuggability.
  const defaultMockNetworkClientConfigurationsByNetworkClientId = Object.values(
    InfuraNetworkType,
  ).reduce((obj, infuraNetworkType) => {
    return {
      ...obj,
      [infuraNetworkType]:
        buildInfuraNetworkClientConfiguration(infuraNetworkType),
    };
  }, {});
  const mergedMockNetworkClientConfigurationsByNetworkClientId: Record<
    NetworkClientId,
    NetworkClientConfiguration
  > = {
    ...defaultMockNetworkClientConfigurationsByNetworkClientId,
    ...mockNetworkClientConfigurationsByNetworkClientId,
  };

  function getNetworkClientById(
    networkClientId: BuiltInNetworkClientId,
  ): AutoManagedNetworkClient<InfuraNetworkClientConfiguration>;
  function getNetworkClientById(
    networkClientId: CustomNetworkClientId,
  ): AutoManagedNetworkClient<CustomNetworkClientConfiguration>;
  // eslint-disable-next-line jsdoc/require-jsdoc
  function getNetworkClientById(networkClientId: string): NetworkClient {
    const mockNetworkClientConfiguration =
      mergedMockNetworkClientConfigurationsByNetworkClientId[networkClientId];

    if (mockNetworkClientConfiguration === undefined) {
      throw new Error(
        `Unknown network client ID '${networkClientId}'. Please add it to mockNetworkClientConfigurationsByNetworkClientId.`,
      );
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
 * @param overrides - Properties to merge into the configuration object.
 * @returns the complete Infura network client configuration.
 */
export function buildInfuraNetworkClientConfiguration(
  network: InfuraNetworkType,
  overrides: Partial<InfuraNetworkClientConfiguration> = {},
): InfuraNetworkClientConfiguration {
  return {
    type: NetworkClientType.Infura,
    network,
    infuraProjectId: 'test-infura-project-id',
    chainId: ChainId[network],
    ticker: NetworksTicker[network],
    ...overrides,
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
  // `Object.assign` allows for properties to be `undefined` in `overrides`,
  // and will copy them over
  return Object.assign(
    {
      chainId: toHex(1337),
      rpcUrl: 'https://example.test',
      ticker: 'TEST',
    },
    overrides,
    {
      type: NetworkClientType.Custom,
    },
  );
}

/**
 * Constructs a NetworkConfiguration object for use in testing, providing
 * defaults and allowing properties to be overridden at will.
 *
 * @param overrides - The properties to override the new
 * NetworkConfiguration with.
 * @param defaultRpcEndpointType - The type of the RPC endpoint you want to
 * use by default.
 * @returns The complete NetworkConfiguration object.
 */
export function buildNetworkConfiguration(
  overrides: Partial<NetworkConfiguration> = {},
  defaultRpcEndpointType: RpcEndpointType = RpcEndpointType.Custom,
): NetworkConfiguration {
  return buildTestObject(
    {
      chainId: () => '0x1337',
      // @ts-expect-error We will make sure that this property is set below.
      defaultRpcEndpointUrl: () => undefined,
      name: () => 'Some Network',
      nativeTokenName: () => 'TOKEN',
      rpcEndpoints: () => [
        defaultRpcEndpointType === RpcEndpointType.Infura
          ? buildInfuraRpcEndpoint(InfuraNetworkType['linea-goerli'])
          : buildCustomRpcEndpoint({ url: 'https://test.endpoint' }),
      ],
    },
    overrides,
    (object) => {
      if (
        object.defaultRpcEndpointUrl === undefined &&
        object.rpcEndpoints.length > 0
      ) {
        return {
          ...object,
          defaultRpcEndpointUrl: object.rpcEndpoints[0].url,
        };
      }
      return object;
    },
  );
}

/**
 * Constructs a NetworkConfiguration object preloaded with a custom RPC endpoint
 * for use in testing, providing defaults and allowing properties to be
 * overridden at will.
 *
 * @param overrides - The properties to override the new NetworkConfiguration
 * with.
 * @returns The complete NetworkConfiguration object.
 */
export function buildCustomNetworkConfiguration(
  overrides: Partial<NetworkConfiguration> = {},
): NetworkConfiguration {
  return buildTestObject(
    {
      chainId: () => '0x1337' as const,
      // @ts-expect-error We will make sure that this property is set below.
      defaultRpcEndpointUrl: () => undefined,
      name: () => 'Some Network',
      nativeTokenName: () => 'TOKEN',
      rpcEndpoints: () => [
        buildCustomRpcEndpoint({
          url: 'https://test.endpoint',
        }),
      ],
    },
    overrides,
    (object) => {
      if (
        object.defaultRpcEndpointUrl === undefined &&
        object.rpcEndpoints.length > 0
      ) {
        return {
          ...object,
          defaultRpcEndpointUrl: object.rpcEndpoints[0].url,
        };
      }
      return object;
    },
  );
}

/**
 * Constructs a NetworkConfiguration object preloaded with an Infura RPC
 * endpoint for use in testing.
 *
 * @param infuraNetworkType - The Infura network type from which to create the
 * NetworkConfiguration.
 * @param overrides - The properties to override the new NetworkConfiguration
 * with.
 * @param overrides.rpcEndpoints - Extra RPC endpoints.
 * @returns The complete NetworkConfiguration object.
 */
export function buildInfuraNetworkConfiguration(
  infuraNetworkType: InfuraNetworkType,
  overrides: Partial<NetworkConfiguration> = {},
): NetworkConfiguration {
  const defaultRpcEndpoint = buildInfuraRpcEndpoint(infuraNetworkType);
  return buildTestObject(
    {
      chainId: () => ChainId[infuraNetworkType],
      // @ts-expect-error We will make sure that this property is set below.
      defaultRpcEndpointUrl: () => undefined,
      name: () => NetworkNickname[infuraNetworkType],
      nativeTokenName: () => NetworksTicker[infuraNetworkType],
      rpcEndpoints: () => [defaultRpcEndpoint],
    },
    overrides,
    (object) => {
      if (
        object.defaultRpcEndpointUrl === undefined &&
        object.rpcEndpoints.length > 0
      ) {
        return {
          ...object,
          defaultRpcEndpointUrl: object.rpcEndpoints[0].url,
        };
      }
      return object;
    },
  );
}

/**
 * Constructs a InfuraRpcEndpoint object for use in testing.
 *
 * @param infuraNetworkType - The Infura network type from which to create the
 * InfuraRpcEndpoint.
 * @returns The created InfuraRpcEndpoint object.
 */
export function buildInfuraRpcEndpoint(
  infuraNetworkType: InfuraNetworkType,
): InfuraRpcEndpoint {
  return {
    name: NetworkNickname[infuraNetworkType],
    networkClientId: infuraNetworkType,
    type: RpcEndpointType.Infura as const,
    // False negative - this is a string.
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    url: `https://${infuraNetworkType}.infura.io/v3/{infuraProjectId}`,
  };
}

/**
 * Constructs an CustomRpcEndpoint object for use in testing, providing defaults
 * and allowing properties to be overridden at will.
 *
 * @param overrides - The properties to override the new CustomRpcEndpoint with.
 * @returns The complete CustomRpcEndpoint object.
 */
export function buildCustomRpcEndpoint(
  overrides: Partial<CustomRpcEndpoint> = {},
): CustomRpcEndpoint {
  return buildTestObject(
    {
      name: () => 'Test Endpoint',
      networkClientId: () => uuidV4(),
      type: () => RpcEndpointType.Custom as const,
      url: () => 'https://test.endpoint',
    },
    overrides,
  );
}

/**
 * Constructs an AddNetworkFields object for use in testing, providing defaults
 * and allowing properties to be overridden at will.
 *
 * @param overrides - The properties to override the new AddNetworkFields with.
 * @returns The complete AddNetworkFields object.
 */
export function buildAddNetworkFields(
  overrides: Partial<AddNetworkFields> = {},
): AddNetworkFields {
  return buildTestObject(
    {
      chainId: () => '0x1337' as const,
      // @ts-expect-error We will make sure that this property is set below.
      defaultRpcEndpointUrl: () => undefined,
      name: () => 'Some Network',
      nativeTokenName: () => 'TOKEN',
      rpcEndpoints: () => [
        buildAddNetworkCustomRpcEndpointFields({
          url: 'https://test.endpoint',
        }),
      ],
    },
    overrides,
    (object) => {
      if (
        object.defaultRpcEndpointUrl === undefined &&
        object.rpcEndpoints.length > 0
      ) {
        return {
          ...object,
          defaultRpcEndpointUrl: object.rpcEndpoints[0].url,
        };
      }
      return object;
    },
  );
}

/**
 * Constructs an AddNetworkCustomRpcEndpointFields object for use in testing,
 * providing defaults and allowing properties to be overridden at will.
 *
 * @param overrides - The properties to override the new
 * AddNetworkCustomRpcEndpointFields with.
 * @returns The complete AddNetworkCustomRpcEndpointFields object.
 */
export function buildAddNetworkCustomRpcEndpointFields(
  overrides: Partial<AddNetworkCustomRpcEndpointFields> = {},
): AddNetworkCustomRpcEndpointFields {
  return buildTestObject(
    {
      name: () => 'Test Endpoint',
      type: () => RpcEndpointType.Custom as const,
      url: () => 'https://test.endpoint',
    },
    overrides,
  );
}

/**
 * Constructs an UpdateNetworkCustomRpcEndpointFields object for use in testing,
 * providing defaults and allowing properties to be overridden at will.
 *
 * @param overrides - The properties to override the new
 * UpdateNetworkCustomRpcEndpointFields with.
 * @returns The complete UpdateNetworkCustomRpcEndpointFields object.
 */
export function buildUpdateNetworkCustomRpcEndpointFields(
  overrides: Partial<UpdateNetworkCustomRpcEndpointFields> = {},
): UpdateNetworkCustomRpcEndpointFields {
  return buildTestObject(
    {
      name: () => 'Test Endpoint',
      type: () => RpcEndpointType.Custom as const,
      url: () => 'https://test.endpoint',
    },
    overrides,
  );
}
