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
import type { CaipAssetType } from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type {
  GetPermissions,
  PermissionConstraint,
  SubjectPermissions,
} from '@metamask/permission-controller';
import type {
  GetAllSnaps,
  HandleSnapRequest,
} from '@metamask/snaps-controllers';
import type { Snap, SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';

const controllerName = 'MultichainAssetsController';

// Represents an asset unit.
type FungibleAssetUnit = {
  // Human-friendly name of the asset unit.
  name: string;

  // Ticker symbol of the asset unit.
  symbol: string;

  // Number of decimals of the asset unit.
  decimals: number;
};

// Fungible asset metadata.
type FungibleAssetMetadata = {
  // Human-friendly name of the asset.
  name: string;

  // Ticker symbol of the asset's main unit.
  symbol: string;

  // Whether the asset is native to the chain.
  native: boolean;

  // Represents a fungible asset
  fungible: true;

  // Base64 representation of the asset icon.
  iconBase64: string;

  // List of asset units.
  units: FungibleAssetUnit[];
};

// Represents the metadata of an asset.
type AssetMetadata = FungibleAssetMetadata;

export type MultichainAssetsControllerState = {
  metadata: {
    [asset: CaipAssetType]: AssetMetadata;
  };
  allNonEvmTokens: { [account: string]: CaipAssetType[] };
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
  | AccountsControllerAccountRemovedEvent;

type AssetLookupResponse = {
  assets: Record<CaipAssetType, AssetMetadata>;
};

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
    scopes: string[];
  };
};

export class MultichainAssetsController extends BaseController<
  typeof controllerName,
  MultichainAssetsControllerState,
  MultichainAssetsControllerMessenger
