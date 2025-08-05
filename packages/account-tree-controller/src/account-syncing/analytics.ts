export enum MultichainAccountSyncingAnalyticsEvents {
  WALLET_RENAMED = 'wallet_renamed',
  GROUP_ADDED = 'group_added',
  GROUP_RENAMED = 'group_renamed',
  LEGACY_SYNCING_DONE = 'legacy_syncing_done',
}

type MultichainAccountSyncingEmitAnalyticsEventParams = {
  action: MultichainAccountSyncingAnalyticsEvents;
  profileId: string;
  additionalDescription?: string;
};

type MultichainAccountSyncingAnalyticsEvent = {
  feature_name: 'Multichain Account Syncing';
  action: MultichainAccountSyncingAnalyticsEvents;
  profile_id: string;
  additional_description?: string;
};

export const emitAnalyticsEvent = async ({
  action,
  profileId,
  additionalDescription = '',
}: MultichainAccountSyncingEmitAnalyticsEventParams): Promise<MultichainAccountSyncingAnalyticsEvent> => {
  return {
    feature_name: 'Multichain Account Syncing',
    action,
    profile_id: profileId,
    additional_description: additionalDescription,
  };
};
