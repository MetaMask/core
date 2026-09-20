import {
  selectHasEntitlement,
  selectIsActiveSubscriber,
  selectIsDelegationExhausted,
  selectIsPaymentFailed,
  selectIsRenewalNeeded,
  selectIsUsageAvailable,
  selectPaymentFailureReason,
} from './selectors.js';
import { getDefaultSubscriptionControllerState } from './SubscriptionController.js';
import type { SubscriptionControllerState } from './SubscriptionController.js';
import type { Subscription } from './types.js';
import {
  CANCEL_TYPES,
  MoneyAccountFeature,
  PAYMENT_TYPES,
  PRODUCT_TYPES,
  RECURRING_INTERVALS,
  ShieldFeature,
  SUBSCRIPTION_STATUSES,
} from './types.js';

const MOCK_SHIELD_SUBSCRIPTION: Subscription = {
  id: 'sub_shield',
  products: [
    {
      name: PRODUCT_TYPES.SHIELD,
      currency: 'usd',
      unitAmount: 900,
      unitDecimals: 2,
    },
  ],
  currentPeriodStart: '2024-01-01T00:00:00Z',
  currentPeriodEnd: '2024-02-01T00:00:00Z',
  status: SUBSCRIPTION_STATUSES.active,
  interval: RECURRING_INTERVALS.month,
  paymentMethod: {
    type: PAYMENT_TYPES.byCard,
    card: {
      brand: 'visa',
      displayBrand: 'visa',
      last4: '1234',
    },
  },
  isEligibleForSupport: true,
  cancelType: CANCEL_TYPES.ALLOWED_AT_PERIOD_END,
};

