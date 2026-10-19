import { getUUIDFromAddressOfNormalAccount } from '@metamask/accounts-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { MoneyKeyring } from '@metamask/eth-money-keyring';
import { MONEY_DERIVATION_PATH } from '@metamask/eth-money-keyring';
import { EthAccountType, EthMethod, EthScope } from '@metamask/keyring-api';
import type { EntropySourceId } from '@metamask/keyring-api';
import { KeyringAccountEntropyTypeOption } from '@metamask/keyring-api';
import type {
  KeyringControllerGetStateAction,
  KeyringControllerWithControllerAction,
  KeyringControllerWithKeyringAction,
  KeyringMetadata,
} from '@metamask/keyring-controller';
import { KeyringTypes } from '@metamask/keyring-controller';
import { EthKeyring } from '@metamask/keyring-utils';
import type { Messenger } from '@metamask/messenger';
import type { Hex } from '@metamask/utils';

import { projectLogger as log } from './logger.js';
import type { MoneyAccountControllerMethodActions } from './MoneyAccountController-method-action-types.js';
import type { MoneyAccount, MoneyAccountEntropyOptions } from './types.js';
import { isMoneyKeyring, isMpcMoneyKeyring } from './utils.js';

export const controllerName = 'MoneyAccountController';

/**
 * Parameters for creating a money account.
 *
 * - `{ type: 'mpc' }`: create the MFA account backed by the MPC Money keyring.
 * - `{ type?: 'mnemonic', entropySource }` (the default): create the SFA
 * account backed by the `MoneyKeyring` for the given entropy source.
 */
