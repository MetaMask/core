import { deriveStateFromMetadata } from '@metamask/base-controller';
import { CONNECTIVITY_STATUSES } from '@metamask/connectivity-controller';
import type { ConnectivityControllerState } from '@metamask/connectivity-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import type {
  BuiltInNetworkClientId,
  InfuraRpcEndpoint,
  NetworkConfiguration,
  NetworkState,
} from '@metamask/network-controller';
import { NetworkStatus, RpcEndpointType } from '@metamask/network-controller';
import type { NetworkEnablementControllerState } from '@metamask/network-enablement-controller';
import { KnownCaipNamespace } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import type { NetworkConnectionBannerControllerMessenger } from './NetworkConnectionBannerController.js';
import { NetworkConnectionBannerController } from './NetworkConnectionBannerController.js';

const TEST_INFURA_PROJECT_ID = 'test-infura-project-id';
const MAINNET_CLIENT_ID = 'mainnet' satisfies BuiltInNetworkClientId;
const SEPOLIA_CLIENT_ID = 'sepolia' satisfies BuiltInNetworkClientId;
const POLYGON_CUSTOM_CLIENT_ID = 'polygon-custom';
const ALCHEMY_CLIENT_ID = 'eth-alchemy';

function buildNetworkConfiguration(
  overrides: Partial<NetworkConfiguration> &
    Pick<NetworkConfiguration, 'chainId'>,
): NetworkConfiguration {
  return {
    name: 'Ethereum Mainnet',
    nativeCurrency: 'ETH',
    rpcEndpoints: [
      buildInfuraEndpoint({
        networkClientId: MAINNET_CLIENT_ID,
        infuraNetworkType: 'mainnet',
      }),
    ],
    defaultRpcEndpointIndex: 0,
    blockExplorerUrls: [],
    defaultBlockExplorerUrlIndex: 0,
    ...overrides,
  };
}

