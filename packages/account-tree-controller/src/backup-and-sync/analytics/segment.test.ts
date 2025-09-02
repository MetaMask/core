import {
  BackupAndSyncAnalyticsEvents,
  formatAnalyticsEvent,
  type BackupAndSyncAnalyticsEvent,
  type BackupAndSyncEmitAnalyticsEventParams,
  type BackupAndSyncAnalyticsEventPayload,
} from './segment';

describe('BackupAndSyncAnalytics - Segment', () => {
  describe('BackupAndSyncAnalyticsEvents', () => {
    it('should contain all expected event names', () => {
      expect(BackupAndSyncAnalyticsEvents).toStrictEqual({
        WALLET_RENAMED: 'wallet_renamed',
        GROUP_ADDED: 'group_added',
        GROUP_RENAMED: 'group_renamed',
        GROUP_HIDDEN_STATUS_CHANGED: 'group_hidden_status_changed',
        GROUP_PINNED_STATUS_CHANGED: 'group_pinned_status_changed',
        LEGACY_SYNCING_DONE: 'legacy_syncing_done',
        LEGACY_GROUP_ADDED_FROM_ACCOUNT: 'legacy_group_added_from_account',
      });
    });
  });

  describe('formatAnalyticsEvent', () => {
    const mockProfileId = 'test-profile-id-123';

    it('should format analytics event with required parameters', () => {
      const params: BackupAndSyncEmitAnalyticsEventParams = {
        action: BackupAndSyncAnalyticsEvents.WALLET_RENAMED,
        profileId: mockProfileId,
      };

      const result = formatAnalyticsEvent(params);

      const expected: BackupAndSyncAnalyticsEventPayload = {
        feature_name: 'Multichain Account Syncing',
        action: 'wallet_renamed',
        profile_id: mockProfileId,
        additional_description: '',
      };

      expect(result).toStrictEqual(expected);
    });

    it('should format analytics event with additional description', () => {
      const additionalDescription = 'Wallet renamed from old to new';
      const params: BackupAndSyncEmitAnalyticsEventParams = {
        action: BackupAndSyncAnalyticsEvents.GROUP_RENAMED,
        profileId: mockProfileId,
        additionalDescription,
      };

      const result = formatAnalyticsEvent(params);

      expect(result).toStrictEqual({
        feature_name: 'Multichain Account Syncing',
        action: 'group_renamed',
        profile_id: mockProfileId,
        additional_description: additionalDescription,
      });
    });

    it('should handle all event types correctly', () => {
      const eventTypes: BackupAndSyncAnalyticsEvent[] = [
        BackupAndSyncAnalyticsEvents.WALLET_RENAMED,
        BackupAndSyncAnalyticsEvents.GROUP_ADDED,
        BackupAndSyncAnalyticsEvents.GROUP_RENAMED,
        BackupAndSyncAnalyticsEvents.GROUP_HIDDEN_STATUS_CHANGED,
        BackupAndSyncAnalyticsEvents.GROUP_PINNED_STATUS_CHANGED,
        BackupAndSyncAnalyticsEvents.LEGACY_SYNCING_DONE,
      ];

      eventTypes.forEach((action) => {
        const params: BackupAndSyncEmitAnalyticsEventParams = {
          action,
          profileId: mockProfileId,
        };

        const result = formatAnalyticsEvent(params);

        expect(result).toStrictEqual({
          feature_name: 'Multichain Account Syncing',
          action,
          profile_id: mockProfileId,
          additional_description: '',
        });
      });
    });

    it('should handle empty additional description parameter', () => {
      const params: BackupAndSyncEmitAnalyticsEventParams = {
        action: BackupAndSyncAnalyticsEvents.GROUP_ADDED,
        profileId: mockProfileId,
        additionalDescription: '',
      };

      const result = formatAnalyticsEvent(params);

      expect(result.additional_description).toBe('');
    });

    it('should always include the same feature name', () => {
      const params: BackupAndSyncEmitAnalyticsEventParams = {
        action: BackupAndSyncAnalyticsEvents.LEGACY_SYNCING_DONE,
        profileId: mockProfileId,
      };

      const result = formatAnalyticsEvent(params);

      expect(result.feature_name).toBe('Multichain Account Syncing');
    });
  });
});
