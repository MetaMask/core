import { Messenger } from '@metamask/base-controller';
import {
  ChainId,
  convertHexToDecimal,
  toHex,
} from '@metamask/controller-utils';
import EthQuery from '@metamask/eth-query';
import { NetworkController, NetworkStatus } from '@metamask/network-controller';
import type {
  NetworkControllerGetEIP1559CompatibilityAction,
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetStateAction,
  NetworkControllerNetworkDidChangeEvent,
  NetworkState,
} from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';
import nock from 'nock';
import * as sinon from 'sinon';

import {
  buildCustomNetworkConfiguration,
  buildCustomRpcEndpoint,
} from '../../network-controller/tests/helpers';
import determineGasFeeCalculations from './determineGasFeeCalculations';
import {
  fetchGasEstimates,
  fetchLegacyGasPriceEstimates,
  fetchEthGasPriceEstimate,
  calculateTimeEstimate,
} from './gas-util';
import { GAS_ESTIMATE_TYPES, GasFeeController } from './GasFeeController';
import type {
  GasFeeState,
  GasFeeStateChange,
  GasFeeStateEthGasPrice,
  GasFeeStateFeeMarket,
  GasFeeStateLegacy,
  GetGasFeeState,
} from './GasFeeController';

jest.mock('./determineGasFeeCalculations');

const mockedDetermineGasFeeCalculations =
  determineGasFeeCalculations as jest.Mock<
    ReturnType<typeof determineGasFeeCalculations>,
    Parameters<typeof determineGasFeeCalculations>
  >;

const name = 'GasFeeController';

type MainMessenger = Messenger<
  | GetGasFeeState
  | NetworkControllerGetStateAction
  | NetworkControllerGetNetworkClientByIdAction
  | NetworkControllerGetEIP1559CompatibilityAction,
  GasFeeStateChange | NetworkControllerNetworkDidChangeEvent
>;

const getMessenger = (): MainMessenger => {
  return new Messenger();
};

const setupNetworkController = async ({
  unrestrictedMessenger,
  state,
  clock,
  initializeProvider = true,
}: {
  unrestrictedMessenger: MainMessenger;
  state: Partial<NetworkState>;
  clock: sinon.SinonFakeTimers;
  initializeProvider?: boolean;
}) => {
  const restrictedMessenger = unrestrictedMessenger.getRestricted({
    name: 'NetworkController',
    allowedActions: [],
    allowedEvents: [],
  });

  const infuraProjectId = '123';

  const networkController = new NetworkController({
    messenger: restrictedMessenger,
    state,
    infuraProjectId,
    getRpcServiceOptions: () => ({
      fetch,
      btoa,
    }),
  });

  nock('https://mainnet.infura.io')
    .post(`/v3/${infuraProjectId}`, {
      id: /^\d+$/u,
      jsonrpc: '2.0',
      method: 'eth_blockNumber',
      params: [],
    })
    .reply(200, {
      id: 1,
      jsonrpc: '2.0',
      result: '0x1',
    })
    .persist();

  if (initializeProvider) {
    // Call this without awaiting to simulate what the extension or mobile app
    // might do
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    networkController.initializeProvider();
    // Ensure that the request for eth_getBlockByNumber made by the PollingBlockTracker
    // inside the NetworkController goes through
    await clock.nextAsync();
  }

  return networkController;
};

const getRestrictedMessenger = (messenger: MainMessenger) => {
  return messenger.getRestricted({
    name,
    allowedActions: [
      'NetworkController:getState',
      'NetworkController:getNetworkClientById',
      'NetworkController:getEIP1559Compatibility',
    ],
    allowedEvents: ['NetworkController:networkDidChange'],
  });
};

/**
 * Builds mock gas fee state that would typically be generated for an EIP-1559-compatible network.
 * This data is merely intended to fit the GasFeeStateFeeMarket type and does not represent any
 * real-world scenario.
 *
 * @param args - The arguments.
 * @param args.modifier - A number you can use to build a unique return value in the event that you
 * need to build multiple return values. All data points will be multiplied by this number.
 * @returns The mock data.
 */
function buildMockGasFeeStateFeeMarket({
  modifier = 1,
} = {}): GasFeeStateFeeMarket {
  return {
    gasFeeEstimates: {
      low: {
        minWaitTimeEstimate: 10000 * modifier,
        maxWaitTimeEstimate: 20000 * modifier,
        suggestedMaxPriorityFeePerGas: modifier.toString(),
        suggestedMaxFeePerGas: (10 * modifier).toString(),
      },
      medium: {
        minWaitTimeEstimate: 30000 * modifier,
        maxWaitTimeEstimate: 40000 * modifier,
        suggestedMaxPriorityFeePerGas: (1.5 * modifier).toString(),
        suggestedMaxFeePerGas: (20 * modifier).toString(),
      },
      high: {
        minWaitTimeEstimate: 50000 * modifier,
        maxWaitTimeEstimate: 60000 * modifier,
        suggestedMaxPriorityFeePerGas: (2 * modifier).toString(),
        suggestedMaxFeePerGas: (30 * modifier).toString(),
      },
      estimatedBaseFee: (100 * modifier).toString(),
      historicalBaseFeeRange: [
        (100 * modifier).toString(),
        (200 * modifier).toString(),
      ],
      baseFeeTrend: 'up',
      latestPriorityFeeRange: [modifier.toString(), (2 * modifier).toString()],
      historicalPriorityFeeRange: [
        (2 * modifier).toString(),
        (4 * modifier).toString(),
      ],
      priorityFeeTrend: 'down',
      networkCongestion: 0.1 * modifier,
    },
    estimatedGasFeeTimeBounds: {
      lowerTimeBound: 1000 * modifier,
      upperTimeBound: 2000 * modifier,
    },
    gasEstimateType: GAS_ESTIMATE_TYPES.FEE_MARKET,
  };
}

