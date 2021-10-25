import { useFakeTimers, SinonFakeTimers } from 'sinon';
import { mocked } from 'ts-jest/utils';
import { ControllerMessenger } from '../ControllerMessenger';
import {
  EstimatedGasFeeTimeBounds,
  GasFeeController,
  GasFeeEstimates,
  GasFeeStateChange,
  GetGasFeeState,
  LegacyGasPriceEstimate,
} from './GasFeeController';
import { calculateTimeEstimate } from './gas-util';

const mockedCalculateTimeEstimate = mocked(calculateTimeEstimate);

jest.mock('./gas-util');

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
 * Builds a mock return value for the `fetchGasEstimates` function that GasFeeController takes. All
 * of the values here are filled in to satisfy the GasFeeEstimates type as well as the gas fee
 * estimate logic within GasFeeController and are not intended to represent any particular scenario.
 *
 * @param args - The arguments.
 * @param args.modifier - A number you can use to build a unique return value in the event that
 * `fetchGasEstimates` is called multiple times. All data points will be multiplied by this number.
 * @returns The mock data.
 */
function buildMockReturnValueForFetchGasEstimates({
  modifier = 1,
} = {}): GasFeeEstimates {
  return {
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
  };
}

/**
 * Builds a mock return value for the `legacyFetchGasPriceEstimates` function that GasFeeController
 * takes. All of the values here are filled in to satisfy the LegacyGasPriceEstimate type as well as
 * the gas fee estimate logic in GasFeeController and are not intended to represent any particular
 * scenario.
 *
 * @param args - The arguments.
 * @param args.modifier - A number you can use to build a unique return value in the event that
 * `legacyFetchGasPriceEstimates` is called multiple times. All data points will be multiplied by
 * this number.
 * @returns The mock data.
 */
function buildMockReturnValueForLegacyFetchGasPriceEstimates({
  modifier = 1,
} = {}): LegacyGasPriceEstimate {
  return {
    low: (10 * modifier).toString(),
    medium: (20 * modifier).toString(),
    high: (30 * modifier).toString(),
  };
}

/**
 * Builds a mock returnv alue for the `calculateTimeEstimate` function that GasFeeController takes.
 * All of the values here are filled in to satisfy the EstimatedGasFeeTimeBounds type and are not
 * intended to represent any particular scenario.
 *
 * @returns The mock data.
 */
function buildMockReturnValueForCalculateTimeEstimate(): EstimatedGasFeeTimeBounds {
  return {
    lowerTimeBound: 0,
    upperTimeBound: 0,
  };
}

/**
 * Returns a Jest mock function for a fetch* function that GasFeeController takes which is
 * configured to return the given mock data.
 *
 * @param mockReturnValues - A set of values that the mock function should return, for all of the
 * expected invocations of that function.
 * @returns The Jest mock function.
 */
function createMockForFetchMethod(mockReturnValues: any[]) {
  const mock = jest.fn();

  if (mockReturnValues.length === 1) {
    mock.mockReturnValue(mockReturnValues[0]);
  } else {
    mockReturnValues.forEach((response: any) => {
      mock.mockImplementationOnce(() => Promise.resolve(response));
    });
  }

  return mock;
}

