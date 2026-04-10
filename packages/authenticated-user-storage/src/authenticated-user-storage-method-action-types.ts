/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { AuthenticatedUserStorage } from './authenticated-user-storage';

/**
 * Returns all delegation records belonging to the authenticated user.
 *
 * @returns An array of delegation records, or an empty array if none exist.
 */
export type AuthenticatedUserStorageListDelegationsAction = {
  type: `AuthenticatedUserStorage:listDelegations`;
  handler: AuthenticatedUserStorage['listDelegations'];
};

/**
 * Stores a signed delegation record for the authenticated user.
 *
 * @param submission - The signed delegation and its metadata.
 * @param clientType - Optional client type header.
 */
export type AuthenticatedUserStorageCreateDelegationAction = {
  type: `AuthenticatedUserStorage:createDelegation`;
  handler: AuthenticatedUserStorage['createDelegation'];
};

/**
 * Revokes (deletes) a delegation record.
 *
 * @param delegationHash - The unique hash identifying the delegation.
 */
export type AuthenticatedUserStorageRevokeDelegationAction = {
  type: `AuthenticatedUserStorage:revokeDelegation`;
  handler: AuthenticatedUserStorage['revokeDelegation'];
};

/**
 * Returns the notification preferences for the authenticated user.
 *
 * @returns The notification preferences object, or `null` if none have been
 * set (404).
 */
export type AuthenticatedUserStorageGetNotificationPreferencesAction = {
  type: `AuthenticatedUserStorage:getNotificationPreferences`;
  handler: AuthenticatedUserStorage['getNotificationPreferences'];
};

/**
 * Creates or updates the notification preferences for the authenticated user.
 *
 * @param prefs - The full notification preferences object.
 * @param clientType - Optional client type header.
 */
export type AuthenticatedUserStoragePutNotificationPreferencesAction = {
  type: `AuthenticatedUserStorage:putNotificationPreferences`;
  handler: AuthenticatedUserStorage['putNotificationPreferences'];
};

/**
 * Union of all AuthenticatedUserStorage action types.
 */
export type AuthenticatedUserStorageMethodActions =
  | AuthenticatedUserStorageListDelegationsAction
  | AuthenticatedUserStorageCreateDelegationAction
  | AuthenticatedUserStorageRevokeDelegationAction
  | AuthenticatedUserStorageGetNotificationPreferencesAction
  | AuthenticatedUserStoragePutNotificationPreferencesAction;
