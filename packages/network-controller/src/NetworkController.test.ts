import assert from 'assert';
import { mocked } from 'ts-jest/utils';
import { ControllerMessenger } from '@metamask/base-controller';
import * as ethQueryModule from 'eth-query';
import Subprovider from 'web3-provider-engine/subproviders/provider';
import createInfuraProvider from 'eth-json-rpc-infura/src/createProvider';
import type { ProviderEngine } from 'web3-provider-engine';
import createMetamaskProvider from 'web3-provider-engine/zero';
import { Patch } from 'immer';
import {
  FakeProviderEngine,
  FakeProviderStub,
} from '../tests/fake-provider-engine';
import {
  NetworkController,
  NetworkControllerActions,
  NetworkControllerEvents,
  NetworkControllerOptions,
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

type WithControllerCallback<ReturnValue> = ({
  controller,
}: {
  controller: NetworkController;
}) => Promise<ReturnValue> | ReturnValue;

type WithControllerOptions = Partial<NetworkControllerOptions>;

type WithControllerArgs<ReturnValue> =
  | [WithControllerCallback<ReturnValue>]
  | [WithControllerOptions, WithControllerCallback<ReturnValue>];

// Store this in case it gets stubbed later
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
          properties: { isEIP1559Compatible: false },
        });
      });
    });

    it('merges the given state into the default state', async () => {
      await withController(
        {
          state: {
            isCustomNetwork: true,
            properties: { isEIP1559Compatible: true },
          },
        },
        ({ controller }) => {
          expect(controller.state).toStrictEqual({
            network: 'loading',
            isCustomNetwork: true,
            providerConfig: { type: 'mainnet', chainId: '1' },
            properties: { isEIP1559Compatible: true },
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
      (['kovan', 'mainnet', 'rinkeby', 'goerli', 'ropsten'] as const).forEach(
        (networkType) => {
          describe(`when the provider config in state contains a network type of "${networkType}"`, () => {
            ['1', '3', '4', '5', '42', ''].forEach((chainId) => {
              describe(`when the provider config in state contains a chain ID of "${chainId}"`, () => {
                it('sets isCustomNetwork in state to false', async () => {
                  await withController(
                    {
                      state: {
                        providerConfig: buildProviderConfig({ chainId }),
                      },
                      infuraProjectId: 'infura-project-id',
                    },
                    ({ controller }) => {
                      const fakeInfuraProvider = buildFakeInfuraProvider();
                      createInfuraProviderMock.mockReturnValue(
                        fakeInfuraProvider,
                      );
                      const fakeInfuraSubprovider =
                        buildFakeInfuraSubprovider();
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

            describe('when the provider config in state contains a chain ID that is not 1, 3, 4, 5, 42, or an empty string', () => {
              it('sets isCustomNetwork in state to true', async () => {
                await withController(
                  {
                    state: {
                      providerConfig: buildProviderConfig({ chainId: '999' }),
                    },
                    infuraProjectId: 'infura-project-id',
                  },
                  ({ controller }) => {
                    const fakeInfuraProvider = buildFakeInfuraProvider();
                    createInfuraProviderMock.mockReturnValue(
                      fakeInfuraProvider,
                    );
                    const fakeInfuraSubprovider = buildFakeInfuraSubprovider();
                    SubproviderMock.mockReturnValue(fakeInfuraSubprovider);
                    const fakeMetamaskProvider = buildFakeMetamaskProvider();
                    createMetamaskProviderMock.mockReturnValue(
                      fakeMetamaskProvider,
                    );

                    controller.providerConfig = buildProviderConfig();

                    expect(controller.state.isCustomNetwork).toBe(true);
                  },
                );
              });
            });

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
                ({ controller }) => {
                  const fakeInfuraProvider = buildFakeInfuraProvider();
                  createInfuraProviderMock.mockReturnValue(fakeInfuraProvider);
                  const fakeInfuraSubprovider = buildFakeInfuraSubprovider();
                  SubproviderMock.mockReturnValue(fakeInfuraSubprovider);
                  const fakeMetamaskProvider = buildFakeMetamaskProvider();
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
                  expect(controller.provider).toBe(fakeMetamaskProvider);
                },
              );
            });

            it('calls getEIP1559Compatibility', async () => {
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
                  const fakeMetamaskProvider = buildFakeMetamaskProvider();
                  createMetamaskProviderMock.mockReturnValue(
                    fakeMetamaskProvider,
                  );
                  jest
                    .spyOn(controller, 'getEIP1559Compatibility')
                    .mockResolvedValue(undefined);

                  controller.providerConfig = buildProviderConfig();

                  expect(controller.getEIP1559Compatibility).toHaveBeenCalled();
                },
              );
            });

            it('stops the provider after a while if one already exists', async () => {
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
                  const fakeMetamaskProvider = buildFakeMetamaskProvider();
                  createMetamaskProviderMock.mockReturnValue(
                    fakeMetamaskProvider,
                  );
                  jest.spyOn(fakeMetamaskProvider, 'stop');

                  controller.providerConfig = buildProviderConfig();
                  controller.providerConfig = buildProviderConfig();
                  assert(controller.provider);
                  jest.runAllTimers();

                  expect(controller.provider.stop).toHaveBeenCalled();
                },
              );
            });

            describe('when an "error" event occurs on the new provider', () => {
              describe('when the network has not been connected to yet', () => {
                it('calls lookupNetwork twice more after the initial call in the providerConfig setter (due to the "error" event being listened to twice)', async () => {
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
                      createInfuraProviderMock.mockReturnValue(
                        fakeInfuraProvider,
                      );
                      const fakeInfuraSubprovider =
                        buildFakeInfuraSubprovider();
                      SubproviderMock.mockReturnValue(fakeInfuraSubprovider);
                      const fakeMetamaskProvider = buildFakeMetamaskProvider();
                      createMetamaskProviderMock.mockReturnValue(
                        fakeMetamaskProvider,
                      );
                      jest
                        .spyOn(controller, 'lookupNetwork')
                        .mockResolvedValue(undefined);

                      controller.providerConfig = buildProviderConfig();
                      assert(controller.provider);
                      controller.provider.emit('error', { some: 'error' });

                      expect(controller.lookupNetwork).toHaveBeenCalledTimes(3);
                    },
                  );
                });
              });

              describe('when the network has already been connected to', () => {
                it('does not call lookupNetwork again after the initial call in the providerConfig setter', async () => {
                  await withController(
                    {
                      state: {
                        network: '1',
                        providerConfig: buildProviderConfig({
                          type: networkType,
                        }),
                      },
                      infuraProjectId: 'infura-project-id',
                    },
                    ({ controller }) => {
                      const fakeInfuraProvider = buildFakeInfuraProvider();
                      createInfuraProviderMock.mockReturnValue(
                        fakeInfuraProvider,
                      );
                      const fakeInfuraSubprovider =
                        buildFakeInfuraSubprovider();
                      SubproviderMock.mockReturnValue(fakeInfuraSubprovider);
                      const fakeMetamaskProvider = buildFakeMetamaskProvider();
                      createMetamaskProviderMock.mockReturnValue(
                        fakeMetamaskProvider,
                      );
                      jest
                        .spyOn(controller, 'lookupNetwork')
                        .mockResolvedValue(undefined);

                      controller.providerConfig = buildProviderConfig();
                      assert(controller.provider);
                      expect(controller.state.network).not.toStrictEqual(
                        'loading',
                      );
                      controller.provider.emit('error', { some: 'error' });

                      expect(controller.lookupNetwork).toHaveBeenCalledTimes(1);
                    },
                  );
                });
              });
            });
          });
        },
      );

      describe(`when the provider config in state contains a network type of "localhost"`, () => {
        it('sets the provider to a custom RPC provider pointed to localhost and initialized with the configured chain ID, nickname, and ticker', async () => {
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
            ({ controller }) => {
              const fakeMetamaskProvider = buildFakeMetamaskProvider();
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
              expect(controller.provider).toBe(fakeMetamaskProvider);
            },
          );
        });

        it('calls getEIP1559Compatibility', async () => {
          await withController(
            {
              state: {
                providerConfig: buildProviderConfig({
                  type: 'localhost',
                }),
              },
            },
            ({ controller }) => {
              const fakeMetamaskProvider = buildFakeMetamaskProvider();
              createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
              jest
                .spyOn(controller, 'getEIP1559Compatibility')
                .mockResolvedValue(undefined);

              controller.providerConfig = buildProviderConfig();

              expect(controller.getEIP1559Compatibility).toHaveBeenCalled();
            },
          );
        });

        it('stops the provider after a while if one already exists', async () => {
          await withController(
            {
              state: {
                providerConfig: buildProviderConfig({
                  type: 'localhost',
                }),
              },
            },
            ({ controller }) => {
              const fakeMetamaskProvider = buildFakeMetamaskProvider();
              createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
              jest.spyOn(fakeMetamaskProvider, 'stop');

              controller.providerConfig = buildProviderConfig();
              controller.providerConfig = buildProviderConfig();
              assert(controller.provider);
              jest.runAllTimers();

              expect(controller.provider.stop).toHaveBeenCalled();
            },
          );
        });

        describe('when an "error" event occurs on the new provider', () => {
          describe('when the network has not been connected to yet', () => {
            it('calls lookupNetwork twice more after the initial call in the providerConfig setter (due to the "error" event being listened to twice)', async () => {
              await withController(
                {
                  state: {
                    providerConfig: buildProviderConfig({
                      type: 'localhost',
                    }),
                  },
                },
                ({ controller }) => {
                  const fakeMetamaskProvider = buildFakeMetamaskProvider();
                  createMetamaskProviderMock.mockReturnValue(
                    fakeMetamaskProvider,
                  );
                  jest
                    .spyOn(controller, 'lookupNetwork')
                    .mockResolvedValue(undefined);

                  controller.providerConfig = buildProviderConfig();
                  assert(controller.provider);
                  controller.provider.emit('error', { some: 'error' });

                  expect(controller.lookupNetwork).toHaveBeenCalledTimes(3);
                },
              );
            });
          });

          describe('when the network has already been connected to', () => {
            it('does not call lookupNetwork again after the initial call in the providerConfig setter', async () => {
              await withController(
                {
                  state: {
                    network: '1',
                    providerConfig: buildProviderConfig({
                      type: 'localhost',
                    }),
                  },
                },
                ({ controller }) => {
                  const fakeMetamaskProvider = buildFakeMetamaskProvider();
                  createMetamaskProviderMock.mockReturnValue(
                    fakeMetamaskProvider,
                  );
                  jest
                    .spyOn(controller, 'lookupNetwork')
                    .mockResolvedValue(undefined);

                  controller.providerConfig = buildProviderConfig();
                  assert(controller.provider);
                  controller.provider.emit('error', { some: 'error' });

                  expect(controller.lookupNetwork).toHaveBeenCalledTimes(1);
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
              ({ controller }) => {
                const fakeMetamaskProvider = buildFakeMetamaskProvider();
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
                expect(controller.provider).toBe(fakeMetamaskProvider);
              },
            );
          });

          it('calls getEIP1559Compatibility', async () => {
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
                const fakeMetamaskProvider = buildFakeMetamaskProvider();
                createMetamaskProviderMock.mockReturnValue(
                  fakeMetamaskProvider,
                );
                jest
                  .spyOn(controller, 'getEIP1559Compatibility')
                  .mockResolvedValue(undefined);

                controller.providerConfig = buildProviderConfig();

                expect(controller.getEIP1559Compatibility).toHaveBeenCalled();
              },
            );
          });

          it('stops the provider after a while if one already exists', async () => {
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
                const fakeMetamaskProvider = buildFakeMetamaskProvider();
                createMetamaskProviderMock.mockReturnValue(
                  fakeMetamaskProvider,
                );
                jest.spyOn(fakeMetamaskProvider, 'stop');

                controller.providerConfig = buildProviderConfig();
                controller.providerConfig = buildProviderConfig();
                jest.runAllTimers();

                assert(controller.provider);
                expect(controller.provider.stop).toHaveBeenCalled();
              },
            );
          });

          describe('when an "error" event occurs on the new provider', () => {
            describe('when the network has not been connected to yet', () => {
              it('calls lookupNetwork twice more after the initial call in the providerConfig setter (due to the "error" event being listened to twice)', async () => {
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
                    const fakeMetamaskProvider = buildFakeMetamaskProvider();
                    createMetamaskProviderMock.mockReturnValue(
                      fakeMetamaskProvider,
                    );
                    jest
                      .spyOn(controller, 'lookupNetwork')
                      .mockResolvedValue(undefined);

                    controller.providerConfig = buildProviderConfig();
                    assert(controller.provider);
                    controller.provider.emit('error', { some: 'error' });

                    expect(controller.lookupNetwork).toHaveBeenCalledTimes(3);
                  },
                );
              });
            });

            describe('when the network has already been connected to', () => {
              it('does not call lookupNetwork again after the initial call in the providerConfig setter', async () => {
                await withController(
                  {
                    state: {
                      network: '1',
                      providerConfig: buildProviderConfig({
                        type: 'rpc',
                        rpcTarget: 'http://example.com',
                      }),
                    },
                  },
                  ({ controller }) => {
                    const fakeMetamaskProvider = buildFakeMetamaskProvider();
                    createMetamaskProviderMock.mockReturnValue(
                      fakeMetamaskProvider,
                    );
                    jest
                      .spyOn(controller, 'lookupNetwork')
                      .mockResolvedValue(undefined);

                    controller.providerConfig = buildProviderConfig();
                    assert(controller.provider);
                    controller.provider.emit('error', { some: 'error' });

                    expect(controller.lookupNetwork).toHaveBeenCalledTimes(1);
                  },
                );
              });
            });
          });
        });

        describe('if the RPC target is not set', () => {
          it('does not set the provider', async () => {
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
                expect(controller.provider).toBeUndefined();
              },
            );
          });
        });
      });
    });
  });

  describe('lookupNetwork', () => {
    describe('if a provider has not been set', () => {
      it('makes no state changes', async () => {
        const messenger = buildMessenger();
        await withController({ messenger }, async ({ controller }) => {
          const promiseForStateChange = new Promise<void>((resolve) => {
            messenger.subscribe('NetworkController:stateChange', () => {
              resolve();
            });
          });

          await controller.lookupNetwork();

          await expect(promiseForStateChange).toNeverResolve();
        });
      });

      it('does not publish NetworkController:providerConfigChange', async () => {
        const messenger = buildMessenger();
        await withController({ messenger }, async ({ controller }) => {
          const promiseForProviderConfigChange = new Promise<void>(
            (resolve) => {
              messenger.subscribe(
                'NetworkController:providerConfigChange',
                () => {
                  resolve();
                },
              );
            },
          );

          await controller.lookupNetwork();

          await expect(promiseForProviderConfigChange).toNeverResolve();
        });
      });
    });

    describe('if a provider has been set, but the resulting EthQuery object does not have a sendAsync method', () => {
      it('makes no state changes', async () => {
        const messenger = buildMessenger();
        await withController({ messenger }, async ({ controller }) => {
          const fakeEthQuery = {};
          jest.spyOn(ethQueryModule, 'default').mockReturnValue(fakeEthQuery);
          await setFakeProvider(controller, {
            stubLookupNetworkWhileSetting: true,
          });
          const promiseForStateChange = new Promise<void>((resolve) => {
            messenger.subscribe('NetworkController:stateChange', () => {
              resolve();
            });
          });

          await controller.lookupNetwork();

          await expect(promiseForStateChange).toNeverResolve();
        });
      });

      it('does not publish NetworkController:providerConfigChange', async () => {
        const messenger = buildMessenger();
        await withController({ messenger }, async ({ controller }) => {
          const fakeEthQuery = {};
          jest.spyOn(ethQueryModule, 'default').mockReturnValue(fakeEthQuery);
          await setFakeProvider(controller, {
            stubLookupNetworkWhileSetting: true,
          });
          const promiseForProviderConfigChange = new Promise<void>(
            (resolve) => {
              messenger.subscribe(
                'NetworkController:providerConfigChange',
                () => {
                  resolve();
                },
              );
            },
          );

          await controller.lookupNetwork();

          await expect(promiseForProviderConfigChange).toNeverResolve();
        });
      });
    });

    describe('if a provider has been set and the resulting EthQuery object has a sendAsync method', () => {
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
              const promiseForStateChange = new Promise<void>((resolve) => {
                messenger.subscribe('NetworkController:stateChange', () => {
                  resolve();
                });
              });

              await controller.lookupNetwork();

              await promiseForStateChange;
              expect(controller.state.network).toBe('12345');
            },
          );
        });

        it("publishes NetworkController:providerConfigChange with the current provider config (even though it didn't change)", async () => {
          const messenger = buildMessenger();
          await withController({ messenger }, async ({ controller }) => {
            await setFakeProvider(controller, {
              stubLookupNetworkWhileSetting: true,
            });
            await setFakeProvider(controller, {
              stubs: [
                {
                  request: { method: 'net_version' },
                  response: { result: '12345' },
                },
              ],
              stubLookupNetworkWhileSetting: true,
            });
            const promiseForProviderConfigChange = new Promise((resolve) => {
              messenger.subscribe(
                'NetworkController:providerConfigChange',
                () => {
                  resolve(true);
                },
              );
            });

            await controller.lookupNetwork();

            expect(await promiseForProviderConfigChange).toBe(true);
          });
        });
      });

      describe('if the version of the current network is the same as that in state', () => {
        it('makes no state changes', async () => {
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
              const promiseForStateChange = new Promise<void>((resolve) => {
                messenger.subscribe('NetworkController:stateChange', () => {
                  resolve();
                });
              });

              await controller.lookupNetwork();

              await expect(promiseForStateChange).toNeverResolve();
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
              const promiseForProviderConfigChange = new Promise<void>(
                (resolve) => {
                  messenger.subscribe(
                    'NetworkController:providerConfigChange',
                    () => {
                      resolve();
                    },
                  );
                },
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
              const promiseForStateChange = new Promise<void>((resolve) => {
                messenger.subscribe('NetworkController:stateChange', () => {
                  resolve();
                });
              });

              await controller.lookupNetwork();

              await promiseForStateChange;
              expect(controller.state.network).toBe('loading');
            },
          );
        });

        it("publishes NetworkController:providerConfigChange with the current provider config (even though it didn't change)", async () => {
          const messenger = buildMessenger();
          await withController({ messenger }, async ({ controller }) => {
            await setFakeProvider(controller, {
              stubLookupNetworkWhileSetting: true,
            });
            await setFakeProvider(controller, {
              stubs: [
                {
                  request: { method: 'net_version' },
                  response: { error: 'some error' },
                },
              ],
              stubLookupNetworkWhileSetting: true,
            });
            const promiseForProviderConfigChange = new Promise((resolve) => {
              messenger.subscribe(
                'NetworkController:providerConfigChange',
                () => {
                  resolve(true);
                },
              );
            });

            await controller.lookupNetwork();

            expect(await promiseForProviderConfigChange).toBe(true);
          });
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
            const promiseForNewStates = new Promise<NetworkState[]>(
              (resolve) => {
                const newStates: NetworkState[] = [];
                messenger.subscribe(
                  'NetworkController:stateChange',
                  (newState) => {
                    newStates.push(newState);
                    if (newStates.length === 3) {
                      resolve(newStates);
                    }
                  },
                );
              },
            );

            await Promise.all([
              controller.lookupNetwork(),
              controller.lookupNetwork(),
              controller.lookupNetwork(),
            ]);

            expect(await promiseForNewStates).toMatchObject([
              expect.objectContaining({ network: '1' }),
              expect.objectContaining({ network: '2' }),
              expect.objectContaining({ network: '3' }),
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
            const promiseForStateChange = new Promise<void>((resolve) => {
              messenger.subscribe('NetworkController:stateChange', () => {
                resolve();
              });
            });

            controller.setProviderType('mainnet' as const);

            await promiseForStateChange;
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

      it('resets network and properties in state', async () => {
        const messenger = buildMessenger();
        await withController(
          {
            messenger,
            state: {
              network: 'whatever',
              properties: {
                isEIP1559Compatible: true,
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
            jest
              .spyOn(controller, 'getEIP1559Compatibility')
              .mockResolvedValue(undefined);
            const promiseForStateChange = new Promise<NetworkState>(
              (resolve) => {
                messenger.subscribe(
                  'NetworkController:stateChange',
                  (newState, patches) => {
                    if (didPropertyChange(patches, 'network')) {
                      resolve(newState);
                    }
                  },
                );
              },
            );

            controller.setProviderType('mainnet' as const);

            const newState = await promiseForStateChange;
            expect(newState.network).toStrictEqual('loading');
            expect(newState.properties).toStrictEqual({});
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
            const promiseForIsCustomNetworkChange = new Promise<void>(
              (resolve) => {
                messenger.subscribe(
                  'NetworkController:stateChange',
                  (_, patches) => {
                    if (didPropertyChange(patches, 'isCustomNetwork')) {
                      resolve();
                    }
                  },
                );
              },
            );

            controller.setProviderType('mainnet' as const);

            await promiseForIsCustomNetworkChange;
            expect(controller.state.isCustomNetwork).toBe(false);
          },
        );
      });

      it('sets the provider to an Infura provider pointed to Mainnet', async () => {
        await withController(
          {
            infuraProjectId: 'infura-project-id',
          },
          ({ controller }) => {
            const fakeInfuraProvider = buildFakeInfuraProvider();
            createInfuraProviderMock.mockReturnValue(fakeInfuraProvider);
            const fakeInfuraSubprovider = buildFakeInfuraSubprovider();
            SubproviderMock.mockReturnValue(fakeInfuraSubprovider);
            const fakeMetamaskProvider = buildFakeMetamaskProvider();
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
            expect(controller.provider).toBe(fakeMetamaskProvider);
          },
        );
      });

      it('calls getEIP1559Compatibility', async () => {
        await withController(({ controller }) => {
          const fakeInfuraProvider = buildFakeInfuraProvider();
          createInfuraProviderMock.mockReturnValue(fakeInfuraProvider);
          const fakeInfuraSubprovider = buildFakeInfuraSubprovider();
          SubproviderMock.mockReturnValue(fakeInfuraSubprovider);
          const fakeMetamaskProvider = buildFakeMetamaskProvider();
          createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
          jest
            .spyOn(controller, 'getEIP1559Compatibility')
            .mockResolvedValue(undefined);

          controller.setProviderType('mainnet' as const);

          expect(controller.getEIP1559Compatibility).toHaveBeenCalled();
        });
      });

      it('stops the provider after a while if one already exists', async () => {
        await withController(({ controller }) => {
          const fakeInfuraProvider = buildFakeInfuraProvider();
          createInfuraProviderMock.mockReturnValue(fakeInfuraProvider);
          const fakeInfuraSubprovider = buildFakeInfuraSubprovider();
          SubproviderMock.mockReturnValue(fakeInfuraSubprovider);
          const fakeMetamaskProvider = buildFakeMetamaskProvider();
          createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
          jest.spyOn(fakeMetamaskProvider, 'stop');

          controller.setProviderType('mainnet' as const);
          controller.setProviderType('mainnet' as const);
          assert(controller.provider);
          jest.runAllTimers();

          expect(controller.provider.stop).toHaveBeenCalled();
        });
      });

      it('calls lookupNetwork', async () => {
        await withController(({ controller }) => {
          const fakeInfuraProvider = buildFakeInfuraProvider();
          createInfuraProviderMock.mockReturnValue(fakeInfuraProvider);
          const fakeInfuraSubprovider = buildFakeInfuraSubprovider();
          SubproviderMock.mockReturnValue(fakeInfuraSubprovider);
          const fakeMetamaskProvider = buildFakeMetamaskProvider();
          createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
          jest.spyOn(controller, 'lookupNetwork');

          controller.setProviderType('mainnet' as const);

          expect(controller.lookupNetwork).toHaveBeenCalled();
        });
      });

      describe('when an "error" event occurs on the new provider', () => {
        describe('if the network version could not be retrieved during setProviderType', () => {
          it('calls lookupNetwork again after the initial call in setProviderType', async () => {
            await withController(({ controller }) => {
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
              ]);
              createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
              jest.spyOn(controller, 'lookupNetwork');

              controller.setProviderType('mainnet' as const);
              assert(controller.provider);
              controller.provider.emit('error', { some: 'error' });

              expect(controller.lookupNetwork).toHaveBeenCalledTimes(2);
            });
          });
        });

        describe('if the network version could be retrieved during setProviderType', () => {
          it('does not call lookupNetwork again after the initial call in setProviderType', async () => {
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
                    result: '0x1',
                  },
                },
              ]);
              createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
              jest.spyOn(controller, 'lookupNetwork');
              const promiseForNetworkChange = new Promise<void>((resolve) => {
                messenger.subscribe(
                  'NetworkController:stateChange',
                  (_, patches) => {
                    if (didPropertyChange(patches, 'network')) {
                      resolve();
                    }
                  },
                );
              });

              controller.setProviderType('mainnet' as const);
              assert(controller.provider);
              await promiseForNetworkChange;
              controller.provider.emit('error', { some: 'error' });

              expect(controller.lookupNetwork).toHaveBeenCalledTimes(1);
            });
          });
        });
      });
    });

    (
      [
        {
          networkType: 'rinkeby',
          ticker: 'RinkebyETH',
          chainId: '4',
          networkName: 'Rinkeby',
        },
        {
          networkType: 'goerli',
          ticker: 'GoerliETH',
          chainId: '5',
          networkName: 'Goerli',
        },
        {
          networkType: 'ropsten',
          ticker: 'RopstenETH',
          chainId: '3',
          networkName: 'Ropsten',
        },
        {
          networkType: 'kovan',
          ticker: 'KovanETH',
          chainId: '42',
          networkName: 'Kovan',
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
              const promiseForStateChange = new Promise<void>((resolve) => {
                messenger.subscribe('NetworkController:stateChange', () => {
                  resolve();
                });
              });

              controller.setProviderType(networkType);

              await promiseForStateChange;
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

        it('resets network and properties in state', async () => {
          const messenger = buildMessenger();
          await withController(
            {
              messenger,
              state: {
                network: 'whatever',
                properties: {
                  isEIP1559Compatible: true,
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
              jest
                .spyOn(controller, 'getEIP1559Compatibility')
                .mockResolvedValue(undefined);
              const promiseForStateChange = new Promise<NetworkState>(
                (resolve) => {
                  messenger.subscribe(
                    'NetworkController:stateChange',
                    (newState, patches) => {
                      if (didPropertyChange(patches, 'network')) {
                        resolve(newState);
                      }
                    },
                  );
                },
              );

              controller.setProviderType(networkType);

              const newState = await promiseForStateChange;
              expect(newState.network).toStrictEqual('loading');
              expect(newState.properties).toStrictEqual({});
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
              const promiseForIsCustomNetworkChange = new Promise<void>(
                (resolve) => {
                  messenger.subscribe(
                    'NetworkController:stateChange',
                    (_, patches) => {
                      if (didPropertyChange(patches, 'isCustomNetwork')) {
                        resolve();
                      }
                    },
                  );
                },
              );

              controller.setProviderType(networkType);

              await promiseForIsCustomNetworkChange;
              expect(controller.state.isCustomNetwork).toBe(false);
            },
          );
        });

        it(`sets the provider to an Infura provider pointed to ${networkName}`, async () => {
          await withController(
            {
              infuraProjectId: 'infura-project-id',
            },
            ({ controller }) => {
              const fakeInfuraProvider = buildFakeInfuraProvider();
              createInfuraProviderMock.mockReturnValue(fakeInfuraProvider);
              const fakeInfuraSubprovider = buildFakeInfuraSubprovider();
              SubproviderMock.mockReturnValue(fakeInfuraSubprovider);
              const fakeMetamaskProvider = buildFakeMetamaskProvider();
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
              expect(controller.provider).toBe(fakeMetamaskProvider);
            },
          );
        });

        it('calls getEIP1559Compatibility', async () => {
          await withController(({ controller }) => {
            const fakeInfuraProvider = buildFakeInfuraProvider();
            createInfuraProviderMock.mockReturnValue(fakeInfuraProvider);
            const fakeInfuraSubprovider = buildFakeInfuraSubprovider();
            SubproviderMock.mockReturnValue(fakeInfuraSubprovider);
            const fakeMetamaskProvider = buildFakeMetamaskProvider();
            createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
            jest
              .spyOn(controller, 'getEIP1559Compatibility')
              .mockResolvedValue(undefined);

            controller.setProviderType(networkType);

            expect(controller.getEIP1559Compatibility).toHaveBeenCalled();
          });
        });

        it('stops the provider after a while if one already exists', async () => {
          await withController(({ controller }) => {
            const fakeInfuraProvider = buildFakeInfuraProvider();
            createInfuraProviderMock.mockReturnValue(fakeInfuraProvider);
            const fakeInfuraSubprovider = buildFakeInfuraSubprovider();
            SubproviderMock.mockReturnValue(fakeInfuraSubprovider);
            const fakeMetamaskProvider = buildFakeMetamaskProvider();
            createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
            jest.spyOn(fakeMetamaskProvider, 'stop');

            controller.setProviderType('rinkeby' as const);
            controller.setProviderType('rinkeby' as const);
            assert(controller.provider);
            jest.runAllTimers();

            expect(controller.provider.stop).toHaveBeenCalled();
          });
        });

        it('calls lookupNetwork', async () => {
          await withController(({ controller }) => {
            const fakeInfuraProvider = buildFakeInfuraProvider();
            createInfuraProviderMock.mockReturnValue(fakeInfuraProvider);
            const fakeInfuraSubprovider = buildFakeInfuraSubprovider();
            SubproviderMock.mockReturnValue(fakeInfuraSubprovider);
            const fakeMetamaskProvider = buildFakeMetamaskProvider();
            createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
            jest.spyOn(controller, 'lookupNetwork');

            controller.setProviderType(networkType);

            expect(controller.lookupNetwork).toHaveBeenCalled();
          });
        });

        describe('when an "error" event occurs on the new provider', () => {
          describe('if the network version could not be retrieved during setProviderType', () => {
            it('calls lookupNetwork again after the initial call in setProviderType', async () => {
              await withController(({ controller }) => {
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
                ]);
                createMetamaskProviderMock.mockReturnValue(
                  fakeMetamaskProvider,
                );
                jest.spyOn(controller, 'lookupNetwork');

                controller.setProviderType(networkType);
                assert(controller.provider);
                controller.provider.emit('error', { some: 'error' });

                expect(controller.lookupNetwork).toHaveBeenCalledTimes(2);
              });
            });
          });

          describe('if the network version could be retrieved during setProviderType', () => {
            it('does not call lookupNetwork again after the initial call in setProviderType', async () => {
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
                      result: '0x1',
                    },
                  },
                ]);
                createMetamaskProviderMock.mockReturnValue(
                  fakeMetamaskProvider,
                );
                jest.spyOn(controller, 'lookupNetwork');
                const promiseForNetworkChange = new Promise<void>((resolve) => {
                  messenger.subscribe(
                    'NetworkController:stateChange',
                    (_, patches) => {
                      if (didPropertyChange(patches, 'network')) {
                        resolve();
                      }
                    },
                  );
                });

                controller.setProviderType(networkType);
                assert(controller.provider);
                await promiseForNetworkChange;
                controller.provider.emit('error', { some: 'error' });

                expect(controller.lookupNetwork).toHaveBeenCalledTimes(1);
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
            const promiseForStateChange = new Promise<void>((resolve) => {
              messenger.subscribe('NetworkController:stateChange', () => {
                resolve();
              });
            });

            controller.setProviderType('rpc' as const);

            await promiseForStateChange;
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

      it('resets network and properties in state', async () => {
        const messenger = buildMessenger();
        await withController(
          {
            messenger,
            state: {
              network: 'whatever',
              properties: {
                isEIP1559Compatible: true,
              },
            },
          },
          async ({ controller }) => {
            const fakeMetamaskProvider = buildFakeMetamaskProvider();
            createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
            jest
              .spyOn(controller, 'getEIP1559Compatibility')
              .mockResolvedValue(undefined);
            const promiseForStateChange = new Promise<NetworkState>(
              (resolve) => {
                messenger.subscribe(
                  'NetworkController:stateChange',
                  (newState, patches) => {
                    if (didPropertyChange(patches, 'network')) {
                      resolve(newState);
                    }
                  },
                );
              },
            );

            controller.setProviderType('rpc' as const);

            const newState = await promiseForStateChange;
            expect(newState.network).toStrictEqual('loading');
            expect(newState.properties).toStrictEqual({});
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
            const promiseForIsCustomNetworkChange = new Promise<void>(
              (resolve) => {
                messenger.subscribe(
                  'NetworkController:stateChange',
                  (_, patches) => {
                    if (didPropertyChange(patches, 'isCustomNetwork')) {
                      resolve();
                    }
                  },
                );
              },
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
          expect(controller.provider).toBeUndefined();
        });
      });

      it('calls getEIP1559Compatibility', async () => {
        await withController(({ controller }) => {
          const fakeMetamaskProvider = buildFakeMetamaskProvider();
          createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
          jest
            .spyOn(controller, 'getEIP1559Compatibility')
            .mockResolvedValue(undefined);

          controller.setProviderType('rpc' as const);

          expect(controller.getEIP1559Compatibility).toHaveBeenCalled();
        });
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
            const promiseForStateChange = new Promise<void>((resolve) => {
              messenger.subscribe('NetworkController:stateChange', () => {
                resolve();
              });
            });

            controller.setProviderType('localhost' as const);

            await promiseForStateChange;
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

      it('resets network and properties in state', async () => {
        const messenger = buildMessenger();
        await withController(
          {
            messenger,
            state: {
              network: 'whatever',
              properties: {
                isEIP1559Compatible: true,
              },
            },
          },
          async ({ controller }) => {
            const fakeMetamaskProvider = buildFakeMetamaskProvider();
            createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
            jest
              .spyOn(controller, 'getEIP1559Compatibility')
              .mockResolvedValue(undefined);
            const promiseForStateChange = new Promise<NetworkState>(
              (resolve) => {
                messenger.subscribe(
                  'NetworkController:stateChange',
                  (newState, patches) => {
                    if (didPropertyChange(patches, 'network')) {
                      resolve(newState);
                    }
                  },
                );
              },
            );

            controller.setProviderType('localhost' as const);

            const newState = await promiseForStateChange;
            expect(newState.network).toStrictEqual('loading');
            expect(newState.properties).toStrictEqual({});
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
            const promiseForIsCustomNetworkChange = new Promise<void>(
              (resolve) => {
                messenger.subscribe(
                  'NetworkController:stateChange',
                  (_, patches) => {
                    if (didPropertyChange(patches, 'isCustomNetwork')) {
                      resolve();
                    }
                  },
                );
              },
            );

            controller.setProviderType('localhost' as const);

            await promiseForIsCustomNetworkChange;
            expect(controller.state.isCustomNetwork).toBe(false);
          },
        );
      });

      it('sets the provider to a custom RPC provider pointed to localhost, leaving chain ID undefined', async () => {
        await withController(({ controller }) => {
          const fakeMetamaskProvider = buildFakeMetamaskProvider();
          createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

          controller.setProviderType('localhost' as const);

          expect(createMetamaskProviderMock).toHaveBeenCalledWith({
            chainId: undefined,
            engineParams: { pollingInterval: 12000 },
            nickname: undefined,
            rpcUrl: 'http://localhost:8545',
            ticker: undefined,
          });
          expect(controller.provider).toBe(fakeMetamaskProvider);
        });
      });

      it('calls getEIP1559Compatibility', async () => {
        await withController(({ controller }) => {
          const fakeMetamaskProvider = buildFakeMetamaskProvider();
          createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
          jest
            .spyOn(controller, 'getEIP1559Compatibility')
            .mockResolvedValue(undefined);

          controller.setProviderType('localhost' as const);

          expect(controller.getEIP1559Compatibility).toHaveBeenCalled();
        });
      });

      it('stops the provider after a while if one already exists', async () => {
        await withController(({ controller }) => {
          const fakeMetamaskProvider = buildFakeMetamaskProvider();
          createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
          jest.spyOn(fakeMetamaskProvider, 'stop');

          controller.setProviderType('localhost' as const);
          controller.setProviderType('localhost' as const);
          assert(controller.provider);
          jest.runAllTimers();

          expect(controller.provider.stop).toHaveBeenCalled();
        });
      });

      it('calls lookupNetwork', async () => {
        await withController(({ controller }) => {
          const fakeMetamaskProvider = buildFakeMetamaskProvider();
          createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
          jest.spyOn(controller, 'lookupNetwork');

          controller.setProviderType('localhost' as const);

          expect(controller.lookupNetwork).toHaveBeenCalled();
        });
      });

      describe('when an "error" event occurs on the new provider', () => {
        describe('if the network version could not be retrieved during setProviderType', () => {
          it('calls lookupNetwork again after the initial call in setProviderType', async () => {
            await withController(({ controller }) => {
              const fakeMetamaskProvider = buildFakeMetamaskProvider([
                {
                  request: {
                    method: 'net_version',
                  },
                  response: {
                    error: 'oops',
                  },
                },
              ]);
              createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
              jest.spyOn(controller, 'lookupNetwork');

              controller.setProviderType('localhost' as const);
              assert(controller.provider);
              controller.provider.emit('error', { some: 'error' });

              expect(controller.lookupNetwork).toHaveBeenCalledTimes(2);
            });
          });
        });

        describe('if the network version could be retrieved during setProviderType', () => {
          it('does not call lookupNetwork again after the initial call in setProviderType', async () => {
            const messenger = buildMessenger();
            await withController({ messenger }, async ({ controller }) => {
              const fakeMetamaskProvider = buildFakeMetamaskProvider([
                {
                  request: {
                    method: 'net_version',
                  },
                  response: {
                    result: '0x1',
                  },
                },
              ]);
              createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
              jest.spyOn(controller, 'lookupNetwork');
              const promiseForNetworkChange = new Promise<void>((resolve) => {
                messenger.subscribe(
                  'NetworkController:stateChange',
                  (_, patches) => {
                    if (didPropertyChange(patches, 'network')) {
                      resolve();
                    }
                  },
                );
              });

              controller.setProviderType('localhost' as const);
              assert(controller.provider);
              await promiseForNetworkChange;
              controller.provider.emit('error', { some: 'error' });

              expect(controller.lookupNetwork).toHaveBeenCalledTimes(1);
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
            const promiseForStateChange = new Promise<void>((resolve) => {
              messenger.subscribe('NetworkController:stateChange', () => {
                resolve();
              });
            });

            controller.setRpcTarget('http://example.com', '123');

            await promiseForStateChange;
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

      it('resets network and properties in state', async () => {
        const messenger = buildMessenger();
        await withController(
          {
            messenger,
            state: {
              network: 'whatever',
              properties: {
                isEIP1559Compatible: true,
              },
            },
          },
          async ({ controller }) => {
            const fakeMetamaskProvider = buildFakeMetamaskProvider();
            createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
            jest
              .spyOn(controller, 'getEIP1559Compatibility')
              .mockResolvedValue(undefined);
            const promiseForStateChange = new Promise<NetworkState>(
              (resolve) => {
                messenger.subscribe(
                  'NetworkController:stateChange',
                  (newState, patches) => {
                    if (didPropertyChange(patches, 'network')) {
                      resolve(newState);
                    }
                  },
                );
              },
            );

            controller.setRpcTarget('http://example.com', '123');

            const newState = await promiseForStateChange;
            expect(newState.network).toStrictEqual('loading');
            expect(newState.properties).toStrictEqual({});
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
            const promiseForIsCustomNetworkChange = new Promise<void>(
              (resolve) => {
                messenger.subscribe(
                  'NetworkController:stateChange',
                  (_, patches) => {
                    if (didPropertyChange(patches, 'isCustomNetwork')) {
                      resolve();
                    }
                  },
                );
              },
            );

            controller.setRpcTarget('http://example.com', '123');

            await promiseForIsCustomNetworkChange;
            expect(controller.state.isCustomNetwork).toBe(true);
          },
        );
      });

      it('sets the provider to a custom RPC provider initialized with the RPC target and chain ID, leaving nickname and ticker undefined', async () => {
        await withController(({ controller }) => {
          const fakeMetamaskProvider = buildFakeMetamaskProvider();
          createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);

          controller.setRpcTarget('http://example.com', '123');

          expect(createMetamaskProviderMock).toHaveBeenCalledWith({
            chainId: '123',
            engineParams: { pollingInterval: 12000 },
            nickname: undefined,
            rpcUrl: 'http://example.com',
            ticker: undefined,
          });
          expect(controller.provider).toBe(fakeMetamaskProvider);
        });
      });

      it('calls getEIP1559Compatibility', async () => {
        await withController(({ controller }) => {
          const fakeMetamaskProvider = buildFakeMetamaskProvider();
          createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
          jest
            .spyOn(controller, 'getEIP1559Compatibility')
            .mockResolvedValue(undefined);

          controller.setRpcTarget('http://example.com', '123');

          expect(controller.getEIP1559Compatibility).toHaveBeenCalled();
        });
      });

      it('stops the provider after a while if one already exists', async () => {
        await withController(({ controller }) => {
          const fakeMetamaskProvider = buildFakeMetamaskProvider();
          createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
          jest.spyOn(fakeMetamaskProvider, 'stop');

          controller.setRpcTarget('http://example.com', '123');
          controller.setRpcTarget('http://example.com', '123');
          assert(controller.provider);
          jest.runAllTimers();

          expect(controller.provider.stop).toHaveBeenCalled();
        });
      });

      it('calls lookupNetwork', async () => {
        await withController(({ controller }) => {
          const fakeMetamaskProvider = buildFakeMetamaskProvider();
          createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
          jest.spyOn(controller, 'lookupNetwork');

          controller.setRpcTarget('http://example.com', '123');

          expect(controller.lookupNetwork).toHaveBeenCalled();
        });
      });

      describe('when an "error" event occurs on the new provider', () => {
        describe('if the network version could not be retrieved during setRpcTarget', () => {
          it('calls lookupNetwork again after the initial call in setRpcTarget', async () => {
            await withController(({ controller }) => {
              const fakeMetamaskProvider = buildFakeMetamaskProvider([
                {
                  request: {
                    method: 'net_version',
                  },
                  response: {
                    error: 'oops',
                  },
                },
              ]);
              createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
              jest.spyOn(controller, 'lookupNetwork');

              controller.setRpcTarget('http://example.com', '123');
              assert(controller.provider);
              controller.provider.emit('error', { some: 'error' });

              expect(controller.lookupNetwork).toHaveBeenCalledTimes(2);
            });
          });
        });

        describe('if the network version could be retrieved during setRpcTarget', () => {
          it('does not call lookupNetwork again after the initial call in setRpcTarget', async () => {
            const messenger = buildMessenger();
            await withController({ messenger }, async ({ controller }) => {
              const fakeMetamaskProvider = buildFakeMetamaskProvider([
                {
                  request: {
                    method: 'net_version',
                  },
                  response: {
                    result: '0x1',
                  },
                },
              ]);
              createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
              jest.spyOn(controller, 'lookupNetwork');
              const promiseForNetworkChange = new Promise<void>((resolve) => {
                messenger.subscribe(
                  'NetworkController:stateChange',
                  (_, patches) => {
                    if (didPropertyChange(patches, 'network')) {
                      resolve();
                    }
                  },
                );
              });

              controller.setRpcTarget('http://example.com', '123');
              assert(controller.provider);
              await promiseForNetworkChange;
              controller.provider.emit('error', { some: 'error' });

              expect(controller.lookupNetwork).toHaveBeenCalledTimes(1);
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
            const promiseForStateChange = new Promise<void>((resolve) => {
              messenger.subscribe('NetworkController:stateChange', () => {
                resolve();
              });
            });

            controller.setRpcTarget(
              'http://example.com',
              '123',
              'ABC',
              'cool network',
            );

            await promiseForStateChange;
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

      it('resets network and properties in state', async () => {
        const messenger = buildMessenger();
        await withController(
          {
            messenger,
            state: {
              network: 'whatever',
              properties: {
                isEIP1559Compatible: true,
              },
            },
          },
          async ({ controller }) => {
            const fakeMetamaskProvider = buildFakeMetamaskProvider();
            createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
            jest
              .spyOn(controller, 'getEIP1559Compatibility')
              .mockResolvedValue(undefined);
            const promiseForStateChange = new Promise<NetworkState>(
              (resolve) => {
                messenger.subscribe(
                  'NetworkController:stateChange',
                  (newState, patches) => {
                    if (didPropertyChange(patches, 'network')) {
                      resolve(newState);
                    }
                  },
                );
              },
            );

            controller.setRpcTarget(
              'http://example.com',
              '123',
              'ABC',
              'cool network',
            );

            const newState = await promiseForStateChange;
            expect(newState.network).toStrictEqual('loading');
            expect(newState.properties).toStrictEqual({});
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
            const promiseForIsCustomNetworkChange = new Promise<void>(
              (resolve) => {
                messenger.subscribe(
                  'NetworkController:stateChange',
                  (_, patches) => {
                    if (didPropertyChange(patches, 'isCustomNetwork')) {
                      resolve();
                    }
                  },
                );
              },
            );

            controller.setRpcTarget(
              'http://example.com',
              '123',
              'ABC',
              'cool network',
            );

            await promiseForIsCustomNetworkChange;
            expect(controller.state.isCustomNetwork).toBe(true);
          },
        );
      });

      it('sets the provider to a custom RPC provider initialized with the RPC target, chain ID, and ticker, ignoring the nickname', async () => {
        await withController(({ controller }) => {
          const fakeMetamaskProvider = buildFakeMetamaskProvider();
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
          expect(controller.provider).toBe(fakeMetamaskProvider);
        });
      });

      it('calls getEIP1559Compatibility', async () => {
        await withController(({ controller }) => {
          const fakeMetamaskProvider = buildFakeMetamaskProvider();
          createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
          jest
            .spyOn(controller, 'getEIP1559Compatibility')
            .mockResolvedValue(undefined);

          controller.setRpcTarget(
            'http://example.com',
            '123',
            'ABC',
            'cool network',
          );

          expect(controller.getEIP1559Compatibility).toHaveBeenCalled();
        });
      });

      it('stops the provider after a while if one already exists', async () => {
        await withController(({ controller }) => {
          const fakeMetamaskProvider = buildFakeMetamaskProvider();
          createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
          jest.spyOn(fakeMetamaskProvider, 'stop');

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
          assert(controller.provider);
          jest.runAllTimers();

          expect(controller.provider.stop).toHaveBeenCalled();
        });
      });

      it('calls lookupNetwork', async () => {
        await withController(({ controller }) => {
          const fakeMetamaskProvider = buildFakeMetamaskProvider();
          createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
          jest.spyOn(controller, 'lookupNetwork');

          controller.setRpcTarget(
            'http://example.com',
            '123',
            'ABC',
            'cool network',
          );

          expect(controller.lookupNetwork).toHaveBeenCalled();
        });
      });

      describe('when an "error" event occurs on the new provider', () => {
        describe('if the network version could not be retrieved during setRpcTarget', () => {
          it('calls lookupNetwork again after the initial call in setRpcTarget', async () => {
            await withController(({ controller }) => {
              const fakeMetamaskProvider = buildFakeMetamaskProvider([
                {
                  request: {
                    method: 'net_version',
                  },
                  response: {
                    error: 'oops',
                  },
                },
              ]);
              createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
              jest.spyOn(controller, 'lookupNetwork');

              controller.setRpcTarget(
                'http://example.com',
                '123',
                'ABC',
                'cool network',
              );
              assert(controller.provider);
              controller.provider.emit('error', { some: 'error' });

              expect(controller.lookupNetwork).toHaveBeenCalledTimes(2);
            });
          });
        });

        describe('if the network version could be retrieved during setRpcTarget', () => {
          it('does not call lookupNetwork again after the initial call in setRpcTarget', async () => {
            const messenger = buildMessenger();
            await withController({ messenger }, async ({ controller }) => {
              const fakeMetamaskProvider = buildFakeMetamaskProvider([
                {
                  request: {
                    method: 'net_version',
                  },
                  response: {
                    result: '0x1',
                  },
                },
              ]);
              createMetamaskProviderMock.mockReturnValue(fakeMetamaskProvider);
              jest.spyOn(controller, 'lookupNetwork');
              const promiseForNetworkChange = new Promise<void>((resolve) => {
                messenger.subscribe(
                  'NetworkController:stateChange',
                  (_, patches) => {
                    if (didPropertyChange(patches, 'network')) {
                      resolve();
                    }
                  },
                );
              });

              controller.setRpcTarget(
                'http://example.com',
                '123',
                'ABC',
                'cool network',
              );
              assert(controller.provider);
              await promiseForNetworkChange;
              controller.provider.emit('error', { some: 'error' });

              expect(controller.lookupNetwork).toHaveBeenCalledTimes(1);
            });
          });
        });
      });
    });
  });

  describe('getEIP1559Compatibility', () => {
    describe('if the state does not have a "properties" property', () => {
      describe("but ethQuery doesn't have a sendAsync function", () => {
        it('makes no state changes', async () => {
          const messenger = buildMessenger();
          await withController(
            {
              messenger,
              state: {
                // no "properties" property
              },
            },
            async ({ controller }) => {
              const fakeEthQuery = {};
              jest
                .spyOn(ethQueryModule, 'default')
                .mockReturnValue(fakeEthQuery);
              await setFakeProvider(controller, {
                stubGetEIP1559CompatibilityWhileSetting: true,
              });
              const promiseForStateChange = new Promise<void>((resolve) => {
                messenger.subscribe('NetworkController:stateChange', () => {
                  resolve();
                });
              });

              await controller.getEIP1559Compatibility();

              await expect(promiseForStateChange).toNeverResolve();
            },
          );
        });

        it('returns a promise that resolves to true', async () => {
          await withController(
            {
              state: {
                // no "properties" property
              },
            },
            async ({ controller }) => {
              const fakeEthQuery = {};
              jest
                .spyOn(ethQueryModule, 'default')
                .mockReturnValue(fakeEthQuery);
              await setFakeProvider(controller, {
                stubGetEIP1559CompatibilityWhileSetting: true,
              });

              const result = await controller.getEIP1559Compatibility();

              expect(result).toBe(true);
            },
          );
        });
      });

      describe('and ethQuery has a sendAsync function', () => {
        describe('if no error is thrown while fetching the latest block', () => {
          describe('if the block has a "baseFeePerGas" property', () => {
            it('updates isEIP1559Compatible in state to true', async () => {
              const messenger = buildMessenger();
              await withController(
                {
                  messenger,
                  state: {
                    // no "properties" property
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
                  const promiseForStateChange = new Promise<void>((resolve) => {
                    messenger.subscribe('NetworkController:stateChange', () => {
                      resolve();
                    });
                  });

                  await controller.getEIP1559Compatibility();

                  await promiseForStateChange;
                  expect(controller.state.properties.isEIP1559Compatible).toBe(
                    true,
                  );
                },
              );
            });

            it('returns a promise that resolves to true', async () => {
              await withController(
                {
                  state: {
                    // no "properties" property
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
            it('makes no state changes', async () => {
              const messenger = buildMessenger();
              await withController(
                {
                  messenger,
                  state: {
                    // no "properties" property
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
                  const promiseForStateChange = new Promise<void>((resolve) => {
                    messenger.subscribe('NetworkController:stateChange', () => {
                      resolve();
                    });
                  });

                  await controller.getEIP1559Compatibility();

                  await expect(promiseForStateChange).toNeverResolve();
                },
              );
            });

            it('returns a promise that resolves to false', async () => {
              await withController(
                {
                  state: {
                    // no "properties" property
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
          it('makes no state changes', async () => {
            const messenger = buildMessenger();
            await withController(
              {
                messenger,
                state: {
                  // no "properties" property
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
                const promiseForStateChange = new Promise<void>((resolve) => {
                  messenger.subscribe('NetworkController:stateChange', () => {
                    resolve();
                  });
                });

                try {
                  await controller.getEIP1559Compatibility();
                } catch (error) {
                  // catch the rejection (it is tested below)
                }

                await expect(promiseForStateChange).toNeverResolve();
              },
            );
          });

          it('returns a promise that rejects with the error', async () => {
            await withController(
              {
                state: {
                  // no "properties" property
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
    });

    describe('if the state has a "properties" property, but it does not have an "isEIP1559Compatible" property', () => {
      describe("but ethQuery doesn't have a sendAsync function", () => {
        it('makes no state changes', async () => {
          const messenger = buildMessenger();
          await withController(
            {
              messenger,
              state: {
                properties: {
                  // no "isEIP1559Compatible" property
                },
              },
            },
            async ({ controller }) => {
              const fakeEthQuery = {};
              jest
                .spyOn(ethQueryModule, 'default')
                .mockReturnValue(fakeEthQuery);
              await setFakeProvider(controller, {
                stubGetEIP1559CompatibilityWhileSetting: true,
              });
              const promiseForStateChange = new Promise<void>((resolve) => {
                messenger.subscribe('NetworkController:stateChange', () => {
                  resolve();
                });
              });

              await controller.getEIP1559Compatibility();

              await expect(promiseForStateChange).toNeverResolve();
            },
          );
        });

        it('returns a promise that resolves to true', async () => {
          await withController(
            {
              state: {
                properties: {
                  // no "isEIP1559Compatible" property
                },
              },
            },
            async ({ controller }) => {
              const fakeEthQuery = {};
              jest
                .spyOn(ethQueryModule, 'default')
                .mockReturnValue(fakeEthQuery);
              await setFakeProvider(controller, {
                stubGetEIP1559CompatibilityWhileSetting: true,
              });

              const result = await controller.getEIP1559Compatibility();

              expect(result).toBe(true);
            },
          );
        });
      });

      describe('and ethQuery has a sendAsync function', () => {
        describe('if no error is thrown while fetching the latest block', () => {
          describe('if the block has a "baseFeePerGas" property', () => {
            it('updates isEIP1559Compatible in state to true', async () => {
              const messenger = buildMessenger();
              await withController(
                {
                  messenger,
                  state: {
                    properties: {
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
                  const promiseForStateChange = new Promise<void>((resolve) => {
                    messenger.subscribe('NetworkController:stateChange', () => {
                      resolve();
                    });
                  });

                  await controller.getEIP1559Compatibility();

                  await promiseForStateChange;
                  expect(controller.state.properties.isEIP1559Compatible).toBe(
                    true,
                  );
                },
              );
            });

            it('returns a promise that resolves to true', async () => {
              await withController(
                {
                  state: {
                    properties: {
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
                    properties: {
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
                  const promiseForStateChange = new Promise<void>((resolve) => {
                    messenger.subscribe('NetworkController:stateChange', () => {
                      resolve();
                    });
                  });

                  await controller.getEIP1559Compatibility();

                  await promiseForStateChange;
                  expect(controller.state.properties.isEIP1559Compatible).toBe(
                    false,
                  );
                },
              );
            });

            it('returns a promise that resolves to false', async () => {
              await withController(
                {
                  state: {
                    properties: {
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
          it('makes no state changes', async () => {
            const messenger = buildMessenger();
            await withController(
              {
                messenger,
                state: {
                  properties: {
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
                const promiseForStateChange = new Promise<void>((resolve) => {
                  messenger.subscribe('NetworkController:stateChange', () => {
                    resolve();
                  });
                });

                try {
                  await controller.getEIP1559Compatibility();
                } catch (error) {
                  // catch the rejection (it is tested below)
                }

                await expect(promiseForStateChange).toNeverResolve();
              },
            );
          });

          it('returns a promise that rejects with the error', async () => {
            await withController(
              {
                state: {
                  properties: {
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
    });

    describe('if isEIP1559Compatible in state is set to false', () => {
      describe("but ethQuery doesn't have a sendAsync function", () => {
        it('makes no state changes', async () => {
          const messenger = buildMessenger();
          await withController(
            {
              messenger,
              state: {
                properties: {
                  isEIP1559Compatible: false,
                },
              },
            },
            async ({ controller }) => {
              const fakeEthQuery = {};
              jest
                .spyOn(ethQueryModule, 'default')
                .mockReturnValue(fakeEthQuery);
              await setFakeProvider(controller, {
                stubGetEIP1559CompatibilityWhileSetting: true,
              });
              const promiseForStateChange = new Promise<void>((resolve) => {
                messenger.subscribe('NetworkController:stateChange', () => {
                  resolve();
                });
              });

              await controller.getEIP1559Compatibility();

              await expect(promiseForStateChange).toNeverResolve();
            },
          );
        });

        it('returns a promise that resolves to true', async () => {
          await withController(
            {
              state: {
                properties: {
                  isEIP1559Compatible: false,
                },
              },
            },
            async ({ controller }) => {
              const fakeEthQuery = {};
              jest
                .spyOn(ethQueryModule, 'default')
                .mockReturnValue(fakeEthQuery);
              await setFakeProvider(controller, {
                stubGetEIP1559CompatibilityWhileSetting: true,
              });

              const result = await controller.getEIP1559Compatibility();

              expect(result).toBe(true);
            },
          );
        });
      });

      describe('and ethQuery has a sendAsync function', () => {
        describe('if no error is thrown while fetching the latest block', () => {
          describe('if the block has a "baseFeePerGas" property', () => {
            it('updates isEIP1559Compatible in state to true', async () => {
              const messenger = buildMessenger();
              await withController(
                {
                  messenger,
                  state: {
                    properties: {
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
                  const promiseForStateChange = new Promise<void>((resolve) => {
                    messenger.subscribe('NetworkController:stateChange', () => {
                      resolve();
                    });
                  });

                  await controller.getEIP1559Compatibility();

                  await promiseForStateChange;
                  expect(controller.state.properties.isEIP1559Compatible).toBe(
                    true,
                  );
                },
              );
            });

            it('returns a promise that resolves to true', async () => {
              await withController(
                {
                  state: {
                    properties: {
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
            it('makes no state changes', async () => {
              const messenger = buildMessenger();
              await withController(
                {
                  messenger,
                  state: {
                    properties: {
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
                  const promiseForStateChange = new Promise<void>((resolve) => {
                    messenger.subscribe('NetworkController:stateChange', () => {
                      resolve();
                    });
                  });

                  await controller.getEIP1559Compatibility();

                  await expect(promiseForStateChange).toNeverResolve();
                },
              );
            });

            it('returns a promise that resolves to false', async () => {
              await withController(
                {
                  state: {
                    properties: {
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
          it('makes no state changes', async () => {
            const messenger = buildMessenger();
            await withController(
              {
                messenger,
                state: {
                  properties: {
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
                const promiseForStateChange = new Promise<void>((resolve) => {
                  messenger.subscribe('NetworkController:stateChange', () => {
                    resolve();
                  });
                });

                try {
                  await controller.getEIP1559Compatibility();
                } catch (error) {
                  // catch the rejection (it is tested below)
                }

                await expect(promiseForStateChange).toNeverResolve();
              },
            );
          });

          it('returns a promise that rejects with the error', async () => {
            await withController(
              {
                state: {
                  properties: {
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
    });

    describe('if isEIP1559Compatible in state is set to true', () => {
      it('makes no state changes', async () => {
        const messenger = buildMessenger();
        await withController(
          {
            messenger,
            state: {
              properties: {
                isEIP1559Compatible: true,
              },
            },
          },
          async ({ controller }) => {
            await setFakeProvider(controller, {
              stubGetEIP1559CompatibilityWhileSetting: true,
            });
            const promiseForStateChange = new Promise<void>((resolve) => {
              messenger.subscribe('NetworkController:stateChange', () => {
                resolve();
              });
            });

            await controller.getEIP1559Compatibility();

            await expect(promiseForStateChange).toNeverResolve();
          },
        );
      });

      it('returns a promise that resolves to true', async () => {
        await withController(
          {
            state: {
              properties: {
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
    allowedActions: [],
    allowedEvents: [
      'NetworkController:providerConfigChange',
      'NetworkController:stateChange',
    ],
  });
}

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
    controller.destroy();
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
  return {};
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
    lookupGetEIP1559CompatibilityMock.mockResolvedValue(undefined);
  }

  controller.providerConfig = buildProviderConfig();
  await waitFor(() => controller.provider !== undefined);
  assert(controller.provider);

  if (stubLookupNetworkWhileSetting) {
    lookupNetworkMock.mockRestore();
  }
  if (stubGetEIP1559CompatibilityWhileSetting) {
    lookupGetEIP1559CompatibilityMock.mockRestore();
  }

  return controller.provider;
}

/**
 * Calls the given function repeatedly until it returns true.
 *
 * @param check - The function.
 * @returns A promise that resolves to true when the function returns true, or
 * else never resolves.
 */
async function waitFor(check: () => boolean) {
  while (!check()) {
    await wait(50);
  }
  return Promise.resolve();
}

/**
 * Returns a promise that resolves after a while.
 *
 * @param duration - The amount of time to wait in milliseconds.
 * @returns The promise.
 */
async function wait<ReturnValue>(duration: number): Promise<ReturnValue> {
  return new Promise<ReturnValue>((resolve) => {
    originalSetTimeout(resolve, duration);
  });
}

/**
 * Given a set of Immer patches, determines whether the given property was
 * added, removed, or replaced in some way.
 *
 * @param patches - The Immer patches.
 * @param propertyName - The property name.
 * @returns A boolean.
 */
function didPropertyChange(patches: Patch[], propertyName: string): boolean {
  return patches.some(
    (patch) => patch.path.length === 0 || patch.path[0] === propertyName,
  );
}
