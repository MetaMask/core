import { inspect, isDeepStrictEqual, promisify } from 'util';
import assert from 'assert';

import { mocked } from 'ts-jest/utils';
import { ControllerMessenger } from '@metamask/base-controller';
import * as ethQueryModule from 'eth-query';
import Subprovider from 'web3-provider-engine/subproviders/provider';
import createInfuraProvider from 'eth-json-rpc-infura/src/createProvider';
import type { ProviderEngine } from 'web3-provider-engine';
import createMetamaskProvider from 'web3-provider-engine/zero';
import { Patch } from 'immer';
import { v4 } from 'uuid';
import { ethErrors } from 'eth-rpc-errors';
import {
  NetworkType,
  NetworksChainId,
  NetworksTicker,
} from '@metamask/controller-utils';
import { waitForResult } from '../../../tests/helpers';
import {
  NetworkController,
  NetworkControllerActions,
  NetworkControllerEvents,
  NetworkControllerMessenger,
  NetworkControllerOptions,
  NetworkControllerStateChangeEvent,
  NetworkState,
  ProviderConfig,
} from '../src/NetworkController';
import { NetworkStatus } from '../src/constants';
import { BUILT_IN_NETWORKS } from '../../controller-utils/src/constants';
import { FakeProviderEngine, FakeProviderStub } from './fake-provider-engine';

jest.mock('eth-query', () => {
  return {
    __esModule: true,
    default: jest.requireActual('eth-query'),
  };
});
jest.mock('web3-provider-engine/subproviders/provider');
jest.mock('eth-json-rpc-infura/src/createProvider');
jest.mock('web3-provider-engine/zero');

jest.mock('uuid', () => {
  const actual = jest.requireActual('uuid');

  return {
    ...actual,
    v4: jest.fn(),
  };
});

// Store this up front so it doesn't get lost when it is stubbed
const originalSetTimeout = global.setTimeout;

