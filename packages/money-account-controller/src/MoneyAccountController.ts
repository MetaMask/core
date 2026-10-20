import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import {
  AccountCreationType,
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

import { projectLogger as log } from './logger.js';
import type { MoneyAccountControllerMethodActions } from './MoneyAccountController-method-action-types.js';
import type { MoneyAccount } from './types.js';
import { isMoneyKeyring } from './utils.js';

export const controllerName = 'MoneyAccountController';

/**
 * Parameters for creating a money account.
 *
 * - `{ type: 'mnemonic' }`: create the SFA account backed by the `MoneyKeyring`
 * for the given entropy source, defaulting to the primary HD keyring's entropy
 * source when omitted.
 * - `{ type: 'mpc' }`: create the MFA account backed by the MPC Money keyring.
 * The keyring cannot be created by this controller — it requires
 * client-specific parameters — so it must already be registered with the
 * keyring controller.
 */
export type CreateMoneyAccountParams =
  | {
      /**
       * The kind of money account to create
       * (`KeyringAccountEntropyTypeOption.Mnemonic`).
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
       * The kind of money account to create
       * (`KeyringAccountEntropyTypeOption.Mpc`).
       */
      type: `${KeyringAccountEntropyTypeOption.Mpc}`;
    };

/**
 * Selector for getting a money account.
 *
 * - `{ id }`: look up the account by its id.
 * - `{ type: 'mpc' }`: look up the MPC-backed account (MFA).
 * - `{ type: 'mnemonic', entropySource? }`: look up the `MoneyKeyring` account
 * (SFA) for that entropy source, defaulting to the primary HD keyring's
 * entropy source when omitted.
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
       * The kind of money account to look up
       * (`KeyringAccountEntropyTypeOption.Mnemonic`).
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
       * The kind of money account to look up
       * (`KeyringAccountEntropyTypeOption.Mpc`).
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

      // Safety net: if no default money account is set — e.g. a wallet that
      // predates `defaultMoneyAccountId` and whose migration has not run —
      // the primary entropy source's money account (SFA) becomes the default.
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
   * The parameters determine the backing keyring:
   * - `{ type: 'mpc' }`: the MPC Money keyring (MFA account), which is fully
   * managed by the client — the keyring and its account must already exist,
   * otherwise this throws.
   * - `{ type: 'mnemonic', entropySource? }`: the `MoneyKeyring` for that
   * entropy source (SFA account), defaulting to the primary HD keyring's
   * entropy source, which is created if it does not exist yet.
   *
   * NOTE: Both paths use the V2 keyring wrappers, so V2 builders must be
   * registered with the `KeyringController` for the `Money Keyring` and
   * `MPC Money Keyring` keyring types.
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
   * @param selector.id - The account id to look up.
   * @param selector.type - The kind of account to look up: `'mpc'` for the MPC-backed account (MFA), or `'mnemonic'` with an optional `entropySource` for the `MoneyKeyring` account (SFA).
   * @param selector.entropySource - The entropy source ID of the SRP-backed account to look up. Defaults to the primary HD keyring's entropy source.
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
   * wallet data). Does not interact with the keyring — the caller is
   * responsible for ensuring the associated keyring state is also cleared.
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
   * The entropy options of the created account are reused from the account
   * reported by the keyring, so that metadata like the derivation path always
   * matches what the keyring actually derived (including the address index).
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

    if (!this.#isMnemonicMoneyAccount(createdAccount)) {
      throw new Error('Money Keyring account has unexpected options');
    }

    return this.#persistMoneyAccount(createdAccount);
  }

  /**
   * Creates the money account backed by the MPC Money keyring, reusing the
   * account already managed by the keyring.
   *
   * The MPC Money keyring is fully managed by the client — it requires
   * client-specific parameters to be created, and its account is created
   * during its own initialization — so neither the keyring nor its account can
   * be created by this controller. The keyring must already be registered and
   * initialized, otherwise this throws.
   *
   * @returns The money account.
   */
  async #createMpcMoneyKeyringAccount(): Promise<MoneyAccount> {
    const keyringId = this.#ensureMpcMoneyKeyring();

    const [existingAccount] = await this.#withKeyringV2(
      keyringId,
      async (keyring) => keyring.getAccounts(),
    );

    if (!existingAccount) {
      throw new Error(
        'MPC Money keyring has no account; it must be initialized by the client before creating an MPC money account',
      );
    }

    if (!this.#isMpcMoneyAccount(existingAccount)) {
      throw new Error('MPC Money keyring account has unexpected options');
    }

    return this.#persistMoneyAccount(existingAccount);
  }

  /**
   * Returns `true` if the given keyring account is a valid mnemonic money
   * account, as expected from a `MoneyKeyring` account: mnemonic entropy
   * options, and non-exportable.
   *
   * @param account - The keyring account to check.
   * @returns Whether the account is a valid mnemonic money account.
   */
  #isMnemonicMoneyAccount(account: KeyringAccount): account is MoneyAccount {
    return (
      account.options.entropy?.type ===
        KeyringAccountEntropyTypeOption.Mnemonic &&
      account.options.exportable === false
    );
  }

  /**
   * Returns `true` if the given keyring account is a valid MPC money account,
   * as expected from an MPC Money keyring account: MPC entropy options, and
   * non-exportable.
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
   * The account is the one reported by the backing keyring, reused as-is:
   * identity (`id`, `type`, `address`, `scopes`), entropy options, methods,
   * and non-exportability (`exportable: false`). The account ID is
   * deterministic based on the account address, so it is stable across
   * sessions and clients.
   *
   * @param account - The money account as reported by the backing keyring.
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
  #getMoneyAccount(
    entropySource: EntropySourceId,
  ): MoneyAccount | undefined {
    return Object.values(this.state.moneyAccounts).find(
      (account) =>
        account.options.entropy.type ===
          KeyringAccountEntropyTypeOption.Mnemonic &&
        account.options.entropy.id === entropySource,
    );
  }

  /**
   * Ensures a `MoneyKeyring` exists for the given entropy source, creating one
   * atomically if it does not, and returns its keyring ID.
   *
   * The check-or-create is performed within a single
   * `KeyringController:withController` transaction, which is mutually
   * exclusive and rolls back on error.
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
   * Ensures the MPC Money keyring exists and returns its keyring ID.
   *
   * The MPC Money keyring cannot be created by this controller — it requires
   * client-specific parameters — so it must already be registered with the
   * keyring controller, otherwise this throws.
   *
   * @returns The keyring ID of the MPC Money keyring.
   */
  #ensureMpcMoneyKeyring(): string {
    const { keyrings } = this.messenger.call('KeyringController:getState');
    const mpcMoneyKeyrings = keyrings.filter(
      (keyring) => keyring.type === KeyringTypes.mpcMoney,
    );

    if (mpcMoneyKeyrings.length === 0) {
      throw new Error(
        'MPC Money keyring not found; it must be registered by the client before creating an MPC money account',
      );
    }

    if (mpcMoneyKeyrings.length > 1) {
      throw new Error('Multiple MPC Money keyrings found');
    }

    return mpcMoneyKeyrings[0].metadata.id;
  }

  /**
   * Calls `KeyringController:withKeyringV2` for the V2 keyring with the given
   * ID.
   *
   * NOTE: A V2 builder must be registered with the `KeyringController` for
   * the keyring's type, otherwise this throws.
   *
   * @param id - The keyring metadata ID.
   * @param operation - Callback invoked with the resolved V2 keyring.
   * @returns The value returned by `operation`.
   */
  async #withKeyringV2<Result>(
    id: string,
    operation: (keyring: KeyringV2) => Promise<Result>,
  ): Promise<Result> {
    return (await this.messenger.call(
      'KeyringController:withKeyringV2',
      { id },
      async ({ keyring }) => operation(keyring),
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