describe('NetworkConnectionBannerController', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('metadata', () => {
    it('keeps banner state ephemeral and surfaces it to debug snapshots and the UI', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'persist',
          ),
        ).toMatchInlineSnapshot(`{}`);
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'includeInDebugSnapshot',
          ),
        ).toMatchInlineSnapshot(`
          {
            "networkConnectionBannerNetwork": null,
            "networkConnectionBannerStatus": "available",
          }
        `);
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'usedInUi',
          ),
        ).toMatchInlineSnapshot(`
          {
            "networkConnectionBannerNetwork": null,
            "networkConnectionBannerStatus": "available",
          }
        `);
      });
    });
  });

  describe('default state', () => {
    it('starts with status "available" and no network selected', async () => {
      await withController(({ controller }) => {
        expect(controller.state).toStrictEqual({
          networkConnectionBannerStatus: 'available',
          networkConnectionBannerNetwork: null,
        });
      });
    });
  });

  describe('timeout options', () => {
    it('honors custom degraded and unavailable timeouts', async () => {
      await withController(
        { degradedBannerTimeout: 1_000, unavailableBannerTimeout: 3_000 },
        ({ controller, publishNetworkStateChanges }) => {
          publishNetworkStateChanges(
            buildExternalState({
              networkConfigurationsByChainId: {
                '0x89': buildNetworkConfiguration({
                  chainId: '0x89',
                  rpcEndpoints: [
                    buildCustomEndpoint({
                      networkClientId: POLYGON_CUSTOM_CLIENT_ID,
                      url: 'https://polygon-rpc.com',
                    }),
                  ],
                }),
              },
              enabledEvmChainIds: ['0x89'],
              networksMetadata: {
                [POLYGON_CUSTOM_CLIENT_ID]: buildNetworkMetadata(
                  NetworkStatus.Unavailable,
                ),
              },
            }),
          );

          jest.advanceTimersByTime(999);
          expect(controller.state.networkConnectionBannerStatus).toBe(
            'available',
          );

          jest.advanceTimersByTime(1);
          expect(controller.state.networkConnectionBannerStatus).toBe(
            'degraded',
          );

          jest.advanceTimersByTime(1_999);
          expect(controller.state.networkConnectionBannerStatus).toBe(
            'degraded',
          );

          jest.advanceTimersByTime(1);
          expect(controller.state.networkConnectionBannerStatus).toBe(
            'unavailable',
          );
        },
      );
    });

    it('throws when the unavailable timeout does not exceed the degraded timeout', async () => {
      await expect(
        withController(
          { degradedBannerTimeout: 5_000, unavailableBannerTimeout: 5_000 },
          () => undefined,
        ),
      ).rejects.toThrow(
        '`unavailableBannerTimeout` (5000) must be greater than `degradedBannerTimeout` (5000).',
      );
    });
  });

  describe('lifecycle', () => {
    it('does not evaluate existing upstream state before the UI opens on an unlocked wallet', async () => {
      const externalState = buildExternalState({
        networkConfigurationsByChainId: {
          '0x89': buildNetworkConfiguration({
            chainId: '0x89',
            rpcEndpoints: [
              buildCustomEndpoint({
                networkClientId: POLYGON_CUSTOM_CLIENT_ID,
                url: 'https://polygon-rpc.com',
              }),
            ],
          }),
        },
        enabledEvmChainIds: ['0x89'],
        networksMetadata: {
          [POLYGON_CUSTOM_CLIENT_ID]: buildNetworkMetadata(
            NetworkStatus.Unavailable,
          ),
        },
      });

      await withController(
        { externalState, start: false },
        ({ controller }) => {
          jest.advanceTimersByTime(30_000);

          expect(controller.state.networkConnectionBannerStatus).toBe(
            'available',
          );
        },
      );
    });

    it('evaluates existing upstream state once the UI is open and the wallet unlocked', async () => {
      const externalState = buildExternalState({
        networkConfigurationsByChainId: {
          '0x89': buildNetworkConfiguration({
            chainId: '0x89',
            rpcEndpoints: [
              buildCustomEndpoint({
                networkClientId: POLYGON_CUSTOM_CLIENT_ID,
                url: 'https://polygon-rpc.com',
              }),
            ],
          }),
        },
        enabledEvmChainIds: ['0x89'],
        networksMetadata: {
          [POLYGON_CUSTOM_CLIENT_ID]: buildNetworkMetadata(
            NetworkStatus.Unavailable,
          ),
        },
      });

      await withController(
        { externalState, start: false },
        ({ controller, setUiOpen, setKeyringUnlocked }) => {
          setUiOpen(true);
          setKeyringUnlocked(true);
          // Repeated signals must not restart the evaluation.
          setKeyringUnlocked(true);

          jest.advanceTimersByTime(5_000);

          expect(controller.state.networkConnectionBannerStatus).toBe(
            'degraded',
          );
        },
      );
    });

    it('ignores upstream state changes while the wallet is locked', async () => {
      await withController(
        {
          externalState: buildExternalState({ enabledEvmChainIds: ['0x89'] }),
          start: false,
        },
        ({
          controller,
          setNetworkControllerState,
          setUiOpen,
          setKeyringUnlocked,
        }) => {
          setUiOpen(true);
          setNetworkControllerState({
            networkConfigurationsByChainId: {
              '0x89': buildNetworkConfiguration({
                chainId: '0x89',
                rpcEndpoints: [
                  buildCustomEndpoint({
                    networkClientId: POLYGON_CUSTOM_CLIENT_ID,
                    url: 'https://polygon-rpc.com',
                  }),
                ],
              }),
            },
            networksMetadata: {
              [POLYGON_CUSTOM_CLIENT_ID]: buildNetworkMetadata(
                NetworkStatus.Unavailable,
              ),
            },
          });

          jest.advanceTimersByTime(30_000);
          expect(controller.state.networkConnectionBannerStatus).toBe(
            'available',
          );

          setKeyringUnlocked(true);
          jest.advanceTimersByTime(5_000);
          expect(controller.state.networkConnectionBannerStatus).toBe(
            'degraded',
          );
        },
      );
    });

    it('resumes evaluation when the UI reopens', async () => {
      await withController(
        { externalState: buildExternalState({ enabledEvmChainIds: ['0x89'] }) },
        ({ controller, setNetworkControllerState, setUiOpen }) => {
          setUiOpen(false);

          setNetworkControllerState({
            networkConfigurationsByChainId: {
              '0x89': buildNetworkConfiguration({
                chainId: '0x89',
                rpcEndpoints: [
                  buildCustomEndpoint({
                    networkClientId: POLYGON_CUSTOM_CLIENT_ID,
                    url: 'https://polygon-rpc.com',
                  }),
                ],
              }),
            },
            networksMetadata: {
              [POLYGON_CUSTOM_CLIENT_ID]: buildNetworkMetadata(
                NetworkStatus.Unavailable,
              ),
            },
          });

          expect(controller.state.networkConnectionBannerStatus).toBe(
            'available',
          );

          setUiOpen(true);
          jest.advanceTimersByTime(5_000);
          expect(controller.state.networkConnectionBannerStatus).toBe(
            'degraded',
          );
        },
      );
    });

    it('cancels a pending banner and resets state on lock', async () => {
      await withController(
        { externalState: buildExternalState({ enabledEvmChainIds: ['0x89'] }) },
        ({ controller, setNetworkControllerState, setKeyringUnlocked }) => {
          setNetworkControllerState({
            networkConfigurationsByChainId: {
              '0x89': buildNetworkConfiguration({
                chainId: '0x89',
                rpcEndpoints: [
                  buildCustomEndpoint({
                    networkClientId: POLYGON_CUSTOM_CLIENT_ID,
                    url: 'https://polygon-rpc.com',
                  }),
                ],
              }),
            },
            networksMetadata: {
              [POLYGON_CUSTOM_CLIENT_ID]: buildNetworkMetadata(
                NetworkStatus.Unavailable,
              ),
            },
          });

          jest.advanceTimersByTime(5_000);
          expect(controller.state.networkConnectionBannerStatus).toBe(
            'degraded',
          );

          setKeyringUnlocked(false);
          jest.advanceTimersByTime(30_000);
          expect(controller.state).toStrictEqual({
            networkConnectionBannerStatus: 'available',
            networkConnectionBannerNetwork: null,
          });
        },
      );
    });

    it('ignores upstream state changes after the UI closes', async () => {
      await withController(
        { externalState: buildExternalState({ enabledEvmChainIds: ['0x89'] }) },
        ({ controller, setNetworkControllerState, setUiOpen }) => {
          setUiOpen(false);
          setNetworkControllerState({
            networkConfigurationsByChainId: {
              '0x89': buildNetworkConfiguration({
                chainId: '0x89',
                rpcEndpoints: [
                  buildCustomEndpoint({
                    networkClientId: POLYGON_CUSTOM_CLIENT_ID,
                    url: 'https://polygon-rpc.com',
                  }),
                ],
              }),
            },
            networksMetadata: {
              [POLYGON_CUSTOM_CLIENT_ID]: buildNetworkMetadata(
                NetworkStatus.Unavailable,
              ),
            },
          });

          jest.advanceTimersByTime(30_000);
          expect(controller.state.networkConnectionBannerStatus).toBe(
            'available',
          );
        },
      );
    });

    it('stays dormant when the wallet locks without ever having started', async () => {
      await withController(
        { start: false },
        ({ controller, setKeyringUnlocked }) => {
          setKeyringUnlocked(false);
          setKeyringUnlocked(false);
          expect(controller.state).toStrictEqual({
            networkConnectionBannerStatus: 'available',
            networkConnectionBannerNetwork: null,
          });
        },
      );
    });

    it('bails out when a stateChanged listener locks the wallet synchronously during refresh', async () => {
      await withController(
        ({
          controller,
          controllerMessenger,
          publishNetworkStateChanges,
          setKeyringUnlocked,
        }) => {
          // Escalate the banner to `unavailable` so state is non default and the
          // next refresh's pre timer `update` actually mutates state.
          publishNetworkStateChanges(
            buildExternalState({
              networkConfigurationsByChainId: {
                '0x89': buildNetworkConfiguration({
                  chainId: '0x89',
                  rpcEndpoints: [
                    buildCustomEndpoint({
                      networkClientId: POLYGON_CUSTOM_CLIENT_ID,
                      url: 'https://polygon-rpc.com',
                    }),
                  ],
                }),
              },
              enabledEvmChainIds: ['0x89'],
              networksMetadata: {
                [POLYGON_CUSTOM_CLIENT_ID]: buildNetworkMetadata(
                  NetworkStatus.Unavailable,
                ),
              },
            }),
          );
          jest.advanceTimersByTime(30_000);
          expect(controller.state.networkConnectionBannerStatus).toBe(
            'unavailable',
          );

          let stopped = false;
          controllerMessenger.subscribe(
            'NetworkConnectionBannerController:stateChanged',
            () => {
              if (!stopped) {
                stopped = true;
                setKeyringUnlocked(false);
              }
            },
          );

          // Trigger a refresh whose pre timer `update` will fire `stateChanged`
          // (previous state was `unavailable`/polygon → available/null).
          publishNetworkStateChanges(
            buildExternalState({
              networkConfigurationsByChainId: {
                '0x1': buildNetworkConfiguration({
                  chainId: '0x1',
                  rpcEndpoints: [
                    buildCustomEndpoint({
                      networkClientId: ALCHEMY_CLIENT_ID,
                      url: 'https://eth-mainnet.alchemyapi.io/v2/abc',
                    }),
                  ],
                }),
              },
              enabledEvmChainIds: ['0x1'],
              networksMetadata: {
                [ALCHEMY_CLIENT_ID]: buildNetworkMetadata(
                  NetworkStatus.Unavailable,
                ),
              },
            }),
          );

          jest.advanceTimersByTime(30_000);
          expect(controller.state).toStrictEqual({
            networkConnectionBannerStatus: 'available',
            networkConnectionBannerNetwork: null,
          });
        },
      );
    });

    it('bails out when a stateChanged listener locks the wallet synchronously at the degraded fire', async () => {
      await withController(
        ({
          controller,
          controllerMessenger,
          publishNetworkStateChanges,
          setKeyringUnlocked,
        }) => {
          controllerMessenger.subscribe(
            'NetworkConnectionBannerController:stateChanged',
            (state) => {
              if (state.networkConnectionBannerStatus === 'degraded') {
                setKeyringUnlocked(false);
              }
            },
          );

          publishNetworkStateChanges(
            buildExternalState({
              networkConfigurationsByChainId: {
                '0x89': buildNetworkConfiguration({
                  chainId: '0x89',
                  rpcEndpoints: [
                    buildCustomEndpoint({
                      networkClientId: POLYGON_CUSTOM_CLIENT_ID,
                      url: 'https://polygon-rpc.com',
                    }),
                  ],
                }),
              },
              enabledEvmChainIds: ['0x89'],
              networksMetadata: {
                [POLYGON_CUSTOM_CLIENT_ID]: buildNetworkMetadata(
                  NetworkStatus.Unavailable,
                ),
              },
            }),
          );

          // Advance to fire the degraded timer; its `update` triggers the
          // listener, which locks the wallet. The guard should bail before
          // scheduling the unavailable escalation.
          jest.advanceTimersByTime(30_000);
          expect(controller.state).toStrictEqual({
            networkConnectionBannerStatus: 'available',
            networkConnectionBannerNetwork: null,
          });
        },
      );
    });
  });

  describe('on NetworkController:stateChange', () => {
    it('does not show the banner when only one Infura network is failing alongside healthy peers (single-provider blip)', async () => {
      await withController(({ controller, publishNetworkStateChanges }) => {
        publishNetworkStateChanges(
          buildExternalState({
            networkConfigurationsByChainId: {
              '0x1': buildNetworkConfiguration({
                chainId: '0x1',
                rpcEndpoints: [
                  buildInfuraEndpoint({
                    networkClientId: MAINNET_CLIENT_ID,
                    infuraNetworkType: 'mainnet',
                  }),
                ],
              }),
              '0xaa36a7': buildNetworkConfiguration({
                chainId: '0xaa36a7',
                name: 'Sepolia',
                nativeCurrency: 'SepoliaETH',
                rpcEndpoints: [
                  buildInfuraEndpoint({
                    networkClientId: SEPOLIA_CLIENT_ID,
                    infuraNetworkType: 'sepolia',
                  }),
                ],
              }),
            },
            networksMetadata: {
              [MAINNET_CLIENT_ID]: buildNetworkMetadata(
                NetworkStatus.Unavailable,
              ),
              [SEPOLIA_CLIENT_ID]: buildNetworkMetadata(
                NetworkStatus.Available,
              ),
            },
          }),
        );

        jest.advanceTimersByTime(30_000);

        expect(controller.state).toStrictEqual({
          networkConnectionBannerStatus: 'available',
          networkConnectionBannerNetwork: null,
        });
      });
    });

    it('does not show the banner when many Infura networks are failing simultaneously alongside a healthy custom peer', async () => {
      await withController(({ controller, publishNetworkStateChanges }) => {
        publishNetworkStateChanges(
          buildExternalState({
            networkConfigurationsByChainId: {
              '0x1': buildNetworkConfiguration({
                chainId: '0x1',
                rpcEndpoints: [
                  buildInfuraEndpoint({
                    networkClientId: MAINNET_CLIENT_ID,
                    infuraNetworkType: 'mainnet',
                  }),
                ],
              }),
              '0xaa36a7': buildNetworkConfiguration({
                chainId: '0xaa36a7',
                name: 'Sepolia',
                nativeCurrency: 'SepoliaETH',
                rpcEndpoints: [
                  buildInfuraEndpoint({
                    networkClientId: SEPOLIA_CLIENT_ID,
                    infuraNetworkType: 'sepolia',
                  }),
                ],
              }),
              '0x89': buildNetworkConfiguration({
                chainId: '0x89',
                rpcEndpoints: [
                  buildCustomEndpoint({
                    networkClientId: POLYGON_CUSTOM_CLIENT_ID,
                    url: 'https://polygon-rpc.com',
                  }),
                ],
              }),
            },
            networksMetadata: {
              [MAINNET_CLIENT_ID]: buildNetworkMetadata(
                NetworkStatus.Unavailable,
              ),
              [SEPOLIA_CLIENT_ID]: buildNetworkMetadata(
                NetworkStatus.Unavailable,
              ),
              [POLYGON_CUSTOM_CLIENT_ID]: buildNetworkMetadata(
                NetworkStatus.Available,
              ),
            },
          }),
        );

        jest.advanceTimersByTime(30_000);

        expect(controller.state.networkConnectionBannerStatus).toBe(
          'available',
        );
      });
    });

    it('walks the full degraded-to-unavailable escalation when Infura and custom networks fail together', async () => {
      await withController(({ controller, publishNetworkStateChanges }) => {
        publishNetworkStateChanges(
          buildExternalState({
            networkConfigurationsByChainId: {
              '0x1': buildNetworkConfiguration({
                chainId: '0x1',
                rpcEndpoints: [
                  buildInfuraEndpoint({
                    networkClientId: MAINNET_CLIENT_ID,
                    infuraNetworkType: 'mainnet',
                  }),
                ],
              }),
              '0xa4b1': buildNetworkConfiguration({
                chainId: '0xa4b1',
                name: 'Arbitrum One',
                nativeCurrency: 'ETH',
                rpcEndpoints: [
                  buildCustomEndpoint({
                    networkClientId: ALCHEMY_CLIENT_ID,
                    url: 'https://arb-mainnet.g.alchemy.com/v2/abc',
                  }),
                ],
              }),
            },
            networksMetadata: {
              [MAINNET_CLIENT_ID]: buildNetworkMetadata(
                NetworkStatus.Unavailable,
              ),
              [ALCHEMY_CLIENT_ID]: buildNetworkMetadata(
                NetworkStatus.Unavailable,
              ),
            },
          }),
        );

        // Below the degraded threshold — banner still hidden.
        jest.advanceTimersByTime(4_999);
        expect(controller.state.networkConnectionBannerStatus).toBe(
          'available',
        );

        // Cross the 5s mark — degraded banner appears. Custom override surfaces
        // the Alchemy network so the "Switch to Infura" CTA targets it.
        jest.advanceTimersByTime(1);
        expect(controller.state.networkConnectionBannerStatus).toBe('degraded');
        expect(controller.state.networkConnectionBannerNetwork).toMatchObject({
          chainId: '0xa4b1',
          isInfuraEndpoint: false,
          rpcUrl: 'https://arb-mainnet.g.alchemy.com/v2/abc',
        });

        // Cross the 30s mark — escalates to unavailable.
        jest.advanceTimersByTime(25_000);
        expect(controller.state.networkConnectionBannerStatus).toBe(
          'unavailable',
        );
      });
    });

    it('treats a custom endpoint carrying our substituted Infura URL as Infura (popular network add)', async () => {
      await withController(({ controller, publishNetworkStateChanges }) => {
        publishNetworkStateChanges(
          buildExternalState({
            networkConfigurationsByChainId: {
              '0xa86a': buildNetworkConfiguration({
                chainId: '0xa86a',
                name: 'Avalanche',
                nativeCurrency: 'AVAX',
                rpcEndpoints: [
                  buildCustomEndpoint({
                    networkClientId: 'avalanche-popular',
                    url: `https://avalanche-mainnet.infura.io/v3/${TEST_INFURA_PROJECT_ID}`,
                  }),
                ],
              }),
              '0x1': buildNetworkConfiguration({
                chainId: '0x1',
                rpcEndpoints: [
                  buildInfuraEndpoint({
                    networkClientId: MAINNET_CLIENT_ID,
                    infuraNetworkType: 'mainnet',
                  }),
                ],
              }),
            },
            enabledEvmChainIds: ['0xa86a', '0x1'],
            networksMetadata: {
              'avalanche-popular': buildNetworkMetadata(
                NetworkStatus.Unavailable,
              ),
              [MAINNET_CLIENT_ID]: buildNetworkMetadata(
                NetworkStatus.Available,
              ),
            },
          }),
        );

        // A single failing MetaMask Infura endpoint amid healthy peers is a
        // provider blip, not a custom failure, so no banner.
        jest.advanceTimersByTime(30_000);
        expect(controller.state.networkConnectionBannerStatus).toBe(
          'available',
        );
      });
    });

    it('shows the banner when a single custom RPC fails amid healthy Infura peers (custom override)', async () => {
      await withController(({ controller, publishNetworkStateChanges }) => {
        publishNetworkStateChanges(
          buildExternalState({
            networkConfigurationsByChainId: {
              '0x1': buildNetworkConfiguration({
                chainId: '0x1',
                rpcEndpoints: [
                  buildInfuraEndpoint({
                    networkClientId: MAINNET_CLIENT_ID,
                    infuraNetworkType: 'mainnet',
                  }),
                ],
              }),
              '0x89': buildNetworkConfiguration({
                chainId: '0x89',
                rpcEndpoints: [
                  buildCustomEndpoint({
                    networkClientId: POLYGON_CUSTOM_CLIENT_ID,
                    url: 'https://polygon-rpc.com',
                  }),
                ],
              }),
            },
            networksMetadata: {
              [MAINNET_CLIENT_ID]: buildNetworkMetadata(
                NetworkStatus.Available,
              ),
              [POLYGON_CUSTOM_CLIENT_ID]: buildNetworkMetadata(
                NetworkStatus.Unavailable,
              ),
            },
          }),
        );

        jest.advanceTimersByTime(5_000);

        expect(controller.state.networkConnectionBannerStatus).toBe('degraded');
        expect(controller.state.networkConnectionBannerNetwork).toMatchObject({
          chainId: '0x89',
          isInfuraEndpoint: false,
        });
      });
    });

    it('shows the banner when every enabled network is failing (all-down escape hatch)', async () => {
      await withController(({ controller, publishNetworkStateChanges }) => {
        publishNetworkStateChanges(
          buildExternalState({
            networkConfigurationsByChainId: {
              '0x1': buildNetworkConfiguration({
                chainId: '0x1',
                rpcEndpoints: [
                  buildInfuraEndpoint({
                    networkClientId: MAINNET_CLIENT_ID,
                    infuraNetworkType: 'mainnet',
                  }),
                ],
              }),
            },
            enabledEvmChainIds: ['0x1'],
            networksMetadata: {
              [MAINNET_CLIENT_ID]: buildNetworkMetadata(
                NetworkStatus.Unavailable,
              ),
            },
          }),
        );

        jest.advanceTimersByTime(5_000);

        expect(controller.state.networkConnectionBannerStatus).toBe('degraded');
        expect(controller.state.networkConnectionBannerNetwork).toMatchObject({
          chainId: '0x1',
          isInfuraEndpoint: true,
        });
      });
    });

    it('does not show the banner when an Infura network fails while another enabled network still has unknown status', async () => {
      await withController(({ controller, publishNetworkStateChanges }) => {
        publishNetworkStateChanges(
          buildExternalState({
            networkConfigurationsByChainId: {
              '0x1': buildNetworkConfiguration({
                chainId: '0x1',
                rpcEndpoints: [
                  buildInfuraEndpoint({
                    networkClientId: MAINNET_CLIENT_ID,
                    infuraNetworkType: 'mainnet',
                  }),
                ],
              }),
              '0xaa36a7': buildNetworkConfiguration({
                chainId: '0xaa36a7',
                name: 'Sepolia',
                nativeCurrency: 'SepoliaETH',
                rpcEndpoints: [
                  buildInfuraEndpoint({
                    networkClientId: SEPOLIA_CLIENT_ID,
                    infuraNetworkType: 'sepolia',
                  }),
                ],
              }),
            },
            networksMetadata: {
              [MAINNET_CLIENT_ID]: buildNetworkMetadata(
                NetworkStatus.Unavailable,
              ),
            },
          }),
        );

        // The network without metadata has not been looked up yet, so it does
        // not count as failed and the all-down escape hatch must not trigger.
        jest.advanceTimersByTime(30_000);

        expect(controller.state.networkConnectionBannerStatus).toBe(
          'available',
        );
      });
    });

    it('prefers a custom failure over an Infura one when surfacing the banner network', async () => {
      await withController(({ controller, publishNetworkStateChanges }) => {
        publishNetworkStateChanges(
          buildExternalState({
            networkConfigurationsByChainId: {
              '0x1': buildNetworkConfiguration({
                chainId: '0x1',
                rpcEndpoints: [
                  buildInfuraEndpoint({
                    networkClientId: MAINNET_CLIENT_ID,
                    infuraNetworkType: 'mainnet',
                  }),
                ],
              }),
              '0x89': buildNetworkConfiguration({
                chainId: '0x89',
                rpcEndpoints: [
                  buildCustomEndpoint({
                    networkClientId: POLYGON_CUSTOM_CLIENT_ID,
                    url: 'https://polygon-rpc.com',
                  }),
                ],
              }),
            },
            networksMetadata: {
              [MAINNET_CLIENT_ID]: buildNetworkMetadata(
                NetworkStatus.Unavailable,
              ),
              [POLYGON_CUSTOM_CLIENT_ID]: buildNetworkMetadata(
                NetworkStatus.Unavailable,
              ),
            },
          }),
        );

        jest.advanceTimersByTime(5_000);

        expect(controller.state.networkConnectionBannerNetwork).toMatchObject({
          chainId: '0x89',
        });
      });
    });

    it('only updates the failed-network detail (not the timers) when the same chain keeps failing across re-evaluations', async () => {
      await withController(({ controller, publishNetworkStateChanges }) => {
        const config = buildNetworkConfiguration({
          chainId: '0x1',
          rpcEndpoints: [
            buildCustomEndpoint({
              networkClientId: POLYGON_CUSTOM_CLIENT_ID,
              url: 'https://polygon-rpc.com',
            }),
          ],
        });
        publishNetworkStateChanges(
          buildExternalState({
            networkConfigurationsByChainId: { '0x1': config },
            enabledEvmChainIds: ['0x1'],
            networksMetadata: {
              [POLYGON_CUSTOM_CLIENT_ID]: buildNetworkMetadata(
                NetworkStatus.Unavailable,
              ),
            },
          }),
        );

        jest.advanceTimersByTime(5_000);
        expect(controller.state.networkConnectionBannerStatus).toBe('degraded');

        // Same chain still failing — should be a no-op update (no timer reset).
        publishNetworkStateChanges(
          buildExternalState({
            networkConfigurationsByChainId: { '0x1': config },
            enabledEvmChainIds: ['0x1'],
            networksMetadata: {
              [POLYGON_CUSTOM_CLIENT_ID]: buildNetworkMetadata(
                NetworkStatus.Blocked,
              ),
            },
          }),
        );

        // 25s after the original degraded fire — the unavailable escalation
        // should still happen on schedule (timers were not restarted).
        jest.advanceTimersByTime(25_000);
        expect(controller.state.networkConnectionBannerStatus).toBe(
          'unavailable',
        );
      });
    });

    it('does not restart the degraded timer when the same network fails across re-evaluations', async () => {
      await withController(({ controller, publishNetworkStateChanges }) => {
        const buildFailingState = (status: NetworkStatus): ExternalState =>
          buildExternalState({
            networkConfigurationsByChainId: {
              '0x89': buildNetworkConfiguration({
                chainId: '0x89',
                rpcEndpoints: [
                  buildCustomEndpoint({
                    networkClientId: POLYGON_CUSTOM_CLIENT_ID,
                    url: 'https://polygon-rpc.com',
                  }),
                ],
              }),
            },
            enabledEvmChainIds: ['0x89'],
            networksMetadata: {
              [POLYGON_CUSTOM_CLIENT_ID]: buildNetworkMetadata(status),
            },
          });

        publishNetworkStateChanges(buildFailingState(NetworkStatus.Unknown));
        jest.advanceTimersByTime(4_000);

        // A changed NetworkController state that still resolves to the same
        // failing network must not clear and restart the pending countdown.
        // (A republished identical state would be deduped by the
        // subscription selector and never reach the controller.)
        publishNetworkStateChanges(
          buildFailingState(NetworkStatus.Unavailable),
        );
        jest.advanceTimersByTime(1_000);

        expect(controller.state.networkConnectionBannerStatus).toBe('degraded');
      });
    });

    it('cancels the banner if the network recovers between the degraded-timer scheduling and its firing', async () => {
      await withController(({ controller, publishNetworkStateChanges }) => {
        publishNetworkStateChanges(
          buildExternalState({
            networkConfigurationsByChainId: {
              '0x89': buildNetworkConfiguration({
                chainId: '0x89',
                rpcEndpoints: [
                  buildCustomEndpoint({
                    networkClientId: POLYGON_CUSTOM_CLIENT_ID,
                    url: 'https://polygon-rpc.com',
                  }),
                ],
              }),
            },
            enabledEvmChainIds: ['0x89'],
            networksMetadata: {
              [POLYGON_CUSTOM_CLIENT_ID]: buildNetworkMetadata(
                NetworkStatus.Unavailable,
              ),
            },
          }),
        );

        // Advance 4s — degraded timer is scheduled but not yet fired.
        jest.advanceTimersByTime(4_000);

        // Network recovers in the meantime. The next state-change clears
        // the timer.
        publishNetworkStateChanges(
          buildExternalState({
            networkConfigurationsByChainId: {
              '0x89': buildNetworkConfiguration({
                chainId: '0x89',
                rpcEndpoints: [
                  buildCustomEndpoint({
                    networkClientId: POLYGON_CUSTOM_CLIENT_ID,
                    url: 'https://polygon-rpc.com',
                  }),
                ],
              }),
            },
            enabledEvmChainIds: ['0x89'],
            networksMetadata: {
              [POLYGON_CUSTOM_CLIENT_ID]: buildNetworkMetadata(
                NetworkStatus.Available,
              ),
            },
          }),
        );

        jest.advanceTimersByTime(30_000);
        expect(controller.state.networkConnectionBannerStatus).toBe(
          'available',
        );
      });
    });

    it('skips enabled chains that have no network configuration', async () => {
      await withController(({ controller, publishNetworkStateChanges }) => {
        publishNetworkStateChanges({
          NetworkController: {
            networkConfigurationsByChainId: {},
            networksMetadata: {},
          },
          NetworkEnablementController: buildNetworkEnablementControllerState({
            enabledNetworkMap: {
              [KnownCaipNamespace.Eip155]: {
                '0x1': true,
              },
            },
          }),
          ConnectivityController: {
            connectivityStatus: CONNECTIVITY_STATUSES.Online,
          },
        });
        jest.advanceTimersByTime(30_000);
        expect(controller.state.networkConnectionBannerStatus).toBe(
          'available',
        );
      });
    });

    it('clears banner state when all enabled networks recover', async () => {
      await withController(({ controller, publishNetworkStateChanges }) => {
        const failingConfig = buildNetworkConfiguration({
          chainId: '0x89',
          rpcEndpoints: [
            buildCustomEndpoint({
              networkClientId: POLYGON_CUSTOM_CLIENT_ID,
              url: 'https://polygon-rpc.com',
            }),
          ],
        });
        publishNetworkStateChanges(
          buildExternalState({
            networkConfigurationsByChainId: { '0x89': failingConfig },
            enabledEvmChainIds: ['0x89'],
            networksMetadata: {
              [POLYGON_CUSTOM_CLIENT_ID]: buildNetworkMetadata(
                NetworkStatus.Unavailable,
              ),
            },
          }),
        );

        jest.advanceTimersByTime(5_000);
        expect(controller.state.networkConnectionBannerStatus).toBe('degraded');

        publishNetworkStateChanges(
          buildExternalState({
            networkConfigurationsByChainId: { '0x89': failingConfig },
            enabledEvmChainIds: ['0x89'],
            networksMetadata: {
              [POLYGON_CUSTOM_CLIENT_ID]: buildNetworkMetadata(
                NetworkStatus.Available,
              ),
            },
          }),
        );

        expect(controller.state).toStrictEqual({
          networkConnectionBannerStatus: 'available',
          networkConnectionBannerNetwork: null,
        });
      });
    });

    it('treats an unparseable RPC URL as non-Infura when classifying failures', async () => {
      await withController(({ controller, publishNetworkStateChanges }) => {
        publishNetworkStateChanges(
          buildExternalState({
            networkConfigurationsByChainId: {
              '0x1': buildNetworkConfiguration({
                chainId: '0x1',
                rpcEndpoints: [
                  buildCustomEndpoint({
                    networkClientId: MAINNET_CLIENT_ID,
                    url: 'not a valid url',
                  }),
                ],
              }),
            },
            enabledEvmChainIds: ['0x1'],
            networksMetadata: {
              [MAINNET_CLIENT_ID]: buildNetworkMetadata(
                NetworkStatus.Unavailable,
              ),
            },
          }),
        );

        jest.advanceTimersByTime(5_000);
        expect(controller.state.networkConnectionBannerStatus).toBe('degraded');
        expect(controller.state.networkConnectionBannerNetwork).toMatchObject({
          isInfuraEndpoint: false,
        });
      });
    });

    it('keeps the banner hidden when the enablement map has no EVM namespace at all', async () => {
      await withController(({ controller, publishNetworkStateChanges }) => {
        publishNetworkStateChanges({
          NetworkController: {
            networkConfigurationsByChainId: {},
            networksMetadata: {},
          },
          NetworkEnablementController: buildNetworkEnablementControllerState(),
          ConnectivityController: {
            connectivityStatus: CONNECTIVITY_STATUSES.Online,
          },
        });
        jest.advanceTimersByTime(30_000);
        expect(controller.state.networkConnectionBannerStatus).toBe(
          'available',
        );
      });
    });

    it('skips configurations whose default RPC endpoint is missing', async () => {
      await withController(({ controller, publishNetworkStateChanges }) => {
        publishNetworkStateChanges(
          buildExternalState({
            networkConfigurationsByChainId: {
              '0x1': {
                chainId: '0x1',
                name: 'Broken',
                nativeCurrency: 'ETH',
                rpcEndpoints: [],
                defaultRpcEndpointIndex: 0,
                blockExplorerUrls: [],
                defaultBlockExplorerUrlIndex: 0,
              },
            },
            enabledEvmChainIds: ['0x1'],
          }),
        );
        jest.advanceTimersByTime(30_000);
        expect(controller.state.networkConnectionBannerStatus).toBe(
          'available',
        );
      });
    });

    it('reports the Infura endpoint to switch to when the failing network has one', async () => {
      await withController(({ controller, publishNetworkStateChanges }) => {
        publishNetworkStateChanges(
          buildExternalState({
            networkConfigurationsByChainId: {
              '0x1': buildNetworkConfiguration({
                chainId: '0x1',
                rpcEndpoints: [
                  buildCustomEndpoint({
                    networkClientId: ALCHEMY_CLIENT_ID,
                    url: 'https://eth-mainnet.alchemyapi.io/v2/abc',
                  }),
                  buildInfuraEndpoint({
                    networkClientId: MAINNET_CLIENT_ID,
                    infuraNetworkType: 'mainnet',
                  }),
                ],
              }),
            },
            enabledEvmChainIds: ['0x1'],
            networksMetadata: {
              [ALCHEMY_CLIENT_ID]: buildNetworkMetadata(
                NetworkStatus.Unavailable,
              ),
            },
          }),
        );

        jest.advanceTimersByTime(5_000);

        expect(controller.state.networkConnectionBannerNetwork).toMatchObject({
          chainId: '0x1',
          isInfuraEndpoint: false,
          switchableInfuraNetworkClientId: MAINNET_CLIENT_ID,
          // Sanity-check: not null when there's an Infura endpoint to offer.
        });
      });
    });
  });

  describe('on NetworkEnablementController:stateChange', () => {
    it('re-evaluates the rule when a failing chain becomes enabled', async () => {
      await withController(
        {
          externalState: buildExternalState({
            networkConfigurationsByChainId: {
              '0x89': buildNetworkConfiguration({
                chainId: '0x89',
                rpcEndpoints: [
                  buildCustomEndpoint({
                    networkClientId: POLYGON_CUSTOM_CLIENT_ID,
                    url: 'https://polygon-rpc.com',
                  }),
                ],
              }),
            },
            networksMetadata: {
              [POLYGON_CUSTOM_CLIENT_ID]: buildNetworkMetadata(
                NetworkStatus.Unavailable,
              ),
            },
            enabledEvmChainIds: [],
          }),
        },
        ({ controller, setNetworkEnablementControllerState }) => {
          jest.advanceTimersByTime(30_000);
          expect(controller.state.networkConnectionBannerStatus).toBe(
            'available',
          );

          setNetworkEnablementControllerState(
            buildNetworkEnablementControllerState({
              enabledNetworkMap: {
                [KnownCaipNamespace.Eip155]: {
                  '0x89': true,
                },
              },
            }),
          );

          jest.advanceTimersByTime(5_000);
          expect(controller.state.networkConnectionBannerStatus).toBe(
            'degraded',
          );
        },
      );
    });

    it('clears the banner when the failing chain gets disabled', async () => {
      await withController(
        {
          externalState: buildExternalState({
            networkConfigurationsByChainId: {
              '0x89': buildNetworkConfiguration({
                chainId: '0x89',
                rpcEndpoints: [
                  buildCustomEndpoint({
                    networkClientId: POLYGON_CUSTOM_CLIENT_ID,
                    url: 'https://polygon-rpc.com',
                  }),
                ],
              }),
            },
            networksMetadata: {
              [POLYGON_CUSTOM_CLIENT_ID]: buildNetworkMetadata(
                NetworkStatus.Unavailable,
              ),
            },
            enabledEvmChainIds: ['0x89'],
          }),
        },
        ({ controller, setNetworkEnablementControllerState }) => {
          jest.advanceTimersByTime(30_000);
          expect(controller.state.networkConnectionBannerStatus).toBe(
            'unavailable',
          );

          setNetworkEnablementControllerState(
            buildNetworkEnablementControllerState({
              enabledNetworkMap: {
                [KnownCaipNamespace.Eip155]: {
                  '0x89': false,
                },
              },
            }),
          );

          expect(controller.state).toStrictEqual({
            networkConnectionBannerStatus: 'available',
            networkConnectionBannerNetwork: null,
          });
        },
      );
    });
  });

  describe('on ConnectivityController:stateChange', () => {
    it('does not touch banner state when going offline while no banner is shown', async () => {
      await withController(({ controller, setConnectivityStatus }) => {
        const before = controller.state;
        setConnectivityStatus(CONNECTIVITY_STATUSES.Offline);
        expect(controller.state).toStrictEqual(before);
      });
    });

    it('suppresses the banner while the device is offline and reinstates it when back online', async () => {
      await withController(
        ({ controller, publishNetworkStateChanges, setConnectivityStatus }) => {
          publishNetworkStateChanges(
            buildExternalState({
              networkConfigurationsByChainId: {
                '0x1': buildNetworkConfiguration({
                  chainId: '0x1',
                  rpcEndpoints: [
                    buildCustomEndpoint({
                      networkClientId: POLYGON_CUSTOM_CLIENT_ID,
                      url: 'https://polygon-rpc.com',
                    }),
                  ],
                }),
              },
              enabledEvmChainIds: ['0x1'],
              networksMetadata: {
                [POLYGON_CUSTOM_CLIENT_ID]: buildNetworkMetadata(
                  NetworkStatus.Unavailable,
                ),
              },
            }),
          );

          jest.advanceTimersByTime(5_000);
          expect(controller.state.networkConnectionBannerStatus).toBe(
            'degraded',
          );

          setConnectivityStatus(CONNECTIVITY_STATUSES.Offline);
          expect(controller.state.networkConnectionBannerStatus).toBe(
            'available',
          );
          expect(controller.state.networkConnectionBannerNetwork).toBeNull();

          setConnectivityStatus(CONNECTIVITY_STATUSES.Online);
          jest.advanceTimersByTime(5_000);
          expect(controller.state.networkConnectionBannerStatus).toBe(
            'degraded',
          );
        },
      );
    });
  });

  describe('dismissBanner', () => {
    it('is a no-op when no banner is currently shown', async () => {
      await withController(({ controller }) => {
        const before = controller.state;
        controller.dismissBanner();
        expect(controller.state).toStrictEqual(before);
      });
    });

    it('clears banner state via direct call', async () => {
      await withController(({ controller, publishNetworkStateChanges }) => {
        publishNetworkStateChanges(
          buildExternalState({
            networkConfigurationsByChainId: {
              '0x1': buildNetworkConfiguration({
                chainId: '0x1',
                rpcEndpoints: [
                  buildCustomEndpoint({
                    networkClientId: POLYGON_CUSTOM_CLIENT_ID,
                    url: 'https://polygon-rpc.com',
                  }),
                ],
              }),
            },
            enabledEvmChainIds: ['0x1'],
            networksMetadata: {
              [POLYGON_CUSTOM_CLIENT_ID]: buildNetworkMetadata(
                NetworkStatus.Unavailable,
              ),
            },
          }),
        );
        jest.advanceTimersByTime(5_000);
        expect(controller.state.networkConnectionBannerStatus).toBe('degraded');

        controller.dismissBanner();
        expect(controller.state.networkConnectionBannerStatus).toBe(
          'available',
        );
        expect(controller.state.networkConnectionBannerNetwork).toBeNull();
      });
    });

    it('clears banner state via messenger action', async () => {
      await withController(
        ({ controller, rootMessenger, publishNetworkStateChanges }) => {
          publishNetworkStateChanges(
            buildExternalState({
              networkConfigurationsByChainId: {
                '0x1': buildNetworkConfiguration({
                  chainId: '0x1',
                  rpcEndpoints: [
                    buildCustomEndpoint({
                      networkClientId: POLYGON_CUSTOM_CLIENT_ID,
                      url: 'https://polygon-rpc.com',
                    }),
                  ],
                }),
              },
              enabledEvmChainIds: ['0x1'],
              networksMetadata: {
                [POLYGON_CUSTOM_CLIENT_ID]: buildNetworkMetadata(
                  NetworkStatus.Unavailable,
                ),
              },
            }),
          );
          jest.advanceTimersByTime(5_000);

          rootMessenger.call('NetworkConnectionBannerController:dismissBanner');
          expect(controller.state.networkConnectionBannerStatus).toBe(
            'available',
          );
        },
      );
    });
  });

  describe('switchToDefaultInfuraRpcEndpoint', () => {
    it('makes the Infura endpoint the new default and switches the active network onto it', async () => {
      await withController(
        async ({
          rootMessenger,
          publishNetworkStateChanges,
          updateNetwork,
          setActiveNetwork,
        }) => {
          const config = buildNetworkConfiguration({
            chainId: '0x1',
            rpcEndpoints: [
              buildCustomEndpoint({
                networkClientId: ALCHEMY_CLIENT_ID,
                url: 'https://eth-mainnet.alchemyapi.io/v2/abc',
              }),
              buildInfuraEndpoint({
                networkClientId: MAINNET_CLIENT_ID,
                infuraNetworkType: 'mainnet',
              }),
            ],
          });
          publishNetworkStateChanges(
            buildExternalState({
              networkConfigurationsByChainId: { '0x1': config },
              enabledEvmChainIds: ['0x1'],
              networksMetadata: {
                [ALCHEMY_CLIENT_ID]: buildNetworkMetadata(
                  NetworkStatus.Unavailable,
                ),
              },
            }),
          );

          await rootMessenger.call(
            'NetworkConnectionBannerController:switchToDefaultInfuraRpcEndpoint',
            '0x1',
          );

          expect(updateNetwork).toHaveBeenCalledTimes(1);
          expect(updateNetwork).toHaveBeenCalledWith(
            '0x1',
            expect.objectContaining({ defaultRpcEndpointIndex: 1 }),
          );
          expect(setActiveNetwork).toHaveBeenCalledTimes(1);
          expect(setActiveNetwork).toHaveBeenCalledWith(MAINNET_CLIENT_ID);
          // The active connection moves first so a partial failure keeps the
          // failing default in place and the banner visible.
          expect(setActiveNetwork.mock.invocationCallOrder[0]).toBeLessThan(
            updateNetwork.mock.invocationCallOrder[0],
          );
        },
      );
    });

    it('does not switch the active network when the Infura endpoint is already selected', async () => {
      await withController(
        async ({
          rootMessenger,
          publishNetworkStateChanges,
          setNetworkControllerState,
          updateNetwork,
          setActiveNetwork,
        }) => {
          const config = buildNetworkConfiguration({
            chainId: '0x1',
            rpcEndpoints: [
              buildCustomEndpoint({
                networkClientId: ALCHEMY_CLIENT_ID,
                url: 'https://eth-mainnet.alchemyapi.io/v2/abc',
              }),
              buildInfuraEndpoint({
                networkClientId: MAINNET_CLIENT_ID,
                infuraNetworkType: 'mainnet',
              }),
            ],
          });
          publishNetworkStateChanges(
            buildExternalState({
              networkConfigurationsByChainId: { '0x1': config },
              enabledEvmChainIds: ['0x1'],
            }),
          );
          setNetworkControllerState({
            networkConfigurationsByChainId: { '0x1': config },
            networksMetadata: {},
            selectedNetworkClientId: MAINNET_CLIENT_ID,
          });

          await rootMessenger.call(
            'NetworkConnectionBannerController:switchToDefaultInfuraRpcEndpoint',
            '0x1',
          );

          expect(updateNetwork).toHaveBeenCalledTimes(1);
          expect(setActiveNetwork).not.toHaveBeenCalled();
        },
      );
    });

    it('is a no-op when the default is already Infura', async () => {
      await withController(
        async ({
          rootMessenger,
          publishNetworkStateChanges,
          updateNetwork,
        }) => {
          publishNetworkStateChanges(
            buildExternalState({
              networkConfigurationsByChainId: {
                '0x1': buildNetworkConfiguration({
                  chainId: '0x1',
                  rpcEndpoints: [
                    buildInfuraEndpoint({
                      networkClientId: MAINNET_CLIENT_ID,
                      infuraNetworkType: 'mainnet',
                    }),
                  ],
                }),
              },
              enabledEvmChainIds: ['0x1'],
            }),
          );

          await rootMessenger.call(
            'NetworkConnectionBannerController:switchToDefaultInfuraRpcEndpoint',
            '0x1',
          );

          expect(updateNetwork).not.toHaveBeenCalled();
        },
      );
    });

    it('throws when no network configuration exists for the chain', async () => {
      await withController(async ({ rootMessenger }) => {
        await expect(
          rootMessenger.call(
            'NetworkConnectionBannerController:switchToDefaultInfuraRpcEndpoint',
            '0xdeadbeef',
          ),
        ).rejects.toThrow(/No network configuration found/u);
      });
    });

    it('throws when the chain has no Infura endpoint to switch to', async () => {
      await withController(
        async ({ rootMessenger, publishNetworkStateChanges }) => {
          publishNetworkStateChanges(
            buildExternalState({
              networkConfigurationsByChainId: {
                '0x1': buildNetworkConfiguration({
                  chainId: '0x1',
                  rpcEndpoints: [
                    buildCustomEndpoint({
                      networkClientId: ALCHEMY_CLIENT_ID,
                      url: 'https://eth-mainnet.alchemyapi.io/v2/abc',
                    }),
                  ],
                }),
              },
              enabledEvmChainIds: ['0x1'],
            }),
          );

          await expect(
            rootMessenger.call(
              'NetworkConnectionBannerController:switchToDefaultInfuraRpcEndpoint',
              '0x1',
            ),
          ).rejects.toThrow(/No Infura endpoint available/u);
        },
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function buildNetworkMetadata(status: NetworkStatus): {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  EIPS: Record<number, boolean>;
  status: NetworkStatus;
} {
  return { EIPS: {}, status };
}

type BuildExternalStateArgs = {
  networkConfigurationsByChainId?: NetworkState['networkConfigurationsByChainId'];
  networksMetadata?: NetworkState['networksMetadata'];
  enabledEvmChainIds?: Hex[];
};

// Keys match the messenger namespace of each upstream controller.
/* eslint-disable @typescript-eslint/naming-convention */
type ExternalState = {
  NetworkController: Partial<NetworkState>;
  NetworkEnablementController: NetworkEnablementControllerState;
  ConnectivityController: ConnectivityControllerState;
};
/* eslint-enable @typescript-eslint/naming-convention */

function buildNetworkEnablementControllerState(
  overrides: Partial<NetworkEnablementControllerState> = {},
): NetworkEnablementControllerState {
  return {
    enabledNetworkMap: {},
    nativeAssetIdentifiers: {},
    ...overrides,
  };
}

function buildExternalState({
  networkConfigurationsByChainId = {},
  networksMetadata = {},
  enabledEvmChainIds = Object.keys(networkConfigurationsByChainId) as Hex[],
}: BuildExternalStateArgs = {}): ExternalState {
  return {
    NetworkController: {
      networkConfigurationsByChainId,
      networksMetadata,
    },
    NetworkEnablementController: buildNetworkEnablementControllerState({
      enabledNetworkMap: {
        [KnownCaipNamespace.Eip155]: Object.fromEntries(
          enabledEvmChainIds.map((chainId) => [chainId, true]),
        ),
      },
    }),
    ConnectivityController: {
      connectivityStatus: CONNECTIVITY_STATUSES.Online,
    },
  };
}

type AllNetworkConnectionBannerControllerActions =
  MessengerActions<NetworkConnectionBannerControllerMessenger>;
type AllNetworkConnectionBannerControllerEvents =
  MessengerEvents<NetworkConnectionBannerControllerMessenger>;

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<NetworkConnectionBannerControllerMessenger>,
  MessengerEvents<NetworkConnectionBannerControllerMessenger>
>;

type WithControllerCallback<ReturnValue> = (payload: {
  controller: NetworkConnectionBannerController;
  rootMessenger: RootMessenger;
  controllerMessenger: NetworkConnectionBannerControllerMessenger;
  setNetworkControllerState: (
    networkControllerState: Partial<NetworkState>,
  ) => void;
  setNetworkEnablementControllerState: (
    networkEnablementControllerState: NetworkEnablementControllerState,
  ) => void;
  publishNetworkStateChanges: (state: ExternalState) => void;
  setConnectivityStatus: (
    status: ConnectivityControllerState['connectivityStatus'],
  ) => void;
  setUiOpen: (isUiOpen: boolean) => void;
  setKeyringUnlocked: (isUnlocked: boolean) => void;
  updateNetwork: jest.Mock;
  setActiveNetwork: jest.Mock;
}) => Promise<ReturnValue> | ReturnValue;

type WithControllerOptions = {
  externalState?: ExternalState;
  start?: boolean;
  degradedBannerTimeout?: number;
  unavailableBannerTimeout?: number;
};

async function withController<ReturnValue>(
  ...args:
    | [WithControllerCallback<ReturnValue>]
    | [WithControllerOptions, WithControllerCallback<ReturnValue>]
): Promise<ReturnValue> {
  const [
    {
      externalState,
      start = true,
      degradedBannerTimeout,
      unavailableBannerTimeout,
    },
    testFunction,
  ] = args.length === 2 ? args : [{}, args[0]];
  const rootMessenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });

  let currentState: ExternalState =
    externalState ??
    ({
      NetworkController: {
        networkConfigurationsByChainId: {},
        networksMetadata: {},
      },
      NetworkEnablementController: buildNetworkEnablementControllerState(),
      ConnectivityController: {
        connectivityStatus: CONNECTIVITY_STATUSES.Online,
      },
    } satisfies ExternalState);

  rootMessenger.registerActionHandler(
    'NetworkController:getState',
    () => currentState.NetworkController as NetworkState,
  );
  rootMessenger.registerActionHandler(
    'NetworkController:getNetworkConfigurationByChainId',
    (chainId) =>
      currentState.NetworkController.networkConfigurationsByChainId?.[chainId],
  );
  const updateNetwork = jest.fn(
    async (chainId: Hex): Promise<NetworkConfiguration> =>
      currentState.NetworkController.networkConfigurationsByChainId?.[
        chainId
      ] ?? buildNetworkConfiguration({ chainId }),
  );
  rootMessenger.registerActionHandler(
    'NetworkController:updateNetwork',
    updateNetwork,
  );
  const setActiveNetwork = jest.fn(async (): Promise<void> => undefined);
  rootMessenger.registerActionHandler(
    'NetworkController:setActiveNetwork',
    setActiveNetwork,
  );

  rootMessenger.registerActionHandler(
    'NetworkEnablementController:getState',
    () => currentState.NetworkEnablementController,
  );

  rootMessenger.registerActionHandler(
    'ConnectivityController:getState',
    () => currentState.ConnectivityController,
  );

  const messenger = new Messenger<
    'NetworkConnectionBannerController',
    AllNetworkConnectionBannerControllerActions,
    AllNetworkConnectionBannerControllerEvents,
    RootMessenger
  >({
    namespace: 'NetworkConnectionBannerController',
    parent: rootMessenger,
  });

  rootMessenger.delegate({
    messenger,
    actions: [
      'NetworkController:getState',
      'NetworkController:getNetworkConfigurationByChainId',
      'NetworkController:updateNetwork',
      'NetworkController:setActiveNetwork',
      'NetworkEnablementController:getState',
      'ConnectivityController:getState',
    ],
    events: [
      // eslint-disable-next-line no-restricted-syntax -- awaiting upstream :stateChanged migration
      'NetworkController:stateChange',
      // eslint-disable-next-line no-restricted-syntax -- awaiting upstream :stateChanged migration
      'NetworkEnablementController:stateChange',
      // eslint-disable-next-line no-restricted-syntax -- awaiting upstream :stateChanged migration
      'ConnectivityController:stateChange',
      'ClientController:stateChanged',
      'KeyringController:unlock',
      'KeyringController:lock',
    ],
  });

  const controller = new NetworkConnectionBannerController({
    messenger,
    infuraProjectId: TEST_INFURA_PROJECT_ID,
    degradedBannerTimeout,
    unavailableBannerTimeout,
  });

  const setUiOpen = (isUiOpen: boolean): void => {
    rootMessenger.publish('ClientController:stateChanged', { isUiOpen }, []);
  };
  const setKeyringUnlocked = (isUnlocked: boolean): void => {
    rootMessenger.publish(
      isUnlocked ? 'KeyringController:unlock' : 'KeyringController:lock',
    );
  };

  if (start) {
    setUiOpen(true);
    setKeyringUnlocked(true);
  }

  const setNetworkControllerState = (
    networkControllerState: Partial<NetworkState>,
  ): void => {
    currentState = {
      ...currentState,
      NetworkController: networkControllerState,
    };
    rootMessenger.publish(
      'NetworkController:stateChange',
      currentState.NetworkController as NetworkState,
      [],
    );
  };

  const setNetworkEnablementControllerState = (
    networkEnablementControllerState: NetworkEnablementControllerState,
  ): void => {
    currentState = {
      ...currentState,
      NetworkEnablementController: networkEnablementControllerState,
    };
    rootMessenger.publish(
      'NetworkEnablementController:stateChange',
      currentState.NetworkEnablementController,
      [],
    );
  };

  // Setup convenience for tests that want to seed both `NetworkController`
  // and `NetworkEnablementController` at once. Tests exercising a specific
  // peer event should reach for `setNetworkControllerState` /
  // `setNetworkEnablementControllerState` instead so the event they publish
  // matches the code path they claim to cover.
  const publishNetworkStateChanges = (state: ExternalState): void => {
    currentState = {
      ...currentState,
      NetworkController: state.NetworkController,
      NetworkEnablementController: state.NetworkEnablementController,
    };
    rootMessenger.publish(
      'NetworkController:stateChange',
      currentState.NetworkController as NetworkState,
      [],
    );
    rootMessenger.publish(
      'NetworkEnablementController:stateChange',
      currentState.NetworkEnablementController,
      [],
    );
  };

  const setConnectivityStatus = (
    status: ConnectivityControllerState['connectivityStatus'],
  ): void => {
    currentState = {
      ...currentState,
      ConnectivityController: { connectivityStatus: status },
    };
    rootMessenger.publish(
      'ConnectivityController:stateChange',
      currentState.ConnectivityController,
      [],
    );
  };

  return await testFunction({
    controller,
    rootMessenger,
    controllerMessenger: messenger,
    setNetworkControllerState,
    setNetworkEnablementControllerState,
    publishNetworkStateChanges,
    setConnectivityStatus,
    setUiOpen,
    setKeyringUnlocked,
    updateNetwork,
    setActiveNetwork,
  });
}

function buildInfuraEndpoint({
  networkClientId,
  infuraNetworkType,
}: {
  networkClientId: BuiltInNetworkClientId;
  infuraNetworkType: BuiltInNetworkClientId;
}): InfuraRpcEndpoint {
  return {
    networkClientId,
    type: RpcEndpointType.Infura,
    url: `https://${infuraNetworkType}.infura.io/v3/{infuraProjectId}`,
  };
}

function buildCustomEndpoint({
  networkClientId,
  url,
}: {
  networkClientId: string;
  url: string;
}): NetworkConfiguration['rpcEndpoints'][number] {
  return {
    networkClientId,
    type: RpcEndpointType.Custom,
    url,
  };
}
