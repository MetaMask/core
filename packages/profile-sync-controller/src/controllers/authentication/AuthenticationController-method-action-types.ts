/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { AuthenticationController } from './AuthenticationController';

export type AuthenticationControllerPerformSignInAction = {
  type: `AuthenticationController:performSignIn`;
  handler: AuthenticationController['performSignIn'];
};

/**
 * Marks profile pairing as needed. Clients call this when the SRP set
 * changes (e.g. a new keyring was added) so the next auto-sign-in cycle
 * re-runs `performSignIn` and re-pairs.
 */
export type AuthenticationControllerRequestProfilePairingAction = {
  type: `AuthenticationController:requestProfilePairing`;
  handler: AuthenticationController['requestProfilePairing'];
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
 * login or pairing. In the rare event where a canonical changed because of
 * a pairing that happened on another device, the cached value may be stale
 * until the next login. For guaranteed freshness, call
 * `refreshCanonicalProfileId()` before reading `canonicalProfileId`.
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
 * and propagates it to all cached SRP sessions.
 *
 * This method invalidates the primary SRP's cached session and forces a
 * re-login. Use it before operations that require a guaranteed-fresh
 * canonical (e.g. storage key derivation for Accounts ADR 0005). For
 * best-effort reads, use
 * `getSessionProfile().canonicalProfileId` instead.
 *
 * Only the primary SRP is re-logged-in regardless of how many SRPs exist —
 * the server returns the current canonical for the entire pairing group
 * from any single SRP login.
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
  | AuthenticationControllerRequestProfilePairingAction
  | AuthenticationControllerPerformSignOutAction
  | AuthenticationControllerGetBearerTokenAction
  | AuthenticationControllerGetSessionProfileAction
  | AuthenticationControllerRefreshCanonicalProfileIdAction
  | AuthenticationControllerGetUserProfileLineageAction
  | AuthenticationControllerIsSignedInAction;
