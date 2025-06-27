import type {
  RestrictedMessenger,
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type {
  AuthenticationController,
  UserStorageController,
} from '@metamask/profile-sync-controller';

import type {
  GatorPermissionsList,
  NativeTokenStreamPermission,
  NativeTokenPeriodicPermission,
  Erc20TokenStreamPermission,
  PermissionTypes,
  SignerParam,
  StoredGatorPermission,
} from './types';
import {
  deserializeGatorPermissionsList,
  serializeGatorPermissionsList,
} from './utils';

// Unique name for the controller
const controllerName = 'GatorPermissionsController';

// Unique name for the feature in profile sync
const GATOR_PERMISSIONS_FEATURE_NAME = 'gator_7715_permissions';

/**
 * State shape for GatorPermissionsController
 */
export type GatorPermissionsControllerState = {
  /**
   * Flag that indicates if the gator permissions feature is enabled
   */
  isGatorPermissionsEnabled: boolean;

  /**
   * JSON serialized object containing gator permissions fetched from profile sync indexed by permission type
   */
  gatorPermissionsListStringify: string;

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

const metadata: StateMetadata<GatorPermissionsControllerState> = {
  isGatorPermissionsEnabled: {
    persist: true,
    anonymous: false,
  },
  gatorPermissionsListStringify: {
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

const defaultGatorPermissionsList: GatorPermissionsList = {
  'native-token-stream': [],
  'native-token-periodic': [],
  'erc20-token-stream': [],
};

export const defaultState: GatorPermissionsControllerState = {
  isGatorPermissionsEnabled: false,
  gatorPermissionsListStringify: serializeGatorPermissionsList(
    defaultGatorPermissionsList,
  ),
  isUpdatingGatorPermissions: false,
  isFetchingGatorPermissions: false,
};

// Messenger Actions
type CreateActionsObj<Controller extends keyof GatorPermissionsController> = {
  [K in Controller]: {
    type: `${typeof controllerName}:${K}`;
    handler: GatorPermissionsController[K];
  };
};
type ActionsObj = CreateActionsObj<
  | 'fetchAndUpdateGatorPermissions'
  | 'enableGatorPermissions'
  | 'disableGatorPermissions'
>;

export type GatorPermissionsControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  GatorPermissionsControllerState
>;

// Messenger Actions
export type Actions =
  | ActionsObj[keyof ActionsObj]
  | GatorPermissionsControllerGetStateAction;

export type GatorPermissionsControllerFetchAndUpdateGatorPermissions =
  ActionsObj['fetchAndUpdateGatorPermissions'];

export type GatorPermissionsControllerEnableGatorPermissions =
  ActionsObj['enableGatorPermissions'];

export type GatorPermissionsControllerDisableGatorPermissions =
  ActionsObj['disableGatorPermissions'];

// Allowed Actions
export type AllowedActions =
  // Auth Controller Requests
  | AuthenticationController.AuthenticationControllerGetBearerToken
  | AuthenticationController.AuthenticationControllerIsSignedIn
  | AuthenticationController.AuthenticationControllerPerformSignIn
  // User Storage Controller Requests
  | UserStorageController.UserStorageControllerPerformGetStorageAllFeatureEntries;

// Messenger Events
export type GatorPermissionsControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    GatorPermissionsControllerState
  >;

export type Events = GatorPermissionsControllerStateChangeEvent;

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
      `${controllerName}:fetchAndUpdateGatorPermissions`,
      this.fetchAndUpdateGatorPermissions.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${controllerName}:enableGatorPermissions`,
      this.enableGatorPermissions.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${controllerName}:disableGatorPermissions`,
      this.disableGatorPermissions.bind(this),
    );
  }

  #clearLoadingStates(): void {
    this.update((state) => {
      state.isUpdatingGatorPermissions = false;
      state.isFetchingGatorPermissions = false;
    });
  }

  /**
   * Asserts that the gator permissions are enabled.
   *
   * @throws {Error} If the gator permissions are not enabled.
   */
  #assertGatorPermissionsEnabled() {
    if (!this.state.isGatorPermissionsEnabled) {
      throw new Error('Gator permissions are not enabled');
    }
  }

  /**
   * Gets the categorized gator permissions list from the state.
   *
   * @returns The categorized gator permissions list.
   */
  get gatorPermissionsList(): GatorPermissionsList {
    return deserializeGatorPermissionsList(
      this.state.gatorPermissionsListStringify,
    );
  }

  /**
   * Parses permissions from profile sync data and categorizes them by type.
   *
   * @param permissionsData - An JSON stringified array of permission strings from profile sync.
   * @returns Parsed and categorized permissions list.
   * @throws {Error} If permission type is invalid.
   */
  #categorizePermissionsDataByType(
    permissionsData: string[] | null,
  ): GatorPermissionsList {
    if (!permissionsData) {
      return defaultGatorPermissionsList;
    }

    return permissionsData.reduce(
      (gatorPermissionsList, permissionString) => {
        const parsedPermission = JSON.parse(
          permissionString,
        ) as StoredGatorPermission<SignerParam, PermissionTypes>;

        if (parsedPermission.permissionResponse.signer.type !== 'account') {
          throw new Error(
            'Invalid permission signer type. Only account signer is supported',
          );
        }

        const permissionType =
          parsedPermission.permissionResponse.permission.type;

        if (permissionType === 'native-token-stream') {
          gatorPermissionsList['native-token-stream'].push(
            parsedPermission as StoredGatorPermission<
              SignerParam,
              NativeTokenStreamPermission
            >,
          );
        } else if (permissionType === 'native-token-periodic') {
          gatorPermissionsList['native-token-periodic'].push(
            parsedPermission as StoredGatorPermission<
              SignerParam,
              NativeTokenPeriodicPermission
            >,
          );
        } else if (permissionType === 'erc20-token-stream') {
          gatorPermissionsList['erc20-token-stream'].push(
            parsedPermission as StoredGatorPermission<
              SignerParam,
              Erc20TokenStreamPermission
            >,
          );
        } else {
          throw new Error('Invalid permission type ');
        }

        return gatorPermissionsList;
      },
      {
        'native-token-stream': [],
        'native-token-periodic': [],
        'erc20-token-stream': [],
      } as GatorPermissionsList,
    );
  }

  /**
   * Enables authentication if not already enabled.
   *
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
   * @param isFetchingPermissions - Whether to fetch permissions after enabling.
   * @throws {Error} If there is an error during the process of enabling permissions.
   */
  public async enableGatorPermissions(isFetchingPermissions: boolean = true) {
    try {
      this.#setIsUpdatingGatorPermissions(true);
      await this.#enableAuth();
      this.#setIsGatorPermissionsEnabled(true);

      // Fetch initial permissions after enabling
      if (isFetchingPermissions) {
        await this.fetchAndUpdateGatorPermissions();
      }
    } catch (e) {
      console.error('Unable to enable gator permissions', e);
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
      state.gatorPermissionsListStringify = serializeGatorPermissionsList(
        defaultGatorPermissionsList,
      );
    });
  }

  /**
   * Fetches the list of gator permissions from profile sync and updates the state.
   * This is the main method that reads data from profile sync and caches it.
   *
   * @returns A promise that resolves to the list of permissions.
   * @throws {Error} Throws an error if unauthenticated or from other operations.
   */
  public async fetchAndUpdateGatorPermissions(): Promise<GatorPermissionsList> {
    try {
      this.#setIsFetchingGatorPermissions(true);
      this.#assertGatorPermissionsEnabled();
      await this.#enableAuth();

      // Fetch all permissions from profile sync
      const permissionsData = await this.messagingSystem.call(
        'UserStorageController:performGetStorageAllFeatureEntries',
        GATOR_PERMISSIONS_FEATURE_NAME,
      );

      // Categorize permissions by type and update state
      const gatorPermissionsList =
        this.#categorizePermissionsDataByType(permissionsData);

      this.update((state) => {
        state.gatorPermissionsListStringify =
          serializeGatorPermissionsList(gatorPermissionsList);
      });

      return gatorPermissionsList;
    } catch (err) {
      console.error('Failed to fetch gator permissions', err);
      throw new Error('Failed to fetch gator permissions');
    } finally {
      this.#setIsFetchingGatorPermissions(false);
    }
  }
}
