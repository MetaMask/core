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
  KeyringSelector,
} from '@metamask/keyring-controller';
import {
  isKeyringNotFoundError,
  KeyringTypes,
} from '@metamask/keyring-controller';
import { EthKeyring } from '@metamask/keyring-utils';
import type { Messenger } from '@metamask/messenger';
import { Mutex } from 'async-mutex';

import { projectLogger as log } from './logger.js';
import type { MoneyAccountControllerMethodActions } from './MoneyAccountController-method-action-types.js';
import type { MoneyAccount } from './types.js';
import { isMoneyKeyring, isMpcKeyring, MPC_KEYRING_TYPE } from './utils.js';

export const controllerName = 'MoneyAccountController';

export type CreateMoneyAccountParams =
  | { keyringType: typeof KeyringTypes.money; entropySource: EntropySourceId }
  | { keyringType: typeof MPC_KEYRING_TYPE; keyringId?: string };

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
  'addMoneyAccount',
  'setDefaultMoneyAccount',
  'getMoneyAccount',
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

const MONEY_ACCOUNT_METHODS = [
  EthMethod.PersonalSign,
  EthMethod.SignTypedDataV1,
  EthMethod.SignTypedDataV3,
  EthMethod.SignTypedDataV4,
  // TODO: Update this once the `keyring-api` package supports `SignEip7702Authorization` method.
];

/**
 * Controller for managing money accounts.
 */
export class MoneyAccountController extends BaseController<
  typeof controllerName,
  MoneyAccountControllerState,
  MoneyAccountControllerMessenger