const MOCK_MONEY_ACCOUNT_SUBSCRIPTION: Subscription = {
  id: 'sub_money_account_plus',
  products: [
    {
      name: PRODUCT_TYPES.MONEY_ACCOUNT_PLUS,
      currency: 'usd',
      unitAmount: 999,
      unitDecimals: 2,
    },
  ],
  status: SUBSCRIPTION_STATUSES.paused,
  interval: RECURRING_INTERVALS.month,
  paymentMethod: {
    type: PAYMENT_TYPES.byCrypto,
    crypto: {
      payerAddress: '0x123456789012345678901234567890123456abcd',
      chainId: '0x1',
      tokenSymbol: 'pvmUSD',
      error: 'insufficient_balance',
    },
  },
  lastInvoice: {
    id: 'in_money_account',
    status: 'FAILED',
    errorCode: 'insufficient_balance',
    updatedAt: '2026-09-20T12:00:00.000Z',
  },
};

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
  it('returns false for a product entitlements record when every flag is false', () => {
    const state: SubscriptionControllerState = {
      ...getDefaultSubscriptionControllerState(),
      productEntitlements: {
        [PRODUCT_TYPES.SHIELD]: {
          entitlements: {
            [ShieldFeature.PrioritySupport]: false,
            [ShieldFeature.ShieldClaim]: false,
          },
        },
      },
    };

    expect(
      selectHasEntitlement(
        state,
        PRODUCT_TYPES.SHIELD,
        ShieldFeature.ShieldClaim,
      ),
    ).toBe(false);
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

  it('fails closed when product entitlements are an empty map', () => {
    const state: SubscriptionControllerState = {
      ...getDefaultSubscriptionControllerState(),
      productEntitlements: {},
    };

    expect(
      selectHasEntitlement(
        state,
        PRODUCT_TYPES.MONEY_ACCOUNT_PLUS,
        MoneyAccountFeature.PremiumApy,
      ),
    ).toBe(false);
    expect(
      selectHasEntitlement(
        state,
        PRODUCT_TYPES.SHIELD,
        ShieldFeature.ShieldClaim,
      ),
    ).toBe(false);
  });

  it('fails closed for a product that is absent when another product is present', () => {
    const shieldOnly: SubscriptionControllerState = {
      ...getDefaultSubscriptionControllerState(),
      productEntitlements: {
        [PRODUCT_TYPES.SHIELD]:
          STATE_WITH_PRODUCT_ENTITLEMENTS.productEntitlements?.[
            PRODUCT_TYPES.SHIELD
          ],
      },
    };
    const moneyAccountOnly: SubscriptionControllerState = {
      ...getDefaultSubscriptionControllerState(),
      productEntitlements: {
        [PRODUCT_TYPES.MONEY_ACCOUNT_PLUS]:
          STATE_WITH_PRODUCT_ENTITLEMENTS.productEntitlements?.[
            PRODUCT_TYPES.MONEY_ACCOUNT_PLUS
          ],
      },
    };

    expect(
      selectHasEntitlement(
        shieldOnly,
        PRODUCT_TYPES.SHIELD,
        ShieldFeature.ShieldClaim,
      ),
    ).toBe(true);
    expect(
      selectHasEntitlement(
        shieldOnly,
        PRODUCT_TYPES.MONEY_ACCOUNT_PLUS,
        MoneyAccountFeature.PremiumApy,
      ),
    ).toBe(false);
    expect(
      selectHasEntitlement(
        moneyAccountOnly,
        PRODUCT_TYPES.MONEY_ACCOUNT_PLUS,
        MoneyAccountFeature.PremiumApy,
      ),
    ).toBe(true);
    expect(
      selectHasEntitlement(
        moneyAccountOnly,
        PRODUCT_TYPES.SHIELD,
        ShieldFeature.ShieldClaim,
      ),
    ).toBe(false);
  });

  it('does not treat another product enabled feature as an entitlement', () => {
    expect(
      selectHasEntitlement(
        STATE_WITH_PRODUCT_ENTITLEMENTS,
        PRODUCT_TYPES.SHIELD,
        // @ts-expect-error Money Account feature is invalid for Shield.
        MoneyAccountFeature.PremiumApy,
      ),
    ).toBe(false);

    expect(
      selectHasEntitlement(
        STATE_WITH_PRODUCT_ENTITLEMENTS,
        PRODUCT_TYPES.MONEY_ACCOUNT_PLUS,
        // @ts-expect-error Shield feature is invalid for Money Account Plus.
        ShieldFeature.ShieldClaim,
      ),
    ).toBe(false);
  });

  describe('selectIsActiveSubscriber', () => {
    it('returns true when the product has an active subscription', () => {
      const state: SubscriptionControllerState = {
        ...getDefaultSubscriptionControllerState(),
        subscriptions: [MOCK_SHIELD_SUBSCRIPTION],
      };

      expect(selectIsActiveSubscriber(state, PRODUCT_TYPES.SHIELD)).toBe(true);
    });

    it.each([
      SUBSCRIPTION_STATUSES.trialing,
      SUBSCRIPTION_STATUSES.provisional,
    ] as const)(
      'returns true when the product subscription is %s',
      (status) => {
        const state: SubscriptionControllerState = {
          ...getDefaultSubscriptionControllerState(),
          subscriptions: [{ ...MOCK_SHIELD_SUBSCRIPTION, status }],
        };

        expect(selectIsActiveSubscriber(state, PRODUCT_TYPES.SHIELD)).toBe(
          true,
        );
      },
    );

    it.each([
      SUBSCRIPTION_STATUSES.canceled,
      SUBSCRIPTION_STATUSES.paused,
      SUBSCRIPTION_STATUSES.pastDue,
      SUBSCRIPTION_STATUSES.unpaid,
      SUBSCRIPTION_STATUSES.incomplete,
      SUBSCRIPTION_STATUSES.incompleteExpired,
    ] as const)(
      'returns false when the product subscription is %s',
      (status) => {
        const state: SubscriptionControllerState = {
          ...getDefaultSubscriptionControllerState(),
          subscriptions: [{ ...MOCK_SHIELD_SUBSCRIPTION, status }],
        };

        expect(selectIsActiveSubscriber(state, PRODUCT_TYPES.SHIELD)).toBe(
          false,
        );
      },
    );

    it('returns false when there is no subscription for the product', () => {
      const state: SubscriptionControllerState = {
        ...getDefaultSubscriptionControllerState(),
        subscriptions: [MOCK_SHIELD_SUBSCRIPTION],
      };

      expect(
        selectIsActiveSubscriber(state, PRODUCT_TYPES.MONEY_ACCOUNT_PLUS),
      ).toBe(false);
    });

    it('returns false when subscriptions are empty', () => {
      expect(
        selectIsActiveSubscriber(
          getDefaultSubscriptionControllerState(),
          PRODUCT_TYPES.SHIELD,
        ),
      ).toBe(false);
    });
  });

  describe('payment state selectors', () => {
    it('returns payment failure details for a Money Account subscription', () => {
      const state: SubscriptionControllerState = {
        ...getDefaultSubscriptionControllerState(),
        subscriptions: [
          MOCK_SHIELD_SUBSCRIPTION,
          MOCK_MONEY_ACCOUNT_SUBSCRIPTION,
        ],
      };

      expect(
        selectIsPaymentFailed(state, PRODUCT_TYPES.MONEY_ACCOUNT_PLUS),
      ).toBe(true);
      expect(
        selectPaymentFailureReason(state, PRODUCT_TYPES.MONEY_ACCOUNT_PLUS),
      ).toBe('insufficient_balance');
      expect(
        selectIsRenewalNeeded(state, PRODUCT_TYPES.MONEY_ACCOUNT_PLUS),
      ).toBe(true);
      expect(
        selectIsDelegationExhausted(state, PRODUCT_TYPES.MONEY_ACCOUNT_PLUS),
      ).toBe(false);
    });

    it.each(['insufficient_balance', 'delegation_not_found'] as const)(
      'treats %s as renewal-needed',
      (errorCode) => {
        const state: SubscriptionControllerState = {
          ...getDefaultSubscriptionControllerState(),
          subscriptions: [
            {
              ...MOCK_MONEY_ACCOUNT_SUBSCRIPTION,
              lastInvoice: {
                ...MOCK_MONEY_ACCOUNT_SUBSCRIPTION.lastInvoice!,
                errorCode,
              },
            },
          ],
        };

        expect(
          selectIsRenewalNeeded(state, PRODUCT_TYPES.MONEY_ACCOUNT_PLUS),
        ).toBe(true);
        expect(
          selectIsDelegationExhausted(state, PRODUCT_TYPES.MONEY_ACCOUNT_PLUS),
        ).toBe(false);
      },
    );

    it('treats an exceeded delegation allowance as exhausted', () => {
      const state: SubscriptionControllerState = {
        ...getDefaultSubscriptionControllerState(),
        subscriptions: [
          {
            ...MOCK_MONEY_ACCOUNT_SUBSCRIPTION,
            lastInvoice: {
              ...MOCK_MONEY_ACCOUNT_SUBSCRIPTION.lastInvoice!,
              errorCode: 'exceeds_delegation_allowance',
            },
          },
        ],
      };

      expect(
        selectIsPaymentFailed(state, PRODUCT_TYPES.MONEY_ACCOUNT_PLUS),
      ).toBe(true);
      expect(
        selectIsRenewalNeeded(state, PRODUCT_TYPES.MONEY_ACCOUNT_PLUS),
      ).toBe(false);
      expect(
        selectIsDelegationExhausted(state, PRODUCT_TYPES.MONEY_ACCOUNT_PLUS),
      ).toBe(true);
    });

    it('fails closed for Shield, missing subscriptions, and missing invoices', () => {
      const mixedState: SubscriptionControllerState = {
        ...getDefaultSubscriptionControllerState(),
        subscriptions: [MOCK_SHIELD_SUBSCRIPTION],
      };

      expect(selectIsPaymentFailed(mixedState, PRODUCT_TYPES.SHIELD)).toBe(
        false,
      );
      expect(
        selectPaymentFailureReason(mixedState, PRODUCT_TYPES.SHIELD),
      ).toBeUndefined();
      expect(selectIsRenewalNeeded(mixedState, PRODUCT_TYPES.SHIELD)).toBe(
        false,
      );
      expect(
        selectIsDelegationExhausted(mixedState, PRODUCT_TYPES.SHIELD),
      ).toBe(false);

      const noInvoiceState: SubscriptionControllerState = {
        ...getDefaultSubscriptionControllerState(),
        subscriptions: [
          {
            ...MOCK_MONEY_ACCOUNT_SUBSCRIPTION,
            lastInvoice: undefined,
          },
        ],
      };

      expect(
        selectIsPaymentFailed(noInvoiceState, PRODUCT_TYPES.MONEY_ACCOUNT_PLUS),
      ).toBe(false);
      expect(
        selectPaymentFailureReason(
          noInvoiceState,
          PRODUCT_TYPES.MONEY_ACCOUNT_PLUS,
        ),
      ).toBeUndefined();
    });

    it('does not interpret a payment-method error as an execution failure', () => {
      const state: SubscriptionControllerState = {
        ...getDefaultSubscriptionControllerState(),
        subscriptions: [
          {
            ...MOCK_MONEY_ACCOUNT_SUBSCRIPTION,
            lastInvoice: undefined,
          },
        ],
      };

      expect(
        selectIsRenewalNeeded(state, PRODUCT_TYPES.MONEY_ACCOUNT_PLUS),
      ).toBe(false);
      expect(
        selectIsDelegationExhausted(state, PRODUCT_TYPES.MONEY_ACCOUNT_PLUS),
      ).toBe(false);
    });
  });
});
