import { getUUIDFromAddressOfNormalAccount } from '@metamask/accounts-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { MONEY_DERIVATION_PATH } from '@metamask/eth-money-keyring';
import type { MpcMoneyKeyring as MpcMoneyKeyringV2 } from '@metamask/eth-money-mpc-keyring/v2';
import {
  AccountCreationType,
  EthAccountType,
  EthMethod,
  EthScope,
  KeyringAccountEntropyTypeOption,
} from '@metamask/keyring-api';
import type { EntropySourceId, KeyringAccount } from '@metamask/keyring-api';
import type { Keyring as KeyringV2 } from '@metamask/keyring-api/v2';
import type {
  KeyringControllerGetStateAction,
  KeyringControllerWithControllerAction,
  KeyringControllerWithKeyringV2Action,
} from '@metamask/keyring-controller';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';
import type { Hex } from '@metamask/utils';

import { projectLogger as log } from './logger.js';
import type { MoneyAccountControllerMethodActions } from './MoneyAccountController-method-action-types.js';
import type { MoneyAccount, MoneyAccountEntropyOptions } from './types.js';
import { isMoneyKeyring, isMpcMoneyKeyring } from './utils.js';

export const controllerName = 'MoneyAccountController';

/**
 * Parameters for creating a money account.
 */
export type CreateMoneyAccountParams =
  | {
      /**
       * The kind of money account to create.
       */
      type: `${KeyringAccountEntropyTypeOption.Mnemonic}`;

      /**
       * The entropy source ID of the SRP backing the account. Defaults to the
       * primary HD keyring's entropy source.
       */
      entropySource?: EntropySourceId;
    }
  | {
      /**
       * The kind of money account to create.
       */
      type: `${KeyringAccountEntropyTypeOption.Mpc}`;
    };

/**
 * Selector for getting a money account.
 */
export type GetMoneyAccountSelector =
  | {
      /**
       * The id of the account to look up.
       */
      id: MoneyAccount['id'];
    }
  | {
      /**
       * The kind of money account to look up.
       */
      type: `${KeyringAccountEntropyTypeOption.Mnemonic}`;

      /**
       * The entropy source ID of the SRP backing the account. Defaults to the
       * primary HD keyring's entropy source.
       */
      entropySource?: EntropySourceId;
    }
  | {
      /**
       * The kind of money account to look up.
       */
      type: `${KeyringAccountEntropyTypeOption.Mpc}`;
    };

export type MoneyAccountControllerState = {
  moneyAccounts: {
    [id: MoneyAccount['id']]: MoneyAccount;
  };
  defaultMoneyAccountId: MoneyAccount['id'] | null;
};

const moneyAccountControllerMetadata = {
  moneyAccounts: {
    includeInDebugSnapshot: false,
    includeInStateLogs: true,
    persist: true,
    usedInUi: true,
  },
  defaultMoneyAccountId: {
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    persist: true,
    usedInUi: true,
  },
} satisfies StateMetadata<MoneyAccountControllerState>;

export function getDefaultMoneyAccountControllerState(): MoneyAccountControllerState {
  return {
    moneyAccounts: {},
    defaultMoneyAccountId: null,
  };
}

const MESSENGER_EXPOSED_METHODS = [
  'createMoneyAccount',
  'getMoneyAccount',
  'setDefaultMoneyAccount',
  'clearState',
  'init',
] as const;

/**
 * The signing methods supported by SFA (mnemonic-backed) money accounts.
 */
