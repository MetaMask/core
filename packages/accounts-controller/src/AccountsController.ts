import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { SnapKeyring } from '@metamask/eth-snap-keyring';
import type { InternalAccount } from '@metamask/keyring-api';
import { EthAccountType, EthMethod } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type {
  KeyringControllerState,
  KeyringControllerGetKeyringForAccountAction,
  KeyringControllerGetKeyringsByTypeAction,
  KeyringControllerGetAccountsAction,
  KeyringControllerStateChangeEvent,
} from '@metamask/keyring-controller';
import type {
  SnapControllerState,
  SnapStateChange,
} from '@metamask/snaps-controllers';
import type { SnapId } from '@metamask/snaps-sdk';
import type { Snap } from '@metamask/snaps-utils';
import type { Keyring, Json } from '@metamask/utils';
import type { Draft } from 'immer';

import {
  getUUIDFromAddressOfNormalAccount,
  isNormalKeyringType,
  keyringTypeToName,
} from './utils';

const controllerName = 'AccountsController';

export type AccountsControllerState = {
  internalAccounts: {
    accounts: Record<string, InternalAccount>;
    selectedAccount: string; // id of the selected account
  };
};

export type AccountsControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  AccountsControllerState
>;

export type AccountsControllerSetSelectedAccountAction = {
  type: `${typeof controllerName}:setSelectedAccount`;
  handler: AccountsController['setSelectedAccount'];
};

export type AccountsControllerSetAccountNameAction = {
  type: `${typeof controllerName}:setAccountName`;
  handler: AccountsController['setAccountName'];
};

export type AccountsControllerListAccountsAction = {
  type: `${typeof controllerName}:listAccounts`;
  handler: AccountsController['listAccounts'];
};

export type AccountsControllerUpdateAccountsAction = {
  type: `${typeof controllerName}:updateAccounts`;
  handler: AccountsController['updateAccounts'];
};

export type AccountsControllerGetSelectedAccountAction = {
  type: `${typeof controllerName}:getSelectedAccount`;
  handler: AccountsController['getSelectedAccount'];
};

export type AccountsControllerGetAccountByAddressAction = {
  type: `${typeof controllerName}:getAccountByAddress`;
  handler: AccountsController['getAccountByAddress'];
};

export type AccountsControllerGetNextAvailableAccountNameAction = {
  type: `${typeof controllerName}:getNextAvailableAccountName`;
  handler: AccountsController['getNextAvailableAccountName'];
};

export type AccountsControllerGetAccountAction = {
  type: `${typeof controllerName}:getAccount`;
  handler: AccountsController['getAccount'];
};

export type AllowedActions =
  | KeyringControllerGetKeyringForAccountAction
  | KeyringControllerGetKeyringsByTypeAction
  | KeyringControllerGetAccountsAction;

export type AccountsControllerActions =
  | AccountsControllerGetStateAction
  | AccountsControllerSetSelectedAccountAction
  | AccountsControllerListAccountsAction
  | AccountsControllerSetAccountNameAction
  | AccountsControllerUpdateAccountsAction
  | AccountsControllerGetAccountByAddressAction
  | AccountsControllerGetSelectedAccountAction
  | AccountsControllerGetNextAvailableAccountNameAction
  | AccountsControllerGetAccountAction;

export type AccountsControllerChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  AccountsControllerState
>;

export type AccountsControllerSelectedAccountChangeEvent = {
  type: `${typeof controllerName}:selectedAccountChange`;
  payload: [InternalAccount];
};

export type AllowedEvents = SnapStateChange | KeyringControllerStateChangeEvent;

export type AccountsControllerEvents =
  | AccountsControllerChangeEvent
  | AccountsControllerSelectedAccountChangeEvent;

export type AccountsControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  AccountsControllerActions | AllowedActions,
  AccountsControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
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
export class AccountsController extends BaseController<
  typeof controllerName,
  AccountsControllerState,
  AccountsControllerMessenger
