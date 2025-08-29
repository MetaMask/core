import type { Signer } from '@metamask/7715-permission-types';
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

import {
  GatorPermissionsFetchError,
  GatorPermissionsNotEnabledError,
  GatorPermissionsProviderError,
} from './errors';
import { controllerLog } from './logger';
import type { StoredGatorPermissionSanitized } from './types';
import {
  GatorPermissionsSnapRpcMethod,
  type GatorPermissionsMap,
  type PermissionTypesWithCustom,
  type StoredGatorPermission,
} from './types';
import {
  deserializeGatorPermissionsMap,
  serializeGatorPermissionsMap,
} from './utils';

// === GENERAL ===

// Unique name for the controller
const controllerName = 'GatorPermissionsController';

// Default value for the gator permissions provider snap id
const defaultGatorPermissionsProviderSnapId =
  '@metamask/gator-permissions-snap' as SnapId;

const defaultGatorPermissionsMap: GatorPermissionsMap = {
  'native-token-stream': {},
  'native-token-periodic': {},
  'erc20-token-stream': {},
  'erc20-token-periodic': {},
  other: {},
};

// === STATE ===

/**
 * State shape for GatorPermissionsController
 */
export type GatorPermissionsControllerState = {
  /**
   * Flag that indicates if the gator permissions feature is enabled
   */
  isGatorPermissionsEnabled: boolean;

  /**
   * JSON serialized object containing gator permissions fetched from profile sync
   */
  gatorPermissionsMapSerialized: string;

  /**
   * Flag that indicates that fetching permissions is in progress
   * This is used to show a loading spinner in the UI
   */
  isFetchingGatorPermissions: boolean;

  /**
   * The ID of the Snap of the gator permissions provider snap
   * Default value is `@metamask/gator-permissions-snap`
   */
  gatorPermissionsProviderSnapId: SnapId;
};

const gatorPermissionsControllerMetadata = {
  isGatorPermissionsEnabled: {
    persist: true,
    anonymous: false,
  },
  gatorPermissionsMapSerialized: {
    persist: true,
    anonymous: false,
  },
  isFetchingGatorPermissions: {
    persist: false,
    anonymous: false,
  },
  gatorPermissionsProviderSnapId: {
    persist: false,
    anonymous: false,
  },
} satisfies StateMetadata<GatorPermissionsControllerState>;

/**
 * Constructs the default {@link GatorPermissionsController} state. This allows
 * consumers to provide a partial state object when initializing the controller
 * and also helps in constructing complete state objects for this controller in
 * tests.
 *
 * @returns The default {@link GatorPermissionsController} state.
 */
export function getDefaultGatorPermissionsControllerState(): GatorPermissionsControllerState {
  return {
    isGatorPermissionsEnabled: false,
    gatorPermissionsMapSerialized: serializeGatorPermissionsMap(
      defaultGatorPermissionsMap,
    ),
    isFetchingGatorPermissions: false,
    gatorPermissionsProviderSnapId: defaultGatorPermissionsProviderSnapId,
  };
}

// === MESSENGER ===

/**
 * The action which can be used to retrieve the state of the
 * {@link GatorPermissionsController}.
 */
export type GatorPermissionsControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  GatorPermissionsControllerState
>;

/**
 * The action which can be used to fetch and update gator permissions.
 */
export type GatorPermissionsControllerFetchAndUpdateGatorPermissionsAction = {
  type: `${typeof controllerName}:fetchAndUpdateGatorPermissions`;
  handler: GatorPermissionsController['fetchAndUpdateGatorPermissions'];
};

/**
 * The action which can be used to enable gator permissions.
 */
export type GatorPermissionsControllerEnableGatorPermissionsAction = {
  type: `${typeof controllerName}:enableGatorPermissions`;
  handler: GatorPermissionsController['enableGatorPermissions'];
};

/**
 * The action which can be used to disable gator permissions.
 */
export type GatorPermissionsControllerDisableGatorPermissionsAction = {
  type: `${typeof controllerName}:disableGatorPermissions`;
  handler: GatorPermissionsController['disableGatorPermissions'];
};

