import nock from 'nock';

import {
  fetchLegacyGasPriceEstimates,
  normalizeGWEIDecimalNumbers,
  fetchGasEstimates,
  calculateTimeEstimate,
} from './gas-util';
import type { GasFeeEstimates } from './GasFeeController';

const mockEIP1559ApiResponses: GasFeeEstimates[] = [
  {
    low: {
      minWaitTimeEstimate: 120000,
      maxWaitTimeEstimate: 300000,
      suggestedMaxPriorityFeePerGas: '1',
      suggestedMaxFeePerGas: '35',
    },
    medium: {
      minWaitTimeEstimate: 0,
      maxWaitTimeEstimate: 30000,
      suggestedMaxPriorityFeePerGas: '2',
      suggestedMaxFeePerGas: '40',
    },
    high: {
      minWaitTimeEstimate: 0,
      maxWaitTimeEstimate: 15000,
      suggestedMaxPriorityFeePerGas: '3',
      suggestedMaxFeePerGas: '60',
    },
    estimatedBaseFee: '30',
    networkCongestion: 0.98305,
    latestPriorityFeeRange: ['1', '24.213017451'],
    historicalPriorityFeeRange: ['0.195374415', '1045.316256132'],
    historicalBaseFeeRange: ['199.804625585', '442.03686925'],
    priorityFeeTrend: 'level',
    baseFeeTrend: 'up',
  },
  {
    low: {
      minWaitTimeEstimate: 180000,
      maxWaitTimeEstimate: 360000,
      suggestedMaxPriorityFeePerGas: '1.0000000162',
      suggestedMaxFeePerGas: '40',
    },
    medium: {
      minWaitTimeEstimate: 15000,
      maxWaitTimeEstimate: 60000,
      suggestedMaxPriorityFeePerGas: '1.0000000160000028',
      suggestedMaxFeePerGas: '45',
    },
    high: {
      minWaitTimeEstimate: 0,
      maxWaitTimeEstimate: 15000,
      suggestedMaxPriorityFeePerGas: '3',
      suggestedMaxFeePerGas: '1.000000016522',
    },
    estimatedBaseFee: '32.000000016522',
    networkCongestion: 0.98305,
    latestPriorityFeeRange: ['1', '24.213017451'],
    historicalPriorityFeeRange: ['0.195374415', '1045.316256132'],
    historicalBaseFeeRange: ['199.804625585', '442.03686925'],
    priorityFeeTrend: 'level',
    baseFeeTrend: 'up',
  },
];

