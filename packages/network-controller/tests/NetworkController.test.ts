import { inspect, isDeepStrictEqual, promisify } from 'util';
import assert from 'assert';
import { ControllerMessenger } from '@metamask/base-controller';
import { Patch } from 'immer';
import { v4 } from 'uuid';
import nock from 'nock';
import { ethErrors } from 'eth-rpc-errors';
import {
  BUILT_IN_NETWORKS,
  ChainId,
  InfuraNetworkType,
  MAX_SAFE_CHAIN_ID,
  NetworkType,
  toHex,
} from '@metamask/controller-utils';
import { when, resetAllWhenMocks } from 'jest-when';
import {
  NetworkController,
  NetworkControllerActions,
  NetworkControllerEvents,
  NetworkControllerOptions,
  NetworkControllerStateChangeEvent,
  NetworkState,
  ProviderConfig,
} from '../src/NetworkController';
import type { Provider } from '../src/types';
import { NetworkClientType } from '../src/types';
import { NetworkStatus } from '../src/constants';
import {
  createNetworkClient,
  NetworkClient,
} from '../src/create-network-client';
import { FakeBlockTracker } from '../../../tests/fake-block-tracker';
import { FakeProvider, FakeProviderStub } from './fake-provider';

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
 * A response object for a successful request to `net_version`. It is assumed
 * that the network ID here is insignificant to the test.
 */
const SUCCESSFUL_NET_VERSION_RESPONSE = {
  result: '42',
};

/**
 * A response object for a request that has been geoblocked by Infura.
 */
const BLOCKED_INFURA_JSON_RPC_ERROR = ethErrors.rpc.internal(
  JSON.stringify({ error: 'countryBlocked' }),
);

/**
 * A response object for a unsuccessful request to any RPC method. It is assumed
 * that the error here is insignificant to the test.
 */
const GENERIC_JSON_RPC_ERROR = ethErrors.rpc.internal(
  JSON.stringify({ error: 'oops' }),
);

