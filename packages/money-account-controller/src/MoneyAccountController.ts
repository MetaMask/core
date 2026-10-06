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
import {
  isMoneyKeyring,
  isMpcKeyring,
  MPC_ENTROPY_SOURCE_ID,
} from './utils.js';

export const controllerName = 'MoneyAccountController';

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
 * The shape of the MPC keyring operations used by this controller. The MPC
 * keyring is an atomic keyring: `init` is cheap if the keyring is already
 * initialized, and long-running work is dispatched without holding the
 * keyring controller mutex.
 */
type MpcKeyringLike = EthKeyring & {
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
    } else {
      const message =
        'No primary HD keyring found, skipping default Money account creation!';

      console.warn(message);
      log(`WARNING -- ${message}`);
    }
  }

  /**
   * Creates a money account for the given entropy source. If an account
   * already exists for that entropy source, it is returned as-is (idempotent).
   *
   * The entropy source identifies the backing keyring:
   * - `entropy:mpc:_`: the MPC keyring, which is created and
   * initialized if it does not exist yet.
   * - Any other entropy source: the `MoneyKeyring` for that entropy source, which
   * is created if it does not exist yet.
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

    const account =
      entropySource === MPC_ENTROPY_SOURCE_ID
        ? await this.#createMpcKeyringAccount()
        : await this.#createMoneyKeyringAccount(entropySource);

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
   * Gets a money account by id, by entropy source, or the default one.
   *
   * @param selector - Selector options for getting the money account.
   * @param selector.id - The account id to look up. Takes precedence over `entropySource`.
   * @param selector.entropySource - The entropy source ID to get the money account for.
   * @returns The money account, or `undefined` if none matches.
   */
  getMoneyAccount(
    selector: {
      id?: MoneyAccount['id'];
      entropySource?: EntropySourceId;
    } = {},
  ): MoneyAccount | undefined {
    if (selector.id !== undefined) {
      return this.state.moneyAccounts[selector.id];
    }

    if (selector.entropySource !== undefined) {
      return this.#getMoneyAccountByEntropySource(selector.entropySource);
    }

    const defaultMoneyAccountId = this.state.defaultMoneyAccountId ?? null;
    if (defaultMoneyAccountId === null) {
      return undefined;
    }

    return this.state.moneyAccounts[defaultMoneyAccountId];
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
        type: 'mnemonic',
        id: entropySource,
        groupIndex: 0,
        derivationPath: MONEY_DERIVATION_PATH,
      },
    });
  }

  /**
   * Creates or reuses an account on the MPC keyring.
   *
   * The MPC keyring is an atomic keyring: its initialization is cheap when
   * already initialized, and long-running work is dispatched without holding
   * the keyring controller mutex.
   *
   * @returns The money account.
   */
  async #createMpcKeyringAccount(): Promise<MoneyAccount> {
    const id = await this.#ensureMpcKeyring();

    const address = await this.#withMpcKeyring(id, async (keyring) => {
      // The keyring infers the setup mode (create or import) from its own
      // state. This is a no-op if the keyring is already initialized.
      await keyring.init();

      // We're adding this logic to be defensive against the possibility of an
      // MPC keyring existing without any accounts, which shouldn't normally
      // happen but we want to be sure we can handle it if it does.
      const accounts = await keyring.getAccounts();
      if (accounts.length > 0) {
        const [mpcAddress] = accounts;
        return mpcAddress;
      }

      log(`MPC keyring (${id}) has no accounts, adding one...`);
      const [mpcAddress] = await keyring.addAccounts(1);
      return mpcAddress;
    });

    return this.#createKeyringAccount({
      address,
      entropy: {
        type: 'mpc',
        id: MPC_ENTROPY_SOURCE_ID,
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
   * Gets a money account by entropy source ID.
   *
   * @param entropySource - The entropy source ID.
   * @returns The matching account, if any.
   */
  #getMoneyAccountByEntropySource(
    entropySource: EntropySourceId,
  ): MoneyAccount | undefined {
    return Object.values(this.state.moneyAccounts).find(
      (account) => account.options.entropy.id === entropySource,
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
   * Ensures the MPC keyring exists, creating it atomically if it does not, and
   * returns its keyring ID.
   *
   * The check-or-create is performed within a single
   * `KeyringController:withController` transaction, which is mutually
   * exclusive and rolls back on error.
   *
   * @returns The keyring ID of the existing or newly created keyring.
   */
  async #ensureMpcKeyring(): Promise<string> {
    return (await this.messenger.call(
      'KeyringController:withController',
      async (restrictedController) => {
        const mpcKeyrings = restrictedController.keyrings.filter((entry) =>
          isMpcKeyring(entry.keyring),
        );

        if (mpcKeyrings.length > 1) {
          throw new Error('Multiple MPC keyrings found');
        }

        if (mpcKeyrings.length === 1) {
          return mpcKeyrings[0].metadata.id;
        }

        log('MPC keyring not found, creating one...');
        const entry = await restrictedController.addNewKeyring(
          KeyringTypes.mpc,
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
      { id: id },
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
   * Calls `KeyringController:withKeyring` for the MPC keyring with the given
   * ID.
   *
   * @param id - The keyring metadata ID.
   * @param operation - Callback invoked with the resolved MPC keyring.
   * @returns The value returned by `operation`.
   */
  async #withMpcKeyring<Result>(
    id: string,
    operation: (keyring: MpcKeyringLike) => Promise<Result>,
  ): Promise<Result> {
    return await this.#withKeyring(id, isMpcKeyring, async (keyring) =>
      operation(keyring as MpcKeyringLike),
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
