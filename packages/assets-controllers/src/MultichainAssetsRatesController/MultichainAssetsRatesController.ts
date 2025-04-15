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
  OnAssetsConversionResponse,
  OnAssetHistoricalPriceArguments,
  OnAssetHistoricalPriceResponse,
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
  MultichainAssetsControllerState,
  MultichainAssetsControllerStateChangeEvent,
} from '../MultichainAssetsController';

/**
 * The name of the MultichainAssetsRatesController.
 */
const controllerName = 'MultichainAssetsRatesController';

/**
 * State used by the MultichainAssetsRatesController to cache token conversion rates.
 */
export type MultichainAssetsRatesControllerState = {
  conversionRates: Record<CaipAssetType, AssetConversion>;
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

/**
 * Constructs the default {@link MultichainAssetsRatesController} state. This allows
 * consumers to provide a partial state object when initializing the controller
 * and also helps in constructing complete state objects for this controller in
 * tests.
 *
 * @returns The default {@link MultichainAssetsRatesController} state.
 */
export function getDefaultMultichainAssetsRatesControllerState(): MultichainAssetsRatesControllerState {
  return { conversionRates: {} };
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
  | MultichainAssetsControllerStateChangeEvent;

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

  #accountsAssets: MultichainAssetsControllerState['accountsAssets'];

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
      async (currencyRatesState: CurrencyRateState) => {
        this.#currentCurrency = currencyRatesState.currentCurrency;
        await this.updateAssetsRates();
      },
    );

    this.messagingSystem.subscribe(
      'MultichainAssetsController:stateChange',
      async (multichainAssetsState: MultichainAssetsControllerState) => {
        this.#accountsAssets = multichainAssetsState.accountsAssets;
        await this.updateAssetsRates();
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

        // Build the conversions array
        const conversions = this.#buildConversions(assets);

        // Retrieve rates from Snap
        const accountRates: OnAssetsConversionResponse =
          (await this.#handleSnapRequest({
            snapId: account?.metadata.snap?.id as SnapId,
            handler: HandlerType.OnAssetsConversion,
            params: {
              ...conversions,
              includeMarketData: true,
            },
          })) as OnAssetsConversionResponse;

        // Flatten nested rates if needed
        const flattenedRates = this.#flattenRates(accountRates);

        // Build the updatedRates object for these assets
        const updatedRates = this.#buildUpdatedRates(assets, flattenedRates);
        // Apply these updated rates to controller state
        this.#applyUpdatedRates(updatedRates);
      }
    })().finally(() => {
      releaseLock();
    });
  }

  /**
   * Fetches historical prices for the current account
   *
   * @param asset - The asset to fetch historical prices for.
   * @returns The historical prices.
   */
  async fetchHistoricalPrices(
    asset: CaipAssetType,
  ): Promise<OnAssetHistoricalPriceResponse> {
    const selectedAccount = this.messagingSystem.call(
      'AccountsController:getSelectedMultichainAccount',
    );

    const currentCurrency =
      MAP_CAIP_CURRENCIES[this.#currentCurrency] ?? MAP_CAIP_CURRENCIES.usd;

    const historicalPrices = await this.#handleSnapRequest({
      snapId: selectedAccount?.metadata.snap?.id as SnapId,
      handler: HandlerType.OnAssetHistoricalPrice,
      params: {
        from: asset,
        to: currentCurrency,
      },
    });

    return historicalPrices as OnAssetHistoricalPriceResponse;
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
    assetsConversionResponse: OnAssetsConversionResponse,
  ): Record<CaipAssetType, AssetConversion | null> {
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
    flattenedRates: Record<CaipAssetType, AssetConversion | null>,
  ): Record<string, AssetConversion & { currency: CaipAssetType }> {
    const updatedRates: Record<
      CaipAssetType,
      AssetConversion & { currency: CaipAssetType }
    > = {};

    for (const asset of assets) {
      if (flattenedRates[asset]) {
        updatedRates[asset] = {
          ...(flattenedRates[asset] as AssetConversion),
          currency:
            MAP_CAIP_CURRENCIES[this.#currentCurrency] ??
            MAP_CAIP_CURRENCIES.usd,
        };
      }
    }
    return updatedRates;
  }

  /**
   * Merges the new rates into the controller’s state.
   *
   * @param updatedRates - The new rates to merge.
   */
  #applyUpdatedRates(
    updatedRates: Record<
      string,
      { rate: string | null; conversionTime: number | null }
    >,
  ): void {
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
    params: OnAssetsConversionArguments | OnAssetHistoricalPriceArguments;
  }): Promise<OnAssetsConversionResponse | OnAssetHistoricalPriceResponse> {
    return this.messagingSystem.call('SnapController:handleRequest', {
      snapId,
      origin: 'metamask',
      handler,
      request: {
        jsonrpc: '2.0',
        method: handler,
        params,
      },
    }) as Promise<OnAssetsConversionResponse | OnAssetHistoricalPriceResponse>;
  }
}
