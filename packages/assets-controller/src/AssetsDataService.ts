import { BaseDataService } from '@metamask/base-data-service';
import type {
  DataServiceActions,
  DataServiceEvents,
} from '@metamask/base-data-service';
import { Messenger } from '@metamask/messenger';

import type {
  AccountId,
  Asset,
  AssetType,
  Caip19AssetId,
  ChainId,
  DataType,
} from './types.js';

/**
 * The name of the {@link AssetsDataService}, used to namespace its actions
 * and cache events.
 */
export const serviceName = 'AssetsDataService';

const assetsDataServiceMessengerKey = Symbol.for(
  'metamask.AssetsDataServiceMessenger',
);

/**
 * Options that identify one `syncAssets` call. The UI query key is this
 * object, so a watcher must pass the same fields the background fetch used.
 */
export type AssetsFetchOptions = {
  chainIds?: ChainId[];
  assetTypes?: AssetType[];
  bypassServerCache?: boolean;
  dataTypes?: DataType[];
  assetsForPriceUpdate?: Caip19AssetId[];
};

export type AssetsByAccount = Record<AccountId, Record<Caip19AssetId, Asset>>;

/**
 * Load assets for a query key. `AssetsController` supplies this so the query
 * calls `AssetsController.getAssets` directly.
 *
 * @param accountIds - Account ids from the query key.
 * @param options - Fetch options.
 * @returns Assets grouped by account id.
 */
export type LoadAssets = (
  accountIds: string[],
  options: AssetsFetchOptions,
) => Promise<AssetsByAccount>;

export type AssetsDataServiceSyncAssetsAction = {
  type: `${typeof serviceName}:syncAssets`;
  handler: AssetsDataService['syncAssets'];
};

export type AssetsDataServiceActions =
  | AssetsDataServiceSyncAssetsAction
  | DataServiceActions<typeof serviceName>;

export type AssetsDataServiceEvents = DataServiceEvents<typeof serviceName>;

export type AssetsDataServiceMessenger = Messenger<
  typeof serviceName,
  AssetsDataServiceActions,
  AssetsDataServiceEvents
>;

/**
 * Sort string lists so equivalent fetches share one query hash.
 *
 * @param values - The list to sort.
 * @returns A sorted copy, or undefined when the list was omitted.
 */
function sorted(values: readonly string[] | undefined): string[] | undefined {
  if (!values) {
    return undefined;
  }

  return [...values].sort();
}

/**
 * Drop omitted fields and sort list fields so the query key is stable.
 *
 * @param options - The fetch options.
 * @returns Options safe to put in a query key.
 */
export function normalizeAssetsFetchOptions(
  options: AssetsFetchOptions = {},
): AssetsFetchOptions {
  const normalized: AssetsFetchOptions = {};
  const chainIds = sorted(options.chainIds);
  const assetTypes = sorted(options.assetTypes);
  const dataTypes = sorted(options.dataTypes);
  const assetsForPriceUpdate = sorted(options.assetsForPriceUpdate);

  if (chainIds) {
    normalized.chainIds = chainIds as ChainId[];
  }
  if (assetTypes) {
    normalized.assetTypes = assetTypes as AssetType[];
  }
  if (dataTypes) {
    normalized.dataTypes = dataTypes as DataType[];
  }
  if (assetsForPriceUpdate) {
    normalized.assetsForPriceUpdate = assetsForPriceUpdate as Caip19AssetId[];
  }
  if (options.bypassServerCache) {
    normalized.bypassServerCache = true;
  }

  return normalized;
}

/**
 * Query key for a `syncAssets` call. Background syncs and UI observers must use
 * this so they share one cache entry.
 *
 * @param accountIds - Accounts included in the fetch.
 * @param options - Fetch options. List fields are sorted.
 * @returns The TanStack query key.
 */
export function getSyncAssetsQueryKey(
  accountIds: readonly string[],
  options: AssetsFetchOptions = {},
): [`${typeof serviceName}:syncAssets`, string[], AssetsFetchOptions] {
  return [
    `${serviceName}:syncAssets`,
    [...accountIds].sort(),
    normalizeAssetsFetchOptions(options),
  ];
}

