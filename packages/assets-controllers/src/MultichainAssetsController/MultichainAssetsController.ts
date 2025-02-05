import type {
  AccountsControllerAccountAddedEvent,
  AccountsControllerAccountAssetListUpdatedEvent,
  AccountsControllerAccountRemovedEvent,
  AccountsControllerListMultichainAccountsAction,
} from '@metamask/accounts-controller';
import {
  BaseController,
  type ControllerGetStateAction,
  type ControllerStateChangeEvent,
  type RestrictedMessenger,
} from '@metamask/base-controller';
import { isEvmAccountType } from '@metamask/keyring-api';
import type {
  AccountAssetListUpdatedEventPayload,
  CaipAssetType,
  CaipAssetTypeOrId,
} from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { KeyringClient } from '@metamask/keyring-snap-client';
import type {
  GetPermissions,
  PermissionConstraint,
  SubjectPermissions,
} from '@metamask/permission-controller';
import type {
  GetAllSnaps,
  HandleSnapRequest,
} from '@metamask/snaps-controllers';
import type { FungibleAssetMetadata, Snap, SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';
import {
  hasProperty,
  isCaipAssetType,
  parseCaipAssetType,
  type CaipChainId,
} from '@metamask/utils';
import type { Json, JsonRpcRequest } from '@metamask/utils';
import type { MutexInterface } from 'async-mutex';
import { Mutex } from 'async-mutex';

import { getChainIdsCaveat } from './utils';

const controllerName = 'MultichainAssetsController';

export type MultichainAssetsControllerState = {
  assetsMetadata: {
    [asset: CaipAssetType]: FungibleAssetMetadata;
  };
  accountsAssets: { [account: string]: CaipAssetType[] };
};

// Represents the response of the asset snap's onAssetLookup handler
export type AssetMetadataResponse = {
  assets: {
    [asset: CaipAssetType]: FungibleAssetMetadata;
  };
};

/**
 * Constructs the default {@link MultichainAssetsController} state. This allows
 * consumers to provide a partial state object when initializing the controller
 * and also helps in constructing complete state objects for this controller in
 * tests.
 *
 * @returns The default {@link MultichainAssetsController} state.
 */
export function getDefaultMultichainAssetsControllerState(): MultichainAssetsControllerState {
  return { accountsAssets: {}, assetsMetadata: {} };
}

/**
 * Returns the state of the {@link MultichainAssetsController}.
 */
export type MultichainAssetsControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  MultichainAssetsControllerState
>;

/**
 * Event emitted when the state of the {@link MultichainAssetsController} changes.
 */
export type MultichainAssetsControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    MultichainAssetsControllerState
  >;

/**
 * Actions exposed by the {@link MultichainAssetsController}.
 */
export type MultichainAssetsControllerActions =
  MultichainAssetsControllerGetStateAction;

/**
 * Events emitted by {@link MultichainAssetsController}.
 */
export type MultichainAssetsControllerEvents =
  MultichainAssetsControllerStateChangeEvent;

/**
 * A function executed within a mutually exclusive lock, with
 * a mutex releaser in its option bag.
 *
 * @param releaseLock - A function to release the lock.
 */
type MutuallyExclusiveCallback<Result> = ({
  releaseLock,
}: {
  releaseLock: MutexInterface.Releaser;
}) => Promise<Result>;

/**
 * Actions that this controller is allowed to call.
 */
type AllowedActions =
  | HandleSnapRequest
  | GetAllSnaps
  | GetPermissions
  | AccountsControllerListMultichainAccountsAction;

/**
 * Events that this controller is allowed to subscribe.
 */
type AllowedEvents =
  | AccountsControllerAccountAddedEvent
  | AccountsControllerAccountRemovedEvent
  | AccountsControllerAccountAssetListUpdatedEvent;

/**
 * Messenger type for the MultichainAssetsController.
 */
export type MultichainAssetsControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  MultichainAssetsControllerActions | AllowedActions,
  MultichainAssetsControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

/**
 * {@link MultichainAssetsController}'s metadata.
 *
 * This allows us to choose if fields of the state should be persisted or not
 * using the `persist` flag; and if they can be sent to Sentry or not, using
 * the `anonymous` flag.
 */
const assetsControllerMetadata = {
  assetsMetadata: {
    persist: true,
    anonymous: false,
  },
  accountsAssets: {
    persist: true,
    anonymous: false,
  },
};

// TODO: make this controller extends StaticIntervalPollingController and update all assetsMetadata once a day.

export class MultichainAssetsController extends BaseController<
  typeof controllerName,
  MultichainAssetsControllerState,
  MultichainAssetsControllerMessenger
> {
  // Mapping of CAIP-2 Chain ID to Asset Snaps.
  #snaps: Record<CaipChainId, Snap[]>;

  readonly #controllerOperationMutex = new Mutex();

  constructor({
    messenger,
    state = {},
  }: {
    messenger: MultichainAssetsControllerMessenger;
    state?: Partial<MultichainAssetsControllerState>;
  }) {
    super({
      messenger,
      name: controllerName,
      metadata: assetsControllerMetadata,
      state: {
        ...getDefaultMultichainAssetsControllerState(),
        ...state,
      },
    });

    this.#snaps = {};

    this.messagingSystem.subscribe(
      'AccountsController:accountAdded',
      async (account) => await this.#handleOnAccountAddedEvent(account),
    );
    this.messagingSystem.subscribe(
      'AccountsController:accountRemoved',
      async (account) => await this.#handleOnAccountRemovedEvent(account),
    );
    this.messagingSystem.subscribe(
      'AccountsController:accountAssetListUpdated',
      async (event) => await this.#handleAccountAssetListUpdatedEvent(event),
    );
  }

  async #handleAccountAssetListUpdatedEvent(
    event: AccountAssetListUpdatedEventPayload,
  ) {
    return this.#withControllerLock(async () =>
      this.#handleAccountAssetListUpdated(event),
    );
  }

  async #handleOnAccountAddedEvent(account: InternalAccount) {
    return this.#withControllerLock(async () =>
      this.#handleOnAccountAdded(account),
    );
  }

  /**
   * Function to update the assets list for an account
   *
   * @param event - The list of assets to update
   */
  async #handleAccountAssetListUpdated(
    event: AccountAssetListUpdatedEventPayload,
  ) {
    this.#assertControllerMutexIsLocked();

    const assetsToUpdate = event.assets;
    let assetsForMetadataRefresh = new Set<CaipAssetType>([]);
    for (const accountId in assetsToUpdate) {
      if (hasProperty(assetsToUpdate, accountId)) {
        const { added, removed } = assetsToUpdate[accountId];
        if (added.length > 0 || removed.length > 0) {
          const existing = this.state.accountsAssets[accountId] || [];
          const assets = new Set<CaipAssetType>([
            ...existing,
            ...added.filter((asset) => isCaipAssetType(asset)),
          ]);
          for (const removedAsset of removed) {
            assets.delete(removedAsset);
          }
          assetsForMetadataRefresh = new Set([
            ...assetsForMetadataRefresh,
            ...assets,
          ]);
          this.update((state) => {
            state.accountsAssets[accountId] = Array.from(assets);
          });
        }
      }
    }
    // Trigger fetching metadata for new assets
    await this.#refreshAssetsMetadata(Array.from(assetsForMetadataRefresh));
  }

  /**
   * Checks for non-EVM accounts.
   *
   * @param account - The new account to be checked.
   * @returns True if the account is a non-EVM account, false otherwise.
   */
  #isNonEvmAccount(account: InternalAccount): boolean {
    return (
      !isEvmAccountType(account.type) &&
      // Non-EVM accounts are backed by a Snap for now
      account.metadata.snap !== undefined
    );
  }

  /**
   * Handles changes when a new account has been added.
   *
   * @param account - The new account being added.
   */
  async #handleOnAccountAdded(account: InternalAccount): Promise<void> {
    if (!this.#isNonEvmAccount(account)) {
      // Nothing to do here for EVM accounts
      return;
    }
    this.#assertControllerMutexIsLocked();

    // Get assets list
    if (account.metadata.snap) {
      const assets = await this.#getAssetsList(
        account.id,
        account.metadata.snap.id,
      );
      await this.#refreshAssetsMetadata(assets);
      this.update((state) => {
        state.accountsAssets[account.id] = assets;
      });
    }
  }

  /**
   * Handles changes when a new account has been removed.
   *
   * @param accountId - The new account id being removed.
   */
  async #handleOnAccountRemovedEvent(accountId: string): Promise<void> {
    // Check if accountId is in accountsAssets and if it is, remove it
    if (this.state.accountsAssets[accountId]) {
      this.update((state) => {
        // TODO: We are not deleting the assetsMetadata because we will soon make this controller extends StaticIntervalPollingController
        // and update all assetsMetadata once a day.
        delete state.accountsAssets[accountId];
      });
    }
  }

  /**
   * Refreshes the assets snaps and metadata for the given list of assets
   *
   * @param assets - The assets to refresh
   */
  async #refreshAssetsMetadata(assets: CaipAssetType[]) {
    this.#assertControllerMutexIsLocked();

    const assetsWithoutMetadata: CaipAssetType[] = assets.filter(
      (asset) => !this.state.assetsMetadata[asset],
    );

    // Call the snap to get the metadata
    if (assetsWithoutMetadata.length > 0) {
      // Check if for every asset in assetsWithoutMetadata there is a snap in snaps by chainId else call getAssetSnaps
      if (
        !assetsWithoutMetadata.every((asset: CaipAssetType) => {
          const { chainId } = parseCaipAssetType(asset);
          return Boolean(this.#getAssetSnapFor(chainId));
        })
      ) {
        this.#snaps = this.#getAssetSnaps();
      }
      await this.#updateAssetsMetadata(assetsWithoutMetadata);
    }
  }

  /**
   * Updates the assets metadata for the given list of assets
   *
   * @param assets - The assets to update
   */
  async #updateAssetsMetadata(assets: CaipAssetType[]) {
    // Creates a mapping of scope to their respective assets list.
    const assetsByScope: Record<CaipChainId, CaipAssetType[]> = {};
    for (const asset of assets) {
      const { chainId } = parseCaipAssetType(asset);
      if (!assetsByScope[chainId]) {
        assetsByScope[chainId] = [];
      }
      assetsByScope[chainId].push(asset);
    }

    let newMetadata: Record<CaipAssetType, FungibleAssetMetadata> = {};
    for (const chainId of Object.keys(assetsByScope) as CaipChainId[]) {
      const assetsForChain = assetsByScope[chainId];
      // Now fetch metadata from the associated asset Snaps:
      const snap = this.#getAssetSnapFor(chainId);
      if (snap) {
        const metadata = await this.#getAssetsMetadataFrom(
          assetsForChain,
          snap.id,
        );
        newMetadata = {
          ...newMetadata,
          ...(metadata?.assets ?? {}),
        };
      }
    }
    this.update((state) => {
      state.assetsMetadata = {
        ...this.state.assetsMetadata,
        ...newMetadata,
      };
    });
  }

  /**
   * Creates a mapping of CAIP-2 Chain ID to Asset Snaps.
   *
   * @returns A mapping of CAIP-2 Chain ID to Asset Snaps.
   */
  #getAssetSnaps(): Record<CaipChainId, Snap[]> {
    const snaps: Record<CaipChainId, Snap[]> = {};
    const allSnaps = this.#getAllSnaps();
    const allPermissions = allSnaps.map((snap) =>
      this.#getSnapsPermissions(snap.id),
    );

    for (const [index, permission] of allPermissions.entries()) {
      let scopes;
      for (const singlePermissionConstraint of Object.values(permission)) {
        scopes = getChainIdsCaveat(singlePermissionConstraint);
        if (!scopes) {
          continue;
        }
        for (const scope of scopes as CaipChainId[]) {
          if (!snaps[scope]) {
            snaps[scope] = [];
          }
          snaps[scope].push(allSnaps[index]);
        }
      }
    }
    return snaps;
  }

  /**
   * Returns the first asset snap for the given scope
   *
   * @param scope - The scope to get the asset snap for
   * @returns The asset snap for the given scope
   */
  #getAssetSnapFor(scope: CaipChainId): Snap | undefined {
    const allSnaps = this.#snaps[scope];
    // Pick only the first one, we ignore the other Snaps if there are multiple candidates for now.
    return allSnaps?.[0]; // Will be undefined if there's no Snaps candidate for this scope.
  }

  /**
   * Returns all the asset snaps
   *
   * @returns All the asset snaps
   */
  #getAllSnaps(): Snap[] {
    // TODO: Use dedicated SnapController's action once available for this:
    return this.messagingSystem
      .call('SnapController:getAll')
      .filter((snap) => snap.enabled && !snap.blocked);
  }

  /**
   * Returns the permissions for the given origin
   *
   * @param origin - The origin to get the permissions for
   * @returns The permissions for the given origin
   */
  #getSnapsPermissions(
    origin: string,
  ): SubjectPermissions<PermissionConstraint> {
    return this.messagingSystem.call(
      'PermissionController:getPermissions',
      origin,
    ) as SubjectPermissions<PermissionConstraint>;
  }

  /**
   * Returns the metadata for the given assets
   *
   * @param assets - The assets to get metadata for
   * @param snapId - The snap ID to get metadata from
   * @returns The metadata for the assets
   */
  async #getAssetsMetadataFrom(
    assets: CaipAssetType[],
    snapId: string,
  ): Promise<AssetMetadataResponse | undefined> {
    try {
      return (await this.messagingSystem.call('SnapController:handleRequest', {
        snapId: snapId as SnapId,
        origin: 'metamask',
        handler: HandlerType.OnAssetsLookup,
        request: {
          jsonrpc: '2.0',
          method: 'onAssetLookup',
          params: {
            assets,
          },
        },
      })) as Promise<AssetMetadataResponse>;
    } catch (error) {
      // Ignore
      console.error(error);
      return undefined;
    }
  }

  /**
   * Get assets list for an account
   *
   * @param accountId - AccountId to get assets for
   * @param snapId - Snap ID for the account
   * @returns list of assets
   */
  async #getAssetsList(
    accountId: string,
    snapId: string,
  ): Promise<CaipAssetTypeOrId[]> {
    return await this.#getClient(snapId).listAccountAssets(accountId);
  }

  /**
   * Gets a `KeyringClient` for a Snap.
   *
   * @param snapId - ID of the Snap to get the client for.
   * @returns A `KeyringClient` for the Snap.
   */
  #getClient(snapId: string): KeyringClient {
    return new KeyringClient({
      send: async (request: JsonRpcRequest) =>
        (await this.messagingSystem.call('SnapController:handleRequest', {
          snapId: snapId as SnapId,
          origin: 'metamask',
          handler: HandlerType.OnKeyringRequest,
          request,
        })) as Promise<Json>,
    });
  }

  /**
   * Assert that the controller mutex is locked.
   *
   * @throws If the controller mutex is not locked.
   */
  #assertControllerMutexIsLocked() {
    if (!this.#controllerOperationMutex.isLocked()) {
      throw new Error(
        'MultichainAssetsControllerError - Attempt to update state',
      );
    }
  }

  /**
   * Lock the controller mutex before executing the given function,
   * and release it after the function is resolved or after an
   * error is thrown.
   *
   * This wrapper ensures that each mutable operation that interacts with the
   * controller and that changes its state is executed in a mutually exclusive way,
   * preventing unsafe concurrent access that could lead to unpredictable behavior.
   *
   * @param callback - The function to execute while the controller mutex is locked.
   * @returns The result of the function.
   */
  async #withControllerLock<Result>(
    callback: MutuallyExclusiveCallback<Result>,
  ): Promise<Result> {
    return withLock(this.#controllerOperationMutex, callback);
  }
}

/**
 * Lock the given mutex before executing the given function,
 * and release it after the function is resolved or after an
 * error is thrown.
 *
 * @param mutex - The mutex to lock.
 * @param callback - The function to execute while the mutex is locked.
 * @returns The result of the function.
 */
async function withLock<Result>(
  mutex: Mutex,
  callback: MutuallyExclusiveCallback<Result>,
): Promise<Result> {
  const releaseLock = await mutex.acquire();

  try {
    return await callback({ releaseLock });
  } finally {
    releaseLock();
  }
}
