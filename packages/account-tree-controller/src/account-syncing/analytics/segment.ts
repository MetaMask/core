export const MultichainAccountSyncingAnalyticsEvents = {
  WALLET_RENAMED: 'wallet_renamed',
  GROUP_ADDED: 'group_added',
  GROUP_RENAMED: 'group_renamed',
  GROUP_HIDDEN_STATUS_CHANGED: 'group_hidden_status_changed',
  GROUP_PINNED_STATUS_CHANGED: 'group_pinned_status_changed',
  LEGACY_SYNCING_DONE: 'legacy_syncing_done',
} as const;

export type MultichainAccountSyncingAnalyticsEvent =
  (typeof MultichainAccountSyncingAnalyticsEvents)[keyof typeof MultichainAccountSyncingAnalyticsEvents];

export type MultichainAccountSyncingEmitAnalyticsEventParams = {
  action: MultichainAccountSyncingAnalyticsEvent;
  profileId: string;
  additionalDescription?: string;
};

export type MultichainAccountSyncingAnalyticsEventPayload = {
  feature_name: 'Multichain Account Syncing';
  action: MultichainAccountSyncingAnalyticsEvent;
  profile_id: string;
  additional_description?: string;
};

export const formatAnalyticsEvent = ({
  action,
  profileId,
  additionalDescription = '',
}: MultichainAccountSyncingEmitAnalyticsEventParams): MultichainAccountSyncingAnalyticsEventPayload => {
  return {
    feature_name: 'Multichain Account Syncing' as const,
    action,
    profile_id: profileId,
    additional_description: additionalDescription,
  };
};
