import type {
  AccountsControllerState,
  AccountsControllerGetStateAction,
  AccountsControllerListMultichainAccountsAction,
  AccountsControllerSelectedAccountChangeEvent,
  AccountsControllerAccountRemovedEvent,
} from '@metamask/accounts-controller';
import type {
  RestrictedControllerMessenger,
  ControllerStateChangeEvent,
  ControllerGetStateAction,
} from '@metamask/base-controller';
import {
  type CaipAssetTypeOrId,
  isEvmAccountType,
  type KeyringAccountType,
} from '@metamask/keyring-api';
import type {
  KeyringControllerLockEvent,
  KeyringControllerUnlockEvent,
} from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { KeyringClient } from '@metamask/keyring-snap-client';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type {
  GetAllSnaps,
  HandleSnapRequest,
} from '@metamask/snaps-controllers';
import type { SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';
import type { Json, JsonRpcRequest } from '@metamask/utils';
import { Mutex } from 'async-mutex';
import type { Draft } from 'immer';
import { v4 as uuidv4 } from 'uuid';

import { MAP_SWIFT_ISO4217 } from './constant';
import type { AccountConversionRates, ConversionRatesWrapper } from './types';

/**
 * The name of the MultiChainTokensRatesController.
 */
const controllerName = 'MultiChainTokensRatesController';

/**
 * State used by the MultiChainTokensRatesController to cache token conversion rates.
 */
export type MultichainTokensRatesControllerState = ConversionRatesWrapper;

/**
 * Returns the state of the MultiChainTokensRatesController.
 */
export type MultichainTokensRatesControllerGetStateAction =
  ControllerGetStateAction<
    typeof controllerName,
    MultichainTokensRatesControllerState
  >;

/**
 * Action to update the rates of all supported tokens.
 */
export type MultichainTokensRatesControllerUpdateRatesAction = {
  type: `${typeof controllerName}:updateTokensRates`;
  handler: MultiChainTokensRatesController['updateTokensRates'];
};

/**
 * Event emitted when the state of the MultiChainTokensRatesController changes.
 */
export type MultichainTokensRatesControllerStateChange =
  ControllerStateChangeEvent<
    typeof controllerName,
    MultichainTokensRatesControllerState
  >;

/**
 * Actions exposed by the MultiChainTokensRatesController.
 */
export type MultichainTokensRatesControllerActions =
  | MultichainTokensRatesControllerGetStateAction
  | MultichainTokensRatesControllerUpdateRatesAction;

/**
 * Events emitted by MultiChainTokensRatesController.
 */
export type MultichainTokensRatesControllerEvents =
  MultichainTokensRatesControllerStateChange;

/**
 * Actions that this controller is allowed to call.
 */
export type AllowedActions =
  | GetAllSnaps
  | HandleSnapRequest
  | AccountsControllerListMultichainAccountsAction
  | AccountsControllerGetStateAction;

/**
 * Events that this controller is allowed to subscribe to.
 */
export type AllowedEvents =
  | AccountsControllerAccountRemovedEvent
  | KeyringControllerLockEvent
  | KeyringControllerUnlockEvent
  | AccountsControllerSelectedAccountChangeEvent;

/**
 * Messenger type for the MultiChainTokensRatesController.
 */
export type MultichainTokensRatesControllerMessenger =
  RestrictedControllerMessenger<
    typeof controllerName,
    MultichainTokensRatesControllerActions | AllowedActions,
    MultichainTokensRatesControllerEvents | AllowedEvents,
    AllowedActions['type'],
    AllowedEvents['type']
  >;

/**
 * The input for starting polling in MultiChainTokensRatesController.
 */
export type MultiChainRatesPollingInput = {
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
export class MultiChainTokensRatesController extends StaticIntervalPollingController<MultiChainRatesPollingInput>()<
  typeof controllerName,
  MultichainTokensRatesControllerState,
  MultichainTokensRatesControllerMessenger
> {
  readonly #mutex = new Mutex();

  #accountId: AccountsControllerState['internalAccounts']['selectedAccount'];

  #isUnlocked = true;

  /**
   * Creates an instance of MultiChainTokensRatesController.
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
    state?: Partial<MultichainTokensRatesControllerState>;
    messenger: MultichainTokensRatesControllerMessenger;
  }) {
    super({
      name: controllerName,
      messenger,
      state: {
        conversionRates: {},
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

    // Set the initial account and subscribe to account changes.
    ({
      internalAccounts: { selectedAccount: this.#accountId },
    } = this.messagingSystem.call('AccountsController:getState'));

    this.messagingSystem.subscribe(
      'AccountsController:selectedAccountChange',
      async (account) => {
        this.#accountId = account.id;
        await this.updateTokensRates(this.#accountId);
      },
    );

    this.messagingSystem.subscribe(
      'AccountsController:accountRemoved',
      (account) => this.#handleOnAccountRemoved(account),
    );
  }

  /**
   * Executes a poll by updating token conversion rates for the current account.
   *
   * @returns A promise that resolves when the polling completes.
   */
  async _executePoll(): Promise<void> {
    if (this.#accountId) {
      await this.updateTokensRates(this.#accountId);
    }
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
   * Retrieves a non-EVM account by its ID.
   *
   * @param accountId - The account ID.
   * @returns The corresponding internal account, or undefined if not found.
   */
  #getAccount(accountId: string): InternalAccount | undefined {
    return this.#listAccounts().find((account) => account.id === accountId);
  }

  /**
   * Handles the removal of an account by deleting its conversion rates.
   *
   * @param accountId - The ID of the removed account.
   */
  async #handleOnAccountRemoved(accountId: string): Promise<void> {
    if (accountId in this.state.conversionRates) {
      this.update((state: Draft<MultichainTokensRatesControllerState>) => {
        delete state.conversionRates[accountId];
      });
    }
  }

  /**
   * Updates the token conversion rates for a given account.
   *
   * This method acquires a mutex lock to ensure thread safety.
   *
   * @param accountId - The account ID for which to update rates.
   * @returns A promise that resolves when the rates have been updated.
   */
  async updateTokensRates(accountId: string): Promise<void> {
    const releaseLock = await this.#mutex.acquire();

    return (async () => {
      if (!this.isActive) {
        return;
      }

      const account = this.#getAccount(accountId);

      if (!account?.metadata.snap) {
        return;
      }

      // Retrieve assets from the assets controller.
      const assets = await this.#getAssetsList(
        accountId,
        account.metadata.snap.id as SnapId,
      );

      const accountType = account.type as KeyringAccountType;

      const conversions = assets.map((asset) => ({
        from: asset,
        to: MAP_SWIFT_ISO4217[accountType],
      }));

      const accountRates = await this.#handleSnapRequest({
        snapId: account.metadata.snap.id as SnapId,
        handler: 'onAssetsConversion' as HandlerType,
        conversions,
      });

      // Update the state with new conversion rates.
      this.update((state: Draft<MultichainTokensRatesControllerState>) => {
        state.conversionRates[accountId] = accountRates.conversionRates;
      });
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
    conversions: { from: CaipAssetTypeOrId; to: string }[];
  }): Promise<{ conversionRates: AccountConversionRates }> {
    return this.messagingSystem.call('SnapController:handleRequest', {
      snapId: snapId as SnapId,
      origin: 'metamask',
      handler,
      request: {
        id: uuidv4(),
        jsonrpc: '2.0',
        method: handler,
        params: { conversions },
      },
    }) as Promise<{ conversionRates: AccountConversionRates }>;
  }

  /**
   * Retrieves the list of assets for a given account.
   *
   * @param accountId - The account ID.
   * @param snapId - The Snap ID associated with the account.
   * @returns A promise that resolves with an array of assets.
   */
  async #getAssetsList(
    accountId: string,
    snapId: string,
  ): Promise<CaipAssetTypeOrId[]> {
    return this.#getClient(snapId).listAccountAssets(accountId);
  }

  /**
   * Returns a KeyringClient instance for the specified Snap.
   *
   * @param snapId - The Snap ID.
   * @returns A KeyringClient instance.
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
