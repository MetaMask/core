import { BigNumber } from 'bignumber.js';

/**
 * Account return on equity in percent, `100 x unrealizedPnl / marginUsed`.
 * Internal: `calculateAccountReturnOnEquity` is the public form.
 *
 * @param unrealizedPnl - Total unrealized PnL.
 * @param marginUsed - Total margin used.
 * @returns The exact rate, which is not finite for a non-finite input, or
 * undefined when the margin is not positive.
 */
export function accountReturnOnEquity(
  unrealizedPnl: BigNumber.Value,
  marginUsed: BigNumber.Value,
): BigNumber | undefined {
  const margin = new BigNumber(marginUsed);
  if (!margin.isGreaterThan(0)) {
    return undefined;
  }
  return new BigNumber(unrealizedPnl).multipliedBy(100).dividedBy(margin);
}
