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

import type { NetworkConnectionBannerControllerMessenger } from './NetworkConnectionBannerController';
import { NetworkConnectionBannerController } from './NetworkConnectionBannerController';

const MAINNET_CLIENT_ID = 'mainnet' satisfies BuiltInNetworkClientId;
const SEPOLIA_CLIENT_ID = 'sepolia' satisfies BuiltInNetworkClientId;
const POLYGON_CUSTOM_CLIENT_ID = 'polygon-custom';
const ALCHEMY_CLIENT_ID = 'eth-alchemy';

function buildInfuraEndpoint(
  networkClientId: BuiltInNetworkClientId,
  infuraNetworkType: BuiltInNetworkClientId,
): InfuraRpcEndpoint {
  return {
    networkClientId,
    type: RpcEndpointType.Infura,
    url: `https://${infuraNetworkType}.infura.io/v3/{infuraProjectId}`,
  };
}

function buildCustomEndpoint(
  networkClientId: string,
  url: string,
): NetworkConfiguration['rpcEndpoints'][number] {
  return {
    networkClientId,
    type: RpcEndpointType.Custom,
    url,
  };
}

function buildNetworkConfiguration(
  overrides: Partial<NetworkConfiguration> &
    Pick<NetworkConfiguration, 'chainId'>,
): NetworkConfiguration {
  return {
    name: 'Ethereum Mainnet',
    nativeCurrency: 'ETH',
    rpcEndpoints: [buildInfuraEndpoint(MAINNET_CLIENT_ID, 'mainnet')],
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
            "network": null,
            "status": "available",
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
            "network": null,
            "status": "available",
          }
        `);
      });
    });
  });

  describe('default state', () => {
    it('starts with status "available" and no network selected', async () => {
      await withController(({ controller }) => {
        expect(controller.state).toStrictEqual({
          status: 'available',
          network: null,
        });
      });
    });
  });

  describe('start / stop', () => {
    it('does not evaluate existing upstream state before start', async () => {
      const externalState = buildExternalState({
        networkConfigurationsByChainId: {
          '0x89': buildNetworkConfiguration({
            chainId: '0x89',
            name: 'Polygon Mainnet',
            nativeCurrency: 'MATIC',
            rpcEndpoints: [
              buildCustomEndpoint(
                POLYGON_CUSTOM_CLIENT_ID,
                'https://polygon-rpc.com',
              ),
            ],
          }),
        },
        enabledEvmChainIds: ['0x89'],
        networksMetadata: {
          [POLYGON_CUSTOM_CLIENT_ID]: buildNetworkMetadata(NetworkStatus.Unavailable),
        },
      });

      await withController(
        ({ controller }) => {
          jest.advanceTimersByTime(30_000);

          expect(controller.state.status).toBe('available');
        },
        externalState,
        false,
      );
    });

    it('evaluates existing upstream state on start', async () => {
      const externalState = buildExternalState({
        networkConfigurationsByChainId: {
          '0x89': buildNetworkConfiguration({
            chainId: '0x89',
            name: 'Polygon Mainnet',
            nativeCurrency: 'MATIC',
            rpcEndpoints: [
              buildCustomEndpoint(
                POLYGON_CUSTOM_CLIENT_ID,
                'https://polygon-rpc.com',
              ),
            ],
          }),
        },
        enabledEvmChainIds: ['0x89'],
        networksMetadata: {
          [POLYGON_CUSTOM_CLIENT_ID]: buildNetworkMetadata(NetworkStatus.Unavailable),
        },
      });

      await withController(
        ({ controller, rootMessenger }) => {
          rootMessenger.call('NetworkConnectionBannerController:start');
          rootMessenger.call('NetworkConnectionBannerController:start');

          jest.advanceTimersByTime(5_000);

          expect(controller.state.status).toBe('degraded');
        },
        externalState,
        false,
      );
    });

    it('ignores upstream state changes before start', async () => {
      await withController(
        ({ controller, setNetworkControllerState }) => {
          setNetworkControllerState({
            networkConfigurationsByChainId: {
              '0x89': buildNetworkConfiguration({
                chainId: '0x89',
                name: 'Polygon Mainnet',
                nativeCurrency: 'MATIC',
                rpcEndpoints: [
                  buildCustomEndpoint(
                    POLYGON_CUSTOM_CLIENT_ID,
                    'https://polygon-rpc.com',
                  ),
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
          expect(controller.state.status).toBe('available');

          controller.start();
          jest.advanceTimersByTime(5_000);
          expect(controller.state.status).toBe('degraded');
        },
        buildExternalState({ enabledEvmChainIds: ['0x89'] }),
        false,
      );
    });

    it('cancels a pending banner and resets state on stop', async () => {
      await withController(
        ({ controller, setNetworkControllerState }) => {
          setNetworkControllerState({
            networkConfigurationsByChainId: {
              '0x89': buildNetworkConfiguration({
                chainId: '0x89',
                name: 'Polygon Mainnet',
                nativeCurrency: 'MATIC',
                rpcEndpoints: [
                  buildCustomEndpoint(
                    POLYGON_CUSTOM_CLIENT_ID,
                    'https://polygon-rpc.com',
                  ),
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
          expect(controller.state.status).toBe('degraded');

          controller.stop();
          jest.advanceTimersByTime(30_000);
          expect(controller.state).toStrictEqual({
            status: 'available',
            network: null,
          });
        },
        buildExternalState({ enabledEvmChainIds: ['0x89'] }),
      );
    });

    it('ignores upstream state changes after stop', async () => {
      await withController(
        ({ controller, setNetworkControllerState }) => {
          controller.stop();
          setNetworkControllerState({
            networkConfigurationsByChainId: {
              '0x89': buildNetworkConfiguration({
                chainId: '0x89',
                name: 'Polygon Mainnet',
                nativeCurrency: 'MATIC',
                rpcEndpoints: [
                  buildCustomEndpoint(
                    POLYGON_CUSTOM_CLIENT_ID,
                    'https://polygon-rpc.com',
                  ),
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
          expect(controller.state.status).toBe('available');
        },
        buildExternalState({ enabledEvmChainIds: ['0x89'] }),
      );
    });

    it('resumes evaluation when start is called again after stop', async () => {
      await withController(
        ({ controller, setNetworkControllerState }) => {
          controller.stop();

          setNetworkControllerState({
            networkConfigurationsByChainId: {
              '0x89': buildNetworkConfiguration({
                chainId: '0x89',
                name: 'Polygon Mainnet',
                nativeCurrency: 'MATIC',
                rpcEndpoints: [
                  buildCustomEndpoint(
                    POLYGON_CUSTOM_CLIENT_ID,
                    'https://polygon-rpc.com',
                  ),
                ],
              }),
            },
            networksMetadata: {
              [POLYGON_CUSTOM_CLIENT_ID]: buildNetworkMetadata(
                NetworkStatus.Unavailable,
              ),
            },
          });

          expect(controller.state.status).toBe('available');

          controller.start();
          jest.advanceTimersByTime(5_000);
          expect(controller.state.status).toBe('degraded');
        },
        buildExternalState({ enabledEvmChainIds: ['0x89'] }),
      );
    });

    it('stop is idempotent when never started', async () => {
      await withController(
        ({ controller }) => {
          controller.stop();
          controller.stop();
          expect(controller.state).toStrictEqual({
            status: 'available',
            network: null,
          });
        },
        undefined,
        false,
      );
    });

    it('bails out when a stateChanged listener calls stop synchronously during refresh', async () => {
      await withController(
        ({ controller, controllerMessenger, publishNetworkStateChanges }) => {
          // Escalate the banner to `unavailable` so state is non default and the
          // next refresh's pre timer `update` actually mutates state.
          publishNetworkStateChanges(
            buildExternalState({
              networkConfigurationsByChainId: {
                '0x89': buildNetworkConfiguration({
                  chainId: '0x89',
                  name: 'Polygon Mainnet',
                  nativeCurrency: 'MATIC',
                  rpcEndpoints: [
                    buildCustomEndpoint(
                      POLYGON_CUSTOM_CLIENT_ID,
                      'https://polygon-rpc.com',
                    ),
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
          expect(controller.state.status).toBe('unavailable');

          let stopped = false;
          controllerMessenger.subscribe(
            'NetworkConnectionBannerController:stateChanged',
            () => {
              if (!stopped) {
                stopped = true;
                controller.stop();
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
                    buildCustomEndpoint(
                      ALCHEMY_CLIENT_ID,
                      'https://eth-mainnet.alchemyapi.io/v2/abc',
                    ),
                  ],
                }),
              },
              enabledEvmChainIds: ['0x1'],
              networksMetadata: {
                [ALCHEMY_CLIENT_ID]: buildNetworkMetadata(NetworkStatus.Unavailable),
              },
            }),
          );

          jest.advanceTimersByTime(30_000);
          expect(controller.state).toStrictEqual({
            status: 'available',
            network: null,
          });
        },
      );
    });

    it('bails out when a stateChanged listener calls stop synchronously at the degraded fire', async () => {
      await withController(
        ({ controller, controllerMessenger, publishNetworkStateChanges }) => {
          controllerMessenger.subscribe(
            'NetworkConnectionBannerController:stateChanged',
            (state) => {
              if (state.status === 'degraded') {
                controller.stop();
              }
            },
          );

          publishNetworkStateChanges(
            buildExternalState({
              networkConfigurationsByChainId: {
                '0x89': buildNetworkConfiguration({
                  chainId: '0x89',
                  name: 'Polygon Mainnet',
                  nativeCurrency: 'MATIC',
                  rpcEndpoints: [
                    buildCustomEndpoint(
                      POLYGON_CUSTOM_CLIENT_ID,
                      'https://polygon-rpc.com',
                    ),
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
          // listener, which calls stop(). The guard should bail before
          // scheduling the unavailable escalation.
          jest.advanceTimersByTime(30_000);
          expect(controller.state).toStrictEqual({
            status: 'available',
            network: null,
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
                  buildInfuraEndpoint(MAINNET_CLIENT_ID, 'mainnet'),
                ],
              }),
              '0xaa36a7': buildNetworkConfiguration({
                chainId: '0xaa36a7',
                name: 'Sepolia',
                nativeCurrency: 'SepoliaETH',
                rpcEndpoints: [
                  buildInfuraEndpoint(SEPOLIA_CLIENT_ID, 'sepolia'),
                ],
              }),
            },
            networksMetadata: {
              [MAINNET_CLIENT_ID]: buildNetworkMetadata(NetworkStatus.Unavailable),
              [SEPOLIA_CLIENT_ID]: buildNetworkMetadata(NetworkStatus.Available),
            },
          }),
        );

        jest.advanceTimersByTime(30_000);

        expect(controller.state).toStrictEqual({
          status: 'available',
          network: null,
        });
      });
    });

    it('does not show the banner when many Infura networks are failing simultaneously alongside a healthy peer on another domain', async () => {
      await withController(({ controller, publishNetworkStateChanges }) => {
        publishNetworkStateChanges(
          buildExternalState({
            networkConfigurationsByChainId: {
              '0x1': buildNetworkConfiguration({
                chainId: '0x1',
                rpcEndpoints: [
                  buildInfuraEndpoint(MAINNET_CLIENT_ID, 'mainnet'),
                ],
              }),
              '0xaa36a7': buildNetworkConfiguration({
                chainId: '0xaa36a7',
                name: 'Sepolia',
                nativeCurrency: 'SepoliaETH',
                rpcEndpoints: [
                  buildInfuraEndpoint(SEPOLIA_CLIENT_ID, 'sepolia'),
                ],
              }),
              '0x89': buildNetworkConfiguration({
                chainId: '0x89',
                name: 'Polygon Mainnet',
                nativeCurrency: 'MATIC',
                rpcEndpoints: [
                  buildCustomEndpoint(
                    POLYGON_CUSTOM_CLIENT_ID,
                    'https://polygon-rpc.com',
                  ),
                ],
              }),
            },
            networksMetadata: {
              [MAINNET_CLIENT_ID]: buildNetworkMetadata(NetworkStatus.Unavailable),
              [SEPOLIA_CLIENT_ID]: buildNetworkMetadata(NetworkStatus.Unavailable),
              [POLYGON_CUSTOM_CLIENT_ID]: buildNetworkMetadata(NetworkStatus.Available),
            },
          }),
        );

        jest.advanceTimersByTime(30_000);

        expect(controller.state.status).toBe('available');
      });
    });

    it('shows the banner when failures span two different registrable domains', async () => {
      await withController(({ controller, publishNetworkStateChanges }) => {
        publishNetworkStateChanges(
          buildExternalState({
            networkConfigurationsByChainId: {
              '0x1': buildNetworkConfiguration({
                chainId: '0x1',
                rpcEndpoints: [
                  buildInfuraEndpoint(MAINNET_CLIENT_ID, 'mainnet'),
                ],
              }),
              '0xa4b1': buildNetworkConfiguration({
                chainId: '0xa4b1',
                name: 'Arbitrum One',
                nativeCurrency: 'ETH',
                rpcEndpoints: [
                  buildCustomEndpoint(
                    ALCHEMY_CLIENT_ID,
                    'https://arb-mainnet.g.alchemy.com/v2/abc',
                  ),
                ],
              }),
            },
            networksMetadata: {
              [MAINNET_CLIENT_ID]: buildNetworkMetadata(NetworkStatus.Unavailable),
              [ALCHEMY_CLIENT_ID]: buildNetworkMetadata(NetworkStatus.Unavailable),
            },
          }),
        );

        // Below the degraded threshold — banner still hidden.
        jest.advanceTimersByTime(4_999);
        expect(controller.state.status).toBe('available');

        // Cross the 5s mark — degraded banner appears. Custom override surfaces
        // the Alchemy network so the "Switch to Infura" CTA targets it.
        jest.advanceTimersByTime(1);
        expect(controller.state.status).toBe('degraded');
        expect(controller.state.network).toMatchObject({
          chainId: '0xa4b1',
          isInfuraEndpoint: false,
          rpcUrl: 'https://arb-mainnet.g.alchemy.com/v2/abc',
        });

        // Cross the 30s mark — escalates to unavailable.
        jest.advanceTimersByTime(25_000);
        expect(controller.state.status).toBe('unavailable');
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
                  buildInfuraEndpoint(MAINNET_CLIENT_ID, 'mainnet'),
                ],
              }),
              '0x89': buildNetworkConfiguration({
                chainId: '0x89',
                name: 'Polygon Mainnet',
                nativeCurrency: 'MATIC',
                rpcEndpoints: [
                  buildCustomEndpoint(
                    POLYGON_CUSTOM_CLIENT_ID,
                    'https://polygon-rpc.com',
                  ),
                ],
              }),
            },
            networksMetadata: {
              [MAINNET_CLIENT_ID]: buildNetworkMetadata(NetworkStatus.Available),
              [POLYGON_CUSTOM_CLIENT_ID]: buildNetworkMetadata(
                NetworkStatus.Unavailable,
              ),
            },
          }),
        );

        jest.advanceTimersByTime(5_000);

        expect(controller.state.status).toBe('degraded');
        expect(controller.state.network).toMatchObject({
          chainId: '0x89',
          isInfuraEndpoint: false,
        });
      });
    });

    it('shows the banner when every enabled network is failing on a single domain (all-down escape hatch)', async () => {
      await withController(({ controller, publishNetworkStateChanges }) => {
        publishNetworkStateChanges(
          buildExternalState({
            networkConfigurationsByChainId: {
              '0x1': buildNetworkConfiguration({
                chainId: '0x1',
                rpcEndpoints: [
                  buildInfuraEndpoint(MAINNET_CLIENT_ID, 'mainnet'),
                ],
              }),
            },
            enabledEvmChainIds: ['0x1'],
            networksMetadata: {
              [MAINNET_CLIENT_ID]: buildNetworkMetadata(NetworkStatus.Unavailable),
            },
          }),
        );

        jest.advanceTimersByTime(5_000);

        expect(controller.state.status).toBe('degraded');
        expect(controller.state.network).toMatchObject({
          chainId: '0x1',
          isInfuraEndpoint: true,
        });
      });
    });

    it('ignores enabled networks with missing metadata when every known network is failing', async () => {
      await withController(({ controller, publishNetworkStateChanges }) => {
        publishNetworkStateChanges(
          buildExternalState({
            networkConfigurationsByChainId: {
              '0x1': buildNetworkConfiguration({
                chainId: '0x1',
                rpcEndpoints: [
                  buildInfuraEndpoint(MAINNET_CLIENT_ID, 'mainnet'),
                ],
              }),
              '0xaa36a7': buildNetworkConfiguration({
                chainId: '0xaa36a7',
                name: 'Sepolia',
                nativeCurrency: 'SepoliaETH',
                rpcEndpoints: [
                  buildInfuraEndpoint(SEPOLIA_CLIENT_ID, 'sepolia'),
                ],
              }),
            },
            networksMetadata: {
              [MAINNET_CLIENT_ID]: buildNetworkMetadata(NetworkStatus.Unavailable),
            },
          }),
        );

        jest.advanceTimersByTime(5_000);

        expect(controller.state.status).toBe('degraded');
        expect(controller.state.network).toMatchObject({
          networkClientId: MAINNET_CLIENT_ID,
        });
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
                  buildInfuraEndpoint(MAINNET_CLIENT_ID, 'mainnet'),
                ],
              }),
              '0x89': buildNetworkConfiguration({
                chainId: '0x89',
                name: 'Polygon Mainnet',
                nativeCurrency: 'MATIC',
                rpcEndpoints: [
                  buildCustomEndpoint(
                    POLYGON_CUSTOM_CLIENT_ID,
                    'https://polygon-rpc.com',
                  ),
                ],
              }),
            },
            networksMetadata: {
              [MAINNET_CLIENT_ID]: buildNetworkMetadata(NetworkStatus.Unavailable),
              [POLYGON_CUSTOM_CLIENT_ID]: buildNetworkMetadata(
                NetworkStatus.Unavailable,
              ),
            },
          }),
        );

        jest.advanceTimersByTime(5_000);

        expect(controller.state.network).toMatchObject({ chainId: '0x89' });
      });
    });

    it('only updates the failed-network detail (not the timers) when the same chain keeps failing across re-evaluations', async () => {
      await withController(({ controller, publishNetworkStateChanges }) => {
        const config = buildNetworkConfiguration({
          chainId: '0x1',
          rpcEndpoints: [
            buildCustomEndpoint(
              POLYGON_CUSTOM_CLIENT_ID,
              'https://polygon-rpc.com',
            ),
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
        expect(controller.state.status).toBe('degraded');

        // Same chain still failing — should be a no-op update (no timer reset).
        publishNetworkStateChanges(
          buildExternalState({
            networkConfigurationsByChainId: { '0x1': config },
            enabledEvmChainIds: ['0x1'],
            networksMetadata: {
              [POLYGON_CUSTOM_CLIENT_ID]: buildNetworkMetadata(NetworkStatus.Blocked),
            },
          }),
        );

        // 25s after the original degraded fire — the unavailable escalation
        // should still happen on schedule (timers were not restarted).
        jest.advanceTimersByTime(25_000);
        expect(controller.state.status).toBe('unavailable');
      });
    });

    it('does not restart the degraded timer when the same network fails across re-evaluations', async () => {
      await withController(({ controller, publishNetworkStateChanges }) => {
        const failingState = buildExternalState({
          networkConfigurationsByChainId: {
            '0x89': buildNetworkConfiguration({
              chainId: '0x89',
              name: 'Polygon Mainnet',
              nativeCurrency: 'MATIC',
              rpcEndpoints: [
                buildCustomEndpoint(
                  POLYGON_CUSTOM_CLIENT_ID,
                  'https://polygon-rpc.com',
                ),
              ],
            }),
          },
          enabledEvmChainIds: ['0x89'],
          networksMetadata: {
            [POLYGON_CUSTOM_CLIENT_ID]: buildNetworkMetadata(NetworkStatus.Unavailable),
          },
        });

        publishNetworkStateChanges(failingState);
        jest.advanceTimersByTime(4_000);

        publishNetworkStateChanges(failingState);
        jest.advanceTimersByTime(1_000);

        expect(controller.state.status).toBe('degraded');
      });
    });

    it('cancels the banner if the network recovers between the degraded-timer scheduling and its firing', async () => {
      await withController(({ controller, publishNetworkStateChanges }) => {
        publishNetworkStateChanges(
          buildExternalState({
            networkConfigurationsByChainId: {
              '0x89': buildNetworkConfiguration({
                chainId: '0x89',
                name: 'Polygon Mainnet',
                nativeCurrency: 'MATIC',
                rpcEndpoints: [
                  buildCustomEndpoint(
                    POLYGON_CUSTOM_CLIENT_ID,
                    'https://polygon-rpc.com',
                  ),
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
                name: 'Polygon Mainnet',
                nativeCurrency: 'MATIC',
                rpcEndpoints: [
                  buildCustomEndpoint(
                    POLYGON_CUSTOM_CLIENT_ID,
                    'https://polygon-rpc.com',
                  ),
                ],
              }),
            },
            enabledEvmChainIds: ['0x89'],
            networksMetadata: {
              [POLYGON_CUSTOM_CLIENT_ID]: buildNetworkMetadata(NetworkStatus.Available),
            },
          }),
        );

        jest.advanceTimersByTime(30_000);
        expect(controller.state.status).toBe('available');
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
        expect(controller.state.status).toBe('available');
      });
    });

    it('clears banner state when all enabled networks recover', async () => {
      await withController(({ controller, publishNetworkStateChanges }) => {
        const failingConfig = buildNetworkConfiguration({
          chainId: '0x89',
          name: 'Polygon Mainnet',
          nativeCurrency: 'MATIC',
          rpcEndpoints: [
            buildCustomEndpoint(
              POLYGON_CUSTOM_CLIENT_ID,
              'https://polygon-rpc.com',
            ),
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
        expect(controller.state.status).toBe('degraded');

        publishNetworkStateChanges(
          buildExternalState({
            networkConfigurationsByChainId: { '0x89': failingConfig },
            enabledEvmChainIds: ['0x89'],
            networksMetadata: {
              [POLYGON_CUSTOM_CLIENT_ID]: buildNetworkMetadata(NetworkStatus.Available),
            },
          }),
        );

        expect(controller.state).toStrictEqual({
          status: 'available',
          network: null,
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
                  buildCustomEndpoint(MAINNET_CLIENT_ID, 'not a valid url'),
                ],
              }),
            },
            enabledEvmChainIds: ['0x1'],
            networksMetadata: {
              [MAINNET_CLIENT_ID]: buildNetworkMetadata(NetworkStatus.Unavailable),
            },
          }),
        );

        jest.advanceTimersByTime(5_000);
        expect(controller.state.status).toBe('degraded');
        expect(controller.state.network).toMatchObject({
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
        expect(controller.state.status).toBe('available');
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
        expect(controller.state.status).toBe('available');
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
                  buildCustomEndpoint(
                    ALCHEMY_CLIENT_ID,
                    'https://eth-mainnet.alchemyapi.io/v2/abc',
                  ),
                  buildInfuraEndpoint(MAINNET_CLIENT_ID, 'mainnet'),
                ],
              }),
            },
            enabledEvmChainIds: ['0x1'],
            networksMetadata: {
              [ALCHEMY_CLIENT_ID]: buildNetworkMetadata(NetworkStatus.Unavailable),
            },
          }),
        );

        jest.advanceTimersByTime(5_000);

        expect(controller.state.network).toMatchObject({
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
        ({ controller, setNetworkEnablementControllerState }) => {
          jest.advanceTimersByTime(30_000);
          expect(controller.state.status).toBe('available');

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
          expect(controller.state.status).toBe('degraded');
        },
        buildExternalState({
          networkConfigurationsByChainId: {
            '0x89': buildNetworkConfiguration({
              chainId: '0x89',
              name: 'Polygon Mainnet',
              nativeCurrency: 'MATIC',
              rpcEndpoints: [
                buildCustomEndpoint(
                  POLYGON_CUSTOM_CLIENT_ID,
                  'https://polygon-rpc.com',
                ),
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
      );
    });

    it('clears the banner when the failing chain gets disabled', async () => {
      await withController(
        ({ controller, setNetworkEnablementControllerState }) => {
          jest.advanceTimersByTime(30_000);
          expect(controller.state.status).toBe('unavailable');

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
            status: 'available',
            network: null,
          });
        },
        buildExternalState({
          networkConfigurationsByChainId: {
            '0x89': buildNetworkConfiguration({
              chainId: '0x89',
              name: 'Polygon Mainnet',
              nativeCurrency: 'MATIC',
              rpcEndpoints: [
                buildCustomEndpoint(
                  POLYGON_CUSTOM_CLIENT_ID,
                  'https://polygon-rpc.com',
                ),
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
                    buildCustomEndpoint(
                      POLYGON_CUSTOM_CLIENT_ID,
                      'https://polygon-rpc.com',
                    ),
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
          expect(controller.state.status).toBe('degraded');

          setConnectivityStatus(CONNECTIVITY_STATUSES.Offline);
          expect(controller.state.status).toBe('available');
          expect(controller.state.network).toBeNull();

          setConnectivityStatus(CONNECTIVITY_STATUSES.Online);
          jest.advanceTimersByTime(5_000);
          expect(controller.state.status).toBe('degraded');
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
                  buildCustomEndpoint(
                    POLYGON_CUSTOM_CLIENT_ID,
                    'https://polygon-rpc.com',
                  ),
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
        expect(controller.state.status).toBe('degraded');

        controller.dismissBanner();
        expect(controller.state.status).toBe('available');
        expect(controller.state.network).toBeNull();
      });
    });

    it('clears banner state via messenger action', async () => {
      await withController(({ controller, rootMessenger, publishNetworkStateChanges }) => {
        publishNetworkStateChanges(
          buildExternalState({
            networkConfigurationsByChainId: {
              '0x1': buildNetworkConfiguration({
                chainId: '0x1',
                rpcEndpoints: [
                  buildCustomEndpoint(
                    POLYGON_CUSTOM_CLIENT_ID,
                    'https://polygon-rpc.com',
                  ),
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
        expect(controller.state.status).toBe('available');
      });
    });
  });

  describe('switchToDefaultInfuraRpcEndpoint', () => {
    it('invokes NetworkController:updateNetwork with the Infura endpoint as the new default', async () => {
      await withController(
        async ({ rootMessenger, publishNetworkStateChanges, updateNetwork }) => {
          const config = buildNetworkConfiguration({
            chainId: '0x1',
            rpcEndpoints: [
              buildCustomEndpoint(
                ALCHEMY_CLIENT_ID,
                'https://eth-mainnet.alchemyapi.io/v2/abc',
              ),
              buildInfuraEndpoint(MAINNET_CLIENT_ID, 'mainnet'),
            ],
          });
          publishNetworkStateChanges(
            buildExternalState({
              networkConfigurationsByChainId: { '0x1': config },
              enabledEvmChainIds: ['0x1'],
              networksMetadata: {
                [ALCHEMY_CLIENT_ID]: buildNetworkMetadata(NetworkStatus.Unavailable),
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
            { replacementSelectedRpcEndpointIndex: 1 },
          );
        },
      );
    });

    it('is a no-op when the default is already Infura', async () => {
      await withController(
        async ({ rootMessenger, publishNetworkStateChanges, updateNetwork }) => {
          publishNetworkStateChanges(
            buildExternalState({
              networkConfigurationsByChainId: {
                '0x1': buildNetworkConfiguration({
                  chainId: '0x1',
                  rpcEndpoints: [
                    buildInfuraEndpoint(MAINNET_CLIENT_ID, 'mainnet'),
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
      await withController(async ({ rootMessenger, publishNetworkStateChanges }) => {
        publishNetworkStateChanges(
          buildExternalState({
            networkConfigurationsByChainId: {
              '0x1': buildNetworkConfiguration({
                chainId: '0x1',
                rpcEndpoints: [
                  buildCustomEndpoint(
                    ALCHEMY_CLIENT_ID,
                    'https://eth-mainnet.alchemyapi.io/v2/abc',
                  ),
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
      });
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

type ExternalState = {
  NetworkController: Partial<NetworkState>;
  NetworkEnablementController: NetworkEnablementControllerState;
  ConnectivityController: ConnectivityControllerState;
};

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
  updateNetwork: jest.Mock;
}) => Promise<ReturnValue> | ReturnValue;

async function withController<ReturnValue>(
  testFunction: WithControllerCallback<ReturnValue>,
  externalState?: ExternalState,
  start = true,
): Promise<ReturnValue> {
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
    (chainId) => currentState.NetworkController.networkConfigurationsByChainId?.[chainId],
  );
  const updateNetwork = jest.fn(
    async (chainId: Hex): Promise<NetworkConfiguration> =>
      currentState.NetworkController.networkConfigurationsByChainId?.[chainId] ??
      buildNetworkConfiguration({ chainId }),
  );
  rootMessenger.registerActionHandler(
    'NetworkController:updateNetwork',
    updateNetwork,
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
    ],
  });

  const controller = new NetworkConnectionBannerController({
    messenger,
  });
  if (start) {
    controller.start();
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
    updateNetwork,
  });
}
