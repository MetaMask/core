import type {
  AccountsControllerListMultichainAccountsAction,
  AccountsControllerAccountAddedEvent,
  AccountsControllerGetSelectedMultichainAccountAction,
} from '@metamask/accounts-controller';
import type {
  RestrictedMessenger,
  ControllerStateChangeEvent,
  ControllerGetStateAction,
} from '@metamask/base-controller';
import { type CaipAssetType, isEvmAccountType } from '@metamask/keyring-api';
import type {
  KeyringControllerLockEvent,
  KeyringControllerUnlockEvent,
} from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type { HandleSnapRequest } from '@metamask/snaps-controllers';
import type {
  SnapId,
  AssetConversion,
  OnAssetsConversionArguments,
  OnAssetHistoricalPriceArguments,
  OnAssetHistoricalPriceResponse,
  HistoricalPriceIntervals,
  OnAssetsMarketDataArguments,
  OnAssetsMarketDataResponse,
  FungibleAssetMarketData,
  OnAssetsConversionResponse,
} from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';
import { Mutex } from 'async-mutex';
import type { Draft } from 'immer';

import { MAP_CAIP_CURRENCIES } from './constant';
import type {
  CurrencyRateState,
  CurrencyRateStateChange,
  GetCurrencyRateState,
} from '../CurrencyRateController';
import type {
  MultichainAssetsControllerGetStateAction,
  MultichainAssetsControllerAccountAssetListUpdatedEvent,
  MultichainAssetsControllerState,
} from '../MultichainAssetsController';

/**
 * The name of the MultichainAssetsRatesController.
 */
const controllerName = 'MultichainAssetsRatesController';

// This is temporary until its exported from snap
type HistoricalPrice = {
  intervals: HistoricalPriceIntervals;
  // The UNIX timestamp of when the historical price was last updated.
  updateTime: number;
  // The UNIX timestamp of when the historical price will expire.
  expirationTime?: number;
};

/**
 * State used by the MultichainAssetsRatesController to cache token conversion rates.
 */
export type MultichainAssetsRatesControllerState = {
  conversionRates: Record<CaipAssetType, UnifiedAssetConversion>;
  historicalPrices: Record<CaipAssetType, Record<string, HistoricalPrice>>; // string being the current currency we fetched historical prices for
};

/**
 * Returns the state of the MultichainAssetsRatesController.
 */
export type MultichainAssetsRatesControllerGetStateAction =
  ControllerGetStateAction<
    typeof controllerName,
    MultichainAssetsRatesControllerState
  >;

/**
 * Action to update the rates of all supported tokens.
 */
export type MultichainAssetsRatesControllerUpdateRatesAction = {
  type: `${typeof controllerName}:updateAssetsRates`;
  handler: MultichainAssetsRatesController['updateAssetsRates'];
};

type UnifiedAssetConversion = AssetConversion & {
  marketData?: FungibleAssetMarketData;
};

/**
 * Constructs the default {@link MultichainAssetsRatesController} state. This allows
 * consumers to provide a partial state object when initializing the controller
 * and also helps in constructing complete state objects for this controller in
 * tests.
 *
 * @returns The default {@link MultichainAssetsRatesController} state.
 */
export function getDefaultMultichainAssetsRatesControllerState(): MultichainAssetsRatesControllerState {
  return { conversionRates: {}, historicalPrices: {} };
}

/**
 * Event emitted when the state of the MultichainAssetsRatesController changes.
 */
export type MultichainAssetsRatesControllerStateChange =
  ControllerStateChangeEvent<
    typeof controllerName,
    MultichainAssetsRatesControllerState
  >;

/**
 * Actions exposed by the MultichainAssetsRatesController.
 */
export type MultichainAssetsRatesControllerActions =
  | MultichainAssetsRatesControllerGetStateAction
  | MultichainAssetsRatesControllerUpdateRatesAction;

/**
 * Events emitted by MultichainAssetsRatesController.
 */
export type MultichainAssetsRatesControllerEvents =
  MultichainAssetsRatesControllerStateChange;

/**
 * Actions that this controller is allowed to call.
 */
export type AllowedActions =
  | HandleSnapRequest
  | AccountsControllerListMultichainAccountsAction
  | GetCurrencyRateState
  | MultichainAssetsControllerGetStateAction
  | AccountsControllerGetSelectedMultichainAccountAction;

