import {
  selectHasEntitlement,
  selectIsActiveSubscriber,
  selectIsUsageAvailable,
} from './selectors.js';
import { MoneyAccountFeature } from './types.js';

describe('money account subscription selectors', () => {
  it('reports whether the current user is an active subscriber', () => {
    expect(
      selectIsActiveSubscriber({
        entitlements: null,
        isSubscriber: true,
        lastHydratedAt: null,
        plan: null,
      }),
    ).toBe(true);
  });

  it('returns true only for enabled entitlements', () => {
    const state = {
      entitlements: {
        perpsFeeWaiver: false,
        predictFreeTx: true,
        premiumApy: false,
        swapFeeWaiver: true,
      },
      isSubscriber: true,
      lastHydratedAt: 1,
      plan: 'premium',
    };

    expect(selectHasEntitlement(state, MoneyAccountFeature.SwapFeeWaiver)).toBe(
      true,
    );
    expect(
      selectHasEntitlement(state, MoneyAccountFeature.PerpsFeeWaiver),
    ).toBe(false);
  });

  it('keeps usage availability aligned with entitlement booleans for now', () => {
    const state = {
      entitlements: {
        perpsFeeWaiver: true,
        predictFreeTx: false,
        premiumApy: true,
        swapFeeWaiver: false,
      },
      isSubscriber: true,
      lastHydratedAt: 1,
      plan: 'premium',
    };

    expect(
      selectIsUsageAvailable(state, MoneyAccountFeature.PerpsFeeWaiver),
    ).toBe(true);
    expect(
      selectIsUsageAvailable(state, MoneyAccountFeature.SwapFeeWaiver),
    ).toBe(false);
  });

  it('fails closed when entitlements are absent', () => {
    const state = {
      entitlements: null,
      isSubscriber: false,
      lastHydratedAt: null,
      plan: null,
    };

    expect(selectHasEntitlement(state, MoneyAccountFeature.PremiumApy)).toBe(
      false,
    );
    expect(
      selectIsUsageAvailable(state, MoneyAccountFeature.PredictFreeTx),
    ).toBe(false);
  });
});
