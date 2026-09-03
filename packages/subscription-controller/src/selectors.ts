import type { SubscriptionControllerState } from './SubscriptionController.js';
import type { ProductEntitlementFeatureMap, ProductType } from './types.js';

export function selectHasProductEntitlements(
  state: SubscriptionControllerState,
  productType: ProductType,
): boolean {
  return Boolean(state.productEntitlements?.[productType]);
}

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
