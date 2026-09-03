import { ACTIVE_SUBSCRIPTION_STATUSES } from './constants.js';
import type { SubscriptionControllerState } from './SubscriptionController.js';
import type { ProductEntitlementFeatureMap, ProductType } from './types.js';

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
