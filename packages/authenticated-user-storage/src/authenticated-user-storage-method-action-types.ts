/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { AuthenticatedUserStorageService } from './authenticated-user-storage.js';

/**
 * Returns all delegation records belonging to the authenticated user.
 *
 * @returns An array of delegation records, or an empty array if none exist.
 */
export type AuthenticatedUserStorageServiceListDelegationsAction = {
  type: `AuthenticatedUserStorageService:listDelegations`;
  handler: AuthenticatedUserStorageService['listDelegations'];
};

/**
 * Stores a signed delegation record for the authenticated user.
 *
 * @param submission - The signed delegation and its metadata.
 * @param clientType - Optional client type header.
 */
export type AuthenticatedUserStorageServiceCreateDelegationAction = {
  type: `AuthenticatedUserStorageService:createDelegation`;
  handler: AuthenticatedUserStorageService['createDelegation'];
};

/**
 * Revokes (deletes) a delegation record.
 *
 * @param delegationHash - The unique hash identifying the delegation.
 */
export type AuthenticatedUserStorageServiceRevokeDelegationAction = {
  type: `AuthenticatedUserStorageService:revokeDelegation`;
  handler: AuthenticatedUserStorageService['revokeDelegation'];
};

/**
 * Returns the notification preferences for the authenticated user.
 *
 * @returns The notification preferences object, or `null` if none have been
 * set (404).
 */
export type AuthenticatedUserStorageServiceGetNotificationPreferencesAction = {
  type: `AuthenticatedUserStorageService:getNotificationPreferences`;
  handler: AuthenticatedUserStorageService['getNotificationPreferences'];
};

/**
 * Creates or updates the notification preferences for the authenticated user.
 *
 * @param prefs - The full notification preferences object.
 * @param clientType - Optional client type header.
 */
export type AuthenticatedUserStorageServicePutNotificationPreferencesAction = {
  type: `AuthenticatedUserStorageService:putNotificationPreferences`;
  handler: AuthenticatedUserStorageService['putNotificationPreferences'];
};

/**
 * Returns the marketing consent for the authenticated user.
 *
 * @returns The marketing consent object, or `null` if none has been
 * set (404).
 */
export type AuthenticatedUserStorageServiceGetMarketingConsentAction = {
  type: `AuthenticatedUserStorageService:getMarketingConsent`;
  handler: AuthenticatedUserStorageService['getMarketingConsent'];
};

/**
 * Creates or updates the marketing consent for the authenticated user.
 *
 * @param consent - The full marketing consent object.
 * @param clientType - Optional client type header.
 */
export type AuthenticatedUserStorageServicePutMarketingConsentAction = {
  type: `AuthenticatedUserStorageService:putMarketingConsent`;
  handler: AuthenticatedUserStorageService['putMarketingConsent'];
};

/**
 * Returns the identity-sharing consent for the authenticated user.
 *
 * @returns The granted-audience map, or `null` if none has been set (404).
 */
export type AuthenticatedUserStorageServiceGetIdentitySharingConsentAction = {
  type: `AuthenticatedUserStorageService:getIdentitySharingConsent`;
  handler: AuthenticatedUserStorageService['getIdentitySharingConsent'];
};

/**
 * Grants or revokes identity-sharing consent for a single audience.
 * Other audiences on the profile are left unchanged.
 *
 * @param write - The audience and whether it is granted.
 * @param clientType - Optional client type header.
 * @throws A `StructError` from `@metamask/superstruct` if `write` is
 * invalid; an `HttpError` from `@metamask/controller-utils` if the API
 * responds with a non-2xx status.
 */
export type AuthenticatedUserStorageServicePutIdentitySharingConsentAction = {
  type: `AuthenticatedUserStorageService:putIdentitySharingConsent`;
  handler: AuthenticatedUserStorageService['putIdentitySharingConsent'];
};

/**
 * Returns the assets-watchlist for the authenticated user.
 *
 * @returns The assets-watchlist blob, or `null` if none has been set (404).
 */
export type AuthenticatedUserStorageServiceGetAssetsWatchlistAction = {
  type: `AuthenticatedUserStorageService:getAssetsWatchlist`;
  handler: AuthenticatedUserStorageService['getAssetsWatchlist'];
};

/**
 * Creates or updates the assets-watchlist for the authenticated user.
 *
 * @param blob - The full assets-watchlist blob. The `assets` array may
 * contain at most `ASSETS_WATCHLIST_MAX_ASSETS` CAIP-19 asset identifiers;
 * this is enforced by `assertAssetsWatchlistBlobForWrite` before the
 * request is sent.
 * @param clientType - Optional client type header.
 * @throws A `StructError` from `@metamask/superstruct` if `blob` is
 * structurally invalid or `assets` exceeds the cap; an `HttpError` from
 * `@metamask/controller-utils` if the API responds with a non-2xx status.
 */
export type AuthenticatedUserStorageServiceSetAssetsWatchlistAction = {
  type: `AuthenticatedUserStorageService:setAssetsWatchlist`;
  handler: AuthenticatedUserStorageService['setAssetsWatchlist'];
};

/**
 * Union of all AuthenticatedUserStorageService action types.
 */
export type AuthenticatedUserStorageServiceMethodActions =
  | AuthenticatedUserStorageServiceListDelegationsAction
  | AuthenticatedUserStorageServiceCreateDelegationAction
  | AuthenticatedUserStorageServiceRevokeDelegationAction
  | AuthenticatedUserStorageServiceGetNotificationPreferencesAction
  | AuthenticatedUserStorageServicePutNotificationPreferencesAction
  | AuthenticatedUserStorageServiceGetMarketingConsentAction
  | AuthenticatedUserStorageServicePutMarketingConsentAction
  | AuthenticatedUserStorageServiceGetIdentitySharingConsentAction
  | AuthenticatedUserStorageServicePutIdentitySharingConsentAction
  | AuthenticatedUserStorageServiceGetAssetsWatchlistAction
  | AuthenticatedUserStorageServiceSetAssetsWatchlistAction;
