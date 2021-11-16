import { mocked } from 'ts-jest/utils';
import determineGasFeeCalculations from './determineGasFeeCalculations';
import {
  unknownString,
  GasFeeEstimates,
  LegacyGasPriceEstimate,
  EthGasPriceEstimate,
  EstimatedGasFeeTimeBounds,
} from './GasFeeController';
import {
  fetchGasEstimates,
  fetchLegacyGasPriceEstimates,
  fetchEthGasPriceEstimate,
  calculateTimeEstimate,
} from './gas-util';
import fetchGasEstimatesViaEthFeeHistory from './fetchGasEstimatesViaEthFeeHistory';

jest.mock('./gas-util');
jest.mock('./fetchGasEstimatesViaEthFeeHistory');

const mockedFetchGasEstimates = mocked(fetchGasEstimates, true);
const mockedFetchLegacyGasPriceEstimates = mocked(
  fetchLegacyGasPriceEstimates,
  true,
);
const mockedFetchEthGasPriceEstimate = mocked(fetchEthGasPriceEstimate, true);
const mockedCalculateTimeEstimate = mocked(calculateTimeEstimate, true);
const mockedFetchGasEstimatesViaEthFeeHistory = mocked(
  fetchGasEstimatesViaEthFeeHistory,
  true,
);

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
      minWaitTimeEstimate: 10000,
      maxWaitTimeEstimate: 20000,
      suggestedMaxPriorityFeePerGas: '1',
      suggestedMaxFeePerGas: '10',
    },
    medium: {
      minWaitTimeEstimate: 30000,
      maxWaitTimeEstimate: 40000,
      suggestedMaxPriorityFeePerGas: '1.5',
      suggestedMaxFeePerGas: '20',
    },
    high: {
      minWaitTimeEstimate: 50000,
      maxWaitTimeEstimate: 60000,
      suggestedMaxPriorityFeePerGas: '2',
      suggestedMaxFeePerGas: '30',
    },
    estimatedBaseFee: '100',
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
    fetchGasEstimatesViaEthFeeHistory: mockedFetchGasEstimatesViaEthFeeHistory,
    fetchGasEstimatesUrl: 'http://doesnt-matter',
    fetchLegacyGasPriceEstimates: mockedFetchLegacyGasPriceEstimates,
    fetchLegacyGasPriceEstimatesUrl: 'http://doesnt-matter',
    fetchEthGasPriceEstimate: mockedFetchEthGasPriceEstimate,
    calculateTimeEstimate: mockedCalculateTimeEstimate,
    clientId: 'some-client-id',
    ethQuery: {},
  };

  describe('when isEIP1559Compatible is true', () => {
    beforeEach(() => {
      Object.assign(options, {
        fetchGasEstimatesUrl: 'http://some-fetch-gas-estimates-url',
        isEIP1559Compatible: true,
        isLegacyGasAPICompatible: false,
      });
    });

    describe('assuming neither fetchGasEstimates nor calculateTimeEstimate throw errors', () => {
      it('returns a combination of the fetched fee and time estimates', async () => {
        const gasFeeEstimates = buildMockDataForFetchGasEstimates();
        mockedFetchGasEstimates.mockResolvedValue(gasFeeEstimates);
        const estimatedGasFeeTimeBounds = buildMockDataForCalculateTimeEstimate();
        mockedCalculateTimeEstimate.mockReturnValue(estimatedGasFeeTimeBounds);

        const gasFeeCalculations = await determineGasFeeCalculations(options);

        expect(gasFeeCalculations).toStrictEqual({
          gasFeeEstimates,
          estimatedGasFeeTimeBounds,
          gasEstimateType: 'fee-market',
        });
      });
    });

    describe('when fetchGasEstimates throws an error', () => {
      beforeEach(() => {
        mockedFetchGasEstimates.mockImplementation(() => {
          throw new Error('Some API failure');
        });
      });

      describe('assuming neither fetchGasEstimatesViaEthFeeHistory nor calculateTimeEstimate throws errors', () => {
        it('returns a combination of the fetched fee and time estimates', async () => {
          const gasFeeEstimates = buildMockDataForFetchGasEstimates();
          mockedFetchGasEstimatesViaEthFeeHistory.mockResolvedValue(
            gasFeeEstimates,
          );
          const estimatedGasFeeTimeBounds = buildMockDataForCalculateTimeEstimate();
          mockedCalculateTimeEstimate.mockReturnValue(
            estimatedGasFeeTimeBounds,
          );

          const gasFeeCalculations = await determineGasFeeCalculations(options);

          expect(gasFeeCalculations).toStrictEqual({
            gasFeeEstimates,
            estimatedGasFeeTimeBounds,
            gasEstimateType: 'fee-market',
          });
        });
      });

      describe('when fetchGasEstimatesViaEthFeeHistory throws an error', () => {
        beforeEach(() => {
          mockedFetchGasEstimatesViaEthFeeHistory.mockImplementation(() => {
            throw new Error('Some API failure');
          });
        });

        describe('assuming fetchEthGasPriceEstimate does not throw an error', () => {
          it('returns the fetched fee estimates and an empty set of time estimates', async () => {
            const gasFeeEstimates = buildMockDataForFetchEthGasPriceEstimate();
            mockedFetchEthGasPriceEstimate.mockResolvedValue(gasFeeEstimates);

            const gasFeeCalculations = await determineGasFeeCalculations(
              options,
            );

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

      describe('when fetchGasEstimatesViaEthFeeHistory does not throw an error, but calculateTimeEstimate throws an error', () => {
        beforeEach(() => {
          mockedCalculateTimeEstimate.mockImplementation(() => {
            throw new Error('Some API failure');
          });
        });

        describe('assuming fetchEthGasPriceEstimate does not throw an error', () => {
          it('returns the fetched fee estimates and an empty set of time estimates', async () => {
            const gasFeeEstimates = buildMockDataForFetchEthGasPriceEstimate();
            mockedFetchEthGasPriceEstimate.mockResolvedValue(gasFeeEstimates);

            const gasFeeCalculations = await determineGasFeeCalculations(
              options,
            );

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