> {
  readonly #lock: Mutex;

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

    this.#lock = new Mutex();
  }

  /**
   * Initializes the controller by creating a money account for the primary
   * entropy source if one does not already exist.
   */
  async init(): Promise<void> {
    this.#assertIsUnlocked();

    const primaryEntropySource = this.#getPrimaryEntropySource();
    if (primaryEntropySource) {
      const { id, address } = await this.createMoneyAccount({
        keyringType: KeyringTypes.money,
        entropySource: primaryEntropySource,
      });
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
   * Creates a money account from a Money Keyring (entropy source) or an
   * existing MPC Keyring. If an account already exists for that source, it is
   * returned as-is (idempotent).
   *
   * @param params - The keyring source to create the money account from.
   * @returns The money account.
   */
  async createMoneyAccount(
    params: CreateMoneyAccountParams,
  ): Promise<MoneyAccount> {
    this.#assertIsUnlocked();

    if (params.keyringType === KeyringTypes.money) {
      return await this.#createMoneyKeyringAccount(params.entropySource);
    }

    return await this.#createMpcKeyringAccount(params.keyringId);
  }

  /**
   * Registers an already-built money account. If an account with the same id
   * is already in state, it is returned as-is (idempotent).
   *
   * If no default account is set, the added account becomes the default.
   *
   * @param account - The account to register.
   * @returns The registered money account.
   */
  addMoneyAccount(account: MoneyAccount): MoneyAccount {
    const existingAccount = this.state.moneyAccounts[account.id];
    if (existingAccount) {
      return existingAccount;
    }

    this.#persistAccount(account);
    log(`Money account added: ${account.address} (${account.id})`);
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
   * Gets a money account. With no selector, returns the default account.
   *
   * @param selector - Selector options for getting the money account.
   * @param selector.id - The account id to look up.
   * @param selector.entropySource - The entropy source ID of a Money Keyring
   * account. Ignored when `id` is provided.
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

    const { defaultMoneyAccountId } = this.state;
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
   * Creates or reuses a Money Keyring account for the given entropy source.
   *
   * @param entropySource - The entropy source ID to create the money account for.
   * @returns The money account.
   */
  async #createMoneyKeyringAccount(
    entropySource: EntropySourceId,
  ): Promise<MoneyAccount> {
    const existingAccount = this.#getMoneyAccountByEntropySource(entropySource);
    if (existingAccount) {
      return existingAccount;
    }

    const address = await this.#withMoneyKeyring(
      entropySource,
      async (keyring) => {
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
          `Money keyring (entropy:${entropySource}) has no accounts, creating one...`,
        );
        const [moneyAddress] = await keyring.addAccounts(1);
        return moneyAddress;
      },
    );

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
      methods: [...MONEY_ACCOUNT_METHODS],
    };

    this.#persistAccount(account);
    log(
      `Money keyring (entropy:${entropySource}) account created: ${account.address} (${account.id})`,
    );
    return account;
  }

  /**
   * Creates or reuses an account on an existing MPC keyring.
   *
   * @param keyringId - Optional MPC keyring id. Required when more than one
   * MPC keyring exists.
   * @returns The money account.
   */
  async #createMpcKeyringAccount(keyringId?: string): Promise<MoneyAccount> {
    const resolvedKeyringId = this.#resolveMpcKeyringId(keyringId);

    const existingAccount = this.#getMoneyAccountByKeyringId(resolvedKeyringId);
    if (existingAccount) {
      return existingAccount;
    }

    const { address, id: metadataId } = await this.#withMpcKeyring(
      resolvedKeyringId,
      async (keyring, metadata) => {
        const accounts = await keyring.getAccounts();
        if (accounts.length > 0) {
          const [mpcAddress] = accounts;
          return { address: mpcAddress, id: metadata.id };
        }

        log(`MPC keyring (${metadata.id}) has no accounts, creating one...`);
        const [mpcAddress] = await keyring.addAccounts(1);
        return { address: mpcAddress, id: metadata.id };
      },
    );

    const account: MoneyAccount = {
      id: getUUIDFromAddressOfNormalAccount(address),
      type: EthAccountType.Eoa,
      address,
      scopes: [EthScope.Eoa],
      options: {
        entropy: {
          type: 'custom',
        },
        exportable: false,
        keyringId: metadataId,
      },
      methods: [...MONEY_ACCOUNT_METHODS],
    };

    this.#persistAccount(account);
    log(
      `MPC keyring (${metadataId}) account created: ${account.address} (${account.id})`,
    );
    return account;
  }

  /**
   * Stores the account in state. If no default is set, this account becomes
   * the default.
   *
   * @param account - The account to persist.
   */
  #persistAccount(account: MoneyAccount): void {
    this.update((state) => {
      state.moneyAccounts[account.id] = account;
      state.defaultMoneyAccountId ??= account.id;
    });
  }

  /**
   * Gets a Money Keyring account by entropy source id.
   *
   * @param entropySource - The entropy source ID.
   * @returns The matching account, if any.
   */
  #getMoneyAccountByEntropySource(
    entropySource: EntropySourceId,
  ): MoneyAccount | undefined {
    return Object.values(this.state.moneyAccounts).find((account) => {
      const { entropy } = account.options;
      return entropy?.type === 'mnemonic' && entropy.id === entropySource;
    });
  }

  /**
   * Gets an account previously created from a specific keyring id.
   *
   * @param keyringId - The keyring metadata id.
   * @returns The matching account, if any.
   */
  #getMoneyAccountByKeyringId(keyringId: string): MoneyAccount | undefined {
    return Object.values(this.state.moneyAccounts).find(
      (account) => account.options.keyringId === keyringId,
    );
  }

  /**
   * Resolves which MPC keyring to use.
   *
   * @param keyringId - Optional explicit keyring id.
   * @returns The MPC keyring metadata id.
   */
  #resolveMpcKeyringId(keyringId?: string): string {
    if (keyringId !== undefined) {
      return keyringId;
    }

    const { keyrings } = this.messenger.call('KeyringController:getState');
    const mpcKeyrings = keyrings.filter(
      (keyring) => keyring.type === MPC_KEYRING_TYPE,
    );

    if (mpcKeyrings.length === 0) {
      throw new Error('No MPC keyring found');
    }

    if (mpcKeyrings.length > 1) {
      throw new Error('Multiple MPC keyrings found; provide keyringId');
    }

    const [mpcKeyring] = mpcKeyrings;
    return mpcKeyring.metadata.id;
  }

  /**
   * Calls `KeyringController:withKeyring` for the `MoneyKeyring` associated with the
   * given entropy source, creating one first if it does not yet exist.
   *
   * @param entropySource - The entropy source ID identifying the target keyring.
   * @param operation - Callback invoked with the resolved `MoneyKeyring`.
   * @returns The value returned by `operation`.
   */
  async #withMoneyKeyring<Result>(
    entropySource: EntropySourceId,
    operation: (keyring: MoneyKeyring) => Promise<Result>,
  ): Promise<Result> {
    // Filter to find a specific `MoneyKeyring` for the given entropy source.
    const isMoneyKeyringForEntropySource = (
      keyring: EthKeyring,
    ): keyring is MoneyKeyring =>
      isMoneyKeyring(keyring) && keyring.entropySource === entropySource;

    // We cannot use proper generic-type inference using the messenger
    // here, so we have to use a type casts for `keyring` and the return type.
    const withKeyring = async (
      selector: KeyringSelector<MoneyKeyring>,
      callback: (keyring: MoneyKeyring) => Promise<Result>,
    ): Promise<Result> =>
      this.messenger.call(
        'KeyringController:withKeyring',
        selector,
        async ({ keyring }) => callback(keyring as MoneyKeyring),
      ) as Promise<Result>;

    // We have an extra lock here to avoid a race-condition where 2 calls to
    // `#withMoneyKeyring` for the same entropy source happen at the same time, and
    // both don't find an existing keyring, so they both try to create a new
    // one, which creates multiple keyrings for the same entropy source.
    // NOTE: We cannot use `createIfMissing` here either, since it's only supported
    // for selectors by type (and we want to deprecate this option).
    // TODO: Move this new pattern in the `KeyringController`.
    return await this.#lock.runExclusive(async () => {
      try {
        return await withKeyring(
          {
            filter: isMoneyKeyringForEntropySource,
          },
          operation,
        );
      } catch (error) {
        // Forward any unexpected errors, but if the error is that
        // the keyring wasn't found, we'll create it below.
        if (!isKeyringNotFoundError(error)) {
          throw error;
        }

        // Create the keyring so we can use `withKeyring` to operate on it in the
        // retry below.
        log(
          `Money keyring (entropy:${entropySource}) not found, creating one...`,
        );
        const { id } = await this.#createMoneyKeyring(entropySource);

        // Use the ID directly on the retry (we just created this keyring so we
        // know exactly which one to target).
        return await withKeyring({ id }, operation);
      }
    });
  }

  /**
   * Calls `KeyringController:withKeyring` for an existing MPC keyring.
   *
   * @param keyringId - The MPC keyring metadata id.
   * @param operation - Callback invoked with the resolved keyring and metadata.
   * @returns The value returned by `operation`.
   */
  async #withMpcKeyring<Result>(
    keyringId: string,
    operation: (
      keyring: EthKeyring,
      metadata: KeyringMetadata,
    ) => Promise<Result>,
  ): Promise<Result> {
    try {
      return (await this.messenger.call(
        'KeyringController:withKeyring',
        { id: keyringId },
        async ({ keyring, metadata }) => {
          if (!isMpcKeyring(keyring)) {
            throw new Error(`Keyring ${keyringId} is not an MPC Keyring`);
          }
          return operation(keyring, metadata);
        },
      )) as Result;
    } catch (error) {
      if (isKeyringNotFoundError(error)) {
        throw new Error('No MPC keyring found');
      }
      throw error;
    }
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