/**
 * Builds mock gas fee state that would typically be generated for an non-EIP-1559-compatible
 * network. This data is merely intended to fit the GasFeeStateLegacy type and does not represent
 * any real-world scenario.
 *
 * @param args - The arguments.
 * @param args.modifier - A number you can use to build a unique return value in the event that you
 * need to build multiple return values. All data points will be multiplied by this number.
 * @returns The mock data.
 */
function buildMockGasFeeStateLegacy({ modifier = 1 } = {}): GasFeeStateLegacy {
  return {
    gasFeeEstimates: {
      low: (10 * modifier).toString(),
      medium: (20 * modifier).toString(),
      high: (30 * modifier).toString(),
    },
    estimatedGasFeeTimeBounds: {},
    gasEstimateType: GAS_ESTIMATE_TYPES.LEGACY,
  };
}

/**
 * Builds mock gas fee state that would typically be generated for the case in which eth_gasPrice is
 * used to fetch estimates. This data is merely intended to fit the GasFeeStateEthGasPrice type and
 * does not represent any real-world scenario.
 *
 * @param args - The arguments.
 * @param args.modifier - A number you can use to build a unique return value in the event that you
 * need to build multiple return values. All data points will be multiplied by this number.
 * @returns The mock data.
 */
function buildMockGasFeeStateEthGasPrice({
  modifier = 1,
} = {}): GasFeeStateEthGasPrice {
  return {
    gasFeeEstimates: {
      gasPrice: (100 * modifier).toString(),
    },
    estimatedGasFeeTimeBounds: {},
    gasEstimateType: GAS_ESTIMATE_TYPES.ETH_GASPRICE,
  };
}