/**
 * Events that this controller is allowed to subscribe to.
 */
export type AllowedEvents =
  | KeyringControllerLockEvent
  | KeyringControllerUnlockEvent
  | AccountsControllerAccountAddedEvent
  | CurrencyRateStateChange
  | MultichainAssetsControllerAccountAssetListUpdatedEvent;
/**
 * Messenger type for the MultichainAssetsRatesController.
 */
export type MultichainAssetsRatesControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  MultichainAssetsRatesControllerActions | AllowedActions,
  MultichainAssetsRatesControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

/**
 * The input for starting polling in MultichainAssetsRatesController.
 */
export type MultichainAssetsRatesPollingInput = {
  accountId: string;
};

const metadata = {
  conversionRates: {
    includeInStateLogs: false,
    persist: true,
    anonymous: true,
    usedInUi: true,
  },
  historicalPrices: {
    includeInStateLogs: false,
    persist: false,
    anonymous: true,
    usedInUi: true,
  },
};

export type ConversionRatesWithMarketData = {
  conversionRates: Record<
    CaipAssetType,
    Record<CaipAssetType, UnifiedAssetConversion | null>
  >;
};

/**
 * Arguments for a Snap request.
 */
type SnapRequestArgs<T> = {
  snapId: SnapId;
  handler: HandlerType;
  params: T;
};

/**
 * Controller that manages multichain token conversion rates.
 *
 * This controller polls for token conversion rates and updates its state.
 */
export class MultichainAssetsRatesController extends StaticIntervalPollingController<MultichainAssetsRatesPollingInput>()<
  typeof controllerName,
  MultichainAssetsRatesControllerState,
  MultichainAssetsRatesControllerMessenger
