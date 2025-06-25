import type {
  RestrictedMessenger,
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { AuthenticationController, UserStorageController } from '@metamask/profile-sync-controller';
import log from 'loglevel';

// Unique name for the controller
const controllerName = 'GatorPermissionsController';

/**
 * State shape for GatorPermissionsController
 */
export type GatorPermissionsControllerState = {
  /**
   * Flag that indicates if the gator permissions feature is enabled
   */
  isGatorPermissionsEnabled: boolean;

  /**
   * List of gator permissions cached from profile sync
   */
  gatorPermissionsList: GatorPermission[];

  /**
   * Flag that indicates that fetching permissions is in progress
   * This is used to show a loading spinner in the UI
   */
  isFetchingGatorPermissions: boolean;

  /**
   * Flag that indicates that updating gator permissions is in progress
   */
  isUpdatingGatorPermissions: boolean;
};

/**
 * Represents a gator permission entry
 */
export type GatorPermission = any;

const metadata: StateMetadata<GatorPermissionsControllerState> = {
  isGatorPermissionsEnabled: {
    persist: true,
    anonymous: false,
  },
  gatorPermissionsList: {
    persist: true,
    anonymous: true,
  },
  isFetchingGatorPermissions: {
    persist: false,
    anonymous: false,
  },
  isUpdatingGatorPermissions: {
    persist: false,
    anonymous: false,
  },
};

export const defaultState: GatorPermissionsControllerState = {
  isGatorPermissionsEnabled: false,
  gatorPermissionsList: [],
  isUpdatingGatorPermissions: false,
  isFetchingGatorPermissions: false,
};

export type GatorPermissionsControllerGetStateAction =
  ControllerGetStateAction<
    typeof controllerName,
    GatorPermissionsControllerState
  >;

export type GatorPermissionsControllerFetchPermissions = {
  type: `${typeof controllerName}:fetchPermissions`;
  handler: GatorPermissionsController['fetchAndUpdateGatorPermissions'];
};

export type GatorPermissionsControllerEnablePermissions = {
  type: `${typeof controllerName}:enablePermissions`;
  handler: GatorPermissionsController['enableGatorPermissions'];
};

export type GatorPermissionsControllerDisablePermissions = {
  type: `${typeof controllerName}:disablePermissions`;
  handler: GatorPermissionsController['disableGatorPermissions'];
};

// Messenger Actions
export type Actions =
  | GatorPermissionsControllerGetStateAction
  | GatorPermissionsControllerFetchPermissions
  | GatorPermissionsControllerEnablePermissions
  | GatorPermissionsControllerDisablePermissions;

// Allowed Actions
export type AllowedActions =
  // Auth Controller Requests
  | AuthenticationController.AuthenticationControllerGetBearerToken
  | AuthenticationController.AuthenticationControllerIsSignedIn
  | AuthenticationController.AuthenticationControllerPerformSignIn
  // User Storage Controller Requests
  | UserStorageController.UserStorageControllerPerformGetStorageAllFeatureEntries;

// Events
export type GatorPermissionsControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    GatorPermissionsControllerState
  >;

export type PermissionsListUpdatedEvent = {
  type: `${typeof controllerName}:permissionsListUpdated`;
  payload: [GatorPermission[]];
};

export type Events =
  | GatorPermissionsControllerStateChangeEvent
  | PermissionsListUpdatedEvent;

// Allowed Events
export type AllowedEvents = GatorPermissionsControllerStateChangeEvent;

// Type for the messenger of GatorPermissionsController
export type GatorPermissionsControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  Actions | AllowedActions,
  Events | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

/**
 * Controller that manages gator permissions by reading from profile sync
 */
export default class GatorPermissionsController extends BaseController<
  typeof controllerName,
  GatorPermissionsControllerState,
  GatorPermissionsControllerMessenger
> {
  readonly #auth = {
    getBearerToken: async () => {
      return await this.messagingSystem.call(
        'AuthenticationController:getBearerToken',
      );
    },
    isSignedIn: () => {
      return this.messagingSystem.call('AuthenticationController:isSignedIn');
    },
    signIn: async () => {
      return await this.messagingSystem.call(
        'AuthenticationController:performSignIn',
      );
    },
  };

  /**
   * Creates a GatorPermissionsController instance.
   *
   * @param args - The arguments to this function.
   * @param args.messenger - Messenger used to communicate with BaseV2 controller.
   * @param args.state - Initial state to set on this controller.
   */
  constructor({
    messenger,
    state,
  }: {
    messenger: GatorPermissionsControllerMessenger;
    state?: Partial<GatorPermissionsControllerState>;
  }) {
    super({
      messenger,
      metadata,
      name: controllerName,
      state: { ...defaultState, ...state },
    });

    this.#registerMessageHandlers();
    this.#clearLoadingStates();
  }

  #setIsFetchingGatorPermissions(isFetchingGatorPermissions: boolean) {
    this.update((state) => {
      state.isFetchingGatorPermissions = isFetchingGatorPermissions;
    });
  }

  #setIsGatorPermissionsEnabled(isGatorPermissionsEnabled: boolean) {
    this.update((state) => {
      state.isGatorPermissionsEnabled = isGatorPermissionsEnabled;
    });
  }

  #setIsUpdatingGatorPermissions(isUpdatingGatorPermissions: boolean) {
    this.update((state) => {
      state.isUpdatingGatorPermissions = isUpdatingGatorPermissions;
    });
  }

  #registerMessageHandlers(): void {
    this.messagingSystem.registerActionHandler(
      `${controllerName}:fetchPermissions`,
      this.fetchAndUpdateGatorPermissions.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${controllerName}:enablePermissions`,
      this.enableGatorPermissions.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${controllerName}:disablePermissions`,
      this.disableGatorPermissions.bind(this),
    );
  }

  #clearLoadingStates(): void {
    this.update((state) => {
      state.isUpdatingGatorPermissions = false;
      state.isFetchingGatorPermissions = false;
      state.isUpdatingGatorPermissionsKey = [];
    });
  }

  /**
   * Asserts that the gator permissions are enabled.
   * @throws {Error} If the gator permissions are not enabled.
   */
  #assertGatorPermissionsEnabled() {
    if (!this.state.isGatorPermissionsEnabled) {
      throw new Error('Gator permissions are not enabled');
    }
  }

  /**
   * Enables authentication if not already enabled.
   * @throws {Error} If there is an error during the process.
   */
  async #enableAuth() {
    const isSignedIn = this.#auth.isSignedIn();
    if (!isSignedIn) {
      await this.#auth.signIn();
    }
  }

  /**
   * Enables gator permissions for the user.
   * This method ensures that the user is authenticated and enables the feature.
   *
   * @throws {Error} If there is an error during the process of enabling permissions.
   */
  public async enableGatorPermissions(
    isFetchingPermissions: boolean = true,
  ) {
    try {
      this.#setIsUpdatingGatorPermissions(true);
      await this.#enableAuth();
      this.#setIsGatorPermissionsEnabled(true);

      // Fetch initial permissions after enabling
      if (isFetchingPermissions) {
        await this.fetchAndUpdateGatorPermissions();
      }
    } catch (e) {
      log.error('Unable to enable gator permissions', e);
      throw new Error('Unable to enable gator permissions');
    } finally {
      this.#setIsUpdatingGatorPermissions(false);
    }
  }

  /**
   * Disables gator permissions for the user.
   * This method clears the permissions list and disables the feature.
   *
   * @throws {Error} If there is an error during the process.
   */
  public async disableGatorPermissions() {
    // Clear permissions from state
    this.update((state) => {
      state.isGatorPermissionsEnabled = false;
      state.gatorPermissionsList = [];
    });

    this.messagingSystem.publish(
      `${controllerName}:permissionsListUpdated`,
      [],
    );
  }

  /**
   * Fetches the list of gator permissions from profile sync and updates the state.
   * This is the main method that reads data from profile sync and caches it.
   *
   * @returns A promise that resolves to the list of permissions.
   * @throws {Error} Throws an error if unauthenticated or from other operations.
   */
  public async fetchAndUpdateGatorPermissions(): Promise<GatorPermission[]> {
    try {
      this.#setIsFetchingGatorPermissions(true);
      this.#assertGatorPermissionsEnabled();

      // Read all permissions from profile sync
      await this.#enableAuth();
      const permissionsData = await this.messagingSystem.call(
        'UserStorageController:performGetStorageAllFeatureEntries',
        'gator_7715_permissions',
      );

      if (!permissionsData) {
        this.update((state) => {
          state.gatorPermissionsList = [];
        });
        return [];
      }

      const permissions: GatorPermission[] = [];
      for (const permissionString of permissionsData) {
        try {
          const permission = JSON.parse(permissionString) as GatorPermission;
          permissions.push(permission);
        } catch (e) {
          log.error('Failed to parse permission data:', e);
        }
      }

      // Update state with fetched permissions
      this.update((state) => {
        state.gatorPermissionsList = permissions;
      });

      this.messagingSystem.publish(
        `${controllerName}:permissionsListUpdated`,
        this.state.gatorPermissionsList,
      );

      return permissions;
    } catch (err) {
      log.error('Failed to fetch gator permissions', err);
      throw new Error('Failed to fetch gator permissions');
    } finally {
      this.#setIsFetchingGatorPermissions(false);
    }
  }
} 