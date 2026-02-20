import type {
  AccountsControllerAccountAddedEvent,
  AccountsControllerAccountAssetListUpdatedEvent,
  AccountsControllerAccountRemovedEvent,
  AccountsControllerListMultichainAccountsAction,
} from '@metamask/accounts-controller';
import { BaseController } from '@metamask/base-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { isEvmAccountType } from '@metamask/keyring-api';
import type {
  AccountAssetListUpdatedEventPayload,
  CaipAssetType,
  CaipAssetTypeOrId,
} from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { KeyringClient } from '@metamask/keyring-snap-client';
import type { Messenger } from '@metamask/messenger';
import type {
  GetPermissions,
  PermissionConstraint,
  SubjectPermissions,
} from '@metamask/permission-controller';
import type {
  BulkTokenScanResponse,
  PhishingControllerBulkScanTokensAction,
} from '@metamask/phishing-controller';
import { TokenScanResultType } from '@metamask/phishing-controller';
import type {
  GetAllSnaps,
  HandleSnapRequest,
} from '@metamask/snaps-controllers';
import type { FungibleAssetMetadata, Snap, SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';
import { isCaipAssetType, parseCaipAssetType } from '@metamask/utils';
import type { CaipChainId } from '@metamask/utils';
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
  allIgnoredAssets: { [account: string]: CaipAssetType[] };
};

// Represents the response of the asset snap's onAssetLookup handler
export type AssetMetadataResponse = {
  assets: {
    [asset: CaipAssetType]: FungibleAssetMetadata;
  };
};

export type MultichainAssetsControllerAccountAssetListUpdatedEvent = {
  type: `${typeof controllerName}:accountAssetListUpdated`;
  payload: AccountsControllerAccountAssetListUpdatedEvent['payload'];
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
  return { accountsAssets: {}, assetsMetadata: {}, allIgnoredAssets: {} };
}

export type MultichainAssetsControllerGetAssetMetadataAction = {
  type: `${typeof controllerName}:getAssetMetadata`;
  handler: MultichainAssetsController['getAssetMetadata'];
};

export type MultichainAssetsControllerIgnoreAssetsAction = {
  type: `${typeof controllerName}:ignoreAssets`;
  handler: MultichainAssetsController['ignoreAssets'];
};

export type MultichainAssetsControllerAddAssetsAction = {
  type: `${typeof controllerName}:addAssets`;
  handler: MultichainAssetsController['addAssets'];
};

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
  | MultichainAssetsControllerGetStateAction
  | MultichainAssetsControllerGetAssetMetadataAction
  | MultichainAssetsControllerIgnoreAssetsAction
  | MultichainAssetsControllerAddAssetsAction;

/**
 * Events emitted by {@link MultichainAssetsController}.
 */
export type MultichainAssetsControllerEvents =
  | MultichainAssetsControllerStateChangeEvent
  | MultichainAssetsControllerAccountAssetListUpdatedEvent;

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
  | AccountsControllerListMultichainAccountsAction
  | PhishingControllerBulkScanTokensAction;

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
export type MultichainAssetsControllerMessenger = Messenger<
  typeof controllerName,
  MultichainAssetsControllerActions | AllowedActions,
  MultichainAssetsControllerEvents | AllowedEvents
>;

/**
 * {@link MultichainAssetsController}'s metadata.
 *
 * This allows us to choose if fields of the state should be persisted or not
 * using the `persist` flag; and if they can be sent to Sentry or not, using
 * the `anonymous` flag.
 */
