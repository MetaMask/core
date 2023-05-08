import { inspect, isDeepStrictEqual, promisify } from 'util';
import assert from 'assert';
import { ControllerMessenger } from '@metamask/base-controller';
import * as ethQueryModule from 'eth-query';
import { Patch } from 'immer';
import { v4 } from 'uuid';
import { ethErrors } from 'eth-rpc-errors';
import {
  BUILT_IN_NETWORKS,
  InfuraNetworkType,
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
import { NetworkStatus } from '../src/constants';
import {
  createNetworkClient,
  NetworkClientType,
} from '../src/create-network-client';
import { FakeBlockTracker } from '../../../tests/fake-block-tracker';
import { FakeProvider, FakeProviderStub } from './fake-provider';

jest.mock('../src/create-network-client');

jest.mock('eth-query', () => {
  return {
    __esModule: true,
    default: jest.requireActual('eth-query'),
  };
});

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

// Store these up front so we can use them even when faking timers
const originalSetTimeout = global.setTimeout;
const originalClearTimeout = global.clearTimeout;

const createNetworkClientMock = jest.mocked(createNetworkClient);

/**
 * A dummy block that matches the pre-EIP-1559 format (i.e. it doesn't have the
 * `baseFeePerGas` property).
 */
const PRE_1559_BLOCK = {
  difficulty: '0x0',
  extraData: '0x',
  gasLimit: '0x1c9c380',
  gasUsed: '0x598c9b',
  hash: '0xfb2086eb924ffce4061f94c3b65f303e0351f8e7deff185fe1f5e9001ff96f63',
  logsBloom:
    '0x7034820113921800018e8070900006316040002225c04a0624110010841018a2109040401004112a4c120f00220a2119020000714b143a04004106120130a8450080433129401068ed22000a54a48221a1020202524204045421b883882530009a1800b08a1309408008828403010d530440001a40003c0006240291008c0404c211610c690b00f1985e000009c02503240040010989c01cf2806840043815498e90012103e06084051542c0094002494008044c24a0a13281e0009601481073010800130402464202212202a8088210442a8ec81b080430075629e60a00a082005a3988400940a4009012a204011a0018a00903222a60420428888144210802',
  miner: '0xffee087852cb4898e6c3532e776e68bc68b1143b',
  mixHash: '0xb17ba50cd7261e77a213fb75704dcfd8a28fbcd78d100691a112b7cc2893efa2',
  nonce: '0x0000000000000000',
  number: '0x2', // number set to "2" to simplify tests
  parentHash:
    '0x31406d1bf1a2ca12371ce5b3ecb20568d6a8b9bf05b49b71b93ba33f317d5a82',
  receiptsRoot:
    '0x5ba97ece1afbac2a8fe0344f9022fe808342179b26ea3ecc2e0b8c4b46b7f8cd',
  sha3Uncles:
    '0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347',
  size: '0x70f4',
  stateRoot:
    '0x36bfb7ca106d41c4458292669126e091011031c5af612dee1c2e6424ef92b080',
  timestamp: '0x639b6d9b',
  totalDifficulty: '0xc70d815d562d3cfa955',
  transactions: [
    // reduced to a single transaction to make fixture less verbose
    '0x2761e939dc822f64141bd00bc7ef8cee16201af10e862469212396664cee81ce',
  ],
  transactionsRoot:
    '0x98bbdfbe1074bc3aa72a77a281f16d6ba7e723d68f15937d80954fb34d323369',
  uncles: [],
};

/**
 * A dummy block that matches the pre-EIP-1559 format (i.e. it has the
 * `baseFeePerGas` property).
 */
const POST_1559_BLOCK = {
  ...PRE_1559_BLOCK,
  baseFeePerGas: '0x63c498a46',
};

/**
 * An alias for `POST_1559_BLOCK`, for tests that don't care about which kind of
 * block they're looking for.
 */
const BLOCK: Block = POST_1559_BLOCK;

/**
 * A response object for a request that has been geoblocked by Infura.
 */
const BLOCKED_INFURA_JSON_RPC_ERROR = ethErrors.rpc.internal(
  JSON.stringify({ error: 'countryBlocked' }),
);

/**
 * The networks that NetworkController recognizes as built-in Infura networks,
 * along with information we expect to be true for those networks.
 */
const INFURA_NETWORKS = [
  {
    nickname: 'Mainnet',
    networkType: NetworkType.mainnet,
    chainId: '1',
    ticker: 'ETH',
    blockExplorerUrl: 'https://etherscan.io',
    networkVersion: '1',
  },
  {
    nickname: 'Goerli',
    networkType: NetworkType.goerli,
    chainId: '5',
    ticker: 'GoerliETH',
    blockExplorerUrl: 'https://goerli.etherscan.io',
    networkVersion: '5',
  },
  {
    nickname: 'Sepolia',
    networkType: NetworkType.sepolia,
    chainId: '11155111',
    ticker: 'SepoliaETH',
    blockExplorerUrl: 'https://sepolia.etherscan.io',
    networkVersion: '11155111',
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

//                                                                                     setProviderType            setActiveNetwork
//                                                                                            └───────────┬────────────┘
// initializeProvider                                                                               refreshNetwork
//       │ │ └────────────────────────────────────────────┬──────────────────────────────────────────────┘ │
//       │ │                                     configureProvider                                         │
//       │ │                  ┌─────────────────────────┘ │                                                |
//       │ │          setupInfuraProvider        setupStandardProvider                                     │
//       │ │                  └─────────────┬─────────────┘                                                │
//       │ │                          updateProvider                                                       │
//       │ └───────────────┬───────────────┘ └───────────────────────────────┐                             │
//       │          registerProvider                                  this.provider = ...                  │
//       │                 ⋮                                                                               │
//       │   this.provider.on('error', ...)                                                                │
//       │                 │                                                                               │
//       │            verifyNetwork                                                                        │
//       │                 └─────────────────────────────┐                                                 │
//       └───────────────────────────────────────────────┼─────────────────────────────────────────────────┘
//                                                 lookupNetwork

describe('NetworkController', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    resetAllWhenMocks();
  });

  describe('constructor', () => {
    it('initializes the state with some defaults', async () => {
      await withController(({ controller }) => {
        expect(controller.state).toStrictEqual({
          networkConfigurations: {},
          networkId: null,
          networkStatus: NetworkStatus.Unknown,
          providerConfig: { type: NetworkType.mainnet, chainId: '1' },
          networkDetails: {
            EIPS: {
              1559: false,
            },
          },
        });
      });
    });

    it('merges the given state into the default state', async () => {
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
        ({ controller }) => {
          expect(controller.state).toStrictEqual({
            networkConfigurations: {},
            networkId: null,
            networkStatus: NetworkStatus.Unknown,
            providerConfig: { type: NetworkType.mainnet, chainId: '1' },
            networkDetails: {
              EIPS: {
                1559: true,
              },
            },
          });
        },
      );
    });

    it('throws if the infura project ID is missing', async () => {
      expect(
        () =>
          // @ts-expect-error Required parameter intentionally omitted
          new NetworkController({
            messenger: buildNetworkControllerMessenger(),
            trackMetaMetricsEvent: jest.fn(),
          }),
      ).toThrow('Invalid Infura project ID');
    });

    it('throws if the infura project ID is not a string', async () => {
      expect(
        () =>
          new NetworkController({
            messenger: buildNetworkControllerMessenger(),
            trackMetaMetricsEvent: jest.fn(),
            // @ts-expect-error Required parameter intentionally omitted
            infuraProjectId: 10,
          }),
      ).toThrow('Invalid Infura project ID');
    });
  });

  describe('initializeProvider', () => {
    [NetworkType.mainnet, NetworkType.goerli, NetworkType.sepolia].forEach(
      (networkType) => {
        describe(`when the provider config in state contains a network type of "${networkType}"`, () => {
          it(`sets the provider to an Infura provider pointed to ${networkType}`, async () => {
            await withController(
              {
                state: {
                  providerConfig: buildProviderConfig({
                    type: networkType,
                    chainId: '99999',
                    nickname: 'some nickname',
                  }),
                },
                infuraProjectId: 'infura-project-id',
              },
              async ({ controller }) => {
                const fakeProvider = buildFakeProvider([
                  {
                    request: {
                      method: 'eth_chainId',
                    },
                    response: {
                      result: '0x1337',
                    },
                  },
                ]);
                const fakeNetworkClient = buildFakeClient(fakeProvider);
                createNetworkClientMock.mockReturnValue(fakeNetworkClient);

                await controller.initializeProvider();

                expect(createNetworkClientMock).toHaveBeenCalledWith({
                  network: networkType,
                  infuraProjectId: 'infura-project-id',
                  type: NetworkClientType.Infura,
                });
                const { provider } = controller.getProviderAndBlockTracker();
                assert(provider, 'Provider is not set');
                const promisifiedSendAsync = promisify(provider.sendAsync).bind(
                  provider,
                );
                const chainIdResult = await promisifiedSendAsync({
                  id: 1,
                  jsonrpc: '2.0',
                  method: 'eth_chainId',
                  params: [],
                });
                expect(chainIdResult.result).toBe('0x1337');
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
      },
    );

    describe('when the provider config in state contains a network type of "rpc"', () => {
      describe('if the provider config contains an RPC target', () => {
        it('sets the provider to a custom RPC provider initialized with the configured target, chain ID, nickname, and ticker', async () => {
          await withController(
            {
              state: {
                providerConfig: {
                  type: NetworkType.rpc,
                  chainId: '1337',
                  nickname: 'some cool network',
                  rpcUrl: 'http://example.com',
                  ticker: 'ABC',
                },
              },
            },
            async ({ controller }) => {
              const fakeProvider = buildFakeProvider([
                {
                  request: {
                    method: 'eth_chainId',
                  },
                  response: {
                    result: '0x1337',
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
              expect(chainIdResult.result).toBe('0x1337');
            },
          );
        });

        lookupNetworkTests({
          expectedProviderConfig: buildProviderConfig({
            type: NetworkType.rpc,
          }),
          initialState: {
            providerConfig: buildProviderConfig({ type: NetworkType.rpc }),
          },
          operation: async (controller: NetworkController) => {
            await controller.initializeProvider();
          },
        });
      });

      describe('if the provider config does not contain an RPC URL', () => {
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

              expect(createNetworkClientMock).not.toHaveBeenCalled();
              const { provider, blockTracker } =
                controller.getProviderAndBlockTracker();
              expect(provider).toBeUndefined();
              expect(blockTracker).toBeUndefined();
            },
          );
        });
      });

      describe('if the provider config does not contain a chain ID', () => {
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

    [
      NetworkType.mainnet,
      NetworkType.goerli,
      NetworkType.sepolia,
      NetworkType.rpc,
    ].forEach((networkType) => {
      describe(`when the provider config in state contains a network type of "${networkType}"`, () => {
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
    });

    describe('if lookupNetwork is called multiple times in quick succession', () => {
      it('waits until each call finishes before resolving the next', async () => {
        await withController(async ({ controller, messenger }) => {
          await setFakeProvider(controller, {
            stubs: [
              {
                request: { method: 'net_version' },
                response: { result: '1' },
                delay: 100,
              },
              {
                request: { method: 'net_version' },
                response: { result: '2' },
                delay: 0,
              },
              {
                request: { method: 'net_version' },
                response: { result: '3' },
                delay: 200,
              },
            ],
            stubLookupNetworkWhileSetting: true,
          });
          const promiseForStateChanges = waitForStateChanges({
            messenger,
            propertyPath: ['networkId'],
            count: 3,
            wait: 400,
          });

          await Promise.all([
            controller.lookupNetwork(),
            controller.lookupNetwork(),
            controller.lookupNetwork(),
          ]);

          expect(await promiseForStateChanges).toMatchObject([
            expect.objectContaining([
              expect.objectContaining({ networkId: '1' }),
            ]),
            expect.objectContaining([
              expect.objectContaining({ networkId: '2' }),
            ]),
            expect.objectContaining([
              expect.objectContaining({ networkId: '3' }),
            ]),
          ]);
        });
      });
    });
  });

  describe('setProviderType', () => {
    for (const { networkType } of INFURA_NETWORKS) {
      describe(`given a network type of "${networkType}"`, () => {
        it('updates the provider config in state with the network type, the corresponding chain ID, and a special ticker, clearing any existing RPC target and nickname', async () => {
          await withController(
            {
              state: {
                providerConfig: {
                  type: NetworkType.rpc,
                  rpcUrl: 'http://somethingexisting.com',
                  chainId: '99999',
                  ticker: 'something existing',
                  nickname: 'something existing',
                },
              },
            },
            async ({ controller }) => {
              const fakeProvider = buildFakeProvider();
              const fakeNetworkClient = buildFakeClient(fakeProvider);
              createNetworkClientMock.mockReturnValue(fakeNetworkClient);

              await controller.setProviderType(networkType);

              expect(controller.state.providerConfig).toStrictEqual({
                type: networkType,
                ...BUILT_IN_NETWORKS[networkType],
                rpcUrl: undefined,
                nickname: undefined,
                id: undefined,
              });
            },
          );
        });

        it(`sets the provider to an Infura provider pointed to ${networkType}`, async () => {
          await withController(
            {
              infuraProjectId: 'infura-project-id',
            },
            async ({ controller }) => {
              const fakeProvider = buildFakeProvider([
                {
                  request: {
                    method: 'eth_chainId',
                  },
                  response: {
                    result: '0x1337',
                  },
                },
              ]);
              const fakeNetworkClient = buildFakeClient(fakeProvider);
              createNetworkClientMock.mockReturnValue(fakeNetworkClient);

              await controller.setProviderType(networkType);

              expect(createNetworkClientMock).toHaveBeenCalledWith({
                network: networkType,
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
              expect(chainIdResult.result).toBe('0x1337');
            },
          );
        });

        lookupNetworkTests({
          expectedProviderConfig: buildProviderConfig({
            type: networkType,
            ...BUILT_IN_NETWORKS[networkType],
          }),
          operation: async (controller: NetworkController) => {
            await controller.setProviderType(networkType);
          },
        });
      });
    }

    describe('given a network type of "rpc"', () => {
      it('throws because there is no way to set the rpcUrl using this method', async () => {
        await withController(
          {
            state: {
              providerConfig: {
                type: NetworkType.rpc,
                rpcUrl: 'http://somethingexisting.com',
                chainId: '99999',
                ticker: 'something existing',
                nickname: 'something existing',
              },
            },
          },
          async ({ controller }) => {
            await expect(() =>
              controller.setProviderType(NetworkType.rpc),
            ).rejects.toThrow(
              'rpcUrl must be provided for custom RPC endpoints',
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
            await controller.setProviderType(NetworkType.rpc);
          } catch {
            // catch the rejection (it is tested above)
          }

          expect(controller.state.networkDetails.EIPS[1559]).toBeUndefined();
        });
      });
    });
  });

  describe('setActiveNetwork', () => {
    it('updates the provider config in state with the rpcUrl and chainId, clearing the previous provider details', async () => {
      await withController(
        {
          state: {
            providerConfig: {
              type: NetworkType.rpc,
              rpcUrl: 'http://somethingexisting.com',
              chainId: '111',
              ticker: 'something existing',
              nickname: 'something existing',
              rpcPrefs: undefined,
            },
            networkConfigurations: {
              testNetworkConfigurationId: {
                rpcUrl: 'https://mock-rpc-url',
                chainId: '111',
                ticker: 'TEST',
                id: 'testNetworkConfigurationId',
                rpcPrefs: undefined,
              },
              testNetworkConfigurationId2: {
                rpcUrl: 'http://somethingexisting.com',
                chainId: '222',
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

          await controller.setActiveNetwork('testNetworkConfigurationId');

          expect(controller.state.providerConfig).toStrictEqual({
            type: 'rpc',
            rpcUrl: 'https://mock-rpc-url',
            chainId: '111',
            ticker: 'TEST',
            id: 'testNetworkConfigurationId',
            nickname: undefined,
            rpcPrefs: undefined,
          });
        },
      );
    });

    it('sets the provider to a custom RPC provider initialized with the RPC target and chain ID, leaving nickname and ticker undefined', async () => {
      await withController(
        {
          state: {
            networkConfigurations: {
              testNetworkConfigurationId: {
                rpcUrl: 'https://mock-rpc-url',
                chainId: '1337',
                ticker: 'TEST',
                id: 'testNetworkConfigurationId',
                nickname: undefined,
                rpcPrefs: undefined,
              },
            },
          },
        },
        async ({ controller }) => {
          const fakeProvider = buildFakeProvider([
            {
              request: {
                method: 'eth_chainId',
              },
              response: {
                result: '0x1337',
              },
            },
          ]);
          const fakeNetworkClient = buildFakeClient(fakeProvider);
          createNetworkClientMock.mockReturnValue(fakeNetworkClient);

          await controller.setActiveNetwork('testNetworkConfigurationId');

          expect(createNetworkClientMock).toHaveBeenCalledWith({
            chainId: toHex(1337),
            rpcUrl: 'https://mock-rpc-url',
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
          expect(chainIdResult.result).toBe('0x1337');
        },
      );
    });

    lookupNetworkTests({
      expectedProviderConfig: {
        rpcUrl: 'https://mock-rpc-url',
        chainId: '111',
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
            chainId: '111',
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

    describe('if the network config does not contain an RPC URL', () => {
      it('throws', async () => {
        await withController(
          // @ts-expect-error RPC URL intentionally omitted
          {
            state: {
              providerConfig: {
                type: NetworkType.rpc,
                rpcUrl: 'https://mock-rpc-url',
                chainId: '111',
                ticker: 'TEST',
                nickname: 'something existing',
                rpcPrefs: undefined,
              },
              networkConfigurations: {
                testNetworkConfigurationId1: {
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: '111',
                  ticker: 'TEST',
                  nickname: 'something existing',
                  id: 'testNetworkConfigurationId1',
                  rpcPrefs: undefined,
                },
                testNetworkConfigurationId2: {
                  rpcUrl: undefined,
                  chainId: '222',
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
                chainId: '111',
                ticker: 'TEST',
                nickname: 'something existing',
                rpcPrefs: undefined,
              },
              networkConfigurations: {
                testNetworkConfigurationId1: {
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: '111',
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
  });

  describe('getEIP1559Compatibility', () => {
    describe('if the state does not have a "networkDetails" property', () => {
      describe('if no error is thrown while fetching the latest block', () => {
        describe('if the block has a "baseFeePerGas" property', () => {
          it('updates EIPS[1559] in state to true', async () => {
            await withController(
              {
                state: {
                  // no "networkDetails" property
                },
              },
              async ({ controller, messenger }) => {
                await setFakeProvider(controller, {
                  stubs: [
                    {
                      request: {
                        method: 'eth_getBlockByNumber',
                        params: ['latest', false],
                      },
                      response: {
                        result: {
                          baseFeePerGas: '0x100',
                        },
                      },
                    },
                  ],
                  stubGetEIP1559CompatibilityWhileSetting: true,
                });

                await waitForStateChanges({
                  messenger,
                  propertyPath: ['networkDetails', 'EIPS', '1559'],
                  produceStateChanges: async () => {
                    await controller.getEIP1559Compatibility();
                  },
                });

                expect(controller.state.networkDetails.EIPS['1559']).toBe(true);
              },
            );
          });

          it('returns a promise that resolves to true', async () => {
            await withController(
              {
                state: {
                  // no "networkDetails" property
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
                          baseFeePerGas: '0x100',
                        },
                      },
                    },
                  ],
                  stubGetEIP1559CompatibilityWhileSetting: true,
                });

                const isEIP1559Compatible =
                  await controller.getEIP1559Compatibility();

                expect(isEIP1559Compatible).toBe(true);
              },
            );
          });
        });

        describe('if the block does not have a "baseFeePerGas" property', () => {
          it('does not change networkDetails.EIPS in state', async () => {
            await withController(
              {
                state: {
                  // no "networkDetails" property
                },
              },
              async ({ controller, messenger }) => {
                await setFakeProvider(controller, {
                  stubs: [
                    {
                      request: {
                        method: 'eth_getBlockByNumber',
                        params: ['latest', false],
                      },
                      response: {
                        result: {
                          // no "baseFeePerGas" property
                        },
                      },
                    },
                  ],
                  stubGetEIP1559CompatibilityWhileSetting: true,
                });
                const promiseForIsEIP1559CompatibleChanges =
                  waitForStateChanges({
                    messenger,
                    propertyPath: ['networkDetails', 'EIPS', '1559'],
                  });

                await controller.getEIP1559Compatibility();

                await expect(
                  promiseForIsEIP1559CompatibleChanges,
                ).toNeverResolve();
              },
            );
          });

          it('returns a promise that resolves to false', async () => {
            await withController(
              {
                state: {
                  // no "networkDetails" property
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
                          // no "baseFeePerGas" property
                        },
                      },
                    },
                  ],
                  stubGetEIP1559CompatibilityWhileSetting: true,
                });

                const isEIP1559Compatible =
                  await controller.getEIP1559Compatibility();

                expect(isEIP1559Compatible).toBe(false);
              },
            );
          });
        });
      });

      describe('if an error is thrown while fetching the latest block', () => {
        it('does not change networkDetails.EIPS in state', async () => {
          await withController(
            {
              state: {
                // no "networkDetails" property
              },
            },
            async ({ controller, messenger }) => {
              await setFakeProvider(controller, {
                stubs: [
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                      params: ['latest', false],
                    },
                    response: {
                      error: 'oops',
                    },
                  },
                ],
                stubGetEIP1559CompatibilityWhileSetting: true,
              });
              const promiseForIsEIP1559CompatibleChanges = waitForStateChanges({
                messenger,
                propertyPath: ['networkDetails', 'EIPS', '1559'],
              });

              try {
                await controller.getEIP1559Compatibility();
              } catch (error) {
                // catch the rejection (it is tested below)
              }

              await expect(
                promiseForIsEIP1559CompatibleChanges,
              ).toNeverResolve();
            },
          );
        });

        it('returns a promise that rejects with the error', async () => {
          await withController(
            {
              state: {
                // no "networkDetails" property
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
                      error: 'oops',
                    },
                  },
                ],
                stubGetEIP1559CompatibilityWhileSetting: true,
              });

              const promiseForIsEIP1559Compatible =
                controller.getEIP1559Compatibility();

              await expect(promiseForIsEIP1559Compatible).rejects.toThrow(
                'oops',
              );
            },
          );
        });
      });
    });

    describe('if the state has a "networkDetails" property, but it does not have an "EIPS[1559]" property', () => {
      describe('if no error is thrown while fetching the latest block', () => {
        describe('if the block has a "baseFeePerGas" property', () => {
          it('updates EIPS[1559] in state to true', async () => {
            await withController(
              {
                state: {
                  networkDetails: {
                    // no "EIPS[1559]" property
                    EIPS: {},
                  },
                },
              },
              async ({ controller, messenger }) => {
                await setFakeProvider(controller, {
                  stubs: [
                    {
                      request: {
                        method: 'eth_getBlockByNumber',
                        params: ['latest', false],
                      },
                      response: {
                        result: {
                          baseFeePerGas: '0x100',
                        },
                      },
                    },
                  ],
                  stubGetEIP1559CompatibilityWhileSetting: true,
                });

                await waitForStateChanges({
                  messenger,
                  propertyPath: ['networkDetails', 'EIPS', '1559'],
                  produceStateChanges: async () => {
                    await controller.getEIP1559Compatibility();
                  },
                });

                expect(controller.state.networkDetails.EIPS[1559]).toBe(true);
              },
            );
          });

          it('returns a promise that resolves to true', async () => {
            await withController(
              {
                state: {
                  networkDetails: {
                    // no "EIPS[1559]" property
                    EIPS: {},
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
                          baseFeePerGas: '0x100',
                        },
                      },
                    },
                  ],
                  stubGetEIP1559CompatibilityWhileSetting: true,
                });

                const isEIP1559Compatible =
                  await controller.getEIP1559Compatibility();

                expect(isEIP1559Compatible).toBe(true);
              },
            );
          });
        });

        describe('if the block does not have a "baseFeePerGas" property', () => {
          it('updates EIPS[1559] in state to false', async () => {
            await withController(
              {
                state: {
                  networkDetails: {
                    // no "EIPS[1559]" property
                    EIPS: {},
                  },
                },
              },
              async ({ controller, messenger }) => {
                await setFakeProvider(controller, {
                  stubs: [
                    {
                      request: {
                        method: 'eth_getBlockByNumber',
                        params: ['latest', false],
                      },
                      response: {
                        result: {
                          // no "baseFeePerGas" property
                        },
                      },
                    },
                  ],
                  stubGetEIP1559CompatibilityWhileSetting: true,
                });

                await waitForStateChanges({
                  messenger,
                  propertyPath: ['networkDetails', 'EIPS', '1559'],
                  produceStateChanges: async () => {
                    await controller.getEIP1559Compatibility();
                  },
                });

                expect(controller.state.networkDetails.EIPS[1559]).toBe(false);
              },
            );
          });

          it('returns a promise that resolves to false', async () => {
            await withController(
              {
                state: {
                  networkDetails: {
                    // no "EIPS[1559]" property
                    EIPS: {},
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
                          // no "baseFeePerGas" property
                        },
                      },
                    },
                  ],
                  stubGetEIP1559CompatibilityWhileSetting: true,
                });

                const isEIP1559Compatible =
                  await controller.getEIP1559Compatibility();

                expect(isEIP1559Compatible).toBe(false);
              },
            );
          });
        });
      });

      describe('if an error is thrown while fetching the latest block', () => {
        it('does not change networkDetails.EIPS in state', async () => {
          await withController(
            {
              state: {
                networkDetails: {
                  // no "EIPS[1559]" property
                  EIPS: {},
                },
              },
            },
            async ({ controller, messenger }) => {
              await setFakeProvider(controller, {
                stubs: [
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                      params: ['latest', false],
                    },
                    response: {
                      error: 'oops',
                    },
                  },
                ],
                stubGetEIP1559CompatibilityWhileSetting: true,
              });
              const promiseForIsEIP1559CompatibleChanges = waitForStateChanges({
                messenger,
                propertyPath: ['networkDetails', 'EIPS', '1559'],
              });

              try {
                await controller.getEIP1559Compatibility();
              } catch (error) {
                // catch the rejection (it is tested below)
              }

              await expect(
                promiseForIsEIP1559CompatibleChanges,
              ).toNeverResolve();
            },
          );
        });

        it('returns a promise that rejects with the error', async () => {
          await withController(
            {
              state: {
                networkDetails: {
                  // no "EIPS[1559]" property
                  EIPS: {},
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
                      error: 'oops',
                    },
                  },
                ],
                stubGetEIP1559CompatibilityWhileSetting: true,
              });

              const promiseForIsEIP1559Compatible =
                controller.getEIP1559Compatibility();

              await expect(promiseForIsEIP1559Compatible).rejects.toThrow(
                'oops',
              );
            },
          );
        });
      });
    });

    describe('if EIPS[1559] in state is set to false', () => {
      describe('if no error is thrown while fetching the latest block', () => {
        describe('if the block has a "baseFeePerGas" property', () => {
          it('updates EIPS[1559] in state to true', async () => {
            await withController(
              {
                state: {
                  networkDetails: {
                    EIPS: {
                      1559: false,
                    },
                  },
                },
              },
              async ({ controller, messenger }) => {
                await setFakeProvider(controller, {
                  stubs: [
                    {
                      request: {
                        method: 'eth_getBlockByNumber',
                        params: ['latest', false],
                      },
                      response: {
                        result: {
                          baseFeePerGas: '0x100',
                        },
                      },
                    },
                  ],
                  stubGetEIP1559CompatibilityWhileSetting: true,
                });

                await waitForStateChanges({
                  messenger,
                  propertyPath: ['networkDetails', 'EIPS', '1559'],
                  produceStateChanges: async () => {
                    await controller.getEIP1559Compatibility();
                  },
                });

                expect(controller.state.networkDetails.EIPS[1559]).toBe(true);
              },
            );
          });

          it('returns a promise that resolves to true', async () => {
            await withController(
              {
                state: {
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
                          baseFeePerGas: '0x100',
                        },
                      },
                    },
                  ],
                  stubGetEIP1559CompatibilityWhileSetting: true,
                });

                const isEIP1559Compatible =
                  await controller.getEIP1559Compatibility();

                expect(isEIP1559Compatible).toBe(true);
              },
            );
          });
        });

        describe('if the block does not have a "baseFeePerGas" property', () => {
          it('does not change networkDetails.EIPS in state', async () => {
            await withController(
              {
                state: {
                  networkDetails: {
                    EIPS: {
                      1559: false,
                    },
                  },
                },
              },
              async ({ controller, messenger }) => {
                await setFakeProvider(controller, {
                  stubs: [
                    {
                      request: {
                        method: 'eth_getBlockByNumber',
                        params: ['latest', false],
                      },
                      response: {
                        result: {
                          // no "baseFeePerGas" property
                        },
                      },
                    },
                  ],
                  stubGetEIP1559CompatibilityWhileSetting: true,
                });
                const promiseForIsEIP1559CompatibleChanges =
                  waitForStateChanges({
                    messenger,
                    propertyPath: ['networkDetails', 'EIPS', '1559'],
                  });

                await controller.getEIP1559Compatibility();

                await expect(
                  promiseForIsEIP1559CompatibleChanges,
                ).toNeverResolve();
              },
            );
          });

          it('returns a promise that resolves to false', async () => {
            await withController(
              {
                state: {
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
                          // no "baseFeePerGas" property
                        },
                      },
                    },
                  ],
                  stubGetEIP1559CompatibilityWhileSetting: true,
                });

                const isEIP1559Compatible =
                  await controller.getEIP1559Compatibility();

                expect(isEIP1559Compatible).toBe(false);
              },
            );
          });
        });
      });

      describe('if an error is thrown while fetching the latest block', () => {
        it('does not change networkDetails.EIPS in state', async () => {
          await withController(
            {
              state: {
                networkDetails: {
                  EIPS: {
                    1559: false,
                  },
                },
              },
            },
            async ({ controller, messenger }) => {
              await setFakeProvider(controller, {
                stubs: [
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                      params: ['latest', false],
                    },
                    response: {
                      error: 'oops',
                    },
                  },
                ],
                stubGetEIP1559CompatibilityWhileSetting: true,
              });
              const promiseForIsEIP1559CompatibleChanges = waitForStateChanges({
                messenger,
                propertyPath: ['networkDetails', 'EIPS', '1559'],
              });

              try {
                await controller.getEIP1559Compatibility();
              } catch (error) {
                // catch the rejection (it is tested below)
              }

              await expect(
                promiseForIsEIP1559CompatibleChanges,
              ).toNeverResolve();
            },
          );
        });

        it('returns a promise that rejects with the error', async () => {
          await withController(
            {
              state: {
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
                      error: 'oops',
                    },
                  },
                ],
                stubGetEIP1559CompatibilityWhileSetting: true,
              });

              const promiseForIsEIP1559Compatible =
                controller.getEIP1559Compatibility();

              await expect(promiseForIsEIP1559Compatible).rejects.toThrow(
                'oops',
              );
            },
          );
        });
      });
    });

    describe('if EIPS[1559] in state is set to true', () => {
      it('does not change networkDetails.EIPS in state', async () => {
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
            await setFakeProvider(controller, {
              stubGetEIP1559CompatibilityWhileSetting: true,
            });
            const promiseForIsEIP1559CompatibleChanges = waitForStateChanges({
              messenger,
              propertyPath: ['networkDetails', 'EIPS', '1559'],
            });

            await controller.getEIP1559Compatibility();

            await expect(promiseForIsEIP1559CompatibleChanges).toNeverResolve();
          },
        );
      });

      it('returns a promise that resolves to true', async () => {
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
            await setFakeProvider(controller, {
              stubGetEIP1559CompatibilityWhileSetting: true,
            });

            const result = await controller.getEIP1559Compatibility();

            expect(result).toBe(true);
          },
        );
      });
    });
  });

  describe('resetConnection', () => {
    [NetworkType.mainnet, NetworkType.goerli, NetworkType.sepolia].forEach(
      (networkType) => {
        describe(`when the type in the provider configuration is "${networkType}"`, () => {
          it('resets the network status to "unknown"', async () => {
            await withController(
              {
                state: {
                  providerConfig: {
                    type: networkType,
                    // NOTE: This doesn't need to match the logical chain ID of
                    // the network selected, it just needs to exist
                    chainId: '9999999',
                  },
                },
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
                  // Delayed to ensure that we can check the network status
                  // before this resolves.
                  {
                    delay: 1,
                    request: {
                      method: 'net_version',
                    },
                    response: {
                      result: '1',
                    },
                  },
                ]);
                const fakeNetworkClient = buildFakeClient(fakeProvider);
                createNetworkClientMock.mockReturnValue(fakeNetworkClient);
                await controller.initializeProvider();
                expect(controller.state.networkStatus).toBe(
                  NetworkStatus.Available,
                );

                await waitForStateChanges({
                  messenger,
                  propertyPath: ['networkStatus'],
                  // We only care about the first state change, because it
                  // happens before the network lookup
                  count: 1,
                  produceStateChanges: () => {
                    // Intentionally not awaited because we want to check state
                    // partway through the operation
                    controller.resetConnection();
                  },
                });

                expect(controller.state.networkStatus).toBe(
                  NetworkStatus.Unknown,
                );
              },
            );
          });

          it('clears EIP-1559 support for the network from state', async () => {
            await withController(
              {
                state: {
                  providerConfig: {
                    type: networkType,
                    // NOTE: This doesn't need to match the logical chain ID of
                    // the network selected, it just needs to exist
                    chainId: '9999999',
                  },
                },
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
                  produceStateChanges: () => {
                    // Intentionally not awaited because we want to check state
                    // partway through the operation
                    controller.resetConnection();
                  },
                });

                expect(controller.state.networkDetails).toStrictEqual({
                  EIPS: {},
                });
              },
            );
          });

          it(`initializes a new provider object pointed to the current Infura network (type: "${networkType}")`, async () => {
            await withController(
              {
                state: {
                  providerConfig: {
                    type: networkType,
                    // NOTE: This doesn't need to match the logical chain ID of
                    // the network selected, it just needs to exist
                    chainId: '9999999',
                  },
                },
              },
              async ({ controller }) => {
                const fakeProvider = buildFakeProvider([
                  {
                    request: {
                      method: 'eth_chainId',
                    },
                    response: {
                      result: '0x1337',
                    },
                  },
                ]);
                const fakeNetworkClient = buildFakeClient(fakeProvider);
                createNetworkClientMock.mockReturnValue(fakeNetworkClient);

                await controller.resetConnection();

                const { provider } = controller.getProviderAndBlockTracker();
                assert(provider);
                const promisifiedSendAsync = promisify(provider.sendAsync).bind(
                  provider,
                );
                const { result: chainIdResult } = await promisifiedSendAsync({
                  id: 1,
                  jsonrpc: '2.0',
                  method: 'eth_chainId',
                  params: [],
                });
                expect(chainIdResult).toBe('0x1337');
              },
            );
          });

          it('replaces the provider object underlying the provider proxy without creating a new instance of the proxy itself', async () => {
            await withController(
              {
                state: {
                  providerConfig: {
                    type: networkType,
                    // NOTE: This doesn't need to match the logical chain ID of
                    // the network selected, it just needs to exist
                    chainId: '9999999',
                  },
                },
              },
              async ({ controller }) => {
                const fakeProvider = buildFakeProvider();
                const fakeNetworkClient = buildFakeClient(fakeProvider);
                createNetworkClientMock.mockReturnValue(fakeNetworkClient);

                await controller.initializeProvider();

                const { provider: providerBefore } =
                  controller.getProviderAndBlockTracker();
                await controller.resetConnection();
                const { provider: providerAfter } =
                  controller.getProviderAndBlockTracker();

                expect(providerBefore).toBe(providerAfter);
              },
            );
          });

          lookupNetworkTests({
            expectedProviderConfig: buildProviderConfig({ type: networkType }),
            initialState: {
              providerConfig: buildProviderConfig({ type: networkType }),
            },
            operation: async (controller: NetworkController) => {
              await controller.resetConnection();
            },
          });
        });
      },
    );

    describe(`when the type in the provider configuration is "rpc"`, () => {
      it('resets the network status to "unknown"', async () => {
        await withController(
          {
            state: {
              providerConfig: {
                type: NetworkType.rpc,
                rpcUrl: 'https://mock-rpc-url',
                chainId: '1337',
              },
            },
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
              // Delayed to ensure that we can check the network status
              // before this resolves.
              {
                delay: 1,
                request: {
                  method: 'net_version',
                },
                response: {
                  result: '1',
                },
              },
            ]);
            const fakeNetworkClient = buildFakeClient(fakeProvider);
            createNetworkClientMock.mockReturnValue(fakeNetworkClient);
            await controller.initializeProvider();
            expect(controller.state.networkStatus).toBe(
              NetworkStatus.Available,
            );

            await waitForStateChanges({
              messenger,
              propertyPath: ['networkStatus'],
              // We only care about the first state change, because it
              // happens before the network lookup
              count: 1,
              produceStateChanges: () => {
                // Intentionally not awaited because we want to check state
                // partway through the operation
                controller.resetConnection();
              },
            });

            expect(controller.state.networkStatus).toBe(NetworkStatus.Unknown);
          },
        );
      });

      it('clears EIP-1559 support for the network from state before emitting networkDidChange', async () => {
        await withController(
          {
            state: {
              providerConfig: {
                type: NetworkType.rpc,
                rpcUrl: 'https://mock-rpc-url',
                chainId: '1337',
              },
              networkDetails: {
                EIPS: {
                  1559: false,
                },
              },
            },
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
              produceStateChanges: () => {
                // Intentionally not awaited because we want to check state
                // partway through the operation
                controller.resetConnection();
              },
            });

            expect(controller.state.networkDetails).toStrictEqual({
              EIPS: {},
            });
          },
        );
      });

      it('initializes a new provider object pointed to the same RPC URL as the current network and using the same chain ID', async () => {
        await withController(
          {
            state: {
              providerConfig: {
                type: NetworkType.rpc,
                rpcUrl: 'https://mock-rpc-url',
                chainId: '9999999',
                ticker: 'TEST',
                id: 'testNetworkConfigurationId',
              },
              networkConfigurations: {
                testNetworkConfigurationId: {
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: '9999999',
                  ticker: 'TEST',
                  id: 'testNetworkConfigurationId',
                },
              },
            },
          },
          async ({ controller }) => {
            const fakeProvider = buildFakeProvider([
              {
                request: {
                  method: 'eth_chainId',
                },
                response: {
                  result: '0x1337',
                },
              },
            ]);
            const fakeNetworkClient = buildFakeClient(fakeProvider);
            createNetworkClientMock.mockReturnValue(fakeNetworkClient);

            await controller.resetConnection();
            const { provider } = controller.getProviderAndBlockTracker();
            assert(provider);
            const promisifiedSendAsync = promisify(provider.sendAsync).bind(
              provider,
            );
            const { result: chainIdResult } = await promisifiedSendAsync({
              id: 1,
              jsonrpc: '2.0',
              method: 'eth_chainId',
              params: [],
            });
            expect(chainIdResult).toBe('0x1337');
          },
        );
      });

      it('replaces the provider object underlying the provider proxy without creating a new instance of the proxy itself', async () => {
        await withController(
          {
            state: {
              providerConfig: {
                type: NetworkType.rpc,
                rpcUrl: 'https://mock-rpc-url',
                chainId: '1337',
                ticker: 'TEST',
                id: 'testNetworkConfigurationId',
              },
              networkConfigurations: {
                testNetworkConfigurationId: {
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: '1337',
                  ticker: 'TEST',
                  id: 'testNetworkConfigurationId',
                },
              },
            },
          },
          async ({ controller }) => {
            const fakeProvider = buildFakeProvider();
            const fakeNetworkClient = buildFakeClient(fakeProvider);
            createNetworkClientMock.mockReturnValue(fakeNetworkClient);

            await controller.initializeProvider();
            const { provider: providerBefore } =
              controller.getProviderAndBlockTracker();

            await controller.resetConnection();

            const { provider: providerAfter } =
              controller.getProviderAndBlockTracker();
            expect(providerBefore).toBe(providerAfter);
          },
        );
      });

      describe('if the provider config does not contain an RPC URL', () => {
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

              await expect(() => controller.resetConnection()).rejects.toThrow(
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

      describe('if the provider config does not contain a chain ID', () => {
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

              await expect(() => controller.resetConnection()).rejects.toThrow(
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

      lookupNetworkTests({
        expectedProviderConfig: buildProviderConfig({ type: NetworkType.rpc }),
        initialState: {
          providerConfig: buildProviderConfig({ type: NetworkType.rpc }),
        },
        operation: async (controller: NetworkController) => {
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
    it('returns the EthQuery object that is set after the provider is set', async () => {
      await withController(({ controller, messenger }) => {
        const fakeEthQuery = {
          sendAsync: jest.fn(),
        };
        jest.spyOn(ethQueryModule, 'default').mockReturnValue(fakeEthQuery);
        setFakeProvider(controller);

        const ethQuery = messenger.call('NetworkController:getEthQuery');

        expect(ethQuery).toBe(fakeEthQuery);
      });
    });

    it('returns undefined if the provider has not been set yet', async () => {
      await withController(({ messenger }) => {
        const fakeEthQuery = {
          sendAsync: jest.fn(),
        };
        jest.spyOn(ethQueryModule, 'default').mockReturnValue(fakeEthQuery);

        const ethQuery = messenger.call('NetworkController:getEthQuery');

        expect(ethQuery).toBeUndefined();
      });
    });
  });

  describe('upsertNetworkConfiguration', () => {
    it('adds the given network configuration when its rpcURL does not match an existing configuration', async () => {
      (v4 as jest.Mock).mockImplementationOnce(
        () => 'network-configuration-id-1',
      );

      await withController(async ({ controller }) => {
        const rpcUrlNetwork = {
          chainId: '0x9999',
          rpcUrl: 'https://test-rpc.com',
          ticker: 'RPC',
        };

        expect(controller.state.networkConfigurations).toStrictEqual({});

        await controller.upsertNetworkConfiguration(rpcUrlNetwork, {
          referrer: 'https://test-dapp.com',
          source: 'dapp',
        });

        expect(
          Object.values(controller.state.networkConfigurations),
        ).toStrictEqual(
          expect.arrayContaining([
            {
              ...rpcUrlNetwork,
              nickname: undefined,
              rpcPrefs: undefined,
              id: 'network-configuration-id-1',
            },
          ]),
        );
      });
    });

    it('update a network configuration when the configuration being added has an rpcURL that matches an existing configuration', async () => {
      await withController(
        {
          state: {
            networkConfigurations: {
              testNetworkConfigurationId: {
                rpcUrl: 'https://rpc-url.com',
                ticker: 'old_rpc_ticker',
                nickname: 'old_rpc_nickname',
                rpcPrefs: { blockExplorerUrl: 'testchainscan.io' },
                chainId: '0x1',
                id: 'testNetworkConfigurationId',
              },
            },
          },
        },
        async ({ controller }) => {
          await controller.upsertNetworkConfiguration(
            {
              rpcUrl: 'https://rpc-url.com',
              ticker: 'new_rpc_ticker',
              nickname: 'new_rpc_nickname',
              rpcPrefs: { blockExplorerUrl: 'alternativetestchainscan.io' },
              chainId: '0x1',
            },
            { referrer: 'https://test-dapp.com', source: 'dapp' },
          );
          expect(
            Object.values(controller.state.networkConfigurations),
          ).toStrictEqual(
            expect.arrayContaining([
              {
                rpcUrl: 'https://rpc-url.com',
                nickname: 'new_rpc_nickname',
                ticker: 'new_rpc_ticker',
                rpcPrefs: { blockExplorerUrl: 'alternativetestchainscan.io' },
                chainId: '0x1',
                id: 'testNetworkConfigurationId',
              },
            ]),
          );
        },
      );
    });

    it('throws if the given chain ID is not a 0x-prefixed hex number', async () => {
      const invalidChainId = '1';
      await withController(async ({ controller }) => {
        await expect(async () =>
          controller.upsertNetworkConfiguration(
            {
              chainId: invalidChainId,
              nickname: 'RPC',
              rpcPrefs: { blockExplorerUrl: 'test-block-explorer.com' },
              rpcUrl: 'rpc_url',
              ticker: 'RPC',
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
        await expect(async () =>
          controller.upsertNetworkConfiguration(
            {
              chainId: '0xFFFFFFFFFFFFFFFF',
              nickname: 'RPC',
              rpcPrefs: { blockExplorerUrl: 'test-block-explorer.com' },
              rpcUrl: 'rpc_url',
              ticker: 'RPC',
            },
            {
              referrer: 'https://test-dapp.com',
              source: 'dapp',
            },
          ),
        ).rejects.toThrow(
          new Error(
            'Invalid chain ID "0xFFFFFFFFFFFFFFFF": numerical value greater than max safe value.',
          ),
        );
      });
    });

    it('throws if rpcUrl passed is not a valid Url', async () => {
      await withController(async ({ controller }) => {
        await expect(async () =>
          controller.upsertNetworkConfiguration(
            {
              chainId: '0x9999',
              nickname: 'RPC',
              rpcPrefs: { blockExplorerUrl: 'test-block-explorer.com' },
              ticker: 'RPC',
              rpcUrl: 'test',
            },
            {
              referrer: 'https://test-dapp.com',
              source: 'dapp',
            },
          ),
        ).rejects.toThrow(new Error('rpcUrl must be a valid URL'));
      });
    });

    it('throws if the no (or a falsy) ticker is passed', async () => {
      await withController(async ({ controller }) => {
        await expect(async () =>
          controller.upsertNetworkConfiguration(
            // @ts-expect-error - we want to test the case where no ticker is present.
            {
              chainId: '0x5',
              nickname: 'RPC',
              rpcPrefs: { blockExplorerUrl: 'test-block-explorer.com' },
              rpcUrl: 'https://mock-rpc-url',
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

    it('throws if an options object is not passed as a second argument', async () => {
      await withController(async ({ controller }) => {
        await expect(async () =>
          // @ts-expect-error - we want to test the case where no second arg is passed.
          controller.upsertNetworkConfiguration({
            chainId: '0x5',
            nickname: 'RPC',
            rpcPrefs: { blockExplorerUrl: 'test-block-explorer.com' },
            rpcUrl: 'https://mock-rpc-url',
          }),
        ).rejects.toThrow('Cannot read properties of undefined');
      });
    });

    it('throws if referrer and source arguments are not passed', async () => {
      (v4 as jest.Mock).mockImplementationOnce(() => 'networkConfigurationId');
      const trackEventSpy = jest.fn();
      await withController(
        {
          state: {
            providerConfig: {
              type: NetworkType.rpc,
              rpcUrl: 'https://mock-rpc-url',
              chainId: '0x111',
              ticker: 'TEST',
              id: 'testNetworkConfigurationId',
            },
            networkConfigurations: {
              testNetworkConfigurationId: {
                rpcUrl: 'https://mock-rpc-url',
                chainId: '0x111',
                ticker: 'TEST',
                id: 'testNetworkConfigurationId',
                nickname: undefined,
                rpcPrefs: undefined,
              },
            },
          },
          trackMetaMetricsEvent: trackEventSpy,
        },
        async ({ controller }) => {
          const newNetworkConfiguration = {
            rpcUrl: 'https://new-chain-rpc-url',
            chainId: '0x222',
            ticker: 'NEW',
            nickname: 'new-chain',
            rpcPrefs: { blockExplorerUrl: 'https://block-explorer' },
          };

          await expect(async () =>
            // @ts-expect-error - we want to test the case where the options object is empty.
            controller.upsertNetworkConfiguration(newNetworkConfiguration, {}),
          ).rejects.toThrow(
            'referrer and source are required arguments for adding or updating a network configuration',
          );
        },
      );
    });

    it('should add the given network if all required properties are present but nither rpcPrefs nor nickname properties are passed', async () => {
      (v4 as jest.Mock).mockImplementationOnce(() => 'networkConfigurationId');
      await withController(
        {
          state: {
            networkConfigurations: {},
          },
        },
        async ({ controller }) => {
          const rpcUrlNetwork = {
            chainId: '0x1',
            rpcUrl: 'https://test-rpc-url',
            ticker: 'test_ticker',
          };

          await controller.upsertNetworkConfiguration(rpcUrlNetwork, {
            referrer: 'https://test-dapp.com',
            source: 'dapp',
          });

          expect(
            Object.values(controller.state.networkConfigurations),
          ).toStrictEqual(
            expect.arrayContaining([
              {
                ...rpcUrlNetwork,
                nickname: undefined,
                rpcPrefs: undefined,
                id: 'networkConfigurationId',
              },
            ]),
          );
        },
      );
    });

    it('adds new networkConfiguration to networkController store, but only adds valid properties (rpcUrl, chainId, ticker, nickname, rpcPrefs) and fills any missing properties from this list as undefined', async function () {
      (v4 as jest.Mock).mockImplementationOnce(() => 'networkConfigurationId');
      await withController(
        {
          state: {
            networkConfigurations: {},
          },
        },
        async ({ controller }) => {
          const rpcUrlNetwork = {
            chainId: '0x1',
            rpcUrl: 'https://test-rpc-url',
            ticker: 'test_ticker',
            invalidKey: 'new-chain',
            invalidKey2: {},
          };

          await controller.upsertNetworkConfiguration(rpcUrlNetwork, {
            referrer: 'https://test-dapp.com',
            source: 'dapp',
          });

          expect(
            Object.values(controller.state.networkConfigurations),
          ).toStrictEqual(
            expect.arrayContaining([
              {
                chainId: '0x1',
                rpcUrl: 'https://test-rpc-url',
                ticker: 'test_ticker',
                nickname: undefined,
                rpcPrefs: undefined,
                id: 'networkConfigurationId',
              },
            ]),
          );
        },
      );
    });

    it('should add the given network configuration if its rpcURL does not match an existing configuration without changing or overwriting other configurations', async () => {
      (v4 as jest.Mock).mockImplementationOnce(() => 'networkConfigurationId2');
      await withController(
        {
          state: {
            networkConfigurations: {
              networkConfigurationId: {
                rpcUrl: 'https://test-rpc-url',
                ticker: 'ticker',
                nickname: 'nickname',
                rpcPrefs: { blockExplorerUrl: 'testchainscan.io' },
                chainId: '0x1',
                id: 'networkConfigurationId',
              },
            },
          },
        },
        async ({ controller }) => {
          const rpcUrlNetwork = {
            chainId: '0x1',
            nickname: 'RPC',
            rpcPrefs: undefined,
            rpcUrl: 'https://test-rpc-url-2',
            ticker: 'RPC',
          };

          await controller.upsertNetworkConfiguration(rpcUrlNetwork, {
            referrer: 'https://test-dapp.com',
            source: 'dapp',
          });

          expect(
            Object.values(controller.state.networkConfigurations),
          ).toStrictEqual(
            expect.arrayContaining([
              {
                rpcUrl: 'https://test-rpc-url',
                ticker: 'ticker',
                nickname: 'nickname',
                rpcPrefs: { blockExplorerUrl: 'testchainscan.io' },
                chainId: '0x1',
                id: 'networkConfigurationId',
              },
              { ...rpcUrlNetwork, id: 'networkConfigurationId2' },
            ]),
          );
        },
      );
    });

    it('should use the given configuration to update an existing network configuration that has a matching rpcUrl', async () => {
      await withController(
        {
          state: {
            networkConfigurations: {
              networkConfigurationId: {
                rpcUrl: 'https://test-rpc-url',
                ticker: 'old_rpc_ticker',
                nickname: 'old_rpc_chainName',
                rpcPrefs: { blockExplorerUrl: 'testchainscan.io' },
                chainId: '0x1',
                id: 'networkConfigurationId',
              },
            },
          },
        },

        async ({ controller }) => {
          const updatedConfiguration = {
            rpcUrl: 'https://test-rpc-url',
            ticker: 'new_rpc_ticker',
            nickname: 'new_rpc_chainName',
            rpcPrefs: { blockExplorerUrl: 'alternativetestchainscan.io' },
            chainId: '0x1',
          };
          await controller.upsertNetworkConfiguration(updatedConfiguration, {
            referrer: 'https://test-dapp.com',
            source: 'dapp',
          });
          expect(
            Object.values(controller.state.networkConfigurations),
          ).toStrictEqual([
            {
              rpcUrl: 'https://test-rpc-url',
              nickname: 'new_rpc_chainName',
              ticker: 'new_rpc_ticker',
              rpcPrefs: { blockExplorerUrl: 'alternativetestchainscan.io' },
              chainId: '0x1',
              id: 'networkConfigurationId',
            },
          ]);
        },
      );
    });

    it('should use the given configuration to update an existing network configuration that has a matching rpcUrl without changing or overwriting other networkConfigurations', async () => {
      await withController(
        {
          state: {
            networkConfigurations: {
              networkConfigurationId: {
                rpcUrl: 'https://test-rpc-url',
                ticker: 'ticker',
                nickname: 'nickname',
                rpcPrefs: { blockExplorerUrl: 'testchainscan.io' },
                chainId: '0x1',
                id: 'networkConfigurationId',
              },
              networkConfigurationId2: {
                rpcUrl: 'https://test-rpc-url-2',
                ticker: 'ticker-2',
                nickname: 'nickname-2',
                rpcPrefs: { blockExplorerUrl: 'testchainscan.io' },
                chainId: '0x9999',
                id: 'networkConfigurationId2',
              },
            },
          },
        },
        async ({ controller }) => {
          await controller.upsertNetworkConfiguration(
            {
              rpcUrl: 'https://test-rpc-url',
              ticker: 'new-ticker',
              nickname: 'new-nickname',
              rpcPrefs: { blockExplorerUrl: 'alternativetestchainscan.io' },
              chainId: '0x1',
            },
            {
              referrer: 'https://test-dapp.com',
              source: 'dapp',
            },
          );

          expect(
            Object.values(controller.state.networkConfigurations),
          ).toStrictEqual([
            {
              rpcUrl: 'https://test-rpc-url',
              ticker: 'new-ticker',
              nickname: 'new-nickname',
              rpcPrefs: { blockExplorerUrl: 'alternativetestchainscan.io' },
              chainId: '0x1',
              id: 'networkConfigurationId',
            },
            {
              rpcUrl: 'https://test-rpc-url-2',
              ticker: 'ticker-2',
              nickname: 'nickname-2',
              rpcPrefs: { blockExplorerUrl: 'testchainscan.io' },
              chainId: '0x9999',
              id: 'networkConfigurationId2',
            },
          ]);
        },
      );
    });

    it('should add the given network and not set it to active if the setActive option is not passed (or a falsy value is passed)', async () => {
      (v4 as jest.Mock).mockImplementationOnce(() => 'networkConfigurationId');
      const originalProvider = {
        type: 'rpc' as NetworkType,
        rpcUrl: 'https://mock-rpc-url',
        chainId: '111',
        ticker: 'TEST',
        id: 'testNetworkConfigurationId',
      };
      await withController(
        {
          state: {
            providerConfig: originalProvider,
            networkConfigurations: {
              testNetworkConfigurationId: {
                rpcUrl: 'https://mock-rpc-url',
                chainId: '0x111',
                ticker: 'TEST',
                id: 'testNetworkConfigurationId',
                nickname: undefined,
                rpcPrefs: undefined,
              },
            },
          },
        },
        async ({ controller }) => {
          const rpcUrlNetwork = {
            chainId: '0x222',
            rpcUrl: 'https://test-rpc-url',
            ticker: 'test_ticker',
          };

          await controller.upsertNetworkConfiguration(rpcUrlNetwork, {
            referrer: 'https://test-dapp.com',
            source: 'dapp',
          });

          expect(controller.state.providerConfig).toStrictEqual(
            originalProvider,
          );
        },
      );
    });

    it('should add the given network and set it to active if the setActive option is passed as true', async () => {
      (v4 as jest.Mock).mockImplementationOnce(() => 'networkConfigurationId');
      await withController(
        {
          state: {
            providerConfig: {
              type: NetworkType.rpc,
              rpcUrl: 'https://mock-rpc-url',
              chainId: '0x111',
              ticker: 'TEST',
              id: 'testNetworkConfigurationId',
              nickname: undefined,
              rpcPrefs: undefined,
            },
            networkConfigurations: {
              testNetworkConfigurationId: {
                rpcUrl: 'https://mock-rpc-url',
                chainId: '0x111',
                ticker: 'TEST',
                id: 'testNetworkConfigurationId',
                nickname: undefined,
                rpcPrefs: undefined,
              },
            },
          },
        },
        async ({ controller }) => {
          const fakeProvider = buildFakeProvider();
          const fakeNetworkClient = buildFakeClient(fakeProvider);
          createNetworkClientMock.mockReturnValue(fakeNetworkClient);
          const rpcUrlNetwork = {
            rpcUrl: 'https://test-rpc-url',
            chainId: '0x222',
            ticker: 'test_ticker',
          };

          await controller.upsertNetworkConfiguration(rpcUrlNetwork, {
            setActive: true,
            referrer: 'https://test-dapp.com',
            source: 'dapp',
          });

          expect(controller.state.providerConfig).toStrictEqual({
            type: 'rpc',
            rpcUrl: 'https://test-rpc-url',
            chainId: '0x222',
            ticker: 'test_ticker',
            id: 'networkConfigurationId',
            nickname: undefined,
            rpcPrefs: undefined,
          });
        },
      );
    });

    it('adds new networkConfiguration to networkController store and calls to the metametrics event tracking with the correct values', async () => {
      (v4 as jest.Mock).mockImplementationOnce(() => 'networkConfigurationId');
      const trackEventSpy = jest.fn();
      await withController(
        {
          state: {
            providerConfig: {
              type: NetworkType.rpc,
              rpcUrl: 'https://mock-rpc-url',
              chainId: '0x111',
              ticker: 'TEST',
              id: 'testNetworkConfigurationId',
              nickname: undefined,
              rpcPrefs: undefined,
            },
            networkConfigurations: {
              testNetworkConfigurationId: {
                rpcUrl: 'https://mock-rpc-url',
                chainId: '0x111',
                ticker: 'TEST',
                id: 'testNetworkConfigurationId',
                nickname: undefined,
                rpcPrefs: undefined,
              },
            },
          },
          trackMetaMetricsEvent: trackEventSpy,
        },
        async ({ controller }) => {
          const newNetworkConfiguration = {
            rpcUrl: 'https://new-chain-rpc-url',
            chainId: '0x222',
            ticker: 'NEW',
            nickname: 'new-chain',
            rpcPrefs: { blockExplorerUrl: 'https://block-explorer' },
          };

          await controller.upsertNetworkConfiguration(newNetworkConfiguration, {
            referrer: 'https://test-dapp.com',
            source: 'dapp',
          });

          expect(
            Object.values(controller.state.networkConfigurations),
          ).toStrictEqual([
            {
              rpcUrl: 'https://mock-rpc-url',
              chainId: '0x111',
              ticker: 'TEST',
              id: 'testNetworkConfigurationId',
              nickname: undefined,
              rpcPrefs: undefined,
            },
            {
              ...newNetworkConfiguration,
              id: 'networkConfigurationId',
            },
          ]);
          expect(trackEventSpy).toHaveBeenCalledWith({
            event: 'Custom Network Added',
            category: 'Network',
            referrer: {
              url: 'https://test-dapp.com',
            },
            properties: {
              chain_id: '0x222',
              symbol: 'NEW',
              source: 'dapp',
            },
          });
        },
      );
    });
  });

  describe('removeNetworkConfigurations', () => {
    it('remove a network configuration', async () => {
      const testNetworkConfigurationId = 'testNetworkConfigurationId';
      await withController(
        {
          state: {
            networkConfigurations: {
              [testNetworkConfigurationId]: {
                rpcUrl: 'https://rpc-url.com',
                ticker: 'old_rpc_ticker',
                nickname: 'old_rpc_nickname',
                rpcPrefs: { blockExplorerUrl: 'testchainscan.io' },
                chainId: '0x1337',
                id: testNetworkConfigurationId,
              },
            },
          },
        },
        async ({ controller }) => {
          controller.removeNetworkConfiguration(testNetworkConfigurationId);
          expect(controller.state.networkConfigurations).toStrictEqual({});
        },
      );
    });

    it('throws if the networkConfigurationId it is passed does not correspond to a network configuration in state', async () => {
      const testNetworkConfigurationId = 'testNetworkConfigurationId';
      const invalidNetworkConfigurationId = 'invalidNetworkConfigurationId';
      await withController(
        {
          state: {
            networkConfigurations: {
              [testNetworkConfigurationId]: {
                rpcUrl: 'https://rpc-url.com',
                ticker: 'old_rpc_ticker',
                nickname: 'old_rpc_nickname',
                rpcPrefs: { blockExplorerUrl: 'testchainscan.io' },
                chainId: '0x1337',
                id: testNetworkConfigurationId,
              },
            },
          },
        },
        async ({ controller }) => {
          expect(() =>
            controller.removeNetworkConfiguration(
              invalidNetworkConfigurationId,
            ),
          ).toThrow(
            `networkConfigurationId ${invalidNetworkConfigurationId} does not match a configured networkConfiguration`,
          );
        },
      );
    });
  });

  describe('rollbackToPreviousProvider', () => {
    for (const { networkType } of INFURA_NETWORKS) {
      describe(`if the previous provider configuration had a type of "${networkType}"`, () => {
        it('overwrites the the current provider configuration with the previous provider configuration', async () => {
          await withController(
            {
              state: {
                providerConfig: buildProviderConfig({
                  type: networkType,
                  ...BUILT_IN_NETWORKS[networkType],
                }),
                networkConfigurations: {
                  testNetworkConfiguration: {
                    id: 'testNetworkConfiguration',
                    rpcUrl: 'https://mock-rpc-url',
                    chainId: '0x1337',
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
                  chainId: '0x1337',
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
                chainId: '0x1337',
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
                  ...BUILT_IN_NETWORKS[networkType],
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
                    chainId: '0x1337',
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
                  chainId: '0x1337',
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
                produceStateChanges: () => {
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
                    chainId: '0x1337',
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
                  chainId: '0x1337',
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
                produceStateChanges: () => {
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
                    chainId: '0x1337',
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
                  chainId: '0x1337',
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
                    chainId: '0x1337',
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
                  chainId: '0x1337',
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
                    chainId: '0x1337',
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
                  chainId: '0x1337',
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

              await expect(promiseForNoInfuraIsUnblockedEvents).toBeFulfilled();
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
                    chainId: '0x1337',
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
                  chainId: '0x1337',
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
                produceStateChanges: async () => {
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
                    chainId: '0x1337',
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
                  chainId: '0x1337',
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
                produceStateChanges: async () => {
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
      it('overwrites the the current provider configuration with the previous provider configuration', async () => {
        await withController(
          {
            state: {
              providerConfig: buildProviderConfig({
                type: NetworkType.rpc,
                rpcUrl: 'https://mock-rpc-url',
                chainId: '1337',
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
              chainId: '5',
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
                chainId: '1337',
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
                chainId: '1337',
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
              produceStateChanges: () => {
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
                chainId: '1337',
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
              produceStateChanges: () => {
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
                chainId: '1337',
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
                chainId: '1337',
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
                chainId: '1337',
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
              produceEvents: async () => {
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
                chainId: '1337',
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
                chainId: '1337',
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

  describe('destroy', () => {
    describe('if the blockTracker is defined', () => {
      it('should stop the blockTracker', async () => {
        await withController({}, async ({ controller }) => {
          const fakeProvider = buildFakeProvider();
          const fakeNetworkClient = buildFakeClient(fakeProvider);
          createNetworkClientMock.mockReturnValue(fakeNetworkClient);
          await controller.initializeProvider();
          const destroySpy = jest.spyOn(
            fakeNetworkClient.blockTracker,
            'destroy',
          );

          await controller.destroy();

          expect(destroySpy).toHaveBeenCalled();
        });
      });
    });

    describe('if the blockTracker is undefined', () => {
      it('should not throw errors', async () => {
        await withController({}, async ({ controller }) => {
          const { blockTracker } = controller.getProviderAndBlockTracker();
          expect(blockTracker).toBeUndefined();
          expect(async () => await controller.destroy()).not.toThrow();
        });
      });
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
                  response: { result: '12345' },
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
                  response: { result: '12345' },
                },
              ],
              stubLookupNetworkWhileSetting: true,
            });

            await operation(controller);

            await expect(controller.state.networkId).toBe('12345');
          },
        );
      });
    });

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

          const payloads = await waitForPublishedEvents({
            messenger,
            eventType: 'NetworkController:infuraIsUnblocked',
            produceEvents: async () => {
              await operation(controller);
            },
          });

          expect(payloads).toStrictEqual([[]]);
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

          const payloads = await waitForPublishedEvents({
            messenger,
            eventType: 'NetworkController:infuraIsBlocked',
            count: 0,
            produceEvents: async () => {
              await operation(controller);
            },
          });

          expect(payloads).toStrictEqual([]);
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

            const payloads = await waitForPublishedEvents({
              messenger,
              eventType: 'NetworkController:infuraIsUnblocked',
              produceEvents: async () => {
                await operation(controller);
              },
            });

            expect(payloads).toStrictEqual([[]]);
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

            const payloads = await waitForPublishedEvents({
              messenger,
              eventType: 'NetworkController:infuraIsUnblocked',
              count: 0,
              produceEvents: async () => {
                await operation(controller);
              },
            });

            expect(payloads).toStrictEqual([]);
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

          const payloads = await waitForPublishedEvents({
            messenger,
            eventType: 'NetworkController:infuraIsBlocked',
            count: 0,
            produceEvents: async () => {
              await operation(controller);
            },
          });

          expect(payloads).toStrictEqual([]);
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

            const payloads = await waitForPublishedEvents({
              messenger,
              eventType: 'NetworkController:infuraIsUnblocked',
              produceEvents: async () => {
                await operation(controller);
              },
            });

            expect(payloads).toStrictEqual([[]]);
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

            const payloads = await waitForPublishedEvents({
              messenger,
              eventType: 'NetworkController:infuraIsBlocked',
              count: 0,
              produceEvents: async () => {
                await operation(controller);
              },
            });

            expect(payloads).toStrictEqual([]);
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

            const payloads = await waitForPublishedEvents({
              messenger,
              eventType: 'NetworkController:infuraIsUnblocked',
              count: 0,
              produceEvents: async () => {
                await operation(controller);
              },
            });

            expect(payloads).toStrictEqual([]);
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

            const payloads = await waitForPublishedEvents({
              messenger,
              eventType: 'NetworkController:infuraIsBlocked',
              produceEvents: async () => {
                await operation(controller);
              },
            });

            expect(payloads).toStrictEqual([[]]);
          },
        );
      });
    }
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
                error: ethErrors.rpc.internal('some error'),
              },
            ],
            stubLookupNetworkWhileSetting: true,
          });

          await operation(controller);

          expect(controller.state.networkStatus).toBe(NetworkStatus.Unknown);
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
                  error: ethErrors.rpc.internal('some error'),
                },
              ],
              stubLookupNetworkWhileSetting: true,
            });

            const payloads = await waitForPublishedEvents({
              messenger,
              eventType: 'NetworkController:infuraIsUnblocked',
              produceEvents: async () => {
                await operation(controller);
              },
            });

            expect(payloads).toStrictEqual([[]]);
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
                  error: ethErrors.rpc.internal('some error'),
                },
              ],
              stubLookupNetworkWhileSetting: true,
            });

            const payloads = await waitForPublishedEvents({
              messenger,
              eventType: 'NetworkController:infuraIsUnblocked',
              count: 0,
              produceEvents: async () => {
                await operation(controller);
              },
            });

            expect(payloads).toStrictEqual([]);
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
                error: ethErrors.rpc.internal('some error'),
              },
            ],
            stubLookupNetworkWhileSetting: true,
          });

          const payloads = await waitForPublishedEvents({
            messenger,
            eventType: 'NetworkController:infuraIsBlocked',
            count: 0,
            produceEvents: async () => {
              await operation(controller);
            },
          });

          expect(payloads).toStrictEqual([]);
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

            const payloads = await waitForPublishedEvents({
              messenger,
              eventType: 'NetworkController:infuraIsUnblocked',
              produceEvents: async () => {
                await operation(controller);
              },
            });

            expect(payloads).toStrictEqual([[]]);
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

            const payloads = await waitForPublishedEvents({
              messenger,
              eventType: 'NetworkController:infuraIsUnblocked',
              count: 0,
              produceEvents: async () => {
                await operation(controller);
              },
            });

            expect(payloads).toStrictEqual([]);
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

          const payloads = await waitForPublishedEvents({
            messenger,
            eventType: 'NetworkController:infuraIsBlocked',
            count: 0,
            produceEvents: async () => {
              await operation(controller);
            },
          });

          expect(payloads).toStrictEqual([]);
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
            stubGetEIP1559CompatibilityWhileSetting: true,
          });

          await operation(controller);

          expect(controller.state.networkStatus).toBe(
            NetworkStatus.Unavailable,
          );
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
              stubGetEIP1559CompatibilityWhileSetting: true,
            });

            const payloads = await waitForPublishedEvents({
              messenger,
              eventType: 'NetworkController:infuraIsUnblocked',
              produceEvents: async () => {
                await operation(controller);
              },
            });

            expect(payloads).toStrictEqual([[]]);
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
              stubGetEIP1559CompatibilityWhileSetting: true,
            });

            const payloads = await waitForPublishedEvents({
              messenger,
              eventType: 'NetworkController:infuraIsUnblocked',
              count: 0,
              produceEvents: async () => {
                await operation(controller);
              },
            });

            expect(payloads).toStrictEqual([]);
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
            stubGetEIP1559CompatibilityWhileSetting: true,
          });

          const payloads = await waitForPublishedEvents({
            messenger,
            eventType: 'NetworkController:infuraIsBlocked',
            count: 0,
            produceEvents: async () => {
              await operation(controller);
            },
          });

          expect(payloads).toStrictEqual([]);
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

            const payloads = await waitForPublishedEvents({
              messenger,
              eventType: 'NetworkController:infuraIsUnblocked',
              produceEvents: async () => {
                await operation(controller);
              },
            });

            expect(payloads).toStrictEqual([[]]);
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

            const payloads = await waitForPublishedEvents({
              messenger,
              eventType: 'NetworkController:infuraIsBlocked',
              count: 0,
              produceEvents: async () => {
                await operation(controller);
              },
            });

            expect(payloads).toStrictEqual([]);
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

            const payloads = await waitForPublishedEvents({
              messenger,
              eventType: 'NetworkController:infuraIsUnblocked',
              count: 0,
              produceEvents: async () => {
                await operation(controller);
              },
            });

            expect(payloads).toStrictEqual([]);
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

            const payloads = await waitForPublishedEvents({
              messenger,
              eventType: 'NetworkController:infuraIsBlocked',
              produceEvents: async () => {
                await operation(controller);
              },
            });

            expect(payloads).toStrictEqual([[]]);
          },
        );
      });
    }
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
                error: ethErrors.rpc.internal('some error'),
              },
            ],
          });

          await operation(controller);

          expect(controller.state.networkStatus).toBe(NetworkStatus.Unknown);
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
                  error: ethErrors.rpc.internal('some error'),
                },
              ],
              stubGetEIP1559CompatibilityWhileSetting: true,
            });

            const payloads = await waitForPublishedEvents({
              messenger,
              eventType: 'NetworkController:infuraIsUnblocked',
              produceEvents: async () => {
                await operation(controller);
              },
            });

            expect(payloads).toStrictEqual([[]]);
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
                  error: ethErrors.rpc.internal('some error'),
                },
              ],
              stubGetEIP1559CompatibilityWhileSetting: true,
            });

            const payloads = await waitForPublishedEvents({
              messenger,
              eventType: 'NetworkController:infuraIsUnblocked',
              count: 0,
              produceEvents: async () => {
                await operation(controller);
              },
            });

            expect(payloads).toStrictEqual([]);
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
                error: ethErrors.rpc.internal('some error'),
              },
            ],
            stubGetEIP1559CompatibilityWhileSetting: true,
          });

          const payloads = await waitForPublishedEvents({
            messenger,
            eventType: 'NetworkController:infuraIsBlocked',
            count: 0,
            produceEvents: async () => {
              await operation(controller);
            },
          });

          expect(payloads).toStrictEqual([]);
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
 * `messenger` is filled in if not given); the function will be called with the
 * built controller.
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
function buildProviderConfig(config: Partial<ProviderConfig> = {}) {
  return {
    type: NetworkType.rpc,
    chainId: '1337',
    id: undefined,
    nickname: undefined,
    rpcUrl:
      !config.type || config.type === NetworkType.rpc
        ? 'http://doesntmatter.com'
        : undefined,
    ...config,
  };
}

