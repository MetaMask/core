import type { ProfileId } from '../authentication';

export const BackupAndSyncAnalyticsEvent = {
  WalletRenamed: 'wallet_renamed',
  GroupAdded: 'group_added',
  GroupRenamed: 'group_renamed',
  GroupHiddenStatusChanged: 'group_hidden_status_changed',
  GroupPinnedStatusChanged: 'group_pinned_status_changed',
  LegacySyncingDone: 'legacy_syncing_done',
  LegacyGroupAddedFromAccount: 'legacy_group_added_from_account',
  LegacyGroupRenamed: 'legacy_group_renamed',
} as const;

const BACKUP_AND_SYNC_EVENT_FEATURE_NAME = 'Multichain Account Syncing';

export type BackupAndSyncAnalyticsAction =
  (typeof BackupAndSyncAnalyticsEvent)[keyof typeof BackupAndSyncAnalyticsEvent];

export type BackupAndSyncEmitAnalyticsEventParams = {
  action: BackupAndSyncAnalyticsAction;
  profileId: ProfileId;
  additionalDescription?: string;
};

export type BackupAndSyncAnalyticsEventPayload = {
  feature_name: typeof BACKUP_AND_SYNC_EVENT_FEATURE_NAME;
  action: BackupAndSyncAnalyticsAction;
  profile_id: ProfileId;
  additional_description?: string;
};

/**
 * Formats the analytics event payload to match the segment schema.
 *
 * @param params - The parameters for the analytics event.
 * @param params.action - The action being performed.
 * @param params.profileId - The profile ID associated with the event.
 * @param params.additionalDescription - Optional additional description for the event.
 *
 * @returns The formatted event payload.
 */
export const formatAnalyticsEvent = ({
  action,
  profileId,
  additionalDescription = '',
}: BackupAndSyncEmitAnalyticsEventParams): BackupAndSyncAnalyticsEventPayload => {
  return {
    feature_name: BACKUP_AND_SYNC_EVENT_FEATURE_NAME,
    action,
    profile_id: profileId,
    additional_description: additionalDescription,
  };
};