const assetsControllerMetadata: StateMetadata<MultichainAssetsControllerState> =
  {
    assetsMetadata: {
      includeInStateLogs: false,
      persist: true,
      includeInDebugSnapshot: false,
      usedInUi: true,
    },
    accountsAssets: {
      includeInStateLogs: false,
      persist: true,
      includeInDebugSnapshot: false,
      usedInUi: true,
    },
    allIgnoredAssets: {
      includeInStateLogs: false,
      persist: true,
      includeInDebugSnapshot: false,
      usedInUi: true,
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

    this.messenger.subscribe(
      'AccountsController:accountAdded',
      async (account) => await this.#handleOnAccountAddedEvent(account),
    );
    this.messenger.subscribe(
      'AccountsController:accountRemoved',
      async (account) => await this.#handleOnAccountRemovedEvent(account),
    );
    this.messenger.subscribe(
      'AccountsController:accountAssetListUpdated',
      async (event) => await this.#handleAccountAssetListUpdatedEvent(event),
    );

    this.#registerMessageHandlers();
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
   * Constructor helper for registering the controller's messaging system
   * actions.
   */
  #registerMessageHandlers() {
    this.messenger.registerActionHandler(
      'MultichainAssetsController:getAssetMetadata',
      this.getAssetMetadata.bind(this),
    );

    this.messenger.registerActionHandler(
      'MultichainAssetsController:ignoreAssets',
      this.ignoreAssets.bind(this),
    );

    this.messenger.registerActionHandler(
      'MultichainAssetsController:addAssets',
      this.addAssets.bind(this),
    );
  }

  /**
   * Returns the metadata for the given asset
   *
   * @param asset - The asset to get metadata for
   * @returns The metadata for the asset or undefined if not found.
   */
  getAssetMetadata(asset: CaipAssetType): FungibleAssetMetadata | undefined {
    return this.state.assetsMetadata[asset];
  }

  /**
   * Ignores a batch of assets for a specific account.
   *
   * @param assetsToIgnore - Array of asset IDs to ignore.
   * @param accountId - The account ID to ignore assets for.
   */
  ignoreAssets(assetsToIgnore: CaipAssetType[], accountId: string): void {
    this.update((state) => {
      if (state.accountsAssets[accountId]) {
        state.accountsAssets[accountId] = state.accountsAssets[
          accountId
        ].filter((asset) => !assetsToIgnore.includes(asset));
      }

      if (!state.allIgnoredAssets[accountId]) {
        state.allIgnoredAssets[accountId] = [];
      }

      const newIgnoredAssets = assetsToIgnore.filter(
        (asset) => !state.allIgnoredAssets[accountId].includes(asset),
      );
      state.allIgnoredAssets[accountId].push(...newIgnoredAssets);
    });
  }

  /**
   * Adds multiple assets to the stored asset list for a specific account.
   * All assets must belong to the same chain.
   *
   * @param assetIds - Array of CAIP asset IDs to add (must be from same chain).
   * @param accountId - The account ID to add the assets to.
   * @returns The updated asset list for the account.
   * @throws Error if assets are from different chains.
   */
  async addAssets(
    assetIds: CaipAssetType[],
    accountId: string,
  ): Promise<CaipAssetType[]> {
    if (assetIds.length === 0) {
      return this.state.accountsAssets[accountId] || [];
    }

    // Validate that all assets are from the same chain
    const chainIds = new Set(
      assetIds.map((assetId) => parseCaipAssetType(assetId).chainId),
    );
    if (chainIds.size > 1) {
      throw new Error(
        `All assets must belong to the same chain. Found assets from chains: ${Array.from(chainIds).join(', ')}`,
      );
    }

    return this.#withControllerLock(async () => {
      // Refresh metadata for all assets
      await this.#refreshAssetsMetadata(assetIds);

      const addedAssets: CaipAssetType[] = [];

      this.update((state) => {
        // Initialize account assets if it doesn't exist
        if (!state.accountsAssets[accountId]) {
          state.accountsAssets[accountId] = [];
        }

        // Add assets if they don't already exist
        for (const assetId of assetIds) {
          if (!state.accountsAssets[accountId].includes(assetId)) {
            state.accountsAssets[accountId].push(assetId);
            addedAssets.push(assetId);
          }
        }

        // Remove from ignored list if they exist there (inline logic like EVM)
        if (state.allIgnoredAssets[accountId]) {
          state.allIgnoredAssets[accountId] = state.allIgnoredAssets[
            accountId
          ].filter((asset) => !assetIds.includes(asset));

          // Clean up empty arrays
          if (state.allIgnoredAssets[accountId].length === 0) {
            delete state.allIgnoredAssets[accountId];
          }
        }
      });

      // Publish event to notify other controllers (balances, rates) about the new assets
      if (addedAssets.length > 0) {
        this.messenger.publish(`${controllerName}:accountAssetListUpdated`, {
          assets: {
            [accountId]: {
              added: addedAssets,
              removed: [],
            },
          },
        });
      }

      return this.state.accountsAssets[accountId] || [];
    });
  }

  /**
   * Checks if an asset is ignored for a specific account.
   *
   * @param asset - The asset ID to check.
   * @param accountId - The account ID to check for.
   * @returns True if the asset is ignored, false otherwise.
   */
  #isAssetIgnored(asset: CaipAssetType, accountId: string): boolean {
    return this.state.allIgnoredAssets[accountId]?.includes(asset) ?? false;
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

    const assetsForMetadataRefresh = new Set<CaipAssetType>([]);
    const accountsAndAssetsToUpdate: AccountAssetListUpdatedEventPayload['assets'] =
      {};
    for (const [accountId, { added, removed }] of Object.entries(
      event.assets,
    )) {
      if (added.length > 0 || removed.length > 0) {
        const existing = this.state.accountsAssets[accountId] || [];

        // In case accountsAndAssetsToUpdate event is fired with "added" assets that already exist, we don't want to add them again
        // Also filter out ignored assets
        const preFilteredToBeAddedAssets = added.filter(
          (asset) =>
            !existing.includes(asset) &&
            isCaipAssetType(asset) &&
            !this.#isAssetIgnored(asset, accountId),
        );

        // Filter out tokens flagged by Blockaid as non-benign
        const filteredToBeAddedAssets = await this.#filterBlockaidSpamTokens(
          preFilteredToBeAddedAssets,
        );

        // In case accountsAndAssetsToUpdate event is fired with "removed" assets that don't exist, we don't want to remove them
        const filteredToBeRemovedAssets = removed.filter(
          (asset) => existing.includes(asset) && isCaipAssetType(asset),
        );

        if (
          filteredToBeAddedAssets.length > 0 ||
          filteredToBeRemovedAssets.length > 0
        ) {
          accountsAndAssetsToUpdate[accountId] = {
            added: filteredToBeAddedAssets,
            removed: filteredToBeRemovedAssets,
          };
        }

        for (const asset of existing) {
          assetsForMetadataRefresh.add(asset);
        }
        for (const asset of filteredToBeAddedAssets) {
          assetsForMetadataRefresh.add(asset);
        }
        for (const asset of filteredToBeRemovedAssets) {
          assetsForMetadataRefresh.delete(asset);
        }
      }
    }

    this.update((state) => {
      for (const [accountId, { added, removed }] of Object.entries(
        accountsAndAssetsToUpdate,
      )) {
        const assets = new Set([
          ...(state.accountsAssets[accountId] || []),
          ...added,
        ]);
        for (const asset of removed) {
          assets.delete(asset);
        }

        state.accountsAssets[accountId] = Array.from(assets);
      }
    });

    // Trigger fetching metadata for new assets
    await this.#refreshAssetsMetadata(Array.from(assetsForMetadataRefresh));

    this.messenger.publish(`${controllerName}:accountAssetListUpdated`, {
      assets: accountsAndAssetsToUpdate,
    });
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
      const allAssets = await this.#getAssetsList(
        account.id,
        account.metadata.snap.id,
      );
      const assets = await this.#filterBlockaidSpamTokens(allAssets);
      await this.#refreshAssetsMetadata(assets);
      this.update((state) => {
        state.accountsAssets[account.id] = assets;
      });
      this.messenger.publish(`${controllerName}:accountAssetListUpdated`, {
        assets: {
          [account.id]: {
            added: assets,
            removed: [],
          },
        },
      });
    }
  }

  /**
   * Handles changes when a new account has been removed.
   *
   * @param accountId - The new account id being removed.
   */
  async #handleOnAccountRemovedEvent(accountId: string): Promise<void> {
    this.update((state) => {
      if (state.accountsAssets[accountId]) {
        delete state.accountsAssets[accountId];
      }
      if (state.allIgnoredAssets[accountId]) {
        delete state.allIgnoredAssets[accountId];
      }
      // TODO: We are not deleting the assetsMetadata because we will soon make this controller extends StaticIntervalPollingController
      // and update all assetsMetadata once a day.
    });
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
    return this.messenger
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
    return this.messenger.call(
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
      return (await this.messenger.call('SnapController:handleRequest', {
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
   * Filters out tokens flagged as malicious by Blockaid via the
   * `PhishingController:bulkScanTokens` messenger action. Only tokens with
   * an `assetNamespace` of "token" are scanned (native assets like slip44 are
   * passed through unfiltered). If the scan fails, all tokens are kept
   * (fail open).
   *
   * @param assets - The CAIP asset type list to filter.
   * @returns The filtered list with malicious tokens removed.
   */
  async #filterBlockaidSpamTokens(
    assets: CaipAssetType[],
  ): Promise<CaipAssetType[]> {
    // Group scannable token assets by chain namespace
    const tokensByChain: Record<
      string,
      { asset: CaipAssetType; address: string }[]
    > = {};

    for (const asset of assets) {
      const { assetNamespace, assetReference, chain } =
        parseCaipAssetType(asset);

      // Only scan fungible token assets (e.g. SPL tokens), skip native (slip44)
      if (assetNamespace === 'token') {
        const chainName = chain.namespace;
        if (!tokensByChain[chainName]) {
          tokensByChain[chainName] = [];
        }
        tokensByChain[chainName].push({ asset, address: assetReference });
      }
    }

    // If there are no token assets to scan, return as-is
    if (Object.keys(tokensByChain).length === 0) {
      return assets;
    }

    // Build a set of assets to reject (non-benign tokens)
    const rejectedAssets = new Set<CaipAssetType>();

    // PhishingController:bulkScanTokens rejects requests with more than
    // 100 tokens (returning {}). Batch addresses into chunks to stay within
    // the limit.
    const BATCH_SIZE = 100;

    for (const [chainName, tokenEntries] of Object.entries(tokensByChain)) {
      const addresses = tokenEntries.map((entry) => entry.address);

      // Create batches of BATCH_SIZE
      const batches: string[][] = [];
      for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
        batches.push(addresses.slice(i, i + BATCH_SIZE));
      }

      // Scan all batches in parallel. Using Promise.allSettled so that a
      // single batch failure doesn't discard results from successful batches
      // (fail open at the batch level, not the chain level).
      const batchResults = await Promise.allSettled(
        batches.map((batch) =>
          this.messenger.call('PhishingController:bulkScanTokens', {
            chainId: chainName,
            tokens: batch,
          }),
        ),
      );

      // Merge results from fulfilled batches (rejected batches fail open)
      const scanResponse: BulkTokenScanResponse = {};
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          Object.assign(scanResponse, result.value);
        }
      }

      for (const entry of tokenEntries) {
        const result = scanResponse[entry.address];
        if (result?.result_type === TokenScanResultType.Malicious) {
          rejectedAssets.add(entry.asset);
        }
      }
    }

    // Filter while preserving original order
    return assets.filter((asset) => !rejectedAssets.has(asset));
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
        (await this.messenger.call('SnapController:handleRequest', {
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
