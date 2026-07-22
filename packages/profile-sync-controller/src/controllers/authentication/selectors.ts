import type { LoginResponse } from '../../sdk';
import type { AuthenticationControllerState } from './AuthenticationController';

/**
 * Selects the raw SRP session map from AuthenticationController state.
 *
 * @param state - The AuthenticationController state.
 * @returns The `srpSessionData` map, or `undefined` when not signed in / cleared.
 */
const selectSrpSessionData = (
  state: AuthenticationControllerState,
): AuthenticationControllerState['srpSessionData'] => state.srpSessionData;

/**
 * Selects the primary (first) SRP session entry from cached `srpSessionData`.
 *
 * Uses the first `Object.entries` value — the same "primary / first written"
 * convention as extension `selectSessionData`. During `performSignIn`, sessions
 * are written sequentially with the primary SRP first.
 *
 * @param state - The AuthenticationController state.
 * @returns The primary session login response, or `undefined` if unavailable.
 */
const selectSessionData = (
  state: AuthenticationControllerState,
): LoginResponse | undefined => {
  const srpSessionData = selectSrpSessionData(state);
  if (!srpSessionData) {
    return undefined;
  }
  const firstEntry = Object.entries(srpSessionData)[0];
  return firstEntry?.[1];
};

/**
 * Selects the best-effort cached canonical profile ID.
 *
 * Reads from the primary SRP session in `srpSessionData` without triggering
 * login or unlock checks. Suitable for non-security consumers.
 *
 * Empty string is treated as missing (`undefined`) because the controller sets
 * `canonicalProfileId` to `''` when invalidating a session
 * (`#invalidateSrpSession`).
 *
 * Staleness: same as a valid cached `getSessionProfile()` result. Cross-device
 * pairing can change the canonical without updating this cache until the next
 * login or pair. Use `refreshCanonicalProfileId()` when freshness is required.
 *
 * @param state - The AuthenticationController state.
 * @returns The cached canonical profile ID, or `undefined` if unavailable.
 */
const selectCanonicalProfileId = (
  state: AuthenticationControllerState,
): string | undefined => {
  const canonicalProfileId =
    selectSessionData(state)?.profile?.canonicalProfileId;
  // `''` is used by `#invalidateSrpSession` to mark the session as invalid.
  return canonicalProfileId ? canonicalProfileId : undefined;
};

/**
 * Selectors for AuthenticationController state.
 * These take controller state (not client `RootState`) and can be composed
 * with Redux `createSelector` in clients.
 */
export const authenticationControllerSelectors = {
  selectSrpSessionData,
  selectSessionData,
  selectCanonicalProfileId,
};
