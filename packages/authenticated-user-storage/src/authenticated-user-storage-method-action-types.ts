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
 * Returns the user-assets (custom tokens) blob for the authenticated user.
 *
 * @returns The user-assets blob, or `null` if none has been set (404).
 */
export type AuthenticatedUserStorageServiceGetUserAssetsAction = {
  type: `AuthenticatedUserStorageService:getUserAssets`;
  handler: AuthenticatedUserStorageService['getUserAssets'];
};

/**
 * Creates or updates the user-assets (custom tokens) blob for the
 * authenticated user.
 *
 * The blob is normalized before it is sent: entries are de-duplicated
 * (order-preserving) and conflicts between `importedAssets` and
 * `hiddenAssets` are resolved "fail-open" — an identifier present in both
 * lists stays in `importedAssets` (the user's intent to import wins) and is
 * removed from `hiddenAssets`, so the write is never rejected because of a
 * conflict.
 *
 * @param blob - The full user-assets blob. Every entry of
 * `importedAssets` and `hiddenAssets` must be a CAIP-19 asset identifier
 * (e.g. `eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48`);
 * this is enforced by `assertUserAssetsBlobForWrite` before the request
 * is sent.
 * @param clientType - Optional client type header.
 * @throws A `StructError` from `@metamask/superstruct` if `blob` is
 * structurally invalid; an `HttpError` from `@metamask/controller-utils`
 * if the API responds with a non-2xx status.
 */
export type AuthenticatedUserStorageServiceSetUserAssetsAction = {
  type: `AuthenticatedUserStorageService:setUserAssets`;
  handler: AuthenticatedUserStorageService['setUserAssets'];
};

/**
 * Imports custom tokens for the authenticated user.
 *
 * Adds the given CAIP-19 asset identifiers to `importedAssets`
 * (de-duplicated, existing order preserved) and removes them from
 * `hiddenAssets`, since the two lists are mutually exclusive and the
 * user's intent to import wins ("fail-open"). If no user-assets blob
 * exists yet (404), a fresh one is created.
 *
 * This is a convenience wrapper around `getUserAssets` and
 * `setUserAssets`; the SDK handles deduplication and mutual exclusivity
 * internally as a safeguard, so callers never need to read-modify-write
 * the blob themselves.
 *
 * @param ids - The CAIP-19 asset identifiers of the tokens to import
 * (e.g. `eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48`).
 * @param clientType - Optional client type header.
 * @returns The resolved user-assets blob that was persisted.
 * @throws A `StructError` from `@metamask/superstruct` if any entry of
 * `ids` is not a CAIP-19 asset identifier; an `HttpError` from
 * `@metamask/controller-utils` if the API responds with a non-2xx status.
 */
export type AuthenticatedUserStorageServiceImportTokensAction = {
  type: `AuthenticatedUserStorageService:importTokens`;
  handler: AuthenticatedUserStorageService['importTokens'];
};

/**
 * Hides custom tokens for the authenticated user.
 *
 * Adds the given CAIP-19 asset identifiers to `hiddenAssets`
 * (de-duplicated, existing order preserved) and removes them from
 * `importedAssets`, since the two lists are mutually exclusive. If no
 * user-assets blob exists yet (404), a fresh one is created.
 *
 * This is a convenience wrapper around `getUserAssets` and
 * `setUserAssets`; the SDK handles deduplication and mutual exclusivity
 * internally as a safeguard, so callers never need to read-modify-write
 * the blob themselves.
 *
 * @param ids - The CAIP-19 asset identifiers of the tokens to hide
 * (e.g. `eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48`).
 * @param clientType - Optional client type header.
 * @returns The resolved user-assets blob that was persisted.
 * @throws A `StructError` from `@metamask/superstruct` if any entry of
 * `ids` is not a CAIP-19 asset identifier; an `HttpError` from
 * `@metamask/controller-utils` if the API responds with a non-2xx status.
 */
export type AuthenticatedUserStorageServiceHideTokensAction = {
  type: `AuthenticatedUserStorageService:hideTokens`;
  handler: AuthenticatedUserStorageService['hideTokens'];
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
  | AuthenticatedUserStorageServiceGetAssetsWatchlistAction
  | AuthenticatedUserStorageServiceSetAssetsWatchlistAction
  | AuthenticatedUserStorageServiceGetUserAssetsAction
  | AuthenticatedUserStorageServiceSetUserAssetsAction
  | AuthenticatedUserStorageServiceImportTokensAction
  | AuthenticatedUserStorageServiceHideTokensAction;