/**
 * Remember the service messenger on the controller messenger that owns it.
 *
 * The UI query client subscribes on the root messenger. The service messenger's
 * parent must be that root, which the controller messenger does not expose.
 * Callers that create both messengers attach the service messenger here so
 * `AssetsController` can construct the service against it.
 *
 * @param controllerMessenger - The AssetsController messenger.
 * @param serviceMessenger - The messenger `AssetsDataService` will use.
 */
export function attachAssetsDataServiceMessenger(
  controllerMessenger: object,
  serviceMessenger: AssetsDataServiceMessenger,
): void {
  Object.defineProperty(controllerMessenger, assetsDataServiceMessengerKey, {
    configurable: true,
    value: serviceMessenger,
  });
}

/**
 * Read the service messenger attached by {@link attachAssetsDataServiceMessenger}.
 *
 * @param controllerMessenger - The AssetsController messenger.
 * @returns The attached messenger, when one was linked.
 */
export function readAssetsDataServiceMessenger(
  controllerMessenger: object,
): AssetsDataServiceMessenger | undefined {
  return (controllerMessenger as Record<symbol, AssetsDataServiceMessenger>)[
    assetsDataServiceMessengerKey
  ];
}

/**
 * Create the service messenger on the root messenger and attach it to the
 * controller messenger.
 *
 * Cache events bubble to `rootMessenger`, which is what the UI query client
 * subscribes to. The query calls `AssetsController.getAssets` directly.
 *
 * @param rootMessenger - The root messenger.
 * @param controllerMessenger - The AssetsController messenger to attach to.
 * @returns The service messenger.
 */
export function linkAssetsDataServiceToController(
  rootMessenger: Messenger<
    string,
    AssetsDataServiceActions,
    AssetsDataServiceEvents
  >,
  controllerMessenger: object,
): AssetsDataServiceMessenger {
  const serviceMessenger: AssetsDataServiceMessenger = new Messenger({
    namespace: serviceName,
    parent: rootMessenger,
  });

  attachAssetsDataServiceMessenger(controllerMessenger, serviceMessenger);

  return serviceMessenger;
}

/**
 * TanStack query owned by `AssetsController`.
 *
 * Fetches run through `fetchQuery`, so `fetchStatus` is published on
 * `AssetsDataService:cacheUpdated`. The query function is
 * `AssetsController.getAssets` with `forceUpdate`.
 */
export class AssetsDataService extends BaseDataService<
  typeof serviceName,
  AssetsDataServiceMessenger
> {
  readonly #loadAssets: LoadAssets;

  constructor({
    messenger,
    loadAssets,
  }: {
    messenger: AssetsDataServiceMessenger;
    loadAssets: LoadAssets;
  }) {
    super({
      name: serviceName,
      messenger,
    });

    this.#loadAssets = loadAssets;
    this.messenger.registerActionHandler(
      `${serviceName}:syncAssets`,
      (accountIds: string[], options?: AssetsFetchOptions) =>
        this.syncAssets(accountIds, options),
    );
  }

  /**
   * Sync assets for the given accounts.
   *
   * `staleTime` is 0 so the query enters `fetching` instead of returning a
   * fresh cache hit. `loadAssets` overrides the controller callback for this
   * call, so a background fetch can pass the accounts it already holds.
   *
   * @param accountIds - Account ids to fetch.
   * @param options - Fetch options forwarded to `AssetsController.getAssets`.
   * @param loadAssets - Loader for this call. Defaults to the controller callback.
   * @returns Assets grouped by account id.
   */
  async syncAssets(
    accountIds: string[],
    options: AssetsFetchOptions = {},
    loadAssets: LoadAssets = this.#loadAssets,
  ): Promise<AssetsByAccount> {
    const queryKey = getSyncAssetsQueryKey(accountIds, options);
    const [, normalizedAccountIds, normalizedOptions] = queryKey;

    return this.fetchQuery({
      queryKey: [...queryKey],
      staleTime: 0,
      queryFn: () => loadAssets(normalizedAccountIds, normalizedOptions),
    });
  }
}
