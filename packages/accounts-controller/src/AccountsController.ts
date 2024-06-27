import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { SnapKeyring } from '@metamask/eth-snap-keyring';
import type { InternalAccount } from '@metamask/keyring-api';
import {
  EthAccountType,
  EthMethod,
  isEvmAccountType,
} from '@metamask/keyring-api';
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
import type { CaipChainId } from '@metamask/utils';
import {
  type Keyring,
  type Json,
  isCaipChainId,
  parseCaipChainId,
} from '@metamask/utils';
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

export type AccountsControllerListMultichainAccountsAction = {
  type: `${typeof controllerName}:listMultichainAccounts`;
  handler: AccountsController['listMultichainAccounts'];
};

export type AccountsControllerUpdateAccountsAction = {
  type: `${typeof controllerName}:updateAccounts`;
  handler: AccountsController['updateAccounts'];
};

export type AccountsControllerGetSelectedAccountAction = {
  type: `${typeof controllerName}:getSelectedAccount`;
  handler: AccountsController['getSelectedAccount'];
};

export type AccountsControllerGetSelectedMultichainAccountAction = {
  type: `${typeof controllerName}:getSelectedMultichainAccount`;
  handler: AccountsController['getSelectedMultichainAccount'];
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
  | AccountsControllerListMultichainAccountsAction
  | AccountsControllerSetAccountNameAction
  | AccountsControllerUpdateAccountsAction
  | AccountsControllerGetAccountByAddressAction
  | AccountsControllerGetSelectedAccountAction
  | AccountsControllerGetNextAvailableAccountNameAction
  | AccountsControllerGetAccountAction
  | AccountsControllerGetSelectedMultichainAccountAction;

export type AccountsControllerChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  AccountsControllerState
>;

export type AccountsControllerSelectedAccountChangeEvent = {
  type: `${typeof controllerName}:selectedAccountChange`;
  payload: [InternalAccount];
};

export type AccountsControllerSelectedEvmAccountChangeEvent = {
  type: `${typeof controllerName}:selectedEvmAccountChange`;
  payload: [InternalAccount];
};

export type AllowedEvents = SnapStateChange | KeyringControllerStateChangeEvent;

export type AccountsControllerEvents =
  | AccountsControllerChangeEvent
  | AccountsControllerSelectedAccountChangeEvent
  | AccountsControllerSelectedEvmAccountChangeEvent;

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

export const EMPTY_ACCOUNT = {
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
   * Returns an array of all evm internal accounts.
   *
   * @returns An array of InternalAccount objects.
   */
  listAccounts(): InternalAccount[] {
    const accounts = Object.values(this.state.internalAccounts.accounts);
    return accounts.filter((account) => isEvmAccountType(account.type));
  }

  /**
   * Returns an array of all internal accounts.
   *
   * @param chainId - The chain ID.
   * @returns An array of InternalAccount objects.
   */
  listMultichainAccounts(chainId?: CaipChainId): InternalAccount[] {
    const accounts = Object.values(this.state.internalAccounts.accounts);
    if (!chainId) {
      return accounts;
    }

    if (!isCaipChainId(chainId)) {
      throw new Error(`Invalid CAIP-2 chain ID: ${String(chainId)}`);
    }

    return accounts.filter((account) =>
      this.#isAccountCompatibleWithChain(account, chainId),
    );
  }

  /**
   * Returns the internal account object for the given account ID.
   *
   * @param accountId - The ID of the account to retrieve.
   * @returns The internal account object.
   * @throws An error if the account ID is not found.
   */
  getAccountExpect(accountId: string): InternalAccount {
    const account = this.getAccount(accountId);
    if (account === undefined) {
      throw new Error(`Account Id "${accountId}" not found`);
    }
    return account;
  }

  /**
   * Returns the last selected EVM account.
   *
   * @returns The selected internal account.
   */
  getSelectedAccount(): InternalAccount {
    // Edge case where the extension is setup but the srp is not yet created
    // certain ui elements will query the selected address before any accounts are created.
    if (this.state.internalAccounts.selectedAccount === '') {
      return EMPTY_ACCOUNT;
    }

    const selectedAccount = this.getAccountExpect(
      this.state.internalAccounts.selectedAccount,
    );
    if (isEvmAccountType(selectedAccount.type)) {
      return selectedAccount;
    }

    const accounts = this.listAccounts();

    if (!accounts.length) {
      // ! Should never reach this.
      throw new Error('No EVM accounts');
    }

    // This will never be undefined because we have already checked if accounts.length is > 0
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.#getLastSelectedAccount(accounts)!;
  }

  /**
   * __WARNING The return value may be undefined if there isn't an account for that chain id.__
   *
   * Retrieves the last selected account by chain ID.
   *
   * @param chainId - The chain ID to filter the accounts.
   * @returns The last selected account compatible with the specified chain ID or undefined.
   */
  getSelectedMultichainAccount(
    chainId?: CaipChainId,
  ): InternalAccount | undefined {
    // Edge case where the extension is setup but the srp is not yet created
    // certain ui elements will query the selected address before any accounts are created.
    if (this.state.internalAccounts.selectedAccount === '') {
      return EMPTY_ACCOUNT;
    }

    if (!chainId) {
      return this.getAccountExpect(this.state.internalAccounts.selectedAccount);
    }

    if (!isCaipChainId(chainId)) {
      throw new Error(`Invalid CAIP-2 chain ID: ${chainId as string}`);
    }

    const accounts = Object.values(this.state.internalAccounts.accounts).filter(
      (account) => this.#isAccountCompatibleWithChain(account, chainId),
    );

    return this.#getLastSelectedAccount(accounts);
  }

  /**
   * Returns the account with the specified address.
   * ! This method will only return the first account that matches the address
   * @param address - The address of the account to retrieve.
   * @returns The account with the specified address, or undefined if not found.
   */
  getAccountByAddress(address: string): InternalAccount | undefined {
    return this.listMultichainAccounts().find(
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

    if (isEvmAccountType(account.type)) {
      this.messagingSystem.publish(
        'AccountsController:selectedEvmAccountChange',
        account,
      );
    }

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
          lastSelected:
            this.#populateExistingMetadata(
              existingAccount?.id,
              'lastSelected',
            ) ?? 0,
        },
      };

      return internalAccountMap;
    }, {} as Record<string, InternalAccount>);

    this.update((currentState: Draft<AccountsControllerState>) => {
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
      this.update((currentState: Draft<AccountsControllerState>) => {
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
          lastSelected: this.#populateExistingMetadata(id, 'lastSelected') ?? 0,
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

      this.update((currentState: Draft<AccountsControllerState>) => {
        if (deletedAccounts.length > 0) {
          for (const account of deletedAccounts) {
            currentState.internalAccounts.accounts = this.#handleAccountRemoved(
              currentState.internalAccounts.accounts,
              account.id,
            );
          }
        }

        if (addedAccounts.length > 0) {
          for (const account of addedAccounts) {
            currentState.internalAccounts.accounts =
              this.#handleNewAccountAdded(
                currentState.internalAccounts.accounts,
                account,
              );
          }
        }

        // We don't use list accounts because it is not the updated state yet.
        const existingAccounts = Object.values(
          currentState.internalAccounts.accounts,
        );

        // handle if the selected account was deleted
        if (
          !currentState.internalAccounts.accounts[
            this.state.internalAccounts.selectedAccount
          ]
        ) {
          // if currently selected account is undefined and there are no accounts
          // it mean the keyring was reinitialized.
          if (existingAccounts.length === 0) {
            currentState.internalAccounts.selectedAccount = '';
            return;
          }

          // at this point, we know that `existingAccounts.length` is > 0, so
          // `accountToSelect` won't be `undefined`!
          const [accountToSelect] = existingAccounts.sort(
            (accountA, accountB) => {
              // sort by lastSelected descending
              return (
                (accountB.metadata.lastSelected ?? 0) -
                (accountA.metadata.lastSelected ?? 0)
              );
            },
          );
          currentState.internalAccounts.selectedAccount = accountToSelect.id;
        }
      });
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
   * @param accounts - Accounts to filter by keyring type.
   * @returns The list of accounts associcated with this keyring type.
   */
  #getAccountsByKeyringType(keyringType: string, accounts?: InternalAccount[]) {
    return (accounts ?? this.listAccounts()).filter((internalAccount) => {
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
   * Returns the last selected account from the given array of accounts.
   *
   * @param accounts - An array of InternalAccount objects.
   * @returns The InternalAccount object that was last selected, or undefined if the array is empty.
   */
  #getLastSelectedAccount(
    accounts: InternalAccount[],
  ): InternalAccount | undefined {
    return accounts.reduce((prevAccount, currentAccount) => {
      if (
        // When the account is added, lastSelected will be set
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        currentAccount.metadata.lastSelected! >
        // When the account is added, lastSelected will be set
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        prevAccount.metadata.lastSelected!
      ) {
        return currentAccount;
      }
      return prevAccount;
    }, accounts[0]);
  }

  /**
   * Returns the next account number for a given keyring type.
   * @param keyringType - The type of keyring.
   * @param accounts - Existing accounts to check for the next available account number.
   * @returns An object containing the account prefix and index to use.
   */
  getNextAvailableAccountName(
    keyringType: string = KeyringTypes.hd,
    accounts?: InternalAccount[],
  ): string {
    const keyringName = keyringTypeToName(keyringType);
    const keyringAccounts = this.#getAccountsByKeyringType(
      keyringType,
      accounts,
    );
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
   * Checks if an account is compatible with a given chain namespace.
   * @private
   * @param account - The account to check compatibility for.
   * @param chainId - The CAIP2 to check compatibility with.
   * @returns Returns true if the account is compatible with the chain namespace, otherwise false.
   */
  #isAccountCompatibleWithChain(
    account: InternalAccount,
    chainId: CaipChainId,
  ): boolean {
    // TODO: Change this logic to not use account's type
    // Because we currently only use type, we can only use namespace for now.
    return account.type.startsWith(parseCaipChainId(chainId).namespace);
  }

  /**
   * Handles the addition of a new account to the controller.
   * If the account is not a Snap Keyring account, generates an internal account for it and adds it to the controller.
   * If the account is a Snap Keyring account, retrieves the account from the keyring and adds it to the controller.
   * @param accountsState - AccountsController accounts state that is to be mutated.
   * @param account - The address and keyring type object of the new account.
   * @returns The updated AccountsController accounts state.
   */
  #handleNewAccountAdded(
    accountsState: AccountsControllerState['internalAccounts']['accounts'],
    account: AddressAndKeyringTypeObject,
  ): AccountsControllerState['internalAccounts']['accounts'] {
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
        return accountsState;
      }
    }

    // Get next account name available for this given keyring
    const accountName = this.getNextAvailableAccountName(
      newAccount.metadata.keyring.type,
      Object.values(accountsState),
    );

    accountsState[newAccount.id] = {
      ...newAccount,
      metadata: {
        ...newAccount.metadata,
        name: accountName,
        importTime: Date.now(),
        lastSelected: 0,
      },
    };

    return accountsState;
  }

  /**
   * Handles the removal of an account from the internal accounts list.
   * @param accountsState - AccountsController accounts state that is to be mutated.
   * @param accountId - The ID of the account to be removed.
   * @returns The updated AccountsController state.
   */
  #handleAccountRemoved(
    accountsState: AccountsControllerState['internalAccounts']['accounts'],
    accountId: string,
  ): AccountsControllerState['internalAccounts']['accounts'] {
    delete accountsState[accountId];
    return accountsState;
  }

  /**
   * Retrieves the value of a specific metadata key for an existing account.
   * @param accountId - The ID of the account.
   * @param metadataKey - The key of the metadata to retrieve.
   * @returns The value of the specified metadata key, or undefined if the account or metadata key does not exist.
   */
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  // eslint-disable-next-line @typescript-eslint/naming-convention
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
      `${controllerName}:listMultichainAccounts`,
      this.listMultichainAccounts.bind(this),
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
      `${controllerName}:getSelectedMultichainAccount`,
      this.getSelectedMultichainAccount.bind(this),
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
