import {
  array,
  boolean,
  enums,
  lazy,
  literal,
  nullable,
  number,
  object,
  optional,
  record,
  string,
  type,
  union,
} from '@metamask/superstruct';
import type { Struct } from '@metamask/superstruct';
import { StrictHexStruct, CaipAccountIdStruct } from '@metamask/utils';

import {
  CANCEL_TYPES,
  CRYPTO_AUTH_METHODS,
  CRYPTO_PAYMENT_METHOD_ERRORS,
  PAYMENT_TYPES,
  PRODUCT_TYPES,
  RECURRING_INTERVALS,
  SUBSCRIPTION_STATUSES,
} from './types.js';
import type { TokenPaymentInfo } from './types.js';

const ProductTypeStruct = enums(Object.values(PRODUCT_TYPES));
const CryptoAuthMethodStruct = enums(Object.values(CRYPTO_AUTH_METHODS));
const EntitlementsStruct = record(string(), boolean());
const ProductEntitlementsStruct = type({
  [PRODUCT_TYPES.SHIELD]: optional(
    type({
      entitlements: EntitlementsStruct,
    }),
  ),
  [PRODUCT_TYPES.MONEY_ACCOUNT_PLUS]: optional(
    type({
      plan: string(),
      entitlements: EntitlementsStruct,
    }),
  ),
});
const RecurringIntervalStruct = enums(Object.values(RECURRING_INTERVALS));
const SubscriptionStatusStruct = enums(Object.values(SUBSCRIPTION_STATUSES));
const CancelTypeStruct = enums(Object.values(CANCEL_TYPES));
const CryptoPaymentMethodErrorStruct = enums(
  Object.values(CRYPTO_PAYMENT_METHOD_ERRORS),
);

const ProductStruct = type({
  name: ProductTypeStruct,
  currency: enums(['usd']),
  unitAmount: number(),
  unitDecimals: number(),
});

const SubscriptionCardPaymentMethodStruct = type({
  type: enums([PAYMENT_TYPES.byCard]),
  card: type({
    brand: string(),
    displayBrand: string(),
    last4: string(),
  }),
});

const SubscriptionCryptoPaymentMethodStruct = type({
  type: enums([PAYMENT_TYPES.byCrypto]),
  crypto: type({
    payerAddress: StrictHexStruct,
    chainId: StrictHexStruct,
    tokenSymbol: string(),
    error: optional(CryptoPaymentMethodErrorStruct),
  }),
});

const SubscriptionPaymentMethodStruct = union([
  SubscriptionCardPaymentMethodStruct,
  SubscriptionCryptoPaymentMethodStruct,
]);

export const SubscriptionStruct = type({
  id: string(),
  products: array(ProductStruct),
  currentPeriodStart: string(),
  currentPeriodEnd: string(),
  cancelAtPeriodEnd: optional(boolean()),
  status: SubscriptionStatusStruct,
  interval: RecurringIntervalStruct,
  paymentMethod: SubscriptionPaymentMethodStruct,
  trialPeriodDays: optional(number()),
  trialStart: optional(string()),
  trialEnd: optional(string()),
  endDate: optional(string()),
  canceledAt: optional(string()),
  cancelType: CancelTypeStruct,
  inactiveAt: optional(string()),
  isEligibleForSupport: boolean(),
  billingCycles: optional(number()),
});

export const GetSubscriptionsResponseStruct = type({
  customerId: optional(string()),
  subscriptions: array(SubscriptionStruct),
  trialedProducts: array(ProductTypeStruct),
  productEntitlements: optional(ProductEntitlementsStruct),
  lastSubscription: optional(SubscriptionStruct),
  rewardAccountId: optional(CaipAccountIdStruct),
});

export const StartSubscriptionResponseStruct = type({
  checkoutSessionUrl: string(),
});

export const StartCryptoSubscriptionResponseStruct = type({
  subscriptionId: string(),
  status: SubscriptionStatusStruct,
});

export const UpdatePaymentMethodCardResponseStruct = type({
  redirectUrl: string(),
});

export const BillingPortalResponseStruct = type({
  url: string(),
});

export const SubscriptionApiGeneralResponseStruct = type({
  success: boolean(),
  message: optional(string()),
});

const ProductPriceStruct = type({
  interval: RecurringIntervalStruct,
  unitAmount: number(),
  unitDecimals: number(),
  currency: enums(['usd']),
  trialPeriodDays: number(),
  minBillingCycles: number(),
  minBillingCyclesForBalance: number(),
});

const ProductPricingStruct = type({
  name: ProductTypeStruct,
  prices: array(ProductPriceStruct),
});

const TokenPaymentInfoConversionRateStruct = type({
  usd: string(),
});

const TokenPaymentInfoStruct: Struct<TokenPaymentInfo> = lazy(() =>
  union([
    object({
      symbol: string(),
      address: StrictHexStruct,
      decimals: number(),
      conversionRate: optional(TokenPaymentInfoConversionRateStruct),
      isVaultShare: literal(true),
      accountantAddress: StrictHexStruct,
      sources: optional(array(TokenPaymentInfoStruct)),
    }),
    object({
      symbol: string(),
      address: StrictHexStruct,
      decimals: number(),
      conversionRate: optional(TokenPaymentInfoConversionRateStruct),
      isVaultShare: optional(literal(false)),
      sources: optional(array(TokenPaymentInfoStruct)),
    }),
  ]),
) as Struct<TokenPaymentInfo>;

const ChainPaymentInfoStruct = type({
  chainId: StrictHexStruct,
  paymentAddress: StrictHexStruct,
  delegateAddress: optional(StrictHexStruct),
  tokens: array(TokenPaymentInfoStruct),
  isSponsorshipSupported: optional(boolean()),
});

const PricingPaymentMethodStruct = union([
  object({
    type: enums([PAYMENT_TYPES.byCard]),
    products: optional(array(ProductTypeStruct)),
  }),
  object({
    type: enums([PAYMENT_TYPES.byCrypto]),
    cryptoAuthMethod: optional(CryptoAuthMethodStruct),
    products: optional(array(ProductTypeStruct)),
    chains: optional(array(ChainPaymentInfoStruct)),
  }),
]);

export const PricingResponseStruct = type({
  products: array(ProductPricingStruct),
  paymentMethods: array(PricingPaymentMethodStruct),
});

const CohortStruct = type({
  cohort: string(),
  eligibilityRate: number(),
  priority: number(),
  eligible: boolean(),
});

export const SubscriptionEligibilityStruct = type({
  product: ProductTypeStruct,
  canSubscribe: optional(boolean()),
  canViewEntryModal: optional(boolean()),
  modalType: optional(enums(['A', 'B'])),
  cohorts: optional(array(CohortStruct)),
  assignedCohort: optional(nullable(string())),
  assignedAt: optional(string()),
  hasAssignedCohortExpired: optional(boolean()),
});

export const SubscriptionEligibilityArrayStruct = array(
  SubscriptionEligibilityStruct,
);
