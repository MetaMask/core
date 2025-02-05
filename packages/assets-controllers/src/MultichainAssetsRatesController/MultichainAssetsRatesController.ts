import type {
  AccountsControllerListMultichainAccountsAction,
  AccountsControllerAccountAddedEvent,
} from '@metamask/accounts-controller';
import type {
  RestrictedControllerMessenger,
  ControllerStateChangeEvent,
  ControllerGetStateAction,
} from '@metamask/base-controller';
import {
  type CaipAssetTypeOrId,
  isEvmAccountType,
} from '@metamask/keyring-api';
import type {
  KeyringControllerLockEvent,
  KeyringControllerUnlockEvent,
} from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type { HandleSnapRequest } from '@metamask/snaps-controllers';
import type { SnapId } from '@metamask/snaps-sdk';
import type { HandlerType } from '@metamask/snaps-utils';
import { Mutex } from 'async-mutex';
import type { Draft } from 'immer';

import { MAP_CAIP_CURRENCIES, MOCKED_ASSETS_DATA } from './constant';
import type { AccountConversionRates, ConversionRatesWrapper } from './types';
import type {
  CurrencyRateState,
  CurrencyRateStateChange,
  GetCurrencyRateState,
} from '../CurrencyRateController';

/**
 * The name of the MultiChainAssetsRatesController.
 */
const controllerName = 'MultiChainAssetsRatesController';

/**
 * State used by the MultiChainAssetsRatesController to cache token conversion rates.
 */
export type MultichainAssetsRatesControllerState = ConversionRatesWrapper;

/**
 * Returns the state of the MultiChainAssetsRatesController.
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
  handler: MultiChainAssetsRatesController['updateAssetsRates'];
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
 * Event emitted when the state of the MultiChainAssetsRatesController changes.
 */
export type MultichainAssetsRatesControllerStateChange =
  ControllerStateChangeEvent<
    typeof controllerName,
    MultichainAssetsRatesControllerState
  >;

/**
 * Actions exposed by the MultiChainAssetsRatesController.
 */
export type MultichainAssetsRatesControllerActions =
  | MultichainAssetsRatesControllerGetStateAction
  | MultichainAssetsRatesControllerUpdateRatesAction;

/**
 * Events emitted by MultiChainAssetsRatesController.
 */
export type MultichainAssetsRatesControllerEvents =
  MultichainAssetsRatesControllerStateChange;

/**
 * Actions that this controller is allowed to call.
 */
export type AllowedActions =
  | HandleSnapRequest
  | AccountsControllerListMultichainAccountsAction
  | GetCurrencyRateState;

/**
 * Events that this controller is allowed to subscribe to.
 */
export type AllowedEvents =
  | KeyringControllerLockEvent
  | KeyringControllerUnlockEvent
  | AccountsControllerAccountAddedEvent
  | CurrencyRateStateChange;

/**
 * Messenger type for the MultiChainAssetsRatesController.
 */
export type MultichainAssetsRatesControllerMessenger =
  RestrictedControllerMessenger<
    typeof controllerName,
    MultichainAssetsRatesControllerActions | AllowedActions,
    MultichainAssetsRatesControllerEvents | AllowedEvents,
    AllowedActions['type'],
    AllowedEvents['type']
  >;

/**
 * The input for starting polling in MultiChainAssetsRatesController.
 */
