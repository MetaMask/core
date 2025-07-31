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
import { cloneDeep } from 'lodash';

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
  conversionRates: { persist: true, anonymous: true },
  historicalPrices: { persist: false, anonymous: true },
};

export type ConversionRatesWithMarketData = {
  conversionRates: Record<
    CaipAssetType,
    Record<CaipAssetType, UnifiedAssetConversion | null>
  >;
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
      (state) => state.currentCurrency,
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
      const accounts = this.#listAccounts();

      for (const account of accounts) {
        const assets = this.#getAssetsForAccount(account.id);

        if (assets?.length === 0) {
          continue;
        }

        const rates = await this.#getUpdatedRatesFor(account, assets);
        // Apply these updated rates to controller state
        this.#applyUpdatedRates(rates);
      }
    })().finally(() => {
      releaseLock();
    });
  }

  async #getUpdatedRatesFor(
    account: InternalAccount,
    assets: CaipAssetType[],
  ): Promise<
    Record<string, UnifiedAssetConversion & { currency: CaipAssetType }>
  > {
    // Build the conversions array
    const conversions = this.#buildConversions(assets);

    // Retrieve rates from Snap
    const accountRatesResponse = (await this.#handleSnapRequest({
      snapId: account?.metadata.snap?.id as SnapId,
      handler: HandlerType.OnAssetsConversion,
      params: conversions,
    })) as OnAssetsConversionResponse | null;

    // If the snap request failed, return empty rates
    if (!accountRatesResponse) {
      return {};
    }

    // Prepare assets param for onAssetsMarketData
    const currentCurrencyCaip =
      MAP_CAIP_CURRENCIES[this.#currentCurrency] ?? MAP_CAIP_CURRENCIES.usd;
    const assetsParam = {
      assets: assets.map((asset) => ({ asset, unit: currentCurrencyCaip })),
    };

    // Retrieve Market Data from Snap
    const marketDataResponse = (await this.#handleSnapRequest({
      snapId: account?.metadata.snap?.id as SnapId,
      handler: HandlerType.OnAssetsMarketData,
      params: assetsParam as OnAssetsMarketDataArguments,
    })) as OnAssetsMarketDataResponse | null;

    // Merge market data into conversion rates if available
    const mergedRates = this.#mergeMarketDataIntoConversionRates(
      accountRatesResponse,
      marketDataResponse,
    );

    // Flatten nested rates if needed
    const flattenedRates = this.#flattenRates(mergedRates);

    // Build the updatedRates object for these assets
    const updatedRates = this.#buildUpdatedRates(assets, flattenedRates);

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

        const rates = await this.#getUpdatedRatesFor(account, assets);
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
   * Builds a conversions array (from each asset → the current currency).
   *
   * @param assets - The assets to build the conversions for.
   * @returns A conversions array.
   */
  #buildConversions(assets: CaipAssetType[]): OnAssetsConversionArguments {
    const currency =
      MAP_CAIP_CURRENCIES[this.#currentCurrency] ?? MAP_CAIP_CURRENCIES.usd;
    return {
      conversions: assets.map((asset) => ({
        from: asset,
        to: currency,
      })),
    };
  }

  /**
   * Flattens any nested structure in the conversion rates returned by Snap.
   *
   * @param assetsConversionResponse - The conversion rates to flatten.
   * @returns A flattened rates object.
   */
  #flattenRates(
    assetsConversionResponse: ConversionRatesWithMarketData | null,
  ): Record<CaipAssetType, UnifiedAssetConversion | null> {
    if (!assetsConversionResponse?.conversionRates) {
      return {};
    }

    const { conversionRates } = assetsConversionResponse;

    return Object.fromEntries(
      Object.entries(conversionRates).map(([asset, nestedObj]) => {
        // e.g., nestedObj might look like: { "swift:0/iso4217:EUR": { rate, conversionTime } }
        const singleValue = Object.values(nestedObj)[0];
        return [asset, singleValue];
      }),
    );
  }

  /**
   * Builds a rates object that covers all given assets, ensuring that
   * any asset not returned by Snap is set to null for both `rate` and `conversionTime`.
   *
   * @param assets - The assets to build the rates for.
   * @param flattenedRates - The rates to merge.
   * @returns A rates object that covers all given assets.
   */
  #buildUpdatedRates(
    assets: CaipAssetType[],
    flattenedRates: Record<CaipAssetType, UnifiedAssetConversion | null>,
  ): Record<string, UnifiedAssetConversion & { currency: CaipAssetType }> {
    const updatedRates: Record<
      CaipAssetType,
      UnifiedAssetConversion & { currency: CaipAssetType }
    > = {};

    for (const asset of assets) {
      if (flattenedRates[asset]) {
        updatedRates[asset] = {
          ...(flattenedRates[asset] as UnifiedAssetConversion),
          currency:
            MAP_CAIP_CURRENCIES[this.#currentCurrency] ??
            MAP_CAIP_CURRENCIES.usd,
        };
      }
    }
    return updatedRates;
  }

  /**
   * Merges the new rates into the controller's state.
   *
   * @param updatedRates - The new rates to merge.
   */
  #applyUpdatedRates(
    updatedRates: Record<
      string,
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
  async #handleSnapRequest({
    snapId,
    handler,
    params,
  }: {
    snapId: SnapId;
    handler: HandlerType;
    params:
      | OnAssetsConversionArguments
      | OnAssetHistoricalPriceArguments
      | OnAssetsMarketDataArguments;
  }): Promise<
    | OnAssetsConversionResponse
    | OnAssetHistoricalPriceResponse
    | OnAssetsMarketDataResponse
    | undefined
  > {
    try {
      return (await this.messagingSystem.call('SnapController:handleRequest', {
        snapId,
        origin: 'metamask',
        handler,
        request: {
          jsonrpc: '2.0',
          method: handler,
          params,
        },
      })) as
        | OnAssetsConversionResponse
        | OnAssetHistoricalPriceResponse
        | OnAssetsMarketDataResponse
        | undefined;
    } catch (error) {
      console.error(`Snap request failed for ${handler}:`, {
        snapId,
        handler,
        message: (error as Error).message,
        params,
      });
      // Ignore
      return undefined;
    }
  }

  #mergeMarketDataIntoConversionRates(
    accountRatesResponse: OnAssetsConversionResponse,
    marketDataResponse: OnAssetsMarketDataResponse | null,
  ): ConversionRatesWithMarketData {
    // Early return if no market data to merge
    if (!marketDataResponse?.marketData) {
      return accountRatesResponse;
    }

    const result: ConversionRatesWithMarketData =
      cloneDeep(accountRatesResponse);
    const { conversionRates } = result;
    const { marketData } = marketDataResponse;

    // Iterate through each asset in market data
    for (const [assetId, currencyData] of Object.entries(marketData)) {
      const typedAssetId = assetId as CaipAssetType;

      // Iterate through each currency for this asset
      for (const [currency, marketDataForCurrency] of Object.entries(
        currencyData,
      )) {
        const typedCurrency = currency as CaipAssetType;

        // Check if this currency exists in conversion rates for this asset
        const existingRate = conversionRates[typedAssetId][typedCurrency];
        if (!existingRate) {
          continue;
        }

        // Merge market data into the existing conversion rate
        conversionRates[typedAssetId][typedCurrency] = {
          ...existingRate,
          marketData: marketDataForCurrency ?? undefined,
        };
      }
    }

    return result;
  }
}