/**
 * All actions that {@link GatorPermissionsController} registers, to be called
 * externally.
 */
export type GatorPermissionsControllerActions =
  | GatorPermissionsControllerGetStateAction
  | GatorPermissionsControllerFetchAndUpdateGatorPermissionsAction
  | GatorPermissionsControllerEnableGatorPermissionsAction
  | GatorPermissionsControllerDisableGatorPermissionsAction;

/**
 * All actions that {@link GatorPermissionsController} calls internally.
 *
 * SnapsController:handleRequest and SnapsController:has are allowed to be called
 * internally because they are used to fetch gator permissions from the Snap.
 */
type AllowedActions = HandleSnapRequest | HasSnap;

/**
 * The event that {@link GatorPermissionsController} publishes when updating state.
 */
export type GatorPermissionsControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    GatorPermissionsControllerState
  >;

/**
 * All events that {@link GatorPermissionsController} publishes, to be subscribed to
 * externally.
 */
export type GatorPermissionsControllerEvents =
  GatorPermissionsControllerStateChangeEvent;

/**
 * Events that {@link GatorPermissionsController} is allowed to subscribe to internally.
 */
type AllowedEvents = GatorPermissionsControllerStateChangeEvent;

/**
 * Messenger type for the GatorPermissionsController.
 */