> {
  /**
   * Constructor for AccountsController.
   *
   * @param options - The controller options.
   * @param options.messenger - The messenger object.
   * @param options.state - Initial state to set on this controller
   */
  constructor({
    messenger,
    state,
  }: {
    messenger: AccountsControllerMessenger;
    state: AccountsControllerState;
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

    this.messagingSystem.subscribe(
      'SnapController:stateChange',
      (snapStateState) => this.#handleOnSnapStateChange(snapStateState),
    );

    this.messagingSystem.subscribe(
      'KeyringController:stateChange',
      (keyringState) => this.#handleOnKeyringStateChange(keyringState),
    );

    this.#registerMessageHandlers();
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
          importTime: 0,
        },
      };
    }

    const account = this.getAccount(accountId);
    if (account === undefined) {
      throw new Error(`Account Id "${accountId}" not found`);
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

    this.update((currentState: Draft<AccountsControllerState>) => {
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

    this.update((currentState: Draft<AccountsControllerState>) => {
      const internalAccount = {
        ...account,
        metadata: { ...account.metadata, name: accountName },
      };
      currentState.internalAccounts.accounts[accountId] = internalAccount;
    });
  }

  /**
   * Updates the internal accounts list by retrieving normal and snap accounts,
   * removing duplicates, and updating the metadata of each account.
   *
   * @returns A Promise that resolves when the accounts have been updated.
   */
  async updateAccounts(): Promise<void> {
    const snapAccounts = await this.#listSnapAccounts();
    const normalAccounts = await this.#listNormalAccounts();

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
            this.#populateExistingMetadata(existingAccount?.id, 'name') ??
            `${keyringTypeName} ${keyringAccountIndex + 1}`,
          importTime:
            this.#populateExistingMetadata(existingAccount?.id, 'importTime') ??
            Date.now(),
          lastSelected: this.#populateExistingMetadata(
            existingAccount?.id,
            'lastSelected',
          ),
        },
      };

      return internalAccountMap;
    }, {} as Record<string, InternalAccount>);

    this.update((currentState: Draft<AccountsControllerState>) => {
      (currentState as AccountsControllerState).internalAccounts.accounts =
        accounts;
    });
  }

  /**
   * Loads the backup state of the accounts controller.
   *
   * @param backup - The backup state to load.
   */
  loadBackup(backup: AccountsControllerState): void {
    if (backup.internalAccounts) {
      this.update((currentState: Draft<AccountsControllerState>) => {
        (currentState as AccountsControllerState).internalAccounts =
          backup.internalAccounts;
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
        EthMethod.PersonalSign,
        EthMethod.Sign,
        EthMethod.SignTransaction,
        EthMethod.SignTypedDataV1,
        EthMethod.SignTypedDataV3,
        EthMethod.SignTypedDataV4,
      ],
      type: EthAccountType.Eoa,
      metadata: {
        name: '',
        importTime: Date.now(),
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
    const [snapKeyring] = this.messagingSystem.call(
      'KeyringController:getKeyringsByType',
      SnapKeyring.type,
    );
    // snap keyring is not available until the first account is created in the keyring controller
    if (!snapKeyring) {
      return [];
    }

    const snapAccounts = (snapKeyring as SnapKeyring).listAccounts();

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

      const keyringType = (keyring as Keyring<Json>).type;
      if (!isNormalKeyringType(keyringType as KeyringTypes)) {
        // We only consider "normal accounts" here, so keep looping
        continue;
      }

      const id = getUUIDFromAddressOfNormalAccount(address);

      internalAccounts.push({
        id,
        address,
        options: {},
        methods: [
          EthMethod.PersonalSign,
          EthMethod.Sign,
          EthMethod.SignTransaction,
          EthMethod.SignTypedDataV1,
          EthMethod.SignTypedDataV3,
          EthMethod.SignTypedDataV4,
        ],
        type: EthAccountType.Eoa,
        metadata: {
          name: this.#populateExistingMetadata(id, 'name') ?? '',
          importTime:
            this.#populateExistingMetadata(id, 'importTime') ?? Date.now(),
          lastSelected: this.#populateExistingMetadata(id, 'lastSelected'),
          keyring: {
            type: (keyring as Keyring<Json>).type,
          },
        },
      });
    }

    return internalAccounts;
  }

  /**
   * Handles changes in the keyring state, specifically when new accounts are added or removed.
   *
   * @param keyringState - The new state of the keyring controller.
   */
  #handleOnKeyringStateChange(keyringState: KeyringControllerState): void {
    // check if there are any new accounts added
    // TODO: change when accountAdded event is added to the keyring controller

    // We check for keyrings length to be greater than 0 because the extension client may try execute
    // submit password twice and clear the keyring state.
    // https://github.com/MetaMask/KeyringController/blob/2d73a4deed8d013913f6ef0c9f5c0bb7c614f7d3/src/KeyringController.ts#L910
    if (keyringState.isUnlocked && keyringState.keyrings.length > 0) {
      const updatedNormalKeyringAddresses: AddressAndKeyringTypeObject[] = [];
      const updatedSnapKeyringAddresses: AddressAndKeyringTypeObject[] = [];

      for (const keyring of keyringState.keyrings) {
        if (keyring.type === KeyringTypes.snap) {
          updatedSnapKeyringAddresses.push(
            ...keyring.accounts.map((address) => {
              return {
                address,
                type: keyring.type,
              };
            }),
          );
        } else {
          updatedNormalKeyringAddresses.push(
            ...keyring.accounts.map((address) => {
              return {
                address,
                type: keyring.type,
              };
            }),
          );
        }
      }

      const { previousNormalInternalAccounts, previousSnapInternalAccounts } =
        this.listAccounts().reduce(
          (accumulator, account) => {
            if (account.metadata.keyring.type === KeyringTypes.snap) {
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
            (internalAccount: InternalAccount) =>
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
          this.#handleNewAccountAdded(account);
        }
      }

      // handle if the selected account was deleted
      if (!this.getAccount(this.state.internalAccounts.selectedAccount)) {
        const [accountToSelect] = this.listAccounts().sort(
          (accountA, accountB) => {
            // sort by lastSelected descending
            return (
              (accountB.metadata.lastSelected ?? 0) -
              (accountA.metadata.lastSelected ?? 0)
            );
          },
        );

        // if the accountToSelect is undefined, then there are no accounts
        // it mean the keyring was reinitialized.
        if (!accountToSelect) {
          this.update((currentState: Draft<AccountsControllerState>) => {
            currentState.internalAccounts.selectedAccount = '';
          });
          return;
        }

        this.setSelectedAccount(accountToSelect.id);
      }
    }
  }

  /**
   * Handles the change in SnapControllerState by updating the metadata of accounts that have a snap enabled.
   *
   * @param snapState - The new SnapControllerState.
   */
  #handleOnSnapStateChange(snapState: SnapControllerState) {
    // only check if snaps changed in status
    const { snaps } = snapState;
    const accounts = this.listAccounts().filter(
      (account) => account.metadata.snap,
    );

    this.update((currentState: Draft<AccountsControllerState>) => {
      accounts.forEach((account) => {
        const currentAccount =
          currentState.internalAccounts.accounts[account.id];
        if (currentAccount.metadata.snap) {
          const snapId = currentAccount.metadata.snap.id;
          const storedSnap: Snap = snaps[snapId as SnapId];
          if (storedSnap) {
            currentAccount.metadata.snap.enabled =
              storedSnap.enabled && !storedSnap.blocked;
          }
        }
      });
    });
  }

  /**
   * Returns the list of accounts for a given keyring type.
   * @param keyringType - The type of keyring.
   * @returns The list of accounts associcated with this keyring type.
   */
  #getAccountsByKeyringType(keyringType: string) {
    return this.listAccounts().filter((internalAccount) => {
      // We do consider `hd` and `simple` keyrings to be of same type. So we check those 2 types
      // to group those accounts together!
      if (
        keyringType === KeyringTypes.hd ||
        keyringType === KeyringTypes.simple
      ) {
        return (
          internalAccount.metadata.keyring.type === KeyringTypes.hd ||
          internalAccount.metadata.keyring.type === KeyringTypes.simple
        );
      }

      return internalAccount.metadata.keyring.type === keyringType;
    });
  }

  /**
   * Returns the next account number for a given keyring type.
   * @param keyringType - The type of keyring.
   * @returns An object containing the account prefix and index to use.
   */
  getNextAvailableAccountName(keyringType: string = KeyringTypes.hd): string {
    const keyringName = keyringTypeToName(keyringType);
    const keyringAccounts = this.#getAccountsByKeyringType(keyringType);
    const lastDefaultIndexUsedForKeyringType = keyringAccounts.reduce(
      (maxInternalAccountIndex, internalAccount) => {
        // We **DO NOT USE** `\d+` here to only consider valid "human"
        // number (rounded decimal number)
        const match = new RegExp(`${keyringName} ([0-9]+)$`, 'u').exec(
          internalAccount.metadata.name,
        );

        if (match) {
          // Quoting `RegExp.exec` documentation:
          // > The returned array has the matched text as the first item, and then one item for
          // > each capturing group of the matched text.
          // So use `match[1]` to get the captured value
          const internalAccountIndex = parseInt(match[1], 10);
          return Math.max(maxInternalAccountIndex, internalAccountIndex);
        }

        return maxInternalAccountIndex;
      },
      0,
    );

    const index = Math.max(
      keyringAccounts.length + 1,
      lastDefaultIndexUsedForKeyringType + 1,
    );

    return `${keyringName} ${index}`;
  }

  /**
   * Handles the addition of a new account to the controller.
   * If the account is not a Snap Keyring account, generates an internal account for it and adds it to the controller.
   * If the account is a Snap Keyring account, retrieves the account from the keyring and adds it to the controller.
   * @param account - The address and keyring type object of the new account.
   */
  #handleNewAccountAdded(account: AddressAndKeyringTypeObject) {
    let newAccount: InternalAccount;
    if (account.type !== KeyringTypes.snap) {
      newAccount = this.#generateInternalAccountForNonSnapAccount(
        account.address,
        account.type,
      );
    } else {
      const [snapKeyring] = this.messagingSystem.call(
        'KeyringController:getKeyringsByType',
        SnapKeyring.type,
      );

      newAccount = (snapKeyring as SnapKeyring).getAccountByAddress(
        account.address,
      ) as InternalAccount;

      // The snap deleted the account before the keyring controller could add it
      if (!newAccount) {
        return;
      }
    }

    // Get next account name available for this given keyring
    const accountName = this.getNextAvailableAccountName(
      newAccount.metadata.keyring.type,
    );

    this.update((currentState: Draft<AccountsControllerState>) => {
      (currentState as AccountsControllerState).internalAccounts.accounts[
        newAccount.id
      ] = {
        ...newAccount,
        metadata: {
          ...newAccount.metadata,
          name: accountName,
          importTime: Date.now(),
          lastSelected: Date.now(),
        },
      };
    });

    this.setSelectedAccount(newAccount.id);
  }

  /**
   * Handles the removal of an account from the internal accounts list.
   * @param accountId - The ID of the account to be removed.
   */
  #handleAccountRemoved(accountId: string) {
    this.update((currentState: Draft<AccountsControllerState>) => {
      delete currentState.internalAccounts.accounts[accountId];
    });
  }

  /**
   * Retrieves the value of a specific metadata key for an existing account.
   * @param accountId - The ID of the account.
   * @param metadataKey - The key of the metadata to retrieve.
   * @returns The value of the specified metadata key, or undefined if the account or metadata key does not exist.
   */
  #populateExistingMetadata<T extends keyof InternalAccount['metadata']>(
    accountId: string,
    metadataKey: T,
  ): InternalAccount['metadata'][T] | undefined {
    const internalAccount = this.getAccount(accountId);
    return internalAccount ? internalAccount.metadata[metadataKey] : undefined;
  }

  /**
   * Registers message handlers for the AccountsController.
   * @private
   */
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

    this.messagingSystem.registerActionHandler(
      `${controllerName}:getSelectedAccount`,
      this.getSelectedAccount.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${controllerName}:getAccountByAddress`,
      this.getAccountByAddress.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${controllerName}:getNextAvailableAccountName`,
      this.getNextAvailableAccountName.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `AccountsController:getAccount`,
      this.getAccount.bind(this),
    );
  }
}
