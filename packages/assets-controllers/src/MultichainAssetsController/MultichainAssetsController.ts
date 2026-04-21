import type {
  AccountsControllerAccountAddedEvent,
  AccountsControllerAccountAssetListUpdatedEvent,
  AccountsControllerAccountRemovedEvent,
  AccountsControllerListMultichainAccountsAction,
} from '@metamask/accounts-controller';
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
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type {
  SnapControllerGetRunnableSnapsAction,
  SnapControllerHandleRequestAction,
} from '@metamask/snaps-controllers';
import type { FungibleAssetMetadata, Snap, SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';
import { isCaipAssetType, parseCaipAssetType } from '@metamask/utils';
import type { CaipChainId } from '@metamask/utils';
import type { Json, JsonRpcRequest } from '@metamask/utils';
import type { MutexInterface } from 'async-mutex';
import { Mutex } from 'async-mutex';

import type { MultichainAssetsControllerMethodActions } from './MultichainAssetsController-method-action-types';
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
  | MultichainAssetsControllerMethodActions;

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
  | SnapControllerGetRunnableSnapsAction
  | SnapControllerHandleRequestAction
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

const MESSENGER_EXPOSED_METHODS = [
  'getAssetMetadata',
  'ignoreAssets',
  'addAssets',
] as const;

/** Phishing API allows at most this many token addresses per bulk scan request. */
const BLOCKAID_BULK_TOKEN_SCAN_BATCH_SIZE = 100;

/**
 * Default interval for re-scanning stored SPL (`token:`) assets with Blockaid.
 * Once per day limits API load while still catching tokens reclassified after add.
 */
const DEFAULT_BLOCKAID_TOKEN_RESCAN_INTERVAL_MS = 24 * 60 * 60 * 1000;

type ChainTokenEntry = { asset: CaipAssetType; address: string };

type BulkTokenScanBatchOutcome =
  | {
      status: 'fulfilled';
      response: BulkTokenScanResponse;
      entries: ChainTokenEntry[];
    }
  | { status: 'rejected'; entries: ChainTokenEntry[] };

export class MultichainAssetsController extends StaticIntervalPollingController<null>()<
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
    blockaidTokenRescanInterval = DEFAULT_BLOCKAID_TOKEN_RESCAN_INTERVAL_MS,
  }: {
    messenger: MultichainAssetsControllerMessenger;
    state?: Partial<MultichainAssetsControllerState>;
    /** Blockaid re-scan interval (ms); default daily. `0` disables. */
    blockaidTokenRescanInterval?: number;
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

    if (blockaidTokenRescanInterval > 0) {
      this.setIntervalLength(blockaidTokenRescanInterval);
      this.startPolling(null);
    }

    this.messenger.subscribe(
      'AccountsController:accountAdded',
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async (account) => await this.#handleOnAccountAddedEvent(account),
    );
    this.messenger.subscribe(
      'AccountsController:accountRemoved',
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async (account) => await this.#handleOnAccountRemovedEvent(account),
    );
    this.messenger.subscribe(
      'AccountsController:accountAssetListUpdated',
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async (event) => await this.#handleAccountAssetListUpdatedEvent(event),
    );

    messenger.registerMethodActionHandlers(this, MESSENGER_EXPOSED_METHODS);
  }

  async _executePoll(_input: null): Promise<void> {
    await this.#withControllerLock(async () => {
      const assetsByAccount: Record<
        string,
        { added: CaipAssetType[]; removed: CaipAssetType[] }
      > = {};

      for (const [accountId, assets] of Object.entries(
        this.state.accountsAssets,
      )) {
        const splTokens = assets.filter((asset) => {
          if (!isCaipAssetType(asset)) {
            return false;
          }
          try {
            return parseCaipAssetType(asset).assetNamespace === 'token';
          } catch {
            return false;
          }
        });

        if (splTokens.length === 0) {
          continue;
        }

        const malicious = await this.#findMaliciousTokensAmong(splTokens);
        if (malicious.length > 0) {
          this.ignoreAssets(malicious, accountId);
          assetsByAccount[accountId] = {
            added: [],
            removed: malicious,
          };
        }
      }

      if (Object.keys(assetsByAccount).length > 0) {
        this.messenger.publish(`${controllerName}:accountAssetListUpdated`, {
          assets: assetsByAccount,
        });
      }
    });
  }

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async #handleAccountAssetListUpdatedEvent(
    event: AccountAssetListUpdatedEventPayload,
  ) {
    return this.#withControllerLock(async () =>
      this.#handleAccountAssetListUpdated(event),
    );
  }

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async #handleOnAccountAddedEvent(account: InternalAccount) {
    return this.#withControllerLock(async () =>
      this.#handleOnAccountAdded(account),
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
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
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

        // Filter out tokens that cannot be verified or are flagged malicious
        const filteredToBeAddedAssets =
          await this.#filterBlockaidSpamTokensOnAdd(preFilteredToBeAddedAssets);

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
      const caipAssets = allAssets.filter(isCaipAssetType);
      const filteredCaip =
        await this.#filterBlockaidSpamTokensOnAdd(caipAssets);
      const filteredCaipSet = new Set(filteredCaip);
      const assets = allAssets.filter(
        (asset) => !isCaipAssetType(asset) || filteredCaipSet.has(asset),
      );
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
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
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
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
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
    return this.messenger.call('SnapController:getRunnableSnaps');
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
   * Groups `token:` CAIP assets by chain namespace for bulk scan.
   *
   * @param assets - CAIP assets to inspect.
   * @returns Map of chain namespace to token entries.
   */
  #groupTokenAssetsByChain(
    assets: CaipAssetType[],
  ): Record<string, ChainTokenEntry[]> {
    const tokensByChain: Record<string, ChainTokenEntry[]> = {};

    for (const asset of assets) {
      const { assetNamespace, assetReference, chain } =
        parseCaipAssetType(asset);

      if (assetNamespace === 'token') {
        const chainName = chain.namespace;
        if (!tokensByChain[chainName]) {
          tokensByChain[chainName] = [];
        }
        tokensByChain[chainName].push({ asset, address: assetReference });
      }
    }

    return tokensByChain;
  }

  async #runBatchedBulkTokenScans(
    chainName: string,
    tokenEntries: ChainTokenEntry[],
  ): Promise<BulkTokenScanBatchOutcome[]> {
    const batches: ChainTokenEntry[][] = [];
    for (
      let i = 0;
      i < tokenEntries.length;
      i += BLOCKAID_BULK_TOKEN_SCAN_BATCH_SIZE
    ) {
      batches.push(
        tokenEntries.slice(i, i + BLOCKAID_BULK_TOKEN_SCAN_BATCH_SIZE),
      );
    }

    const batchResults = await Promise.allSettled(
      batches.map((batch) =>
        this.messenger.call('PhishingController:bulkScanTokens', {
          chainId: chainName,
          tokens: batch.map((entry) => entry.address),
        }),
      ),
    );

    return batches.map((entries, index) => {
      const result = batchResults[index];
      if (result.status === 'fulfilled') {
        return {
          status: 'fulfilled' as const,
          response: result.value,
          entries,
        };
      }
      return { status: 'rejected' as const, entries };
    });
  }

  /**
   * Fail-closed Blockaid filter for newly detected `token:` assets (native/other namespaces unchanged).
   *
   * @param assets - CAIP assets to filter.
   * @returns Filtered list, original order preserved.
   */
  async #filterBlockaidSpamTokensOnAdd(
    assets: CaipAssetType[],
  ): Promise<CaipAssetType[]> {
    const tokensByChain = this.#groupTokenAssetsByChain(assets);

    if (Object.keys(tokensByChain).length === 0) {
      return [...assets];
    }

    const keptTokenAssets = new Set<CaipAssetType>();

    for (const [chainName, tokenEntries] of Object.entries(tokensByChain)) {
      const batchOutcomes = await this.#runBatchedBulkTokenScans(
        chainName,
        tokenEntries,
      );

      for (const outcome of batchOutcomes) {
        if (outcome.status === 'rejected') {
          continue;
        }
        for (const entry of outcome.entries) {
          const scanned = outcome.response[entry.address];
          if (
            scanned?.result_type &&
            scanned.result_type !== TokenScanResultType.Malicious
          ) {
            keptTokenAssets.add(entry.asset);
          }
        }
      }
    }

    return assets.filter((asset) => {
      try {
        if (parseCaipAssetType(asset).assetNamespace === 'token') {
          return keptTokenAssets.has(asset);
        }
      } catch {
        return false;
      }
      return true;
    });
  }

  /**
   * SPL `token:` assets in state that Blockaid marks malicious (failed batches skipped).
   *
   * @param assets - CAIP `token:` assets to scan.
   * @returns Subset marked malicious.
   */
  async #findMaliciousTokensAmong(
    assets: CaipAssetType[],
  ): Promise<CaipAssetType[]> {
    const tokensByChain = this.#groupTokenAssetsByChain(assets);

    const maliciousAssets: CaipAssetType[] = [];

    for (const [chainName, tokenEntries] of Object.entries(tokensByChain)) {
      const batchOutcomes = await this.#runBatchedBulkTokenScans(
        chainName,
        tokenEntries,
      );

      for (const outcome of batchOutcomes) {
        if (outcome.status === 'rejected') {
          continue;
        }
        for (const entry of outcome.entries) {
          if (
            outcome.response[entry.address]?.result_type ===
            TokenScanResultType.Malicious
          ) {
            maliciousAssets.push(entry.asset);
          }
        }
      }
    }

    return maliciousAssets;
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
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
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