> {
  readonly #mutex = new Mutex();

  #currentCurrency: CurrencyRateState['currentCurrency'];

  readonly #accountsAssets: MultichainAssetsControllerState['accountsAssets'];

  #isUnlocked = true;

  /**
   * Creates an instance of MultichainAssetsRatesController.
   *
   * @param options - Constructor options.
   * @param options.interval - The polling interval in milliseconds.
   * @param options.state - The initial state.
   * @param options.messenger - A reference to the messaging system.
   */
  constructor({
    interval = 18000,
    state = {},
    messenger,
  }: {
    interval?: number;
    state?: Partial<MultichainAssetsRatesControllerState>;
    messenger: MultichainAssetsRatesControllerMessenger;
  }) {
    super({
      name: controllerName,
      messenger,
      state: {
        ...getDefaultMultichainAssetsRatesControllerState(),
        ...state,
      },
      metadata,
    });

    this.setIntervalLength(interval);

    // Subscribe to keyring lock/unlock events.
    this.messagingSystem.subscribe('KeyringController:lock', () => {
      this.#isUnlocked = false;
    });
    this.messagingSystem.subscribe('KeyringController:unlock', () => {
      this.#isUnlocked = true;
    });

    ({ accountsAssets: this.#accountsAssets } = this.messagingSystem.call(
      'MultichainAssetsController:getState',
    ));

    ({ currentCurrency: this.#currentCurrency } = this.messagingSystem.call(
      'CurrencyRateController:getState',
    ));

    this.messagingSystem.subscribe(
      'CurrencyRateController:stateChange',
      async (currentCurrency: string) => {
        this.#currentCurrency = currentCurrency;
        await this.updateAssetsRates();
      },
      (currencyRateControllerState) =>
        currencyRateControllerState.currentCurrency,
    );

    this.messagingSystem.subscribe(
      'MultichainAssetsController:accountAssetListUpdated',
      async ({ assets }) => {
        const newAccountAssets = Object.entries(assets).map(
          ([accountId, { added }]) => ({
            accountId,
            assets: [...added],
          }),
        );
        // TODO; removed can be used in future for further cleanup
        await this.#updateAssetsRatesForNewAssets(newAccountAssets);
      },
    );
  }

  /**
   * Executes a poll by updating token conversion rates for the current account.
   *
   * @returns A promise that resolves when the polling completes.
   */
  async _executePoll(): Promise<void> {
    await this.updateAssetsRates();
  }

  /**
   * Determines whether the controller is active.
   *
   * @returns True if the keyring is unlocked; otherwise, false.
   */
  get isActive(): boolean {
    return this.#isUnlocked;
  }

  /**
   * Checks if an account is a non-EVM account with a Snap.
   *
   * @param account - The account to check.
   * @returns True if the account is non-EVM and has Snap metadata; otherwise, false.
   */
  #isNonEvmAccount(account: InternalAccount): boolean {
    return (
      !isEvmAccountType(account.type) && account.metadata.snap !== undefined
    );
  }

  /**
   * Retrieves all multichain accounts from the AccountsController.
   *
   * @returns An array of internal accounts.
   */
  #listMultichainAccounts(): InternalAccount[] {
    return this.messagingSystem.call(
      'AccountsController:listMultichainAccounts',
    );
  }

  /**
   * Filters and returns non-EVM accounts that should have balances.
   *
   * @returns An array of non-EVM internal accounts.
   */
  #listAccounts(): InternalAccount[] {
    const accounts = this.#listMultichainAccounts();
    return accounts.filter((account) => this.#isNonEvmAccount(account));
  }

  /**
   * Updates token conversion rates for each non-EVM account.
   *
   * @returns A promise that resolves when the rates are updated.
   */
  async updateAssetsRates(): Promise<void> {
    const releaseLock = await this.#mutex.acquire();

    return (async () => {
      if (!this.isActive) {
        return;
      }

      // Compute the set of unique assets from all accounts. It's important to
      // deduplicate assets here to avoid duplicate requests to the Snap.
      const accounts = this.#listAccounts();
      const assetToSnapID = new Map<CaipAssetType, SnapId>();
      for (const account of accounts) {
        const snapId = account.metadata.snap?.id;
        // Assets may still be updated if they exist in another account with a
        // Snap ID.
        //
        // FIXME: Instead of using the Snap ID from the account, we should
        // select the Snap based on the supported scopes defined in the Snaps'
        // manifest.
        if (snapId === undefined) {
          continue;
        }

        for (const asset of this.#getAssetsForAccount(account.id)) {
          assetToSnapID.set(asset, snapId as SnapId);
        }
      }

      this.#applyUpdatedRates(await this.#getUpdatedRatesFor(assetToSnapID));
    })().finally(() => {
      releaseLock();
    });
  }

  /**
   * Returns the CAIP-19 asset type for the current selected currency. Defaults
   * to USD if the current selected currency is not supported.
   *
   * @returns The CAIP-19 asset type for the current selected currency.
   */
  #getCaipCurrentCurrency(): CaipAssetType {
    return (
      MAP_CAIP_CURRENCIES[this.#currentCurrency] ?? MAP_CAIP_CURRENCIES.usd
    );
  }

  /**
   * Fetches the conversion rates for the given assets from the given Snap.
   *
   * @param snapId - The ID of the Snap.
   * @param assets - The assets to fetch the conversion rates for.
   * @param currency - The currency to fetch the conversion rates for.
   * @returns A record of CAIP-19 asset types to conversion rates.
   */
  async #getConversionRates(
    snapId: SnapId,
    assets: CaipAssetType[],
    currency: CaipAssetType,
  ): Promise<Record<CaipAssetType, AssetConversion | undefined>> {
    const response = await this.#handleSnapRequest({
      snapId,
      handler: HandlerType.OnAssetsConversion,
      params: {
        conversions: assets.map((asset) => ({
          from: asset,
          to: currency,
        })),
      },
    });

    if (!response) {
      return {};
    }

    const assetToConversionRate: Record<
      CaipAssetType,
      AssetConversion | undefined
    > = {};

    for (const asset of assets) {
      assetToConversionRate[asset] =
        response.conversionRates?.[asset]?.[currency] ?? undefined;
    }

    return assetToConversionRate;
  }

  /**
   * Fetches the market data for the given assets from the given Snap.
   *
   * @param snapId - The ID of the Snap.
   * @param assets - The assets to fetch the market data for.
   * @param currency - The currency to fetch the market data for.
   * @returns A record of CAIP-19 asset types to market data.
   */
  async #getMarketData(
    snapId: SnapId,
    assets: CaipAssetType[],
    currency: CaipAssetType,
  ): Promise<Record<CaipAssetType, FungibleAssetMarketData | undefined>> {
    const response = await this.#handleSnapRequest({
      snapId,
      handler: HandlerType.OnAssetsMarketData,
      params: {
        assets: assets.map((asset) => ({
          asset,
          unit: currency,
        })),
      },
    });

    if (!response) {
      return {};
    }

    const assetToMarketData: Record<
      CaipAssetType,
      FungibleAssetMarketData | undefined
    > = {};

    for (const asset of assets) {
      assetToMarketData[asset] =
        response.marketData?.[asset]?.[currency] ?? undefined;
    }

    return assetToMarketData;
  }

  /**
   * Fetches the updated rates for the given assets from the given Snaps.
   *
   * @param assetToSnapID - A map of CAIP-19 asset types to Snap IDs.
   * @returns A record of CAIP-19 asset types to unified asset conversions.
   */
  async #getUpdatedRatesFor(
    assetToSnapID: Map<CaipAssetType, SnapId>,
  ): Promise<
    Record<CaipAssetType, UnifiedAssetConversion & { currency: CaipAssetType }>
  > {
    // Build the reverse map to list assets by Snap ID, this will be used to
    // batch requests to the Snaps.
    const snapIdToAssets = new Map<SnapId, CaipAssetType[]>();
    for (const [asset, snapId] of assetToSnapID.entries()) {
      snapIdToAssets.set(snapId, [
        ...(snapIdToAssets.get(snapId) ?? []),
        asset,
      ]);
    }

    const updatedRates: Record<
      CaipAssetType,
      UnifiedAssetConversion & { currency: CaipAssetType }
    > = {};

    // Keep a local copy to ensure that the currency is always the same for the
    // entire loop.
    const currency = this.#getCaipCurrentCurrency();

    // Note: Since the assets come from a 1-to-1 mapping with Snap IDs, we know
    // that a given asset will not appear under multiple Snap IDs.
    for (const [snapId, assets] of snapIdToAssets.entries()) {
      const rates = await this.#getConversionRates(snapId, assets, currency);
      const marketData = await this.#getMarketData(snapId, assets, currency);

      for (const asset of assets) {
        const assetRate = rates[asset];
        const assetMarketData = marketData[asset];

        // Rates are mandatory, so skip the asset if not available.
        if (!assetRate) {
          continue;
        }

        updatedRates[asset] = {
          currency,
          ...assetRate,
          ...(assetMarketData && { marketData: assetMarketData }),
        };
      }
    }

    return updatedRates;
  }

  /**
   * Fetches historical prices for the current account
   *
   * @param asset - The asset to fetch historical prices for.
   * @param account - optional account to fetch historical prices for
   * @returns The historical prices.
   */
  async fetchHistoricalPricesForAsset(
    asset: CaipAssetType,
    account?: InternalAccount,
  ): Promise<void> {
    const releaseLock = await this.#mutex.acquire();
    return (async () => {
      const currentCaipCurrency =
        MAP_CAIP_CURRENCIES[this.#currentCurrency] ?? MAP_CAIP_CURRENCIES.usd;
      // Check if we already have historical prices for this asset and currency
      const historicalPriceExpirationTime =
        this.state.historicalPrices[asset]?.[this.#currentCurrency]
          ?.expirationTime;

      const historicalPriceHasExpired =
        historicalPriceExpirationTime &&
        historicalPriceExpirationTime < Date.now();

      if (historicalPriceHasExpired === false) {
        return;
      }

      const selectedAccount =
        account ??
        this.messagingSystem.call(
          'AccountsController:getSelectedMultichainAccount',
        );
      try {
        const historicalPricesResponse = await this.messagingSystem.call(
          'SnapController:handleRequest',
          {
            snapId: selectedAccount?.metadata.snap?.id as SnapId,
            origin: 'metamask',
            handler: HandlerType.OnAssetHistoricalPrice,
            request: {
              jsonrpc: '2.0',
              method: HandlerType.OnAssetHistoricalPrice,
              params: {
                from: asset,
                to: currentCaipCurrency,
              },
            },
          },
        );

        // skip state update if no historical prices are returned
        if (!historicalPricesResponse) {
          return;
        }

        this.update((state) => {
          state.historicalPrices = {
            ...state.historicalPrices,
            [asset]: {
              ...state.historicalPrices[asset],
              [this.#currentCurrency]: (
                historicalPricesResponse as OnAssetHistoricalPriceResponse
              )?.historicalPrice,
            },
          };
        });
      } catch {
        throw new Error(
          `Failed to fetch historical prices for asset: ${asset}`,
        );
      }
    })().finally(() => {
      releaseLock();
    });
  }

  /**
   * Updates the conversion rates for new assets.
   *
   * @param accounts - The accounts to update the conversion rates for.
   * @returns A promise that resolves when the rates are updated.
   */
  async #updateAssetsRatesForNewAssets(
    accounts: {
      accountId: string;
      assets: CaipAssetType[];
    }[],
  ): Promise<void> {
    const releaseLock = await this.#mutex.acquire();

    return (async () => {
      if (!this.isActive) {
        return;
      }
      const allNewRates: Record<
        string,
        UnifiedAssetConversion & { currency: CaipAssetType }
      > = {};

      for (const { accountId, assets } of accounts) {
        const account = this.#getAccount(accountId);

        // Skip if the account has no Snap ID since we don't know which Snap to
        // use.
        //
        // FIXME: Instead of using the Snap ID from the account, we should
        // select the Snap based on the supported scopes defined in the Snaps'
        // manifest.
        const snapId = account.metadata.snap?.id;
        if (!snapId) {
          continue;
        }

        const rates = await this.#getUpdatedRatesFor(
          new Map(assets.map((asset) => [asset, snapId as SnapId])),
        );

        // Track new rates
        for (const [asset, rate] of Object.entries(rates)) {
          allNewRates[asset] = rate;
        }
      }

      this.#applyUpdatedRates(allNewRates);
    })().finally(() => {
      releaseLock();
    });
  }

  /**
   * Get a non-EVM account from its ID.
   *
   * @param accountId - The account ID.
   * @returns The non-EVM account.
   */
  #getAccount(accountId: string): InternalAccount {
    const account: InternalAccount | undefined = this.#listAccounts().find(
      (multichainAccount) => multichainAccount.id === accountId,
    );

    if (!account) {
      throw new Error(`Unknown account: ${accountId}`);
    }

    return account;
  }

  /**
   * Returns the array of CAIP-19 assets for the given account ID.
   * If none are found, returns an empty array.
   *
   * @param accountId - The account ID to get the assets for.
   * @returns An array of CAIP-19 assets.
   */
  #getAssetsForAccount(accountId: string): CaipAssetType[] {
    return this.#accountsAssets?.[accountId] ?? [];
  }

  /**
   * Merges the new rates into the controller's state.
   *
   * @param updatedRates - The new rates to merge.
   */
  #applyUpdatedRates(
    updatedRates: Record<
      CaipAssetType,
      UnifiedAssetConversion & { currency: CaipAssetType }
    >,
  ): void {
    if (Object.keys(updatedRates).length === 0) {
      return;
    }
    this.update((state: Draft<MultichainAssetsRatesControllerState>) => {
      state.conversionRates = {
        ...state.conversionRates,
        ...updatedRates,
      };
    });
  }

  /**
   * Forwards a Snap request to the SnapController.
   *
   * @param args - The request parameters.
   * @param args.snapId - The ID of the Snap.
   * @param args.handler - The handler type.
   * @param args.params - The asset conversions.
   * @returns A promise that resolves with the account rates.
   */
  async #handleSnapRequest(
    args: SnapRequestArgs<OnAssetsConversionArguments>,
  ): Promise<OnAssetsConversionResponse | undefined>;

  async #handleSnapRequest(
    args: SnapRequestArgs<OnAssetHistoricalPriceArguments>,
  ): Promise<OnAssetHistoricalPriceResponse | undefined>;

  async #handleSnapRequest(
    args: SnapRequestArgs<OnAssetsMarketDataArguments>,
  ): Promise<OnAssetsMarketDataResponse | undefined>;

  async #handleSnapRequest(args: SnapRequestArgs<unknown>): Promise<unknown> {
    const { snapId, handler, params } = args;
    try {
      return await this.messagingSystem.call('SnapController:handleRequest', {
        snapId,
        origin: 'metamask',
        handler,
        request: {
          jsonrpc: '2.0',
          method: handler,
          params,
        },
      });
    } catch (error) {
      console.error(`Snap request failed for ${handler}:`, {
        snapId,
        handler,
        message: (error as Error).message,
        params,
      });
      return undefined;
    }
  }
}