export type GatorPermissionsControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  GatorPermissionsControllerActions | AllowedActions,
  GatorPermissionsControllerEvents | AllowedEvents,
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
      name: controllerName,
      metadata: gatorPermissionsControllerMetadata,
      messenger,
      state: {
        ...getDefaultGatorPermissionsControllerState(),
        ...state,
        isFetchingGatorPermissions: false,
      },
    });

    this.#registerMessageHandlers();
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

  /**
   * Asserts that the gator permissions are enabled.
   *
   * @throws {GatorPermissionsNotEnabledError} If the gator permissions are not enabled.
   */
  #assertGatorPermissionsEnabled() {
    if (!this.state.isGatorPermissionsEnabled) {
      throw new GatorPermissionsNotEnabledError();
    }
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
  }): Promise<
    StoredGatorPermission<Signer, PermissionTypesWithCustom>[] | null
  > {
    try {
      const response = (await this.messagingSystem.call(
        'SnapController:handleRequest',
        {
          snapId,
          origin: 'metamask',
          handler: HandlerType.OnRpcRequest,
          request: {
            jsonrpc: '2.0',
            method:
              GatorPermissionsSnapRpcMethod.PermissionProviderGetGrantedPermissions,
          },
        },
      )) as StoredGatorPermission<Signer, PermissionTypesWithCustom>[] | null;

      return response;
    } catch (error) {
      controllerLog(
        'Failed to handle snap request to gator permissions provider',
        error,
      );
      throw new GatorPermissionsProviderError({
        method:
          GatorPermissionsSnapRpcMethod.PermissionProviderGetGrantedPermissions,
        cause: error as Error,
      });
    }
  }

  /**
   * Sanitizes a stored gator permission by removing the fields that are not expose to MetaMask client.
   *
   * @param storedGatorPermission - The stored gator permission to sanitize.
   * @returns The sanitized stored gator permission.
   */
  #sanitizeStoredGatorPermission(
    storedGatorPermission: StoredGatorPermission<
      Signer,
      PermissionTypesWithCustom
    >,
  ): StoredGatorPermissionSanitized<Signer, PermissionTypesWithCustom> {
    const { permissionResponse } = storedGatorPermission;
    const { rules, dependencyInfo, signer, ...rest } = permissionResponse;
    return {
      ...storedGatorPermission,
      permissionResponse: {
        ...rest,
      },
    };
  }

  /**
   * Categorizes stored gator permissions by type and chainId.
   *
   * @param storedGatorPermissions - An array of stored gator permissions.
   * @returns The gator permissions map.
   */
  #categorizePermissionsDataByTypeAndChainId(
    storedGatorPermissions:
      | StoredGatorPermission<Signer, PermissionTypesWithCustom>[]
      | null,
  ): GatorPermissionsMap {
    if (!storedGatorPermissions) {
      return defaultGatorPermissionsMap;
    }

    return storedGatorPermissions.reduce(
      (gatorPermissionsMap, storedGatorPermission) => {
        const { permissionResponse } = storedGatorPermission;
        const permissionType = permissionResponse.permission.type;
        const { chainId } = permissionResponse;

        const sanitizedStoredGatorPermission =
          this.#sanitizeStoredGatorPermission(storedGatorPermission);

        switch (permissionType) {
          case 'native-token-stream':
          case 'native-token-periodic':
          case 'erc20-token-stream':
          case 'erc20-token-periodic':
            if (!gatorPermissionsMap[permissionType][chainId]) {
              gatorPermissionsMap[permissionType][chainId] = [];
            }

            (
              gatorPermissionsMap[permissionType][
                chainId
              ] as StoredGatorPermissionSanitized<
                Signer,
                PermissionTypesWithCustom
              >[]
            ).push(sanitizedStoredGatorPermission);
            break;
          default:
            if (!gatorPermissionsMap.other[chainId]) {
              gatorPermissionsMap.other[chainId] = [];
            }

            (
              gatorPermissionsMap.other[
                chainId
              ] as StoredGatorPermissionSanitized<
                Signer,
                PermissionTypesWithCustom
              >[]
            ).push(sanitizedStoredGatorPermission);
            break;
        }

        return gatorPermissionsMap;
      },
      {
        'native-token-stream': {},
        'native-token-periodic': {},
        'erc20-token-stream': {},
        'erc20-token-periodic': {},
        other: {},
      } as GatorPermissionsMap,
    );
  }

  /**
   * Gets the gator permissions map from the state.
   *
   * @returns The gator permissions map.
   */
  get gatorPermissionsMap(): GatorPermissionsMap {
    return deserializeGatorPermissionsMap(
      this.state.gatorPermissionsMapSerialized,
    );
  }

  /**
   * Gets the gator permissions provider snap id that is used to fetch gator permissions.
   *
   * @returns The gator permissions provider snap id.
   */
  get permissionsProviderSnapId(): SnapId {
    return this.state.gatorPermissionsProviderSnapId;
  }

  /**
   * Enables gator permissions for the user.
   */
  public async enableGatorPermissions() {
    this.#setIsGatorPermissionsEnabled(true);
  }

  /**
   * Clears the gator permissions map and disables the feature.
   */
  public async disableGatorPermissions() {
    this.update((state) => {
      state.isGatorPermissionsEnabled = false;
      state.gatorPermissionsMapSerialized = serializeGatorPermissionsMap(
        defaultGatorPermissionsMap,
      );
    });
  }

  /**
   * Fetches the gator permissions from profile sync and updates the state.
   *
   * @returns A promise that resolves to the gator permissions map.
   * @throws {GatorPermissionsFetchError} If the gator permissions fetch fails.
   */
  public async fetchAndUpdateGatorPermissions(): Promise<GatorPermissionsMap> {
    try {
      this.#setIsFetchingGatorPermissions(true);
      this.#assertGatorPermissionsEnabled();

      const permissionsData =
        await this.#handleSnapRequestToGatorPermissionsProvider({
          snapId: this.state.gatorPermissionsProviderSnapId,
        });

      const gatorPermissionsMap =
        this.#categorizePermissionsDataByTypeAndChainId(permissionsData);

      this.update((state) => {
        state.gatorPermissionsMapSerialized =
          serializeGatorPermissionsMap(gatorPermissionsMap);
      });

      return gatorPermissionsMap;
    } catch (error) {
      controllerLog('Failed to fetch gator permissions', error);
      throw new GatorPermissionsFetchError({
        message: 'Failed to fetch gator permissions',
        cause: error as Error,
      });
    } finally {
      this.#setIsFetchingGatorPermissions(false);
    }
  }
}
