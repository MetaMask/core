import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { EntropySourceId } from '@metamask/keyring-api';
import type { KeyringControllerGetStateAction } from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';

import type { MoneyAccountControllerMethodActions } from './money-account-controller-method-action-types';
import type { MoneyAccount } from './types';

export const controllerName = 'MoneyAccountController';

export type MoneyAccountControllerState = {
  moneyAccounts: {
    [id: MoneyAccount['id']]: MoneyAccount;
  };
};

const moneyAccountControllerMetadata = {
  moneyAccounts: {
    includeInDebugSnapshot: false,
    includeInStateLogs: true,
    persist: true,
    usedInUi: true,
  },
} satisfies StateMetadata<MoneyAccountControllerState>;

export function getDefaultMoneyAccountControllerState(): MoneyAccountControllerState {
  return {
    moneyAccounts: {},
  };
}

const MESSENGER_EXPOSED_METHODS = ['getMoneyAccount'] as const;

export type MoneyAccountControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  MoneyAccountControllerState
>;

export type MoneyAccountControllerActions =
  | MoneyAccountControllerGetStateAction
  | MoneyAccountControllerMethodActions;

type AllowedActions = KeyringControllerGetStateAction;

export type MoneyAccountControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  MoneyAccountControllerState
>;

export type MoneyAccountControllerEvents =
  MoneyAccountControllerStateChangeEvent;

type AllowedEvents = never;

export type MoneyAccountControllerMessenger = Messenger<
  typeof controllerName,
  MoneyAccountControllerActions | AllowedActions,
  MoneyAccountControllerEvents | AllowedEvents
>;

// === CONTROLLER DEFINITION ===

export class MoneyAccountController extends BaseController<
  typeof controllerName,
  MoneyAccountControllerState,
  MoneyAccountControllerMessenger
> {
  /**
   * Constructor for the MoneyAccountController.
   *
   * @param options - The options for constructing the controller.
   * @param options.messenger - The messenger to use for inter-controller communication.
   * @param options.state - The initial state of the controller. If not provided, the default state will be used.
   */
  constructor({
    messenger,
    state,
  }: {
    messenger: MoneyAccountControllerMessenger;
    state?: Partial<MoneyAccountControllerState>;
  }) {
    super({
      messenger,
      metadata: moneyAccountControllerMetadata,
      name: controllerName,
      state: {
        ...getDefaultMoneyAccountControllerState(),
        ...state,
      },
    });

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Initializes the controller.
   */
  async init(): Promise<void> {
    // TODO: implement
  }

  /**
   * Gets a money account by its associated entropy source ID. If no ID is
   * provided, the primary entropy source will be used.
   *
   * @param selector Selector options for getting the money account.
   * @param selector.entropySource - The entropy source ID to get the money account for. If not provided, the primary entropy source will be used.
   * @returns The money account, or `undefined` if no account exists for the given entropy source.
   */
  getMoneyAccount(
    selector: { entropySource?: EntropySourceId } = {},
  ): MoneyAccount | undefined {
    const entropySource =
      selector.entropySource ?? this.#getPrimaryEntropySource();
    if (entropySource === undefined) {
      return undefined;
    }

    // We should never have more than one money account per entropy source, but if we
    // do, just return the first one we find.
    return Object.values(this.state.moneyAccounts).find(
      (account) => account.options.entropy.id === entropySource,
    );
  }

  /**
   * Gets the primary entropy source ID.
   *
   * @returns The primary entropy source ID, or `undefined` if no HD keyring exists.
   */
  #getPrimaryEntropySource(): EntropySourceId | undefined {
    const { keyrings } = this.messenger.call('KeyringController:getState');
    const primaryHdKeyring = keyrings.find(
      (keyring) => keyring.type === 'HD Key Tree',
    );
    return primaryHdKeyring?.metadata.id;
  }
}
