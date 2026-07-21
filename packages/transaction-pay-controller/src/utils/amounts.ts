import { BigNumber } from 'bignumber.js';

import type { Amount, FiatValue } from '../types';

/**
 * Sum a list of amounts.
 *
 * @param amounts - List of amounts.
 * @returns Total amount.
 */
export function sumAmounts(amounts: Amount[]): Amount {
  return amounts.reduce(
    (total, amount) => ({
      fiat: new BigNumber(total.fiat).plus(amount.fiat).toString(10),
      human: new BigNumber(total.human).plus(amount.human).toString(10),
      raw: new BigNumber(total.raw).plus(amount.raw).toString(10),
      usd: new BigNumber(total.usd).plus(amount.usd).toString(10),
    }),
    {
      fiat: '0',
      human: '0',
      raw: '0',
      usd: '0',
    },
  );
}

/**
 * Converts USD value to fiat value.
 *
 * @param usdValue - USD value.
 * @param usdToFiatRate - USD to fiat rate.
 * @returns Fiat value.
 */
export function getFiatValueFromUsd(
  usdValue: BigNumber,
  usdToFiatRate: BigNumber,
): FiatValue {
  const fiatValue = usdValue.multipliedBy(usdToFiatRate);

  return {
    usd: usdValue.toString(10),
    fiat: fiatValue.toString(10),
  };
}
