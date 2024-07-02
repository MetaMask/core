import { ControllerMessenger } from '@metamask/base-controller';
import {
  BUILT_IN_NETWORKS,
  InfuraNetworkType,
  isInfuraNetworkType,
  MAX_SAFE_CHAIN_ID,
  NetworkType,
  toHex,
} from '@metamask/controller-utils';
import { rpcErrors } from '@metamask/rpc-errors';
import {
  getKnownPropertyNames,
  type JsonRpcSuccess,
  type Json,
} from '@metamask/utils';
import assert from 'assert';
import type { Patch } from 'immer';
import { when, resetAllWhenMocks } from 'jest-when';
import { inspect, isDeepStrictEqual, promisify } from 'util';
import { v4 } from 'uuid';

import { FakeBlockTracker } from '../../../tests/fake-block-tracker';
import type { FakeProviderStub } from '../../../tests/fake-provider';
import { FakeProvider } from '../../../tests/fake-provider';
import { NetworkStatus } from '../src/constants';
import type { NetworkClient } from '../src/create-network-client';
import { createNetworkClient } from '../src/create-network-client';
import type {
  NetworkClientId,
  NetworkConfiguration,
  NetworkControllerActions,
  NetworkControllerEvents,
  NetworkControllerOptions,
  NetworkControllerStateChangeEvent,
  NetworkState,
} from '../src/NetworkController';
import { NetworkController } from '../src/NetworkController';
import type { NetworkClientConfiguration, Provider } from '../src/types';
import { NetworkClientType } from '../src/types';
import {
  buildCustomNetworkClientConfiguration,
  buildInfuraNetworkClientConfiguration,
} from './helpers';

jest.mock('../src/create-network-client');