export type MultiChainAssetsRatesPollingInput = {
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
export class MultiChainAssetsRatesController extends StaticIntervalPollingController<MultiChainAssetsRatesPollingInput>()<
  typeof controllerName,
  MultichainAssetsRatesControllerState,
  MultichainAssetsRatesControllerMessenger
> {
  readonly #mutex = new Mutex();

  #currentCurrency: CurrencyRateState['currentCurrency'];

  #isUnlocked = true;

  /**
   * Creates an instance of MultiChainAssetsRatesController.
   *
   * @param options - Constructor options.
   * @param options.interval - The polling interval in milliseconds.
   * @param options.state - The initial state.
   * @param options.messenger - A reference to the messaging system.
   */
  constructor({
    interval = 18000,
    state,
    messenger,
  }: {
    interval?: number;
    state?: Partial<MultichainAssetsRatesControllerState>;
    messenger: MultichainAssetsRatesControllerMessenger;
  }) {
    super({
      name: controllerName,
      messenger,
      state: getDefaultMultichainAssetsRatesControllerState(),
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

    this.messagingSystem.subscribe(
      'AccountsController:accountAdded',
      (account) => this.#handleOnAccountAdded(account),
    );

    ({ currentCurrency: this.#currentCurrency } = this.messagingSystem.call(
      'CurrencyRateController:getState',
    ));

    this.messagingSystem.subscribe(
      'CurrencyRateController:stateChange',
      async (currencyRatesState) => {
        this.#currentCurrency = currencyRatesState.currentCurrency;
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
   * Handles the addition of an account by updating its token conversion rates.
   *
   * @param account - The added account.
   */
  async #handleOnAccountAdded(account: InternalAccount): Promise<void> {
    if (this.#isNonEvmAccount(account)) {
      await this.updateAssetsRates();
    }
  }

  /**
   * Updates the token conversion rates for a given account.
   *
   * This method acquires a mutex lock to ensure thread safety.
   *
   * @returns A promise that resolves when the rates have been updated.
   */
  async updateAssetsRates(): Promise<void> {
    const releaseLock = await this.#mutex.acquire();

    return (async () => {
      if (!this.isActive) {
        return;
      }

      const listAccounts = this.#listAccounts();

      for (const account of listAccounts) {
        if (!account?.metadata.snap) {
          continue;
        }

        // Retrieve assets from the assets controller.
        const assets = MOCKED_ASSETS_DATA;

        const conversions = assets.map((asset) => ({
          from: asset,
          to: MAP_CAIP_CURRENCIES?.[this.#currentCurrency],
        }));

        const accountRates = await this.#handleSnapRequest({
          snapId: account.metadata.snap.id as SnapId,
          handler: 'onAssetsConversion' as HandlerType,
          conversions,
        });

        // 1. Flatten the returned rates if there’s an extra currency layer.
        //    (If your handleSnapRequest output is already flattened, skip this.)
        const flattenedRates = Object.fromEntries(
          Object.entries(accountRates.conversionRates).map(
            ([asset, nestedObj]) => {
              // e.g., nestedObj might look like: { "swift:0/iso4217:EUR": { rate, conversionTime } }
              const singleValue = Object.values(nestedObj)[0];
              return [asset, singleValue];
            },
          ),
        );

        // 2. Construct a complete object that has entries for *all* assets.
        const updatedRates: Record<
          string,
          { rate: string | null; conversionTime: number | null }
        > = {};
        for (const asset of MOCKED_ASSETS_DATA) {
          // If the request returned data for this asset, use it.
          if (flattenedRates[asset]) {
            updatedRates[asset] = flattenedRates[asset];
          } else {
            // Otherwise, explicitly set `rate: null` (and/or `conversionTime: null`).
            updatedRates[asset] = { rate: null, conversionTime: null };
          }
        }

        // Update the state with new conversion rates.
        this.update((state: Draft<MultichainAssetsRatesControllerState>) => {
          state.conversionRates = {
            ...state.conversionRates,
            ...updatedRates,
          };
        });
      }
    })().finally(() => {
      releaseLock();
    });
  }

  /**
   * Forwards a Snap request to the SnapController.
   *
   * @param args - The request parameters.
   * @param args.snapId - The ID of the Snap.
   * @param args.handler - The handler type.
   * @param args.conversions - The asset conversions.
   * @returns A promise that resolves with the account rates.
   */
  async #handleSnapRequest({
    snapId,
    handler,
    conversions,
  }: {
    snapId: SnapId;
    handler: HandlerType;
    conversions: { from: CaipAssetTypeOrId; to?: string }[];
  }): Promise<{ conversionRates: AccountConversionRates }> {
    return this.messagingSystem.call('SnapController:handleRequest', {
      snapId,
      origin: 'metamask',
      handler,
      request: {
        jsonrpc: '2.0',
        method: handler,
        params: { conversions },
      },
    }) as Promise<{ conversionRates: AccountConversionRates }>;
  }
}