> {
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

    this.messagingSystem.subscribe(
      'AccountsController:accountAdded',
      async (account) => await this.#handleOnAccountAdded(account),
    );
    this.messagingSystem.subscribe(
      'AccountsController:accountRemoved',
      (account) => this.#handleOnAccountRemoved(account),
    );
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
  async #handleOnAccountAdded(account: InternalAccount) {
    if (!this.#isNonEvmAccount(account)) {
      // Nothing to do here for EVM accounts
      return;
    }

    // Get assets list
    if (account.metadata.snap) {
      const assets = await this.#getAssets(
        account.id,
        account.metadata.snap.id,
      );
      const assetsWithoutMetadata = assets.filter(
        (asset) => !this.state.metadata[asset],
      );
      const snaps = this.#getAllSnaps();

      const permissions = snaps.map((snap) =>
        this.#getSnapsPermissions(snap.id),
      );

      // Mock start To be removed once the above is implemented
      permissions.forEach((singlePermission) => {
        (singlePermission as unknown as AssetEndowment) = {
          ...singlePermission,
          'endowment:assets': {
            scopes: ['bip122:000000000019d6689c085ae165831e93'],
          },
        };
      });
      (permissions[0] as unknown as AssetEndowment) = {
        ...permissions[0],
        'endowment:assets': {
          scopes: ['solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'],
        },
      };
      // Mock End To be removed once the above is implemented

      // Identify the correct snap that has the right endowment:assets permission
      // TODO: create a mapping of the assets to the snapId based on the permission['endowment:assets']?.scopes from permissions array and the assets[0].split('/')[0] from assets array
      const mapAssetsToSnapId = new Map<CaipAssetType, string[]>();
      assets.forEach((asset) => {
        const snapIds: string[] = [];
        permissions.forEach((permission: AssetEndowment, index: number) => {
          if (
            permission['endowment:assets']?.scopes.includes(asset.split('/')[0])
          ) {
            snapIds.push(snaps[index].id);
          }
        });
        mapAssetsToSnapId.set(asset, snapIds);
      });
      // should take the first snapId from the mapAssetsToSnapId and use it to get the assets

      // call the snap to get the metadata
      if (assetsWithoutMetadata.length > 0) {
        const metadata = await this.#getMetadata(assetsWithoutMetadata);

        const newMetadata = {
          ...this.state.metadata,
          ...metadata.assets,
        };
        this.update((state) => {
          state.metadata = newMetadata;
        });
      }
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
    const selectedAccounts = this.messagingSystem.call(
      'AccountsController:listMultichainAccounts',
    );

    const nonEvmAccounts = selectedAccounts.filter((account) =>
      this.#isNonEvmAccount(account),
    );
    const account: InternalAccount | undefined = nonEvmAccounts.find(
      (multichainAccount) => multichainAccount.id === accountId,
    );
    if (!account) {
      return;
    }

    this.update((state) => {
      delete state.allNonEvmTokens[accountId];
    });
  }

  #getAllSnaps(): Snap[] {
    return this.messagingSystem.call('SnapController:getAll') as Snap[];
  }

  #getSnapsPermissions(
    origin: string,
  ): SubjectPermissions<PermissionConstraint> {
    return this.messagingSystem.call(
      'PermissionController:getPermissions',
      origin,
    ) as SubjectPermissions<PermissionConstraint>;
  }

  async #getAssets(
    accountId: string,
    snapId: string,
  ): Promise<CaipAssetType[]> {
    return await this.#getAssetsList(snapId, accountId);
  }

  /**
   * Gets a `KeyringClient` for a Snap.
   *
   * @param snapId - ID of the Snap to get the client for.
   * @param accountId - ID of the account to get the assets for.
   * @returns A `KeyringClient` for the Snap.
   */
  // TODO: update this to use the snap handler
  async #getAssetsList(
    snapId: string,
    accountId: string,
  ): Promise<CaipAssetType[]> {
    const result = (await this.messagingSystem.call(
      'SnapController:handleRequest',
      {
        snapId: snapId as SnapId,
        origin: 'metamask',
        handler: HandlerType.OnRpcRequest,
        request: {
          id: '4dbf133d-9ce3-4d3f-96ac-bfc88d351046',
          jsonrpc: '2.0',
          method: 'listAccountAssets',
          params: {
            id: accountId,
          },
        },
      },
    )) as CaipAssetType[];

    return result;
  }

  // TODO: update this function to get metadata from the snap
  async #getMetadata(assets: CaipAssetType[]): Promise<AssetLookupResponse> {
    console.log('🚀 ~ #getMetadata ~ assets:', assets);
    return Promise.resolve({
      assets: {
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/slip44:501': {
          name: 'Solana',
          symbol: 'SOL',
          native: true,
          fungible: true,
          iconBase64:
            'data:image/jpeg;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDI0LjAuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPgo8c3ZnIHZlcnNpb249IjEuMSIgaWQ9IkxheWVyXzEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHg9IjBweCIgeT0iMHB4IgoJIHZpZXdCb3g9IjAgMCAzOTcuNyAzMTEuNyIgc3R5bGU9ImVuYWJsZS1iYWNrZ3JvdW5kOm5ldyAwIDAgMzk3LjcgMzExLjc7IiB4bWw6c3BhY2U9InByZXNlcnZlIj4KPHN0eWxlIHR5cGU9InRleHQvY3NzIj4KCS5zdDB7ZmlsbDp1cmwoI1NWR0lEXzFfKTt9Cgkuc3Qxe2ZpbGw6dXJsKCNTVkdJRF8yXyk7fQoJLnN0MntmaWxsOnVybCgjU1ZHSURfM18pO30KPC9zdHlsZT4KPGxpbmVhckdyYWRpZW50IGlkPSJTVkdJRF8xXyIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiIHgxPSIzNjAuODc5MSIgeTE9IjM1MS40NTUzIiB4Mj0iMTQxLjIxMyIgeTI9Ii02OS4yOTM2IiBncmFkaWVudFRyYW5zZm9ybT0ibWF0cml4KDEgMCAwIC0xIDAgMzE0KSI+Cgk8c3RvcCAgb2Zmc2V0PSIwIiBzdHlsZT0ic3RvcC1jb2xvcjojMDBGRkEzIi8+Cgk8c3RvcCAgb2Zmc2V0PSIxIiBzdHlsZT0ic3RvcC1jb2xvcjojREMxRkZGIi8+CjwvbGluZWFyR3JhZGllbnQ+CjxwYXRoIGNsYXNzPSJzdDAiIGQ9Ik02NC42LDIzNy45YzIuNC0yLjQsNS43LTMuOCw5LjItMy44aDMxNy40YzUuOCwwLDguNyw3LDQuNiwxMS4xbC02Mi43LDYyLjdjLTIuNCwyLjQtNS43LDMuOC05LjIsMy44SDYuNQoJYy01LjgsMC04LjctNy00LjYtMTEuMUw2NC42LDIzNy45eiIvPgo8bGluZWFyR3JhZGllbnQgaWQ9IlNWR0lEXzJfIiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgeDE9IjI2NC44MjkxIiB5MT0iNDAxLjYwMTQiIHgyPSI0NS4xNjMiIHkyPSItMTkuMTQ3NSIgZ3JhZGllbnRUcmFuc2Zvcm09Im1hdHJpeCgxIDAgMCAtMSAwIDMxNCkiPgoJPHN0b3AgIG9mZnNldD0iMCIgc3R5bGU9InN0b3AtY29sb3I6IzAwRkZBMyIvPgoJPHN0b3AgIG9mZnNldD0iMSIgc3R5bGU9InN0b3AtY29sb3I6I0RDMUZGRiIvPgo8L2xpbmVhckdyYWRpZW50Pgo8cGF0aCBjbGFzcz0ic3QxIiBkPSJNNjQuNiwzLjhDNjcuMSwxLjQsNzAuNCwwLDczLjgsMGgzMTcuNGM1LjgsMCw4LjcsNyw0LjYsMTEuMWwtNjIuNyw2Mi43Yy0yLjQsMi40LTUuNywzLjgtOS4yLDMuOEg2LjUKCWMtNS44LDAtOC43LTctNC42LTExLjFMNjQuNiwzLjh6Ii8+CjxsaW5lYXJHcmFkaWVudCBpZD0iU1ZHSURfM18iIGdyYWRpZW50VW5pdHM9InVzZXJTcGFjZU9uVXNlIiB4MT0iMzEyLjU0ODQiIHkxPSIzNzYuNjg4IiB4Mj0iOTIuODgyMiIgeTI9Ii00NC4wNjEiIGdyYWRpZW50VHJhbnNmb3JtPSJtYXRyaXgoMSAwIDAgLTEgMCAzMTQpIj4KCTxzdG9wICBvZmZzZXQ9IjAiIHN0eWxlPSJzdG9wLWNvbG9yOiMwMEZGQTMiLz4KCTxzdG9wICBvZmZzZXQ9IjEiIHN0eWxlPSJzdG9wLWNvbG9yOiNEQzFGRkYiLz4KPC9saW5lYXJHcmFkaWVudD4KPHBhdGggY2xhc3M9InN0MiIgZD0iTTMzMy4xLDEyMC4xYy0yLjQtMi40LTUuNy0zLjgtOS4yLTMuOEg2LjVjLTUuOCwwLTguNyw3LTQuNiwxMS4xbDYyLjcsNjIuN2MyLjQsMi40LDUuNywzLjgsOS4yLDMuOGgzMTcuNAoJYzUuOCwwLDguNy03LDQuNi0xMS4xTDMzMy4xLDEyMC4xeiIvPgo8L3N2Zz4K',
          units: [{ name: 'Solana', symbol: 'SOL', decimals: 9 }],
        },
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr':
          {
            name: 'USDC',
            symbol: 'USDC',
            native: true,
            fungible: true,
            iconBase64:
              'data:image/jpeg;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNTAiIGhlaWdodD0iMjUwIj48cGF0aCBmaWxsPSIjMjc3NWNhIiBkPSJNMTI1IDI1MGM2OS4yNyAwIDEyNS01NS43MyAxMjUtMTI1UzE5NC4yNyAwIDEyNSAwIDAgNTUuNzMgMCAxMjVzNTUuNzMgMTI1IDEyNSAxMjV6bTAgMCIvPjxnIGZpbGw9IiNmZmYiPjxwYXRoIGQ9Ik0xNTkuMzc1IDE0NC43OTNjMC0xOC4yMy0xMC45MzgtMjQuNDgtMzIuODEzLTI3LjA4Ni0xNS42MjQtMi4wODItMTguNzUtNi4yNS0xOC43NS0xMy41MzkgMC03LjI5MyA1LjIwOC0xMS45OCAxNS42MjYtMTEuOTggOS4zNzQgMCAxNC41ODIgMy4xMjQgMTcuMTg3IDEwLjkzNy41MiAxLjU2MyAyLjA4MiAyLjYwNSAzLjY0NSAyLjYwNWg4LjMzNWMyLjA4MyAwIDMuNjQ1LTEuNTYyIDMuNjQ1LTMuNjQ4di0uNTJjLTIuMDgyLTExLjQ1Ny0xMS40NTctMjAuMzEyLTIzLjQzOC0yMS4zNTV2LTEyLjVjMC0yLjA4Mi0xLjU2Mi0zLjY0NC00LjE2Ny00LjE2NGgtNy44MTNjLTIuMDgyIDAtMy42NDQgMS41NjItNC4xNjQgNC4xNjR2MTEuOThjLTE1LjYyNSAyLjA4My0yNS41MjMgMTIuNS0yNS41MjMgMjUuNTIgMCAxNy4xODggMTAuNDE4IDIzLjk2MSAzMi4yOTMgMjYuNTYzIDE0LjU4MiAyLjYwNSAxOS4yNjkgNS43MyAxOS4yNjkgMTQuMDYyIDAgOC4zMzYtNy4yODkgMTQuMDYzLTE3LjE4NyAxNC4wNjMtMTMuNTQgMC0xOC4yMjctNS43MjctMTkuNzktMTMuNTQtLjUyMy0yLjA4NS0yLjA4NS0zLjEyNS0zLjY0OC0zLjEyNUg5My4yM2MtMi4wODUgMC0zLjY0OCAxLjU2My0zLjY0OCAzLjY0NXYuNTJjMi4wODYgMTMuMDIzIDEwLjQxOCAyMi4zOTggMjcuNjA2IDI1djEyLjVjMCAyLjA4NSAxLjU2MiAzLjY0OCA0LjE2NyA0LjE2N2g3LjgxM2MyLjA4MiAwIDMuNjQ0LTEuNTYyIDQuMTY0LTQuMTY3di0xMi41YzE1LjYyNS0yLjYwMiAyNi4wNDMtMTMuNTQgMjYuMDQzLTI3LjYwMnptMCAwIi8+PHBhdGggZD0iTTk4LjQzOCAxOTkuNDhjLTQwLjYyNi0xNC41ODUtNjEuNDU4LTU5Ljg5OC00Ni4zNTYtMTAwIDcuODEzLTIxLjg3NSAyNS0zOC41NDMgNDYuMzU1LTQ2LjM1NSAyLjA4My0xLjA0MyAzLjEyNi0yLjYwNSAzLjEyNi01LjIwN3YtNy4yOTNjMC0yLjA4Mi0xLjA0My0zLjY0NS0zLjEyNi00LjE2OC0uNTE5IDAtMS41NjIgMC0yLjA4Mi41MjMtNDkuNDggMTUuNjI1LTc2LjU2MiA2OC4yMjctNjAuOTM3IDExNy43MDggOS4zNzUgMjkuMTY3IDMxLjc3IDUxLjU2MiA2MC45MzcgNjAuOTM3IDIuMDgyIDEuMDQzIDQuMTY1IDAgNC42ODgtMi4wODIuNTItLjUyMy41Mi0xLjA0My41Mi0yLjA4NnYtNy4yODljMC0xLjU2My0xLjU2My0zLjY0OC0zLjEyNi00LjY4OHptNTUuMjA3LTE2Mi41Yy0yLjA4My0xLjA0Mi00LjE2NSAwLTQuNjg4IDIuMDgzLS41Mi41MTktLjUyIDEuMDQyLS41MiAyLjA4MnY3LjI5MmMwIDIuMDgzIDEuNTYzIDQuMTY4IDMuMTI1IDUuMjA4IDQwLjYyNSAxNC41ODUgNjEuNDU4IDU5Ljg5OCA0Ni4zNTYgMTAwLTcuODEzIDIxLjg3NS0yNSAzOC41NDItNDYuMzU2IDQ2LjM1NS0yLjA4MiAxLjA0My0zLjEyNSAyLjYwNS0zLjEyNSA1LjIwN3Y3LjI5M2MwIDIuMDgyIDEuMDQzIDMuNjQ1IDMuMTI1IDQuMTY4LjUyIDAgMS41NjMgMCAyLjA4My0uNTIzIDQ5LjQ4LTE1LjYyNSA3Ni41NjItNjguMjI3IDYwLjkzNy0xMTcuNzA4LTkuMzc1LTI5LjY4Ny0zMi4yODktNTIuMDgyLTYwLjkzNy02MS40NTd6bTAgMCIvPjwvZz48L3N2Zz4=',
            units: [{ name: 'USDC', symbol: 'SUSDCOL', decimals: 18 }],
          },
      },
    });
  }
}