/**
 * Builds an object that `createNetworkClient` returns.
 *
 * @param provider - The provider to use.
 * @returns The network client.
 */
function buildFakeClient(provider: Provider) {
  return {
    provider,
    blockTracker: new FakeBlockTracker(),
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
 * @param options.stubGetEIP1559CompatibilityWhileSetting - Whether to stub the
 * call to `getEIP1559Compatibility` that happens when the provider is set. This
 * option is useful in tests that need a provider to get set but also call
 * `getEIP1559Compatibility` on their own. In this case, since the
 * `providerConfig` setter already calls `getEIP1559Compatibility` once, and
 * since `getEIP1559Compatibility` is called out of band, the test may run with
 * unexpected results. By stubbing `getEIP1559Compatibility` before setting the
 * provider, the test is free to explicitly call it.
 * @returns The set provider.
 */
async function setFakeProvider(
  controller: NetworkController,
  {
    stubs = [],
    stubLookupNetworkWhileSetting = false,
    stubGetEIP1559CompatibilityWhileSetting = false,
  }: {
    stubs?: FakeProviderStub[];
    stubLookupNetworkWhileSetting?: boolean;
    stubGetEIP1559CompatibilityWhileSetting?: boolean;
  } = {},
): Promise<void> {
  const fakeProvider = buildFakeProvider(stubs);
  const fakeNetworkClient = buildFakeClient(fakeProvider);
  createNetworkClientMock.mockReturnValue(fakeNetworkClient);
  const lookupNetworkMock = jest.spyOn(controller, 'lookupNetwork');
  const lookupGetEIP1559CompatibilityMock = jest.spyOn(
    controller,
    'getEIP1559Compatibility',
  );

  if (stubLookupNetworkWhileSetting) {
    lookupNetworkMock.mockResolvedValue(undefined);
  }
  if (stubGetEIP1559CompatibilityWhileSetting) {
    lookupGetEIP1559CompatibilityMock.mockResolvedValue(false);
  }

  await controller.initializeProvider();
  assert(controller.getProviderAndBlockTracker().provider);

  if (stubLookupNetworkWhileSetting) {
    lookupNetworkMock.mockRestore();
  }
  if (stubGetEIP1559CompatibilityWhileSetting) {
    lookupGetEIP1559CompatibilityMock.mockRestore();
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
 * @param options.produceEvents - A function to run that will presumably produce
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
  produceEvents = () => {
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
  produceEvents?: () => void | Promise<void>;
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
          originalClearTimeout(timer);
        }
      }

      /**
       * Reset the timer used to detect a timeout when listening for published events.
       */
      function resetTimer() {
        stopTimer();
        timer = originalSetTimeout(() => {
          end();
        }, timeBeforeAssumingNoMoreEvents);
      }

      messenger.subscribe(eventType, eventListener);
      resetTimer();
    },
  );

  await produceEvents();

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
 * @param options.produceStateChanges - A function to run that will presumably
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
  produceStateChanges,
  beforeResolving,
}: {
  messenger: ControllerMessenger<
    NetworkControllerActions,
    NetworkControllerEvents
  >;
  propertyPath?: string[];
  count?: number;
  wait?: number;
  produceStateChanges?: () => void | Promise<void>;
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
    produceEvents: produceStateChanges,
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
