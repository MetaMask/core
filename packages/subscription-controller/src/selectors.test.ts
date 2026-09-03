import {
  selectHasEntitlement,
  selectIsMoneyAccountPlusSubscriber,
  selectIsUsageAvailable,
} from './selectors.js';
import { getDefaultSubscriptionControllerState } from './SubscriptionController.js';
import { MoneyAccountFeature, PRODUCT_TYPES } from './types.js';

describe('subscription selectors', () => {
  it('reports whether Money Account Plus entitlements are present', () => {
    expect(
      selectIsMoneyAccountPlusSubscriber({
        ...getDefaultSubscriptionControllerState(),
        productEntitlements: {
          [PRODUCT_TYPES.MONEY_ACCOUNT_PLUS]: {
            plan: 'premium',
            entitlements: {},
          },
        },
      }),
    ).toBe(true);
  });

  it('returns true only for enabled Money Account Plus entitlements', () => {
    const state = {
      ...getDefaultSubscriptionControllerState(),
      productEntitlements: {
        [PRODUCT_TYPES.MONEY_ACCOUNT_PLUS]: {
          plan: 'premium',
          entitlements: {
            perpsFeeWaiver: false,
            swapFeeWaiver: true,
          },
        },
      },
    };

    expect(selectHasEntitlement(state, MoneyAccountFeature.SwapFeeWaiver)).toBe(
      true,
    );
    expect(
      selectHasEntitlement(state, MoneyAccountFeature.PerpsFeeWaiver),
    ).toBe(false);
  });

  it('keeps usage availability aligned with entitlement booleans', () => {
    const state = {
      ...getDefaultSubscriptionControllerState(),
      productEntitlements: {
        [PRODUCT_TYPES.MONEY_ACCOUNT_PLUS]: {
          plan: 'premium',
          entitlements: {
            premiumApy: true,
          },
        },
      },
    };

    expect(selectIsUsageAvailable(state, MoneyAccountFeature.PremiumApy)).toBe(
      true,
    );
  });

  it('fails closed when Money Account Plus entitlements are absent', () => {
    const state = getDefaultSubscriptionControllerState();

    expect(selectIsMoneyAccountPlusSubscriber(state)).toBe(false);
    expect(selectHasEntitlement(state, MoneyAccountFeature.PremiumApy)).toBe(
      false,
    );
    expect(
      selectIsUsageAvailable(state, MoneyAccountFeature.PredictFreeTx),
    ).toBe(false);
  });
});
