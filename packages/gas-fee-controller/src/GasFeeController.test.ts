import { ControllerMessenger } from '@metamask/base-controller';
import {
  ChainId,
  convertHexToDecimal,
  NetworkType,
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
import * as sinon from 'sinon';

import determineGasFeeCalculations from './determineGasFeeCalculations';
import {
  fetchGasEstimates,
  fetchLegacyGasPriceEstimates,
  fetchEthGasPriceEstimate,
  calculateTimeEstimate,
} from './gas-util';
import {
  GAS_API_BASE_URL,
  GAS_ESTIMATE_TYPES,
  GasFeeController,
} from './GasFeeController';
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

type MainControllerMessenger = ControllerMessenger<
  | GetGasFeeState
  | NetworkControllerGetStateAction
  | NetworkControllerGetNetworkClientByIdAction
  | NetworkControllerGetEIP1559CompatibilityAction,
  GasFeeStateChange | NetworkControllerNetworkDidChangeEvent
>;

const getControllerMessenger = (): MainControllerMessenger => {
  return new ControllerMessenger();
};

const setupNetworkController = async ({
  unrestrictedMessenger,
  state,
  clock,
}: {
  unrestrictedMessenger: MainControllerMessenger;
  state: Partial<NetworkState>;
  clock: sinon.SinonFakeTimers;
}) => {
  const restrictedMessenger = unrestrictedMessenger.getRestricted({
    name: 'NetworkController',
    allowedActions: [],
    allowedEvents: [],
  });

  const networkController = new NetworkController({
    messenger: restrictedMessenger,
    state,
    infuraProjectId: '123',
    trackMetaMetricsEvent: jest.fn(),
  });
  // Call this without awaiting to simulate what the extension or mobile app
  // might do
  networkController.initializeProvider();
  // Ensure that the request for eth_getBlockByNumber made by the PollingBlockTracker
  // inside the NetworkController goes through
  await clock.nextAsync();

  return networkController;
};

const getRestrictedMessenger = (
  controllerMessenger: MainControllerMessenger,
) => {
  const messenger = controllerMessenger.getRestricted({
    name,
    allowedActions: [
      'NetworkController:getState',
      'NetworkController:getNetworkClientById',
      'NetworkController:getEIP1559Compatibility',
    ],
    allowedEvents: ['NetworkController:networkDidChange'],
  });

  return messenger;
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
   * @param options.clientId - Sets clientId on the GasFeeController.
   * @param options.networkControllerState - State object to initialize
   * NetworkController with.
   * @param options.interval - The polling interval.
   * @param options.state - The initial GasFeeController state
   * @param options.infuraAPIKey - The Infura API key.
   */
  async function setupGasFeeController({
    getIsEIP1559Compatible = jest.fn().mockResolvedValue(true),
    getCurrentNetworkLegacyGasAPICompatibility = jest
      .fn()
      .mockReturnValue(false),
    infuraAPIKey = 'INFURA_API_KEY',
    clientId,
    getChainId,
    onNetworkDidChange,
    networkControllerState = {},
    state,
    interval,
  }: {
    getChainId?: jest.Mock<Hex>;
    onNetworkDidChange?: jest.Mock<void>;
    getIsEIP1559Compatible?: jest.Mock<Promise<boolean>>;
    getCurrentNetworkLegacyGasAPICompatibility?: jest.Mock<boolean>;
    clientId?: string;
    networkControllerState?: Partial<NetworkState>;
    state?: GasFeeState;
    interval?: number;
    infuraAPIKey?: string;
  } = {}) {
    const controllerMessenger = getControllerMessenger();
    networkController = await setupNetworkController({
      unrestrictedMessenger: controllerMessenger,
      state: networkControllerState,
      clock,
    });
    const messenger = getRestrictedMessenger(controllerMessenger);
    gasFeeController = new GasFeeController({
      getProvider: jest.fn(),
      getChainId,
      onNetworkDidChange,
      messenger,
      getCurrentNetworkLegacyGasAPICompatibility,
      getCurrentNetworkEIP1559Compatibility: getIsEIP1559Compatible, // change this for networkDetails.state.networkDetails.isEIP1559Compatible ???
      state,
      clientId,
      interval,
      infuraAPIKey,
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
    blockTracker?.destroy();
    sinon.restore();
    jest.clearAllMocks();
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
            networkControllerState: {
              providerConfig: {
                type: NetworkType.rpc,
                chainId: toHex(1337),
                rpcUrl: 'http://some/url',
                ticker: 'TEST',
              },
            },
            clientId: '99999',
          });

          await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);

          expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledWith({
            isEIP1559Compatible: false,
            isLegacyGasAPICompatible: true,
            fetchGasEstimates,
            fetchGasEstimatesUrl: `${GAS_API_BASE_URL}/networks/1337/suggestedGasFees`,
            fetchLegacyGasPriceEstimates,
            fetchLegacyGasPriceEstimatesUrl: `${GAS_API_BASE_URL}/networks/1337/gasPrices`,
            fetchEthGasPriceEstimate,
            calculateTimeEstimate,
            clientId: '99999',
            ethQuery: expect.any(EthQuery),
            infuraAPIKey: expect.any(String),
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
            networkControllerState: {
              providerConfig: {
                type: NetworkType.rpc,
                chainId: toHex(1337),
                rpcUrl: 'http://some/url',
                ticker: 'TEST',
              },
            },
            clientId: '99999',
          });

          await gasFeeController.getGasFeeEstimatesAndStartPolling(
            'some-previously-unseen-token',
          );

          expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledWith({
            isEIP1559Compatible: false,
            isLegacyGasAPICompatible: true,
            fetchGasEstimates,
            fetchGasEstimatesUrl: `${GAS_API_BASE_URL}/networks/1337/suggestedGasFees`,
            fetchLegacyGasPriceEstimates,
            fetchLegacyGasPriceEstimatesUrl: `${GAS_API_BASE_URL}/networks/1337/gasPrices`,
            fetchEthGasPriceEstimate,
            calculateTimeEstimate,
            clientId: '99999',
            ethQuery: expect.any(EthQuery),
            infuraAPIKey: expect.any(String),
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
      const defaultConstructorOptions = {
        getIsEIP1559Compatible: jest.fn().mockResolvedValue(false),
        getCurrentNetworkLegacyGasAPICompatibility: jest
          .fn()
          .mockReturnValue(true),
      };
      const mockDetermineGasFeeCalculations = buildMockGasFeeStateLegacy();

      beforeEach(() => {
        mockedDetermineGasFeeCalculations.mockResolvedValue(
          mockDetermineGasFeeCalculations,
        );
      });

      it('should call determineGasFeeCalculations correctly', async () => {
        await setupGasFeeController({
          ...defaultConstructorOptions,
          networkControllerState: {
            providerConfig: {
              type: NetworkType.rpc,
              chainId: toHex(1337),
              rpcUrl: 'http://some/url',
              ticker: 'TEST',
            },
          },
          clientId: '99999',
        });

        await gasFeeController.fetchGasFeeEstimates();

        expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledWith({
          isEIP1559Compatible: false,
          isLegacyGasAPICompatible: true,
          fetchGasEstimates,
          fetchGasEstimatesUrl: `${GAS_API_BASE_URL}/networks/1337/suggestedGasFees`,
          fetchLegacyGasPriceEstimates,
          fetchLegacyGasPriceEstimatesUrl: `${GAS_API_BASE_URL}/networks/1337/gasPrices`,
          fetchEthGasPriceEstimate,
          calculateTimeEstimate,
          clientId: '99999',
          ethQuery: expect.any(EthQuery),
          infuraAPIKey: expect.any(String),
          nonRPCGasFeeApisDisabled: false,
        });
      });

      it('should update the state with a fetched set of estimates', async () => {
        await setupGasFeeController(defaultConstructorOptions);

        await gasFeeController.fetchGasFeeEstimates();

        expect(gasFeeController.state).toMatchObject(
          mockDetermineGasFeeCalculations,
        );
      });

      it('should return the same data that it puts into state', async () => {
        await setupGasFeeController(defaultConstructorOptions);

        const estimateData = await gasFeeController.fetchGasFeeEstimates();

        expect(estimateData).toMatchObject(mockDetermineGasFeeCalculations);
      });

      it('should call determineGasFeeCalculations correctly when getChainId returns a number input', async () => {
        await setupGasFeeController({
          ...defaultConstructorOptions,
          getChainId: jest.fn().mockReturnValue(1),
        });

        await gasFeeController._fetchGasFeeEstimateData();

        expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledWith(
          expect.objectContaining({
            fetchLegacyGasPriceEstimatesUrl: `${GAS_API_BASE_URL}/networks/1/gasPrices`,
          }),
        );
      });

      it('should call determineGasFeeCalculations correctly when getChainId returns a hexstring input', async () => {
        await setupGasFeeController({
          ...defaultConstructorOptions,
          getChainId: jest.fn().mockReturnValue('0x1'),
        });

        await gasFeeController.fetchGasFeeEstimates();

        expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledWith(
          expect.objectContaining({
            fetchLegacyGasPriceEstimatesUrl: `${GAS_API_BASE_URL}/networks/1/gasPrices`,
          }),
        );
      });

      it('should call determineGasFeeCalculations correctly when nonRPCGasFeeApisDisabled is true', async () => {
        await setupGasFeeController({
          ...defaultConstructorOptions,
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
          ...defaultConstructorOptions,
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
          ...defaultConstructorOptions,
          getChainId: jest.fn().mockReturnValue('1'),
        });

        await gasFeeController.fetchGasFeeEstimates();

        expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledWith(
          expect.objectContaining({
            fetchLegacyGasPriceEstimatesUrl: `${GAS_API_BASE_URL}/networks/1/gasPrices`,
          }),
        );
      });
    });

    describe('when on any network supporting EIP-1559', () => {
      const defaultConstructorOptions = {
        getIsEIP1559Compatible: jest.fn().mockResolvedValue(true),
      };
      const mockDetermineGasFeeCalculations = buildMockGasFeeStateFeeMarket();

      beforeEach(() => {
        mockedDetermineGasFeeCalculations.mockResolvedValue(
          mockDetermineGasFeeCalculations,
        );
      });

      it('should call determineGasFeeCalculations correctly', async () => {
        await setupGasFeeController({
          ...defaultConstructorOptions,
          networkControllerState: {
            providerConfig: {
              type: NetworkType.rpc,
              chainId: toHex(1337),
              rpcUrl: 'http://some/url',
              ticker: 'TEST',
            },
          },
          clientId: '99999',
        });

        await gasFeeController.fetchGasFeeEstimates();

        expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledWith({
          isEIP1559Compatible: true,
          isLegacyGasAPICompatible: false,
          fetchGasEstimates,
          fetchGasEstimatesUrl: `${GAS_API_BASE_URL}/networks/1337/suggestedGasFees`,
          fetchLegacyGasPriceEstimates,
          fetchLegacyGasPriceEstimatesUrl: `${GAS_API_BASE_URL}/networks/1337/gasPrices`,
          fetchEthGasPriceEstimate,
          calculateTimeEstimate,
          clientId: '99999',
          ethQuery: expect.any(EthQuery),
          infuraAPIKey: expect.any(String),
          nonRPCGasFeeApisDisabled: false,
        });
      });

      it('should update the state with a fetched set of estimates', async () => {
        await setupGasFeeController(defaultConstructorOptions);

        await gasFeeController.fetchGasFeeEstimates();

        expect(gasFeeController.state).toMatchObject(
          mockDetermineGasFeeCalculations,
        );
      });

      it('should return the same data that it puts into state', async () => {
        await setupGasFeeController(defaultConstructorOptions);

        const estimateData = await gasFeeController.fetchGasFeeEstimates();

        expect(estimateData).toMatchObject(mockDetermineGasFeeCalculations);
      });

      it('should call determineGasFeeCalculations with a URL that contains the chain ID', async () => {
        await setupGasFeeController({
          ...defaultConstructorOptions,
          getChainId: jest.fn().mockReturnValue('0x1'),
        });

        await gasFeeController.fetchGasFeeEstimates();

        expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledWith(
          expect.objectContaining({
            fetchGasEstimatesUrl: `${GAS_API_BASE_URL}/networks/1/suggestedGasFees`,
          }),
        );
      });
    });
    describe('when passed a networkClientId in options object', () => {
      const defaultConstructorOptions = {
        getIsEIP1559Compatible: jest.fn().mockResolvedValue(true),
        networkControllerState: {
          networksMetadata: {
            goerli: {
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
      };
      const mockDetermineGasFeeCalculations = buildMockGasFeeStateFeeMarket();

      beforeEach(() => {
        mockedDetermineGasFeeCalculations.mockResolvedValue(
          mockDetermineGasFeeCalculations,
        );
      });

      it('should call determineGasFeeCalculations correctly', async () => {
        await setupGasFeeController({
          ...defaultConstructorOptions,
          clientId: '99999',
        });

        await gasFeeController.fetchGasFeeEstimates({
          networkClientId: 'goerli',
        });

        expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledWith({
          isEIP1559Compatible: true,
          isLegacyGasAPICompatible: false,
          fetchGasEstimates,
          fetchGasEstimatesUrl: `${GAS_API_BASE_URL}/networks/${convertHexToDecimal(
            ChainId.goerli,
          )}/suggestedGasFees`,
          fetchLegacyGasPriceEstimates,
          fetchLegacyGasPriceEstimatesUrl: `${GAS_API_BASE_URL}/networks/${convertHexToDecimal(
            ChainId.goerli,
          )}/gasPrices`,
          fetchEthGasPriceEstimate,
          calculateTimeEstimate,
          clientId: '99999',
          ethQuery: expect.any(EthQuery),
          infuraAPIKey: expect.any(String),
          nonRPCGasFeeApisDisabled: false,
        });
      });

      describe("the chainId of the networkClientId matches the globally selected network's chainId", () => {
        it('should update the globally selected network state with a fetched set of estimates', async () => {
          await setupGasFeeController({
            ...defaultConstructorOptions,
            getChainId: jest.fn().mockReturnValue(ChainId.goerli),
            onNetworkDidChange: jest.fn(),
          });

          await gasFeeController.fetchGasFeeEstimates({
            networkClientId: 'goerli',
          });

          expect(gasFeeController.state).toMatchObject(
            mockDetermineGasFeeCalculations,
          );
        });

        it('should update the gasFeeEstimatesByChainId state with a fetched set of estimates', async () => {
          await setupGasFeeController({
            ...defaultConstructorOptions,
            getChainId: jest.fn().mockReturnValue(ChainId.goerli),
            onNetworkDidChange: jest.fn(),
          });

          await gasFeeController.fetchGasFeeEstimates({
            networkClientId: 'goerli',
          });

          expect(
            gasFeeController.state.gasFeeEstimatesByChainId?.[ChainId.goerli],
          ).toMatchObject(mockDetermineGasFeeCalculations);
        });
      });

      describe("the chainId of the networkClientId does not match the globally selected network's chainId", () => {
        it('should not update the globally selected network state with a fetched set of estimates', async () => {
          await setupGasFeeController({
            ...defaultConstructorOptions,
            getChainId: jest.fn().mockReturnValue(ChainId.mainnet),
            onNetworkDidChange: jest.fn(),
          });

          await gasFeeController.fetchGasFeeEstimates({
            networkClientId: 'goerli',
          });

          expect(gasFeeController.state).toMatchObject({
            gasFeeEstimates: {},
            estimatedGasFeeTimeBounds: {},
            gasEstimateType: GAS_ESTIMATE_TYPES.NONE,
          });
        });

        it('should update the gasFeeEstimatesByChainId state with a fetched set of estimates', async () => {
          await setupGasFeeController({
            ...defaultConstructorOptions,
            getChainId: jest.fn().mockReturnValue(ChainId.mainnet),
            onNetworkDidChange: jest.fn(),
          });

          await gasFeeController.fetchGasFeeEstimates({
            networkClientId: 'goerli',
          });

          expect(
            gasFeeController.state.gasFeeEstimatesByChainId?.[ChainId.goerli],
          ).toMatchObject(mockDetermineGasFeeCalculations);
        });
      });

      it('should return the same data that it puts into state', async () => {
        await setupGasFeeController(defaultConstructorOptions);

        const estimateData = await gasFeeController.fetchGasFeeEstimates({
          networkClientId: 'sepolia',
        });

        expect(estimateData).toMatchObject(mockDetermineGasFeeCalculations);
      });

      it('should call determineGasFeeCalculations with a URL that contains the chain ID', async () => {
        await setupGasFeeController({
          ...defaultConstructorOptions,
        });

        await gasFeeController.fetchGasFeeEstimates({
          networkClientId: 'sepolia',
        });

        expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledWith(
          expect.objectContaining({
            fetchGasEstimatesUrl: `${GAS_API_BASE_URL}/networks/${convertHexToDecimal(
              ChainId.sepolia,
            )}/suggestedGasFees`,
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
        networkControllerState: {
          networksMetadata: {
            goerli: {
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

      gasFeeController.startPollingByNetworkClientId('goerli');
      await clock.tickAsync(0);
      expect(mockedDetermineGasFeeCalculations).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          fetchGasEstimatesUrl: `${GAS_API_BASE_URL}/networks/${convertHexToDecimal(
            ChainId.goerli,
          )}/suggestedGasFees`,
        }),
      );
      await clock.tickAsync(pollingInterval / 2);
      expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledTimes(1);
      await clock.tickAsync(pollingInterval / 2);
      expect(mockedDetermineGasFeeCalculations).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          fetchGasEstimatesUrl: `${GAS_API_BASE_URL}/networks/${convertHexToDecimal(
            ChainId.goerli,
          )}/suggestedGasFees`,
        }),
      );
      expect(
        gasFeeController.state.gasFeeEstimatesByChainId?.['0x5'],
      ).toStrictEqual(buildMockGasFeeStateFeeMarket());

      gasFeeController.startPollingByNetworkClientId('sepolia');
      await clock.tickAsync(pollingInterval);
      expect(mockedDetermineGasFeeCalculations).toHaveBeenCalledWith(
        expect.objectContaining({
          fetchGasEstimatesUrl: `${GAS_API_BASE_URL}/networks/${convertHexToDecimal(
            ChainId.sepolia,
          )}/suggestedGasFees`,
        }),
      );
    });
  });
});
