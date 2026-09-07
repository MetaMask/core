import { SubscriptionDelegationServiceErrorMessage } from '../constants.js';
import { RECURRING_INTERVALS } from '../types.js';

import { calculatePeriodAmount, getPeriodDuration } from './amount.js';

describe('calculatePeriodAmount', () => {
  it('returns the same amount when decimals match', () => {
    expect(
      calculatePeriodAmount({
        unitAmount: 1_000_000,
        unitDecimals: 6,
        tokenDecimals: 6,
      }),
    ).toBe(1_000_000n);
  });

  it('scales up from 2 to 18 decimals', () => {
    expect(
      calculatePeriodAmount({
        unitAmount: 10_00,
        unitDecimals: 2,
        tokenDecimals: 18,
      }),
    ).toBe(10n * 10n ** 18n);
  });

  it('scales up from 2 to 6 decimals', () => {
    expect(
      calculatePeriodAmount({
        unitAmount: 10_00,
        unitDecimals: 2,
        tokenDecimals: 6,
      }),
    ).toBe(10n * 10n ** 6n);
  });

  it('scales down when the amount divides evenly', () => {
    expect(
      calculatePeriodAmount({
        unitAmount: 1_000_000,
        unitDecimals: 6,
        tokenDecimals: 2,
      }),
    ).toBe(100n);
  });

  it('throws on lossy downscaling', () => {
    expect(() =>
      calculatePeriodAmount({
        unitAmount: 1_000_001,
        unitDecimals: 6,
        tokenDecimals: 2,
      }),
    ).toThrow(SubscriptionDelegationServiceErrorMessage.LossyAmountScale);
  });

  it.each([
    { unitAmount: -1, unitDecimals: 2, tokenDecimals: 2 },
    { unitAmount: 1.5, unitDecimals: 2, tokenDecimals: 2 },
  ])('throws on invalid unitAmount %#', (params) => {
    expect(() => calculatePeriodAmount(params)).toThrow(
      SubscriptionDelegationServiceErrorMessage.InvalidAmount,
    );
  });

  it.each([
    { unitAmount: 1, unitDecimals: -1, tokenDecimals: 2 },
    { unitAmount: 1, unitDecimals: 1.5, tokenDecimals: 2 },
    { unitAmount: 1, unitDecimals: 2, tokenDecimals: -1 },
    { unitAmount: 1, unitDecimals: 2, tokenDecimals: 1.5 },
  ])('throws on invalid decimals %#', (params) => {
    expect(() => calculatePeriodAmount(params)).toThrow(
      SubscriptionDelegationServiceErrorMessage.InvalidDecimals,
    );
  });
});

describe('getPeriodDuration', () => {
  it('returns 28 days in seconds for month', () => {
    expect(getPeriodDuration(RECURRING_INTERVALS.month)).toBe(28 * 86_400);
  });

  it('returns 365 days in seconds for year', () => {
    expect(getPeriodDuration(RECURRING_INTERVALS.year)).toBe(365 * 86_400);
  });

  it('throws for an unsupported interval', () => {
    expect(() =>
      getPeriodDuration('week' as (typeof RECURRING_INTERVALS)['month']),
    ).toThrow(
      SubscriptionDelegationServiceErrorMessage.UnsupportedRecurringInterval,
    );
  });
});
