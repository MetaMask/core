import type {
  RestrictedMessenger,
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { HandleSnapRequest, HasSnap } from '@metamask/snaps-controllers';
import type { SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';

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

// Default value for the gator permissions provider snap id
const defaultGatorPermissionsProviderSnapId =
  '@metamask/gator-permissions-snap' as SnapId;

// Enum for the RPC methods of the gator permissions provider snap
enum GatorPermissionsSnapRpcMethod {
  /**
   * This method is used by the metamask to request a permissions provider to get granted permissions for all sites.
   */
  PermissionProviderGetGrantedPermissions = 'permissionsProvider_getGrantedPermissions',
}

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
};

const defaultGatorPermissionsList: GatorPermissionsList = {
  'native-token-stream': {},
  'native-token-periodic': {},
  'erc20-token-stream': {},
};

export const defaultState: GatorPermissionsControllerState = {
  isGatorPermissionsEnabled: false,
  gatorPermissionsListStringify: serializeGatorPermissionsList(
    defaultGatorPermissionsList,
  ),
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
export type GatorPermissionsControllerActions =
  | ActionsObj[keyof ActionsObj]
  | GatorPermissionsControllerGetStateAction;

export type GatorPermissionsControllerFetchAndUpdateGatorPermissions =
  ActionsObj['fetchAndUpdateGatorPermissions'];

export type GatorPermissionsControllerEnableGatorPermissions =
  ActionsObj['enableGatorPermissions'];

export type GatorPermissionsControllerDisableGatorPermissions =
  ActionsObj['disableGatorPermissions'];

/**
 * Actions that this controller is allowed to call.
 */
export type AllowedActions =
  // Snap Requests
  HandleSnapRequest | HasSnap;

export type GatorPermissionsControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    GatorPermissionsControllerState
  >;

/**
 * Events emitted by GatorPermissionsController.
 */
export type GatorPermissionsControllerActionsEvents =
  GatorPermissionsControllerStateChangeEvent;

/**
 * Events that this controller is allowed to subscribe to.
 */
export type AllowedEvents = GatorPermissionsControllerStateChangeEvent;

/**
 * Messenger type for the GatorPermissionsController.
 */
export type GatorPermissionsControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  GatorPermissionsControllerActions | AllowedActions,
  GatorPermissionsControllerActionsEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

/**
 * Configuration for the GatorPermissionsController.
 * Default value is `{ gatorPermissionsProviderSnapId: '@metamask/gator-permissions-snap' }`
 * when no config is provided.
 */
export type GatorPermissionsControllerConfig = {
  /**
   * The ID of the Snap of the gator permissions provider snap
   */
  gatorPermissionsProviderSnapId: SnapId;
};

/**
 * Controller that manages gator permissions by reading from profile sync
 */
export default class GatorPermissionsController extends BaseController<
  typeof controllerName,
  GatorPermissionsControllerState,
  GatorPermissionsControllerMessenger
> {
  private readonly gatorPermissionsProviderSnapId: SnapId;

  /**
   * Creates a GatorPermissionsController instance.
   *
   * @param args - The arguments to this function.
   * @param args.messenger - Messenger used to communicate with BaseV2 controller.
   * @param args.state - Initial state to set on this controller.
   * @param args.config - Configuration for the GatorPermissionsController.
   */
  constructor({
    messenger,
    state,
    config,
  }: {
    messenger: GatorPermissionsControllerMessenger;
    state?: Partial<GatorPermissionsControllerState>;
    config?: GatorPermissionsControllerConfig;
  }) {
    super({
      messenger,
      metadata,
      name: controllerName,
      state: { ...defaultState, ...state },
    });

    this.gatorPermissionsProviderSnapId =
      config?.gatorPermissionsProviderSnapId ??
      defaultGatorPermissionsProviderSnapId;

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
   * Gets the gator permissions provider snap id that is used to fetch gator permissions.
   *
   * @returns The gator permissions provider snap id.
   */
  get permissionsProviderSnapId(): SnapId {
    return this.gatorPermissionsProviderSnapId;
  }

  /**
   * Forwards a Snap request to the SnapController.
   *
   * @param args - The request parameters.
   * @param args.snapId - The ID of the Snap of the gator permissions provider snap.
   * @returns A promise that resolves with the gator permissions.
   */
  async #handleSnapRequestToGatorPermissionsProvider({
    snapId,
  }: {
    snapId: SnapId;
  }): Promise<StoredGatorPermission<SignerParam, PermissionTypes>[] | null> {
    return this.messagingSystem.call('SnapController:handleRequest', {
      snapId,
      origin: 'metamask',
      handler: HandlerType.OnRpcRequest,
      request: {
        jsonrpc: '2.0',
        method:
          GatorPermissionsSnapRpcMethod.PermissionProviderGetGrantedPermissions,
      },
    }) as Promise<StoredGatorPermission<SignerParam, PermissionTypes>[] | null>;
  }

  /**
   * Categorizes stored gator permissions by type and chainId.
   *
   * @param storedGatorPermissions - An array of stored gator permissions.
   * @returns Parsed and categorized permissions list.
   * @throws {Error} If permission type is invalid.
   */
  #categorizePermissionsDataByTypeAndChainId(
    storedGatorPermissions:
      | StoredGatorPermission<SignerParam, PermissionTypes>[]
      | null,
  ): GatorPermissionsList {
    if (!storedGatorPermissions) {
      return defaultGatorPermissionsList;
    }

    return storedGatorPermissions.reduce(
      (gatorPermissionsList, storedGatorPermission) => {
        const { permissionResponse } = storedGatorPermission;
        const permissionType = permissionResponse.permission.type;
        const { chainId } = permissionResponse;

        if (permissionResponse.signer.type !== 'account') {
          throw new Error(
            'Invalid permission signer type. Only account signer is supported',
          );
        }

        switch (permissionType) {
          case 'native-token-stream':
            if (!gatorPermissionsList['native-token-stream'][chainId]) {
              gatorPermissionsList['native-token-stream'][chainId] = [];
            }
            gatorPermissionsList['native-token-stream'][chainId].push(
              storedGatorPermission as StoredGatorPermission<
                SignerParam,
                NativeTokenStreamPermission
              >,
            );
            break;
          case 'native-token-periodic':
            if (!gatorPermissionsList['native-token-periodic'][chainId]) {
              gatorPermissionsList['native-token-periodic'][chainId] = [];
            }
            gatorPermissionsList['native-token-periodic'][chainId].push(
              storedGatorPermission as StoredGatorPermission<
                SignerParam,
                NativeTokenPeriodicPermission
              >,
            );
            break;
          case 'erc20-token-stream':
            if (!gatorPermissionsList['erc20-token-stream'][chainId]) {
              gatorPermissionsList['erc20-token-stream'][chainId] = [];
            }
            gatorPermissionsList['erc20-token-stream'][chainId].push(
              storedGatorPermission as StoredGatorPermission<
                SignerParam,
                Erc20TokenStreamPermission
              >,
            );
            break;
          default:
            throw new Error(
              `Unsupported permission type: ${permissionType as string}`,
            );
        }

        return gatorPermissionsList;
      },
      {
        'native-token-stream': {},
        'native-token-periodic': {},
        'erc20-token-stream': {},
      } as GatorPermissionsList,
    );
  }

  /**
   * Enables gator permissions for the user.
   * This method ensures that the user is authenticated and enables the feature.
   *
   * @throws {Error} If there is an error during the process of enabling permissions.
   */
  public async enableGatorPermissions() {
    this.#setIsGatorPermissionsEnabled(true);
  }

  /**
   * Disables gator permissions for the user.
   * This method clears the permissions list and disables the feature.
   *
   * @throws {Error} If there is an error during the process.
   */
  public async disableGatorPermissions() {
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

      const permissionsData =
        await this.#handleSnapRequestToGatorPermissionsProvider({
          snapId: this.gatorPermissionsProviderSnapId,
        });

      const gatorPermissionsList =
        this.#categorizePermissionsDataByTypeAndChainId(permissionsData);

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
