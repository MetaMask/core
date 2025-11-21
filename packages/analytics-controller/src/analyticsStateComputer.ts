import type { AnalyticsControllerState } from './AnalyticsController';

/**
 * State computer that computes controller values from controller state.
 *
 * This module provides functions that compute derived controller values from the
 * controller's state. Currently, it computes the `controller_enabled` state, but
 * can be extended to compute other values in the future.
 *
 * **State Computer Computations:**
 *
 * 1. **Enabled State** (`computeEnabledState`):
 * - Determines whether analytics tracking is active
 * - Rules: `controller_enabled = optedInForRegularAccount || optedInForSocialAccount`
 * - Analytics is enabled if the user has opted in for regular account OR social account
 *
 * 2. **Future computations** (e.g., feature flags, permissions, etc.)
 *
 * **Usage:**
 * These functions are called:
 * - During controller initialization to set initial values
 * - Whenever user state changes (e.g., in `optInForRegularAccount()`, `optOutForRegularAccount()`, `optInForSocialAccount()`, `optOutForSocialAccount()`)
 *
 * **Extensibility:**
 * To add new computations, add new functions that take `AnalyticsControllerState` as input.
 * To add new user state properties, update the `AnalyticsControllerState` type with `user_` prefix
 * and all computation functions that need to consider them.
 */

/**
 * Computes the `controller_enabled` state from controller state.
 *
 * @param state - The current controller state
 * @returns `true` if analytics tracking should be enabled, `false` otherwise
 */
export function computeEnabledState(state: AnalyticsControllerState): boolean {
  // Analytics is enabled if user has opted in for regular account OR social account
  // Rules:
  // - optedInForRegularAccount==true && optedInForSocialAccount==true -> enabled=true
  // - optedInForRegularAccount==false && optedInForSocialAccount==true -> enabled=true
  // - optedInForRegularAccount==true && optedInForSocialAccount==false -> enabled=true
  // - optedInForRegularAccount==false && optedInForSocialAccount==false -> enabled=false
  return state.optedInForRegularAccount || state.optedInForSocialAccount;
}