describe('GasFeeController', () => {
  let clock: SinonFakeTimers;
  let gasFeeController: GasFeeController;
  let fetchGasEstimates: jest.Mock<any>;
  let fetchLegacyGasPriceEstimates: jest.Mock<any>;

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
   * @param options.mockReturnValuesForFetchGasEstimates - Specifies mock data for one or more
   * invocations of `fetchGasEstimates`.
   * @param options.mockReturnValuesForFetchLegacyGasPriceEstimates - Specifies mock data for one or
   * more invocations of `fetchLegacyGasPriceEstimates`.
   * @param options.legacyAPIEndpoint - Sets legacyAPIEndpoint on the GasFeeController.
   * @param options.EIP1559APIEndpoint - Sets EIP1559APIEndpoint on the GasFeeController.
   * @param options.clientId - Sets clientId on the GasFeeController.
   */
  function setupGasFeeController({
    getChainId = jest.fn().mockReturnValue('0x1'),
    getIsEIP1559Compatible = jest.fn().mockResolvedValue(true),
    getCurrentNetworkLegacyGasAPICompatibility = jest
      .fn()
      .mockReturnValue(false),
    mockReturnValuesForFetchGasEstimates = [
      buildMockReturnValueForFetchGasEstimates(),
    ],
    mockReturnValuesForFetchLegacyGasPriceEstimates = [
      buildMockReturnValueForLegacyFetchGasPriceEstimates(),
    ],
    legacyAPIEndpoint = 'http://legacy.endpoint/<chain_id>',
    EIP1559APIEndpoint = 'http://eip-1559.endpoint/<chain_id>',
    clientId,
  }: {
    getChainId?: jest.Mock<`0x${string}` | `${number}` | number>;
    getIsEIP1559Compatible?: jest.Mock<Promise<boolean>>;
    getCurrentNetworkLegacyGasAPICompatibility?: jest.Mock<boolean>;
    mockReturnValuesForFetchGasEstimates?: any[];
    mockReturnValuesForFetchLegacyGasPriceEstimates?: any[];
    legacyAPIEndpoint?: string;
    EIP1559APIEndpoint?: string;
    clientId?: string;
  } = {}) {
    fetchGasEstimates = createMockForFetchMethod(
      mockReturnValuesForFetchGasEstimates,
    );

    fetchLegacyGasPriceEstimates = createMockForFetchMethod(
      mockReturnValuesForFetchLegacyGasPriceEstimates,
    );

    gasFeeController = new GasFeeController({
      messenger: getRestrictedMessenger(),
      getProvider: jest.fn(),
      getChainId,
      fetchGasEstimates,
      fetchLegacyGasPriceEstimates,
      fetchEthGasPriceEstimate: jest.fn().mockResolvedValue({ gasPrice: '1' }),
      onNetworkStateChange: jest.fn(),
      getCurrentNetworkLegacyGasAPICompatibility,
      getCurrentNetworkEIP1559Compatibility: getIsEIP1559Compatible, // change this for networkController.state.properties.isEIP1559Compatible ???
      legacyAPIEndpoint,
      EIP1559APIEndpoint,
      clientId,
    });
  }

  beforeEach(() => {
    clock = useFakeTimers();
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
        it('should update the state with a fetched set of estimates', async () => {
          const mockReturnValuesForFetchGasEstimates = [
            buildMockReturnValueForFetchGasEstimates(),
          ];
          setupGasFeeController({
            mockReturnValuesForFetchGasEstimates,
          });

          await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);

          expect(gasFeeController.state.gasFeeEstimates).toStrictEqual(
            mockReturnValuesForFetchGasEstimates[0],
          );

          expect(
            gasFeeController.state.estimatedGasFeeTimeBounds,
          ).toStrictEqual({});

          expect(gasFeeController.state.gasEstimateType).toStrictEqual(
            'fee-market',
          );
        });

        it('should continue updating the state with all estimate data (including new time estimates because of a subsequent request) on a set interval', async () => {
          const mockReturnValuesForFetchGasEstimates = [
            buildMockReturnValueForFetchGasEstimates({ modifier: 1 }),
            buildMockReturnValueForFetchGasEstimates({ modifier: 1.5 }),
          ];
          setupGasFeeController({
            mockReturnValuesForFetchGasEstimates,
          });
          const estimatedGasFeeTimeBounds = buildMockReturnValueForCalculateTimeEstimate();
          mockedCalculateTimeEstimate.mockReturnValue(
            estimatedGasFeeTimeBounds,
          );

          await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);
          await clock.nextAsync();

          expect(gasFeeController.state.gasFeeEstimates).toStrictEqual(
            mockReturnValuesForFetchGasEstimates[1],
          );

          expect(
            gasFeeController.state.estimatedGasFeeTimeBounds,
          ).toStrictEqual(estimatedGasFeeTimeBounds);

          expect(gasFeeController.state.gasEstimateType).toStrictEqual(
            'fee-market',
          );
        });
      });

      describe('and called with a previously unseen token', () => {
        it('should make a request to fetch estimates', async () => {
          setupGasFeeController();

          await gasFeeController.getGasFeeEstimatesAndStartPolling(
            'some-previously-unseen-token',
          );

          expect(fetchGasEstimates.mock.calls).toHaveLength(1);
        });

        it('should make further requests on a set interval', async () => {
          setupGasFeeController();

          await gasFeeController.getGasFeeEstimatesAndStartPolling(
            'some-previously-unseen-token',
          );
          await clock.nextAsync();

          expect(fetchGasEstimates.mock.calls).toHaveLength(2);
        });
      });
    });

    describe('if called twice with undefined', () => {
      it('should not make another request to fetch estimates', async () => {
        setupGasFeeController();

        await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);
        await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);

        expect(fetchGasEstimates.mock.calls).toHaveLength(1);
      });

      it('should not make more than one request per set interval', async () => {
        setupGasFeeController();

        await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);
        await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);
        await clock.nextAsync();
        await clock.nextAsync();

        expect(fetchGasEstimates.mock.calls).toHaveLength(3);
      });
    });

    describe('if called once with undefined and again with the same token', () => {
      it('should make another request to fetch estimates', async () => {
        setupGasFeeController();

        const pollToken = await gasFeeController.getGasFeeEstimatesAndStartPolling(
          undefined,
        );
        await gasFeeController.getGasFeeEstimatesAndStartPolling(pollToken);

        expect(fetchGasEstimates.mock.calls).toHaveLength(2);
      });

      it('should not make more than one request per set interval', async () => {
        setupGasFeeController();

        const pollToken = await gasFeeController.getGasFeeEstimatesAndStartPolling(
          undefined,
        );
        await gasFeeController.getGasFeeEstimatesAndStartPolling(pollToken);
        await clock.nextAsync();
        await clock.nextAsync();

        expect(fetchGasEstimates.mock.calls).toHaveLength(4);
      });
    });

    describe('if called twice, both with previously unseen tokens', () => {
      it('should not make another request to fetch estimates', async () => {
        setupGasFeeController();

        await gasFeeController.getGasFeeEstimatesAndStartPolling(
          'some-previously-unseen-token-1',
        );

        await gasFeeController.getGasFeeEstimatesAndStartPolling(
          'some-previously-unseen-token-2',
        );

        expect(fetchGasEstimates.mock.calls).toHaveLength(1);
      });

      it('should not make more than one request per set interval', async () => {
        setupGasFeeController();

        await gasFeeController.getGasFeeEstimatesAndStartPolling(
          'some-previously-unseen-token-1',
        );

        await gasFeeController.getGasFeeEstimatesAndStartPolling(
          'some-previously-unseen-token-2',
        );
        await clock.nextAsync();
        await clock.nextAsync();

        expect(fetchGasEstimates.mock.calls).toHaveLength(3);
      });
    });
  });

  describe('disconnectPoller', () => {
    describe('assuming that updateWithAndStartPollingFor was already called exactly once', () => {
      describe('given the same token as the result of the first call', () => {
        it('should prevent requests from being made periodically', async () => {
          setupGasFeeController();
          const pollToken = await gasFeeController.getGasFeeEstimatesAndStartPolling(
            undefined,
          );
          await clock.nextAsync();
          expect(fetchGasEstimates.mock.calls).toHaveLength(2);

          gasFeeController.disconnectPoller(pollToken);

          await clock.nextAsync();
          expect(fetchGasEstimates.mock.calls).toHaveLength(2);
        });

        it('should make it so that a second call to getGasFeeEstimatesAndStartPolling with the same token has the same effect as the inaugural call', async () => {
          setupGasFeeController();
          const pollToken = await gasFeeController.getGasFeeEstimatesAndStartPolling(
            undefined,
          );
          await clock.nextAsync();
          expect(fetchGasEstimates.mock.calls).toHaveLength(2);

          gasFeeController.disconnectPoller(pollToken);

          await gasFeeController.getGasFeeEstimatesAndStartPolling(pollToken);
          await clock.nextAsync();
          expect(fetchGasEstimates.mock.calls).toHaveLength(4);
        });
      });

      describe('given a previously unseen token', () => {
        it('should not prevent requests from being made periodically', async () => {
          setupGasFeeController();
          await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);
          await clock.nextAsync();
          expect(fetchGasEstimates.mock.calls).toHaveLength(2);

          gasFeeController.disconnectPoller('some-previously-unseen-token');

          await clock.nextAsync();
          expect(fetchGasEstimates.mock.calls).toHaveLength(3);
        });
      });
    });

    describe('if updateWithAndStartPollingFor was called twice with different tokens', () => {
      it('should not prevent requests from being made periodically', async () => {
        setupGasFeeController();
        const pollToken1 = await gasFeeController.getGasFeeEstimatesAndStartPolling(
          undefined,
        );
        await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);
        await clock.nextAsync();
        expect(fetchGasEstimates.mock.calls).toHaveLength(2);

        gasFeeController.disconnectPoller(pollToken1);

        await clock.nextAsync();
        expect(fetchGasEstimates.mock.calls).toHaveLength(3);
      });
    });

    describe('if updateWithAndStartPollingFor was never called', () => {
      it('should not throw an error', () => {
        setupGasFeeController();
        expect(() =>
          gasFeeController.disconnectPoller('some-token'),
        ).not.toThrow();
      });
    });
  });

  describe('stopPolling', () => {
    describe('assuming that updateWithAndStartPollingFor was already called once', () => {
      it('should prevent requests from being made periodically', async () => {
        setupGasFeeController();
        await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);
        await clock.nextAsync();
        expect(fetchGasEstimates.mock.calls).toHaveLength(2);

        gasFeeController.stopPolling();

        await clock.nextAsync();
        expect(fetchGasEstimates.mock.calls).toHaveLength(2);
      });

      it('should make it so that a second call to getGasFeeEstimatesAndStartPolling with the same token has the same effect as the inaugural call', async () => {
        setupGasFeeController();
        const pollToken = await gasFeeController.getGasFeeEstimatesAndStartPolling(
          undefined,
        );
        await clock.nextAsync();
        expect(fetchGasEstimates.mock.calls).toHaveLength(2);

        gasFeeController.stopPolling();

        await gasFeeController.getGasFeeEstimatesAndStartPolling(pollToken);
        await clock.nextAsync();
        expect(fetchGasEstimates.mock.calls).toHaveLength(4);
      });

      it('should revert the state back to its original form', async () => {
        setupGasFeeController();
        await gasFeeController.getGasFeeEstimatesAndStartPolling(undefined);

        gasFeeController.stopPolling();

        expect(gasFeeController.state.gasFeeEstimates).toStrictEqual({});
        expect(gasFeeController.state.estimatedGasFeeTimeBounds).toStrictEqual(
          {},
        );

        expect(gasFeeController.state.gasEstimateType).toStrictEqual('none');
      });
    });

    describe('if updateWithAndStartPollingFor was called multiple times with the same token (thereby restarting the polling once)', () => {
      it('should prevent requests from being made periodically', async () => {
        setupGasFeeController();
        const pollToken = await gasFeeController.getGasFeeEstimatesAndStartPolling(
          undefined,
        );
        await gasFeeController.getGasFeeEstimatesAndStartPolling(pollToken);
        await clock.nextAsync();
        expect(fetchGasEstimates.mock.calls).toHaveLength(3);

        gasFeeController.stopPolling();

        await clock.nextAsync();
        expect(fetchGasEstimates.mock.calls).toHaveLength(3);
      });

      it('should make it so that another call to getGasFeeEstimatesAndStartPolling with a previously generated token has the same effect as the inaugural call', async () => {
        setupGasFeeController();
        const pollToken = await gasFeeController.getGasFeeEstimatesAndStartPolling(
          undefined,
        );
        await gasFeeController.getGasFeeEstimatesAndStartPolling(pollToken);
        await clock.nextAsync();
        expect(fetchGasEstimates.mock.calls).toHaveLength(3);

        gasFeeController.stopPolling();

        await gasFeeController.getGasFeeEstimatesAndStartPolling(pollToken);
        await clock.nextAsync();
        expect(fetchGasEstimates.mock.calls).toHaveLength(5);
      });
    });

    describe('if updateWithAndStartPollingFor was never called', () => {
      it('should not throw an error', () => {
        setupGasFeeController();
        expect(() => gasFeeController.stopPolling()).not.toThrow();
      });
    });
  });

  describe('_fetchGasFeeEstimateData', () => {
    describe('when on any network supporting legacy gas estimation api', () => {
      const mockReturnValuesForFetchLegacyGasPriceEstimates = [
        buildMockReturnValueForLegacyFetchGasPriceEstimates(),
      ];
      const defaultConstructorOptions = {
        getIsEIP1559Compatible: jest.fn().mockResolvedValue(false),
        getCurrentNetworkLegacyGasAPICompatibility: jest
          .fn()
          .mockReturnValue(true),
        mockReturnValuesForFetchLegacyGasPriceEstimates,
      };

      it('should update the state with a fetched set of estimates', async () => {
        setupGasFeeController(defaultConstructorOptions);

        await gasFeeController._fetchGasFeeEstimateData();

        expect(gasFeeController.state.gasFeeEstimates).toStrictEqual(
          mockReturnValuesForFetchLegacyGasPriceEstimates[0],
        );

        expect(gasFeeController.state.estimatedGasFeeTimeBounds).toStrictEqual(
          {},
        );

        expect(gasFeeController.state.gasEstimateType).toStrictEqual('legacy');
      });

      it('should return the same data that it puts into state', async () => {
        setupGasFeeController(defaultConstructorOptions);

        const estimateData = await gasFeeController._fetchGasFeeEstimateData();

        expect(estimateData.gasFeeEstimates).toStrictEqual(
          mockReturnValuesForFetchLegacyGasPriceEstimates[0],
        );

        expect(estimateData.estimatedGasFeeTimeBounds).toStrictEqual({});

        expect(estimateData.gasEstimateType).toStrictEqual('legacy');
      });

      it('should call fetchLegacyGasPriceEstimates correctly when getChainId returns a number input', async () => {
        setupGasFeeController({
          ...defaultConstructorOptions,
          legacyAPIEndpoint: 'http://legacy.endpoint/<chain_id>',
          getChainId: jest.fn().mockReturnValue(1),
          clientId: '123',
        });

        await gasFeeController._fetchGasFeeEstimateData();

        expect(fetchLegacyGasPriceEstimates).toHaveBeenCalledWith(
          'http://legacy.endpoint/1',
          '123',
        );
      });

      it('should call fetchLegacyGasPriceEstimates correctly when getChainId returns a hexstring input', async () => {
        setupGasFeeController({
          ...defaultConstructorOptions,
          legacyAPIEndpoint: 'http://legacy.endpoint/<chain_id>',
          getChainId: jest.fn().mockReturnValue('0x1'),
          clientId: '123',
        });

        await gasFeeController._fetchGasFeeEstimateData();

        expect(fetchLegacyGasPriceEstimates).toHaveBeenCalledWith(
          'http://legacy.endpoint/1',
          '123',
        );
      });

      it('should call fetchLegacyGasPriceEstimates correctly when getChainId returns a numeric string input', async () => {
        setupGasFeeController({
          ...defaultConstructorOptions,
          legacyAPIEndpoint: 'http://legacy.endpoint/<chain_id>',
          getChainId: jest.fn().mockReturnValue('1'),
          clientId: '123',
        });

        await gasFeeController._fetchGasFeeEstimateData();

        expect(fetchLegacyGasPriceEstimates).toHaveBeenCalledWith(
          'http://legacy.endpoint/1',
          '123',
        );
      });
    });

    describe('when on any network supporting EIP-1559', () => {
      const mockReturnValuesForFetchGasEstimates = [
        buildMockReturnValueForFetchGasEstimates(),
      ];
      const defaultConstructorOptions = {
        getIsEIP1559Compatible: jest.fn().mockResolvedValue(true),
        mockReturnValuesForFetchGasEstimates,
      };

      it('should update the state with a fetched set of estimates', async () => {
        setupGasFeeController(defaultConstructorOptions);

        await gasFeeController._fetchGasFeeEstimateData();

        expect(gasFeeController.state.gasFeeEstimates).toStrictEqual(
          mockReturnValuesForFetchGasEstimates[0],
        );

        expect(gasFeeController.state.estimatedGasFeeTimeBounds).toStrictEqual(
          {},
        );

        expect(gasFeeController.state.gasEstimateType).toStrictEqual(
          'fee-market',
        );
      });

      it('should return the same data that it puts into state', async () => {
        setupGasFeeController(defaultConstructorOptions);

        const estimateData = await gasFeeController._fetchGasFeeEstimateData();

        expect(estimateData.gasFeeEstimates).toStrictEqual(
          mockReturnValuesForFetchGasEstimates[0],
        );

        expect(estimateData.estimatedGasFeeTimeBounds).toStrictEqual({});

        expect(estimateData.gasEstimateType).toStrictEqual('fee-market');
      });

      it('should call fetchGasEstimates correctly when getChainId returns a number input', async () => {
        setupGasFeeController({
          ...defaultConstructorOptions,
          EIP1559APIEndpoint: 'http://eip-1559.endpoint/<chain_id>',
          getChainId: jest.fn().mockReturnValue(1),
          clientId: '123',
        });

        await gasFeeController._fetchGasFeeEstimateData();

        expect(fetchGasEstimates).toHaveBeenCalledWith(
          'http://eip-1559.endpoint/1',
          '123',
        );
      });

      it('should call fetchGasEstimates correctly when getChainId returns a hexstring input', async () => {
        setupGasFeeController({
          ...defaultConstructorOptions,
          EIP1559APIEndpoint: 'http://eip-1559.endpoint/<chain_id>',
          getChainId: jest.fn().mockReturnValue('0x1'),
          clientId: '123',
        });

        await gasFeeController._fetchGasFeeEstimateData();

        expect(fetchGasEstimates).toHaveBeenCalledWith(
          'http://eip-1559.endpoint/1',
          '123',
        );
      });

      it('should call fetchGasEstimates correctly when getChainId returns a numeric string input', async () => {
        setupGasFeeController({
          ...defaultConstructorOptions,
          EIP1559APIEndpoint: 'http://eip-1559.endpoint/<chain_id>',
          getChainId: jest.fn().mockReturnValue('1'),
          clientId: '123',
        });

        await gasFeeController._fetchGasFeeEstimateData();

        expect(fetchGasEstimates).toHaveBeenCalledWith(
          'http://eip-1559.endpoint/1',
          '123',
        );
      });
    });
  });
});
