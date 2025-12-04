import { BackupAndSyncAnalyticsEvent, formatAnalyticsEvent } from './segment';
import type {
  BackupAndSyncAnalyticsAction,
  BackupAndSyncEmitAnalyticsEventParams,
  BackupAndSyncAnalyticsEventPayload,
} from './segment';

describe('BackupAndSyncAnalytics - Segment', () => {
  describe('BackupAndSyncAnalyticsEvents', () => {
    it('contains all expected event names', () => {
      expect(BackupAndSyncAnalyticsEvent).toStrictEqual({
        WalletRenamed: 'wallet_renamed',
        GroupAdded: 'group_added',
        GroupRenamed: 'group_renamed',
        GroupHiddenStatusChanged: 'group_hidden_status_changed',
        GroupPinnedStatusChanged: 'group_pinned_status_changed',
        LegacySyncingDone: 'legacy_syncing_done',
        LegacyGroupAddedFromAccount: 'legacy_group_added_from_account',
        LegacyGroupRenamed: 'legacy_group_renamed',
      });
    });
  });

  describe('formatAnalyticsEvent', () => {
    const mockProfileId = 'test-profile-id-123';

    it('formats analytics event with required parameters', () => {
      const params: BackupAndSyncEmitAnalyticsEventParams = {
        action: BackupAndSyncAnalyticsEvent.WalletRenamed,
        profileId: mockProfileId,
      };

      const result = formatAnalyticsEvent(params);

      const expected: BackupAndSyncAnalyticsEventPayload = {
        feature_name: 'Multichain Account Syncing',
        action: 'wallet_renamed',
        profile_id: mockProfileId,
      };

      expect(result).toStrictEqual(expected);
    });

    it('formats analytics event with additional description', () => {
      const additionalDescription = 'Wallet renamed from old to new';
      const params: BackupAndSyncEmitAnalyticsEventParams = {
        action: BackupAndSyncAnalyticsEvent.GroupRenamed,
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

    it('handles all event types correctly', () => {
      const eventTypes: BackupAndSyncAnalyticsAction[] = [
        BackupAndSyncAnalyticsEvent.WalletRenamed,
        BackupAndSyncAnalyticsEvent.GroupAdded,
        BackupAndSyncAnalyticsEvent.GroupRenamed,
        BackupAndSyncAnalyticsEvent.GroupHiddenStatusChanged,
        BackupAndSyncAnalyticsEvent.GroupPinnedStatusChanged,
        BackupAndSyncAnalyticsEvent.LegacySyncingDone,
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
        });
      });
    });

    it('handles empty additional description parameter', () => {
      const params: BackupAndSyncEmitAnalyticsEventParams = {
        action: BackupAndSyncAnalyticsEvent.GroupAdded,
        profileId: mockProfileId,
        additionalDescription: '',
      };

      const result = formatAnalyticsEvent(params);

      expect(result.additional_description).toBe('');
    });

    it('always includes the same feature name', () => {
      const params: BackupAndSyncEmitAnalyticsEventParams = {
        action: BackupAndSyncAnalyticsEvent.LegacySyncingDone,
        profileId: mockProfileId,
      };

      const result = formatAnalyticsEvent(params);

      expect(result.feature_name).toBe('Multichain Account Syncing');
    });
  });
});
