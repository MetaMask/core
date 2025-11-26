import type { Signer } from '@metamask/7715-permission-types';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { DELEGATOR_CONTRACTS } from '@metamask/delegation-deployments';
import type { Messenger } from '@metamask/messenger';
import type { HandleSnapRequest, HasSnap } from '@metamask/snaps-controllers';
import type { SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';
import type {
  TransactionControllerTransactionApprovedEvent,
  TransactionControllerTransactionConfirmedEvent,
  TransactionControllerTransactionDroppedEvent,
  TransactionControllerTransactionFailedEvent,
  TransactionControllerTransactionRejectedEvent,
} from '@metamask/transaction-controller';
import type { Hex, Json } from '@metamask/utils';

import type { DecodedPermission } from './decodePermission';
import {
  getPermissionDataAndExpiry,
  identifyPermissionByEnforcers,
  reconstructDecodedPermission,
} from './decodePermission';
import {
  GatorPermissionsFetchError,
  GatorPermissionsNotEnabledError,
  GatorPermissionsProviderError,
  OriginNotAllowedError,
  PermissionDecodingError,
} from './errors';
import { controllerLog } from './logger';
import type { StoredGatorPermissionSanitized } from './types';
import {
  GatorPermissionsSnapRpcMethod,
  type GatorPermissionsMap,
  type PermissionTypesWithCustom,
  type StoredGatorPermission,
  type DelegationDetails,
  type RevocationParams,
  type PendingRevocationParams,
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
  'npm:@metamask/gator-permissions-snap' as SnapId;

const defaultGatorPermissionsMap: GatorPermissionsMap = {
  'native-token-stream': {},
  'native-token-periodic': {},
  'erc20-token-stream': {},
  'erc20-token-periodic': {},
  other: {},
};

/**
 * Delegation framework version used to select the correct deployed enforcer
 * contract addresses from `@metamask/delegation-deployments`.
 */
export const DELEGATION_FRAMEWORK_VERSION = '1.3.0';

/**
 * Timeout duration for pending revocations (2 hours in milliseconds).
 * After this time, event listeners will be cleaned up to prevent memory leaks.
 */
const PENDING_REVOCATION_TIMEOUT = 2 * 60 * 60 * 1000;

const contractsByChainId = DELEGATOR_CONTRACTS[DELEGATION_FRAMEWORK_VERSION];

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

  /**
   * List of gator permission pending a revocation transaction
   */
  pendingRevocations: {
    txId: string;
    permissionContext: Hex;
  }[];
};

const gatorPermissionsControllerMetadata: StateMetadata<GatorPermissionsControllerState> =
  {
    isGatorPermissionsEnabled: {
      includeInStateLogs: true,
      persist: true,
      includeInDebugSnapshot: false,
      usedInUi: false,
    },
    gatorPermissionsMapSerialized: {
      includeInStateLogs: true,
      persist: true,
      includeInDebugSnapshot: false,
      usedInUi: true,
    },
    isFetchingGatorPermissions: {
      includeInStateLogs: true,
      persist: false,
      includeInDebugSnapshot: false,
      usedInUi: false,
    },
    gatorPermissionsProviderSnapId: {
      includeInStateLogs: true,
      persist: false,
      includeInDebugSnapshot: false,
      usedInUi: false,
    },
    pendingRevocations: {
      includeInStateLogs: true,
      persist: false,
      includeInDebugSnapshot: false,
      usedInUi: true,
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
    pendingRevocations: [],
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

export type GatorPermissionsControllerDecodePermissionFromPermissionContextForOriginAction =
  {
    type: `${typeof controllerName}:decodePermissionFromPermissionContextForOrigin`;
    handler: GatorPermissionsController['decodePermissionFromPermissionContextForOrigin'];
  };

/**
 * The action which can be used to submit a revocation.
 */
export type GatorPermissionsControllerSubmitRevocationAction = {
  type: `${typeof controllerName}:submitRevocation`;
  handler: GatorPermissionsController['submitRevocation'];
};

/**
 * The action which can be used to add a pending revocation.
 */
export type GatorPermissionsControllerAddPendingRevocationAction = {
  type: `${typeof controllerName}:addPendingRevocation`;
  handler: GatorPermissionsController['addPendingRevocation'];
};

/**
 * The action which can be used to submit a revocation directly without requiring
 * an on-chain transaction (for already-disabled delegations).
 */
export type GatorPermissionsControllerSubmitDirectRevocationAction = {
  type: `${typeof controllerName}:submitDirectRevocation`;
  handler: GatorPermissionsController['submitDirectRevocation'];
};

/**
 * The action which can be used to check if a permission context is pending revocation.
 */
export type GatorPermissionsControllerIsPendingRevocationAction = {
  type: `${typeof controllerName}:isPendingRevocation`;
  handler: GatorPermissionsController['isPendingRevocation'];
};

/**
 * All actions that {@link GatorPermissionsController} registers, to be called
 * externally.
 */
export type GatorPermissionsControllerActions =
  | GatorPermissionsControllerGetStateAction
  | GatorPermissionsControllerFetchAndUpdateGatorPermissionsAction
  | GatorPermissionsControllerEnableGatorPermissionsAction
  | GatorPermissionsControllerDisableGatorPermissionsAction
  | GatorPermissionsControllerDecodePermissionFromPermissionContextForOriginAction
  | GatorPermissionsControllerSubmitRevocationAction
  | GatorPermissionsControllerAddPendingRevocationAction
  | GatorPermissionsControllerSubmitDirectRevocationAction
  | GatorPermissionsControllerIsPendingRevocationAction;

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
type AllowedEvents =
  | GatorPermissionsControllerStateChangeEvent
  | TransactionControllerTransactionApprovedEvent
  | TransactionControllerTransactionRejectedEvent
  | TransactionControllerTransactionConfirmedEvent
  | TransactionControllerTransactionFailedEvent
  | TransactionControllerTransactionDroppedEvent;

/**
 * Messenger type for the GatorPermissionsController.
 */
export type GatorPermissionsControllerMessenger = Messenger<
  typeof controllerName,
  GatorPermissionsControllerActions | AllowedActions,
  GatorPermissionsControllerEvents | AllowedEvents
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

  #addPendingRevocationToState(txId: string, permissionContext: Hex) {
    this.update((state) => {
      state.pendingRevocations = [
        ...state.pendingRevocations,
        { txId, permissionContext },
      ];
    });
  }

  #removePendingRevocationFromStateByTxId(txId: string) {
    this.update((state) => {
      state.pendingRevocations = state.pendingRevocations.filter(
        (pendingRevocations) => pendingRevocations.txId !== txId,
      );
    });
  }

  #removePendingRevocationFromStateByPermissionContext(permissionContext: Hex) {
    this.update((state) => {
      state.pendingRevocations = state.pendingRevocations.filter(
        (pendingRevocations) =>
          pendingRevocations.permissionContext !== permissionContext,
      );
    });
  }

  #registerMessageHandlers(): void {
    this.messenger.registerActionHandler(
      `${controllerName}:fetchAndUpdateGatorPermissions`,
      this.fetchAndUpdateGatorPermissions.bind(this),
    );

    this.messenger.registerActionHandler(
      `${controllerName}:enableGatorPermissions`,
      this.enableGatorPermissions.bind(this),
    );

    this.messenger.registerActionHandler(
      `${controllerName}:disableGatorPermissions`,
      this.disableGatorPermissions.bind(this),
    );

    this.messenger.registerActionHandler(
      `${controllerName}:decodePermissionFromPermissionContextForOrigin`,
      this.decodePermissionFromPermissionContextForOrigin.bind(this),
    );

    const submitRevocationAction = `${controllerName}:submitRevocation`;

    this.messenger.registerActionHandler(
      submitRevocationAction,
      this.submitRevocation.bind(this),
    );

    this.messenger.registerActionHandler(
      `${controllerName}:addPendingRevocation`,
      this.addPendingRevocation.bind(this),
    );

    this.messenger.registerActionHandler(
      `${controllerName}:submitDirectRevocation`,
      this.submitDirectRevocation.bind(this),
    );

    this.messenger.registerActionHandler(
      `${controllerName}:isPendingRevocation`,
      this.isPendingRevocation.bind(this),
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
   * @param args.params - Optional parameters to pass to the snap method.
   * @returns A promise that resolves with the gator permissions.
   */
  async #handleSnapRequestToGatorPermissionsProvider({
    snapId,
    params,
  }: {
    snapId: SnapId;
    params?: Json;
  }): Promise<
    StoredGatorPermission<Signer, PermissionTypesWithCustom>[] | null
  > {
    try {
      const response = (await this.messenger.call(
        'SnapController:handleRequest',
        {
          snapId,
          origin: 'metamask',
          handler: HandlerType.OnRpcRequest,
          request: {
            jsonrpc: '2.0',
            method:
              GatorPermissionsSnapRpcMethod.PermissionProviderGetGrantedPermissions,
            ...(params !== undefined && { params }),
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
   * Gets the pending revocations list.
   *
   * @returns The pending revocations list.
   */
  get pendingRevocations(): { txId: string; permissionContext: Hex }[] {
    return this.state.pendingRevocations;
  }

  /**
   * Fetches the gator permissions from profile sync and updates the state.
   *
   * @param params - Optional parameters to pass to the snap's getGrantedPermissions method.
   * @returns A promise that resolves to the gator permissions map.
   * @throws {GatorPermissionsFetchError} If the gator permissions fetch fails.
   */
  public async fetchAndUpdateGatorPermissions(
    params?: Json,
  ): Promise<GatorPermissionsMap> {
    try {
      this.#setIsFetchingGatorPermissions(true);
      this.#assertGatorPermissionsEnabled();

      const permissionsData =
        await this.#handleSnapRequestToGatorPermissionsProvider({
          snapId: this.state.gatorPermissionsProviderSnapId,
          params,
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

  /**
   * Decodes a permission context into a structured permission for a specific origin.
   *
   * This method validates the caller origin, decodes the provided `permissionContext`
   * into delegations, identifies the permission type from the caveat enforcers,
   * extracts the permission-specific data and expiry, and reconstructs a
   * {@link DecodedPermission} containing chainId, account addresses, signer, type and data.
   *
   * @param args - The arguments to this function.
   * @param args.origin - The caller's origin; must match the configured permissions provider Snap id.
   * @param args.chainId - Numeric EIP-155 chain id used for resolving enforcer contracts and encoding.
   * @param args.delegation - delegation representing the permission.
   * @param args.metadata - metadata included in the request.
   * @param args.metadata.justification - the justification as specified in the request metadata.
   * @param args.metadata.origin - the origin as specified in the request metadata.
   *
   * @returns A decoded permission object suitable for UI consumption and follow-up actions.
   * @throws If the origin is not allowed, the context cannot be decoded into exactly one delegation,
   * or the enforcers/terms do not match a supported permission type.
   */
  public decodePermissionFromPermissionContextForOrigin({
    origin,
    chainId,
    delegation: { caveats, delegator, delegate, authority },
    metadata: { justification, origin: specifiedOrigin },
  }: {
    origin: string;
    chainId: number;
    metadata: {
      justification: string;
      origin: string;
    };
    delegation: DelegationDetails;
  }): DecodedPermission {
    if (origin !== this.permissionsProviderSnapId) {
      throw new OriginNotAllowedError({ origin });
    }

    const contracts = contractsByChainId[chainId];

    if (!contracts) {
      throw new Error(`Contracts not found for chainId: ${chainId}`);
    }

    try {
      const enforcers = caveats.map((caveat) => caveat.enforcer);

      const permissionType = identifyPermissionByEnforcers({
        enforcers,
        contracts,
      });

      const { expiry, data } = getPermissionDataAndExpiry({
        contracts,
        caveats,
        permissionType,
      });

      const permission = reconstructDecodedPermission({
        chainId,
        permissionType,
        delegator,
        delegate,
        authority,
        expiry,
        data,
        justification,
        specifiedOrigin,
      });

      return permission;
    } catch (error) {
      throw new PermissionDecodingError({
        cause: error as Error,
      });
    }
  }

  /**
   * Submits a revocation to the gator permissions provider snap.
   *
   * @param revocationParams - The revocation parameters containing the permission context.
   * @returns A promise that resolves when the revocation is submitted successfully.
   * @throws {GatorPermissionsNotEnabledError} If the gator permissions are not enabled.
   * @throws {GatorPermissionsProviderError} If the snap request fails.
   */
  public async submitRevocation(
    revocationParams: RevocationParams,
  ): Promise<void> {
    controllerLog('submitRevocation method called', {
      permissionContext: revocationParams.permissionContext,
    });

    this.#assertGatorPermissionsEnabled();

    const snapRequest = {
      snapId: this.state.gatorPermissionsProviderSnapId,
      origin: 'metamask',
      handler: HandlerType.OnRpcRequest,
      request: {
        jsonrpc: '2.0',
        method:
          GatorPermissionsSnapRpcMethod.PermissionProviderSubmitRevocation,
        params: revocationParams,
      },
    };

    try {
      const result = await this.messenger.call(
        'SnapController:handleRequest',
        snapRequest,
      );

      // Refresh list first (permission removed from list)
      await this.fetchAndUpdateGatorPermissions({ isRevoked: false });

      controllerLog('Successfully submitted revocation', {
        permissionContext: revocationParams.permissionContext,
        result,
      });
    } catch (error) {
      // If it's a GatorPermissionsFetchError, revocation succeeded but refresh failed
      if (error instanceof GatorPermissionsFetchError) {
        controllerLog(
          'Revocation submitted successfully but failed to refresh permissions list',
          {
            error,
            permissionContext: revocationParams.permissionContext,
          },
        );
        // Wrap with a more specific message indicating revocation succeeded
        throw new GatorPermissionsFetchError({
          message:
            'Failed to refresh permissions list after successful revocation',
          cause: error as Error,
        });
      }

      // Otherwise, revocation failed - wrap in provider error
      controllerLog('Failed to submit revocation', {
        error,
        permissionContext: revocationParams.permissionContext,
      });

      throw new GatorPermissionsProviderError({
        method:
          GatorPermissionsSnapRpcMethod.PermissionProviderSubmitRevocation,
        cause: error as Error,
      });
    } finally {
      this.#removePendingRevocationFromStateByPermissionContext(
        revocationParams.permissionContext,
      );
    }
  }

  /**
   * Adds a pending revocation that will be submitted once the transaction is confirmed.
   *
   * This method sets up listeners for the user's approval/rejection decision and
   * terminal transaction states (confirmed, failed, dropped). The flow is:
   * 1. Wait for user to approve or reject the transaction
   * 2. If approved, add to pending revocations state
   * 3. If rejected, cleanup without adding to state
   * 4. If confirmed, submit the revocation
   * 5. If failed or dropped, cleanup
   *
   * Includes a timeout safety net to prevent memory leaks if the transaction never
   * reaches a terminal state.
   *
   * @param params - The pending revocation parameters.
   * @returns A promise that resolves when the listener is set up.
   */
  public async addPendingRevocation(
    params: PendingRevocationParams,
  ): Promise<void> {
    const { txId, permissionContext } = params;

    controllerLog('addPendingRevocation method called', {
      txId,
      permissionContext,
    });

    this.#assertGatorPermissionsEnabled();

    type PendingRevocationHandlers = {
      approved?: (
        ...args: TransactionControllerTransactionApprovedEvent['payload']
      ) => void;
      rejected?: (
        ...args: TransactionControllerTransactionRejectedEvent['payload']
      ) => void;
      confirmed?: (
        ...args: TransactionControllerTransactionConfirmedEvent['payload']
      ) => void;
      failed?: (
        ...args: TransactionControllerTransactionFailedEvent['payload']
      ) => void;
      dropped?: (
        ...args: TransactionControllerTransactionDroppedEvent['payload']
      ) => void;
      timeoutId?: ReturnType<typeof setTimeout>;
    };

    // Track handlers and timeout for cleanup
    const handlers: PendingRevocationHandlers = {
      approved: undefined,
      rejected: undefined,
      confirmed: undefined,
      failed: undefined,
      dropped: undefined,
      timeoutId: undefined,
    };

    // Helper to unsubscribe from approval/rejection events after decision is made
    const cleanupApprovalHandlers = () => {
      if (handlers.approved) {
        this.messenger.unsubscribe(
          'TransactionController:transactionApproved',
          handlers.approved,
        );
        handlers.approved = undefined;
      }
      if (handlers.rejected) {
        this.messenger.unsubscribe(
          'TransactionController:transactionRejected',
          handlers.rejected,
        );
        handlers.rejected = undefined;
      }
    };

    // Cleanup function to unsubscribe from all events and clear timeout
    const cleanup = (txIdToRemove: string, removeFromState = true) => {
      cleanupApprovalHandlers();
      if (handlers.confirmed) {
        this.messenger.unsubscribe(
          'TransactionController:transactionConfirmed',
          handlers.confirmed,
        );
      }
      if (handlers.failed) {
        this.messenger.unsubscribe(
          'TransactionController:transactionFailed',
          handlers.failed,
        );
      }
      if (handlers.dropped) {
        this.messenger.unsubscribe(
          'TransactionController:transactionDropped',
          handlers.dropped,
        );
      }
      if (handlers.timeoutId !== undefined) {
        clearTimeout(handlers.timeoutId);
      }

      // Remove the pending revocation from the state (only if it was added)
      if (removeFromState) {
        this.#removePendingRevocationFromStateByTxId(txIdToRemove);
      }
    };

    // Handle approved transaction - add to pending revocations state
    handlers.approved = (payload) => {
      if (payload.transactionMeta.id === txId) {
        controllerLog(
          'Transaction approved by user, adding to pending revocations',
          {
            txId,
            permissionContext,
          },
        );

        this.#addPendingRevocationToState(txId, permissionContext);

        // Unsubscribe from approval/rejection events since decision is made
        cleanupApprovalHandlers();
      }
    };

    // Handle rejected transaction - cleanup without adding to state
    handlers.rejected = (payload) => {
      if (payload.transactionMeta.id === txId) {
        controllerLog('Transaction rejected by user, cleaning up listeners', {
          txId,
          permissionContext,
        });

        // Don't remove from state since it was never added
        cleanup(payload.transactionMeta.id, false);
      }
    };

    // Handle confirmed transaction - submit revocation
    handlers.confirmed = (transactionMeta) => {
      if (transactionMeta.id === txId) {
        controllerLog('Transaction confirmed, submitting revocation', {
          txId,
          permissionContext,
        });

        this.submitRevocation({ permissionContext }).catch((error) => {
          controllerLog(
            'Failed to submit revocation after transaction confirmed',
            {
              txId,
              permissionContext,
              error,
            },
          );
        });

        cleanup(transactionMeta.id);
      }
    };

    // Handle failed transaction - cleanup without submitting revocation
    handlers.failed = (payload) => {
      if (payload.transactionMeta.id === txId) {
        controllerLog('Transaction failed, cleaning up revocation listener', {
          txId,
          permissionContext,
          error: payload.error,
        });

        cleanup(payload.transactionMeta.id);
      }
    };

    // Handle dropped transaction - cleanup without submitting revocation
    handlers.dropped = (payload) => {
      if (payload.transactionMeta.id === txId) {
        controllerLog('Transaction dropped, cleaning up revocation listener', {
          txId,
          permissionContext,
        });

        cleanup(payload.transactionMeta.id);
      }
    };

    // Subscribe to user approval/rejection events
    this.messenger.subscribe(
      'TransactionController:transactionApproved',
      handlers.approved,
    );
    this.messenger.subscribe(
      'TransactionController:transactionRejected',
      handlers.rejected,
    );

    // Subscribe to terminal transaction events
    this.messenger.subscribe(
      'TransactionController:transactionConfirmed',
      handlers.confirmed,
    );
    this.messenger.subscribe(
      'TransactionController:transactionFailed',
      handlers.failed,
    );
    this.messenger.subscribe(
      'TransactionController:transactionDropped',
      handlers.dropped,
    );

    // Set timeout as safety net to prevent memory leaks
    handlers.timeoutId = setTimeout(() => {
      controllerLog('Pending revocation timed out, cleaning up listeners', {
        txId,
        permissionContext,
      });
      cleanup(txId);
    }, PENDING_REVOCATION_TIMEOUT);
  }

  /**
   * Submits a revocation directly without requiring an on-chain transaction.
   * Used for already-disabled delegations that don't require an on-chain transaction.
   *
   * This method:
   * 1. Adds the permission context to pending revocations state (disables UI button)
   * 2. Immediately calls submitRevocation to remove from snap storage
   * 3. On success, removes from pending revocations state (re-enables UI button)
   * 4. On failure, keeps in pending revocations so UI can show error/retry state
   *
   * @param params - The revocation parameters containing the permission context.
   * @returns A promise that resolves when the revocation is submitted successfully.
   * @throws {GatorPermissionsNotEnabledError} If the gator permissions are not enabled.
   * @throws {GatorPermissionsProviderError} If the snap request fails.
   */
  public async submitDirectRevocation(params: RevocationParams): Promise<void> {
    this.#assertGatorPermissionsEnabled();

    // Use a placeholder txId that doesn't conflict with real transaction IDs
    const placeholderTxId = `no-tx-${params.permissionContext}`;

    // Add to pending revocations state first (disables UI button immediately)
    this.#addPendingRevocationToState(
      placeholderTxId,
      params.permissionContext,
    );

    // Immediately submit the revocation (will remove from pending on success)
    await this.submitRevocation(params);
  }

  /**
   * Checks if a permission context is in the pending revocations list.
   *
   * @param permissionContext - The permission context to check.
   * @returns `true` if the permission context is pending revocation, `false` otherwise.
   */
  public isPendingRevocation(permissionContext: Hex): boolean {
    return this.state.pendingRevocations.some(
      (pendingRevocation) =>
        pendingRevocation.permissionContext.toLowerCase() ===
        permissionContext.toLowerCase(),
    );
  }
}
