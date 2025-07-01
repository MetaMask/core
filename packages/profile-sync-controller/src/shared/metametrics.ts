/**
 * MetaMetrics events library for profile-sync-controller
 *
 * This library provides type-safe event definitions that mirror the segment schema,
 * ensuring consistency and providing compile-time validation for event properties.
 */

/**
 * Interface defining the structure of an identity event
 */
export type IdentityEvent = {
  name: string;
  properties: {
    [key: string]: {
      required: boolean;
      type: 'string' | 'number' | 'boolean';
      fromObject?: Record<string, string>;
    };
  };
};

/**
 * Type utility to extract property types from event definitions
 */
type PropertyType<T, FromObject> =
  FromObject extends Record<string, string>
    ? FromObject[keyof FromObject]
    : T extends 'string'
      ? string
      : T extends 'number'
        ? number
        : T extends 'boolean'
          ? boolean
          : never;

/**
 * Type utility to generate event properties with proper required/optional handling
 */
type EventProperties<T extends IdentityEvent> = {
  [K in keyof T['properties'] as T['properties'][K]['required'] extends true
    ? K
    : never]: PropertyType<
    T['properties'][K]['type'],
    T['properties'][K]['fromObject']
  >;
} & {
  [K in keyof T['properties'] as T['properties'][K]['required'] extends false
    ? K
    : never]?: PropertyType<
    T['properties'][K]['type'],
    T['properties'][K]['fromObject']
  >;
};

/**
 * Identity events definitions matching the segment schema
 */
export const IDENTITY_EVENTS = {
  ACCOUNT_SYNCING: {
    ACCOUNTS_SYNC_ADDED: {
      name: 'Accounts Sync Added',
      properties: {
        profile_id: {
          required: true,
          type: 'string',
        },
      },
    },
    ACCOUNTS_SYNC_NAME_UPDATED: {
      name: 'Accounts Sync Name Updated',
      properties: {
        profile_id: {
          required: true,
          type: 'string',
        },
      },
    },
    ACCOUNTS_SYNC_ERRONEOUS_SITUATION: {
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
    },
  },
  NETWORK_SYNCING: {
    NETWORK_SYNC_ADDED: {
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
    },
    NETWORK_SYNC_UPDATED: {
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
    },
    NETWORK_SYNC_REMOVED: {
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
    },
  },
  PROFILE: {
    ACTIVITY_UPDATED: {
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
    },
    BACKUP_AND_SYNC_INTRODUCTION_MODAL_INTERACTION: {
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
    },
  },
} as const satisfies Record<string, Record<string, IdentityEvent>>;

/**
 * Type-safe event builder function
 *
 * @param event - The event definition
 * @param properties - The event properties (type-checked)
 * @returns An object with the event name and properties
 */
export const buildIdentityEvent = <T extends IdentityEvent>(
  event: T,
  properties: EventProperties<T>,
): { name: (typeof event)['name']; properties: typeof properties } => ({
  name: event.name,
  properties,
});

// Export types for external use
export type IdentityEventBuilder = typeof buildIdentityEvent;
export type IdentityEventDefinitions = typeof IDENTITY_EVENTS;
