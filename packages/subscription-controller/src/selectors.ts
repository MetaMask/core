import type { SubscriptionControllerState } from './SubscriptionController.js';
import type { MoneyAccountFeature } from './types.js';
import { PRODUCT_TYPES } from './types.js';

export function selectIsMoneyAccountPlusSubscriber(
  state: SubscriptionControllerState,
): boolean {
  return Boolean(state.productEntitlements?.[PRODUCT_TYPES.MONEY_ACCOUNT_PLUS]);
}

export function selectHasEntitlement(
  state: SubscriptionControllerState,
  feature: MoneyAccountFeature,
): boolean {
  return Boolean(
    state.productEntitlements?.[PRODUCT_TYPES.MONEY_ACCOUNT_PLUS]?.entitlements[
      feature
    ],
  );
}

/**
 * Usage availability currently matches entitlement because the server folds
 * metered-cap exhaustion into the entitlement flag. Keeping this selector
 * separate gives consumers a stable API if explicit usage claims are added.
 *
 * @param state - The subscription controller state.
 * @param feature - The feature whose usage availability is queried.
 * @returns Whether usage is currently available for the feature.
 */
export function selectIsUsageAvailable(
  state: SubscriptionControllerState,
  feature: MoneyAccountFeature,
): boolean {
  return selectHasEntitlement(state, feature);
}
