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
import { TransactionStatus } from '@metamask/transaction-controller';
import type {
  TransactionControllerTransactionApprovedEvent,
  TransactionControllerTransactionConfirmedEvent,
  TransactionControllerTransactionDroppedEvent,
  TransactionControllerTransactionFailedEvent,
  TransactionControllerTransactionRejectedEvent,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { DELEGATION_FRAMEWORK_VERSION } from './constants';
import type { DecodedPermission } from './decodePermission';
import {
  getPermissionDataAndExpiry,
  identifyPermissionByEnforcers,
  reconstructDecodedPermission,
} from './decodePermission';
import {
  GatorPermissionsFetchError,
  GatorPermissionsProviderError,
  OriginNotAllowedError,
  PermissionDecodingError,
} from './errors';
import { controllerLog } from './logger';
import { GatorPermissionsSnapRpcMethod } from './types';
import type {
  StoredGatorPermission,
  PermissionInfoWithMetadata,
  SupportedPermissionType,
  DelegationDetails,
  RevocationParams,
  PendingRevocationParams,
} from './types';
import { executeSnapRpc } from './utils';

// === GENERAL ===

// Unique name for the controller
const controllerName = 'GatorPermissionsController';

// Default value for the gator permissions provider snap id
const defaultGatorPermissionsProviderSnapId =
  'npm:@metamask/gator-permissions-snap' as SnapId;

/**
 * Timeout duration for pending revocations (2 hours in milliseconds).
 * After this time, event listeners will be cleaned up to prevent memory leaks.
 */
const PENDING_REVOCATION_TIMEOUT = 2 * 60 * 60 * 1000;

const contractsByChainId = DELEGATOR_CONTRACTS[DELEGATION_FRAMEWORK_VERSION];

// === CONFIG ===

/**
 * Configuration for {@link GatorPermissionsController}.
 */
export type GatorPermissionsControllerConfig = {
  /**
   * Permission types the controller supports (e.g. 'native-token-stream', 'erc20-token-periodic').
   */
  supportedPermissionTypes: SupportedPermissionType[];
  /**
   * Optional ID of the gator permissions provider Snap. Defaults to npm:@metamask/gator-permissions-snap.
   */
  gatorPermissionsProviderSnapId?: SnapId;
};

// === STATE ===

/**
 * State shape for {@link GatorPermissionsController}.
 */
export type GatorPermissionsControllerState = {
  /**
   * List of granted permissions with metadata (siteOrigin, revocationMetadata).
   */
  grantedPermissions: PermissionInfoWithMetadata[];

  /**
   * Flag that indicates that fetching permissions is in progress
   * This can be used to show a loading spinner in the UI
   */
  isFetchingGatorPermissions: boolean;

  /**
   * List of gator permissions pending a revocation transaction
   */
  pendingRevocations: {
    txId: string;
    permissionContext: Hex;
  }[];
};

const gatorPermissionsControllerMetadata: StateMetadata<GatorPermissionsControllerState> =
  {
    grantedPermissions: {
      includeInStateLogs: true,
      persist: true,
      includeInDebugSnapshot: false,
      usedInUi: true,
    },
    isFetchingGatorPermissions: {
      includeInStateLogs: true,
      persist: false,
      includeInDebugSnapshot: false,
      usedInUi: true,
    },
    pendingRevocations: {
      includeInStateLogs: true,
      persist: false,
      includeInDebugSnapshot: false,
      usedInUi: true,
    },
  } satisfies StateMetadata<GatorPermissionsControllerState>;

/**
 * Creates initial controller state, merging defaults with optional partial state.
 * Internal use only (e.g. constructor, tests).
 *
 * @param state - Optional partial state to merge with defaults.
 * @returns Complete {@link GatorPermissionsController} state.
 */
function createGatorPermissionsControllerState(
  state?: Partial<GatorPermissionsControllerState>,
): GatorPermissionsControllerState {
  return {
    grantedPermissions: [],
    pendingRevocations: [],
    ...state,
    // isFetchingGatorPermissions is _always_ false when the controller is created
    isFetchingGatorPermissions: false,
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
  | GatorPermissionsControllerDecodePermissionFromPermissionContextForOriginAction
  | GatorPermissionsControllerSubmitRevocationAction
  | GatorPermissionsControllerAddPendingRevocationAction
  | GatorPermissionsControllerSubmitDirectRevocationAction
  | GatorPermissionsControllerIsPendingRevocationAction;

/**
 * All actions that {@link GatorPermissionsController} calls internally.
 *
 * SnapController:handleRequest and SnapController:has are allowed to be called
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
 * Controller that manages gator permissions by reading from the gator permissions provider Snap.
 */
export default class GatorPermissionsController extends BaseController<
  typeof controllerName,
  GatorPermissionsControllerState,
  GatorPermissionsControllerMessenger
> {
  readonly #supportedPermissionTypes: readonly SupportedPermissionType[];

  /**
   * The Snap ID of the gator permissions provider.
   *
   * @returns The Snap ID of the gator permissions provider.
   */
  get gatorPermissionsProviderSnapId(): SnapId {
    return this.#gatorPermissionsProviderSnapId;
  }

  readonly #gatorPermissionsProviderSnapId: SnapId;

  /**
   * Creates a GatorPermissionsController instance.
   *
   * @param args - The arguments to this function.
   * @param args.messenger - Messenger used to communicate with other controllers.
   * @param args.config - Configuration (supported permission types and optional Snap id).
   * @param args.state - Optional partial state to merge with defaults.
   */
  constructor({
    messenger,
    config,
    state,
  }: {
    messenger: GatorPermissionsControllerMessenger;
    config: GatorPermissionsControllerConfig;
    state?: Partial<GatorPermissionsControllerState>;
  }) {
    const initialState = createGatorPermissionsControllerState(state);

    super({
      name: controllerName,
      metadata: gatorPermissionsControllerMetadata,
      messenger,
      state: initialState,
    });

    this.#supportedPermissionTypes = config.supportedPermissionTypes;
    this.#gatorPermissionsProviderSnapId =
      config.gatorPermissionsProviderSnapId ??
      defaultGatorPermissionsProviderSnapId;
    this.#registerMessageHandlers();
  }

  /**
   * Supported permission types this controller was configured with.
   *
   * @returns The supported permission types.
   */
  get supportedPermissionTypes(): readonly SupportedPermissionType[] {
    return this.#supportedPermissionTypes;
  }

  #setIsFetchingGatorPermissions(isFetchingGatorPermissions: boolean): void {
    this.update((state) => {
      state.isFetchingGatorPermissions = isFetchingGatorPermissions;
    });
  }

  #addPendingRevocationToState(txId: string, permissionContext: Hex): void {
    this.update((state) => {
      state.pendingRevocations = [
        ...state.pendingRevocations,
        { txId, permissionContext },
      ];
    });
  }

  #removePendingRevocationFromStateByTxId(txId: string): void {
    this.update((state) => {
      state.pendingRevocations = state.pendingRevocations.filter(
        (pendingRevocations) => pendingRevocations.txId !== txId,
      );
    });
  }

  #removePendingRevocationFromStateByPermissionContext(
    permissionContext: Hex,
  ): void {
    this.update((state) => {
      state.pendingRevocations = state.pendingRevocations.filter(
        (pendingRevocations) =>
          pendingRevocations.permissionContext.toLowerCase() !==
          permissionContext.toLowerCase(),
      );
    });
  }

  #registerMessageHandlers(): void {
    this.messenger.registerActionHandler(
      `${controllerName}:fetchAndUpdateGatorPermissions`,
      this.fetchAndUpdateGatorPermissions.bind(this),
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
   * Converts a stored gator permission to permission info with metadata.
   * Strips internal fields (dependencies, to) from the permission response.
   *
   * @param storedGatorPermission - The stored gator permission from the Snap.
   * @returns Permission info with metadata for state/UI.
   */
  #storedPermissionToPermissionInfo(
    storedGatorPermission: StoredGatorPermission,
  ): PermissionInfoWithMetadata {
    const { permissionResponse: fullPermissionResponse } =
      storedGatorPermission;
    const {
      dependencies: _dependencies,
      to: _to,
      ...permissionResponse
    } = fullPermissionResponse;

    return {
      ...storedGatorPermission,
      permissionResponse,
    };
  }

  /**
   * Converts stored gator permissions from the Snap into permission info with metadata.
   *
   * @param storedGatorPermissions - Stored gator permissions returned by the Snap, or null.
   * @returns Array of permission info with metadata for state.
   */
  #storedPermissionsToPermissionInfoWithMetadata(
    storedGatorPermissions: StoredGatorPermission[] | null,
  ): PermissionInfoWithMetadata[] {
    if (!storedGatorPermissions) {
      return [];
    }

    return storedGatorPermissions.map((storedPermission) =>
      this.#storedPermissionToPermissionInfo(storedPermission),
    );
  }

  /**
   * Fetches granted permissions from the gator permissions provider Snap and updates state.
   *
   * @returns A promise that resolves to the list of granted permissions with metadata.
   * @throws {GatorPermissionsFetchError} If the gator permissions fetch fails.
   */
  public async fetchAndUpdateGatorPermissions(): Promise<
    PermissionInfoWithMetadata[]
  > {
    try {
      this.#setIsFetchingGatorPermissions(true);

      // Only ever fetch non-revoked permissions. Revoked permissions may be
      // left in storage by the gator permissions snap, but we don't need to
      // fetch them.
      const params = { isRevoked: false };

      const permissionsData = await executeSnapRpc<
        StoredGatorPermission[] | null
      >({
        messenger: this.messenger,
        snapId: this.#gatorPermissionsProviderSnapId,
        method:
          GatorPermissionsSnapRpcMethod.PermissionProviderGetGrantedPermissions,
        params,
      });

      const grantedPermissions =
        this.#storedPermissionsToPermissionInfoWithMetadata(permissionsData);

      this.update((state) => {
        state.grantedPermissions = grantedPermissions;
      });

      return grantedPermissions;
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
   * {@link DecodedPermission} containing chainId, account addresses, to, type and data.
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
    if (origin !== this.#gatorPermissionsProviderSnapId) {
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
   * @throws {GatorPermissionsProviderError} If the snap request fails.
   */
  public async submitRevocation(
    revocationParams: RevocationParams,
  ): Promise<void> {
    controllerLog('submitRevocation method called', {
      permissionContext: revocationParams.permissionContext,
    });

    const snapRequest = {
      snapId: this.#gatorPermissionsProviderSnapId,
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
      await this.fetchAndUpdateGatorPermissions();

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

    // Helper to refresh permissions after transaction state change
    const refreshPermissions = (context: string): void => {
      this.fetchAndUpdateGatorPermissions().catch((error) => {
        controllerLog(`Failed to refresh permissions after ${context}`, {
          txId,
          permissionContext,
          error,
        });
      });
    };

    // Helper to unsubscribe from approval/rejection events after decision is made
    const cleanupApprovalHandlers = (): void => {
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
    const cleanup = (txIdToRemove: string, removeFromState = true): void => {
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
    handlers.approved = (payload): void => {
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
    handlers.rejected = (payload): void => {
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
    handlers.confirmed = (transactionMeta): void => {
      if (transactionMeta.id === txId) {
        controllerLog('Transaction confirmed, submitting revocation', {
          txId,
          permissionContext,
          txHash: transactionMeta.hash,
        });

        if (transactionMeta.status !== TransactionStatus.confirmed) {
          controllerLog('Transaction not confirmed, skipping revocation', {
            txId,
            permissionContext,
            status: transactionMeta.status,
          });
          cleanup(transactionMeta.id);
          refreshPermissions('transaction not confirmed');
          return;
        }

        const txHash = transactionMeta.hash as Hex | undefined;

        if (txHash === undefined) {
          controllerLog(
            'Failed to resolve transaction hash after revocation transaction confirmed',
            {
              txId,
              permissionContext,
              error: new Error(
                'Confirmed transaction is missing transaction hash',
              ),
            },
          );
        }

        this.submitRevocation({ permissionContext, txHash })
          .catch((error) => {
            controllerLog(
              'Failed to submit revocation after transaction confirmed',
              {
                txId,
                permissionContext,
                error,
              },
            );
          })
          .finally(() => refreshPermissions('transaction confirmed'));

        cleanup(transactionMeta.id);
      }
    };

    // Handle failed transaction - cleanup without submitting revocation
    handlers.failed = (payload): void => {
      if (payload.transactionMeta.id === txId) {
        controllerLog('Transaction failed, cleaning up revocation listener', {
          txId,
          permissionContext,
          error: payload.error,
        });

        cleanup(payload.transactionMeta.id);

        refreshPermissions('transaction failed');
      }
    };

    // Handle dropped transaction - cleanup without submitting revocation
    handlers.dropped = (payload): void => {
      if (payload.transactionMeta.id === txId) {
        controllerLog('Transaction dropped, cleaning up revocation listener', {
          txId,
          permissionContext,
        });

        cleanup(payload.transactionMeta.id);

        refreshPermissions('transaction dropped');
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
   * @throws {GatorPermissionsProviderError} If the snap request fails.
   */
  public async submitDirectRevocation(params: RevocationParams): Promise<void> {
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
    const requestedPermissionContextLowercase = permissionContext.toLowerCase();

    return this.state.pendingRevocations.some(
      (pendingRevocation) =>
        pendingRevocation.permissionContext.toLowerCase() ===
        requestedPermissionContextLowercase,
    );
  }
}
