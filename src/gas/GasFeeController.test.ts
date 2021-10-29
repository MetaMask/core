import { useFakeTimers, SinonFakeTimers } from 'sinon';
import { mocked } from 'ts-jest/utils';
import { ControllerMessenger } from '../ControllerMessenger';
import {
  ChainId,
  GAS_ESTIMATE_TYPES,
  GasFeeController,
  GasFeeSuggestions,
  GasFeeStateChange,
  GasFeeStateFeeMarket,
  GasFeeStateLegacy,
  GetGasFeeState,
} from './GasFeeController';
import determineGasFeeSuggestions from './determineGasFeeSuggestions';
import determineNetworkStatusInfo, {
  NetworkStatusInfo,
} from './determineNetworkStatusInfo';

jest.mock('./gas-util');
jest.mock('./determineGasFeeSuggestions');
jest.mock('./determineNetworkStatusInfo');

const mockedDetermineGasFeeSuggestions = mocked(
  determineGasFeeSuggestions,
  true,
);
const mockedDetermineNetworkStatusInfo = mocked(
  determineNetworkStatusInfo,
  true,
);

const name = 'GasFeeController';

/**
 * Constructs a restricted controller messenger.
 *
 * @returns A restricted controller messenger.
 */
function getRestrictedMessenger() {
  const controllerMessenger = new ControllerMessenger<
    GetGasFeeState,
    GasFeeStateChange
  >();
  const messenger = controllerMessenger.getRestricted<
    typeof name,
    never,
    never
  >({
    name,
  });
  return messenger;
}

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
 * Builds mock network status info. This data is merely intended to fit the NetworkStatusInfo type
 * and does not represent any real-world scenario.
 *
 * @param args - The arguments.
 * @param args.modifier - A number you can use to build a unique return value in the event that you
 * need to build multiple return values. All data points will be multiplied by this number.
 * @returns The mock data.
 */
function buildMockNetworkStatusInfo({ modifier = 1 } = {}): NetworkStatusInfo {
  return {
    isNetworkBusy: modifier % 2 === 0,
  };
}