const MONEY_ACCOUNT_METHODS = [
  EthMethod.PersonalSign,
  EthMethod.SignTypedDataV1,
  EthMethod.SignTypedDataV3,
  EthMethod.SignTypedDataV4,
  // TODO: Update this once the `keyring-api` package supports `SignEip7702Authorization` method.
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
  | KeyringControllerWithControllerAction
  | KeyringControllerWithKeyringV2Action;

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
   * entropy source if one does not already exist, and by setting that account
   * as the default if no default is set.
   */
  async init(): Promise<void> {
    this.#assertIsUnlocked();

    const primaryEntropySource = this.#getPrimaryEntropySource();
    if (primaryEntropySource) {
      const { id, address } = await this.createMoneyAccount({
        type: KeyringAccountEntropyTypeOption.Mnemonic,
        entropySource: primaryEntropySource,
      });

      // Safety net for wallets predating `defaultMoneyAccountId`.
      if (this.state.defaultMoneyAccountId === null) {
        this.setDefaultMoneyAccount(id);
      }

      log(
        `Money keyring (entropy:${primaryEntropySource} - primary) account is: ${address} (${id})`,
      );
    } else {
      const message =
        'No primary HD keyring found, skipping default Money account creation!';

      console.warn(message);
      log(`WARNING -- ${message}`);
    }
  }

  /**
   * Creates a money account. If an account already exists for the given
   * source, it is returned as-is (idempotent).
   *
   * NOTE: Creating an MPC-backed account may trigger the MPC setup, which can
   * be long-running and require interactive authentication.
   *
   * @param params - The parameters for creating the money account.
   * @returns The money account.
   */
  async createMoneyAccount(
    params: CreateMoneyAccountParams,
  ): Promise<MoneyAccount> {
    this.#assertIsUnlocked();

    if (params.type === KeyringAccountEntropyTypeOption.Mpc) {
      // Idempotent: return existing account if already in state.
      const existingAccount = this.#getMpcMoneyAccount();
      if (existingAccount) {
        return existingAccount;
      }

      const account = await this.#createMpcMoneyKeyringAccount();
      log(`MPC money account created: ${account.address} (${account.id})`);
      return account;
    }

    const entropySource =
      params.entropySource ?? this.#getPrimaryEntropySource();
    if (entropySource === undefined) {
      throw new Error(
        'No entropy source provided, and no primary HD keyring found',
      );
    }

    // Idempotent: return existing account if already in state.
    const existingAccount = this.#getMoneyAccount(entropySource);
    if (existingAccount) {
      return existingAccount;
    }

    const account = await this.#createMoneyKeyringAccount(entropySource);
    log(
      `Money account created: ${account.address} (${account.id}) for entropy source: ${entropySource}`,
    );
    return account;
  }

  /**
   * Sets the default money account.
   *
   * @param id - The id of the money account to use as the default.
   */
  setDefaultMoneyAccount(id: MoneyAccount['id']): void {
    if (this.state.moneyAccounts[id] === undefined) {
      throw new Error(`Unknown money account: ${id}`);
    }

    this.update((state) => {
      state.defaultMoneyAccountId = id;
    });
  }

  /**
   * Gets a money account by id, by entropy source, the MPC-backed one, or the
   * default one when no selector is provided.
   *
   * @param selector - Selector for getting the money account.
   * @returns The money account, or `undefined` if none matches.
   */
  getMoneyAccount(
    selector?: GetMoneyAccountSelector,
  ): MoneyAccount | undefined {
    if (selector === undefined) {
      return this.#getDefaultMoneyAccount();
    }

    if ('id' in selector) {
      return this.state.moneyAccounts[selector.id];
    }

    if (selector.type === KeyringAccountEntropyTypeOption.Mpc) {
      return this.#getMpcMoneyAccount();
    }

    const entropySource =
      selector.entropySource ?? this.#getPrimaryEntropySource();
    if (entropySource === undefined) {
      return undefined;
    }

    return this.#getMoneyAccount(entropySource);
  }

  /**
   * Resets the controller state to its default, removing all money accounts.
   *
   * Intended for use during a full app reset (e.g. when the user wipes all
   * wallet data). Does not interact with the keyring.
   */
  clearState(): void {
    this.update((state) => {
      state.moneyAccounts = {};
      state.defaultMoneyAccountId = null;
    });
  }

  /**
   * Creates or reuses a `MoneyKeyring` account for the given entropy source.
   *
   * @param entropySource - The entropy source ID to create the money account for.
   * @returns The money account.
   */
  async #createMoneyKeyringAccount(
    entropySource: EntropySourceId,
  ): Promise<MoneyAccount> {
    const keyringId = await this.#ensureMoneyKeyring(entropySource);

    const [createdAccount] = await this.#withKeyringV2(
      keyringId,
      async (keyring) =>
        keyring.createAccounts({
          type: AccountCreationType.Bip44DeriveIndex,
          entropySource,
          groupIndex: 0,
        }),
    );

    if (!createdAccount) {
      throw new Error('Money Keyring account creation failed');
    }

    // The account object is constructed here (not reused from the keyring's
    // account) to keep the persisted SFA account shape unchanged.
    return this.#createKeyringAccount({
      address: createdAccount.address as Hex,
      entropy: {
        type: KeyringAccountEntropyTypeOption.Mnemonic,
        id: entropySource,
        groupIndex: 0,
        derivationPath: MONEY_DERIVATION_PATH,
      },
    });
  }

  /**
   * Creates the money account backed by the MPC Money keyring, registering the
   * keyring if needed and triggering the MPC setup when it has no account
   * yet.
   *
   * @returns The money account.
   */
  async #createMpcMoneyKeyringAccount(): Promise<MoneyAccount> {
    const keyringId = await this.#ensureMpcMoneyKeyring();

    const [account] = await this.#withKeyringV2<
      MpcMoneyKeyringV2,
      KeyringAccount[]
    >(keyringId, async (keyring) =>
      keyring.createAccounts({ type: AccountCreationType.Custom }),
    );

    if (!account) {
      throw new Error('MPC Money keyring account creation failed');
    }

    if (!this.#isMpcMoneyAccount(account)) {
      throw new Error('MPC Money keyring account has unexpected options');
    }

    return this.#persistMoneyAccount(account);
  }

  /**
   * Builds the SFA account for the given address and entropy options, stores
   * it in state, and returns it.
   *
   * @param params - The parameters for creating the account.
   * @param params.address - The account address.
   * @param params.entropy - The entropy options of the backing keyring.
   * @returns The money account.
   */
  #createKeyringAccount({
    address,
    entropy,
  }: {
    address: Hex;
    entropy: MoneyAccountEntropyOptions;
  }): MoneyAccount {
    const account: MoneyAccount = {
      // This is an EVM account, so let's re-use the deterministic ID generation logic of
      // EVM accounts.
      id: getUUIDFromAddressOfNormalAccount(address),
      type: EthAccountType.Eoa,
      address,
      scopes: [EthScope.Eoa],
      options: {
        entropy,
        exportable: false,
      },
      methods: [...MONEY_ACCOUNT_METHODS],
    };

    return this.#persistMoneyAccount(account);
  }

  /**
   * Returns `true` if the given keyring account is a valid MPC money account
   * (MPC entropy options, and non-exportable).
   *
   * @param account - The keyring account to check.
   * @returns Whether the account is a valid MPC money account.
   */
  #isMpcMoneyAccount(account: KeyringAccount): account is MoneyAccount {
    return (
      account.options.entropy?.type === KeyringAccountEntropyTypeOption.Mpc &&
      account.options.exportable === false
    );
  }

  /**
   * Stores the given money account in state and returns it as-is. If no
   * default account is set, the new account becomes the default.
   *
   * @param account - The money account to store.
   * @returns The money account.
   */
  #persistMoneyAccount(account: MoneyAccount): MoneyAccount {
    this.update((state) => {
      state.moneyAccounts[account.id] = account;
      state.defaultMoneyAccountId ??= account.id;
    });

    return account;
  }

  /**
   * Gets the default money account, if any.
   *
   * @returns The default money account, or `undefined` if none is set.
   */
  #getDefaultMoneyAccount(): MoneyAccount | undefined {
    const { defaultMoneyAccountId } = this.state;
    if (defaultMoneyAccountId === null) {
      return undefined;
    }

    return this.state.moneyAccounts[defaultMoneyAccountId];
  }

  /**
   * Gets the MPC-backed money account, if any.
   *
   * We should never have more than one MPC money account, but if we do, just
   * return the first one we find.
   *
   * @returns The MPC-backed money account, or `undefined` if none exists.
   */
  #getMpcMoneyAccount(): MoneyAccount | undefined {
    return Object.values(this.state.moneyAccounts).find(
      (account) =>
        account.options.entropy.type === KeyringAccountEntropyTypeOption.Mpc,
    );
  }

  /**
   * Gets a `MoneyKeyring` money account by entropy source ID.
   *
   * @param entropySource - The entropy source ID.
   * @returns The matching account, if any.
   */
  #getMoneyAccount(entropySource: EntropySourceId): MoneyAccount | undefined {
    return Object.values(this.state.moneyAccounts).find(
      (account) =>
        account.options.entropy.type ===
          KeyringAccountEntropyTypeOption.Mnemonic &&
        account.options.entropy.id === entropySource,
    );
  }

  /**
   * Ensures a `MoneyKeyring` exists for the given entropy source, creating
   * one atomically if needed, and returns its keyring ID.
   *
   * @param entropySource - The entropy source ID identifying the target keyring.
   * @returns The keyring ID of the existing or newly created keyring.
   */
  async #ensureMoneyKeyring(entropySource: EntropySourceId): Promise<string> {
    return (await this.messenger.call(
      'KeyringController:withController',
      async (restrictedController) => {
        const moneyKeyrings = restrictedController.keyrings.filter(
          (entry) =>
            isMoneyKeyring(entry.keyring) &&
            entry.keyring.entropySource === entropySource,
        );

        if (moneyKeyrings.length > 0) {
          return moneyKeyrings[0].metadata.id;
        }

        log(
          `Money keyring (entropy:${entropySource}) not found, creating one...`,
        );
        const entry = await restrictedController.addNewKeyring(
          KeyringTypes.money,
          { entropySource },
        );
        return entry.metadata.id;
      },
    )) as string;
  }

  /**
   * Ensures the MPC Money keyring exists, registering one atomically if
   * needed, and returns its keyring ID. Registering never runs the MPC
   * setup; the setup is only triggered through account creation.
   *
   * @returns The keyring ID of the existing or newly created keyring.
   */
  async #ensureMpcMoneyKeyring(): Promise<string> {
    return (await this.messenger.call(
      'KeyringController:withController',
      async (restrictedController) => {
        const mpcMoneyKeyrings = restrictedController.keyrings.filter((entry) =>
          isMpcMoneyKeyring(entry.keyring),
        );

        if (mpcMoneyKeyrings.length > 1) {
          throw new Error('Multiple MPC Money keyrings found');
        }

        if (mpcMoneyKeyrings.length === 1) {
          return mpcMoneyKeyrings[0].metadata.id;
        }

        log('MPC Money keyring not found, creating one...');
        const entry = await restrictedController.addNewKeyring(
          KeyringTypes.mpcMoney,
        );
        return entry.metadata.id;
      },
    )) as string;
  }

  /**
   * Calls `KeyringController:withKeyringV2` for the V2 keyring with the given
   * ID.
   *
   * @template SelectedKeyring - The type of the resolved V2 keyring, which
   * can narrow the keyring to a concrete V2 wrapper class.
   * @param id - The keyring metadata ID.
   * @param operation - Callback invoked with the resolved V2 keyring.
   * @returns The value returned by `operation`.
   */
  async #withKeyringV2<
    SelectedKeyring extends KeyringV2 = KeyringV2,
    Result = void,
  >(
    id: string,
    operation: (keyring: SelectedKeyring) => Promise<Result>,
  ): Promise<Result> {
    return (await this.messenger.call(
      'KeyringController:withKeyringV2',
      { id },
      async ({ keyring }) => operation(keyring as SelectedKeyring),
    )) as Result;
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
