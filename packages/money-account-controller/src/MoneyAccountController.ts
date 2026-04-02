import { getUUIDFromAddressOfNormalAccount } from '@metamask/accounts-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type {
  MoneyKeyring,
  MoneyKeyringSerializedState,
} from '@metamask/eth-money-keyring';
import { MONEY_DERIVATION_PATH } from '@metamask/eth-money-keyring';
import { EthAccountType, EthMethod, EthScope } from '@metamask/keyring-api';
import type { EntropySourceId } from '@metamask/keyring-api';
import type {
  KeyringControllerAddNewKeyringAction,
  KeyringControllerGetStateAction,
  KeyringControllerWithKeyringAction,
  KeyringMetadata,
} from '@metamask/keyring-controller';
import {
  isKeyringNotFoundError,
  KeyringTypes,
} from '@metamask/keyring-controller';
import { EthKeyring } from '@metamask/keyring-utils';
import type { Messenger } from '@metamask/messenger';
import { Hex } from '@metamask/utils';

import { projectLogger as log } from './logger';
import type { MoneyAccountControllerMethodActions } from './money-account-controller-method-action-types';
import type { MoneyAccount } from './types';
import { isMoneyKeyring } from './utils';

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

const MESSENGER_EXPOSED_METHODS = [
  'createMoneyAccount',
  'getMoneyAccount',
  'clearState',
] as const;

export type MoneyAccountControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  MoneyAccountControllerState
>;

export type MoneyAccountControllerActions =
  | MoneyAccountControllerGetStateAction
  | MoneyAccountControllerMethodActions;

type AllowedActions =
  | KeyringControllerGetStateAction
  | KeyringControllerAddNewKeyringAction
  | KeyringControllerWithKeyringAction;

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

