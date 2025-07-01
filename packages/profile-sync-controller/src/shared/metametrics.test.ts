import {
  IDENTITY_EVENTS,
  buildIdentityEvent,
  type IdentityEvent,
  type IdentityEventBuilder,
  type IdentityEventDefinitions,
} from './metametrics';

describe('Identity MetaMetrics Library', () => {
  describe('IDENTITY_EVENTS', () => {
    it('should have correct structure for account syncing events', () => {
      expect(IDENTITY_EVENTS.ACCOUNT_SYNCING.ACCOUNTS_SYNC_ADDED).toStrictEqual(
        {
          name: 'Accounts Sync Added',
          properties: {
            profile_id: {
              required: true,
              type: 'string',
            },
          },
        },
      );

      expect(
        IDENTITY_EVENTS.ACCOUNT_SYNCING.ACCOUNTS_SYNC_NAME_UPDATED,
      ).toStrictEqual({
        name: 'Accounts Sync Name Updated',
        properties: {
          profile_id: {
            required: true,
            type: 'string',
          },
        },
      });

      expect(
        IDENTITY_EVENTS.ACCOUNT_SYNCING.ACCOUNTS_SYNC_ERRONEOUS_SITUATION,
      ).toStrictEqual({
        name: 'Accounts Sync Erroneous Situation',
        properties: {
          profile_id: {
            required: true,
            type: 'string',
          },
          situation_message: {
            required: true,
            type: 'string',
          },
        },
      });
    });

    it('should have correct structure for network syncing events', () => {
      expect(IDENTITY_EVENTS.NETWORK_SYNCING.NETWORK_SYNC_ADDED).toStrictEqual({
        name: 'Network Sync Added',
        properties: {
          profile_id: {
            required: true,
            type: 'string',
          },
          chain_id: {
            required: true,
            type: 'string',
          },
        },
      });

      expect(
        IDENTITY_EVENTS.NETWORK_SYNCING.NETWORK_SYNC_UPDATED,
      ).toStrictEqual({
        name: 'Network Sync Updated',
        properties: {
          profile_id: {
            required: true,
            type: 'string',
          },
          chain_id: {
            required: true,
            type: 'string',
          },
        },
      });

      expect(
        IDENTITY_EVENTS.NETWORK_SYNCING.NETWORK_SYNC_REMOVED,
      ).toStrictEqual({
        name: 'Network Sync Removed',
        properties: {
          profile_id: {
            required: true,
            type: 'string',
          },
          chain_id: {
            required: true,
            type: 'string',
          },
        },
      });
    });

    it('should have correct structure for profile events', () => {
      expect(IDENTITY_EVENTS.PROFILE.ACTIVITY_UPDATED).toStrictEqual({
        name: 'Profile Activity Updated',
        properties: {
          profile_id: {
            required: false,
            type: 'string',
          },
          feature_name: {
            required: true,
            type: 'string',
            fromObject: {
              BACKUP_AND_SYNC: 'Backup And Sync',
              AUTHENTICATION: 'Authentication',
            },
          },
          action: {
            required: true,
            type: 'string',
            fromObject: {
              CONTACTS_SYNC_CONTACT_UPDATED: 'Contacts Sync Contact Updated',
              CONTACTS_SYNC_CONTACT_DELETED: 'Contacts Sync Contact Deleted',
              CONTACTS_SYNC_ERRONEOUS_SITUATION:
                'Contacts Sync Erroneous Situation',
              SETTINGS_TOGGLE_ENABLED: 'settings_toggle_enabled',
              SETTINGS_TOGGLE_DISABLED: 'settings_toggle_disabled',
              SIGN_IN: 'Sign In',
              SIGN_OUT: 'Sign Out',
              AUTHENTICATION_FAILED: 'Authentication Failed',
            },
          },
          additional_description: {
            required: false,
            type: 'string',
          },
        },
      });

      expect(
        IDENTITY_EVENTS.PROFILE.BACKUP_AND_SYNC_INTRODUCTION_MODAL_INTERACTION,
      ).toStrictEqual({
        name: 'Backup And Sync Introduction Modal Interaction',
        properties: {
          profile_id: {
            required: false,
            type: 'string',
          },
          action: {
            required: true,
            type: 'string',
            fromObject: {
              MODAL_OPENED: 'modal_opened',
              MODAL_CLOSED: 'modal_closed',
              ENABLE_CLICKED: 'enable_clicked',
              DISMISS_CLICKED: 'dismiss_clicked',
            },
          },
        },
      });
    });
  });

  describe('buildIdentityEvent', () => {
    it('should build account sync added event correctly', () => {
      const event = buildIdentityEvent(
        IDENTITY_EVENTS.ACCOUNT_SYNCING.ACCOUNTS_SYNC_ADDED,
        {
          profile_id: 'test-profile-id',
        },
      );

      expect(event.name).toBe('Accounts Sync Added');
      expect(event.properties).toStrictEqual({
        profile_id: 'test-profile-id',
      });
    });

    it('should build account sync name updated event correctly', () => {
      const event = buildIdentityEvent(
        IDENTITY_EVENTS.ACCOUNT_SYNCING.ACCOUNTS_SYNC_NAME_UPDATED,
        {
          profile_id: 'test-profile-id',
        },
      );

      expect(event.name).toBe('Accounts Sync Name Updated');
      expect(event.properties).toStrictEqual({
        profile_id: 'test-profile-id',
      });
    });

    it('should build account sync erroneous situation event correctly', () => {
      const event = buildIdentityEvent(
        IDENTITY_EVENTS.ACCOUNT_SYNCING.ACCOUNTS_SYNC_ERRONEOUS_SITUATION,
        {
          profile_id: 'test-profile-id',
          situation_message: 'test error message',
        },
      );

      expect(event.name).toBe('Accounts Sync Erroneous Situation');
      expect(event.properties).toStrictEqual({
        profile_id: 'test-profile-id',
        situation_message: 'test error message',
      });
    });

    it('should build network sync events correctly', () => {
      const addedEvent = buildIdentityEvent(
        IDENTITY_EVENTS.NETWORK_SYNCING.NETWORK_SYNC_ADDED,
        {
          profile_id: 'test-profile-id',
          chain_id: '0x1',
        },
      );

      expect(addedEvent.name).toBe('Network Sync Added');
      expect(addedEvent.properties).toStrictEqual({
        profile_id: 'test-profile-id',
        chain_id: '0x1',
      });

      const updatedEvent = buildIdentityEvent(
        IDENTITY_EVENTS.NETWORK_SYNCING.NETWORK_SYNC_UPDATED,
        {
          profile_id: 'test-profile-id',
          chain_id: '0x1',
        },
      );

      expect(updatedEvent.name).toBe('Network Sync Updated');
      expect(updatedEvent.properties).toStrictEqual({
        profile_id: 'test-profile-id',
        chain_id: '0x1',
      });

      const removedEvent = buildIdentityEvent(
        IDENTITY_EVENTS.NETWORK_SYNCING.NETWORK_SYNC_REMOVED,
        {
          profile_id: 'test-profile-id',
          chain_id: '0x1',
        },
      );

      expect(removedEvent.name).toBe('Network Sync Removed');
      expect(removedEvent.properties).toStrictEqual({
        profile_id: 'test-profile-id',
        chain_id: '0x1',
      });
    });

    it('should build profile activity updated event with contacts sync action', () => {
      const event = buildIdentityEvent(
        IDENTITY_EVENTS.PROFILE.ACTIVITY_UPDATED,
        {
          profile_id: 'test-profile-id',
          feature_name: 'Backup And Sync',
          action: 'Contacts Sync Contact Updated',
        },
      );

      expect(event.name).toBe('Profile Activity Updated');
      expect(event.properties).toStrictEqual({
        profile_id: 'test-profile-id',
        feature_name: 'Backup And Sync',
        action: 'Contacts Sync Contact Updated',
      });
    });

    it('should build profile activity updated event with authentication action', () => {
      const event = buildIdentityEvent(
        IDENTITY_EVENTS.PROFILE.ACTIVITY_UPDATED,
        {
          feature_name: 'Authentication',
          action: 'Sign In',
        },
      );

      expect(event.name).toBe('Profile Activity Updated');
      expect(event.properties).toStrictEqual({
        feature_name: 'Authentication',
        action: 'Sign In',
      });
    });

    it('should build profile activity updated event with optional additional description', () => {
      const event = buildIdentityEvent(
        IDENTITY_EVENTS.PROFILE.ACTIVITY_UPDATED,
        {
          profile_id: 'test-profile-id',
          feature_name: 'Backup And Sync',
          action: 'Contacts Sync Erroneous Situation',
          additional_description: 'test error message',
        },
      );

      expect(event.name).toBe('Profile Activity Updated');
      expect(event.properties).toStrictEqual({
        profile_id: 'test-profile-id',
        feature_name: 'Backup And Sync',
        action: 'Contacts Sync Erroneous Situation',
        additional_description: 'test error message',
      });
    });

    it('should build backup and sync introduction modal interaction event', () => {
      const event = buildIdentityEvent(
        IDENTITY_EVENTS.PROFILE.BACKUP_AND_SYNC_INTRODUCTION_MODAL_INTERACTION,
        {
          profile_id: 'test-profile-id',
          action: 'enable_clicked',
        },
      );

      expect(event.name).toBe('Backup And Sync Introduction Modal Interaction');
      expect(event.properties).toStrictEqual({
        profile_id: 'test-profile-id',
        action: 'enable_clicked',
      });
    });
  });

  describe('Type safety', () => {
    it('should export correct types', () => {
      // These are compile-time checks, ensuring types are properly exported
      const builder: IdentityEventBuilder = buildIdentityEvent;
      const events: IdentityEventDefinitions = IDENTITY_EVENTS;

      expect(builder).toBeDefined();
      expect(events).toBeDefined();
    });
  });
});
