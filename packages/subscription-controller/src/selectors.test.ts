import {
  selectHasProductEntitlements,
  selectHasEntitlement,
  selectIsUsageAvailable,
} from './selectors.js';
import { getDefaultSubscriptionControllerState } from './SubscriptionController.js';
import type { SubscriptionControllerState } from './SubscriptionController.js';
import { MoneyAccountFeature, PRODUCT_TYPES, ShieldFeature } from './types.js';

const STATE_WITH_PRODUCT_ENTITLEMENTS: SubscriptionControllerState = {
  ...getDefaultSubscriptionControllerState(),
  productEntitlements: {
    [PRODUCT_TYPES.MONEY_ACCOUNT_PLUS]: {
      plan: 'premium',
      entitlements: {
        [MoneyAccountFeature.PerpsFeeWaiver]: false,
        [MoneyAccountFeature.PredictFreeTx]: false,
        [MoneyAccountFeature.PremiumApy]: true,
        [MoneyAccountFeature.SwapFeeWaiver]: true,
      },
    },
    [PRODUCT_TYPES.SHIELD]: {
      entitlements: {
        [ShieldFeature.PrioritySupport]: false,
        [ShieldFeature.ShieldClaim]: true,
      },
    },
  },
};

describe('subscription selectors', () => {
  it('reports whether product entitlements are present', () => {
    expect(
      selectHasProductEntitlements(
        STATE_WITH_PRODUCT_ENTITLEMENTS,
        PRODUCT_TYPES.MONEY_ACCOUNT_PLUS,
      ),
    ).toBe(true);
    expect(
      selectHasProductEntitlements(
        STATE_WITH_PRODUCT_ENTITLEMENTS,
        PRODUCT_TYPES.SHIELD,
      ),
    ).toBe(true);
  });

  it('returns true only for enabled product entitlements', () => {
    expect(
      selectHasEntitlement(
        STATE_WITH_PRODUCT_ENTITLEMENTS,
        PRODUCT_TYPES.MONEY_ACCOUNT_PLUS,
        MoneyAccountFeature.SwapFeeWaiver,
      ),
    ).toBe(true);
    expect(
      selectHasEntitlement(
        STATE_WITH_PRODUCT_ENTITLEMENTS,
        PRODUCT_TYPES.MONEY_ACCOUNT_PLUS,
        MoneyAccountFeature.PerpsFeeWaiver,
      ),
    ).toBe(false);
    expect(
      selectHasEntitlement(
        STATE_WITH_PRODUCT_ENTITLEMENTS,
        PRODUCT_TYPES.SHIELD,
        ShieldFeature.ShieldClaim,
      ),
    ).toBe(true);
  });

  it('keeps usage availability aligned with entitlement booleans', () => {
    expect(
      selectIsUsageAvailable(
        STATE_WITH_PRODUCT_ENTITLEMENTS,
        PRODUCT_TYPES.MONEY_ACCOUNT_PLUS,
        MoneyAccountFeature.PremiumApy,
      ),
    ).toBe(true);
  });

  it('fails closed when product entitlements are absent', () => {
    const state = getDefaultSubscriptionControllerState();

    expect(
      selectHasProductEntitlements(state, PRODUCT_TYPES.MONEY_ACCOUNT_PLUS),
    ).toBe(false);
    expect(
      selectHasEntitlement(
        state,
        PRODUCT_TYPES.MONEY_ACCOUNT_PLUS,
        MoneyAccountFeature.PremiumApy,
      ),
    ).toBe(false);
    expect(
      selectIsUsageAvailable(
        state,
        PRODUCT_TYPES.SHIELD,
        ShieldFeature.PrioritySupport,
      ),
    ).toBe(false);
  });

  it('rejects features from another product at compile time', () => {
    const state = getDefaultSubscriptionControllerState();

    expect(
      selectHasEntitlement(
        state,
        PRODUCT_TYPES.SHIELD,
        // @ts-expect-error Money Account feature is invalid for Shield.
        MoneyAccountFeature.PremiumApy,
      ),
    ).toBe(false);

    expect(
      selectHasEntitlement(
        state,
        PRODUCT_TYPES.MONEY_ACCOUNT_PLUS,
        // @ts-expect-error Shield feature is invalid for Money Account Plus.
        ShieldFeature.ShieldClaim,
      ),
    ).toBe(false);
  });
});
