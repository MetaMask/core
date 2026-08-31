import type {
  MoneyAccountFeature,
  MoneyAccountSubscriptionControllerState,
} from './types.js';

export function selectIsActiveSubscriber(
  state: MoneyAccountSubscriptionControllerState,
): boolean {
  return state.isSubscriber;
}

export function selectHasEntitlement(
  state: MoneyAccountSubscriptionControllerState,
  feature: MoneyAccountFeature,
): boolean {
  return Boolean(state.entitlements?.[feature]);
}

/**
 * Usage availability currently matches entitlement because the server folds
 * metered-cap exhaustion into the entitlement flag. Keeping this selector
 * separate gives consumers a stable API if explicit usage claims are added.
 *
 * @param state - The Money Account subscription controller state.
 * @param feature - The feature whose usage availability is queried.
 * @returns Whether usage is currently available for the feature.
 */
export function selectIsUsageAvailable(
  state: MoneyAccountSubscriptionControllerState,
  feature: MoneyAccountFeature,
): boolean {
  return selectHasEntitlement(state, feature);
}
