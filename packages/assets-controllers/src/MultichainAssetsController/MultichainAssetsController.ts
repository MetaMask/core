import type {
  AccountsControllerAccountAddedEvent,
  AccountsControllerAccountRemovedEvent,
  AccountsControllerListMultichainAccountsAction,
} from '@metamask/accounts-controller';
import {
  BaseController,
  type ControllerGetStateAction,
  type ControllerStateChangeEvent,
  type RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { isEvmAccountType } from '@metamask/keyring-api';
import type {
  AccountAssetListUpdatedEvent,
  AccountAssetListUpdatedEventPayload,
  CaipAssetType,
  CaipAssetTypeOrId,
} from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { KeyringClient } from '@metamask/keyring-snap-client';
import type {
  CaveatConstraint,
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
import { hasProperty, type CaipChainId } from '@metamask/utils';
import type { Json, JsonRpcRequest } from '@metamask/utils';

import { parseCaipAssetType } from './utils';
import type { AccountsControllerAccountAssetListUpdatedEvent } from '../../../accounts-controller/src/AccountsController';

const controllerName = 'MultichainAssetsController';

export type MultichainAssetsControllerState = {
  metadata: {
    [asset: CaipAssetType]: FungibleAssetMetadata;
  };
  allNonEvmTokens: { [account: string]: CaipAssetType[] };
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
  return { allNonEvmTokens: {}, metadata: {} };
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
export type MultichainAssetsControllerStateChange = ControllerStateChangeEvent<
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
  MultichainAssetsControllerStateChange;

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
export type MultichainAssetsControllerMessenger = RestrictedControllerMessenger<
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
  metadata: {
    persist: true,
    anonymous: false,
  },
  allNonEvmTokens: {
    persist: true,
    anonymous: false,
  },
};

// Define a temporary interface for the permission structure
type AssetEndowment = {
  'endowment:assets'?: {
    caveats: CaveatConstraint[];
  };
};

// TODO make this controller extends StaticIntervalPollingController and update all metadata once a day.

export class MultichainAssetsController extends BaseController<
  typeof controllerName,
  MultichainAssetsControllerState,
  MultichainAssetsControllerMessenger
> {
  // Mapping of CAIP-2 Chain ID to Asset Snaps.
  #snaps: Record<CaipChainId, Snap[]>;

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
      async (account) => await this.#handleOnAccountAdded(account),
    );
    this.messagingSystem.subscribe(
      'AccountsController:accountRemoved',
      async (account) => await this.#handleOnAccountRemoved(account),
    );
    this.messagingSystem.subscribe(
      'AccountsController:accountAssetListUpdated',
      async (event) => await this.#updateAccountAssetsList(event),
    );
  }

  /**
   * Function to update the assets list for an account
   *
   * @param event - The list of assets to update
   */
  async #updateAccountAssetsList(event: AccountAssetListUpdatedEventPayload) {
    const assetsToUpdate = event.assets;
    const assetsForMetadataRefresh: CaipAssetType[] = [];
    for (const accountId in assetsToUpdate) {
      if (hasProperty(assetsToUpdate, accountId)) {
        const newAccountAssets = assetsToUpdate[accountId];
        const assets = this.state.allNonEvmTokens[accountId] || [];

        const filteredAssetsToAdd = newAccountAssets.added.filter(
          (asset) => !assets.includes(asset),
        );
        assetsForMetadataRefresh.push(...filteredAssetsToAdd);
        const newAssets = [...assets, ...filteredAssetsToAdd];

        const assetsAfterRemoval = newAssets.filter(
          (asset) => !newAccountAssets.removed.includes(asset),
        );
        this.update((state) => {
          state.allNonEvmTokens[accountId] = assetsAfterRemoval;
        });
      }
    }
    // trigger fetching metadata for new assets
    await this.#refreshAssetsMetadata(assetsForMetadataRefresh);
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

    // Get assets list
    if (account.metadata.snap) {
      const assets = await this.#getAssetsList(
        account.id,
        account.metadata.snap.id,
      );
      await this.#refreshAssetsMetadata(assets);
      this.update((state) => {
        state.allNonEvmTokens[account.id] = assets;
      });
    }
  }

  /**
   * Handles changes when a new account has been removed.
   *
   * @param accountId - The new account id being removed.
   */
  async #handleOnAccountRemoved(accountId: string): Promise<void> {
    // Check if accountId is in allNonEvmTokens and if it is, remove it
    if (this.state.allNonEvmTokens[accountId]) {
      this.update((state) => {
        delete state.allNonEvmTokens[accountId];
      });
    }
  }

  /**
   * Refreshes the assets snaps and metadata for the given list of assets
   *
   * @param assets - The assets to refresh
   */
  async #refreshAssetsMetadata(assets: CaipAssetType[]) {
    const assetsWithoutMetadata: CaipAssetType[] = assets.filter(
      (asset) => !this.state.metadata[asset],
    );

    // call the snap to get the metadata
    if (assetsWithoutMetadata.length > 0) {
      // check if for every asset in assetsWithoutMetadata there is a snap in snaps by chainId else call getAssetSnaps
      if (
        !assetsWithoutMetadata.every((asset: CaipAssetType) => {
          const chainId = parseCaipAssetType(asset);
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
      const chainId = parseCaipAssetType(asset);
      if (!assetsByScope[chainId]) {
        assetsByScope[chainId] = [];
      }
      assetsByScope[chainId].push(asset);
    }
    let newMetadata: Record<CaipAssetType, FungibleAssetMetadata> = {};
    for (const chainId in assetsByScope) {
      if (hasProperty(assetsByScope, chainId)) {
        const assetsForChain = assetsByScope[chainId as CaipChainId];
        // Now fetch metadata from the associated asset Snaps:
        const snap = this.#getAssetSnapFor(chainId as CaipChainId);
        if (snap) {
          const metadata = await this.#getMetadata(assetsForChain, snap.id);
          newMetadata = {
            ...newMetadata,
            ...(metadata ? metadata.assets : {}),
          };
        }
      }
    }
    this.update((state) => {
      state.metadata = {
        ...this.state.metadata,
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

    for (const [index, permission] of allPermissions.entries() as unknown as [
      number,
      AssetEndowment,
    ][]) {
      const chainIdsCaveatPermission = permission[
        'endowment:assets'
      ]?.caveats.find((value) => value.type === 'chainIds');
      const scopes = chainIdsCaveatPermission?.value;
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
  async #getMetadata(
    assets: CaipAssetType[],
    snapId: string,
  ): Promise<AssetMetadataResponse | undefined> {
    try {
      return (await this.messagingSystem.call('SnapController:handleRequest', {
        snapId: snapId as SnapId,
        origin: 'metamask',
        handler: HandlerType.OnAssetsLookup,
        request: {
          id: '4dbf133d-9ce3-4d3f-96ac-bfc88d351046',
          jsonrpc: '2.0',
          method: 'onAssetLookup',
          params: {
            assets,
          },
        },
      })) as Promise<AssetMetadataResponse>;
    } catch {
      // ignore
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
}