describe('NetworkController', () => {
  beforeEach(() => {
    // Disable all requests, even those to localhost
    nock.disableNetConnect();
    jest.resetAllMocks();
  });

  afterEach(() => {
    nock.enableNetConnect('localhost');
    nock.cleanAll();
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
            "networkDetails": Object {
              "EIPS": Object {},
            },
            "networkId": null,
            "networkStatus": "unknown",
            "providerConfig": Object {
              "chainId": "0x1",
              "type": "mainnet",
            },
          }
        `);
      });
    });

    it('merges the given state into the default state', async () => {
      await withController(
        {
          state: {
            providerConfig: {
              type: 'rpc',
              rpcUrl: 'http://example-custom-rpc.metamask.io',
              chainId: '0x9999' as const,
              nickname: 'Test initial state',
            },
            networkDetails: {
              EIPS: {
                1559: true,
              },
            },
          },
        },
        ({ controller }) => {
          expect(controller.state).toMatchInlineSnapshot(`
            Object {
              "networkConfigurations": Object {},
              "networkDetails": Object {
                "EIPS": Object {
                  "1559": true,
                },
              },
              "networkId": null,
              "networkStatus": "unknown",
              "providerConfig": Object {
                "chainId": "0x9999",
                "nickname": "Test initial state",
                "rpcUrl": "http://example-custom-rpc.metamask.io",
                "type": "rpc",
              },
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
    describe('when the type in the provider config is invalid', () => {
      it('throws', async () => {
        const invalidProviderConfig = {};
        await withController(
          /* @ts-expect-error We're intentionally passing bad input. */
          {
            state: {
              providerConfig: invalidProviderConfig,
            },
          },
          async ({ controller }) => {
            await expect(async () => {
              await controller.initializeProvider();
            }).rejects.toThrow("Unrecognized network type: 'undefined'");
          },
        );
      });
    });

    for (const { networkType } of INFURA_NETWORKS) {
      describe(`when the type in the provider config is "${networkType}"`, () => {
        it(`does not create another network client for the ${networkType} Infura network, since it is built in`, async () => {
          await withController(
            {
              state: {
                providerConfig: buildProviderConfig({
                  type: networkType,
                }),
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
              });
              expect(createNetworkClientMock).toHaveBeenCalledTimes(1);
            },
          );
        });

        it('captures the resulting provider of the matching network client', async () => {
          await withController(
            {
              state: {
                providerConfig: buildProviderConfig({
                  type: networkType,
                }),
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
              const { result } = await promisify(provider.sendAsync).call(
                provider,
                {
                  id: 1,
                  jsonrpc: '2.0',
                  method: 'test_method',
                  params: [],
                },
              );
              expect(result).toBe('test response');
            },
          );
        });

        lookupNetworkTests({
          expectedProviderConfig: buildProviderConfig({ type: networkType }),
          initialState: {
            providerConfig: buildProviderConfig({ type: networkType }),
          },
          operation: async (controller: NetworkController) => {
            await controller.initializeProvider();
          },
        });
      });
    }

    describe('when the type in the provider config is "rpc"', () => {
      describe('if chainId and rpcUrl are present in the provider config', () => {
        it('creates a network client for a custom RPC endpoint using the provider config', async () => {
          await withController(
            {
              state: {
                providerConfig: {
                  type: NetworkType.rpc,
                  chainId: toHex(1337),
                  rpcUrl: 'http://example.com',
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
                rpcUrl: 'http://example.com',
                type: NetworkClientType.Custom,
              });
              expect(createNetworkClientMock).toHaveBeenCalledTimes(1);
            },
          );
        });

        it('captures the resulting provider of the new network client', async () => {
          await withController(
            {
              state: {
                providerConfig: {
                  type: NetworkType.rpc,
                  chainId: toHex(1337),
                  rpcUrl: 'http://example.com',
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
              const { result } = await promisify(provider.sendAsync).call(
                provider,
                {
                  id: 1,
                  jsonrpc: '2.0',
                  method: 'test_method',
                  params: [],
                },
              );
              expect(result).toBe('test response');
            },
          );
        });

        lookupNetworkTests({
          expectedProviderConfig: buildProviderConfig({
            type: NetworkType.rpc,
          }),
          initialState: {
            providerConfig: buildProviderConfig({
              type: NetworkType.rpc,
            }),
          },
          operation: async (controller: NetworkController) => {
            await controller.initializeProvider();
          },
        });
      });

      describe('if chainId is missing from the provider config', () => {
        it('throws', async () => {
          await withController(
            {
              state: {
                providerConfig: buildProviderConfig({
                  type: NetworkType.rpc,
                  chainId: undefined,
                }),
              },
            },
            async ({ controller }) => {
              const fakeProvider = buildFakeProvider();
              const fakeNetworkClient = buildFakeClient(fakeProvider);
              createNetworkClientMock.mockReturnValue(fakeNetworkClient);

              await expect(() =>
                controller.initializeProvider(),
              ).rejects.toThrow(
                'chainId must be provided for custom RPC endpoints',
              );
            },
          );
        });

        it('does not create a network client or capture a provider', async () => {
          await withController(
            {
              state: {
                providerConfig: buildProviderConfig({
                  type: NetworkType.rpc,
                  chainId: undefined,
                }),
              },
            },
            async ({ controller }) => {
              const fakeProvider = buildFakeProvider();
              const fakeNetworkClient = buildFakeClient(fakeProvider);
              createNetworkClientMock.mockReturnValue(fakeNetworkClient);

              try {
                await controller.initializeProvider();
              } catch {
                // ignore the error
              }

              expect(createNetworkClientMock).not.toHaveBeenCalled();
              const { provider, blockTracker } =
                controller.getProviderAndBlockTracker();
              expect(provider).toBeUndefined();
              expect(blockTracker).toBeUndefined();
            },
          );
        });
      });

      describe('if rpcUrl is missing from the provider config', () => {
        it('throws', async () => {
          await withController(
            {
              state: {
                providerConfig: buildProviderConfig({
                  type: NetworkType.rpc,
                  rpcUrl: undefined,
                }),
              },
            },
            async ({ controller }) => {
              const fakeProvider = buildFakeProvider();
              const fakeNetworkClient = buildFakeClient(fakeProvider);
              createNetworkClientMock.mockReturnValue(fakeNetworkClient);

              await expect(() =>
                controller.initializeProvider(),
              ).rejects.toThrow(
                'rpcUrl must be provided for custom RPC endpoints',
              );
            },
          );
        });

        it('does not create a network client or capture a provider', async () => {
          await withController(
            {
              state: {
                providerConfig: buildProviderConfig({
                  type: NetworkType.rpc,
                  rpcUrl: undefined,
                }),
              },
            },
            async ({ controller }) => {
              const fakeProvider = buildFakeProvider();
              const fakeNetworkClient = buildFakeClient(fakeProvider);
              createNetworkClientMock.mockReturnValue(fakeNetworkClient);

              try {
                await controller.initializeProvider();
              } catch {
                // ignore the error
              }

              expect(createNetworkClientMock).not.toHaveBeenCalled();
              const { provider, blockTracker } =
                controller.getProviderAndBlockTracker();
              expect(provider).toBeUndefined();
              expect(blockTracker).toBeUndefined();
            },
          );
        });
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

        expect(provider).toHaveProperty('sendAsync');
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
      describe(`when the type in the provider configuration is changed to "${networkType}"`, () => {
        it(`returns a provider object that was pointed to another network before the switch and is pointed to "${networkType}" afterward`, async () => {
          await withController(
            {
              state: {
                providerConfig: {
                  type: 'rpc',
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: '0x1337',
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
                  chainId: '0x1337',
                  rpcUrl: 'https://mock-rpc-url',
                  type: NetworkClientType.Custom,
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  network: networkType,
                  infuraProjectId: 'some-infura-project-id',
                  type: NetworkClientType.Infura,
                })
                .mockReturnValue(fakeNetworkClients[1]);
              await controller.initializeProvider();
              const { provider } = controller.getProviderAndBlockTracker();
              assert(provider, 'Provider is somehow unset');

              const promisifiedSendAsync1 = promisify(provider.sendAsync).bind(
                provider,
              );
              const response1 = await promisifiedSendAsync1({
                id: '1',
                jsonrpc: '2.0',
                method: 'test',
              });
              expect(response1.result).toBe('test response 1');

              await controller.setProviderType(networkType);
              const promisifiedSendAsync2 = promisify(provider.sendAsync).bind(
                provider,
              );
              const response2 = await promisifiedSendAsync2({
                id: '2',
                jsonrpc: '2.0',
                method: 'test',
              });
              expect(response2.result).toBe('test response 2');
            },
          );
        });
      });
    }

    describe('when the type in the provider configuration is changed to "rpc"', () => {
      it('returns a provider object that was pointed to another network before the switch and is pointed to the new network', async () => {
        await withController(
          {
            state: {
              providerConfig: {
                type: 'goerli',
                // NOTE: This doesn't need to match the logical chain ID of
                // the network selected, it just needs to exist
                chainId: '0x9999999',
              },
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
              })
              .mockReturnValue(fakeNetworkClients[0])
              .calledWith({
                chainId: '0x1337',
                rpcUrl: 'https://mock-rpc-url',
                type: NetworkClientType.Custom,
              })
              .mockReturnValue(fakeNetworkClients[1]);
            await controller.initializeProvider();
            const { provider } = controller.getProviderAndBlockTracker();
            assert(provider, 'Provider is somehow unset');

            const promisifiedSendAsync1 = promisify(provider.sendAsync).bind(
              provider,
            );
            const response1 = await promisifiedSendAsync1({
              id: '1',
              jsonrpc: '2.0',
              method: 'test',
            });
            expect(response1.result).toBe('test response 1');

            await controller.setActiveNetwork('testNetworkConfigurationId');
            const promisifiedSendAsync2 = promisify(provider.sendAsync).bind(
              provider,
            );
            const response2 = await promisifiedSendAsync2({
              id: '2',
              jsonrpc: '2.0',
              method: 'test',
            });
            expect(response2.result).toBe('test response 2');
          },
        );
      });
    });
  });

  describe('getNetworkClientsById', () => {
    it('returns network clients for built-in and custom networks, keyed by identifier', async () => {
      await withController(
        {
          state: {
            networkConfigurations: {
              networkConfiguration1: {
                id: 'networkConfiguration1',
                rpcUrl: 'https://test.network.1',
                chainId: '0x1',
                ticker: 'TEST1',
              },
              networkConfiguration2: {
                id: 'networkConfiguration2',
                rpcUrl: 'https://test.network.2',
                chainId: '0x2',
                ticker: 'TEST2',
              },
            },
          },
          infuraProjectId: 'some-infura-project-id',
        },
        async ({ controller }) => {
          const fakeNetworkClient = buildFakeClient();
          mockCreateNetworkClient().mockReturnValue(fakeNetworkClient);

          const networkClientsById = controller.getNetworkClientsById();
          const simplifiedNetworkClients = Object.entries(
            networkClientsById,
          ).map(([networkClientId, networkClient]) => [
            networkClientId,
            networkClient.configuration,
          ]);

          expect(simplifiedNetworkClients).toStrictEqual([
            [
              'infura||mainnet',
              {
                type: NetworkClientType.Infura,
                infuraProjectId: 'some-infura-project-id',
                network: InfuraNetworkType.mainnet,
              },
            ],
            [
              'infura||goerli',
              {
                type: NetworkClientType.Infura,
                infuraProjectId: 'some-infura-project-id',
                network: InfuraNetworkType.goerli,
              },
            ],
            [
              'infura||sepolia',
              {
                type: NetworkClientType.Infura,
                infuraProjectId: 'some-infura-project-id',
                network: InfuraNetworkType.sepolia,
              },
            ],
            [
              'custom||networkConfiguration1',
              {
                type: NetworkClientType.Custom,
                chainId: '0x1',
                rpcUrl: 'https://test.network.1',
              },
            ],
            [
              'custom||networkConfiguration2',
              {
                type: NetworkClientType.Custom,
                chainId: '0x2',
                rpcUrl: 'https://test.network.2',
              },
            ],
          ]);
          for (const networkClient of Object.values(networkClientsById)) {
            expect(networkClient.provider).toHaveProperty('sendAsync');
            expect(networkClient.blockTracker).toHaveProperty(
              'checkForLatestBlock',
            );
          }
        },
      );
    });

    it('does not incorporate the built-in network represented by the provider config into the list of network clients', async () => {
      await withController(
        {
          state: {
            providerConfig: {
              type: NetworkType.mainnet,
              chainId: ChainId.mainnet,
            },
          },
          infuraProjectId: 'some-infura-project-id',
        },
        async ({ controller }) => {
          const fakeNetworkClient = buildFakeClient();
          mockCreateNetworkClient().mockReturnValue(fakeNetworkClient);

          const networkClientsById = controller.getNetworkClientsById();
          const simplifiedNetworkClients = Object.entries(
            networkClientsById,
          ).map(([networkClientId, networkClient]) => [
            networkClientId,
            networkClient.configuration,
          ]);

          expect(simplifiedNetworkClients).toStrictEqual([
            [
              'infura||mainnet',
              {
                type: NetworkClientType.Infura,
                infuraProjectId: 'some-infura-project-id',
                network: InfuraNetworkType.mainnet,
              },
            ],
            [
              'infura||goerli',
              {
                type: NetworkClientType.Infura,
                infuraProjectId: 'some-infura-project-id',
                network: InfuraNetworkType.goerli,
              },
            ],
            [
              'infura||sepolia',
              {
                type: NetworkClientType.Infura,
                infuraProjectId: 'some-infura-project-id',
                network: InfuraNetworkType.sepolia,
              },
            ],
          ]);
        },
      );
    });

    it('incorporates the custom network represented by the provider config into the list of network clients', async () => {
      await withController(
        {
          state: {
            providerConfig: {
              type: NetworkType.rpc,
              chainId: '0x3',
              rpcUrl: 'https://test.network.3',
            },
          },
          infuraProjectId: 'some-infura-project-id',
        },
        async ({ controller }) => {
          const fakeNetworkClient = buildFakeClient();
          mockCreateNetworkClient().mockReturnValue(fakeNetworkClient);

          const networkClientsById = controller.getNetworkClientsById();
          const simplifiedNetworkClients = Object.entries(
            networkClientsById,
          ).map(([networkClientId, networkClient]) => [
            networkClientId,
            networkClient.configuration,
          ]);

          expect(simplifiedNetworkClients).toStrictEqual([
            [
              'infura||mainnet',
              {
                type: NetworkClientType.Infura,
                infuraProjectId: 'some-infura-project-id',
                network: InfuraNetworkType.mainnet,
              },
            ],
            [
              'infura||goerli',
              {
                type: NetworkClientType.Infura,
                infuraProjectId: 'some-infura-project-id',
                network: InfuraNetworkType.goerli,
              },
            ],
            [
              'infura||sepolia',
              {
                type: NetworkClientType.Infura,
                infuraProjectId: 'some-infura-project-id',
                network: InfuraNetworkType.sepolia,
              },
            ],
            [
              'custom||0x3||https://test.network.3',
              {
                type: NetworkClientType.Custom,
                chainId: '0x3',
                rpcUrl: 'https://test.network.3',
              },
            ],
          ]);
        },
      );
    });

    it('incorporates the custom network represented by the provider config into the list of network clients if it does not point to a network configuration, even if one shares the same RPC', async () => {
      await withController(
        {
          state: {
            providerConfig: {
              type: NetworkType.rpc,
              chainId: '0x2',
              rpcUrl: 'https://test.network',
            },
            networkConfigurations: {
              networkConfiguration: {
                id: 'networkConfiguration',
                rpcUrl: 'https://test.network',
                chainId: '0x1',
                ticker: 'TEST',
              },
            },
          },
          infuraProjectId: 'some-infura-project-id',
        },
        async ({ controller }) => {
          const fakeNetworkClient = buildFakeClient();
          mockCreateNetworkClient().mockReturnValue(fakeNetworkClient);

          const networkClientsById = controller.getNetworkClientsById();
          const simplifiedNetworkClients = Object.entries(
            networkClientsById,
          ).map(([networkClientId, networkClient]) => [
            networkClientId,
            networkClient.configuration,
          ]);

          expect(simplifiedNetworkClients).toStrictEqual([
            [
              'infura||mainnet',
              {
                type: NetworkClientType.Infura,
                infuraProjectId: 'some-infura-project-id',
                network: InfuraNetworkType.mainnet,
              },
            ],
            [
              'infura||goerli',
              {
                type: NetworkClientType.Infura,
                infuraProjectId: 'some-infura-project-id',
                network: InfuraNetworkType.goerli,
              },
            ],
            [
              'infura||sepolia',
              {
                type: NetworkClientType.Infura,
                infuraProjectId: 'some-infura-project-id',
                network: InfuraNetworkType.sepolia,
              },
            ],
            [
              'custom||networkConfiguration',
              {
                type: NetworkClientType.Custom,
                chainId: '0x1',
                rpcUrl: 'https://test.network',
              },
            ],
            [
              'custom||0x2||https://test.network',
              {
                type: NetworkClientType.Custom,
                chainId: '0x2',
                rpcUrl: 'https://test.network',
              },
            ],
          ]);
        },
      );
    });

    it('prioritizes the custom network represented by the provider config over the network configuration that shares its RPC URL if it points to it', async () => {
      await withController(
        {
          state: {
            providerConfig: {
              type: NetworkType.rpc,
              chainId: '0x2',
              rpcUrl: 'https://test.network',
              id: 'networkConfiguration'
            },
            networkConfigurations: {
              networkConfiguration: {
                id: 'networkConfiguration',
                rpcUrl: 'https://test.network',
                chainId: '0x1',
                ticker: 'TEST',
              },
            },
          },
          infuraProjectId: 'some-infura-project-id',
        },
        async ({ controller }) => {
          const fakeNetworkClient = buildFakeClient();
          mockCreateNetworkClient().mockReturnValue(fakeNetworkClient);

          const networkClientsById = controller.getNetworkClientsById();
          const simplifiedNetworkClients = Object.entries(
            networkClientsById,
          ).map(([networkClientId, networkClient]) => [
            networkClientId,
            networkClient.configuration,
          ]);

          expect(simplifiedNetworkClients).toStrictEqual([
            [
              'infura||mainnet',
              {
                type: NetworkClientType.Infura,
                infuraProjectId: 'some-infura-project-id',
                network: InfuraNetworkType.mainnet,
              },
            ],
            [
              'infura||goerli',
              {
                type: NetworkClientType.Infura,
                infuraProjectId: 'some-infura-project-id',
                network: InfuraNetworkType.goerli,
              },
            ],
            [
              'infura||sepolia',
              {
                type: NetworkClientType.Infura,
                infuraProjectId: 'some-infura-project-id',
                network: InfuraNetworkType.sepolia,
              },
            ],
            [
              'custom||networkConfiguration',
              {
                type: NetworkClientType.Custom,
                chainId: '0x2',
                rpcUrl: 'https://test.network',
              },
            ],
          ]);
        },
      );
    });

    it('only returns the built-in Infura networks if there are no network configurations', async () => {
      await withController(
        { infuraProjectId: 'some-infura-project-id' },
        async ({ controller }) => {
          const fakeNetworkClient = buildFakeClient();
          mockCreateNetworkClient().mockReturnValue(fakeNetworkClient);

          const networkClientsById = controller.getNetworkClientsById();
          const simplifiedNetworkClients = Object.entries(
            networkClientsById,
          ).map(([networkClientId, networkClient]) => [
            networkClientId,
            networkClient.configuration,
          ]);

          expect(simplifiedNetworkClients).toStrictEqual([
            [
              'infura||mainnet',
              {
                type: NetworkClientType.Infura,
                infuraProjectId: 'some-infura-project-id',
                network: InfuraNetworkType.mainnet,
              },
            ],
            [
              'infura||goerli',
              {
                type: NetworkClientType.Infura,
                infuraProjectId: 'some-infura-project-id',
                network: InfuraNetworkType.goerli,
              },
            ],
            [
              'infura||sepolia',
              {
                type: NetworkClientType.Infura,
                infuraProjectId: 'some-infura-project-id',
                network: InfuraNetworkType.sepolia,
              },
            ],
          ]);
        },
      );
    });
  });

  describe('lookupNetwork', () => {
    describe('if a provider has not been set', () => {
      it('does not change network in state', async () => {
        await withController(async ({ controller, messenger }) => {
          const promiseForNetworkChanges = waitForStateChanges({
            messenger,
            propertyPath: ['networkId'],
          });

          await controller.lookupNetwork();

          await expect(promiseForNetworkChanges).toNeverResolve();
        });
      });
    });

    [NetworkType.mainnet, NetworkType.goerli, NetworkType.sepolia].forEach(
      (networkType) => {
        describe(`when the provider config in state contains a network type of "${networkType}"`, () => {
          describe('if the network was switched after the net_version request started but before it completed', () => {
            it('stores the network status of the second network, not the first', async () => {
              await withController(
                {
                  state: {
                    providerConfig: buildProviderConfig({ type: networkType }),
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
                          method: 'net_version',
                        },
                        response: SUCCESSFUL_NET_VERSION_RESPONSE,
                      },
                      {
                        request: {
                          method: 'eth_getBlockByNumber',
                        },
                        response: SUCCESSFUL_ETH_GET_BLOCK_BY_NUMBER_RESPONSE,
                      },
                      // Called via `lookupNetwork` directly
                      {
                        request: {
                          method: 'net_version',
                        },
                        response: SUCCESSFUL_NET_VERSION_RESPONSE,
                        beforeCompleting: () => {
                          // Intentionally not awaited because don't want this to
                          // block the `net_version` request
                          controller.setActiveNetwork(
                            'testNetworkConfigurationId',
                          );
                        },
                      },
                      {
                        request: {
                          method: 'eth_getBlockByNumber',
                        },
                        response: SUCCESSFUL_ETH_GET_BLOCK_BY_NUMBER_RESPONSE,
                      },
                    ]),
                    buildFakeProvider([
                      // Called when switching networks
                      {
                        request: {
                          method: 'net_version',
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
                    })
                    .mockReturnValue(fakeNetworkClients[0])
                    .calledWith({
                      chainId: toHex(1337),
                      rpcUrl: 'https://mock-rpc-url',
                      type: NetworkClientType.Custom,
                    })
                    .mockReturnValue(fakeNetworkClients[1]);
                  await controller.initializeProvider();
                  expect(controller.state.networkStatus).toBe('available');

                  await waitForStateChanges({
                    messenger,
                    propertyPath: ['networkStatus'],
                    operation: async () => {
                      await controller.lookupNetwork();
                    },
                  });

                  expect(controller.state.networkStatus).toBe('unknown');
                },
              );
            });

            it('stores the ID of the second network, not the first', async () => {
              await withController(
                {
                  state: {
                    providerConfig: buildProviderConfig({ type: networkType }),
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
                          method: 'net_version',
                        },
                        response: {
                          result: '1',
                        },
                      },
                      {
                        request: {
                          method: 'eth_getBlockByNumber',
                        },
                        response: SUCCESSFUL_ETH_GET_BLOCK_BY_NUMBER_RESPONSE,
                      },
                      // Called via `lookupNetwork` directly
                      {
                        request: {
                          method: 'net_version',
                        },
                        response: {
                          result: '1',
                        },
                        beforeCompleting: async () => {
                          // Intentionally not awaited because don't want this to
                          // block the `net_version` request
                          controller.setActiveNetwork(
                            'testNetworkConfigurationId',
                          );
                        },
                      },
                      {
                        request: {
                          method: 'eth_getBlockByNumber',
                        },
                        response: SUCCESSFUL_ETH_GET_BLOCK_BY_NUMBER_RESPONSE,
                      },
                    ]),
                    buildFakeProvider([
                      // Called when switching networks
                      {
                        request: {
                          method: 'net_version',
                        },
                        response: {
                          result: '2',
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
                    })
                    .mockReturnValue(fakeNetworkClients[0])
                    .calledWith({
                      chainId: toHex(1337),
                      rpcUrl: 'https://mock-rpc-url',
                      type: NetworkClientType.Custom,
                    })
                    .mockReturnValue(fakeNetworkClients[1]);
                  await waitForStateChanges({
                    messenger,
                    propertyPath: ['networkId'],
                    operation: async () => {
                      await controller.initializeProvider();
                    },
                  });
                  expect(controller.state.networkId).toBe('1');

                  await waitForStateChanges({
                    messenger,
                    propertyPath: ['networkId'],
                    operation: async () => {
                      await controller.lookupNetwork();
                    },
                  });

                  expect(controller.state.networkId).toBe('2');
                },
              );
            });

            it('stores the EIP-1559 support of the second network, not the first', async () => {
              await withController(
                {
                  state: {
                    providerConfig: buildProviderConfig({ type: networkType }),
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
                          method: 'net_version',
                        },
                        response: {
                          result: '1',
                        },
                      },
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
                          method: 'net_version',
                        },
                        response: {
                          result: '1',
                        },
                        beforeCompleting: () => {
                          // Intentionally not awaited because don't want this to
                          // block the `net_version` request
                          controller.setActiveNetwork(
                            'testNetworkConfigurationId',
                          );
                        },
                      },
                      {
                        request: {
                          method: 'eth_getBlockByNumber',
                        },
                        response: {
                          result: POST_1559_BLOCK,
                        },
                      },
                    ]),
                    buildFakeProvider([
                      // Called when switching networks
                      {
                        request: {
                          method: 'net_version',
                        },
                        response: {
                          result: '2',
                        },
                      },
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
                    })
                    .mockReturnValue(fakeNetworkClients[0])
                    .calledWith({
                      chainId: toHex(1337),
                      rpcUrl: 'https://mock-rpc-url',
                      type: NetworkClientType.Custom,
                    })
                    .mockReturnValue(fakeNetworkClients[1]);
                  await controller.initializeProvider();
                  expect(controller.state.networkDetails).toStrictEqual({
                    EIPS: {
                      1559: true,
                    },
                  });

                  await waitForStateChanges({
                    messenger,
                    propertyPath: ['networkDetails'],
                    operation: async () => {
                      await controller.lookupNetwork();
                    },
                  });

                  expect(controller.state.networkDetails).toStrictEqual({
                    EIPS: {
                      1559: false,
                    },
                  });
                },
              );
            });

            it('emits infuraIsUnblocked, not infuraIsBlocked, assuming that the first network was blocked', async () => {
              await withController(
                {
                  state: {
                    providerConfig: buildProviderConfig({ type: networkType }),
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
                          method: 'net_version',
                        },
                        response: SUCCESSFUL_NET_VERSION_RESPONSE,
                      },
                      {
                        request: {
                          method: 'eth_getBlockByNumber',
                        },
                        response: SUCCESSFUL_ETH_GET_BLOCK_BY_NUMBER_RESPONSE,
                      },
                      // Called via `lookupNetwork` directly
                      {
                        request: {
                          method: 'net_version',
                        },
                        response: SUCCESSFUL_NET_VERSION_RESPONSE,
                        beforeCompleting: () => {
                          // Intentionally not awaited because don't want this to
                          // block the `net_version` request
                          controller.setActiveNetwork(
                            'testNetworkConfigurationId',
                          );
                        },
                      },
                      {
                        request: {
                          method: 'eth_getBlockByNumber',
                        },
                        error: BLOCKED_INFURA_JSON_RPC_ERROR,
                      },
                    ]),
                    buildFakeProvider([
                      // Called when switching networks
                      {
                        request: {
                          method: 'net_version',
                        },
                        response: SUCCESSFUL_NET_VERSION_RESPONSE,
                      },
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
                      type: NetworkClientType.Infura,
                    })
                    .mockReturnValue(fakeNetworkClients[0])
                    .calledWith({
                      chainId: toHex(1337),
                      rpcUrl: 'https://mock-rpc-url',
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
                    propertyPath: ['networkStatus'],
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

          describe('if the network was switched after the eth_getBlockByNumber request started but before it completed', () => {
            it('stores the network status of the second network, not the first', async () => {
              await withController(
                {
                  state: {
                    providerConfig: buildProviderConfig({ type: networkType }),
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
                          method: 'net_version',
                        },
                        response: SUCCESSFUL_NET_VERSION_RESPONSE,
                      },
                      {
                        request: {
                          method: 'eth_getBlockByNumber',
                        },
                        response: SUCCESSFUL_ETH_GET_BLOCK_BY_NUMBER_RESPONSE,
                      },
                      // Called via `lookupNetwork` directly
                      {
                        request: {
                          method: 'net_version',
                        },
                        response: SUCCESSFUL_NET_VERSION_RESPONSE,
                      },
                      {
                        request: {
                          method: 'eth_getBlockByNumber',
                        },
                        response: SUCCESSFUL_ETH_GET_BLOCK_BY_NUMBER_RESPONSE,
                        beforeCompleting: () => {
                          // Intentionally not awaited because don't want this to
                          // block the `net_version` request
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
                          method: 'net_version',
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
                    })
                    .mockReturnValue(fakeNetworkClients[0])
                    .calledWith({
                      chainId: toHex(1337),
                      rpcUrl: 'https://mock-rpc-url',
                      type: NetworkClientType.Custom,
                    })
                    .mockReturnValue(fakeNetworkClients[1]);
                  await controller.initializeProvider();
                  expect(controller.state.networkStatus).toBe('available');

                  await waitForStateChanges({
                    messenger,
                    propertyPath: ['networkStatus'],
                    operation: async () => {
                      await controller.lookupNetwork();
                    },
                  });

                  expect(controller.state.networkStatus).toBe('unknown');
                },
              );
            });

            it('stores the ID of the second network, not the first', async () => {
              await withController(
                {
                  state: {
                    providerConfig: buildProviderConfig({ type: networkType }),
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
                          method: 'net_version',
                        },
                        response: {
                          result: '1',
                        },
                      },
                      {
                        request: {
                          method: 'eth_getBlockByNumber',
                        },
                        response: SUCCESSFUL_ETH_GET_BLOCK_BY_NUMBER_RESPONSE,
                      },
                      // Called via `lookupNetwork` directly
                      {
                        request: {
                          method: 'net_version',
                        },
                        response: {
                          result: '1',
                        },
                      },
                      {
                        request: {
                          method: 'eth_getBlockByNumber',
                        },
                        response: SUCCESSFUL_ETH_GET_BLOCK_BY_NUMBER_RESPONSE,
                        beforeCompleting: async () => {
                          // Intentionally not awaited because don't want this to
                          // block the `net_version` request
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
                          method: 'net_version',
                        },
                        response: {
                          result: '2',
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
                    })
                    .mockReturnValue(fakeNetworkClients[0])
                    .calledWith({
                      chainId: toHex(1337),
                      rpcUrl: 'https://mock-rpc-url',
                      type: NetworkClientType.Custom,
                    })
                    .mockReturnValue(fakeNetworkClients[1]);
                  await waitForStateChanges({
                    messenger,
                    propertyPath: ['networkId'],
                    operation: async () => {
                      await controller.initializeProvider();
                    },
                  });
                  expect(controller.state.networkId).toBe('1');

                  await waitForStateChanges({
                    messenger,
                    propertyPath: ['networkId'],
                    operation: async () => {
                      await controller.lookupNetwork();
                    },
                  });

                  expect(controller.state.networkId).toBe('2');
                },
              );
            });

            it('stores the EIP-1559 support of the second network, not the first', async () => {
              await withController(
                {
                  state: {
                    providerConfig: buildProviderConfig({ type: networkType }),
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
                          method: 'net_version',
                        },
                        response: {
                          result: '1',
                        },
                      },
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
                          method: 'net_version',
                        },
                        response: {
                          result: '1',
                        },
                      },
                      {
                        request: {
                          method: 'eth_getBlockByNumber',
                        },
                        response: {
                          result: POST_1559_BLOCK,
                        },
                        beforeCompleting: () => {
                          // Intentionally not awaited because don't want this to
                          // block the `net_version` request
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
                          method: 'net_version',
                        },
                        response: {
                          result: '2',
                        },
                      },
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
                    })
                    .mockReturnValue(fakeNetworkClients[0])
                    .calledWith({
                      chainId: toHex(1337),
                      rpcUrl: 'https://mock-rpc-url',
                      type: NetworkClientType.Custom,
                    })
                    .mockReturnValue(fakeNetworkClients[1]);
                  await controller.initializeProvider();
                  expect(controller.state.networkDetails).toStrictEqual({
                    EIPS: {
                      1559: true,
                    },
                  });

                  await waitForStateChanges({
                    messenger,
                    propertyPath: ['networkDetails'],
                    operation: async () => {
                      await controller.lookupNetwork();
                    },
                  });

                  expect(controller.state.networkDetails).toStrictEqual({
                    EIPS: {
                      1559: false,
                    },
                  });
                },
              );
            });

            it('emits infuraIsUnblocked, not infuraIsBlocked, assuming that the first network was blocked', async () => {
              await withController(
                {
                  state: {
                    providerConfig: buildProviderConfig({ type: networkType }),
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
                          method: 'net_version',
                        },
                        response: SUCCESSFUL_NET_VERSION_RESPONSE,
                      },
                      {
                        request: {
                          method: 'eth_getBlockByNumber',
                        },
                        response: SUCCESSFUL_ETH_GET_BLOCK_BY_NUMBER_RESPONSE,
                      },
                      // Called via `lookupNetwork` directly
                      {
                        request: {
                          method: 'net_version',
                        },
                        response: SUCCESSFUL_NET_VERSION_RESPONSE,
                      },
                      {
                        request: {
                          method: 'eth_getBlockByNumber',
                        },
                        error: BLOCKED_INFURA_JSON_RPC_ERROR,
                        beforeCompleting: () => {
                          // Intentionally not awaited because don't want this to
                          // block the `net_version` request
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
                          method: 'net_version',
                        },
                        response: SUCCESSFUL_NET_VERSION_RESPONSE,
                      },
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
                      type: NetworkClientType.Infura,
                    })
                    .mockReturnValue(fakeNetworkClients[0])
                    .calledWith({
                      chainId: toHex(1337),
                      rpcUrl: 'https://mock-rpc-url',
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
                    propertyPath: ['networkStatus'],
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
            expectedProviderConfig: buildProviderConfig({ type: networkType }),
            initialState: {
              providerConfig: buildProviderConfig({ type: networkType }),
            },
            operation: async (controller) => {
              await controller.lookupNetwork();
            },
          });
        });
      },
    );

    describe(`when the provider config in state contains a network type of "rpc"`, () => {
      describe('if the network was switched after the net_version request started but before it completed', () => {
        it('stores the network status of the second network, not the first', async () => {
          await withController(
            {
              state: {
                providerConfig: buildProviderConfig({
                  type: NetworkType.rpc,
                  chainId: toHex(1337),
                  rpcUrl: 'https://mock-rpc-url',
                }),
              },
              infuraProjectId: 'some-infura-project-id',
            },
            async ({ controller, messenger }) => {
              const fakeProviders = [
                buildFakeProvider([
                  // Called during provider initialization
                  {
                    request: {
                      method: 'net_version',
                    },
                    response: SUCCESSFUL_NET_VERSION_RESPONSE,
                  },
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                    },
                    response: SUCCESSFUL_ETH_GET_BLOCK_BY_NUMBER_RESPONSE,
                  },
                  // Called via `lookupNetwork` directly
                  {
                    request: {
                      method: 'net_version',
                    },
                    response: SUCCESSFUL_NET_VERSION_RESPONSE,
                    beforeCompleting: () => {
                      // Intentionally not awaited because don't want this to
                      // block the `net_version` request
                      controller.setProviderType(NetworkType.goerli);
                    },
                  },
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                    },
                    response: SUCCESSFUL_ETH_GET_BLOCK_BY_NUMBER_RESPONSE,
                  },
                ]),
                buildFakeProvider([
                  // Called when switching networks
                  {
                    request: {
                      method: 'net_version',
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
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  network: NetworkType.goerli,
                  infuraProjectId: 'some-infura-project-id',
                  type: NetworkClientType.Infura,
                })
                .mockReturnValue(fakeNetworkClients[1]);
              await controller.initializeProvider();
              expect(controller.state.networkStatus).toBe('available');

              await waitForStateChanges({
                messenger,
                propertyPath: ['networkStatus'],
                operation: async () => {
                  await controller.lookupNetwork();
                },
              });

              expect(controller.state.networkStatus).toBe('unknown');
            },
          );
        });

        it('stores the ID of the second network, not the first', async () => {
          await withController(
            {
              state: {
                providerConfig: buildProviderConfig({
                  type: NetworkType.rpc,
                  chainId: toHex(1337),
                  rpcUrl: 'https://mock-rpc-url',
                }),
              },
              infuraProjectId: 'some-infura-project-id',
            },
            async ({ controller, messenger }) => {
              const fakeProviders = [
                buildFakeProvider([
                  // Called during provider initialization
                  {
                    request: {
                      method: 'net_version',
                    },
                    response: {
                      result: '1',
                    },
                  },
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                    },
                    response: SUCCESSFUL_ETH_GET_BLOCK_BY_NUMBER_RESPONSE,
                  },
                  // Called via `lookupNetwork` directly
                  {
                    request: {
                      method: 'net_version',
                    },
                    response: {
                      result: '1',
                    },
                    beforeCompleting: async () => {
                      // Intentionally not awaited because don't want this to
                      // block the `net_version` request
                      controller.setProviderType(NetworkType.goerli);
                    },
                  },
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                    },
                    response: SUCCESSFUL_ETH_GET_BLOCK_BY_NUMBER_RESPONSE,
                  },
                ]),
                buildFakeProvider([
                  // Called when switching networks
                  {
                    request: {
                      method: 'net_version',
                    },
                    response: {
                      result: '2',
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
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  network: NetworkType.goerli,
                  infuraProjectId: 'some-infura-project-id',
                  type: NetworkClientType.Infura,
                })
                .mockReturnValue(fakeNetworkClients[1]);
              await waitForStateChanges({
                messenger,
                propertyPath: ['networkId'],
                operation: async () => {
                  await controller.initializeProvider();
                },
              });
              expect(controller.state.networkId).toBe('1');

              await waitForStateChanges({
                messenger,
                propertyPath: ['networkId'],
                operation: async () => {
                  await controller.lookupNetwork();
                },
              });

              expect(controller.state.networkId).toBe('2');
            },
          );
        });

        it('stores the EIP-1559 support of the second network, not the first', async () => {
          await withController(
            {
              state: {
                providerConfig: buildProviderConfig({
                  type: NetworkType.rpc,
                  chainId: toHex(1337),
                  rpcUrl: 'https://mock-rpc-url',
                }),
              },
              infuraProjectId: 'some-infura-project-id',
            },
            async ({ controller, messenger }) => {
              const fakeProviders = [
                buildFakeProvider([
                  // Called during provider initialization
                  {
                    request: {
                      method: 'net_version',
                    },
                    response: {
                      result: '1',
                    },
                  },
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
                      method: 'net_version',
                    },
                    response: {
                      result: '1',
                    },
                    beforeCompleting: () => {
                      // Intentionally not awaited because don't want this to
                      // block the `net_version` request
                      controller.setProviderType(NetworkType.goerli);
                    },
                  },
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                    },
                    response: {
                      result: POST_1559_BLOCK,
                    },
                  },
                ]),
                buildFakeProvider([
                  // Called when switching networks
                  {
                    request: {
                      method: 'net_version',
                    },
                    response: {
                      result: '2',
                    },
                  },
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
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  network: NetworkType.goerli,
                  infuraProjectId: 'some-infura-project-id',
                  type: NetworkClientType.Infura,
                })
                .mockReturnValue(fakeNetworkClients[1]);
              await controller.initializeProvider();
              expect(controller.state.networkDetails).toStrictEqual({
                EIPS: {
                  1559: true,
                },
              });

              await waitForStateChanges({
                messenger,
                propertyPath: ['networkDetails'],
                operation: async () => {
                  await controller.lookupNetwork();
                },
              });

              expect(controller.state.networkDetails).toStrictEqual({
                EIPS: {
                  1559: false,
                },
              });
            },
          );
        });

        it('emits infuraIsBlocked, not infuraIsUnblocked, if the second network was blocked and the first network was not', async () => {
          await withController(
            {
              state: {
                providerConfig: buildProviderConfig({
                  type: NetworkType.rpc,
                  chainId: toHex(1337),
                  rpcUrl: 'https://mock-rpc-url',
                }),
              },
              infuraProjectId: 'some-infura-project-id',
            },
            async ({ controller, messenger }) => {
              const fakeProviders = [
                buildFakeProvider([
                  // Called during provider initialization
                  {
                    request: {
                      method: 'net_version',
                    },
                    response: SUCCESSFUL_NET_VERSION_RESPONSE,
                  },
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                    },
                    response: SUCCESSFUL_ETH_GET_BLOCK_BY_NUMBER_RESPONSE,
                  },
                  // Called via `lookupNetwork` directly
                  {
                    request: {
                      method: 'net_version',
                    },
                    response: SUCCESSFUL_NET_VERSION_RESPONSE,
                    beforeCompleting: () => {
                      // Intentionally not awaited because don't want this to
                      // block the `net_version` request
                      controller.setProviderType(NetworkType.goerli);
                    },
                  },
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                    },
                    response: SUCCESSFUL_ETH_GET_BLOCK_BY_NUMBER_RESPONSE,
                  },
                ]),
                buildFakeProvider([
                  // Called when switching networks
                  {
                    request: {
                      method: 'net_version',
                    },
                    response: SUCCESSFUL_NET_VERSION_RESPONSE,
                  },
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
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  network: NetworkType.goerli,
                  infuraProjectId: 'some-infura-project-id',
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
                propertyPath: ['networkStatus'],
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

      describe('if the network was switched after the eth_getBlockByNumber request started but before it completed', () => {
        it('stores the network status of the second network, not the first', async () => {
          await withController(
            {
              state: {
                providerConfig: buildProviderConfig({
                  type: NetworkType.rpc,
                  chainId: toHex(1337),
                  rpcUrl: 'https://mock-rpc-url',
                }),
              },
              infuraProjectId: 'some-infura-project-id',
            },
            async ({ controller, messenger }) => {
              const fakeProviders = [
                buildFakeProvider([
                  // Called during provider initialization
                  {
                    request: {
                      method: 'net_version',
                    },
                    response: SUCCESSFUL_NET_VERSION_RESPONSE,
                  },
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                    },
                    response: SUCCESSFUL_ETH_GET_BLOCK_BY_NUMBER_RESPONSE,
                  },
                  // Called via `lookupNetwork` directly
                  {
                    request: {
                      method: 'net_version',
                    },
                    response: SUCCESSFUL_NET_VERSION_RESPONSE,
                  },
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                    },
                    response: SUCCESSFUL_ETH_GET_BLOCK_BY_NUMBER_RESPONSE,
                    beforeCompleting: () => {
                      // Intentionally not awaited because don't want this to
                      // block the `net_version` request
                      controller.setProviderType(NetworkType.goerli);
                    },
                  },
                ]),
                buildFakeProvider([
                  // Called when switching networks
                  {
                    request: {
                      method: 'net_version',
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
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  network: NetworkType.goerli,
                  infuraProjectId: 'some-infura-project-id',
                  type: NetworkClientType.Infura,
                })
                .mockReturnValue(fakeNetworkClients[1]);
              await controller.initializeProvider();
              expect(controller.state.networkStatus).toBe('available');

              await waitForStateChanges({
                messenger,
                propertyPath: ['networkStatus'],
                operation: async () => {
                  await controller.lookupNetwork();
                },
              });

              expect(controller.state.networkStatus).toBe('unknown');
            },
          );
        });

        it('stores the ID of the second network, not the first', async () => {
          await withController(
            {
              state: {
                providerConfig: buildProviderConfig({
                  type: NetworkType.rpc,
                  chainId: toHex(1337),
                  rpcUrl: 'https://mock-rpc-url',
                }),
              },
              infuraProjectId: 'some-infura-project-id',
            },
            async ({ controller, messenger }) => {
              const fakeProviders = [
                buildFakeProvider([
                  // Called during provider initialization
                  {
                    request: {
                      method: 'net_version',
                    },
                    response: {
                      result: '1',
                    },
                  },
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                    },
                    response: SUCCESSFUL_ETH_GET_BLOCK_BY_NUMBER_RESPONSE,
                  },
                  // Called via `lookupNetwork` directly
                  {
                    request: {
                      method: 'net_version',
                    },
                    response: {
                      result: '1',
                    },
                  },
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                    },
                    response: SUCCESSFUL_ETH_GET_BLOCK_BY_NUMBER_RESPONSE,
                    beforeCompleting: async () => {
                      // Intentionally not awaited because don't want this to
                      // block the `net_version` request
                      controller.setProviderType(NetworkType.goerli);
                    },
                  },
                ]),
                buildFakeProvider([
                  // Called when switching networks
                  {
                    request: {
                      method: 'net_version',
                    },
                    response: {
                      result: '2',
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
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  network: NetworkType.goerli,
                  infuraProjectId: 'some-infura-project-id',
                  type: NetworkClientType.Infura,
                })
                .mockReturnValue(fakeNetworkClients[1]);
              await waitForStateChanges({
                messenger,
                propertyPath: ['networkId'],
                operation: async () => {
                  await controller.initializeProvider();
                },
              });
              expect(controller.state.networkId).toBe('1');

              await waitForStateChanges({
                messenger,
                propertyPath: ['networkId'],
                operation: async () => {
                  await controller.lookupNetwork();
                },
              });

              expect(controller.state.networkId).toBe('2');
            },
          );
        });

        it('stores the EIP-1559 support of the second network, not the first', async () => {
          await withController(
            {
              state: {
                providerConfig: buildProviderConfig({
                  type: NetworkType.rpc,
                  chainId: toHex(1337),
                  rpcUrl: 'https://mock-rpc-url',
                }),
              },
              infuraProjectId: 'some-infura-project-id',
            },
            async ({ controller, messenger }) => {
              const fakeProviders = [
                buildFakeProvider([
                  // Called during provider initialization
                  {
                    request: {
                      method: 'net_version',
                    },
                    response: {
                      result: '1',
                    },
                  },
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
                      method: 'net_version',
                    },
                    response: {
                      result: '1',
                    },
                  },
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                    },
                    response: {
                      result: POST_1559_BLOCK,
                    },
                    beforeCompleting: () => {
                      // Intentionally not awaited because don't want this to
                      // block the `net_version` request
                      controller.setProviderType(NetworkType.goerli);
                    },
                  },
                ]),
                buildFakeProvider([
                  // Called when switching networks
                  {
                    request: {
                      method: 'net_version',
                    },
                    response: {
                      result: '2',
                    },
                  },
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
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  network: NetworkType.goerli,
                  infuraProjectId: 'some-infura-project-id',
                  type: NetworkClientType.Infura,
                })
                .mockReturnValue(fakeNetworkClients[1]);
              await controller.initializeProvider();
              expect(controller.state.networkDetails).toStrictEqual({
                EIPS: {
                  1559: true,
                },
              });

              await waitForStateChanges({
                messenger,
                propertyPath: ['networkDetails'],
                operation: async () => {
                  await controller.lookupNetwork();
                },
              });

              expect(controller.state.networkDetails).toStrictEqual({
                EIPS: {
                  1559: false,
                },
              });
            },
          );
        });

        it('emits infuraIsBlocked, not infuraIsUnblocked, if the second network was blocked and the first network was not', async () => {
          await withController(
            {
              state: {
                providerConfig: buildProviderConfig({
                  type: NetworkType.rpc,
                  chainId: toHex(1337),
                  rpcUrl: 'https://mock-rpc-url',
                }),
              },
              infuraProjectId: 'some-infura-project-id',
            },
            async ({ controller, messenger }) => {
              const fakeProviders = [
                buildFakeProvider([
                  // Called during provider initialization
                  {
                    request: {
                      method: 'net_version',
                    },
                    response: SUCCESSFUL_NET_VERSION_RESPONSE,
                  },
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                    },
                    response: SUCCESSFUL_ETH_GET_BLOCK_BY_NUMBER_RESPONSE,
                  },
                  // Called via `lookupNetwork` directly
                  {
                    request: {
                      method: 'net_version',
                    },
                    response: SUCCESSFUL_NET_VERSION_RESPONSE,
                  },
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                    },
                    response: SUCCESSFUL_ETH_GET_BLOCK_BY_NUMBER_RESPONSE,
                    beforeCompleting: () => {
                      // Intentionally not awaited because don't want this to
                      // block the `net_version` request
                      controller.setProviderType(NetworkType.goerli);
                    },
                  },
                ]),
                buildFakeProvider([
                  // Called when switching networks
                  {
                    request: {
                      method: 'net_version',
                    },
                    response: SUCCESSFUL_NET_VERSION_RESPONSE,
                  },
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
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  network: NetworkType.goerli,
                  infuraProjectId: 'some-infura-project-id',
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
                propertyPath: ['networkStatus'],
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
        expectedProviderConfig: buildProviderConfig({ type: NetworkType.rpc }),
        initialState: {
          providerConfig: buildProviderConfig({ type: NetworkType.rpc }),
        },
        operation: async (controller) => {
          await controller.lookupNetwork();
        },
      });
    });
  });

  describe('setProviderType', () => {
    for (const {
      networkType,
      chainId,
      ticker,
      blockExplorerUrl,
    } of INFURA_NETWORKS) {
      describe(`given a network type of "${networkType}"`, () => {
        refreshNetworkTests({
          expectedProviderConfig: buildProviderConfig({
            type: networkType,
          }),
          operation: async (controller) => {
            await controller.setProviderType(networkType);
          },
        });
      });

      it(`overwrites the provider configuration using a predetermined chainId, ticker, and blockExplorerUrl for "${networkType}", clearing id, rpcUrl, and nickname`, async () => {
        await withController(
          {
            state: {
              providerConfig: {
                type: 'rpc',
                rpcUrl: 'https://mock-rpc-url',
                chainId: '0x1337',
                nickname: 'test-chain',
                ticker: 'TEST',
                rpcPrefs: {
                  blockExplorerUrl: 'https://test-block-explorer.com',
                },
              },
            },
          },
          async ({ controller }) => {
            const fakeProvider = buildFakeProvider();
            const fakeNetworkClient = buildFakeClient(fakeProvider);
            mockCreateNetworkClient().mockReturnValue(fakeNetworkClient);

            await controller.setProviderType(networkType);

            expect(controller.state.providerConfig).toStrictEqual({
              type: networkType,
              rpcUrl: undefined,
              chainId,
              ticker,
              nickname: undefined,
              rpcPrefs: { blockExplorerUrl },
              id: undefined,
            });
          },
        );
      });
    }

    describe('given a network type of "rpc"', () => {
      it('throws because there is no way to switch to a custom RPC endpoint using this method', async () => {
        await withController(
          {
            state: {
              providerConfig: {
                type: NetworkType.rpc,
                rpcUrl: 'http://somethingexisting.com',
                chainId: toHex(99999),
                ticker: 'something existing',
                nickname: 'something existing',
              },
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

      it('does not update networkDetails.EIPS in state', async () => {
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

          try {
            // @ts-expect-error Intentionally passing invalid type
            await controller.setProviderType(NetworkType.rpc);
          } catch {
            // catch the rejection (it is tested above)
          }

          expect(controller.state.networkDetails.EIPS[1559]).toBeUndefined();
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
  });

  describe('setActiveNetwork', () => {
    refreshNetworkTests({
      expectedProviderConfig: {
        rpcUrl: 'https://mock-rpc-url',
        chainId: toHex(111),
        ticker: 'TEST',
        nickname: 'something existing',
        id: 'testNetworkConfigurationId',
        rpcPrefs: undefined,
        type: NetworkType.rpc,
      },
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

    describe('if the given ID does not match a network configuration in networkConfigurations', () => {
      it('throws', async () => {
        await withController(
          {
            state: {
              networkConfigurations: {
                testNetworkConfigurationId: {
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(111),
                  ticker: 'TEST',
                  id: 'testNetworkConfigurationId',
                },
              },
            },
          },
          async ({ controller }) => {
            const fakeProvider = buildFakeProvider();
            const fakeNetworkClient = buildFakeClient(fakeProvider);
            mockCreateNetworkClient().mockReturnValue(fakeNetworkClient);

            await expect(() =>
              controller.setActiveNetwork('invalidNetworkConfigurationId'),
            ).rejects.toThrow(
              new Error(
                'networkConfigurationId invalidNetworkConfigurationId does not match a configured networkConfiguration',
              ),
            );
          },
        );
      });
    });

    describe('if the network config does not contain an RPC URL', () => {
      it('throws', async () => {
        await withController(
          // @ts-expect-error RPC URL intentionally omitted
          {
            state: {
              providerConfig: {
                type: NetworkType.rpc,
                rpcUrl: 'https://mock-rpc-url',
                chainId: toHex(111),
                ticker: 'TEST',
                nickname: 'something existing',
                rpcPrefs: undefined,
              },
              networkConfigurations: {
                testNetworkConfigurationId1: {
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(111),
                  ticker: 'TEST',
                  nickname: 'something existing',
                  id: 'testNetworkConfigurationId1',
                  rpcPrefs: undefined,
                },
                testNetworkConfigurationId2: {
                  rpcUrl: undefined,
                  chainId: toHex(222),
                  ticker: 'something existing',
                  nickname: 'something existing',
                  id: 'testNetworkConfigurationId2',
                  rpcPrefs: undefined,
                },
              },
            },
          },
          async ({ controller }) => {
            const fakeProvider = buildFakeProvider();
            const fakeNetworkClient = buildFakeClient(fakeProvider);
            createNetworkClientMock.mockReturnValue(fakeNetworkClient);

            await expect(() =>
              controller.setActiveNetwork('testNetworkConfigurationId2'),
            ).rejects.toThrow(
              'rpcUrl must be provided for custom RPC endpoints',
            );

            expect(createNetworkClientMock).not.toHaveBeenCalled();
            const { provider, blockTracker } =
              controller.getProviderAndBlockTracker();
            expect(provider).toBeUndefined();
            expect(blockTracker).toBeUndefined();
          },
        );
      });
    });

    describe('if the network config does not contain a chain ID', () => {
      it('throws', async () => {
        await withController(
          // @ts-expect-error chain ID intentionally omitted
          {
            state: {
              providerConfig: {
                type: NetworkType.rpc,
                rpcUrl: 'https://mock-rpc-url',
                chainId: toHex(111),
                ticker: 'TEST',
                nickname: 'something existing',
                rpcPrefs: undefined,
              },
              networkConfigurations: {
                testNetworkConfigurationId1: {
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(111),
                  ticker: 'TEST',
                  nickname: 'something existing',
                  id: 'testNetworkConfigurationId1',
                  rpcPrefs: undefined,
                },
                testNetworkConfigurationId2: {
                  rpcUrl: 'http://somethingexisting.com',
                  chainId: undefined,
                  ticker: 'something existing',
                  nickname: 'something existing',
                  id: 'testNetworkConfigurationId2',
                  rpcPrefs: undefined,
                },
              },
            },
          },
          async ({ controller }) => {
            const fakeProvider = buildFakeProvider();
            const fakeNetworkClient = buildFakeClient(fakeProvider);
            createNetworkClientMock.mockReturnValue(fakeNetworkClient);

            await expect(() =>
              controller.setActiveNetwork('testNetworkConfigurationId2'),
            ).rejects.toThrow(
              'chainId must be provided for custom RPC endpoints',
            );

            expect(createNetworkClientMock).not.toHaveBeenCalled();
            const { provider, blockTracker } =
              controller.getProviderAndBlockTracker();
            expect(provider).toBeUndefined();
            expect(blockTracker).toBeUndefined();
          },
        );
      });
    });

    it('overwrites the provider configuration given a networkConfigurationId that matches a configured networkConfiguration', async () => {
      await withController(
        {
          state: {
            networkConfigurations: {
              testNetworkConfigurationId: {
                rpcUrl: 'https://mock-rpc-url',
                chainId: toHex(111),
                ticker: 'TEST',
                nickname: 'something existing',
                id: 'testNetworkConfigurationId',
                rpcPrefs: {
                  blockExplorerUrl: 'https://test-block-explorer-2.com',
                },
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
            })
            .mockReturnValue(fakeNetworkClient);

          await controller.setActiveNetwork('testNetworkConfigurationId');

          expect(controller.state.providerConfig).toStrictEqual({
            type: 'rpc',
            rpcUrl: 'https://mock-rpc-url',
            chainId: toHex(111),
            ticker: 'TEST',
            nickname: 'something existing',
            id: 'testNetworkConfigurationId',
            rpcPrefs: {
              blockExplorerUrl: 'https://test-block-explorer-2.com',
            },
          });
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

    describe('if a provider has been set but networkDetails.EIPS in state already has a "1559" property', () => {
      it('does not make any state changes', async () => {
        await withController(
          {
            state: {
              networkDetails: {
                EIPS: {
                  1559: true,
                },
              },
            },
          },
          async ({ controller, messenger }) => {
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
              networkDetails: {
                EIPS: {
                  1559: true,
                },
              },
            },
          },
          async ({ controller }) => {
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

    describe('if a provider has been set and networkDetails.EIPS in state does not already have a "1559" property', () => {
      describe('if the request for the latest block is successful', () => {
        describe('if the latest block has a "baseFeePerGas" property', () => {
          it('sets the "1559" property to true', async () => {
            await withController(async ({ controller }) => {
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

              expect(controller.state.networkDetails.EIPS[1559]).toBe(true);
            });
          });

          it('returns true', async () => {
            await withController(async ({ controller }) => {
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

              expect(controller.state.networkDetails.EIPS[1559]).toBe(false);
            });
          });

          it('returns false', async () => {
            await withController(async ({ controller }) => {
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
          it('sets the "1559" property to false', async () => {
            await withController(async ({ controller }) => {
              setFakeProvider(controller, {
                stubs: [
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                      params: ['latest', false],
                    },
                    response: {
                      result: null,
                    },
                  },
                ],
                stubLookupNetworkWhileSetting: true,
              });

              await controller.getEIP1559Compatibility();

              expect(controller.state.networkDetails.EIPS[1559]).toBe(false);
            });
          });

          it('returns false', async () => {
            await withController(async ({ controller }) => {
              setFakeProvider(controller, {
                stubs: [
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                      params: ['latest', false],
                    },
                    response: {
                      result: null,
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
      });

      describe('if the request for the latest block is unsuccessful', () => {
        it('does not make any state changes', async () => {
          await withController(async ({ controller, messenger }) => {
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
        describe(`when the type in the provider configuration is "${networkType}"`, () => {
          refreshNetworkTests({
            expectedProviderConfig: buildProviderConfig({ type: networkType }),
            initialState: {
              providerConfig: buildProviderConfig({ type: networkType }),
            },
            operation: async (controller) => {
              await controller.resetConnection();
            },
          });
        });
      },
    );

    describe(`when the type in the provider configuration is "rpc"`, () => {
      refreshNetworkTests({
        expectedProviderConfig: buildProviderConfig({ type: NetworkType.rpc }),
        initialState: {
          providerConfig: buildProviderConfig({ type: NetworkType.rpc }),
        },
        operation: async (controller) => {
          await controller.resetConnection();
        },
      });
    });
  });

  describe('NetworkController:getProviderConfig action', () => {
    it('returns the provider config in state', async () => {
      await withController(
        {
          state: {
            providerConfig: {
              type: NetworkType.mainnet,
              ...BUILT_IN_NETWORKS.mainnet,
            },
          },
        },
        async ({ messenger }) => {
          const providerConfig = await messenger.call(
            'NetworkController:getProviderConfig',
          );

          expect(providerConfig).toStrictEqual({
            type: NetworkType.mainnet,
            ...BUILT_IN_NETWORKS.mainnet,
          });
        },
      );
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

            const networkClientsById = controller.getNetworkClientsById();
            expect(Object.keys(networkClientsById)).toHaveLength(4);
            expect(networkClientsById).toMatchObject({
              'custom||AAAA-AAAA-AAAA-AAAA': expect.objectContaining({
                configuration: {
                  chainId: toHex(111),
                  rpcUrl: 'https://test.network',
                  type: NetworkClientType.Custom,
                },
              }),
            });
          },
        );
      });

      describe('if the setActive option is not given', () => {
        it('does not update the provider config to the new network configuration by default', async () => {
          const originalProvider = {
            type: NetworkType.rpc,
            rpcUrl: 'https://mock-rpc-url',
            chainId: toHex(111),
            ticker: 'TICKER',
            id: 'testNetworkConfigurationId',
          };

          await withController(
            {
              state: {
                providerConfig: originalProvider,
              },
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

              expect(controller.state.providerConfig).toStrictEqual(
                originalProvider,
              );
            },
          );
        });

        it('does not set the new network to active by default', async () => {
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
              const { result } = await promisify(provider.sendAsync).call(
                provider,
                {
                  id: 1,
                  jsonrpc: '2.0',
                  method: 'test_method',
                  params: [],
                },
              );
              expect(result).toBe('test response from built-in network');
            },
          );
        });
      });

      describe('if the setActive option is false', () => {
        it('does not update the provider config to the new network configuration by default', async () => {
          const originalProvider = {
            type: NetworkType.rpc,
            rpcUrl: 'https://mock-rpc-url',
            chainId: toHex(111),
            ticker: 'TICKER',
            id: 'testNetworkConfigurationId',
          };

          await withController(
            {
              state: {
                providerConfig: originalProvider,
              },
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
                  setActive: false,
                  referrer: 'https://test-dapp.com',
                  source: 'dapp',
                },
              );

              expect(controller.state.providerConfig).toStrictEqual(
                originalProvider,
              );
            },
          );
        });

        it('does not set the new network to active by default', async () => {
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
              const { result } = await promisify(provider.sendAsync).call(
                provider,
                {
                  id: 1,
                  jsonrpc: '2.0',
                  method: 'test_method',
                  params: [],
                },
              );
              expect(result).toBe('test response from built-in network');
            },
          );
        });
      });

      describe('if the setActive option is true', () => {
        it('updates the provider config to the new network configuration', async () => {
          await withController(async ({ controller }) => {
            uuidV4Mock.mockReturnValue('AAAA-AAAA-AAAA-AAAA');
            const newCustomNetworkClient = buildFakeClient();
            mockCreateNetworkClientWithDefaultsForBuiltInNetworkClients()
              .calledWith({
                chainId: toHex(111),
                rpcUrl: 'https://test.network',
                type: NetworkClientType.Custom,
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

            expect(controller.state.providerConfig).toStrictEqual({
              type: NetworkType.rpc,
              rpcUrl: 'https://test.network',
              chainId: toHex(111),
              ticker: 'TICKER',
              nickname: 'test network',
              rpcPrefs: {
                blockExplorerUrl: 'https://some.chainscan.io',
              },
              id: 'AAAA-AAAA-AAAA-AAAA',
            });
          });
        });

        refreshNetworkTests({
          expectedProviderConfig: {
            type: NetworkType.rpc,
            rpcUrl: 'https://some.other.network',
            chainId: toHex(222),
            ticker: 'TICKER2',
            id: 'BBBB-BBBB-BBBB-BBBB',
            nickname: undefined,
            rpcPrefs: undefined,
          },
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
                  })
                  .mockReturnValue(newCustomNetworkClient);
                const networkClientToDestroy = Object.values(
                  controller.getNetworkClientsById(),
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

                const networkClientsById = controller.getNetworkClientsById();
                expect(networkClientToDestroy.destroy).toHaveBeenCalled();
                expect(Object.keys(networkClientsById)).toHaveLength(4);
                expect(networkClientsById).not.toMatchObject({
                  [`custom||0x111|${oldRpcUrl}`]: expect.objectContaining({
                    configuration: {
                      chainId: toHex(111),
                      rpcUrl: oldRpcUrl,
                      type: NetworkClientType.Custom,
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

                const networkClientsById = controller.getNetworkClientsById();
                expect(Object.keys(networkClientsById)).toHaveLength(4);
                expect(networkClientsById).toMatchObject({
                  'custom||AAAA-AAAA-AAAA-AAAA':
                    expect.objectContaining({
                      configuration: {
                        chainId: toHex(999),
                        rpcUrl: newRpcUrl,
                        type: NetworkClientType.Custom,
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
                  })
                  .mockReturnValue(newCustomNetworkClient);
                const networkClientsBefore = controller.getNetworkClientsById();

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

                const networkClientsAfter = controller.getNetworkClientsById();
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
              })
              .mockReturnValue(buildFakeClient());
            const networkClientToDestroy = Object.values(
              controller.getNetworkClientsById(),
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
            expect(controller.getNetworkClientsById()).not.toMatchObject({
              [`custom||${toHex(111)}||https://test.network`]:
                expect.objectContaining({
                  configuration: {
                    chainId: toHex(111),
                    rpcUrl: 'https://test.network',
                    type: NetworkClientType.Custom,
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
          const networkClientsById = controller.getNetworkClientsById();

          try {
            controller.removeNetworkConfiguration('NONEXISTENT');
          } catch {
            // ignore error (it is tested elsewhere)
          }

          expect(controller.getNetworkClientsById()).toStrictEqual(
            networkClientsById,
          );
        });
      });
    });
  });

  describe('rollbackToPreviousProvider', () => {
    describe('if a provider has not been set', () => {
      [NetworkType.mainnet, NetworkType.goerli, NetworkType.sepolia].forEach(
        (networkType) => {
          describe(`when the type in the provider configuration is "${networkType}"`, () => {
            refreshNetworkTests({
              expectedProviderConfig: buildProviderConfig({
                type: networkType,
              }),
              initialState: {
                providerConfig: buildProviderConfig({ type: networkType }),
              },
              operation: async (controller) => {
                await controller.rollbackToPreviousProvider();
              },
            });
          });
        },
      );

      describe(`when the type in the provider configuration is "rpc"`, () => {
        refreshNetworkTests({
          expectedProviderConfig: buildProviderConfig({
            type: NetworkType.rpc,
          }),
          initialState: {
            providerConfig: buildProviderConfig({ type: NetworkType.rpc }),
          },
          operation: async (controller) => {
            await controller.rollbackToPreviousProvider();
          },
        });
      });
    });

    describe('if a provider has been set', () => {
      for (const { networkType } of INFURA_NETWORKS) {
        describe(`if the previous provider configuration had a type of "${networkType}"`, () => {
          it('emits networkWillChange', async () => {
            await withController(
              {
                state: {
                  providerConfig: buildProviderConfig({
                    type: networkType,
                  }),
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
                  operation: () => {
                    // Intentionally not awaited because we're capturing an event
                    // emitted partway through the operation
                    controller.rollbackToPreviousProvider();
                  },
                });

                await expect(networkWillChange).toBeFulfilled();
              },
            );
          });

          it('emits networkDidChange', async () => {
            await withController(
              {
                state: {
                  providerConfig: buildProviderConfig({
                    type: networkType,
                  }),
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
                  operation: () => {
                    // Intentionally not awaited because we're capturing an event
                    // emitted partway through the operation
                    controller.rollbackToPreviousProvider();
                  },
                });

                await expect(networkDidChange).toBeFulfilled();
              },
            );
          });

          it('overwrites the the current provider configuration with the previous provider configuration', async () => {
            await withController(
              {
                state: {
                  providerConfig: buildProviderConfig({
                    type: networkType,
                  }),
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
                const fakeProviders = [
                  buildFakeProvider(),
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
                  })
                  .mockReturnValue(fakeNetworkClients[0])
                  .calledWith({
                    network: networkType,
                    infuraProjectId: 'some-infura-project-id',
                    type: NetworkClientType.Infura,
                  })
                  .mockReturnValue(fakeNetworkClients[1]);
                await controller.setActiveNetwork('testNetworkConfiguration');
                expect(controller.state.providerConfig).toStrictEqual({
                  type: 'rpc',
                  id: 'testNetworkConfiguration',
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(1337),
                  ticker: 'TEST',
                  nickname: 'test network',
                  rpcPrefs: {
                    blockExplorerUrl: 'https://test-block-explorer.com',
                  },
                });

                await controller.rollbackToPreviousProvider();

                expect(controller.state.providerConfig).toStrictEqual(
                  buildProviderConfig({
                    type: networkType,
                  }),
                );
              },
            );
          });

          it('resets the network status to "unknown" before updating the provider', async () => {
            await withController(
              {
                state: {
                  providerConfig: buildProviderConfig({
                    type: networkType,
                  }),
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
                        method: 'net_version',
                      },
                      response: SUCCESSFUL_NET_VERSION_RESPONSE,
                    },
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
                  })
                  .mockReturnValue(fakeNetworkClients[0])
                  .calledWith({
                    network: networkType,
                    infuraProjectId: 'some-infura-project-id',
                    type: NetworkClientType.Infura,
                  })
                  .mockReturnValue(fakeNetworkClients[1]);
                await controller.setActiveNetwork('testNetworkConfiguration');
                expect(controller.state.networkStatus).toBe('available');

                await waitForStateChanges({
                  messenger,
                  propertyPath: ['networkStatus'],
                  // We only care about the first state change, because it
                  // happens before networkDidChange
                  count: 1,
                  operation: () => {
                    // Intentionally not awaited because we want to check state
                    // while this operation is in-progress
                    controller.rollbackToPreviousProvider();
                  },
                  beforeResolving: () => {
                    expect(controller.state.networkStatus).toBe('unknown');
                  },
                });
              },
            );
          });

          it('clears EIP-1559 support for the network from state before updating the provider', async () => {
            await withController(
              {
                state: {
                  providerConfig: buildProviderConfig({
                    type: networkType,
                  }),
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
                        result: POST_1559_BLOCK,
                      },
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
                  })
                  .mockReturnValue(fakeNetworkClients[0])
                  .calledWith({
                    network: networkType,
                    infuraProjectId: 'some-infura-project-id',
                    type: NetworkClientType.Infura,
                  })
                  .mockReturnValue(fakeNetworkClients[1]);
                await controller.setActiveNetwork('testNetworkConfiguration');
                expect(controller.state.networkDetails).toStrictEqual({
                  EIPS: {
                    1559: true,
                  },
                });

                await waitForStateChanges({
                  messenger,
                  propertyPath: ['networkDetails'],
                  // We only care about the first state change, because it
                  // happens before networkDidChange
                  count: 1,
                  operation: () => {
                    // Intentionally not awaited because we want to check state
                    // while this operation is in-progress
                    controller.rollbackToPreviousProvider();
                  },
                  beforeResolving: () => {
                    expect(controller.state.networkDetails).toStrictEqual({
                      EIPS: {},
                    });
                  },
                });
              },
            );
          });

          it(`initializes a provider pointed to the "${networkType}" Infura network`, async () => {
            await withController(
              {
                state: {
                  providerConfig: buildProviderConfig({
                    type: networkType,
                  }),
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
                  })
                  .mockReturnValue(fakeNetworkClients[0])
                  .calledWith({
                    network: networkType,
                    infuraProjectId: 'some-infura-project-id',
                    type: NetworkClientType.Infura,
                  })
                  .mockReturnValue(fakeNetworkClients[1]);
                await controller.setActiveNetwork('testNetworkConfiguration');

                await controller.rollbackToPreviousProvider();

                const { provider } = controller.getProviderAndBlockTracker();
                assert(provider, 'Provider is somehow unset');
                const promisifiedSendAsync = promisify(provider.sendAsync).bind(
                  provider,
                );
                const response = await promisifiedSendAsync({
                  id: '1',
                  jsonrpc: '2.0',
                  method: 'test',
                });
                expect(response.result).toBe('test response');
              },
            );
          });

          it('replaces the provider object underlying the provider proxy without creating a new instance of the proxy itself', async () => {
            await withController(
              {
                state: {
                  providerConfig: buildProviderConfig({
                    type: networkType,
                  }),
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
                  })
                  .mockReturnValue(fakeNetworkClients[0])
                  .calledWith({
                    network: networkType,
                    infuraProjectId: 'some-infura-project-id',
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
                  providerConfig: buildProviderConfig({
                    type: networkType,
                  }),
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
                  })
                  .mockReturnValue(fakeNetworkClients[0])
                  .calledWith({
                    network: networkType,
                    infuraProjectId: 'some-infura-project-id',
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

                await expect(
                  promiseForNoInfuraIsUnblockedEvents,
                ).toBeFulfilled();
                await expect(promiseForInfuraIsBlocked).toBeFulfilled();
              },
            );
          });

          it('checks the status of the previous network again and updates state accordingly', async () => {
            await withController(
              {
                state: {
                  providerConfig: buildProviderConfig({
                    type: networkType,
                  }),
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
                        method: 'net_version',
                      },
                      error: ethErrors.rpc.methodNotFound(),
                    },
                  ]),
                  buildFakeProvider([
                    {
                      request: {
                        method: 'net_version',
                      },
                      response: SUCCESSFUL_NET_VERSION_RESPONSE,
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
                  })
                  .mockReturnValue(fakeNetworkClients[0])
                  .calledWith({
                    network: networkType,
                    infuraProjectId: 'some-infura-project-id',
                    type: NetworkClientType.Infura,
                  })
                  .mockReturnValue(fakeNetworkClients[1]);
                await controller.setActiveNetwork('testNetworkConfiguration');
                expect(controller.state.networkStatus).toBe('unavailable');

                await waitForStateChanges({
                  messenger,
                  propertyPath: ['networkStatus'],
                  operation: async () => {
                    await controller.rollbackToPreviousProvider();
                  },
                });
                expect(controller.state.networkStatus).toBe('available');
              },
            );
          });

          it('checks whether the previous network supports EIP-1559 again and updates state accordingly', async () => {
            await withController(
              {
                state: {
                  providerConfig: buildProviderConfig({
                    type: networkType,
                  }),
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
                  })
                  .mockReturnValue(fakeNetworkClients[0])
                  .calledWith({
                    network: networkType,
                    infuraProjectId: 'some-infura-project-id',
                    type: NetworkClientType.Infura,
                  })
                  .mockReturnValue(fakeNetworkClients[1]);
                await controller.setActiveNetwork('testNetworkConfiguration');
                expect(controller.state.networkDetails).toStrictEqual({
                  EIPS: {
                    1559: false,
                  },
                });

                await waitForStateChanges({
                  messenger,
                  propertyPath: ['networkDetails'],
                  // rollbackToPreviousProvider clears networkDetails first, and
                  // then updates it to what we expect it to be
                  count: 2,
                  operation: async () => {
                    await controller.rollbackToPreviousProvider();
                  },
                });
                expect(controller.state.networkDetails).toStrictEqual({
                  EIPS: {
                    1559: true,
                  },
                });
              },
            );
          });
        });
      }

      describe(`if the previous provider configuration had a type of "rpc"`, () => {
        it('emits networkWillChange', async () => {
          await withController(
            {
              state: {
                providerConfig: buildProviderConfig({
                  type: NetworkType.rpc,
                }),
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
                operation: () => {
                  // Intentionally not awaited because we're capturing an event
                  // emitted partway through the operation
                  controller.rollbackToPreviousProvider();
                },
              });

              await expect(networkWillChange).toBeFulfilled();
            },
          );
        });

        it('emits networkDidChange', async () => {
          await withController(
            {
              state: {
                providerConfig: buildProviderConfig({
                  type: NetworkType.rpc,
                }),
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
                operation: () => {
                  // Intentionally not awaited because we're capturing an event
                  // emitted partway through the operation
                  controller.rollbackToPreviousProvider();
                },
              });

              await expect(networkDidChange).toBeFulfilled();
            },
          );
        });

        it('overwrites the the current provider configuration with the previous provider configuration', async () => {
          await withController(
            {
              state: {
                providerConfig: buildProviderConfig({
                  type: NetworkType.rpc,
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(1337),
                  nickname: 'network',
                  ticker: 'TEST',
                  rpcPrefs: {
                    blockExplorerUrl: 'https://test-block-explorer.com',
                  },
                }),
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
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(1337),
                  type: NetworkClientType.Custom,
                })
                .mockReturnValue(fakeNetworkClients[1]);
              await controller.setProviderType('goerli');
              expect(controller.state.providerConfig).toStrictEqual({
                type: 'goerli',
                rpcUrl: undefined,
                chainId: toHex(5),
                ticker: 'GoerliETH',
                nickname: undefined,
                rpcPrefs: {
                  blockExplorerUrl: 'https://goerli.etherscan.io',
                },
                id: undefined,
              });

              await controller.rollbackToPreviousProvider();
              expect(controller.state.providerConfig).toStrictEqual(
                buildProviderConfig({
                  type: 'rpc',
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(1337),
                  nickname: 'network',
                  ticker: 'TEST',
                  rpcPrefs: {
                    blockExplorerUrl: 'https://test-block-explorer.com',
                  },
                }),
              );
            },
          );
        });

        it('resets the network state to "unknown" before updating the provider', async () => {
          await withController(
            {
              state: {
                providerConfig: buildProviderConfig({
                  type: NetworkType.rpc,
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(1337),
                }),
              },
              infuraProjectId: 'some-infura-project-id',
            },
            async ({ controller, messenger }) => {
              const fakeProviders = [
                buildFakeProvider([
                  {
                    request: {
                      method: 'net_version',
                    },
                    response: SUCCESSFUL_NET_VERSION_RESPONSE,
                  },
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
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(1337),
                  type: NetworkClientType.Custom,
                })
                .mockReturnValue(fakeNetworkClients[1]);
              await controller.setProviderType('goerli');
              expect(controller.state.networkStatus).toBe('available');

              await waitForStateChanges({
                messenger,
                propertyPath: ['networkStatus'],
                // We only care about the first state change, because it
                // happens before networkDidChange
                count: 1,
                operation: () => {
                  // Intentionally not awaited because we want to check state
                  // while this operation is in-progress
                  controller.rollbackToPreviousProvider();
                },
                beforeResolving: () => {
                  expect(controller.state.networkStatus).toBe('unknown');
                },
              });
            },
          );
        });

        it('clears EIP-1559 support for the network from state before updating the provider', async () => {
          await withController(
            {
              state: {
                providerConfig: buildProviderConfig({
                  type: NetworkType.rpc,
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(1337),
                }),
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
                      result: POST_1559_BLOCK,
                    },
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
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(1337),
                  type: NetworkClientType.Custom,
                })
                .mockReturnValue(fakeNetworkClients[1]);
              await controller.setProviderType('goerli');
              expect(controller.state.networkDetails).toStrictEqual({
                EIPS: {
                  1559: true,
                },
              });

              await waitForStateChanges({
                messenger,
                propertyPath: ['networkDetails'],
                // We only care about the first state change, because it
                // happens before networkDidChange
                count: 1,
                operation: () => {
                  // Intentionally not awaited because we want to check state
                  // while this operation is in-progress
                  controller.rollbackToPreviousProvider();
                },
                beforeResolving: () => {
                  expect(controller.state.networkDetails).toStrictEqual({
                    EIPS: {},
                  });
                },
              });
            },
          );
        });

        it('initializes a provider pointed to the given RPC URL', async () => {
          await withController(
            {
              state: {
                providerConfig: buildProviderConfig({
                  type: NetworkType.rpc,
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(1337),
                }),
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
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(1337),
                  type: NetworkClientType.Custom,
                })
                .mockReturnValue(fakeNetworkClients[1]);
              await controller.setProviderType('goerli');

              await controller.rollbackToPreviousProvider();

              const { provider } = controller.getProviderAndBlockTracker();
              assert(provider, 'Provider is somehow unset');
              const promisifiedSendAsync = promisify(provider.sendAsync).bind(
                provider,
              );
              const response = await promisifiedSendAsync({
                id: '1',
                jsonrpc: '2.0',
                method: 'test',
              });
              expect(response.result).toBe('test response');
            },
          );
        });

        it('replaces the provider object underlying the provider proxy without creating a new instance of the proxy itself', async () => {
          await withController(
            {
              state: {
                providerConfig: buildProviderConfig({
                  type: NetworkType.rpc,
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(1337),
                }),
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
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(1337),
                  type: NetworkClientType.Custom,
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
                providerConfig: buildProviderConfig({
                  type: NetworkType.rpc,
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(1337),
                }),
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
                  type: NetworkClientType.Infura,
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(1337),
                  type: NetworkClientType.Custom,
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
                providerConfig: buildProviderConfig({
                  type: NetworkType.rpc,
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(1337),
                }),
              },
              infuraProjectId: 'some-infura-project-id',
            },
            async ({ controller }) => {
              const fakeProviders = [
                buildFakeProvider([
                  {
                    request: {
                      method: 'net_version',
                    },
                    error: ethErrors.rpc.methodNotFound(),
                  },
                ]),
                buildFakeProvider([
                  {
                    request: {
                      method: 'net_version',
                    },
                    response: SUCCESSFUL_NET_VERSION_RESPONSE,
                  },
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
                  type: NetworkClientType.Infura,
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(1337),
                  type: NetworkClientType.Custom,
                })
                .mockReturnValue(fakeNetworkClients[1]);
              await controller.setProviderType('goerli');
              expect(controller.state.networkStatus).toBe('unavailable');

              await controller.rollbackToPreviousProvider();
              expect(controller.state.networkStatus).toBe('available');
            },
          );
        });

        it('checks whether the previous network supports EIP-1559 again and updates state accordingly', async () => {
          await withController(
            {
              state: {
                providerConfig: buildProviderConfig({
                  type: NetworkType.rpc,
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(1337),
                }),
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
                  type: NetworkClientType.Infura,
                })
                .mockReturnValue(fakeNetworkClients[0])
                .calledWith({
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: toHex(1337),
                  type: NetworkClientType.Custom,
                })
                .mockReturnValue(fakeNetworkClients[1]);
              await controller.setProviderType('goerli');
              expect(controller.state.networkDetails).toStrictEqual({
                EIPS: {
                  1559: false,
                },
              });

              await controller.rollbackToPreviousProvider();
              expect(controller.state.networkDetails).toStrictEqual({
                EIPS: {
                  1559: true,
                },
              });
            },
          );
        });
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
    })
    .mockReturnValue(builtInNetworkClient)
    .calledWith({
      network: NetworkType.goerli,
      infuraProjectId,
      type: NetworkClientType.Infura,
    })
    .mockReturnValue(builtInNetworkClient)
    .calledWith({
      network: NetworkType.sepolia,
      infuraProjectId,
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
 * @param args.expectedProviderConfig - The provider configuration that the
 * operation is expected to set.
 * @param args.initialState - The initial state of the network controller.
 * @param args.operation - The operation to test.
 */
function refreshNetworkTests({
  expectedProviderConfig,
  initialState,
  operation,
}: {
  expectedProviderConfig: ProviderConfig;
  initialState?: Partial<NetworkState>;
  operation: (controller: NetworkController) => Promise<void>;
}) {
  it('emits networkWillChange', async () => {
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
          operation: () => {
            // Intentionally not awaited because we're capturing an event
            // emitted partway through the operation
            operation(controller);
          },
        });

        await expect(networkWillChange).toBeFulfilled();
      },
    );
  });

  it('emits networkDidChange', async () => {
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
          operation: () => {
            // Intentionally not awaited because we're capturing an event
            // emitted partway through the operation
            operation(controller);
          },
        });

        await expect(networkDidChange).toBeFulfilled();
      },
    );
  });

  it('clears network id from state', async () => {
    await withController(
      {
        infuraProjectId: 'infura-project-id',
        state: initialState,
      },
      async ({ controller, messenger }) => {
        const fakeProvider = buildFakeProvider([
          // Called during provider initialization
          {
            request: {
              method: 'net_version',
            },
            response: {
              result: '1',
            },
          },
          // Called during network lookup after resetting connection.
          // Delayed to ensure that we can check the network id
          // before this resolves.
          {
            delay: 1,
            request: {
              method: 'eth_getBlockByNumber',
            },
            response: {
              result: '0x1',
            },
          },
        ]);
        const fakeNetworkClient = buildFakeClient(fakeProvider);
        createNetworkClientMock.mockReturnValue(fakeNetworkClient);
        await controller.initializeProvider();
        expect(controller.state.networkId).toBe('1');

        await waitForStateChanges({
          messenger,
          propertyPath: ['networkDetails'],
          // We only care about the first state change, because it
          // happens before the network lookup
          count: 1,
          operation: () => {
            // Intentionally not awaited because we want to check state
            // partway through the operation
            operation(controller);
          },
        });

        expect(controller.state.networkId).toBeNull();
      },
    );
  });

  it('clears network status from state', async () => {
    await withController(
      {
        infuraProjectId: 'infura-project-id',
        state: initialState,
      },
      async ({ controller, messenger }) => {
        const fakeProvider = buildFakeProvider([
          // Called during provider initialization
          {
            request: {
              method: 'net_version',
            },
            response: SUCCESSFUL_NET_VERSION_RESPONSE,
          },
          {
            request: {
              method: 'eth_getBlockByNumber',
            },
            response: SUCCESSFUL_ETH_GET_BLOCK_BY_NUMBER_RESPONSE,
          },
          // Called during network lookup after resetting connection.
          // Delayed to ensure that we can check the network status
          // before this resolves.
          {
            delay: 1,
            request: {
              method: 'net_version',
            },
            response: SUCCESSFUL_NET_VERSION_RESPONSE,
          },
          {
            delay: 1,
            request: {
              method: 'eth_getBlockByNumber',
            },
            response: SUCCESSFUL_ETH_GET_BLOCK_BY_NUMBER_RESPONSE,
          },
        ]);
        const fakeNetworkClient = buildFakeClient(fakeProvider);
        createNetworkClientMock.mockReturnValue(fakeNetworkClient);
        await controller.initializeProvider();
        expect(controller.state.networkStatus).toBe(NetworkStatus.Available);

        await waitForStateChanges({
          messenger,
          propertyPath: ['networkStatus'],
          // We only care about the first state change, because it
          // happens before the network lookup
          count: 1,
          operation: () => {
            // Intentionally not awaited because we want to check state
            // partway through the operation
            operation(controller);
          },
        });

        expect(controller.state.networkStatus).toBe(NetworkStatus.Unknown);
      },
    );
  });

  it('clears network details from state', async () => {
    await withController(
      {
        infuraProjectId: 'infura-project-id',
        state: initialState,
      },
      async ({ controller, messenger }) => {
        const fakeProvider = buildFakeProvider([
          // Called during provider initialization
          {
            request: {
              method: 'eth_getBlockByNumber',
            },
            response: {
              result: '0x1',
            },
          },
          // Called during network lookup after resetting connection.
          // Delayed to ensure that we can check the network details
          // before this resolves.
          {
            delay: 1,
            request: {
              method: 'eth_getBlockByNumber',
            },
            response: {
              result: '0x1',
            },
          },
        ]);
        const fakeNetworkClient = buildFakeClient(fakeProvider);
        createNetworkClientMock.mockReturnValue(fakeNetworkClient);
        await controller.initializeProvider();
        expect(controller.state.networkDetails).toStrictEqual({
          EIPS: {
            1559: false,
          },
        });

        await waitForStateChanges({
          messenger,
          propertyPath: ['networkDetails'],
          // We only care about the first state change, because it
          // happens before the network lookup
          count: 1,
          operation: () => {
            // Intentionally not awaited because we want to check state
            // partway through the operation
            operation(controller);
          },
        });

        expect(controller.state.networkDetails).toStrictEqual({
          EIPS: {},
        });
      },
    );
  });

  if (expectedProviderConfig.type === NetworkType.rpc) {
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
            chainId: expectedProviderConfig.chainId,
            rpcUrl: expectedProviderConfig.rpcUrl,
            type: NetworkClientType.Custom,
          });
          const { provider } = controller.getProviderAndBlockTracker();
          assert(provider);
          const promisifiedSendAsync = promisify(provider.sendAsync).bind(
            provider,
          );
          const chainIdResult = await promisifiedSendAsync({
            id: 1,
            jsonrpc: '2.0',
            method: 'eth_chainId',
            params: [],
          });
          expect(chainIdResult.result).toBe(toHex(111));
        },
      );
    });
  } else {
    it(`sets the provider to an Infura provider pointed to ${expectedProviderConfig.type}`, async () => {
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
            network: expectedProviderConfig.type,
            infuraProjectId: 'infura-project-id',
            type: NetworkClientType.Infura,
          });
          const { provider } = controller.getProviderAndBlockTracker();
          assert(provider);
          const promisifiedSendAsync = promisify(provider.sendAsync).bind(
            provider,
          );
          const chainIdResult = await promisifiedSendAsync({
            id: 1,
            jsonrpc: '2.0',
            method: 'eth_chainId',
            params: [],
          });
          expect(chainIdResult.result).toBe(toHex(1337));
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
        const initializationNetworkClientOptions: Parameters<
          typeof createNetworkClient
        >[0] =
          controller.state.providerConfig.type === NetworkType.rpc
            ? {
                chainId: toHex(controller.state.providerConfig.chainId),
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                rpcUrl: controller.state.providerConfig.rpcUrl!,
                type: NetworkClientType.Custom,
              }
            : {
                network: controller.state.providerConfig.type,
                infuraProjectId: 'infura-project-id',
                type: NetworkClientType.Infura,
              };
        const operationNetworkClientOptions: Parameters<
          typeof createNetworkClient
        >[0] =
          expectedProviderConfig.type === NetworkType.rpc
            ? {
                chainId: toHex(expectedProviderConfig.chainId),
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                rpcUrl: expectedProviderConfig.rpcUrl!,
                type: NetworkClientType.Custom,
              }
            : {
                network: expectedProviderConfig.type,
                infuraProjectId: 'infura-project-id',
                type: NetworkClientType.Infura,
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

  lookupNetworkTests({ expectedProviderConfig, initialState, operation });
}

/**
 * Test an operation that performs a `lookupNetwork` call with the given
 * provider configuration. All effects of the `lookupNetwork` call should be
 * covered by these tests.
 *
 * @param args - Arguments.
 * @param args.expectedProviderConfig - The provider configuration that the
 * operation is expected to set.
 * @param args.initialState - The initial state of the network controller.
 * @param args.operation - The operation to test.
 */
function lookupNetworkTests({
  expectedProviderConfig,
  initialState,
  operation,
}: {
  expectedProviderConfig: ProviderConfig;
  initialState?: Partial<NetworkState>;
  operation: (controller: NetworkController) => Promise<void>;
}) {
  describe('if the network ID and network details requests resolve successfully', () => {
    const validNetworkIds = [12345, '12345', toHex(12345)];
    for (const networkId of validNetworkIds) {
      describe(`with a network id of '${networkId}'`, () => {
        describe('if the current network is different from the network in state', () => {
          it('updates the network in state to match', async () => {
            await withController(
              {
                state: initialState,
              },
              async ({ controller }) => {
                await setFakeProvider(controller, {
                  stubs: [
                    {
                      request: { method: 'net_version' },
                      response: { result: networkId },
                    },
                  ],
                  stubLookupNetworkWhileSetting: true,
                });

                await operation(controller);

                expect(controller.state.networkId).toBe('12345');
              },
            );
          });
        });

        describe('if the version of the current network is the same as that in state', () => {
          it('does not change network ID in state', async () => {
            await withController(
              {
                state: initialState,
              },
              async ({ controller }) => {
                await setFakeProvider(controller, {
                  stubs: [
                    {
                      request: { method: 'net_version' },
                      response: { result: networkId },
                    },
                  ],
                  stubLookupNetworkWhileSetting: true,
                });

                await operation(controller);

                await expect(controller.state.networkId).toBe('12345');
              },
            );
          });

          it('updates the network details', async () => {
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
                        method: 'net_version',
                      },
                      response: { result: networkId },
                    },
                    {
                      request: {
                        method: 'eth_getBlockByNumber',
                      },
                      response: {
                        result: PRE_1559_BLOCK,
                      },
                    },
                    // Called via `lookupNetwork` directly
                    {
                      request: {
                        method: 'net_version',
                      },
                      response: { result: networkId },
                    },
                    {
                      request: {
                        method: 'eth_getBlockByNumber',
                      },
                      response: {
                        result: POST_1559_BLOCK,
                      },
                    },
                  ],
                });

                await operation(controller);

                await expect(controller.state.networkDetails).toStrictEqual({
                  EIPS: {
                    1559: true,
                  },
                });
              },
            );
          });
        });
      });
    }

    describe('if the network details of the current network are different from the network details in state', () => {
      it('updates the network in state to match', async () => {
        await withController(
          {
            state: {
              ...initialState,
              networkDetails: {
                EIPS: {
                  1559: false,
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

            expect(controller.state.networkDetails).toStrictEqual({
              EIPS: {
                1559: true,
              },
            });
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
              networkDetails: {
                EIPS: {
                  1559: true,
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

            expect(controller.state.networkDetails).toStrictEqual({
              EIPS: {
                1559: true,
              },
            });
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

  describe('if an RPC error is encountered while retrieving the version of the current network', () => {
    it('updates the network in state to "unavailable"', async () => {
      await withController(
        {
          state: initialState,
        },
        async ({ controller }) => {
          await setFakeProvider(controller, {
            stubs: [
              {
                request: { method: 'net_version' },
                error: ethErrors.rpc.limitExceeded('some error'),
              },
            ],
            stubLookupNetworkWhileSetting: true,
          });

          await operation(controller);

          expect(controller.state.networkStatus).toBe(
            NetworkStatus.Unavailable,
          );
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
                request: { method: 'net_version' },
                response: SUCCESSFUL_NET_VERSION_RESPONSE,
              },
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
                request: { method: 'net_version' },
                error: ethErrors.rpc.limitExceeded('some error'),
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
          expect(controller.state.networkDetails).toStrictEqual({
            EIPS: {
              1559: false,
            },
          });

          await operation(controller);
          expect(controller.state.networkDetails).toStrictEqual({
            EIPS: {},
          });
        },
      );
    });

    if (expectedProviderConfig.type === NetworkType.rpc) {
      it('emits infuraIsUnblocked', async () => {
        await withController(
          {
            state: initialState,
          },
          async ({ controller, messenger }) => {
            await setFakeProvider(controller, {
              stubs: [
                {
                  request: { method: 'net_version' },
                  error: ethErrors.rpc.limitExceeded('some error'),
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
                  request: { method: 'net_version' },
                  error: ethErrors.rpc.limitExceeded('some error'),
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
                request: { method: 'net_version' },
                error: ethErrors.rpc.limitExceeded('some error'),
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

  describe('if a country blocked error is encountered while retrieving the version of the current network', () => {
    if (expectedProviderConfig.type === NetworkType.rpc) {
      it('updates the network in state to "unknown"', async () => {
        await withController(
          {
            state: initialState,
          },
          async ({ controller }) => {
            await setFakeProvider(controller, {
              stubs: [
                {
                  request: { method: 'net_version' },
                  error: BLOCKED_INFURA_JSON_RPC_ERROR,
                },
              ],
              stubLookupNetworkWhileSetting: true,
            });

            await operation(controller);

            expect(controller.state.networkStatus).toBe(NetworkStatus.Unknown);
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
                  request: { method: 'net_version' },
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
                  request: { method: 'net_version' },
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
                  request: { method: 'net_version' },
                  error: BLOCKED_INFURA_JSON_RPC_ERROR,
                },
              ],
              stubLookupNetworkWhileSetting: true,
            });

            await operation(controller);

            expect(controller.state.networkStatus).toBe(NetworkStatus.Blocked);
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
                  request: { method: 'net_version' },
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
                  request: { method: 'net_version' },
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
                request: { method: 'net_version' },
                response: SUCCESSFUL_NET_VERSION_RESPONSE,
              },
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
                request: { method: 'net_version' },
                error: BLOCKED_INFURA_JSON_RPC_ERROR,
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
          expect(controller.state.networkDetails).toStrictEqual({
            EIPS: {
              1559: false,
            },
          });

          await operation(controller);
          expect(controller.state.networkDetails).toStrictEqual({
            EIPS: {},
          });
        },
      );
    });
  });

  describe('if an internal error is encountered while retrieving the version of the current network', () => {
    it('updates the network in state to "unknown"', async () => {
      await withController(
        {
          state: initialState,
        },
        async ({ controller }) => {
          await setFakeProvider(controller, {
            stubs: [
              {
                request: { method: 'net_version' },
                error: GENERIC_JSON_RPC_ERROR,
              },
            ],
            stubLookupNetworkWhileSetting: true,
          });

          await operation(controller);

          expect(controller.state.networkStatus).toBe(NetworkStatus.Unknown);
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
                request: { method: 'net_version' },
                response: SUCCESSFUL_NET_VERSION_RESPONSE,
              },
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
                request: { method: 'net_version' },
                error: GENERIC_JSON_RPC_ERROR,
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
          expect(controller.state.networkDetails).toStrictEqual({
            EIPS: {
              1559: false,
            },
          });

          await operation(controller);
          expect(controller.state.networkDetails).toStrictEqual({
            EIPS: {},
          });
        },
      );
    });

    if (expectedProviderConfig.type === NetworkType.rpc) {
      it('emits infuraIsUnblocked', async () => {
        await withController(
          {
            state: initialState,
          },
          async ({ controller, messenger }) => {
            await setFakeProvider(controller, {
              stubs: [
                {
                  request: { method: 'net_version' },
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
                  request: { method: 'net_version' },
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
                request: { method: 'net_version' },
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

  describe('if an invalid network ID is returned', () => {
    it('updates the network in state to "unknown"', async () => {
      await withController(
        {
          state: initialState,
        },
        async ({ controller }) => {
          await setFakeProvider(controller, {
            stubs: [
              {
                request: { method: 'net_version' },
                response: { result: 'invalid' },
              },
            ],
            stubLookupNetworkWhileSetting: true,
          });

          await operation(controller);

          expect(controller.state.networkStatus).toBe(NetworkStatus.Unknown);
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
                request: { method: 'net_version' },
                response: SUCCESSFUL_NET_VERSION_RESPONSE,
              },
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
                request: { method: 'net_version' },
                response: { result: 'invalid' },
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
          expect(controller.state.networkDetails).toStrictEqual({
            EIPS: {
              1559: false,
            },
          });

          await operation(controller);
          expect(controller.state.networkDetails).toStrictEqual({
            EIPS: {},
          });
        },
      );
    });

    if (expectedProviderConfig.type === NetworkType.rpc) {
      it('emits infuraIsUnblocked', async () => {
        await withController(
          {
            state: initialState,
          },
          async ({ controller, messenger }) => {
            await setFakeProvider(controller, {
              stubs: [
                {
                  request: { method: 'net_version' },
                  response: { result: 'invalid' },
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
                  request: { method: 'net_version' },
                  response: { result: 'invalid' },
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
                request: { method: 'net_version' },
                response: { result: 'invalid' },
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
                error: ethErrors.rpc.limitExceeded('some error'),
              },
            ],
            stubLookupNetworkWhileSetting: true,
          });

          await operation(controller);

          expect(controller.state.networkStatus).toBe(
            NetworkStatus.Unavailable,
          );
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
                error: ethErrors.rpc.limitExceeded('some error'),
              },
            ],
          });
          expect(controller.state.networkDetails).toStrictEqual({
            EIPS: {
              1559: false,
            },
          });

          await operation(controller);
          expect(controller.state.networkDetails).toStrictEqual({
            EIPS: {},
          });
        },
      );
    });

    if (expectedProviderConfig.type === NetworkType.rpc) {
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
                  error: ethErrors.rpc.limitExceeded('some error'),
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
                  error: ethErrors.rpc.limitExceeded('some error'),
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
                error: ethErrors.rpc.limitExceeded('some error'),
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
    if (expectedProviderConfig.type === NetworkType.rpc) {
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

            expect(controller.state.networkStatus).toBe(NetworkStatus.Unknown);
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

            expect(controller.state.networkStatus).toBe(NetworkStatus.Blocked);
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
          expect(controller.state.networkDetails).toStrictEqual({
            EIPS: {
              1559: false,
            },
          });

          await operation(controller);
          expect(controller.state.networkDetails).toStrictEqual({
            EIPS: {},
          });
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

          expect(controller.state.networkStatus).toBe(NetworkStatus.Unknown);
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
          expect(controller.state.networkDetails).toStrictEqual({
            EIPS: {
              1559: false,
            },
          });

          await operation(controller);
          expect(controller.state.networkDetails).toStrictEqual({
            EIPS: {},
          });
        },
      );
    });

    if (expectedProviderConfig.type === NetworkType.rpc) {
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
    allowedActions: [
      'NetworkController:getProviderConfig',
      'NetworkController:getEthQuery',
    ],
    allowedEvents: [
      'NetworkController:stateChange',
      'NetworkController:infuraIsBlocked',
      'NetworkController:infuraIsUnblocked',
      'NetworkController:networkDidChange',
      'NetworkController:networkWillChange',
    ],
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
    blockTracker?.destroy();
  }
}

/**
 * Builds a complete ProviderConfig object, filling in values that are not
 * provided with defaults.
 *
 * @param config - An incomplete ProviderConfig object.
 * @returns The complete ProviderConfig object.
 */
function buildProviderConfig(
  config: Partial<ProviderConfig> = {},
): ProviderConfig {
  if (config.type && config.type !== NetworkType.rpc) {
    return {
      ...BUILT_IN_NETWORKS[config.type],
      // This is redundant with the spread operation below, but this was
      // required for TypeScript to understand that this property was set to an
      // Infura type.
      type: config.type,
      ...config,
    };
  }
  return {
    type: NetworkType.rpc,
    chainId: toHex(1337),
    rpcUrl: 'http://doesntmatter.com',
    ...config,
  };
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
      chainId: '0x1',
      rpcUrl: 'https://test.network',
    },
    provider,
    blockTracker: new FakeBlockTracker(),
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
 * responses. `eth_getBlockByNumber` and `net_version` will be stubbed by
 * default.
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
  if (!stubs.some((stub) => stub.request.method === 'net_version')) {
    completeStubs.unshift({
      request: { method: 'net_version' },
      response: { result: '1' },
      discardAfterMatching: false,
    });
    completeStubs.unshift({
      request: { method: 'net_version' },
      response: { result: '1' },
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
      const eventListener: any = (...payload: E['payload']) => {
        allEventPayloads.push(payload);

        if (isEventPayloadInteresting(payload)) {
          interestingEventPayloads.push(payload);
          if (interestingEventPayloads.length === expectedNumberOfEvents) {
            stopTimer();
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
