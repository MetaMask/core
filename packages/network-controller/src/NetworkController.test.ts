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
import { waitForResult } from '../../../tests/helpers';
import {
  FakeProviderEngine,
  FakeProviderStub,
} from '../tests/fake-provider-engine';
import {
  NetworkController,
  NetworkControllerActions,
  NetworkControllerEvents,
  NetworkControllerMessenger,
  NetworkControllerOptions,
  NetworkControllerStateChangeEvent,
  NetworkState,
  ProviderConfig,
} from './NetworkController';

jest.mock('eth-query', () => {
  return {
    __esModule: true,
    default: jest.requireActual('eth-query'),
  };
});
jest.mock('web3-provider-engine/subproviders/provider');
jest.mock('eth-json-rpc-infura/src/createProvider');
jest.mock('web3-provider-engine/zero');

// Store this up front so it doesn't get lost when it is stubbed
const originalSetTimeout = global.setTimeout;

const SubproviderMock = mocked(Subprovider);
const createInfuraProviderMock = mocked(createInfuraProvider);
const createMetamaskProviderMock = mocked(createMetamaskProvider);

//                                                                                     setProviderType            setRpcTarget
//                                                                                            └───────────┬────────────┘
// set providerConfig                                                                               refreshNetwork
//       │ │ └────────────────────────────────────────────┬──────────────────────────────────────────────┘ │
//       │ │                                     initializeProvider                                        │
//       │ │                  ┌─────────────────────────┘ │ └─────────────────────────┐                    │
//       │ │          setupInfuraProvider        setupStandardProvider      getEIP1559Compatibility        │
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
          network: 'loading',
          isCustomNetwork: false,
          providerConfig: { type: 'mainnet' as const, chainId: '1' },
          networkDetails: { isEIP1559Compatible: false },
        });
      });
    });

    it('merges the given state into the default state', async () => {
      await withController(
        {
          state: {
            isCustomNetwork: true,
            networkDetails: { isEIP1559Compatible: true },
          },
        },
        ({ controller }) => {
          expect(controller.state).toStrictEqual({
            network: 'loading',
            isCustomNetwork: true,
            providerConfig: { type: 'mainnet', chainId: '1' },
            networkDetails: { isEIP1559Compatible: true },
          });
        },
      );
    });
  });

  describe('providerConfig property', () => {
    describe('get', () => {
      it('throws', async () => {
        await withController(({ controller }) => {
          expect(() => controller.providerConfig).toThrow(
            'Property only used for setting',
          );
        });
      });
    });

    describe('set', () => {
      ['1', '5', '11155111', ''].forEach((chainId) => {
        describe(`when the provider config in state contains a chain ID of "${chainId}"`, () => {
          it('sets isCustomNetwork in state to false (ignoring the chain ID in the provided config object)', async () => {
            await withController(
              {
                state: {
                  isCustomNetwork: true,
                  providerConfig: buildProviderConfig({
                    chainId,
                  }),
                },
                infuraProjectId: 'infura-project-id',
              },
              ({ controller }) => {
                const fakeInfuraProvider = buildFakeInfuraProvider();
                createInfuraProviderMock.mockReturnValue(fakeInfuraProvider);
                const fakeInfuraSubprovider = buildFakeInfuraSubprovider();
                SubproviderMock.mockReturnValue(fakeInfuraSubprovider);
                const fakeMetamaskProvider = buildFakeMetamaskProvider();
                createMetamaskProviderMock.mockReturnValue(
                  fakeMetamaskProvider,
                );

                controller.providerConfig = buildProviderConfig();

                expect(controller.state.isCustomNetwork).toBe(false);
              },
            );
          });
        });
      });

      describe('when the provider config in state contains a chain ID that is not 1, 5, 11155111, or an empty string', () => {
        it('sets isCustomNetwork in state to true (ignoring the chain ID in the provided config object)', async () => {
          await withController(
            {
              state: {
                providerConfig: buildProviderConfig({
                  chainId: '999',
                }),
              },
              infuraProjectId: 'infura-project-id',
            },
            ({ controller }) => {
              const fakeInfuraProvider = buildFakeInfuraProvider();
              createInfuraProviderMock.mockReturnValue(fakeInfuraProvider);
              const fakeInfuraSubprovider = buildFakeInfuraSubprovider();
              SubproviderMock.mockReturnValue(fakeInfuraSubprovider);
              const fakeMetamaskProvider = buildFakeMetamaskProvider();
              createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

              controller.providerConfig = buildProviderConfig();

              expect(controller.state.isCustomNetwork).toBe(true);
            },
          );
        });
      });

      (['mainnet', 'goerli', 'sepolia'] as const).forEach((networkType) => {
        describe(`when the provider config in state contains a network type of "${networkType}"`, () => {
          it(`sets the provider to an Infura provider pointed to ${networkType}`, async () => {
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

                controller.providerConfig = {
                  // NOTE: Neither the type nor chainId needs to match the
                  // values in state, or match each other
                  type: 'mainnet',
                  chainId: '99999',
                  nickname: 'some nickname',
                };

                expect(createInfuraProviderMock).toHaveBeenCalledWith({
                  network: networkType,
                  projectId: 'infura-project-id',
                });
                expect(createMetamaskProviderMock).toHaveBeenCalledWith({
                  type: 'mainnet',
                  chainId: '99999',
                  nickname: 'some nickname',
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

                controller.providerConfig = buildProviderConfig();
                controller.providerConfig = buildProviderConfig();
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
                        produceEvents: () => {
                          controller.providerConfig = buildProviderConfig();
                          assert(
                            controller.getProviderAndBlockTracker().provider,
                          );
                        },
                      },
                    );

                    await waitForStateChanges(messenger, {
                      propertyPath: ['network'],
                      count: 2,
                      produceStateChanges: () => {
                        controller
                          .getProviderAndBlockTracker()
                          .provider.emit('error', { some: 'error' });
                      },
                    });
                    expect(controller.state.network).toBe('2');
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
                        produceEvents: () => {
                          controller.providerConfig = buildProviderConfig();
                          assert(
                            controller.getProviderAndBlockTracker().provider,
                          );
                        },
                      },
                    );

                    await waitForStateChanges(messenger, {
                      propertyPath: ['network'],
                      count: 0,
                      produceStateChanges: () => {
                        controller
                          .getProviderAndBlockTracker()
                          .provider.emit('error', { some: 'error' });
                      },
                    });
                    expect(controller.state.network).toBe('1');
                  },
                );
              });
            });
          });
        });
      });

      describe(`when the provider config in state contains a network type of "localhost"`, () => {
        it('sets the provider to a custom RPC provider pointed to localhost, initialized with the configured chain ID, nickname, and ticker', async () => {
          await withController(
            {
              state: {
                providerConfig: buildProviderConfig({
                  type: 'localhost',
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

              controller.providerConfig = buildProviderConfig({
                // NOTE: The type does not need to match the type in state
                type: 'mainnet',
              });

              expect(createMetamaskProviderMock).toHaveBeenCalledWith({
                type: 'mainnet',
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
                  type: 'localhost',
                }),
              },
            },
            ({ controller }) => {
              const fakeMetamaskProviders = [
                buildFakeMetamaskProvider(),
                buildFakeMetamaskProvider(),
              ];
              jest.spyOn(fakeMetamaskProviders[0], 'stop');
              createMetamaskProviderMock
                .mockImplementationOnce(() => fakeMetamaskProviders[0])
                .mockImplementationOnce(() => fakeMetamaskProviders[1]);

              controller.providerConfig = buildProviderConfig();
              controller.providerConfig = buildProviderConfig();
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
                      type: 'localhost',
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
                      produceEvents: () => {
                        controller.providerConfig = buildProviderConfig();
                        assert(
                          controller.getProviderAndBlockTracker().provider,
                        );
                      },
                    },
                  );

                  await waitForStateChanges(messenger, {
                    propertyPath: ['network'],
                    count: 2,
                    produceStateChanges: () => {
                      controller
                        .getProviderAndBlockTracker()
                        .provider.emit('error', { some: 'error' });
                    },
                  });
                  expect(controller.state.network).toBe('2');
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
                      type: 'localhost',
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
                      produceEvents: () => {
                        controller.providerConfig = buildProviderConfig();
                        assert(
                          controller.getProviderAndBlockTracker().provider,
                        );
                      },
                    },
                  );

                  await waitForStateChanges(messenger, {
                    propertyPath: ['network'],
                    count: 0,
                    produceStateChanges: () => {
                      controller
                        .getProviderAndBlockTracker()
                        .provider.emit('error', { some: 'error' });
                    },
                  });
                  expect(controller.state.network).toBe('1');
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
                    type: 'rpc',
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
                createMetamaskProviderMock.mockReturnValue(
                  fakeMetamaskProvider,
                );

                controller.providerConfig = buildProviderConfig({
                  // NOTE: The type does not need to match the type in state
                  type: 'mainnet',
                });

                expect(createMetamaskProviderMock).toHaveBeenCalledWith({
                  type: 'mainnet',
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
                    type: 'rpc',
                    rpcTarget: 'http://example.com',
                  }),
                },
              },
              ({ controller }) => {
                const fakeMetamaskProviders = [
                  buildFakeMetamaskProvider(),
                  buildFakeMetamaskProvider(),
                ];
                jest.spyOn(fakeMetamaskProviders[0], 'stop');
                createMetamaskProviderMock
                  .mockImplementationOnce(() => fakeMetamaskProviders[0])
                  .mockImplementationOnce(() => fakeMetamaskProviders[1]);

                controller.providerConfig = buildProviderConfig();
                controller.providerConfig = buildProviderConfig();
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
                        type: 'rpc',
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
                        produceEvents: () => {
                          controller.providerConfig = buildProviderConfig();
                          assert(
                            controller.getProviderAndBlockTracker().provider,
                          );
                        },
                      },
                    );

                    await waitForStateChanges(messenger, {
                      propertyPath: ['network'],
                      count: 2,
                      produceStateChanges: () => {
                        controller
                          .getProviderAndBlockTracker()
                          .provider.emit('error', { some: 'error' });
                      },
                    });
                    expect(controller.state.network).toBe('2');
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
                        type: 'rpc',
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
                        produceEvents: () => {
                          controller.providerConfig = buildProviderConfig();
                          assert(
                            controller.getProviderAndBlockTracker().provider,
                          );
                        },
                      },
                    );

                    await waitForStateChanges(messenger, {
                      propertyPath: ['network'],
                      count: 0,
                      produceStateChanges: () => {
                        controller
                          .getProviderAndBlockTracker()
                          .provider.emit('error', { some: 'error' });
                      },
                    });
                    expect(controller.state.network).toBe('1');
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
                    type: 'rpc',
                  }),
                },
              },
              ({ controller }) => {
                const fakeMetamaskProvider = buildFakeMetamaskProvider();
                createMetamaskProviderMock.mockReturnValue(
                  fakeMetamaskProvider,
                );

                controller.providerConfig = buildProviderConfig();

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
              produceStateChanges: () => {
                controller.providerConfig = buildProviderConfig();
              },
            });

            expect(controller.state.networkDetails.isEIP1559Compatible).toBe(
              true,
            );
          },
        );
      });
    });
  });

  describe('lookupNetwork', () => {
    describe('if a provider has not been set', () => {
      it('does not change network in state', async () => {
        const messenger = buildMessenger();
        await withController({ messenger }, async ({ controller }) => {
          const promiseForNetworkChanges = waitForStateChanges(messenger, {
            propertyPath: ['network'],
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
            { messenger, state: { network: '' } },
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
                propertyPath: ['network'],
                produceStateChanges: async () => {
                  await controller.lookupNetwork();
                },
              });

              expect(controller.state.network).toBe('12345');
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
                  type: 'mainnet',
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
                    type: 'mainnet',
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
            { messenger, state: { network: '12345' } },
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
                propertyPath: ['network'],
              });

              await controller.lookupNetwork();

              await expect(promiseForNetworkChanges).toNeverResolve();
            },
          );
        });

        it('does not publish NetworkController:providerConfigChange', async () => {
          const messenger = buildMessenger();
          await withController(
            { messenger, state: { network: '12345' } },
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

      describe('if an error is encountered while retrieving the version of the current network', () => {
        it('updates the network in state to "loading"', async () => {
          const messenger = buildMessenger();
          await withController(
            { messenger, state: { network: '1' } },
            async ({ controller }) => {
              await setFakeProvider(controller, {
                stubs: [
                  {
                    request: { method: 'net_version' },
                    response: { error: 'some error' },
                  },
                ],
                stubLookupNetworkWhileSetting: true,
              });

              await waitForStateChanges(messenger, {
                propertyPath: ['network'],
                produceStateChanges: async () => {
                  await controller.lookupNetwork();
                },
              });

              expect(controller.state.network).toBe('loading');
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
                  type: 'mainnet',
                  chainId: '1',
                },
              },
            },
            async ({ controller }) => {
              await setFakeProvider(controller, {
                stubs: [
                  {
                    request: { method: 'net_version' },
                    response: { error: 'some error' },
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
                    type: 'mainnet',
                    chainId: '1',
                  },
                ],
              ]);
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
              propertyPath: ['network'],
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
                expect.objectContaining({ network: '1' }),
              ]),
              expect.objectContaining([
                expect.objectContaining({ network: '2' }),
              ]),
              expect.objectContaining([
                expect.objectContaining({ network: '3' }),
              ]),
            ]);
          });
        });
      });
    });
  });

  describe('setProviderType', () => {
    describe('given a network type of "mainnet"', () => {
      it('updates the provider config in state with the network type and the corresponding chain ID, using "ETH" for the ticker and clearing any existing RPC target and nickname', async () => {
        const messenger = buildMessenger();
        await withController(
          {
            messenger,
            state: {
              providerConfig: {
                type: 'localhost',
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
            createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

            await waitForStateChanges(messenger, {
              propertyPath: ['network'],
              produceStateChanges: () => {
                controller.setProviderType('mainnet' as const);
              },
            });

            expect(controller.state.providerConfig).toStrictEqual({
              type: 'mainnet',
              ticker: 'ETH',
              chainId: '1',
              rpcTarget: undefined,
              nickname: undefined,
            });
          },
        );
      });

      it('sets isCustomNetwork in state to false', async () => {
        const messenger = buildMessenger();
        await withController(
          {
            messenger,
            state: {
              isCustomNetwork: true,
            },
            infuraProjectId: 'infura-project-id',
          },
          async ({ controller }) => {
            const fakeInfuraProvider = buildFakeInfuraProvider();
            createInfuraProviderMock.mockReturnValue(fakeInfuraProvider);
            const fakeInfuraSubprovider = buildFakeInfuraSubprovider();
            SubproviderMock.mockReturnValue(fakeInfuraSubprovider);
            const fakeMetamaskProvider = buildFakeMetamaskProvider();
            createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

            await waitForStateChanges(messenger, {
              propertyPath: ['isCustomNetwork'],
              produceStateChanges: () => {
                controller.setProviderType('mainnet' as const);
              },
            });

            expect(controller.state.isCustomNetwork).toBe(false);
          },
        );
      });

      it('sets the provider to an Infura provider pointed to Mainnet', async () => {
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
            createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

            controller.setProviderType('mainnet' as const);

            expect(createInfuraProviderMock).toHaveBeenCalledWith({
              network: 'mainnet',
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
            createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

            await waitForStateChanges(messenger, {
              propertyPath: ['networkDetails', 'isEIP1559Compatible'],
              produceStateChanges: () => {
                controller.setProviderType('mainnet' as const);
              },
            });

            expect(controller.state.networkDetails.isEIP1559Compatible).toBe(
              true,
            );
          },
        );
      });

      it('ensures that the existing provider is stopped while replacing it', async () => {
        await withController(({ controller }) => {
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

          controller.setProviderType('mainnet' as const);
          controller.setProviderType('mainnet' as const);
          assert(controller.getProviderAndBlockTracker().provider);
          jest.runAllTimers();

          expect(fakeMetamaskProviders[0].stop).toHaveBeenCalled();
        });
      });

      it('records the version of the current network in state (assuming that the request for net_version is made successfully)', async () => {
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

          await waitForStateChanges(messenger, {
            propertyPath: ['network'],
            produceStateChanges: () => {
              controller.setProviderType('mainnet' as const);
            },
          });

          expect(controller.state.network).toBe('42');
        });
      });

      describe('when an "error" event occurs on the new provider', () => {
        describe('if the network version could not be retrieved during the call to setProviderType', () => {
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
              createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

              await waitForPublishedEvents(
                messenger,
                'NetworkController:providerConfigChange',
                {
                  produceEvents: () => {
                    controller.setProviderType('mainnet' as const);
                    assert(controller.getProviderAndBlockTracker().provider);
                  },
                },
              );

              await waitForStateChanges(messenger, {
                propertyPath: ['network'],
                produceStateChanges: () => {
                  controller
                    .getProviderAndBlockTracker()
                    .provider.emit('error', { some: 'error' });
                },
              });
              expect(controller.state.network).toBe('42');
            });
          });
        });

        describe('if the network version could be retrieved during the call to setProviderType', () => {
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
              createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

              await waitForPublishedEvents(
                messenger,
                'NetworkController:providerConfigChange',
                {
                  produceEvents: () => {
                    controller.setProviderType('mainnet' as const);
                    assert(controller.getProviderAndBlockTracker().provider);
                  },
                },
              );

              await waitForStateChanges(messenger, {
                propertyPath: ['network'],
                count: 0,
                produceStateChanges: () => {
                  controller
                    .getProviderAndBlockTracker()
                    .provider.emit('error', { some: 'error' });
                },
              });
              expect(controller.state.network).toBe('1');
            });
          });
        });
      });
    });

    (
      [
        {
          networkType: 'goerli',
          ticker: 'GoerliETH',
          chainId: '5',
          networkName: 'Goerli',
        },
        {
          networkType: 'sepolia',
          ticker: 'SepoliaETH',
          chainId: '11155111',
          networkName: 'Sepolia',
        },
      ] as const
    ).forEach(({ networkType, ticker, chainId, networkName }) => {
      describe(`given a network type of "${networkType}"`, () => {
        it('updates the provider config in state with the network type, the corresponding chain ID, and a special ticker, clearing any existing RPC target and nickname', async () => {
          const messenger = buildMessenger();
          await withController(
            {
              messenger,
              state: {
                providerConfig: {
                  type: 'localhost',
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
              createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

              await waitForStateChanges(messenger, {
                propertyPath: ['network'],
                produceStateChanges: () => {
                  controller.setProviderType(networkType);
                },
              });

              expect(controller.state.providerConfig).toStrictEqual({
                type: networkType,
                ticker,
                chainId,
                rpcTarget: undefined,
                nickname: undefined,
              });
            },
          );
        });

        it('sets isCustomNetwork in state to false', async () => {
          const messenger = buildMessenger();
          await withController(
            {
              messenger,
              state: {
                isCustomNetwork: true,
              },
            },
            async ({ controller }) => {
              const fakeInfuraProvider = buildFakeInfuraProvider();
              createInfuraProviderMock.mockReturnValue(fakeInfuraProvider);
              const fakeInfuraSubprovider = buildFakeInfuraSubprovider();
              SubproviderMock.mockReturnValue(fakeInfuraSubprovider);
              const fakeMetamaskProvider = buildFakeMetamaskProvider();
              createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

              await waitForStateChanges(messenger, {
                propertyPath: ['isCustomNetwork'],
                produceStateChanges: () => {
                  controller.setProviderType(networkType);
                },
              });

              expect(controller.state.isCustomNetwork).toBe(false);
            },
          );
        });

        it(`sets the provider to an Infura provider pointed to ${networkName}`, async () => {
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
              createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

              controller.setProviderType(networkType);

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
              createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

              await waitForStateChanges(messenger, {
                propertyPath: ['networkDetails', 'isEIP1559Compatible'],
                produceStateChanges: () => {
                  controller.setProviderType(networkType);
                },
              });

              expect(controller.state.networkDetails.isEIP1559Compatible).toBe(
                true,
              );
            },
          );
        });

        it('ensures that the existing provider is stopped while replacing it', async () => {
          await withController(({ controller }) => {
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

            controller.setProviderType(networkType);
            controller.setProviderType(networkType);
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

            await waitForStateChanges(messenger, {
              propertyPath: ['network'],
              produceStateChanges: () => {
                controller.setProviderType(networkType);
              },
            });

            expect(controller.state.network).toBe('42');
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

                await waitForPublishedEvents(
                  messenger,
                  'NetworkController:providerConfigChange',
                  {
                    produceEvents: () => {
                      controller.setProviderType(networkType);
                      assert(controller.getProviderAndBlockTracker().provider);
                    },
                  },
                );

                await waitForStateChanges(messenger, {
                  propertyPath: ['network'],
                  produceStateChanges: () => {
                    controller
                      .getProviderAndBlockTracker()
                      .provider.emit('error', { some: 'error' });
                  },
                });
                expect(controller.state.network).toBe('42');
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

                await waitForPublishedEvents(
                  messenger,
                  'NetworkController:providerConfigChange',
                  {
                    produceEvents: () => {
                      controller.setProviderType(networkType);
                      assert(controller.getProviderAndBlockTracker().provider);
                    },
                  },
                );

                await waitForStateChanges(messenger, {
                  propertyPath: ['network'],
                  count: 0,
                  produceStateChanges: () => {
                    controller
                      .getProviderAndBlockTracker()
                      .provider.emit('error', { some: 'error' });
                  },
                });
                expect(controller.state.network).toBe('1');
              });
            });
          });
        });
      });
    });

    describe('given a network type of "rpc"', () => {
      it('updates the provider config in state with the network type, using "ETH" for the ticker and an empty string for the chain id and clearing any existing RPC target and nickname', async () => {
        const messenger = buildMessenger();
        await withController(
          {
            messenger,
            state: {
              providerConfig: {
                type: 'localhost',
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

            await waitForStateChanges(messenger, {
              propertyPath: ['providerConfig'],
              produceStateChanges: () => {
                controller.setProviderType('rpc' as const);
              },
            });

            expect(controller.state.providerConfig).toStrictEqual({
              type: 'rpc',
              ticker: 'ETH',
              chainId: '',
              rpcTarget: undefined,
              nickname: undefined,
            });
          },
        );
      });

      it('does not set isCustomNetwork in state to false (because the chain ID is cleared)', async () => {
        const messenger = buildMessenger();
        await withController(
          {
            messenger,
            state: {
              isCustomNetwork: false,
            },
            infuraProjectId: 'infura-project-id',
          },
          async ({ controller }) => {
            const fakeMetamaskProvider = buildFakeMetamaskProvider();
            createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
            const promiseForIsCustomNetworkChange = waitForStateChanges(
              messenger,
              { propertyPath: ['isCustomNetwork'] },
            );

            controller.setProviderType('rpc' as const);

            await expect(promiseForIsCustomNetworkChange).toNeverResolve();
          },
        );
      });

      it("doesn't set a provider (because the RPC target is cleared)", async () => {
        await withController(({ controller }) => {
          const fakeMetamaskProvider = buildFakeMetamaskProvider();
          createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

          controller.setProviderType('rpc' as const);

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

            await waitForStateChanges(messenger, {
              propertyPath: ['networkDetails', 'isEIP1559Compatible'],
              produceStateChanges: () => {
                controller.setProviderType('rpc' as const);
              },
            });

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
                type: 'localhost',
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

            await waitForStateChanges(messenger, {
              propertyPath: ['network'],
              produceStateChanges: () => {
                controller.setProviderType('localhost' as const);
              },
            });

            expect(controller.state.providerConfig).toStrictEqual({
              type: 'localhost',
              ticker: 'ETH',
              chainId: '',
              rpcTarget: undefined,
              nickname: undefined,
            });
          },
        );
      });

      it('sets isCustomNetwork in state to false', async () => {
        const messenger = buildMessenger();
        await withController(
          {
            messenger,
            state: {
              isCustomNetwork: true,
            },
          },
          async ({ controller }) => {
            const fakeMetamaskProvider = buildFakeMetamaskProvider();
            createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

            await waitForStateChanges(messenger, {
              propertyPath: ['isCustomNetwork'],
              produceStateChanges: () => {
                controller.setProviderType('localhost' as const);
              },
            });

            expect(controller.state.isCustomNetwork).toBe(false);
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

          controller.setProviderType('localhost' as const);

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

          await waitForStateChanges(messenger, {
            propertyPath: ['networkDetails', 'isEIP1559Compatible'],
            produceStateChanges: () => {
              controller.setProviderType('localhost' as const);
            },
          });

          expect(controller.state.networkDetails.isEIP1559Compatible).toBe(
            true,
          );
        });
      });

      it('ensures that the existing provider is stopped while replacing it', async () => {
        await withController(({ controller }) => {
          const fakeMetamaskProviders = [
            buildFakeMetamaskProvider(),
            buildFakeMetamaskProvider(),
          ];
          jest.spyOn(fakeMetamaskProviders[0], 'stop');
          createMetamaskProviderMock
            .mockImplementationOnce(() => fakeMetamaskProviders[0])
            .mockImplementationOnce(() => fakeMetamaskProviders[1]);

          controller.setProviderType('localhost' as const);
          controller.setProviderType('localhost' as const);
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

          await waitForStateChanges(messenger, {
            propertyPath: ['network'],
            produceStateChanges: () => {
              controller.setProviderType('localhost' as const);
            },
          });

          expect(controller.state.network).toBe('42');
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

              await waitForPublishedEvents(
                messenger,
                'NetworkController:providerConfigChange',
                {
                  produceEvents: () => {
                    controller.setProviderType('localhost' as const);
                    assert(controller.getProviderAndBlockTracker().provider);
                  },
                },
              );

              await waitForStateChanges(messenger, {
                propertyPath: ['network'],
                produceStateChanges: () => {
                  controller
                    .getProviderAndBlockTracker()
                    .provider.emit('error', { some: 'error' });
                },
              });
              expect(controller.state.network).toBe('42');
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

              await waitForPublishedEvents(
                messenger,
                'NetworkController:providerConfigChange',
                {
                  produceEvents: () => {
                    controller.setProviderType('localhost' as const);
                    assert(controller.getProviderAndBlockTracker().provider);
                  },
                },
              );

              await waitForStateChanges(messenger, {
                propertyPath: ['network'],
                count: 0,
                produceStateChanges: () => {
                  controller
                    .getProviderAndBlockTracker()
                    .provider.emit('error', { some: 'error' });
                },
              });
              expect(controller.state.network).toBe('1');
            });
          });
        });
      });
    });
  });

  describe('setRpcTarget', () => {
    describe('given only an RPC target and chain ID', () => {
      it('updates the provider config in state with the RPC target and chain ID, clearing any existing ticker and nickname', async () => {
        const messenger = buildMessenger();
        await withController(
          {
            messenger,
            state: {
              providerConfig: {
                type: 'localhost',
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

            await waitForStateChanges(messenger, {
              propertyPath: ['network'],
              produceStateChanges: () => {
                controller.setRpcTarget('http://example.com', '123');
              },
            });

            expect(controller.state.providerConfig).toStrictEqual({
              type: 'rpc',
              rpcTarget: 'http://example.com',
              chainId: '123',
              ticker: undefined,
              nickname: undefined,
            });
          },
        );
      });

      it('sets isCustomNetwork in state to true', async () => {
        const messenger = buildMessenger();
        await withController(
          {
            messenger,
            state: {
              isCustomNetwork: false,
            },
          },
          async ({ controller }) => {
            const fakeMetamaskProvider = buildFakeMetamaskProvider();
            createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

            await waitForStateChanges(messenger, {
              propertyPath: ['isCustomNetwork'],
              produceStateChanges: () => {
                controller.setRpcTarget('http://example.com', '123');
              },
            });

            expect(controller.state.isCustomNetwork).toBe(true);
          },
        );
      });

      it('sets the provider to a custom RPC provider initialized with the RPC target and chain ID, leaving nickname and ticker undefined', async () => {
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

          controller.setRpcTarget('http://example.com', '123');

          expect(createMetamaskProviderMock).toHaveBeenCalledWith({
            chainId: '123',
            engineParams: { pollingInterval: 12000 },
            nickname: undefined,
            rpcUrl: 'http://example.com',
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

      it('updates networkDetails.isEIP1559Compatible in state based on the latest block (assuming that the request for eth_getBlockByNumber is made successfully)', async () => {
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

          await waitForStateChanges(messenger, {
            propertyPath: ['networkDetails', 'isEIP1559Compatible'],
            produceStateChanges: () => {
              controller.setRpcTarget('http://example.com', '123');
            },
          });

          expect(controller.state.networkDetails.isEIP1559Compatible).toBe(
            true,
          );
        });
      });

      it('ensures that the existing provider is stopped while replacing it', async () => {
        await withController(({ controller }) => {
          const fakeMetamaskProviders = [
            buildFakeMetamaskProvider(),
            buildFakeMetamaskProvider(),
          ];
          jest.spyOn(fakeMetamaskProviders[0], 'stop');
          createMetamaskProviderMock
            .mockImplementationOnce(() => fakeMetamaskProviders[0])
            .mockImplementationOnce(() => fakeMetamaskProviders[1]);

          controller.setRpcTarget('http://example.com', '123');
          controller.setRpcTarget('http://example.com', '123');
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

          await waitForStateChanges(messenger, {
            propertyPath: ['network'],
            produceStateChanges: () => {
              controller.setRpcTarget('http://example.com', '123');
            },
          });

          expect(controller.state.network).toBe('42');
        });
      });

      describe('when an "error" event occurs on the new provider', () => {
        describe('if the network version could not be retrieved during the call to setRpcTarget', () => {
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

              await waitForPublishedEvents(
                messenger,
                'NetworkController:providerConfigChange',
                {
                  produceEvents: () => {
                    controller.setRpcTarget('http://example.com', '123');
                    assert(controller.getProviderAndBlockTracker().provider);
                  },
                },
              );

              await waitForStateChanges(messenger, {
                propertyPath: ['network'],
                produceStateChanges: () => {
                  controller
                    .getProviderAndBlockTracker()
                    .provider.emit('error', { some: 'error' });
                },
              });
              expect(controller.state.network).toBe('42');
            });
          });
        });

        describe('if the network version could be retrieved during the call to setRpcTarget', () => {
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

              await waitForPublishedEvents(
                messenger,
                'NetworkController:providerConfigChange',
                {
                  produceEvents: () => {
                    controller.setRpcTarget('http://example.com', '123');
                    assert(controller.getProviderAndBlockTracker().provider);
                  },
                },
              );

              await waitForStateChanges(messenger, {
                propertyPath: ['network'],
                count: 0,
                produceStateChanges: () => {
                  controller
                    .getProviderAndBlockTracker()
                    .provider.emit('error', { some: 'error' });
                },
              });
              expect(controller.state.network).toBe('1');
            });
          });
        });
      });
    });

    describe('given an RPC target, chain ID, ticker, and nickname', () => {
      it('updates the provider config in state with the RPC target, chain ID, ticker, and nickname', async () => {
        const messenger = buildMessenger();
        await withController(
          {
            messenger,
            state: {
              providerConfig: {
                type: 'localhost',
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

            await waitForStateChanges(messenger, {
              propertyPath: ['network'],
              produceStateChanges: () => {
                controller.setRpcTarget(
                  'http://example.com',
                  '123',
                  'ABC',
                  'cool network',
                );
              },
            });

            expect(controller.state.providerConfig).toStrictEqual({
              type: 'rpc',
              rpcTarget: 'http://example.com',
              chainId: '123',
              ticker: 'ABC',
              nickname: 'cool network',
            });
          },
        );
      });

      it('sets isCustomNetwork in state to true', async () => {
        const messenger = buildMessenger();
        await withController(
          {
            messenger,
            state: {
              isCustomNetwork: false,
            },
          },
          async ({ controller }) => {
            const fakeMetamaskProvider = buildFakeMetamaskProvider();
            createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

            await waitForStateChanges(messenger, {
              propertyPath: ['isCustomNetwork'],
              produceStateChanges: () => {
                controller.setRpcTarget(
                  'http://example.com',
                  '123',
                  'ABC',
                  'cool network',
                );
              },
            });

            expect(controller.state.isCustomNetwork).toBe(true);
          },
        );
      });

      it('sets the provider to a custom RPC provider initialized with the RPC target, chain ID, and ticker, ignoring the nickname', async () => {
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

          controller.setRpcTarget(
            'http://example.com',
            '123',
            'ABC',
            'cool network',
          );

          expect(createMetamaskProviderMock).toHaveBeenCalledWith({
            chainId: '123',
            engineParams: { pollingInterval: 12000 },
            nickname: undefined,
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
        });
      });

      it('updates networkDetails.isEIP1559Compatible in state based on the latest block (assuming that the request for eth_getBlockByNumber is made successfully)', async () => {
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

          await waitForStateChanges(messenger, {
            propertyPath: ['networkDetails', 'isEIP1559Compatible'],
            produceStateChanges: () => {
              controller.setRpcTarget(
                'http://example.com',
                '123',
                'ABC',
                'cool network',
              );
            },
          });

          expect(controller.state.networkDetails.isEIP1559Compatible).toBe(
            true,
          );
        });
      });

      it('ensures that the existing provider is stopped while replacing it', async () => {
        await withController(({ controller }) => {
          const fakeMetamaskProviders = [
            buildFakeMetamaskProvider(),
            buildFakeMetamaskProvider(),
          ];
          jest.spyOn(fakeMetamaskProviders[0], 'stop');
          createMetamaskProviderMock
            .mockImplementationOnce(() => fakeMetamaskProviders[0])
            .mockImplementationOnce(() => fakeMetamaskProviders[1]);

          controller.setRpcTarget(
            'http://example.com',
            '123',
            'ABC',
            'cool network',
          );
          controller.setRpcTarget(
            'http://example.com',
            '123',
            'ABC',
            'cool network',
          );
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

          await waitForStateChanges(messenger, {
            propertyPath: ['network'],
            produceStateChanges: () => {
              controller.setRpcTarget(
                'http://example.com',
                '123',
                'ABC',
                'cool network',
              );
            },
          });

          expect(controller.state.network).toBe('42');
        });
      });

      describe('when an "error" event occurs on the new provider', () => {
        describe('if the network version could not be retrieved during the call to setRpcTarget', () => {
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

              await waitForPublishedEvents(
                messenger,
                'NetworkController:providerConfigChange',
                {
                  produceEvents: () => {
                    controller.setRpcTarget(
                      'http://example.com',
                      '123',
                      'ABC',
                      'cool network',
                    );
                    assert(controller.getProviderAndBlockTracker().provider);
                  },
                },
              );

              await waitForStateChanges(messenger, {
                propertyPath: ['network'],
                produceStateChanges: () => {
                  controller
                    .getProviderAndBlockTracker()
                    .provider.emit('error', { some: 'error' });
                },
              });
              expect(controller.state.network).toBe('42');
            });
          });
        });

        describe('if the network version could be retrieved during the call to setRpcTarget', () => {
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

              await waitForPublishedEvents(
                messenger,
                'NetworkController:providerConfigChange',
                {
                  produceEvents: () => {
                    controller.setRpcTarget(
                      'http://example.com',
                      '123',
                      'ABC',
                      'cool network',
                    );
                    assert(controller.getProviderAndBlockTracker().provider);
                  },
                },
              );

              await waitForStateChanges(messenger, {
                propertyPath: ['network'],
                count: 0,
                produceStateChanges: () => {
                  controller
                    .getProviderAndBlockTracker()
                    .provider.emit('error', { some: 'error' });
                },
              });
              expect(controller.state.network).toBe('1');
            });
          });
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

  describe('NetworkController:getProviderConfig action', () => {
    it('returns the provider config in state', async () => {
      const messenger = buildMessenger();
      await withController(
        {
          messenger,
          state: {
            providerConfig: {
              type: 'mainnet',
              chainId: '1',
            },
          },
        },
        async () => {
          const providerConfig = await messenger.call(
            'NetworkController:getProviderConfig',
          );

          expect(providerConfig).toStrictEqual({
            type: 'mainnet',
            chainId: '1',
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
  return { type: 'localhost' as const, chainId: '1337', ...config };
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

  controller.providerConfig = buildProviderConfig();
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