jest.mock('uuid', () => {
  const actual = jest.requireActual('uuid');

  return {
    ...actual,
    v4: jest.fn().mockReturnValue('UUID'),
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
const uuidV4Mock = jest.mocked(v4);

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
 * The networks that NetworkController recognizes as built-in Infura networks,
 * along with information we expect to be true for those networks.
 */
const INFURA_NETWORKS = [
  {
    networkType: NetworkType['linea-goerli'],
    chainId: toHex(59140),
    ticker: 'LineaETH',
    blockExplorerUrl: 'https://goerli.lineascan.build',
  },
  {
    networkType: NetworkType['linea-sepolia'],
    chainId: toHex(59141),
    ticker: 'LineaETH',
    blockExplorerUrl: 'https://sepolia.lineascan.build',
  },
  {
    networkType: NetworkType['linea-mainnet'],
    chainId: toHex(59144),
    ticker: 'ETH',
    blockExplorerUrl: 'https://lineascan.build',
  },
  {
    networkType: NetworkType.mainnet,
    chainId: toHex(1),
    ticker: 'ETH',
    blockExplorerUrl: 'https://etherscan.io',
  },
  {
    networkType: NetworkType.goerli,
    chainId: toHex(5),
    ticker: 'GoerliETH',
    blockExplorerUrl: 'https://goerli.etherscan.io',
  },
  {
    networkType: NetworkType.sepolia,
    chainId: toHex(11155111),
    ticker: 'SepoliaETH',
    blockExplorerUrl: 'https://sepolia.etherscan.io',
  },
];

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
  afterEach(() => {
    resetAllWhenMocks();
  });

  describe('constructor', () => {
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
            "networkConfigurations": Object {},
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
              "networkConfigurations": Object {},
              "networksMetadata": Object {
                "mainnet": Object {
                  "EIPS": Object {
                    "1559": true,
                  },
                  "status": "unknown",
                },
              },
              "selectedNetworkClientId": "mainnet",
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
    for (const { networkType } of INFURA_NETWORKS) {
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      describe(`when selectedNetworkClientId in state is the Infura network "${networkType}"`, () => {
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        it(`does not create another network client for the "${networkType}" network, since it is built in`, async () => {
          await withController(
            {
              state: {
                selectedNetworkClientId: networkType,
              },
              infuraProjectId: 'some-infura-project-id',
            },
            async ({ controller }) => {
              const fakeNetworkClient = buildFakeClient();
              createNetworkClientMock.mockReturnValue(fakeNetworkClient);

              await controller.initializeProvider();

              expect(createNetworkClientMock).toHaveBeenCalledWith({
                network: networkType,
                infuraProjectId: 'some-infura-project-id',
                type: NetworkClientType.Infura,
                chainId: BUILT_IN_NETWORKS[networkType].chainId,
                ticker: BUILT_IN_NETWORKS[networkType].ticker,
              });
              expect(createNetworkClientMock).toHaveBeenCalledTimes(1);
            },
          );
        });

        it('captures the resulting provider of the matching network client', async () => {
          await withController(
            {
              state: {
                selectedNetworkClientId: networkType,
              },
              infuraProjectId: 'some-infura-project-id',
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
              createNetworkClientMock.mockReturnValue(fakeNetworkClient);

              await controller.initializeProvider();

              const { provider } = controller.getProviderAndBlockTracker();
              assert(provider, 'Provider is not set');
              const { result } = (await provider.request({
                id: 1,
                jsonrpc: '2.0',
                method: 'test_method',
                params: [],
              })) as JsonRpcSuccess<Json>;
              expect(result).toBe('test response');
            },
          );
        });

        lookupNetworkTests({
          expectedNetworkClientConfiguration:
            buildInfuraNetworkClientConfiguration(networkType),
          initialState: {
            selectedNetworkClientId: networkType,
          },
          operation: async (controller: NetworkController) => {
            await controller.initializeProvider();
          },
        });
      });
    }

    describe('when selectedNetworkClientId in state is the ID of a network configuration', () => {
      it('creates a network client using the network configuration', async () => {
        await withController(
          {
            state: {
              selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
              networkConfigurations: {
                'AAAA-AAAA-AAAA-AAAA': {
                  id: 'AAAA-AAAA-AAAA-AAAA',
                  rpcUrl: 'https://test.network.1',
                  chainId: toHex(1337),
                  ticker: 'TEST',
                },
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
            createNetworkClientMock.mockReturnValue(fakeNetworkClient);

            await controller.initializeProvider();

            expect(createNetworkClientMock).toHaveBeenCalledWith({
              chainId: toHex(1337),
              rpcUrl: 'https://test.network.1',
              type: NetworkClientType.Custom,
              ticker: 'TEST',
            });
            expect(createNetworkClientMock).toHaveBeenCalledTimes(1);
          },
        );
      });

      it('captures the resulting provider of the new network client', async () => {
        await withController(
          {
            state: {
              selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
              networkConfigurations: {
                'AAAA-AAAA-AAAA-AAAA': {
                  id: 'AAAA-AAAA-AAAA-AAAA',
                  rpcUrl: 'https://test.network.1',
                  chainId: toHex(1337),
                  ticker: 'TEST',
                },
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
            createNetworkClientMock.mockReturnValue(fakeNetworkClient);

            await controller.initializeProvider();

            const { provider } = controller.getProviderAndBlockTracker();
            assert(provider, 'Provider is not set');
            const { result } = (await provider.request({
              id: 1,
              jsonrpc: '2.0',
              method: 'test_method',
              params: [],
            })) as JsonRpcSuccess<Json>;
            expect(result).toBe('test response');
          },
        );
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

    for (const { networkType } of INFURA_NETWORKS) {
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      describe(`when the selectedNetworkClientId is changed to "${networkType}"`, () => {
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        it(`returns a provider object that was pointed to another network before the switch and is pointed to "${networkType}" afterward`, async () => {
          await withController(
            {
              state: {
                selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
                networkConfigurations: {
                  'AAAA-AAAA-AAAA-AAAA': {
                    id: 'AAAA-AAAA-AAAA-AAAA',
                    rpcUrl: 'https://mock-rpc-url',
                    chainId: toHex(1337),
                    ticker: 'TEST',
                  },
                },
              },
              infuraProjectId: 'some-infura-project-id',
            },
            async ({ controller }) => {
              const fakeProviders = [
                buildFakeProvider([
                  {
                    request: {
                      method: 'test',
                    },
                    response: {
                      result: 'test response 1',
                    },
                  },
                ]),
                buildFakeProvider([
                  {
                    request: {
                      method: 'test',
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
                  chainId: toHex(1337),
                  rpcUrl: 'https://mock-rpc-url',
                  type: NetworkClientType.Custom,
                  ticker: 'TEST',
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  network: networkType,
                  infuraProjectId: 'some-infura-project-id',
                  type: NetworkClientType.Infura,
                  chainId: BUILT_IN_NETWORKS[networkType].chainId,
                  ticker: BUILT_IN_NETWORKS[networkType].ticker,
                })
                .mockReturnValue(fakeNetworkClients[1]);
              await controller.initializeProvider();
              const { provider } = controller.getProviderAndBlockTracker();
              assert(provider, 'Provider is somehow unset');

              const response1 = await provider.request({
                id: '1',
                jsonrpc: '2.0',
                method: 'test',
              });
              expect((response1 as JsonRpcSuccess<Json>).result).toBe(
                'test response 1',
              );

              await controller.setProviderType(networkType);
              const response2 = await provider.request({
                id: '2',
                jsonrpc: '2.0',
                method: 'test',
              });
              expect((response2 as JsonRpcSuccess<Json>).result).toBe(
                'test response 2',
              );
            },
          );
        });
      });
    }

    describe(`when the selectedNetworkClientId is changed to a network configuration ID`, () => {
      it('returns a provider object that was pointed to another network before the switch and is pointed to the new network', async () => {
        await withController(
          {
            state: {
              selectedNetworkClientId: 'goerli',
              networkConfigurations: {
                testNetworkConfigurationId: {
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(1337),
                  ticker: 'ABC',
                  id: 'testNetworkConfigurationId',
                },
              },
            },
            infuraProjectId: 'some-infura-project-id',
          },
          async ({ controller }) => {
            const fakeProviders = [
              buildFakeProvider([
                {
                  request: {
                    method: 'test',
                  },
                  response: {
                    result: 'test response 1',
                  },
                },
              ]),
              buildFakeProvider([
                {
                  request: {
                    method: 'test',
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
                network: NetworkType.goerli,
                infuraProjectId: 'some-infura-project-id',
                type: NetworkClientType.Infura,
                chainId: BUILT_IN_NETWORKS[NetworkType.goerli].chainId,
                ticker: BUILT_IN_NETWORKS[InfuraNetworkType.goerli].ticker,
              })
              .mockReturnValue(fakeNetworkClients[0])
              .calledWith({
                chainId: toHex(1337),
                rpcUrl: 'https://mock-rpc-url',
                type: NetworkClientType.Custom,
                ticker: 'ABC',
              })
              .mockReturnValue(fakeNetworkClients[1]);
            await controller.initializeProvider();
            const { provider } = controller.getProviderAndBlockTracker();
            assert(provider, 'Provider is somehow unset');

            const response1 = await provider.request({
              id: '1',
              jsonrpc: '2.0',
              method: 'test',
            });
            expect((response1 as JsonRpcSuccess<Json>).result).toBe(
              'test response 1',
            );

            await controller.setActiveNetwork('testNetworkConfigurationId');
            const response2 = await provider.request({
              id: '2',
              jsonrpc: '2.0',
              method: 'test',
            });
            expect((response2 as JsonRpcSuccess<Json>).result).toBe(
              'test response 2',
            );
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
    describe('If passed an existing networkClientId', () => {
      it('returns a valid built-in Infura NetworkClient', async () => {
        await withController(
          { infuraProjectId: 'some-infura-project-id' },
          async ({ controller }) => {
            const fakeNetworkClient = buildFakeClient();
            mockCreateNetworkClient().mockReturnValue(fakeNetworkClient);

            const networkClientRegistry = controller.getNetworkClientRegistry();
            const networkClient = controller.getNetworkClientById(
              NetworkType.mainnet,
            );

            expect(networkClient).toBe(
              networkClientRegistry[NetworkType.mainnet],
            );
          },
        );
      });

      it('returns a valid built-in Infura NetworkClient with a chainId in configuration', async () => {
        await withController(
          { infuraProjectId: 'some-infura-project-id' },
          async ({ controller }) => {
            const fakeNetworkClient = buildFakeClient();
            mockCreateNetworkClient().mockReturnValue(fakeNetworkClient);

            const networkClientRegistry = controller.getNetworkClientRegistry();
            const networkClient = controller.getNetworkClientById(
              NetworkType.mainnet,
            );

            expect(networkClient.configuration.chainId).toBe('0x1');
            expect(networkClientRegistry.mainnet.configuration.chainId).toBe(
              '0x1',
            );
          },
        );
      });

      it('returns a valid custom NetworkClient', async () => {
        await withController(
          {
            state: {
              networkConfigurations: {
                testNetworkConfigurationId: {
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: '0x1337',
                  ticker: 'ABC',
                  id: 'testNetworkConfigurationId',
                },
              },
            },
            infuraProjectId: 'some-infura-project-id',
          },
          async ({ controller }) => {
            const fakeNetworkClient = buildFakeClient();
            mockCreateNetworkClient().mockReturnValue(fakeNetworkClient);

            const networkClientRegistry = controller.getNetworkClientRegistry();
            const networkClient = controller.getNetworkClientById(
              'testNetworkConfigurationId',
            );

            expect(networkClient).toBe(
              networkClientRegistry.testNetworkConfigurationId,
            );
          },
        );
      });
    });

    describe('If passed a networkClientId that does not match a NetworkClient in the registry', () => {
      it('throws an error', async () => {
        await withController(
          { infuraProjectId: 'some-infura-project-id' },
          async ({ controller }) => {
            const fakeNetworkClient = buildFakeClient();
            mockCreateNetworkClient().mockReturnValue(fakeNetworkClient);

            expect(() =>
              controller.getNetworkClientById('non-existent-network-id'),
            ).toThrow(
              'No custom network client was found with the ID "non-existent-network-id',
            );
          },
        );
      });
    });

    describe('If not passed a networkClientId', () => {
      it('throws an error', async () => {
        await withController(
          { infuraProjectId: 'some-infura-project-id' },
          async ({ controller }) => {
            const fakeNetworkClient = buildFakeClient();
            mockCreateNetworkClient().mockReturnValue(fakeNetworkClient);

            expect(() =>
              // @ts-expect-error Intentionally passing invalid type
              controller.getNetworkClientById(),
            ).toThrow('No network client ID was provided.');
          },
        );
      });
    });
  });

  describe('getNetworkClientRegistry', () => {
    describe('if no network configurations are present in state', () => {
      it('returns the built-in Infura networks by default', async () => {
        await withController(
          { infuraProjectId: 'some-infura-project-id' },
          async ({ controller }) => {
            const fakeNetworkClient = buildFakeClient();
            mockCreateNetworkClient().mockReturnValue(fakeNetworkClient);

            const networkClients = controller.getNetworkClientRegistry();
            const simplifiedNetworkClients = Object.entries(networkClients)
              .map(
                ([networkClientId, networkClient]) =>
                  [networkClientId, networkClient.configuration] as const,
              )
              .sort(
                (
                  [networkClientId1, _networkClient1],
                  [networkClientId2, _networkClient2],
                ) => {
                  return networkClientId1.localeCompare(networkClientId2);
                },
              );

            expect(simplifiedNetworkClients).toStrictEqual([
              [
                'goerli',
                {
                  type: NetworkClientType.Infura,
                  infuraProjectId: 'some-infura-project-id',
                  chainId: BUILT_IN_NETWORKS[NetworkType.goerli].chainId,
                  ticker: BUILT_IN_NETWORKS[NetworkType.goerli].ticker,
                  network: InfuraNetworkType.goerli,
                },
              ],
              [
                'linea-goerli',
                {
                  type: NetworkClientType.Infura,
                  infuraProjectId: 'some-infura-project-id',
                  chainId:
                    BUILT_IN_NETWORKS[NetworkType['linea-goerli']].chainId,
                  ticker: BUILT_IN_NETWORKS[NetworkType['linea-goerli']].ticker,
                  network: InfuraNetworkType['linea-goerli'],
                },
              ],
              [
                'linea-mainnet',
                {
                  type: NetworkClientType.Infura,
                  infuraProjectId: 'some-infura-project-id',
                  chainId:
                    BUILT_IN_NETWORKS[NetworkType['linea-mainnet']].chainId,
                  ticker:
                    BUILT_IN_NETWORKS[NetworkType['linea-mainnet']].ticker,
                  network: InfuraNetworkType['linea-mainnet'],
                },
              ],
              [
                'linea-sepolia',
                {
                  type: NetworkClientType.Infura,
                  infuraProjectId: 'some-infura-project-id',
                  chainId:
                    BUILT_IN_NETWORKS[NetworkType['linea-sepolia']].chainId,
                  ticker:
                    BUILT_IN_NETWORKS[NetworkType['linea-sepolia']].ticker,
                  network: InfuraNetworkType['linea-sepolia'],
                },
              ],
              [
                'mainnet',
                {
                  type: NetworkClientType.Infura,
                  infuraProjectId: 'some-infura-project-id',
                  chainId: BUILT_IN_NETWORKS[NetworkType.mainnet].chainId,
                  ticker: BUILT_IN_NETWORKS[NetworkType.mainnet].ticker,
                  network: InfuraNetworkType.mainnet,
                },
              ],
              [
                'sepolia',
                {
                  type: NetworkClientType.Infura,
                  infuraProjectId: 'some-infura-project-id',
                  chainId: BUILT_IN_NETWORKS[NetworkType.sepolia].chainId,
                  ticker: BUILT_IN_NETWORKS[NetworkType.sepolia].ticker,
                  network: InfuraNetworkType.sepolia,
                },
              ],
            ]);
          },
        );
      });
    });

    describe('if network configurations are present in state', () => {
      it('incorporates them into the list of network clients, using the network configuration ID for identification', async () => {
        await withController(
          {
            state: {
              networkConfigurations: {
                'AAAA-AAAA-AAAA-AAAA': {
                  id: 'AAAA-AAAA-AAAA-AAAA',
                  rpcUrl: 'https://test.network.1',
                  chainId: toHex(1),
                  ticker: 'TEST1',
                },
                'BBBB-BBBB-BBBB-BBBB': {
                  id: 'BBBB-BBBB-BBBB-BBBB',
                  rpcUrl: 'https://test.network.2',
                  chainId: toHex(2),
                  ticker: 'TEST2',
                },
              },
            },
            infuraProjectId: 'some-infura-project-id',
          },
          async ({ controller }) => {
            const fakeNetworkClient = buildFakeClient();
            mockCreateNetworkClient().mockReturnValue(fakeNetworkClient);

            const networkClients = controller.getNetworkClientRegistry();
            const simplifiedNetworkClients = Object.entries(networkClients)
              .map(
                ([networkClientId, networkClient]) =>
                  [networkClientId, networkClient.configuration] as const,
              )
              .sort(
                (
                  [networkClientId1, _networkClient1],
                  [networkClientId2, _networkClient2],
                ) => {
                  return networkClientId1.localeCompare(networkClientId2);
                },
              );

            expect(simplifiedNetworkClients).toStrictEqual([
              [
                'AAAA-AAAA-AAAA-AAAA',
                {
                  type: NetworkClientType.Custom,
                  ticker: 'TEST1',
                  chainId: toHex(1),
                  rpcUrl: 'https://test.network.1',
                },
              ],
              [
                'BBBB-BBBB-BBBB-BBBB',
                {
                  type: NetworkClientType.Custom,
                  ticker: 'TEST2',
                  chainId: toHex(2),
                  rpcUrl: 'https://test.network.2',
                },
              ],
              [
                'goerli',
                {
                  type: NetworkClientType.Infura,
                  infuraProjectId: 'some-infura-project-id',
                  chainId: BUILT_IN_NETWORKS[NetworkType.goerli].chainId,
                  ticker: BUILT_IN_NETWORKS[InfuraNetworkType.goerli].ticker,
                  network: InfuraNetworkType.goerli,
                },
              ],
              [
                'linea-goerli',
                {
                  type: NetworkClientType.Infura,
                  infuraProjectId: 'some-infura-project-id',
                  chainId:
                    BUILT_IN_NETWORKS[NetworkType['linea-goerli']].chainId,
                  ticker: BUILT_IN_NETWORKS[NetworkType['linea-goerli']].ticker,
                  network: InfuraNetworkType['linea-goerli'],
                },
              ],
              [
                'linea-mainnet',
                {
                  type: NetworkClientType.Infura,
                  infuraProjectId: 'some-infura-project-id',
                  chainId:
                    BUILT_IN_NETWORKS[NetworkType['linea-mainnet']].chainId,
                  ticker:
                    BUILT_IN_NETWORKS[NetworkType['linea-mainnet']].ticker,
                  network: InfuraNetworkType['linea-mainnet'],
                },
              ],
              [
                'linea-sepolia',
                {
                  type: NetworkClientType.Infura,
                  infuraProjectId: 'some-infura-project-id',
                  chainId:
                    BUILT_IN_NETWORKS[NetworkType['linea-sepolia']].chainId,
                  ticker:
                    BUILT_IN_NETWORKS[NetworkType['linea-sepolia']].ticker,
                  network: InfuraNetworkType['linea-sepolia'],
                },
              ],
              [
                'mainnet',
                {
                  type: NetworkClientType.Infura,
                  infuraProjectId: 'some-infura-project-id',
                  chainId: BUILT_IN_NETWORKS[NetworkType.mainnet].chainId,
                  ticker: BUILT_IN_NETWORKS[NetworkType.mainnet].ticker,
                  network: InfuraNetworkType.mainnet,
                },
              ],
              [
                'sepolia',
                {
                  type: NetworkClientType.Infura,
                  infuraProjectId: 'some-infura-project-id',
                  chainId: BUILT_IN_NETWORKS[NetworkType.sepolia].chainId,
                  ticker: BUILT_IN_NETWORKS[NetworkType.sepolia].ticker,
                  network: InfuraNetworkType.sepolia,
                },
              ],
            ]);
            for (const networkClient of Object.values(networkClients)) {
              expect(networkClient.provider).toHaveProperty('request');
              expect(networkClient.blockTracker).toHaveProperty(
                'checkForLatestBlock',
              );
            }
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

    [NetworkType.mainnet, NetworkType.goerli, NetworkType.sepolia].forEach(
      (networkType) => {
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        describe(`when selectedNetworkClientId in state is "${networkType}"`, () => {
          describe('if the network was switched after the eth_getBlockByNumber request started but before it completed', () => {
            it('stores the network status of the second network, not the first', async () => {
              await withController(
                {
                  state: {
                    selectedNetworkClientId: networkType,
                    networkConfigurations: {
                      testNetworkConfigurationId: {
                        id: 'testNetworkConfigurationId',
                        rpcUrl: 'https://mock-rpc-url',
                        chainId: toHex(1337),
                        ticker: 'ABC',
                      },
                    },
                  },
                  infuraProjectId: 'some-infura-project-id',
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
                          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
                          // eslint-disable-next-line @typescript-eslint/no-floating-promises
                          controller.setActiveNetwork(
                            'testNetworkConfigurationId',
                          );
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
                      network: networkType,
                      infuraProjectId: 'some-infura-project-id',
                      type: NetworkClientType.Infura,
                      chainId: BUILT_IN_NETWORKS[networkType].chainId,
                      ticker: BUILT_IN_NETWORKS[networkType].ticker,
                    })
                    .mockReturnValue(fakeNetworkClients[0])
                    .calledWith({
                      chainId: toHex(1337),
                      rpcUrl: 'https://mock-rpc-url',
                      type: NetworkClientType.Custom,
                      ticker: 'ABC',
                    })
                    .mockReturnValue(fakeNetworkClients[1]);
                  await controller.initializeProvider();
                  expect(
                    controller.state.networksMetadata[networkType].status,
                  ).toBe('available');

                  await waitForStateChanges({
                    messenger,
                    propertyPath: [
                      'networksMetadata',
                      'testNetworkConfigurationId',
                      'status',
                    ],
                    operation: async () => {
                      await controller.lookupNetwork();
                    },
                  });

                  expect(
                    controller.state.networksMetadata[
                      controller.state.selectedNetworkClientId
                    ].status,
                  ).toBe('unknown');
                },
              );
            });

            it('stores the EIP-1559 support of the second network, not the first', async () => {
              await withController(
                {
                  state: {
                    selectedNetworkClientId: networkType,
                    networkConfigurations: {
                      testNetworkConfigurationId: {
                        id: 'testNetworkConfigurationId',
                        rpcUrl: 'https://mock-rpc-url',
                        chainId: toHex(1337),
                        ticker: 'ABC',
                      },
                    },
                  },
                  infuraProjectId: 'some-infura-project-id',
                },
                async ({ controller, messenger }) => {
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
                          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
                          // eslint-disable-next-line @typescript-eslint/no-floating-promises
                          controller.setActiveNetwork(
                            'testNetworkConfigurationId',
                          );
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
                      network: networkType,
                      infuraProjectId: 'some-infura-project-id',
                      type: NetworkClientType.Infura,
                      chainId: BUILT_IN_NETWORKS[networkType].chainId,
                      ticker: BUILT_IN_NETWORKS[networkType].ticker,
                    })
                    .mockReturnValue(fakeNetworkClients[0])
                    .calledWith({
                      chainId: toHex(1337),
                      rpcUrl: 'https://mock-rpc-url',
                      type: NetworkClientType.Custom,
                      ticker: 'ABC',
                    })
                    .mockReturnValue(fakeNetworkClients[1]);
                  await controller.initializeProvider();
                  expect(
                    controller.state.networksMetadata[networkType].EIPS[1559],
                  ).toBe(true);

                  await waitForStateChanges({
                    messenger,
                    propertyPath: [
                      'networksMetadata',
                      'testNetworkConfigurationId',
                      'EIPS',
                    ],
                    operation: async () => {
                      await controller.lookupNetwork();
                    },
                  });

                  expect(
                    controller.state.networksMetadata.testNetworkConfigurationId
                      .EIPS[1559],
                  ).toBe(false);
                },
              );
            });

            it('emits infuraIsUnblocked, not infuraIsBlocked, assuming that the first network was blocked', async () => {
              await withController(
                {
                  state: {
                    selectedNetworkClientId: networkType,
                    networkConfigurations: {
                      testNetworkConfigurationId: {
                        id: 'testNetworkConfigurationId',
                        rpcUrl: 'https://mock-rpc-url',
                        chainId: toHex(1337),
                        ticker: 'ABC',
                      },
                    },
                  },
                  infuraProjectId: 'some-infura-project-id',
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
                          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
                          // eslint-disable-next-line @typescript-eslint/no-floating-promises
                          controller.setActiveNetwork(
                            'testNetworkConfigurationId',
                          );
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
                      network: networkType,
                      infuraProjectId: 'some-infura-project-id',
                      chainId: BUILT_IN_NETWORKS[networkType].chainId,
                      ticker: BUILT_IN_NETWORKS[networkType].ticker,
                      type: NetworkClientType.Infura,
                    })
                    .mockReturnValue(fakeNetworkClients[0])
                    .calledWith({
                      chainId: toHex(1337),
                      rpcUrl: 'https://mock-rpc-url',
                      type: NetworkClientType.Custom,
                      ticker: 'ABC',
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
                      'testNetworkConfigurationId',
                      'status',
                    ],
                    operation: async () => {
                      await controller.lookupNetwork();
                    },
                  });

                  await expect(
                    promiseForInfuraIsUnblockedEvents,
                  ).toBeFulfilled();
                  await expect(
                    promiseForNoInfuraIsBlockedEvents,
                  ).toBeFulfilled();
                },
              );
            });
          });

          lookupNetworkTests({
            expectedNetworkClientConfiguration:
              buildInfuraNetworkClientConfiguration(networkType),
            initialState: {
              selectedNetworkClientId: networkType,
            },
            operation: async (controller) => {
              await controller.lookupNetwork();
            },
          });
        });
      },
    );

    describe('when selectedNetworkClientId in state is the ID of a network configuration', () => {
      describe('if the network was switched after the eth_getBlockByNumber request started but before it completed', () => {
        it('stores the network status of the second network, not the first', async () => {
          await withController(
            {
              state: {
                selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
                networkConfigurations: {
                  'AAAA-AAAA-AAAA-AAAA': {
                    id: 'AAAA-AAAA-AAAA-AAAA',
                    rpcUrl: 'https://mock-rpc-url',
                    chainId: toHex(1337),
                    ticker: 'TEST',
                  },
                },
              },
              infuraProjectId: 'some-infura-project-id',
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
                      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
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
                  chainId: toHex(1337),
                  rpcUrl: 'https://mock-rpc-url',
                  type: NetworkClientType.Custom,
                  ticker: 'TEST',
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  network: NetworkType.goerli,
                  infuraProjectId: 'some-infura-project-id',
                  chainId: BUILT_IN_NETWORKS[NetworkType.goerli].chainId,
                  ticker: BUILT_IN_NETWORKS[InfuraNetworkType.goerli].ticker,
                  type: NetworkClientType.Infura,
                })
                .mockReturnValue(fakeNetworkClients[1]);
              await controller.initializeProvider();
              expect(
                controller.state.networksMetadata['AAAA-AAAA-AAAA-AAAA'].status,
              ).toBe('available');

              await waitForStateChanges({
                messenger,
                propertyPath: [
                  'networksMetadata',
                  NetworkType.goerli,
                  'status',
                ],
                operation: async () => {
                  await controller.lookupNetwork();
                },
              });

              expect(
                controller.state.networksMetadata[NetworkType.goerli].status,
              ).toBe('unknown');
            },
          );
        });

        it('stores the EIP-1559 support of the second network, not the first', async () => {
          await withController(
            {
              state: {
                selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
                networkConfigurations: {
                  'AAAA-AAAA-AAAA-AAAA': {
                    id: 'AAAA-AAAA-AAAA-AAAA',
                    rpcUrl: 'https://mock-rpc-url',
                    chainId: toHex(1337),
                    ticker: 'TEST',
                  },
                },
              },
              infuraProjectId: 'some-infura-project-id',
            },
            async ({ controller, messenger }) => {
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
                      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
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
                  chainId: toHex(1337),
                  rpcUrl: 'https://mock-rpc-url',
                  type: NetworkClientType.Custom,
                  ticker: 'TEST',
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  network: NetworkType.goerli,
                  infuraProjectId: 'some-infura-project-id',
                  chainId: BUILT_IN_NETWORKS[NetworkType.goerli].chainId,
                  ticker: BUILT_IN_NETWORKS[InfuraNetworkType.goerli].ticker,
                  type: NetworkClientType.Infura,
                })
                .mockReturnValue(fakeNetworkClients[1]);
              await controller.initializeProvider();
              expect(
                controller.state.networksMetadata['AAAA-AAAA-AAAA-AAAA']
                  .EIPS[1559],
              ).toBe(true);

              await waitForStateChanges({
                messenger,
                propertyPath: ['networksMetadata', NetworkType.goerli, 'EIPS'],
                operation: async () => {
                  await controller.lookupNetwork();
                },
              });

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
          await withController(
            {
              state: {
                selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
                networkConfigurations: {
                  'AAAA-AAAA-AAAA-AAAA': {
                    id: 'AAAA-AAAA-AAAA-AAAA',
                    rpcUrl: 'https://mock-rpc-url',
                    chainId: toHex(1337),
                    ticker: 'TEST',
                  },
                },
              },
              infuraProjectId: 'some-infura-project-id',
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
                      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
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
                  chainId: toHex(1337),
                  rpcUrl: 'https://mock-rpc-url',
                  type: NetworkClientType.Custom,
                  ticker: 'TEST',
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  network: NetworkType.goerli,
                  infuraProjectId: 'some-infura-project-id',
                  chainId: BUILT_IN_NETWORKS[NetworkType.goerli].chainId,
                  ticker: BUILT_IN_NETWORKS[InfuraNetworkType.goerli].ticker,
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

              await waitForStateChanges({
                messenger,
                propertyPath: [
                  'networksMetadata',
                  NetworkType.goerli,
                  'status',
                ],
                operation: async () => {
                  await controller.lookupNetwork();
                },
              });

              await expect(promiseForNoInfuraIsUnblockedEvents).toBeFulfilled();
              await expect(promiseForInfuraIsBlockedEvents).toBeFulfilled();
            },
          );
        });
      });

      lookupNetworkTests({
        expectedNetworkClientConfiguration:
          buildCustomNetworkClientConfiguration(),
        initialState: {
          selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
          networkConfigurations: {
            'AAAA-AAAA-AAAA-AAAA': {
              id: 'AAAA-AAAA-AAAA-AAAA',
              rpcUrl: 'https://mock-rpc-url',
              chainId: toHex(1337),
              ticker: 'TEST',
            },
          },
        },
        operation: async (controller) => {
          await controller.lookupNetwork();
        },
      });
    });
  });

  describe('setProviderType', () => {
    for (const { networkType } of INFURA_NETWORKS) {
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      describe(`given the Infura network "${networkType}"`, () => {
        refreshNetworkTests({
          expectedNetworkClientConfiguration:
            buildInfuraNetworkClientConfiguration(networkType),
          operation: async (controller) => {
            await controller.setProviderType(networkType);
          },
        });
      });

      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      it(`sets selectedNetworkClientId in state to the Infura network "${networkType}"`, async () => {
        await withController(
          {
            state: {
              selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
              networkConfigurations: {
                'AAAA-AAAA-AAAA-AAAA': {
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(1337),
                  ticker: 'TEST',
                  id: 'AAAA-AAAA-AAAA-AAAA',
                },
              },
            },
          },
          async ({ controller }) => {
            const fakeProvider = buildFakeProvider();
            const fakeNetworkClient = buildFakeClient(fakeProvider);
            mockCreateNetworkClient().mockReturnValue(fakeNetworkClient);

            await controller.setProviderType(networkType);

            expect(controller.state.selectedNetworkClientId).toBe(networkType);
          },
        );
      });
    }

    describe('given the ID of a network configuration', () => {
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
    refreshNetworkTests({
      expectedNetworkClientConfiguration: buildCustomNetworkClientConfiguration(
        {
          rpcUrl: 'https://mock-rpc-url',
          chainId: toHex(111),
          ticker: 'TEST',
        },
      ),
      initialState: {
        networkConfigurations: {
          testNetworkConfigurationId: {
            rpcUrl: 'https://mock-rpc-url',
            chainId: toHex(111),
            ticker: 'TEST',
            nickname: 'something existing',
            id: 'testNetworkConfigurationId',
            rpcPrefs: undefined,
          },
        },
      },
      operation: async (controller) => {
        await controller.setActiveNetwork('testNetworkConfigurationId');
      },
    });

    describe('if the given ID refers to no existing network clients (derived from known Infura networks and network configurations)', () => {
      it('throws', async () => {
        await withController(
          {
            state: {
              networkConfigurations: {
                'AAAA-AAAA-AAAA-AAAA': {
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(111),
                  ticker: 'TEST',
                  id: 'AAAA-AAAA-AAAA-AAAA',
                },
              },
            },
          },
          async ({ controller }) => {
            const fakeProvider = buildFakeProvider();
            const fakeNetworkClient = buildFakeClient(fakeProvider);
            mockCreateNetworkClient().mockReturnValue(fakeNetworkClient);

            await expect(() =>
              controller.setActiveNetwork('invalidNetworkClientId'),
            ).rejects.toThrow(
              new Error(
                "Custom network client not found with ID 'invalidNetworkClientId'",
              ),
            );
          },
        );
      });
    });

    describe('if the ID refers to a network client created for a network configuration', () => {
      it('assigns selectedNetworkClientId in state to the ID', async () => {
        const testNetworkClientId = 'AAAA-AAAA-AAAA-AAAA';
        await withController(
          {
            state: {
              networkConfigurations: {
                [testNetworkClientId]: {
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(111),
                  ticker: 'TEST',
                  id: testNetworkClientId,
                },
              },
            },
          },
          async ({ controller }) => {
            const fakeProvider = buildFakeProvider();
            const fakeNetworkClient = buildFakeClient(fakeProvider);
            mockCreateNetworkClient()
              .calledWith({
                rpcUrl: 'https://mock-rpc-url',
                chainId: toHex(111),
                type: NetworkClientType.Custom,
                ticker: 'TEST',
              })
              .mockReturnValue(fakeNetworkClient);

            await controller.setActiveNetwork(testNetworkClientId);

            expect(controller.state.selectedNetworkClientId).toStrictEqual(
              testNetworkClientId,
            );
          },
        );
      });
    });

    for (const { networkType } of INFURA_NETWORKS) {
      // This is a string.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      describe(`if the ID refers to a network client created for the Infura network "${networkType}"`, () => {
        refreshNetworkTests({
          expectedNetworkClientConfiguration:
            buildInfuraNetworkClientConfiguration(networkType),
          operation: async (controller) => {
            await controller.setActiveNetwork(networkType);
          },
        });

        // This is a string.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        it(`sets selectedNetworkClientId in state to "${networkType}"`, async () => {
          await withController({}, async ({ controller }) => {
            const fakeProvider = buildFakeProvider();
            const fakeNetworkClient = buildFakeClient(fakeProvider);
            mockCreateNetworkClient().mockReturnValue(fakeNetworkClient);

            await controller.setActiveNetwork(networkType);

            expect(controller.state.selectedNetworkClientId).toStrictEqual(
              networkType,
            );
          });
        });
      });
    }

    it('is able to be called via messenger action', async () => {
      const testNetworkClientId = 'testNetworkConfigurationId';
      await withController(
        {
          state: {
            networkConfigurations: {
              [testNetworkClientId]: {
                rpcUrl: 'https://mock-rpc-url',
                chainId: toHex(111),
                ticker: 'TEST',
                nickname: 'something existing',
                id: testNetworkClientId,
                rpcPrefs: {
                  blockExplorerUrl: 'https://test-block-explorer-2.com',
                },
              },
            },
          },
        },
        async ({ controller, messenger }) => {
          const fakeProvider = buildFakeProvider();
          const fakeNetworkClient = buildFakeClient(fakeProvider);
          mockCreateNetworkClient()
            .calledWith({
              rpcUrl: 'https://mock-rpc-url',
              chainId: toHex(111),
              type: NetworkClientType.Custom,
              ticker: 'TEST',
            })
            .mockReturnValue(fakeNetworkClient);

          await messenger.call(
            'NetworkController:setActiveNetwork',
            testNetworkClientId,
          );

          expect(controller.state.selectedNetworkClientId).toStrictEqual(
            testNetworkClientId,
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
    [NetworkType.mainnet, NetworkType.goerli, NetworkType.sepolia].forEach(
      (networkType) => {
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        describe(`when selectedNetworkClientId in state is the Infura network "${networkType}"`, () => {
          refreshNetworkTests({
            expectedNetworkClientConfiguration:
              buildInfuraNetworkClientConfiguration(networkType),
            initialState: {
              selectedNetworkClientId: networkType,
            },
            operation: async (controller) => {
              await controller.resetConnection();
            },
          });
        });
      },
    );

    describe('when selectedNetworkClientId in state is the ID of a network configuration', () => {
      refreshNetworkTests({
        expectedNetworkClientConfiguration:
          buildCustomNetworkClientConfiguration({
            rpcUrl: 'https://test.network.1',
            chainId: toHex(1337),
            ticker: 'TEST',
          }),
        initialState: {
          selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
          networkConfigurations: {
            'AAAA-AAAA-AAAA-AAAA': {
              id: 'AAAA-AAAA-AAAA-AAAA',
              rpcUrl: 'https://test.network.1',
              chainId: toHex(1337),
              ticker: 'TEST',
            },
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
    describe(String(name), () => {
      const infuraProjectId = 'some-infura-project-id';
      const expectedInfuraNetworkConfigurationsByType: Record<
        InfuraNetworkType,
        NetworkConfiguration
      > = {
        [InfuraNetworkType.goerli]: {
          rpcUrl: 'https://goerli.infura.io/v3/some-infura-project-id',
          chainId: '0x5' as const,
          ticker: 'GoerliETH',
          rpcPrefs: {
            blockExplorerUrl: 'https://goerli.etherscan.io',
          },
        },
        [InfuraNetworkType.sepolia]: {
          rpcUrl: 'https://sepolia.infura.io/v3/some-infura-project-id',
          chainId: '0xaa36a7' as const,
          ticker: 'SepoliaETH',
          rpcPrefs: {
            blockExplorerUrl: 'https://sepolia.etherscan.io',
          },
        },
        [InfuraNetworkType.mainnet]: {
          rpcUrl: 'https://mainnet.infura.io/v3/some-infura-project-id',
          chainId: '0x1' as const,
          ticker: 'ETH',
          rpcPrefs: {
            blockExplorerUrl: 'https://etherscan.io',
          },
        },
        [InfuraNetworkType['linea-goerli']]: {
          rpcUrl: 'https://linea-goerli.infura.io/v3/some-infura-project-id',
          chainId: '0xe704' as const,
          ticker: 'LineaETH',
          rpcPrefs: {
            blockExplorerUrl: 'https://goerli.lineascan.build',
          },
        },
        [InfuraNetworkType['linea-sepolia']]: {
          rpcUrl: 'https://linea-sepolia.infura.io/v3/some-infura-project-id',
          chainId: '0xe705' as const,
          ticker: 'LineaETH',
          rpcPrefs: {
            blockExplorerUrl: 'https://sepolia.lineascan.build',
          },
        },
        [InfuraNetworkType['linea-mainnet']]: {
          rpcUrl: 'https://linea-mainnet.infura.io/v3/some-infura-project-id',
          chainId: '0xe708' as const,
          ticker: 'ETH',
          rpcPrefs: {
            blockExplorerUrl: 'https://lineascan.build',
          },
        },
      };

      it.each(getKnownPropertyNames(InfuraNetworkType))(
        'constructs a network configuration for the %s network',
        async (infuraNetworkType) => {
          await withController(
            { infuraProjectId },
            ({ controller, messenger }) => {
              const networkConfiguration =
                getNetworkConfigurationByNetworkClientId({
                  controller,
                  messenger,
                  networkClientId: infuraNetworkType,
                });

              expect(networkConfiguration).toStrictEqual(
                expectedInfuraNetworkConfigurationsByType[infuraNetworkType],
              );
            },
          );
        },
      );

      it('returns the network configuration in state that matches the given ID, if there is one', async () => {
        await withController(
          {
            infuraProjectId,
            state: {
              networkConfigurations: {
                'AAAA-AAAA-AAAA-AAAA': {
                  rpcUrl: 'https://test.network',
                  chainId: toHex(111),
                  ticker: 'TICKER',
                  id: 'AAAA-AAAA-AAAA-AAAA',
                },
              },
            },
          },
          ({ controller, messenger }) => {
            const networkConfiguration =
              getNetworkConfigurationByNetworkClientId({
                controller,
                messenger,
                networkClientId: 'AAAA-AAAA-AAAA-AAAA',
              });

            expect(networkConfiguration).toStrictEqual({
              rpcUrl: 'https://test.network',
              chainId: toHex(111),
              ticker: 'TICKER',
              id: 'AAAA-AAAA-AAAA-AAAA',
            });
          },
        );
      });

      it('returns undefined if the given ID does not match a network configuration in state', async () => {
        await withController(
          { infuraProjectId },
          ({ controller, messenger }) => {
            const networkConfiguration =
              getNetworkConfigurationByNetworkClientId({
                controller,
                messenger,
                networkClientId: 'nonexistent',
              });

            expect(networkConfiguration).toBeUndefined();
          },
        );
      });
    });
  }

  describe('upsertNetworkConfiguration', () => {
    describe('when the rpcUrl of the given network configuration does not match an existing network configuration', () => {
      it('adds the network configuration to state without updating or removing any existing network configurations', async () => {
        await withController(
          {
            state: {
              networkConfigurations: {
                'AAAA-AAAA-AAAA-AAAA': {
                  rpcUrl: 'https://test.network.1',
                  chainId: toHex(111),
                  ticker: 'TICKER1',
                  id: 'AAAA-AAAA-AAAA-AAAA',
                },
              },
            },
          },
          async ({ controller }) => {
            uuidV4Mock.mockReturnValue('BBBB-BBBB-BBBB-BBBB');

            await controller.upsertNetworkConfiguration(
              {
                rpcUrl: 'https://test.network.2',
                chainId: toHex(222),
                ticker: 'TICKER2',
                nickname: 'test network 2',
                rpcPrefs: {
                  blockExplorerUrl: 'https://testchainscan.io',
                },
              },
              {
                referrer: 'https://test-dapp.com',
                source: 'dapp',
              },
            );

            expect(controller.state.networkConfigurations).toStrictEqual({
              'AAAA-AAAA-AAAA-AAAA': {
                rpcUrl: 'https://test.network.1',
                chainId: toHex(111),
                ticker: 'TICKER1',
                id: 'AAAA-AAAA-AAAA-AAAA',
              },
              'BBBB-BBBB-BBBB-BBBB': {
                rpcUrl: 'https://test.network.2',
                chainId: toHex(222),
                ticker: 'TICKER2',
                nickname: 'test network 2',
                rpcPrefs: {
                  blockExplorerUrl: 'https://testchainscan.io',
                },
                id: 'BBBB-BBBB-BBBB-BBBB',
              },
            });
          },
        );
      });

      it('removes properties not specific to the NetworkConfiguration interface before persisting it to state', async function () {
        await withController(async ({ controller }) => {
          uuidV4Mock.mockReturnValue('AAAA-AAAA-AAAA-AAAA');

          await controller.upsertNetworkConfiguration(
            {
              rpcUrl: 'https://test.network',
              chainId: toHex(111),
              ticker: 'TICKER',
              nickname: 'test network',
              rpcPrefs: {
                blockExplorerUrl: 'https://testchainscan.io',
              },
              // @ts-expect-error We are intentionally passing bad input.
              invalidKey: 'some value',
            },
            {
              referrer: 'https://test-dapp.com',
              source: 'dapp',
            },
          );

          expect(controller.state.networkConfigurations).toStrictEqual({
            'AAAA-AAAA-AAAA-AAAA': {
              rpcUrl: 'https://test.network',
              chainId: toHex(111),
              ticker: 'TICKER',
              nickname: 'test network',
              rpcPrefs: {
                blockExplorerUrl: 'https://testchainscan.io',
              },
              id: 'AAAA-AAAA-AAAA-AAAA',
            },
          });
        });
      });

      it('creates a new network client for the network configuration and adds it to the registry', async () => {
        await withController(
          { infuraProjectId: 'some-infura-project-id' },
          async ({ controller }) => {
            uuidV4Mock.mockReturnValue('AAAA-AAAA-AAAA-AAAA');
            const newCustomNetworkClient = buildFakeClient();
            mockCreateNetworkClientWithDefaultsForBuiltInNetworkClients({
              infuraProjectId: 'some-infura-project-id',
            })
              .calledWith({
                chainId: toHex(111),
                rpcUrl: 'https://test.network',
                type: NetworkClientType.Custom,
                ticker: 'TICKER',
              })
              .mockReturnValue(newCustomNetworkClient);

            await controller.upsertNetworkConfiguration(
              {
                rpcUrl: 'https://test.network',
                chainId: toHex(111),
                ticker: 'TICKER',
              },
              {
                referrer: 'https://test-dapp.com',
                source: 'dapp',
              },
            );

            const networkClients = controller.getNetworkClientRegistry();
            expect(Object.keys(networkClients)).toHaveLength(7);
            expect(networkClients).toMatchObject({
              'AAAA-AAAA-AAAA-AAAA': expect.objectContaining({
                configuration: {
                  chainId: toHex(111),
                  rpcUrl: 'https://test.network',
                  type: NetworkClientType.Custom,
                  ticker: 'TICKER',
                },
              }),
            });
          },
        );
      });

      it('updates state only after creating the new network client', async () => {
        await withController(
          { infuraProjectId: 'some-infura-project-id' },
          async ({ controller, messenger }) => {
            uuidV4Mock.mockReturnValue('AAAA-AAAA-AAAA-AAAA');
            const newCustomNetworkClient = buildFakeClient();
            mockCreateNetworkClientWithDefaultsForBuiltInNetworkClients({
              infuraProjectId: 'some-infura-project-id',
            })
              .calledWith({
                chainId: toHex(111),
                rpcUrl: 'https://test.network',
                type: NetworkClientType.Custom,
                ticker: 'TICKER',
              })
              .mockReturnValue(newCustomNetworkClient);

            await waitForStateChanges({
              messenger,
              count: 1,
              operation: async () => {
                await controller.upsertNetworkConfiguration(
                  {
                    rpcUrl: 'https://test.network',
                    chainId: toHex(111),
                    ticker: 'TICKER',
                  },
                  {
                    referrer: 'https://test-dapp.com',
                    source: 'dapp',
                  },
                );
              },
              beforeResolving: () => {
                const newNetworkClient = controller.getNetworkClientById(
                  'AAAA-AAAA-AAAA-AAAA',
                );
                expect(newNetworkClient).toBeDefined();
              },
            });
          },
        );
      });

      describe('if the setActive option is not given', () => {
        it('does not update selectedNetworkClientId to refer to the new network configuration by default', async () => {
          await withController(async ({ controller }) => {
            const originalSelectedNetworkClientId =
              controller.state.selectedNetworkClientId;

            uuidV4Mock.mockReturnValue('AAAA-AAAA-AAAA-AAAA');

            await controller.upsertNetworkConfiguration(
              {
                rpcUrl: 'https://test.network',
                chainId: toHex(111),
                ticker: 'TICKER',
              },
              {
                referrer: 'https://test-dapp.com',
                source: 'dapp',
              },
            );

            expect(controller.state.selectedNetworkClientId).toStrictEqual(
              originalSelectedNetworkClientId,
            );
          });
        });

        it('does not re-point the provider and block tracker proxies to the new network by default', async () => {
          await withController(
            { infuraProjectId: 'some-infura-project-id' },
            async ({ controller }) => {
              uuidV4Mock.mockReturnValue('AAAA-AAAA-AAAA-AAAA');
              const builtInNetworkProvider = buildFakeProvider([
                {
                  request: {
                    method: 'test_method',
                    params: [],
                  },
                  response: {
                    result: 'test response from built-in network',
                  },
                },
              ]);
              const builtInNetworkClient = buildFakeClient(
                builtInNetworkProvider,
              );
              const newCustomNetworkProvider = buildFakeProvider([
                {
                  request: {
                    method: 'test_method',
                    params: [],
                  },
                  response: {
                    result: 'test response from custom network',
                  },
                },
              ]);
              const newCustomNetworkClient = buildFakeClient(
                newCustomNetworkProvider,
              );
              mockCreateNetworkClientWithDefaultsForBuiltInNetworkClients({
                builtInNetworkClient,
                infuraProjectId: 'some-infura-project-id',
              })
                .calledWith({
                  chainId: toHex(111),
                  rpcUrl: 'https://test.network',
                  type: NetworkClientType.Custom,
                  ticker: 'TEST',
                })
                .mockReturnValue(newCustomNetworkClient);
              // Will use mainnet by default
              await controller.initializeProvider();

              await controller.upsertNetworkConfiguration(
                {
                  rpcUrl: 'https://test.network',
                  chainId: toHex(111),
                  ticker: 'TICKER',
                },
                {
                  referrer: 'https://test-dapp.com',
                  source: 'dapp',
                },
              );

              const { provider } = controller.getProviderAndBlockTracker();
              assert(provider, 'Provider is not set');
              const { result } = (await provider.request({
                id: 1,
                jsonrpc: '2.0',
                method: 'test_method',
                params: [],
              })) as JsonRpcSuccess<Json>;
              expect(result).toBe('test response from built-in network');
            },
          );
        });
      });

      describe('if the setActive option is false', () => {
        it('does not update selectedNetworkClientId to refer to the new network configuration', async () => {
          await withController(async ({ controller }) => {
            const originalSelectedNetworkClientId =
              controller.state.selectedNetworkClientId;

            uuidV4Mock.mockReturnValue('AAAA-AAAA-AAAA-AAAA');

            await controller.upsertNetworkConfiguration(
              {
                rpcUrl: 'https://test.network',
                chainId: toHex(111),
                ticker: 'TICKER',
              },
              {
                setActive: false,
                referrer: 'https://test-dapp.com',
                source: 'dapp',
              },
            );

            expect(controller.state.selectedNetworkClientId).toStrictEqual(
              originalSelectedNetworkClientId,
            );
          });
        });

        it('does not re-point the provider and block tracker proxies to the new network', async () => {
          await withController(
            { infuraProjectId: 'some-infura-project-id' },
            async ({ controller }) => {
              uuidV4Mock.mockReturnValue('AAAA-AAAA-AAAA-AAAA');
              const builtInNetworkProvider = buildFakeProvider([
                {
                  request: {
                    method: 'test_method',
                    params: [],
                  },
                  response: {
                    result: 'test response from built-in network',
                  },
                },
              ]);
              const builtInNetworkClient = buildFakeClient(
                builtInNetworkProvider,
              );
              const newCustomNetworkProvider = buildFakeProvider([
                {
                  request: {
                    method: 'test_method',
                    params: [],
                  },
                  response: {
                    result: 'test response from custom network',
                  },
                },
              ]);
              const newCustomNetworkClient = buildFakeClient(
                newCustomNetworkProvider,
              );
              mockCreateNetworkClientWithDefaultsForBuiltInNetworkClients({
                builtInNetworkClient,
                infuraProjectId: 'some-infura-project-id',
              })
                .calledWith({
                  chainId: toHex(111),
                  rpcUrl: 'https://test.network',
                  type: NetworkClientType.Custom,
                  ticker: 'TEST',
                })
                .mockReturnValue(newCustomNetworkClient);
              // Will use mainnet by default
              await controller.initializeProvider();

              await controller.upsertNetworkConfiguration(
                {
                  rpcUrl: 'https://test.network',
                  chainId: toHex(111),
                  ticker: 'TICKER',
                },
                {
                  setActive: false,
                  referrer: 'https://test-dapp.com',
                  source: 'dapp',
                },
              );

              const { provider } = controller.getProviderAndBlockTracker();
              assert(provider, 'Provider is not set');
              const { result } = (await provider.request({
                id: 1,
                jsonrpc: '2.0',
                method: 'test_method',
                params: [],
              })) as JsonRpcSuccess<Json>;
              expect(result).toBe('test response from built-in network');
            },
          );
        });
      });

      describe('if the setActive option is true', () => {
        it('updates selectedNetworkClientId to refer to the new network configuration', async () => {
          await withController(async ({ controller }) => {
            uuidV4Mock.mockReturnValue('AAAA-AAAA-AAAA-AAAA');
            const newCustomNetworkClient = buildFakeClient();
            mockCreateNetworkClientWithDefaultsForBuiltInNetworkClients()
              .calledWith({
                chainId: toHex(111),
                rpcUrl: 'https://test.network',
                type: NetworkClientType.Custom,
                ticker: 'TICKER',
              })
              .mockReturnValue(newCustomNetworkClient);

            await controller.upsertNetworkConfiguration(
              {
                rpcUrl: 'https://test.network',
                chainId: toHex(111),
                ticker: 'TICKER',
                nickname: 'test network',
                rpcPrefs: {
                  blockExplorerUrl: 'https://some.chainscan.io',
                },
              },
              {
                setActive: true,
                referrer: 'https://test-dapp.com',
                source: 'dapp',
              },
            );

            expect(controller.state.selectedNetworkClientId).toBe(
              'AAAA-AAAA-AAAA-AAAA',
            );
          });
        });

        refreshNetworkTests({
          expectedNetworkClientConfiguration:
            buildCustomNetworkClientConfiguration({
              rpcUrl: 'https://some.other.network',
              chainId: toHex(222),
              ticker: 'TICKER2',
            }),
          initialState: {
            networkConfigurations: {
              'AAAA-AAAA-AAAA-AAAA': {
                rpcUrl: 'https://test.network',
                chainId: toHex(111),
                ticker: 'TICKER1',
                id: 'AAAA-AAAA-AAAA-AAAA',
              },
            },
          },
          operation: async (controller) => {
            uuidV4Mock.mockReturnValue('BBBB-BBBB-BBBB-BBBB');

            await controller.upsertNetworkConfiguration(
              {
                rpcUrl: 'https://some.other.network',
                chainId: toHex(222),
                ticker: 'TICKER2',
              },
              {
                setActive: true,
                referrer: 'https://test-dapp.com',
                source: 'dapp',
              },
            );
          },
        });
      });

      it('calls trackMetaMetricsEvent with details about the new network', async () => {
        const trackMetaMetricsEventSpy = jest.fn();

        await withController(
          {
            trackMetaMetricsEvent: trackMetaMetricsEventSpy,
          },
          async ({ controller }) => {
            uuidV4Mock.mockReturnValue('AAAA-AAAA-AAAA-AAAA');

            await controller.upsertNetworkConfiguration(
              {
                rpcUrl: 'https://test.network',
                chainId: toHex(111),
                ticker: 'TICKER',
              },
              {
                referrer: 'https://test-dapp.com',
                source: 'dapp',
              },
            );

            expect(trackMetaMetricsEventSpy).toHaveBeenCalledWith({
              event: 'Custom Network Added',
              category: 'Network',
              referrer: {
                url: 'https://test-dapp.com',
              },
              properties: {
                // TODO: Either fix this lint violation or explain why it's necessary to ignore.
                // eslint-disable-next-line @typescript-eslint/naming-convention
                chain_id: toHex(111),
                symbol: 'TICKER',
                source: 'dapp',
              },
            });
          },
        );
      });
    });

    describe.each([
      ['case-sensitively', 'https://test.network', 'https://test.network'],
      ['case-insensitively', 'https://test.network', 'https://TEST.NETWORK'],
    ])(
      'when the rpcUrl of the given network configuration matches an existing network configuration in state (%s)',
      (_qualifier, oldRpcUrl, newRpcUrl) => {
        it('completely overwrites the existing network configuration in state, but does not update or remove any other network configurations', async () => {
          await withController(
            {
              state: {
                networkConfigurations: {
                  'AAAA-AAAA-AAAA-AAAA': {
                    rpcUrl: 'https://test.network.1',
                    chainId: toHex(111),
                    ticker: 'TICKER1',
                    id: 'AAAA-AAAA-AAAA-AAAA',
                  },
                  'BBBB-BBBB-BBBB-BBBB': {
                    rpcUrl: oldRpcUrl,
                    chainId: toHex(222),
                    ticker: 'TICKER2',
                    id: 'BBBB-BBBB-BBBB-BBBB',
                  },
                },
              },
            },
            async ({ controller }) => {
              await controller.upsertNetworkConfiguration(
                {
                  rpcUrl: newRpcUrl,
                  chainId: toHex(999),
                  ticker: 'NEW_TICKER',
                  nickname: 'test network 2',
                  rpcPrefs: {
                    blockExplorerUrl: 'https://testchainscan.io',
                  },
                },
                {
                  referrer: 'https://test-dapp.com',
                  source: 'dapp',
                },
              );

              expect(controller.state.networkConfigurations).toStrictEqual({
                'AAAA-AAAA-AAAA-AAAA': {
                  rpcUrl: 'https://test.network.1',
                  chainId: toHex(111),
                  ticker: 'TICKER1',
                  id: 'AAAA-AAAA-AAAA-AAAA',
                },
                'BBBB-BBBB-BBBB-BBBB': {
                  rpcUrl: newRpcUrl,
                  chainId: toHex(999),
                  ticker: 'NEW_TICKER',
                  nickname: 'test network 2',
                  rpcPrefs: {
                    blockExplorerUrl: 'https://testchainscan.io',
                  },
                  id: 'BBBB-BBBB-BBBB-BBBB',
                },
              });
            },
          );
        });

        it('removes properties not specific to the NetworkConfiguration interface before persisting it to state', async function () {
          await withController(
            {
              state: {
                networkConfigurations: {
                  'AAAA-AAAA-AAAA-AAAA': {
                    rpcUrl: oldRpcUrl,
                    chainId: toHex(111),
                    ticker: 'TICKER',
                    id: 'AAAA-AAAA-AAAA-AAAA',
                  },
                },
              },
            },
            async ({ controller }) => {
              await controller.upsertNetworkConfiguration(
                {
                  rpcUrl: newRpcUrl,
                  chainId: toHex(999),
                  ticker: 'NEW_TICKER',
                  nickname: 'test network',
                  rpcPrefs: {
                    blockExplorerUrl: 'https://testchainscan.io',
                  },
                  // @ts-expect-error We are intentionally passing bad input.
                  invalidKey: 'some value',
                },
                {
                  referrer: 'https://test-dapp.com',
                  source: 'dapp',
                },
              );

              expect(controller.state.networkConfigurations).toStrictEqual({
                'AAAA-AAAA-AAAA-AAAA': {
                  rpcUrl: newRpcUrl,
                  chainId: toHex(999),
                  ticker: 'NEW_TICKER',
                  nickname: 'test network',
                  rpcPrefs: {
                    blockExplorerUrl: 'https://testchainscan.io',
                  },
                  id: 'AAAA-AAAA-AAAA-AAAA',
                },
              });
            },
          );
        });

        describe('if at least the chain ID is being updated', () => {
          it('destroys and removes the existing network client for the old network configuration', async () => {
            await withController(
              {
                state: {
                  networkConfigurations: {
                    'AAAA-AAAA-AAAA-AAAA': {
                      rpcUrl: oldRpcUrl,
                      chainId: toHex(111),
                      ticker: 'TICKER',
                      id: 'AAAA-AAAA-AAAA-AAAA',
                    },
                  },
                },
                infuraProjectId: 'some-infura-project-id',
              },
              async ({ controller }) => {
                const newCustomNetworkClient = buildFakeClient();
                mockCreateNetworkClientWithDefaultsForBuiltInNetworkClients({
                  infuraProjectId: 'some-infura-project-id',
                })
                  .calledWith({
                    chainId: toHex(111),
                    rpcUrl: 'https://test.network',
                    type: NetworkClientType.Custom,
                    ticker: 'TEST',
                  })
                  .mockReturnValue(newCustomNetworkClient);
                const networkClientToDestroy = Object.values(
                  controller.getNetworkClientRegistry(),
                ).find(({ configuration }) => {
                  return (
                    configuration.type === NetworkClientType.Custom &&
                    configuration.chainId === toHex(111) &&
                    configuration.rpcUrl === 'https://test.network'
                  );
                });
                assert(networkClientToDestroy);
                jest.spyOn(networkClientToDestroy, 'destroy');

                await controller.upsertNetworkConfiguration(
                  {
                    rpcUrl: newRpcUrl,
                    chainId: toHex(999),
                    ticker: 'TICKER',
                  },
                  {
                    referrer: 'https://test-dapp.com',
                    source: 'dapp',
                  },
                );

                const networkClients = controller.getNetworkClientRegistry();
                expect(networkClientToDestroy.destroy).toHaveBeenCalled();
                expect(Object.keys(networkClients)).toHaveLength(7);
                expect(networkClients).not.toMatchObject({
                  [oldRpcUrl]: expect.objectContaining({
                    configuration: {
                      chainId: toHex(111),
                      rpcUrl: oldRpcUrl,
                      type: NetworkClientType.Custom,
                      ticker: 'TEST',
                    },
                  }),
                });
              },
            );
          });

          it('creates a new network client for the network configuration and adds it to the registry', async () => {
            await withController(
              {
                state: {
                  networkConfigurations: {
                    'AAAA-AAAA-AAAA-AAAA': {
                      rpcUrl: oldRpcUrl,
                      chainId: toHex(111),
                      ticker: 'TICKER',
                      id: 'AAAA-AAAA-AAAA-AAAA',
                    },
                  },
                },
                infuraProjectId: 'some-infura-project-id',
              },
              async ({ controller }) => {
                const newCustomNetworkClient = buildFakeClient();
                mockCreateNetworkClientWithDefaultsForBuiltInNetworkClients({
                  infuraProjectId: 'some-infura-project-id',
                })
                  .calledWith({
                    chainId: toHex(999),
                    rpcUrl: newRpcUrl,
                    type: NetworkClientType.Custom,
                    ticker: 'TICKER',
                  })
                  .mockReturnValue(newCustomNetworkClient);

                await controller.upsertNetworkConfiguration(
                  {
                    rpcUrl: newRpcUrl,
                    chainId: toHex(999),
                    ticker: 'TICKER',
                  },
                  {
                    referrer: 'https://test-dapp.com',
                    source: 'dapp',
                  },
                );

                const networkClients = controller.getNetworkClientRegistry();
                expect(Object.keys(networkClients)).toHaveLength(7);
                expect(networkClients).toMatchObject({
                  'AAAA-AAAA-AAAA-AAAA': expect.objectContaining({
                    configuration: {
                      chainId: toHex(999),
                      rpcUrl: newRpcUrl,
                      type: NetworkClientType.Custom,
                      ticker: 'TICKER',
                    },
                  }),
                });
              },
            );
          });
        });

        describe('if the chain ID is not being updated', () => {
          it('does not update the network client registry', async () => {
            await withController(
              {
                state: {
                  networkConfigurations: {
                    'AAAA-AAAA-AAAA-AAAA': {
                      rpcUrl: oldRpcUrl,
                      chainId: toHex(111),
                      ticker: 'TICKER',
                      id: 'AAAA-AAAA-AAAA-AAAA',
                    },
                  },
                },
                infuraProjectId: 'some-infura-project-id',
              },
              async ({ controller }) => {
                const newCustomNetworkClient = buildFakeClient();
                mockCreateNetworkClientWithDefaultsForBuiltInNetworkClients({
                  infuraProjectId: 'some-infura-project-id',
                })
                  .calledWith({
                    chainId: toHex(111),
                    rpcUrl: 'https://test.network',
                    type: NetworkClientType.Custom,
                    ticker: 'TEST',
                  })
                  .mockReturnValue(newCustomNetworkClient);
                const networkClientsBefore =
                  controller.getNetworkClientRegistry();

                await controller.upsertNetworkConfiguration(
                  {
                    rpcUrl: newRpcUrl,
                    chainId: toHex(111),
                    ticker: 'NEW_TICKER',
                  },
                  {
                    referrer: 'https://test-dapp.com',
                    source: 'dapp',
                  },
                );

                const networkClientsAfter =
                  controller.getNetworkClientRegistry();
                expect(networkClientsBefore).toStrictEqual(networkClientsAfter);
              },
            );
          });
        });

        it('does not call trackMetaMetricsEvent', async () => {
          const trackMetaMetricsEventSpy = jest.fn();

          await withController(
            {
              state: {
                networkConfigurations: {
                  'AAAA-AAAA-AAAA-AAAA': {
                    rpcUrl: oldRpcUrl,
                    chainId: toHex(111),
                    ticker: 'TICKER',
                    id: 'AAAA-AAAA-AAAA-AAAA',
                  },
                },
              },
              infuraProjectId: 'some-infura-project-id',
              trackMetaMetricsEvent: trackMetaMetricsEventSpy,
            },
            async ({ controller }) => {
              await controller.upsertNetworkConfiguration(
                {
                  rpcUrl: newRpcUrl,
                  chainId: toHex(111),
                  ticker: 'NEW_TICKER',
                },
                {
                  referrer: 'https://test-dapp.com',
                  source: 'dapp',
                },
              );

              expect(trackMetaMetricsEventSpy).not.toHaveBeenCalled();
            },
          );
        });
      },
    );

    it('throws if the given chain ID is not a 0x-prefixed hex number', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.upsertNetworkConfiguration(
            {
              rpcUrl: 'https://test.network',
              // @ts-expect-error We are intentionally passing bad input.
              chainId: '1',
              ticker: 'TICKER',
            },
            {
              referrer: 'https://test-dapp.com',
              source: 'dapp',
            },
          ),
        ).rejects.toThrow(
          new Error('Value must be a hexadecimal string, starting with "0x".'),
        );
      });
    });

    it('throws if the given chain ID is greater than the maximum allowed ID', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.upsertNetworkConfiguration(
            {
              rpcUrl: 'https://test.network',
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
              chainId: toHex(MAX_SAFE_CHAIN_ID + 1),
              ticker: 'TICKER',
            },
            {
              referrer: 'https://test-dapp.com',
              source: 'dapp',
            },
          ),
        ).rejects.toThrow(
          new Error(
            'Invalid chain ID "0xfffffffffffed": numerical value greater than max safe value.',
          ),
        );
      });
    });

    it('throws if a falsy rpcUrl is given', async () => {
      await withController(async ({ controller }) => {
        await expect(() =>
          controller.upsertNetworkConfiguration(
            {
              // @ts-expect-error We are intentionally passing bad input.
              rpcUrl: false,
              chainId: toHex(111),
              ticker: 'TICKER',
            },
            {
              referrer: 'https://test-dapp.com',
              source: 'dapp',
            },
          ),
        ).rejects.toThrow(
          new Error(
            'An rpcUrl is required to add or update network configuration',
          ),
        );
      });
    });

    it('throws if no rpcUrl is given', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.upsertNetworkConfiguration(
            // @ts-expect-error We are intentionally passing bad input.
            {
              chainId: toHex(111),
              ticker: 'TICKER',
            },
            {
              referrer: 'https://test-dapp.com',
              source: 'dapp',
            },
          ),
        ).rejects.toThrow(
          new Error(
            'An rpcUrl is required to add or update network configuration',
          ),
        );
      });
    });

    it('throws if the rpcUrl given is not a valid URL', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.upsertNetworkConfiguration(
            {
              rpcUrl: 'test',
              chainId: toHex(111),
              ticker: 'TICKER',
            },
            {
              referrer: 'https://test-dapp.com',
              source: 'dapp',
            },
          ),
        ).rejects.toThrow(new Error('rpcUrl must be a valid URL'));
      });
    });

    it('throws if a falsy referrer is given', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.upsertNetworkConfiguration(
            {
              rpcUrl: 'https://test.network',
              chainId: toHex(111),
              ticker: 'TICKER',
            },
            {
              // @ts-expect-error We are intentionally passing bad input.
              referrer: false,
              source: 'dapp',
            },
          ),
        ).rejects.toThrow(
          new Error(
            'referrer and source are required arguments for adding or updating a network configuration',
          ),
        );
      });
    });

    it('throws if no referrer is given', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.upsertNetworkConfiguration(
            {
              rpcUrl: 'https://test.network',
              chainId: toHex(111),
              ticker: 'TICKER',
            },
            // @ts-expect-error We are intentionally passing bad input.
            {
              source: 'dapp',
            },
          ),
        ).rejects.toThrow(
          new Error(
            'referrer and source are required arguments for adding or updating a network configuration',
          ),
        );
      });
    });

    it('throws if a falsy source is given', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.upsertNetworkConfiguration(
            {
              rpcUrl: 'https://test.network',
              chainId: toHex(111),
              ticker: 'TICKER',
            },
            {
              referrer: 'https://test-dapp.com',
              // @ts-expect-error We are intentionally passing bad input.
              source: false,
            },
          ),
        ).rejects.toThrow(
          new Error(
            'referrer and source are required arguments for adding or updating a network configuration',
          ),
        );
      });
    });

    it('throws if no source is given', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.upsertNetworkConfiguration(
            {
              rpcUrl: 'https://test.network',
              chainId: toHex(111),
              ticker: 'TICKER',
            },
            // @ts-expect-error We are intentionally passing bad input.
            {
              referrer: 'https://test-dapp.com',
            },
          ),
        ).rejects.toThrow(
          new Error(
            'referrer and source are required arguments for adding or updating a network configuration',
          ),
        );
      });
    });

    it('throws if a falsy ticker is given', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.upsertNetworkConfiguration(
            {
              rpcUrl: 'https://test.network',
              chainId: toHex(111),
              // @ts-expect-error We are intentionally passing bad input.
              ticker: false,
            },
            {
              referrer: 'https://test-dapp.com',
              source: 'dapp',
            },
          ),
        ).rejects.toThrow(
          new Error(
            'A ticker is required to add or update networkConfiguration',
          ),
        );
      });
    });

    it('throws if no ticker is given', async () => {
      await withController(async ({ controller }) => {
        await expect(
          controller.upsertNetworkConfiguration(
            // @ts-expect-error We are intentionally passing bad input.
            {
              rpcUrl: 'https://test.network',
              chainId: toHex(111),
            },
            {
              referrer: 'https://test-dapp.com',
              source: 'dapp',
            },
          ),
        ).rejects.toThrow(
          new Error(
            'A ticker is required to add or update networkConfiguration',
          ),
        );
      });
    });
  });

  describe('removeNetworkConfiguration', () => {
    describe('given an ID that identifies a network configuration in state', () => {
      it('removes the network configuration from state', async () => {
        await withController(
          {
            state: {
              networkConfigurations: {
                'AAAA-AAAA-AAAA-AAAA': {
                  rpcUrl: 'https://test.network',
                  ticker: 'TICKER',
                  chainId: toHex(111),
                  id: 'AAAA-AAAA-AAAA-AAAA',
                },
              },
            },
          },
          async ({ controller }) => {
            controller.removeNetworkConfiguration('AAAA-AAAA-AAAA-AAAA');

            expect(controller.state.networkConfigurations).toStrictEqual({});
          },
        );
      });

      it('destroys and removes the network client in the network client registry that corresponds to the given ID', async () => {
        await withController(
          {
            state: {
              networkConfigurations: {
                'AAAA-AAAA-AAAA-AAAA': {
                  rpcUrl: 'https://test.network',
                  ticker: 'TICKER',
                  chainId: toHex(111),
                  id: 'AAAA-AAAA-AAAA-AAAA',
                },
              },
            },
          },
          async ({ controller }) => {
            mockCreateNetworkClientWithDefaultsForBuiltInNetworkClients()
              .calledWith({
                chainId: toHex(111),
                rpcUrl: 'https://test.network',
                type: NetworkClientType.Custom,
                ticker: 'TEST',
              })
              .mockReturnValue(buildFakeClient());
            const networkClientToDestroy = Object.values(
              controller.getNetworkClientRegistry(),
            ).find(({ configuration }) => {
              return (
                configuration.type === NetworkClientType.Custom &&
                configuration.chainId === toHex(111) &&
                configuration.rpcUrl === 'https://test.network'
              );
            });
            assert(networkClientToDestroy);
            jest.spyOn(networkClientToDestroy, 'destroy');

            controller.removeNetworkConfiguration('AAAA-AAAA-AAAA-AAAA');

            expect(networkClientToDestroy.destroy).toHaveBeenCalled();
            expect(controller.getNetworkClientRegistry()).not.toMatchObject({
              'https://test.network': expect.objectContaining({
                configuration: {
                  chainId: toHex(111),
                  rpcUrl: 'https://test.network',
                  type: NetworkClientType.Custom,
                  ticker: 'TEST',
                },
              }),
            });
          },
        );
      });
    });

    describe('given an ID that does not identify a network configuration in state', () => {
      it('throws', async () => {
        await withController(async ({ controller }) => {
          expect(() =>
            controller.removeNetworkConfiguration('NONEXISTENT'),
          ).toThrow(
            `networkConfigurationId NONEXISTENT does not match a configured networkConfiguration`,
          );
        });
      });

      it('does not update the network client registry', async () => {
        await withController(async ({ controller }) => {
          mockCreateNetworkClientWithDefaultsForBuiltInNetworkClients();
          const networkClients = controller.getNetworkClientRegistry();

          try {
            controller.removeNetworkConfiguration('NONEXISTENT');
          } catch {
            // ignore error (it is tested elsewhere)
          }

          expect(controller.getNetworkClientRegistry()).toStrictEqual(
            networkClients,
          );
        });
      });
    });
  });

  describe('rollbackToPreviousProvider', () => {
    describe('when called not following any network switches', () => {
      [NetworkType.mainnet, NetworkType.goerli, NetworkType.sepolia].forEach(
        (networkType) => {
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          describe(`when selectedNetworkClientId in state is the Infura network "${networkType}"`, () => {
            refreshNetworkTests({
              expectedNetworkClientConfiguration:
                buildInfuraNetworkClientConfiguration(networkType),
              initialState: {
                selectedNetworkClientId: networkType,
              },
              operation: async (controller) => {
                await controller.rollbackToPreviousProvider();
              },
            });
          });
        },
      );

      describe('when selectedNetworkClientId in state is the ID of a network configuration', () => {
        refreshNetworkTests({
          expectedNetworkClientConfiguration:
            buildCustomNetworkClientConfiguration({
              rpcUrl: 'https://mock-rpc-url',
              chainId: toHex(1337),
              ticker: 'TEST',
            }),
          initialState: {
            selectedNetworkClientId: 'AAAA-AAAA-AAAA-AAAA',
            networkConfigurations: {
              'AAAA-AAAA-AAAA-AAAA': {
                id: 'AAAA-AAAA-AAAA-AAAA',
                rpcUrl: 'https://mock-rpc-url',
                chainId: toHex(1337),
                ticker: 'TEST',
              },
            },
          },
          operation: async (controller) => {
            await controller.rollbackToPreviousProvider();
          },
        });
      });
    });

    for (const { networkType } of INFURA_NETWORKS) {
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      describe(`when called following a network switch away from the Infura network "${networkType}"`, () => {
        it('emits networkWillChange with state payload', async () => {
          await withController(
            {
              state: {
                selectedNetworkClientId: networkType,
                networkConfigurations: {
                  testNetworkConfiguration: {
                    id: 'testNetworkConfiguration',
                    rpcUrl: 'https://mock-rpc-url',
                    chainId: toHex(1337),
                    ticker: 'TEST',
                    nickname: 'test network',
                    rpcPrefs: {
                      blockExplorerUrl: 'https://test-block-explorer.com',
                    },
                  },
                },
              },
            },
            async ({ controller, messenger }) => {
              const fakeProvider = buildFakeProvider();
              const fakeNetworkClient = buildFakeClient(fakeProvider);
              mockCreateNetworkClient().mockReturnValue(fakeNetworkClient);
              await controller.setActiveNetwork('testNetworkConfiguration');

              const networkWillChange = waitForPublishedEvents({
                messenger,
                eventType: 'NetworkController:networkWillChange',
                filter: ([networkState]) => networkState === controller.state,
                operation: () => {
                  // Intentionally not awaited because we're capturing an event
                  // emitted partway through the operation
                  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
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
                selectedNetworkClientId: networkType,
                networkConfigurations: {
                  testNetworkConfiguration: {
                    id: 'testNetworkConfiguration',
                    rpcUrl: 'https://mock-rpc-url',
                    chainId: toHex(1337),
                    ticker: 'TEST',
                    nickname: 'test network',
                    rpcPrefs: {
                      blockExplorerUrl: 'https://test-block-explorer.com',
                    },
                  },
                },
              },
            },
            async ({ controller, messenger }) => {
              const fakeProvider = buildFakeProvider();
              const fakeNetworkClient = buildFakeClient(fakeProvider);
              mockCreateNetworkClient().mockReturnValue(fakeNetworkClient);
              await controller.setActiveNetwork('testNetworkConfiguration');

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
          await withController(
            {
              state: {
                selectedNetworkClientId: networkType,
                networkConfigurations: {
                  testNetworkConfiguration: {
                    id: 'testNetworkConfiguration',
                    rpcUrl: 'https://mock-rpc-url',
                    chainId: toHex(1337),
                    ticker: 'TEST',
                    nickname: 'test network',
                    rpcPrefs: {
                      blockExplorerUrl: 'https://test-block-explorer.com',
                    },
                  },
                },
              },
              infuraProjectId: 'some-infura-project-id',
            },
            async ({ controller }) => {
              const fakeProviders = [buildFakeProvider(), buildFakeProvider()];
              const fakeNetworkClients = [
                buildFakeClient(fakeProviders[0]),
                buildFakeClient(fakeProviders[1]),
              ];
              mockCreateNetworkClient()
                .calledWith({
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(1337),
                  type: NetworkClientType.Custom,
                  ticker: 'TEST',
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  network: networkType,
                  infuraProjectId: 'some-infura-project-id',
                  chainId: BUILT_IN_NETWORKS[networkType].chainId,
                  ticker: BUILT_IN_NETWORKS[networkType].ticker,
                  type: NetworkClientType.Infura,
                })
                .mockReturnValue(fakeNetworkClients[1]);
              await controller.setActiveNetwork('testNetworkConfiguration');
              expect(controller.state.selectedNetworkClientId).toBe(
                'testNetworkConfiguration',
              );

              await controller.rollbackToPreviousProvider();

              expect(controller.state.selectedNetworkClientId).toBe(
                networkType,
              );
            },
          );
        });

        it('resets the network status to "unknown" before updating the provider', async () => {
          await withController(
            {
              state: {
                selectedNetworkClientId: networkType,
                networkConfigurations: {
                  testNetworkConfiguration: {
                    id: 'testNetworkConfiguration',
                    rpcUrl: 'https://mock-rpc-url',
                    chainId: toHex(1337),
                    ticker: 'TEST',
                  },
                },
              },
              infuraProjectId: 'some-infura-project-id',
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
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(1337),
                  type: NetworkClientType.Custom,
                  ticker: 'TEST',
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  network: networkType,
                  chainId: BUILT_IN_NETWORKS[networkType].chainId,
                  ticker: BUILT_IN_NETWORKS[networkType].ticker,
                  infuraProjectId: 'some-infura-project-id',
                  type: NetworkClientType.Infura,
                })
                .mockReturnValue(fakeNetworkClients[1]);
              await controller.setActiveNetwork('testNetworkConfiguration');
              expect(
                controller.state.networksMetadata[
                  controller.state.selectedNetworkClientId
                ].status,
              ).toBe('available');

              await waitForStateChanges({
                messenger,
                propertyPath: ['networksMetadata', networkType, 'status'],
                // We only care about the first state change, because it
                // happens before networkDidChange
                count: 1,
                operation: () => {
                  // Intentionally not awaited because we want to check state
                  // while this operation is in-progress
                  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
                  // eslint-disable-next-line @typescript-eslint/no-floating-promises
                  controller.rollbackToPreviousProvider();
                },
                beforeResolving: () => {
                  expect(
                    controller.state.networksMetadata[
                      controller.state.selectedNetworkClientId
                    ].status,
                  ).toBe('unknown');
                },
              });
            },
          );
        });

        // This is a string.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        it(`initializes a provider pointed to the "${networkType}" Infura network`, async () => {
          await withController(
            {
              state: {
                selectedNetworkClientId: networkType,
                networkConfigurations: {
                  testNetworkConfiguration: {
                    id: 'testNetworkConfiguration',
                    rpcUrl: 'https://mock-rpc-url',
                    chainId: toHex(1337),
                    ticker: 'TEST',
                  },
                },
              },
              infuraProjectId: 'some-infura-project-id',
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
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(1337),
                  type: NetworkClientType.Custom,
                  ticker: 'TEST',
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  network: networkType,
                  infuraProjectId: 'some-infura-project-id',
                  chainId: BUILT_IN_NETWORKS[networkType].chainId,
                  ticker: BUILT_IN_NETWORKS[networkType].ticker,
                  type: NetworkClientType.Infura,
                })
                .mockReturnValue(fakeNetworkClients[1]);
              await controller.setActiveNetwork('testNetworkConfiguration');

              await controller.rollbackToPreviousProvider();

              const { provider } = controller.getProviderAndBlockTracker();
              assert(provider, 'Provider is somehow unset');
              const response = await provider.request({
                id: '1',
                jsonrpc: '2.0',
                method: 'test',
              });
              expect((response as JsonRpcSuccess<Json>).result).toBe(
                'test response',
              );
            },
          );
        });

        it('replaces the provider object underlying the provider proxy without creating a new instance of the proxy itself', async () => {
          await withController(
            {
              state: {
                selectedNetworkClientId: networkType,
                networkConfigurations: {
                  testNetworkConfiguration: {
                    id: 'testNetworkConfiguration',
                    rpcUrl: 'https://mock-rpc-url',
                    chainId: toHex(1337),
                    ticker: 'TEST',
                  },
                },
              },
              infuraProjectId: 'some-infura-project-id',
            },
            async ({ controller }) => {
              const fakeProviders = [buildFakeProvider(), buildFakeProvider()];
              const fakeNetworkClients = [
                buildFakeClient(fakeProviders[0]),
                buildFakeClient(fakeProviders[1]),
              ];
              mockCreateNetworkClient()
                .calledWith({
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(1337),
                  type: NetworkClientType.Custom,
                  ticker: 'TEST',
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  network: networkType,
                  infuraProjectId: 'some-infura-project-id',
                  chainId: BUILT_IN_NETWORKS[networkType].chainId,
                  ticker: BUILT_IN_NETWORKS[networkType].ticker,
                  type: NetworkClientType.Infura,
                })
                .mockReturnValue(fakeNetworkClients[1]);
              await controller.setActiveNetwork('testNetworkConfiguration');
              const { provider: providerBefore } =
                controller.getProviderAndBlockTracker();

              await controller.rollbackToPreviousProvider();

              const { provider: providerAfter } =
                controller.getProviderAndBlockTracker();
              expect(providerBefore).toBe(providerAfter);
            },
          );
        });

        it('emits infuraIsBlocked or infuraIsUnblocked, depending on whether Infura is blocking requests for the previous network', async () => {
          await withController(
            {
              state: {
                selectedNetworkClientId: networkType,
                networkConfigurations: {
                  testNetworkConfiguration: {
                    id: 'testNetworkConfiguration',
                    rpcUrl: 'https://mock-rpc-url',
                    chainId: toHex(1337),
                    ticker: 'TEST',
                  },
                },
              },
              infuraProjectId: 'some-infura-project-id',
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
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(1337),
                  type: NetworkClientType.Custom,
                  ticker: 'TEST',
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  network: networkType,
                  infuraProjectId: 'some-infura-project-id',
                  chainId: BUILT_IN_NETWORKS[networkType].chainId,
                  ticker: BUILT_IN_NETWORKS[networkType].ticker,
                  type: NetworkClientType.Infura,
                })
                .mockReturnValue(fakeNetworkClients[1]);
              await controller.setActiveNetwork('testNetworkConfiguration');
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
          await withController(
            {
              state: {
                selectedNetworkClientId: networkType,
                networkConfigurations: {
                  testNetworkConfiguration: {
                    id: 'testNetworkConfiguration',
                    rpcUrl: 'https://mock-rpc-url',
                    chainId: toHex(1337),
                    ticker: 'TEST',
                  },
                },
              },
              infuraProjectId: 'some-infura-project-id',
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
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(1337),
                  type: NetworkClientType.Custom,
                  ticker: 'TEST',
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  network: networkType,
                  infuraProjectId: 'some-infura-project-id',
                  chainId: BUILT_IN_NETWORKS[networkType].chainId,
                  ticker: BUILT_IN_NETWORKS[networkType].ticker,
                  type: NetworkClientType.Infura,
                })
                .mockReturnValue(fakeNetworkClients[1]);
              await controller.setActiveNetwork('testNetworkConfiguration');
              expect(
                controller.state.networksMetadata[
                  controller.state.selectedNetworkClientId
                ].status,
              ).toBe('unavailable');

              await waitForStateChanges({
                messenger,
                propertyPath: ['networksMetadata', networkType, 'status'],
                operation: async () => {
                  await controller.rollbackToPreviousProvider();
                },
              });
              expect(
                controller.state.networksMetadata[
                  controller.state.selectedNetworkClientId
                ].status,
              ).toBe('available');
            },
          );
        });

        it('checks whether the previous network supports EIP-1559 again and updates state accordingly', async () => {
          await withController(
            {
              state: {
                selectedNetworkClientId: networkType,
                networkConfigurations: {
                  testNetworkConfiguration: {
                    id: 'testNetworkConfiguration',
                    rpcUrl: 'https://mock-rpc-url',
                    chainId: toHex(1337),
                    ticker: 'TEST',
                  },
                },
              },
              infuraProjectId: 'some-infura-project-id',
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
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(1337),
                  type: NetworkClientType.Custom,
                  ticker: 'TEST',
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  network: networkType,
                  infuraProjectId: 'some-infura-project-id',
                  chainId: BUILT_IN_NETWORKS[networkType].chainId,
                  ticker: BUILT_IN_NETWORKS[networkType].ticker,
                  type: NetworkClientType.Infura,
                })
                .mockReturnValue(fakeNetworkClients[1]);
              await controller.setActiveNetwork('testNetworkConfiguration');
              expect(
                controller.state.networksMetadata[
                  controller.state.selectedNetworkClientId
                ].EIPS[1559],
              ).toBe(false);

              await waitForStateChanges({
                messenger,
                propertyPath: ['networksMetadata', networkType, 'EIPS'],
                count: 2,
                operation: async () => {
                  await controller.rollbackToPreviousProvider();
                },
              });
              expect(
                controller.state.networksMetadata[
                  controller.state.selectedNetworkClientId
                ].EIPS[1559],
              ).toBe(true);
            },
          );
        });
      });
    }

    describe('when called following a network switch away from a network configuration', () => {
      it('emits networkWillChange with state payload', async () => {
        await withController(
          {
            state: {
              selectedNetworkClientId: 'testNetworkConfiguration',
              networkConfigurations: {
                testNetworkConfiguration: {
                  id: 'testNetworkConfiguration',
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(1337),
                  ticker: 'TEST',
                },
              },
            },
          },
          async ({ controller, messenger }) => {
            const fakeProvider = buildFakeProvider();
            const fakeNetworkClient = buildFakeClient(fakeProvider);
            mockCreateNetworkClient().mockReturnValue(fakeNetworkClient);
            await controller.setProviderType(InfuraNetworkType.goerli);

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
              selectedNetworkClientId: 'testNetworkConfiguration',
              networkConfigurations: {
                testNetworkConfiguration: {
                  id: 'testNetworkConfiguration',
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(1337),
                  ticker: 'TEST',
                },
              },
            },
          },
          async ({ controller, messenger }) => {
            const fakeProvider = buildFakeProvider();
            const fakeNetworkClient = buildFakeClient(fakeProvider);
            mockCreateNetworkClient().mockReturnValue(fakeNetworkClient);
            await controller.setProviderType(InfuraNetworkType.goerli);

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
        await withController(
          {
            state: {
              selectedNetworkClientId: 'testNetworkConfiguration',
              networkConfigurations: {
                testNetworkConfiguration: {
                  id: 'testNetworkConfiguration',
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(1337),
                  ticker: 'TEST',
                },
              },
            },
            infuraProjectId: 'some-infura-project-id',
          },
          async ({ controller }) => {
            const fakeProviders = [buildFakeProvider(), buildFakeProvider()];
            const fakeNetworkClients = [
              buildFakeClient(fakeProviders[0]),
              buildFakeClient(fakeProviders[1]),
            ];
            mockCreateNetworkClient()
              .calledWith({
                network: InfuraNetworkType.goerli,
                infuraProjectId: 'some-infura-project-id',
                type: NetworkClientType.Infura,
                chainId: BUILT_IN_NETWORKS[InfuraNetworkType.goerli].chainId,
                ticker: BUILT_IN_NETWORKS[InfuraNetworkType.goerli].ticker,
              })
              .mockReturnValue(fakeNetworkClients[0])
              .calledWith({
                rpcUrl: 'https://mock-rpc-url',
                chainId: toHex(1337),
                type: NetworkClientType.Custom,
                ticker: 'TEST',
              })
              .mockReturnValue(fakeNetworkClients[1]);
            await controller.setProviderType('goerli');
            expect(controller.state.selectedNetworkClientId).toBe('goerli');

            await controller.rollbackToPreviousProvider();
            expect(controller.state.selectedNetworkClientId).toBe(
              'testNetworkConfiguration',
            );
          },
        );
      });

      it('resets the network state to "unknown" before updating the provider', async () => {
        await withController(
          {
            state: {
              selectedNetworkClientId: 'testNetworkConfiguration',
              networkConfigurations: {
                testNetworkConfiguration: {
                  id: 'testNetworkConfiguration',
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(1337),
                  ticker: 'TEST',
                },
              },
            },
            infuraProjectId: 'some-infura-project-id',
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
                network: InfuraNetworkType.goerli,
                infuraProjectId: 'some-infura-project-id',
                type: NetworkClientType.Infura,
                chainId: BUILT_IN_NETWORKS[InfuraNetworkType.goerli].chainId,
                ticker: BUILT_IN_NETWORKS[InfuraNetworkType.goerli].ticker,
              })
              .mockReturnValue(fakeNetworkClients[0])
              .calledWith({
                rpcUrl: 'https://mock-rpc-url',
                chainId: toHex(1337),
                type: NetworkClientType.Custom,
                ticker: 'TEST',
              })
              .mockReturnValue(fakeNetworkClients[1]);
            await controller.setProviderType('goerli');
            expect(
              controller.state.networksMetadata[
                controller.state.selectedNetworkClientId
              ].status,
            ).toBe('available');

            await waitForStateChanges({
              messenger,
              propertyPath: [
                'networksMetadata',
                'testNetworkConfiguration',
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
                  controller.state.networksMetadata[
                    controller.state.selectedNetworkClientId
                  ].status,
                ).toBe('unknown');
              },
            });
          },
        );
      });

      it('initializes a provider pointed to the given RPC URL', async () => {
        await withController(
          {
            state: {
              selectedNetworkClientId: 'testNetworkConfiguration',
              networkConfigurations: {
                testNetworkConfiguration: {
                  id: 'testNetworkConfiguration',
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(1337),
                  ticker: 'TEST',
                },
              },
            },
            infuraProjectId: 'some-infura-project-id',
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
                network: InfuraNetworkType.goerli,
                infuraProjectId: 'some-infura-project-id',
                type: NetworkClientType.Infura,
                chainId: BUILT_IN_NETWORKS[InfuraNetworkType.goerli].chainId,
                ticker: BUILT_IN_NETWORKS[InfuraNetworkType.goerli].ticker,
              })
              .mockReturnValue(fakeNetworkClients[0])
              .calledWith({
                rpcUrl: 'https://mock-rpc-url',
                chainId: toHex(1337),
                type: NetworkClientType.Custom,
                ticker: 'TEST',
              })
              .mockReturnValue(fakeNetworkClients[1]);
            await controller.setProviderType('goerli');

            await controller.rollbackToPreviousProvider();

            const { provider } = controller.getProviderAndBlockTracker();
            assert(provider, 'Provider is somehow unset');
            const response = await provider.request({
              id: '1',
              jsonrpc: '2.0',
              method: 'test',
            });
            expect((response as JsonRpcSuccess<Json>).result).toBe(
              'test response',
            );
          },
        );
      });

      it('replaces the provider object underlying the provider proxy without creating a new instance of the proxy itself', async () => {
        await withController(
          {
            state: {
              selectedNetworkClientId: 'testNetworkConfiguration',
              networkConfigurations: {
                testNetworkConfiguration: {
                  id: 'testNetworkConfiguration',
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(1337),
                  ticker: 'TEST',
                },
              },
            },
            infuraProjectId: 'some-infura-project-id',
          },
          async ({ controller }) => {
            const fakeProviders = [buildFakeProvider(), buildFakeProvider()];
            const fakeNetworkClients = [
              buildFakeClient(fakeProviders[0]),
              buildFakeClient(fakeProviders[1]),
            ];
            mockCreateNetworkClient()
              .calledWith({
                network: InfuraNetworkType.goerli,
                infuraProjectId: 'some-infura-project-id',
                type: NetworkClientType.Infura,
                chainId: BUILT_IN_NETWORKS[InfuraNetworkType.goerli].chainId,
                ticker: BUILT_IN_NETWORKS[InfuraNetworkType.goerli].ticker,
              })
              .mockReturnValue(fakeNetworkClients[0])
              .calledWith({
                rpcUrl: 'https://mock-rpc-url',
                chainId: toHex(1337),
                type: NetworkClientType.Custom,
                ticker: 'TEST',
              })
              .mockReturnValue(fakeNetworkClients[1]);
            await controller.setProviderType('goerli');
            const { provider: providerBefore } =
              controller.getProviderAndBlockTracker();

            await controller.rollbackToPreviousProvider();

            const { provider: providerAfter } =
              controller.getProviderAndBlockTracker();
            expect(providerBefore).toBe(providerAfter);
          },
        );
      });

      it('emits infuraIsUnblocked', async () => {
        await withController(
          {
            state: {
              selectedNetworkClientId: 'testNetworkConfiguration',
              networkConfigurations: {
                testNetworkConfiguration: {
                  id: 'testNetworkConfiguration',
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(1337),
                  ticker: 'TEST',
                },
              },
            },
            infuraProjectId: 'some-infura-project-id',
          },
          async ({ controller, messenger }) => {
            const fakeProviders = [buildFakeProvider(), buildFakeProvider()];
            const fakeNetworkClients = [
              buildFakeClient(fakeProviders[0]),
              buildFakeClient(fakeProviders[1]),
            ];
            mockCreateNetworkClient()
              .calledWith({
                network: InfuraNetworkType.goerli,
                infuraProjectId: 'some-infura-project-id',
                chainId: BUILT_IN_NETWORKS[InfuraNetworkType.goerli].chainId,
                ticker: BUILT_IN_NETWORKS[InfuraNetworkType.goerli].ticker,
                type: NetworkClientType.Infura,
              })
              .mockReturnValue(fakeNetworkClients[0])
              .calledWith({
                rpcUrl: 'https://mock-rpc-url',
                chainId: toHex(1337),
                type: NetworkClientType.Custom,
                ticker: 'TEST',
              })
              .mockReturnValue(fakeNetworkClients[1]);
            await controller.setProviderType('goerli');

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
        await withController(
          {
            state: {
              selectedNetworkClientId: 'testNetworkConfiguration',
              networkConfigurations: {
                testNetworkConfiguration: {
                  id: 'testNetworkConfiguration',
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(1337),
                  ticker: 'TEST',
                },
              },
            },
            infuraProjectId: 'some-infura-project-id',
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
                network: InfuraNetworkType.goerli,
                infuraProjectId: 'some-infura-project-id',
                chainId: BUILT_IN_NETWORKS[InfuraNetworkType.goerli].chainId,
                ticker: BUILT_IN_NETWORKS[InfuraNetworkType.goerli].ticker,
                type: NetworkClientType.Infura,
              })
              .mockReturnValue(fakeNetworkClients[0])
              .calledWith({
                rpcUrl: 'https://mock-rpc-url',
                chainId: toHex(1337),
                type: NetworkClientType.Custom,
                ticker: 'TEST',
              })
              .mockReturnValue(fakeNetworkClients[1]);
            await controller.setProviderType('goerli');
            expect(
              controller.state.networksMetadata[
                controller.state.selectedNetworkClientId
              ].status,
            ).toBe('unavailable');

            await controller.rollbackToPreviousProvider();
            expect(
              controller.state.networksMetadata[
                controller.state.selectedNetworkClientId
              ].status,
            ).toBe('available');
          },
        );
      });

      it('checks whether the previous network supports EIP-1559 again and updates state accordingly', async () => {
        await withController(
          {
            state: {
              selectedNetworkClientId: 'testNetworkConfiguration',
              networkConfigurations: {
                testNetworkConfiguration: {
                  id: 'testNetworkConfiguration',
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(1337),
                  ticker: 'TEST',
                },
              },
            },
            infuraProjectId: 'some-infura-project-id',
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
                network: InfuraNetworkType.goerli,
                infuraProjectId: 'some-infura-project-id',
                chainId: BUILT_IN_NETWORKS[InfuraNetworkType.goerli].chainId,
                ticker: BUILT_IN_NETWORKS[InfuraNetworkType.goerli].ticker,
                type: NetworkClientType.Infura,
              })
              .mockReturnValue(fakeNetworkClients[0])
              .calledWith({
                rpcUrl: 'https://mock-rpc-url',
                chainId: toHex(1337),
                type: NetworkClientType.Custom,
                ticker: 'TEST',
              })
              .mockReturnValue(fakeNetworkClients[1]);
            await controller.setProviderType('goerli');
            expect(
              controller.state.networksMetadata[
                controller.state.selectedNetworkClientId
              ].EIPS[1559],
            ).toBe(false);

            await controller.rollbackToPreviousProvider();
            expect(
              controller.state.networksMetadata[
                controller.state.selectedNetworkClientId
              ].EIPS[1559],
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
          state: {
            networkConfigurations: {
              networkConfigurationId1: {
                id: 'networkConfigurationId1',
                rpcUrl: 'https://rpc-url1.com',
                chainId: toHex(1),
                ticker: 'TEST1',
              },
            },
          },
        },
        ({ controller }) => {
          controller.loadBackup({
            networkConfigurations: {
              networkConfigurationId2: {
                id: 'networkConfigurationId2',
                rpcUrl: 'https://rpc-url2.com',
                chainId: toHex(2),
                ticker: 'TEST2',
              },
            },
          });

          expect(controller.state.networkConfigurations).toStrictEqual({
            networkConfigurationId1: {
              id: 'networkConfigurationId1',
              rpcUrl: 'https://rpc-url1.com',
              chainId: toHex(1),
              ticker: 'TEST1',
            },
            networkConfigurationId2: {
              id: 'networkConfigurationId2',
              rpcUrl: 'https://rpc-url2.com',
              chainId: toHex(2),
              ticker: 'TEST2',
            },
          });
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
 * Creates a mocked version of `createNetworkClient` where multiple mock
 * invocations can be specified. Requests for built-in networks are already
 * mocked.
 *
 * @param options - The options.
 * @param options.builtInNetworkClient - The network client to use for requests
 * to built-in networks.
 * @param options.infuraProjectId - The Infura project ID that each network
 * client is expected to be created with.
 * @returns The mocked version of `createNetworkClient`.
 */
function mockCreateNetworkClientWithDefaultsForBuiltInNetworkClients({
  builtInNetworkClient = buildFakeClient(),
  infuraProjectId = 'infura-project-id',
} = {}) {
  return mockCreateNetworkClient()
    .calledWith({
      network: NetworkType.mainnet,
      infuraProjectId,
      type: NetworkClientType.Infura,
      chainId: BUILT_IN_NETWORKS[InfuraNetworkType.mainnet].chainId,
      ticker: BUILT_IN_NETWORKS[InfuraNetworkType.mainnet].ticker,
    })
    .mockReturnValue(builtInNetworkClient)
    .calledWith({
      network: NetworkType.goerli,
      infuraProjectId,
      chainId: BUILT_IN_NETWORKS[InfuraNetworkType.goerli].chainId,
      ticker: BUILT_IN_NETWORKS[InfuraNetworkType.goerli].ticker,
      type: NetworkClientType.Infura,
    })
    .mockReturnValue(builtInNetworkClient)
    .calledWith({
      network: NetworkType.sepolia,
      infuraProjectId,
      chainId: BUILT_IN_NETWORKS[InfuraNetworkType.sepolia].chainId,
      ticker: BUILT_IN_NETWORKS[InfuraNetworkType.sepolia].ticker,
      type: NetworkClientType.Infura,
    })
    .mockReturnValue(builtInNetworkClient);
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
          expect((chainIdResult as JsonRpcSuccess<Json>).result).toBe(
            toHex(111),
          );
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
          expect((chainIdResult as JsonRpcSuccess<Json>).result).toBe(
            toHex(1337),
          );
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
        let initializationNetworkClientOptions: Parameters<
          typeof createNetworkClient
        >[0];

        if (isInfuraNetworkType(selectedNetworkClientId)) {
          initializationNetworkClientOptions = {
            network: selectedNetworkClientId,
            infuraProjectId: 'infura-project-id',
            chainId: BUILT_IN_NETWORKS[selectedNetworkClientId].chainId,
            ticker: BUILT_IN_NETWORKS[selectedNetworkClientId].ticker,
            type: NetworkClientType.Infura,
          };
        } else {
          const networkConfiguration =
            controller.state.networkConfigurations[selectedNetworkClientId];
          initializationNetworkClientOptions = {
            chainId: networkConfiguration.chainId,
            rpcUrl: networkConfiguration.rpcUrl,
            type: NetworkClientType.Custom,
            ticker: networkConfiguration.ticker,
          };
        }

        const operationNetworkClientOptions: Parameters<
          typeof createNetworkClient
        >[0] =
          expectedNetworkClientConfiguration.type === NetworkClientType.Custom
            ? expectedNetworkClientConfiguration
            : {
                ...expectedNetworkClientConfiguration,
                infuraProjectId: 'infura-project-id',
              };
        mockCreateNetworkClient()
          .calledWith(initializationNetworkClientOptions)
          .mockReturnValue(fakeNetworkClients[0])
          .calledWith(operationNetworkClientOptions)
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
    expectedNetworkClientConfiguration,
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
 * @param args.expectedNetworkClientConfiguration - The network client
 * configuration that the operation is expected to set.
 * @param args.initialState - The initial state of the network controller.
 * @param args.operation - The operation to test.
 */
function lookupNetworkTests({
  expectedNetworkClientConfiguration,
  initialState,
  operation,
}: {
  expectedNetworkClientConfiguration: NetworkClientConfiguration;
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

    if (expectedNetworkClientConfiguration.type === NetworkClientType.Custom) {
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
    if (expectedNetworkClientConfiguration.type === NetworkClientType.Custom) {
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

    if (expectedNetworkClientConfiguration.type === NetworkClientType.Custom) {
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
    trackMetaMetricsEvent: jest.fn(),
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