describe('GasFeeController', () => {
  let clock: SinonFakeTimers;
  let gasFeeController: GasFeeController;

  /**
   * Builds an instance of GasFeeController for use in testing, and then makes it available in
   * tests along with mocks for fetch* functions passed to GasFeeController.
   *
   * @param options - The options.
   * @param options.getChainId - Sets getChainId on the GasFeeController.
   * @param options.getIsEIP1559Compatible - Sets getCurrentNetworkEIP1559Compatibility on the
   * GasFeeController.
   * @param options.getCurrentNetworkLegacyGasAPICompatibility - Sets
   * getCurrentNetworkLegacyGasAPICompatibility on the GasFeeController.
   * @param options.legacyAPIEndpoint - Sets legacyAPIEndpoint on the GasFeeController.
   * @param options.EIP1559APIEndpoint - Sets EIP1559APIEndpoint on the GasFeeController.
   * @param options.determineNetworkStatusInfoUrlTemplate - Sets
   * determineNetworkStatusInfoUrlTemplate on the GasFeeController.
   * @param options.clientId - Sets clientId on the GasFeeController.
   */
  function setupGasFeeController({
    getChainId = jest.fn().mockReturnValue('0x1'),
    getIsEIP1559Compatible = jest.fn().mockResolvedValue(true),
    getCurrentNetworkLegacyGasAPICompatibility = jest
      .fn()
      .mockReturnValue(false),
    legacyAPIEndpoint = 'http://legacy.endpoint/<chain_id>',
    EIP1559APIEndpoint = 'http://eip-1559.endpoint/<chain_id>',
    determineNetworkStatusInfoUrlTemplate = ({ chainId }) =>
      `http://network-status-info.endpoint/${chainId}`,
    clientId,
  }: {
    getChainId?: jest.Mock<`0x${string}` | `${number}` | number>;
    getIsEIP1559Compatible?: jest.Mock<Promise<boolean>>;
    getCurrentNetworkLegacyGasAPICompatibility?: jest.Mock<boolean>;
    legacyAPIEndpoint?: string;
    EIP1559APIEndpoint?: string;
    determineNetworkStatusInfoUrlTemplate?: ({
      chainId,
    }: {
      chainId: ChainId;
    }) => string;
    clientId?: string;
  } = {}) {
    gasFeeController = new GasFeeController({
      messenger: getRestrictedMessenger(),
      getProvider: jest.fn(),
      getChainId,
      onNetworkStateChange: jest.fn(),
      getCurrentNetworkLegacyGasAPICompatibility,
      getCurrentNetworkEIP1559Compatibility: getIsEIP1559Compatible, // change this for networkController.state.properties.isEIP1559Compatible ???
      legacyAPIEndpoint,
      EIP1559APIEndpoint,
      determineNetworkStatusInfoUrlTemplate,
      clientId,
    });
  }

  beforeEach(() => {
    clock = useFakeTimers();
    mockedDetermineGasFeeSuggestions.mockResolvedValue(
      buildMockGasFeeStateFeeMarket(),
    );

    mockedDetermineNetworkStatusInfo.mockResolvedValue(
      buildMockNetworkStatusInfo(),
    );
  });

  afterEach(() => {
    clock.uninstall();
    gasFeeController.destroy();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    beforeEach(() => {
      setupGasFeeController();
    });

    it('should set the name of the controller to GasFeeController', () => {
      expect(gasFeeController.name).toBe(name);
    });
  });

  describe('getGasFeeEstimatesAndStartPolling', () => {
    describe('if never called before', () => {
      describe('and called with undefined', () => {
        const mockDetermineGasFeeSuggestionsReturnValues: GasFeeSuggestions[] = [
          buildMockGasFeeStateFeeMarket({ modifier: 1 }),
          buildMockGasFeeStateFeeMarket({ modifier: 2 }),
        ];
        const mockDetermineNetworkStatusInfoReturnValues: NetworkStatusInfo[] = [
          buildMockNetworkStatusInfo({ modifier: 1 }),
          buildMockNetworkStatusInfo({ modifier: 2 }),
        ];

        beforeEach(() => {
          mockedDetermineGasFeeSuggestions.mockReset();
          mockedDetermineNetworkStatusInfo.mockReset();

          mockDetermineGasFeeSuggestionsReturnValues.forEach((returnValue) => {
            mockedDetermineGasFeeSuggestions.mockImplementationOnce(() => {
              return Promise.resolve(returnValue);
            });
          });

          mockDetermineNetworkStatusInfoReturnValues.forEach((returnValue) => {
            mockedDetermineNetworkStatusInfo.mockImplementationOnce(() => {
              return Promise.resolve(returnValue);
            });
          });
        });

        it('should update the state with fetched gas fee estimates and network status info', async () => {
          await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);

          expect(gasFeeController.state).toMatchObject({
            ...mockDetermineGasFeeSuggestionsReturnValues[0],
            ...mockDetermineNetworkStatusInfoReturnValues[0],
          });
        });

        it('should continue updating the state with newly fetched data on a set interval', async () => {
          await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);
          await clock.nextAsync();

          expect(gasFeeController.state).toMatchObject({
            ...mockDetermineGasFeeSuggestionsReturnValues[1],
            ...mockDetermineNetworkStatusInfoReturnValues[1],
          });
        });
      });

      describe('and called with a previously unseen token', () => {
        it('should call determineGasFeeSuggestions and determineNetworkStatusInfo', async () => {
          setupGasFeeController();

          await gasFeeController.getGasFeeEstimatesAndStartPolling(
            'some-previously-unseen-token',
          );

          expect(mockedDetermineGasFeeSuggestions).toHaveBeenCalledTimes(1);
          expect(mockedDetermineNetworkStatusInfo).toHaveBeenCalledTimes(1);
        });

        it('should make further calls to determineGasFeeSuggestions and determineNetworkStatusInfo on a set interval', async () => {
          setupGasFeeController();

          await gasFeeController.getGasFeeEstimatesAndStartPolling(
            'some-previously-unseen-token',
          );
          await clock.nextAsync();

          expect(mockedDetermineGasFeeSuggestions).toHaveBeenCalledTimes(2);
          expect(mockedDetermineNetworkStatusInfo).toHaveBeenCalledTimes(2);
        });
      });
    });

    describe('if called twice with undefined', () => {
      it('should not call determineGasFeeSuggestions or determineNetworkStatusInfo again', async () => {
        setupGasFeeController();

        await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);
        await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);

        expect(mockedDetermineGasFeeSuggestions).toHaveBeenCalledTimes(1);
        expect(mockedDetermineNetworkStatusInfo).toHaveBeenCalledTimes(1);
      });

      it('should not make more than one call to determineGasFeeSuggestions and determineNetworkStatusInfo per set interval', async () => {
        setupGasFeeController();

        await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);
        await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);
        await clock.nextAsync();
        await clock.nextAsync();

        expect(mockedDetermineGasFeeSuggestions).toHaveBeenCalledTimes(3);
        expect(mockedDetermineNetworkStatusInfo).toHaveBeenCalledTimes(3);
      });
    });

    describe('if called once with undefined and again with the same token', () => {
      it('should call determineGasFeeSuggestions and determineNetworkStatusInfo again', async () => {
        setupGasFeeController();

        const pollToken = await gasFeeController.getGasFeeEstimatesAndStartPolling(
          undefined,
        );
        await gasFeeController.getGasFeeEstimatesAndStartPolling(pollToken);

        expect(mockedDetermineGasFeeSuggestions).toHaveBeenCalledTimes(2);
        expect(mockedDetermineNetworkStatusInfo).toHaveBeenCalledTimes(2);
      });

      it('should not make more than one call to determineGasFeeSuggestions and determineNetworkStatusInfo per set interval', async () => {
        setupGasFeeController();

        const pollToken = await gasFeeController.getGasFeeEstimatesAndStartPolling(
          undefined,
        );
        await gasFeeController.getGasFeeEstimatesAndStartPolling(pollToken);
        await clock.nextAsync();
        await clock.nextAsync();

        expect(mockedDetermineGasFeeSuggestions).toHaveBeenCalledTimes(4);
        expect(mockedDetermineNetworkStatusInfo).toHaveBeenCalledTimes(4);
      });
    });

    describe('if called twice, both with previously unseen tokens', () => {
      it('should not call determineGasFeeSuggestions or determineNetworkStatusInfo again', async () => {
        setupGasFeeController();

        await gasFeeController.getGasFeeEstimatesAndStartPolling(
          'some-previously-unseen-token-1',
        );

        await gasFeeController.getGasFeeEstimatesAndStartPolling(
          'some-previously-unseen-token-2',
        );

        expect(mockedDetermineGasFeeSuggestions).toHaveBeenCalledTimes(1);
        expect(mockedDetermineNetworkStatusInfo).toHaveBeenCalledTimes(1);
      });

      it('should not make more than one call to determineGasFeeSuggestions and determineNetworkStatusInfo per set interval', async () => {
        setupGasFeeController();

        await gasFeeController.getGasFeeEstimatesAndStartPolling(
          'some-previously-unseen-token-1',
        );

        await gasFeeController.getGasFeeEstimatesAndStartPolling(
          'some-previously-unseen-token-2',
        );
        await clock.nextAsync();
        await clock.nextAsync();

        expect(mockedDetermineGasFeeSuggestions).toHaveBeenCalledTimes(3);
        expect(mockedDetermineNetworkStatusInfo).toHaveBeenCalledTimes(3);
      });
    });
  });

  describe('disconnectPoller', () => {
    describe('assuming that getGasFeeEstimatesAndStartPolling was already called exactly once', () => {
      describe('given the same token as the result of the first call', () => {
        it('should prevent calls to determineGasFeeSuggestions from being made periodically', async () => {
          setupGasFeeController();
          const pollToken = await gasFeeController.getGasFeeEstimatesAndStartPolling(
            undefined,
          );
          await clock.nextAsync();
          expect(mockedDetermineGasFeeSuggestions).toHaveBeenCalledTimes(2);

          gasFeeController.disconnectPoller(pollToken);

          await clock.nextAsync();
          expect(mockedDetermineGasFeeSuggestions).toHaveBeenCalledTimes(2);
        });

        it('should make it so that a second call to getGasFeeEstimatesAndStartPolling with the same token has the same effect as the inaugural call', async () => {
          setupGasFeeController();
          const pollToken = await gasFeeController.getGasFeeEstimatesAndStartPolling(
            undefined,
          );
          await clock.nextAsync();
          expect(mockedDetermineGasFeeSuggestions).toHaveBeenCalledTimes(2);

          gasFeeController.disconnectPoller(pollToken);

          await gasFeeController.getGasFeeEstimatesAndStartPolling(pollToken);
          await clock.nextAsync();
          expect(mockedDetermineGasFeeSuggestions).toHaveBeenCalledTimes(4);
        });
      });

      describe('given a previously unseen token', () => {
        it('should not prevent calls to determineGasFeeSuggestions from being made periodically', async () => {
          setupGasFeeController();
          await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);
          await clock.nextAsync();
          expect(mockedDetermineGasFeeSuggestions).toHaveBeenCalledTimes(2);

          gasFeeController.disconnectPoller('some-previously-unseen-token');

          await clock.nextAsync();
          expect(mockedDetermineGasFeeSuggestions).toHaveBeenCalledTimes(3);
        });
      });
    });

    describe('if getGasFeeEstimatesAndStartPolling was called twice with different tokens', () => {
      it('should not prevent calls to determineGasFeeSuggestions from being made periodically', async () => {
        setupGasFeeController();
        const pollToken1 = await gasFeeController.getGasFeeEstimatesAndStartPolling(
          undefined,
        );
        await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);
        await clock.nextAsync();
        expect(mockedDetermineGasFeeSuggestions).toHaveBeenCalledTimes(2);

        gasFeeController.disconnectPoller(pollToken1);

        await clock.nextAsync();
        expect(mockedDetermineGasFeeSuggestions).toHaveBeenCalledTimes(3);
      });
    });

    describe('if getGasFeeEstimatesAndStartPolling was never called', () => {
      it('should not throw an error', () => {
        setupGasFeeController();
        expect(() =>
          gasFeeController.disconnectPoller('some-token'),
        ).not.toThrow();
      });
    });
  });

  describe('stopPolling', () => {
    describe('assuming that getGasFeeEstimatesAndStartPolling was already called exactly once', () => {
      it('should prevent calls to determineGasFeeSuggestions and determineNetworkStatusInfo from being made periodically', async () => {
        setupGasFeeController();
        await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);
        await clock.nextAsync();
        expect(mockedDetermineGasFeeSuggestions).toHaveBeenCalledTimes(2);

        gasFeeController.stopPolling();

        await clock.nextAsync();
        expect(mockedDetermineGasFeeSuggestions).toHaveBeenCalledTimes(2);
        expect(mockedDetermineNetworkStatusInfo).toHaveBeenCalledTimes(2);
      });

      it('should make it so that a second call to getGasFeeEstimatesAndStartPolling with the same token has the same effect as the inaugural call', async () => {
        setupGasFeeController();
        const pollToken = await gasFeeController.getGasFeeEstimatesAndStartPolling(
          undefined,
        );
        await clock.nextAsync();
        expect(mockedDetermineGasFeeSuggestions).toHaveBeenCalledTimes(2);
        expect(mockedDetermineNetworkStatusInfo).toHaveBeenCalledTimes(2);

        gasFeeController.stopPolling();

        await gasFeeController.getGasFeeEstimatesAndStartPolling(pollToken);
        await clock.nextAsync();
        expect(mockedDetermineGasFeeSuggestions).toHaveBeenCalledTimes(4);
        expect(mockedDetermineNetworkStatusInfo).toHaveBeenCalledTimes(4);
      });

      it('should revert the state back to its original form', async () => {
        setupGasFeeController();
        await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);

        gasFeeController.stopPolling();

        expect(gasFeeController.state).toMatchObject({
          gasFeeEstimates: {},
          estimatedGasFeeTimeBounds: {},
          gasEstimateType: 'none',
          isNetworkBusy: false,
        });
      });
    });

    describe('if getGasFeeEstimatesAndStartPolling was called multiple times with the same token (thereby restarting the polling once)', () => {
      it('should prevent calls to determineGasFeeSuggestions or determineNetworkStatusInfo from being made periodically', async () => {
        setupGasFeeController();
        const pollToken = await gasFeeController.getGasFeeEstimatesAndStartPolling(
          undefined,
        );
        await gasFeeController.getGasFeeEstimatesAndStartPolling(pollToken);
        await clock.nextAsync();
        expect(mockedDetermineGasFeeSuggestions).toHaveBeenCalledTimes(3);
        expect(mockedDetermineNetworkStatusInfo).toHaveBeenCalledTimes(3);

        gasFeeController.stopPolling();

        await clock.nextAsync();
        expect(mockedDetermineGasFeeSuggestions).toHaveBeenCalledTimes(3);
        expect(mockedDetermineNetworkStatusInfo).toHaveBeenCalledTimes(3);
      });

      it('should make it so that another call to getGasFeeEstimatesAndStartPolling with a previously generated token has the same effect as the inaugural call', async () => {
        setupGasFeeController();
        const pollToken = await gasFeeController.getGasFeeEstimatesAndStartPolling(
          undefined,
        );
        await gasFeeController.getGasFeeEstimatesAndStartPolling(pollToken);
        await clock.nextAsync();
        expect(mockedDetermineGasFeeSuggestions).toHaveBeenCalledTimes(3);
        expect(mockedDetermineNetworkStatusInfo).toHaveBeenCalledTimes(3);

        gasFeeController.stopPolling();

        await gasFeeController.getGasFeeEstimatesAndStartPolling(pollToken);
        await clock.nextAsync();
        expect(mockedDetermineGasFeeSuggestions).toHaveBeenCalledTimes(5);
        expect(mockedDetermineNetworkStatusInfo).toHaveBeenCalledTimes(5);
      });
    });

    describe('if getGasFeeEstimatesAndStartPolling was never called', () => {
      it('should not throw an error', () => {
        setupGasFeeController();
        expect(() => gasFeeController.stopPolling()).not.toThrow();
      });
    });
  });

  describe('_fetchGasFeeEstimateData', () => {
    describe('when on any network supporting legacy gas estimation api', () => {
      const defaultConstructorOptions = {
        getIsEIP1559Compatible: jest.fn().mockResolvedValue(false),
        getCurrentNetworkLegacyGasAPICompatibility: jest
          .fn()
          .mockReturnValue(true),
      };
      const mockDetermineGasFeeSuggestions = buildMockGasFeeStateLegacy();

      beforeEach(() => {
        mockedDetermineGasFeeSuggestions.mockResolvedValue(
          mockDetermineGasFeeSuggestions,
        );
      });

      it('should update the state with a fetched set of estimates', async () => {
        setupGasFeeController(defaultConstructorOptions);

        await gasFeeController._fetchGasFeeEstimateData();

        expect(gasFeeController.state).toMatchObject(
          mockDetermineGasFeeSuggestions,
        );
      });

      it('should return the same data that it puts into state', async () => {
        setupGasFeeController(defaultConstructorOptions);

        const estimateData = await gasFeeController._fetchGasFeeEstimateData();

        expect(estimateData).toMatchObject(mockDetermineGasFeeSuggestions);
      });

      it('should call determineGasFeeSuggestions correctly when getChainId returns a number input', async () => {
        setupGasFeeController({
          ...defaultConstructorOptions,
          legacyAPIEndpoint: 'http://legacy.endpoint/<chain_id>',
          getChainId: jest.fn().mockReturnValue(1),
        });

        await gasFeeController._fetchGasFeeEstimateData();

        expect(mockedDetermineGasFeeSuggestions).toHaveBeenCalledWith(
          expect.objectContaining({
            fetchLegacyGasPriceEstimatesUrl: 'http://legacy.endpoint/1',
          }),
        );
      });

      it('should call determineGasFeeSuggestions correctly when getChainId returns a hexstring input', async () => {
        setupGasFeeController({
          ...defaultConstructorOptions,
          legacyAPIEndpoint: 'http://legacy.endpoint/<chain_id>',
          getChainId: jest.fn().mockReturnValue('0x1'),
        });

        await gasFeeController._fetchGasFeeEstimateData();

        expect(mockedDetermineGasFeeSuggestions).toHaveBeenCalledWith(
          expect.objectContaining({
            fetchLegacyGasPriceEstimatesUrl: 'http://legacy.endpoint/1',
          }),
        );
      });

      it('should call determineGasFeeSuggestions correctly when getChainId returns a numeric string input', async () => {
        setupGasFeeController({
          ...defaultConstructorOptions,
          legacyAPIEndpoint: 'http://legacy.endpoint/<chain_id>',
          getChainId: jest.fn().mockReturnValue('1'),
        });

        await gasFeeController._fetchGasFeeEstimateData();

        expect(mockedDetermineGasFeeSuggestions).toHaveBeenCalledWith(
          expect.objectContaining({
            fetchLegacyGasPriceEstimatesUrl: 'http://legacy.endpoint/1',
          }),
        );
      });
    });

    describe('when on any network supporting EIP-1559', () => {
      const defaultConstructorOptions = {
        getIsEIP1559Compatible: jest.fn().mockResolvedValue(true),
      };
      const mockDetermineGasFeeSuggestions = buildMockGasFeeStateFeeMarket();

      beforeEach(() => {
        mockedDetermineGasFeeSuggestions.mockResolvedValue(
          mockDetermineGasFeeSuggestions,
        );
      });

      it('should update the state with a fetched set of estimates', async () => {
        setupGasFeeController(defaultConstructorOptions);

        await gasFeeController._fetchGasFeeEstimateData();

        expect(gasFeeController.state).toMatchObject(
          mockDetermineGasFeeSuggestions,
        );
      });

      it('should return the same data that it puts into state', async () => {
        setupGasFeeController(defaultConstructorOptions);

        const estimateData = await gasFeeController._fetchGasFeeEstimateData();

        expect(estimateData).toMatchObject(mockDetermineGasFeeSuggestions);
      });

      it('should call determineGasFeeSuggestions correctly when getChainId returns a number input', async () => {
        setupGasFeeController({
          ...defaultConstructorOptions,
          EIP1559APIEndpoint: 'http://eip-1559.endpoint/<chain_id>',
          getChainId: jest.fn().mockReturnValue(1),
        });

        await gasFeeController._fetchGasFeeEstimateData();

        expect(mockedDetermineGasFeeSuggestions).toHaveBeenCalledWith(
          expect.objectContaining({
            fetchGasEstimatesUrl: 'http://eip-1559.endpoint/1',
          }),
        );
      });

      it('should call determineGasFeeSuggestions correctly when getChainId returns a hexstring input', async () => {
        setupGasFeeController({
          ...defaultConstructorOptions,
          EIP1559APIEndpoint: 'http://eip-1559.endpoint/<chain_id>',
          getChainId: jest.fn().mockReturnValue('0x1'),
        });

        await gasFeeController._fetchGasFeeEstimateData();

        expect(mockedDetermineGasFeeSuggestions).toHaveBeenCalledWith(
          expect.objectContaining({
            fetchGasEstimatesUrl: 'http://eip-1559.endpoint/1',
          }),
        );
      });

      it('should call determineGasFeeSuggestions correctly when getChainId returns a numeric string input', async () => {
        setupGasFeeController({
          ...defaultConstructorOptions,
          EIP1559APIEndpoint: 'http://eip-1559.endpoint/<chain_id>',
          getChainId: jest.fn().mockReturnValue('1'),
        });

        await gasFeeController._fetchGasFeeEstimateData();

        expect(mockedDetermineGasFeeSuggestions).toHaveBeenCalledWith(
          expect.objectContaining({
            fetchGasEstimatesUrl: 'http://eip-1559.endpoint/1',
          }),
        );
      });
    });
  });
});
