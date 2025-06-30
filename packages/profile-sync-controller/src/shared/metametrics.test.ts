import {
  BackupAndSyncFeatureNames,
  BackupAndSyncActions,
  BackupAndSyncEventProperties,
  createBackupAndSyncEventProperties,
  type BackupAndSyncFeatureName,
  type BackupAndSyncAction,
} from './metametrics';

describe('BackupAndSync MetaMetrics Library', () => {
  describe('BackupAndSyncFeatureNames', () => {
    it('should have the correct feature names', () => {
      expect(BackupAndSyncFeatureNames.BACKUP_AND_SYNC).toBe('Backup And Sync');
      expect(BackupAndSyncFeatureNames.ACCOUNT_SYNCING).toBe('Account Syncing');
      expect(BackupAndSyncFeatureNames.CONTACT_SYNCING).toBe('Contact Syncing');
      expect(BackupAndSyncFeatureNames.NETWORK_SYNCING).toBe('Network Syncing');
      expect(BackupAndSyncFeatureNames.AUTHENTICATION).toBe('Authentication');
    });
  });

  describe('BackupAndSyncActions', () => {
    it('should have the correct action names', () => {
      expect(BackupAndSyncActions.ACCOUNTS_SYNC_ADDED).toBe(
        'Accounts Sync Added',
      );
      expect(BackupAndSyncActions.ACCOUNTS_SYNC_NAME_UPDATED).toBe(
        'Accounts Sync Name Updated',
      );
      expect(BackupAndSyncActions.ACCOUNTS_SYNC_ERRONEOUS_SITUATION).toBe(
        'Accounts Sync Erroneous Situation',
      );
      expect(BackupAndSyncActions.CONTACTS_SYNC_CONTACT_UPDATED).toBe(
        'Contacts Sync Contact Updated',
      );
      expect(BackupAndSyncActions.CONTACTS_SYNC_CONTACT_DELETED).toBe(
        'Contacts Sync Contact Deleted',
      );
      expect(BackupAndSyncActions.CONTACTS_SYNC_ERRONEOUS_SITUATION).toBe(
        'Contacts Sync Erroneous Situation',
      );
    });
  });

  describe('createBackupAndSyncEventProperties', () => {
    it('should create event properties with feature name and action', () => {
      const properties = createBackupAndSyncEventProperties(
        BackupAndSyncFeatureNames.BACKUP_AND_SYNC,
        BackupAndSyncActions.CONTACTS_SYNC_CONTACT_UPDATED,
        { profile_id: 'test-profile-id' },
      );

      expect(properties).toStrictEqual({
        feature_name: 'Backup And Sync',
        action: 'Contacts Sync Contact Updated',
        profile_id: 'test-profile-id',
      });
    });

    it('should work without additional properties', () => {
      const properties = createBackupAndSyncEventProperties(
        BackupAndSyncFeatureNames.BACKUP_AND_SYNC,
        BackupAndSyncActions.CONTACTS_SYNC_CONTACT_UPDATED,
      );

      expect(properties).toStrictEqual({
        feature_name: 'Backup And Sync',
        action: 'Contacts Sync Contact Updated',
      });
    });
  });

  describe('BackupAndSyncEventProperties', () => {
    describe('ACCOUNT_ADDED', () => {
      it('should create account added properties', () => {
        const properties =
          BackupAndSyncEventProperties.ACCOUNT_ADDED('test-profile-id');
        expect(properties).toStrictEqual({
          profile_id: 'test-profile-id',
        });
      });
    });

    describe('ACCOUNT_NAME_UPDATED', () => {
      it('should create account name updated properties', () => {
        const properties =
          BackupAndSyncEventProperties.ACCOUNT_NAME_UPDATED('test-profile-id');
        expect(properties).toStrictEqual({
          profile_id: 'test-profile-id',
        });
      });
    });

    describe('ACCOUNT_SYNC_ERROR', () => {
      it('should create account sync error properties', () => {
        const properties = BackupAndSyncEventProperties.ACCOUNT_SYNC_ERROR(
          'test-profile-id',
          'test error message',
        );
        expect(properties).toStrictEqual({
          profile_id: 'test-profile-id',
          situation_message: 'test error message',
        });
      });
    });

    describe('CONTACT_UPDATED', () => {
      it('should create contact updated properties', () => {
        const properties =
          BackupAndSyncEventProperties.CONTACT_UPDATED('test-profile-id');
        expect(properties).toStrictEqual({
          feature_name: 'Backup And Sync',
          action: 'Contacts Sync Contact Updated',
          profile_id: 'test-profile-id',
        });
      });
    });

    describe('CONTACT_DELETED', () => {
      it('should create contact deleted properties', () => {
        const properties =
          BackupAndSyncEventProperties.CONTACT_DELETED('test-profile-id');
        expect(properties).toStrictEqual({
          feature_name: 'Backup And Sync',
          action: 'Contacts Sync Contact Deleted',
          profile_id: 'test-profile-id',
        });
      });
    });

    describe('CONTACT_SYNC_ERROR', () => {
      it('should create contact sync error properties', () => {
        const properties = BackupAndSyncEventProperties.CONTACT_SYNC_ERROR(
          'test-profile-id',
          'test error message',
        );
        expect(properties).toStrictEqual({
          feature_name: 'Backup And Sync',
          action: 'Contacts Sync Erroneous Situation',
          profile_id: 'test-profile-id',
          additional_description: 'test error message',
        });
      });
    });

    describe('NETWORK_ADDED', () => {
      it('should create network added properties', () => {
        const properties = BackupAndSyncEventProperties.NETWORK_ADDED(
          'test-profile-id',
          '0x1',
        );
        expect(properties).toStrictEqual({
          profile_id: 'test-profile-id',
          chain_id: '0x1',
        });
      });
    });

    describe('NETWORK_UPDATED', () => {
      it('should create network updated properties', () => {
        const properties = BackupAndSyncEventProperties.NETWORK_UPDATED(
          'test-profile-id',
          '0x1',
        );
        expect(properties).toStrictEqual({
          profile_id: 'test-profile-id',
          chain_id: '0x1',
        });
      });
    });

    describe('NETWORK_REMOVED', () => {
      it('should create network removed properties', () => {
        const properties = BackupAndSyncEventProperties.NETWORK_REMOVED(
          'test-profile-id',
          '0x1',
        );
        expect(properties).toStrictEqual({
          profile_id: 'test-profile-id',
          chain_id: '0x1',
        });
      });
    });
  });

  describe('Type safety', () => {
    it('should enforce correct feature name types', () => {
      // This should compile without errors
      const validFeatureName: BackupAndSyncFeatureName =
        BackupAndSyncFeatureNames.BACKUP_AND_SYNC;
      expect(validFeatureName).toBe('Backup And Sync');
    });

    it('should enforce correct action types', () => {
      // This should compile without errors
      const validAction: BackupAndSyncAction =
        BackupAndSyncActions.CONTACTS_SYNC_CONTACT_UPDATED;
      expect(validAction).toBe('Contacts Sync Contact Updated');
    });
  });
});
