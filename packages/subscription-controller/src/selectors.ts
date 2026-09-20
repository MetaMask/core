import { ACTIVE_SUBSCRIPTION_STATUSES } from './constants.js';
import type { SubscriptionControllerState } from './SubscriptionController.js';
import { CRYPTO_PAYMENT_ERRORS, PAYMENT_TYPES } from './types.js';
import type {
  CryptoPaymentError,
  ProductEntitlementFeatureMap,
  ProductType,
  Subscription,
} from './types.js';

function getSubscriptionByProduct(
  state: SubscriptionControllerState,
  productType: ProductType,
): Subscription | undefined {
  return state.subscriptions.find((subscription) =>
    subscription.products.some((product) => product.name === productType),
  );
}

function getPaymentExecutionError(
  state: SubscriptionControllerState,
  productType: ProductType,
): CryptoPaymentError | undefined {
  const subscription = getSubscriptionByProduct(state, productType);

  if (
    subscription?.paymentMethod.type !== PAYMENT_TYPES.byCrypto ||
    subscription.lastInvoice?.status !== 'FAILED'
  ) {
    return undefined;
  }

  return subscription.lastInvoice?.errorCode;
}

/**
 * Returns whether a specific product feature entitlement is enabled.
 *
 * Use this to gate paid UX. Missing products or missing features fail closed
 * (`false`). Combine with `selectIsActiveSubscriber` when that is the
 * product rule; this selector only reads the entitlement boolean.
 *
 * @param state - The subscription controller state.
 * @param productType - The product whose entitlement is queried.
 * @param feature - The feature whose entitlement flag is queried.
 * @returns Whether the feature entitlement is true.
 */
export function selectHasEntitlement<TProduct extends ProductType>(
  state: SubscriptionControllerState,
  productType: TProduct,
  feature: ProductEntitlementFeatureMap[TProduct],
): boolean {
  const entitlements = state.productEntitlements?.[productType]
    ?.entitlements as
    | Record<ProductEntitlementFeatureMap[TProduct], boolean>
    | undefined;

  return Boolean(entitlements?.[feature]);
}

/**
 * Usage availability currently matches entitlement because the server folds
 * metered-cap exhaustion into the entitlement flag. Keeping this selector
 * separate gives consumers a stable API if explicit usage claims are added.
 *
 * @param state - The subscription controller state.
 * @param productType - The product whose usage availability is queried.
 * @param feature - The feature whose usage availability is queried.
 * @returns Whether usage is currently available for the feature.
 */
export function selectIsUsageAvailable<TProduct extends ProductType>(
  state: SubscriptionControllerState,
  productType: TProduct,
  feature: ProductEntitlementFeatureMap[TProduct],
): boolean {
  return selectHasEntitlement(state, productType, feature);
}

/**
 * Returns whether the user has an active subscription for a specific product.
 *
 * Active includes `active`, `trialing`, and `provisional`. Missing products
 * and non-active statuses fail closed (`false`).
 *
 * @param state - The subscription controller state.
 * @param productType - The product to check.
 * @returns Whether the user is an active subscriber for the product.
 */
export function selectIsActiveSubscriber(
  state: SubscriptionControllerState,
  productType: ProductType,
): boolean {
  return state.subscriptions.some(
    (subscription) =>
      ACTIVE_SUBSCRIPTION_STATUSES.includes(subscription.status) &&
      subscription.products.some((product) => product.name === productType),
  );
}

/**
 * Returns whether the product's latest crypto payment failed.
 *
 * The result is based on the latest invoice status. Payment-method setup
 * errors in `paymentMethod.crypto.error` are intentionally not treated as
 * invoice execution failures by this selector.
 *
 * @param state - The subscription controller state.
 * @param productType - The product whose payment state is queried.
 * @returns Whether the latest crypto payment failed.
 */
export function selectIsPaymentFailed(
  state: SubscriptionControllerState,
  productType: ProductType,
): boolean {
  const subscription = getSubscriptionByProduct(state, productType);

  return Boolean(
    subscription?.paymentMethod.type === PAYMENT_TYPES.byCrypto &&
    subscription.lastInvoice?.status === 'FAILED',
  );
}

/**
 * Returns the raw Subscription API execution error for the latest crypto
 * payment.
 *
 * @param state - The subscription controller state.
 * @param productType - The product whose payment failure is queried.
 * @returns The raw payment execution error, if present.
 */
export function selectPaymentFailureReason(
  state: SubscriptionControllerState,
  productType: ProductType,
): CryptoPaymentError | undefined {
  return getPaymentExecutionError(state, productType);
}

/**
 * Returns whether the latest payment needs renewal or delegation recovery.
 *
 * The Subscription API signals this through `lastInvoice.errorCode` rather
 * than a derived boolean.
 *
 * @param state - The subscription controller state.
 * @param productType - The product whose renewal state is queried.
 * @returns Whether renewal/recovery can be offered.
 */
export function selectIsRenewalNeeded(
  state: SubscriptionControllerState,
  productType: ProductType,
): boolean {
  const errorCode = getPaymentExecutionError(state, productType);

  return (
    errorCode === CRYPTO_PAYMENT_ERRORS.INSUFFICIENT_BALANCE ||
    errorCode === CRYPTO_PAYMENT_ERRORS.DELEGATION_NOT_FOUND
  );
}

/**
 * Returns whether the delegation has exhausted its cumulative allowance.
 *
 * @param state - The subscription controller state.
 * @param productType - The product whose delegation state is queried.
 * @returns Whether the delegation allowance is exhausted.
 */
export function selectIsDelegationExhausted(
  state: SubscriptionControllerState,
  productType: ProductType,
): boolean {
  return (
    getPaymentExecutionError(state, productType) ===
    CRYPTO_PAYMENT_ERRORS.EXCEEDS_DELEGATION_ALLOWANCE
  );
}