const SubproviderMock = mocked(Subprovider);
const createInfuraProviderMock = mocked(createInfuraProvider);
const createMetamaskProviderMock = mocked(createMetamaskProvider);

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
  });

  describe('constructor', () => {
    it('initializes the state with some defaults', async () => {
      await withController(({ controller }) => {
        expect(controller.state).toStrictEqual({
          networkConfigurations: {},
          networkId: null,
          networkStatus: NetworkStatus.Unknown,
          providerConfig: { type: NetworkType.mainnet, chainId: '1' },
          networkDetails: { isEIP1559Compatible: false },
        });
      });
    });

    it('merges the given state into the default state', async () => {
      await withController(
        {
          state: {
            networkDetails: { isEIP1559Compatible: true },
          },
        },
        ({ controller }) => {
          expect(controller.state).toStrictEqual({
            networkConfigurations: {},
            networkId: null,
            networkStatus: NetworkStatus.Unknown,
            providerConfig: { type: NetworkType.mainnet, chainId: '1' },
            networkDetails: { isEIP1559Compatible: true },
          });
        },
      );
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
                const fakeInfuraProvider = buildFakeInfuraProvider();
                createInfuraProviderMock.mockReturnValue(fakeInfuraProvider);
                const fakeInfuraSubprovider = buildFakeInfuraSubprovider();
                SubproviderMock.mockReturnValue(fakeInfuraSubprovider);
                const fakeMetamaskProvider = buildFakeMetamaskProvider([
                  {
                    request: {
                      method: 'eth_chainId',
                    },
                    response: {
                      result: '0x1337',
                    },
                  },
                ]);
                createMetamaskProviderMock.mockReturnValue(
                  fakeMetamaskProvider,
                );

                await controller.initializeProvider();

                expect(createInfuraProviderMock).toHaveBeenCalledWith({
                  network: networkType,
                  projectId: 'infura-project-id',
                });
                expect(createMetamaskProviderMock).toHaveBeenCalledWith({
                  dataSubprovider: fakeInfuraSubprovider,
                  engineParams: {
                    blockTrackerProvider: fakeInfuraProvider,
                    pollingInterval: 12000,
                  },
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
                });
                expect(chainIdResult.result).toBe('0x1337');
              },
            );
          });

          it('ensures that the existing provider is stopped while replacing it', async () => {
            await withController(
              {
                state: {
                  providerConfig: buildProviderConfig({
                    type: networkType,
                  }),
                },
                infuraProjectId: 'infura-project-id',
              },
              async ({ controller }) => {
                const fakeInfuraProvider = buildFakeInfuraProvider();
                createInfuraProviderMock.mockReturnValue(fakeInfuraProvider);
                const fakeInfuraSubprovider = buildFakeInfuraSubprovider();
                SubproviderMock.mockReturnValue(fakeInfuraSubprovider);
                const fakeMetamaskProviders = [
                  buildFakeMetamaskProvider(),
                  buildFakeMetamaskProvider(),
                ];
                jest.spyOn(fakeMetamaskProviders[0], 'stop');
                createMetamaskProviderMock
                  .mockImplementationOnce(() => fakeMetamaskProviders[0])
                  .mockImplementationOnce(() => fakeMetamaskProviders[1]);

                await controller.initializeProvider();
                await controller.initializeProvider();
                assert(controller.getProviderAndBlockTracker().provider);
                jest.runAllTimers();

                expect(fakeMetamaskProviders[0].stop).toHaveBeenCalled();
              },
            );
          });

          describe('when an "error" event occurs on the new provider', () => {
            describe('if the network version could not be retrieved while providerConfig was being set', () => {
              it('retrieves the network version twice more (due to the "error" event being listened to twice) and, assuming success, persists it to state', async () => {
                const messenger = buildMessenger();
                await withController(
                  {
                    messenger,
                    state: {
                      providerConfig: buildProviderConfig({
                        type: networkType,
                      }),
                    },
                    infuraProjectId: 'infura-project-id',
                  },
                  async ({ controller }) => {
                    const fakeInfuraProvider = buildFakeInfuraProvider();
                    createInfuraProviderMock.mockReturnValue(
                      fakeInfuraProvider,
                    );
                    const fakeInfuraSubprovider = buildFakeInfuraSubprovider();
                    SubproviderMock.mockReturnValue(fakeInfuraSubprovider);
                    const fakeMetamaskProvider = buildFakeMetamaskProvider([
                      {
                        request: {
                          method: 'net_version',
                        },
                        response: {
                          error: 'oops',
                        },
                      },
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
                          method: 'net_version',
                        },
                        response: {
                          result: '2',
                        },
                      },
                    ]);
                    createMetamaskProviderMock.mockReturnValue(
                      fakeMetamaskProvider,
                    );

                    await waitForPublishedEvents(
                      messenger,
                      'NetworkController:providerConfigChange',
                      {
                        produceEvents: async () => {
                          await controller.initializeProvider();
                          assert(
                            controller.getProviderAndBlockTracker().provider,
                          );
                        },
                      },
                    );

                    await waitForStateChanges(messenger, {
                      propertyPath: ['networkId'],
                      count: 2,
                      produceStateChanges: () => {
                        controller
                          .getProviderAndBlockTracker()
                          .provider.emit('error', { some: 'error' });
                      },
                    });
                    expect(controller.state.networkId).toBe('2');
                  },
                );
              });
            });

            describe('if the network version could be retrieved while providerConfig was being set', () => {
              it('does not retrieve the network version again', async () => {
                const messenger = buildMessenger();
                await withController(
                  {
                    messenger,
                    state: {
                      providerConfig: buildProviderConfig({
                        type: networkType,
                      }),
                    },
                    infuraProjectId: 'infura-project-id',
                  },
                  async ({ controller }) => {
                    const fakeInfuraProvider = buildFakeInfuraProvider();
                    createInfuraProviderMock.mockReturnValue(
                      fakeInfuraProvider,
                    );
                    const fakeInfuraSubprovider = buildFakeInfuraSubprovider();
                    SubproviderMock.mockReturnValue(fakeInfuraSubprovider);
                    const fakeMetamaskProvider = buildFakeMetamaskProvider([
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
                          method: 'net_version',
                        },
                        response: {
                          result: '2',
                        },
                      },
                    ]);
                    createMetamaskProviderMock.mockReturnValue(
                      fakeMetamaskProvider,
                    );

                    await waitForPublishedEvents(
                      messenger,
                      'NetworkController:providerConfigChange',
                      {
                        produceEvents: async () => {
                          await controller.initializeProvider();
                          assert(
                            controller.getProviderAndBlockTracker().provider,
                          );
                        },
                      },
                    );

                    await waitForStateChanges(messenger, {
                      propertyPath: ['networkId'],
                      count: 0,
                      produceStateChanges: () => {
                        controller
                          .getProviderAndBlockTracker()
                          .provider.emit('error', { some: 'error' });
                      },
                    });
                    expect(controller.state.networkId).toBe('1');
                  },
                );
              });
            });
          });
        });
      },
    );

    describe(`when the provider config in state contains a network type of "localhost"`, () => {
      it('sets the provider to a custom RPC provider pointed to localhost, initialized with the configured chain ID, nickname, and ticker', async () => {
        await withController(
          {
            state: {
              providerConfig: buildProviderConfig({
                type: NetworkType.localhost,
                chainId: '66666',
                nickname: "doesn't matter",
                rpcTarget: 'http://doesntmatter.com',
                ticker: 'ABC',
              }),
            },
          },
          async ({ controller }) => {
            const fakeMetamaskProvider = buildFakeMetamaskProvider([
              {
                request: {
                  method: 'eth_chainId',
                },
                response: {
                  result: '0x1337',
                },
              },
            ]);
            createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

            await controller.initializeProvider();

            expect(createMetamaskProviderMock).toHaveBeenCalledWith({
              chainId: undefined,
              engineParams: { pollingInterval: 12000 },
              nickname: undefined,
              rpcUrl: 'http://localhost:8545',
              ticker: undefined,
            });
            const { provider } = controller.getProviderAndBlockTracker();
            const promisifiedSendAsync = promisify(provider.sendAsync).bind(
              provider,
            );
            const chainIdResult = await promisifiedSendAsync({
              method: 'eth_chainId',
            });
            expect(chainIdResult.result).toBe('0x1337');
          },
        );
      });

      it('ensures that the existing provider is stopped while replacing it', async () => {
        await withController(
          {
            state: {
              providerConfig: buildProviderConfig({
                type: NetworkType.localhost,
              }),
            },
          },
          async ({ controller }) => {
            const fakeMetamaskProviders = [
              buildFakeMetamaskProvider(),
              buildFakeMetamaskProvider(),
            ];
            jest.spyOn(fakeMetamaskProviders[0], 'stop');
            createMetamaskProviderMock
              .mockImplementationOnce(() => fakeMetamaskProviders[0])
              .mockImplementationOnce(() => fakeMetamaskProviders[1]);

            await controller.initializeProvider();
            await controller.initializeProvider();
            assert(controller.getProviderAndBlockTracker().provider);
            jest.runAllTimers();

            expect(fakeMetamaskProviders[0].stop).toHaveBeenCalled();
          },
        );
      });

      describe('when an "error" event occurs on the new provider', () => {
        describe('if the network version could not be retrieved while providerConfig was being set', () => {
          it('retrieves the network version twice more (due to the "error" event being listened to twice) and, assuming success, persists it to state', async () => {
            const messenger = buildMessenger();
            await withController(
              {
                messenger,
                state: {
                  providerConfig: buildProviderConfig({
                    type: NetworkType.localhost,
                  }),
                },
              },
              async ({ controller }) => {
                const fakeMetamaskProvider = buildFakeMetamaskProvider([
                  {
                    request: {
                      method: 'net_version',
                    },
                    response: {
                      error: 'oops',
                    },
                  },
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
                      method: 'net_version',
                    },
                    response: {
                      result: '2',
                    },
                  },
                ]);
                createMetamaskProviderMock.mockReturnValue(
                  fakeMetamaskProvider,
                );

                await waitForPublishedEvents(
                  messenger,
                  'NetworkController:providerConfigChange',
                  {
                    produceEvents: async () => {
                      await controller.initializeProvider();
                      assert(controller.getProviderAndBlockTracker().provider);
                    },
                  },
                );

                await waitForStateChanges(messenger, {
                  propertyPath: ['networkId'],
                  count: 2,
                  produceStateChanges: () => {
                    controller
                      .getProviderAndBlockTracker()
                      .provider.emit('error', { some: 'error' });
                  },
                });
                expect(controller.state.networkId).toBe('2');
              },
            );
          });
        });

        describe('if the network version could be retrieved while providerConfig was being set', () => {
          it('does not retrieve the network version again', async () => {
            const messenger = buildMessenger();
            await withController(
              {
                messenger,
                state: {
                  providerConfig: buildProviderConfig({
                    type: NetworkType.localhost,
                  }),
                },
              },
              async ({ controller }) => {
                const fakeMetamaskProvider = buildFakeMetamaskProvider([
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
                      method: 'net_version',
                    },
                    response: {
                      result: '2',
                    },
                  },
                ]);
                createMetamaskProviderMock.mockReturnValue(
                  fakeMetamaskProvider,
                );

                await waitForPublishedEvents(
                  messenger,
                  'NetworkController:providerConfigChange',
                  {
                    produceEvents: async () => {
                      await controller.initializeProvider();
                      assert(controller.getProviderAndBlockTracker().provider);
                    },
                  },
                );

                await waitForStateChanges(messenger, {
                  propertyPath: ['networkId'],
                  count: 0,
                  produceStateChanges: () => {
                    controller
                      .getProviderAndBlockTracker()
                      .provider.emit('error', { some: 'error' });
                  },
                });
                expect(controller.state.networkId).toBe('1');
              },
            );
          });
        });
      });
    });

    describe('when the provider config in state contains a network type of "rpc"', () => {
      describe('if the provider config contains an RPC target', () => {
        it('sets the provider to a custom RPC provider initialized with the configured target, chain ID, nickname, and ticker', async () => {
          await withController(
            {
              state: {
                providerConfig: {
                  type: NetworkType.rpc,
                  chainId: '123',
                  nickname: 'some cool network',
                  rpcTarget: 'http://example.com',
                  ticker: 'ABC',
                },
              },
            },
            async ({ controller }) => {
              const fakeMetamaskProvider = buildFakeMetamaskProvider([
                {
                  request: {
                    method: 'eth_chainId',
                  },
                  response: {
                    result: '0x1337',
                  },
                },
              ]);
              createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

              await controller.initializeProvider();

              expect(createMetamaskProviderMock).toHaveBeenCalledWith({
                chainId: '123',
                engineParams: { pollingInterval: 12000 },
                nickname: 'some cool network',
                rpcUrl: 'http://example.com',
                ticker: 'ABC',
              });
              const { provider } = controller.getProviderAndBlockTracker();
              const promisifiedSendAsync = promisify(provider.sendAsync).bind(
                provider,
              );
              const chainIdResult = await promisifiedSendAsync({
                method: 'eth_chainId',
              });
              expect(chainIdResult.result).toBe('0x1337');
            },
          );
        });

        it('ensures that the existing provider is stopped while replacing it', async () => {
          await withController(
            {
              state: {
                providerConfig: buildProviderConfig({
                  type: NetworkType.rpc,
                  rpcTarget: 'http://example.com',
                }),
              },
            },
            async ({ controller }) => {
              const fakeMetamaskProviders = [
                buildFakeMetamaskProvider(),
                buildFakeMetamaskProvider(),
              ];
              jest.spyOn(fakeMetamaskProviders[0], 'stop');
              createMetamaskProviderMock
                .mockImplementationOnce(() => fakeMetamaskProviders[0])
                .mockImplementationOnce(() => fakeMetamaskProviders[1]);

              await controller.initializeProvider();
              await controller.initializeProvider();
              assert(controller.getProviderAndBlockTracker().provider);
              jest.runAllTimers();

              expect(fakeMetamaskProviders[0].stop).toHaveBeenCalled();
            },
          );
        });

        describe('when an "error" event occurs on the new provider', () => {
          describe('if the network version could not be retrieved while providerConfig was being set', () => {
            it('retrieves the network version twice more (due to the "error" event being listened to twice) and, assuming success, persists it to state', async () => {
              const messenger = buildMessenger();
              await withController(
                {
                  messenger,
                  state: {
                    providerConfig: buildProviderConfig({
                      type: NetworkType.rpc,
                      rpcTarget: 'http://example.com',
                    }),
                  },
                },
                async ({ controller }) => {
                  const fakeMetamaskProvider = buildFakeMetamaskProvider([
                    {
                      request: {
                        method: 'net_version',
                      },
                      response: {
                        error: 'oops',
                      },
                    },
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
                        method: 'net_version',
                      },
                      response: {
                        result: '2',
                      },
                    },
                  ]);
                  createMetamaskProviderMock.mockReturnValue(
                    fakeMetamaskProvider,
                  );

                  await waitForPublishedEvents(
                    messenger,
                    'NetworkController:providerConfigChange',
                    {
                      produceEvents: async () => {
                        await controller.initializeProvider();
                        assert(
                          controller.getProviderAndBlockTracker().provider,
                        );
                      },
                    },
                  );

                  await waitForStateChanges(messenger, {
                    propertyPath: ['networkId'],
                    count: 2,
                    produceStateChanges: () => {
                      controller
                        .getProviderAndBlockTracker()
                        .provider.emit('error', { some: 'error' });
                    },
                  });
                  expect(controller.state.networkId).toBe('2');
                },
              );
            });
          });

          describe('if the network version could be retrieved while providerConfig was being set', () => {
            it('does not retrieve the network version again', async () => {
              const messenger = buildMessenger();
              await withController(
                {
                  messenger,
                  state: {
                    providerConfig: buildProviderConfig({
                      type: NetworkType.rpc,
                      rpcTarget: 'http://example.com',
                    }),
                  },
                },
                async ({ controller }) => {
                  const fakeMetamaskProvider = buildFakeMetamaskProvider([
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
                        method: 'net_version',
                      },
                      response: {
                        result: '2',
                      },
                    },
                  ]);
                  createMetamaskProviderMock.mockReturnValue(
                    fakeMetamaskProvider,
                  );

                  await waitForPublishedEvents(
                    messenger,
                    'NetworkController:providerConfigChange',
                    {
                      produceEvents: async () => {
                        await controller.initializeProvider();
                        assert(
                          controller.getProviderAndBlockTracker().provider,
                        );
                      },
                    },
                  );

                  await waitForStateChanges(messenger, {
                    propertyPath: ['networkId'],
                    count: 0,
                    produceStateChanges: () => {
                      controller
                        .getProviderAndBlockTracker()
                        .provider.emit('error', { some: 'error' });
                    },
                  });
                  expect(controller.state.networkId).toBe('1');
                },
              );
            });
          });
        });
      });

      describe('if the RPC target is not set', () => {
        it('does not set a provider or block tracker', async () => {
          await withController(
            {
              state: {
                providerConfig: buildProviderConfig({
                  type: NetworkType.rpc,
                }),
              },
            },
            async ({ controller }) => {
              const fakeMetamaskProvider = buildFakeMetamaskProvider();
              createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

              await controller.initializeProvider();

              expect(createMetamaskProviderMock).not.toHaveBeenCalled();
              const { provider, blockTracker } =
                controller.getProviderAndBlockTracker();
              expect(provider).toBeUndefined();
              expect(blockTracker).toBeUndefined();
            },
          );
        });
      });
    });

    it('updates networkDetails.isEIP1559Compatible in state based on the latest block (assuming that the request for eth_getBlockByNumber is made successfully)', async () => {
      const messenger = buildMessenger();
      await withController(
        {
          messenger,
          state: {
            providerConfig: buildProviderConfig(),
          },
        },
        async ({ controller }) => {
          const fakeMetamaskProvider = buildFakeMetamaskProvider([
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
          createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

          await waitForStateChanges(messenger, {
            propertyPath: ['networkDetails', 'isEIP1559Compatible'],
            produceStateChanges: async () => {
              await controller.initializeProvider();
            },
          });

          expect(controller.state.networkDetails.isEIP1559Compatible).toBe(
            true,
          );
        },
      );
    });
  });

  describe('lookupNetwork', () => {
    describe('if a provider has not been set', () => {
      it('does not change network in state', async () => {
        const messenger = buildMessenger();
        await withController({ messenger }, async ({ controller }) => {
          const promiseForNetworkChanges = waitForStateChanges(messenger, {
            propertyPath: ['networkId'],
          });

          await controller.lookupNetwork();

          await expect(promiseForNetworkChanges).toNeverResolve();
        });
      });

      it('does not publish NetworkController:providerConfigChange', async () => {
        const messenger = buildMessenger();
        await withController({ messenger }, async ({ controller }) => {
          const promiseForProviderConfigChange = waitForPublishedEvents(
            messenger,
            'NetworkController:providerConfigChange',
          );

          await controller.lookupNetwork();

          await expect(promiseForProviderConfigChange).toNeverResolve();
        });
      });
    });

    describe('if a provider has been set', () => {
      describe('assuming that the version of the current network is different from the network in state', () => {
        it('updates the network in state to match', async () => {
          const messenger = buildMessenger();
          await withController(
            { messenger, state: { networkId: null } },
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

              await waitForStateChanges(messenger, {
                propertyPath: ['networkId'],
                produceStateChanges: async () => {
                  await controller.lookupNetwork();
                },
              });

              expect(controller.state.networkId).toBe('12345');
            },
          );
        });

        it("publishes NetworkController:providerConfigChange with the current provider config (even though it didn't change)", async () => {
          const messenger = buildMessenger();
          await withController(
            {
              messenger,
              state: {
                providerConfig: {
                  type: NetworkType.mainnet,
                  chainId: '1',
                },
              },
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

              const providerConfigChanges = await waitForPublishedEvents(
                messenger,
                'NetworkController:providerConfigChange',
                {
                  produceEvents: async () => {
                    await controller.lookupNetwork();
                  },
                },
              );

              expect(providerConfigChanges).toStrictEqual([
                [
                  {
                    type: NetworkType.mainnet,
                    chainId: '1',
                  },
                ],
              ]);
            },
          );
        });
      });

      describe('if the version of the current network is the same as that in state', () => {
        it('does not change network in state', async () => {
          const messenger = buildMessenger();
          await withController(
            { messenger, state: { networkId: '12345' } },
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
              const promiseForNetworkChanges = waitForStateChanges(messenger, {
                propertyPath: ['networkId'],
              });

              await controller.lookupNetwork();

              await expect(promiseForNetworkChanges).toNeverResolve();
            },
          );
        });

        it('does not publish NetworkController:providerConfigChange', async () => {
          const messenger = buildMessenger();
          await withController(
            { messenger, state: { networkId: '12345' } },
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
              const promiseForProviderConfigChange = waitForPublishedEvents(
                messenger,
                'NetworkController:providerConfigChange',
              );

              await controller.lookupNetwork();

              await expect(promiseForProviderConfigChange).toNeverResolve();
            },
          );
        });
      });

      describe('if an RPC error is encountered while retrieving the version of the current network', () => {
        it('updates the network in state to "unavailable"', async () => {
          const messenger = buildMessenger();
          await withController(
            { messenger, state: { networkId: '1' } },
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

              await waitForStateChanges(messenger, {
                propertyPath: ['networkId'],
                produceStateChanges: async () => {
                  await controller.lookupNetwork();
                },
              });

              expect(controller.state.networkStatus).toBe(
                NetworkStatus.Unavailable,
              );
            },
          );
        });

        it("publishes NetworkController:providerConfigChange with the current provider config (even though it didn't change)", async () => {
          const messenger = buildMessenger();
          await withController(
            {
              messenger,
              state: {
                providerConfig: {
                  type: NetworkType.mainnet,
                  chainId: '1',
                },
              },
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

              const providerConfigChanges = await waitForPublishedEvents(
                messenger,
                'NetworkController:providerConfigChange',
                {
                  produceEvents: async () => {
                    await controller.lookupNetwork();
                  },
                },
              );

              expect(providerConfigChanges).toStrictEqual([
                [
                  {
                    type: NetworkType.mainnet,
                    chainId: '1',
                  },
                ],
              ]);
            },
          );
        });
      });

      describe('if an internal error is encountered while retrieving the version of the current network', () => {
        it('updates the network in state to "unknown"', async () => {
          const messenger = buildMessenger();
          await withController(
            { messenger, state: { networkId: '1' } },
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

              await waitForStateChanges(messenger, {
                propertyPath: ['networkId'],
                produceStateChanges: async () => {
                  await controller.lookupNetwork();
                },
              });

              expect(controller.state.networkStatus).toBe(
                NetworkStatus.Unknown,
              );
            },
          );
        });

        it("publishes NetworkController:providerConfigChange with the current provider config (even though it didn't change)", async () => {
          const messenger = buildMessenger();
          await withController(
            {
              messenger,
              state: {
                providerConfig: {
                  type: NetworkType.mainnet,
                  chainId: '1',
                },
              },
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

              const providerConfigChanges = await waitForPublishedEvents(
                messenger,
                'NetworkController:providerConfigChange',
                {
                  produceEvents: async () => {
                    await controller.lookupNetwork();
                  },
                },
              );

              expect(providerConfigChanges).toStrictEqual([
                [
                  {
                    type: NetworkType.mainnet,
                    chainId: '1',
                  },
                ],
              ]);
            },
          );
        });
      });

      describe('if an invalid network ID is returned', () => {
        it('updates the network in state to "unknown"', async () => {
          const messenger = buildMessenger();
          await withController(
            { messenger, state: { networkId: '1' } },
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

              await waitForStateChanges(messenger, {
                propertyPath: ['networkId'],
                produceStateChanges: async () => {
                  await controller.lookupNetwork();
                },
              });

              expect(controller.state.networkStatus).toBe(
                NetworkStatus.Unknown,
              );
            },
          );
        });

        it("publishes NetworkController:providerConfigChange with the current provider config (even though it didn't change)", async () => {
          const messenger = buildMessenger();
          await withController(
            {
              messenger,
              state: {
                providerConfig: {
                  type: NetworkType.mainnet,
                  chainId: '1',
                },
              },
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

              const providerConfigChanges = await waitForPublishedEvents(
                messenger,
                'NetworkController:providerConfigChange',
                {
                  produceEvents: async () => {
                    await controller.lookupNetwork();
                  },
                },
              );

              expect(providerConfigChanges).toStrictEqual([
                [
                  {
                    type: NetworkType.mainnet,
                    chainId: '1',
                  },
                ],
              ]);
            },
          );
        });
      });

      describe('assuming that the network details of the current network are different from the network in state', () => {
        it('updates the network in state to match', async () => {
          const messenger = buildMessenger();
          await withController(
            {
              messenger,
              state: { networkDetails: { isEIP1559Compatible: false } },
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

              await controller.lookupNetwork();

              expect(controller.state.networkDetails).toStrictEqual({
                isEIP1559Compatible: true,
              });
            },
          );
        });
      });

      describe('if the network details of the current network are the same as that in state', () => {
        it('does not change network in state', async () => {
          const messenger = buildMessenger();
          await withController(
            {
              messenger,
              state: { networkDetails: { isEIP1559Compatible: true } },
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
              const promiseForNetworkDetailChanges = waitForStateChanges(
                messenger,
                {
                  propertyPath: ['networkDetails'],
                },
              );

              await controller.lookupNetwork();

              await expect(promiseForNetworkDetailChanges).toNeverResolve();
            },
          );
        });
      });

      describe('if an RPC error is encountered while retrieving the network details of the current network', () => {
        it('updates the network in state to "unavailable"', async () => {
          const messenger = buildMessenger();
          await withController(
            { messenger, state: { networkId: '1' } },
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

              await controller.lookupNetwork();

              expect(controller.state.networkStatus).toBe(
                NetworkStatus.Unavailable,
              );
            },
          );
        });
      });

      describe('if an internal error is encountered while retrieving the network details of the current network', () => {
        it('updates the network in state to "unknown"', async () => {
          const messenger = buildMessenger();
          await withController(
            { messenger, state: { networkId: '1' } },
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

              await controller.lookupNetwork();

              expect(controller.state.networkStatus).toBe(
                NetworkStatus.Unknown,
              );
            },
          );
        });
      });

      describe('if lookupNetwork is called multiple times in quick succession', () => {
        it('waits until each call finishes before resolving the next', async () => {
          const messenger = buildMessenger();
          await withController({ messenger }, async ({ controller }) => {
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
            const promiseForStateChanges = waitForStateChanges(messenger, {
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
  });

  describe('setProviderType', () => {
    [NetworkType.mainnet, NetworkType.goerli, NetworkType.sepolia].forEach(
      (networkType) => {
        describe(`given a network type of "${networkType}"`, () => {
          it('updates the provider config in state with the network type, the corresponding chain ID, and a special ticker, clearing any existing RPC target and nickname', async () => {
            const messenger = buildMessenger();
            await withController(
              {
                messenger,
                state: {
                  providerConfig: {
                    type: NetworkType.localhost,
                    rpcTarget: 'http://somethingexisting.com',
                    chainId: '99999',
                    ticker: 'something existing',
                    nickname: 'something existing',
                  },
                },
              },
              async ({ controller }) => {
                const fakeInfuraProvider = buildFakeInfuraProvider();
                createInfuraProviderMock.mockReturnValue(fakeInfuraProvider);
                const fakeInfuraSubprovider = buildFakeInfuraSubprovider();
                SubproviderMock.mockReturnValue(fakeInfuraSubprovider);
                const fakeMetamaskProvider = buildFakeMetamaskProvider();
                createMetamaskProviderMock.mockReturnValue(
                  fakeMetamaskProvider,
                );

                await controller.setProviderType(networkType);

                expect(controller.state.providerConfig).toStrictEqual({
                  type: networkType,
                  ...BUILT_IN_NETWORKS[networkType],
                  rpcTarget: undefined,
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
                const fakeInfuraProvider = buildFakeInfuraProvider();
                createInfuraProviderMock.mockReturnValue(fakeInfuraProvider);
                const fakeInfuraSubprovider = buildFakeInfuraSubprovider();
                SubproviderMock.mockReturnValue(fakeInfuraSubprovider);
                const fakeMetamaskProvider = buildFakeMetamaskProvider([
                  {
                    request: {
                      method: 'eth_chainId',
                    },
                    response: {
                      result: '0x1337',
                    },
                  },
                ]);
                createMetamaskProviderMock.mockReturnValue(
                  fakeMetamaskProvider,
                );

                await controller.setProviderType(networkType);

                expect(createInfuraProviderMock).toHaveBeenCalledWith({
                  network: networkType,
                  projectId: 'infura-project-id',
                });
                expect(createMetamaskProviderMock).toHaveBeenCalledWith({
                  dataSubprovider: fakeInfuraSubprovider,
                  engineParams: {
                    blockTrackerProvider: fakeInfuraProvider,
                    pollingInterval: 12000,
                  },
                });
                const { provider } = controller.getProviderAndBlockTracker();
                const promisifiedSendAsync = promisify(provider.sendAsync).bind(
                  provider,
                );
                const chainIdResult = await promisifiedSendAsync({
                  method: 'eth_chainId',
                });
                expect(chainIdResult.result).toBe('0x1337');
              },
            );
          });

          it('updates networkDetails.isEIP1559Compatible in state based on the latest block (assuming that the request for eth_getBlockByNumber is made successfully)', async () => {
            const messenger = buildMessenger();
            await withController(
              {
                messenger,
              },
              async ({ controller }) => {
                const fakeInfuraProvider = buildFakeInfuraProvider();
                createInfuraProviderMock.mockReturnValue(fakeInfuraProvider);
                const fakeInfuraSubprovider = buildFakeInfuraSubprovider();
                SubproviderMock.mockReturnValue(fakeInfuraSubprovider);
                const fakeMetamaskProvider = buildFakeMetamaskProvider([
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
                createMetamaskProviderMock.mockReturnValue(
                  fakeMetamaskProvider,
                );

                await controller.setProviderType(networkType);

                expect(
                  controller.state.networkDetails.isEIP1559Compatible,
                ).toBe(true);
              },
            );
          });

          it('ensures that the existing provider is stopped while replacing it', async () => {
            await withController(async ({ controller }) => {
              const fakeInfuraProvider = buildFakeInfuraProvider();
              createInfuraProviderMock.mockReturnValue(fakeInfuraProvider);
              const fakeInfuraSubprovider = buildFakeInfuraSubprovider();
              SubproviderMock.mockReturnValue(fakeInfuraSubprovider);
              const fakeMetamaskProviders = [
                buildFakeMetamaskProvider(),
                buildFakeMetamaskProvider(),
              ];
              jest.spyOn(fakeMetamaskProviders[0], 'stop');
              createMetamaskProviderMock
                .mockImplementationOnce(() => fakeMetamaskProviders[0])
                .mockImplementationOnce(() => fakeMetamaskProviders[1]);

              await controller.setProviderType(networkType);
              await controller.setProviderType(networkType);
              assert(controller.getProviderAndBlockTracker().provider);
              jest.runAllTimers();

              expect(fakeMetamaskProviders[0].stop).toHaveBeenCalled();
            });
          });

          it('updates the version of the current network in state (assuming that the request for net_version is made successfully)', async () => {
            const messenger = buildMessenger();
            await withController({ messenger }, async ({ controller }) => {
              const fakeInfuraProvider = buildFakeInfuraProvider();
              createInfuraProviderMock.mockReturnValue(fakeInfuraProvider);
              const fakeInfuraSubprovider = buildFakeInfuraSubprovider();
              SubproviderMock.mockReturnValue(fakeInfuraSubprovider);
              const fakeMetamaskProvider = buildFakeMetamaskProvider([
                {
                  request: {
                    method: 'net_version',
                    params: [],
                  },
                  response: {
                    result: '42',
                  },
                },
              ]);
              createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

              await controller.setProviderType(networkType);

              expect(controller.state.networkId).toBe('42');
            });
          });

          describe('when an "error" event occurs on the new provider', () => {
            describe('if the network version could not be retrieved during setProviderType', () => {
              it('retrieves the network version again and, assuming success, persists it to state', async () => {
                const messenger = buildMessenger();
                await withController({ messenger }, async ({ controller }) => {
                  const fakeInfuraProvider = buildFakeInfuraProvider();
                  createInfuraProviderMock.mockReturnValue(fakeInfuraProvider);
                  const fakeInfuraSubprovider = buildFakeInfuraSubprovider();
                  SubproviderMock.mockReturnValue(fakeInfuraSubprovider);
                  const fakeMetamaskProvider = buildFakeMetamaskProvider([
                    {
                      request: {
                        method: 'net_version',
                      },
                      response: {
                        error: 'oops',
                      },
                    },
                    {
                      request: {
                        method: 'net_version',
                      },
                      response: {
                        result: '42',
                      },
                    },
                  ]);
                  createMetamaskProviderMock.mockReturnValue(
                    fakeMetamaskProvider,
                  );

                  await controller.setProviderType(networkType);

                  await waitForStateChanges(messenger, {
                    propertyPath: ['networkId'],
                    produceStateChanges: () => {
                      controller
                        .getProviderAndBlockTracker()
                        .provider.emit('error', { some: 'error' });
                    },
                  });
                  expect(controller.state.networkId).toBe('42');
                });
              });
            });

            describe('if the network version could be retrieved during setProviderType', () => {
              it('does not retrieve the network version again', async () => {
                const messenger = buildMessenger();
                await withController({ messenger }, async ({ controller }) => {
                  const fakeInfuraProvider = buildFakeInfuraProvider();
                  createInfuraProviderMock.mockReturnValue(fakeInfuraProvider);
                  const fakeInfuraSubprovider = buildFakeInfuraSubprovider();
                  SubproviderMock.mockReturnValue(fakeInfuraSubprovider);
                  const fakeMetamaskProvider = buildFakeMetamaskProvider([
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
                        method: 'net_version',
                      },
                      response: {
                        result: '2',
                      },
                    },
                  ]);
                  createMetamaskProviderMock.mockReturnValue(
                    fakeMetamaskProvider,
                  );

                  await controller.setProviderType(networkType);

                  await waitForStateChanges(messenger, {
                    propertyPath: ['networkId'],
                    count: 0,
                    produceStateChanges: () => {
                      controller
                        .getProviderAndBlockTracker()
                        .provider.emit('error', { some: 'error' });
                    },
                  });
                  expect(controller.state.networkId).toBe('1');
                });
              });
            });
          });
        });
      },
    );

    describe('given a network type of "rpc"', () => {
      it('updates the provider config in state with the network type, using "ETH" for the ticker and an empty string for the chain id and clearing any existing RPC target and nickname', async () => {
        const messenger = buildMessenger();
        await withController(
          {
            messenger,
            state: {
              providerConfig: {
                type: NetworkType.localhost,
                rpcTarget: 'http://somethingexisting.com',
                chainId: '99999',
                ticker: 'something existing',
                nickname: 'something existing',
              },
            },
          },
          async ({ controller }) => {
            const fakeMetamaskProvider = buildFakeMetamaskProvider();
            createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

            await controller.setProviderType(NetworkType.rpc);

            expect(controller.state.providerConfig).toStrictEqual({
              type: NetworkType.rpc,
              ticker: 'ETH',
              chainId: '',
              rpcTarget: undefined,
              nickname: undefined,
              id: undefined,
              rpcPrefs: undefined,
            });
          },
        );
      });

      it("doesn't set a provider (because the RPC target is cleared)", async () => {
        await withController(async ({ controller }) => {
          const fakeMetamaskProvider = buildFakeMetamaskProvider();
          createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

          await controller.setProviderType(NetworkType.rpc);

          expect(createMetamaskProviderMock).not.toHaveBeenCalled();
          expect(
            controller.getProviderAndBlockTracker().provider,
          ).toBeUndefined();
        });
      });

      it('does not update networkDetails.isEIP1559Compatible in state based on the latest block (because the RPC target is cleared)', async () => {
        const messenger = buildMessenger();
        await withController(
          {
            messenger,
          },
          async ({ controller }) => {
            const fakeMetamaskProvider = buildFakeMetamaskProvider([
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
            createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

            await controller.setProviderType(NetworkType.rpc);

            expect(
              controller.state.networkDetails.isEIP1559Compatible,
            ).toBeUndefined();
          },
        );
      });
    });

    describe('given a network type of "localhost"', () => {
      it('updates the provider config in state with the network type, using "ETH" for the ticker and an empty string for the chain id and clearing any existing RPC target and nickname', async () => {
        const messenger = buildMessenger();
        await withController(
          {
            messenger,
            state: {
              providerConfig: {
                type: NetworkType.localhost,
                rpcTarget: 'http://somethingexisting.com',
                chainId: '99999',
                ticker: 'something existing',
                nickname: 'something existing',
              },
            },
          },
          async ({ controller }) => {
            const fakeMetamaskProvider = buildFakeMetamaskProvider();
            createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

            await controller.setProviderType(NetworkType.localhost);

            expect(controller.state.providerConfig).toStrictEqual({
              type: NetworkType.localhost,
              ticker: 'ETH',
              chainId: '',
              rpcTarget: undefined,
              nickname: undefined,
              id: undefined,
              rpcPrefs: undefined,
            });
          },
        );
      });

      it('sets the provider to a custom RPC provider pointed to localhost, leaving chain ID undefined', async () => {
        await withController(async ({ controller }) => {
          const fakeMetamaskProvider = buildFakeMetamaskProvider([
            {
              request: {
                method: 'eth_chainId',
              },
              response: {
                result: '0x1337',
              },
            },
          ]);
          createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

          await controller.setProviderType(NetworkType.localhost);

          expect(createMetamaskProviderMock).toHaveBeenCalledWith({
            chainId: undefined,
            engineParams: { pollingInterval: 12000 },
            nickname: undefined,
            rpcUrl: 'http://localhost:8545',
            ticker: undefined,
          });
          const { provider } = controller.getProviderAndBlockTracker();
          const promisifiedSendAsync = promisify(provider.sendAsync).bind(
            provider,
          );
          const chainIdResult = await promisifiedSendAsync({
            method: 'eth_chainId',
          });
          expect(chainIdResult.result).toBe('0x1337');
        });
      });

      it('updates networkDetails.isEIP1559Compatible in state based on the latest block (assuming that the request eth_getBlockByNumber is made successfully)', async () => {
        const messenger = buildMessenger();
        await withController({ messenger }, async ({ controller }) => {
          const fakeMetamaskProvider = buildFakeMetamaskProvider([
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
          createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

          await controller.setProviderType(NetworkType.localhost);

          expect(controller.state.networkDetails.isEIP1559Compatible).toBe(
            true,
          );
        });
      });

      it('ensures that the existing provider is stopped while replacing it', async () => {
        await withController(async ({ controller }) => {
          const fakeMetamaskProviders = [
            buildFakeMetamaskProvider(),
            buildFakeMetamaskProvider(),
          ];
          jest.spyOn(fakeMetamaskProviders[0], 'stop');
          createMetamaskProviderMock
            .mockImplementationOnce(() => fakeMetamaskProviders[0])
            .mockImplementationOnce(() => fakeMetamaskProviders[1]);

          await controller.setProviderType(NetworkType.localhost);
          await controller.setProviderType(NetworkType.localhost);
          assert(controller.getProviderAndBlockTracker().provider);
          jest.runAllTimers();

          expect(fakeMetamaskProviders[0].stop).toHaveBeenCalled();
        });
      });

      it('updates the version of the current network in state (assuming that the request for net_version is made successfully)', async () => {
        const messenger = buildMessenger();
        await withController({ messenger }, async ({ controller }) => {
          const fakeMetamaskProvider = buildFakeMetamaskProvider([
            {
              request: {
                method: 'net_version',
                params: [],
              },
              response: {
                result: '42',
              },
            },
          ]);
          createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

          await controller.setProviderType(NetworkType.localhost);

          expect(controller.state.networkId).toBe('42');
        });
      });

      describe('when an "error" event occurs on the new provider', () => {
        describe('if the network version could not be retrieved during setProviderType', () => {
          it('retrieves the network version again and, assuming success, persists it to state', async () => {
            const messenger = buildMessenger();
            await withController({ messenger }, async ({ controller }) => {
              const fakeMetamaskProvider = buildFakeMetamaskProvider([
                {
                  request: {
                    method: 'net_version',
                  },
                  response: {
                    error: 'oops',
                  },
                },
                {
                  request: {
                    method: 'net_version',
                  },
                  response: {
                    result: '42',
                  },
                },
              ]);
              createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

              await controller.setProviderType(NetworkType.localhost);

              await waitForStateChanges(messenger, {
                propertyPath: ['networkId'],
                produceStateChanges: () => {
                  controller
                    .getProviderAndBlockTracker()
                    .provider.emit('error', { some: 'error' });
                },
              });
              expect(controller.state.networkId).toBe('42');
            });
          });
        });

        describe('if the network version could be retrieved during setProviderType', () => {
          it('does not retrieve the network version again', async () => {
            const messenger = buildMessenger();
            await withController({ messenger }, async ({ controller }) => {
              const fakeMetamaskProvider = buildFakeMetamaskProvider([
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
                    method: 'net_version',
                  },
                  response: {
                    result: '2',
                  },
                },
              ]);
              createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

              await controller.setProviderType(NetworkType.localhost);

              await waitForStateChanges(messenger, {
                propertyPath: ['networkId'],
                count: 0,
                produceStateChanges: () => {
                  controller
                    .getProviderAndBlockTracker()
                    .provider.emit('error', { some: 'error' });
                },
              });
              expect(controller.state.networkId).toBe('1');
            });
          });
        });
      });
    });
  });

  describe('setActiveNetwork', () => {
    it('updates the provider config in state with the rpcTarget and chainId, clearing the previous provider details', async () => {
      const messenger = buildMessenger();
      await withController(
        {
          messenger,
          state: {
            providerConfig: {
              type: NetworkType.localhost,
              rpcTarget: 'http://somethingexisting.com',
              chainId: '99999',
              ticker: 'something existing',
              nickname: 'something existing',
              rpcPrefs: undefined,
            },
            networkConfigurations: {
              testNetworkConfigurationId: {
                rpcUrl: 'https://mock-rpc-url',
                chainId: '0xtest',
                ticker: 'TEST',
                id: 'testNetworkConfigurationId',
                rpcPrefs: undefined,
              },
              testNetworkConfigurationId2: {
                rpcUrl: 'http://somethingexisting.com',
                chainId: '99999',
                ticker: 'something existing',
                nickname: 'something existing',
                id: 'testNetworkConfigurationId2',
                rpcPrefs: undefined,
              },
            },
          },
        },
        async ({ controller }) => {
          const fakeMetamaskProvider = buildFakeMetamaskProvider();
          createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

          await controller.setActiveNetwork('testNetworkConfigurationId');

          expect(controller.state.providerConfig).toStrictEqual({
            type: 'rpc',
            rpcTarget: 'https://mock-rpc-url',
            chainId: '0xtest',
            ticker: 'TEST',
            id: 'testNetworkConfigurationId',
            nickname: undefined,
            rpcPrefs: undefined,
          });
        },
      );
    });

    it('sets the provider to a custom RPC provider initialized with the RPC target and chain ID, leaving nickname and ticker undefined', async () => {
      const messenger = buildMessenger();
      await withController(
        {
          messenger,
          state: {
            networkConfigurations: {
              testNetworkConfigurationId: {
                rpcUrl: 'https://mock-rpc-url',
                chainId: '0xtest',
                ticker: 'TEST',
                id: 'testNetworkConfigurationId',
                nickname: undefined,
                rpcPrefs: undefined,
              },
            },
          },
        },
        async ({ controller }) => {
          const fakeMetamaskProvider = buildFakeMetamaskProvider([
            {
              request: {
                method: 'eth_chainId',
              },
              response: {
                result: '0x1337',
              },
            },
          ]);
          createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

          await controller.setActiveNetwork('testNetworkConfigurationId');

          expect(createMetamaskProviderMock).toHaveBeenCalledWith({
            rpcUrl: 'https://mock-rpc-url',
            chainId: '0xtest',
            ticker: 'TEST',
            nickname: undefined,
            engineParams: { pollingInterval: 12000 },
          });
          const { provider } = controller.getProviderAndBlockTracker();
          const promisifiedSendAsync = promisify(provider.sendAsync).bind(
            provider,
          );
          const chainIdResult = await promisifiedSendAsync({
            method: 'eth_chainId',
          });
          expect(chainIdResult.result).toBe('0x1337');
        },
      );
    });

    it('updates networkDetails.isEIP1559Compatible in state based on the latest block (assuming that the request for eth_getBlockByNumber is made successfully)', async () => {
      const messenger = buildMessenger();
      await withController(
        {
          messenger,
          state: {
            networkConfigurations: {
              testNetworkConfigurationId: {
                rpcUrl: 'https://mock-rpc-url',
                chainId: '0xtest',
                ticker: 'TEST',
                id: 'testNetworkConfigurationId',
                nickname: undefined,
                rpcPrefs: undefined,
              },
            },
          },
        },
        async ({ controller }) => {
          const fakeMetamaskProvider = buildFakeMetamaskProvider([
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
          createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

          await controller.setActiveNetwork('testNetworkConfigurationId');

          expect(controller.state.networkDetails.isEIP1559Compatible).toBe(
            true,
          );
        },
      );
    });

    it('ensures that the existing provider is stopped while replacing it', async () => {
      const messenger = buildMessenger();
      await withController(
        {
          messenger,
          state: {
            networkConfigurations: {
              testNetworkConfigurationId: {
                rpcUrl: 'https://mock-rpc-url',
                chainId: '0xtest',
                ticker: 'TEST',
                id: 'testNetworkConfigurationId',
                nickname: undefined,
                rpcPrefs: undefined,
              },
            },
          },
        },
        async ({ controller }) => {
          const fakeMetamaskProviders = [
            buildFakeMetamaskProvider(),
            buildFakeMetamaskProvider(),
          ];
          jest.spyOn(fakeMetamaskProviders[0], 'stop');
          createMetamaskProviderMock
            .mockImplementationOnce(() => fakeMetamaskProviders[0])
            .mockImplementationOnce(() => fakeMetamaskProviders[1]);

          await controller.setActiveNetwork('testNetworkConfigurationId');
          await controller.setActiveNetwork('testNetworkConfigurationId');
          assert(controller.getProviderAndBlockTracker().provider);
          jest.runAllTimers();

          expect(fakeMetamaskProviders[0].stop).toHaveBeenCalled();
        },
      );
    });

    it('updates the version of the current network in state (assuming that the request for net_version is made successfully)', async () => {
      const messenger = buildMessenger();
      await withController(
        {
          messenger,
          state: {
            networkConfigurations: {
              testNetworkConfigurationId: {
                rpcUrl: 'https://mock-rpc-url',
                chainId: '0xtest',
                ticker: 'TEST',
                id: 'testNetworkConfigurationId',
                nickname: undefined,
                rpcPrefs: undefined,
              },
            },
          },
        },
        async ({ controller }) => {
          const fakeMetamaskProvider = buildFakeMetamaskProvider([
            {
              request: {
                method: 'net_version',
                params: [],
              },
              response: {
                result: '42',
              },
            },
          ]);
          createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

          await controller.setActiveNetwork('testNetworkConfigurationId');

          expect(controller.state.networkId).toBe('42');
        },
      );
    });

    describe('when an "error" event occurs on the new provider', () => {
      describe('if the network version could not be retrieved during the call to setActiveNetwork', () => {
        it('retrieves the network version again and, assuming success, persists it to state', async () => {
          const messenger = buildMessenger();
          await withController(
            {
              messenger,
              state: {
                networkConfigurations: {
                  testNetworkConfigurationId: {
                    rpcUrl: 'https://mock-rpc-url',
                    chainId: '0xtest',
                    ticker: 'TEST',
                    id: 'testNetworkConfigurationId',
                    nickname: undefined,
                    rpcPrefs: undefined,
                  },
                },
              },
            },
            async ({ controller }) => {
              const fakeMetamaskProvider = buildFakeMetamaskProvider([
                {
                  request: {
                    method: 'net_version',
                  },
                  response: {
                    error: 'oops',
                  },
                },
                {
                  request: {
                    method: 'net_version',
                  },
                  response: {
                    result: '42',
                  },
                },
              ]);
              createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

              await controller.setActiveNetwork('testNetworkConfigurationId');

              await waitForStateChanges(messenger, {
                propertyPath: ['networkId'],
                produceStateChanges: () => {
                  controller
                    .getProviderAndBlockTracker()
                    .provider.emit('error', { some: 'error' });
                },
              });
              expect(controller.state.networkId).toBe('42');
            },
          );
        });
      });

      describe('if the network version could be retrieved during the call to setActiveNetwork', () => {
        it('does not retrieve the network version again', async () => {
          const messenger = buildMessenger();
          await withController(
            {
              messenger,
              state: {
                networkConfigurations: {
                  testNetworkConfigurationId: {
                    rpcUrl: 'https://mock-rpc-url',
                    chainId: '0xtest',
                    ticker: 'TEST',
                    id: 'testNetworkConfigurationId',
                    nickname: undefined,
                    rpcPrefs: undefined,
                  },
                },
              },
            },
            async ({ controller }) => {
              const fakeMetamaskProvider = buildFakeMetamaskProvider([
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
                    method: 'net_version',
                  },
                  response: {
                    result: '2',
                  },
                },
              ]);
              createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

              await controller.setActiveNetwork('testNetworkConfigurationId');

              await waitForStateChanges(messenger, {
                propertyPath: ['networkId'],
                count: 0,
                produceStateChanges: () => {
                  controller
                    .getProviderAndBlockTracker()
                    .provider.emit('error', { some: 'error' });
                },
              });
              expect(controller.state.networkId).toBe('1');
            },
          );
        });
      });
    });
  });

  describe('getEIP1559Compatibility', () => {
    describe('if the state does not have a "networkDetails" property', () => {
      describe('if no error is thrown while fetching the latest block', () => {
        describe('if the block has a "baseFeePerGas" property', () => {
          it('updates isEIP1559Compatible in state to true', async () => {
            const messenger = buildMessenger();
            await withController(
              {
                messenger,
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

                await waitForStateChanges(messenger, {
                  propertyPath: ['networkDetails', 'isEIP1559Compatible'],
                  produceStateChanges: async () => {
                    await controller.getEIP1559Compatibility();
                  },
                });

                expect(
                  controller.state.networkDetails.isEIP1559Compatible,
                ).toBe(true);
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
          it('does not change networkDetails.isEIP1559Compatible in state', async () => {
            const messenger = buildMessenger();
            await withController(
              {
                messenger,
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
                const promiseForIsEIP1559CompatibleChanges =
                  waitForStateChanges(messenger, {
                    propertyPath: ['networkDetails', 'isEIP1559Compatible'],
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
        it('does not change networkDetails.isEIP1559Compatible in state', async () => {
          const messenger = buildMessenger();
          await withController(
            {
              messenger,
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
              const promiseForIsEIP1559CompatibleChanges = waitForStateChanges(
                messenger,
                {
                  propertyPath: ['networkDetails', 'isEIP1559Compatible'],
                },
              );

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

    describe('if the state has a "networkDetails" property, but it does not have an "isEIP1559Compatible" property', () => {
      describe('if no error is thrown while fetching the latest block', () => {
        describe('if the block has a "baseFeePerGas" property', () => {
          it('updates isEIP1559Compatible in state to true', async () => {
            const messenger = buildMessenger();
            await withController(
              {
                messenger,
                state: {
                  networkDetails: {
                    // no "isEIP1559Compatible" property
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

                await waitForStateChanges(messenger, {
                  propertyPath: ['networkDetails', 'isEIP1559Compatible'],
                  produceStateChanges: async () => {
                    await controller.getEIP1559Compatibility();
                  },
                });

                expect(
                  controller.state.networkDetails.isEIP1559Compatible,
                ).toBe(true);
              },
            );
          });

          it('returns a promise that resolves to true', async () => {
            await withController(
              {
                state: {
                  networkDetails: {
                    // no "isEIP1559Compatible" property
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
          it('updates isEIP1559Compatible in state to false', async () => {
            const messenger = buildMessenger();
            await withController(
              {
                messenger,
                state: {
                  networkDetails: {
                    // no "isEIP1559Compatible" property
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

                await waitForStateChanges(messenger, {
                  propertyPath: ['networkDetails', 'isEIP1559Compatible'],
                  produceStateChanges: async () => {
                    await controller.getEIP1559Compatibility();
                  },
                });

                expect(
                  controller.state.networkDetails.isEIP1559Compatible,
                ).toBe(false);
              },
            );
          });

          it('returns a promise that resolves to false', async () => {
            await withController(
              {
                state: {
                  networkDetails: {
                    // no "isEIP1559Compatible" property
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
        it('does not change networkDetails.isEIP1559Compatible in state', async () => {
          const messenger = buildMessenger();
          await withController(
            {
              messenger,
              state: {
                networkDetails: {
                  // no "isEIP1559Compatible" property
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
              const promiseForIsEIP1559CompatibleChanges = waitForStateChanges(
                messenger,
                {
                  propertyPath: ['networkDetails', 'isEIP1559Compatible'],
                },
              );

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
                  // no "isEIP1559Compatible" property
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

    describe('if isEIP1559Compatible in state is set to false', () => {
      describe('if no error is thrown while fetching the latest block', () => {
        describe('if the block has a "baseFeePerGas" property', () => {
          it('updates isEIP1559Compatible in state to true', async () => {
            const messenger = buildMessenger();
            await withController(
              {
                messenger,
                state: {
                  networkDetails: {
                    isEIP1559Compatible: false,
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

                await waitForStateChanges(messenger, {
                  propertyPath: ['networkDetails', 'isEIP1559Compatible'],
                  produceStateChanges: async () => {
                    await controller.getEIP1559Compatibility();
                  },
                });

                expect(
                  controller.state.networkDetails.isEIP1559Compatible,
                ).toBe(true);
              },
            );
          });

          it('returns a promise that resolves to true', async () => {
            await withController(
              {
                state: {
                  networkDetails: {
                    isEIP1559Compatible: false,
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
          it('does not change networkDetails.isEIP1559Compatible in state', async () => {
            const messenger = buildMessenger();
            await withController(
              {
                messenger,
                state: {
                  networkDetails: {
                    isEIP1559Compatible: false,
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
                const promiseForIsEIP1559CompatibleChanges =
                  waitForStateChanges(messenger, {
                    propertyPath: ['networkDetails', 'isEIP1559Compatible'],
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
                    isEIP1559Compatible: false,
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
        it('does not change networkDetails.isEIP1559Compatible in state', async () => {
          const messenger = buildMessenger();
          await withController(
            {
              messenger,
              state: {
                networkDetails: {
                  isEIP1559Compatible: false,
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
              const promiseForIsEIP1559CompatibleChanges = waitForStateChanges(
                messenger,
                {
                  propertyPath: ['networkDetails', 'isEIP1559Compatible'],
                },
              );

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
                  isEIP1559Compatible: false,
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

    describe('if isEIP1559Compatible in state is set to true', () => {
      it('does not change networkDetails.isEIP1559Compatible in state', async () => {
        const messenger = buildMessenger();
        await withController(
          {
            messenger,
            state: {
              networkDetails: {
                isEIP1559Compatible: true,
              },
            },
          },
          async ({ controller }) => {
            await setFakeProvider(controller, {
              stubGetEIP1559CompatibilityWhileSetting: true,
            });
            const promiseForIsEIP1559CompatibleChanges = waitForStateChanges(
              messenger,
              { propertyPath: ['networkDetails', 'isEIP1559Compatible'] },
            );

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
                isEIP1559Compatible: true,
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
            const messenger = buildMessenger();
            await withController(
              {
                messenger,
                state: {
                  providerConfig: {
                    type: networkType,
                    // NOTE: This doesn't need to match the logical chain ID of
                    // the network selected, it just needs to exist
                    chainId: '0x9999999',
                  },
                },
              },
              async ({ controller }) => {
                const fakeInfuraProvider = buildFakeInfuraProvider();
                createInfuraProviderMock.mockReturnValue(fakeInfuraProvider);
                const fakeInfuraSubprovider = buildFakeInfuraSubprovider();
                SubproviderMock.mockReturnValue(fakeInfuraSubprovider);
                const fakeMetamaskProvider = buildFakeMetamaskProvider([
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
                createMetamaskProviderMock.mockReturnValue(
                  fakeMetamaskProvider,
                );
                await controller.initializeProvider();
                expect(controller.state.networkStatus).toBe(
                  NetworkStatus.Available,
                );

                await waitForStateChanges(messenger, {
                  propertyPath: ['networkStatus'],
                  // We only care about the first state change, because it
                  // happens before the network lookup
                  count: 1,
                  produceStateChanges: () => {
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
            const messenger = buildMessenger();
            await withController(
              {
                messenger,
                state: {
                  providerConfig: {
                    type: networkType,
                    // NOTE: This doesn't need to match the logical chain ID of
                    // the network selected, it just needs to exist
                    chainId: '0x9999999',
                  },
                },
              },
              async ({ controller }) => {
                const fakeInfuraProvider = buildFakeInfuraProvider();
                createInfuraProviderMock.mockReturnValue(fakeInfuraProvider);
                const fakeInfuraSubprovider = buildFakeInfuraSubprovider();
                SubproviderMock.mockReturnValue(fakeInfuraSubprovider);
                const fakeMetamaskProvider = buildFakeMetamaskProvider([
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
                createMetamaskProviderMock.mockReturnValue(
                  fakeMetamaskProvider,
                );
                await controller.initializeProvider();
                expect(controller.state.networkDetails).toStrictEqual({
                  isEIP1559Compatible: false,
                });

                await waitForStateChanges(messenger, {
                  propertyPath: ['networkDetails'],
                  // We only care about the first state change, because it
                  // happens before the network lookup
                  count: 1,
                  produceStateChanges: () => {
                    controller.resetConnection();
                  },
                });

                expect(controller.state.networkDetails).toStrictEqual({});
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
                    chainId: '0x9999999',
                  },
                },
                infuraProjectId: 'infura-project-id',
              },
              async ({ controller }) => {
                const fakeInfuraProvider = buildFakeInfuraProvider();
                createInfuraProviderMock.mockReturnValue(fakeInfuraProvider);
                const fakeInfuraSubprovider = buildFakeInfuraSubprovider();
                SubproviderMock.mockReturnValue(fakeInfuraSubprovider);
                const fakeMetamaskProvider = buildFakeMetamaskProvider([
                  {
                    request: {
                      method: 'eth_chainId',
                    },
                    response: {
                      result: '0x1337',
                    },
                  },
                ]);
                createMetamaskProviderMock.mockReturnValue(
                  fakeMetamaskProvider,
                );

                controller.resetConnection();

                const { provider } = controller.getProviderAndBlockTracker();
                const promisifiedSendAsync = promisify(provider.sendAsync).bind(
                  provider,
                );
                const { result: chainIdResult } = await promisifiedSendAsync({
                  method: 'eth_chainId',
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
                    chainId: '0x9999999',
                  },
                },
              },
              async ({ controller }) => {
                const fakeInfuraProvider = buildFakeInfuraProvider();
                createInfuraProviderMock.mockReturnValue(fakeInfuraProvider);
                const fakeInfuraSubprovider = buildFakeInfuraSubprovider();
                SubproviderMock.mockReturnValue(fakeInfuraSubprovider);
                const fakeMetamaskProvider = buildFakeMetamaskProvider();
                createMetamaskProviderMock.mockReturnValue(
                  fakeMetamaskProvider,
                );

                await controller.initializeProvider();

                const { provider: providerBefore } =
                  controller.getProviderAndBlockTracker();
                controller.resetConnection();
                const { provider: providerAfter } =
                  controller.getProviderAndBlockTracker();

                expect(providerBefore).toBe(providerAfter);
              },
            );
          });

          it('ensures that the existing provider is stopped while replacing it', async () => {
            await withController(
              {
                state: {
                  providerConfig: {
                    type: networkType,
                    // NOTE: This doesn't need to match the logical chain ID of
                    // the network selected, it just needs to exist
                    chainId: '0x9999999',
                  },
                },
              },
              ({ controller }) => {
                const fakeInfuraProvider = buildFakeInfuraProvider();
                createInfuraProviderMock.mockReturnValue(fakeInfuraProvider);
                const fakeInfuraSubprovider = buildFakeInfuraSubprovider();
                SubproviderMock.mockReturnValue(fakeInfuraSubprovider);
                const fakeMetamaskProviders = [
                  buildFakeMetamaskProvider(),
                  buildFakeMetamaskProvider(),
                ];
                jest.spyOn(fakeMetamaskProviders[0], 'stop');
                createMetamaskProviderMock
                  .mockImplementationOnce(() => fakeMetamaskProviders[0])
                  .mockImplementationOnce(() => fakeMetamaskProviders[1]);

                controller.resetConnection();
                controller.resetConnection();
                assert(controller.getProviderAndBlockTracker().provider);
                jest.runAllTimers();

                expect(fakeMetamaskProviders[0].stop).toHaveBeenCalled();
              },
            );
          });

          it('checks the status of the network again, updating state appropriately', async () => {
            const messenger = buildMessenger();
            await withController(
              {
                messenger,
                state: {
                  providerConfig: {
                    type: networkType,
                    // NOTE: This doesn't need to match the logical chain ID of
                    // the network selected, it just needs to exist
                    chainId: '0x9999999',
                  },
                },
              },
              async ({ controller }) => {
                const fakeInfuraProvider = buildFakeInfuraProvider();
                createInfuraProviderMock.mockReturnValue(fakeInfuraProvider);
                const fakeInfuraSubprovider = buildFakeInfuraSubprovider();
                SubproviderMock.mockReturnValue(fakeInfuraSubprovider);
                const fakeMetamaskProvider = buildFakeMetamaskProvider();
                createMetamaskProviderMock.mockReturnValue(
                  fakeMetamaskProvider,
                );
                await controller.initializeProvider();

                await waitForStateChanges(messenger, {
                  propertyPath: ['networkStatus'],
                  // We need to wait for the second state change, which happens
                  // during the network lookup after the state is initially cleared
                  count: 2,
                  produceStateChanges: () => {
                    controller.resetConnection();
                  },
                });

                expect(controller.state.networkStatus).toBe(
                  NetworkStatus.Available,
                );
              },
            );
          });

          it('checks whether the network supports EIP-1559 again, updating state appropriately', async () => {
            const messenger = buildMessenger();
            await withController(
              {
                messenger,
                state: {
                  providerConfig: {
                    type: networkType,
                    // NOTE: This doesn't need to match the logical chain ID of
                    // the network selected, it just needs to exist
                    chainId: '0x9999999',
                  },
                  networkDetails: {
                    isEIP1559Compatible: false,
                  },
                },
              },
              async ({ controller }) => {
                const fakeInfuraProvider = buildFakeInfuraProvider();
                createInfuraProviderMock.mockReturnValue(fakeInfuraProvider);
                const fakeInfuraSubprovider = buildFakeInfuraSubprovider();
                SubproviderMock.mockReturnValue(fakeInfuraSubprovider);
                const fakeMetamaskProvider = buildFakeMetamaskProvider([
                  {
                    request: {
                      method: 'eth_getBlockByNumber',
                    },
                    response: {
                      result: POST_1559_BLOCK,
                    },
                  },
                ]);
                createMetamaskProviderMock.mockReturnValue(
                  fakeMetamaskProvider,
                );

                await waitForStateChanges(messenger, {
                  propertyPath: ['networkDetails'],
                  // We need to wait for the second state change, which happens
                  // during the network lookup after the state is initially cleared
                  count: 2,
                  produceStateChanges: () => {
                    controller.resetConnection();
                  },
                });

                expect(controller.state.networkDetails).toStrictEqual({
                  isEIP1559Compatible: true,
                });
              },
            );
          });

          describe('when an "error" event occurs on the new provider', () => {
            it('retrieves the network version and, assuming success, persists it to state', async () => {
              const messenger = buildMessenger();
              await withController(
                {
                  messenger,
                  state: {
                    providerConfig: {
                      type: networkType,
                      // NOTE: This doesn't need to match the logical chain ID of
                      // the network selected, it just needs to exist
                      chainId: '0x9999999',
                    },
                  },
                },
                async ({ controller }) => {
                  const fakeMetamaskProvider = buildFakeMetamaskProvider([
                    {
                      request: {
                        method: 'net_version',
                      },
                      response: {
                        result: '42',
                      },
                    },
                  ]);
                  createMetamaskProviderMock.mockReturnValue(
                    fakeMetamaskProvider,
                  );

                  controller.resetConnection();
                  assert(controller.getProviderAndBlockTracker().provider);

                  expect(controller.state.networkStatus).toBe(
                    NetworkStatus.Unknown,
                  );

                  await waitForStateChanges(messenger, {
                    propertyPath: ['networkId'],
                    produceStateChanges: () => {
                      controller
                        .getProviderAndBlockTracker()
                        .provider.emit('error', { some: 'error' });
                    },
                  });

                  expect(controller.state.networkId).toBe('42');
                },
              );
            });
          });
        });
      },
    );

    describe(`when the type in the provider configuration is "rpc"`, () => {
      it('resets the network status to "unknown"', async () => {
        const messenger = buildMessenger();
        await withController(
          {
            messenger,
            state: {
              providerConfig: {
                type: NetworkType.rpc,
                rpcTarget: 'https://mock-rpc-url',
                chainId: '0x1337',
              },
            },
          },
          async ({ controller }) => {
            const fakeMetamaskProvider = buildFakeMetamaskProvider([
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
            createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
            await controller.initializeProvider();
            expect(controller.state.networkStatus).toBe(
              NetworkStatus.Available,
            );

            await waitForStateChanges(messenger, {
              propertyPath: ['networkStatus'],
              // We only care about the first state change, because it
              // happens before the network lookup
              count: 1,
              produceStateChanges: () => {
                controller.resetConnection();
              },
            });

            expect(controller.state.networkStatus).toBe(NetworkStatus.Unknown);
          },
        );
      });

      it('clears EIP-1559 support for the network from state before emitting networkDidChange', async () => {
        const messenger = buildMessenger();
        await withController(
          {
            messenger,
            state: {
              providerConfig: {
                type: NetworkType.rpc,
                rpcTarget: 'https://mock-rpc-url',
                chainId: '0x1337',
              },
              networkDetails: {
                isEIP1559Compatible: false,
              },
            },
          },
          async ({ controller }) => {
            const fakeMetamaskProvider = buildFakeMetamaskProvider([
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
            createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
            await controller.initializeProvider();
            expect(controller.state.networkDetails).toStrictEqual({
              isEIP1559Compatible: false,
            });

            await waitForStateChanges(messenger, {
              propertyPath: ['networkDetails'],
              // We only care about the first state change, because it
              // happens before the network lookup
              count: 1,
              produceStateChanges: () => {
                controller.resetConnection();
              },
            });

            expect(controller.state.networkDetails).toStrictEqual({});
          },
        );
      });

      it('initializes a new provider object pointed to the same RPC URL as the current network and using the same chain ID', async () => {
        await withController(
          {
            state: {
              providerConfig: {
                type: NetworkType.rpc,
                rpcTarget: 'https://mock-rpc-url',
                chainId: '0x1337',
                ticker: 'TEST',
                id: 'testNetworkConfigurationId',
              },
              networkConfigurations: {
                testNetworkConfigurationId: {
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: '0x1337',
                  ticker: 'TEST',
                  id: 'testNetworkConfigurationId',
                },
              },
            },
          },
          async ({ controller }) => {
            const fakeMetamaskProvider = buildFakeMetamaskProvider([
              {
                request: {
                  method: 'eth_chainId',
                },
                response: {
                  result: '0x1337',
                },
              },
            ]);
            createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

            controller.resetConnection();
            const { provider } = controller.getProviderAndBlockTracker();
            const promisifiedSendAsync = promisify(provider.sendAsync).bind(
              provider,
            );
            const { result: chainIdResult } = await promisifiedSendAsync({
              method: 'eth_chainId',
            });
            expect(chainIdResult).toBe('0x1337');
          },
        );
      });

      it('replaces the provider object underlying the provider proxy without creating a new instance of the proxy itself', async () => {
        const messenger = buildMessenger();
        await withController(
          {
            messenger,
            state: {
              providerConfig: {
                type: NetworkType.rpc,
                rpcTarget: 'https://mock-rpc-url',
                chainId: '0xtest',
                ticker: 'TEST',
                id: 'testNetworkConfigurationId',
              },
              networkConfigurations: {
                testNetworkConfigurationId: {
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: '0xtest',
                  ticker: 'TEST',
                  id: 'testNetworkConfigurationId',
                },
              },
            },
          },
          async ({ controller }) => {
            const fakeMetamaskProvider = buildFakeMetamaskProvider();
            createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

            await controller.initializeProvider();
            const { provider: providerBefore } =
              controller.getProviderAndBlockTracker();

            controller.resetConnection();

            const { provider: providerAfter } =
              controller.getProviderAndBlockTracker();
            expect(providerBefore).toBe(providerAfter);
          },
        );
      });

      it('ensures that the existing provider is stopped while replacing it', async () => {
        await withController(
          {
            state: {
              providerConfig: {
                type: NetworkType.rpc,
                rpcTarget: 'https://mock-rpc-url',
                chainId: '0xtest',
                ticker: 'TEST',
                id: 'testNetworkConfigurationId',
              },
            },
          },
          ({ controller }) => {
            const fakeInfuraProvider = buildFakeInfuraProvider();
            createInfuraProviderMock.mockReturnValue(fakeInfuraProvider);
            const fakeInfuraSubprovider = buildFakeInfuraSubprovider();
            SubproviderMock.mockReturnValue(fakeInfuraSubprovider);
            const fakeMetamaskProviders = [
              buildFakeMetamaskProvider(),
              buildFakeMetamaskProvider(),
            ];
            jest.spyOn(fakeMetamaskProviders[0], 'stop');
            createMetamaskProviderMock
              .mockImplementationOnce(() => fakeMetamaskProviders[0])
              .mockImplementationOnce(() => fakeMetamaskProviders[1]);

            controller.resetConnection();
            controller.resetConnection();
            assert(controller.getProviderAndBlockTracker().provider);
            jest.runAllTimers();

            expect(fakeMetamaskProviders[0].stop).toHaveBeenCalled();
          },
        );
      });

      it('checks the status of the network again, updating state appropriately', async () => {
        const messenger = buildMessenger();
        await withController(
          {
            messenger,
            state: {
              providerConfig: {
                type: NetworkType.rpc,
                rpcTarget: 'https://mock-rpc-url',
                chainId: '0x1337',
              },
            },
          },
          async ({ controller }) => {
            const fakeMetamaskProvider = buildFakeMetamaskProvider();
            createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
            await controller.initializeProvider();

            await waitForStateChanges(messenger, {
              propertyPath: ['networkStatus'],
              // We need to wait for the second state change, which happens
              // during the network lookup after the state is initially cleared
              count: 2,
              produceStateChanges: () => {
                controller.resetConnection();
              },
            });

            expect(controller.state.networkStatus).toBe(
              NetworkStatus.Available,
            );
          },
        );
      });

      it('ensures that EIP-1559 support for the current network is up to date', async () => {
        const messenger = buildMessenger();
        await withController(
          {
            messenger,
            state: {
              providerConfig: {
                type: NetworkType.rpc,
                rpcTarget: 'https://mock-rpc-url',
                chainId: '0x1337',
              },
              networkDetails: {
                isEIP1559Compatible: false,
              },
            },
          },
          async ({ controller }) => {
            const fakeMetamaskProvider = buildFakeMetamaskProvider([
              {
                request: {
                  method: 'eth_getBlockByNumber',
                },
                response: {
                  result: POST_1559_BLOCK,
                },
              },
            ]);
            createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

            await waitForStateChanges(messenger, {
              propertyPath: ['networkDetails'],
              // We need to wait for the second state change, which happens
              // during the network lookup after the state is initially cleared
              count: 2,
              produceStateChanges: () => {
                controller.resetConnection();
              },
            });

            expect(controller.state.networkDetails).toStrictEqual({
              isEIP1559Compatible: true,
            });
          },
        );
      });

      describe('when an "error" event occurs on the new provider', () => {
        it('retrieves the network version and, assuming success, persists it to state', async () => {
          const messenger = buildMessenger();
          await withController(
            {
              messenger,
              state: {
                providerConfig: {
                  type: NetworkType.rpc,
                  rpcTarget: 'https://mock-rpc-url',
                  chainId: '0xtest',
                  ticker: 'TEST',
                  id: 'testNetworkConfigurationId',
                },
              },
            },
            async ({ controller }) => {
              const fakeMetamaskProvider = buildFakeMetamaskProvider([
                {
                  request: {
                    method: 'net_version',
                  },
                  response: {
                    result: '42',
                  },
                },
              ]);
              createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

              controller.resetConnection();
              assert(controller.getProviderAndBlockTracker().provider);

              expect(controller.state.networkStatus).toBe(
                NetworkStatus.Unknown,
              );

              await waitForStateChanges(messenger, {
                propertyPath: ['networkId'],
                produceStateChanges: () => {
                  controller
                    .getProviderAndBlockTracker()
                    .provider.emit('error', { some: 'error' });
                },
              });

              expect(controller.state.networkId).toBe('42');
            },
          );
        });
      });
    });
  });

  describe('NetworkController:getProviderConfig action', () => {
    it('returns the provider config in state', async () => {
      const messenger = buildMessenger();
      await withController(
        {
          messenger,
          state: {
            providerConfig: {
              type: NetworkType.mainnet,
              ...BUILT_IN_NETWORKS.mainnet,
            },
          },
        },
        async () => {
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
    it('returns the EthQuery object set after the provider is set', async () => {
      const messenger = buildMessenger();
      await withController({ messenger }, async ({ controller }) => {
        const fakeEthQuery = {
          sendAsync: jest.fn(),
        };
        jest.spyOn(ethQueryModule, 'default').mockReturnValue(fakeEthQuery);
        setFakeProvider(controller);

        const ethQuery = await messenger.call('NetworkController:getEthQuery');

        expect(ethQuery).toBe(fakeEthQuery);
      });
    });
  });

  describe('upsertNetworkConfiguration', () => {
    it('adds the given network configuration when its rpcURL does not match an existing configuration', async () => {
      (v4 as jest.Mock).mockImplementationOnce(
        () => 'network-configuration-id-1',
      );
      const messenger = buildMessenger();
      await withController({ messenger }, async ({ controller }) => {
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
        await expect(
          async () =>
            // @ts-expect-error - we want to test the case where no second arg is passed.
            controller.upsertNetworkConfiguration({
              chainId: '0x5',
              nickname: 'RPC',
              rpcPrefs: { blockExplorerUrl: 'test-block-explorer.com' },
              rpcUrl: 'https://mock-rpc-url',
            }),
          // eslint-disable-next-line
        ).rejects.toThrow();
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
              rpcTarget: 'https://mock-rpc-url',
              chainId: '0xtest',
              ticker: 'TEST',
              id: 'testNetworkConfigurationId',
            },
            networkConfigurations: {
              testNetworkConfigurationId: {
                rpcUrl: 'https://mock-rpc-url',
                chainId: '0xtest',
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
            chainId: '0x9999',
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
        rpcTarget: 'https://mock-rpc-url',
        chainId: '0xtest',
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
                chainId: '0xtest',
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
            chainId: '0x1',
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
              rpcTarget: 'https://mock-rpc-url',
              chainId: '0xtest',
              ticker: 'TEST',
              id: 'testNetworkConfigurationId',
              nickname: undefined,
              rpcPrefs: undefined,
            },
            networkConfigurations: {
              testNetworkConfigurationId: {
                rpcUrl: 'https://mock-rpc-url',
                chainId: '0xtest',
                ticker: 'TEST',
                id: 'testNetworkConfigurationId',
                nickname: undefined,
                rpcPrefs: undefined,
              },
            },
          },
        },
        async ({ controller }) => {
          const fakeMetamaskProvider = buildFakeMetamaskProvider();
          createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
          const rpcUrlNetwork = {
            rpcUrl: 'https://test-rpc-url',
            chainId: '0x1',
            ticker: 'test_ticker',
          };

          await controller.upsertNetworkConfiguration(rpcUrlNetwork, {
            setActive: true,
            referrer: 'https://test-dapp.com',
            source: 'dapp',
          });

          expect(controller.state.providerConfig).toStrictEqual({
            type: 'rpc',
            rpcTarget: 'https://test-rpc-url',
            chainId: '0x1',
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
              rpcTarget: 'https://mock-rpc-url',
              chainId: '0xtest',
              ticker: 'TEST',
              id: 'testNetworkConfigurationId',
              nickname: undefined,
              rpcPrefs: undefined,
            },
            networkConfigurations: {
              testNetworkConfigurationId: {
                rpcUrl: 'https://mock-rpc-url',
                chainId: '0xtest',
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
            chainId: '0x9999',
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
              chainId: '0xtest',
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
              chain_id: '0x9999',
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
                chainId: '1',
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
                chainId: '1',
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
    /**
     * The set of networks that, when specified, create an Infura provider as
     * opposed to a "standard" provider (one suited for a custom RPC endpoint).
     */
    const INFURA_NETWORKS = {
      mainnet: {
        nickname: 'Mainnet',
        networkType: NetworkType.mainnet,
        chainId: NetworksChainId.mainnet,
        ticker: NetworksTicker.mainnet,
        blockExplorerUrl: `https://etherscan.io`,
        networkVersion: '1',
      },

      goerli: {
        nickname: 'Goerli',
        networkType: NetworkType.goerli,
        chainId: NetworksChainId.goerli,
        ticker: NetworksTicker.goerli,
        blockExplorerUrl: `https://goerli.etherscan.io`,
        networkVersion: '5',
      },
      sepolia: {
        nickname: 'Sepolia',
        networkType: NetworkType.sepolia,
        chainId: NetworksChainId.sepolia,
        ticker: NetworksTicker.sepolia,
        blockExplorerUrl: `https://sepolia.etherscan.io`,
        networkVersion: '11155111',
      },
    };

    for (const [
      chainName,
      {
        networkType: type,
        chainId,
        blockExplorerUrl,
        ticker,
        nickname,
        networkVersion,
      },
    ] of Object.entries(INFURA_NETWORKS)) {
      describe(`if the previous provider configuration had a type of "${chainName}"`, () => {
        it('overwrites the the current provider configuration with the previous provider configuration', async () => {
          const messenger = buildMessenger();
          const rpcUrlOrTarget = 'https://mock-rpc-url-1';
          const customNetworkConfiguration = {
            chainId: '0xtest',
            nickname: 'test-chain',
            ticker: 'TEST',
            rpcPrefs: {
              blockExplorerUrl: 'test-block-explorer.com',
            },
            id: 'testNetworkConfigurationId',
          };

          const initialProviderConfig = {
            ...buildProviderConfig({
              type,
              chainId,
              ticker,
              rpcPrefs: {
                blockExplorerUrl,
              },
            }),
          };

          await withController(
            {
              messenger,
              state: {
                providerConfig: initialProviderConfig,
                networkConfigurations: {
                  testNetworkConfigurationId: {
                    ...customNetworkConfiguration,
                    rpcUrl: rpcUrlOrTarget,
                  },
                },
              },
            },
            async ({ controller }) => {
              const fakeMetamaskProvider = buildFakeMetamaskProvider();
              createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
              await controller.setActiveNetwork('testNetworkConfigurationId');
              expect(controller.state.providerConfig).toStrictEqual({
                ...customNetworkConfiguration,
                rpcTarget: rpcUrlOrTarget,
                type: NetworkType.rpc,
              });
              controller.rollbackToPreviousProvider();
              expect(controller.state.providerConfig).toStrictEqual(
                initialProviderConfig,
              );
            },
          );
        });

        it('emits NetworkController:providerConfigChange via the messenger', async () => {
          const messenger = buildMessenger();

          const initialProviderConfig = {
            ...buildProviderConfig({
              type,
              chainId,
              ticker,
              rpcPrefs: { blockExplorerUrl },
            }),
          };
          await withController(
            {
              messenger,
              state: {
                networkConfigurations: {
                  testNetworkConfigurationId: {
                    chainId: '0xtest',
                    ticker: 'TEST',
                    nickname: undefined,
                    id: 'testNetworkConfigurationId',
                    rpcUrl: 'https://mock-rpc-url',
                  },
                },
                providerConfig: initialProviderConfig,
              },
            },
            async ({ controller }) => {
              const fakeMetamaskProvider = buildFakeMetamaskProvider();
              createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
              await controller.setActiveNetwork('testNetworkConfigurationId');
              const promiseForProviderConfigChange =
                await waitForPublishedEvents(
                  messenger,
                  'NetworkController:providerConfigChange',
                  {
                    produceEvents: () => {
                      controller.rollbackToPreviousProvider();
                    },
                  },
                );
              expect(promiseForProviderConfigChange).toStrictEqual([
                [
                  {
                    type,
                    chainId,
                    ticker,
                    rpcPrefs: { blockExplorerUrl },
                    id: undefined,
                    nickname: undefined,
                    rpcTarget: undefined,
                  },
                ],
              ]);
            },
          );
        });

        it('resets isEIP1559Compatible and sets network to "unknown" for the network before emitting NetworkController:providerConfigChange', async () => {
          const networkConfiguration = {
            rpcUrl: 'https://mock-rpc-url',
            chainId: '0x1338',
            ticker: 'TEST',
            nickname: undefined,
            id: 'testNetworkConfigurationId',
          };

          const initialProviderConfig = {
            ...buildProviderConfig({
              type,
              chainId,
              ticker,
              rpcPrefs: { blockExplorerUrl },
            }),
          };
          const messenger = buildMessenger();
          await withController(
            {
              messenger,
              state: {
                networkConfigurations: {
                  testNetworkConfigurationId: networkConfiguration,
                },
                providerConfig: initialProviderConfig,
              },
            },
            async ({ controller }) => {
              const fakeMetamaskProvider = buildFakeMetamaskProvider([
                {
                  request: {
                    method: 'eth_getBlockByNumber',
                  },
                  response: {
                    result: POST_1559_BLOCK,
                  },
                },
                {
                  delay: 1,
                  request: {
                    method: 'net_version',
                  },
                  response: {
                    result: '1338',
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
                {
                  delay: 1,
                  request: {
                    method: 'net_version',
                  },
                  response: {
                    result: '1337',
                  },
                },
              ]);

              createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
              await controller.setActiveNetwork('testNetworkConfigurationId');
              expect(controller.state.networkDetails).toStrictEqual({
                isEIP1559Compatible: true,
              });
              await waitForStateChanges(messenger, {
                propertyPath: ['networkId'],
                count: 1,
                produceStateChanges: () => {
                  controller.rollbackToPreviousProvider();
                },
              });
              expect(controller.state.networkStatus).toBe(
                NetworkStatus.Unknown,
              );
              expect(controller.state.networkDetails).toStrictEqual({
                isEIP1559Compatible: false,
              });
            },
          );
        });

        it(`initializes a provider pointed to the ${nickname} Infura network (chainId: ${chainId})`, async () => {
          const networkConfiguration = {
            rpcUrl: 'https://mock-rpc-url',
            chainId: '0xtest',
            ticker: 'TEST',
            id: 'testNetworkConfigurationId',
            nickname: undefined,
            rpcPrefs: undefined,
          };

          const initialProviderConfig = {
            ...buildProviderConfig({
              type,
              chainId,
              ticker,
              rpcPrefs: { blockExplorerUrl },
            }),
          };
          const messenger = buildMessenger();
          await withController(
            {
              messenger,
              state: {
                networkConfigurations: {
                  testNetworkConfigurationId: networkConfiguration,
                },
                providerConfig: initialProviderConfig,
              },
            },
            async ({ controller }) => {
              const fakeMetamaskProvider = buildFakeMetamaskProvider([
                {
                  request: {
                    method: 'eth_chainId',
                  },
                  response: {
                    result: chainId,
                  },
                },
              ]);

              createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
              await controller.setActiveNetwork('testNetworkConfigurationId');
              await waitForStateChanges(messenger, {
                propertyPath: ['networkId'],
                count: 1,
                produceStateChanges: () => {
                  controller.rollbackToPreviousProvider();
                },
              });
              const { provider } = controller.getProviderAndBlockTracker();
              const promisifiedSendAsync = promisify(provider.sendAsync).bind(
                provider,
              );
              const { result: chainIdResult } = await promisifiedSendAsync({
                method: 'eth_chainId',
              });
              expect(chainIdResult).toBe(chainId);
            },
          );
        });

        it('replaces the provider object underlying the provider proxy without creating a new instance of the proxy itself', async () => {
          const networkConfiguration = {
            rpcUrl: 'https://mock-rpc-url',
            chainId: '0xtest',
            ticker: 'TEST',
            nickname: undefined,
            id: 'testNetworkConfigurationId',
          };

          const initialProviderConfig = {
            ...buildProviderConfig({
              type,
              chainId,
              ticker,
              rpcPrefs: { blockExplorerUrl },
            }),
          };
          const messenger = buildMessenger();
          await withController(
            {
              messenger,
              state: {
                networkConfigurations: {
                  testNetworkConfigurationId: networkConfiguration,
                },
                providerConfig: initialProviderConfig,
              },
            },
            async ({ controller }) => {
              const fakeMetamaskProvider = buildFakeMetamaskProvider();

              createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
              await controller.setActiveNetwork('testNetworkConfigurationId');
              const { provider: providerBefore } =
                controller.getProviderAndBlockTracker();

              await waitForStateChanges(messenger, {
                propertyPath: ['networkId'],
                count: 1,
                produceStateChanges: () => {
                  controller.rollbackToPreviousProvider();
                },
              });
              const { provider: providerAfter } =
                controller.getProviderAndBlockTracker();

              expect(providerBefore).toBe(providerAfter);
            },
          );
        });

        it(`persists "${networkVersion}" to state as the network version of ${nickname}`, async () => {
          const networkConfiguration = {
            rpcUrl: 'https://mock-rpc-url',
            chainId: '0xtest',
            ticker: 'TEST',
            nickname: undefined,
            id: 'testNetworkConfigurationId',
          };

          const initialProviderConfig = {
            ...buildProviderConfig({
              type,
              chainId,
              ticker,
              rpcPrefs: { blockExplorerUrl },
            }),
          };
          const messenger = buildMessenger();
          await withController(
            {
              messenger,
              state: {
                networkConfigurations: {
                  testNetworkConfigurationId: networkConfiguration,
                },
                providerConfig: initialProviderConfig,
              },
            },
            async ({ controller }) => {
              const fakeMetamaskProvider = buildFakeMetamaskProvider([
                {
                  request: {
                    method: 'net_version',
                  },
                  response: {
                    result: '999',
                  },
                },
                {
                  request: {
                    method: 'net_version',
                  },
                  response: {
                    result: '1',
                  },
                },
              ]);

              createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
              await controller.setActiveNetwork('testNetworkConfigurationId');
              expect(controller.state.networkId).toStrictEqual('999');

              await waitForStateChanges(messenger, {
                propertyPath: ['networkId'],
                count: 2,
                produceStateChanges: () => {
                  controller.rollbackToPreviousProvider();
                },
              });
              expect(controller.state.networkId).toStrictEqual('1');
            },
          );
        });
      });
    }

    describe(`if the previous provider configuration had a type of "rpc"`, () => {
      it('should overwrite the current provider with the previous provider when current provider has type "mainnet" and previous provider has type "rpc"', async () => {
        const messenger = buildMessenger();
        const rpcUrlOrTarget = 'https://mock-rpc-url';
        const networkConfiguration = {
          chainId: '0xtest',
          ticker: 'TEST',
          id: 'testNetworkConfigurationId',
          nickname: undefined,
          rpcPrefs: undefined,
        };

        const initialProviderConfig = {
          ...buildProviderConfig({
            ...networkConfiguration,
          }),
          type: NetworkType.rpc,
        };
        await withController(
          {
            messenger,
            state: {
              networkConfigurations: {
                testNetworkConfigurationId: {
                  ...networkConfiguration,
                  rpcUrl: rpcUrlOrTarget,
                },
              },
              providerConfig: initialProviderConfig,
            },
          },
          async ({ controller }) => {
            const fakeMetamaskProvider = buildFakeMetamaskProvider();
            createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
            await controller.setProviderType(NetworkType.mainnet);
            expect(controller.state.providerConfig).toStrictEqual({
              type: NetworkType.mainnet,
              ...BUILT_IN_NETWORKS.mainnet,
              nickname: undefined,
              rpcTarget: undefined,
              id: undefined,
            });
            controller.rollbackToPreviousProvider();
            expect(controller.state.providerConfig).toStrictEqual({
              ...networkConfiguration,
              rpcTarget: rpcUrlOrTarget,
              type: NetworkType.rpc,
            });
          },
        );
      });

      it('should overwrite the current provider with the previous provider when current provider has type "rpc" and previous provider has type "rpc"', async () => {
        const messenger = buildMessenger();
        const rpcUrlOrTarget1 = 'https://mock-rpc-url';
        const rpcUrlOrTarget2 = 'https://mock-rpc-url-2';
        const networkConfiguration1 = {
          chainId: '0xtest',
          ticker: 'TEST',
          id: 'testNetworkConfigurationId',
          nickname: 'test-network-1',
          rpcPrefs: undefined,
        };

        const networkConfiguration2 = {
          chainId: '0xtest2',
          ticker: 'TEST2',
          id: 'testNetworkConfigurationId2',
          nickname: 'test-network-2',
          rpcPrefs: undefined,
        };

        const initialProviderConfig = {
          ...buildProviderConfig({
            ...networkConfiguration1,
            type: NetworkType.rpc,
          }),
        };
        await withController(
          {
            messenger,
            state: {
              networkConfigurations: {
                testNetworkConfigurationId: {
                  ...networkConfiguration1,
                  rpcUrl: rpcUrlOrTarget1,
                },
                testNetworkConfigurationId2: {
                  ...networkConfiguration2,
                  rpcUrl: rpcUrlOrTarget2,
                },
              },
              providerConfig: initialProviderConfig,
            },
          },
          async ({ controller }) => {
            const fakeMetamaskProvider = buildFakeMetamaskProvider();
            createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
            await controller.setActiveNetwork('testNetworkConfigurationId2');
            expect(controller.state.providerConfig).toStrictEqual({
              ...networkConfiguration2,
              rpcTarget: rpcUrlOrTarget2,
              type: NetworkType.rpc,
            });
            controller.rollbackToPreviousProvider();
            expect(controller.state.providerConfig).toStrictEqual({
              ...initialProviderConfig,
              rpcTarget: rpcUrlOrTarget1,
            });
          },
        );
      });

      it('emits NetworkController:providerConfigChange via the messenger', async () => {
        const messenger = buildMessenger();
        const rpcUrlOrTarget = 'https://mock-rpc-url-2';
        const initialProviderConfigNetworkConfiguration = {
          chainId: '0x1337',
          ticker: 'TEST2',
          id: 'testNetworkConfigurationId2',
          rpcPrefs: { blockExplorerUrl: 'https://test-block-explorer.com' },
        };

        const initialProviderConfig = {
          ...buildProviderConfig({
            ...initialProviderConfigNetworkConfiguration,
            type: NetworkType.rpc,
          }),
        };
        await withController(
          {
            messenger,
            state: {
              providerConfig: initialProviderConfig,
              networkConfigurations: {
                testNetworkConfigurationId1: {
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: '0xtest',
                  ticker: 'TEST',
                  id: 'testNetworkConfigurationId1',
                },
                testNetworkConfigurationId2: {
                  ...initialProviderConfigNetworkConfiguration,
                  rpcUrl: rpcUrlOrTarget,
                },
              },
            },
          },
          async ({ controller }) => {
            const fakeMetamaskProvider = buildFakeMetamaskProvider();
            createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
            await controller.setActiveNetwork('testNetworkConfigurationId1');
            const promiseForProviderConfigChange = await waitForPublishedEvents(
              messenger,
              'NetworkController:providerConfigChange',
              {
                produceEvents: () => {
                  controller.rollbackToPreviousProvider();
                },
              },
            );
            expect(promiseForProviderConfigChange).toStrictEqual([
              [{ ...initialProviderConfig, rpcTarget: rpcUrlOrTarget }],
            ]);
          },
        );
      });

      it('resets the network state to "unknown" and the isEIP before emitting NetworkController:providerConfigChange', async () => {
        const messenger = buildMessenger();
        const initialProviderConfigNetworkConfiguration = {
          rpcUrl: 'https://mock-rpc-url-2',
          chainId: '0x1337',
          ticker: 'TEST2',
          id: 'testNetworkConfigurationId2',
          rpcPrefs: { blockExplorerUrl: 'https://test-block-explorer.com' },
        };

        const initialProviderConfig = {
          ...buildProviderConfig({
            ...initialProviderConfigNetworkConfiguration,
            type: NetworkType.rpc,
          }),
        };
        await withController(
          {
            messenger,
            state: {
              providerConfig: initialProviderConfig,
              networkConfigurations: {
                testNetworkConfigurationId1: {
                  rpcUrl: 'https://mock-rpc-url',
                  chainId: '0x1338',
                  ticker: 'TEST',
                  id: 'testNetworkConfigurationId1',
                },
                testNetworkConfigurationId2:
                  initialProviderConfigNetworkConfiguration,
              },
            },
          },
          async ({ controller }) => {
            const fakeMetamaskProvider = buildFakeMetamaskProvider([
              {
                request: {
                  method: 'eth_getBlockByNumber',
                },
                response: {
                  result: POST_1559_BLOCK,
                },
              },
              {
                delay: 1,
                request: {
                  method: 'net_version',
                },
                response: {
                  result: '1338',
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
              {
                delay: 1,
                request: {
                  method: 'net_version',
                },
                response: {
                  result: '1337',
                },
              },
            ]);
            createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
            await controller.setActiveNetwork('testNetworkConfigurationId1');
            expect(controller.state.networkDetails).toStrictEqual({
              isEIP1559Compatible: true,
            });
            expect(controller.state.networkStatus).toStrictEqual(
              NetworkStatus.Available,
            );
            await waitForStateChanges(messenger, {
              propertyPath: ['networkStatus'],
              count: 1,
              produceStateChanges: () => {
                controller.rollbackToPreviousProvider();
              },
            });
            expect(controller.state.networkStatus).toStrictEqual(
              NetworkStatus.Unknown,
            );
            expect(controller.state.networkDetails).toStrictEqual({
              isEIP1559Compatible: false,
            });
          },
        );
      });

      it('initializes a provider pointed to the given RPC URL whose chain ID matches the previously configured chain ID', async () => {
        const networkConfiguration1 = {
          rpcUrl: 'https://mock-rpc-url',
          chainId: '0xtest',
          ticker: 'TEST',
          nickname: undefined,
          id: 'testNetworkConfigurationId1',
        };

        const initialProviderConfigNetworkConfiguration = {
          rpcUrl: 'https://mock-rpc-url-2',
          chainId: '0x1337',
          ticker: 'TEST2',
          id: 'testNetworkConfigurationId2',
          rpcPrefs: { blockExplorerUrl: 'https://test-block-explorer.com' },
        };

        const initialProviderConfig = {
          ...buildProviderConfig({
            ...initialProviderConfigNetworkConfiguration,
            type: NetworkType.rpc,
          }),
        };

        const messenger = buildMessenger();
        await withController(
          {
            messenger,
            state: {
              networkConfigurations: {
                testNetworkConfigurationId1: networkConfiguration1,
                testNetworkConfigurationId2:
                  initialProviderConfigNetworkConfiguration,
              },
              providerConfig: initialProviderConfig,
            },
          },
          async ({ controller }) => {
            const fakeMetamaskProvider = buildFakeMetamaskProvider([
              {
                request: {
                  method: 'eth_chainId',
                },
                response: {
                  result: initialProviderConfigNetworkConfiguration.chainId,
                },
              },
            ]);

            createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
            await controller.setActiveNetwork('testNetworkConfigurationId1');
            await waitForStateChanges(messenger, {
              propertyPath: ['networkId'],
              count: 1,
              produceStateChanges: () => {
                controller.rollbackToPreviousProvider();
              },
            });
            const { provider } = controller.getProviderAndBlockTracker();
            const promisifiedSendAsync = promisify(provider.sendAsync).bind(
              provider,
            );
            const { result: chainIdResult } = await promisifiedSendAsync({
              method: 'eth_chainId',
            });
            expect(chainIdResult).toBe(
              initialProviderConfigNetworkConfiguration.chainId,
            );
          },
        );
      });

      it('replaces the provider object underlying the provider proxy without creating a new instance of the proxy itself', async () => {
        const networkConfiguration1 = {
          rpcUrl: 'https://mock-rpc-url',
          chainId: '0xtest',
          ticker: 'TEST',
          nickname: undefined,
          id: 'testNetworkConfigurationId1',
        };

        const initialProviderConfigNetworkConfiguration = {
          rpcUrl: 'https://mock-rpc-url-2',
          chainId: '0x1337',
          ticker: 'TEST2',
          id: 'testNetworkConfigurationId2',
          rpcPrefs: { blockExplorerUrl: 'https://test-block-explorer.com' },
        };

        const initialProviderConfig = {
          ...buildProviderConfig({
            ...initialProviderConfigNetworkConfiguration,
            type: NetworkType.rpc,
          }),
        };

        const messenger = buildMessenger();
        await withController(
          {
            messenger,
            state: {
              networkConfigurations: {
                testNetworkConfigurationId1: networkConfiguration1,
                testNetworkConfigurationId2:
                  initialProviderConfigNetworkConfiguration,
              },
              providerConfig: initialProviderConfig,
            },
          },
          async ({ controller }) => {
            const fakeMetamaskProvider = buildFakeMetamaskProvider();

            createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
            await controller.setActiveNetwork('testNetworkConfigurationId1');
            const { provider: providerBefore } =
              controller.getProviderAndBlockTracker();

            await waitForStateChanges(messenger, {
              propertyPath: ['networkId'],
              count: 1,
              produceStateChanges: () => {
                controller.rollbackToPreviousProvider();
              },
            });
            const { provider: providerAfter } =
              controller.getProviderAndBlockTracker();

            expect(providerBefore).toBe(providerAfter);
          },
        );
      });

      it('persists the network version to state (assuming that the request for net_version responds successfully)', async () => {
        const networkConfiguration1 = {
          rpcUrl: 'https://mock-rpc-url',
          chainId: '0xtest',
          ticker: 'TEST',
          nickname: undefined,
          id: 'testNetworkConfigurationId1',
        };

        const initialProviderConfigNetworkConfiguration = {
          rpcUrl: 'https://mock-rpc-url-2',
          chainId: '0x1337',
          ticker: 'TEST2',
          id: 'testNetworkConfigurationId2',
          rpcPrefs: { blockExplorerUrl: 'https://test-block-explorer.com' },
        };

        const initialProviderConfig = {
          ...buildProviderConfig({
            ...initialProviderConfigNetworkConfiguration,
            type: NetworkType.rpc,
          }),
        };

        const messenger = buildMessenger();
        await withController(
          {
            messenger,
            state: {
              networkConfigurations: {
                testNetworkConfigurationId1: networkConfiguration1,
                testNetworkConfigurationId2:
                  initialProviderConfigNetworkConfiguration,
              },
              providerConfig: initialProviderConfig,
            },
          },
          async ({ controller }) => {
            const fakeMetamaskProvider = buildFakeMetamaskProvider([
              {
                request: {
                  method: 'net_version',
                },
                response: {
                  result: '999',
                },
              },
              {
                request: {
                  method: 'net_version',
                },
                response: {
                  result: '1',
                },
              },
            ]);

            createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
            await controller.setActiveNetwork('testNetworkConfigurationId1');
            expect(controller.state.networkId).toStrictEqual('999');

            await waitForStateChanges(messenger, {
              propertyPath: ['networkId'],
              count: 2,
              produceStateChanges: () => {
                controller.rollbackToPreviousProvider();
              },
            });
            expect(controller.state.networkId).toStrictEqual('1');
          },
        );
      });
    });

    it('should overwrite the current provider with the previous provider when current provider has type "rpc" and previous provider has type "mainnet"', async () => {
      const networkConfiguration = {
        chainId: '0xtest',
        ticker: 'TEST',
        id: 'testNetworkConfigurationId',
        nickname: undefined,
        rpcPrefs: undefined,
      };
      const rpcUrlOrTarget = 'https://mock-rpc-url';

      const initialProviderConfig = {
        ...buildProviderConfig({
          type: NetworkType.mainnet,
          ...BUILT_IN_NETWORKS.mainnet,
        }),
      };
      const messenger = buildMessenger();
      await withController(
        {
          messenger,
          state: {
            networkConfigurations: {
              testNetworkConfigurationId: {
                ...networkConfiguration,
                rpcUrl: rpcUrlOrTarget,
              },
            },
            providerConfig: initialProviderConfig,
          },
        },
        async ({ controller }) => {
          const fakeMetamaskProvider = buildFakeMetamaskProvider();
          createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
          await controller.setActiveNetwork('testNetworkConfigurationId');
          expect(controller.state.providerConfig).toStrictEqual({
            ...networkConfiguration,
            rpcTarget: rpcUrlOrTarget,
            type: NetworkType.rpc,
          });
          controller.rollbackToPreviousProvider();

          expect(controller.state.providerConfig).toStrictEqual(
            initialProviderConfig,
          );
        },
      );
    });

    it('should overwrite the current provider with the previous provider when current provider has type "mainnet" and previous provider has type "sepolia"', async () => {
      const messenger = buildMessenger();
      const initialProviderConfig = {
        ...buildProviderConfig({
          type: NetworkType.mainnet,
          ...BUILT_IN_NETWORKS.mainnet,
        }),
      };
      await withController(
        {
          messenger,
          state: {
            providerConfig: initialProviderConfig,
          },
        },
        async ({ controller }) => {
          const fakeMetamaskProvider = buildFakeMetamaskProvider();
          createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
          await controller.setProviderType(NetworkType.sepolia);
          expect(controller.state.providerConfig).toStrictEqual({
            ...buildProviderConfig({
              type: NetworkType.sepolia,
              ...BUILT_IN_NETWORKS.sepolia,
            }),
          });
          controller.rollbackToPreviousProvider();
          expect(controller.state.providerConfig).toStrictEqual(
            initialProviderConfig,
          );
        },
      );
    });
  });
});

/**
 * Builds the controller messenger that NetworkController is designed to work
 * with.
 *
 * @returns The controller messenger.
 */
function buildMessenger() {
  return new ControllerMessenger<
    NetworkControllerActions,
    NetworkControllerEvents
  >().getRestricted({
    name: 'NetworkController',
    allowedActions: [
      'NetworkController:getProviderConfig',
      'NetworkController:getEthQuery',
    ],
    allowedEvents: [
      'NetworkController:providerConfigChange',
      'NetworkController:stateChange',
    ],
  });
}

type WithControllerCallback<ReturnValue> = ({
  controller,
}: {
  controller: NetworkController;
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
  const [{ messenger = buildMessenger(), ...rest }, fn] =
    args.length === 2 ? args : [{}, args[0]];
  const controller = new NetworkController({
    messenger,
    trackMetaMetricsEvent: jest.fn(),
    ...rest,
  });
  try {
    return await fn({ controller });
  } finally {
    controller.getProviderAndBlockTracker().provider?.stop();
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
    type: NetworkType.localhost,
    chainId: '1337',
    id: undefined,
    nickname: undefined,
    rpcTarget: undefined,
    ...config,
  };
}

/**
 * Builds an object that `createInfuraProvider` returns.
 *
 * @returns The object.
 */
function buildFakeInfuraProvider() {
  return {};
}

/**
 * Builds an object that `Subprovider` returns.
 *
 * @returns The object.
 */
function buildFakeInfuraSubprovider() {
  return {
    handleRequest(_payload: any, _next: any, _end: any) {
      // do nothing
    },
  };
}

/**
 * Builds fake provider engine object that `createMetamaskProvider` returns,
 * with canned responses optionally provided for certain RPC methods.
 *
 * @param stubs - The list of RPC methods you want to stub along with their
 * responses.
 * @returns The object.
 */
function buildFakeMetamaskProvider(stubs: FakeProviderStub[] = []) {
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
  return new FakeProviderEngine({ stubs: completeStubs });
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
): Promise<ProviderEngine> {
  const fakeMetamaskProvider = buildFakeMetamaskProvider(stubs);
  createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
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
  await waitForResult(
    true,
    () => controller.getProviderAndBlockTracker().provider !== undefined,
  );
  assert(controller.getProviderAndBlockTracker().provider);

  if (stubLookupNetworkWhileSetting) {
    lookupNetworkMock.mockRestore();
  }
  if (stubGetEIP1559CompatibilityWhileSetting) {
    lookupGetEIP1559CompatibilityMock.mockRestore();
  }

  return controller.getProviderAndBlockTracker().provider;
}

/**
 * Waits for controller events to be emitted before proceeding.
 *
 * @param messenger - The messenger suited for NetworkController.
 * @param eventType - The type of NetworkController event you want to wait for.
 * @param options - An options bag.
 * @param options.count - The number of events you expect to occur (default: 1).
 * @param options.filter - A function used to discard events that are not of
 * interest.
 * @param options.wait - The amount of time in milliseconds to wait for the
 * expected number of filtered events to occur before resolving the promise that
 * this function returns (default: 150).
 * @param options.produceEvents - A function to run that will presumably produce
 * the events in question.
 * @returns A promise that resolves to the list of payloads for the set of
 * events, optionally filtered, when a specific number of them have occurred.
 */
async function waitForPublishedEvents<E extends NetworkControllerEvents>(
  messenger: NetworkControllerMessenger,
  eventType: E['type'],
  {
    count: expectedNumberOfEvents = 1,
    filter: isEventPayloadInteresting = () => true,
    wait: timeBeforeAssumingNoMoreEvents = 150,
    produceEvents = () => {
      // do nothing
    },
  }: {
    count?: number;
    filter?: (payload: E['payload']) => boolean;
    wait?: number;
    produceEvents?: () => void | Promise<void>;
  } = {},
): Promise<E['payload'][]> {
  const promiseForEventPayloads = new Promise<E['payload'][]>(
    (resolve, reject) => {
      // We need to declare this variable first, then assign it later, so that
      // ESLint won't complain that resetTimer is referring to this variable
      // before it's declared. And we need to use let so that we can assign it
      // below.
      /* eslint-disable-next-line prefer-const */
      let eventListener: (...args: E['payload']) => void;
      let timer: NodeJS.Timeout | undefined;
      const allEventPayloads: E['payload'][] = [];
      const interestingEventPayloads: E['payload'][] = [];
      let alreadyEnded = false;

      const end = () => {
        if (!alreadyEnded) {
          messenger.unsubscribe(eventType.toString(), eventListener);
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
      };

      const stopTimer = () => {
        if (timer) {
          clearTimeout(timer);
        }
      };

      const resetTimer = () => {
        stopTimer();
        timer = originalSetTimeout(() => {
          end();
        }, timeBeforeAssumingNoMoreEvents);
      };

      eventListener = (...payload) => {
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

      messenger.subscribe(eventType.toString(), eventListener);
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
 * @param messenger - The messenger suited for NetworkController.
 * @param options - An options bag.
 * @param options.propertyPath - The path of the property you expect the state
 * changes to concern.
 * @param options.count - The number of events you expect to occur (default: 1).
 * @param options.wait - The amount of time in milliseconds to wait for the
 * expected number of filtered events to occur before resolving the promise that
 * this function returns (default: 150).
 * @param options.produceStateChanges - A function to run that will presumably
 * produce the state changes in question.
 * @returns A promise that resolves to the list of state changes, optionally
 * filtered by the property, when a specific number of them have occurred.
 */
async function waitForStateChanges(
  messenger: NetworkControllerMessenger,
  {
    propertyPath,
    count,
    wait,
    produceStateChanges,
  }: {
    propertyPath?: string[];
    count?: number;
    wait?: number;
    produceStateChanges?: () => void | Promise<void>;
  } = {},
): Promise<[NetworkState, Patch[]][]> {
  const filter =
    propertyPath === undefined
      ? () => true
      : ([_newState, patches]: [NetworkState, Patch[]]) =>
          didPropertyChange(patches, propertyPath);

  return await waitForPublishedEvents<NetworkControllerStateChangeEvent>(
    messenger,
    'NetworkController:stateChange',
    { produceEvents: produceStateChanges, count, filter, wait },
  );
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
