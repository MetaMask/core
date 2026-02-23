import { BigNumber } from 'bignumber.js';

import { getFiatValueFromUsd, sumAmounts } from './amounts';

describe('Amounts utils', () => {
  describe('sumAmounts', () => {
    it('returns zeroes when no amounts are provided', () => {
      expect(sumAmounts([])).toStrictEqual({
        fiat: '0',
        human: '0',
        raw: '0',
        usd: '0',
      });
    });

    it('sums all amount properties', () => {
      expect(
        sumAmounts([
          {
            fiat: '1.1',
            human: '2.2',
            raw: '3',
            usd: '4.4',
          },
          {
            fiat: '5.5',
            human: '6.6',
            raw: '7',
            usd: '8.8',
          },
        ]),
      ).toStrictEqual({
        fiat: '6.6',
        human: '8.8',
        raw: '10',
        usd: '13.2',
      });
    });
  });

  describe('getFiatValueFromUsd', () => {
    it('converts usd value to fiat using the provided rate', () => {
      expect(
        getFiatValueFromUsd(new BigNumber('2.5'), new BigNumber('1.2')),
      ).toStrictEqual({
        fiat: '3',
        usd: '2.5',
      });
    });
  });
});
