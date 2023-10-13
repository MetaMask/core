import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseControllerV2 } from '@metamask/base-controller';
import { SnapKeyring } from '@metamask/eth-snap-keyring';
import type { InternalAccount } from '@metamask/keyring-api';
import { EthAccountType } from '@metamask/keyring-api';
import type {
  KeyringControllerState,
  KeyringControllerEvents,
  KeyringControllerGetKeyringForAccountAction,
  KeyringControllerGetKeyringsByTypeAction,
  KeyringControllerGetAccountsAction,
} from '@metamask/keyring-controller';
import type {
  SnapControllerEvents,
  SnapControllerState,
} from '@metamask/snaps-controllers';
import type { Snap, ValidatedSnapId } from '@metamask/snaps-utils';
import type { Keyring, Json } from '@metamask/utils';
import { sha256FromString } from 'ethereumjs-util';
import { type Patch } from 'immer';
import { v4 as uuid } from 'uuid';

import { getUUIDFromAddressOfNormalAccount, keyringTypeToName } from './utils';

const controllerName = 'AccountsController';

export type AccountsControllerState = {
  internalAccounts: {
    accounts: Record<string, InternalAccount>;
    selectedAccount: string; // id of the selected account
  };
};

export type AccountsControllerGetStateAction = {
  type: `${typeof controllerName}:getState`;
  handler: () => AccountsControllerState;
};

export type AccountsControllerSetSelectedAccount = {
  type: `${typeof controllerName}:setSelectedAccount`;
  handler: AccountsController['setSelectedAccount'];
};

export type AccountsControllerSetAccountName = {
  type: `${typeof controllerName}:setAccountName`;
  handler: AccountsController['setAccountName'];
};

export type AccountsControllerListAccounts = {
  type: `${typeof controllerName}:listAccounts`;
  handler: AccountsController['listAccounts'];
};

export type AccountsControllerUpdateAccounts = {
  type: `${typeof controllerName}:updateAccounts`;
  handler: AccountsController['updateAccounts'];
};

export type AccountsControllerActions =
  | AccountsControllerGetStateAction
  | AccountsControllerSetSelectedAccount
  | AccountsControllerListAccounts
  | AccountsControllerSetAccountName
  | AccountsControllerUpdateAccounts
  | KeyringControllerGetKeyringForAccountAction
  | KeyringControllerGetKeyringsByTypeAction
  | KeyringControllerGetAccountsAction;

export type AccountsControllerChangeEvent = {
  type: `${typeof controllerName}:stateChange`;
  payload: [AccountsControllerState, Patch[]];
};

export type AccountsControllerSelectedAccountChangeEvent = {
  type: `${typeof controllerName}:selectedAccountChange`;
  payload: [InternalAccount];
};

export type AccountsControllerEvents =
  | AccountsControllerChangeEvent
  | AccountsControllerSelectedAccountChangeEvent
  | SnapControllerEvents
  | KeyringControllerEvents;

export type AccountsControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  AccountsControllerActions,
  AccountsControllerEvents,
  string,
  string
>;

type AddressAndKeyringTypeObject = {
  address: string;
  type: string;
};

const accountsControllerMetadata = {
  internalAccounts: {
    persist: true,
    anonymous: false,
  },
};

const defaultState: AccountsControllerState = {
  internalAccounts: {
    accounts: {},
    selectedAccount: '',
  },
};

/**
 * Controller that manages internal accounts.
 * The accounts controller is responsible for creating and managing internal accounts.
 * It also provides convenience methods for accessing and updating the internal accounts.
 * The accounts controller also listens for keyring state changes and updates the internal accounts accordingly.
 * The accounts controller also listens for snap state changes and updates the internal accounts accordingly.
 *
 */
export class AccountsController extends BaseControllerV2<
  typeof controllerName,
  AccountsControllerState,
  AccountsControllerMessenger
