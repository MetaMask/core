/**
 * MetaMetrics event constants for profile-sync-controller
 *
 * This library provides standardized constants for MetaMetrics events
 * to avoid magic strings and ensure consistency across clients.
 */

/**
 * Feature names used in profile-sync-controller MetaMetrics events
 */
export const ProfileSyncFeatureNames = {
  /**
   * The main backup and sync feature
   */
  BACKUP_AND_SYNC: 'Backup And Sync',
  /**
   * Account syncing functionality
   */
  ACCOUNT_SYNCING: 'Account Syncing',
  /**
   * Contact syncing functionality
   */
  CONTACT_SYNCING: 'Contact Syncing',
  /**
   * Network syncing functionality
   */
  NETWORK_SYNCING: 'Network Syncing',
  /**
   * Authentication functionality
   */
  AUTHENTICATION: 'Authentication',
} as const;

/**
 * Actions used in profile-sync-controller MetaMetrics events
 */
export const ProfileSyncActions = {
  // Account syncing actions
  ACCOUNTS_SYNC_ADDED: 'Accounts Sync Added',
  ACCOUNTS_SYNC_NAME_UPDATED: 'Accounts Sync Name Updated',
  ACCOUNTS_SYNC_ERRONEOUS_SITUATION: 'Accounts Sync Erroneous Situation',

  // Contact syncing actions
  CONTACTS_SYNC_CONTACT_UPDATED: 'Contacts Sync Contact Updated',
  CONTACTS_SYNC_CONTACT_DELETED: 'Contacts Sync Contact Deleted',
  CONTACTS_SYNC_ERRONEOUS_SITUATION: 'Contacts Sync Erroneous Situation',

  // Network syncing actions
  NETWORK_SYNC_ADDED: 'Network Sync Added',
  NETWORK_SYNC_UPDATED: 'Network Sync Updated',
  NETWORK_SYNC_REMOVED: 'Network Sync Removed',

  // Authentication actions
  SIGN_IN: 'Sign In',
  SIGN_OUT: 'Sign Out',
  AUTHENTICATION_FAILED: 'Authentication Failed',
} as const;

/**
 * Type definitions for the constants to ensure type safety
 */
export type ProfileSyncFeatureName =
  (typeof ProfileSyncFeatureNames)[keyof typeof ProfileSyncFeatureNames];
export type ProfileSyncAction =
  (typeof ProfileSyncActions)[keyof typeof ProfileSyncActions];

/**
 * Helper function to create standardized MetaMetrics event properties
 * for profile-sync-controller events
 *
 * @param featureName - The feature name to use in the event properties
 * @param action - The action to use in the event properties
 * @param additionalProperties - Optional additional properties to include
 * @returns An object containing the standardized event properties
 */
export const createProfileSyncEventProperties = (
  featureName: ProfileSyncFeatureName,
  action: ProfileSyncAction,
  additionalProperties?: Record<string, unknown>,
) => ({
  feature_name: featureName,
  action,
  ...additionalProperties,
});

/**
 * Pre-defined event property sets for common profile-sync-controller events
 */
export const ProfileSyncEventProperties = {
  // Account syncing events
  ACCOUNT_ADDED: (profileId: string) => ({
    profile_id: profileId,
  }),
  ACCOUNT_NAME_UPDATED: (profileId: string) => ({
    profile_id: profileId,
  }),
  ACCOUNT_SYNC_ERROR: (profileId: string, situationMessage: string) => ({
    profile_id: profileId,
    situation_message: situationMessage,
  }),

  // Contact syncing events
  CONTACT_UPDATED: (profileId: string) =>
    createProfileSyncEventProperties(
      ProfileSyncFeatureNames.BACKUP_AND_SYNC,
      ProfileSyncActions.CONTACTS_SYNC_CONTACT_UPDATED,
      { profile_id: profileId },
    ),
  CONTACT_DELETED: (profileId: string) =>
    createProfileSyncEventProperties(
      ProfileSyncFeatureNames.BACKUP_AND_SYNC,
      ProfileSyncActions.CONTACTS_SYNC_CONTACT_DELETED,
      { profile_id: profileId },
    ),
  CONTACT_SYNC_ERROR: (profileId: string, situationMessage: string) =>
    createProfileSyncEventProperties(
      ProfileSyncFeatureNames.BACKUP_AND_SYNC,
      ProfileSyncActions.CONTACTS_SYNC_ERRONEOUS_SITUATION,
      {
        profile_id: profileId,
        additional_description: situationMessage,
      },
    ),

  // Network syncing events
  NETWORK_ADDED: (profileId: string, chainId: string) => ({
    profile_id: profileId,
    chain_id: chainId,
  }),
  NETWORK_UPDATED: (profileId: string, chainId: string) => ({
    profile_id: profileId,
    chain_id: chainId,
  }),
  NETWORK_REMOVED: (profileId: string, chainId: string) => ({
    profile_id: profileId,
    chain_id: chainId,
  }),
} as const;