/**
 * Controller for managing money accounts.
 */
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
   * Initializes the controller by creating a money account for the primary
   * entropy source if one does not already exist.
   */
  async init(): Promise<void> {
    this.#assertIsUnlocked();

    const primaryEntropySource = this.#getPrimaryEntropySource();
    if (primaryEntropySource) {
      const { id, address } =
        await this.createMoneyAccount(primaryEntropySource);
      log(
        `Money keyring (entropy:${primaryEntropySource} - primary) account is: ${address} (${id})`,
      );
    }
  }

  /**
   * Creates a money account for the given entropy source. If an account
   * already exists for that entropy source, it is returned as-is (idempotent).
   *
   * @param entropySource - The entropy source ID to create the money account for.
   * @returns The money account.
   */
  async createMoneyAccount(
    entropySource: EntropySourceId,
  ): Promise<MoneyAccount> {
    this.#assertIsUnlocked();

    // Idempotent: return existing account if already in state.
    const existingAccount = this.getMoneyAccount({ entropySource });
    if (existingAccount) {
      return existingAccount;
    }

    // Try to find an existing `MoneyKeyring` for this entropy source and get its address.
    // If no such keyring exists, create one and add an account to get the address.
    let address: Hex;
    try {
      address = await this.#getOrCreateMoneyAccountFromKeyring(entropySource);
    } catch (error) {
      // Forward any unexpected errors, but if the error is that
      // the keyring wasn't found, we'll create it below.
      if (!isKeyringNotFoundError(error)) {
        throw error;
      }

      log(
        `Money keyring (entropy:${entropySource}) not found, creating one...`,
      );
      // Create the keyring right away by providing a `numberOfAccounts` of 1, which will create
      // the first account and allow us to get the address without having to use `withKeyring` again.
      await this.#createMoneyKeyring(entropySource);

      // Now we can get the address from the newly created keyring.
      address = await this.#getOrCreateMoneyAccountFromKeyring(entropySource);
    }

    const account: MoneyAccount = {
      // This is an EVM account, so let's re-use the deterministic ID generation logic of
      // EVM accounts.
      id: getUUIDFromAddressOfNormalAccount(address),
      type: EthAccountType.Eoa,
      address,
      scopes: [EthScope.Eoa],
      options: {
        entropy: {
          type: 'mnemonic',
          id: entropySource,
          groupIndex: 0,
          derivationPath: MONEY_DERIVATION_PATH,
        },
        exportable: false,
      },
      methods: [
        EthMethod.SignTransaction,
        EthMethod.PersonalSign,
        EthMethod.Sign,
        EthMethod.SignTypedDataV1,
        EthMethod.SignTypedDataV3,
        EthMethod.SignTypedDataV4,
      ],
    };

    // Store the account in state.
    this.update((state) => {
      state.moneyAccounts[account.id] = account;
    });

    log(
      `Money keyring (entropy:${account.options.entropy.id}) account created: ${account.address} (${account.id})`,
    );
    return account;
  }

  /**
   * Gets a money account by its associated entropy source ID. If no ID is
   * provided, the primary entropy source will be used.
   *
   * @param selector - Selector options for getting the money account.
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
   * Resets the controller state to its default, removing all money accounts.
   *
   * Intended for use during a full app reset (e.g. when the user wipes all
   * wallet data). Does not interact with the keyring — the caller is
   * responsible for ensuring the associated keyring state is also cleared.
   */
  clearState(): void {
    this.update((state) => {
      state.moneyAccounts = {};
    });
  }

  /**
   * Gets or creates a money account with its associated entropy source ID. It relies on
   * the `MoneyKeyring` keyring instance to get the address, so if no account exists
   * on the keyring yet, it will be created and then the address will be returned.
   *
   * @param entropySource - The entropy source ID to get the money account address for.
   * @returns The money account address.
   */
  async #getOrCreateMoneyAccountFromKeyring(
    entropySource: EntropySourceId,
  ): Promise<Hex> {
    // Filter to find a specific `MoneyKeyring` for the given entropy source.
    const isMoneyKeyringForEntropySource = (
      keyring: EthKeyring,
    ): keyring is MoneyKeyring =>
      isMoneyKeyring(keyring) && keyring.entropySource === entropySource;

    const result = await this.messenger.call(
      'KeyringController:withKeyring',
      {
        filter: isMoneyKeyringForEntropySource,
      },
      async ({ keyring }) => {
        // We're adding this logic to be defensive against the possibility of a money keyring
        // existing without any accounts, which shouldn't normally happen but we want to be
        // sure we can handle it if it does.
        // If there are no accounts, we'll add one and then get the address.
        const accounts = await keyring.getAccounts();
        if (accounts.length === 0) {
          log(
            `Money keyring (entropy:${entropySource}) has no accounts, creating one...`,
          );
          await keyring.addAccounts(1);
        }

        // We have the guarantee that there is at least one account after the above code, so
        // we can safely destructure the first address.
        const [moneyAddress] = await keyring.getAccounts();
        return moneyAddress;
      },
    );

    return result as Hex;
  }

  /**
   * Adds a new money keyring for the given entropy source and returns its metadata.
   *
   * NOTE: This function won't check if a money keyring for the given entropy source already
   * exists!
   *
   * @param entropySource - The entropy source ID to create the money keyring for.
   * @returns The metadata of the newly created money keyring.
   */
  #createMoneyKeyring(
    entropySource: EntropySourceId,
  ): Promise<KeyringMetadata> {
    return this.messenger.call(
      'KeyringController:addNewKeyring',
      KeyringTypes.money,
      {
        entropySource,
      } as MoneyKeyringSerializedState,
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
      (keyring) => keyring.type === KeyringTypes.hd,
    );
    return primaryHdKeyring?.metadata.id;
  }

  /**
   * Throws if the keyring is currently locked.
   */
  #assertIsUnlocked(): void {
    const { isUnlocked } = this.messenger.call('KeyringController:getState');
    if (!isUnlocked) {
      throw new Error(
        'Cannot create a money account while the keyring is locked',
      );
    }
  }
}