> {
  keyringApiEnabled: boolean;

  /**
   * Constructor for AccountsController.
   *
   * @param options - The controller options.
   * @param options.messenger - The messenger object.
   * @param options.state - Initial state to set on this controller
   * @param [options.keyringApiEnabled] - The keyring API enabled flag.
   */
  constructor({
    messenger,
    state,
    keyringApiEnabled,
  }: {
    messenger: AccountsControllerMessenger;
    state: AccountsControllerState;
    keyringApiEnabled?: boolean;
  }) {
    super({
      messenger,
      name: controllerName,
      metadata: accountsControllerMetadata,
      state: {
        ...defaultState,
        ...state,
      },
    });

    this.keyringApiEnabled = Boolean(keyringApiEnabled);

    if (this.keyringApiEnabled) {
      this.messagingSystem.subscribe(
        'SnapController:stateChange',
        async (snapStateState) =>
          await this.#handleOnSnapStateChange(snapStateState),
      );
    }

    this.messagingSystem.subscribe(
      'KeyringController:stateChange',
      async (keyringState) =>
        await this.#handleOnKeyringStateChange(keyringState),
    );

    this.#registerMessageHandlers();

    // if somehow the selected account becomes lost then select the first account
    if (
      this.state.internalAccounts.selectedAccount !== '' &&
      !this.getAccount(this.state.internalAccounts.selectedAccount) &&
      this.listAccounts().length > 0
    ) {
      this.setSelectedAccount(this.listAccounts()[0].id);
    }
  }

  /**
   * Returns the internal account object for the given account ID, if it exists.
   *
   * @param accountId - The ID of the account to retrieve.
   * @returns The internal account object, or undefined if the account does not exist.
   */
  getAccount(accountId: string): InternalAccount | undefined {
    return this.state.internalAccounts.accounts[accountId];
  }

  /**
   * Returns an array of all internal accounts.
   *
   * @returns An array of InternalAccount objects.
   */
  listAccounts(): InternalAccount[] {
    return Object.values(this.state.internalAccounts.accounts);
  }

  /**
   * Returns the internal account object for the given account ID.
   *
   * @param accountId - The ID of the account to retrieve.
   * @returns The internal account object.
   * @throws An error if the account ID is not found.
   */
  getAccountExpect(accountId: string): InternalAccount {
    // Edge case where the extension is setup but the srp is not yet created
    // certain ui elements will query the selected address before any accounts are created.
    if (!accountId) {
      return {
        id: '',
        address: '',
        options: {},
        methods: [],
        type: EthAccountType.Eoa,
        metadata: {
          name: '',
          keyring: {
            type: '',
          },
        },
      };
    }

    const account = this.getAccount(accountId);
    if (account === undefined) {
      throw new Error(`Account Id ${accountId} not found`);
    }
    return account;
  }

  /**
   * Returns the selected internal account.
   *
   * @returns The selected internal account.
   */
  getSelectedAccount(): InternalAccount {
    return this.getAccountExpect(this.state.internalAccounts.selectedAccount);
  }

  /**
   * Returns the account with the specified address.
   * ! This method will only return the first account that matches the address
   * @param address - The address of the account to retrieve.
   * @returns The account with the specified address, or undefined if not found.
   */
  getAccountByAddress(address: string): InternalAccount | undefined {
    return this.listAccounts().find(
      (account) => account.address.toLowerCase() === address.toLowerCase(),
    );
  }

  /**
   * Sets the selected account by its ID.
   *
   * @param accountId - The ID of the account to be selected.
   */
  setSelectedAccount(accountId: string): void {
    const account = this.getAccountExpect(accountId);

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore Type instantiation is excessively deep and possibly infinite.
    this.update((currentState: AccountsControllerState) => {
      currentState.internalAccounts.accounts[account.id].metadata.lastSelected =
        Date.now();
      currentState.internalAccounts.selectedAccount = account.id;
    });

    this.messagingSystem.publish(
      'AccountsController:selectedAccountChange',
      account,
    );
  }

  /**
   * Sets the name of the account with the given ID.
   *
   * @param accountId - The ID of the account to set the name for.
   * @param accountName - The new name for the account.
   * @throws An error if an account with the same name already exists.
   */
  setAccountName(accountId: string, accountName: string): void {
    const account = this.getAccountExpect(accountId);

    if (
      this.listAccounts().find(
        (internalAccount) =>
          internalAccount.metadata.name === accountName &&
          internalAccount.id !== accountId,
      )
    ) {
      throw new Error('Account name already exists');
    }

    this.update((currentState: AccountsControllerState) => {
      currentState.internalAccounts.accounts[accountId] = {
        ...account,
        metadata: {
          ...account.metadata,
          name: accountName,
        },
      };
    });
  }

  /**
   * Updates the internal accounts list by retrieving normal and snap accounts,
   * removing duplicates, and updating the metadata of each account.
   *
   * @returns A Promise that resolves when the accounts have been updated.
   */
  async updateAccounts(): Promise<void> {
    let normalAccounts = await this.#listNormalAccounts();
    let snapAccounts: InternalAccount[] = [];
    if (this.keyringApiEnabled) {
      snapAccounts = await this.#listSnapAccounts();
      // remove duplicate accounts that are retrieved from the snap keyring.
      normalAccounts = normalAccounts.filter(
        (account) =>
          !snapAccounts.find(
            (snapAccount) => snapAccount.address === account.address,
          ),
      );
    }

    // keyring type map.
    const keyringTypes = new Map<string, number>();
    const previousAccounts = this.state.internalAccounts.accounts;

    const accounts: Record<string, InternalAccount> = [
      ...normalAccounts,
      ...snapAccounts,
    ].reduce((internalAccountMap, internalAccount) => {
      const keyringTypeName = keyringTypeToName(
        internalAccount.metadata.keyring.type,
      );
      const keyringAccountIndex = keyringTypes.get(keyringTypeName) ?? 0;
      if (keyringAccountIndex) {
        keyringTypes.set(keyringTypeName, keyringAccountIndex + 1);
      } else {
        keyringTypes.set(keyringTypeName, 1);
      }

      const existingAccount = previousAccounts[internalAccount.id];

      internalAccountMap[internalAccount.id] = {
        ...internalAccount,

        metadata: {
          ...internalAccount.metadata,
          name:
            existingAccount && existingAccount.metadata.name !== ''
              ? existingAccount.metadata.name
              : `${keyringTypeName} ${keyringAccountIndex + 1}`,
          lastSelected: existingAccount?.metadata?.lastSelected,
        },
      };

      return internalAccountMap;
    }, {} as Record<string, InternalAccount>);

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore Type instantiation is excessively deep and possibly infinite.
    this.update((currentState: AccountsControllerState) => {
      currentState.internalAccounts.accounts = accounts;
    });
  }

  /**
   * Loads the backup state of the accounts controller.
   *
   * @param backup - The backup state to load.
   */
  loadBackup(backup: AccountsControllerState): void {
    if (backup.internalAccounts) {
      this.update((currentState: AccountsControllerState) => {
        currentState.internalAccounts = backup.internalAccounts;
      });
    }
  }

  /**
   * Generates an internal account for a non-Snap account.
   * @param address - The address of the account.
   * @param type - The type of the account.
   * @returns The generated internal account.
   */
  #generateInternalAccountForNonSnapAccount(
    address: string,
    type: string,
  ): InternalAccount {
    return {
      id: getUUIDFromAddressOfNormalAccount(address),
      address,
      options: {},
      methods: [
        'personal_sign',
        'eth_sign',
        'eth_signTransaction',
        'eth_signTypedData_v1',
        'eth_signTypedData_v3',
        'eth_signTypedData_v4',
      ],
      type: EthAccountType.Eoa,
      metadata: {
        name: '',
        keyring: {
          type,
        },
      },
    };
  }

  /**
   * Returns a list of internal accounts created using the SnapKeyring.
   *
   * @returns A promise that resolves to an array of InternalAccount objects.
   */
  async #listSnapAccounts(): Promise<InternalAccount[]> {
    const [snapKeyring] = await this.messagingSystem.call(
      'KeyringController:getKeyringsByType',
      SnapKeyring.type,
    );
    // snap keyring is not available until the first account is created in the keyring controller
    if (!snapKeyring) {
      return [];
    }

    const snapAccounts = await (snapKeyring as SnapKeyring).listAccounts();

    return snapAccounts;
  }

  /**
   * Returns a list of normal accounts.
   * Note: listNormalAccounts is a temporary method until the keyrings all implement the InternalAccount interface.
   * Once all keyrings implement the InternalAccount interface, this method can be removed and getAccounts can be used instead.
   *
   * @returns A Promise that resolves to an array of InternalAccount objects.
   */
  async #listNormalAccounts(): Promise<InternalAccount[]> {
    const addresses = await this.messagingSystem.call(
      'KeyringController:getAccounts',
    );
    const internalAccounts: InternalAccount[] = [];
    for (const address of addresses) {
      const keyring = await this.messagingSystem.call(
        'KeyringController:getKeyringForAccount',
        address,
      );
      const v4options = {
        random: sha256FromString(address).slice(0, 16),
      };

      internalAccounts.push({
        id: uuid(v4options),
        address,
        options: {},
        methods: [
          'personal_sign',
          'eth_sign',
          'eth_signTransaction',
          'eth_signTypedData_v1',
          'eth_signTypedData_v3',
          'eth_signTypedData_v4',
        ],
        type: EthAccountType.Eoa,
        metadata: {
          name: '',
          keyring: {
            type: (keyring as Keyring<Json>).type,
          },
        },
      });
    }

    return internalAccounts.filter(
      (account) => account.metadata.keyring.type !== 'Snap Keyring',
    );
  }

  /**
   * Handles changes in the keyring state, specifically when new accounts are added or removed.
   *
   * @param keyringState - The new state of the keyring controller.
   * @returns A Promise that resolves when the function has finished executing.
   */
  async #handleOnKeyringStateChange(
    keyringState: KeyringControllerState,
  ): Promise<void> {
    // check if there are any new accounts added
    // TODO: change when accountAdded event is added to the keyring controller

    if (keyringState.isUnlocked) {
      // TODO: ACCOUNTS_CONTROLLER keyring will return accounts instead of addresses, remove this flatMap after and just get the latest id

      const updatedNormalKeyringAddresses: AddressAndKeyringTypeObject[] = [];
      const updatedSnapKeyringAddresses: AddressAndKeyringTypeObject[] = [];

      for (const keyring of keyringState.keyrings) {
        if (keyring.type === 'Snap Keyring') {
          updatedSnapKeyringAddresses.push(
            ...keyring.accounts.map((address) => {
              return {
                address,
                type: keyring.type,
              };
            }),
          );
        }
        updatedNormalKeyringAddresses.push(
          ...keyring.accounts.map((address) => {
            return {
              address,
              type: keyring.type,
            };
          }),
        );
      }

      const { previousNormalInternalAccounts, previousSnapInternalAccounts } =
        this.listAccounts().reduce(
          (accumulator, account) => {
            if (account.metadata.keyring.type === 'Snap Keyring') {
              accumulator.previousSnapInternalAccounts.push(account);
            } else {
              accumulator.previousNormalInternalAccounts.push(account);
            }
            return accumulator;
          },
          {
            previousNormalInternalAccounts: [] as InternalAccount[],
            previousSnapInternalAccounts: [] as InternalAccount[],
          },
        );

      const addedAccounts: AddressAndKeyringTypeObject[] = [];
      const deletedAccounts: InternalAccount[] = [];

      // snap account ids are random uuid while normal accounts
      // are determininistic based on the address

      // ^NOTE: This will be removed when normal accounts also implement internal accounts
      // finding all the normal accounts that were added
      for (const account of updatedNormalKeyringAddresses) {
        if (
          !this.state.internalAccounts.accounts[
            getUUIDFromAddressOfNormalAccount(account.address)
          ]
        ) {
          addedAccounts.push(account);
        }
      }

      // finding all the snap accounts that were added
      for (const account of updatedSnapKeyringAddresses) {
        if (
          !previousSnapInternalAccounts.find(
            (internalAccount) =>
              internalAccount.address.toLowerCase() ===
              account.address.toLowerCase(),
          )
        ) {
          addedAccounts.push(account);
        }
      }

      // finding all the normal accounts that were deleted
      for (const account of previousNormalInternalAccounts) {
        if (
          !updatedNormalKeyringAddresses.find(
            ({ address }) =>
              address.toLowerCase() === account.address.toLowerCase(),
          )
        ) {
          deletedAccounts.push(account);
        }
      }

      // finding all the snap accounts that were deleted
      for (const account of previousSnapInternalAccounts) {
        if (
          !updatedSnapKeyringAddresses.find(
            ({ address }) =>
              address.toLowerCase() === account.address.toLowerCase(),
          )
        ) {
          deletedAccounts.push(account);
        }
      }

      if (deletedAccounts.length > 0) {
        for (const account of deletedAccounts) {
          this.#handleAccountRemoved(account.id);
        }
      }

      if (addedAccounts.length > 0) {
        for (const account of addedAccounts) {
          await this.#handleNewAccountAdded(account);
        }
      }

      // handle if the selected account was deleted
      if (!this.getAccount(this.state.internalAccounts.selectedAccount)) {
        const accountToSelect = this.listAccounts().sort(
          (accountA, accountB) => {
            // sort by lastSelected descending
            return (
              (accountB.metadata.lastSelected ?? 0) -
              (accountA.metadata.lastSelected ?? 0)
            );
          },
        )[0];

        this.setSelectedAccount(accountToSelect.id);
      }
    }
  }

  /**
   * Handles the change in SnapControllerState by updating the metadata of accounts that have a snap enabled.
   *
   * @param snapState - The new SnapControllerState.
   * @returns A Promise that resolves when the update is complete.
   */
  async #handleOnSnapStateChange(
    snapState: SnapControllerState,
  ): Promise<void> {
    // only check if snaps changed in status
    const { snaps } = snapState;
    const accounts = this.listAccounts().filter(
      (account) => account.metadata.snap,
    );

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore Type instantiation is excessively deep and possibly infinite.
    this.update((currentState: AccountsControllerState) => {
      accounts.forEach((account) => {
        const currentAccount =
          currentState.internalAccounts.accounts[account.id];
        if (currentAccount.metadata.snap) {
          const snapId = currentAccount.metadata.snap.id;
          const storedSnap: Snap = snaps[snapId as ValidatedSnapId];
          if (storedSnap) {
            currentAccount.metadata.snap.enabled =
              storedSnap.enabled && !storedSnap.blocked;
          }
        }
      });
    });
  }

  /**
   * Handles the addition of a new account to the controller.
   * If the account is not a Snap Keyring account, generates an internal account for it and adds it to the controller.
   * If the account is a Snap Keyring account, retrieves the account from the keyring and adds it to the controller.
   * @param account - The address and keyring type object of the new account.
   * @returns void
   */
  async #handleNewAccountAdded(account: AddressAndKeyringTypeObject) {
    let newAccount: InternalAccount;
    if (account.type !== 'Snap Keyring') {
      newAccount = this.#generateInternalAccountForNonSnapAccount(
        account.address,
        account.type,
      );
    } else {
      const [snapKeyring] = this.messagingSystem.call(
        'KeyringController:getKeyringsByType',
        SnapKeyring.type,
      );

      newAccount = (await (snapKeyring as SnapKeyring).getAccountByAddress(
        account.address,
      )) as InternalAccount;

      // The snap deleted the account before the keyring controller could add it
      if (!newAccount) {
        return;
      }
    }

    // get next index number for the keyring type
    const keyringName = keyringTypeToName(newAccount.metadata.keyring.type);
    const previousAccounts = this.listAccounts();
    const lastKeyringTypeIndex =
      previousAccounts
        .filter(
          (internalAccount) =>
            internalAccount.metadata.keyring.type ===
              newAccount.metadata.keyring.type &&
            new RegExp(`${keyringName} \\d+$`, 'u').test(
              internalAccount.metadata.name,
            ),
        )
        .map((internalAccount) => {
          const match = internalAccount.metadata.name.match(/\d+$/u);
          return match ? parseInt(match[0], 10) : 0;
        })
        .sort((a, b) => b - a)[0] || 0;

    newAccount.metadata.name = `${keyringName} ${lastKeyringTypeIndex + 1}`;

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore Type instantiation is excessively deep and possibly infinite.
    this.update((currentState: AccountsControllerState) => {
      currentState.internalAccounts.accounts[newAccount.id] = newAccount;
    });

    this.setSelectedAccount(newAccount.id);
  }

  #handleAccountRemoved(accountId: string) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore Type instantiation is excessively deep and possibly infinite.
    this.update((currentState: AccountsControllerState) => {
      delete currentState.internalAccounts.accounts[accountId];
    });
  }

  #registerMessageHandlers() {
    this.messagingSystem.registerActionHandler(
      `${controllerName}:setSelectedAccount`,
      this.setSelectedAccount.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${controllerName}:listAccounts`,
      this.listAccounts.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${controllerName}:setAccountName`,
      this.setAccountName.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${controllerName}:updateAccounts`,
      this.updateAccounts.bind(this),
    );
  }
}
