import { ControllerMessenger } from '@metamask/base-controller';
import {
  BUILT_IN_NETWORKS,
  ChainId,
  InfuraNetworkType,
  isInfuraNetworkType,
  MAX_SAFE_CHAIN_ID,
  NetworkNickname,
  NetworksTicker,
  NetworkType,
  toHex,
} from '@metamask/controller-utils';
import { rpcErrors } from '@metamask/rpc-errors';
import type { Hex } from '@metamask/utils';
import assert from 'assert';
import type { Patch } from 'immer';
import { when, resetAllWhenMocks } from 'jest-when';
import { inspect, isDeepStrictEqual, promisify } from 'util';
import { v4 as uuidV4 } from 'uuid';

import { FakeBlockTracker } from '../../../tests/fake-block-tracker';
import type { FakeProviderStub } from '../../../tests/fake-provider';
import { FakeProvider } from '../../../tests/fake-provider';
import { NetworkStatus } from '../src/constants';
import * as createAutoManagedNetworkClientModule from '../src/create-auto-managed-network-client';
import type { NetworkClient } from '../src/create-network-client';
import { createNetworkClient } from '../src/create-network-client';
import type {
  AutoManagedBuiltInNetworkClientRegistry,
  AutoManagedCustomNetworkClientRegistry,
  NetworkClientId,
  NetworkControllerActions,
  NetworkControllerEvents,
  NetworkControllerOptions,
  NetworkControllerStateChangeEvent,
  NetworkState,
} from '../src/NetworkController';
import { NetworkController, RpcEndpointType } from '../src/NetworkController';
import type { NetworkClientConfiguration, Provider } from '../src/types';
import { NetworkClientType } from '../src/types';
import {
  buildAddNetworkCustomRpcEndpointFields,
  buildAddNetworkFields,
  buildCustomNetworkClientConfiguration,
  buildCustomNetworkConfiguration,
  buildCustomRpcEndpoint,
  buildInfuraNetworkClientConfiguration,
  buildInfuraNetworkConfiguration,
  buildInfuraRpcEndpoint,
  buildNetworkConfiguration,
  buildUpdateNetworkCustomRpcEndpointFields,
} from './helpers';

jest.mock('../src/create-network-client');

jest.mock('uuid', () => {
  const actual = jest.requireActual('uuid');

  return {
    ...actual,
    v4: jest.fn(),
  };
});

/**
 * A block header object that `eth_getBlockByNumber` can be mocked to return.
 * Note that this type does not specify all of the properties present within the
 * block header; within these tests, we are only interested in `number` and
 * `baseFeePerGas`.
 */
type Block = {
  number: string;
  baseFeePerGas?: string;
};

const createNetworkClientMock = jest.mocked(createNetworkClient);
const uuidV4Mock = jest.mocked(uuidV4);

/**
 * A dummy block that matches the pre-EIP-1559 format (i.e. it doesn't have the
 * `baseFeePerGas` property).
 */
const PRE_1559_BLOCK: Block = {
  number: '0x42',
};

/**
 * A dummy block that matches the pre-EIP-1559 format (i.e. it has the
 * `baseFeePerGas` property).
 */
const POST_1559_BLOCK: Block = {
  ...PRE_1559_BLOCK,
  baseFeePerGas: '0x63c498a46',
};

/**
 * An alias for `POST_1559_BLOCK`, for tests that don't care about which kind of
 * block they're looking for.
 */
const BLOCK: Block = POST_1559_BLOCK;

/**
 * A response object for a successful request to `eth_getBlockByNumber`. It is
 * assumed that the block number here is insignificant to the test.
 */
const SUCCESSFUL_ETH_GET_BLOCK_BY_NUMBER_RESPONSE = {
  result: BLOCK,
};

/**
 * A response object for a request that has been geoblocked by Infura.
 */
const BLOCKED_INFURA_JSON_RPC_ERROR = rpcErrors.internal(
  JSON.stringify({ error: 'countryBlocked' }),
);

/**
 * A response object for a unsuccessful request to any RPC method. It is assumed
 * that the error here is insignificant to the test.
 */
const GENERIC_JSON_RPC_ERROR = rpcErrors.internal(
  JSON.stringify({ error: 'oops' }),
);

describe('NetworkController', () => {
  let uuidCounter = 0;

  beforeEach(() => {
    uuidV4Mock.mockImplementation(() => {
      const uuid = `UUID-${uuidCounter}`;
      uuidCounter += 1;
      return uuid;
    });
  });

  afterEach(() => {
    resetAllWhenMocks();
  });

  describe('constructor', () => {
    it('throws given an empty networkConfigurationsByChainId collection', () => {
      const messenger = buildMessenger();
      const restrictedMessenger = buildNetworkControllerMessenger(messenger);
      expect(
        () =>
          new NetworkController({
            messenger: restrictedMessenger,
            state: {
              networkConfigurationsByChainId: {},
            },
            infuraProjectId: 'infura-project-id',
          }),
      ).toThrow(
        'NetworkController state is invalid: `networkConfigurationsByChainId` cannot be empty',
      );
    });

    it('throws if the key under which a network configuration is filed does not match the chain ID of that network configuration', () => {
      const messenger = buildMessenger();
      const restrictedMessenger = buildNetworkControllerMessenger(messenger);
      expect(
        () =>
          new NetworkController({
            messenger: restrictedMessenger,
            state: {
              networkConfigurationsByChainId: {
                '0x1337': buildCustomNetworkConfiguration({
                  chainId: '0x1338',
                  name: 'Test Network',
                }),
              },
            },
            infuraProjectId: 'infura-project-id',
          }),
      ).toThrow(
        "NetworkController state has invalid `networkConfigurationsByChainId`: Network configuration 'Test Network' is filed under '0x1337' which does not match its `chainId` of '0x1338'",
      );
    });

    it('throws if a network configuration has a defaultBlockExplorerUrlIndex that does not refer to an entry in blockExplorerUrls', () => {
      const messenger = buildMessenger();
      const restrictedMessenger = buildNetworkControllerMessenger(messenger);
      expect(
        () =>
          new NetworkController({
            messenger: restrictedMessenger,
            state: {
              networkConfigurationsByChainId: {
                '0x1337': buildCustomNetworkConfiguration({
                  blockExplorerUrls: [],
                  defaultBlockExplorerUrlIndex: 99999,
                  chainId: '0x1337',
                  name: 'Test Network',
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      url: 'https://some.endpoint',
                    }),
                  ],
                }),
              },
            },
            infuraProjectId: 'infura-project-id',
          }),
      ).toThrow(
        "NetworkController state has invalid `networkConfigurationsByChainId`: Network configuration 'Test Network' has a `defaultBlockExplorerUrlIndex` that does not refer to an entry in `blockExplorerUrls`",
      );
    });

    it('throws if a network configuration has a non-empty blockExplorerUrls but an absent defaultBlockExplorerUrlIndex', () => {
      const messenger = buildMessenger();
      const restrictedMessenger = buildNetworkControllerMessenger(messenger);
      expect(
        () =>
          new NetworkController({
            messenger: restrictedMessenger,
            state: {
              networkConfigurationsByChainId: {
                '0x1337': buildCustomNetworkConfiguration({
                  blockExplorerUrls: ['https://block.explorer'],
                  chainId: '0x1337',
                  name: 'Test Network',
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      url: 'https://some.endpoint',
                    }),
                  ],
                }),
              },
            },
            infuraProjectId: 'infura-project-id',
          }),
      ).toThrow(
        "NetworkController state has invalid `networkConfigurationsByChainId`: Network configuration 'Test Network' has a `defaultBlockExplorerUrlIndex` that does not refer to an entry in `blockExplorerUrls`",
      );
    });

    it('throws if a network configuration has an invalid defaultRpcEndpointIndex', () => {
      const messenger = buildMessenger();
      const restrictedMessenger = buildNetworkControllerMessenger(messenger);
      expect(
        () =>
          new NetworkController({
            messenger: restrictedMessenger,
            state: {
              networkConfigurationsByChainId: {
                '0x1337': buildCustomNetworkConfiguration({
                  chainId: '0x1337',
                  name: 'Test Network',
                  defaultRpcEndpointIndex: 99999,
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      url: 'https://some.endpoint',
                    }),
                  ],
                }),
              },
            },
            infuraProjectId: 'infura-project-id',
          }),
      ).toThrow(
        "NetworkController state has invalid `networkConfigurationsByChainId`: Network configuration 'Test Network' has a `defaultRpcEndpointIndex` that does not refer to an entry in `rpcEndpoints`",
      );
    });

    it('throws if more than one RPC endpoint across network configurations has the same networkClientId', () => {
      const messenger = buildMessenger();
      const restrictedMessenger = buildNetworkControllerMessenger(messenger);
      expect(
        () =>
          new NetworkController({
            messenger: restrictedMessenger,
            state: {
              networkConfigurationsByChainId: {
                '0x1337': buildCustomNetworkConfiguration({
                  chainId: '0x1337',
                  name: 'Test Network 1',
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      url: 'https://test.endpoint/1',
                    }),
                  ],
                }),
                '0x2448': buildCustomNetworkConfiguration({
                  chainId: '0x2448',
                  name: 'Test Network 2',
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      url: 'https://test.endpoint/2',
                    }),
                  ],
                }),
              },
            },
            infuraProjectId: 'infura-project-id',
          }),
      ).toThrow(
        'NetworkController state has invalid `networkConfigurationsByChainId`: Every RPC endpoint across all network configurations must have a unique `networkClientId`',
      );
    });

    it('throws if selectedNetworkClientId does not match the networkClientId of an RPC endpoint in networkConfigurationsByChainId', () => {
      const messenger = buildMessenger();
      const restrictedMessenger = buildNetworkControllerMessenger(messenger);
      expect(
        () =>
          new NetworkController({
            messenger: restrictedMessenger,
            state: {
              selectedNetworkClientId: 'nonexistent',
              networkConfigurationsByChainId: {
                '0x1337': buildCustomNetworkConfiguration({
                  chainId: '0x1337',
                }),
              },
            },
            infuraProjectId: 'infura-project-id',
          }),
      ).toThrow(
        "NetworkController state is invalid: `selectedNetworkClientId` 'nonexistent' does not refer to an RPC endpoint within a network configuration",
      );
    });

    const invalidInfuraProjectIds = [undefined, null, {}, 1];
    invalidInfuraProjectIds.forEach((invalidProjectId) => {
      it(`throws given an invalid Infura ID of "${inspect(
        invalidProjectId,
      )}"`, () => {
        const messenger = buildMessenger();
        const restrictedMessenger = buildNetworkControllerMessenger(messenger);
        expect(
          () =>
            new NetworkController({
              messenger: restrictedMessenger,
              state: {},
              // @ts-expect-error We are intentionally passing bad input.
              infuraProjectId: invalidProjectId,
            }),
        ).toThrow('Invalid Infura project ID');
      });
    });

    it('initializes the state with some defaults', async () => {
      await withController(({ controller }) => {
        expect(controller.state).toMatchInlineSnapshot(`
          Object {
            "networkConfigurationsByChainId": Object {
              "0x1": Object {
                "blockExplorerUrls": Array [],
                "chainId": "0x1",
                "defaultRpcEndpointIndex": 0,
                "name": "Mainnet",
                "nativeCurrency": "ETH",
                "rpcEndpoints": Array [
                  Object {
                    "networkClientId": "mainnet",
                    "type": "infura",
                    "url": "https://mainnet.infura.io/v3/{infuraProjectId}",
                  },
                ],
              },
              "0x5": Object {
                "blockExplorerUrls": Array [],
                "chainId": "0x5",
                "defaultRpcEndpointIndex": 0,
                "name": "Goerli",
                "nativeCurrency": "GoerliETH",
                "rpcEndpoints": Array [
                  Object {
                    "networkClientId": "goerli",
                    "type": "infura",
                    "url": "https://goerli.infura.io/v3/{infuraProjectId}",
                  },
                ],
              },
              "0xaa36a7": Object {
                "blockExplorerUrls": Array [],
                "chainId": "0xaa36a7",
                "defaultRpcEndpointIndex": 0,
                "name": "Sepolia",
                "nativeCurrency": "SepoliaETH",
                "rpcEndpoints": Array [
                  Object {
                    "networkClientId": "sepolia",
                    "type": "infura",
                    "url": "https://sepolia.infura.io/v3/{infuraProjectId}",
                  },
                ],
              },
              "0xe704": Object {
                "blockExplorerUrls": Array [],
                "chainId": "0xe704",
                "defaultRpcEndpointIndex": 0,
                "name": "Linea Goerli",
                "nativeCurrency": "LineaETH",
                "rpcEndpoints": Array [
                  Object {
                    "networkClientId": "linea-goerli",
                    "type": "infura",
                    "url": "https://linea-goerli.infura.io/v3/{infuraProjectId}",
                  },
                ],
              },
              "0xe705": Object {
                "blockExplorerUrls": Array [],
                "chainId": "0xe705",
                "defaultRpcEndpointIndex": 0,
                "name": "Linea Sepolia",
                "nativeCurrency": "LineaETH",
                "rpcEndpoints": Array [
                  Object {
                    "networkClientId": "linea-sepolia",
                    "type": "infura",
                    "url": "https://linea-sepolia.infura.io/v3/{infuraProjectId}",
                  },
                ],
              },
              "0xe708": Object {
                "blockExplorerUrls": Array [],
                "chainId": "0xe708",
                "defaultRpcEndpointIndex": 0,
                "name": "Linea Mainnet",
                "nativeCurrency": "ETH",
                "rpcEndpoints": Array [
                  Object {
                    "networkClientId": "linea-mainnet",
                    "type": "infura",
                    "url": "https://linea-mainnet.infura.io/v3/{infuraProjectId}",
                  },
                ],
              },
            },
            "networksMetadata": Object {},
            "selectedNetworkClientId": "mainnet",
          }
        `);
      });
    });

    it('merges the given state into the default state', async () => {
      await withController(
        {
          state: {
            selectedNetworkClientId: InfuraNetworkType.goerli,
            networkConfigurationsByChainId: {
              [ChainId.goerli]: {
                blockExplorerUrls: ['https://block.explorer'],
                chainId: ChainId.goerli,
                defaultBlockExplorerUrlIndex: 0,
                defaultRpcEndpointIndex: 0,
                name: 'Goerli',
                nativeCurrency: 'GoerliETH',
                rpcEndpoints: [
                  {
                    name: 'Goerli',
                    networkClientId: InfuraNetworkType.goerli,
                    type: RpcEndpointType.Infura,
                    url: 'https://goerli.infura.io/v3/{infuraProjectId}',
                  },
                ],
              },
            },
            networksMetadata: {
              mainnet: {
                EIPS: { 1559: true },
                status: NetworkStatus.Unknown,
              },
            },
          },
        },
        ({ controller }) => {
          expect(controller.state).toMatchInlineSnapshot(`
            Object {
              "networkConfigurationsByChainId": Object {
                "0x5": Object {
                  "blockExplorerUrls": Array [
                    "https://block.explorer",
                  ],
                  "chainId": "0x5",
                  "defaultBlockExplorerUrlIndex": 0,
                  "defaultRpcEndpointIndex": 0,
                  "name": "Goerli",
                  "nativeCurrency": "GoerliETH",
                  "rpcEndpoints": Array [
                    Object {
                      "name": "Goerli",
                      "networkClientId": "goerli",
                      "type": "infura",
                      "url": "https://goerli.infura.io/v3/{infuraProjectId}",
                    },
                  ],
                },
              },
              "networksMetadata": Object {
                "mainnet": Object {
                  "EIPS": Object {
                    "1559": true,
                  },
                  "status": "unknown",
                },
              },
              "selectedNetworkClientId": "goerli",
            }
          `);
        },
      );
    });
  });

  describe('destroy', () => {
    it('does not throw if called before the provider is initialized', async () => {
      await withController(async ({ controller }) => {
        expect(await controller.destroy()).toBeUndefined();
      });
    });

    it('stops the block tracker for the currently selected network as long as the provider has been initialized', async () => {
      await withController(async ({ controller }) => {
        const fakeProvider = buildFakeProvider();
        const fakeNetworkClient = buildFakeClient(fakeProvider);
        mockCreateNetworkClient().mockReturnValue(fakeNetworkClient);
        await controller.initializeProvider();
        const { blockTracker } = controller.getProviderAndBlockTracker();
        assert(blockTracker, 'Block tracker is somehow unset');
        // The block tracker starts running after a listener is attached
        blockTracker.addListener('latest', () => {
          // do nothing
        });
        expect(blockTracker.isRunning()).toBe(true);

        await controller.destroy();

        expect(blockTracker.isRunning()).toBe(false);
      });
    });
  });

  describe('initializeProvider', () => {
    for (const infuraNetworkType of Object.values(InfuraNetworkType)) {
      const infuraChainId = ChainId[infuraNetworkType];
      // TODO: Update these names
      const infuraNativeTokenName = NetworksTicker[infuraNetworkType];

      // False negative - this is a string.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      describe(`when the selected network client represents the Infura network "${infuraNetworkType}"`, () => {
        it('sets the globally selected provider to the one from the corresponding network client', async () => {
          const infuraProjectId = 'some-infura-project-id';

          await withController(
            {
              state: {
                selectedNetworkClientId: infuraNetworkType,
                networkConfigurationsByChainId: {
                  [infuraChainId]:
                    buildInfuraNetworkConfiguration(infuraNetworkType),
                },
              },
              infuraProjectId,
            },
            async ({ controller }) => {
              const fakeProvider = buildFakeProvider([
                {
                  request: {
                    method: 'test_method',
                    params: [],
                  },
                  response: {
                    result: 'test response',
                  },
                },
              ]);
              const fakeNetworkClient = buildFakeClient(fakeProvider);
              mockCreateNetworkClient()
                .calledWith({
                  chainId: infuraChainId,
                  infuraProjectId,
                  network: infuraNetworkType,
                  ticker: infuraNativeTokenName,
                  type: NetworkClientType.Infura,
                })
                .mockReturnValue(fakeNetworkClient);

              await controller.initializeProvider();

              const networkClient = controller.getSelectedNetworkClient();
              assert(networkClient, 'Network client not set');
              const result = await networkClient.provider.request({
                id: 1,
                jsonrpc: '2.0',
                method: 'test_method',
                params: [],
              });
              expect(result).toBe('test response');
            },
          );
        });

        lookupNetworkTests({
          expectedNetworkClientType: NetworkClientType.Infura,
          initialState: {
            selectedNetworkClientId: infuraNetworkType,
          },
          operation: async (controller: NetworkController) => {
            await controller.initializeProvider();
          },
        });
      });
    }

    describe('when the selected network client represents a custom RPC endpoint', () => {
      it('sets the globally selected provider to the one from the corresponding network client', async () => {
        await withController(
          {
            state: {
              selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
              networkConfigurationsByChainId: {
                '0x1337': buildCustomNetworkConfiguration({
                  chainId: '0x1337',
                  nativeCurrency: 'TEST',
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      url: 'https://test.network',
                    }),
                  ],
                }),
              },
            },
          },
          async ({ controller }) => {
            const fakeProvider = buildFakeProvider([
              {
                request: {
                  method: 'test_method',
                  params: [],
                },
                response: {
                  result: 'test response',
                },
              },
            ]);
            const fakeNetworkClient = buildFakeClient(fakeProvider);
            mockCreateNetworkClient()
              .calledWith({
                chainId: '0x1337',
                rpcUrl: 'https://test.network',
                ticker: 'TEST',
                type: NetworkClientType.Custom,
              })
              .mockReturnValue(fakeNetworkClient);

            await controller.initializeProvider();

            const networkClient = controller.getSelectedNetworkClient();
            assert(networkClient, 'Network client not set');
            const { result } = await promisify(
              networkClient.provider.sendAsync,
            ).call(networkClient.provider, {
              id: 1,
              jsonrpc: '2.0',
              method: 'test_method',
              params: [],
            });
            expect(result).toBe('test response');
          },
        );
      });

      lookupNetworkTests({
        expectedNetworkClientType: NetworkClientType.Custom,
        initialState: {
          selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
          networkConfigurationsByChainId: {
            '0x1337': buildCustomNetworkConfiguration({
              chainId: '0x1337',
              nativeCurrency: 'TEST',
              rpcEndpoints: [
                buildCustomRpcEndpoint({
                  networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                  url: 'https://test.network',
                }),
              ],
            }),
          },
        },
        operation: async (controller: NetworkController) => {
          await controller.initializeProvider();
        },
      });
    });
  });

  describe('getProviderAndBlockTracker', () => {
    it('returns objects that proxy to the provider and block tracker as long as the provider has been initialized', async () => {
      await withController(async ({ controller }) => {
        const fakeProvider = buildFakeProvider();
        const fakeNetworkClient = buildFakeClient(fakeProvider);
        mockCreateNetworkClient().mockReturnValue(fakeNetworkClient);
        await controller.initializeProvider();

        const { provider, blockTracker } =
          controller.getProviderAndBlockTracker();

        expect(provider).toHaveProperty('request');
        expect(blockTracker).toHaveProperty('checkForLatestBlock');
      });
    });

    it("returns undefined for both the provider and block tracker if the provider hasn't been initialized yet", async () => {
      await withController(async ({ controller }) => {
        const { provider, blockTracker } =
          controller.getProviderAndBlockTracker();

        expect(provider).toBeUndefined();
        expect(blockTracker).toBeUndefined();
      });
    });

    for (const infuraNetworkType of Object.values(InfuraNetworkType)) {
      const infuraChainId = ChainId[infuraNetworkType];
      const infuraNetworkNickname = NetworkNickname[infuraNetworkType];
      const infuraNativeTokenName = NetworksTicker[infuraNetworkType];

      // False negative - this is a string.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      describe(`when the selectedNetworkClientId is changed to represent the Infura network "${infuraNetworkType}"`, () => {
        // False negative - this is a string.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        it(`returns a provider object that was pointed to another network before the switch and is now pointed to ${infuraNetworkNickname} afterward`, async () => {
          const infuraProjectId = 'some-infura-project-id';

          await withController(
            {
              state: {
                selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
                networkConfigurationsByChainId: {
                  '0x1337': buildCustomNetworkConfiguration({
                    chainId: '0x1337',
                    nativeCurrency: 'TEST',
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                        url: 'https://test.network',
                      }),
                    ],
                  }),
                  [infuraChainId]:
                    buildInfuraNetworkConfiguration(infuraNetworkType),
                },
              },
              infuraProjectId,
            },
            async ({ controller }) => {
              const fakeProviders = [
                buildFakeProvider([
                  {
                    request: {
                      method: 'test_method',
                    },
                    response: {
                      result: 'test response 1',
                    },
                  },
                ]),
                buildFakeProvider([
                  {
                    request: {
                      method: 'test_method',
                    },
                    response: {
                      result: 'test response 2',
                    },
                  },
                ]),
              ];
              const fakeNetworkClients = [
                buildFakeClient(fakeProviders[0]),
                buildFakeClient(fakeProviders[1]),
              ];
              mockCreateNetworkClient()
                .calledWith({
                  chainId: '0x1337',
                  rpcUrl: 'https://test.network',
                  ticker: 'TEST',
                  type: NetworkClientType.Custom,
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  chainId: infuraChainId,
                  infuraProjectId,
                  network: infuraNetworkType,
                  ticker: infuraNativeTokenName,
                  type: NetworkClientType.Infura,
                })
                .mockReturnValue(fakeNetworkClients[1]);
              await controller.initializeProvider();
              const { provider } = controller.getProviderAndBlockTracker();
              assert(provider, 'Provider not set');

              const result1 = await provider.request({
                id: '1',
                jsonrpc: '2.0',
                method: 'test_method',
              });
              expect(result1).toBe('test response 1');

              await controller.setActiveNetwork(infuraNetworkType);
              const result2 = await provider.request({
                id: '2',
                jsonrpc: '2.0',
                method: 'test_method',
              });
              expect(result2).toBe('test response 2');
            },
          );
        });
      });
    }

    describe('when the selectedNetworkClientId is changed to represent a custom RPC endpoint', () => {
      it('returns a provider object that was pointed to another network before the switch and is now pointed to the new network', async () => {
        const infuraProjectId = 'some-infura-project-id';

        await withController(
          {
            state: {
              selectedNetworkClientId: InfuraNetworkType.goerli,
              networkConfigurationsByChainId: {
                [ChainId.goerli]: buildInfuraNetworkConfiguration(
                  InfuraNetworkType.goerli,
                ),
                '0x1337': buildCustomNetworkConfiguration({
                  chainId: '0x1337',
                  nativeCurrency: 'TEST',
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      url: 'https://test.network',
                    }),
                  ],
                }),
              },
            },
            infuraProjectId,
          },
          async ({ controller }) => {
            const fakeProviders = [
              buildFakeProvider([
                {
                  request: {
                    method: 'test_method',
                  },
                  response: {
                    result: 'test response 1',
                  },
                },
              ]),
              buildFakeProvider([
                {
                  request: {
                    method: 'test_method',
                  },
                  response: {
                    result: 'test response 2',
                  },
                },
              ]),
            ];
            const fakeNetworkClients = [
              buildFakeClient(fakeProviders[0]),
              buildFakeClient(fakeProviders[1]),
            ];
            mockCreateNetworkClient()
              .calledWith({
                chainId: BUILT_IN_NETWORKS[NetworkType.goerli].chainId,
                infuraProjectId,
                network: InfuraNetworkType.goerli,
                ticker: NetworksTicker[InfuraNetworkType.goerli],
                type: NetworkClientType.Infura,
              })
              .mockReturnValue(fakeNetworkClients[0])
              .calledWith({
                chainId: '0x1337',
                rpcUrl: 'https://test.network',
                ticker: 'TEST',
                type: NetworkClientType.Custom,
              })
              .mockReturnValue(fakeNetworkClients[1]);
            await controller.initializeProvider();
            const { provider } = controller.getProviderAndBlockTracker();
            assert(provider, 'Provider not set');

            const result1 = await provider.request({
              id: '1',
              jsonrpc: '2.0',
              method: 'test_method',
            });
            expect(result1).toBe('test response 1');

            await controller.setActiveNetwork('AAAA-AAAA-AAAA-AAAA');
            const result2 = await provider.request({
              id: '2',
              jsonrpc: '2.0',
              method: 'test_method',
            });
            expect(result2).toBe('test response 2');
          },
        );
      });
    });
  });

  describe('findNetworkConfigurationByChainId', () => {
    it('returns the network configuration for the given chainId', async () => {
      await withController(
        { infuraProjectId: 'some-infura-project-id' },
        async ({ controller }) => {
          const fakeNetworkClient = buildFakeClient();
          mockCreateNetworkClient().mockReturnValue(fakeNetworkClient);

          const networkClientId =
            controller.findNetworkClientIdByChainId('0x1');
          expect(networkClientId).toBe('mainnet');
        },
      );
    });

    it('throws if the chainId doesnt exist in the configuration', async () => {
      await withController(
        { infuraProjectId: 'some-infura-project-id' },
        async ({ controller }) => {
          const fakeNetworkClient = buildFakeClient();
          mockCreateNetworkClient().mockReturnValue(fakeNetworkClient);
          expect(() =>
            controller.findNetworkClientIdByChainId('0xdeadbeef'),
          ).toThrow("Couldn't find networkClientId for chainId");
        },
      );
    });

    it('is callable from the controller messenger', async () => {
      await withController(
        { infuraProjectId: 'some-infura-project-id' },
        async ({ messenger }) => {
          const fakeNetworkClient = buildFakeClient();
          mockCreateNetworkClient().mockReturnValue(fakeNetworkClient);

          const networkClientId = messenger.call(
            'NetworkController:findNetworkClientIdByChainId',
            '0x1',
          );
          expect(networkClientId).toBe('mainnet');
        },
      );
    });
  });

  describe('getNetworkClientById', () => {
    describe('if passed an Infura network client ID', () => {
      describe('if the ID refers to an existing Infura network client', () => {
        it('returns the network client', async () => {
          const infuraProjectId = 'some-infura-project-id';

          await withController(
            {
              infuraProjectId,
            },
            async ({ controller }) => {
              const networkClient = controller.getNetworkClientById(
                NetworkType.mainnet,
              );

              expect(networkClient.configuration).toStrictEqual({
                chainId: ChainId[InfuraNetworkType.mainnet],
                infuraProjectId,
                network: InfuraNetworkType.mainnet,
                ticker: NetworksTicker[InfuraNetworkType.mainnet],
                type: NetworkClientType.Infura,
              });
            },
          );
        });
      });

      describe('if the ID does not refer to an existing Infura network client', () => {
        it('throws', async () => {
          const infuraProjectId = 'some-infura-project-id';

          await withController(
            {
              state:
                buildNetworkControllerStateWithDefaultSelectedNetworkClientId({
                  networkConfigurationsByChainId: {
                    '0x1337': buildCustomNetworkConfiguration(),
                  },
                }),
              infuraProjectId,
            },
            async ({ controller }) => {
              expect(() =>
                controller.getNetworkClientById(NetworkType.mainnet),
              ).toThrow(
                'No Infura network client was found with the ID "mainnet".',
              );
            },
          );
        });
      });
    });

    describe('if passed a custom network client ID', () => {
      describe('if the ID refers to an existing custom network client', () => {
        it('returns the network client', async () => {
          await withController(
            {
              state:
                buildNetworkControllerStateWithDefaultSelectedNetworkClientId({
                  networkConfigurationsByChainId: {
                    '0x1337': buildCustomNetworkConfiguration({
                      chainId: '0x1337',
                      nativeCurrency: 'TEST',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                          url: 'https://test.network',
                        }),
                      ],
                    }),
                  },
                }),
              infuraProjectId: 'some-infura-project-id',
            },
            async ({ controller }) => {
              const networkClient = controller.getNetworkClientById(
                'AAAA-AAAA-AAAA-AAAA',
              );

              expect(networkClient.configuration).toStrictEqual({
                chainId: '0x1337',
                rpcUrl: 'https://test.network',
                ticker: 'TEST',
                type: NetworkClientType.Custom,
              });
            },
          );
        });
      });

      describe('if the ID does not refer to an existing custom network client', () => {
        it('throws', async () => {
          await withController(
            {
              state:
                buildNetworkControllerStateWithDefaultSelectedNetworkClientId({
                  networkConfigurationsByChainId: {
                    '0x2448': buildCustomNetworkConfiguration({
                      chainId: '0x2448',
                    }),
                  },
                }),
            },
            async ({ controller }) => {
              expect(() => controller.getNetworkClientById('0x1337')).toThrow(
                'No custom network client was found with the ID "0x1337".',
              );
            },
          );
        });
      });
    });
  });

  describe('getNetworkClientRegistry', () => {
    describe('if no network configurations were specified at initialization', () => {
      it('returns network clients for Infura RPC endpoints, keyed by network client ID', async () => {
        const infuraProjectId = 'some-infura-project-id';

        await withController(
          {
            infuraProjectId,
          },
          async ({ controller }) => {
            mockCreateNetworkClient().mockReturnValue(buildFakeClient());

            expect(controller.getNetworkClientRegistry()).toStrictEqual({
              goerli: {
                blockTracker: expect.anything(),
                configuration: {
                  chainId: '0x5',
                  infuraProjectId,
                  network: InfuraNetworkType.goerli,
                  ticker: 'GoerliETH',
                  type: NetworkClientType.Infura,
                },
                provider: expect.anything(),
                destroy: expect.any(Function),
              },
              'linea-goerli': {
                blockTracker: expect.anything(),
                configuration: {
                  type: NetworkClientType.Infura,
                  infuraProjectId,
                  chainId: '0xe704',
                  ticker: 'LineaETH',
                  network: InfuraNetworkType['linea-goerli'],
                },
                provider: expect.anything(),
                destroy: expect.any(Function),
              },
              'linea-mainnet': {
                blockTracker: expect.anything(),
                configuration: {
                  type: NetworkClientType.Infura,
                  infuraProjectId,
                  chainId: '0xe708',
                  ticker: 'ETH',
                  network: InfuraNetworkType['linea-mainnet'],
                },
                provider: expect.anything(),
                destroy: expect.any(Function),
              },
              'linea-sepolia': {
                blockTracker: expect.anything(),
                configuration: {
                  type: NetworkClientType.Infura,
                  infuraProjectId,
                  chainId: '0xe705',
                  ticker: 'LineaETH',
                  network: InfuraNetworkType['linea-sepolia'],
                },
                provider: expect.anything(),
                destroy: expect.any(Function),
              },
              mainnet: {
                blockTracker: expect.anything(),
                configuration: {
                  type: NetworkClientType.Infura,
                  infuraProjectId,
                  chainId: '0x1',
                  ticker: 'ETH',
                  network: InfuraNetworkType.mainnet,
                },
                provider: expect.anything(),
                destroy: expect.any(Function),
              },
              sepolia: {
                blockTracker: expect.anything(),
                configuration: {
                  type: NetworkClientType.Infura,
                  infuraProjectId,
                  chainId: '0xaa36a7',
                  ticker: 'SepoliaETH',
                  network: InfuraNetworkType.sepolia,
                },
                provider: expect.anything(),
                destroy: expect.any(Function),
              },
            });
          },
        );
      });
    });

    describe('if some network configurations were specified at initialization', () => {
      it('returns network clients for all RPC endpoints within any defined network configurations, keyed by network client ID, and does not include Infura-supported chains by default', async () => {
        await withController(
          {
            state:
              buildNetworkControllerStateWithDefaultSelectedNetworkClientId({
                networkConfigurationsByChainId: {
                  '0x1337': buildCustomNetworkConfiguration({
                    chainId: '0x1337',
                    nativeCurrency: 'TOKEN1',
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                        url: 'https://test.network/1',
                      }),
                    ],
                  }),
                  '0x2448': buildCustomNetworkConfiguration({
                    chainId: '0x2448',
                    nativeCurrency: 'TOKEN2',
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                        url: 'https://test.network/2',
                      }),
                    ],
                  }),
                },
              }),
          },
          async ({ controller }) => {
            mockCreateNetworkClient().mockReturnValue(buildFakeClient());

            expect(controller.getNetworkClientRegistry()).toStrictEqual({
              'AAAA-AAAA-AAAA-AAAA': {
                blockTracker: expect.anything(),
                configuration: {
                  chainId: '0x1337',
                  rpcUrl: 'https://test.network/1',
                  ticker: 'TOKEN1',
                  type: NetworkClientType.Custom,
                },
                provider: expect.anything(),
                destroy: expect.any(Function),
              },
              'BBBB-BBBB-BBBB-BBBB': {
                blockTracker: expect.anything(),
                configuration: {
                  chainId: '0x2448',
                  rpcUrl: 'https://test.network/2',
                  ticker: 'TOKEN2',
                  type: NetworkClientType.Custom,
                },
                provider: expect.anything(),
                destroy: expect.any(Function),
              },
            });
          },
        );
      });
    });
  });

  describe('lookupNetwork', () => {
    describe('if a networkClientId param is passed', () => {
      it('updates the network status', async () => {
        await withController(
          { infuraProjectId: 'some-infura-project-id' },
          async ({ controller }) => {
            const fakeNetworkClient = buildFakeClient();
            mockCreateNetworkClient().mockReturnValue(fakeNetworkClient);
            await controller.lookupNetwork('mainnet');

            expect(controller.state.networksMetadata.mainnet.status).toBe(
              'available',
            );
          },
        );
      });

      it('throws an error if the network is not found', async () => {
        await withController(
          { infuraProjectId: 'some-infura-project-id' },
          async ({ controller }) => {
            await expect(() =>
              controller.lookupNetwork('non-existent-network-id'),
            ).rejects.toThrow(
              'No custom network client was found with the ID "non-existent-network-id".',
            );
          },
        );
      });
    });

    for (const infuraNetworkType of Object.values(InfuraNetworkType)) {
      const infuraChainId = ChainId[infuraNetworkType];

      // False negative - this is a string.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      describe(`when the selected network client represents the Infura network "${infuraNetworkType}"`, () => {
        describe('if the network was switched after the eth_getBlockByNumber request started but before it completed', () => {
          it('stores the network status of the second network, not the first', async () => {
            const infuraProjectId = 'some-infura-project-id';

            await withController(
              {
                state: {
                  selectedNetworkClientId: infuraNetworkType,
                  networkConfigurationsByChainId: {
                    [infuraChainId]:
                      buildInfuraNetworkConfiguration(infuraNetworkType),
                    '0x1337': buildCustomNetworkConfiguration({
                      chainId: '0x1337',
                      nativeCurrency: 'TEST',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                          url: 'https://test.network',
                        }),
                      ],
                    }),
                  },
                },
                infuraProjectId,
              },
              async ({ controller }) => {
                const fakeProviders = [
                  buildFakeProvider([
                    // Called during provider initialization
                    {
                      request: {
                        method: 'eth_getBlockByNumber',
                      },
                      response: SUCCESSFUL_ETH_GET_BLOCK_BY_NUMBER_RESPONSE,
                    },
                    // Called via `lookupNetwork` directly
                    {
                      request: {
                        method: 'eth_getBlockByNumber',
                      },
                      response: SUCCESSFUL_ETH_GET_BLOCK_BY_NUMBER_RESPONSE,
                      beforeCompleting: () => {
                        // We are purposefully not awaiting this promise.
                        // eslint-disable-next-line @typescript-eslint/no-floating-promises
                        controller.setActiveNetwork('AAAA-AAAA-AAAA-AAAA');
                      },
                    },
                  ]),
                  buildFakeProvider([
                    // Called when switching networks
                    {
                      request: {
                        method: 'eth_getBlockByNumber',
                      },
                      error: GENERIC_JSON_RPC_ERROR,
                    },
                  ]),
                ];
                const fakeNetworkClients = [
                  buildFakeClient(fakeProviders[0]),
                  buildFakeClient(fakeProviders[1]),
                ];
                mockCreateNetworkClient()
                  .calledWith({
                    chainId: ChainId[infuraNetworkType],
                    infuraProjectId,
                    network: infuraNetworkType,
                    ticker: NetworksTicker[infuraNetworkType],
                    type: NetworkClientType.Infura,
                  })
                  .mockReturnValue(fakeNetworkClients[0])
                  .calledWith({
                    chainId: '0x1337',
                    rpcUrl: 'https://test.network',
                    ticker: 'TEST',
                    type: NetworkClientType.Custom,
                  })
                  .mockReturnValue(fakeNetworkClients[1]);
                await controller.initializeProvider();
                expect(
                  controller.state.networksMetadata[infuraNetworkType].status,
                ).toBe('available');

                await controller.lookupNetwork();

                expect(
                  controller.state.networksMetadata['AAAA-AAAA-AAAA-AAAA']
                    .status,
                ).toBe('unknown');
              },
            );
          });

          it('stores the EIP-1559 support of the second network, not the first', async () => {
            const infuraProjectId = 'some-infura-project-id';

            await withController(
              {
                state: {
                  selectedNetworkClientId: infuraNetworkType,
                  networkConfigurationsByChainId: {
                    [infuraChainId]:
                      buildInfuraNetworkConfiguration(infuraNetworkType),
                    '0x1337': buildCustomNetworkConfiguration({
                      chainId: '0x1337',
                      nativeCurrency: 'TEST',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                          url: 'https://test.network',
                        }),
                      ],
                    }),
                  },
                },
                infuraProjectId,
              },
              async ({ controller }) => {
                const fakeProviders = [
                  buildFakeProvider([
                    // Called during provider initialization
                    {
                      request: {
                        method: 'eth_getBlockByNumber',
                      },
                      response: {
                        result: POST_1559_BLOCK,
                      },
                    },
                    // Called via `lookupNetwork` directly
                    {
                      request: {
                        method: 'eth_getBlockByNumber',
                      },
                      response: {
                        result: POST_1559_BLOCK,
                      },
                      beforeCompleting: () => {
                        // We are purposefully not awaiting this promise.
                        // eslint-disable-next-line @typescript-eslint/no-floating-promises
                        controller.setActiveNetwork('AAAA-AAAA-AAAA-AAAA');
                      },
                    },
                  ]),
                  buildFakeProvider([
                    // Called when switching networks
                    {
                      request: {
                        method: 'eth_getBlockByNumber',
                      },
                      response: {
                        result: PRE_1559_BLOCK,
                      },
                    },
                  ]),
                ];
                const fakeNetworkClients = [
                  buildFakeClient(fakeProviders[0]),
                  buildFakeClient(fakeProviders[1]),
                ];
                mockCreateNetworkClient()
                  .calledWith({
                    chainId: ChainId[infuraNetworkType],
                    infuraProjectId,
                    network: infuraNetworkType,
                    ticker: NetworksTicker[infuraNetworkType],
                    type: NetworkClientType.Infura,
                  })
                  .mockReturnValue(fakeNetworkClients[0])
                  .calledWith({
                    chainId: '0x1337',
                    rpcUrl: 'https://test.network',
                    ticker: 'TEST',
                    type: NetworkClientType.Custom,
                  })
                  .mockReturnValue(fakeNetworkClients[1]);
                await controller.initializeProvider();
                expect(
                  controller.state.networksMetadata[infuraNetworkType]
                    .EIPS[1559],
                ).toBe(true);

                await controller.lookupNetwork();

                expect(
                  controller.state.networksMetadata['AAAA-AAAA-AAAA-AAAA']
                    .EIPS[1559],
                ).toBe(false);
              },
            );
          });

          it('emits infuraIsUnblocked, not infuraIsBlocked, assuming that the first network was blocked', async () => {
            const infuraProjectId = 'some-infura-project-id';

            await withController(
              {
                state: {
                  selectedNetworkClientId: infuraNetworkType,
                  networkConfigurationsByChainId: {
                    [infuraChainId]:
                      buildInfuraNetworkConfiguration(infuraNetworkType),
                    '0x1337': buildCustomNetworkConfiguration({
                      chainId: '0x1337',
                      nativeCurrency: 'TEST',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                          url: 'https://test.network',
                        }),
                      ],
                    }),
                  },
                },
                infuraProjectId,
              },
              async ({ controller, messenger }) => {
                const fakeProviders = [
                  buildFakeProvider([
                    // Called during provider initialization
                    {
                      request: {
                        method: 'eth_getBlockByNumber',
                      },
                      response: SUCCESSFUL_ETH_GET_BLOCK_BY_NUMBER_RESPONSE,
                    },
                    // Called via `lookupNetwork` directly
                    {
                      request: {
                        method: 'eth_getBlockByNumber',
                      },
                      error: BLOCKED_INFURA_JSON_RPC_ERROR,
                      beforeCompleting: () => {
                        // We are purposefully not awaiting this promise.
                        // eslint-disable-next-line @typescript-eslint/no-floating-promises
                        controller.setActiveNetwork('AAAA-AAAA-AAAA-AAAA');
                      },
                    },
                  ]),
                  buildFakeProvider([
                    // Called when switching networks
                    {
                      request: {
                        method: 'eth_getBlockByNumber',
                      },
                      response: SUCCESSFUL_ETH_GET_BLOCK_BY_NUMBER_RESPONSE,
                    },
                  ]),
                ];
                const fakeNetworkClients = [
                  buildFakeClient(fakeProviders[0]),
                  buildFakeClient(fakeProviders[1]),
                ];
                mockCreateNetworkClient()
                  .calledWith({
                    chainId: ChainId[infuraNetworkType],
                    infuraProjectId,
                    network: infuraNetworkType,
                    ticker: NetworksTicker[infuraNetworkType],
                    type: NetworkClientType.Infura,
                  })
                  .mockReturnValue(fakeNetworkClients[0])
                  .calledWith({
                    chainId: '0x1337',
                    rpcUrl: 'https://test.network',
                    ticker: 'TEST',
                    type: NetworkClientType.Custom,
                  })
                  .mockReturnValue(fakeNetworkClients[1]);
                await controller.initializeProvider();
                const promiseForInfuraIsUnblockedEvents =
                  waitForPublishedEvents({
                    messenger,
                    eventType: 'NetworkController:infuraIsUnblocked',
                  });
                const promiseForNoInfuraIsBlockedEvents =
                  waitForPublishedEvents({
                    messenger,
                    eventType: 'NetworkController:infuraIsBlocked',
                    count: 0,
                  });

                await waitForStateChanges({
                  messenger,
                  propertyPath: [
                    'networksMetadata',
                    'AAAA-AAAA-AAAA-AAAA',
                    'status',
                  ],
                  operation: async () => {
                    await controller.lookupNetwork();
                  },
                });

                await expect(promiseForInfuraIsUnblockedEvents).toBeFulfilled();
                await expect(promiseForNoInfuraIsBlockedEvents).toBeFulfilled();
              },
            );
          });
        });

        lookupNetworkTests({
          expectedNetworkClientType: NetworkClientType.Infura,
          initialState: {
            selectedNetworkClientId: infuraNetworkType,
          },
          operation: async (controller) => {
            await controller.lookupNetwork();
          },
        });
      });
    }

    describe('when the selected network client represents a custom RPC endpoint', () => {
      describe('if the network was switched after the eth_getBlockByNumber request started but before it completed', () => {
        it('stores the network status of the second network, not the first', async () => {
          const infuraProjectId = 'some-infura-project-id';

          await withController(
            {
              state: {
                selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
                networkConfigurationsByChainId: {
                  [ChainId.goerli]: buildInfuraNetworkConfiguration(
                    InfuraNetworkType.goerli,
                  ),
                  '0x1337': buildCustomNetworkConfiguration({
                    chainId: '0x1337',
                    nativeCurrency: 'TEST',
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                        url: 'https://test.network',
                      }),
                    ],
                  }),
                },
              },
              infuraProjectId,
            },
            async ({ controller }) => {
              const fakeProviders = [
                buildFakeProvider([
                  // Called during provider initialization
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                    },
                    response: SUCCESSFUL_ETH_GET_BLOCK_BY_NUMBER_RESPONSE,
                  },
                  // Called via `lookupNetwork` directly
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                    },
                    response: SUCCESSFUL_ETH_GET_BLOCK_BY_NUMBER_RESPONSE,
                    beforeCompleting: () => {
                      // We are purposefully not awaiting this promise.
                      // eslint-disable-next-line @typescript-eslint/no-floating-promises
                      controller.setProviderType(NetworkType.goerli);
                    },
                  },
                ]),
                buildFakeProvider([
                  // Called when switching networks
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                    },
                    error: GENERIC_JSON_RPC_ERROR,
                  },
                ]),
              ];
              const fakeNetworkClients = [
                buildFakeClient(fakeProviders[0]),
                buildFakeClient(fakeProviders[1]),
              ];
              mockCreateNetworkClient()
                .calledWith({
                  chainId: '0x1337',
                  rpcUrl: 'https://test.network',
                  ticker: 'TEST',
                  type: NetworkClientType.Custom,
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  chainId: ChainId[InfuraNetworkType.goerli],
                  infuraProjectId,
                  network: InfuraNetworkType.goerli,
                  ticker: NetworksTicker[InfuraNetworkType.goerli],
                  type: NetworkClientType.Infura,
                })
                .mockReturnValue(fakeNetworkClients[1]);
              await controller.initializeProvider();
              expect(
                controller.state.networksMetadata['AAAA-AAAA-AAAA-AAAA'].status,
              ).toBe('available');

              await controller.lookupNetwork();

              expect(
                controller.state.networksMetadata[InfuraNetworkType.goerli]
                  .status,
              ).toBe('unknown');
            },
          );
        });

        it('stores the EIP-1559 support of the second network, not the first', async () => {
          const infuraProjectId = 'some-infura-project-id';

          await withController(
            {
              state: {
                selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
                networkConfigurationsByChainId: {
                  [ChainId.goerli]: buildInfuraNetworkConfiguration(
                    InfuraNetworkType.goerli,
                  ),
                  '0x1337': buildCustomNetworkConfiguration({
                    chainId: '0x1337',
                    nativeCurrency: 'TEST',
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                        url: 'https://test.network',
                      }),
                    ],
                  }),
                },
              },
              infuraProjectId,
            },
            async ({ controller }) => {
              const fakeProviders = [
                buildFakeProvider([
                  // Called during provider initialization
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                    },
                    response: {
                      result: POST_1559_BLOCK,
                    },
                  },
                  // Called via `lookupNetwork` directly
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                    },
                    response: {
                      result: POST_1559_BLOCK,
                    },
                    beforeCompleting: () => {
                      // We are purposefully not awaiting this promise.
                      // eslint-disable-next-line @typescript-eslint/no-floating-promises
                      controller.setProviderType(NetworkType.goerli);
                    },
                  },
                ]),
                buildFakeProvider([
                  // Called when switching networks
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                    },
                    response: {
                      result: PRE_1559_BLOCK,
                    },
                  },
                ]),
              ];
              const fakeNetworkClients = [
                buildFakeClient(fakeProviders[0]),
                buildFakeClient(fakeProviders[1]),
              ];
              mockCreateNetworkClient()
                .calledWith({
                  chainId: '0x1337',
                  rpcUrl: 'https://test.network',
                  ticker: 'TEST',
                  type: NetworkClientType.Custom,
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  chainId: ChainId[InfuraNetworkType.goerli],
                  infuraProjectId,
                  network: InfuraNetworkType.goerli,
                  ticker: NetworksTicker[InfuraNetworkType.goerli],
                  type: NetworkClientType.Infura,
                })
                .mockReturnValue(fakeNetworkClients[1]);
              await controller.initializeProvider();
              expect(
                controller.state.networksMetadata['AAAA-AAAA-AAAA-AAAA']
                  .EIPS[1559],
              ).toBe(true);

              await controller.lookupNetwork();

              expect(
                controller.state.networksMetadata[NetworkType.goerli]
                  .EIPS[1559],
              ).toBe(false);
              expect(
                controller.state.networksMetadata['AAAA-AAAA-AAAA-AAAA']
                  .EIPS[1559],
              ).toBe(true);
            },
          );
        });

        it('emits infuraIsBlocked, not infuraIsUnblocked, if the second network was blocked and the first network was not', async () => {
          const infuraProjectId = 'some-infura-project-id';

          await withController(
            {
              state: {
                selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
                networkConfigurationsByChainId: {
                  [ChainId.goerli]: buildInfuraNetworkConfiguration(
                    InfuraNetworkType.goerli,
                  ),
                  '0x1337': buildCustomNetworkConfiguration({
                    chainId: '0x1337',
                    nativeCurrency: 'TEST',
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                        url: 'https://test.network',
                      }),
                    ],
                  }),
                },
              },
              infuraProjectId,
            },
            async ({ controller, messenger }) => {
              const fakeProviders = [
                buildFakeProvider([
                  // Called during provider initialization
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                    },
                    response: SUCCESSFUL_ETH_GET_BLOCK_BY_NUMBER_RESPONSE,
                  },
                  // Called via `lookupNetwork` directly
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                    },
                    response: SUCCESSFUL_ETH_GET_BLOCK_BY_NUMBER_RESPONSE,
                    beforeCompleting: () => {
                      // We are purposefully not awaiting this promise.
                      // eslint-disable-next-line @typescript-eslint/no-floating-promises
                      controller.setProviderType(NetworkType.goerli);
                    },
                  },
                ]),
                buildFakeProvider([
                  // Called when switching networks
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                    },
                    error: BLOCKED_INFURA_JSON_RPC_ERROR,
                  },
                ]),
              ];
              const fakeNetworkClients = [
                buildFakeClient(fakeProviders[0]),
                buildFakeClient(fakeProviders[1]),
              ];
              mockCreateNetworkClient()
                .calledWith({
                  chainId: '0x1337',
                  rpcUrl: 'https://test.network',
                  ticker: 'TEST',
                  type: NetworkClientType.Custom,
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  chainId: ChainId[InfuraNetworkType.goerli],
                  infuraProjectId,
                  network: InfuraNetworkType.goerli,
                  ticker: NetworksTicker[InfuraNetworkType.goerli],
                  type: NetworkClientType.Infura,
                })
                .mockReturnValue(fakeNetworkClients[1]);
              await controller.initializeProvider();
              const promiseForNoInfuraIsUnblockedEvents =
                waitForPublishedEvents({
                  messenger,
                  eventType: 'NetworkController:infuraIsUnblocked',
                  count: 0,
                });
              const promiseForInfuraIsBlockedEvents = waitForPublishedEvents({
                messenger,
                eventType: 'NetworkController:infuraIsBlocked',
              });

              await controller.lookupNetwork();

              await expect(promiseForNoInfuraIsUnblockedEvents).toBeFulfilled();
              await expect(promiseForInfuraIsBlockedEvents).toBeFulfilled();
            },
          );
        });
      });

      lookupNetworkTests({
        expectedNetworkClientType: NetworkClientType.Custom,
        initialState: {
          selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
          networkConfigurationsByChainId: {
            '0x1337': buildCustomNetworkConfiguration({
              chainId: '0x1337',
              nativeCurrency: 'TEST',
              rpcEndpoints: [
                buildCustomRpcEndpoint({
                  networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                  url: 'https://test.network',
                }),
              ],
            }),
          },
        },
        operation: async (controller) => {
          await controller.lookupNetwork();
        },
      });
    });
  });

  describe('setProviderType', () => {
    for (const infuraNetworkType of Object.values(InfuraNetworkType)) {
      // False negative - this is a string.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      describe(`given the Infura network "${infuraNetworkType}"`, () => {
        refreshNetworkTests({
          expectedNetworkClientConfiguration:
            buildInfuraNetworkClientConfiguration(infuraNetworkType),
          operation: async (controller) => {
            await controller.setProviderType(infuraNetworkType);
          },
        });
      });

      // False negative - this is a string.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      it(`sets selectedNetworkClientId in state to "${infuraNetworkType}"`, async () => {
        await withController(async ({ controller }) => {
          mockCreateNetworkClient().mockReturnValue(buildFakeClient());

          await controller.setProviderType(infuraNetworkType);

          expect(controller.state.selectedNetworkClientId).toBe(
            infuraNetworkType,
          );
        });
      });
    }

    describe('given "rpc"', () => {
      it('throws because there is no way to switch to a custom RPC endpoint using this method', async () => {
        await withController(
          {
            state: {
              selectedNetworkClientId: 'mainnet',
            },
          },
          async ({ controller }) => {
            await expect(() =>
              // @ts-expect-error Intentionally passing invalid type
              controller.setProviderType(NetworkType.rpc),
            ).rejects.toThrow(
              'NetworkController - cannot call "setProviderType" with type "rpc". Use "setActiveNetwork"',
            );
          },
        );
      });

      it("doesn't set a provider", async () => {
        await withController(async ({ controller }) => {
          const fakeProvider = buildFakeProvider();
          const fakeNetworkClient = buildFakeClient(fakeProvider);
          createNetworkClientMock.mockReturnValue(fakeNetworkClient);

          try {
            // @ts-expect-error Intentionally passing invalid type
            await controller.setProviderType(NetworkType.rpc);
          } catch {
            // catch the rejection (it is tested above)
          }

          expect(createNetworkClientMock).not.toHaveBeenCalled();
          expect(
            controller.getProviderAndBlockTracker().provider,
          ).toBeUndefined();
        });
      });

      it('does not update networksMetadata[...].EIPS in state', async () => {
        await withController(async ({ controller }) => {
          const fakeProvider = buildFakeProvider([
            {
              request: {
                method: 'eth_getBlockByNumber',
                params: ['latest', false],
              },
              response: {
                result: {
                  baseFeePerGas: '0x1',
                },
              },
            },
          ]);
          const fakeNetworkClient = buildFakeClient(fakeProvider);
          createNetworkClientMock.mockReturnValue(fakeNetworkClient);

          const detailsPre =
            controller.state.networksMetadata[
              controller.state.selectedNetworkClientId
            ];

          try {
            // @ts-expect-error Intentionally passing invalid type
            await controller.setProviderType(NetworkType.rpc);
          } catch {
            // catch the rejection (it is tested above)
          }

          const detailsPost =
            controller.state.networksMetadata[
              controller.state.selectedNetworkClientId
            ];

          expect(detailsPost).toBe(detailsPre);
        });
      });
    });

    describe('given an invalid Infura network name', () => {
      it('throws', async () => {
        await withController(async ({ controller }) => {
          await expect(() =>
            // @ts-expect-error Intentionally passing invalid type
            controller.setProviderType('invalid-infura-network'),
          ).rejects.toThrow(
            new Error('Unknown Infura provider type "invalid-infura-network".'),
          );
        });
      });
    });

    it('is callable from the controller messenger', async () => {
      await withController({}, async ({ controller, messenger }) => {
        const fakeProvider = buildFakeProvider();
        const fakeNetworkClient = buildFakeClient(fakeProvider);
        mockCreateNetworkClient().mockReturnValue(fakeNetworkClient);

        await messenger.call('NetworkController:setProviderType', 'goerli');

        expect(controller.state.selectedNetworkClientId).toBe('goerli');
      });
    });
  });

  describe('setActiveNetwork', () => {
    describe('if the given ID does not refer to an existing network client', () => {
      it('throws', async () => {
        await withController(async ({ controller }) => {
          await expect(() =>
            controller.setActiveNetwork('invalid-network-client-id'),
          ).rejects.toThrow(
            new Error(
              "No network client found with ID 'invalid-network-client-id'",
            ),
          );
        });
      });
    });

    for (const infuraNetworkType of Object.values(InfuraNetworkType)) {
      const infuraChainId = ChainId[infuraNetworkType];

      // False negative - this is a string.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      describe(`if the ID refers to a network client created for the Infura network "${infuraNetworkType}"`, () => {
        refreshNetworkTests({
          expectedNetworkClientConfiguration:
            buildInfuraNetworkClientConfiguration(infuraNetworkType),
          initialState: {
            selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
            networkConfigurationsByChainId: {
              [infuraChainId]:
                buildInfuraNetworkConfiguration(infuraNetworkType),
              '0x1337': buildCustomNetworkConfiguration({
                chainId: '0x1337',
                rpcEndpoints: [
                  buildCustomRpcEndpoint({
                    networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                  }),
                ],
              }),
            },
          },
          operation: async (controller) => {
            await controller.setActiveNetwork(infuraNetworkType);
          },
        });

        // False negative - this is a string.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        it(`sets selectedNetworkClientId in state to "${infuraNetworkType}"`, async () => {
          await withController({}, async ({ controller }) => {
            mockCreateNetworkClient().mockReturnValue(buildFakeClient());

            await controller.setActiveNetwork(infuraNetworkType);

            expect(controller.state.selectedNetworkClientId).toStrictEqual(
              infuraNetworkType,
            );
          });
        });
      });
    }

    describe('if the ID refers to a custom network client', () => {
      refreshNetworkTests({
        expectedNetworkClientConfiguration:
          buildCustomNetworkClientConfiguration({
            rpcUrl: 'https://test.network',
            chainId: '0x1337',
            ticker: 'TEST',
          }),
        initialState: {
          selectedNetworkClientId: InfuraNetworkType.mainnet,
          networkConfigurationsByChainId: {
            [ChainId.mainnet]: buildInfuraNetworkConfiguration(
              InfuraNetworkType.mainnet,
            ),
            '0x1337': buildCustomNetworkConfiguration({
              chainId: '0x1337',
              nativeCurrency: 'TEST',
              rpcEndpoints: [
                buildCustomRpcEndpoint({
                  networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                  url: 'https://test.network',
                }),
              ],
            }),
          },
        },
        operation: async (controller) => {
          await controller.setActiveNetwork('AAAA-AAAA-AAAA-AAAA');
        },
      });

      it('assigns selectedNetworkClientId in state to the ID', async () => {
        const testNetworkClientId = 'AAAA-AAAA-AAAA-AAAA';
        await withController(
          {
            state: {
              selectedNetworkClientId: InfuraNetworkType.mainnet,
              networkConfigurationsByChainId: {
                [ChainId.mainnet]: buildInfuraNetworkConfiguration(
                  InfuraNetworkType.mainnet,
                ),
                '0x1337': buildCustomNetworkConfiguration({
                  chainId: '0x1337',
                  nativeCurrency: 'TEST',
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      url: 'https://test.network',
                    }),
                  ],
                }),
              },
            },
          },
          async ({ controller }) => {
            mockCreateNetworkClient().mockReturnValue(buildFakeClient());

            await controller.setActiveNetwork(testNetworkClientId);

            expect(controller.state.selectedNetworkClientId).toStrictEqual(
              testNetworkClientId,
            );
          },
        );
      });
    });

    it('is able to be called via messenger action', async () => {
      await withController(
        {
          state: {
            selectedNetworkClientId: InfuraNetworkType.mainnet,
            networkConfigurationsByChainId: {
              [ChainId.mainnet]: buildInfuraNetworkConfiguration(
                InfuraNetworkType.mainnet,
              ),
              '0x1337': buildCustomNetworkConfiguration({
                chainId: '0x1337',
                nativeCurrency: 'TEST',
                rpcEndpoints: [
                  buildCustomRpcEndpoint({
                    networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                    url: 'https://test.network',
                  }),
                ],
              }),
            },
          },
        },
        async ({ controller, messenger }) => {
          mockCreateNetworkClient().mockReturnValue(buildFakeClient());

          await messenger.call(
            'NetworkController:setActiveNetwork',
            'AAAA-AAAA-AAAA-AAAA',
          );

          expect(controller.state.selectedNetworkClientId).toBe(
            'AAAA-AAAA-AAAA-AAAA',
          );
        },
      );
    });
  });

  describe('getEIP1559Compatibility', () => {
    describe('if no provider has been set yet', () => {
      it('does not make any state changes', async () => {
        await withController(async ({ controller, messenger }) => {
          const promiseForNoStateChanges = waitForStateChanges({
            messenger,
            count: 0,
            operation: async () => {
              await controller.getEIP1559Compatibility();
            },
          });

          expect(Boolean(promiseForNoStateChanges)).toBe(true);
        });
      });

      it('returns false', async () => {
        await withController(async ({ controller }) => {
          const isEIP1559Compatible =
            await controller.getEIP1559Compatibility();

          expect(isEIP1559Compatible).toBe(false);
        });
      });
    });

    describe('if a networkClientId is passed in', () => {
      it('uses the built in state for networksMetadata', async () => {
        await withController(
          {
            state: {
              networksMetadata: {
                'linea-mainnet': {
                  EIPS: {
                    1559: true,
                  },
                  status: NetworkStatus.Unknown,
                },
              },
            },
          },
          async ({ controller }) => {
            const isEIP1559Compatible =
              await controller.getEIP1559Compatibility('linea-mainnet');

            expect(isEIP1559Compatible).toBe(true);
          },
        );
      });
      it('uses the built in false state for networksMetadata', async () => {
        await withController(
          {
            state: {
              networksMetadata: {
                'linea-mainnet': {
                  EIPS: {
                    1559: false,
                  },
                  status: NetworkStatus.Unknown,
                },
              },
            },
          },
          async ({ controller }) => {
            const isEIP1559Compatible =
              await controller.getEIP1559Compatibility('linea-mainnet');

            expect(isEIP1559Compatible).toBe(false);
          },
        );
      });
      it('calls provider of the networkClientId and returns true', async () => {
        await withController(
          {
            infuraProjectId: 'some-infura-project-id',
          },
          async ({ controller }) => {
            await setFakeProvider(controller, {
              stubs: [
                {
                  request: {
                    method: 'eth_getBlockByNumber',
                    params: ['latest', false],
                  },
                  response: {
                    result: POST_1559_BLOCK,
                  },
                },
                {
                  request: {
                    method: 'eth_getBlockByNumber',
                    params: ['latest', false],
                  },
                  response: {
                    result: POST_1559_BLOCK,
                  },
                },
              ],
            });
            const isEIP1559Compatible =
              await controller.getEIP1559Compatibility('linea-mainnet');
            expect(isEIP1559Compatible).toBe(true);
          },
        );
      });
    });

    describe('if a provider has been set but networksMetadata[selectedNetworkClientId].EIPS in state already has a "1559" property', () => {
      it('does not make any state changes', async () => {
        await withController(
          {
            state: {
              networksMetadata: {
                mainnet: {
                  EIPS: {
                    1559: true,
                  },
                  status: NetworkStatus.Unknown,
                },
              },
            },
          },
          async ({ controller, messenger }) => {
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            setFakeProvider(controller, {
              stubLookupNetworkWhileSetting: true,
            });
            const promiseForNoStateChanges = waitForStateChanges({
              messenger,
              count: 0,
              operation: async () => {
                await controller.getEIP1559Compatibility();
              },
            });

            expect(Boolean(promiseForNoStateChanges)).toBe(true);
          },
        );
      });

      it('returns the value of the "1559" property', async () => {
        await withController(
          {
            state: {
              networksMetadata: {
                mainnet: {
                  EIPS: {
                    1559: true,
                  },
                  status: NetworkStatus.Unknown,
                },
              },
            },
          },
          async ({ controller }) => {
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            setFakeProvider(controller, {
              stubLookupNetworkWhileSetting: true,
            });

            const isEIP1559Compatible =
              await controller.getEIP1559Compatibility();

            expect(isEIP1559Compatible).toBe(true);
          },
        );
      });
    });

    describe('if a provider has been set and networksMetadata[selectedNetworkClientId].EIPS in state does not already have a "1559" property', () => {
      describe('if the request for the latest block is successful', () => {
        describe('if the latest block has a "baseFeePerGas" property', () => {
          it('sets the "1559" property to true', async () => {
            await withController(async ({ controller }) => {
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              setFakeProvider(controller, {
                stubs: [
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                      params: ['latest', false],
                    },
                    response: {
                      result: POST_1559_BLOCK,
                    },
                  },
                ],
                stubLookupNetworkWhileSetting: true,
              });

              await controller.getEIP1559Compatibility();

              expect(
                controller.state.networksMetadata[
                  controller.state.selectedNetworkClientId
                ].EIPS[1559],
              ).toBe(true);
            });
          });

          it('returns true', async () => {
            await withController(async ({ controller }) => {
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              setFakeProvider(controller, {
                stubs: [
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                      params: ['latest', false],
                    },
                    response: {
                      result: POST_1559_BLOCK,
                    },
                  },
                ],
                stubLookupNetworkWhileSetting: true,
              });

              const isEIP1559Compatible =
                await controller.getEIP1559Compatibility();

              expect(isEIP1559Compatible).toBe(true);
            });
          });
        });

        describe('if the latest block does not have a "baseFeePerGas" property', () => {
          it('sets the "1559" property to false', async () => {
            await withController(async ({ controller }) => {
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              setFakeProvider(controller, {
                stubs: [
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                      params: ['latest', false],
                    },
                    response: {
                      result: PRE_1559_BLOCK,
                    },
                  },
                ],
                stubLookupNetworkWhileSetting: true,
              });

              await controller.getEIP1559Compatibility();

              expect(
                controller.state.networksMetadata[
                  controller.state.selectedNetworkClientId
                ].EIPS[1559],
              ).toBe(false);
            });
          });

          it('returns false', async () => {
            await withController(async ({ controller }) => {
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              setFakeProvider(controller, {
                stubs: [
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                      params: ['latest', false],
                    },
                    response: {
                      result: PRE_1559_BLOCK,
                    },
                  },
                ],
                stubLookupNetworkWhileSetting: true,
              });

              const isEIP1559Compatible =
                await controller.getEIP1559Compatibility();

              expect(isEIP1559Compatible).toBe(false);
            });
          });
        });

        describe('if the request for the latest block responds with null', () => {
          const latestBlockRespondsNull = {
            request: {
              method: 'eth_getBlockByNumber',
              params: ['latest', false],
            },
            response: {
              result: null,
            },
          };
          it('keeps the "1559" property as undefined', async () => {
            await withController(async ({ controller }) => {
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              setFakeProvider(controller, {
                stubs: [latestBlockRespondsNull],
                stubLookupNetworkWhileSetting: true,
              });

              await controller.getEIP1559Compatibility();

              expect(
                controller.state.networksMetadata[
                  controller.state.selectedNetworkClientId
                ].EIPS[1559],
              ).toBeUndefined();
            });
          });

          it('returns undefined', async () => {
            await withController(async ({ controller }) => {
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              setFakeProvider(controller, {
                stubs: [latestBlockRespondsNull],
                stubLookupNetworkWhileSetting: true,
              });

              const isEIP1559Compatible =
                await controller.getEIP1559Compatibility();

              expect(isEIP1559Compatible).toBeUndefined();
            });
          });
        });
      });

      describe('if the request for the latest block is unsuccessful', () => {
        it('does not make any state changes', async () => {
          await withController(async ({ controller, messenger }) => {
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            setFakeProvider(controller, {
              stubs: [
                {
                  request: {
                    method: 'eth_getBlockByNumber',
                    params: ['latest', false],
                  },
                  error: GENERIC_JSON_RPC_ERROR,
                },
              ],
              stubLookupNetworkWhileSetting: true,
            });

            const promiseForNoStateChanges = waitForStateChanges({
              messenger,
              count: 0,
              operation: async () => {
                try {
                  await controller.getEIP1559Compatibility();
                } catch (error) {
                  // ignore error
                }
              },
            });

            expect(Boolean(promiseForNoStateChanges)).toBe(true);
          });
        });
      });
    });
  });

  describe('resetConnection', () => {
    for (const infuraNetworkType of Object.values(InfuraNetworkType)) {
      // False negative - this is a string.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      describe(`when the selected network client represents the Infura network "${infuraNetworkType}"`, () => {
        refreshNetworkTests({
          expectedNetworkClientConfiguration:
            buildInfuraNetworkClientConfiguration(infuraNetworkType),
          initialState: {
            selectedNetworkClientId: infuraNetworkType,
          },
          operation: async (controller) => {
            await controller.resetConnection();
          },
        });
      });
    }

    describe('when the selected network client represents a custom RPC endpoint', () => {
      refreshNetworkTests({
        expectedNetworkClientConfiguration:
          buildCustomNetworkClientConfiguration({
            rpcUrl: 'https://test.network',
            chainId: '0x1337',
            ticker: 'TEST',
          }),
        initialState: {
          selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
          networkConfigurationsByChainId: {
            '0x1337': buildCustomNetworkConfiguration({
              chainId: '0x1337',
              nativeCurrency: 'TEST',
              rpcEndpoints: [
                buildCustomRpcEndpoint({
                  networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                  url: 'https://test.network',
                }),
              ],
            }),
          },
        },
        operation: async (controller) => {
          await controller.resetConnection();
        },
      });
    });
  });

  describe('NetworkController:getEthQuery action', () => {
    it('returns a EthQuery object that can be used to make requests to the currently selected network', async () => {
      await withController(async ({ controller, messenger }) => {
        await setFakeProvider(controller, {
          stubs: [
            {
              request: {
                method: 'test_method',
                params: [],
              },
              response: {
                result: 'test response',
              },
            },
          ],
        });

        const ethQuery = messenger.call('NetworkController:getEthQuery');
        assert(ethQuery, 'ethQuery is not set');

        const promisifiedSendAsync = promisify(ethQuery.sendAsync).bind(
          ethQuery,
        );
        const result = await promisifiedSendAsync({
          id: 1,
          jsonrpc: '2.0',
          method: 'test_method',
          params: [],
        });
        expect(result).toBe('test response');
      });
    });

    it('returns undefined if the provider has not been set yet', async () => {
      await withController(({ messenger }) => {
        const ethQuery = messenger.call('NetworkController:getEthQuery');

        expect(ethQuery).toBeUndefined();
      });
    });
  });

  for (const [name, getNetworkConfigurationByChainId] of [
    [
      'getNetworkConfigurationByChainId',
      ({
        controller,
        chainId,
      }: {
        controller: NetworkController;
        chainId: Hex;
      }) => controller.getNetworkConfigurationByChainId(chainId),
    ],
    [
      'NetworkController:getNetworkConfigurationByChainId',
      ({
        messenger,
        chainId,
      }: {
        messenger: ControllerMessenger<
          NetworkControllerActions,
          NetworkControllerEvents
        >;
        chainId: Hex;
      }) =>
        messenger.call(
          'NetworkController:getNetworkConfigurationByChainId',
          chainId,
        ),
    ],
  ] as const) {
    // This is a string!
    // eslint-disable-next-line jest/valid-title
    describe(name, () => {
      for (const infuraNetworkType of Object.values(InfuraNetworkType)) {
        const infuraChainId = ChainId[infuraNetworkType];

        // False negative - this is a string.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        describe(`given the ID of the Infura-supported chain "${infuraNetworkType}" that a network configuration is filed under`, () => {
          it('returns the network configuration', async () => {
            const registeredNetworkConfiguration =
              buildInfuraNetworkConfiguration(infuraNetworkType);
            await withController(
              {
                state:
                  buildNetworkControllerStateWithDefaultSelectedNetworkClientId(
                    {
                      networkConfigurationsByChainId: {
                        [infuraChainId]: registeredNetworkConfiguration,
                      },
                    },
                  ),
              },
              ({ controller, messenger }) => {
                const returnedNetworkConfiguration =
                  getNetworkConfigurationByChainId({
                    controller,
                    messenger,
                    chainId: infuraChainId,
                  });

                expect(returnedNetworkConfiguration).toBe(
                  registeredNetworkConfiguration,
                );
              },
            );
          });
        });
      }

      describe('given the ID of a non-Infura-supported chain that a network configuration is filed under', () => {
        it('returns the network configuration', async () => {
          const registeredNetworkConfiguration =
            buildCustomNetworkConfiguration({
              chainId: '0x1337',
            });
          await withController(
            {
              state:
                buildNetworkControllerStateWithDefaultSelectedNetworkClientId({
                  networkConfigurationsByChainId: {
                    '0x1337': registeredNetworkConfiguration,
                  },
                }),
            },
            ({ controller, messenger }) => {
              const returnedNetworkConfiguration =
                getNetworkConfigurationByChainId({
                  controller,
                  messenger,
                  chainId: '0x1337',
                });

              expect(returnedNetworkConfiguration).toBe(
                registeredNetworkConfiguration,
              );
            },
          );
        });
      });

      describe('given the ID of a chain that no network configuration is filed under', () => {
        it('returns undefined', async () => {
          await withController(({ controller, messenger }) => {
            const returnedNetworkConfiguration =
              getNetworkConfigurationByChainId({
                controller,
                messenger,
                chainId: '0x9999999999999',
              });

            expect(returnedNetworkConfiguration).toBeUndefined();
          });
        });
      });
    });
  }

  for (const [name, getNetworkConfigurationByNetworkClientId] of [
    [
      'getNetworkConfigurationByNetworkClientId',
      ({
        controller,
        networkClientId,
      }: {
        controller: NetworkController;
        networkClientId: NetworkClientId;
      }) =>
        controller.getNetworkConfigurationByNetworkClientId(networkClientId),
    ],
    [
      'NetworkController:getNetworkConfigurationByNetworkClientId',
      ({
        messenger,
        networkClientId,
      }: {
        messenger: ControllerMessenger<
          NetworkControllerActions,
          NetworkControllerEvents
        >;
        networkClientId: NetworkClientId;
      }) =>
        messenger.call(
          'NetworkController:getNetworkConfigurationByNetworkClientId',
          networkClientId,
        ),
    ],
  ] as const) {
    // This is a string!
    // eslint-disable-next-line jest/valid-title
    describe(name, () => {
      for (const infuraNetworkType of Object.values(InfuraNetworkType)) {
        const infuraChainId = ChainId[infuraNetworkType];

        // False negative - this is a string.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        describe(`given the ID of a network client that corresponds to an RPC endpoint for the Infura network "${infuraNetworkType}" in a network configuration`, () => {
          it('returns the network configuration', async () => {
            const registeredNetworkConfiguration =
              buildInfuraNetworkConfiguration(infuraNetworkType);
            await withController(
              {
                state: {
                  selectedNetworkClientId: infuraNetworkType,
                  networkConfigurationsByChainId: {
                    [infuraChainId]: registeredNetworkConfiguration,
                  },
                },
              },
              ({ controller, messenger }) => {
                const returnedNetworkConfiguration =
                  getNetworkConfigurationByNetworkClientId({
                    controller,
                    messenger,
                    networkClientId: infuraNetworkType,
                  });

                expect(returnedNetworkConfiguration).toBe(
                  registeredNetworkConfiguration,
                );
              },
            );
          });
        });
      }

      describe('given the ID of a network client that corresponds to a custom RPC endpoint in a network configuration', () => {
        it('returns the network configuration', async () => {
          const registeredNetworkConfiguration =
            buildCustomNetworkConfiguration({
              chainId: '0x1337',
              rpcEndpoints: [
                buildCustomRpcEndpoint({
                  networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                }),
              ],
            });
          await withController(
            {
              state: {
                selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
                networkConfigurationsByChainId: {
                  '0x1337': registeredNetworkConfiguration,
                },
              },
            },
            ({ controller, messenger }) => {
              const returnedNetworkConfiguration =
                getNetworkConfigurationByNetworkClientId({
                  controller,
                  messenger,
                  networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                });

              expect(returnedNetworkConfiguration).toBe(
                registeredNetworkConfiguration,
              );
            },
          );
        });
      });

      describe('given the ID of a network client that does not correspond to any RPC endpoint in a network configuration', () => {
        it('returns undefined', async () => {
          await withController(({ controller, messenger }) => {
            const returnedNetworkConfiguration =
              getNetworkConfigurationByNetworkClientId({
                controller,
                messenger,
                networkClientId: 'nonexistent',
              });

            expect(returnedNetworkConfiguration).toBeUndefined();
          });
        });
      });
    });
  }

  describe('addNetwork', () => {
    it('throws if the chainId field is a string, but not a 0x-prefixed hex number', async () => {
      await withController(({ controller }) => {
        expect(() =>
          controller.addNetwork(
            buildAddNetworkFields({
              // @ts-expect-error Intentionally passing bad input
              chainId: '12345',
            }),
          ),
        ).toThrow(
          new Error(
            `Could not add network: Invalid \`chainId\` '12345' (must start with "0x" and not exceed the maximum)`,
          ),
        );
      });
    });

    it('throws if the chainId field is greater than the maximum allowed chain ID', async () => {
      await withController(({ controller }) => {
        expect(() =>
          controller.addNetwork(
            buildAddNetworkFields({
              // False negative - this is a number.
              // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
              chainId: toHex(MAX_SAFE_CHAIN_ID + 1),
            }),
          ),
        ).toThrow(
          new Error(
            `Could not add network: Invalid \`chainId\` '0xfffffffffffed' (must start with "0x" and not exceed the maximum)`,
          ),
        );
      });
    });

    it('throws if defaultBlockExplorerUrlIndex does not refer to an entry in blockExplorerUrls', async () => {
      await withController(({ controller }) => {
        expect(() =>
          controller.addNetwork(
            buildAddNetworkFields({
              blockExplorerUrls: [],
              defaultBlockExplorerUrlIndex: 99999,
            }),
          ),
        ).toThrow(
          new Error(
            'Could not add network: `defaultBlockExplorerUrlIndex` must refer to an entry in `blockExplorerUrls`',
          ),
        );
      });
    });

    it('throws if blockExplorerUrls is non-empty, but defaultBlockExplorerUrlIndex is missing', async () => {
      await withController(({ controller }) => {
        expect(() =>
          controller.addNetwork(
            buildAddNetworkFields({
              blockExplorerUrls: ['https://block.explorer'],
            }),
          ),
        ).toThrow(
          new Error(
            'Could not add network: `defaultBlockExplorerUrlIndex` must refer to an entry in `blockExplorerUrls`',
          ),
        );
      });
    });

    it('throws if the rpcEndpoints field is an empty array', async () => {
      await withController(({ controller }) => {
        expect(() =>
          controller.addNetwork(
            buildAddNetworkFields({
              rpcEndpoints: [],
            }),
          ),
        ).toThrow(
          new Error(
            'Could not add network: `rpcEndpoints` must be a non-empty array',
          ),
        );
      });
    });

    it('throws if one of the rpcEndpoints has an invalid url property', async () => {
      await withController(({ controller }) => {
        expect(() =>
          controller.addNetwork(
            buildAddNetworkFields({
              rpcEndpoints: [
                buildAddNetworkCustomRpcEndpointFields({
                  url: 'clearly-not-a-url',
                }),
              ],
            }),
          ),
        ).toThrow(
          new Error(
            "Could not add network: An entry in `rpcEndpoints` has invalid URL 'clearly-not-a-url'",
          ),
        );
      });
    });

    it('throws if the URLs of two or more RPC endpoints have similar schemes (comparing case-insensitively)', async () => {
      await withController(({ controller }) => {
        expect(() =>
          controller.addNetwork(
            buildAddNetworkFields({
              rpcEndpoints: [
                buildAddNetworkCustomRpcEndpointFields({
                  url: 'https://foo.com/bar',
                }),
                buildAddNetworkCustomRpcEndpointFields({
                  url: 'HTTPS://foo.com/bar',
                }),
              ],
            }),
          ),
        ).toThrow(
          new Error(
            'Could not add network: Each entry in rpcEndpoints must have a unique URL',
          ),
        );
      });
    });

    it('throws if the URLs of two or more RPC endpoints have similar hostnames (comparing case-insensitively)', async () => {
      await withController(({ controller }) => {
        expect(() =>
          controller.addNetwork(
            buildAddNetworkFields({
              rpcEndpoints: [
                buildAddNetworkCustomRpcEndpointFields({
                  url: 'https://foo.com/bar',
                }),
                buildAddNetworkCustomRpcEndpointFields({
                  url: 'https://fOo.CoM/bar',
                }),
              ],
            }),
          ),
        ).toThrow(
          new Error(
            'Could not add network: Each entry in rpcEndpoints must have a unique URL',
          ),
        );
      });
    });

    it('does not throw if the URLs of two or more RPC endpoints have similar paths (comparing case-insensitively)', async () => {
      await withController(({ controller }) => {
        expect(() =>
          controller.addNetwork(
            buildAddNetworkFields({
              rpcEndpoints: [
                buildAddNetworkCustomRpcEndpointFields({
                  url: 'https://foo.com/bar',
                }),
                buildAddNetworkCustomRpcEndpointFields({
                  url: 'https://foo.com/BAR',
                }),
              ],
            }),
          ),
        ).not.toThrow();
      });
    });

    for (const infuraNetworkType of Object.values(InfuraNetworkType)) {
      const infuraNetworkNickname = NetworkNickname[infuraNetworkType];
      const infuraChainId = ChainId[infuraNetworkType];

      // False negative - this is a string.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      it(`throws if rpcEndpoints contains an Infura RPC endpoint which is already present in the network configuration for the Infura-supported chain ${infuraChainId}`, async () => {
        const infuraRpcEndpoint = buildInfuraRpcEndpoint(infuraNetworkType);

        await withController(
          {
            state:
              buildNetworkControllerStateWithDefaultSelectedNetworkClientId({
                networkConfigurationsByChainId: {
                  [infuraChainId]: buildInfuraNetworkConfiguration(
                    infuraNetworkType,
                    {
                      rpcEndpoints: [infuraRpcEndpoint],
                    },
                  ),
                },
              }),
          },
          ({ controller }) => {
            expect(() =>
              controller.addNetwork(
                buildAddNetworkFields({
                  chainId: '0x1337',
                  rpcEndpoints: [infuraRpcEndpoint],
                }),
              ),
            ).toThrow(
              // This is a string.
              // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
              `Could not add network that points to same RPC endpoint as existing network for chain ${infuraChainId} ('${infuraNetworkNickname}')`,
            );
          },
        );
      });
    }

    it('throws if rpcEndpoints contains a custom RPC endpoint which is already present in another network configuration (comparing URLs case-insensitively)', async () => {
      await withController(
        {
          state: buildNetworkControllerStateWithDefaultSelectedNetworkClientId({
            networkConfigurationsByChainId: {
              '0x2448': buildNetworkConfiguration({
                chainId: '0x2448',
                rpcEndpoints: [
                  buildCustomRpcEndpoint({
                    url: 'http://test.endpoint/bar',
                  }),
                ],
              }),
            },
          }),
        },
        ({ controller }) => {
          expect(() =>
            controller.addNetwork(
              buildAddNetworkFields({
                chainId: '0x1337',
                rpcEndpoints: [
                  buildAddNetworkCustomRpcEndpointFields({
                    url: 'http://test.endpoint/foo',
                  }),
                  buildAddNetworkCustomRpcEndpointFields({
                    url: 'HTTP://TEST.ENDPOINT/bar',
                  }),
                ],
              }),
            ),
          ).toThrow(
            "Could not add network that points to same RPC endpoint as existing network for chain 0x2448 ('Some Network')",
          );
        },
      );
    });

    it('throws if two or more RPC endpoints are exactly the same object', async () => {
      await withController(({ controller }) => {
        const rpcEndpoint = buildAddNetworkCustomRpcEndpointFields();
        expect(() =>
          controller.addNetwork(
            buildAddNetworkFields({
              chainId: '0x1337',
              rpcEndpoints: [rpcEndpoint, rpcEndpoint],
            }),
          ),
        ).toThrow(
          'Could not add network: Each entry in rpcEndpoints must be unique',
        );
      });
    });

    it('throws if there are two or more different Infura RPC endpoints', async () => {
      await withController(
        {
          state: buildNetworkControllerStateWithDefaultSelectedNetworkClientId({
            networkConfigurationsByChainId: {
              '0x1337': buildCustomNetworkConfiguration({
                chainId: '0x1337',
              }),
            },
          }),
        },
        ({ controller }) => {
          const mainnetRpcEndpoint = buildInfuraRpcEndpoint(
            InfuraNetworkType.mainnet,
          );
          const goerliRpcEndpoint = buildInfuraRpcEndpoint(
            InfuraNetworkType.goerli,
          );
          expect(() =>
            controller.addNetwork(
              buildAddNetworkFields({
                chainId: ChainId.mainnet,
                rpcEndpoints: [mainnetRpcEndpoint, goerliRpcEndpoint],
              }),
            ),
          ).toThrow(
            'Could not add network: There cannot be more than one Infura RPC endpoint',
          );
        },
      );
    });

    it('throws if defaultRpcEndpointIndex does not refer to an entry in rpcEndpoints', async () => {
      await withController(({ controller }) => {
        expect(() =>
          controller.addNetwork(
            buildAddNetworkFields({
              defaultRpcEndpointIndex: 99999,
              rpcEndpoints: [
                buildUpdateNetworkCustomRpcEndpointFields({
                  url: 'https://foo.com',
                }),
                buildCustomRpcEndpoint({
                  url: 'https://bar.com',
                }),
              ],
            }),
          ),
        ).toThrow(
          new Error(
            'Could not add network: `defaultRpcEndpointIndex` must refer to an entry in `rpcEndpoints`',
          ),
        );
      });
    });

    for (const infuraNetworkType of Object.values(InfuraNetworkType)) {
      const infuraNetworkNickname = NetworkNickname[infuraNetworkType];
      const infuraChainId = ChainId[infuraNetworkType];

      // This is a string.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      it(`throws if a network configuration for the Infura network "${infuraNetworkNickname}" is already registered under the given chain ID`, async () => {
        await withController(
          {
            state:
              buildNetworkControllerStateWithDefaultSelectedNetworkClientId({
                networkConfigurationsByChainId: {
                  [infuraChainId]:
                    buildInfuraNetworkConfiguration(infuraNetworkType),
                },
              }),
          },
          ({ controller }) => {
            expect(() =>
              controller.addNetwork(
                buildAddNetworkFields({
                  chainId: infuraChainId,
                }),
              ),
            ).toThrow(
              // This is a string.
              // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
              `Could not add network for chain ${infuraChainId} as another network for that chain already exists ('${infuraNetworkNickname}')`,
            );
          },
        );
      });
    }

    it('throws if a custom network is already registered under the given chain ID', async () => {
      await withController(
        {
          state: buildNetworkControllerStateWithDefaultSelectedNetworkClientId({
            networkConfigurationsByChainId: {
              '0x1337': buildCustomNetworkConfiguration({
                chainId: '0x1337',
                name: 'Some Network',
              }),
            },
          }),
        },
        ({ controller }) => {
          expect(() =>
            controller.addNetwork(
              buildAddNetworkFields({
                chainId: '0x1337',
              }),
            ),
          ).toThrow(
            `Could not add network for chain 0x1337 as another network for that chain already exists ('Some Network')`,
          );
        },
      );
    });

    for (const infuraNetworkType of Object.values(InfuraNetworkType)) {
      const infuraChainId = ChainId[infuraNetworkType];
      const infuraNetworkNickname = NetworkNickname[infuraNetworkType];
      const infuraNativeTokenName = NetworksTicker[infuraNetworkType];

      // This is a string.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      describe(`given the ID of the Infura-supported chain ${infuraChainId}`, () => {
        it('creates a new network client for not only each custom RPC endpoint, but also the Infura RPC endpoint', async () => {
          uuidV4Mock
            .mockReturnValueOnce('BBBB-BBBB-BBBB-BBBB')
            .mockReturnValueOnce('CCCC-CCCC-CCCC-CCCC');
          const createAutoManagedNetworkClientSpy = jest.spyOn(
            createAutoManagedNetworkClientModule,
            'createAutoManagedNetworkClient',
          );
          const infuraProjectId = 'some-infura-project-id';

          await withController(
            {
              state:
                buildNetworkControllerStateWithDefaultSelectedNetworkClientId({
                  networkConfigurationsByChainId: {
                    '0x1337': buildCustomNetworkConfiguration({
                      chainId: '0x1337',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                          url: 'https://test.endpoint/1',
                        }),
                      ],
                    }),
                  },
                }),
              infuraProjectId,
            },
            ({ controller }) => {
              const defaultRpcEndpoint =
                buildInfuraRpcEndpoint(infuraNetworkType);

              controller.addNetwork({
                blockExplorerUrls: [],
                chainId: infuraChainId,
                defaultRpcEndpointIndex: 1,
                name: infuraNetworkType,
                nativeCurrency: infuraNativeTokenName,
                rpcEndpoints: [
                  defaultRpcEndpoint,
                  {
                    name: 'Test Network 1',
                    type: RpcEndpointType.Custom,
                    url: 'https://test.endpoint/2',
                  },
                  {
                    name: 'Test Network 2',
                    type: RpcEndpointType.Custom,
                    url: 'https://test.endpoint/3',
                  },
                ],
              });

              // Skipping the 1st call because it's for the initial state
              expect(createAutoManagedNetworkClientSpy).toHaveBeenNthCalledWith(
                2,
                {
                  infuraProjectId,
                  chainId: infuraChainId,
                  network: infuraNetworkType,
                  ticker: infuraNativeTokenName,
                  type: NetworkClientType.Infura,
                },
              );
              expect(createAutoManagedNetworkClientSpy).toHaveBeenNthCalledWith(
                3,
                {
                  chainId: infuraChainId,
                  rpcUrl: 'https://test.endpoint/2',
                  ticker: infuraNativeTokenName,
                  type: NetworkClientType.Custom,
                },
              );
              expect(createAutoManagedNetworkClientSpy).toHaveBeenNthCalledWith(
                4,
                {
                  chainId: infuraChainId,
                  rpcUrl: 'https://test.endpoint/3',
                  ticker: infuraNativeTokenName,
                  type: NetworkClientType.Custom,
                },
              );
              expect(
                getNetworkConfigurationsByNetworkClientId(
                  controller.getNetworkClientRegistry(),
                ),
              ).toMatchObject({
                [infuraNetworkType]: {
                  chainId: infuraChainId,
                  network: infuraNetworkType,
                  type: NetworkClientType.Infura,
                },
                'BBBB-BBBB-BBBB-BBBB': {
                  chainId: infuraChainId,
                  rpcUrl: 'https://test.endpoint/2',
                  ticker: infuraNativeTokenName,
                  type: NetworkClientType.Custom,
                },
                'CCCC-CCCC-CCCC-CCCC': {
                  chainId: infuraChainId,
                  rpcUrl: 'https://test.endpoint/3',
                  ticker: infuraNativeTokenName,
                  type: NetworkClientType.Custom,
                },
              });
            },
          );
        });

        it('adds the network configuration to state under the chain ID', async () => {
          uuidV4Mock.mockReturnValueOnce('BBBB-BBBB-BBBB-BBBB');

          await withController(
            {
              state:
                buildNetworkControllerStateWithDefaultSelectedNetworkClientId({
                  networkConfigurationsByChainId: {
                    '0x1337': buildCustomNetworkConfiguration({
                      chainId: '0x1337',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                          url: 'https://test.endpoint/1',
                        }),
                      ],
                    }),
                  },
                }),
            },
            ({ controller }) => {
              controller.addNetwork({
                blockExplorerUrls: ['https://block.explorer'],
                chainId: infuraChainId,
                defaultBlockExplorerUrlIndex: 0,
                defaultRpcEndpointIndex: 0,
                name: 'Some Network',
                nativeCurrency: 'TOKEN',
                rpcEndpoints: [
                  {
                    name: 'Test Network',
                    type: RpcEndpointType.Custom,
                    url: 'https://test.endpoint/2',
                  },
                  {
                    name: infuraNetworkNickname,
                    networkClientId: infuraNetworkType,
                    type: RpcEndpointType.Infura as const,
                    // False negative - this is a string.
                    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                    url: `https://${infuraNetworkType}.infura.io/v3/{infuraProjectId}`,
                  },
                ],
              });

              expect(
                controller.state.networkConfigurationsByChainId,
              ).toHaveProperty(infuraChainId);
              expect(
                controller.state.networkConfigurationsByChainId[infuraChainId],
              ).toStrictEqual({
                blockExplorerUrls: ['https://block.explorer'],
                chainId: infuraChainId,
                defaultBlockExplorerUrlIndex: 0,
                defaultRpcEndpointIndex: 0,
                name: 'Some Network',
                nativeCurrency: 'TOKEN',
                rpcEndpoints: [
                  {
                    name: 'Test Network',
                    networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                    type: RpcEndpointType.Custom,
                    url: 'https://test.endpoint/2',
                  },
                  {
                    name: infuraNetworkNickname,
                    networkClientId: infuraNetworkType,
                    type: RpcEndpointType.Infura as const,
                    // False negative - this is a string.
                    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                    url: `https://${infuraNetworkType}.infura.io/v3/{infuraProjectId}`,
                  },
                ],
              });
            },
          );
        });

        it('emits the NetworkController:networkAdded event', async () => {
          await withController(
            {
              state:
                buildNetworkControllerStateWithDefaultSelectedNetworkClientId({
                  networkConfigurationsByChainId: {
                    '0x1337': buildCustomNetworkConfiguration({
                      chainId: '0x1337',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                          url: 'https://test.endpoint/1',
                        }),
                      ],
                    }),
                  },
                }),
            },
            ({ controller, messenger }) => {
              const networkAddedEventListener = jest.fn();
              messenger.subscribe(
                'NetworkController:networkAdded',
                networkAddedEventListener,
              );

              controller.addNetwork({
                blockExplorerUrls: ['https://block.explorer'],
                chainId: infuraChainId,
                defaultBlockExplorerUrlIndex: 0,
                defaultRpcEndpointIndex: 0,
                name: 'Some Network',
                nativeCurrency: 'TOKEN',
                rpcEndpoints: [
                  {
                    name: infuraNetworkNickname,
                    networkClientId: infuraNetworkType,
                    type: RpcEndpointType.Infura as const,
                    // False negative - this is a string.
                    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                    url: `https://${infuraNetworkType}.infura.io/v3/{infuraProjectId}`,
                  },
                ],
              });

              expect(networkAddedEventListener).toHaveBeenCalledWith({
                blockExplorerUrls: ['https://block.explorer'],
                chainId: infuraChainId,
                defaultBlockExplorerUrlIndex: 0,
                defaultRpcEndpointIndex: 0,
                name: 'Some Network',
                nativeCurrency: 'TOKEN',
                rpcEndpoints: [
                  {
                    name: infuraNetworkNickname,
                    networkClientId: infuraNetworkType,
                    type: RpcEndpointType.Infura as const,
                    // False negative - this is a string.
                    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                    url: `https://${infuraNetworkType}.infura.io/v3/{infuraProjectId}`,
                  },
                ],
              });
            },
          );
        });

        it('returns the newly added network configuration', async () => {
          await withController(
            {
              state:
                buildNetworkControllerStateWithDefaultSelectedNetworkClientId({
                  networkConfigurationsByChainId: {
                    '0x1337': buildCustomNetworkConfiguration({
                      chainId: '0x1337',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                          url: 'https://test.endpoint/1',
                        }),
                      ],
                    }),
                  },
                }),
            },
            ({ controller }) => {
              const newNetworkConfiguration = controller.addNetwork({
                blockExplorerUrls: ['https://block.explorer'],
                chainId: infuraChainId,
                defaultBlockExplorerUrlIndex: 0,
                defaultRpcEndpointIndex: 0,
                name: 'Some Network',
                nativeCurrency: 'TOKEN',
                rpcEndpoints: [
                  {
                    name: infuraNetworkNickname,
                    networkClientId: infuraNetworkType,
                    type: RpcEndpointType.Infura as const,
                    // False negative - this is a string.
                    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                    url: `https://${infuraNetworkType}.infura.io/v3/{infuraProjectId}`,
                  },
                ],
              });

              expect(newNetworkConfiguration).toStrictEqual({
                blockExplorerUrls: ['https://block.explorer'],
                chainId: infuraChainId,
                defaultBlockExplorerUrlIndex: 0,
                defaultRpcEndpointIndex: 0,
                name: 'Some Network',
                nativeCurrency: 'TOKEN',
                rpcEndpoints: [
                  {
                    name: infuraNetworkNickname,
                    networkClientId: infuraNetworkType,
                    type: RpcEndpointType.Infura as const,
                    // False negative - this is a string.
                    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                    url: `https://${infuraNetworkType}.infura.io/v3/{infuraProjectId}`,
                  },
                ],
              });
            },
          );
        });
      });
    }

    describe('given the ID of a non-Infura-supported chain', () => {
      it('throws (albeit for a different reason) if rpcEndpoints contains an Infura RPC endpoint that represents a different chain that the one being added', async () => {
        uuidV4Mock
          .mockReturnValueOnce('AAAA-AAAA-AAAA-AAAA')
          .mockReturnValueOnce('BBBB-BBBB-BBBB-BBBB');
        const defaultRpcEndpoint = buildInfuraRpcEndpoint(
          InfuraNetworkType.mainnet,
        );

        await withController(
          {
            state: {
              selectedNetworkClientId: InfuraNetworkType.goerli,
              networkConfigurationsByChainId: {
                [ChainId.goerli]: buildInfuraNetworkConfiguration(
                  InfuraNetworkType.goerli,
                ),
              },
            },
          },
          ({ controller }) => {
            expect(() =>
              controller.addNetwork({
                blockExplorerUrls: [],
                chainId: '0x1337',
                defaultRpcEndpointIndex: 0,
                name: 'Some Network',
                nativeCurrency: 'TOKEN',
                rpcEndpoints: [
                  defaultRpcEndpoint,
                  {
                    name: 'Test Network 2',
                    type: RpcEndpointType.Custom,
                    url: 'https://test.endpoint/2',
                  },
                ],
              }),
            ).toThrow(
              new Error(
                "Could not add network with chain ID 0x1337 and Infura RPC endpoint for 'Mainnet' which represents 0x1, as the two conflict",
              ),
            );
          },
        );
      });

      it('creates a new network client for each given RPC endpoint', async () => {
        uuidV4Mock
          .mockReturnValueOnce('AAAA-AAAA-AAAA-AAAA')
          .mockReturnValueOnce('BBBB-BBBB-BBBB-BBBB');

        await withController(({ controller }) => {
          controller.addNetwork({
            blockExplorerUrls: [],
            chainId: '0x1337',
            defaultRpcEndpointIndex: 0,
            name: 'Some Network',
            nativeCurrency: 'TOKEN',
            rpcEndpoints: [
              {
                name: 'Test Network 1',
                type: RpcEndpointType.Custom,
                url: 'https://test.endpoint/1',
              },
              {
                name: 'Test Network 2',
                type: RpcEndpointType.Custom,
                url: 'https://test.endpoint/2',
              },
            ],
          });

          const networkClient1 = controller.getNetworkClientById(
            'AAAA-AAAA-AAAA-AAAA',
          );
          expect(networkClient1.configuration).toStrictEqual({
            chainId: '0x1337',
            rpcUrl: 'https://test.endpoint/1',
            ticker: 'TOKEN',
            type: NetworkClientType.Custom,
          });
          const networkClient2 = controller.getNetworkClientById(
            'BBBB-BBBB-BBBB-BBBB',
          );
          expect(networkClient2.configuration).toStrictEqual({
            chainId: '0x1337',
            rpcUrl: 'https://test.endpoint/2',
            ticker: 'TOKEN',
            type: NetworkClientType.Custom,
          });
        });
      });

      it('adds the network configuration to state under the chain ID', async () => {
        uuidV4Mock
          .mockReturnValueOnce('AAAA-AAAA-AAAA-AAAA')
          .mockReturnValueOnce('BBBB-BBBB-BBBB-BBBB');

        await withController(({ controller }) => {
          controller.addNetwork({
            blockExplorerUrls: ['https://block.explorer'],
            chainId: '0x1337',
            defaultBlockExplorerUrlIndex: 0,
            defaultRpcEndpointIndex: 0,
            name: 'Some Network',
            nativeCurrency: 'TOKEN',
            rpcEndpoints: [
              {
                name: 'Test Network 1',
                type: RpcEndpointType.Custom,
                url: 'https://test.endpoint/1',
              },
              {
                name: 'Test Network 2',
                type: RpcEndpointType.Custom,
                url: 'https://test.endpoint/2',
              },
            ],
          });

          expect(
            controller.state.networkConfigurationsByChainId['0x1337'],
          ).toStrictEqual({
            blockExplorerUrls: ['https://block.explorer'],
            chainId: '0x1337',
            defaultBlockExplorerUrlIndex: 0,
            defaultRpcEndpointIndex: 0,
            name: 'Some Network',
            nativeCurrency: 'TOKEN',
            rpcEndpoints: [
              {
                name: 'Test Network 1',
                networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                type: RpcEndpointType.Custom,
                url: 'https://test.endpoint/1',
              },
              {
                name: 'Test Network 2',
                networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                type: RpcEndpointType.Custom,
                url: 'https://test.endpoint/2',
              },
            ],
          });
        });
      });

      it('emits the NetworkController:networkAdded event', async () => {
        uuidV4Mock.mockReturnValueOnce('AAAA-AAAA-AAAA-AAAA');

        await withController(({ controller, messenger }) => {
          const networkAddedEventListener = jest.fn();
          messenger.subscribe(
            'NetworkController:networkAdded',
            networkAddedEventListener,
          );

          controller.addNetwork({
            blockExplorerUrls: ['https://block.explorer'],
            chainId: '0x1337',
            defaultBlockExplorerUrlIndex: 0,
            defaultRpcEndpointIndex: 0,
            name: 'Some Network',
            nativeCurrency: 'TOKEN',
            rpcEndpoints: [
              {
                name: 'Test Network',
                type: RpcEndpointType.Custom,
                url: 'https://test.endpoint',
              },
            ],
          });

          expect(networkAddedEventListener).toHaveBeenCalledWith({
            blockExplorerUrls: ['https://block.explorer'],
            chainId: '0x1337',
            defaultBlockExplorerUrlIndex: 0,
            defaultRpcEndpointIndex: 0,
            name: 'Some Network',
            nativeCurrency: 'TOKEN',
            rpcEndpoints: [
              {
                name: 'Test Network',
                networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                type: RpcEndpointType.Custom,
                url: 'https://test.endpoint',
              },
            ],
          });
        });
      });

      it('returns the newly added network configuration', async () => {
        uuidV4Mock.mockReturnValueOnce('AAAA-AAAA-AAAA-AAAA');

        await withController(({ controller, messenger }) => {
          const networkAddedEventListener = jest.fn();
          messenger.subscribe(
            'NetworkController:networkAdded',
            networkAddedEventListener,
          );

          const newNetworkConfiguration = controller.addNetwork({
            blockExplorerUrls: ['https://block.explorer'],
            chainId: '0x1337',
            defaultBlockExplorerUrlIndex: 0,
            defaultRpcEndpointIndex: 0,
            name: 'Some Network',
            nativeCurrency: 'TOKEN',
            rpcEndpoints: [
              {
                name: 'Test Network',
                type: RpcEndpointType.Custom,
                url: 'https://test.endpoint',
              },
            ],
          });

          expect(newNetworkConfiguration).toStrictEqual({
            blockExplorerUrls: ['https://block.explorer'],
            chainId: '0x1337',
            defaultBlockExplorerUrlIndex: 0,
            defaultRpcEndpointIndex: 0,
            name: 'Some Network',
            nativeCurrency: 'TOKEN',
            rpcEndpoints: [
              {
                name: 'Test Network',
                networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                type: RpcEndpointType.Custom,
                url: 'https://test.endpoint',
              },
            ],
          });
        });
      });
    });
  });

  describe('updateNetwork', () => {
    it('throws if the given chain ID does not refer to an existing network configuration', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.updateNetwork(
            '0x1337',
            buildCustomNetworkConfiguration({
              chainId: '0x1337',
            }),
          ),
        ).rejects.toThrow(
          new Error(
            "Could not update network: Cannot find network configuration for chain '0x1337'",
          ),
        );
      });
    });

    it('throws if defaultBlockExplorerUrlIndex does not refer to an entry in blockExplorerUrls', async () => {
      const networkConfigurationToUpdate = buildCustomNetworkConfiguration({
        chainId: '0x1337',
      });

      await withController(
        {
          state: buildNetworkControllerStateWithDefaultSelectedNetworkClientId({
            networkConfigurationsByChainId: {
              '0x1337': networkConfigurationToUpdate,
            },
          }),
        },
        async ({ controller }) => {
          await expect(() =>
            controller.updateNetwork(
              '0x1337',
              buildCustomNetworkConfiguration({
                blockExplorerUrls: [],
                defaultBlockExplorerUrlIndex: 99999,
              }),
            ),
          ).rejects.toThrow(
            new Error(
              'Could not update network: `defaultBlockExplorerUrlIndex` must refer to an entry in `blockExplorerUrls`',
            ),
          );
        },
      );
    });

    it('throws if blockExplorerUrls is non-empty, but defaultBlockExplorerUrlIndex is cleared', async () => {
      const networkConfigurationToUpdate = buildCustomNetworkConfiguration({
        blockExplorerUrls: ['https://block.explorer'],
        chainId: '0x1337',
        defaultBlockExplorerUrlIndex: 0,
      });

      await withController(
        {
          state: buildNetworkControllerStateWithDefaultSelectedNetworkClientId({
            networkConfigurationsByChainId: {
              '0x1337': networkConfigurationToUpdate,
            },
          }),
        },
        async ({ controller }) => {
          await expect(() =>
            controller.updateNetwork(
              '0x1337',
              buildCustomNetworkConfiguration({
                ...networkConfigurationToUpdate,
                defaultBlockExplorerUrlIndex: undefined,
              }),
            ),
          ).rejects.toThrow(
            new Error(
              'Could not update network: `defaultBlockExplorerUrlIndex` must refer to an entry in `blockExplorerUrls`',
            ),
          );
        },
      );
    });

    it('throws if the new chainId field is a string, but not a 0x-prefixed hex number', async () => {
      const networkConfigurationToUpdate = buildCustomNetworkConfiguration({
        chainId: '0x1337',
      });

      await withController(
        {
          state: buildNetworkControllerStateWithDefaultSelectedNetworkClientId({
            networkConfigurationsByChainId: {
              '0x1337': networkConfigurationToUpdate,
            },
          }),
        },
        async ({ controller }) => {
          await expect(
            controller.updateNetwork(
              '0x1337',
              buildCustomNetworkConfiguration({
                // @ts-expect-error Intentionally passing bad input
                chainId: '12345',
              }),
            ),
          ).rejects.toThrow(
            new Error(
              `Could not update network: Invalid \`chainId\` '12345' (must start with "0x" and not exceed the maximum)`,
            ),
          );
        },
      );
    });

    it('throws if the new chainId field is greater than the maximum allowed chain ID', async () => {
      const networkConfigurationToUpdate = buildCustomNetworkConfiguration({
        chainId: '0x1337',
      });

      await withController(
        {
          state: buildNetworkControllerStateWithDefaultSelectedNetworkClientId({
            networkConfigurationsByChainId: {
              '0x1337': networkConfigurationToUpdate,
            },
          }),
        },
        async ({ controller }) => {
          await expect(
            controller.updateNetwork(
              '0x1337',
              buildCustomNetworkConfiguration({
                // False negative - this is a number.
                // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                chainId: toHex(MAX_SAFE_CHAIN_ID + 1),
              }),
            ),
          ).rejects.toThrow(
            new Error(
              `Could not update network: Invalid \`chainId\` '0xfffffffffffed' (must start with "0x" and not exceed the maximum)`,
            ),
          );
        },
      );
    });

    it('throws if the new rpcEndpoints field is an empty array', async () => {
      const networkConfigurationToUpdate = buildCustomNetworkConfiguration({
        chainId: '0x1337',
      });

      await withController(
        {
          state: buildNetworkControllerStateWithDefaultSelectedNetworkClientId({
            networkConfigurationsByChainId: {
              '0x1337': networkConfigurationToUpdate,
            },
          }),
        },
        async ({ controller }) => {
          await expect(
            controller.updateNetwork(
              '0x1337',
              buildNetworkConfiguration({
                rpcEndpoints: [],
              }),
            ),
          ).rejects.toThrow(
            new Error(
              'Could not update network: `rpcEndpoints` must be a non-empty array',
            ),
          );
        },
      );
    });

    it('throws if one of the new rpcEndpoints is custom and uses an Infura network name for networkClientId', async () => {
      const networkConfigurationToUpdate = buildCustomNetworkConfiguration({
        chainId: '0x1337',
      });

      await withController(
        {
          state: buildNetworkControllerStateWithDefaultSelectedNetworkClientId({
            networkConfigurationsByChainId: {
              '0x1337': networkConfigurationToUpdate,
            },
          }),
        },
        async ({ controller }) => {
          await expect(
            controller.updateNetwork('0x1337', {
              ...networkConfigurationToUpdate,
              rpcEndpoints: [
                buildUpdateNetworkCustomRpcEndpointFields({
                  networkClientId: InfuraNetworkType.mainnet,
                  url: 'https://test.network',
                }),
              ],
            }),
          ).rejects.toThrow(
            new Error(
              "Could not update network: Custom RPC endpoint 'https://test.network' has invalid network client ID 'mainnet'",
            ),
          );
        },
      );
    });

    it('throws if one of the new rpcEndpoints has an invalid url property', async () => {
      const networkConfigurationToUpdate = buildCustomNetworkConfiguration({
        chainId: '0x1337',
      });

      await withController(
        {
          state: buildNetworkControllerStateWithDefaultSelectedNetworkClientId({
            networkConfigurationsByChainId: {
              '0x1337': networkConfigurationToUpdate,
            },
          }),
        },
        async ({ controller }) => {
          await expect(
            controller.updateNetwork('0x1337', {
              ...networkConfigurationToUpdate,
              rpcEndpoints: [
                buildUpdateNetworkCustomRpcEndpointFields({
                  url: 'clearly-not-a-url',
                }),
              ],
            }),
          ).rejects.toThrow(
            new Error(
              "Could not update network: An entry in `rpcEndpoints` has invalid URL 'clearly-not-a-url'",
            ),
          );
        },
      );
    });

    it('throws if one of the new RPC endpoints has a networkClientId that does not refer to a registered network client', async () => {
      const networkConfigurationToUpdate = buildCustomNetworkConfiguration({
        chainId: '0x1337',
      });

      await withController(
        {
          state: buildNetworkControllerStateWithDefaultSelectedNetworkClientId({
            networkConfigurationsByChainId: {
              '0x1337': networkConfigurationToUpdate,
            },
          }),
        },
        async ({ controller }) => {
          await expect(
            controller.updateNetwork('0x1337', {
              ...networkConfigurationToUpdate,
              rpcEndpoints: [
                buildUpdateNetworkCustomRpcEndpointFields({
                  url: 'https://foo.com',
                  networkClientId: 'not-a-real-network-client-id',
                }),
              ],
            }),
          ).rejects.toThrow(
            new Error(
              "Could not update network: RPC endpoint 'https://foo.com' refers to network client 'not-a-real-network-client-id' that does not exist",
            ),
          );
        },
      );
    });

    it('throws if the URLs of two or more RPC endpoints have similar schemes (comparing case-insensitively)', async () => {
      const networkConfigurationToUpdate = buildNetworkConfiguration();

      await withController(
        {
          state: buildNetworkControllerStateWithDefaultSelectedNetworkClientId({
            networkConfigurationsByChainId: {
              '0x1337': networkConfigurationToUpdate,
            },
          }),
        },
        async ({ controller }) => {
          await expect(
            controller.updateNetwork('0x1337', {
              ...networkConfigurationToUpdate,
              rpcEndpoints: [
                buildUpdateNetworkCustomRpcEndpointFields({
                  url: 'https://foo.com/bar',
                }),
                buildUpdateNetworkCustomRpcEndpointFields({
                  url: 'HTTPS://foo.com/bar',
                }),
              ],
            }),
          ).rejects.toThrow(
            new Error(
              'Could not update network: Each entry in rpcEndpoints must have a unique URL',
            ),
          );
        },
      );
    });

    it('throws if the URLs of two or more RPC endpoints have similar hostnames (comparing case-insensitively)', async () => {
      const networkConfigurationToUpdate = buildNetworkConfiguration();

      await withController(
        {
          state: buildNetworkControllerStateWithDefaultSelectedNetworkClientId({
            networkConfigurationsByChainId: {
              '0x1337': networkConfigurationToUpdate,
            },
          }),
        },
        async ({ controller }) => {
          await expect(
            controller.updateNetwork('0x1337', {
              ...networkConfigurationToUpdate,
              rpcEndpoints: [
                buildUpdateNetworkCustomRpcEndpointFields({
                  url: 'https://foo.com/bar',
                }),
                buildUpdateNetworkCustomRpcEndpointFields({
                  url: 'https://fOo.CoM/bar',
                }),
              ],
            }),
          ).rejects.toThrow(
            new Error(
              'Could not update network: Each entry in rpcEndpoints must have a unique URL',
            ),
          );
        },
      );
    });

    it('does not throw if the URLs of two or more RPC endpoints have similar paths (comparing case-insensitively)', async () => {
      const networkConfigurationToUpdate = buildNetworkConfiguration({
        chainId: '0x1337',
        rpcEndpoints: [
          buildCustomRpcEndpoint({
            url: 'https://foo.com/bar',
          }),
        ],
      });

      await withController(
        {
          state: buildNetworkControllerStateWithDefaultSelectedNetworkClientId({
            networkConfigurationsByChainId: {
              '0x1337': networkConfigurationToUpdate,
            },
          }),
        },
        async ({ controller }) => {
          const result = await controller.updateNetwork('0x1337', {
            ...networkConfigurationToUpdate,
            defaultRpcEndpointIndex: 0,
            rpcEndpoints: [
              networkConfigurationToUpdate.rpcEndpoints[0],
              buildUpdateNetworkCustomRpcEndpointFields({
                url: 'https://foo.com/BAR',
              }),
            ],
          });

          expect(result).toBeDefined();
        },
      );
    });

    for (const infuraNetworkType of Object.values(InfuraNetworkType)) {
      const infuraNetworkNickname = NetworkNickname[infuraNetworkType];
      const infuraChainId = ChainId[infuraNetworkType];

      // False negative - this is a string.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      it(`throws if an Infura RPC endpoint is being added which is already present in the network configuration for the Infura-supported chain ${infuraChainId}`, async () => {
        const networkConfigurationToUpdate = buildCustomNetworkConfiguration({
          chainId: '0x1337',
        });
        const infuraRpcEndpoint = buildInfuraRpcEndpoint(infuraNetworkType);

        await withController(
          {
            state:
              buildNetworkControllerStateWithDefaultSelectedNetworkClientId({
                networkConfigurationsByChainId: {
                  '0x1337': networkConfigurationToUpdate,
                  [infuraChainId]: buildInfuraNetworkConfiguration(
                    infuraNetworkType,
                    {
                      rpcEndpoints: [infuraRpcEndpoint],
                    },
                  ),
                },
              }),
          },
          async ({ controller }) => {
            await expect(
              controller.updateNetwork('0x1337', {
                ...networkConfigurationToUpdate,
                rpcEndpoints: [infuraRpcEndpoint],
              }),
            ).rejects.toThrow(
              // This is a string.
              // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
              `Could not update network to point to same RPC endpoint as existing network for chain ${infuraChainId} ('${infuraNetworkNickname}')`,
            );
          },
        );
      });
    }

    it('throws if a custom RPC endpoint is being added which is already present in another network configuration (comparing URLs case-insensitively)', async () => {
      const networkConfigurationToUpdate = buildNetworkConfiguration({
        chainId: '0x1337',
        rpcEndpoints: [
          buildCustomRpcEndpoint({
            url: 'http://test.endpoint/foo',
          }),
        ],
      });

      await withController(
        {
          state: buildNetworkControllerStateWithDefaultSelectedNetworkClientId({
            networkConfigurationsByChainId: {
              '0x1337': networkConfigurationToUpdate,
              '0x2448': buildNetworkConfiguration({
                chainId: '0x2448',
                rpcEndpoints: [
                  buildCustomRpcEndpoint({
                    url: 'http://test.endpoint/bar',
                  }),
                ],
              }),
            },
          }),
        },
        async ({ controller }) => {
          await expect(
            controller.updateNetwork('0x1337', {
              ...networkConfigurationToUpdate,
              rpcEndpoints: [
                buildUpdateNetworkCustomRpcEndpointFields({
                  url: 'http://test.endpoint/foo',
                }),
                buildUpdateNetworkCustomRpcEndpointFields({
                  url: 'HTTP://TEST.ENDPOINT/bar',
                }),
              ],
            }),
          ).rejects.toThrow(
            new Error(
              "Could not update network to point to same RPC endpoint as existing network for chain 0x2448 ('Some Network')",
            ),
          );
        },
      );
    });

    it('throws if two or more RPC endpoints are exactly the same object', async () => {
      const networkConfigurationToUpdate = buildNetworkConfiguration();

      await withController(
        {
          state: buildNetworkControllerStateWithDefaultSelectedNetworkClientId({
            networkConfigurationsByChainId: {
              '0x1337': networkConfigurationToUpdate,
            },
          }),
        },
        async ({ controller }) => {
          const rpcEndpoint = buildUpdateNetworkCustomRpcEndpointFields();
          await expect(
            controller.updateNetwork('0x1337', {
              ...networkConfigurationToUpdate,
              defaultRpcEndpointIndex: 0,
              rpcEndpoints: [rpcEndpoint, rpcEndpoint],
            }),
          ).rejects.toThrow(
            new Error(
              'Could not update network: Each entry in rpcEndpoints must be unique',
            ),
          );
        },
      );
    });

    it('throws if two or more RPC endpoints have the same networkClientId', async () => {
      const rpcEndpoint = buildCustomRpcEndpoint({
        url: 'https://test.endpoint',
        networkClientId: 'AAAA-AAAA-AAAA-AAAA',
      });
      const networkConfigurationToUpdate = buildNetworkConfiguration({
        rpcEndpoints: [rpcEndpoint],
      });

      await withController(
        {
          state: buildNetworkControllerStateWithDefaultSelectedNetworkClientId({
            networkConfigurationsByChainId: {
              '0x1337': networkConfigurationToUpdate,
            },
          }),
        },
        async ({ controller }) => {
          await expect(
            controller.updateNetwork('0x1337', {
              ...networkConfigurationToUpdate,
              rpcEndpoints: [
                rpcEndpoint,
                buildUpdateNetworkCustomRpcEndpointFields({
                  url: 'https://test.endpoint/2',
                  networkClientId: rpcEndpoint.networkClientId,
                }),
              ],
            }),
          ).rejects.toThrow(
            new Error(
              'Could not update network: Each entry in rpcEndpoints must have a unique networkClientId',
            ),
          );
        },
      );
    });

    it('throws (albeit for a different reason) if there are two or more different Infura RPC endpoints', async () => {
      const [mainnetRpcEndpoint, goerliRpcEndpoint] = [
        buildInfuraRpcEndpoint(InfuraNetworkType.mainnet),
        buildInfuraRpcEndpoint(InfuraNetworkType.goerli),
      ];
      const networkConfigurationToUpdate = buildNetworkConfiguration({
        name: 'Mainnet',
        chainId: ChainId.mainnet,
        rpcEndpoints: [mainnetRpcEndpoint],
      });

      await withController(
        {
          state: buildNetworkControllerStateWithDefaultSelectedNetworkClientId({
            networkConfigurationsByChainId: {
              [ChainId.mainnet]: networkConfigurationToUpdate,
              [ChainId.goerli]: buildNetworkConfiguration({
                name: 'Goerli',
                chainId: ChainId.goerli,
                rpcEndpoints: [goerliRpcEndpoint],
              }),
            },
          }),
        },
        async ({ controller }) => {
          await expect(
            controller.updateNetwork(ChainId.mainnet, {
              ...networkConfigurationToUpdate,
              rpcEndpoints: [mainnetRpcEndpoint, goerliRpcEndpoint],
            }),
          ).rejects.toThrow(
            new Error(
              "Could not update network to point to same RPC endpoint as existing network for chain 0x5 ('Goerli')",
            ),
          );
        },
      );
    });

    it('throws if the new defaultRpcEndpointIndex does not refer to an entry in rpcEndpoints', async () => {
      const networkConfigurationToUpdate = buildCustomNetworkConfiguration({
        chainId: '0x1337',
        rpcEndpoints: [
          buildCustomRpcEndpoint({
            url: 'https://foo.com',
          }),
          buildCustomRpcEndpoint({
            url: 'https://bar.com',
          }),
        ],
      });

      await withController(
        {
          state: buildNetworkControllerStateWithDefaultSelectedNetworkClientId({
            networkConfigurationsByChainId: {
              '0x1337': networkConfigurationToUpdate,
            },
          }),
        },
        async ({ controller }) => {
          await expect(
            controller.updateNetwork('0x1337', {
              ...networkConfigurationToUpdate,
              defaultRpcEndpointIndex: 99999,
            }),
          ).rejects.toThrow(
            new Error(
              'Could not update network: `defaultRpcEndpointIndex` must refer to an entry in `rpcEndpoints`',
            ),
          );
        },
      );
    });

    it('throws if a RPC endpoint being removed is represented by the selected network client, and replacementSelectedRpcEndpointIndex is not specified', async () => {
      const networkConfigurationToUpdate = buildCustomNetworkConfiguration({
        chainId: '0x1337',
        rpcEndpoints: [
          buildCustomRpcEndpoint({
            networkClientId: 'AAAA-AAAA-AAAA-AAAA',
            url: 'https://foo.com',
          }),
          buildCustomRpcEndpoint({
            networkClientId: 'BBBB-BBBB-BBBB-BBBB',
            url: 'https://bar.com',
          }),
        ],
      });

      await withController(
        {
          state: {
            selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
            networkConfigurationsByChainId: {
              '0x1337': networkConfigurationToUpdate,
            },
          },
        },
        async ({ controller }) => {
          await expect(
            controller.updateNetwork('0x1337', {
              ...networkConfigurationToUpdate,
              rpcEndpoints: [networkConfigurationToUpdate.rpcEndpoints[1]],
            }),
          ).rejects.toThrow(
            new Error(
              "Could not update network: Cannot update RPC endpoints in such a way that the selected network 'AAAA-AAAA-AAAA-AAAA' would be removed without a replacement. Choose a different RPC endpoint as the selected network via the `replacementSelectedRpcEndpointIndex` option.",
            ),
          );
        },
      );
    });

    it('throws if a RPC endpoint being removed is represented by the selected network client, and an invalid replacementSelectedRpcEndpointIndex is not specified', async () => {
      const networkConfigurationToUpdate = buildCustomNetworkConfiguration({
        chainId: '0x1337',
        rpcEndpoints: [
          buildCustomRpcEndpoint({
            networkClientId: 'AAAA-AAAA-AAAA-AAAA',
            url: 'https://foo.com',
          }),
          buildCustomRpcEndpoint({
            networkClientId: 'BBBB-BBBB-BBBB-BBBB',
            url: 'https://bar.com',
          }),
        ],
      });

      await withController(
        {
          state: {
            selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
            networkConfigurationsByChainId: {
              '0x1337': networkConfigurationToUpdate,
            },
          },
        },
        async ({ controller }) => {
          await expect(
            controller.updateNetwork(
              '0x1337',
              {
                ...networkConfigurationToUpdate,
                rpcEndpoints: [networkConfigurationToUpdate.rpcEndpoints[1]],
              },
              { replacementSelectedRpcEndpointIndex: 9999 },
            ),
          ).rejects.toThrow(
            new Error(
              `Could not update network: \`replacementSelectedRpcEndpointIndex\` 9999 does not refer to an entry in \`rpcEndpoints\``,
            ),
          );
        },
      );
    });

    for (const infuraNetworkType of Object.values(InfuraNetworkType)) {
      const infuraChainId = ChainId[infuraNetworkType];
      const infuraNativeTokenName = NetworksTicker[infuraNetworkType];

      // False negative - this is a string.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      describe(`if the existing chain ID is the Infura-supported chain ${infuraChainId} and is not being changed`, () => {
        describe('when a new Infura RPC endpoint is being added', () => {
          it('creates and registers a new network client for the RPC endpoint', async () => {
            const createAutoManagedNetworkClientSpy = jest.spyOn(
              createAutoManagedNetworkClientModule,
              'createAutoManagedNetworkClient',
            );
            const networkConfigurationToUpdate =
              buildInfuraNetworkConfiguration(infuraNetworkType, {
                rpcEndpoints: [
                  buildCustomRpcEndpoint({
                    networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                    url: 'https://rpc.network',
                  }),
                ],
              });

            await withController(
              {
                state: {
                  networkConfigurationsByChainId: {
                    [infuraChainId]: networkConfigurationToUpdate,
                    '0x9999': buildCustomNetworkConfiguration({
                      chainId: '0x9999',
                      nativeCurrency: 'TEST-9999',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                          url: 'https://selected.endpoint',
                        }),
                      ],
                    }),
                  },
                  selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                },
                infuraProjectId: 'some-infura-project-id',
              },
              async ({ controller }) => {
                const infuraRpcEndpoint =
                  buildInfuraRpcEndpoint(infuraNetworkType);

                await controller.updateNetwork(infuraChainId, {
                  ...networkConfigurationToUpdate,
                  rpcEndpoints: [
                    ...networkConfigurationToUpdate.rpcEndpoints,
                    infuraRpcEndpoint,
                  ],
                });

                // Skipping network client creation for existing RPC endpoints
                expect(
                  createAutoManagedNetworkClientSpy,
                ).toHaveBeenNthCalledWith(3, {
                  chainId: infuraChainId,
                  infuraProjectId: 'some-infura-project-id',
                  network: infuraNetworkType,
                  ticker: infuraNativeTokenName,
                  type: NetworkClientType.Infura,
                });

                expect(
                  getNetworkConfigurationsByNetworkClientId(
                    controller.getNetworkClientRegistry(),
                  ),
                ).toStrictEqual({
                  [infuraNetworkType]: {
                    chainId: infuraChainId,
                    infuraProjectId: 'some-infura-project-id',
                    network: infuraNetworkType,
                    ticker: infuraNativeTokenName,
                    type: NetworkClientType.Infura,
                  },
                  'AAAA-AAAA-AAAA-AAAA': {
                    chainId: infuraChainId,
                    rpcUrl: 'https://rpc.network',
                    ticker: infuraNativeTokenName,
                    type: NetworkClientType.Custom,
                  },
                  'ZZZZ-ZZZZ-ZZZZ-ZZZZ': {
                    chainId: '0x9999',
                    rpcUrl: 'https://selected.endpoint',
                    ticker: 'TEST-9999',
                    type: NetworkClientType.Custom,
                  },
                });
              },
            );
          });

          it('stores the network configuration with the new RPC endpoint in state', async () => {
            const networkConfigurationToUpdate =
              buildInfuraNetworkConfiguration(infuraNetworkType, {
                rpcEndpoints: [
                  buildCustomRpcEndpoint({
                    networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                    url: 'https://rpc.network',
                  }),
                ],
              });

            await withController(
              {
                state: {
                  networkConfigurationsByChainId: {
                    [infuraChainId]: networkConfigurationToUpdate,
                    '0x9999': buildCustomNetworkConfiguration({
                      chainId: '0x9999',
                      nativeCurrency: 'TEST-9999',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                          url: 'https://selected.endpoint',
                        }),
                      ],
                    }),
                  },
                  selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                },
                infuraProjectId: 'some-infura-project-id',
              },
              async ({ controller }) => {
                const infuraRpcEndpoint =
                  buildInfuraRpcEndpoint(infuraNetworkType);

                await controller.updateNetwork(infuraChainId, {
                  ...networkConfigurationToUpdate,
                  rpcEndpoints: [
                    ...networkConfigurationToUpdate.rpcEndpoints,
                    infuraRpcEndpoint,
                  ],
                });

                expect(
                  controller.state.networkConfigurationsByChainId[
                    infuraChainId
                  ],
                ).toStrictEqual({
                  ...networkConfigurationToUpdate,
                  rpcEndpoints: [
                    ...networkConfigurationToUpdate.rpcEndpoints,
                    {
                      networkClientId: infuraNetworkType,
                      type: RpcEndpointType.Infura,
                      // This is a string.
                      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                      url: `https://${infuraNetworkType}.infura.io/v3/{infuraProjectId}`,
                    },
                  ],
                });
              },
            );
          });

          it('returns the updated network configuration', async () => {
            const networkConfigurationToUpdate =
              buildInfuraNetworkConfiguration(infuraNetworkType, {
                rpcEndpoints: [
                  buildCustomRpcEndpoint({
                    networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                    url: 'https://rpc.network',
                  }),
                ],
              });

            await withController(
              {
                state: {
                  networkConfigurationsByChainId: {
                    [infuraChainId]: networkConfigurationToUpdate,
                    '0x9999': buildCustomNetworkConfiguration({
                      chainId: '0x9999',
                      nativeCurrency: 'TEST-9999',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                          url: 'https://selected.endpoint',
                        }),
                      ],
                    }),
                  },
                  selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                },
                infuraProjectId: 'some-infura-project-id',
              },
              async ({ controller }) => {
                const infuraRpcEndpoint =
                  buildInfuraRpcEndpoint(infuraNetworkType);

                const updatedNetworkConfiguration =
                  await controller.updateNetwork(infuraChainId, {
                    ...networkConfigurationToUpdate,
                    rpcEndpoints: [
                      ...networkConfigurationToUpdate.rpcEndpoints,
                      infuraRpcEndpoint,
                    ],
                  });

                expect(updatedNetworkConfiguration).toStrictEqual({
                  ...networkConfigurationToUpdate,
                  rpcEndpoints: [
                    ...networkConfigurationToUpdate.rpcEndpoints,
                    {
                      networkClientId: infuraNetworkType,
                      type: RpcEndpointType.Infura,
                      // This is a string.
                      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                      url: `https://${infuraNetworkType}.infura.io/v3/{infuraProjectId}`,
                    },
                  ],
                });
              },
            );
          });
        });

        describe('when new custom RPC endpoints are being added', () => {
          it('creates and registers new network clients for each RPC endpoint', async () => {
            uuidV4Mock
              .mockReturnValueOnce('AAAA-AAAA-AAAA-AAAA')
              .mockReturnValueOnce('BBBB-BBBB-BBBB-BBBB');
            const createAutoManagedNetworkClientSpy = jest.spyOn(
              createAutoManagedNetworkClientModule,
              'createAutoManagedNetworkClient',
            );
            const networkConfigurationToUpdate =
              buildInfuraNetworkConfiguration(infuraNetworkType, {
                rpcEndpoints: [buildInfuraRpcEndpoint(infuraNetworkType)],
              });

            await withController(
              {
                state: {
                  networkConfigurationsByChainId: {
                    [infuraChainId]: networkConfigurationToUpdate,
                    '0x9999': buildCustomNetworkConfiguration({
                      chainId: '0x9999',
                      nativeCurrency: 'TEST-9999',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                          url: 'https://selected.endpoint',
                        }),
                      ],
                    }),
                  },
                  selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                },
                infuraProjectId: 'some-infura-project-id',
              },
              async ({ controller }) => {
                const [rpcEndpoint1, rpcEndpoint2] = [
                  buildUpdateNetworkCustomRpcEndpointFields({
                    name: 'Endpoint 1',
                    url: 'https://rpc.endpoint/1',
                  }),
                  buildUpdateNetworkCustomRpcEndpointFields({
                    name: 'Endpoint 2',
                    url: 'https://rpc.endpoint/2',
                  }),
                ];
                await controller.updateNetwork(infuraChainId, {
                  ...networkConfigurationToUpdate,
                  defaultRpcEndpointIndex: 0,
                  rpcEndpoints: [
                    ...networkConfigurationToUpdate.rpcEndpoints,
                    rpcEndpoint1,
                    rpcEndpoint2,
                  ],
                });

                // Skipping network client creation for existing RPC endpoints
                expect(
                  createAutoManagedNetworkClientSpy,
                ).toHaveBeenNthCalledWith(3, {
                  chainId: infuraChainId,
                  rpcUrl: 'https://rpc.endpoint/1',
                  ticker: infuraNativeTokenName,
                  type: NetworkClientType.Custom,
                });
                expect(
                  createAutoManagedNetworkClientSpy,
                ).toHaveBeenNthCalledWith(4, {
                  chainId: infuraChainId,
                  rpcUrl: 'https://rpc.endpoint/2',
                  ticker: infuraNativeTokenName,
                  type: NetworkClientType.Custom,
                });

                expect(
                  getNetworkConfigurationsByNetworkClientId(
                    controller.getNetworkClientRegistry(),
                  ),
                ).toStrictEqual({
                  [infuraNetworkType]: {
                    chainId: infuraChainId,
                    infuraProjectId: 'some-infura-project-id',
                    network: infuraNetworkType,
                    ticker: infuraNativeTokenName,
                    type: NetworkClientType.Infura,
                  },
                  'AAAA-AAAA-AAAA-AAAA': {
                    chainId: infuraChainId,
                    rpcUrl: 'https://rpc.endpoint/1',
                    ticker: infuraNativeTokenName,
                    type: NetworkClientType.Custom,
                  },
                  'BBBB-BBBB-BBBB-BBBB': {
                    chainId: infuraChainId,
                    rpcUrl: 'https://rpc.endpoint/2',
                    ticker: infuraNativeTokenName,
                    type: NetworkClientType.Custom,
                  },
                  'ZZZZ-ZZZZ-ZZZZ-ZZZZ': {
                    chainId: '0x9999',
                    rpcUrl: 'https://selected.endpoint',
                    ticker: 'TEST-9999',
                    type: NetworkClientType.Custom,
                  },
                });
              },
            );
          });

          it('assigns the ID of the created network client to each RPC endpoint in state', async () => {
            uuidV4Mock
              .mockReturnValueOnce('AAAA-AAAA-AAAA-AAAA')
              .mockReturnValueOnce('BBBB-BBBB-BBBB-BBBB');
            const networkConfigurationToUpdate =
              buildInfuraNetworkConfiguration(infuraNetworkType, {
                rpcEndpoints: [buildInfuraRpcEndpoint(infuraNetworkType)],
              });

            await withController(
              {
                state: {
                  networkConfigurationsByChainId: {
                    [infuraChainId]: networkConfigurationToUpdate,
                    '0x9999': buildCustomNetworkConfiguration({
                      chainId: '0x9999',
                      nativeCurrency: 'TEST-9999',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                          url: 'https://selected.endpoint',
                        }),
                      ],
                    }),
                  },
                  selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                },
                infuraProjectId: 'some-infura-project-id',
              },
              async ({ controller }) => {
                await controller.updateNetwork(infuraChainId, {
                  ...networkConfigurationToUpdate,
                  defaultRpcEndpointIndex: 0,
                  rpcEndpoints: [
                    ...networkConfigurationToUpdate.rpcEndpoints,
                    buildUpdateNetworkCustomRpcEndpointFields({
                      name: 'Endpoint 2',
                      url: 'https://rpc.endpoint/2',
                    }),
                    buildUpdateNetworkCustomRpcEndpointFields({
                      name: 'Endpoint 3',
                      url: 'https://rpc.endpoint/3',
                    }),
                  ],
                });

                expect(
                  controller.state.networkConfigurationsByChainId[
                    infuraChainId
                  ],
                ).toStrictEqual({
                  ...networkConfigurationToUpdate,
                  rpcEndpoints: [
                    ...networkConfigurationToUpdate.rpcEndpoints,
                    {
                      name: 'Endpoint 2',
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      type: RpcEndpointType.Custom,
                      url: 'https://rpc.endpoint/2',
                    },
                    {
                      name: 'Endpoint 3',
                      networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                      type: RpcEndpointType.Custom,
                      url: 'https://rpc.endpoint/3',
                    },
                  ],
                });
              },
            );
          });

          it('returns the updated network configuration', async () => {
            uuidV4Mock
              .mockReturnValueOnce('AAAA-AAAA-AAAA-AAAA')
              .mockReturnValueOnce('BBBB-BBBB-BBBB-BBBB');
            const networkConfigurationToUpdate =
              buildInfuraNetworkConfiguration(infuraNetworkType, {
                rpcEndpoints: [buildInfuraRpcEndpoint(infuraNetworkType)],
              });

            await withController(
              {
                state: {
                  networkConfigurationsByChainId: {
                    [infuraChainId]: networkConfigurationToUpdate,
                    '0x9999': buildCustomNetworkConfiguration({
                      chainId: '0x9999',
                      nativeCurrency: 'TEST-9999',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                          url: 'https://selected.endpoint',
                        }),
                      ],
                    }),
                  },
                  selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                },
                infuraProjectId: 'some-infura-project-id',
              },
              async ({ controller }) => {
                const updatedNetworkConfiguration =
                  await controller.updateNetwork(infuraChainId, {
                    ...networkConfigurationToUpdate,
                    defaultRpcEndpointIndex: 0,
                    rpcEndpoints: [
                      ...networkConfigurationToUpdate.rpcEndpoints,
                      buildUpdateNetworkCustomRpcEndpointFields({
                        name: 'Endpoint 2',
                        url: 'https://rpc.endpoint/2',
                      }),
                      buildUpdateNetworkCustomRpcEndpointFields({
                        name: 'Endpoint 3',
                        url: 'https://rpc.endpoint/3',
                      }),
                    ],
                  });

                expect(updatedNetworkConfiguration).toStrictEqual({
                  ...networkConfigurationToUpdate,
                  rpcEndpoints: [
                    ...networkConfigurationToUpdate.rpcEndpoints,
                    {
                      name: 'Endpoint 2',
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      type: RpcEndpointType.Custom,
                      url: 'https://rpc.endpoint/2',
                    },
                    {
                      name: 'Endpoint 3',
                      networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                      type: RpcEndpointType.Custom,
                      url: 'https://rpc.endpoint/3',
                    },
                  ],
                });
              },
            );
          });
        });

        describe('when some custom RPC endpoints are being removed', () => {
          it('destroys and unregisters existing network clients for the RPC endpoints', async () => {
            const [rpcEndpoint1, rpcEndpoint2] = [
              buildCustomRpcEndpoint({
                name: 'Endpoint 1',
                networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                url: 'https://rpc.endpoint/1',
              }),
              buildCustomRpcEndpoint({
                name: 'Endpoint 2',
                networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                url: 'https://rpc.endpoint/2',
              }),
            ];
            const networkConfigurationToUpdate =
              buildInfuraNetworkConfiguration(infuraNetworkType, {
                rpcEndpoints: [rpcEndpoint1, rpcEndpoint2],
              });

            await withController(
              {
                state: {
                  selectedNetworkClientId: 'BBBB-BBBB-BBBB-BBBB',
                  networkConfigurationsByChainId: {
                    [infuraChainId]: networkConfigurationToUpdate,
                  },
                },
              },
              async ({ controller }) => {
                const existingNetworkClient = controller.getNetworkClientById(
                  'AAAA-AAAA-AAAA-AAAA',
                );
                const destroySpy = jest.spyOn(existingNetworkClient, 'destroy');

                await controller.updateNetwork(infuraChainId, {
                  ...networkConfigurationToUpdate,
                  defaultRpcEndpointIndex: 0,
                  rpcEndpoints: [rpcEndpoint2],
                });

                expect(destroySpy).toHaveBeenCalled();
                const networkClientRegistry =
                  controller.getNetworkClientRegistry();
                expect(networkClientRegistry).not.toHaveProperty(
                  'AAAA-AAAA-AAAA-AAAA',
                );
              },
            );
          });

          it('updates the network configuration in state', async () => {
            const [rpcEndpoint1, rpcEndpoint2] = [
              buildCustomRpcEndpoint({
                name: 'Endpoint 1',
                networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                url: 'https://rpc.endpoint/1',
              }),
              buildCustomRpcEndpoint({
                name: 'Endpoint 2',
                networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                url: 'https://rpc.endpoint/2',
              }),
            ];
            const networkConfigurationToUpdate =
              buildInfuraNetworkConfiguration(infuraNetworkType, {
                rpcEndpoints: [rpcEndpoint1, rpcEndpoint2],
              });

            await withController(
              {
                state: {
                  selectedNetworkClientId: 'BBBB-BBBB-BBBB-BBBB',
                  networkConfigurationsByChainId: {
                    [infuraChainId]: networkConfigurationToUpdate,
                  },
                },
              },
              async ({ controller }) => {
                await controller.updateNetwork(infuraChainId, {
                  ...networkConfigurationToUpdate,
                  defaultRpcEndpointIndex: 0,
                  rpcEndpoints: [rpcEndpoint2],
                });

                expect(
                  controller.state.networkConfigurationsByChainId[
                    infuraChainId
                  ],
                ).toStrictEqual({
                  ...networkConfigurationToUpdate,
                  defaultRpcEndpointIndex: 0,
                  rpcEndpoints: [rpcEndpoint2],
                });
              },
            );
          });

          it('returns the updated network configuration', async () => {
            const [rpcEndpoint1, rpcEndpoint2] = [
              buildCustomRpcEndpoint({
                name: 'Endpoint 1',
                networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                url: 'https://rpc.endpoint/1',
              }),
              buildCustomRpcEndpoint({
                name: 'Endpoint 2',
                networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                url: 'https://rpc.endpoint/2',
              }),
            ];
            const networkConfigurationToUpdate =
              buildInfuraNetworkConfiguration(infuraNetworkType, {
                rpcEndpoints: [rpcEndpoint1, rpcEndpoint2],
              });

            await withController(
              {
                state: {
                  selectedNetworkClientId: 'BBBB-BBBB-BBBB-BBBB',
                  networkConfigurationsByChainId: {
                    [infuraChainId]: networkConfigurationToUpdate,
                  },
                },
              },
              async ({ controller }) => {
                const updatedNetworkConfiguration =
                  await controller.updateNetwork(infuraChainId, {
                    ...networkConfigurationToUpdate,
                    defaultRpcEndpointIndex: 0,
                    rpcEndpoints: [rpcEndpoint2],
                  });

                expect(updatedNetworkConfiguration).toStrictEqual({
                  ...networkConfigurationToUpdate,
                  defaultRpcEndpointIndex: 0,
                  rpcEndpoints: [rpcEndpoint2],
                });
              },
            );
          });

          describe('when one is represented by the selected network client (and a replacement is specified)', () => {
            describe('if the new replacement RPC endpoint already exists', () => {
              it('selects the network client that represents the replacement RPC endpoint', async () => {
                const networkConfigurationToUpdate =
                  buildInfuraNetworkConfiguration(infuraNetworkType, {
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                        url: 'https://test.network/1',
                      }),
                      buildCustomRpcEndpoint({
                        networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                        url: 'https://test.network/2',
                      }),
                    ],
                  });

                await withController(
                  {
                    state: {
                      selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      networkConfigurationsByChainId: {
                        [infuraChainId]: networkConfigurationToUpdate,
                      },
                    },
                  },
                  async ({ controller }) => {
                    const fakeProviders = [
                      buildFakeProvider([
                        {
                          request: {
                            method: 'test',
                          },
                          response: {
                            result: 'test response from 1',
                          },
                        },
                      ]),
                      buildFakeProvider([
                        {
                          request: {
                            method: 'test',
                          },
                          response: {
                            result: 'test response from 2',
                          },
                        },
                      ]),
                    ];
                    const fakeNetworkClients = [
                      buildFakeClient(fakeProviders[0]),
                      buildFakeClient(fakeProviders[1]),
                    ];
                    mockCreateNetworkClient()
                      .calledWith({
                        chainId: infuraChainId,
                        rpcUrl: 'https://test.network/1',
                        ticker: infuraNativeTokenName,
                        type: NetworkClientType.Custom,
                      })
                      .mockReturnValue(fakeNetworkClients[0])
                      .calledWith({
                        chainId: infuraChainId,
                        rpcUrl: 'https://test.network/2',
                        ticker: infuraNativeTokenName,
                        type: NetworkClientType.Custom,
                      })
                      .mockReturnValue(fakeNetworkClients[1]);
                    await controller.initializeProvider();
                    expect(controller.state.selectedNetworkClientId).toBe(
                      'AAAA-AAAA-AAAA-AAAA',
                    );
                    const networkClient1 =
                      controller.getSelectedNetworkClient();
                    assert(networkClient1, 'Network client is somehow unset');
                    const result1 = await networkClient1.provider.request({
                      method: 'test',
                    });
                    expect(result1).toBe('test response from 1');

                    await controller.updateNetwork(
                      infuraChainId,
                      {
                        ...networkConfigurationToUpdate,
                        rpcEndpoints: [
                          networkConfigurationToUpdate.rpcEndpoints[1],
                        ],
                      },
                      {
                        replacementSelectedRpcEndpointIndex: 0,
                      },
                    );
                    expect(controller.state.selectedNetworkClientId).toBe(
                      'BBBB-BBBB-BBBB-BBBB',
                    );
                    const networkClient2 =
                      controller.getSelectedNetworkClient();
                    assert(networkClient2, 'Network client is somehow unset');
                    const result2 = await networkClient2.provider.request({
                      method: 'test',
                    });
                    expect(result2).toBe('test response from 2');
                  },
                );
              });

              it('updates selectedNetworkClientId and networkConfigurationsByChainId at the same time', async () => {
                const networkConfigurationToUpdate =
                  buildInfuraNetworkConfiguration(infuraNetworkType, {
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                        url: 'https://test.network/1',
                      }),
                      buildCustomRpcEndpoint({
                        networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                        url: 'https://test.network/2',
                      }),
                    ],
                  });

                await withController(
                  {
                    state: {
                      selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      networkConfigurationsByChainId: {
                        [infuraChainId]: networkConfigurationToUpdate,
                      },
                    },
                  },
                  async ({ controller, messenger }) => {
                    const fakeProviders = [
                      buildFakeProvider([
                        {
                          request: {
                            method: 'test',
                          },
                          response: {
                            result: 'test response from 1',
                          },
                        },
                      ]),
                      buildFakeProvider([
                        {
                          request: {
                            method: 'test',
                          },
                          response: {
                            result: 'test response from 2',
                          },
                        },
                      ]),
                    ];
                    const fakeNetworkClients = [
                      buildFakeClient(fakeProviders[0]),
                      buildFakeClient(fakeProviders[1]),
                    ];
                    mockCreateNetworkClient()
                      .calledWith({
                        chainId: infuraChainId,
                        rpcUrl: 'https://test.network/1',
                        ticker: infuraNativeTokenName,
                        type: NetworkClientType.Custom,
                      })
                      .mockReturnValue(fakeNetworkClients[0])
                      .calledWith({
                        chainId: infuraChainId,
                        rpcUrl: 'https://test.network/2',
                        ticker: infuraNativeTokenName,
                        type: NetworkClientType.Custom,
                      })
                      .mockReturnValue(fakeNetworkClients[1]);
                    await controller.initializeProvider();

                    const promiseForStateChanges = waitForStateChanges({
                      messenger,
                      count: 1,
                    });

                    await controller.updateNetwork(
                      infuraChainId,
                      {
                        ...networkConfigurationToUpdate,
                        rpcEndpoints: [
                          networkConfigurationToUpdate.rpcEndpoints[1],
                        ],
                      },
                      {
                        replacementSelectedRpcEndpointIndex: 0,
                      },
                    );
                    const stateChanges = await promiseForStateChanges;
                    expect(stateChanges).toStrictEqual([
                      [
                        expect.any(Object),
                        expect.arrayContaining([
                          expect.objectContaining({
                            op: 'replace',
                            path: ['selectedNetworkClientId'],
                            value: 'BBBB-BBBB-BBBB-BBBB',
                          }),
                          expect.objectContaining({
                            op: 'replace',
                            path: [
                              'networkConfigurationsByChainId',
                              infuraChainId,
                            ],
                          }),
                        ]),
                      ],
                    ]);
                  },
                );
              });
            });

            describe('if the replacement RPC endpoint is being added', () => {
              it('selects the network client that represents the replacement RPC endpoint', async () => {
                uuidV4Mock.mockReturnValueOnce('CCCC-CCCC-CCCC-CCCC');
                const networkConfigurationToUpdate =
                  buildInfuraNetworkConfiguration(infuraNetworkType, {
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                        url: 'https://test.network/1',
                      }),
                      buildCustomRpcEndpoint({
                        networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                        url: 'https://test.network/2',
                      }),
                    ],
                  });

                await withController(
                  {
                    state: {
                      selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      networkConfigurationsByChainId: {
                        [infuraChainId]: networkConfigurationToUpdate,
                      },
                    },
                  },
                  async ({ controller }) => {
                    const fakeProviders = [
                      buildFakeProvider([
                        {
                          request: {
                            method: 'test',
                          },
                          response: {
                            result: 'test response from 1',
                          },
                        },
                      ]),
                      buildFakeProvider([
                        {
                          request: {
                            method: 'test',
                          },
                          response: {
                            result: 'test response from 2',
                          },
                        },
                      ]),
                      buildFakeProvider([
                        {
                          request: {
                            method: 'test',
                          },
                          response: {
                            result: 'test response from 3',
                          },
                        },
                      ]),
                    ];
                    const fakeNetworkClients = [
                      buildFakeClient(fakeProviders[0]),
                      buildFakeClient(fakeProviders[1]),
                      buildFakeClient(fakeProviders[2]),
                    ];
                    mockCreateNetworkClient()
                      .calledWith({
                        chainId: infuraChainId,
                        rpcUrl: 'https://test.network/1',
                        ticker: infuraNativeTokenName,
                        type: NetworkClientType.Custom,
                      })
                      .mockReturnValue(fakeNetworkClients[0])
                      .calledWith({
                        chainId: infuraChainId,
                        rpcUrl: 'https://test.network/2',
                        ticker: infuraNativeTokenName,
                        type: NetworkClientType.Custom,
                      })
                      .mockReturnValue(fakeNetworkClients[1])
                      .calledWith({
                        chainId: infuraChainId,
                        rpcUrl: 'https://test.network/3',
                        ticker: infuraNativeTokenName,
                        type: NetworkClientType.Custom,
                      })
                      .mockReturnValue(fakeNetworkClients[2]);
                    await controller.initializeProvider();
                    expect(controller.state.selectedNetworkClientId).toBe(
                      'AAAA-AAAA-AAAA-AAAA',
                    );
                    const networkClient1 =
                      controller.getSelectedNetworkClient();
                    assert(networkClient1, 'Network client is somehow unset');
                    const result1 = await networkClient1.provider.request({
                      method: 'test',
                    });
                    expect(result1).toBe('test response from 1');

                    await controller.updateNetwork(
                      infuraChainId,
                      {
                        ...networkConfigurationToUpdate,
                        rpcEndpoints: [
                          buildUpdateNetworkCustomRpcEndpointFields({
                            url: 'https://test.network/3',
                          }),
                          networkConfigurationToUpdate.rpcEndpoints[1],
                        ],
                      },
                      {
                        replacementSelectedRpcEndpointIndex: 0,
                      },
                    );
                    expect(controller.state.selectedNetworkClientId).toBe(
                      'CCCC-CCCC-CCCC-CCCC',
                    );
                    const networkClient2 =
                      controller.getSelectedNetworkClient();
                    assert(networkClient2, 'Network client is somehow unset');
                    const result2 = await networkClient2.provider.request({
                      method: 'test',
                    });
                    expect(result2).toBe('test response from 3');
                  },
                );
              });

              it('updates selectedNetworkClientId and networkConfigurationsByChainId at the same time', async () => {
                uuidV4Mock.mockReturnValueOnce('CCCC-CCCC-CCCC-CCCC');
                const networkConfigurationToUpdate =
                  buildInfuraNetworkConfiguration(infuraNetworkType, {
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                        url: 'https://test.network/1',
                      }),
                      buildCustomRpcEndpoint({
                        networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                        url: 'https://test.network/2',
                      }),
                    ],
                  });

                await withController(
                  {
                    state: {
                      selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      networkConfigurationsByChainId: {
                        [infuraChainId]: networkConfigurationToUpdate,
                      },
                    },
                  },
                  async ({ controller, messenger }) => {
                    const fakeProviders = [
                      buildFakeProvider([
                        {
                          request: {
                            method: 'test',
                          },
                          response: {
                            result: 'test response from 1',
                          },
                        },
                      ]),
                      buildFakeProvider([
                        {
                          request: {
                            method: 'test',
                          },
                          response: {
                            result: 'test response from 2',
                          },
                        },
                      ]),
                      buildFakeProvider([
                        {
                          request: {
                            method: 'test',
                          },
                          response: {
                            result: 'test response from 3',
                          },
                        },
                      ]),
                    ];
                    const fakeNetworkClients = [
                      buildFakeClient(fakeProviders[0]),
                      buildFakeClient(fakeProviders[1]),
                      buildFakeClient(fakeProviders[2]),
                    ];
                    mockCreateNetworkClient()
                      .calledWith({
                        chainId: infuraChainId,
                        rpcUrl: 'https://test.network/1',
                        ticker: infuraNativeTokenName,
                        type: NetworkClientType.Custom,
                      })
                      .mockReturnValue(fakeNetworkClients[0])
                      .calledWith({
                        chainId: infuraChainId,
                        rpcUrl: 'https://test.network/2',
                        ticker: infuraNativeTokenName,
                        type: NetworkClientType.Custom,
                      })
                      .mockReturnValue(fakeNetworkClients[1])
                      .calledWith({
                        chainId: infuraChainId,
                        rpcUrl: 'https://test.network/3',
                        ticker: infuraNativeTokenName,
                        type: NetworkClientType.Custom,
                      })
                      .mockReturnValue(fakeNetworkClients[2]);
                    await controller.initializeProvider();

                    const promiseForStateChanges = waitForStateChanges({
                      messenger,
                      count: 1,
                    });

                    await controller.updateNetwork(
                      infuraChainId,
                      {
                        ...networkConfigurationToUpdate,
                        rpcEndpoints: [
                          buildUpdateNetworkCustomRpcEndpointFields({
                            url: 'https://test.network/3',
                          }),
                          networkConfigurationToUpdate.rpcEndpoints[1],
                        ],
                      },
                      {
                        replacementSelectedRpcEndpointIndex: 0,
                      },
                    );
                    const stateChanges = await promiseForStateChanges;
                    expect(stateChanges).toStrictEqual([
                      [
                        expect.any(Object),
                        expect.arrayContaining([
                          expect.objectContaining({
                            op: 'replace',
                            path: ['selectedNetworkClientId'],
                            value: 'CCCC-CCCC-CCCC-CCCC',
                          }),
                          expect.objectContaining({
                            op: 'replace',
                            path: [
                              'networkConfigurationsByChainId',
                              infuraChainId,
                            ],
                          }),
                        ]),
                      ],
                    ]);
                  },
                );
              });
            });
          });
        });

        describe('when the URL of an RPC endpoint is changed (using networkClientId as identification)', () => {
          it('destroys and unregisters the network client for the previous version of the RPC endpoint', async () => {
            uuidV4Mock.mockReturnValueOnce('BBBB-BBBB-BBBB-BBBB');
            const networkConfigurationToUpdate =
              buildInfuraNetworkConfiguration(infuraNetworkType, {
                rpcEndpoints: [
                  buildCustomRpcEndpoint({
                    name: 'Endpoint 1',
                    networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                    url: 'https://rpc.endpoint',
                  }),
                ],
              });

            await withController(
              {
                state: {
                  networkConfigurationsByChainId: {
                    [infuraChainId]: networkConfigurationToUpdate,
                    '0x9999': buildCustomNetworkConfiguration({
                      chainId: '0x9999',
                      nativeCurrency: 'TEST-9999',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                          url: 'https://selected.endpoint',
                        }),
                      ],
                    }),
                  },
                  selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                },
              },
              async ({ controller }) => {
                mockCreateNetworkClient()
                  .calledWith({
                    chainId: infuraChainId,
                    rpcUrl: 'https://some.other.url',
                    ticker: infuraNativeTokenName,
                    type: NetworkClientType.Custom,
                  })
                  .mockReturnValue(buildFakeClient());
                const existingNetworkClient = controller.getNetworkClientById(
                  'AAAA-AAAA-AAAA-AAAA',
                );
                const destroySpy = jest.spyOn(existingNetworkClient, 'destroy');

                await controller.updateNetwork(infuraChainId, {
                  ...networkConfigurationToUpdate,
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      name: 'Endpoint 1',
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      url: 'https://some.other.url',
                    }),
                  ],
                });

                expect(destroySpy).toHaveBeenCalled();
                const networkClientRegistry =
                  controller.getNetworkClientRegistry();
                expect(networkClientRegistry).not.toHaveProperty(
                  'AAAA-AAAA-AAAA-AAAA',
                );
              },
            );
          });

          it('creates and registers a network client for the new version of the RPC endpoint', async () => {
            uuidV4Mock.mockReturnValueOnce('BBBB-BBBB-BBBB-BBBB');
            const createAutoManagedNetworkClientSpy = jest.spyOn(
              createAutoManagedNetworkClientModule,
              'createAutoManagedNetworkClient',
            );
            const networkConfigurationToUpdate =
              buildInfuraNetworkConfiguration(infuraNetworkType, {
                rpcEndpoints: [
                  buildCustomRpcEndpoint({
                    name: 'Endpoint 1',
                    networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                    url: 'https://rpc.endpoint',
                  }),
                ],
              });

            await withController(
              {
                state: {
                  networkConfigurationsByChainId: {
                    [infuraChainId]: networkConfigurationToUpdate,
                    '0x9999': buildCustomNetworkConfiguration({
                      chainId: '0x9999',
                      nativeCurrency: 'TEST-9999',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                          url: 'https://selected.endpoint',
                        }),
                      ],
                    }),
                  },
                  selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                },
              },
              async ({ controller }) => {
                mockCreateNetworkClient()
                  .calledWith({
                    chainId: infuraChainId,
                    rpcUrl: 'https://some.other.url',
                    ticker: infuraNativeTokenName,
                    type: NetworkClientType.Custom,
                  })
                  .mockReturnValue(buildFakeClient());

                await controller.updateNetwork(infuraChainId, {
                  ...networkConfigurationToUpdate,
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      name: 'Endpoint 1',
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      url: 'https://some.other.url',
                    }),
                  ],
                });

                expect(createAutoManagedNetworkClientSpy).toHaveBeenCalledWith({
                  chainId: infuraChainId,
                  rpcUrl: 'https://some.other.url',
                  ticker: infuraNativeTokenName,
                  type: NetworkClientType.Custom,
                });
                expect(
                  getNetworkConfigurationsByNetworkClientId(
                    controller.getNetworkClientRegistry(),
                  ),
                ).toMatchObject({
                  'BBBB-BBBB-BBBB-BBBB': {
                    chainId: infuraChainId,
                    rpcUrl: 'https://some.other.url',
                    ticker: infuraNativeTokenName,
                    type: NetworkClientType.Custom,
                  },
                });
              },
            );
          });

          it('updates the network configuration in state with a new network client ID for the RPC endpoint', async () => {
            uuidV4Mock.mockReturnValueOnce('BBBB-BBBB-BBBB-BBBB');
            const networkConfigurationToUpdate =
              buildInfuraNetworkConfiguration(infuraNetworkType, {
                rpcEndpoints: [
                  buildCustomRpcEndpoint({
                    name: 'Endpoint 1',
                    networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                    url: 'https://rpc.endpoint',
                  }),
                ],
              });

            await withController(
              {
                state: {
                  networkConfigurationsByChainId: {
                    [infuraChainId]: networkConfigurationToUpdate,
                    '0x9999': buildCustomNetworkConfiguration({
                      chainId: '0x9999',
                      nativeCurrency: 'TEST-9999',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                          url: 'https://selected.endpoint',
                        }),
                      ],
                    }),
                  },
                  selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                },
              },
              async ({ controller }) => {
                mockCreateNetworkClient()
                  .calledWith({
                    chainId: infuraChainId,
                    rpcUrl: 'https://some.other.url',
                    ticker: infuraNativeTokenName,
                    type: NetworkClientType.Custom,
                  })
                  .mockReturnValue(buildFakeClient());

                await controller.updateNetwork(infuraChainId, {
                  ...networkConfigurationToUpdate,
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      name: 'Endpoint 1',
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      url: 'https://some.other.url',
                    }),
                  ],
                });

                expect(
                  controller.state.networkConfigurationsByChainId[
                    infuraChainId
                  ],
                ).toStrictEqual({
                  ...networkConfigurationToUpdate,
                  rpcEndpoints: [
                    {
                      name: 'Endpoint 1',
                      networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                      type: 'custom',
                      url: 'https://some.other.url',
                    },
                  ],
                });
              },
            );
          });

          it('returns the updated network configuration', async () => {
            uuidV4Mock.mockReturnValueOnce('BBBB-BBBB-BBBB-BBBB');
            const networkConfigurationToUpdate =
              buildInfuraNetworkConfiguration(infuraNetworkType, {
                rpcEndpoints: [
                  buildCustomRpcEndpoint({
                    name: 'Endpoint 1',
                    networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                    url: 'https://rpc.endpoint',
                  }),
                ],
              });

            await withController(
              {
                state: {
                  networkConfigurationsByChainId: {
                    [infuraChainId]: networkConfigurationToUpdate,
                    '0x9999': buildCustomNetworkConfiguration({
                      chainId: '0x9999',
                      nativeCurrency: 'TEST-9999',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                          url: 'https://selected.endpoint',
                        }),
                      ],
                    }),
                  },
                  selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                },
              },
              async ({ controller }) => {
                mockCreateNetworkClient()
                  .calledWith({
                    chainId: infuraChainId,
                    rpcUrl: 'https://some.other.url',
                    ticker: infuraNativeTokenName,
                    type: NetworkClientType.Custom,
                  })
                  .mockReturnValue(buildFakeClient());

                const updatedNetworkConfiguration =
                  await controller.updateNetwork(infuraChainId, {
                    ...networkConfigurationToUpdate,
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        name: 'Endpoint 1',
                        networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                        url: 'https://some.other.url',
                      }),
                    ],
                  });

                expect(updatedNetworkConfiguration).toStrictEqual({
                  ...networkConfigurationToUpdate,
                  rpcEndpoints: [
                    {
                      name: 'Endpoint 1',
                      networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                      type: 'custom',
                      url: 'https://some.other.url',
                    },
                  ],
                });
              },
            );
          });

          describe('if the previous version of the RPC endpoint was represented by the selected network client', () => {
            it('invisibly selects the network client for the new RPC endpoint', async () => {
              uuidV4Mock.mockReturnValueOnce('BBBB-BBBB-BBBB-BBBB');
              const networkConfigurationToUpdate =
                buildInfuraNetworkConfiguration(infuraNetworkType, {
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      name: 'Endpoint 1',
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      url: 'https://rpc.endpoint',
                    }),
                  ],
                });

              await withController(
                {
                  state: {
                    selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
                    networkConfigurationsByChainId: {
                      [infuraChainId]: networkConfigurationToUpdate,
                    },
                  },
                },
                async ({ controller }) => {
                  const fakeProviders = [
                    buildFakeProvider([
                      {
                        request: {
                          method: 'test',
                        },
                        response: {
                          result: 'test response from 1',
                        },
                      },
                    ]),
                    buildFakeProvider([
                      {
                        request: {
                          method: 'test',
                        },
                        response: {
                          result: 'test response from 2',
                        },
                      },
                    ]),
                  ];
                  const fakeNetworkClients = [
                    buildFakeClient(fakeProviders[0]),
                    buildFakeClient(fakeProviders[1]),
                  ];
                  mockCreateNetworkClient()
                    .calledWith({
                      chainId: infuraChainId,
                      rpcUrl: 'https://rpc.endpoint',
                      ticker: infuraNativeTokenName,
                      type: NetworkClientType.Custom,
                    })
                    .mockReturnValue(fakeNetworkClients[0])
                    .calledWith({
                      chainId: infuraChainId,
                      rpcUrl: 'https://some.other.url',
                      ticker: infuraNativeTokenName,
                      type: NetworkClientType.Custom,
                    })
                    .mockReturnValue(fakeNetworkClients[1]);
                  await controller.initializeProvider();
                  expect(controller.state.selectedNetworkClientId).toBe(
                    'AAAA-AAAA-AAAA-AAAA',
                  );
                  const networkClient1 = controller.getSelectedNetworkClient();
                  assert(networkClient1, 'Network client is somehow unset');
                  const result1 = await networkClient1.provider.request({
                    method: 'test',
                  });
                  expect(result1).toBe('test response from 1');

                  await controller.updateNetwork(infuraChainId, {
                    ...networkConfigurationToUpdate,
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        name: 'Endpoint 1',
                        networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                        url: 'https://some.other.url',
                      }),
                    ],
                  });
                  expect(controller.state.selectedNetworkClientId).toBe(
                    'BBBB-BBBB-BBBB-BBBB',
                  );
                  const networkClient2 = controller.getSelectedNetworkClient();
                  assert(networkClient2, 'Network client is somehow unset');
                  const result2 = await networkClient2.provider.request({
                    method: 'test',
                  });
                  expect(result2).toBe('test response from 2');
                },
              );
            });

            it('updates selectedNetworkClientId and networkConfigurationsByChainId at the same time', async () => {
              uuidV4Mock.mockReturnValueOnce('BBBB-BBBB-BBBB-BBBB');
              const networkConfigurationToUpdate =
                buildInfuraNetworkConfiguration(infuraNetworkType, {
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      name: 'Endpoint 1',
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      url: 'https://rpc.endpoint',
                    }),
                  ],
                });

              await withController(
                {
                  state: {
                    selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
                    networkConfigurationsByChainId: {
                      [infuraChainId]: networkConfigurationToUpdate,
                    },
                  },
                },
                async ({ controller, messenger }) => {
                  const fakeProviders = [
                    buildFakeProvider([
                      {
                        request: {
                          method: 'test',
                        },
                        response: {
                          result: 'test response from 1',
                        },
                      },
                    ]),
                    buildFakeProvider([
                      {
                        request: {
                          method: 'test',
                        },
                        response: {
                          result: 'test response from 2',
                        },
                      },
                    ]),
                  ];
                  const fakeNetworkClients = [
                    buildFakeClient(fakeProviders[0]),
                    buildFakeClient(fakeProviders[1]),
                  ];
                  mockCreateNetworkClient()
                    .calledWith({
                      chainId: infuraChainId,
                      rpcUrl: 'https://rpc.endpoint',
                      ticker: infuraNativeTokenName,
                      type: NetworkClientType.Custom,
                    })
                    .mockReturnValue(fakeNetworkClients[0])
                    .calledWith({
                      chainId: infuraChainId,
                      rpcUrl: 'https://some.other.url',
                      ticker: infuraNativeTokenName,
                      type: NetworkClientType.Custom,
                    })
                    .mockReturnValue(fakeNetworkClients[1]);
                  await controller.initializeProvider();

                  const promiseForStateChanges = waitForStateChanges({
                    messenger,
                    count: 1,
                  });

                  await controller.updateNetwork(infuraChainId, {
                    ...networkConfigurationToUpdate,
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        name: 'Endpoint 1',
                        networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                        url: 'https://some.other.url',
                      }),
                    ],
                  });
                  const stateChanges = await promiseForStateChanges;
                  expect(stateChanges).toStrictEqual([
                    [
                      expect.any(Object),
                      expect.arrayContaining([
                        expect.objectContaining({
                          op: 'replace',
                          path: ['selectedNetworkClientId'],
                          value: 'BBBB-BBBB-BBBB-BBBB',
                        }),
                        expect.objectContaining({
                          op: 'replace',
                          path: [
                            'networkConfigurationsByChainId',
                            infuraChainId,
                          ],
                        }),
                      ]),
                    ],
                  ]);
                },
              );
            });
          });
        });

        describe('when all of the RPC endpoints are simply being shuffled', () => {
          it('does not touch the network client registry', async () => {
            const [rpcEndpoint1, rpcEndpoint2, rpcEndpoint3] = [
              buildInfuraRpcEndpoint(infuraNetworkType),
              buildCustomRpcEndpoint({
                name: 'Endpoint 1',
                networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                url: 'https://rpc.endpoint/1',
              }),
              buildCustomRpcEndpoint({
                name: 'Endpoint 2',
                networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                url: 'https://rpc.endpoint/2',
              }),
            ];
            const networkConfigurationToUpdate =
              buildInfuraNetworkConfiguration(infuraNetworkType, {
                rpcEndpoints: [rpcEndpoint1, rpcEndpoint2, rpcEndpoint3],
              });

            await withController(
              {
                state: {
                  networkConfigurationsByChainId: {
                    [infuraChainId]: networkConfigurationToUpdate,
                    '0x9999': buildCustomNetworkConfiguration({
                      chainId: '0x9999',
                      nativeCurrency: 'TEST-9999',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                          url: 'https://selected.endpoint',
                        }),
                      ],
                    }),
                  },
                  selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                },
              },
              async ({ controller }) => {
                mockCreateNetworkClient().mockReturnValue(buildFakeClient());
                const networkClientRegistry =
                  controller.getNetworkClientRegistry();

                await controller.updateNetwork(infuraChainId, {
                  ...networkConfigurationToUpdate,
                  rpcEndpoints: [rpcEndpoint3, rpcEndpoint1, rpcEndpoint2],
                });

                expect(controller.getNetworkClientRegistry()).toStrictEqual(
                  networkClientRegistry,
                );
              },
            );
          });

          it('updates the network configuration in state with the new order of RPC endpoints', async () => {
            const [rpcEndpoint1, rpcEndpoint2, rpcEndpoint3] = [
              buildInfuraRpcEndpoint(infuraNetworkType),
              buildCustomRpcEndpoint({
                name: 'Endpoint 1',
                networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                url: 'https://rpc.endpoint/1',
              }),
              buildCustomRpcEndpoint({
                name: 'Endpoint 2',
                networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                url: 'https://rpc.endpoint/2',
              }),
            ];
            const networkConfigurationToUpdate =
              buildInfuraNetworkConfiguration(infuraNetworkType, {
                rpcEndpoints: [rpcEndpoint1, rpcEndpoint2, rpcEndpoint3],
              });

            await withController(
              {
                state: {
                  networkConfigurationsByChainId: {
                    [infuraChainId]: networkConfigurationToUpdate,
                    '0x9999': buildCustomNetworkConfiguration({
                      chainId: '0x9999',
                      nativeCurrency: 'TEST-9999',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                          url: 'https://selected.endpoint',
                        }),
                      ],
                    }),
                  },
                  selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                },
              },
              async ({ controller }) => {
                await controller.updateNetwork(infuraChainId, {
                  ...networkConfigurationToUpdate,
                  rpcEndpoints: [rpcEndpoint3, rpcEndpoint1, rpcEndpoint2],
                });

                expect(
                  controller.state.networkConfigurationsByChainId[infuraChainId],
                ).toStrictEqual({
                  ...networkConfigurationToUpdate,
                  rpcEndpoints: [rpcEndpoint3, rpcEndpoint1, rpcEndpoint2],
                });
              },
            );
          });

          it('returns the network configuration with the new order of RPC endpoints', async () => {
            const [rpcEndpoint1, rpcEndpoint2, rpcEndpoint3] = [
              buildInfuraRpcEndpoint(infuraNetworkType),
              buildCustomRpcEndpoint({
                name: 'Endpoint 1',
                networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                url: 'https://rpc.endpoint/1',
              }),
              buildCustomRpcEndpoint({
                name: 'Endpoint 2',
                networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                url: 'https://rpc.endpoint/2',
              }),
            ];
            const networkConfigurationToUpdate =
              buildInfuraNetworkConfiguration(infuraNetworkType, {
                rpcEndpoints: [rpcEndpoint1, rpcEndpoint2, rpcEndpoint3],
              });

            await withController(
              {
                state: {
                  networkConfigurationsByChainId: {
                    [infuraChainId]: networkConfigurationToUpdate,
                    '0x9999': buildCustomNetworkConfiguration({
                      chainId: '0x9999',
                      nativeCurrency: 'TEST-9999',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                          url: 'https://selected.endpoint',
                        }),
                      ],
                    }),
                  },
                  selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                },
              },
              async ({ controller }) => {
                const updatedNetworkConfiguration =
                  await controller.updateNetwork(infuraChainId, {
                    ...networkConfigurationToUpdate,
                    rpcEndpoints: [rpcEndpoint3, rpcEndpoint1, rpcEndpoint2],
                  });

                expect(updatedNetworkConfiguration).toStrictEqual({
                  ...networkConfigurationToUpdate,
                  rpcEndpoints: [rpcEndpoint3, rpcEndpoint1, rpcEndpoint2],
                });
              },
            );
          });
        });

        describe('when the networkClientId of some custom RPC endpoints are being cleared', () => {
          it('does not touch the network client registry', async () => {
            const [rpcEndpoint1, rpcEndpoint2] = [
              buildCustomRpcEndpoint({
                name: 'Endpoint 1',
                networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                url: 'https://rpc.endpoint/1',
              }),
              buildCustomRpcEndpoint({
                name: 'Endpoint 2',
                networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                url: 'https://rpc.endpoint/2',
              }),
            ];
            const networkConfigurationToUpdate =
              buildInfuraNetworkConfiguration(infuraNetworkType, {
                rpcEndpoints: [rpcEndpoint1, rpcEndpoint2],
              });

            await withController(
              {
                state: {
                  networkConfigurationsByChainId: {
                    [infuraChainId]: networkConfigurationToUpdate,
                    '0x9999': buildCustomNetworkConfiguration({
                      chainId: '0x9999',
                      nativeCurrency: 'TEST-9999',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                          url: 'https://selected.endpoint',
                        }),
                      ],
                    }),
                  },
                  selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                },
              },
              async ({ controller }) => {
                mockCreateNetworkClient().mockReturnValue(buildFakeClient());
                const networkClientRegistry =
                  controller.getNetworkClientRegistry();

                await controller.updateNetwork(infuraChainId, {
                  ...networkConfigurationToUpdate,
                  rpcEndpoints: [
                    rpcEndpoint1,
                    { ...rpcEndpoint2, networkClientId: undefined },
                  ],
                });

                expect(controller.getNetworkClientRegistry()).toStrictEqual(
                  networkClientRegistry,
                );
              },
            );
          });

          it('does not touch the network configuration in state, as if the network client IDs had not been cleared', async () => {
            const [rpcEndpoint1, rpcEndpoint2] = [
              buildCustomRpcEndpoint({
                name: 'Endpoint 1',
                networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                url: 'https://rpc.endpoint/1',
              }),
              buildCustomRpcEndpoint({
                name: 'Endpoint 2',
                networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                url: 'https://rpc.endpoint/2',
              }),
            ];
            const networkConfigurationToUpdate =
              buildInfuraNetworkConfiguration(infuraNetworkType, {
                rpcEndpoints: [rpcEndpoint1, rpcEndpoint2],
              });

            await withController(
              {
                state: {
                  networkConfigurationsByChainId: {
                    [infuraChainId]: networkConfigurationToUpdate,
                    '0x9999': buildCustomNetworkConfiguration({
                      chainId: '0x9999',
                      nativeCurrency: 'TEST-9999',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                          url: 'https://selected.endpoint',
                        }),
                      ],
                    }),
                  },
                  selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                },
              },
              async ({ controller }) => {
                const previousNetworkConfigurationsByChainId =
                  controller.state.networkConfigurationsByChainId;

                await controller.updateNetwork(infuraChainId, {
                  ...networkConfigurationToUpdate,
                  rpcEndpoints: [
                    rpcEndpoint1,
                    { ...rpcEndpoint2, networkClientId: undefined },
                  ],
                });

                expect(
                  controller.state.networkConfigurationsByChainId,
                ).toStrictEqual(previousNetworkConfigurationsByChainId);
              },
            );
          });

          it('returns the network configuration, untouched', async () => {
            const [rpcEndpoint1, rpcEndpoint2] = [
              buildCustomRpcEndpoint({
                name: 'Endpoint 1',
                networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                url: 'https://rpc.endpoint/1',
              }),
              buildCustomRpcEndpoint({
                name: 'Endpoint 2',
                networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                url: 'https://rpc.endpoint/2',
              }),
            ];
            const networkConfigurationToUpdate =
              buildInfuraNetworkConfiguration(infuraNetworkType, {
                rpcEndpoints: [rpcEndpoint1, rpcEndpoint2],
              });

            await withController(
              {
                state: {
                  networkConfigurationsByChainId: {
                    [infuraChainId]: networkConfigurationToUpdate,
                    '0x9999': buildCustomNetworkConfiguration({
                      chainId: '0x9999',
                      nativeCurrency: 'TEST-9999',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                          url: 'https://selected.endpoint',
                        }),
                      ],
                    }),
                  },
                  selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                },
              },
              async ({ controller }) => {
                const updatedNetworkConfiguration =
                  await controller.updateNetwork(infuraChainId, {
                    ...networkConfigurationToUpdate,
                    rpcEndpoints: [
                      rpcEndpoint1,
                      { ...rpcEndpoint2, networkClientId: undefined },
                    ],
                  });

                expect(updatedNetworkConfiguration).toStrictEqual(
                  networkConfigurationToUpdate,
                );
              },
            );
          });
        });

        describe('when no RPC endpoints are being changed', () => {
          it('does not touch the network client registry', async () => {
            const networkConfigurationToUpdate =
              buildInfuraNetworkConfiguration(infuraNetworkType, {
                name: 'Some Name',
                rpcEndpoints: [buildInfuraRpcEndpoint(infuraNetworkType)],
              });

            await withController(
              {
                state: {
                  networkConfigurationsByChainId: {
                    [infuraChainId]: networkConfigurationToUpdate,
                    '0x9999': buildCustomNetworkConfiguration({
                      chainId: '0x9999',
                      nativeCurrency: 'TEST-9999',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                          url: 'https://selected.endpoint',
                        }),
                      ],
                    }),
                  },
                  selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                },
              },
              async ({ controller }) => {
                mockCreateNetworkClient().mockReturnValue(buildFakeClient());
                const networkClientRegistry =
                  controller.getNetworkClientRegistry();

                await controller.updateNetwork(infuraChainId, {
                  ...networkConfigurationToUpdate,
                  name: 'Some Other Name',
                });

                expect(controller.getNetworkClientRegistry()).toStrictEqual(
                  networkClientRegistry,
                );
              },
            );
          });
        });
      });
    }

    describe('if the existing chain ID is a non-Infura-supported chain and is not being changed', () => {
      it('throws (albeit for a different reason) if an Infura RPC endpoint is being added that represents a different chain than the one being updated', async () => {
        const defaultRpcEndpoint = buildInfuraRpcEndpoint(
          InfuraNetworkType.mainnet,
        );
        const networkConfigurationToUpdate = buildNetworkConfiguration({
          chainId: '0x1337',
        });

        await withController(
          {
            state: {
              networkConfigurationsByChainId: {
                '0x1337': networkConfigurationToUpdate,
                [ChainId.mainnet]: buildInfuraNetworkConfiguration(
                  InfuraNetworkType.mainnet,
                ),
              },
              selectedNetworkClientId: InfuraNetworkType.mainnet,
            },
          },
          async ({ controller }) => {
            await expect(
              controller.updateNetwork('0x1337', {
                ...networkConfigurationToUpdate,
                rpcEndpoints: [
                  ...networkConfigurationToUpdate.rpcEndpoints,
                  defaultRpcEndpoint,
                ],
              }),
            ).rejects.toThrow(
              "Could not update network to point to same RPC endpoint as existing network for chain 0x1 ('Mainnet')",
            );
          },
        );
      });

      describe('when new custom RPC endpoints are being added', () => {
        it('creates and registers new network clients for each RPC endpoint', async () => {
          uuidV4Mock
            .mockReturnValueOnce('BBBB-BBBB-BBBB-BBBB')
            .mockReturnValueOnce('CCCC-CCCC-CCCC-CCCC');
          const createAutoManagedNetworkClientSpy = jest.spyOn(
            createAutoManagedNetworkClientModule,
            'createAutoManagedNetworkClient',
          );
          const rpcEndpoint1 = buildCustomRpcEndpoint({
            name: 'Endpoint 1',
            networkClientId: 'AAAA-AAAA-AAAA-AAAA',
            url: 'https://rpc.endpoint/1',
          });
          const networkConfigurationToUpdate = buildNetworkConfiguration({
            chainId: '0x1337',
            nativeCurrency: 'TOKEN',
            rpcEndpoints: [rpcEndpoint1],
          });

          await withController(
            {
              state: {
                networkConfigurationsByChainId: {
                  '0x1337': networkConfigurationToUpdate,
                  '0x9999': buildCustomNetworkConfiguration({
                    chainId: '0x9999',
                    nativeCurrency: 'TEST-9999',
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                        url: 'https://selected.endpoint',
                      }),
                    ],
                  }),
                },
                selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
              },
            },
            async ({ controller }) => {
              await controller.updateNetwork('0x1337', {
                ...networkConfigurationToUpdate,
                defaultRpcEndpointIndex: 0,
                rpcEndpoints: [
                  rpcEndpoint1,
                  buildUpdateNetworkCustomRpcEndpointFields({
                    name: 'Endpoint 2',
                    url: 'https://rpc.endpoint/2',
                  }),
                  buildUpdateNetworkCustomRpcEndpointFields({
                    name: 'Endpoint 3',
                    url: 'https://rpc.endpoint/3',
                  }),
                ],
              });

              expect(createAutoManagedNetworkClientSpy).toHaveBeenCalledWith({
                chainId: '0x1337',
                rpcUrl: 'https://rpc.endpoint/2',
                ticker: 'TOKEN',
                type: NetworkClientType.Custom,
              });
              expect(createAutoManagedNetworkClientSpy).toHaveBeenCalledWith({
                chainId: '0x1337',
                rpcUrl: 'https://rpc.endpoint/3',
                ticker: 'TOKEN',
                type: NetworkClientType.Custom,
              });

              expect(
                getNetworkConfigurationsByNetworkClientId(
                  controller.getNetworkClientRegistry(),
                ),
              ).toMatchObject({
                'AAAA-AAAA-AAAA-AAAA': {
                  chainId: '0x1337',
                  rpcUrl: 'https://rpc.endpoint/1',
                  ticker: 'TOKEN',
                  type: NetworkClientType.Custom,
                },
                'BBBB-BBBB-BBBB-BBBB': {
                  chainId: '0x1337',
                  rpcUrl: 'https://rpc.endpoint/2',
                  ticker: 'TOKEN',
                  type: NetworkClientType.Custom,
                },
                'CCCC-CCCC-CCCC-CCCC': {
                  chainId: '0x1337',
                  rpcUrl: 'https://rpc.endpoint/3',
                  ticker: 'TOKEN',
                  type: NetworkClientType.Custom,
                },
              });
            },
          );
        });

        it('assigns the ID of the created network client to each RPC endpoint in state', async () => {
          uuidV4Mock
            .mockReturnValueOnce('BBBB-BBBB-BBBB-BBBB')
            .mockReturnValueOnce('CCCC-CCCC-CCCC-CCCC');
          const rpcEndpoint1 = buildCustomRpcEndpoint({
            name: 'Endpoint 1',
            networkClientId: 'AAAA-AAAA-AAAA-AAAA',
            url: 'https://rpc.endpoint/1',
          });
          const networkConfigurationToUpdate = buildNetworkConfiguration({
            chainId: '0x1337',
            rpcEndpoints: [rpcEndpoint1],
          });

          await withController(
            {
              state: {
                networkConfigurationsByChainId: {
                  '0x1337': networkConfigurationToUpdate,
                  '0x9999': buildCustomNetworkConfiguration({
                    chainId: '0x9999',
                    nativeCurrency: 'TEST-9999',
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                        url: 'https://selected.endpoint',
                      }),
                    ],
                  }),
                },
                selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
              },
            },
            async ({ controller }) => {
              await controller.updateNetwork('0x1337', {
                ...networkConfigurationToUpdate,
                defaultRpcEndpointIndex: 0,
                rpcEndpoints: [
                  rpcEndpoint1,
                  buildUpdateNetworkCustomRpcEndpointFields({
                    name: 'Endpoint 2',
                    url: 'https://rpc.endpoint/2',
                  }),
                  buildUpdateNetworkCustomRpcEndpointFields({
                    name: 'Endpoint 3',
                    url: 'https://rpc.endpoint/3',
                  }),
                ],
              });

              expect(
                controller.state.networkConfigurationsByChainId['0x1337'],
              ).toStrictEqual({
                ...networkConfigurationToUpdate,
                rpcEndpoints: [
                  rpcEndpoint1,
                  {
                    name: 'Endpoint 2',
                    networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                    type: RpcEndpointType.Custom,
                    url: 'https://rpc.endpoint/2',
                  },
                  {
                    name: 'Endpoint 3',
                    networkClientId: 'CCCC-CCCC-CCCC-CCCC',
                    type: RpcEndpointType.Custom,
                    url: 'https://rpc.endpoint/3',
                  },
                ],
              });
            },
          );
        });

        it('returns the updated network configuration', async () => {
          uuidV4Mock
            .mockReturnValueOnce('BBBB-BBBB-BBBB-BBBB')
            .mockReturnValueOnce('CCCC-CCCC-CCCC-CCCC');
          const rpcEndpoint1 = buildCustomRpcEndpoint({
            name: 'Endpoint 1',
            networkClientId: 'AAAA-AAAA-AAAA-AAAA',
            url: 'https://rpc.endpoint/1',
          });
          const networkConfigurationToUpdate = buildNetworkConfiguration({
            chainId: '0x1337',
            rpcEndpoints: [rpcEndpoint1],
          });

          await withController(
            {
              state: {
                networkConfigurationsByChainId: {
                  '0x1337': networkConfigurationToUpdate,
                  '0x9999': buildCustomNetworkConfiguration({
                    chainId: '0x9999',
                    nativeCurrency: 'TEST-9999',
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                        url: 'https://selected.endpoint',
                      }),
                    ],
                  }),
                },
                selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
              },
            },
            async ({ controller }) => {
              const updatedNetworkConfiguration =
                await controller.updateNetwork('0x1337', {
                  ...networkConfigurationToUpdate,
                  defaultRpcEndpointIndex: 0,
                  rpcEndpoints: [
                    rpcEndpoint1,
                    buildUpdateNetworkCustomRpcEndpointFields({
                      name: 'Endpoint 2',
                      url: 'https://rpc.endpoint/2',
                    }),
                    buildUpdateNetworkCustomRpcEndpointFields({
                      name: 'Endpoint 3',
                      url: 'https://rpc.endpoint/3',
                    }),
                  ],
                });

              expect(updatedNetworkConfiguration).toStrictEqual({
                ...networkConfigurationToUpdate,
                rpcEndpoints: [
                  rpcEndpoint1,
                  {
                    name: 'Endpoint 2',
                    networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                    type: RpcEndpointType.Custom,
                    url: 'https://rpc.endpoint/2',
                  },
                  {
                    name: 'Endpoint 3',
                    networkClientId: 'CCCC-CCCC-CCCC-CCCC',
                    type: RpcEndpointType.Custom,
                    url: 'https://rpc.endpoint/3',
                  },
                ],
              });
            },
          );
        });
      });

      describe('when some custom RPC endpoints are being removed', () => {
        it('destroys and unregisters existing network clients for the RPC endpoints', async () => {
          const [rpcEndpoint1, rpcEndpoint2] = [
            buildCustomRpcEndpoint({
              name: 'Endpoint 1',
              networkClientId: 'AAAA-AAAA-AAAA-AAAA',
              url: 'https://rpc.endpoint/1',
            }),
            buildCustomRpcEndpoint({
              name: 'Endpoint 2',
              networkClientId: 'BBBB-BBBB-BBBB-BBBB',
              url: 'https://rpc.endpoint/2',
            }),
          ];
          const networkConfigurationToUpdate = buildNetworkConfiguration({
            chainId: '0x1337',
            rpcEndpoints: [rpcEndpoint1, rpcEndpoint2],
          });

          await withController(
            {
              state: {
                selectedNetworkClientId: 'BBBB-BBBB-BBBB-BBBB',
                networkConfigurationsByChainId: {
                  '0x1337': networkConfigurationToUpdate,
                },
              },
            },
            async ({ controller }) => {
              const existingNetworkClient = controller.getNetworkClientById(
                'AAAA-AAAA-AAAA-AAAA',
              );
              const destroySpy = jest.spyOn(existingNetworkClient, 'destroy');

              await controller.updateNetwork('0x1337', {
                ...networkConfigurationToUpdate,
                defaultRpcEndpointIndex: 0,
                rpcEndpoints: [rpcEndpoint2],
              });

              expect(destroySpy).toHaveBeenCalled();
              const networkClientRegistry =
                controller.getNetworkClientRegistry();
              expect(networkClientRegistry).not.toHaveProperty(
                'AAAA-AAAA-AAAA-AAAA',
              );
            },
          );
        });

        it('updates the network configuration in state', async () => {
          const [rpcEndpoint1, rpcEndpoint2] = [
            buildCustomRpcEndpoint({
              name: 'Endpoint 1',
              networkClientId: 'AAAA-AAAA-AAAA-AAAA',
              url: 'https://rpc.endpoint/1',
            }),
            buildCustomRpcEndpoint({
              name: 'Endpoint 2',
              networkClientId: 'BBBB-BBBB-BBBB-BBBB',
              url: 'https://rpc.endpoint/2',
            }),
          ];
          const networkConfigurationToUpdate = buildNetworkConfiguration({
            chainId: '0x1337',
            rpcEndpoints: [rpcEndpoint1, rpcEndpoint2],
          });

          await withController(
            {
              state: {
                selectedNetworkClientId: 'BBBB-BBBB-BBBB-BBBB',
                networkConfigurationsByChainId: {
                  '0x1337': networkConfigurationToUpdate,
                },
              },
            },
            async ({ controller }) => {
              await controller.updateNetwork('0x1337', {
                ...networkConfigurationToUpdate,
                defaultRpcEndpointIndex: 0,
                rpcEndpoints: [rpcEndpoint2],
              });

              expect(
                controller.state.networkConfigurationsByChainId['0x1337'],
              ).toStrictEqual({
                ...networkConfigurationToUpdate,
                defaultRpcEndpointIndex: 0,
                rpcEndpoints: [rpcEndpoint2],
              });
            },
          );
        });

        it('returns the updated network configuration', async () => {
          const [rpcEndpoint1, rpcEndpoint2] = [
            buildCustomRpcEndpoint({
              name: 'Endpoint 1',
              networkClientId: 'AAAA-AAAA-AAAA-AAAA',
              url: 'https://rpc.endpoint/1',
            }),
            buildCustomRpcEndpoint({
              name: 'Endpoint 2',
              networkClientId: 'BBBB-BBBB-BBBB-BBBB',
              url: 'https://rpc.endpoint/2',
            }),
          ];
          const networkConfigurationToUpdate = buildNetworkConfiguration({
            chainId: '0x1337',
            rpcEndpoints: [rpcEndpoint1, rpcEndpoint2],
          });

          await withController(
            {
              state: {
                selectedNetworkClientId: 'BBBB-BBBB-BBBB-BBBB',
                networkConfigurationsByChainId: {
                  '0x1337': networkConfigurationToUpdate,
                },
              },
            },
            async ({ controller }) => {
              const updatedNetworkConfiguration =
                await controller.updateNetwork('0x1337', {
                  ...networkConfigurationToUpdate,
                  defaultRpcEndpointIndex: 0,
                  rpcEndpoints: [rpcEndpoint2],
                });

              expect(updatedNetworkConfiguration).toStrictEqual({
                ...networkConfigurationToUpdate,
                defaultRpcEndpointIndex: 0,
                rpcEndpoints: [rpcEndpoint2],
              });
            },
          );
        });

        describe('when one is represented by the selected network client (and a replacement is specified)', () => {
          describe('if the replacement RPC endpoint already exists', () => {
            it('selects the network client that represents the replacement RPC endpoint', async () => {
              const networkConfigurationToUpdate =
                buildCustomNetworkConfiguration({
                  chainId: '0x1337',
                  nativeCurrency: 'TOKEN',
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      url: 'https://test.network/1',
                    }),
                    buildCustomRpcEndpoint({
                      networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                      url: 'https://test.network/2',
                    }),
                  ],
                });

              await withController(
                {
                  state: {
                    selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
                    networkConfigurationsByChainId: {
                      '0x1337': networkConfigurationToUpdate,
                    },
                  },
                },
                async ({ controller }) => {
                  const fakeProviders = [
                    buildFakeProvider([
                      {
                        request: {
                          method: 'test',
                        },
                        response: {
                          result: 'test response from 1',
                        },
                      },
                    ]),
                    buildFakeProvider([
                      {
                        request: {
                          method: 'test',
                        },
                        response: {
                          result: 'test response from 2',
                        },
                      },
                    ]),
                  ];
                  const fakeNetworkClients = [
                    buildFakeClient(fakeProviders[0]),
                    buildFakeClient(fakeProviders[1]),
                  ];
                  mockCreateNetworkClient()
                    .calledWith({
                      chainId: '0x1337',
                      rpcUrl: 'https://test.network/1',
                      ticker: 'TOKEN',
                      type: NetworkClientType.Custom,
                    })
                    .mockReturnValue(fakeNetworkClients[0])
                    .calledWith({
                      chainId: '0x1337',
                      rpcUrl: 'https://test.network/2',
                      ticker: 'TOKEN',
                      type: NetworkClientType.Custom,
                    })
                    .mockReturnValue(fakeNetworkClients[1]);
                  await controller.initializeProvider();
                  expect(controller.state.selectedNetworkClientId).toBe(
                    'AAAA-AAAA-AAAA-AAAA',
                  );
                  const networkClient1 = controller.getSelectedNetworkClient();
                  assert(networkClient1, 'Network client is somehow unset');
                  const result1 = await networkClient1.provider.request({
                    method: 'test',
                  });
                  expect(result1).toBe('test response from 1');

                  await controller.updateNetwork(
                    '0x1337',
                    {
                      ...networkConfigurationToUpdate,
                      rpcEndpoints: [
                        networkConfigurationToUpdate.rpcEndpoints[1],
                      ],
                    },
                    {
                      replacementSelectedRpcEndpointIndex: 0,
                    },
                  );
                  expect(controller.state.selectedNetworkClientId).toBe(
                    'BBBB-BBBB-BBBB-BBBB',
                  );
                  const networkClient2 = controller.getSelectedNetworkClient();
                  assert(networkClient2, 'Network client is somehow unset');
                  const result2 = await networkClient2.provider.request({
                    method: 'test',
                  });
                  expect(result2).toBe('test response from 2');
                },
              );
            });

            it('updates selectedNetworkClientId and networkConfigurationsByChainId at the same time', async () => {
              const networkConfigurationToUpdate =
                buildCustomNetworkConfiguration({
                  chainId: '0x1337',
                  nativeCurrency: 'TOKEN',
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      url: 'https://test.network/1',
                    }),
                    buildCustomRpcEndpoint({
                      networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                      url: 'https://test.network/2',
                    }),
                  ],
                });

              await withController(
                {
                  state: {
                    selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
                    networkConfigurationsByChainId: {
                      '0x1337': networkConfigurationToUpdate,
                    },
                  },
                },
                async ({ controller, messenger }) => {
                  const fakeProviders = [
                    buildFakeProvider([
                      {
                        request: {
                          method: 'test',
                        },
                        response: {
                          result: 'test response from 1',
                        },
                      },
                    ]),
                    buildFakeProvider([
                      {
                        request: {
                          method: 'test',
                        },
                        response: {
                          result: 'test response from 2',
                        },
                      },
                    ]),
                  ];
                  const fakeNetworkClients = [
                    buildFakeClient(fakeProviders[0]),
                    buildFakeClient(fakeProviders[1]),
                  ];
                  mockCreateNetworkClient()
                    .calledWith({
                      chainId: '0x1337',
                      rpcUrl: 'https://test.network/1',
                      ticker: 'TOKEN',
                      type: NetworkClientType.Custom,
                    })
                    .mockReturnValue(fakeNetworkClients[0])
                    .calledWith({
                      chainId: '0x1337',
                      rpcUrl: 'https://test.network/2',
                      ticker: 'TOKEN',
                      type: NetworkClientType.Custom,
                    })
                    .mockReturnValue(fakeNetworkClients[1]);
                  await controller.initializeProvider();

                  const promiseForStateChanges = waitForStateChanges({
                    messenger,
                    count: 1,
                  });

                  await controller.updateNetwork(
                    '0x1337',
                    {
                      ...networkConfigurationToUpdate,
                      rpcEndpoints: [
                        networkConfigurationToUpdate.rpcEndpoints[1],
                      ],
                    },
                    {
                      replacementSelectedRpcEndpointIndex: 0,
                    },
                  );
                  const stateChanges = await promiseForStateChanges;
                  expect(stateChanges).toStrictEqual([
                    [
                      expect.any(Object),
                      expect.arrayContaining([
                        expect.objectContaining({
                          op: 'replace',
                          path: ['selectedNetworkClientId'],
                          value: 'BBBB-BBBB-BBBB-BBBB',
                        }),
                        expect.objectContaining({
                          op: 'replace',
                          path: ['networkConfigurationsByChainId', '0x1337'],
                        }),
                      ]),
                    ],
                  ]);
                },
              );
            });
          });

          describe('if the replacement RPC endpoint is being added', () => {
            it('selects the network client that represents the replacement RPC endpoint', async () => {
              uuidV4Mock.mockReturnValueOnce('CCCC-CCCC-CCCC-CCCC');
              const networkConfigurationToUpdate =
                buildCustomNetworkConfiguration({
                  chainId: '0x1337',
                  nativeCurrency: 'TOKEN',
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      url: 'https://test.network/1',
                    }),
                    buildCustomRpcEndpoint({
                      networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                      url: 'https://test.network/2',
                    }),
                  ],
                });

              await withController(
                {
                  state: {
                    selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
                    networkConfigurationsByChainId: {
                      '0x1337': networkConfigurationToUpdate,
                    },
                  },
                },
                async ({ controller }) => {
                  const fakeProviders = [
                    buildFakeProvider([
                      {
                        request: {
                          method: 'test',
                        },
                        response: {
                          result: 'test response from 1',
                        },
                      },
                    ]),
                    buildFakeProvider([
                      {
                        request: {
                          method: 'test',
                        },
                        response: {
                          result: 'test response from 2',
                        },
                      },
                    ]),
                    buildFakeProvider([
                      {
                        request: {
                          method: 'test',
                        },
                        response: {
                          result: 'test response from 3',
                        },
                      },
                    ]),
                  ];
                  const fakeNetworkClients = [
                    buildFakeClient(fakeProviders[0]),
                    buildFakeClient(fakeProviders[1]),
                    buildFakeClient(fakeProviders[2]),
                  ];
                  mockCreateNetworkClient()
                    .calledWith({
                      chainId: '0x1337',
                      rpcUrl: 'https://test.network/1',
                      ticker: 'TOKEN',
                      type: NetworkClientType.Custom,
                    })
                    .mockReturnValue(fakeNetworkClients[0])
                    .calledWith({
                      chainId: '0x1337',
                      rpcUrl: 'https://test.network/2',
                      ticker: 'TOKEN',
                      type: NetworkClientType.Custom,
                    })
                    .mockReturnValue(fakeNetworkClients[1])
                    .calledWith({
                      chainId: '0x1337',
                      rpcUrl: 'https://test.network/3',
                      ticker: 'TOKEN',
                      type: NetworkClientType.Custom,
                    })
                    .mockReturnValue(fakeNetworkClients[2]);
                  await controller.initializeProvider();
                  expect(controller.state.selectedNetworkClientId).toBe(
                    'AAAA-AAAA-AAAA-AAAA',
                  );
                  const networkClient1 = controller.getSelectedNetworkClient();
                  assert(networkClient1, 'Network client is somehow unset');
                  const result1 = await networkClient1.provider.request({
                    method: 'test',
                  });
                  expect(result1).toBe('test response from 1');

                  await controller.updateNetwork(
                    '0x1337',
                    {
                      ...networkConfigurationToUpdate,
                      rpcEndpoints: [
                        buildUpdateNetworkCustomRpcEndpointFields({
                          url: 'https://test.network/3',
                        }),
                        networkConfigurationToUpdate.rpcEndpoints[1],
                      ],
                    },
                    {
                      replacementSelectedRpcEndpointIndex: 0,
                    },
                  );
                  expect(controller.state.selectedNetworkClientId).toBe(
                    'CCCC-CCCC-CCCC-CCCC',
                  );
                  const networkClient2 = controller.getSelectedNetworkClient();
                  assert(networkClient2, 'Network client is somehow unset');
                  const result2 = await networkClient2.provider.request({
                    method: 'test',
                  });
                  expect(result2).toBe('test response from 3');
                },
              );
            });

            it('updates selectedNetworkClientId and networkConfigurationsByChainId at the same time', async () => {
              uuidV4Mock.mockReturnValueOnce('CCCC-CCCC-CCCC-CCCC');
              const networkConfigurationToUpdate =
                buildCustomNetworkConfiguration({
                  chainId: '0x1337',
                  nativeCurrency: 'TOKEN',
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      url: 'https://test.network/1',
                    }),
                    buildCustomRpcEndpoint({
                      networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                      url: 'https://test.network/2',
                    }),
                  ],
                });

              await withController(
                {
                  state: {
                    selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
                    networkConfigurationsByChainId: {
                      '0x1337': networkConfigurationToUpdate,
                    },
                  },
                },
                async ({ controller, messenger }) => {
                  const fakeProviders = [
                    buildFakeProvider([
                      {
                        request: {
                          method: 'test',
                        },
                        response: {
                          result: 'test response from 1',
                        },
                      },
                    ]),
                    buildFakeProvider([
                      {
                        request: {
                          method: 'test',
                        },
                        response: {
                          result: 'test response from 2',
                        },
                      },
                    ]),
                    buildFakeProvider([
                      {
                        request: {
                          method: 'test',
                        },
                        response: {
                          result: 'test response from 3',
                        },
                      },
                    ]),
                  ];
                  const fakeNetworkClients = [
                    buildFakeClient(fakeProviders[0]),
                    buildFakeClient(fakeProviders[1]),
                    buildFakeClient(fakeProviders[2]),
                  ];
                  mockCreateNetworkClient()
                    .calledWith({
                      chainId: '0x1337',
                      rpcUrl: 'https://test.network/1',
                      ticker: 'TOKEN',
                      type: NetworkClientType.Custom,
                    })
                    .mockReturnValue(fakeNetworkClients[0])
                    .calledWith({
                      chainId: '0x1337',
                      rpcUrl: 'https://test.network/2',
                      ticker: 'TOKEN',
                      type: NetworkClientType.Custom,
                    })
                    .mockReturnValue(fakeNetworkClients[1])
                    .calledWith({
                      chainId: '0x1337',
                      rpcUrl: 'https://test.network/3',
                      ticker: 'TOKEN',
                      type: NetworkClientType.Custom,
                    })
                    .mockReturnValue(fakeNetworkClients[2]);
                  await controller.initializeProvider();

                  const promiseForStateChanges = waitForStateChanges({
                    messenger,
                    count: 1,
                  });

                  await controller.updateNetwork(
                    '0x1337',
                    {
                      ...networkConfigurationToUpdate,
                      rpcEndpoints: [
                        buildUpdateNetworkCustomRpcEndpointFields({
                          url: 'https://test.network/3',
                        }),
                        networkConfigurationToUpdate.rpcEndpoints[1],
                      ],
                    },
                    {
                      replacementSelectedRpcEndpointIndex: 0,
                    },
                  );
                  const stateChanges = await promiseForStateChanges;
                  expect(stateChanges).toStrictEqual([
                    [
                      expect.any(Object),
                      expect.arrayContaining([
                        expect.objectContaining({
                          op: 'replace',
                          path: ['selectedNetworkClientId'],
                          value: 'CCCC-CCCC-CCCC-CCCC',
                        }),
                        expect.objectContaining({
                          op: 'replace',
                          path: ['networkConfigurationsByChainId', '0x1337'],
                        }),
                      ]),
                    ],
                  ]);
                },
              );
            });
          });
        });
      });

      describe('when the URL of an RPC endpoint is changed (using networkClientId as identification)', () => {
        it('destroys and unregisters the network client for the previous version of the RPC endpoint', async () => {
          uuidV4Mock.mockReturnValueOnce('BBBB-BBBB-BBBB-BBBB');
          const networkConfigurationToUpdate = buildCustomNetworkConfiguration({
            nativeCurrency: 'TOKEN',
            rpcEndpoints: [
              buildCustomRpcEndpoint({
                name: 'Endpoint 1',
                networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                url: 'https://rpc.endpoint',
              }),
            ],
          });

          await withController(
            {
              state: {
                networkConfigurationsByChainId: {
                  '0x1337': networkConfigurationToUpdate,
                  '0x9999': buildCustomNetworkConfiguration({
                    chainId: '0x9999',
                    nativeCurrency: 'TEST-9999',
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                        url: 'https://selected.endpoint',
                      }),
                    ],
                  }),
                },
                selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
              },
            },
            async ({ controller }) => {
              mockCreateNetworkClient()
                .calledWith({
                  chainId: '0x1337',
                  rpcUrl: 'https://some.other.url',
                  ticker: 'TOKEN',
                  type: NetworkClientType.Custom,
                })
                .mockReturnValue(buildFakeClient());
              const existingNetworkClient = controller.getNetworkClientById(
                'AAAA-AAAA-AAAA-AAAA',
              );
              const destroySpy = jest.spyOn(existingNetworkClient, 'destroy');

              await controller.updateNetwork('0x1337', {
                ...networkConfigurationToUpdate,
                rpcEndpoints: [
                  buildCustomRpcEndpoint({
                    name: 'Endpoint 1',
                    networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                    url: 'https://some.other.url',
                  }),
                ],
              });

              expect(destroySpy).toHaveBeenCalled();
              const networkClientRegistry =
                controller.getNetworkClientRegistry();
              expect(networkClientRegistry).not.toHaveProperty(
                'AAAA-AAAA-AAAA-AAAA',
              );
            },
          );
        });

        it('creates and registers a network client for the new version of the RPC endpoint', async () => {
          uuidV4Mock.mockReturnValueOnce('BBBB-BBBB-BBBB-BBBB');
          const createAutoManagedNetworkClientSpy = jest.spyOn(
            createAutoManagedNetworkClientModule,
            'createAutoManagedNetworkClient',
          );
          const networkConfigurationToUpdate = buildCustomNetworkConfiguration({
            nativeCurrency: 'TOKEN',
            rpcEndpoints: [
              buildCustomRpcEndpoint({
                name: 'Endpoint 1',
                networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                url: 'https://rpc.endpoint',
              }),
            ],
          });

          await withController(
            {
              state: {
                networkConfigurationsByChainId: {
                  '0x1337': networkConfigurationToUpdate,
                  '0x9999': buildCustomNetworkConfiguration({
                    chainId: '0x9999',
                    nativeCurrency: 'TEST-9999',
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                        url: 'https://selected.endpoint',
                      }),
                    ],
                  }),
                },
                selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
              },
            },
            async ({ controller }) => {
              mockCreateNetworkClient()
                .calledWith({
                  chainId: '0x1337',
                  rpcUrl: 'https://some.other.url',
                  ticker: 'TOKEN',
                  type: NetworkClientType.Custom,
                })
                .mockReturnValue(buildFakeClient());

              await controller.updateNetwork('0x1337', {
                ...networkConfigurationToUpdate,
                rpcEndpoints: [
                  buildCustomRpcEndpoint({
                    name: 'Endpoint 1',
                    networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                    url: 'https://some.other.url',
                  }),
                ],
              });

              expect(createAutoManagedNetworkClientSpy).toHaveBeenCalledWith({
                chainId: '0x1337',
                rpcUrl: 'https://some.other.url',
                ticker: 'TOKEN',
                type: NetworkClientType.Custom,
              });
              expect(
                getNetworkConfigurationsByNetworkClientId(
                  controller.getNetworkClientRegistry(),
                ),
              ).toMatchObject({
                'BBBB-BBBB-BBBB-BBBB': {
                  chainId: '0x1337',
                  rpcUrl: 'https://some.other.url',
                  ticker: 'TOKEN',
                  type: NetworkClientType.Custom,
                },
              });
            },
          );
        });

        it('updates the network configuration in state with a new network client ID for the RPC endpoint', async () => {
          uuidV4Mock.mockReturnValueOnce('BBBB-BBBB-BBBB-BBBB');
          const networkConfigurationToUpdate = buildCustomNetworkConfiguration({
            nativeCurrency: 'TOKEN',
            rpcEndpoints: [
              buildCustomRpcEndpoint({
                name: 'Endpoint 1',
                networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                url: 'https://rpc.endpoint',
              }),
            ],
          });

          await withController(
            {
              state: {
                networkConfigurationsByChainId: {
                  '0x1337': networkConfigurationToUpdate,
                  '0x9999': buildCustomNetworkConfiguration({
                    chainId: '0x9999',
                    nativeCurrency: 'TEST-9999',
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                        url: 'https://selected.endpoint',
                      }),
                    ],
                  }),
                },
                selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
              },
            },
            async ({ controller }) => {
              mockCreateNetworkClient()
                .calledWith({
                  chainId: '0x1337',
                  rpcUrl: 'https://some.other.url',
                  ticker: 'TOKEN',
                  type: NetworkClientType.Custom,
                })
                .mockReturnValue(buildFakeClient());

              await controller.updateNetwork('0x1337', {
                ...networkConfigurationToUpdate,
                rpcEndpoints: [
                  buildCustomRpcEndpoint({
                    name: 'Endpoint 1',
                    networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                    url: 'https://some.other.url',
                  }),
                ],
              });

              expect(
                controller.state.networkConfigurationsByChainId['0x1337'],
              ).toStrictEqual({
                ...networkConfigurationToUpdate,
                rpcEndpoints: [
                  {
                    name: 'Endpoint 1',
                    networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                    type: 'custom',
                    url: 'https://some.other.url',
                  },
                ],
              });
            },
          );
        });

        it('returns the updated network configuration', async () => {
          uuidV4Mock.mockReturnValueOnce('BBBB-BBBB-BBBB-BBBB');
          const networkConfigurationToUpdate = buildCustomNetworkConfiguration({
            nativeCurrency: 'TOKEN',
            rpcEndpoints: [
              buildCustomRpcEndpoint({
                name: 'Endpoint 1',
                networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                url: 'https://rpc.endpoint',
              }),
            ],
          });

          await withController(
            {
              state: {
                networkConfigurationsByChainId: {
                  '0x1337': networkConfigurationToUpdate,
                  '0x9999': buildCustomNetworkConfiguration({
                    chainId: '0x9999',
                    nativeCurrency: 'TEST-9999',
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                        url: 'https://selected.endpoint',
                      }),
                    ],
                  }),
                },
                selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
              },
            },
            async ({ controller }) => {
              mockCreateNetworkClient()
                .calledWith({
                  chainId: '0x1337',
                  rpcUrl: 'https://some.other.url',
                  ticker: 'TOKEN',
                  type: NetworkClientType.Custom,
                })
                .mockReturnValue(buildFakeClient());

              const updatedNetworkConfiguration =
                await controller.updateNetwork('0x1337', {
                  ...networkConfigurationToUpdate,
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      name: 'Endpoint 1',
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      url: 'https://some.other.url',
                    }),
                  ],
                });

              expect(updatedNetworkConfiguration).toStrictEqual({
                ...networkConfigurationToUpdate,
                rpcEndpoints: [
                  {
                    name: 'Endpoint 1',
                    networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                    type: 'custom',
                    url: 'https://some.other.url',
                  },
                ],
              });
            },
          );
        });

        describe('if the previous version of the RPC endpoint was represented by the selected network client', () => {
          it('invisibly selects the network client for the new RPC endpoint', async () => {
            uuidV4Mock.mockReturnValueOnce('BBBB-BBBB-BBBB-BBBB');
            const networkConfigurationToUpdate =
              buildCustomNetworkConfiguration({
                nativeCurrency: 'TOKEN',
                rpcEndpoints: [
                  buildCustomRpcEndpoint({
                    name: 'Endpoint 1',
                    networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                    url: 'https://rpc.endpoint',
                  }),
                ],
              });

            await withController(
              {
                state: {
                  selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
                  networkConfigurationsByChainId: {
                    '0x1337': networkConfigurationToUpdate,
                  },
                },
              },
              async ({ controller }) => {
                const fakeProviders = [
                  buildFakeProvider([
                    {
                      request: {
                        method: 'test',
                      },
                      response: {
                        result: 'test response from 1',
                      },
                    },
                  ]),
                  buildFakeProvider([
                    {
                      request: {
                        method: 'test',
                      },
                      response: {
                        result: 'test response from 2',
                      },
                    },
                  ]),
                ];
                const fakeNetworkClients = [
                  buildFakeClient(fakeProviders[0]),
                  buildFakeClient(fakeProviders[1]),
                ];
                mockCreateNetworkClient()
                  .calledWith({
                    chainId: '0x1337',
                    rpcUrl: 'https://rpc.endpoint',
                    ticker: 'TOKEN',
                    type: NetworkClientType.Custom,
                  })
                  .mockReturnValue(fakeNetworkClients[0])
                  .calledWith({
                    chainId: '0x1337',
                    rpcUrl: 'https://some.other.url',
                    ticker: 'TOKEN',
                    type: NetworkClientType.Custom,
                  })
                  .mockReturnValue(fakeNetworkClients[1]);
                await controller.initializeProvider();
                expect(controller.state.selectedNetworkClientId).toBe(
                  'AAAA-AAAA-AAAA-AAAA',
                );
                const networkClient1 = controller.getSelectedNetworkClient();
                assert(networkClient1, 'Network client is somehow unset');
                const result1 = await networkClient1.provider.request({
                  method: 'test',
                });
                expect(result1).toBe('test response from 1');

                await controller.updateNetwork('0x1337', {
                  ...networkConfigurationToUpdate,
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      name: 'Endpoint 1',
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      url: 'https://some.other.url',
                    }),
                  ],
                });

                expect(controller.state.selectedNetworkClientId).toBe(
                  'BBBB-BBBB-BBBB-BBBB',
                );
                const networkClient2 = controller.getSelectedNetworkClient();
                assert(networkClient2, 'Network client is somehow unset');
                const result2 = await networkClient1.provider.request({
                  method: 'test',
                });
                expect(result2).toBe('test response from 2');
              },
            );
          });

          it('updates selectedNetworkClientId and networkConfigurationsByChainId at the same time', async () => {
            uuidV4Mock.mockReturnValueOnce('BBBB-BBBB-BBBB-BBBB');
            const networkConfigurationToUpdate =
              buildCustomNetworkConfiguration({
                nativeCurrency: 'TOKEN',
                rpcEndpoints: [
                  buildCustomRpcEndpoint({
                    name: 'Endpoint 1',
                    networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                    url: 'https://rpc.endpoint',
                  }),
                ],
              });

            await withController(
              {
                state: {
                  selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
                  networkConfigurationsByChainId: {
                    '0x1337': networkConfigurationToUpdate,
                  },
                },
              },
              async ({ controller, messenger }) => {
                const fakeProviders = [
                  buildFakeProvider([
                    {
                      request: {
                        method: 'test',
                      },
                      response: {
                        result: 'test response from 1',
                      },
                    },
                  ]),
                  buildFakeProvider([
                    {
                      request: {
                        method: 'test',
                      },
                      response: {
                        result: 'test response from 2',
                      },
                    },
                  ]),
                ];
                const fakeNetworkClients = [
                  buildFakeClient(fakeProviders[0]),
                  buildFakeClient(fakeProviders[1]),
                ];
                mockCreateNetworkClient()
                  .calledWith({
                    chainId: '0x1337',
                    rpcUrl: 'https://rpc.endpoint',
                    ticker: 'TOKEN',
                    type: NetworkClientType.Custom,
                  })
                  .mockReturnValue(fakeNetworkClients[0])
                  .calledWith({
                    chainId: '0x1337',
                    rpcUrl: 'https://some.other.url',
                    ticker: 'TOKEN',
                    type: NetworkClientType.Custom,
                  })
                  .mockReturnValue(fakeNetworkClients[1]);
                await controller.initializeProvider();

                const promiseForStateChanges = waitForStateChanges({
                  messenger,
                  count: 1,
                });

                await controller.updateNetwork('0x1337', {
                  ...networkConfigurationToUpdate,
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      name: 'Endpoint 1',
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      url: 'https://some.other.url',
                    }),
                  ],
                });
                const stateChanges = await promiseForStateChanges;
                expect(stateChanges).toStrictEqual([
                  [
                    expect.any(Object),
                    expect.arrayContaining([
                      expect.objectContaining({
                        op: 'replace',
                        path: ['selectedNetworkClientId'],
                        value: 'BBBB-BBBB-BBBB-BBBB',
                      }),
                      expect.objectContaining({
                        op: 'replace',
                        path: ['networkConfigurationsByChainId', '0x1337'],
                      }),
                    ]),
                  ],
                ]);
              },
            );
          });
        });
      });

      describe('when all of the RPC endpoints are simply being shuffled', () => {
        it('does not touch the network client registry', async () => {
          const [rpcEndpoint1, rpcEndpoint2, rpcEndpoint3] = [
            buildCustomRpcEndpoint({
              name: 'Endpoint 1',
              networkClientId: 'AAAA-AAAA-AAAA-AAAA',
              url: 'https://rpc.endpoint/1',
            }),
            buildCustomRpcEndpoint({
              name: 'Endpoint 2',
              networkClientId: 'BBBB-BBBB-BBBB-BBBB',
              url: 'https://rpc.endpoint/2',
            }),
            buildCustomRpcEndpoint({
              name: 'Endpoint 3',
              networkClientId: 'CCCC-CCCC-CCCC-CCCC',
              url: 'https://rpc.endpoint/3',
            }),
          ];
          const networkConfigurationToUpdate = buildCustomNetworkConfiguration({
            chainId: '0x1337',
            rpcEndpoints: [rpcEndpoint1, rpcEndpoint2, rpcEndpoint3],
          });

          await withController(
            {
              state: {
                networkConfigurationsByChainId: {
                  '0x1337': networkConfigurationToUpdate,
                  '0x9999': buildCustomNetworkConfiguration({
                    chainId: '0x9999',
                    nativeCurrency: 'TEST-9999',
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                        url: 'https://selected.endpoint',
                      }),
                    ],
                  }),
                },
                selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
              },
            },
            async ({ controller }) => {
              mockCreateNetworkClient().mockReturnValue(buildFakeClient());
              const networkClientRegistry =
                controller.getNetworkClientRegistry();

              await controller.updateNetwork('0x1337', {
                ...networkConfigurationToUpdate,
                rpcEndpoints: [rpcEndpoint3, rpcEndpoint1, rpcEndpoint2],
              });

              expect(controller.getNetworkClientRegistry()).toStrictEqual(
                networkClientRegistry,
              );
            },
          );
        });

        it('updates the network configuration in state with the new order of RPC endpoints', async () => {
          const [rpcEndpoint1, rpcEndpoint2, rpcEndpoint3] = [
            buildCustomRpcEndpoint({
              name: 'Endpoint 1',
              networkClientId: 'AAAA-AAAA-AAAA-AAAA',
              url: 'https://rpc.endpoint/1',
            }),
            buildCustomRpcEndpoint({
              name: 'Endpoint 2',
              networkClientId: 'BBBB-BBBB-BBBB-BBBB',
              url: 'https://rpc.endpoint/2',
            }),
            buildCustomRpcEndpoint({
              name: 'Endpoint 3',
              networkClientId: 'CCCC-CCCC-CCCC-CCCC',
              url: 'https://rpc.endpoint/3',
            }),
          ];
          const networkConfigurationToUpdate = buildCustomNetworkConfiguration({
            chainId: '0x1337',
            rpcEndpoints: [rpcEndpoint1, rpcEndpoint2, rpcEndpoint3],
          });

          await withController(
            {
              state: {
                networkConfigurationsByChainId: {
                  '0x1337': networkConfigurationToUpdate,
                  '0x9999': buildCustomNetworkConfiguration({
                    chainId: '0x9999',
                    nativeCurrency: 'TEST-9999',
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                        url: 'https://selected.endpoint',
                      }),
                    ],
                  }),
                },
                selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
              },
            },
            async ({ controller }) => {
              await controller.updateNetwork('0x1337', {
                ...networkConfigurationToUpdate,
                rpcEndpoints: [rpcEndpoint3, rpcEndpoint1, rpcEndpoint2],
              });

              expect(
                controller.state.networkConfigurationsByChainId['0x1337'],
              ).toStrictEqual({
                ...networkConfigurationToUpdate,
                rpcEndpoints: [rpcEndpoint3, rpcEndpoint1, rpcEndpoint2],
              });
            },
          );
        });

        it('returns the network configuration with the new order of RPC endpoints', async () => {
          const [rpcEndpoint1, rpcEndpoint2, rpcEndpoint3] = [
            buildCustomRpcEndpoint({
              name: 'Endpoint 1',
              networkClientId: 'AAAA-AAAA-AAAA-AAAA',
              url: 'https://rpc.endpoint/1',
            }),
            buildCustomRpcEndpoint({
              name: 'Endpoint 2',
              networkClientId: 'BBBB-BBBB-BBBB-BBBB',
              url: 'https://rpc.endpoint/2',
            }),
            buildCustomRpcEndpoint({
              name: 'Endpoint 3',
              networkClientId: 'CCCC-CCCC-CCCC-CCCC',
              url: 'https://rpc.endpoint/3',
            }),
          ];
          const networkConfigurationToUpdate = buildCustomNetworkConfiguration({
            chainId: '0x1337',
            rpcEndpoints: [rpcEndpoint1, rpcEndpoint2, rpcEndpoint3],
          });

          await withController(
            {
              state: {
                networkConfigurationsByChainId: {
                  '0x1337': networkConfigurationToUpdate,
                  '0x9999': buildCustomNetworkConfiguration({
                    chainId: '0x9999',
                    nativeCurrency: 'TEST-9999',
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                        url: 'https://selected.endpoint',
                      }),
                    ],
                  }),
                },
                selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
              },
            },
            async ({ controller }) => {
              const updatedNetworkConfiguration =
                await controller.updateNetwork('0x1337', {
                  ...networkConfigurationToUpdate,
                  rpcEndpoints: [rpcEndpoint3, rpcEndpoint1, rpcEndpoint2],
                });

              expect(updatedNetworkConfiguration).toStrictEqual({
                ...networkConfigurationToUpdate,
                rpcEndpoints: [rpcEndpoint3, rpcEndpoint1, rpcEndpoint2],
              });
            },
          );
        });
      });

      describe('when the networkClientId of some custom RPC endpoints are being cleared', () => {
        it('does not touch the network client registry', async () => {
          const [rpcEndpoint1, rpcEndpoint2] = [
            buildCustomRpcEndpoint({
              name: 'Endpoint 1',
              networkClientId: 'AAAA-AAAA-AAAA-AAAA',
              url: 'https://rpc.endpoint/1',
            }),
            buildCustomRpcEndpoint({
              name: 'Endpoint 2',
              networkClientId: 'BBBB-BBBB-BBBB-BBBB',
              url: 'https://rpc.endpoint/2',
            }),
          ];
          const networkConfigurationToUpdate = buildNetworkConfiguration({
            chainId: '0x1337',
            rpcEndpoints: [rpcEndpoint1, rpcEndpoint2],
          });

          await withController(
            {
              state: {
                networkConfigurationsByChainId: {
                  '0x1337': networkConfigurationToUpdate,
                  '0x9999': buildCustomNetworkConfiguration({
                    chainId: '0x9999',
                    nativeCurrency: 'TEST-9999',
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                        url: 'https://selected.endpoint',
                      }),
                    ],
                  }),
                },
                selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
              },
            },
            async ({ controller }) => {
              mockCreateNetworkClient().mockReturnValue(buildFakeClient());
              const networkClientRegistry =
                controller.getNetworkClientRegistry();

              await controller.updateNetwork('0x1337', {
                ...networkConfigurationToUpdate,
                rpcEndpoints: [
                  rpcEndpoint1,
                  { ...rpcEndpoint2, networkClientId: undefined },
                ],
              });

              expect(controller.getNetworkClientRegistry()).toStrictEqual(
                networkClientRegistry,
              );
            },
          );
        });

        it('does not touch the network configuration in state, as if the network client IDs had not been cleared', async () => {
          const [rpcEndpoint1, rpcEndpoint2] = [
            buildCustomRpcEndpoint({
              name: 'Endpoint 1',
              networkClientId: 'AAAA-AAAA-AAAA-AAAA',
              url: 'https://rpc.endpoint/1',
            }),
            buildCustomRpcEndpoint({
              name: 'Endpoint 2',
              networkClientId: 'BBBB-BBBB-BBBB-BBBB',
              url: 'https://rpc.endpoint/2',
            }),
          ];
          const networkConfigurationToUpdate = buildNetworkConfiguration({
            chainId: '0x1337',
            rpcEndpoints: [rpcEndpoint1, rpcEndpoint2],
          });

          await withController(
            {
              state: {
                networkConfigurationsByChainId: {
                  '0x1337': networkConfigurationToUpdate,
                  '0x9999': buildCustomNetworkConfiguration({
                    chainId: '0x9999',
                    nativeCurrency: 'TEST-9999',
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                        url: 'https://selected.endpoint',
                      }),
                    ],
                  }),
                },
                selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
              },
            },
            async ({ controller }) => {
              const previousNetworkConfigurationsByChainId =
                controller.state.networkConfigurationsByChainId;

              await controller.updateNetwork('0x1337', {
                ...networkConfigurationToUpdate,
                rpcEndpoints: [
                  rpcEndpoint1,
                  { ...rpcEndpoint2, networkClientId: undefined },
                ],
              });

              expect(
                controller.state.networkConfigurationsByChainId,
              ).toStrictEqual(previousNetworkConfigurationsByChainId);
            },
          );
        });

        it('returns the network configuration, untouched', async () => {
          const [rpcEndpoint1, rpcEndpoint2] = [
            buildCustomRpcEndpoint({
              name: 'Endpoint 1',
              networkClientId: 'AAAA-AAAA-AAAA-AAAA',
              url: 'https://rpc.endpoint/1',
            }),
            buildCustomRpcEndpoint({
              name: 'Endpoint 2',
              networkClientId: 'BBBB-BBBB-BBBB-BBBB',
              url: 'https://rpc.endpoint/2',
            }),
          ];
          const networkConfigurationToUpdate = buildNetworkConfiguration({
            chainId: '0x1337',
            rpcEndpoints: [rpcEndpoint1, rpcEndpoint2],
          });

          await withController(
            {
              state: {
                networkConfigurationsByChainId: {
                  '0x1337': networkConfigurationToUpdate,
                  '0x9999': buildCustomNetworkConfiguration({
                    chainId: '0x9999',
                    nativeCurrency: 'TEST-9999',
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                        url: 'https://selected.endpoint',
                      }),
                    ],
                  }),
                },
                selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
              },
            },
            async ({ controller }) => {
              const updatedNetworkConfiguration =
                await controller.updateNetwork('0x1337', {
                  ...networkConfigurationToUpdate,
                  rpcEndpoints: [
                    rpcEndpoint1,
                    { ...rpcEndpoint2, networkClientId: undefined },
                  ],
                });

              expect(updatedNetworkConfiguration).toStrictEqual(
                networkConfigurationToUpdate,
              );
            },
          );
        });
      });

      describe('when no RPC endpoints are being changed', () => {
        it('does not touch the network client registry', async () => {
          const networkConfigurationToUpdate = buildCustomNetworkConfiguration({
            chainId: '0x1337',
            rpcEndpoints: [
              buildCustomRpcEndpoint({
                networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                url: 'https://test.endpoint/1',
              }),
            ],
          });

          await withController(
            {
              state: {
                networkConfigurationsByChainId: {
                  '0x1337': networkConfigurationToUpdate,
                  '0x9999': buildCustomNetworkConfiguration({
                    chainId: '0x9999',
                    nativeCurrency: 'TEST-9999',
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                        url: 'https://selected.endpoint',
                      }),
                    ],
                  }),
                },
                selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
              },
            },
            async ({ controller }) => {
              mockCreateNetworkClient().mockReturnValue(buildFakeClient());
              const networkClientRegistry =
                controller.getNetworkClientRegistry();

              await controller.updateNetwork('0x1337', {
                ...networkConfigurationToUpdate,
                name: 'Some Other Name',
              });

              expect(controller.getNetworkClientRegistry()).toStrictEqual(
                networkClientRegistry,
              );
            },
          );
        });
      });
    });

    const possibleInfuraNetworkTypes = Object.values(InfuraNetworkType);
    possibleInfuraNetworkTypes.forEach(
      (infuraNetworkType, infuraNetworkTypeIndex) => {
        const infuraNetworkNickname = NetworkNickname[infuraNetworkType];
        const infuraChainId = ChainId[infuraNetworkType];
        const anotherInfuraNetworkType =
          possibleInfuraNetworkTypes[
            (infuraNetworkTypeIndex + 1) % possibleInfuraNetworkTypes.length
          ];
        const anotherInfuraChainId = ChainId[anotherInfuraNetworkType];
        const anotherInfuraNativeTokenName =
          NetworksTicker[anotherInfuraNetworkType];
        const anotherInfuraNetworkNickname =
          NetworkNickname[anotherInfuraNetworkType];

        // False negative - this is a string.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        describe(`if the chain ID is being changed from a non-Infura-supported chain to the Infura-supported chain ${infuraChainId}`, () => {
          // False negative - this is a string.
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          it(`throws if a network configuration for the Infura network "${infuraNetworkNickname}" is already registered under the new chain ID`, async () => {
            const networkConfigurationToUpdate =
              buildCustomNetworkConfiguration({ chainId: '0x1337' });

            await withController(
              {
                state: {
                  networkConfigurationsByChainId: {
                    '0x1337': networkConfigurationToUpdate,
                    [infuraChainId]: buildInfuraNetworkConfiguration(infuraNetworkType),
                    '0x9999': buildCustomNetworkConfiguration({
                      chainId: '0x9999',
                      nativeCurrency: 'TEST-9999',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                          url: 'https://selected.endpoint',
                        }),
                      ],
                    }),
                  },
                  selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                },
              },
              async ({ controller }) => {
                await expect(
                  controller.updateNetwork('0x1337', {
                    ...networkConfigurationToUpdate,
                    chainId: infuraChainId,
                  }),
                ).rejects.toThrow(
                  // This is a string.
                  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                  `Cannot move network from chain 0x1337 to ${infuraChainId} as another network for that chain already exists ('${infuraNetworkNickname}')`,
                );
              },
            );
          });

          it('throws (albeit for a different reason) if an Infura RPC endpoint is being added that represents a different chain than the one being changed to', async () => {
            const networkConfigurationToUpdate =
              buildCustomNetworkConfiguration({ chainId: '0x1337' });

            await withController(
              {
                state: {
                  networkConfigurationsByChainId: {
                    '0x1337': networkConfigurationToUpdate,
                    [anotherInfuraChainId]: buildInfuraNetworkConfiguration(
                      anotherInfuraNetworkType,
                    ),
                    '0x9999': buildCustomNetworkConfiguration({
                      chainId: '0x9999',
                      nativeCurrency: 'TEST-9999',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                          url: 'https://selected.endpoint',
                        }),
                      ],
                    }),
                  },
                  selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                },
              },
              async ({ controller }) => {
                await expect(
                  controller.updateNetwork('0x1337', {
                    ...networkConfigurationToUpdate,
                    chainId: infuraChainId,
                    rpcEndpoints: [
                      ...networkConfigurationToUpdate.rpcEndpoints,
                      buildInfuraRpcEndpoint(anotherInfuraNetworkType),
                    ],
                  }),
                ).rejects.toThrow(
                  new Error(
                    // This is a string.
                    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                    `Could not update network to point to same RPC endpoint as existing network for chain ${anotherInfuraChainId} ('${anotherInfuraNetworkNickname}')`,
                  ),
                );
              },
            );
          });

          it('re-files the existing network configuration from under the old chain ID to under the new one, regenerating network client IDs for each RPC endpoint', async () => {
            uuidV4Mock
              .mockReturnValueOnce('CCCC-CCCC-CCCC-CCCC')
              .mockReturnValueOnce('DDDD-DDDD-DDDD-DDDD');

            const [rpcEndpoint1, rpcEndpoint2] = [
              buildCustomRpcEndpoint({
                networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                url: 'https://test.endpoint/1',
              }),
              buildCustomRpcEndpoint({
                networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                url: 'https://test.endpoint/2',
              }),
            ];
            const networkConfigurationToUpdate = buildNetworkConfiguration({
              chainId: '0x1337',
              rpcEndpoints: [rpcEndpoint1, rpcEndpoint2],
            });

            // TODO: This is where we stopped
            await withController(
              {
                state: {
                  networkConfigurationsByChainId: {
                    '0x1337': networkConfigurationToUpdate,
                    '0x9999': buildCustomNetworkConfiguration({
                      chainId: '0x9999',
                      nativeCurrency: 'TEST-9999',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                          url: 'https://selected.endpoint',
                        }),
                      ],
                    }),
                  },
                  selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                },
              },
              async ({ controller }) => {
                mockCreateNetworkClient()
                  .calledWith({
                    chainId: infuraChainId,
                    rpcUrl: 'https://test.endpoint/1',
                    ticker: 'TOKEN',
                    type: NetworkClientType.Custom,
                  })
                  .mockReturnValue(buildFakeClient());

                await controller.updateNetwork('0x1337', {
                  ...networkConfigurationToUpdate,
                  chainId: infuraChainId,
                });

                expect(
                  controller.state.networkConfigurationsByChainId,
                ).not.toHaveProperty('0x1337');
                expect(
                  controller.state.networkConfigurationsByChainId,
                ).toHaveProperty(infuraChainId);
                expect(
                  controller.state.networkConfigurationsByChainId[
                    infuraChainId
                  ],
                ).toStrictEqual({
                  ...networkConfigurationToUpdate,
                  chainId: infuraChainId,
                  rpcEndpoints: [
                    {
                      ...rpcEndpoint1,
                      networkClientId: 'CCCC-CCCC-CCCC-CCCC',
                    },
                    {
                      ...rpcEndpoint2,
                      networkClientId: 'DDDD-DDDD-DDDD-DDDD',
                    },
                  ],
                });
              },
            );
          });

          it('destroys and unregisters every network client for each of the RPC endpoints (even if none of the endpoint URLs were changed)', async () => {
            const networkConfigurationToUpdate = buildNetworkConfiguration({
              chainId: '0x1337',
              rpcEndpoints: [
                buildCustomRpcEndpoint({
                  name: 'Test Network 1',
                  networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                  url: 'https://test.endpoint/1',
                }),
                buildCustomRpcEndpoint({
                  name: 'Test Network 2',
                  networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                  url: 'https://test.endpoint/2',
                }),
              ],
            });

            await withController(
              {
                state: {
                  networkConfigurationsByChainId: {
                    '0x1337': networkConfigurationToUpdate,
                    '0x9999': buildCustomNetworkConfiguration({
                      chainId: '0x9999',
                      nativeCurrency: 'TEST-9999',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                          url: 'https://selected.endpoint',
                        }),
                      ],
                    }),
                  },
                  selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                },
              },
              async ({ controller }) => {
                mockCreateNetworkClient()
                  .calledWith({
                    chainId: infuraChainId,
                    rpcUrl: 'https://test.endpoint/1',
                    ticker: 'TOKEN',
                    type: NetworkClientType.Custom,
                  })
                  .mockReturnValue(buildFakeClient());
                const existingNetworkClient1 = controller.getNetworkClientById(
                  'AAAA-AAAA-AAAA-AAAA',
                );
                const destroySpy1 = jest.spyOn(
                  existingNetworkClient1,
                  'destroy',
                );
                const existingNetworkClient2 = controller.getNetworkClientById(
                  'BBBB-BBBB-BBBB-BBBB',
                );
                const destroySpy2 = jest.spyOn(
                  existingNetworkClient2,
                  'destroy',
                );

                await controller.updateNetwork('0x1337', {
                  ...networkConfigurationToUpdate,
                  chainId: infuraChainId,
                });

                expect(destroySpy1).toHaveBeenCalled();
                expect(destroySpy2).toHaveBeenCalled();
                const networkClientRegistry =
                  controller.getNetworkClientRegistry();
                expect(networkClientRegistry).not.toHaveProperty(
                  'AAAA-AAAA-AAAA-AAAA',
                );
                expect(networkClientRegistry).not.toHaveProperty(
                  'BBBB-BBBB-BBBB-BBBB',
                );
              },
            );
          });

          it('creates and registers new network clients for each of the given RPC endpoints', async () => {
            uuidV4Mock
              .mockReturnValueOnce('CCCC-CCCC-CCCC-CCCC')
              .mockReturnValueOnce('DDDD-DDDD-DDDD-DDDD');
            const createAutoManagedNetworkClientSpy = jest.spyOn(
              createAutoManagedNetworkClientModule,
              'createAutoManagedNetworkClient',
            );
            const networkConfigurationToUpdate = buildNetworkConfiguration({
              chainId: '0x1337',
              nativeCurrency: 'TOKEN',
              rpcEndpoints: [
                buildCustomRpcEndpoint({
                  name: 'Test Network 1',
                  networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                  url: 'https://test.endpoint/1',
                }),
                buildCustomRpcEndpoint({
                  name: 'Test Network 2',
                  networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                  url: 'https://test.endpoint/2',
                }),
              ],
            });

            await withController(
              {
                state: {
                  networkConfigurationsByChainId: {
                    '0x1337': networkConfigurationToUpdate,
                    '0x9999': buildCustomNetworkConfiguration({
                      chainId: '0x9999',
                      nativeCurrency: 'TEST-9999',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                          url: 'https://selected.endpoint',
                        }),
                      ],
                    }),
                  },
                  selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                },
              },
              async ({ controller }) => {
                mockCreateNetworkClient()
                  .calledWith({
                    chainId: infuraChainId,
                    rpcUrl: 'https://test.endpoint/1',
                    ticker: 'TOKEN',
                    type: NetworkClientType.Custom,
                  })
                  .mockReturnValue(buildFakeClient());

                await controller.updateNetwork('0x1337', {
                  ...networkConfigurationToUpdate,
                  chainId: infuraChainId,
                });

                expect(createAutoManagedNetworkClientSpy).toHaveBeenCalledWith({
                  chainId: infuraChainId,
                  rpcUrl: 'https://test.endpoint/1',
                  ticker: 'TOKEN',
                  type: NetworkClientType.Custom,
                });
                expect(createAutoManagedNetworkClientSpy).toHaveBeenCalledWith({
                  chainId: infuraChainId,
                  rpcUrl: 'https://test.endpoint/2',
                  ticker: 'TOKEN',
                  type: NetworkClientType.Custom,
                });

                expect(
                  getNetworkConfigurationsByNetworkClientId(
                    controller.getNetworkClientRegistry(),
                  ),
                ).toMatchObject({
                  'CCCC-CCCC-CCCC-CCCC': {
                    chainId: infuraChainId,
                    rpcUrl: 'https://test.endpoint/1',
                    ticker: 'TOKEN',
                    type: NetworkClientType.Custom,
                  },
                  'DDDD-DDDD-DDDD-DDDD': {
                    chainId: infuraChainId,
                    rpcUrl: 'https://test.endpoint/2',
                    ticker: 'TOKEN',
                    type: NetworkClientType.Custom,
                  },
                });
              },
            );
          });

          it('returns the updated network configuration', async () => {
            uuidV4Mock
              .mockReturnValueOnce('CCCC-CCCC-CCCC-CCCC')
              .mockReturnValueOnce('DDDD-DDDD-DDDD-DDDD');

            const [rpcEndpoint1, rpcEndpoint2] = [
              buildCustomRpcEndpoint({
                networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                url: 'https://test.endpoint/1',
              }),
              buildCustomRpcEndpoint({
                networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                url: 'https://test.endpoint/2',
              }),
            ];
            const networkConfigurationToUpdate = buildNetworkConfiguration({
              chainId: '0x1337',
              rpcEndpoints: [rpcEndpoint1, rpcEndpoint2],
            });

            await withController(
              {
                state: {
                  networkConfigurationsByChainId: {
                    '0x1337': networkConfigurationToUpdate,
                    '0x9999': buildCustomNetworkConfiguration({
                      chainId: '0x9999',
                      nativeCurrency: 'TEST-9999',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                          url: 'https://selected.endpoint',
                        }),
                      ],
                    }),
                  },
                  selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                },
              },
              async ({ controller }) => {
                mockCreateNetworkClient()
                  .calledWith({
                    chainId: infuraChainId,
                    rpcUrl: 'https://test.endpoint/1',
                    ticker: 'TOKEN',
                    type: NetworkClientType.Custom,
                  })
                  .mockReturnValue(buildFakeClient());

                const updatedNetworkConfiguration =
                  await controller.updateNetwork('0x1337', {
                    ...networkConfigurationToUpdate,
                    chainId: infuraChainId,
                  });

                expect(updatedNetworkConfiguration).toStrictEqual({
                  ...networkConfigurationToUpdate,
                  chainId: infuraChainId,
                  rpcEndpoints: [
                    {
                      ...rpcEndpoint1,
                      networkClientId: 'CCCC-CCCC-CCCC-CCCC',
                    },
                    {
                      ...rpcEndpoint2,
                      networkClientId: 'DDDD-DDDD-DDDD-DDDD',
                    },
                  ],
                });
              },
            );
          });

          describe('if one of the RPC endpoints was represented by the selected network client', () => {
            it('invisibly selects the network client created for the RPC endpoint', async () => {
              uuidV4Mock.mockReturnValueOnce('BBBB-BBBB-BBBB-BBBB');
              const networkConfigurationToUpdate =
                buildCustomNetworkConfiguration({
                  nativeCurrency: 'TOKEN',
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      name: 'Endpoint 1',
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      url: 'https://rpc.endpoint',
                    }),
                  ],
                });

              await withController(
                {
                  state: {
                    selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
                    networkConfigurationsByChainId: {
                      '0x1337': networkConfigurationToUpdate,
                    },
                  },
                },
                async ({ controller }) => {
                  const fakeProviders = [
                    buildFakeProvider([
                      {
                        request: {
                          method: 'test',
                        },
                        response: {
                          result: 'test response from 1',
                        },
                      },
                    ]),
                    buildFakeProvider([
                      {
                        request: {
                          method: 'test',
                        },
                        response: {
                          result: 'test response from 2',
                        },
                      },
                    ]),
                  ];
                  const fakeNetworkClients = [
                    buildFakeClient(fakeProviders[0]),
                    buildFakeClient(fakeProviders[1]),
                  ];
                  mockCreateNetworkClient()
                    .calledWith({
                      chainId: '0x1337',
                      rpcUrl: 'https://rpc.endpoint',
                      ticker: 'TOKEN',
                      type: NetworkClientType.Custom,
                    })
                    .mockReturnValue(fakeNetworkClients[0])
                    .calledWith({
                      chainId: infuraChainId,
                      rpcUrl: 'https://rpc.endpoint',
                      ticker: 'TOKEN',
                      type: NetworkClientType.Custom,
                    })
                    .mockReturnValue(fakeNetworkClients[1]);
                  await controller.initializeProvider();
                  expect(controller.state.selectedNetworkClientId).toBe(
                    'AAAA-AAAA-AAAA-AAAA',
                  );
                  const networkClient1 = controller.getSelectedNetworkClient();
                  assert(networkClient1, 'Network client is somehow unset');
                  const result1 = await networkClient1.provider.request({
                    method: 'test',
                  });
                  expect(result1).toBe('test response from 1');

                  await controller.updateNetwork('0x1337', {
                    ...networkConfigurationToUpdate,
                    chainId: infuraChainId,
                  });

                  expect(controller.state.selectedNetworkClientId).toBe(
                    'BBBB-BBBB-BBBB-BBBB',
                  );
                  const networkClient2 = controller.getSelectedNetworkClient();
                  assert(networkClient2, 'Network client is somehow unset');
                  const result2 = await networkClient1.provider.request({
                    method: 'test',
                  });
                  expect(result2).toBe('test response from 2');
                },
              );
            });

            it('updates selectedNetworkClientId and networkConfigurationsByChainId at the same time', async () => {
              uuidV4Mock.mockReturnValueOnce('BBBB-BBBB-BBBB-BBBB');
              const networkConfigurationToUpdate =
                buildCustomNetworkConfiguration({
                  nativeCurrency: 'TOKEN',
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      name: 'Endpoint 1',
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      url: 'https://rpc.endpoint',
                    }),
                  ],
                });

              await withController(
                {
                  state: {
                    selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
                    networkConfigurationsByChainId: {
                      '0x1337': networkConfigurationToUpdate,
                    },
                  },
                },
                async ({ controller, messenger }) => {
                  const fakeProviders = [
                    buildFakeProvider([
                      {
                        request: {
                          method: 'test',
                        },
                        response: {
                          result: 'test response from 1',
                        },
                      },
                    ]),
                    buildFakeProvider([
                      {
                        request: {
                          method: 'test',
                        },
                        response: {
                          result: 'test response from 2',
                        },
                      },
                    ]),
                  ];
                  const fakeNetworkClients = [
                    buildFakeClient(fakeProviders[0]),
                    buildFakeClient(fakeProviders[1]),
                  ];
                  mockCreateNetworkClient()
                    .calledWith({
                      chainId: '0x1337',
                      rpcUrl: 'https://rpc.endpoint',
                      ticker: 'TOKEN',
                      type: NetworkClientType.Custom,
                    })
                    .mockReturnValue(fakeNetworkClients[0])
                    .calledWith({
                      chainId: infuraChainId,
                      rpcUrl: 'https://rpc.endpoint',
                      ticker: 'TOKEN',
                      type: NetworkClientType.Custom,
                    })
                    .mockReturnValue(fakeNetworkClients[1]);
                  await controller.initializeProvider();

                  const promiseForStateChanges = waitForStateChanges({
                    messenger,
                    count: 1,
                  });

                  await controller.updateNetwork('0x1337', {
                    ...networkConfigurationToUpdate,
                    chainId: infuraChainId,
                  });
                  const stateChanges = await promiseForStateChanges;
                  expect(stateChanges).toStrictEqual([
                    [
                      expect.any(Object),
                      expect.arrayContaining([
                        expect.objectContaining({
                          op: 'replace',
                          path: ['selectedNetworkClientId'],
                          value: 'BBBB-BBBB-BBBB-BBBB',
                        }),
                        expect.objectContaining({
                          op: 'remove',
                          path: ['networkConfigurationsByChainId', '0x1337'],
                        }),
                        expect.objectContaining({
                          op: 'add',
                          path: [
                            'networkConfigurationsByChainId',
                            infuraChainId,
                          ],
                        }),
                      ]),
                    ],
                  ]);
                },
              );
            });
          });
        });

        // False negative - this is a string.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        describe(`if the chain ID is being changed from the Infura-supported chain ${infuraChainId} to a non-Infura-supported chain`, () => {
          it('throws if a network configuration for a custom network is already registered under the new chain ID', async () => {
            const networkConfigurationToUpdate =
              buildInfuraNetworkConfiguration(infuraNetworkType);

            await withController(
              {
                state: {
                  networkConfigurationsByChainId: {
                    [infuraChainId]: networkConfigurationToUpdate,
                    '0x1337': buildCustomNetworkConfiguration({
                      chainId: '0x1337',
                      name: 'Some Network',
                    }),
                    '0x9999': buildCustomNetworkConfiguration({
                      chainId: '0x9999',
                      nativeCurrency: 'TEST-9999',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                          url: 'https://selected.endpoint',
                        }),
                      ],
                    }),
                  },
                  selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                },
              },
              async ({ controller }) => {
                await expect(
                  controller.updateNetwork(infuraChainId, {
                    ...networkConfigurationToUpdate,
                    chainId: '0x1337',
                  }),
                ).rejects.toThrow(
                  // False negative - this is a string.
                  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                  `Cannot move network from chain ${infuraChainId} to 0x1337 as another network for that chain already exists ('Some Network')`,
                );
              },
            );
          });

          it('throws if the existing Infura RPC endpoint is not removed in the process of changing the chain ID', async () => {
            const networkConfigurationToUpdate =
              buildInfuraNetworkConfiguration(infuraNetworkType);

            await withController(
              {
                state: {
                  networkConfigurationsByChainId: {
                    [infuraChainId]: networkConfigurationToUpdate,
                    '0x9999': buildCustomNetworkConfiguration({
                      chainId: '0x9999',
                      nativeCurrency: 'TEST-9999',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                          url: 'https://selected.endpoint',
                        }),
                      ],
                    }),
                  },
                  selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                },
              },
              async ({ controller }) => {
                await expect(
                  controller.updateNetwork(infuraChainId, {
                    ...networkConfigurationToUpdate,
                    chainId: '0x1337',
                  }),
                ).rejects.toThrow(
                  new Error(
                    // This is a string.
                    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                    `Could not update network with chain ID 0x1337 and Infura RPC endpoint for '${infuraNetworkNickname}' which represents ${infuraChainId}, as the two conflict`,
                  ),
                );
              },
            );
          });

          it('re-files the existing network configuration from under the old chain ID to under the new one, regenerating network client IDs for each custom RPC endpoint', async () => {
            uuidV4Mock
              .mockReturnValueOnce('CCCC-CCCC-CCCC-CCCC')
              .mockReturnValueOnce('DDDD-DDDD-DDDD-DDDD');

            const [defaultRpcEndpoint, customRpcEndpoint1, customRpcEndpoint2] =
              [
                buildInfuraRpcEndpoint(infuraNetworkType),
                buildCustomRpcEndpoint({
                  networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                  url: 'https://test.endpoint/1',
                }),
                buildCustomRpcEndpoint({
                  networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                  url: 'https://test.endpoint/2',
                }),
              ];
            const networkConfigurationToUpdate =
              buildInfuraNetworkConfiguration(infuraNetworkType, {
                rpcEndpoints: [
                  defaultRpcEndpoint,
                  customRpcEndpoint1,
                  customRpcEndpoint2,
                ],
              });

            await withController(
              {
                state: {
                  networkConfigurationsByChainId: {
                    [infuraChainId]: networkConfigurationToUpdate,
                    '0x9999': buildCustomNetworkConfiguration({
                      chainId: '0x9999',
                      nativeCurrency: 'TEST-9999',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                          url: 'https://selected.endpoint',
                        }),
                      ],
                    }),
                  },
                  selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                },
              },
              async ({ controller }) => {
                mockCreateNetworkClient()
                  .calledWith({
                    chainId: '0x1337',
                    rpcUrl: 'https://test.endpoint/1',
                    ticker: 'TOKEN',
                    type: NetworkClientType.Custom,
                  })
                  .mockReturnValue(buildFakeClient());

                await controller.updateNetwork(
                  infuraChainId,
                  {
                    ...networkConfigurationToUpdate,
                    chainId: '0x1337',
                    defaultRpcEndpointIndex: 0,
                    nativeCurrency: 'TOKEN',
                    rpcEndpoints: [customRpcEndpoint1, customRpcEndpoint2],
                  },
                  { replacementSelectedRpcEndpointIndex: 0 },
                );

                expect(
                  controller.state.networkConfigurationsByChainId,
                ).not.toHaveProperty(infuraChainId);
                expect(
                  controller.state.networkConfigurationsByChainId,
                ).toHaveProperty('0x1337');
                expect(
                  controller.state.networkConfigurationsByChainId['0x1337'],
                ).toStrictEqual({
                  ...networkConfigurationToUpdate,
                  chainId: '0x1337',
                  defaultRpcEndpointIndex: 0,
                  nativeCurrency: 'TOKEN',
                  rpcEndpoints: [
                    {
                      ...customRpcEndpoint1,
                      networkClientId: 'CCCC-CCCC-CCCC-CCCC',
                    },
                    {
                      ...customRpcEndpoint2,
                      networkClientId: 'DDDD-DDDD-DDDD-DDDD',
                    },
                  ],
                });
              },
            );
          });

          it('destroys and unregisters every network client for each of the custom RPC endpoints (even if none of the endpoint URLs were changed)', async () => {
            const [defaultRpcEndpoint, customRpcEndpoint1, customRpcEndpoint2] =
              [
                buildInfuraRpcEndpoint(infuraNetworkType),
                buildCustomRpcEndpoint({
                  networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                  url: 'https://test.endpoint/1',
                }),
                buildCustomRpcEndpoint({
                  networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                  url: 'https://test.endpoint/2',
                }),
              ];
            const networkConfigurationToUpdate =
              buildInfuraNetworkConfiguration(infuraNetworkType, {
                rpcEndpoints: [
                  defaultRpcEndpoint,
                  customRpcEndpoint1,
                  customRpcEndpoint2,
                ],
              });

            await withController(
              {
                state: {
                  networkConfigurationsByChainId: {
                    [infuraChainId]: networkConfigurationToUpdate,
                    '0x9999': buildCustomNetworkConfiguration({
                      chainId: '0x9999',
                      nativeCurrency: 'TEST-9999',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                          url: 'https://selected.endpoint',
                        }),
                      ],
                    }),
                  },
                  selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                },
              },
              async ({ controller }) => {
                mockCreateNetworkClient()
                  .calledWith({
                    chainId: '0x1337',
                    rpcUrl: 'https://test.endpoint/1',
                    ticker: 'TOKEN',
                    type: NetworkClientType.Custom,
                  })
                  .mockReturnValue(buildFakeClient());
                const existingNetworkClient1 = controller.getNetworkClientById(
                  'AAAA-AAAA-AAAA-AAAA',
                );
                const destroySpy1 = jest.spyOn(
                  existingNetworkClient1,
                  'destroy',
                );
                const existingNetworkClient2 = controller.getNetworkClientById(
                  'BBBB-BBBB-BBBB-BBBB',
                );
                const destroySpy2 = jest.spyOn(
                  existingNetworkClient2,
                  'destroy',
                );

                await controller.updateNetwork(
                  infuraChainId,
                  {
                    ...networkConfigurationToUpdate,
                    chainId: '0x1337',
                    defaultRpcEndpointIndex: 0,
                    nativeCurrency: 'TOKEN',
                    rpcEndpoints: [customRpcEndpoint1, customRpcEndpoint2],
                  },
                  { replacementSelectedRpcEndpointIndex: 0 },
                );

                expect(destroySpy1).toHaveBeenCalled();
                expect(destroySpy2).toHaveBeenCalled();
                const networkClientRegistry =
                  controller.getNetworkClientRegistry();
                expect(networkClientRegistry).not.toHaveProperty(
                  'AAAA-AAAA-AAAA-AAAA',
                );
                expect(networkClientRegistry).not.toHaveProperty(
                  'BBBB-BBBB-BBBB-BBBB',
                );
              },
            );
          });

          it('creates and registers new network clients for each of the given custom RPC endpoints', async () => {
            uuidV4Mock
              .mockReturnValueOnce('CCCC-CCCC-CCCC-CCCC')
              .mockReturnValueOnce('DDDD-DDDD-DDDD-DDDD');

            const createAutoManagedNetworkClientSpy = jest.spyOn(
              createAutoManagedNetworkClientModule,
              'createAutoManagedNetworkClient',
            );

            const [defaultRpcEndpoint, customRpcEndpoint1, customRpcEndpoint2] =
              [
                buildInfuraRpcEndpoint(infuraNetworkType),
                buildCustomRpcEndpoint({
                  networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                  url: 'https://test.endpoint/1',
                }),
                buildCustomRpcEndpoint({
                  networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                  url: 'https://test.endpoint/2',
                }),
              ];
            const networkConfigurationToUpdate =
              buildInfuraNetworkConfiguration(infuraNetworkType, {
                nativeCurrency: 'ETH',
                rpcEndpoints: [
                  defaultRpcEndpoint,
                  customRpcEndpoint1,
                  customRpcEndpoint2,
                ],
              });

            await withController(
              {
                state: {
                  networkConfigurationsByChainId: {
                    [infuraChainId]: networkConfigurationToUpdate,
                    '0x9999': buildCustomNetworkConfiguration({
                      chainId: '0x9999',
                      nativeCurrency: 'TEST-9999',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                          url: 'https://selected.endpoint',
                        }),
                      ],
                    }),
                  },
                  selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                },
              },
              async ({ controller }) => {
                mockCreateNetworkClient()
                  .calledWith({
                    chainId: '0x1337',
                    rpcUrl: 'https://test.endpoint/1',
                    ticker: 'TOKEN',
                    type: NetworkClientType.Custom,
                  })
                  .mockReturnValue(buildFakeClient());

                await controller.updateNetwork(
                  infuraChainId,
                  {
                    ...networkConfigurationToUpdate,
                    chainId: '0x1337',
                    defaultRpcEndpointIndex: 0,
                    nativeCurrency: 'TOKEN',
                    rpcEndpoints: [customRpcEndpoint1, customRpcEndpoint2],
                  },
                  { replacementSelectedRpcEndpointIndex: 0 },
                );

                expect(createAutoManagedNetworkClientSpy).toHaveBeenCalledWith({
                  chainId: '0x1337',
                  rpcUrl: 'https://test.endpoint/1',
                  ticker: 'TOKEN',
                  type: NetworkClientType.Custom,
                });
                expect(createAutoManagedNetworkClientSpy).toHaveBeenCalledWith({
                  chainId: '0x1337',
                  rpcUrl: 'https://test.endpoint/2',
                  ticker: 'TOKEN',
                  type: NetworkClientType.Custom,
                });

                expect(
                  getNetworkConfigurationsByNetworkClientId(
                    controller.getNetworkClientRegistry(),
                  ),
                ).toMatchObject({
                  'CCCC-CCCC-CCCC-CCCC': {
                    chainId: '0x1337',
                    rpcUrl: 'https://test.endpoint/1',
                    ticker: 'TOKEN',
                    type: NetworkClientType.Custom,
                  },
                  'DDDD-DDDD-DDDD-DDDD': {
                    chainId: '0x1337',
                    rpcUrl: 'https://test.endpoint/2',
                    ticker: 'TOKEN',
                    type: NetworkClientType.Custom,
                  },
                });
              },
            );
          });

          it('returns the updated network configuration', async () => {
            uuidV4Mock
              .mockReturnValueOnce('CCCC-CCCC-CCCC-CCCC')
              .mockReturnValueOnce('DDDD-DDDD-DDDD-DDDD');

            const [defaultRpcEndpoint, customRpcEndpoint1, customRpcEndpoint2] =
              [
                buildInfuraRpcEndpoint(infuraNetworkType),
                buildCustomRpcEndpoint({
                  networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                  url: 'https://test.endpoint/1',
                }),
                buildCustomRpcEndpoint({
                  networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                  url: 'https://test.endpoint/2',
                }),
              ];
            const networkConfigurationToUpdate =
              buildInfuraNetworkConfiguration(infuraNetworkType, {
                rpcEndpoints: [
                  defaultRpcEndpoint,
                  customRpcEndpoint1,
                  customRpcEndpoint2,
                ],
              });

            await withController(
              {
                state: {
                  networkConfigurationsByChainId: {
                    [infuraChainId]: networkConfigurationToUpdate,
                    '0x9999': buildCustomNetworkConfiguration({
                      chainId: '0x9999',
                      nativeCurrency: 'TEST-9999',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                          url: 'https://selected.endpoint',
                        }),
                      ],
                    }),
                  },
                  selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                },
              },
              async ({ controller }) => {
                mockCreateNetworkClient()
                  .calledWith({
                    chainId: '0x1337',
                    rpcUrl: 'https://test.endpoint/1',
                    ticker: 'TOKEN',
                    type: NetworkClientType.Custom,
                  })
                  .mockReturnValue(buildFakeClient());

                const updatedNetworkConfiguration =
                  await controller.updateNetwork(
                    infuraChainId,
                    {
                      ...networkConfigurationToUpdate,
                      chainId: '0x1337',
                      defaultRpcEndpointIndex: 0,
                      nativeCurrency: 'TOKEN',
                      rpcEndpoints: [customRpcEndpoint1, customRpcEndpoint2],
                    },
                    { replacementSelectedRpcEndpointIndex: 0 },
                  );

                expect(updatedNetworkConfiguration).toStrictEqual({
                  ...networkConfigurationToUpdate,
                  chainId: '0x1337',
                  defaultRpcEndpointIndex: 0,
                  nativeCurrency: 'TOKEN',
                  rpcEndpoints: [
                    {
                      ...customRpcEndpoint1,
                      networkClientId: 'CCCC-CCCC-CCCC-CCCC',
                    },
                    {
                      ...customRpcEndpoint2,
                      networkClientId: 'DDDD-DDDD-DDDD-DDDD',
                    },
                  ],
                });
              },
            );
          });

          describe('if one of the RPC endpoints was represented by the selected network client', () => {
            it('invisibly selects the network client created for the RPC endpoint', async () => {
              uuidV4Mock.mockReturnValueOnce('BBBB-BBBB-BBBB-BBBB');
              const networkConfigurationToUpdate =
                buildInfuraNetworkConfiguration(infuraNetworkType, {
                  nativeCurrency: 'TOKEN',
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      name: 'Endpoint 1',
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      url: 'https://rpc.endpoint',
                    }),
                  ],
                });

              await withController(
                {
                  state: {
                    selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
                    networkConfigurationsByChainId: {
                      [infuraChainId]: networkConfigurationToUpdate,
                    },
                  },
                },
                async ({ controller }) => {
                  const fakeProviders = [
                    buildFakeProvider([
                      {
                        request: {
                          method: 'test',
                        },
                        response: {
                          result: 'test response from 1',
                        },
                      },
                    ]),
                    buildFakeProvider([
                      {
                        request: {
                          method: 'test',
                        },
                        response: {
                          result: 'test response from 2',
                        },
                      },
                    ]),
                  ];
                  const fakeNetworkClients = [
                    buildFakeClient(fakeProviders[0]),
                    buildFakeClient(fakeProviders[1]),
                  ];
                  mockCreateNetworkClient()
                    .calledWith({
                      chainId: infuraChainId,
                      rpcUrl: 'https://rpc.endpoint',
                      ticker: 'TOKEN',
                      type: NetworkClientType.Custom,
                    })
                    .mockReturnValue(fakeNetworkClients[0])
                    .calledWith({
                      chainId: '0x1337',
                      rpcUrl: 'https://rpc.endpoint',
                      ticker: 'TOKEN',
                      type: NetworkClientType.Custom,
                    })
                    .mockReturnValue(fakeNetworkClients[1]);
                  await controller.initializeProvider();
                  expect(controller.state.selectedNetworkClientId).toBe(
                    'AAAA-AAAA-AAAA-AAAA',
                  );
                  const networkClient1 = controller.getSelectedNetworkClient();
                  assert(networkClient1, 'Network client is somehow unset');
                  const result1 = await networkClient1.provider.request({
                    method: 'test',
                  });
                  expect(result1).toBe('test response from 1');

                  await controller.updateNetwork(infuraChainId, {
                    ...networkConfigurationToUpdate,
                    chainId: '0x1337',
                  });

                  expect(controller.state.selectedNetworkClientId).toBe(
                    'BBBB-BBBB-BBBB-BBBB',
                  );
                  const networkClient2 = controller.getSelectedNetworkClient();
                  assert(networkClient2, 'Network client is somehow unset');
                  const result2 = await networkClient1.provider.request({
                    method: 'test',
                  });
                  expect(result2).toBe('test response from 2');
                },
              );
            });

            it('updates selectedNetworkClientId and networkConfigurationsByChainId at the same time', async () => {
              uuidV4Mock.mockReturnValueOnce('BBBB-BBBB-BBBB-BBBB');
              const networkConfigurationToUpdate =
                buildInfuraNetworkConfiguration(infuraNetworkType, {
                  nativeCurrency: 'TOKEN',
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      name: 'Endpoint 1',
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      url: 'https://rpc.endpoint',
                    }),
                  ],
                });

              await withController(
                {
                  state: {
                    selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
                    networkConfigurationsByChainId: {
                      [infuraChainId]: networkConfigurationToUpdate,
                    },
                  },
                },
                async ({ controller, messenger }) => {
                  const fakeProviders = [
                    buildFakeProvider([
                      {
                        request: {
                          method: 'test',
                        },
                        response: {
                          result: 'test response from 1',
                        },
                      },
                    ]),
                    buildFakeProvider([
                      {
                        request: {
                          method: 'test',
                        },
                        response: {
                          result: 'test response from 2',
                        },
                      },
                    ]),
                  ];
                  const fakeNetworkClients = [
                    buildFakeClient(fakeProviders[0]),
                    buildFakeClient(fakeProviders[1]),
                  ];
                  mockCreateNetworkClient()
                    .calledWith({
                      chainId: infuraChainId,
                      rpcUrl: 'https://rpc.endpoint',
                      ticker: 'TOKEN',
                      type: NetworkClientType.Custom,
                    })
                    .mockReturnValue(fakeNetworkClients[0])
                    .calledWith({
                      chainId: '0x1337',
                      rpcUrl: 'https://rpc.endpoint',
                      ticker: 'TOKEN',
                      type: NetworkClientType.Custom,
                    })
                    .mockReturnValue(fakeNetworkClients[1]);
                  await controller.initializeProvider();

                  const promiseForStateChanges = waitForStateChanges({
                    messenger,
                    count: 1,
                  });

                  await controller.updateNetwork(infuraChainId, {
                    ...networkConfigurationToUpdate,
                    chainId: '0x1337',
                  });
                  const stateChanges = await promiseForStateChanges;
                  expect(stateChanges).toStrictEqual([
                    [
                      expect.any(Object),
                      expect.arrayContaining([
                        expect.objectContaining({
                          op: 'replace',
                          path: ['selectedNetworkClientId'],
                          value: 'BBBB-BBBB-BBBB-BBBB',
                        }),
                        expect.objectContaining({
                          op: 'remove',
                          path: [
                            'networkConfigurationsByChainId',
                            infuraChainId,
                          ],
                        }),
                        expect.objectContaining({
                          op: 'add',
                          path: ['networkConfigurationsByChainId', '0x1337'],
                        }),
                      ]),
                    ],
                  ]);
                },
              );
            });
          });
        });

        // False negative - this is a string.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        describe(`if the chain ID is being changed from the Infura-supported chain ${infuraChainId} to a different Infura-supported chain ${anotherInfuraChainId}`, () => {
          // False negative - this is a string.
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          it(`throws if a network configuration for the Infura network "${infuraNetworkNickname}" is already registered under the new chain ID`, async () => {
            const networkConfigurationToUpdate =
              buildInfuraNetworkConfiguration(infuraNetworkType);

            await withController(
              {
                state: {
                  networkConfigurationsByChainId: {
                    [infuraChainId]: networkConfigurationToUpdate,
                    [anotherInfuraChainId]: buildInfuraNetworkConfiguration(
                      anotherInfuraNetworkType,
                    ),
                    '0x9999': buildCustomNetworkConfiguration({
                      chainId: '0x9999',
                      nativeCurrency: 'TEST-9999',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                          url: 'https://selected.endpoint',
                        }),
                      ],
                    }),
                  },
                  selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                },
              },
              async ({ controller }) => {
                await expect(
                  controller.updateNetwork(infuraChainId, {
                    ...networkConfigurationToUpdate,
                    chainId: anotherInfuraChainId,
                  }),
                ).rejects.toThrow(
                  // This is a string.
                  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                  `Cannot move network from chain ${infuraChainId} to ${anotherInfuraChainId} as another network for that chain already exists ('${anotherInfuraNetworkNickname}')`,
                );
              },
            );
          });

          it('throws if the existing Infura RPC endpoint is not updated in the process of changing the chain ID', async () => {
            const networkConfigurationToUpdate =
              buildInfuraNetworkConfiguration(infuraNetworkType);

            await withController(
              {
                state: {
                  networkConfigurationsByChainId: {
                    [infuraChainId]: networkConfigurationToUpdate,
                    '0x9999': buildCustomNetworkConfiguration({
                      chainId: '0x9999',
                      nativeCurrency: 'TEST-9999',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                          url: 'https://selected.endpoint',
                        }),
                      ],
                    }),
                  },
                  selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                },
              },
              async ({ controller }) => {
                await expect(
                  controller.updateNetwork(infuraChainId, {
                    ...networkConfigurationToUpdate,
                    chainId: anotherInfuraChainId,
                  }),
                ).rejects.toThrow(
                  new Error(
                    // This is a string.
                    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                    `Could not update network with chain ID ${anotherInfuraChainId} and Infura RPC endpoint for '${infuraNetworkNickname}' which represents ${infuraChainId}, as the two conflict`,
                  ),
                );
              },
            );
          });

          it('re-files the existing network configuration from under the old chain ID to under the new one, regenerating network client IDs for each custom RPC endpoint', async () => {
            uuidV4Mock
              .mockReturnValueOnce('CCCC-CCCC-CCCC-CCCC')
              .mockReturnValueOnce('DDDD-DDDD-DDDD-DDDD');

            const [defaultRpcEndpoint, customRpcEndpoint1, customRpcEndpoint2] =
              [
                buildInfuraRpcEndpoint(infuraNetworkType),
                buildCustomRpcEndpoint({
                  networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                  url: 'https://test.endpoint/1',
                }),
                buildCustomRpcEndpoint({
                  networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                  url: 'https://test.endpoint/2',
                }),
              ];
            const networkConfigurationToUpdate =
              buildInfuraNetworkConfiguration(infuraNetworkType, {
                rpcEndpoints: [
                  defaultRpcEndpoint,
                  customRpcEndpoint1,
                  customRpcEndpoint2,
                ],
              });

            await withController(
              {
                state: {
                  networkConfigurationsByChainId: {
                    [infuraChainId]: networkConfigurationToUpdate,
                    '0x9999': buildCustomNetworkConfiguration({
                      chainId: '0x9999',
                      nativeCurrency: 'TEST-9999',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                          url: 'https://selected.endpoint',
                        }),
                      ],
                    }),
                  },
                  selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                },
                infuraProjectId: 'some-infura-project-id',
              },
              async ({ controller }) => {
                mockCreateNetworkClient()
                  .calledWith({
                    chainId: anotherInfuraChainId,
                    infuraProjectId: 'some-infura-project-id',
                    network: anotherInfuraNetworkType,
                    ticker: anotherInfuraNativeTokenName,
                    type: NetworkClientType.Infura,
                  })
                  .mockReturnValue(buildFakeClient());

                const anotherInfuraRpcEndpoint = buildInfuraRpcEndpoint(
                  anotherInfuraNetworkType,
                );
                await controller.updateNetwork(infuraChainId, {
                  ...networkConfigurationToUpdate,
                  chainId: anotherInfuraChainId,
                  defaultRpcEndpointIndex: 0,
                  nativeCurrency: anotherInfuraNativeTokenName,
                  rpcEndpoints: [
                    anotherInfuraRpcEndpoint,
                    customRpcEndpoint1,
                    customRpcEndpoint2,
                  ],
                });

                expect(
                  controller.state.networkConfigurationsByChainId,
                ).not.toHaveProperty(infuraChainId);
                expect(
                  controller.state.networkConfigurationsByChainId,
                ).toHaveProperty(anotherInfuraChainId);
                expect(
                  controller.state.networkConfigurationsByChainId[
                    anotherInfuraChainId
                  ],
                ).toStrictEqual({
                  ...networkConfigurationToUpdate,
                  chainId: anotherInfuraChainId,
                  nativeCurrency: anotherInfuraNativeTokenName,
                  rpcEndpoints: [
                    anotherInfuraRpcEndpoint,
                    {
                      ...customRpcEndpoint1,
                      networkClientId: 'CCCC-CCCC-CCCC-CCCC',
                    },
                    {
                      ...customRpcEndpoint2,
                      networkClientId: 'DDDD-DDDD-DDDD-DDDD',
                    },
                  ],
                });
              },
            );
          });

          it('destroys and unregisters every network client for each of the custom RPC endpoints (even if none of the endpoint URLs were changed)', async () => {
            uuidV4Mock
              .mockReturnValueOnce('CCCC-CCCC-CCCC-CCCC')
              .mockReturnValueOnce('DDDD-DDDD-DDDD-DDDD');

            const [defaultRpcEndpoint, customRpcEndpoint1, customRpcEndpoint2] =
              [
                buildInfuraRpcEndpoint(infuraNetworkType),
                buildCustomRpcEndpoint({
                  networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                  url: 'https://test.endpoint/1',
                }),
                buildCustomRpcEndpoint({
                  networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                  url: 'https://test.endpoint/2',
                }),
              ];
            const networkConfigurationToUpdate =
              buildInfuraNetworkConfiguration(infuraNetworkType, {
                rpcEndpoints: [
                  defaultRpcEndpoint,
                  customRpcEndpoint1,
                  customRpcEndpoint2,
                ],
              });

            await withController(
              {
                state: {
                  networkConfigurationsByChainId: {
                    [infuraChainId]: networkConfigurationToUpdate,
                    '0x9999': buildCustomNetworkConfiguration({
                      chainId: '0x9999',
                      nativeCurrency: 'TEST-9999',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                          url: 'https://selected.endpoint',
                        }),
                      ],
                    }),
                  },
                  selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                },
                infuraProjectId: 'some-infura-project-id',
              },
              async ({ controller }) => {
                mockCreateNetworkClient()
                  .calledWith({
                    chainId: anotherInfuraChainId,
                    infuraProjectId: 'some-infura-project-id',
                    network: anotherInfuraNetworkType,
                    ticker: anotherInfuraNativeTokenName,
                    type: NetworkClientType.Infura,
                  })
                  .mockReturnValue(buildFakeClient());
                const existingNetworkClient1 = controller.getNetworkClientById(
                  'AAAA-AAAA-AAAA-AAAA',
                );
                const destroySpy1 = jest.spyOn(
                  existingNetworkClient1,
                  'destroy',
                );
                const existingNetworkClient2 = controller.getNetworkClientById(
                  'BBBB-BBBB-BBBB-BBBB',
                );
                const destroySpy2 = jest.spyOn(
                  existingNetworkClient2,
                  'destroy',
                );

                await controller.updateNetwork(infuraChainId, {
                  ...networkConfigurationToUpdate,
                  chainId: anotherInfuraChainId,
                  defaultRpcEndpointIndex: 0,
                  nativeCurrency: anotherInfuraNativeTokenName,
                  rpcEndpoints: [
                    buildInfuraRpcEndpoint(anotherInfuraNetworkType),
                    customRpcEndpoint1,
                    customRpcEndpoint2,
                  ],
                });

                expect(destroySpy1).toHaveBeenCalled();
                expect(destroySpy2).toHaveBeenCalled();
                const networkClientRegistry =
                  controller.getNetworkClientRegistry();
                expect(networkClientRegistry).not.toHaveProperty(
                  'AAAA-AAAA-AAAA-AAAA',
                );
                expect(networkClientRegistry).not.toHaveProperty(
                  'BBBB-BBBB-BBBB-BBBB',
                );
              },
            );
          });

          it('creates and registers new network clients for each of the given custom RPC endpoints', async () => {
            uuidV4Mock
              .mockReturnValueOnce('CCCC-CCCC-CCCC-CCCC')
              .mockReturnValueOnce('DDDD-DDDD-DDDD-DDDD');

            const createAutoManagedNetworkClientSpy = jest.spyOn(
              createAutoManagedNetworkClientModule,
              'createAutoManagedNetworkClient',
            );

            const [defaultRpcEndpoint, customRpcEndpoint1, customRpcEndpoint2] =
              [
                buildInfuraRpcEndpoint(infuraNetworkType),
                buildCustomRpcEndpoint({
                  networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                  url: 'https://test.endpoint/1',
                }),
                buildCustomRpcEndpoint({
                  networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                  url: 'https://test.endpoint/2',
                }),
              ];
            const networkConfigurationToUpdate =
              buildInfuraNetworkConfiguration(infuraNetworkType, {
                nativeCurrency: 'ETH',
                rpcEndpoints: [
                  defaultRpcEndpoint,
                  customRpcEndpoint1,
                  customRpcEndpoint2,
                ],
              });

            await withController(
              {
                state: {
                  networkConfigurationsByChainId: {
                    [infuraChainId]: networkConfigurationToUpdate,
                    '0x9999': buildCustomNetworkConfiguration({
                      chainId: '0x9999',
                      nativeCurrency: 'TEST-9999',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                          url: 'https://selected.endpoint',
                        }),
                      ],
                    }),
                  },
                  selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                },
                infuraProjectId: 'some-infura-project-id',
              },
              async ({ controller }) => {
                mockCreateNetworkClient()
                  .calledWith({
                    chainId: anotherInfuraChainId,
                    infuraProjectId: 'some-infura-project-id',
                    network: anotherInfuraNetworkType,
                    ticker: anotherInfuraNativeTokenName,
                    type: NetworkClientType.Infura,
                  })
                  .mockReturnValue(buildFakeClient());

                await controller.updateNetwork(infuraChainId, {
                  ...networkConfigurationToUpdate,
                  chainId: anotherInfuraChainId,
                  defaultRpcEndpointIndex: 0,
                  nativeCurrency: anotherInfuraNativeTokenName,
                  rpcEndpoints: [
                    buildInfuraRpcEndpoint(anotherInfuraNetworkType),
                    customRpcEndpoint1,
                    customRpcEndpoint2,
                  ],
                });

                expect(createAutoManagedNetworkClientSpy).toHaveBeenCalledWith({
                  chainId: anotherInfuraChainId,
                  rpcUrl: 'https://test.endpoint/1',
                  ticker: anotherInfuraNativeTokenName,
                  type: NetworkClientType.Custom,
                });
                expect(createAutoManagedNetworkClientSpy).toHaveBeenCalledWith({
                  chainId: anotherInfuraChainId,
                  rpcUrl: 'https://test.endpoint/2',
                  ticker: anotherInfuraNativeTokenName,
                  type: NetworkClientType.Custom,
                });

                expect(
                  getNetworkConfigurationsByNetworkClientId(
                    controller.getNetworkClientRegistry(),
                  ),
                ).toMatchObject({
                  'CCCC-CCCC-CCCC-CCCC': {
                    chainId: anotherInfuraChainId,
                    rpcUrl: 'https://test.endpoint/1',
                    ticker: anotherInfuraNativeTokenName,
                    type: NetworkClientType.Custom,
                  },
                  'DDDD-DDDD-DDDD-DDDD': {
                    chainId: anotherInfuraChainId,
                    rpcUrl: 'https://test.endpoint/2',
                    ticker: anotherInfuraNativeTokenName,
                    type: NetworkClientType.Custom,
                  },
                });
              },
            );
          });

          it('returns the updated network configuration', async () => {
            uuidV4Mock
              .mockReturnValueOnce('CCCC-CCCC-CCCC-CCCC')
              .mockReturnValueOnce('DDDD-DDDD-DDDD-DDDD');

            const [defaultRpcEndpoint, customRpcEndpoint1, customRpcEndpoint2] =
              [
                buildInfuraRpcEndpoint(infuraNetworkType),
                buildCustomRpcEndpoint({
                  networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                  url: 'https://test.endpoint/1',
                }),
                buildCustomRpcEndpoint({
                  networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                  url: 'https://test.endpoint/2',
                }),
              ];
            const networkConfigurationToUpdate =
              buildInfuraNetworkConfiguration(infuraNetworkType, {
                rpcEndpoints: [
                  defaultRpcEndpoint,
                  customRpcEndpoint1,
                  customRpcEndpoint2,
                ],
              });

            await withController(
              {
                state: {
                  networkConfigurationsByChainId: {
                    [infuraChainId]: networkConfigurationToUpdate,
                    '0x9999': buildCustomNetworkConfiguration({
                      chainId: '0x9999',
                      nativeCurrency: 'TEST-9999',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                          url: 'https://selected.endpoint',
                        }),
                      ],
                    }),
                  },
                  selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                },
                infuraProjectId: 'some-infura-project-id',
              },
              async ({ controller }) => {
                mockCreateNetworkClient()
                  .calledWith({
                    chainId: anotherInfuraChainId,
                    infuraProjectId: 'some-infura-project-id',
                    network: anotherInfuraNetworkType,
                    ticker: anotherInfuraNativeTokenName,
                    type: NetworkClientType.Infura,
                  })
                  .mockReturnValue(buildFakeClient());

                const anotherInfuraRpcEndpoint = buildInfuraRpcEndpoint(
                  anotherInfuraNetworkType,
                );
                const updatedNetworkConfiguration =
                  await controller.updateNetwork(infuraChainId, {
                    ...networkConfigurationToUpdate,
                    chainId: anotherInfuraChainId,
                    defaultRpcEndpointIndex: 0,
                    nativeCurrency: anotherInfuraNativeTokenName,
                    rpcEndpoints: [
                      anotherInfuraRpcEndpoint,
                      customRpcEndpoint1,
                      customRpcEndpoint2,
                    ],
                  });

                expect(updatedNetworkConfiguration).toStrictEqual({
                  ...networkConfigurationToUpdate,
                  chainId: anotherInfuraChainId,
                  defaultRpcEndpointIndex: 0,
                  nativeCurrency: anotherInfuraNativeTokenName,
                  rpcEndpoints: [
                    anotherInfuraRpcEndpoint,
                    {
                      ...customRpcEndpoint1,
                      networkClientId: 'CCCC-CCCC-CCCC-CCCC',
                    },
                    {
                      ...customRpcEndpoint2,
                      networkClientId: 'DDDD-DDDD-DDDD-DDDD',
                    },
                  ],
                });
              },
            );
          });

          describe('if one of the RPC endpoints was represented by the selected network client', () => {
            it('invisibly selects the network client created for the RPC endpoint', async () => {
              uuidV4Mock.mockReturnValueOnce('BBBB-BBBB-BBBB-BBBB');
              const networkConfigurationToUpdate =
                buildInfuraNetworkConfiguration(infuraNetworkType, {
                  nativeCurrency: 'TOKEN',
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      name: 'Endpoint 1',
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      url: 'https://rpc.endpoint',
                    }),
                  ],
                });

              await withController(
                {
                  state: {
                    selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
                    networkConfigurationsByChainId: {
                      [infuraChainId]: networkConfigurationToUpdate,
                    },
                  },
                },
                async ({ controller }) => {
                  const fakeProviders = [
                    buildFakeProvider([
                      {
                        request: {
                          method: 'test',
                        },
                        response: {
                          result: 'test response from 1',
                        },
                      },
                    ]),
                    buildFakeProvider([
                      {
                        request: {
                          method: 'test',
                        },
                        response: {
                          result: 'test response from 2',
                        },
                      },
                    ]),
                  ];
                  const fakeNetworkClients = [
                    buildFakeClient(fakeProviders[0]),
                    buildFakeClient(fakeProviders[1]),
                  ];
                  mockCreateNetworkClient()
                    .calledWith({
                      chainId: infuraChainId,
                      rpcUrl: 'https://rpc.endpoint',
                      ticker: 'TOKEN',
                      type: NetworkClientType.Custom,
                    })
                    .mockReturnValue(fakeNetworkClients[0])
                    .calledWith({
                      chainId: anotherInfuraChainId,
                      rpcUrl: 'https://rpc.endpoint',
                      ticker: 'TOKEN',
                      type: NetworkClientType.Custom,
                    })
                    .mockReturnValue(fakeNetworkClients[1]);
                  await controller.initializeProvider();
                  expect(controller.state.selectedNetworkClientId).toBe(
                    'AAAA-AAAA-AAAA-AAAA',
                  );
                  const networkClient1 = controller.getSelectedNetworkClient();
                  assert(networkClient1, 'Network client is somehow unset');
                  const result1 = await networkClient1.provider.request({
                    method: 'test',
                  });
                  expect(result1).toBe('test response from 1');

                  await controller.updateNetwork(infuraChainId, {
                    ...networkConfigurationToUpdate,
                    chainId: anotherInfuraChainId,
                  });

                  expect(controller.state.selectedNetworkClientId).toBe(
                    'BBBB-BBBB-BBBB-BBBB',
                  );
                  const networkClient2 = controller.getSelectedNetworkClient();
                  assert(networkClient2, 'Network client is somehow unset');
                  const result2 = await networkClient1.provider.request({
                    method: 'test',
                  });
                  expect(result2).toBe('test response from 2');
                },
              );
            });

            it('updates selectedNetworkClientId and networkConfigurationsByChainId at the same time', async () => {
              uuidV4Mock.mockReturnValueOnce('BBBB-BBBB-BBBB-BBBB');
              const networkConfigurationToUpdate =
                buildInfuraNetworkConfiguration(infuraNetworkType, {
                  nativeCurrency: 'TOKEN',
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      name: 'Endpoint 1',
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      url: 'https://rpc.endpoint',
                    }),
                  ],
                });

              await withController(
                {
                  state: {
                    selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
                    networkConfigurationsByChainId: {
                      [infuraChainId]: networkConfigurationToUpdate,
                    },
                  },
                },
                async ({ controller, messenger }) => {
                  const fakeProviders = [
                    buildFakeProvider([
                      {
                        request: {
                          method: 'test',
                        },
                        response: {
                          result: 'test response from 1',
                        },
                      },
                    ]),
                    buildFakeProvider([
                      {
                        request: {
                          method: 'test',
                        },
                        response: {
                          result: 'test response from 2',
                        },
                      },
                    ]),
                  ];
                  const fakeNetworkClients = [
                    buildFakeClient(fakeProviders[0]),
                    buildFakeClient(fakeProviders[1]),
                  ];
                  mockCreateNetworkClient()
                    .calledWith({
                      chainId: infuraChainId,
                      rpcUrl: 'https://rpc.endpoint',
                      ticker: 'TOKEN',
                      type: NetworkClientType.Custom,
                    })
                    .mockReturnValue(fakeNetworkClients[0])
                    .calledWith({
                      chainId: anotherInfuraChainId,
                      rpcUrl: 'https://rpc.endpoint',
                      ticker: 'TOKEN',
                      type: NetworkClientType.Custom,
                    })
                    .mockReturnValue(fakeNetworkClients[1]);
                  await controller.initializeProvider();

                  const promiseForStateChanges = waitForStateChanges({
                    messenger,
                    count: 1,
                  });

                  await controller.updateNetwork(infuraChainId, {
                    ...networkConfigurationToUpdate,
                    chainId: anotherInfuraChainId,
                  });
                  const stateChanges = await promiseForStateChanges;
                  expect(stateChanges).toStrictEqual([
                    [
                      expect.any(Object),
                      expect.arrayContaining([
                        expect.objectContaining({
                          op: 'replace',
                          path: ['selectedNetworkClientId'],
                          value: 'BBBB-BBBB-BBBB-BBBB',
                        }),
                        expect.objectContaining({
                          op: 'remove',
                          path: [
                            'networkConfigurationsByChainId',
                            infuraChainId,
                          ],
                        }),
                        expect.objectContaining({
                          op: 'add',
                          path: [
                            'networkConfigurationsByChainId',
                            anotherInfuraChainId,
                          ],
                        }),
                      ]),
                    ],
                  ]);
                },
              );
            });
          });
        });
      },
    );

    describe('if the chain ID is being changed from one non-Infura-supported chain to another', () => {
      it('throws if a network configuration for a custom network is already registered under the new chain ID', async () => {
        const networkConfigurationToUpdate = buildCustomNetworkConfiguration({
          chainId: '0x1337',
        });

        await withController(
          {
            state: {
              networkConfigurationsByChainId: {
                '0x1337': networkConfigurationToUpdate,
                '0x2448': buildNetworkConfiguration({
                  name: 'Some Network',
                  chainId: '0x2448'
                }),
                '0x9999': buildCustomNetworkConfiguration({
                  chainId: '0x9999',
                  nativeCurrency: 'TEST-9999',
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                      url: 'https://selected.endpoint',
                    }),
                  ],
                }),
              },
              selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
            },
          },
          async ({ controller }) => {
            await expect(() =>
              controller.updateNetwork('0x1337', {
                ...networkConfigurationToUpdate,
                chainId: '0x2448',
              }),
            ).rejects.toThrow(
              "Cannot move network from chain 0x1337 to 0x2448 as another network for that chain already exists ('Some Network')",
            );
          },
        );
      });

      it('throws (albeit for a different reason) if an Infura RPC endpoint is being added that represents a different chain than the one being changed to', async () => {
        const networkConfigurationToUpdate = buildCustomNetworkConfiguration({
          chainId: '0x1337',
        });

        await withController(
          {
            state: {
              networkConfigurationsByChainId: {
                '0x1337': networkConfigurationToUpdate,
                [ChainId.goerli]: buildInfuraNetworkConfiguration(
                  InfuraNetworkType.goerli,
                ),
                '0x9999': buildCustomNetworkConfiguration({
                  chainId: '0x9999',
                  nativeCurrency: 'TEST-9999',
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                      url: 'https://selected.endpoint',
                    }),
                  ],
                }),
              },
              selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
            },
          },
          async ({ controller }) => {
            const newRpcEndpoint = buildInfuraRpcEndpoint(
              InfuraNetworkType.goerli,
            );
            await expect(() =>
              controller.updateNetwork('0x1337', {
                ...networkConfigurationToUpdate,
                chainId: '0x2448',
                rpcEndpoints: [newRpcEndpoint],
              }),
            ).rejects.toThrow(
              new Error(
                "Could not update network to point to same RPC endpoint as existing network for chain 0x5 ('Goerli')",
              ),
            );
          },
        );
      });

      it('re-files the existing network configuration from under the old chain ID to under the new one, regenerating network client IDs for each RPC endpoint', async () => {
        uuidV4Mock
          .mockReturnValueOnce('CCCC-CCCC-CCCC-CCCC')
          .mockReturnValueOnce('DDDD-DDDD-DDDD-DDDD');

        const [rpcEndpoint1, rpcEndpoint2] = [
          buildCustomRpcEndpoint({
            networkClientId: 'AAAA-AAAA-AAAA-AAAA',
            url: 'https://test.endpoint/1',
          }),
          buildCustomRpcEndpoint({
            networkClientId: 'BBBB-BBBB-BBBB-BBBB',
            url: 'https://test.endpoint/2',
          }),
        ];
        const networkConfigurationToUpdate = buildNetworkConfiguration({
          chainId: '0x1337',
          rpcEndpoints: [rpcEndpoint1, rpcEndpoint2],
        });

        await withController(
          {
            state: {
              networkConfigurationsByChainId: {
                '0x1337': networkConfigurationToUpdate,
                '0x9999': buildCustomNetworkConfiguration({
                  chainId: '0x9999',
                  nativeCurrency: 'TEST-9999',
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                      url: 'https://selected.endpoint',
                    }),
                  ],
                }),
              },
              selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
            },
          },
          async ({ controller }) => {
            const fakeProviders = [
              buildFakeProvider([
                {
                  request: {
                    method: 'test',
                  },
                  response: {
                    result: 'test response from 1',
                  },
                },
              ]),
            ];
            const fakeNetworkClients = [buildFakeClient(fakeProviders[0])];
            mockCreateNetworkClient()
              .calledWith({
                chainId: '0x2448',
                rpcUrl: 'https://test.endpoint/1',
                ticker: 'TOKEN',
                type: NetworkClientType.Custom,
              })
              .mockReturnValue(fakeNetworkClients[0]);

            await controller.updateNetwork('0x1337', {
              ...networkConfigurationToUpdate,
              chainId: '0x2448',
            });

            expect(
              controller.state.networkConfigurationsByChainId,
            ).not.toHaveProperty('0x1337');
            expect(
              controller.state.networkConfigurationsByChainId,
            ).toHaveProperty('0x2448');
            expect(
              controller.state.networkConfigurationsByChainId['0x2448'],
            ).toStrictEqual({
              ...networkConfigurationToUpdate,
              chainId: '0x2448',
              rpcEndpoints: [
                {
                  ...rpcEndpoint1,
                  networkClientId: 'CCCC-CCCC-CCCC-CCCC',
                },
                {
                  ...rpcEndpoint2,
                  networkClientId: 'DDDD-DDDD-DDDD-DDDD',
                },
              ],
            });
          },
        );
      });

      it('destroys and unregisters every network client for each of the RPC endpoints (even if none of the endpoint URLs were changed)', async () => {
        const networkConfigurationToUpdate = buildNetworkConfiguration({
          chainId: '0x1337',
          rpcEndpoints: [
            buildCustomRpcEndpoint({
              name: 'Test Network 1',
              networkClientId: 'AAAA-AAAA-AAAA-AAAA',
              url: 'https://test.endpoint/1',
            }),
            buildCustomRpcEndpoint({
              name: 'Test Network 2',
              networkClientId: 'BBBB-BBBB-BBBB-BBBB',
              url: 'https://test.endpoint/2',
            }),
          ],
        });

        await withController(
          {
            state: {
              networkConfigurationsByChainId: {
                '0x1337': networkConfigurationToUpdate,
                '0x9999': buildCustomNetworkConfiguration({
                  chainId: '0x9999',
                  nativeCurrency: 'TEST-9999',
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                      url: 'https://selected.endpoint',
                    }),
                  ],
                }),
              },
              selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
            },
          },
          async ({ controller }) => {
            const fakeProviders = [
              buildFakeProvider([
                {
                  request: {
                    method: 'test',
                  },
                  response: {
                    result: 'test response from 1',
                  },
                },
              ]),
            ];
            const fakeNetworkClients = [buildFakeClient(fakeProviders[0])];
            mockCreateNetworkClient()
              .calledWith({
                chainId: '0x2448',
                rpcUrl: 'https://test.endpoint/1',
                ticker: 'TOKEN',
                type: NetworkClientType.Custom,
              })
              .mockReturnValue(fakeNetworkClients[0]);
            const existingNetworkClient1 = controller.getNetworkClientById(
              'AAAA-AAAA-AAAA-AAAA',
            );
            const destroySpy1 = jest.spyOn(existingNetworkClient1, 'destroy');
            const existingNetworkClient2 = controller.getNetworkClientById(
              'BBBB-BBBB-BBBB-BBBB',
            );
            const destroySpy2 = jest.spyOn(existingNetworkClient2, 'destroy');

            await controller.updateNetwork('0x1337', {
              ...networkConfigurationToUpdate,
              chainId: '0x2448',
            });

            expect(destroySpy1).toHaveBeenCalled();
            expect(destroySpy2).toHaveBeenCalled();
            const networkClientRegistry = controller.getNetworkClientRegistry();
            expect(networkClientRegistry).not.toHaveProperty(
              'AAAA-AAAA-AAAA-AAAA',
            );
            expect(networkClientRegistry).not.toHaveProperty(
              'BBBB-BBBB-BBBB-BBBB',
            );
          },
        );
      });

      it('creates and registers new network clients for each of the given RPC endpoints', async () => {
        uuidV4Mock
          .mockReturnValueOnce('CCCC-CCCC-CCCC-CCCC')
          .mockReturnValueOnce('DDDD-DDDD-DDDD-DDDD');

        const createAutoManagedNetworkClientSpy = jest.spyOn(
          createAutoManagedNetworkClientModule,
          'createAutoManagedNetworkClient',
        );

        const networkConfigurationToUpdate = buildNetworkConfiguration({
          chainId: '0x1337',
          nativeCurrency: 'TOKEN',
          rpcEndpoints: [
            buildCustomRpcEndpoint({
              name: 'Test Network 1',
              networkClientId: 'AAAA-AAAA-AAAA-AAAA',
              url: 'https://test.endpoint/1',
            }),
            buildCustomRpcEndpoint({
              name: 'Test Network 2',
              networkClientId: 'BBBB-BBBB-BBBB-BBBB',
              url: 'https://test.endpoint/2',
            }),
          ],
        });

        await withController(
          {
            state: {
              networkConfigurationsByChainId: {
                '0x1337': networkConfigurationToUpdate,
                '0x9999': buildCustomNetworkConfiguration({
                  chainId: '0x9999',
                  nativeCurrency: 'TEST-9999',
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                      url: 'https://selected.endpoint',
                    }),
                  ],
                }),
              },
              selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
            },
          },
          async ({ controller }) => {
            const fakeProviders = [
              buildFakeProvider([
                {
                  request: {
                    method: 'test',
                  },
                  response: {
                    result: 'test response from 1',
                  },
                },
              ]),
            ];
            const fakeNetworkClients = [buildFakeClient(fakeProviders[0])];
            mockCreateNetworkClient()
              .calledWith({
                chainId: '0x2448',
                rpcUrl: 'https://test.endpoint/1',
                ticker: 'TOKEN',
                type: NetworkClientType.Custom,
              })
              .mockReturnValue(fakeNetworkClients[0]);

            await controller.updateNetwork('0x1337', {
              ...networkConfigurationToUpdate,
              chainId: '0x2448',
            });

            expect(createAutoManagedNetworkClientSpy).toHaveBeenCalledWith({
              chainId: '0x2448',
              rpcUrl: 'https://test.endpoint/1',
              ticker: 'TOKEN',
              type: NetworkClientType.Custom,
            });
            expect(createAutoManagedNetworkClientSpy).toHaveBeenCalledWith({
              chainId: '0x2448',
              rpcUrl: 'https://test.endpoint/2',
              ticker: 'TOKEN',
              type: NetworkClientType.Custom,
            });

            expect(
              getNetworkConfigurationsByNetworkClientId(
                controller.getNetworkClientRegistry(),
              ),
            ).toMatchObject({
              'CCCC-CCCC-CCCC-CCCC': {
                chainId: '0x2448',
                rpcUrl: 'https://test.endpoint/1',
                ticker: 'TOKEN',
                type: NetworkClientType.Custom,
              },
              'DDDD-DDDD-DDDD-DDDD': {
                chainId: '0x2448',
                rpcUrl: 'https://test.endpoint/2',
                ticker: 'TOKEN',
                type: NetworkClientType.Custom,
              },
            });
          },
        );
      });

      it('returns the updated network configuration', async () => {
        uuidV4Mock
          .mockReturnValueOnce('CCCC-CCCC-CCCC-CCCC')
          .mockReturnValueOnce('DDDD-DDDD-DDDD-DDDD');

        const [rpcEndpoint1, rpcEndpoint2] = [
          buildCustomRpcEndpoint({
            networkClientId: 'AAAA-AAAA-AAAA-AAAA',
            url: 'https://test.endpoint/1',
          }),
          buildCustomRpcEndpoint({
            networkClientId: 'BBBB-BBBB-BBBB-BBBB',
            url: 'https://test.endpoint/2',
          }),
        ];
        const networkConfigurationToUpdate = buildNetworkConfiguration({
          chainId: '0x1337',
          rpcEndpoints: [rpcEndpoint1, rpcEndpoint2],
        });

        await withController(
          {
            state: {
              networkConfigurationsByChainId: {
                '0x1337': networkConfigurationToUpdate,
                '0x9999': buildCustomNetworkConfiguration({
                  chainId: '0x9999',
                  nativeCurrency: 'TEST-9999',
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                      url: 'https://selected.endpoint',
                    }),
                  ],
                }),
              },
              selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
            },
          },
          async ({ controller }) => {
            const fakeProviders = [
              buildFakeProvider([
                {
                  request: {
                    method: 'test',
                  },
                  response: {
                    result: 'test response from 1',
                  },
                },
              ]),
            ];
            const fakeNetworkClients = [buildFakeClient(fakeProviders[0])];
            mockCreateNetworkClient()
              .calledWith({
                chainId: '0x2448',
                rpcUrl: 'https://test.endpoint/1',
                ticker: 'TOKEN',
                type: NetworkClientType.Custom,
              })
              .mockReturnValue(fakeNetworkClients[0]);

            const updatedNetworkConfiguration = await controller.updateNetwork(
              '0x1337',
              {
                ...networkConfigurationToUpdate,
                chainId: '0x2448',
              },
            );

            expect(updatedNetworkConfiguration).toStrictEqual({
              ...networkConfigurationToUpdate,
              chainId: '0x2448',
              rpcEndpoints: [
                {
                  ...rpcEndpoint1,
                  networkClientId: 'CCCC-CCCC-CCCC-CCCC',
                },
                {
                  ...rpcEndpoint2,
                  networkClientId: 'DDDD-DDDD-DDDD-DDDD',
                },
              ],
            });
          },
        );
      });

      describe('if one of the RPC endpoints was represented by the selected network client', () => {
        it('invisibly selects the network client created for the RPC endpoint', async () => {
          uuidV4Mock.mockReturnValueOnce('BBBB-BBBB-BBBB-BBBB');
          const networkConfigurationToUpdate = buildCustomNetworkConfiguration({
            nativeCurrency: 'TOKEN',
            rpcEndpoints: [
              buildCustomRpcEndpoint({
                name: 'Endpoint 1',
                networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                url: 'https://rpc.endpoint',
              }),
            ],
          });

          await withController(
            {
              state: {
                selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
                networkConfigurationsByChainId: {
                  '0x1337': networkConfigurationToUpdate,
                },
              },
            },
            async ({ controller }) => {
              const fakeProviders = [
                buildFakeProvider([
                  {
                    request: {
                      method: 'test',
                    },
                    response: {
                      result: 'test response from 1',
                    },
                  },
                ]),
                buildFakeProvider([
                  {
                    request: {
                      method: 'test',
                    },
                    response: {
                      result: 'test response from 2',
                    },
                  },
                ]),
              ];
              const fakeNetworkClients = [
                buildFakeClient(fakeProviders[0]),
                buildFakeClient(fakeProviders[1]),
              ];
              mockCreateNetworkClient()
                .calledWith({
                  chainId: '0x1337',
                  rpcUrl: 'https://rpc.endpoint',
                  ticker: 'TOKEN',
                  type: NetworkClientType.Custom,
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  chainId: '0x2448',
                  rpcUrl: 'https://rpc.endpoint',
                  ticker: 'TOKEN',
                  type: NetworkClientType.Custom,
                })
                .mockReturnValue(fakeNetworkClients[1]);
              await controller.initializeProvider();
              expect(controller.state.selectedNetworkClientId).toBe(
                'AAAA-AAAA-AAAA-AAAA',
              );
              const networkClient1 = controller.getSelectedNetworkClient();
              assert(networkClient1, 'Network client is somehow unset');
              const result1 = await networkClient1.provider.request({
                method: 'test',
              });
              expect(result1).toBe('test response from 1');

              await controller.updateNetwork('0x1337', {
                ...networkConfigurationToUpdate,
                chainId: '0x2448',
              });

              expect(controller.state.selectedNetworkClientId).toBe(
                'BBBB-BBBB-BBBB-BBBB',
              );
              const networkClient2 = controller.getSelectedNetworkClient();
              assert(networkClient2, 'Network client is somehow unset');
              const result2 = await networkClient1.provider.request({
                method: 'test',
              });
              expect(result2).toBe('test response from 2');
            },
          );
        });

        it('updates selectedNetworkClientId and networkConfigurationsByChainId at the same time', async () => {
          uuidV4Mock.mockReturnValueOnce('BBBB-BBBB-BBBB-BBBB');
          const networkConfigurationToUpdate = buildCustomNetworkConfiguration({
            nativeCurrency: 'TOKEN',
            rpcEndpoints: [
              buildCustomRpcEndpoint({
                name: 'Endpoint 1',
                networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                url: 'https://rpc.endpoint',
              }),
            ],
          });

          await withController(
            {
              state: {
                selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
                networkConfigurationsByChainId: {
                  '0x1337': networkConfigurationToUpdate,
                },
              },
            },
            async ({ controller, messenger }) => {
              const fakeProviders = [
                buildFakeProvider([
                  {
                    request: {
                      method: 'test',
                    },
                    response: {
                      result: 'test response from 1',
                    },
                  },
                ]),
                buildFakeProvider([
                  {
                    request: {
                      method: 'test',
                    },
                    response: {
                      result: 'test response from 2',
                    },
                  },
                ]),
              ];
              const fakeNetworkClients = [
                buildFakeClient(fakeProviders[0]),
                buildFakeClient(fakeProviders[1]),
              ];
              mockCreateNetworkClient()
                .calledWith({
                  chainId: '0x1337',
                  rpcUrl: 'https://rpc.endpoint',
                  ticker: 'TOKEN',
                  type: NetworkClientType.Custom,
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  chainId: '0x2448',
                  rpcUrl: 'https://rpc.endpoint',
                  ticker: 'TOKEN',
                  type: NetworkClientType.Custom,
                })
                .mockReturnValue(fakeNetworkClients[1]);
              await controller.initializeProvider();

              const promiseForStateChanges = waitForStateChanges({
                messenger,
                count: 1,
              });

              await controller.updateNetwork('0x1337', {
                ...networkConfigurationToUpdate,
                chainId: '0x2448',
              });
              const stateChanges = await promiseForStateChanges;
              expect(stateChanges).toStrictEqual([
                [
                  expect.any(Object),
                  expect.arrayContaining([
                    expect.objectContaining({
                      op: 'replace',
                      path: ['selectedNetworkClientId'],
                      value: 'BBBB-BBBB-BBBB-BBBB',
                    }),
                    expect.objectContaining({
                      op: 'remove',
                      path: ['networkConfigurationsByChainId', '0x1337'],
                    }),
                    expect.objectContaining({
                      op: 'add',
                      path: ['networkConfigurationsByChainId', '0x2448'],
                    }),
                  ]),
                ],
              ]);
            },
          );
        });
      });
    });

    describe('if nothing is being changed', () => {
      for (const infuraNetworkType of Object.values(InfuraNetworkType)) {
        const infuraChainId = ChainId[infuraNetworkType];

        // This is a string.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        describe(`given the ID of the Infura-supported chain ${infuraChainId}`, () => {
          it('makes no updates to state', async () => {
            const existingNetworkConfiguration =
              buildInfuraNetworkConfiguration(infuraNetworkType);

            await withController(
              {
                state: {
                  networkConfigurationsByChainId: {
                    [infuraChainId]: existingNetworkConfiguration,
                    '0x9999': buildCustomNetworkConfiguration({
                      chainId: '0x9999',
                      nativeCurrency: 'TEST-9999',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                          url: 'https://selected.endpoint',
                        }),
                      ],
                    }),
                  },
                  selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                },
              },
              async ({ controller }) => {
                await controller.updateNetwork(
                  infuraChainId,
                  existingNetworkConfiguration,
                );

                expect(
                  controller.state.networkConfigurationsByChainId[
                    infuraChainId
                  ],
                ).toStrictEqual(existingNetworkConfiguration);
              },
            );
          });

          it('does not destroy any existing clients for the network', async () => {
            const existingNetworkConfiguration =
              buildInfuraNetworkConfiguration(infuraNetworkType);

            await withController(
              {
                state: {
                  networkConfigurationsByChainId: {
                    [infuraChainId]: existingNetworkConfiguration,
                    '0x9999': buildCustomNetworkConfiguration({
                      chainId: '0x9999',
                      nativeCurrency: 'TEST-9999',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                          url: 'https://selected.endpoint',
                        }),
                      ],
                    }),
                  },
                  selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                },
              },
              async ({ controller }) => {
                const existingNetworkClient =
                  controller.getNetworkClientById(infuraNetworkType);
                const destroySpy = jest.spyOn(existingNetworkClient, 'destroy');

                await controller.updateNetwork(
                  infuraChainId,
                  existingNetworkConfiguration,
                );

                expect(destroySpy).not.toHaveBeenCalled();
              },
            );
          });

          it('does not create any new clients for the network', async () => {
            const existingNetworkConfiguration =
              buildInfuraNetworkConfiguration(infuraNetworkType);

            const createAutoManagedNetworkClientSpy = jest.spyOn(
              createAutoManagedNetworkClientModule,
              'createAutoManagedNetworkClient',
            );

            await withController(
              {
                state: {
                  networkConfigurationsByChainId: {
                    [infuraChainId]: existingNetworkConfiguration,
                    '0x9999': buildCustomNetworkConfiguration({
                      chainId: '0x9999',
                      nativeCurrency: 'TEST-9999',
                      rpcEndpoints: [
                        buildCustomRpcEndpoint({
                          networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                          url: 'https://selected.endpoint',
                        }),
                      ],
                    }),
                  },
                  selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                },
              },
              async ({ controller }) => {
                await controller.updateNetwork(
                  infuraChainId,
                  existingNetworkConfiguration,
                );

                // 2 times for existing RPC endpoints, but no more
                expect(createAutoManagedNetworkClientSpy).toHaveBeenCalledTimes(
                  2,
                );
              },
            );
          });
        });
      }

      describe('given the ID of a non-Infura-supported chain', () => {
        it('makes no updates to state', async () => {
          const existingNetworkConfiguration = buildCustomNetworkConfiguration({
            chainId: '0x1337',
          });

          await withController(
            {
              state: {
                networkConfigurationsByChainId: {
                  '0x1337': existingNetworkConfiguration,
                  '0x9999': buildCustomNetworkConfiguration({
                    chainId: '0x9999',
                    nativeCurrency: 'TEST-9999',
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                        url: 'https://selected.endpoint',
                      }),
                    ],
                  }),
                },
                selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
              },
            },
            async ({ controller }) => {
              await controller.updateNetwork(
                '0x1337',
                existingNetworkConfiguration,
              );

              expect(
                controller.state.networkConfigurationsByChainId['0x1337'],
              ).toStrictEqual(existingNetworkConfiguration);
            },
          );
        });

        it('does not destroy any existing clients for the network', async () => {
          const existingNetworkConfiguration = buildCustomNetworkConfiguration({
            chainId: '0x1337',
            rpcEndpoints: [
              buildCustomRpcEndpoint({
                networkClientId: 'AAAA-AAAA-AAAA-AAAA',
              }),
            ],
          });

          await withController(
            {
              state: {
                networkConfigurationsByChainId: {
                  '0x1337': existingNetworkConfiguration,
                  '0x9999': buildCustomNetworkConfiguration({
                    chainId: '0x9999',
                    nativeCurrency: 'TEST-9999',
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                        url: 'https://selected.endpoint',
                      }),
                    ],
                  }),
                },
                selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
              },
            },
            async ({ controller }) => {
              const existingNetworkClient = controller.getNetworkClientById(
                'AAAA-AAAA-AAAA-AAAA',
              );
              const destroySpy = jest.spyOn(existingNetworkClient, 'destroy');

              await controller.updateNetwork(
                '0x1337',
                existingNetworkConfiguration,
              );

              expect(destroySpy).not.toHaveBeenCalled();
            },
          );
        });

        it('does not create any new clients for the network', async () => {
          const existingNetworkConfiguration = buildCustomNetworkConfiguration({
            chainId: '0x1337',
          });

          const createAutoManagedNetworkClientSpy = jest.spyOn(
            createAutoManagedNetworkClientModule,
            'createAutoManagedNetworkClient',
          );

          await withController(
            {
              state: {
                networkConfigurationsByChainId: {
                  '0x1337': existingNetworkConfiguration,
                  '0x9999': buildCustomNetworkConfiguration({
                    chainId: '0x9999',
                    nativeCurrency: 'TEST-9999',
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        networkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
                        url: 'https://selected.endpoint',
                      }),
                    ],
                  }),
                },
                selectedNetworkClientId: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
              },
            },
            async ({ controller }) => {
              await controller.updateNetwork(
                '0x1337',
                existingNetworkConfiguration,
              );

              // 2 times for existing RPC endpoints, but no more
              expect(createAutoManagedNetworkClientSpy).toHaveBeenCalledTimes(
                2,
              );
            },
          );
        });
      });
    });
  });

  describe('removeNetwork', () => {
    it('throws if the given chain ID does not refer to an existing network configuration', async () => {
      await withController(({ controller }) => {
        expect(() => controller.removeNetwork('0x1337')).toThrow(
          new Error("Cannot find network configuration for chain '0x1337'"),
        );
      });
    });

    it('throws if selectedNetworkClientId matches the networkClientId of any RPC endpoint in the existing network configuration', async () => {
      await withController(
        {
          state: {
            selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
            networkConfigurationsByChainId: {
              '0x1337': buildCustomNetworkConfiguration({
                rpcEndpoints: [
                  buildCustomRpcEndpoint({
                    networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                  }),
                ],
              }),
            },
          },
        },
        ({ controller }) => {
          expect(() => controller.removeNetwork('0x1337')).toThrow(
            'Cannot remove the currently selected network',
          );
        },
      );
    });

    for (const infuraNetworkType of Object.values(InfuraNetworkType)) {
      const infuraChainId = ChainId[infuraNetworkType];

      // This is a string.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      describe(`given the ID of the Infura-supported chain ${infuraChainId}`, () => {
        it('removes the existing network configuration from state', async () => {
          await withController(
            {
              state: {
                selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
                networkConfigurationsByChainId: {
                  [infuraChainId]:
                    buildInfuraNetworkConfiguration(infuraNetworkType),
                  '0x1337': buildCustomNetworkConfiguration({
                    chainId: '0x1337',
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      }),
                    ],
                  }),
                },
              },
            },
            ({ controller }) => {
              expect(
                controller.state.networkConfigurationsByChainId,
              ).toHaveProperty(infuraChainId);

              controller.removeNetwork(infuraChainId);

              expect(
                controller.state.networkConfigurationsByChainId,
              ).not.toHaveProperty(infuraChainId);
            },
          );
        });

        it('destroys and unregisters the network clients for each of the RPC endpoints defined in the network configuration (even the Infura endpoint)', async () => {
          const defaultRpcEndpoint = buildInfuraRpcEndpoint(infuraNetworkType);

          await withController(
            {
              state: {
                selectedNetworkClientId: 'BBBB-BBBB-BBBB-BBBB',
                networkConfigurationsByChainId: {
                  [infuraChainId]: buildInfuraNetworkConfiguration(
                    infuraNetworkType,
                    {
                      rpcEndpoints: [
                        defaultRpcEndpoint,
                        buildCustomRpcEndpoint({
                          name: 'Test Network',
                          networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                          url: 'https://test.endpoint',
                        }),
                      ],
                    },
                  ),
                  '0x1337': buildCustomNetworkConfiguration({
                    chainId: '0x1337',
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                      }),
                    ],
                  }),
                },
              },
            },
            ({ controller }) => {
              const existingNetworkClient1 =
                controller.getNetworkClientById(infuraNetworkType);
              const destroySpy1 = jest.spyOn(existingNetworkClient1, 'destroy');
              const existingNetworkClient2 = controller.getNetworkClientById(
                'AAAA-AAAA-AAAA-AAAA',
              );
              const destroySpy2 = jest.spyOn(existingNetworkClient2, 'destroy');

              controller.removeNetwork(infuraChainId);

              expect(destroySpy1).toHaveBeenCalled();
              expect(destroySpy2).toHaveBeenCalled();
              const networkClientRegistry =
                controller.getNetworkClientRegistry();
              expect(networkClientRegistry).not.toHaveProperty(
                infuraNetworkType,
              );
              expect(networkClientRegistry).not.toHaveProperty(
                'AAAA-AAAA-AAAA-AAAA',
              );
            },
          );
        });
      });
    }

    describe('given the ID of a non-Infura-supported chain', () => {
      it('removes the existing network configuration', async () => {
        await withController(
          {
            state: {
              selectedNetworkClientId: InfuraNetworkType.goerli,
              networkConfigurationsByChainId: {
                '0x1337': buildCustomNetworkConfiguration(),
                [ChainId.goerli]: buildInfuraNetworkConfiguration(
                  InfuraNetworkType.goerli,
                ),
              },
            },
          },
          ({ controller }) => {
            expect(
              controller.state.networkConfigurationsByChainId,
            ).toHaveProperty('0x1337');

            controller.removeNetwork('0x1337');

            expect(
              controller.state.networkConfigurationsByChainId,
            ).not.toHaveProperty('0x1337');
          },
        );
      });

      it('destroys the network clients for each of the RPC endpoints defined in the network configuration', async () => {
        await withController(
          {
            state: {
              selectedNetworkClientId: InfuraNetworkType.goerli,
              networkConfigurationsByChainId: {
                '0x1337': buildCustomNetworkConfiguration({
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      name: 'Test Network 1',
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      url: 'https://test.endpoint/1',
                    }),
                    buildCustomRpcEndpoint({
                      name: 'Test Network 2',
                      networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                      url: 'https://test.endpoint/2',
                    }),
                  ],
                }),
                [ChainId.goerli]: buildInfuraNetworkConfiguration(
                  InfuraNetworkType.goerli,
                ),
              },
            },
          },
          ({ controller }) => {
            const existingNetworkClient1 = controller.getNetworkClientById(
              'AAAA-AAAA-AAAA-AAAA',
            );
            const destroySpy1 = jest.spyOn(existingNetworkClient1, 'destroy');
            const existingNetworkClient2 = controller.getNetworkClientById(
              'BBBB-BBBB-BBBB-BBBB',
            );
            const destroySpy2 = jest.spyOn(existingNetworkClient2, 'destroy');

            controller.removeNetwork('0x1337');

            expect(destroySpy1).toHaveBeenCalled();
            expect(destroySpy2).toHaveBeenCalled();
            const networkClientRegistry = controller.getNetworkClientRegistry();
            expect(networkClientRegistry).not.toHaveProperty(
              'AAAA-AAAA-AAAA-AAAA',
            );
            expect(networkClientRegistry).not.toHaveProperty(
              'BBBB-BBBB-BBBB-BBBB',
            );
          },
        );
      });
    });
  });

  describe('rollbackToPreviousProvider', () => {
    describe('when called not following any network switches', () => {
      for (const infuraNetworkType of Object.values(InfuraNetworkType)) {
        // False negative - this is a string.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        describe(`when the selected network client represents the Infura network "${infuraNetworkType}"`, () => {
          refreshNetworkTests({
            expectedNetworkClientConfiguration:
              buildInfuraNetworkClientConfiguration(infuraNetworkType),
            initialState: {
              selectedNetworkClientId: infuraNetworkType,
            },
            operation: async (controller) => {
              await controller.rollbackToPreviousProvider();
            },
          });
        });
      }

      describe('when the selected network client represents a custom RPC endpoint', () => {
        refreshNetworkTests({
          expectedNetworkClientConfiguration:
            buildCustomNetworkClientConfiguration({
              rpcUrl: 'https://test.network',
              chainId: '0x1337',
              ticker: 'TEST',
            }),
          initialState: {
            selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
            networkConfigurationsByChainId: {
              '0x1337': buildCustomNetworkConfiguration({
                chainId: '0x1337',
                nativeCurrency: 'TEST',
                rpcEndpoints: [
                  buildCustomRpcEndpoint({
                    networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                    url: 'https://test.network',
                  }),
                ],
              }),
            },
          },
          operation: async (controller) => {
            await controller.rollbackToPreviousProvider();
          },
        });
      });
    });

    for (const infuraNetworkType of Object.values(InfuraNetworkType)) {
      const infuraChainId = ChainId[infuraNetworkType];
      const infuraNativeTokenName = NetworksTicker[infuraNetworkType];

      // False negative - this is a string.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      describe(`when called following a switch away from the Infura network "${infuraNetworkType}"`, () => {
        it('emits networkWillChange with state payload', async () => {
          await withController(
            {
              state: {
                selectedNetworkClientId: infuraNetworkType,
                networkConfigurationsByChainId: {
                  [infuraChainId]:
                    buildInfuraNetworkConfiguration(infuraNetworkType),
                  '0x1337': buildCustomNetworkConfiguration({
                    chainId: '0x1337',
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      }),
                    ],
                  }),
                },
              },
            },
            async ({ controller, messenger }) => {
              const fakeProvider = buildFakeProvider();
              const fakeNetworkClient = buildFakeClient(fakeProvider);
              mockCreateNetworkClient().mockReturnValue(fakeNetworkClient);
              await controller.setActiveNetwork('AAAA-AAAA-AAAA-AAAA');

              const networkWillChange = waitForPublishedEvents({
                messenger,
                eventType: 'NetworkController:networkWillChange',
                filter: ([networkState]) => networkState === controller.state,
                operation: () => {
                  // Intentionally not awaited because we're capturing an event
                  // emitted partway through the operation
                  // eslint-disable-next-line @typescript-eslint/no-floating-promises
                  controller.rollbackToPreviousProvider();
                },
              });

              await expect(networkWillChange).toBeFulfilled();
            },
          );
        });

        it('emits networkDidChange with state payload', async () => {
          await withController(
            {
              state: {
                selectedNetworkClientId: infuraNetworkType,
                networkConfigurationsByChainId: {
                  [infuraChainId]:
                    buildInfuraNetworkConfiguration(infuraNetworkType),
                  '0x1337': buildCustomNetworkConfiguration({
                    chainId: '0x1337',
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      }),
                    ],
                  }),
                },
              },
            },
            async ({ controller, messenger }) => {
              const fakeProvider = buildFakeProvider();
              const fakeNetworkClient = buildFakeClient(fakeProvider);
              mockCreateNetworkClient().mockReturnValue(fakeNetworkClient);
              await controller.setActiveNetwork('AAAA-AAAA-AAAA-AAAA');

              const networkDidChange = waitForPublishedEvents({
                messenger,
                eventType: 'NetworkController:networkDidChange',
                filter: ([networkState]) => networkState === controller.state,
                operation: () => {
                  // Intentionally not awaited because we're capturing an event
                  // emitted partway through the operation
                  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
                  // eslint-disable-next-line @typescript-eslint/no-floating-promises
                  controller.rollbackToPreviousProvider();
                },
              });

              await expect(networkDidChange).toBeFulfilled();
            },
          );
        });

        it('sets selectedNetworkClientId in state to the previous version', async () => {
          const infuraProjectId = 'some-infura-project-id';

          await withController(
            {
              state: {
                selectedNetworkClientId: infuraNetworkType,
                networkConfigurationsByChainId: {
                  [infuraChainId]:
                    buildInfuraNetworkConfiguration(infuraNetworkType),
                  '0x1337': buildCustomNetworkConfiguration({
                    chainId: '0x1337',
                    nativeCurrency: 'TEST',
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                        url: 'https://test.network',
                      }),
                    ],
                  }),
                },
              },
              infuraProjectId,
            },
            async ({ controller }) => {
              const fakeProviders = [buildFakeProvider(), buildFakeProvider()];
              const fakeNetworkClients = [
                buildFakeClient(fakeProviders[0]),
                buildFakeClient(fakeProviders[1]),
              ];
              mockCreateNetworkClient()
                .calledWith({
                  chainId: '0x1337',
                  rpcUrl: 'https://test.network',
                  ticker: 'TEST',
                  type: NetworkClientType.Custom,
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  chainId: infuraChainId,
                  infuraProjectId,
                  network: infuraNetworkType,
                  ticker: infuraNativeTokenName,
                  type: NetworkClientType.Infura,
                })
                .mockReturnValue(fakeNetworkClients[1]);
              await controller.setActiveNetwork('AAAA-AAAA-AAAA-AAAA');
              expect(controller.state.selectedNetworkClientId).toBe(
                'AAAA-AAAA-AAAA-AAAA',
              );

              await controller.rollbackToPreviousProvider();

              expect(controller.state.selectedNetworkClientId).toBe(
                infuraNetworkType,
              );
            },
          );
        });

        it('resets the network status to "unknown" before updating the provider', async () => {
          const infuraProjectId = 'some-infura-project-id';

          await withController(
            {
              state: {
                selectedNetworkClientId: infuraNetworkType,
                networkConfigurationsByChainId: {
                  [infuraChainId]:
                    buildInfuraNetworkConfiguration(infuraNetworkType),
                  '0x1337': buildCustomNetworkConfiguration({
                    chainId: '0x1337',
                    nativeCurrency: 'TEST',
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                        url: 'https://test.network',
                      }),
                    ],
                  }),
                },
              },
              infuraProjectId,
            },
            async ({ controller, messenger }) => {
              const fakeProviders = [
                buildFakeProvider([
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                    },
                    response: SUCCESSFUL_ETH_GET_BLOCK_BY_NUMBER_RESPONSE,
                  },
                ]),
                buildFakeProvider(),
              ];
              const fakeNetworkClients = [
                buildFakeClient(fakeProviders[0]),
                buildFakeClient(fakeProviders[1]),
              ];
              mockCreateNetworkClient()
                .calledWith({
                  chainId: '0x1337',
                  rpcUrl: 'https://test.network',
                  ticker: 'TEST',
                  type: NetworkClientType.Custom,
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  chainId: infuraChainId,
                  infuraProjectId,
                  network: infuraNetworkType,
                  ticker: infuraNativeTokenName,
                  type: NetworkClientType.Infura,
                })
                .mockReturnValue(fakeNetworkClients[1]);
              await controller.setActiveNetwork('AAAA-AAAA-AAAA-AAAA');
              expect(
                controller.state.networksMetadata['AAAA-AAAA-AAAA-AAAA'].status,
              ).toBe('available');

              await waitForStateChanges({
                messenger,
                propertyPath: ['networksMetadata', infuraNetworkType, 'status'],
                // We only care about the first state change, because it
                // happens before networkDidChange
                count: 1,
                operation: () => {
                  // Intentionally not awaited because we want to check state
                  // while this operation is in-progress
                  // eslint-disable-next-line @typescript-eslint/no-floating-promises
                  controller.rollbackToPreviousProvider();
                },
                beforeResolving: () => {
                  expect(
                    controller.state.networksMetadata[infuraNetworkType].status,
                  ).toBe('unknown');
                },
              });
            },
          );
        });

        // False negative - this is a string.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        it(`initializes a provider pointed to the "${infuraNetworkType}" Infura network`, async () => {
          const infuraProjectId = 'some-infura-project-id';

          await withController(
            {
              state: {
                selectedNetworkClientId: infuraNetworkType,
                networkConfigurationsByChainId: {
                  [infuraChainId]:
                    buildInfuraNetworkConfiguration(infuraNetworkType),
                  '0x1337': buildCustomNetworkConfiguration({
                    chainId: '0x1337',
                    nativeCurrency: 'TEST',
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                        url: 'https://test.network',
                      }),
                    ],
                  }),
                },
              },
              infuraProjectId,
            },
            async ({ controller }) => {
              const fakeProviders = [
                buildFakeProvider(),
                buildFakeProvider([
                  {
                    request: {
                      method: 'test',
                    },
                    response: {
                      result: 'test response',
                    },
                  },
                ]),
              ];
              const fakeNetworkClients = [
                buildFakeClient(fakeProviders[0]),
                buildFakeClient(fakeProviders[1]),
              ];
              mockCreateNetworkClient()
                .calledWith({
                  chainId: '0x1337',
                  rpcUrl: 'https://test.network',
                  ticker: 'TEST',
                  type: NetworkClientType.Custom,
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  chainId: infuraChainId,
                  infuraProjectId,
                  network: infuraNetworkType,
                  ticker: infuraNativeTokenName,
                  type: NetworkClientType.Infura,
                })
                .mockReturnValue(fakeNetworkClients[1]);
              await controller.setActiveNetwork('AAAA-AAAA-AAAA-AAAA');

              await controller.rollbackToPreviousProvider();

              const networkClient = controller.getSelectedNetworkClient();
              assert(networkClient, 'Network client is somehow unset');
              const result = await networkClient.provider.request({
                id: '1',
                jsonrpc: '2.0',
                method: 'test',
              });
              expect(result).toBe('test response');
            },
          );
        });

        it('replaces the provider object underlying the provider proxy without creating a new instance of the proxy itself', async () => {
          const infuraProjectId = 'some-infura-project-id';

          await withController(
            {
              state: {
                selectedNetworkClientId: infuraNetworkType,
                networkConfigurationsByChainId: {
                  [infuraChainId]:
                    buildInfuraNetworkConfiguration(infuraNetworkType),
                  '0x1337': buildCustomNetworkConfiguration({
                    chainId: '0x1337',
                    nativeCurrency: 'TEST',
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                        url: 'https://test.network',
                      }),
                    ],
                  }),
                },
              },
              infuraProjectId,
            },
            async ({ controller }) => {
              const fakeProviders = [buildFakeProvider(), buildFakeProvider()];
              const fakeNetworkClients = [
                buildFakeClient(fakeProviders[0]),
                buildFakeClient(fakeProviders[1]),
              ];
              mockCreateNetworkClient()
                .calledWith({
                  chainId: '0x1337',
                  rpcUrl: 'https://test.network',
                  ticker: 'TEST',
                  type: NetworkClientType.Custom,
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  chainId: infuraChainId,
                  infuraProjectId,
                  network: infuraNetworkType,
                  ticker: infuraNativeTokenName,
                  type: NetworkClientType.Infura,
                })
                .mockReturnValue(fakeNetworkClients[1]);
              await controller.setActiveNetwork('AAAA-AAAA-AAAA-AAAA');
              const networkClientBefore = controller.getSelectedNetworkClient();
              assert(networkClientBefore, 'Network client is somehow unset');

              await controller.rollbackToPreviousProvider();

              const networkClientAfter = controller.getSelectedNetworkClient();
              assert(networkClientAfter, 'Network client is somehow unset');
              expect(networkClientBefore.provider).toBe(
                networkClientAfter.provider,
              );
            },
          );
        });

        it('emits infuraIsBlocked or infuraIsUnblocked, depending on whether Infura is blocking requests for the previous network', async () => {
          const infuraProjectId = 'some-infura-project-id';

          await withController(
            {
              state: {
                selectedNetworkClientId: infuraNetworkType,
                networkConfigurationsByChainId: {
                  [infuraChainId]:
                    buildInfuraNetworkConfiguration(infuraNetworkType),
                  '0x1337': buildCustomNetworkConfiguration({
                    chainId: '0x1337',
                    nativeCurrency: 'TEST',
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                        url: 'https://test.network',
                      }),
                    ],
                  }),
                },
              },
              infuraProjectId,
            },
            async ({ controller, messenger }) => {
              const fakeProviders = [
                buildFakeProvider(),
                buildFakeProvider([
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                    },
                    error: BLOCKED_INFURA_JSON_RPC_ERROR,
                  },
                ]),
              ];
              const fakeNetworkClients = [
                buildFakeClient(fakeProviders[0]),
                buildFakeClient(fakeProviders[1]),
              ];
              mockCreateNetworkClient()
                .calledWith({
                  chainId: '0x1337',
                  rpcUrl: 'https://test.network',
                  ticker: 'TEST',
                  type: NetworkClientType.Custom,
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  chainId: infuraChainId,
                  infuraProjectId,
                  network: infuraNetworkType,
                  ticker: infuraNativeTokenName,
                  type: NetworkClientType.Infura,
                })
                .mockReturnValue(fakeNetworkClients[1]);
              await controller.setActiveNetwork('AAAA-AAAA-AAAA-AAAA');
              const promiseForNoInfuraIsUnblockedEvents =
                waitForPublishedEvents({
                  messenger,
                  eventType: 'NetworkController:infuraIsUnblocked',
                  count: 0,
                });
              const promiseForInfuraIsBlocked = waitForPublishedEvents({
                messenger,
                eventType: 'NetworkController:infuraIsBlocked',
              });

              await controller.rollbackToPreviousProvider();

              await expect(promiseForNoInfuraIsUnblockedEvents).toBeFulfilled();
              await expect(promiseForInfuraIsBlocked).toBeFulfilled();
            },
          );
        });

        it('checks the status of the previous network again and updates state accordingly', async () => {
          const infuraProjectId = 'some-infura-project-id';

          await withController(
            {
              state: {
                selectedNetworkClientId: infuraNetworkType,
                networkConfigurationsByChainId: {
                  [infuraChainId]:
                    buildInfuraNetworkConfiguration(infuraNetworkType),
                  '0x1337': buildCustomNetworkConfiguration({
                    chainId: '0x1337',
                    nativeCurrency: 'TEST',
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                        url: 'https://test.network',
                      }),
                    ],
                  }),
                },
              },
              infuraProjectId,
            },
            async ({ controller, messenger }) => {
              const fakeProviders = [
                buildFakeProvider([
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                    },
                    error: rpcErrors.methodNotFound(),
                  },
                ]),
                buildFakeProvider([
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                    },
                    response: SUCCESSFUL_ETH_GET_BLOCK_BY_NUMBER_RESPONSE,
                  },
                ]),
              ];
              const fakeNetworkClients = [
                buildFakeClient(fakeProviders[0]),
                buildFakeClient(fakeProviders[1]),
              ];
              mockCreateNetworkClient()
                .calledWith({
                  chainId: '0x1337',
                  rpcUrl: 'https://test.network',
                  ticker: 'TEST',
                  type: NetworkClientType.Custom,
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  chainId: infuraChainId,
                  infuraProjectId,
                  network: infuraNetworkType,
                  ticker: infuraNativeTokenName,
                  type: NetworkClientType.Infura,
                })
                .mockReturnValue(fakeNetworkClients[1]);
              await controller.setActiveNetwork('AAAA-AAAA-AAAA-AAAA');
              expect(
                controller.state.networksMetadata['AAAA-AAAA-AAAA-AAAA'].status,
              ).toBe('unavailable');

              await waitForStateChanges({
                messenger,
                propertyPath: ['networksMetadata', infuraNetworkType, 'status'],
                operation: async () => {
                  await controller.rollbackToPreviousProvider();
                },
              });
              expect(
                controller.state.networksMetadata[infuraNetworkType].status,
              ).toBe('available');
            },
          );
        });

        it('checks whether the previous network supports EIP-1559 again and updates state accordingly', async () => {
          const infuraProjectId = 'some-infura-project-id';

          await withController(
            {
              state: {
                selectedNetworkClientId: infuraNetworkType,
                networkConfigurationsByChainId: {
                  [infuraChainId]:
                    buildInfuraNetworkConfiguration(infuraNetworkType),
                  '0x1337': buildCustomNetworkConfiguration({
                    chainId: '0x1337',
                    nativeCurrency: 'TEST',
                    rpcEndpoints: [
                      buildCustomRpcEndpoint({
                        networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                        url: 'https://test.network',
                      }),
                    ],
                  }),
                },
              },
              infuraProjectId,
            },
            async ({ controller, messenger }) => {
              const fakeProviders = [
                buildFakeProvider([
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                    },
                    response: {
                      result: PRE_1559_BLOCK,
                    },
                  },
                ]),
                buildFakeProvider([
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                    },
                    response: {
                      result: POST_1559_BLOCK,
                    },
                  },
                ]),
              ];
              const fakeNetworkClients = [
                buildFakeClient(fakeProviders[0]),
                buildFakeClient(fakeProviders[1]),
              ];
              mockCreateNetworkClient()
                .calledWith({
                  chainId: '0x1337',
                  rpcUrl: 'https://test.network',
                  ticker: 'TEST',
                  type: NetworkClientType.Custom,
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  chainId: infuraChainId,
                  infuraProjectId,
                  network: infuraNetworkType,
                  ticker: infuraNativeTokenName,
                  type: NetworkClientType.Infura,
                })
                .mockReturnValue(fakeNetworkClients[1]);
              await controller.setActiveNetwork('AAAA-AAAA-AAAA-AAAA');
              expect(
                controller.state.networksMetadata['AAAA-AAAA-AAAA-AAAA']
                  .EIPS[1559],
              ).toBe(false);

              await waitForStateChanges({
                messenger,
                propertyPath: ['networksMetadata', infuraNetworkType, 'EIPS'],
                count: 2,
                operation: async () => {
                  await controller.rollbackToPreviousProvider();
                },
              });
              expect(
                controller.state.networksMetadata[infuraNetworkType].EIPS[1559],
              ).toBe(true);
            },
          );
        });
      });
    }

    describe('when called following a switch away from a custom RPC endpoint', () => {
      it('emits networkWillChange with state payload', async () => {
        await withController(
          {
            state: {
              selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
              networkConfigurationsByChainId: {
                '0x1337': buildCustomNetworkConfiguration({
                  chainId: '0x1337',
                  nativeCurrency: 'TEST',
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      url: 'https://test.network',
                    }),
                  ],
                }),
                [ChainId.goerli]: buildInfuraNetworkConfiguration(
                  InfuraNetworkType.goerli,
                ),
              },
            },
          },
          async ({ controller, messenger }) => {
            const fakeProvider = buildFakeProvider();
            const fakeNetworkClient = buildFakeClient(fakeProvider);
            mockCreateNetworkClient().mockReturnValue(fakeNetworkClient);
            await controller.setActiveNetwork(InfuraNetworkType.goerli);

            const networkWillChange = waitForPublishedEvents({
              messenger,
              eventType: 'NetworkController:networkWillChange',
              filter: ([networkState]) => networkState === controller.state,
              operation: () => {
                // Intentionally not awaited because we're capturing an event
                // emitted partway through the operation
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                controller.rollbackToPreviousProvider();
              },
            });

            await expect(networkWillChange).toBeFulfilled();
          },
        );
      });

      it('emits networkDidChange with state payload', async () => {
        await withController(
          {
            state: {
              selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
              networkConfigurationsByChainId: {
                '0x1337': buildCustomNetworkConfiguration({
                  chainId: '0x1337',
                  nativeCurrency: 'TEST',
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      url: 'https://test.network',
                    }),
                  ],
                }),
                [ChainId.goerli]: buildInfuraNetworkConfiguration(
                  InfuraNetworkType.goerli,
                ),
              },
            },
          },
          async ({ controller, messenger }) => {
            const fakeProvider = buildFakeProvider();
            const fakeNetworkClient = buildFakeClient(fakeProvider);
            mockCreateNetworkClient().mockReturnValue(fakeNetworkClient);
            await controller.setActiveNetwork(InfuraNetworkType.goerli);

            const networkDidChange = waitForPublishedEvents({
              messenger,
              eventType: 'NetworkController:networkDidChange',
              filter: ([networkState]) => networkState === controller.state,
              operation: () => {
                // Intentionally not awaited because we're capturing an event
                // emitted partway through the operation
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                controller.rollbackToPreviousProvider();
              },
            });

            await expect(networkDidChange).toBeFulfilled();
          },
        );
      });

      it('sets selectedNetworkClientId to the previous version', async () => {
        const infuraProjectId = 'some-infura-project-id';

        await withController(
          {
            state: {
              selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
              networkConfigurationsByChainId: {
                '0x1337': buildCustomNetworkConfiguration({
                  chainId: '0x1337',
                  nativeCurrency: 'TEST',
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      url: 'https://test.network',
                    }),
                  ],
                }),
                [ChainId.goerli]: buildInfuraNetworkConfiguration(
                  InfuraNetworkType.goerli,
                ),
              },
            },
            infuraProjectId,
          },
          async ({ controller }) => {
            const fakeProviders = [buildFakeProvider(), buildFakeProvider()];
            const fakeNetworkClients = [
              buildFakeClient(fakeProviders[0]),
              buildFakeClient(fakeProviders[1]),
            ];
            mockCreateNetworkClient()
              .calledWith({
                chainId: ChainId.goerli,
                infuraProjectId,
                network: InfuraNetworkType.goerli,
                ticker: NetworksTicker.goerli,
                type: NetworkClientType.Infura,
              })
              .mockReturnValue(fakeNetworkClients[0])
              .calledWith({
                chainId: '0x1337',
                rpcUrl: 'https://test.network',
                ticker: 'TEST',
                type: NetworkClientType.Custom,
              })
              .mockReturnValue(fakeNetworkClients[1]);
            await controller.setActiveNetwork(InfuraNetworkType.goerli);
            expect(controller.state.selectedNetworkClientId).toBe(
              InfuraNetworkType.goerli,
            );

            await controller.rollbackToPreviousProvider();
            expect(controller.state.selectedNetworkClientId).toBe(
              'AAAA-AAAA-AAAA-AAAA',
            );
          },
        );
      });

      it('resets the network state to "unknown" before updating the provider', async () => {
        const infuraProjectId = 'some-infura-project-id';

        await withController(
          {
            state: {
              selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
              networkConfigurationsByChainId: {
                '0x1337': buildCustomNetworkConfiguration({
                  chainId: '0x1337',
                  nativeCurrency: 'TEST',
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      url: 'https://test.network',
                    }),
                  ],
                }),
                [ChainId.goerli]: buildInfuraNetworkConfiguration(
                  InfuraNetworkType.goerli,
                ),
              },
            },
            infuraProjectId,
          },
          async ({ controller, messenger }) => {
            const fakeProviders = [
              buildFakeProvider([
                {
                  request: {
                    method: 'eth_getBlockByNumber',
                  },
                  response: SUCCESSFUL_ETH_GET_BLOCK_BY_NUMBER_RESPONSE,
                },
              ]),
              buildFakeProvider(),
            ];
            const fakeNetworkClients = [
              buildFakeClient(fakeProviders[0]),
              buildFakeClient(fakeProviders[1]),
            ];
            mockCreateNetworkClient()
              .calledWith({
                chainId: ChainId.goerli,
                infuraProjectId,
                network: InfuraNetworkType.goerli,
                ticker: NetworksTicker.goerli,
                type: NetworkClientType.Infura,
              })
              .mockReturnValue(fakeNetworkClients[0])
              .calledWith({
                chainId: '0x1337',
                rpcUrl: 'https://test.network',
                ticker: 'TEST',
                type: NetworkClientType.Custom,
              })
              .mockReturnValue(fakeNetworkClients[1]);
            await controller.setActiveNetwork(InfuraNetworkType.goerli);
            expect(
              controller.state.networksMetadata[
                controller.state.selectedNetworkClientId
              ].status,
            ).toBe('available');

            await waitForStateChanges({
              messenger,
              propertyPath: [
                'networksMetadata',
                'AAAA-AAAA-AAAA-AAAA',
                'status',
              ],
              // We only care about the first state change, because it
              // happens before networkDidChange
              count: 1,
              operation: () => {
                // Intentionally not awaited because we want to check state
                // while this operation is in-progress
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                controller.rollbackToPreviousProvider();
              },
              beforeResolving: () => {
                expect(
                  controller.state.networksMetadata['AAAA-AAAA-AAAA-AAAA']
                    .status,
                ).toBe('unknown');
              },
            });
          },
        );
      });

      it('initializes a provider pointed to the given RPC URL', async () => {
        const infuraProjectId = 'some-infura-project-id';

        await withController(
          {
            state: {
              selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
              networkConfigurationsByChainId: {
                '0x1337': buildCustomNetworkConfiguration({
                  chainId: '0x1337',
                  nativeCurrency: 'TEST',
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      url: 'https://test.network',
                    }),
                  ],
                }),
                [ChainId.goerli]: buildInfuraNetworkConfiguration(
                  InfuraNetworkType.goerli,
                ),
              },
            },
            infuraProjectId,
          },
          async ({ controller }) => {
            const fakeProviders = [
              buildFakeProvider(),
              buildFakeProvider([
                {
                  request: {
                    method: 'test_method',
                  },
                  response: {
                    result: 'test response',
                  },
                },
              ]),
            ];
            const fakeNetworkClients = [
              buildFakeClient(fakeProviders[0]),
              buildFakeClient(fakeProviders[1]),
            ];
            mockCreateNetworkClient()
              .calledWith({
                chainId: ChainId.goerli,
                infuraProjectId,
                network: InfuraNetworkType.goerli,
                ticker: NetworksTicker.goerli,
                type: NetworkClientType.Infura,
              })
              .mockReturnValue(fakeNetworkClients[0])
              .calledWith({
                chainId: '0x1337',
                rpcUrl: 'https://test.network',
                ticker: 'TEST',
                type: NetworkClientType.Custom,
              })
              .mockReturnValue(fakeNetworkClients[1]);
            await controller.setActiveNetwork(InfuraNetworkType.goerli);

            await controller.rollbackToPreviousProvider();

            const networkClient = controller.getSelectedNetworkClient();
            assert(networkClient, 'Network client is somehow unset');
            const result = await networkClient.provider.request({
              id: '1',
              jsonrpc: '2.0',
              method: 'test_method',
            });
            expect(result).toBe('test response');
          },
        );
      });

      it('replaces the provider object underlying the provider proxy without creating a new instance of the proxy itself', async () => {
        const infuraProjectId = 'some-infura-project-id';

        await withController(
          {
            state: {
              selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
              networkConfigurationsByChainId: {
                '0x1337': buildCustomNetworkConfiguration({
                  chainId: '0x1337',
                  nativeCurrency: 'TEST',
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      url: 'https://test.network',
                    }),
                  ],
                }),
                [ChainId.goerli]: buildInfuraNetworkConfiguration(
                  InfuraNetworkType.goerli,
                ),
              },
            },
            infuraProjectId,
          },
          async ({ controller }) => {
            const fakeProviders = [buildFakeProvider(), buildFakeProvider()];
            const fakeNetworkClients = [
              buildFakeClient(fakeProviders[0]),
              buildFakeClient(fakeProviders[1]),
            ];
            mockCreateNetworkClient()
              .calledWith({
                chainId: ChainId.goerli,
                infuraProjectId,
                network: InfuraNetworkType.goerli,
                ticker: NetworksTicker.goerli,
                type: NetworkClientType.Infura,
              })
              .mockReturnValue(fakeNetworkClients[0])
              .calledWith({
                chainId: '0x1337',
                rpcUrl: 'https://test.network',
                ticker: 'TEST',
                type: NetworkClientType.Custom,
              })
              .mockReturnValue(fakeNetworkClients[1]);
            await controller.setActiveNetwork(InfuraNetworkType.goerli);
            const networkClientBefore = controller.getSelectedNetworkClient();
            assert(networkClientBefore, 'Network client is somehow unset');

            await controller.rollbackToPreviousProvider();

            const networkClientAfter = controller.getSelectedNetworkClient();
            assert(networkClientAfter, 'Network client is somehow unset');
            expect(networkClientBefore.provider).toBe(
              networkClientAfter.provider,
            );
          },
        );
      });

      it('emits infuraIsUnblocked', async () => {
        const infuraProjectId = 'some-infura-project-id';

        await withController(
          {
            state: {
              selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
              networkConfigurationsByChainId: {
                '0x1337': buildCustomNetworkConfiguration({
                  chainId: '0x1337',
                  nativeCurrency: 'TEST',
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      url: 'https://test.network',
                    }),
                  ],
                }),
                [ChainId.goerli]: buildInfuraNetworkConfiguration(
                  InfuraNetworkType.goerli,
                ),
              },
            },
            infuraProjectId,
          },
          async ({ controller, messenger }) => {
            const fakeProviders = [buildFakeProvider(), buildFakeProvider()];
            const fakeNetworkClients = [
              buildFakeClient(fakeProviders[0]),
              buildFakeClient(fakeProviders[1]),
            ];
            mockCreateNetworkClient()
              .calledWith({
                chainId: ChainId.goerli,
                infuraProjectId,
                network: InfuraNetworkType.goerli,
                ticker: NetworksTicker.goerli,
                type: NetworkClientType.Infura,
              })
              .mockReturnValue(fakeNetworkClients[0])
              .calledWith({
                chainId: '0x1337',
                rpcUrl: 'https://test.network',
                ticker: 'TEST',
                type: NetworkClientType.Custom,
              })
              .mockReturnValue(fakeNetworkClients[1]);
            await controller.setActiveNetwork(InfuraNetworkType.goerli);

            const promiseForInfuraIsUnblocked = waitForPublishedEvents({
              messenger,
              eventType: 'NetworkController:infuraIsUnblocked',
              operation: async () => {
                await controller.rollbackToPreviousProvider();
              },
            });

            await expect(promiseForInfuraIsUnblocked).toBeFulfilled();
          },
        );
      });

      it('checks the status of the previous network again and updates state accordingly', async () => {
        const infuraProjectId = 'some-infura-project-id';

        await withController(
          {
            state: {
              selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
              networkConfigurationsByChainId: {
                '0x1337': buildCustomNetworkConfiguration({
                  chainId: '0x1337',
                  nativeCurrency: 'TEST',
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      url: 'https://test.network',
                    }),
                  ],
                }),
                [ChainId.goerli]: buildInfuraNetworkConfiguration(
                  InfuraNetworkType.goerli,
                ),
              },
            },
            infuraProjectId,
          },
          async ({ controller }) => {
            const fakeProviders = [
              buildFakeProvider([
                {
                  request: {
                    method: 'eth_getBlockByNumber',
                  },
                  error: rpcErrors.methodNotFound(),
                },
              ]),
              buildFakeProvider([
                {
                  request: {
                    method: 'eth_getBlockByNumber',
                  },
                  response: SUCCESSFUL_ETH_GET_BLOCK_BY_NUMBER_RESPONSE,
                },
              ]),
            ];
            const fakeNetworkClients = [
              buildFakeClient(fakeProviders[0]),
              buildFakeClient(fakeProviders[1]),
            ];
            mockCreateNetworkClient()
              .calledWith({
                chainId: ChainId.goerli,
                infuraProjectId,
                network: InfuraNetworkType.goerli,
                ticker: NetworksTicker.goerli,
                type: NetworkClientType.Infura,
              })
              .mockReturnValue(fakeNetworkClients[0])
              .calledWith({
                chainId: '0x1337',
                rpcUrl: 'https://test.network',
                ticker: 'TEST',
                type: NetworkClientType.Custom,
              })
              .mockReturnValue(fakeNetworkClients[1]);
            await controller.setActiveNetwork(InfuraNetworkType.goerli);
            expect(
              controller.state.networksMetadata[InfuraNetworkType.goerli]
                .status,
            ).toBe('unavailable');

            await controller.rollbackToPreviousProvider();
            expect(
              controller.state.networksMetadata['AAAA-AAAA-AAAA-AAAA'].status,
            ).toBe('available');
          },
        );
      });

      it('checks whether the previous network supports EIP-1559 again and updates state accordingly', async () => {
        const infuraProjectId = 'some-infura-project-id';

        await withController(
          {
            state: {
              selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
              networkConfigurationsByChainId: {
                '0x1337': buildCustomNetworkConfiguration({
                  chainId: '0x1337',
                  nativeCurrency: 'TEST',
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                      url: 'https://test.network',
                    }),
                  ],
                }),
                [ChainId.goerli]: buildInfuraNetworkConfiguration(
                  InfuraNetworkType.goerli,
                ),
              },
            },
            infuraProjectId,
          },
          async ({ controller }) => {
            const fakeProviders = [
              buildFakeProvider([
                {
                  request: {
                    method: 'eth_getBlockByNumber',
                  },
                  response: {
                    result: PRE_1559_BLOCK,
                  },
                },
              ]),
              buildFakeProvider([
                {
                  request: {
                    method: 'eth_getBlockByNumber',
                  },
                  response: {
                    result: POST_1559_BLOCK,
                  },
                },
              ]),
            ];
            const fakeNetworkClients = [
              buildFakeClient(fakeProviders[0]),
              buildFakeClient(fakeProviders[1]),
            ];
            mockCreateNetworkClient()
              .calledWith({
                chainId: ChainId.goerli,
                infuraProjectId,
                network: InfuraNetworkType.goerli,
                ticker: NetworksTicker.goerli,
                type: NetworkClientType.Infura,
              })
              .mockReturnValue(fakeNetworkClients[0])
              .calledWith({
                chainId: '0x1337',
                rpcUrl: 'https://test.network',
                ticker: 'TEST',
                type: NetworkClientType.Custom,
              })
              .mockReturnValue(fakeNetworkClients[1]);
            await controller.setActiveNetwork(InfuraNetworkType.goerli);
            expect(
              controller.state.networksMetadata[InfuraNetworkType.goerli]
                .EIPS[1559],
            ).toBe(false);

            await controller.rollbackToPreviousProvider();
            expect(
              controller.state.networksMetadata['AAAA-AAAA-AAAA-AAAA']
                .EIPS[1559],
            ).toBe(true);
          },
        );
      });
    });
  });

  describe('loadBackup', () => {
    it('merges the network configurations from the given backup into state', async () => {
      await withController(
        {
          state: buildNetworkControllerStateWithDefaultSelectedNetworkClientId({
            networkConfigurationsByChainId: {
              '0x1337': {
                blockExplorerUrls: [],
                chainId: '0x1337' as const,
                defaultRpcEndpointIndex: 0,
                name: 'Test Network 1',
                nativeCurrency: 'TOKEN1',
                rpcEndpoints: [
                  {
                    name: 'Test Endpoint',
                    networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                    url: 'https://test.network/1',
                    type: RpcEndpointType.Custom,
                  },
                ],
              },
            },
          }),
        },
        ({ controller }) => {
          controller.loadBackup({
            networkConfigurationsByChainId: {
              '0x2448': {
                blockExplorerUrls: [],
                chainId: '0x2448' as const,
                defaultRpcEndpointIndex: 0,
                name: 'Test Network 2',
                nativeCurrency: 'TOKEN2',
                rpcEndpoints: [
                  {
                    name: 'Test Endpoint',
                    networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                    url: 'https://test.network/2',
                    type: RpcEndpointType.Custom,
                  },
                ],
              },
            },
          });

          expect(controller.state.networkConfigurationsByChainId).toStrictEqual(
            {
              '0x1337': {
                blockExplorerUrls: [],
                chainId: '0x1337' as const,
                defaultRpcEndpointIndex: 0,
                name: 'Test Network 1',
                nativeCurrency: 'TOKEN1',
                rpcEndpoints: [
                  {
                    name: 'Test Endpoint',
                    networkClientId: 'AAAA-AAAA-AAAA-AAAA',
                    url: 'https://test.network/1',
                    type: RpcEndpointType.Custom,
                  },
                ],
              },
              '0x2448': {
                blockExplorerUrls: [],
                chainId: '0x2448' as const,
                defaultRpcEndpointIndex: 0,
                name: 'Test Network 2',
                nativeCurrency: 'TOKEN2',
                rpcEndpoints: [
                  {
                    name: 'Test Endpoint',
                    networkClientId: 'BBBB-BBBB-BBBB-BBBB',
                    url: 'https://test.network/2',
                    type: RpcEndpointType.Custom,
                  },
                ],
              },
            },
          );
        },
      );
    });
  });
});

/**
 * Creates a mocked version of `createNetworkClient` where multiple mock
 * invocations can be specified. A default implementation is provided so that if
 * none of the actual invocations of the function match the mock invocations
 * then an error will be thrown.
 *
 * @returns The mocked version of `createNetworkClient`.
 */
function mockCreateNetworkClient() {
  return when(createNetworkClientMock).mockImplementation((options) => {
    const inspectedOptions = inspect(options, { depth: null, compact: true });
    const lines = [
      `No fake network client was specified for ${inspectedOptions}.`,
      'Make sure to mock this invocation of `createNetworkClient`.',
    ];
    if ('infuraProjectId' in options) {
      lines.push(
        '(You might have forgotten to pass an `infuraProjectId` to `withController`.)',
      );
    }
    throw new Error(lines.join('\n'));
  });
}

/**
 * Test an operation that performs a `#refreshNetwork` call with the given
 * provider configuration. All effects of the `#refreshNetwork` call should be
 * covered by these tests.
 *
 * @param args - Arguments.
 * @param args.expectedNetworkClientConfiguration - The network client
 * configuration that the operation is expected to set.
 * @param args.initialState - The initial state of the network controller.
 * @param args.operation - The operation to test.
 */
function refreshNetworkTests({
  expectedNetworkClientConfiguration,
  initialState,
  operation,
}: {
  expectedNetworkClientConfiguration: NetworkClientConfiguration;
  initialState?: Partial<NetworkState>;
  operation: (controller: NetworkController) => Promise<void>;
}) {
  it('emits networkWillChange with state payload', async () => {
    await withController(
      {
        state: initialState,
      },
      async ({ controller, messenger }) => {
        const fakeProvider = buildFakeProvider();
        const fakeNetworkClient = buildFakeClient(fakeProvider);
        mockCreateNetworkClient().mockReturnValue(fakeNetworkClient);

        const networkWillChange = waitForPublishedEvents({
          messenger,
          eventType: 'NetworkController:networkWillChange',
          filter: ([networkState]) => networkState === controller.state,
          operation: () => {
            // Intentionally not awaited because we're capturing an event
            // emitted partway through the operation
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            operation(controller);
          },
        });

        await expect(networkWillChange).toBeFulfilled();
      },
    );
  });

  it('emits networkDidChange with state payload', async () => {
    await withController(
      {
        state: initialState,
      },
      async ({ controller, messenger }) => {
        const fakeProvider = buildFakeProvider();
        const fakeNetworkClient = buildFakeClient(fakeProvider);
        mockCreateNetworkClient().mockReturnValue(fakeNetworkClient);

        const networkDidChange = waitForPublishedEvents({
          messenger,
          eventType: 'NetworkController:networkDidChange',
          filter: ([networkState]) => networkState === controller.state,
          operation: () => {
            // Intentionally not awaited because we're capturing an event
            // emitted partway through the operation
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            operation(controller);
          },
        });

        await expect(networkDidChange).toBeFulfilled();
      },
    );
  });

  if (expectedNetworkClientConfiguration.type === NetworkClientType.Custom) {
    it('sets the provider to a custom RPC provider initialized with the RPC target and chain ID', async () => {
      await withController(
        {
          infuraProjectId: 'infura-project-id',
          state: initialState,
        },
        async ({ controller }) => {
          const fakeProvider = buildFakeProvider([
            {
              request: {
                method: 'eth_chainId',
              },
              response: {
                result: toHex(111),
              },
            },
          ]);
          const fakeNetworkClient = buildFakeClient(fakeProvider);
          createNetworkClientMock.mockReturnValue(fakeNetworkClient);

          await operation(controller);

          expect(createNetworkClientMock).toHaveBeenCalledWith({
            chainId: expectedNetworkClientConfiguration.chainId,
            rpcUrl: expectedNetworkClientConfiguration.rpcUrl,
            type: NetworkClientType.Custom,
            ticker: expectedNetworkClientConfiguration.ticker,
          });
          const { provider } = controller.getProviderAndBlockTracker();
          assert(provider);
          const chainIdResult = await provider.request({
            id: 1,
            jsonrpc: '2.0',
            method: 'eth_chainId',
            params: [],
          });
          expect(chainIdResult).toBe(toHex(111));
        },
      );
    });
  } else {
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    it(`sets the provider to an Infura provider pointed to ${expectedNetworkClientConfiguration.network}`, async () => {
      await withController(
        {
          infuraProjectId: 'infura-project-id',
          state: initialState,
        },
        async ({ controller }) => {
          const fakeProvider = buildFakeProvider([
            {
              request: {
                method: 'eth_chainId',
              },
              response: {
                result: toHex(1337),
              },
            },
          ]);
          const fakeNetworkClient = buildFakeClient(fakeProvider);
          createNetworkClientMock.mockReturnValue(fakeNetworkClient);

          await operation(controller);

          expect(createNetworkClientMock).toHaveBeenCalledWith({
            ...expectedNetworkClientConfiguration,
            infuraProjectId: 'infura-project-id',
          });
          const { provider } = controller.getProviderAndBlockTracker();
          assert(provider);
          const chainIdResult = await provider.request({
            id: 1,
            jsonrpc: '2.0',
            method: 'eth_chainId',
            params: [],
          });
          expect(chainIdResult).toBe(toHex(1337));
        },
      );
    });
  }

  it('replaces the provider object underlying the provider proxy without creating a new instance of the proxy itself', async () => {
    await withController(
      {
        infuraProjectId: 'infura-project-id',
        state: initialState,
      },
      async ({ controller }) => {
        const fakeProviders = [buildFakeProvider(), buildFakeProvider()];
        const fakeNetworkClients = [
          buildFakeClient(fakeProviders[0]),
          buildFakeClient(fakeProviders[1]),
        ];
        const { selectedNetworkClientId } = controller.state;
        let initializationNetworkClientConfiguration:
          | Parameters<typeof createNetworkClient>[0]
          | undefined;

        for (const matchingNetworkConfiguration of Object.values(
          controller.state.networkConfigurationsByChainId,
        )) {
          const matchingRpcEndpoint =
            matchingNetworkConfiguration.rpcEndpoints.find(
              (rpcEndpoint) =>
                rpcEndpoint.networkClientId === selectedNetworkClientId,
            );
          if (matchingRpcEndpoint) {
            if (isInfuraNetworkType(selectedNetworkClientId)) {
              initializationNetworkClientConfiguration = {
                chainId: ChainId[selectedNetworkClientId],
                infuraProjectId: 'infura-project-id',
                network: selectedNetworkClientId,
                ticker: NetworksTicker[selectedNetworkClientId],
                type: NetworkClientType.Infura,
              };
            } else {
              initializationNetworkClientConfiguration = {
                chainId: matchingNetworkConfiguration.chainId,
                rpcUrl: matchingRpcEndpoint.url,
                ticker: matchingNetworkConfiguration.nativeCurrency,
                type: NetworkClientType.Custom,
              };
            }
          }
        }

        if (initializationNetworkClientConfiguration === undefined) {
          throw new Error(
            'Could not set initializationNetworkClientConfiguration',
          );
        }

        const operationNetworkClientConfiguration: Parameters<
          typeof createNetworkClient
        >[0] =
          expectedNetworkClientConfiguration.type === NetworkClientType.Custom
            ? expectedNetworkClientConfiguration
            : {
                ...expectedNetworkClientConfiguration,
                infuraProjectId: 'infura-project-id',
              };
        mockCreateNetworkClient()
          .calledWith(initializationNetworkClientConfiguration)
          .mockReturnValue(fakeNetworkClients[0])
          .calledWith(operationNetworkClientConfiguration)
          .mockReturnValue(fakeNetworkClients[1]);
        await controller.initializeProvider();
        const { provider: providerBefore } =
          controller.getProviderAndBlockTracker();

        await operation(controller);

        const { provider: providerAfter } =
          controller.getProviderAndBlockTracker();
        expect(providerBefore).toBe(providerAfter);
      },
    );
  });

  lookupNetworkTests({
    expectedNetworkClientType: expectedNetworkClientConfiguration.type,
    initialState,
    operation,
  });
}

/**
 * Test an operation that performs a `lookupNetwork` call with the given
 * provider configuration. All effects of the `lookupNetwork` call should be
 * covered by these tests.
 *
 * @param args - Arguments.
 * @param args.expectedNetworkClientType - The type of the network client
 * that the operation is expected to set.
 * @param args.initialState - The initial state of the network controller.
 * @param args.operation - The operation to test.
 */
function lookupNetworkTests({
  expectedNetworkClientType,
  initialState,
  operation,
}: {
  expectedNetworkClientType: NetworkClientType;
  initialState?: Partial<NetworkState>;
  operation: (controller: NetworkController) => Promise<void>;
}) {
  describe('if the network details request resolve successfully', () => {
    describe('if the network details of the current network are different from the network details in state', () => {
      it('updates the network in state to match', async () => {
        await withController(
          {
            state: {
              ...initialState,
              networksMetadata: {
                mainnet: {
                  EIPS: { 1559: false },
                  status: NetworkStatus.Unknown,
                },
              },
            },
          },
          async ({ controller }) => {
            await setFakeProvider(controller, {
              stubs: [
                {
                  request: {
                    method: 'eth_getBlockByNumber',
                    params: ['latest', false],
                  },
                  response: {
                    result: {
                      baseFeePerGas: '0x1',
                    },
                  },
                },
              ],
              stubLookupNetworkWhileSetting: true,
            });

            await operation(controller);

            expect(
              controller.state.networksMetadata[
                controller.state.selectedNetworkClientId
              ].EIPS[1559],
            ).toBe(true);
          },
        );
      });
    });

    describe('if the network details of the current network are the same as the network details in state', () => {
      it('does not change network details in state', async () => {
        await withController(
          {
            state: {
              ...initialState,
              networksMetadata: {
                mainnet: {
                  EIPS: { 1559: true },
                  status: NetworkStatus.Unknown,
                },
              },
            },
          },
          async ({ controller }) => {
            await setFakeProvider(controller, {
              stubs: [
                {
                  request: {
                    method: 'eth_getBlockByNumber',
                    params: ['latest', false],
                  },
                  response: {
                    result: {
                      baseFeePerGas: '0x1',
                    },
                  },
                },
              ],
              stubLookupNetworkWhileSetting: true,
            });

            await operation(controller);

            expect(
              controller.state.networksMetadata[
                controller.state.selectedNetworkClientId
              ].EIPS[1559],
            ).toBe(true);
          },
        );
      });
    });

    it('emits infuraIsUnblocked', async () => {
      await withController(
        {
          state: initialState,
        },
        async ({ controller, messenger }) => {
          await setFakeProvider(controller, {
            stubLookupNetworkWhileSetting: true,
          });

          const infuraIsUnblocked = waitForPublishedEvents({
            messenger,
            eventType: 'NetworkController:infuraIsUnblocked',
            operation: async () => {
              await operation(controller);
            },
          });

          await expect(infuraIsUnblocked).toBeFulfilled();
        },
      );
    });

    it('does not emit infuraIsBlocked', async () => {
      await withController(
        {
          state: initialState,
        },
        async ({ controller, messenger }) => {
          await setFakeProvider(controller, {
            stubLookupNetworkWhileSetting: true,
          });

          const infuraIsBlocked = waitForPublishedEvents({
            messenger,
            eventType: 'NetworkController:infuraIsBlocked',
            count: 0,
            operation: async () => {
              await operation(controller);
            },
          });

          await expect(infuraIsBlocked).toBeFulfilled();
        },
      );
    });
  });

  describe('if an RPC error is encountered while retrieving the network details of the current network', () => {
    it('updates the network in state to "unavailable"', async () => {
      await withController(
        {
          state: initialState,
        },
        async ({ controller }) => {
          await setFakeProvider(controller, {
            stubs: [
              {
                request: {
                  method: 'eth_getBlockByNumber',
                  params: ['latest', false],
                },
                error: rpcErrors.limitExceeded('some error'),
              },
            ],
            stubLookupNetworkWhileSetting: true,
          });

          await operation(controller);

          expect(
            controller.state.networksMetadata[
              controller.state.selectedNetworkClientId
            ].status,
          ).toBe(NetworkStatus.Unavailable);
        },
      );
    });

    it('resets the network details in state', async () => {
      await withController(
        {
          state: initialState,
        },
        async ({ controller }) => {
          await setFakeProvider(controller, {
            stubs: [
              // Called during provider initialization
              {
                request: {
                  method: 'eth_getBlockByNumber',
                  params: ['latest', false],
                },
                response: {
                  result: PRE_1559_BLOCK,
                },
              },
              // Called when calling the operation directly
              {
                request: {
                  method: 'eth_getBlockByNumber',
                  params: ['latest', false],
                },
                error: rpcErrors.limitExceeded('some error'),
              },
            ],
          });
          expect(
            controller.state.networksMetadata[
              controller.state.selectedNetworkClientId
            ].EIPS[1559],
          ).toBe(false);

          await operation(controller);

          expect(
            controller.state.networksMetadata[
              controller.state.selectedNetworkClientId
            ].EIPS,
          ).toStrictEqual({});
        },
      );
    });

    if (expectedNetworkClientType === NetworkClientType.Custom) {
      it('emits infuraIsUnblocked', async () => {
        await withController(
          {
            state: initialState,
          },
          async ({ controller, messenger }) => {
            await setFakeProvider(controller, {
              stubs: [
                {
                  request: {
                    method: 'eth_getBlockByNumber',
                    params: ['latest', false],
                  },
                  error: rpcErrors.limitExceeded('some error'),
                },
              ],
              stubLookupNetworkWhileSetting: true,
            });

            const infuraIsUnblocked = waitForPublishedEvents({
              messenger,
              eventType: 'NetworkController:infuraIsUnblocked',
              operation: async () => {
                await operation(controller);
              },
            });

            await expect(infuraIsUnblocked).toBeFulfilled();
          },
        );
      });
    } else {
      it('does not emit infuraIsUnblocked', async () => {
        await withController(
          {
            state: initialState,
          },
          async ({ controller, messenger }) => {
            await setFakeProvider(controller, {
              stubs: [
                {
                  request: {
                    method: 'eth_getBlockByNumber',
                    params: ['latest', false],
                  },
                  error: rpcErrors.limitExceeded('some error'),
                },
              ],
              stubLookupNetworkWhileSetting: true,
            });

            const infuraIsUnblocked = waitForPublishedEvents({
              messenger,
              eventType: 'NetworkController:infuraIsUnblocked',
              count: 0,
              operation: async () => {
                await operation(controller);
              },
            });

            await expect(infuraIsUnblocked).toBeFulfilled();
          },
        );
      });
    }

    it('does not emit infuraIsBlocked', async () => {
      await withController(
        {
          state: initialState,
        },
        async ({ controller, messenger }) => {
          await setFakeProvider(controller, {
            stubs: [
              {
                request: {
                  method: 'eth_getBlockByNumber',
                  params: ['latest', false],
                },
                error: rpcErrors.limitExceeded('some error'),
              },
            ],
            stubLookupNetworkWhileSetting: true,
          });

          const infuraIsBlocked = waitForPublishedEvents({
            messenger,
            eventType: 'NetworkController:infuraIsBlocked',
            count: 0,
            operation: async () => {
              await operation(controller);
            },
          });

          await expect(infuraIsBlocked).toBeFulfilled();
        },
      );
    });
  });

  describe('if a country blocked error is encountered while retrieving the network details of the current network', () => {
    if (expectedNetworkClientType === NetworkClientType.Custom) {
      it('updates the network in state to "unknown"', async () => {
        await withController(
          {
            state: initialState,
          },
          async ({ controller }) => {
            await setFakeProvider(controller, {
              stubs: [
                {
                  request: {
                    method: 'eth_getBlockByNumber',
                    params: ['latest', false],
                  },
                  error: BLOCKED_INFURA_JSON_RPC_ERROR,
                },
              ],
              stubLookupNetworkWhileSetting: true,
            });

            await operation(controller);

            expect(
              controller.state.networksMetadata[
                controller.state.selectedNetworkClientId
              ].status,
            ).toBe(NetworkStatus.Unknown);
          },
        );
      });

      it('emits infuraIsUnblocked', async () => {
        await withController(
          {
            state: initialState,
          },
          async ({ controller, messenger }) => {
            await setFakeProvider(controller, {
              stubs: [
                {
                  request: {
                    method: 'eth_getBlockByNumber',
                    params: ['latest', false],
                  },
                  error: BLOCKED_INFURA_JSON_RPC_ERROR,
                },
              ],
              stubLookupNetworkWhileSetting: true,
            });

            const infuraIsUnblocked = waitForPublishedEvents({
              messenger,
              eventType: 'NetworkController:infuraIsUnblocked',
              operation: async () => {
                await operation(controller);
              },
            });

            await expect(infuraIsUnblocked).toBeFulfilled();
          },
        );
      });

      it('does not emit infuraIsBlocked', async () => {
        await withController(
          {
            state: initialState,
          },
          async ({ controller, messenger }) => {
            await setFakeProvider(controller, {
              stubs: [
                {
                  request: {
                    method: 'eth_getBlockByNumber',
                    params: ['latest', false],
                  },
                  error: BLOCKED_INFURA_JSON_RPC_ERROR,
                },
              ],
              stubLookupNetworkWhileSetting: true,
            });

            const infuraIsBlocked = waitForPublishedEvents({
              messenger,
              eventType: 'NetworkController:infuraIsBlocked',
              count: 0,
              operation: async () => {
                await operation(controller);
              },
            });

            await expect(infuraIsBlocked).toBeFulfilled();
          },
        );
      });
    } else {
      it('updates the network in state to "blocked"', async () => {
        await withController(
          {
            state: initialState,
          },
          async ({ controller }) => {
            await setFakeProvider(controller, {
              stubs: [
                {
                  request: {
                    method: 'eth_getBlockByNumber',
                    params: ['latest', false],
                  },
                  error: BLOCKED_INFURA_JSON_RPC_ERROR,
                },
              ],
              stubLookupNetworkWhileSetting: true,
            });

            await operation(controller);

            expect(
              controller.state.networksMetadata[
                controller.state.selectedNetworkClientId
              ].status,
            ).toBe(NetworkStatus.Blocked);
          },
        );
      });

      it('does not emit infuraIsUnblocked', async () => {
        await withController(
          {
            state: initialState,
          },
          async ({ controller, messenger }) => {
            await setFakeProvider(controller, {
              stubs: [
                {
                  request: {
                    method: 'eth_getBlockByNumber',
                    params: ['latest', false],
                  },
                  error: BLOCKED_INFURA_JSON_RPC_ERROR,
                },
              ],
              stubLookupNetworkWhileSetting: true,
            });

            const infuraIsUnblocked = waitForPublishedEvents({
              messenger,
              eventType: 'NetworkController:infuraIsUnblocked',
              count: 0,
              operation: async () => {
                await operation(controller);
              },
            });

            await expect(infuraIsUnblocked).toBeFulfilled();
          },
        );
      });

      it('emits infuraIsBlocked', async () => {
        await withController(
          {
            state: initialState,
          },
          async ({ controller, messenger }) => {
            await setFakeProvider(controller, {
              stubs: [
                {
                  request: {
                    method: 'eth_getBlockByNumber',
                    params: ['latest', false],
                  },
                  error: BLOCKED_INFURA_JSON_RPC_ERROR,
                },
              ],
              stubLookupNetworkWhileSetting: true,
            });

            const infuraIsBlocked = waitForPublishedEvents({
              messenger,
              eventType: 'NetworkController:infuraIsBlocked',
              operation: async () => {
                await operation(controller);
              },
            });

            await expect(infuraIsBlocked).toBeFulfilled();
          },
        );
      });
    }

    it('resets the network details in state', async () => {
      await withController(
        {
          state: initialState,
        },
        async ({ controller }) => {
          await setFakeProvider(controller, {
            stubs: [
              // Called during provider initialization
              {
                request: {
                  method: 'eth_getBlockByNumber',
                  params: ['latest', false],
                },
                response: {
                  result: PRE_1559_BLOCK,
                },
              },
              // Called when calling the operation directly
              {
                request: {
                  method: 'eth_getBlockByNumber',
                  params: ['latest', false],
                },
                error: BLOCKED_INFURA_JSON_RPC_ERROR,
              },
            ],
          });
          expect(
            controller.state.networksMetadata[
              controller.state.selectedNetworkClientId
            ].EIPS[1559],
          ).toBe(false);

          await operation(controller);

          expect(
            controller.state.networksMetadata[
              controller.state.selectedNetworkClientId
            ].EIPS,
          ).toStrictEqual({});
        },
      );
    });
  });

  describe('if an internal error is encountered while retrieving the network details of the current network', () => {
    it('updates the network in state to "unknown"', async () => {
      await withController(
        {
          state: initialState,
        },
        async ({ controller }) => {
          await setFakeProvider(controller, {
            stubs: [
              {
                request: {
                  method: 'eth_getBlockByNumber',
                  params: ['latest', false],
                },
                error: GENERIC_JSON_RPC_ERROR,
              },
            ],
            stubLookupNetworkWhileSetting: true,
          });

          await operation(controller);

          expect(
            controller.state.networksMetadata[
              controller.state.selectedNetworkClientId
            ].status,
          ).toBe(NetworkStatus.Unknown);
        },
      );
    });

    it('resets the network details in state', async () => {
      await withController(
        {
          state: initialState,
        },
        async ({ controller }) => {
          await setFakeProvider(controller, {
            stubs: [
              // Called during provider initialization
              {
                request: {
                  method: 'eth_getBlockByNumber',
                  params: ['latest', false],
                },
                response: {
                  result: PRE_1559_BLOCK,
                },
              },
              // Called when calling the operation directly
              {
                request: {
                  method: 'eth_getBlockByNumber',
                  params: ['latest', false],
                },
                error: GENERIC_JSON_RPC_ERROR,
              },
            ],
          });
          expect(
            controller.state.networksMetadata[
              controller.state.selectedNetworkClientId
            ].EIPS[1559],
          ).toBe(false);

          await operation(controller);

          expect(
            controller.state.networksMetadata[
              controller.state.selectedNetworkClientId
            ].EIPS,
          ).toStrictEqual({});
        },
      );
    });

    if (expectedNetworkClientType === NetworkClientType.Custom) {
      it('emits infuraIsUnblocked', async () => {
        await withController(
          {
            state: initialState,
          },
          async ({ controller, messenger }) => {
            await setFakeProvider(controller, {
              stubs: [
                {
                  request: {
                    method: 'eth_getBlockByNumber',
                    params: ['latest', false],
                  },
                  error: GENERIC_JSON_RPC_ERROR,
                },
              ],
              stubLookupNetworkWhileSetting: true,
            });

            const infuraIsUnblocked = waitForPublishedEvents({
              messenger,
              eventType: 'NetworkController:infuraIsUnblocked',
              operation: async () => {
                await operation(controller);
              },
            });

            await expect(infuraIsUnblocked).toBeFulfilled();
          },
        );
      });
    } else {
      it('does not emit infuraIsUnblocked', async () => {
        await withController(
          {
            state: initialState,
          },
          async ({ controller, messenger }) => {
            await setFakeProvider(controller, {
              stubs: [
                {
                  request: {
                    method: 'eth_getBlockByNumber',
                    params: ['latest', false],
                  },
                  error: GENERIC_JSON_RPC_ERROR,
                },
              ],
              stubLookupNetworkWhileSetting: true,
            });

            const infuraIsUnblocked = waitForPublishedEvents({
              messenger,
              eventType: 'NetworkController:infuraIsUnblocked',
              count: 0,
              operation: async () => {
                await operation(controller);
              },
            });

            await expect(infuraIsUnblocked).toBeFulfilled();
          },
        );
      });
    }

    it('does not emit infuraIsBlocked', async () => {
      await withController(
        {
          state: initialState,
        },
        async ({ controller, messenger }) => {
          await setFakeProvider(controller, {
            stubs: [
              {
                request: {
                  method: 'eth_getBlockByNumber',
                  params: ['latest', false],
                },
                error: GENERIC_JSON_RPC_ERROR,
              },
            ],
            stubLookupNetworkWhileSetting: true,
          });

          const infuraIsBlocked = waitForPublishedEvents({
            messenger,
            eventType: 'NetworkController:infuraIsBlocked',
            count: 0,
            operation: async () => {
              await operation(controller);
            },
          });

          await expect(infuraIsBlocked).toBeFulfilled();
        },
      );
    });
  });

  describe('getSelectedNetworkClient', () => {
    it('returns the selected network provider and blockTracker proxy when initialized', async () => {
      await withController(async ({ controller }) => {
        const fakeProvider = buildFakeProvider();
        const fakeNetworkClient = buildFakeClient(fakeProvider);
        mockCreateNetworkClient().mockReturnValue(fakeNetworkClient);
        await controller.initializeProvider();
        const defaultNetworkClient = controller.getProviderAndBlockTracker();

        const selectedNetworkClient = controller.getSelectedNetworkClient();
        expect(defaultNetworkClient.provider).toBe(
          selectedNetworkClient?.provider,
        );
        expect(defaultNetworkClient.blockTracker).toBe(
          selectedNetworkClient?.blockTracker,
        );
      });
    });

    it('returns undefined when the selected network provider and blockTracker proxy are not initialized', async () => {
      await withController(async ({ controller }) => {
        const selectedNetworkClient = controller.getSelectedNetworkClient();
        expect(selectedNetworkClient).toBeUndefined();
      });
    });
  });
}

/**
 * Build a controller messenger that includes all events used by the network
 * controller.
 *
 * @returns The controller messenger.
 */
function buildMessenger() {
  return new ControllerMessenger<
    NetworkControllerActions,
    NetworkControllerEvents
  >();
}

/**
 * Build a restricted controller messenger for the network controller.
 *
 * @param messenger - A controller messenger.
 * @returns The network controller restricted messenger.
 */
function buildNetworkControllerMessenger(messenger = buildMessenger()) {
  return messenger.getRestricted({
    name: 'NetworkController',
    allowedActions: [],
    allowedEvents: [],
  });
}

type WithControllerCallback<ReturnValue> = ({
  controller,
}: {
  controller: NetworkController;
  messenger: ControllerMessenger<
    NetworkControllerActions,
    NetworkControllerEvents
  >;
}) => Promise<ReturnValue> | ReturnValue;

type WithControllerOptions = Partial<NetworkControllerOptions>;

type WithControllerArgs<ReturnValue> =
  | [WithControllerCallback<ReturnValue>]
  | [WithControllerOptions, WithControllerCallback<ReturnValue>];

/**
 * Builds a controller based on the given options, and calls the given function
 * with that controller.
 *
 * @param args - Either a function, or an options bag + a function. The options
 * bag is equivalent to the options that NetworkController takes (although
 * `messenger` and `infuraProjectId` are  filled in if not given); the function
 * will be called with the built controller.
 * @returns Whatever the callback returns.
 */
async function withController<ReturnValue>(
  ...args: WithControllerArgs<ReturnValue>
): Promise<ReturnValue> {
  const [{ ...rest }, fn] = args.length === 2 ? args : [{}, args[0]];
  const messenger = buildMessenger();
  const restrictedMessenger = buildNetworkControllerMessenger(messenger);
  const controller = new NetworkController({
    messenger: restrictedMessenger,
    infuraProjectId: 'infura-project-id',
    ...rest,
  });
  try {
    return await fn({ controller, messenger });
  } finally {
    const { blockTracker } = controller.getProviderAndBlockTracker();
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    blockTracker?.destroy();
  }
}

/**
 * Builds an object that `createNetworkClient` returns.
 *
 * @param provider - The provider to use.
 * @returns The network client.
 */
function buildFakeClient(
  provider: Provider = buildFakeProvider(),
): NetworkClient {
  return {
    configuration: {
      type: NetworkClientType.Custom,
      ticker: 'TEST',
      chainId: '0x1',
      rpcUrl: 'https://test.network',
    },
    provider,
    blockTracker: new FakeBlockTracker({ provider }),
    destroy: () => {
      // do nothing
    },
  };
}

/**
 * Builds an object that fits the same shape as the object that the
 * `@metamask/eth-json-rpc-provider` package builds, with canned responses
 * optionally provided for certain RPC methods.
 *
 * @param stubs - The list of RPC methods you want to stub along with their
 * responses. `eth_getBlockByNumber` will be stubbed by default.
 * @returns The object.
 */
function buildFakeProvider(stubs: FakeProviderStub[] = []): Provider {
  const completeStubs = stubs.slice();
  if (!stubs.some((stub) => stub.request.method === 'eth_getBlockByNumber')) {
    completeStubs.unshift({
      request: { method: 'eth_getBlockByNumber' },
      response: { result: '0x1' },
      discardAfterMatching: false,
    });
  }
  return new FakeProvider({ stubs: completeStubs });
}

/**
 * Asks the controller to set the provider in the simplest way, stubbing the
 * provider appropriately so as not to cause any errors to be thrown. This is
 * useful in tests where it doesn't matter how the provider gets set, just that
 * it does. Canned responses may be optionally provided for certain RPC methods
 * on the provider.
 *
 * @param controller - The network controller.
 * @param options - Additional options.
 * @param options.stubs - The set of RPC methods you want to stub on the
 * provider along with their responses.
 * @param options.stubLookupNetworkWhileSetting - Whether to stub the call to
 * `lookupNetwork` that happens when the provider is set. This option is useful
 * in tests that need a provider to get set but also call `lookupNetwork` on
 * their own. In this case, since the `providerConfig` setter already calls
 * `lookupNetwork` once, and since `lookupNetwork` is called out of band, the
 * test may run with unexpected results. By stubbing `lookupNetwork` before
 * setting the provider, the test is free to explicitly call it.
 * @returns The set provider.
 */
async function setFakeProvider(
  controller: NetworkController,
  {
    stubs = [],
    stubLookupNetworkWhileSetting = false,
  }: {
    stubs?: FakeProviderStub[];
    stubLookupNetworkWhileSetting?: boolean;
  } = {},
): Promise<void> {
  const fakeProvider = buildFakeProvider(stubs);
  const fakeNetworkClient = buildFakeClient(fakeProvider);
  createNetworkClientMock.mockReturnValue(fakeNetworkClient);
  const lookupNetworkMock = jest.spyOn(controller, 'lookupNetwork');

  if (stubLookupNetworkWhileSetting) {
    lookupNetworkMock.mockResolvedValue(undefined);
  }

  await controller.initializeProvider();
  assert(controller.getProviderAndBlockTracker().provider);

  if (stubLookupNetworkWhileSetting) {
    lookupNetworkMock.mockRestore();
  }
}

/**
 * Waits for controller events to be emitted before proceeding.
 *
 * @param options - An options bag.
 * @param options.messenger - The messenger suited for NetworkController.
 * @param options.eventType - The type of NetworkController event you want to wait for.
 * @param options.count - The number of events you expect to occur (default: 1).
 * @param options.filter - A function used to discard events that are not of
 * interest.
 * @param options.wait - The amount of time in milliseconds to wait for the
 * expected number of filtered events to occur before resolving the promise that
 * this function returns (default: 150).
 * @param options.operation - A function to run that will presumably produce
 * the events in question.
 * @param options.beforeResolving - In some tests, events occur so fast, we need
 * to make an assertion immediately after the event in question occurs. However,
 * if we wait until the promise this function returns resolves to do so, some
 * other state update to the same property may have happened. This option allows
 * you to make an assertion _before_ the promise resolves. This has the added
 * benefit of allowing you to maintain the "arrange, act, assert" ordering in
 * your test, meaning that you can still call the method that kicks off the
 * event and then make the assertion afterward instead of the other way around.
 * @returns A promise that resolves to the list of payloads for the set of
 * events, optionally filtered, when a specific number of them have occurred.
 */
// TODO: Either fix this lint violation or explain why it's necessary to ignore.
// eslint-disable-next-line @typescript-eslint/naming-convention
async function waitForPublishedEvents<E extends NetworkControllerEvents>({
  messenger,
  eventType,
  count: expectedNumberOfEvents = 1,
  filter: isEventPayloadInteresting = () => true,
  wait: timeBeforeAssumingNoMoreEvents = 150,
  operation = () => {
    // do nothing
  },
  beforeResolving = async () => {
    // do nothing
  },
}: {
  messenger: ControllerMessenger<
    NetworkControllerActions,
    NetworkControllerEvents
  >;
  eventType: E['type'];
  count?: number;
  filter?: (payload: E['payload']) => boolean;
  wait?: number;
  operation?: () => void | Promise<void>;
  beforeResolving?: () => void | Promise<void>;
}): Promise<E['payload'][]> {
  const promiseForEventPayloads = new Promise<E['payload'][]>(
    (resolve, reject) => {
      let timer: NodeJS.Timeout | undefined;
      const allEventPayloads: E['payload'][] = [];
      const interestingEventPayloads: E['payload'][] = [];
      let alreadyEnded = false;

      // We're using `any` here because there seems to be some mismatch between
      // the signature of `subscribe` and the way that we're using it. Try
      // changing `any` to either `((...args: E['payload']) => void)` or
      // `ExtractEventHandler<E, E['type']>` to see the issue.
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const eventListener: any = (...payload: E['payload']) => {
        allEventPayloads.push(payload);

        if (isEventPayloadInteresting(payload)) {
          interestingEventPayloads.push(payload);
          if (interestingEventPayloads.length === expectedNumberOfEvents) {
            stopTimer();
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            end();
          } else {
            resetTimer();
          }
        }
      };

      /**
       * Stop listening for published events.
       */
      async function end() {
        if (!alreadyEnded) {
          messenger.unsubscribe(eventType, eventListener);

          await beforeResolving();

          if (interestingEventPayloads.length === expectedNumberOfEvents) {
            resolve(interestingEventPayloads);
          } else {
            // Using a string instead of an Error leads to better backtraces.
            /* eslint-disable-next-line prefer-promise-reject-errors */
            reject(
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
              `Expected to receive ${expectedNumberOfEvents} ${eventType} event(s), but received ${
                interestingEventPayloads.length
              } after ${timeBeforeAssumingNoMoreEvents}ms.\n\nAll payloads:\n\n${inspect(
                allEventPayloads,
                { depth: null },
              )}`,
            );
          }
          alreadyEnded = true;
        }
      }

      /**
       * Stop the timer used to detect a timeout when listening for published events.
       */
      function stopTimer() {
        if (timer) {
          clearTimeout(timer);
        }
      }

      /**
       * Reset the timer used to detect a timeout when listening for published events.
       */
      function resetTimer() {
        stopTimer();
        timer = setTimeout(() => {
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          end();
        }, timeBeforeAssumingNoMoreEvents);
      }

      messenger.subscribe(eventType, eventListener);
      resetTimer();
    },
  );

  await operation();

  return await promiseForEventPayloads;
}

/**
 * Waits for state change events to be emitted (optionally centered around a
 * particular property) before proceeding.
 *
 * @param options - An options bag.
 * @param options.messenger - The messenger suited for NetworkController.
 * @param options.propertyPath - The path of the property you expect the state
 * changes to concern.
 * @param options.count - The number of events you expect to occur (default: 1).
 * @param options.wait - The amount of time in milliseconds to wait for the
 * expected number of filtered events to occur before resolving the promise that
 * this function returns (default: 150).
 * @param options.operation - A function to run that will presumably
 * produce the state changes in question.
 * @param options.beforeResolving - In some tests, state updates happen so fast,
 * we need to make an assertion immediately after the event in question occurs.
 * However, if we wait until the promise this function returns resolves to do
 * so, some other state update to the same property may have happened. This
 * option allows you to make an assertion _before_ the promise resolves. This
 * has the added benefit of allowing you to maintain the "arrange, act, assert"
 * ordering in your test, meaning that you can still call the method that kicks
 * off the event and then make the assertion afterward instead of the other way
 * around.
 * @returns A promise that resolves to the list of state changes, optionally
 * filtered by the property, when a specific number of them have occurred.
 */
async function waitForStateChanges({
  messenger,
  propertyPath,
  count,
  wait,
  operation,
  beforeResolving,
}: {
  messenger: ControllerMessenger<
    NetworkControllerActions,
    NetworkControllerEvents
  >;
  propertyPath?: string[];
  count?: number;
  wait?: number;
  operation?: () => void | Promise<void>;
  beforeResolving?: () => void | Promise<void>;
}): Promise<[NetworkState, Patch[]][]> {
  const filter =
    propertyPath === undefined
      ? () => true
      : ([_newState, patches]: [NetworkState, Patch[]]) =>
          didPropertyChange(patches, propertyPath);

  return await waitForPublishedEvents<NetworkControllerStateChangeEvent>({
    messenger,
    eventType: 'NetworkController:stateChange',
    operation,
    count,
    filter,
    wait,
    beforeResolving,
  });
}

/**
 * Given a set of Immer patches, determines whether the given property was
 * added, removed, or replaced in some way.
 *
 * @param patches - The Immer patches.
 * @param propertyPath - The path to a property. For instance, if you wanted to
 * know whether `foo` has changed you'd say `["foo"]`; if `foo.bar` then
 * `["foo", "bar"]`.
 * @returns A boolean.
 */
function didPropertyChange(patches: Patch[], propertyPath: string[]): boolean {
  return patches.some((patch) => {
    const minLength = Math.min(patch.path.length, propertyPath.length);
    return isDeepStrictEqual(
      patch.path.slice(0, minLength),
      propertyPath.slice(0, minLength),
    );
  });
}

/**
 * Extracts the network client configurations from a network client registry so
 * that it is easier to test without having to ignore every property in
 * NetworkClient but `configuration`.
 *
 * @param networkClientRegistry - The network client registry.
 * @returns A map of network client ID to network client configuration.
 */
function getNetworkConfigurationsByNetworkClientId(
  networkClientRegistry: AutoManagedBuiltInNetworkClientRegistry &
    AutoManagedCustomNetworkClientRegistry,
): Record<NetworkClientId, NetworkClientConfiguration> {
  return Object.entries(networkClientRegistry).reduce(
    (
      obj: Partial<Record<NetworkClientId, NetworkClientConfiguration>>,
      [networkClientId, networkClient],
    ) => {
      return {
        ...obj,
        [networkClientId]: networkClient.configuration,
      };
    },
    {},
  ) as Record<NetworkClientId, NetworkClientConfiguration>;
}

/**
 * When initializing NetworkController with state, the `selectedNetworkClientId`
 * property must match the `networkClientId` of an RPC endpoint in
 * `networkConfigurationsByChainId`. Sometimes when writing tests we care about
 * what the `selectedNetworkClientId` is, but sometimes we don't and we'd rather
 * have this property automatically filled in for us.
 *
 * This function takes care of filling in the `selectedNetworkClientId` using
 * the first RPC endpoint of the first network configuration given.
 *
 * @param networkControllerState - The desired NetworkController state
 * overrides.
 * @param networkControllerState.networkConfigurationsByChainId - The desired
 * `networkConfigurationsByChainId`.
 * @param networkControllerState.selectedNetworkClientId - The desired
 * `selectedNetworkClientId`; if not provided, then will be set to the
 * `networkClientId` of the first RPC endpoint in
 * `networkConfigurationsByChainId`.
 * @returns The complete NetworkController state with `selectedNetworkClientId`
 * properly filled in.
 */
function buildNetworkControllerStateWithDefaultSelectedNetworkClientId({
  networkConfigurationsByChainId,
  selectedNetworkClientId: givenSelectedNetworkClientId,
  ...rest
}: Partial<Omit<NetworkState, 'networkConfigurationsByChainId'>> &
  Pick<NetworkState, 'networkConfigurationsByChainId'>) {
  if (givenSelectedNetworkClientId === undefined) {
    const networkConfigurations = Object.values(networkConfigurationsByChainId);
    const selectedNetworkClientId =
      networkConfigurations.length > 0
        ? networkConfigurations[0].rpcEndpoints[0].networkClientId
        : undefined;
    return {
      networkConfigurationsByChainId,
      selectedNetworkClientId,
      ...rest,
    };
  }

  return {
    networkConfigurationsByChainId,
    selectedNetworkClientId: givenSelectedNetworkClientId,
    ...rest,
  };
}
