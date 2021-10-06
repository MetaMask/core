import determineGasFeeSuggestions from './determineGasFeeSuggestions';
import {
  unknownString,
  GasFeeEstimates,
  LegacyGasPriceEstimate,
  EthGasPriceEstimate,
  EstimatedGasFeeTimeBounds,
} from './GasFeeController';

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

describe('determineGasFeeSuggestions', () => {
  let options: any;
  let fetchGasEstimates: jest.SpyInstance<any>;
  let calculateTimeEstimate: jest.SpyInstance<any>;
  let fetchLegacyGasPriceEstimates: jest.SpyInstance<any>;
  let fetchEthGasPriceEstimate: jest.SpyInstance<any>;

  beforeEach(() => {
    fetchGasEstimates = jest
      .fn()
      .mockResolvedValue(buildMockDataForFetchGasEstimates());

    calculateTimeEstimate = jest
      .fn()
      .mockReturnValue(buildMockDataForCalculateTimeEstimate());

    fetchLegacyGasPriceEstimates = jest
      .fn()
      .mockResolvedValue(buildMockDataForFetchLegacyGasPriceEstimates());

    fetchEthGasPriceEstimate = jest
      .fn()
      .mockResolvedValue(buildMockDataForFetchEthGasPriceEstimate());
  });

  describe('when isEIP1559Compatible is true', () => {
    beforeEach(() => {
      options = {
        isEIP1559Compatible: true,
        isLegacyGasAPICompatible: false,
        fetchGasEstimates,
        fetchGasEstimatesUrl: 'http://some-fetch-gas-estimates-url',
        fetchLegacyGasPriceEstimates,
        fetchLegacyGasPriceEstimatesUrl: 'http://doesnt-matter',
        fetchEthGasPriceEstimate,
        calculateTimeEstimate,
        clientId: 'some-client-id',
        ethQuery: {},
      };
    });

    describe('assuming neither fetchGasEstimates nor calculateTimeEstimate throw errors', () => {
      it('returns a combination of the fetched fee and time estimates', async () => {
        const gasFeeEstimates = buildMockDataForFetchGasEstimates();
        fetchGasEstimates.mockResolvedValue(gasFeeEstimates);
        const estimatedGasFeeTimeBounds = buildMockDataForCalculateTimeEstimate();
        calculateTimeEstimate.mockReturnValue(estimatedGasFeeTimeBounds);

        const gasFeeSuggestions = await determineGasFeeSuggestions(options);

        expect(gasFeeSuggestions).toStrictEqual({
          gasFeeEstimates,
          estimatedGasFeeTimeBounds,
          gasEstimateType: 'fee-market',
        });
      });
    });

    describe('when fetchGasEstimates throws an error', () => {
      beforeEach(() => {
        fetchGasEstimates.mockImplementation(() => {
          throw new Error('Some API failure');
        });
      });

      describe('assuming fetchEthGasPriceEstimate does not throw an error', () => {
        it('returns the fetched fee estimates and an empty set of time estimates', async () => {
          const gasFeeEstimates = buildMockDataForFetchEthGasPriceEstimate();
          fetchEthGasPriceEstimate.mockResolvedValue(gasFeeEstimates);

          const gasFeeSuggestions = await determineGasFeeSuggestions(options);

          expect(gasFeeSuggestions).toStrictEqual({
            gasFeeEstimates,
            estimatedGasFeeTimeBounds: {},
            gasEstimateType: 'eth_gasPrice',
          });
        });
      });

      describe('when fetchEthGasPriceEstimate throws an error', () => {
        it('throws an error that wraps that error', async () => {
          fetchEthGasPriceEstimate.mockImplementation(() => {
            throw new Error('fetchEthGasPriceEstimate failed');
          });

          const promise = determineGasFeeSuggestions(options);

          await expect(promise).rejects.toThrow(
            'Gas fee/price estimation failed. Message: fetchEthGasPriceEstimate failed',
          );
        });
      });
    });
  });

  describe('when isEIP1559Compatible is false but isLegacyGasAPICompatible is true', () => {
    beforeEach(() => {
      options = {
        isEIP1559Compatible: false,
        isLegacyGasAPICompatible: true,
        fetchGasEstimates,
        fetchGasEstimatesUrl: 'http://doesnt-matter',
        fetchLegacyGasPriceEstimates,
        fetchLegacyGasPriceEstimatesUrl:
          'http://some-legacy-gas-price-estimates-url',
        fetchEthGasPriceEstimate,
        calculateTimeEstimate,
        clientId: 'some-client-id',
        ethQuery: {},
      };
    });

    describe('assuming fetchLegacyGasPriceEstimates does not throw an error', () => {
      it('returns the fetched fee estimates and an empty set of time estimates', async () => {
        const gasFeeEstimates = buildMockDataForFetchLegacyGasPriceEstimates();
        fetchLegacyGasPriceEstimates.mockResolvedValue(gasFeeEstimates);

        const gasFeeSuggestions = await determineGasFeeSuggestions(options);

        expect(gasFeeSuggestions).toStrictEqual({
          gasFeeEstimates,
          estimatedGasFeeTimeBounds: {},
          gasEstimateType: 'legacy',
        });
      });
    });

    describe('when fetchLegacyGasPriceEstimates throws an error', () => {
      beforeEach(() => {
        fetchLegacyGasPriceEstimates.mockImplementation(() => {
          throw new Error('Some API failure');
        });
      });

      describe('assuming fetchEthGasPriceEstimate does not throw an error', () => {
        it('returns the fetched fee estimates and an empty set of time estimates', async () => {
          const gasFeeEstimates = buildMockDataForFetchEthGasPriceEstimate();
          fetchEthGasPriceEstimate.mockResolvedValue(gasFeeEstimates);

          const gasFeeSuggestions = await determineGasFeeSuggestions(options);

          expect(gasFeeSuggestions).toStrictEqual({
            gasFeeEstimates,
            estimatedGasFeeTimeBounds: {},
            gasEstimateType: 'eth_gasPrice',
          });
        });
      });

      describe('when calling fetchEthGasPriceEstimate throws an error', () => {
        it('throws an error that wraps that error', async () => {
          fetchEthGasPriceEstimate.mockImplementation(() => {
            throw new Error('fetchEthGasPriceEstimate failed');
          });

          const promise = determineGasFeeSuggestions(options);

          await expect(promise).rejects.toThrow(
            'Gas fee/price estimation failed. Message: fetchEthGasPriceEstimate failed',
          );
        });
      });
    });
  });

  describe('when neither isEIP1559Compatible nor isLegacyGasAPICompatible is true', () => {
    beforeEach(() => {
      options = {
        isEIP1559Compatible: false,
        isLegacyGasAPICompatible: false,
        fetchGasEstimates,
        fetchGasEstimatesUrl: 'http://doesnt-matter',
        fetchLegacyGasPriceEstimates,
        fetchLegacyGasPriceEstimatesUrl: 'http://doesnt-matter',
        fetchEthGasPriceEstimate,
        calculateTimeEstimate,
        clientId: 'some-client-id',
        ethQuery: {},
      };
    });

    describe('assuming fetchEthGasPriceEstimate does not throw an error', () => {
      it('returns the fetched fee estimates and an empty set of time estimates', async () => {
        const gasFeeEstimates = buildMockDataForFetchEthGasPriceEstimate();
        fetchEthGasPriceEstimate.mockResolvedValue(gasFeeEstimates);

        const gasFeeSuggestions = await determineGasFeeSuggestions(options);

        expect(gasFeeSuggestions).toStrictEqual({
          gasFeeEstimates,
          estimatedGasFeeTimeBounds: {},
          gasEstimateType: 'eth_gasPrice',
        });
      });
    });

    describe('when calling fetchEthGasPriceEstimate throws an error', () => {
      it('throws an error that wraps that error', async () => {
        fetchEthGasPriceEstimate.mockImplementation(() => {
          throw new Error('fetchEthGasPriceEstimate failed');
        });

        const promise = determineGasFeeSuggestions(options);

        await expect(promise).rejects.toThrow(
          'Gas fee/price estimation failed. Message: fetchEthGasPriceEstimate failed',
        );
      });
    });
  });
});
