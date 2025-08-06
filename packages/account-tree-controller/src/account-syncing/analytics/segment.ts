export const MultichainAccountSyncingAnalyticsEvents = {
  WALLET_RENAMED: 'wallet_renamed',
  GROUP_ADDED: 'group_added',
  GROUP_RENAMED: 'group_renamed',
  GROUP_HIDDEN_STATUS_CHANGED: 'group_hidden_status_changed',
  GROUP_PINNED_STATUS_CHANGED: 'group_pinned_status_changed',
  LEGACY_SYNCING_DONE: 'legacy_syncing_done',
} as const;

const MULTICHAIN_ACCOUNT_SYNCING_EVENT_FEATURE_NAME =
  'Multichain Account Syncing';

export type MultichainAccountSyncingAnalyticsEvent =
  (typeof MultichainAccountSyncingAnalyticsEvents)[keyof typeof MultichainAccountSyncingAnalyticsEvents];

export type MultichainAccountSyncingEmitAnalyticsEventParams = {
  action: MultichainAccountSyncingAnalyticsEvent;
  profileId: string;
  additionalDescription?: string;
};

export type MultichainAccountSyncingAnalyticsEventPayload = {
  feature_name: typeof MULTICHAIN_ACCOUNT_SYNCING_EVENT_FEATURE_NAME;
  action: MultichainAccountSyncingAnalyticsEvent;
  profile_id: string;
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
}: MultichainAccountSyncingEmitAnalyticsEventParams): MultichainAccountSyncingAnalyticsEventPayload => {
  return {
    feature_name: MULTICHAIN_ACCOUNT_SYNCING_EVENT_FEATURE_NAME,
    action,
    profile_id: profileId,
    additional_description: additionalDescription,
  };
};