describe('gas utils', () => {
  describe('fetchGasEstimates', () => {
    it('should fetch external gasFeeEstimates when data is valid', async () => {
      const scope = nock('https://not-a-real-url/')
        .get(/.+/u)
        .reply(200, mockEIP1559ApiResponses[0])
        .persist();
      const result = await fetchGasEstimates('https://not-a-real-url/');
      expect(result).toMatchObject(mockEIP1559ApiResponses[0]);
      scope.done();
    });

    it('should fetch external gasFeeEstimates with client id header when clientId arg is added', async () => {
      const scope = nock('https://not-a-real-url/')
        .matchHeader('x-client-id', 'test')
        .get(/.+/u)
        .reply(200, mockEIP1559ApiResponses[0])
        .persist();
      const result = await fetchGasEstimates('https://not-a-real-url/', 'test');
      expect(result).toMatchObject(mockEIP1559ApiResponses[0]);
      scope.done();
    });

    it('should fetch and normalize external gasFeeEstimates when data is has an invalid number of decimals', async () => {
      const expectedResult = {
        low: {
          minWaitTimeEstimate: 180000,
          maxWaitTimeEstimate: 360000,
          suggestedMaxPriorityFeePerGas: '1.000000016',
          suggestedMaxFeePerGas: '40',
        },
        medium: {
          minWaitTimeEstimate: 15000,
          maxWaitTimeEstimate: 60000,
          suggestedMaxPriorityFeePerGas: '1.000000016',
          suggestedMaxFeePerGas: '45',
        },
        high: {
          minWaitTimeEstimate: 0,
          maxWaitTimeEstimate: 15000,
          suggestedMaxPriorityFeePerGas: '3',
          suggestedMaxFeePerGas: '1.000000017',
        },
        estimatedBaseFee: '32.000000017',
      };

      const scope = nock('https://not-a-real-url/')
        .get(/.+/u)
        .reply(200, mockEIP1559ApiResponses[1])
        .persist();
      const result = await fetchGasEstimates('https://not-a-real-url/');
      expect(result).toMatchObject(expectedResult);
      scope.done();
    });
  });

  describe('fetchLegacyGasPriceEstimates', () => {
    it('should fetch external gasPrices and return high/medium/low', async () => {
      const scope = nock('https://not-a-real-url/')
        .get(/.+/u)
        .reply(200, {
          SafeGasPrice: '22',
          ProposeGasPrice: '25',
          FastGasPrice: '30',
        })
        .persist();
      const result = await fetchLegacyGasPriceEstimates(
        'https://not-a-real-url/',
      );
      expect(result).toMatchObject({
        high: '30',
        medium: '25',
        low: '22',
      });
      scope.done();
    });

    it('should fetch external gasPrices with client id header when clientId arg is passed', async () => {
      const scope = nock('https://not-a-real-url/')
        .matchHeader('x-client-id', 'test')
        .get(/.+/u)
        .reply(200, {
          SafeGasPrice: '22',
          ProposeGasPrice: '25',
          FastGasPrice: '30',
        })
        .persist();
      const result = await fetchLegacyGasPriceEstimates(
        'https://not-a-real-url/',
        'test',
      );
      expect(result).toMatchObject({
        high: '30',
        medium: '25',
        low: '22',
      });
      scope.done();
    });
  });

  describe('normalizeGWEIDecimalNumbers', () => {
    it('should convert a whole number to WEI', () => {
      expect(normalizeGWEIDecimalNumbers(1)).toBe('1');
      expect(normalizeGWEIDecimalNumbers(123)).toBe('123');
      expect(normalizeGWEIDecimalNumbers(101)).toBe('101');
      expect(normalizeGWEIDecimalNumbers(1234)).toBe('1234');
      expect(normalizeGWEIDecimalNumbers(1000)).toBe('1000');
    });

    it('should convert a number with a decimal part to WEI', () => {
      expect(normalizeGWEIDecimalNumbers(1.1)).toBe('1.1');
      expect(normalizeGWEIDecimalNumbers(123.01)).toBe('123.01');
      expect(normalizeGWEIDecimalNumbers(101.001)).toBe('101.001');
      expect(normalizeGWEIDecimalNumbers(100.001)).toBe('100.001');
      expect(normalizeGWEIDecimalNumbers(1234.567)).toBe('1234.567');
    });

    it('should convert a number < 1 to WEI', () => {
      expect(normalizeGWEIDecimalNumbers(0.1)).toBe('0.1');
      expect(normalizeGWEIDecimalNumbers(0.01)).toBe('0.01');
      expect(normalizeGWEIDecimalNumbers(0.001)).toBe('0.001');
      expect(normalizeGWEIDecimalNumbers(0.567)).toBe('0.567');
    });

    it('should round to whole WEI numbers', () => {
      expect(normalizeGWEIDecimalNumbers(0.1001)).toBe('0.1001');
      expect(normalizeGWEIDecimalNumbers(0.0109)).toBe('0.0109');
      expect(normalizeGWEIDecimalNumbers(0.0014)).toBe('0.0014');
      expect(normalizeGWEIDecimalNumbers(0.5676)).toBe('0.5676');
    });

    it('should handle inputs with > 9 decimal places', () => {
      expect(normalizeGWEIDecimalNumbers(1.0000000162)).toBe('1.000000016');
      expect(normalizeGWEIDecimalNumbers(1.0000000165)).toBe('1.000000017');
      expect(normalizeGWEIDecimalNumbers(1.0000000199)).toBe('1.00000002');
      expect(normalizeGWEIDecimalNumbers(1.9999999999)).toBe('2');
      expect(normalizeGWEIDecimalNumbers(1.0000005998)).toBe('1.0000006');
      expect(normalizeGWEIDecimalNumbers(123456.0000005998)).toBe(
        '123456.0000006',
      );
      expect(normalizeGWEIDecimalNumbers(1.000000016025)).toBe('1.000000016');
      expect(normalizeGWEIDecimalNumbers('1.0000000160000028')).toBe(
        '1.000000016',
      );
      expect(normalizeGWEIDecimalNumbers(1.000000016522)).toBe('1.000000017');
      expect(normalizeGWEIDecimalNumbers(1.000000016800022)).toBe(
        '1.000000017',
      );
    });

    it('should work if there are extraneous trailing decimal zeroes', () => {
      expect(normalizeGWEIDecimalNumbers('0.5000')).toBe('0.5');
      expect(normalizeGWEIDecimalNumbers('123.002300')).toBe('123.0023');
      expect(normalizeGWEIDecimalNumbers('123.002300000000')).toBe('123.0023');
      expect(normalizeGWEIDecimalNumbers('0.00000200000')).toBe('0.000002');
    });

    it('should work if there is no whole number specified', () => {
      expect(normalizeGWEIDecimalNumbers('.1')).toBe('0.1');
      expect(normalizeGWEIDecimalNumbers('.01')).toBe('0.01');
      expect(normalizeGWEIDecimalNumbers('.001')).toBe('0.001');
      expect(normalizeGWEIDecimalNumbers('.567')).toBe('0.567');
    });

    it('should handle NaN', () => {
      expect(normalizeGWEIDecimalNumbers(NaN)).toBe('0');
    });
  });

  describe('calculateTimeEstimate', () => {
    const mockGasEstimates = mockEIP1559ApiResponses[0];
    // The lower of this vs the maxPriorityFeePerGas is used in the function. This sets the upper bound
    const maxFeePerGas = '9999999999';

    it('should return an unknown upper bound and null lower bound if the max priority fee is < the max of the low estimate', () => {
      const maxPriorityFeePerGas = '2';
      const lowSuggestedMaxPriorityFee = '2000';

      const result = calculateTimeEstimate(maxPriorityFeePerGas, maxFeePerGas, {
        ...mockGasEstimates,
        low: {
          ...mockGasEstimates.low,
          suggestedMaxPriorityFeePerGas: lowSuggestedMaxPriorityFee,
        },
      });

      expect(result).toMatchObject({
        upperTimeBound: 'unknown',
        lowerTimeBound: null,
      });
    });

    it('should return low min/max wait time estimates when max priority fee is >= the low fee but < med one', () => {
      const lowSuggestedMaxPriorityFee = '1';
      const maxPriorityFeePerGas = '2';
      const medSuggestedMaxPriorityFee = '2000';

      const result = calculateTimeEstimate(maxPriorityFeePerGas, maxFeePerGas, {
        ...mockGasEstimates,
        low: {
          ...mockGasEstimates.low,
          suggestedMaxPriorityFeePerGas: lowSuggestedMaxPriorityFee,
        },
        medium: {
          ...mockGasEstimates.medium,
          suggestedMaxPriorityFeePerGas: medSuggestedMaxPriorityFee,
        },
        estimatedBaseFee: maxPriorityFeePerGas,
      });

      expect(result).toMatchObject({
        upperTimeBound: mockGasEstimates.low.maxWaitTimeEstimate,
        lowerTimeBound: mockGasEstimates.low.minWaitTimeEstimate,
      });
    });

    it('should return medium min/max wait time estimates when max priority fee is >= the medium suggested priority fee but < high suggested priority fee', () => {
      const medSuggestedMaxPriorityFee = '1';
      const maxPriorityFeePerGas = '2';
      const highSuggestedMaxPriorityFee = '2000';

      const result = calculateTimeEstimate(maxPriorityFeePerGas, maxFeePerGas, {
        ...mockGasEstimates,
        medium: {
          ...mockGasEstimates.medium,
          suggestedMaxPriorityFeePerGas: medSuggestedMaxPriorityFee,
        },
        high: {
          ...mockGasEstimates.high,
          suggestedMaxPriorityFeePerGas: highSuggestedMaxPriorityFee,
        },
        estimatedBaseFee: maxPriorityFeePerGas,
      });

      expect(result).toMatchObject({
        upperTimeBound: mockGasEstimates.medium.maxWaitTimeEstimate,
        lowerTimeBound: mockGasEstimates.medium.minWaitTimeEstimate,
      });
    });

    it('should return high min/max wait time estimates when max priority fee is equals the high priority fee', () => {
      const maxPriorityFeePerGas = '123456789';
      const suggestedMaxPriorityFee = maxPriorityFeePerGas;

      const result = calculateTimeEstimate(maxPriorityFeePerGas, maxFeePerGas, {
        ...mockGasEstimates,
        high: {
          ...mockGasEstimates.high,
          suggestedMaxPriorityFeePerGas: suggestedMaxPriorityFee,
        },
        estimatedBaseFee: maxPriorityFeePerGas,
      });

      expect(result).toMatchObject({
        upperTimeBound: mockGasEstimates.high.maxWaitTimeEstimate,
        lowerTimeBound: mockGasEstimates.high.minWaitTimeEstimate,
      });
    });

    it('should return a lower bound wait time of 0 and an upper bound of the max high wait time if the priority fee is > the highest time estimate', () => {
      const maxPriorityFeePerGas = '123456789';
      const suggestedMaxPriorityFee = '1';

      const result = calculateTimeEstimate(maxPriorityFeePerGas, maxFeePerGas, {
        ...mockGasEstimates,
        high: {
          ...mockGasEstimates.high,
          suggestedMaxPriorityFeePerGas: suggestedMaxPriorityFee,
        },
        estimatedBaseFee: maxPriorityFeePerGas,
      });

      expect(result).toMatchObject({
        upperTimeBound: mockGasEstimates.high.maxWaitTimeEstimate,
        lowerTimeBound: 0,
      });
    });
  });
});