describe('GasFeeController', () => {
  let clock: sinon.SinonFakeTimers;
  let gasFeeController: GasFeeController;
  let networkController: NetworkController;

  /**
   * Builds an instance of GasFeeController for use in testing, and then makes it available in
   * tests along with mocks for fetch* functions passed to GasFeeController.
   *
   * @param options - The options.
   * @param options.getChainId - Sets getChainId on the GasFeeController.
   * @param options.onNetworkDidChange - A function for registering an event handler for the
   * @param options.getIsEIP1559Compatible - Sets getCurrentNetworkEIP1559Compatibility on the
   * GasFeeController.
   * @param options.getCurrentNetworkLegacyGasAPICompatibility - Sets
   * getCurrentNetworkLegacyGasAPICompatibility on the GasFeeController.
   * @param options.legacyAPIEndpoint - Sets legacyAPIEndpoint on the GasFeeController.
   * @param options.EIP1559APIEndpoint - Sets EIP1559APIEndpoint on the GasFeeController.
   * @param options.clientId - Sets clientId on the GasFeeController.
   * @param options.networkControllerState - State object to initialize
   * NetworkController with.
   * @param options.interval - The polling interval.
   * @param options.state - The initial GasFeeController state
   * @param options.initializeNetworkProvider - Whether to instruct the
   * NetworkController to initialize its provider.
   */
  async function setupGasFeeController({
    getIsEIP1559Compatible = jest.fn().mockResolvedValue(true),
    getCurrentNetworkLegacyGasAPICompatibility = jest
      .fn()
      .mockReturnValue(false),
    legacyAPIEndpoint = 'http://legacy.endpoint/<chain_id>',
    EIP1559APIEndpoint = 'http://eip-1559.endpoint/<chain_id>',
    clientId,
    getChainId,
    onNetworkDidChange,
    networkControllerState = {},
    state,
    interval,
    initializeNetworkProvider = true,
  }: {
    getChainId?: jest.Mock<Hex>;
    onNetworkDidChange?: jest.Mock<void>;
    getIsEIP1559Compatible?: jest.Mock<Promise<boolean>>;
    getCurrentNetworkLegacyGasAPICompatibility?: jest.Mock<boolean>;
    legacyAPIEndpoint?: string;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    EIP1559APIEndpoint?: string;
    clientId?: string;
    networkControllerState?: Partial<NetworkState>;
    state?: GasFeeState;
    interval?: number;
    initializeNetworkProvider?: boolean;
  } = {}) {
    const messenger = getMessenger();
    networkController = await setupNetworkController({
      unrestrictedMessenger: messenger,
      state: networkControllerState,
      clock,
      initializeProvider: initializeNetworkProvider,
    });
    const restrictedMessenger = getRestrictedMessenger(messenger);
    gasFeeController = new GasFeeController({
      getProvider: jest.fn(),
      getChainId,
      onNetworkDidChange,
      messenger: restrictedMessenger,
      getCurrentNetworkLegacyGasAPICompatibility,
      getCurrentNetworkEIP1559Compatibility: getIsEIP1559Compatible, // change this for networkDetails.state.networkDetails.isEIP1559Compatible ???
      legacyAPIEndpoint,
      EIP1559APIEndpoint,
      state,
      clientId,
      interval,
    });
  }

  beforeEach(() => {
    clock = sinon.useFakeTimers();
    mockedDetermineGasFeeCalculations.mockResolvedValue(
      buildMockGasFeeStateFeeMarket(),
    );
  });

  afterEach(() => {
    gasFeeController.destroy();
    const { blockTracker } = networkController.getProviderAndBlockTracker();
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    blockTracker?.destroy();
    sinon.restore();
  });

  describe('constructor', () => {
    beforeEach(async () => {
      await setupGasFeeController();
    });

    it('should set the name of the controller to GasFeeController', () => {
      expect(gasFeeController.name).toBe(name);
    });
  });

  describe('getGasFeeEstimatesAndStartPolling', () => {
    describe('if never called before', () => {
      describe('and called with undefined', () => {
        const mockDetermineGasFeeCalculationsReturnValues: GasFeeState[] = [
          buildMockGasFeeStateFeeMarket(),
          buildMockGasFeeStateEthGasPrice(),
        ];

        beforeEach(() => {
          mockedDetermineGasFeeCalculations.mockReset();

          mockDetermineGasFeeCalculationsReturnValues.forEach((returnValue) => {
            mockedDetermineGasFeeCalculations.mockImplementationOnce(() => {
              return Promise.resolve(returnValue);
            });
          });
        });

        it('should call determineGasFeeCalculations correctly', async () => {
          await setupGasFeeController({
            getIsEIP1559Compatible: jest.fn().mockResolvedValue(false),
            getCurrentNetworkLegacyGasAPICompatibility: jest
              .fn()
              .mockReturnValue(true),
            legacyAPIEndpoint: 'https://some-legacy-endpoint/<chain_id>',
            EIP1559APIEndpoint: 'https://some-eip-1559-endpoint/<chain_id>',
            networkControllerState: {
              networkConfigurationsByChainId: {
                [toHex(1337)]: buildCustomNetworkConfiguration({
                  chainId: toHex(1337),
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      networkClientId: 'AAAA-BBBB-CCCC-DDDD',
                    }),
                  ],
                }),
              },
              selectedNetworkClientId: 'AAAA-BBBB-CCCC-DDDD',
            },
            clientId: '99999',
            // Currently initializing the provider overwrites the
            // `selectedNetworkClientId` we specify above based on whatever
            // `providerConfig` is. So we prevent the provider from being
            // initialized to make this test pass. Once `providerConfig` is
            // removed, then we don't need this anymore and
            // `selectedNetworkClientId` should no longer be overwritten.
            initializeNetworkProvider: false,
          });

          await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);

          expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledWith({
            isEIP1559Compatible: false,
            isLegacyGasAPICompatible: true,
            fetchGasEstimates,
            fetchGasEstimatesUrl: 'https://some-eip-1559-endpoint/1337',
            fetchLegacyGasPriceEstimates,
            fetchLegacyGasPriceEstimatesUrl:
              'https://some-legacy-endpoint/1337',
            fetchEthGasPriceEstimate,
            calculateTimeEstimate,
            clientId: '99999',
            ethQuery: expect.any(EthQuery),
            nonRPCGasFeeApisDisabled: false,
          });
        });

        it('should update the state with a fetched set of estimates', async () => {
          await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);

          expect(gasFeeController.state).toMatchObject(
            mockDetermineGasFeeCalculationsReturnValues[0],
          );
        });

        it('should continue updating the state with all estimate data (including new time estimates because of a subsequent call to determineGasFeeCalculations) on a set interval', async () => {
          await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);
          await clock.nextAsync();

          expect(gasFeeController.state).toMatchObject(
            mockDetermineGasFeeCalculationsReturnValues[1],
          );
        });
      });

      describe('and called with a previously unseen token', () => {
        it('should call determineGasFeeCalculations correctly', async () => {
          await setupGasFeeController({
            getIsEIP1559Compatible: jest.fn().mockResolvedValue(false),
            getCurrentNetworkLegacyGasAPICompatibility: jest
              .fn()
              .mockReturnValue(true),
            legacyAPIEndpoint: 'https://some-legacy-endpoint/<chain_id>',
            EIP1559APIEndpoint: 'https://some-eip-1559-endpoint/<chain_id>',
            networkControllerState: {
              networkConfigurationsByChainId: {
                [toHex(1337)]: buildCustomNetworkConfiguration({
                  chainId: toHex(1337),
                  rpcEndpoints: [
                    buildCustomRpcEndpoint({
                      networkClientId: 'AAAA-BBBB-CCCC-DDDD',
                    }),
                  ],
                }),
              },
              selectedNetworkClientId: 'AAAA-BBBB-CCCC-DDDD',
            },
            clientId: '99999',
            // Currently initializing the provider overwrites the
            // `selectedNetworkClientId` we specify above based on whatever
            // `providerConfig` is. So we prevent the provider from being
            // initialized to make this test pass. Once `providerConfig` is
            // removed, then we don't need this anymore and
            // `selectedNetworkClientId` should no longer be overwritten.
            initializeNetworkProvider: false,
          });

          await gasFeeController.getGasFeeEstimatesAndStartPolling(
            'some-previously-unseen-token',
          );

          expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledWith({
            isEIP1559Compatible: false,
            isLegacyGasAPICompatible: true,
            fetchGasEstimates,
            fetchGasEstimatesUrl: 'https://some-eip-1559-endpoint/1337',
            fetchLegacyGasPriceEstimates,
            fetchLegacyGasPriceEstimatesUrl:
              'https://some-legacy-endpoint/1337',
            fetchEthGasPriceEstimate,
            calculateTimeEstimate,
            clientId: '99999',
            ethQuery: expect.any(EthQuery),
            nonRPCGasFeeApisDisabled: false,
          });
        });

        it('should make further calls to determineGasFeeCalculations on a set interval', async () => {
          const pollingInterval = 10000;
          await setupGasFeeController({ interval: pollingInterval });

          await gasFeeController.getGasFeeEstimatesAndStartPolling(
            'some-previously-unseen-token',
          );
          await clock.tickAsync(pollingInterval);

          expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledTimes(2);
        });
      });
    });

    describe('if called twice with undefined', () => {
      it('should not call determineGasFeeCalculations again', async () => {
        await setupGasFeeController();

        await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);
        await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);

        expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledTimes(1);
      });

      it('should not make more than one call to determineGasFeeCalculations per set interval', async () => {
        const pollingInterval = 10000;
        await setupGasFeeController({ interval: pollingInterval });

        await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);
        await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);
        await clock.tickAsync(pollingInterval);
        await clock.tickAsync(pollingInterval);

        expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledTimes(3);
      });
    });

    describe('if called once with undefined and again with the same token', () => {
      it('should call determineGasFeeCalculations again', async () => {
        await setupGasFeeController();

        const pollToken =
          await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);
        await gasFeeController.getGasFeeEstimatesAndStartPolling(pollToken);

        expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledTimes(2);
      });

      it('should not make more than one call to determineGasFeeCalculations per set interval', async () => {
        const pollingInterval = 10000;
        await setupGasFeeController({ interval: pollingInterval });

        const pollToken =
          await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);
        await gasFeeController.getGasFeeEstimatesAndStartPolling(pollToken);
        await clock.tickAsync(pollingInterval);
        await clock.tickAsync(pollingInterval);

        expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledTimes(4);
      });
    });

    describe('if called twice, both with previously unseen tokens', () => {
      it('should not call determineGasFeeCalculations again', async () => {
        await setupGasFeeController();

        await gasFeeController.getGasFeeEstimatesAndStartPolling(
          'some-previously-unseen-token-1',
        );

        await gasFeeController.getGasFeeEstimatesAndStartPolling(
          'some-previously-unseen-token-2',
        );

        expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledTimes(1);
      });

      it('should not make more than one call to determineGasFeeCalculations per set interval', async () => {
        const pollingInterval = 10000;
        await setupGasFeeController({ interval: pollingInterval });

        await gasFeeController.getGasFeeEstimatesAndStartPolling(
          'some-previously-unseen-token-1',
        );

        await gasFeeController.getGasFeeEstimatesAndStartPolling(
          'some-previously-unseen-token-2',
        );
        await clock.tickAsync(pollingInterval);
        await clock.tickAsync(pollingInterval);

        expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledTimes(3);
      });
    });
  });

  describe('enableNonRPCGasFeeApis', () => {
    it('should set state.nonRPCGasFeeApisDisabled to true', async () => {
      await setupGasFeeController({
        state: {
          ...buildMockGasFeeStateEthGasPrice(),
          nonRPCGasFeeApisDisabled: false,
        },
      });

      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/await-thenable
      await gasFeeController.enableNonRPCGasFeeApis();

      expect(gasFeeController.state.nonRPCGasFeeApisDisabled).toBe(false);
    });
  });

  describe('disableNonRPCGasFeeApis', () => {
    it('should set state.nonRPCGasFeeApisDisabled to false', async () => {
      await setupGasFeeController({
        state: {
          ...buildMockGasFeeStateEthGasPrice(),
          nonRPCGasFeeApisDisabled: true,
        },
      });

      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/await-thenable
      await gasFeeController.disableNonRPCGasFeeApis();

      expect(gasFeeController.state.nonRPCGasFeeApisDisabled).toBe(true);
    });
  });

  describe('disconnectPoller', () => {
    describe('assuming that getGasFeeEstimatesAndStartPolling was already called exactly once', () => {
      describe('given the same token as the result of the first call', () => {
        it('should prevent calls to determineGasFeeCalculations from being made periodically', async () => {
          const pollingInterval = 10000;
          await setupGasFeeController({ interval: pollingInterval });
          const pollToken =
            await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);
          await clock.tickAsync(pollingInterval);
          expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledTimes(2);

          gasFeeController.disconnectPoller(pollToken);

          await clock.tickAsync(pollingInterval);
          expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledTimes(2);
        });

        it('should make it so that a second call to getGasFeeEstimatesAndStartPolling with the same token has the same effect as the inaugural call', async () => {
          const pollingInterval = 10000;
          await setupGasFeeController({ interval: pollingInterval });
          const pollToken =
            await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);
          await clock.tickAsync(pollingInterval);
          expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledTimes(2);

          gasFeeController.disconnectPoller(pollToken);

          await gasFeeController.getGasFeeEstimatesAndStartPolling(pollToken);
          await clock.tickAsync(pollingInterval);
          expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledTimes(4);
        });
      });

      describe('given a previously unseen token', () => {
        it('should not prevent calls to determineGasFeeCalculations from being made periodically', async () => {
          const pollingInterval = 10000;
          await setupGasFeeController({ interval: pollingInterval });
          await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);
          await clock.tickAsync(pollingInterval);
          expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledTimes(2);

          gasFeeController.disconnectPoller('some-previously-unseen-token');

          await clock.tickAsync(pollingInterval);
          expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledTimes(3);
        });
      });
    });

    describe('if getGasFeeEstimatesAndStartPolling was called twice with different tokens', () => {
      it('should not prevent calls to determineGasFeeCalculations from being made periodically', async () => {
        const pollingInterval = 10000;
        await setupGasFeeController();
        // Passing undefined generates a new token
        const pollToken1 =
          await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);
        await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);
        await clock.tickAsync(pollingInterval);
        expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledTimes(1);

        gasFeeController.disconnectPoller(pollToken1);

        await clock.tickAsync(pollingInterval);
        expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledTimes(2);
      });
    });

    describe('if getGasFeeEstimatesAndStartPolling was never called', () => {
      it('should not throw an error', async () => {
        await setupGasFeeController();
        expect(() =>
          gasFeeController.disconnectPoller('some-token'),
        ).not.toThrow();
      });
    });
  });

  describe('stopPolling', () => {
    describe('assuming that getGasFeeEstimatesAndStartPolling was already called exactly once', () => {
      it('should prevent calls to determineGasFeeCalculations from being made periodically', async () => {
        const pollingInterval = 10000;
        await setupGasFeeController({ interval: pollingInterval });
        await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);
        await clock.tickAsync(pollingInterval);
        expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledTimes(2);

        gasFeeController.stopPolling();

        await clock.tickAsync(pollingInterval);
        expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledTimes(2);
      });

      it('should make it so that a second call to getGasFeeEstimatesAndStartPolling with the same token has the same effect as the inaugural call', async () => {
        const pollingInterval = 10000;
        await setupGasFeeController({ interval: pollingInterval });
        const pollToken =
          await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);
        await clock.tickAsync(pollingInterval);
        expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledTimes(2);

        gasFeeController.stopPolling();

        await gasFeeController.getGasFeeEstimatesAndStartPolling(pollToken);
        await clock.tickAsync(pollingInterval);
        expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledTimes(4);
      });

      it('should revert the state back to its original form', async () => {
        await setupGasFeeController();
        await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);

        gasFeeController.stopPolling();

        expect(gasFeeController.state.gasFeeEstimates).toStrictEqual({});
        expect(gasFeeController.state.estimatedGasFeeTimeBounds).toStrictEqual(
          {},
        );

        expect(gasFeeController.state.gasEstimateType).toBe('none');
      });
    });

    describe('if getGasFeeEstimatesAndStartPolling was called multiple times with the same token (thereby restarting the polling once)', () => {
      it('should prevent calls to determineGasFeeCalculations from being made periodically', async () => {
        const pollingInterval = 10000;
        await setupGasFeeController({ interval: pollingInterval });
        const pollToken =
          await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);
        await gasFeeController.getGasFeeEstimatesAndStartPolling(pollToken);
        await clock.tickAsync(pollingInterval);
        expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledTimes(3);

        gasFeeController.stopPolling();

        await clock.tickAsync(pollingInterval);
        expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledTimes(3);
      });

      it('should make it so that another call to getGasFeeEstimatesAndStartPolling with a previously generated token has the same effect as the inaugural call', async () => {
        const pollingInterval = 10000;
        await setupGasFeeController({ interval: pollingInterval });
        const pollToken =
          await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);
        await gasFeeController.getGasFeeEstimatesAndStartPolling(pollToken);
        await clock.tickAsync(pollingInterval);
        expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledTimes(3);

        gasFeeController.stopPolling();

        await gasFeeController.getGasFeeEstimatesAndStartPolling(pollToken);
        await clock.tickAsync(pollingInterval);
        expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledTimes(5);
      });
    });

    describe('if getGasFeeEstimatesAndStartPolling was never called', () => {
      it('should not throw an error', async () => {
        await setupGasFeeController();
        expect(() => gasFeeController.stopPolling()).not.toThrow();
      });
    });
  });

  describe('fetchGasFeeEstimates', () => {
    describe('when on any network supporting legacy gas estimation api', () => {
      const getDefaultOptions = () => ({
        getIsEIP1559Compatible: jest.fn().mockResolvedValue(false),
        getCurrentNetworkLegacyGasAPICompatibility: jest
          .fn()
          .mockReturnValue(true),
      });
      const mockDetermineGasFeeCalculations = buildMockGasFeeStateLegacy();

      beforeEach(() => {
        mockedDetermineGasFeeCalculations.mockResolvedValue(
          mockDetermineGasFeeCalculations,
        );
      });

      it('should call determineGasFeeCalculations correctly', async () => {
        await setupGasFeeController({
          ...getDefaultOptions(),
          legacyAPIEndpoint: 'https://some-legacy-endpoint/<chain_id>',
          EIP1559APIEndpoint: 'https://some-eip-1559-endpoint/<chain_id>',
          networkControllerState: {
            networkConfigurationsByChainId: {
              [toHex(1337)]: buildCustomNetworkConfiguration({
                chainId: toHex(1337),
                rpcEndpoints: [
                  buildCustomRpcEndpoint({
                    networkClientId: 'AAAA-BBBB-CCCC-DDDD',
                  }),
                ],
              }),
            },
            selectedNetworkClientId: 'AAAA-BBBB-CCCC-DDDD',
          },
          clientId: '99999',
          // Currently initializing the provider overwrites the
          // `selectedNetworkClientId` we specify above based on whatever
          // `providerConfig` is. So we prevent the provider from being
          // initialized to make this test pass. Once `providerConfig` is
          // removed, then we don't need this anymore and
          // `selectedNetworkClientId` should no longer be overwritten.
          initializeNetworkProvider: false,
        });

        await gasFeeController.fetchGasFeeEstimates();

        expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledWith({
          isEIP1559Compatible: false,
          isLegacyGasAPICompatible: true,
          fetchGasEstimates,
          fetchGasEstimatesUrl: 'https://some-eip-1559-endpoint/1337',
          fetchLegacyGasPriceEstimates,
          fetchLegacyGasPriceEstimatesUrl: 'https://some-legacy-endpoint/1337',
          fetchEthGasPriceEstimate,
          calculateTimeEstimate,
          clientId: '99999',
          ethQuery: expect.any(EthQuery),
          nonRPCGasFeeApisDisabled: false,
        });
      });

      it('should update the state with a fetched set of estimates', async () => {
        await setupGasFeeController(getDefaultOptions());

        await gasFeeController.fetchGasFeeEstimates();

        expect(gasFeeController.state).toMatchObject(
          mockDetermineGasFeeCalculations,
        );
      });

      it('should return the same data that it puts into state', async () => {
        await setupGasFeeController(getDefaultOptions());

        const estimateData = await gasFeeController.fetchGasFeeEstimates();

        expect(estimateData).toMatchObject(mockDetermineGasFeeCalculations);
      });

      it('should call determineGasFeeCalculations correctly when getChainId returns a number input', async () => {
        await setupGasFeeController({
          ...getDefaultOptions(),
          legacyAPIEndpoint: 'http://legacy.endpoint/<chain_id>',
          getChainId: jest.fn().mockReturnValue(1),
        });

        await gasFeeController._fetchGasFeeEstimateData();

        expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledWith(
          expect.objectContaining({
            fetchLegacyGasPriceEstimatesUrl: 'http://legacy.endpoint/1',
          }),
        );
      });

      it('should call determineGasFeeCalculations correctly when getChainId returns a hexstring input', async () => {
        await setupGasFeeController({
          ...getDefaultOptions(),
          legacyAPIEndpoint: 'http://legacy.endpoint/<chain_id>',
          getChainId: jest.fn().mockReturnValue('0x1'),
        });

        await gasFeeController.fetchGasFeeEstimates();

        expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledWith(
          expect.objectContaining({
            fetchLegacyGasPriceEstimatesUrl: 'http://legacy.endpoint/1',
          }),
        );
      });

      it('should call determineGasFeeCalculations correctly when nonRPCGasFeeApisDisabled is true', async () => {
        await setupGasFeeController({
          ...getDefaultOptions(),
          state: {
            ...buildMockGasFeeStateEthGasPrice(),
            nonRPCGasFeeApisDisabled: true,
          },
        });

        await gasFeeController.fetchGasFeeEstimates();

        expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledWith(
          expect.objectContaining({
            nonRPCGasFeeApisDisabled: true,
          }),
        );
      });

      it('should call determineGasFeeCalculations correctly when nonRPCGasFeeApisDisabled is false', async () => {
        await setupGasFeeController({
          ...getDefaultOptions(),
          state: {
            ...buildMockGasFeeStateEthGasPrice(),
            nonRPCGasFeeApisDisabled: false,
          },
        });

        await gasFeeController.fetchGasFeeEstimates();

        expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledWith(
          expect.objectContaining({
            nonRPCGasFeeApisDisabled: false,
          }),
        );
      });

      it('should call determineGasFeeCalculations correctly when getChainId returns a numeric string input', async () => {
        await setupGasFeeController({
          ...getDefaultOptions(),
          legacyAPIEndpoint: 'http://legacy.endpoint/<chain_id>',
          getChainId: jest.fn().mockReturnValue('1'),
        });

        await gasFeeController.fetchGasFeeEstimates();

        expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledWith(
          expect.objectContaining({
            fetchLegacyGasPriceEstimatesUrl: 'http://legacy.endpoint/1',
          }),
        );
      });
    });

    describe('when on any network supporting EIP-1559', () => {
      const getDefaultOptions = () => ({
        getIsEIP1559Compatible: jest.fn().mockResolvedValue(true),
      });
      const mockDetermineGasFeeCalculations = buildMockGasFeeStateFeeMarket();

      beforeEach(() => {
        mockedDetermineGasFeeCalculations.mockResolvedValue(
          mockDetermineGasFeeCalculations,
        );
      });

      it('should call determineGasFeeCalculations correctly', async () => {
        await setupGasFeeController({
          ...getDefaultOptions(),
          legacyAPIEndpoint: 'https://some-legacy-endpoint/<chain_id>',
          EIP1559APIEndpoint: 'https://some-eip-1559-endpoint/<chain_id>',
          networkControllerState: {
            networkConfigurationsByChainId: {
              [toHex(1337)]: buildCustomNetworkConfiguration({
                chainId: toHex(1337),
                rpcEndpoints: [
                  buildCustomRpcEndpoint({
                    networkClientId: 'AAAA-BBBB-CCCC-DDDD',
                  }),
                ],
              }),
            },
            selectedNetworkClientId: 'AAAA-BBBB-CCCC-DDDD',
          },
          clientId: '99999',
          // Currently initializing the provider overwrites the
          // `selectedNetworkClientId` we specify above based on whatever
          // `providerConfig` is. So we prevent the provider from being
          // initialized to make this test pass. Once `providerConfig` is
          // removed, then we don't need this anymore and
          // `selectedNetworkClientId` should no longer be overwritten.
          initializeNetworkProvider: false,
        });

        await gasFeeController.fetchGasFeeEstimates();

        expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledWith({
          isEIP1559Compatible: true,
          isLegacyGasAPICompatible: false,
          fetchGasEstimates,
          fetchGasEstimatesUrl: 'https://some-eip-1559-endpoint/1337',
          fetchLegacyGasPriceEstimates,
          fetchLegacyGasPriceEstimatesUrl: 'https://some-legacy-endpoint/1337',
          fetchEthGasPriceEstimate,
          calculateTimeEstimate,
          clientId: '99999',
          ethQuery: expect.any(EthQuery),
          nonRPCGasFeeApisDisabled: false,
        });
      });

      it('should update the state with a fetched set of estimates', async () => {
        await setupGasFeeController(getDefaultOptions());

        await gasFeeController.fetchGasFeeEstimates();

        expect(gasFeeController.state).toMatchObject(
          mockDetermineGasFeeCalculations,
        );
      });

      it('should return the same data that it puts into state', async () => {
        await setupGasFeeController(getDefaultOptions());

        const estimateData = await gasFeeController.fetchGasFeeEstimates();

        expect(estimateData).toMatchObject(mockDetermineGasFeeCalculations);
      });

      it('should call determineGasFeeCalculations with a URL that contains the chain ID', async () => {
        await setupGasFeeController({
          ...getDefaultOptions(),
          EIP1559APIEndpoint: 'http://eip-1559.endpoint/<chain_id>',
          getChainId: jest.fn().mockReturnValue('0x1'),
        });

        await gasFeeController.fetchGasFeeEstimates();

        expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledWith(
          expect.objectContaining({
            fetchGasEstimatesUrl: 'http://eip-1559.endpoint/1',
          }),
        );
      });
    });
    describe('when passed a networkClientId in options object', () => {
      const getDefaultOptions = () => ({
        getIsEIP1559Compatible: jest.fn().mockResolvedValue(true),
        networkControllerState: {
          networksMetadata: {
            'linea-sepolia': {
              EIPS: {
                1559: true,
              },
              status: NetworkStatus.Available,
            },
            sepolia: {
              EIPS: {
                1559: true,
              },
              status: NetworkStatus.Available,
            },
            'test-network-client-id': {
              EIPS: {
                1559: true,
              },
              status: NetworkStatus.Available,
            },
          },
        },
      });
      const mockDetermineGasFeeCalculations = buildMockGasFeeStateFeeMarket();

      beforeEach(() => {
        mockedDetermineGasFeeCalculations.mockResolvedValue(
          mockDetermineGasFeeCalculations,
        );
      });

      it('should call determineGasFeeCalculations correctly', async () => {
        await setupGasFeeController({
          ...getDefaultOptions(),
          legacyAPIEndpoint: 'https://some-legacy-endpoint/<chain_id>',
          EIP1559APIEndpoint: 'https://some-eip-1559-endpoint/<chain_id>',
          clientId: '99999',
        });

        await gasFeeController.fetchGasFeeEstimates({
          networkClientId: 'sepolia',
        });

        expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledWith({
          isEIP1559Compatible: true,
          isLegacyGasAPICompatible: false,
          fetchGasEstimates,
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          fetchGasEstimatesUrl: `https://some-eip-1559-endpoint/${convertHexToDecimal(
            ChainId.sepolia,
          )}`,
          fetchLegacyGasPriceEstimates,
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          fetchLegacyGasPriceEstimatesUrl: `https://some-legacy-endpoint/${convertHexToDecimal(
            ChainId.sepolia,
          )}`,
          fetchEthGasPriceEstimate,
          calculateTimeEstimate,
          clientId: '99999',
          ethQuery: expect.any(EthQuery),
          nonRPCGasFeeApisDisabled: false,
        });
      });

      describe("the chainId of the networkClientId matches the globally selected network's chainId", () => {
        it('should update the globally selected network state with a fetched set of estimates', async () => {
          await setupGasFeeController({
            ...getDefaultOptions(),
            getChainId: jest.fn().mockReturnValue(ChainId.sepolia),
            onNetworkDidChange: jest.fn(),
          });

          await gasFeeController.fetchGasFeeEstimates({
            networkClientId: 'sepolia',
          });

          expect(gasFeeController.state).toMatchObject(
            mockDetermineGasFeeCalculations,
          );
        });

        it('should update the gasFeeEstimatesByChainId state with a fetched set of estimates', async () => {
          await setupGasFeeController({
            ...getDefaultOptions(),
            getChainId: jest.fn().mockReturnValue(ChainId.sepolia),
            onNetworkDidChange: jest.fn(),
          });

          await gasFeeController.fetchGasFeeEstimates({
            networkClientId: 'sepolia',
          });

          expect(
            gasFeeController.state.gasFeeEstimatesByChainId?.[ChainId.sepolia],
          ).toMatchObject(mockDetermineGasFeeCalculations);
        });
      });

      describe("the chainId of the networkClientId does not match the globally selected network's chainId", () => {
        it('should not update the globally selected network state with a fetched set of estimates', async () => {
          await setupGasFeeController({
            ...getDefaultOptions(),
            getChainId: jest.fn().mockReturnValue(ChainId.mainnet),
            onNetworkDidChange: jest.fn(),
          });

          await gasFeeController.fetchGasFeeEstimates({
            networkClientId: 'sepolia',
          });

          expect(gasFeeController.state).toMatchObject({
            gasFeeEstimates: {},
            estimatedGasFeeTimeBounds: {},
            gasEstimateType: GAS_ESTIMATE_TYPES.NONE,
          });
        });

        it('should update the gasFeeEstimatesByChainId state with a fetched set of estimates', async () => {
          await setupGasFeeController({
            ...getDefaultOptions(),
            getChainId: jest.fn().mockReturnValue(ChainId.mainnet),
            onNetworkDidChange: jest.fn(),
          });

          await gasFeeController.fetchGasFeeEstimates({
            networkClientId: 'sepolia',
          });

          expect(
            gasFeeController.state.gasFeeEstimatesByChainId?.[ChainId.sepolia],
          ).toMatchObject(mockDetermineGasFeeCalculations);
        });
      });

      it('should return the same data that it puts into state', async () => {
        await setupGasFeeController(getDefaultOptions());

        const estimateData = await gasFeeController.fetchGasFeeEstimates({
          networkClientId: 'sepolia',
        });

        expect(estimateData).toMatchObject(mockDetermineGasFeeCalculations);
      });

      it('should call determineGasFeeCalculations with a URL that contains the chain ID', async () => {
        await setupGasFeeController({
          ...getDefaultOptions(),
          EIP1559APIEndpoint: 'http://eip-1559.endpoint/<chain_id>',
        });

        await gasFeeController.fetchGasFeeEstimates({
          networkClientId: 'sepolia',
        });

        expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledWith(
          expect.objectContaining({
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            fetchGasEstimatesUrl: `http://eip-1559.endpoint/${convertHexToDecimal(
              ChainId.sepolia,
            )}`,
          }),
        );
      });
    });
  });

  describe('polling (by networkClientId)', () => {
    it('should call determineGasFeeCalculations (via _executePoll) with a URL that contains the chainId corresponding to the networkClientId immedaitely and after each interval passed via the constructor', async () => {
      const pollingInterval = 10000;
      await setupGasFeeController({
        getIsEIP1559Compatible: jest.fn().mockResolvedValue(false),
        getCurrentNetworkLegacyGasAPICompatibility: jest
          .fn()
          .mockReturnValue(true),
        legacyAPIEndpoint: 'https://some-legacy-endpoint/<chain_id>',
        EIP1559APIEndpoint: 'https://some-eip-1559-endpoint/<chain_id>',
        networkControllerState: {
          networksMetadata: {
            'linea-sepolia': {
              EIPS: {
                1559: true,
              },
              status: NetworkStatus.Available,
            },
            sepolia: {
              EIPS: {
                1559: true,
              },
              status: NetworkStatus.Available,
            },
          },
        },
        clientId: '99999',
        interval: pollingInterval,
      });

      gasFeeController.startPolling({
        networkClientId: 'linea-sepolia',
      });
      await clock.tickAsync(0);
      expect(mockedDetermineGasFeeCalculations).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          fetchGasEstimatesUrl: `https://some-eip-1559-endpoint/${convertHexToDecimal(
            ChainId['linea-sepolia'],
          )}`,
        }),
      );
      await clock.tickAsync(pollingInterval / 2);
      expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledTimes(1);
      await clock.tickAsync(pollingInterval / 2);
      expect(mockedDetermineGasFeeCalculations).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          fetchGasEstimatesUrl: `https://some-eip-1559-endpoint/${convertHexToDecimal(
            ChainId['linea-sepolia'],
          )}`,
        }),
      );
      expect(
        gasFeeController.state.gasFeeEstimatesByChainId?.[
          ChainId['linea-sepolia']
        ],
      ).toStrictEqual(buildMockGasFeeStateFeeMarket());

      gasFeeController.startPolling({
        networkClientId: 'sepolia',
      });
      await clock.tickAsync(pollingInterval);
      expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledWith(
        expect.objectContaining({
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          fetchGasEstimatesUrl: `https://some-eip-1559-endpoint/${convertHexToDecimal(
            ChainId.sepolia,
          )}`,
        }),
      );
    });
  });
});
