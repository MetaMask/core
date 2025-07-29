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
  type PermissionTypes,
  type SignerParam,
  type StoredGatorPermission,
} from './types';
import {
  deserializeGatorPermissionsMap,
  serializeGatorPermissionsMap,
} from './utils';

// Unique name for the controller
const controllerName = 'GatorPermissionsController';

// Default value for the gator permissions provider snap id
const defaultGatorPermissionsProviderSnapId =
  '@metamask/gator-permissions-snap' as SnapId;

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
};

const metadata: StateMetadata<GatorPermissionsControllerState> = {
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
};

const defaultGatorPermissionsMap: GatorPermissionsMap = {
  'native-token-stream': {},
  'native-token-periodic': {},
  'erc20-token-stream': {},
  'erc20-token-periodic': {},
  other: {},
};

export const defaultState: GatorPermissionsControllerState = {
  isGatorPermissionsEnabled: false,
  gatorPermissionsMapSerialized: serializeGatorPermissionsMap(
    defaultGatorPermissionsMap,
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
  }): Promise<StoredGatorPermission<SignerParam, PermissionTypes>[] | null> {
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
      )) as Promise<
        StoredGatorPermission<SignerParam, PermissionTypes>[] | null
      >;

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
    storedGatorPermission: StoredGatorPermission<SignerParam, PermissionTypes>,
  ): StoredGatorPermissionSanitized<SignerParam, PermissionTypes> {
    const { permissionResponse } = storedGatorPermission;
    const { isAdjustmentAllowed, accountMeta, signer, ...rest } =
      permissionResponse;
    return {
      ...storedGatorPermission,
      permissionResponse: { ...rest },
    };
  }

  /**
   * Categorizes stored gator permissions by type and chainId.
   *
   * @param storedGatorPermissions - An array of stored gator permissions.
   * @returns The gator permissions map.
   * @throws {SignerTypeNotSupportedError} If signer type is not account.
   * @throws {Error} If permission type is invalid.
   */
  #categorizePermissionsDataByTypeAndChainId(
    storedGatorPermissions:
      | StoredGatorPermission<SignerParam, PermissionTypes>[]
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
                SignerParam,
                PermissionTypes
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
                SignerParam,
                PermissionTypes
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
    return this.gatorPermissionsProviderSnapId;
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
          snapId: this.gatorPermissionsProviderSnapId,
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
