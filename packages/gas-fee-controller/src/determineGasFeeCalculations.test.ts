import determineGasFeeCalculations from './determineGasFeeCalculations';
import {
  fetchGasEstimates,
  fetchLegacyGasPriceEstimates,
  fetchEthGasPriceEstimate,
  calculateTimeEstimate,
} from './gas-util';
import type {
  unknownString,
  GasFeeEstimates,
  LegacyGasPriceEstimate,
  EthGasPriceEstimate,
  EstimatedGasFeeTimeBounds,
} from './GasFeeController';

jest.mock('./gas-util');

const mockedFetchGasEstimates = fetchGasEstimates as jest.Mock<
  ReturnType<typeof fetchGasEstimates>,
  Parameters<typeof fetchGasEstimates>
>;
const mockedFetchLegacyGasPriceEstimates =
  fetchLegacyGasPriceEstimates as jest.Mock<
    ReturnType<typeof fetchLegacyGasPriceEstimates>,
    Parameters<typeof fetchLegacyGasPriceEstimates>
  >;
const mockedFetchEthGasPriceEstimate = fetchEthGasPriceEstimate as jest.Mock<
  ReturnType<typeof fetchEthGasPriceEstimate>,
  Parameters<typeof fetchEthGasPriceEstimate>
>;
const mockedCalculateTimeEstimate = calculateTimeEstimate as jest.Mock<
  ReturnType<typeof calculateTimeEstimate>,
  Parameters<typeof calculateTimeEstimate>
>;

const INFURA_API_KEY_MOCK = 'test';

/**
 * Builds mock data for the `fetchGasEstimates` function. All of the data here is filled in to make
 * the gas fee estimation code function in a way that represents a reasonably happy path; it does
 * not necessarily match the real world.
 *
 * @returns The mock data.
 */
function buildMockDataForFetchGasEstimates(): GasFeeEstimates {
  return {
    low: {
      minWaitTimeEstimate: 10_000,
      maxWaitTimeEstimate: 20_000,
      suggestedMaxPriorityFeePerGas: '1',
      suggestedMaxFeePerGas: '10',
    },
    medium: {
      minWaitTimeEstimate: 30_000,
      maxWaitTimeEstimate: 40_000,
      suggestedMaxPriorityFeePerGas: '1.5',
      suggestedMaxFeePerGas: '20',
    },
    high: {
      minWaitTimeEstimate: 50_000,
      maxWaitTimeEstimate: 60_000,
      suggestedMaxPriorityFeePerGas: '2',
      suggestedMaxFeePerGas: '30',
    },
    estimatedBaseFee: '100',
    historicalBaseFeeRange: ['100', '200'],
    baseFeeTrend: 'up',
    latestPriorityFeeRange: ['1', '2'],
    historicalPriorityFeeRange: ['2', '4'],
    priorityFeeTrend: 'down',
    networkCongestion: 0.5,
  };
}

/**
 * Builds mock data for the `fetchLegacyGasPriceEstimates` function. All of the data here is filled
 * in to make the gas fee estimation code function in a way that represents a reasonably happy path;
 * it does not necessarily match the real world.
 *
 * @returns The mock data.
 */
function buildMockDataForFetchLegacyGasPriceEstimates(): LegacyGasPriceEstimate {
  return {
    low: '10',
    medium: '20',
    high: '30',
  };
}

/**
 * Builds mock data for the `fetchEthGasPriceEstimate` function. All of the data here is filled in
 * to make the gas fee estimation code function in a way that represents a reasonably happy path; it
 * does not necessarily match the real world.
 *
 * @returns The mock data.
 */
function buildMockDataForFetchEthGasPriceEstimate(): EthGasPriceEstimate {
  return {
    gasPrice: '100',
  };
}

/**
 * Builds mock data for the `calculateTimeEstimate` function. All of the data here is filled in to
 * make the gas fee estimation code function in a way that represents a reasonably happy path; it
 * does not necessarily match the real world.
 *
 * @returns The mock data.
 */
function buildMockDataForCalculateTimeEstimate(): EstimatedGasFeeTimeBounds {
  return {
    lowerTimeBound: null,
    upperTimeBound: 'unknown' as unknownString,
  };
}

