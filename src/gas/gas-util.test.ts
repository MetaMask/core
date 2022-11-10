import nock from 'nock';
import { toHex } from '../util';
import { GasFeeEstimates } from './GasFeeController';
import {
  fetchLegacyGasPriceEstimates,
  normalizeGWEIDecimalNumbers,
  fetchGasEstimates,
  fetchEthGasPriceEstimate,
  calculateTimeEstimate,
} from './gas-util';

type DeeplyPartial<T> = T extends Record<any, any>
  ? { [K in keyof T]?: DeeplyPartial<T[K]> }
  : T;

const mockEIP1559ApiResponses = [
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
  },
];

describe('gas-util', () => {
  describe('normalizeGWEIDecimalNumbers', () => {
    describe('given a number', () => {
      it('should return a whole number as a string if no normalization is needed', () => {
        expect(normalizeGWEIDecimalNumbers(1)).toBe('1');
        expect(normalizeGWEIDecimalNumbers(123)).toBe('123');
        expect(normalizeGWEIDecimalNumbers(101)).toBe('101');
        expect(normalizeGWEIDecimalNumbers(1234)).toBe('1234');
        expect(normalizeGWEIDecimalNumbers(1000)).toBe('1000');
      });

      it('should return a decimal number greater than 1 as a string if no normalization is needed', () => {
        expect(normalizeGWEIDecimalNumbers(1.1)).toBe('1.1');
        expect(normalizeGWEIDecimalNumbers(123.01)).toBe('123.01');
        expect(normalizeGWEIDecimalNumbers(101.001)).toBe('101.001');
        expect(normalizeGWEIDecimalNumbers(100.001)).toBe('100.001');
        expect(normalizeGWEIDecimalNumbers(1234.567)).toBe('1234.567');
      });

      it('should return a decimal number less than 1 as a string if no normalization is needed', () => {
        expect(normalizeGWEIDecimalNumbers(0.1)).toBe('0.1');
        expect(normalizeGWEIDecimalNumbers(0.01)).toBe('0.01');
        expect(normalizeGWEIDecimalNumbers(0.001)).toBe('0.001');
        expect(normalizeGWEIDecimalNumbers(0.567)).toBe('0.567');
      });

      it('should round a decimal number to 9 places before converting to a string', () => {
        expect(normalizeGWEIDecimalNumbers(1.0000000162)).toBe('1.000000016');
        expect(normalizeGWEIDecimalNumbers(1.0000000165)).toBe('1.000000017');
        expect(normalizeGWEIDecimalNumbers(1.0000000199)).toBe('1.00000002');
        expect(normalizeGWEIDecimalNumbers(1.9999999999)).toBe('2');
        expect(normalizeGWEIDecimalNumbers(1.0000005998)).toBe('1.0000006');
        expect(normalizeGWEIDecimalNumbers(123456.0000005998)).toBe(
          '123456.0000006',
        );
        expect(normalizeGWEIDecimalNumbers(1.000000016025)).toBe('1.000000016');
        expect(normalizeGWEIDecimalNumbers(1.0000000160000028)).toBe(
          '1.000000016',
        );
        expect(normalizeGWEIDecimalNumbers(1.000000016522)).toBe('1.000000017');
        expect(normalizeGWEIDecimalNumbers(1.000000016800022)).toBe(
          '1.000000017',
        );
      });

      it('should convert NaN to 0', () => {
        expect(normalizeGWEIDecimalNumbers(NaN)).toBe('0');
      });
    });

    describe('given a string', () => {
      it('should remove trailing zeroes', () => {
        expect(normalizeGWEIDecimalNumbers('0.5000')).toBe('0.5');
        expect(normalizeGWEIDecimalNumbers('123.002300')).toBe('123.0023');
        expect(normalizeGWEIDecimalNumbers('123.002300000000')).toBe(
          '123.0023',
        );
        expect(normalizeGWEIDecimalNumbers('0.00000200000')).toBe('0.000002');
      });

      it('should add leading zeroes if necessary', () => {
        expect(normalizeGWEIDecimalNumbers('.1')).toBe('0.1');
        expect(normalizeGWEIDecimalNumbers('.01')).toBe('0.01');
        expect(normalizeGWEIDecimalNumbers('.001')).toBe('0.001');
        expect(normalizeGWEIDecimalNumbers('.567')).toBe('0.567');
      });
    });
  });

  describe('fetchGasEstimates', () => {
    it('should fetch external gasFeeEstimates when data is valid', async () => {
      const scope = nock('https://not-a-real-url/')
        .get(/.+/u)
        .reply(200, mockEIP1559ApiResponses[0])
        .persist();
      const result = await fetchGasEstimates('https://not-a-real-url/');
      expect(result).toMatchObject(mockEIP1559ApiResponses[0]);
      scope.done();
      nock.cleanAll();
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
      nock.cleanAll();
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
      nock.cleanAll();
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
      nock.cleanAll();
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
      nock.cleanAll();
    });
  });

  describe('fetchEthGasPriceEstimate', () => {
    it('should fetch the current gas price and returns it as GWEI within an object', async () => {
      const ethQuery = {
        gasPrice(callback: any) {
          callback(null, toHex('150340000000'));
        },
      };

      const estimate = await fetchEthGasPriceEstimate(ethQuery);

      expect(estimate).toStrictEqual({ gasPrice: '150.34' });
    });
  });

  describe('calculateTimeEstimate', () => {
    /**
     * Allows building a GasFeeEstimates object in tests by specifying only the
     * properties of the object that matter to those tests.
     *
     * @param overrides - The properties you want to override in the new
     * GasFeeEstimates object.
     * @returns The built GasFeeEstimates object.
     */
    function buildGasFeeEstimates(
      overrides: DeeplyPartial<GasFeeEstimates>,
    ): GasFeeEstimates {
      const { low = {}, medium = {}, high = {}, estimatedBaseFee } = overrides;
      return {
        low: {
          minWaitTimeEstimate: 0,
          maxWaitTimeEstimate: 0,
          suggestedMaxPriorityFeePerGas: '0',
          suggestedMaxFeePerGas: '0',
          ...low,
        },
        medium: {
          minWaitTimeEstimate: 0,
          maxWaitTimeEstimate: 0,
          suggestedMaxPriorityFeePerGas: '0',
          suggestedMaxFeePerGas: '0',
          ...medium,
        },
        high: {
          minWaitTimeEstimate: 0,
          maxWaitTimeEstimate: 0,
          suggestedMaxPriorityFeePerGas: '0',
          suggestedMaxFeePerGas: '0',
          ...high,
        },
        estimatedBaseFee,
        historicalBaseFeeRange: null,
        baseFeeTrend: null,
        latestPriorityFeeRange: null,
        historicalPriorityFeeRange: null,
        priorityFeeTrend: null,
        networkCongestion: null,
      };
    }

    describe('if the given priority fee is less than the given max fee minus the latest base fee', () => {
      let maxPriorityFeePerGas: string;
      let maxFeePerGas: string;
      let estimatedBaseFee: string;

      beforeEach(() => {
        maxPriorityFeePerGas = '1';
        maxFeePerGas = '102';
        estimatedBaseFee = '100';
      });

      describe('and the given priority fee does not reach any of the suggested priority fee thresholds', () => {
        it('should return no lower bound and an unknown upper bound', () => {
          const timeBounds = calculateTimeEstimate(
            maxPriorityFeePerGas,
            maxFeePerGas,
            buildGasFeeEstimates({
              estimatedBaseFee,
              low: {
                suggestedMaxPriorityFeePerGas: (
                  Number(maxPriorityFeePerGas) + 0.5
                ).toString(),
              },
            }),
          );

          expect(timeBounds).toStrictEqual({
            lowerTimeBound: null,
            upperTimeBound: 'unknown',
          });
        });
      });

      describe('and the given priority fee reaches the suggested low priority fee threshold, but does not reach the medium priority fee threshold', () => {
        it('should return a lower and upper bound equal to the low min and max wait time', () => {
          const timeBounds = calculateTimeEstimate(
            maxPriorityFeePerGas,
            maxFeePerGas,
            buildGasFeeEstimates({
              estimatedBaseFee,
              low: {
                minWaitTimeEstimate: 1000,
                maxWaitTimeEstimate: 2000,
                suggestedMaxPriorityFeePerGas: maxPriorityFeePerGas,
              },
              medium: {
                suggestedMaxPriorityFeePerGas: (
                  Number(maxPriorityFeePerGas) + 0.5
                ).toString(),
              },
            }),
          );

          expect(timeBounds).toStrictEqual({
            lowerTimeBound: 1000,
            upperTimeBound: 2000,
          });
        });
      });

      describe('and the given priority fee exceeds the suggested low priority fee threshold, but does reach the medium priority fee threshold', () => {
        it('should return a lower and upper bound equal to the low min and max wait time', () => {
          const timeBounds = calculateTimeEstimate(
            maxPriorityFeePerGas,
            maxFeePerGas,
            buildGasFeeEstimates({
              estimatedBaseFee,
              low: {
                minWaitTimeEstimate: 1000,
                maxWaitTimeEstimate: 2000,
                suggestedMaxPriorityFeePerGas: (
                  Number(maxPriorityFeePerGas) - 0.1
                ).toString(),
              },
              medium: {
                suggestedMaxPriorityFeePerGas: (
                  Number(maxPriorityFeePerGas) + 0.5
                ).toString(),
              },
            }),
          );

          expect(timeBounds).toStrictEqual({
            lowerTimeBound: 1000,
            upperTimeBound: 2000,
          });
        });
      });

      describe('and the given priority fee reaches the suggested medium priority fee threshold, but does not cross the suggested high priority fee threshold', () => {
        it('should return a lower and upper bound equal to the medium min and max wait time', () => {
          const timeBounds = calculateTimeEstimate(
            maxPriorityFeePerGas,
            maxFeePerGas,
            buildGasFeeEstimates({
              estimatedBaseFee,
              low: {
                suggestedMaxPriorityFeePerGas: (
                  Number(maxPriorityFeePerGas) - 0.1
                ).toString(),
              },
              medium: {
                minWaitTimeEstimate: 1000,
                maxWaitTimeEstimate: 2000,
                suggestedMaxPriorityFeePerGas: maxPriorityFeePerGas,
              },
              high: {
                suggestedMaxPriorityFeePerGas: (
                  Number(maxPriorityFeePerGas) + 0.5
                ).toString(),
              },
            }),
          );

          expect(timeBounds).toStrictEqual({
            lowerTimeBound: 1000,
            upperTimeBound: 2000,
          });
        });
      });

      describe('and the given priority fee exceeds the suggested medium priority fee threshold, but does not cross the suggested high priority fee threshold', () => {
        it('should return a lower and upper bound equal to the medium min and max wait time', () => {
          const timeBounds = calculateTimeEstimate(
            maxPriorityFeePerGas,
            maxFeePerGas,
            buildGasFeeEstimates({
              estimatedBaseFee,
              low: {
                suggestedMaxPriorityFeePerGas: (
                  Number(maxPriorityFeePerGas) - 0.2
                ).toString(),
              },
              medium: {
                minWaitTimeEstimate: 1000,
                maxWaitTimeEstimate: 2000,
                suggestedMaxPriorityFeePerGas: (
                  Number(maxPriorityFeePerGas) - 0.1
                ).toString(),
              },
              high: {
                suggestedMaxPriorityFeePerGas: (
                  Number(maxPriorityFeePerGas) + 0.5
                ).toString(),
              },
            }),
          );

          expect(timeBounds).toStrictEqual({
            lowerTimeBound: 1000,
            upperTimeBound: 2000,
          });
        });
      });

      describe('and the given priority fee reaches the suggested high priority fee threshold', () => {
        it('should return a lower and upper bound equal to the high min and max wait time', () => {
          const timeBounds = calculateTimeEstimate(
            maxPriorityFeePerGas,
            maxFeePerGas,
            buildGasFeeEstimates({
              estimatedBaseFee,
              low: {
                suggestedMaxPriorityFeePerGas: (
                  Number(maxPriorityFeePerGas) - 0.2
                ).toString(),
              },
              medium: {
                suggestedMaxPriorityFeePerGas: (
                  Number(maxPriorityFeePerGas) - 0.1
                ).toString(),
              },
              high: {
                minWaitTimeEstimate: 1000,
                maxWaitTimeEstimate: 2000,
                suggestedMaxPriorityFeePerGas: maxPriorityFeePerGas,
              },
            }),
          );

          expect(timeBounds).toStrictEqual({
            lowerTimeBound: 1000,
            upperTimeBound: 2000,
          });
        });
      });

      describe('and the given priority fee exceeds the suggested high priority fee threshold', () => {
        it('should return a lower bound of 0 and an upper bound equal to the high max wait time', () => {
          const timeBounds = calculateTimeEstimate(
            maxPriorityFeePerGas,
            maxFeePerGas,
            buildGasFeeEstimates({
              estimatedBaseFee,
              low: {
                suggestedMaxPriorityFeePerGas: (
                  Number(maxPriorityFeePerGas) - 0.3
                ).toString(),
              },
              medium: {
                suggestedMaxPriorityFeePerGas: (
                  Number(maxPriorityFeePerGas) - 0.2
                ).toString(),
              },
              high: {
                maxWaitTimeEstimate: 2000,
                suggestedMaxPriorityFeePerGas: (
                  Number(maxPriorityFeePerGas) - 0.1
                ).toString(),
              },
            }),
          );

          expect(timeBounds).toStrictEqual({
            lowerTimeBound: 0,
            upperTimeBound: 2000,
          });
        });
      });
    });

    describe('if the given priority fee is equal to the given max fee minus the latest base fee', () => {
      let maxPriorityFeePerGas: string;
      let maxFeePerGas: string;
      let estimatedBaseFee: string;

      beforeEach(() => {
        maxPriorityFeePerGas = '1';
        maxFeePerGas = '101';
        estimatedBaseFee = '100';
      });

      describe('and the given priority fee does not reach any of the suggested priority fee thresholds', () => {
        it('should return no lower bound and an unknown upper bound', () => {
          const timeBounds = calculateTimeEstimate(
            maxPriorityFeePerGas,
            maxFeePerGas,
            buildGasFeeEstimates({
              estimatedBaseFee,
              low: {
                suggestedMaxPriorityFeePerGas: (
                  Number(maxPriorityFeePerGas) + 0.5
                ).toString(),
              },
            }),
          );

          expect(timeBounds).toStrictEqual({
            lowerTimeBound: null,
            upperTimeBound: 'unknown',
          });
        });
      });

      describe('and the given priority fee reaches the suggested low priority fee threshold, but does reach the medium priority fee threshold', () => {
        it('should return a lower and upper bound equal to the low min and max wait time', () => {
          const timeBounds = calculateTimeEstimate(
            maxPriorityFeePerGas,
            maxFeePerGas,
            buildGasFeeEstimates({
              estimatedBaseFee,
              low: {
                minWaitTimeEstimate: 1000,
                maxWaitTimeEstimate: 2000,
                suggestedMaxPriorityFeePerGas: maxPriorityFeePerGas,
              },
              medium: {
                suggestedMaxPriorityFeePerGas: (
                  Number(maxPriorityFeePerGas) + 0.5
                ).toString(),
              },
            }),
          );

          expect(timeBounds).toStrictEqual({
            lowerTimeBound: 1000,
            upperTimeBound: 2000,
          });
        });
      });

      describe('and the given priority fee exceeds the suggested low priority fee threshold, but does reach the medium priority fee threshold', () => {
        it('should return a lower and upper bound equal to the low min and max wait time', () => {
          const timeBounds = calculateTimeEstimate(
            maxPriorityFeePerGas,
            maxFeePerGas,
            buildGasFeeEstimates({
              estimatedBaseFee,
              low: {
                minWaitTimeEstimate: 1000,
                maxWaitTimeEstimate: 2000,
                suggestedMaxPriorityFeePerGas: (
                  Number(maxPriorityFeePerGas) - 0.1
                ).toString(),
              },
              medium: {
                suggestedMaxPriorityFeePerGas: (
                  Number(maxPriorityFeePerGas) + 0.5
                ).toString(),
              },
            }),
          );

          expect(timeBounds).toStrictEqual({
            lowerTimeBound: 1000,
            upperTimeBound: 2000,
          });
        });
      });

      describe('and the given priority fee reaches the suggested medium priority fee threshold, but does not cross the suggested high priority fee threshold', () => {
        it('should return a lower and upper bound equal to the medium min and max wait time', () => {
          const timeBounds = calculateTimeEstimate(
            maxPriorityFeePerGas,
            maxFeePerGas,
            buildGasFeeEstimates({
              estimatedBaseFee,
              low: {
                suggestedMaxPriorityFeePerGas: (
                  Number(maxPriorityFeePerGas) - 0.1
                ).toString(),
              },
              medium: {
                minWaitTimeEstimate: 1000,
                maxWaitTimeEstimate: 2000,
                suggestedMaxPriorityFeePerGas: maxPriorityFeePerGas,
              },
              high: {
                suggestedMaxPriorityFeePerGas: (
                  Number(maxPriorityFeePerGas) + 0.5
                ).toString(),
              },
            }),
          );

          expect(timeBounds).toStrictEqual({
            lowerTimeBound: 1000,
            upperTimeBound: 2000,
          });
        });
      });

      describe('and the given priority fee exceeds the suggested medium priority fee threshold, but does not cross the suggested high priority fee threshold', () => {
        it('should return a lower and upper bound equal to the medium min and max wait time', () => {
          const timeBounds = calculateTimeEstimate(
            maxPriorityFeePerGas,
            maxFeePerGas,
            buildGasFeeEstimates({
              estimatedBaseFee,
              low: {
                suggestedMaxPriorityFeePerGas: (
                  Number(maxPriorityFeePerGas) - 0.2
                ).toString(),
              },
              medium: {
                minWaitTimeEstimate: 1000,
                maxWaitTimeEstimate: 2000,
                suggestedMaxPriorityFeePerGas: (
                  Number(maxPriorityFeePerGas) - 0.1
                ).toString(),
              },
              high: {
                suggestedMaxPriorityFeePerGas: (
                  Number(maxPriorityFeePerGas) + 0.5
                ).toString(),
              },
            }),
          );

          expect(timeBounds).toStrictEqual({
            lowerTimeBound: 1000,
            upperTimeBound: 2000,
          });
        });
      });

      describe('and the given priority fee reaches the suggested high priority fee threshold', () => {
        it('should return a lower and upper bound equal to the high min and max wait time', () => {
          const timeBounds = calculateTimeEstimate(
            maxPriorityFeePerGas,
            maxFeePerGas,
            buildGasFeeEstimates({
              estimatedBaseFee,
              low: {
                suggestedMaxPriorityFeePerGas: (
                  Number(maxPriorityFeePerGas) - 0.2
                ).toString(),
              },
              medium: {
                suggestedMaxPriorityFeePerGas: (
                  Number(maxPriorityFeePerGas) - 0.1
                ).toString(),
              },
              high: {
                minWaitTimeEstimate: 1000,
                maxWaitTimeEstimate: 2000,
                suggestedMaxPriorityFeePerGas: maxPriorityFeePerGas,
              },
            }),
          );

          expect(timeBounds).toStrictEqual({
            lowerTimeBound: 1000,
            upperTimeBound: 2000,
          });
        });
      });

      describe('and the given priority fee exceeds the suggested high priority fee threshold', () => {
        it('should return a lower bound of 0 and an upper bound equal to the high max wait time', () => {
          const timeBounds = calculateTimeEstimate(
            maxPriorityFeePerGas,
            maxFeePerGas,
            buildGasFeeEstimates({
              estimatedBaseFee,
              low: {
                suggestedMaxPriorityFeePerGas: (
                  Number(maxPriorityFeePerGas) - 0.3
                ).toString(),
              },
              medium: {
                suggestedMaxPriorityFeePerGas: (
                  Number(maxPriorityFeePerGas) - 0.2
                ).toString(),
              },
              high: {
                maxWaitTimeEstimate: 2000,
                suggestedMaxPriorityFeePerGas: (
                  Number(maxPriorityFeePerGas) - 0.1
                ).toString(),
              },
            }),
          );

          expect(timeBounds).toStrictEqual({
            lowerTimeBound: 0,
            upperTimeBound: 2000,
          });
        });
      });
    });

    describe('if the given priority fee is greater than the given max fee minus the latest base fee (aka the effective priority fee)', () => {
      let maxPriorityFeePerGas: string;
      let maxFeePerGas: string;
      let estimatedBaseFee: string;
      let effectivePriorityFeePerGas: string;

      beforeEach(() => {
        maxPriorityFeePerGas = '2';
        effectivePriorityFeePerGas = '1';
        estimatedBaseFee = '100';
        maxFeePerGas = (
          Number(estimatedBaseFee) + Number(effectivePriorityFeePerGas)
        ).toString();
      });

      describe('and the effective priority fee does not reach any of the suggested priority fee thresholds', () => {
        it('should return no lower bound and an unknown upper bound', () => {
          const timeBounds = calculateTimeEstimate(
            maxPriorityFeePerGas,
            maxFeePerGas,
            buildGasFeeEstimates({
              estimatedBaseFee,
              low: {
                suggestedMaxPriorityFeePerGas: (
                  Number(effectivePriorityFeePerGas) + 0.5
                ).toString(),
              },
            }),
          );

          expect(timeBounds).toStrictEqual({
            lowerTimeBound: null,
            upperTimeBound: 'unknown',
          });
        });
      });

      describe('and the effective priority fee reaches the suggested low priority fee threshold, but does reach the medium priority fee threshold', () => {
        it('should return a lower and upper bound equal to the low min and max wait time', () => {
          const timeBounds = calculateTimeEstimate(
            maxPriorityFeePerGas,
            maxFeePerGas,
            buildGasFeeEstimates({
              estimatedBaseFee,
              low: {
                minWaitTimeEstimate: 1000,
                maxWaitTimeEstimate: 2000,
                suggestedMaxPriorityFeePerGas: effectivePriorityFeePerGas,
              },
              medium: {
                suggestedMaxPriorityFeePerGas: (
                  Number(effectivePriorityFeePerGas) + 0.5
                ).toString(),
              },
            }),
          );

          expect(timeBounds).toStrictEqual({
            lowerTimeBound: 1000,
            upperTimeBound: 2000,
          });
        });
      });

      describe('and the effective priority fee exceeds the suggested low priority fee threshold, but does reach the medium priority fee threshold', () => {
        it('should return a lower and upper bound equal to the low min and max wait time', () => {
          const timeBounds = calculateTimeEstimate(
            maxPriorityFeePerGas,
            maxFeePerGas,
            buildGasFeeEstimates({
              estimatedBaseFee,
              low: {
                minWaitTimeEstimate: 1000,
                maxWaitTimeEstimate: 2000,
                suggestedMaxPriorityFeePerGas: (
                  Number(effectivePriorityFeePerGas) - 0.1
                ).toString(),
              },
              medium: {
                suggestedMaxPriorityFeePerGas: (
                  Number(effectivePriorityFeePerGas) + 0.5
                ).toString(),
              },
            }),
          );

          expect(timeBounds).toStrictEqual({
            lowerTimeBound: 1000,
            upperTimeBound: 2000,
          });
        });
      });

      describe('and the effective priority fee reaches the suggested medium priority fee threshold, but does not cross the suggested high priority fee threshold', () => {
        it('should return a lower and upper bound equal to the medium min and max wait time', () => {
          const timeBounds = calculateTimeEstimate(
            maxPriorityFeePerGas,
            maxFeePerGas,
            buildGasFeeEstimates({
              estimatedBaseFee,
              low: {
                suggestedMaxPriorityFeePerGas: (
                  Number(effectivePriorityFeePerGas) - 0.1
                ).toString(),
              },
              medium: {
                minWaitTimeEstimate: 1000,
                maxWaitTimeEstimate: 2000,
                suggestedMaxPriorityFeePerGas: effectivePriorityFeePerGas,
              },
              high: {
                suggestedMaxPriorityFeePerGas: (
                  Number(effectivePriorityFeePerGas) + 0.5
                ).toString(),
              },
            }),
          );

          expect(timeBounds).toStrictEqual({
            lowerTimeBound: 1000,
            upperTimeBound: 2000,
          });
        });
      });

      describe('and the effective priority fee exceeds the suggested medium priority fee threshold, but does not cross the suggested high priority fee threshold', () => {
        it('should return a lower and upper bound equal to the medium min and max wait time', () => {
          const timeBounds = calculateTimeEstimate(
            maxPriorityFeePerGas,
            maxFeePerGas,
            buildGasFeeEstimates({
              estimatedBaseFee,
              low: {
                suggestedMaxPriorityFeePerGas: (
                  Number(effectivePriorityFeePerGas) - 0.2
                ).toString(),
              },
              medium: {
                minWaitTimeEstimate: 1000,
                maxWaitTimeEstimate: 2000,
                suggestedMaxPriorityFeePerGas: (
                  Number(effectivePriorityFeePerGas) - 0.1
                ).toString(),
              },
              high: {
                suggestedMaxPriorityFeePerGas: (
                  Number(effectivePriorityFeePerGas) + 0.5
                ).toString(),
              },
            }),
          );

          expect(timeBounds).toStrictEqual({
            lowerTimeBound: 1000,
            upperTimeBound: 2000,
          });
        });
      });

      describe('and the effective priority fee reaches the suggested high priority fee threshold', () => {
        it('should return a lower and upper bound equal to the high min and max wait time', () => {
          const timeBounds = calculateTimeEstimate(
            maxPriorityFeePerGas,
            maxFeePerGas,
            buildGasFeeEstimates({
              estimatedBaseFee,
              low: {
                suggestedMaxPriorityFeePerGas: (
                  Number(effectivePriorityFeePerGas) - 0.2
                ).toString(),
              },
              medium: {
                suggestedMaxPriorityFeePerGas: (
                  Number(effectivePriorityFeePerGas) - 0.1
                ).toString(),
              },
              high: {
                minWaitTimeEstimate: 1000,
                maxWaitTimeEstimate: 2000,
                suggestedMaxPriorityFeePerGas: effectivePriorityFeePerGas,
              },
            }),
          );

          expect(timeBounds).toStrictEqual({
            lowerTimeBound: 1000,
            upperTimeBound: 2000,
          });
        });
      });

      describe('and the effective priority fee exceeds the suggested high priority fee threshold', () => {
        it('should return a lower bound of 0 and an upper bound equal to the high max wait time', () => {
          const timeBounds = calculateTimeEstimate(
            maxPriorityFeePerGas,
            maxFeePerGas,
            buildGasFeeEstimates({
              estimatedBaseFee,
              low: {
                suggestedMaxPriorityFeePerGas: (
                  Number(effectivePriorityFeePerGas) - 0.3
                ).toString(),
              },
              medium: {
                suggestedMaxPriorityFeePerGas: (
                  Number(effectivePriorityFeePerGas) - 0.2
                ).toString(),
              },
              high: {
                maxWaitTimeEstimate: 2000,
                suggestedMaxPriorityFeePerGas: (
                  Number(effectivePriorityFeePerGas) - 0.1
                ).toString(),
              },
            }),
          );

          expect(timeBounds).toStrictEqual({
            lowerTimeBound: 0,
            upperTimeBound: 2000,
          });
        });
      });
    });
  });
});