export type CreateMoneyAccountParams =
  | {
      /**
       * The kind of money account to create. Defaults to
       * `'mnemonic'` (`KeyringAccountEntropyTypeOption.Mnemonic`).
       */
      type?: `${KeyringAccountEntropyTypeOption.Mnemonic}`;

      /**
       * The entropy source ID of the SRP backing the account.
       */
      entropySource: EntropySourceId;
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
 * - `{ type?: 'mnemonic', entropySource }` (the default): look up the
 * `MoneyKeyring` account (SFA) for that entropy source.
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
       * The kind of money account to look up. Defaults to
       * `'mnemonic'` (`KeyringAccountEntropyTypeOption.Mnemonic`).
       */
      type?: `${KeyringAccountEntropyTypeOption.Mnemonic}`;

      /**
       * The entropy source ID of the SRP backing the account.
       */
      entropySource: EntropySourceId;
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

/**
 * The signing methods supported by money accounts.
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
 * The shape of the MPC Money keyring operations used by this controller. The MPC
 * keyring is an atomic keyring: `init` is cheap if the keyring is already
 * initialized, and long-running work is dispatched without holding the
 * keyring controller mutex.
 */
type MpcMoneyKeyringLike = EthKeyring & {
  init: () => Promise<void>;
};

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
        entropySource: primaryEntropySource,
      });

      // If no default money account is set — e.g. a wallet that
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
   * - `{ type: 'mpc' }`: the MPC Money keyring (MFA account), which is created and
   * initialized if it does not exist yet.
   * - `{ type?: 'mnemonic', entropySource }` (the default): the `MoneyKeyring`
   * for that entropy source (SFA account), which is created if it does not
   * exist yet.
   *
   * @param params - The parameters for creating the money account.
   * @returns The money account.
   */
  async createMoneyAccount(
    params: CreateMoneyAccountParams,
  ): Promise<MoneyAccount> {
    this.#assertIsUnlocked();

    // Idempotent: return existing account if already in state.
    const existingAccount =
      params.type === KeyringAccountEntropyTypeOption.Mpc
        ? this.#getMpcMoneyAccount()
        : this.#getMoneyAccountByEntropySource(params.entropySource);
    if (existingAccount) {
      return existingAccount;
    }

    const account =
      params.type === KeyringAccountEntropyTypeOption.Mpc
        ? await this.#createMpcMoneyKeyringAccount()
        : await this.#createMoneyKeyringAccount(params.entropySource);

    log(`Money account created: ${account.address} (${account.id})`);
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
   * @param selector.type - The kind of account to look up: `'mpc'` for the MPC-backed account (MFA), or `'mnemonic'` (the default) with `entropySource` for the `MoneyKeyring` account (SFA).
   * @param selector.entropySource - The entropy source ID of the SRP-backed account to look up.
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

    return this.#getMoneyAccountByEntropySource(selector.entropySource);
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
   * @param entropySource - The entropy source ID to create the money account for.
   * @returns The money account.
   */
  async #createMoneyKeyringAccount(
    entropySource: EntropySourceId,
  ): Promise<MoneyAccount> {
    const id = await this.#ensureMoneyKeyring(entropySource);

    const address = await this.#withMoneyKeyring(id, async (keyring) => {
      // We're adding this logic to be defensive against the possibility of a money keyring
      // existing without any accounts, which shouldn't normally happen but we want to be
      // sure we can handle it if it does.
      // If there are no accounts, we'll add one and then get the address.
      const accounts = await keyring.getAccounts();
      if (accounts.length > 0) {
        const [moneyAddress] = accounts;
        return moneyAddress;
      }

      log(
        `Money keyring (id:${id}, entropy:${entropySource}) has no accounts, creating one...`,
      );
      const [moneyAddress] = await keyring.addAccounts(1);
      return moneyAddress;
    });

    return this.#createKeyringAccount({
      address,
      entropy: {
        type: KeyringAccountEntropyTypeOption.Mnemonic,
        id: entropySource,
        groupIndex: 0,
        derivationPath: MONEY_DERIVATION_PATH,
      },
    });
  }

  /**
   * Creates or reuses an account on the MPC Money keyring.
   *
   * The MPC Money keyring is an atomic keyring: its initialization is cheap when
   * already initialized, and long-running work is dispatched without holding
   * the keyring controller mutex.
   *
   * @returns The money account.
   */
  async #createMpcMoneyKeyringAccount(): Promise<MoneyAccount> {
    const id = await this.#ensureMpcMoneyKeyring();

    const address = await this.#withMpcMoneyKeyring(id, async (keyring) => {
      // The keyring infers the setup mode (create or import) from its own
      // state. This is a no-op if the keyring is already initialized.
      await keyring.init();

      // We're adding this logic to be defensive against the possibility of an
      // MPC Money keyring existing without any accounts, which shouldn't normally
      // happen but we want to be sure we can handle it if it does.
      const accounts = await keyring.getAccounts();
      if (accounts.length > 0) {
        const [mpcAddress] = accounts;
        return mpcAddress;
      }

      log(`MPC Money keyring (${id}) has no accounts, adding one...`);
      const [mpcAddress] = await keyring.addAccounts(1);
      return mpcAddress;
    });

    return this.#createKeyringAccount({
      address,
      entropy: {
        type: KeyringAccountEntropyTypeOption.Mpc,
      },
    });
  }

  /**
   * Builds a money account for the given address and entropy options, stores
   * it in state, and returns it. If no default account is set, the new account
   * becomes the default.
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
  #getMoneyAccountByEntropySource(
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
   * Ensures the MPC Money keyring exists, creating it atomically if it does not, and
   * returns its keyring ID.
   *
   * The check-or-create is performed within a single
   * `KeyringController:withController` transaction, which is mutually
   * exclusive and rolls back on error.
   *
   * @returns The keyring ID of the existing or newly created keyring.
   */
  async #ensureMpcMoneyKeyring(): Promise<string> {
    return (await this.messenger.call(
      'KeyringController:withController',
      async (restrictedController) => {
        const mpcKeyrings = restrictedController.keyrings.filter((entry) =>
          isMpcMoneyKeyring(entry.keyring),
        );

        if (mpcKeyrings.length > 1) {
          throw new Error('Multiple MPC Money keyrings found');
        }

        if (mpcKeyrings.length === 1) {
          return mpcKeyrings[0].metadata.id;
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
   * Calls `KeyringController:withKeyring` for the keyring with the given ID.
   *
   * @param id - The keyring metadata ID.
   * @param assertType - Verifies the resolved keyring has the expected type.
   * @param operation - Callback invoked with the resolved keyring.
   * @returns The value returned by `operation`.
   */
  async #withKeyring<Result>(
    id: string,
    assertType: (keyring: EthKeyring) => boolean,
    operation: (keyring: EthKeyring) => Promise<Result>,
  ): Promise<Result> {
    return (await this.messenger.call(
      'KeyringController:withKeyring',
      { id },
      async ({ keyring }) => {
        if (!assertType(keyring)) {
          throw new Error(`Keyring ${id} has an unexpected type`);
        }
        return operation(keyring);
      },
    )) as Result;
  }

  /**
   * Calls `KeyringController:withKeyring` for the `MoneyKeyring` with the
   * given ID.
   *
   * @param id - The keyring metadata ID.
   * @param operation - Callback invoked with the resolved `MoneyKeyring`.
   * @returns The value returned by `operation`.
   */
  async #withMoneyKeyring<Result>(
    id: string,
    operation: (keyring: MoneyKeyring) => Promise<Result>,
  ): Promise<Result> {
    return await this.#withKeyring(id, isMoneyKeyring, async (keyring) =>
      operation(keyring as MoneyKeyring),
    );
  }

  /**
   * Calls `KeyringController:withKeyring` for the MPC Money keyring with the given
   * ID.
   *
   * @param id - The keyring metadata ID.
   * @param operation - Callback invoked with the resolved MPC Money keyring.
   * @returns The value returned by `operation`.
   */
  async #withMpcMoneyKeyring<Result>(
    id: string,
    operation: (keyring: MpcMoneyKeyringLike) => Promise<Result>,
  ): Promise<Result> {
    return await this.#withKeyring(id, isMpcMoneyKeyring, async (keyring) =>
      operation(keyring as MpcMoneyKeyringLike),
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
