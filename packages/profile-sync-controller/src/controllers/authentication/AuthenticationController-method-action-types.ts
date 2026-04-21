/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { AuthenticationController } from './AuthenticationController';

export type AuthenticationControllerPerformSignInAction = {
  type: `AuthenticationController:performSignIn`;
  handler: AuthenticationController['performSignIn'];
};

export type AuthenticationControllerPerformSignOutAction = {
  type: `AuthenticationController:performSignOut`;
  handler: AuthenticationController['performSignOut'];
};

/**
 * Returns a bearer token for the specified SRP, logging in if needed.
 *
 * When called without `entropySourceId`, returns the primary (first) SRP's
 * access token, which is effectively the canonical
 * profile's token that can be used by alias-aware consumers for cross-SRP
 * operations.
 *
 * @param entropySourceId - The entropy source ID. Omit for the primary SRP.
 * @returns The OIDC access token.
 */
export type AuthenticationControllerGetBearerTokenAction = {
  type: `AuthenticationController:getBearerToken`;
  handler: AuthenticationController['getBearerToken'];
};

/**
 * Returns the cached session profile, logging in if no session exists.
 *
 * The returned `canonicalProfileId` reflects the value from the most recent
 * login or pairing and may be stale if pairing occurred on another device
 * since then. For guaranteed freshness, use `refreshCanonicalProfileId()`
 * before calling this method.
 *
 * @param entropySourceId - The entropy source ID used to derive the key,
 * when multiple sources are available (Multi-SRP).
 * @returns profile for the session.
 */
export type AuthenticationControllerGetSessionProfileAction = {
  type: `AuthenticationController:getSessionProfile`;
  handler: AuthenticationController['getSessionProfile'];
};

/**
 * Forces a fresh retrieval of the canonical profile ID from the server
 * and propagates it to all cached SRP sessions in `srpSessionData`.
 *
 * **This method is expensive.** For multi-SRP wallets it triggers a full
 * `performSignIn` (N logins + pairing). For single-SRP wallets it
 * invalidates the cached session and forces a re-login. Call this before
 * any operation that requires a correct canonical (e.g. storage
 * migrations, identity-critical analytics). For best-effort reads, use
 * `getSessionProfile().canonicalProfileId` instead.
 *
 * @returns The refreshed canonical profile ID.
 */
export type AuthenticationControllerRefreshCanonicalProfileIdAction = {
  type: `AuthenticationController:refreshCanonicalProfileId`;
  handler: AuthenticationController['refreshCanonicalProfileId'];
};

export type AuthenticationControllerGetUserProfileLineageAction = {
  type: `AuthenticationController:getUserProfileLineage`;
  handler: AuthenticationController['getUserProfileLineage'];
};

export type AuthenticationControllerIsSignedInAction = {
  type: `AuthenticationController:isSignedIn`;
  handler: AuthenticationController['isSignedIn'];
};

/**
 * Union of all AuthenticationController action types.
 */
export type AuthenticationControllerMethodActions =
  | AuthenticationControllerPerformSignInAction
  | AuthenticationControllerPerformSignOutAction
  | AuthenticationControllerGetBearerTokenAction
  | AuthenticationControllerGetSessionProfileAction
  | AuthenticationControllerRefreshCanonicalProfileIdAction
  | AuthenticationControllerGetUserProfileLineageAction
  | AuthenticationControllerIsSignedInAction;