describe('determineGasFeeCalculations', () => {
  const options = {
    isEIP1559Compatible: false,
    isLegacyGasAPICompatible: false,
    fetchGasEstimates: mockedFetchGasEstimates,
    fetchGasEstimatesUrl: 'http://doesnt-matter',
    fetchLegacyGasPriceEstimates: mockedFetchLegacyGasPriceEstimates,
    fetchLegacyGasPriceEstimatesUrl: 'http://doesnt-matter',
    fetchEthGasPriceEstimate: mockedFetchEthGasPriceEstimate,
    calculateTimeEstimate: mockedCalculateTimeEstimate,
    clientId: 'some-client-id',
    ethQuery: {},
    infuraAPIKey: INFURA_API_KEY_MOCK,
  };

  describe('when isEIP1559Compatible is true', () => {
    beforeEach(() => {
      Object.assign(options, {
        fetchGasEstimatesUrl: 'http://some-fetch-gas-estimates-url',
        isEIP1559Compatible: true,
        isLegacyGasAPICompatible: false,
      });
      mockedFetchGasEstimates.mockReset();
    });

    describe('assuming neither fetchGasEstimates nor calculateTimeEstimate throw errors', () => {
      it('returns a combination of the fetched fee and time estimates', async () => {
        const gasFeeEstimates = buildMockDataForFetchGasEstimates();
        mockedFetchGasEstimates.mockResolvedValue(gasFeeEstimates);
        const estimatedGasFeeTimeBounds =
          buildMockDataForCalculateTimeEstimate();
        mockedCalculateTimeEstimate.mockReturnValue(estimatedGasFeeTimeBounds);

        const gasFeeCalculations = await determineGasFeeCalculations(options);

        expect(gasFeeCalculations).toStrictEqual({
          gasFeeEstimates,
          estimatedGasFeeTimeBounds,
          gasEstimateType: 'fee-market',
        });
      });
    });

    describe('when nonRPCGasFeeApisDisabled is true', () => {
      describe('assuming fetchEthGasPriceEstimate does not throw an error', () => {
        it('returns the fetched fee estimates and an empty set of time estimates', async () => {
          const gasFeeEstimates = buildMockDataForFetchEthGasPriceEstimate();
          mockedFetchEthGasPriceEstimate.mockResolvedValue(gasFeeEstimates);

          const gasFeeCalculations = await determineGasFeeCalculations({
            ...options,
            nonRPCGasFeeApisDisabled: true,
          });

          expect(mockedFetchGasEstimates).toHaveBeenCalledTimes(0);

          expect(gasFeeCalculations).toStrictEqual({
            gasFeeEstimates,
            estimatedGasFeeTimeBounds: {},
            gasEstimateType: 'eth_gasPrice',
          });
        });
      });

      describe('when fetchEthGasPriceEstimate throws an error', () => {
        it('throws an error that wraps that error', async () => {
          mockedFetchEthGasPriceEstimate.mockImplementation(() => {
            throw new Error('fetchEthGasPriceEstimate failed');
          });

          const promise = determineGasFeeCalculations({
            ...options,
            nonRPCGasFeeApisDisabled: true,
          });

          await expect(promise).rejects.toThrow(
            'Gas fee/price estimation failed. Message: fetchEthGasPriceEstimate failed',
          );
        });
      });
    });

    describe('when fetchGasEstimates throws an error', () => {
      beforeEach(() => {
        mockedFetchGasEstimates.mockImplementation(() => {
          throw new Error('Some API failure');
        });
      });

      describe('assuming fetchEthGasPriceEstimate does not throw an error', () => {
        it('returns the fetched fee estimates and an empty set of time estimates', async () => {
          const gasFeeEstimates = buildMockDataForFetchEthGasPriceEstimate();
          mockedFetchEthGasPriceEstimate.mockResolvedValue(gasFeeEstimates);

          const gasFeeCalculations = await determineGasFeeCalculations(options);

          expect(gasFeeCalculations).toStrictEqual({
            gasFeeEstimates,
            estimatedGasFeeTimeBounds: {},
            gasEstimateType: 'eth_gasPrice',
          });
        });
      });

      describe('when fetchEthGasPriceEstimate throws an error', () => {
        it('throws an error that wraps that error', async () => {
          mockedFetchEthGasPriceEstimate.mockImplementation(() => {
            throw new Error('fetchEthGasPriceEstimate failed');
          });

          const promise = determineGasFeeCalculations(options);

          await expect(promise).rejects.toThrow(
            'Gas fee/price estimation failed. Message: fetchEthGasPriceEstimate failed',
          );
        });
      });
    });

    describe('when fetchGasEstimates does not throw an error, but calculateTimeEstimate throws an error', () => {
      beforeEach(() => {
        mockedCalculateTimeEstimate.mockImplementation(() => {
          throw new Error('Some API failure');
        });
      });

      describe('assuming fetchEthGasPriceEstimate does not throw an error', () => {
        it('returns the fetched fee estimates and an empty set of time estimates', async () => {
          const gasFeeEstimates = buildMockDataForFetchEthGasPriceEstimate();
          mockedFetchEthGasPriceEstimate.mockResolvedValue(gasFeeEstimates);

          const gasFeeCalculations = await determineGasFeeCalculations(options);

          expect(gasFeeCalculations).toStrictEqual({
            gasFeeEstimates,
            estimatedGasFeeTimeBounds: {},
            gasEstimateType: 'eth_gasPrice',
          });
        });
      });

      describe('when fetchEthGasPriceEstimate throws an error', () => {
        it('throws an error that wraps that error', async () => {
          mockedFetchEthGasPriceEstimate.mockImplementation(() => {
            throw new Error('fetchEthGasPriceEstimate failed');
          });

          const promise = determineGasFeeCalculations(options);

          await expect(promise).rejects.toThrow(
            'Gas fee/price estimation failed. Message: fetchEthGasPriceEstimate failed',
          );
        });
      });
    });
  });

  describe('when isEIP1559Compatible is false but isLegacyGasAPICompatible is true', () => {
    beforeEach(() => {
      Object.assign(options, {
        isEIP1559Compatible: false,
        isLegacyGasAPICompatible: true,
        fetchLegacyGasPriceEstimatesUrl:
          'http://some-legacy-gas-price-estimates-url',
      });
      mockedFetchLegacyGasPriceEstimates.mockReset();
    });

    describe('assuming fetchLegacyGasPriceEstimates does not throw an error', () => {
      it('returns the fetched fee estimates and an empty set of time estimates', async () => {
        const gasFeeEstimates = buildMockDataForFetchLegacyGasPriceEstimates();
        mockedFetchLegacyGasPriceEstimates.mockResolvedValue(gasFeeEstimates);

        const gasFeeCalculations = await determineGasFeeCalculations(options);

        expect(gasFeeCalculations).toStrictEqual({
          gasFeeEstimates,
          estimatedGasFeeTimeBounds: {},
          gasEstimateType: 'legacy',
        });
      });
    });

    describe('when nonRPCGasFeeApisDisabled is true', () => {
      describe('assuming fetchEthGasPriceEstimate does not throw an error', () => {
        it('returns the fetched fee estimates and an empty set of time estimates', async () => {
          const gasFeeEstimates = buildMockDataForFetchEthGasPriceEstimate();
          mockedFetchEthGasPriceEstimate.mockResolvedValue(gasFeeEstimates);

          const gasFeeCalculations = await determineGasFeeCalculations({
            ...options,
            nonRPCGasFeeApisDisabled: true,
          });

          expect(mockedFetchLegacyGasPriceEstimates).toHaveBeenCalledTimes(0);

          expect(gasFeeCalculations).toStrictEqual({
            gasFeeEstimates,
            estimatedGasFeeTimeBounds: {},
            gasEstimateType: 'eth_gasPrice',
          });
        });
      });
    });

    describe('when fetchLegacyGasPriceEstimates throws an error', () => {
      beforeEach(() => {
        mockedFetchLegacyGasPriceEstimates.mockImplementation(() => {
          throw new Error('Some API failure');
        });
      });

      describe('assuming fetchEthGasPriceEstimate does not throw an error', () => {
        it('returns the fetched fee estimates and an empty set of time estimates', async () => {
          const gasFeeEstimates = buildMockDataForFetchEthGasPriceEstimate();
          mockedFetchEthGasPriceEstimate.mockResolvedValue(gasFeeEstimates);

          const gasFeeCalculations = await determineGasFeeCalculations(options);

          expect(gasFeeCalculations).toStrictEqual({
            gasFeeEstimates,
            estimatedGasFeeTimeBounds: {},
            gasEstimateType: 'eth_gasPrice',
          });
        });
      });

      describe('when calling fetchEthGasPriceEstimate throws an error', () => {
        it('throws an error that wraps that error', async () => {
          mockedFetchEthGasPriceEstimate.mockImplementation(() => {
            throw new Error('fetchEthGasPriceEstimate failed');
          });

          const promise = determineGasFeeCalculations(options);

          await expect(promise).rejects.toThrow(
            'Gas fee/price estimation failed. Message: fetchEthGasPriceEstimate failed',
          );
        });
      });
    });
  });

  describe('when neither isEIP1559Compatible nor isLegacyGasAPICompatible is true', () => {
    beforeEach(() => {
      Object.assign(options, {
        isEIP1559Compatible: false,
        isLegacyGasAPICompatible: false,
      });
    });

    describe('assuming fetchEthGasPriceEstimate does not throw an error', () => {
      it('returns the fetched fee estimates and an empty set of time estimates', async () => {
        const gasFeeEstimates = buildMockDataForFetchEthGasPriceEstimate();
        mockedFetchEthGasPriceEstimate.mockResolvedValue(gasFeeEstimates);

        const gasFeeCalculations = await determineGasFeeCalculations(options);

        expect(gasFeeCalculations).toStrictEqual({
          gasFeeEstimates,
          estimatedGasFeeTimeBounds: {},
          gasEstimateType: 'eth_gasPrice',
        });
      });
    });

    describe('when calling fetchEthGasPriceEstimate throws an error', () => {
      it('throws an error that wraps that error', async () => {
        mockedFetchEthGasPriceEstimate.mockImplementation(() => {
          throw new Error('fetchEthGasPriceEstimate failed');
        });

        const promise = determineGasFeeCalculations(options);

        await expect(promise).rejects.toThrow(
          'Gas fee/price estimation failed. Message: fetchEthGasPriceEstimate failed',
        );
      });
    });
  });
});
