import {
  type ControllerGetStateAction,
  type ControllerStateChangeEvent,
  type ExtractEventPayload,
  type RestrictedMessenger,
  BaseController,
} from '@metamask/base-controller';
import {
  type SnapKeyringAccountAssetListUpdatedEvent,
  type SnapKeyringAccountBalancesUpdatedEvent,
  type SnapKeyringAccountTransactionsUpdatedEvent,
  SnapKeyring,
} from '@metamask/eth-snap-keyring';
import {
  EthAccountType,
  EthMethod,
  EthScope,
  isEvmAccountType,
} from '@metamask/keyring-api';
import {
  type KeyringControllerState,
  type KeyringControllerGetKeyringsByTypeAction,
  type KeyringControllerStateChangeEvent,
  type KeyringControllerGetStateAction,
  KeyringTypes,
} from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { isScopeEqualToAny } from '@metamask/keyring-utils';
import type { NetworkClientId } from '@metamask/network-controller';
import type {
  SnapControllerState,
  SnapStateChange,
} from '@metamask/snaps-controllers';
import type { SnapId } from '@metamask/snaps-sdk';
import type { Snap } from '@metamask/snaps-utils';
import { type CaipChainId, isCaipChainId } from '@metamask/utils';

import type { MultichainNetworkControllerNetworkDidChangeEvent } from './types';
import {
  getUUIDFromAddressOfNormalAccount,
  isNormalKeyringType,
  keyringTypeToName,
} from './utils';

const controllerName = 'AccountsController';

export type AccountId = string;

export type AccountsControllerState = {
  internalAccounts: {
    accounts: Record<AccountId, InternalAccount>;
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

export type AccountsControllerUpdateAccountMetadataAction = {
  type: `${typeof controllerName}:updateAccountMetadata`;
  handler: AccountsController['updateAccountMetadata'];
};

export type AllowedActions =
  | KeyringControllerGetKeyringsByTypeAction
  | KeyringControllerGetStateAction;

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
  | AccountsControllerGetSelectedMultichainAccountAction
  | AccountsControllerUpdateAccountMetadataAction;

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

export type AccountsControllerAccountAddedEvent = {
  type: `${typeof controllerName}:accountAdded`;
  payload: [InternalAccount];
};

export type AccountsControllerAccountRemovedEvent = {
  type: `${typeof controllerName}:accountRemoved`;
  payload: [AccountId];
};

export type AccountsControllerAccountRenamedEvent = {
  type: `${typeof controllerName}:accountRenamed`;
  payload: [InternalAccount];
};

export type AccountsControllerAccountBalancesUpdatesEvent = {
  type: `${typeof controllerName}:accountBalancesUpdated`;
  payload: SnapKeyringAccountBalancesUpdatedEvent['payload'];
};

export type AccountsControllerAccountTransactionsUpdatedEvent = {
  type: `${typeof controllerName}:accountTransactionsUpdated`;
  payload: SnapKeyringAccountTransactionsUpdatedEvent['payload'];
};

export type AccountsControllerAccountAssetListUpdatedEvent = {
  type: `${typeof controllerName}:accountAssetListUpdated`;
  payload: SnapKeyringAccountAssetListUpdatedEvent['payload'];
};

export type AllowedEvents =
  | SnapStateChange
  | KeyringControllerStateChangeEvent
  | SnapKeyringAccountAssetListUpdatedEvent
  | SnapKeyringAccountBalancesUpdatedEvent
  | SnapKeyringAccountTransactionsUpdatedEvent
  | MultichainNetworkControllerNetworkDidChangeEvent;

export type AccountsControllerEvents =
  | AccountsControllerChangeEvent
  | AccountsControllerSelectedAccountChangeEvent
  | AccountsControllerSelectedEvmAccountChangeEvent
  | AccountsControllerAccountAddedEvent
  | AccountsControllerAccountRemovedEvent
  | AccountsControllerAccountRenamedEvent
  | AccountsControllerAccountBalancesUpdatesEvent
  | AccountsControllerAccountTransactionsUpdatedEvent
  | AccountsControllerAccountAssetListUpdatedEvent;

export type AccountsControllerMessenger = RestrictedMessenger<
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
  scopes: [EthScope.Eoa],
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

    this.#subscribeToMessageEvents();
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
      isScopeEqualToAny(chainId, account.scopes),
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

    const accounts = this.listMultichainAccounts(chainId);
    return this.#getLastSelectedAccount(accounts);
  }

  /**
   * Returns the account with the specified address.
   * ! This method will only return the first account that matches the address
   *
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

    this.update((currentState) => {
      currentState.internalAccounts.accounts[account.id].metadata.lastSelected =
        Date.now();
      currentState.internalAccounts.selectedAccount = account.id;
    });

    this.#publishAccountChangeEvent(account);
  }

  /**
   * Sets the name of the account with the given ID.
   *
   * @param accountId - The ID of the account to set the name for.
   * @param accountName - The new name for the account.
   * @throws An error if an account with the same name already exists.
   */
  setAccountName(accountId: string, accountName: string): void {
    // This will check for name uniqueness and fire the `accountRenamed` event
    // if the account has been renamed.
    this.updateAccountMetadata(accountId, {
      name: accountName,
      nameLastUpdatedAt: Date.now(),
    });
  }

  /**
   * Updates the metadata of the account with the given ID.
   *
   * @param accountId - The ID of the account for which the metadata will be updated.
   * @param metadata - The new metadata for the account.
   */
  updateAccountMetadata(
    accountId: string,
    metadata: Partial<InternalAccount['metadata']>,
  ): void {
    const account = this.getAccountExpect(accountId);

    if (
      metadata.name &&
      this.listMultichainAccounts().find(
        (internalAccount) =>
          internalAccount.metadata.name === metadata.name &&
          internalAccount.id !== accountId,
      )
    ) {
      throw new Error('Account name already exists');
    }

    this.update((currentState) => {
      const internalAccount = {
        ...account,
        metadata: { ...account.metadata, ...metadata },
      };
      // Do not remove this comment - This error is flaky: Comment out or restore the `ts-expect-error` directive below as needed.
      // See: https://github.com/MetaMask/utils/issues/168
      // // @ts-expect-error Known issue - `Json` causes recursive error in immer `Draft`/`WritableDraft` types
      currentState.internalAccounts.accounts[accountId] = internalAccount;

      if (metadata.name) {
        this.messagingSystem.publish(
          'AccountsController:accountRenamed',
          internalAccount,
        );
      }
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
    ].reduce(
      (internalAccountMap, internalAccount) => {
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
              this.#populateExistingMetadata(
                existingAccount?.id,
                'importTime',
              ) ?? Date.now(),
            lastSelected:
              this.#populateExistingMetadata(
                existingAccount?.id,
                'lastSelected',
              ) ?? 0,
          },
        };

        return internalAccountMap;
      },
      {} as Record<string, InternalAccount>,
    );

    this.update((currentState) => {
      currentState.internalAccounts.accounts = accounts;

      if (
        !currentState.internalAccounts.accounts[
          currentState.internalAccounts.selectedAccount
        ]
      ) {
        const lastSelectedAccount = this.#getLastSelectedAccount(
          Object.values(accounts),
        );

        if (lastSelectedAccount) {
          currentState.internalAccounts.selectedAccount =
            lastSelectedAccount.id;
          currentState.internalAccounts.accounts[
            lastSelectedAccount.id
          ].metadata.lastSelected = this.#getLastSelectedIndex();
          this.#publishAccountChangeEvent(lastSelectedAccount);
        } else {
          // It will be undefined if there are no accounts
          currentState.internalAccounts.selectedAccount = '';
        }
      }
    });
  }

  /**
   * Loads the backup state of the accounts controller.
   *
   * @param backup - The backup state to load.
   */
  loadBackup(backup: AccountsControllerState): void {
    if (backup.internalAccounts) {
      this.update((currentState) => {
        currentState.internalAccounts = backup.internalAccounts;
      });
    }
  }

  /**
   * Generates an internal account for a non-Snap account.
   *
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
      scopes: [EthScope.Eoa],
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
    const internalAccounts: InternalAccount[] = [];
    const { keyrings } = await this.messagingSystem.call(
      'KeyringController:getState',
    );
    for (const keyring of keyrings) {
      const keyringType = keyring.type;
      if (!isNormalKeyringType(keyringType as KeyringTypes)) {
        // We only consider "normal accounts" here, so keep looping
        continue;
      }

      for (const address of keyring.accounts) {
        const id = getUUIDFromAddressOfNormalAccount(address);

        const nameLastUpdatedAt = this.#populateExistingMetadata(
          id,
          'nameLastUpdatedAt',
        );

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
          scopes: [EthScope.Eoa],
          type: EthAccountType.Eoa,
          metadata: {
            name: this.#populateExistingMetadata(id, 'name') ?? '',
            ...(nameLastUpdatedAt && { nameLastUpdatedAt }),
            importTime:
              this.#populateExistingMetadata(id, 'importTime') ?? Date.now(),
            lastSelected:
              this.#populateExistingMetadata(id, 'lastSelected') ?? 0,
            keyring: {
              type: keyringType,
            },
          },
        });
      }
    }

    return internalAccounts;
  }

  /**
   * Re-publish an account event.
   *
   * @param event - The event type. This is a unique identifier for this event.
   * @param payload - The event payload. The type of the parameters for each event handler must
   * match the type of this payload.
   * @template EventType - A Snap keyring event type.
   */
  #handleOnSnapKeyringAccountEvent<
    EventType extends AccountsControllerEvents['type'],
  >(
    event: EventType,
    ...payload: ExtractEventPayload<AccountsControllerEvents, EventType>
  ): void {
    this.messagingSystem.publish(event, ...payload);
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
        this.listMultichainAccounts().reduce(
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

      this.update((currentState) => {
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
          const lastSelectedAccount =
            this.#getLastSelectedAccount(existingAccounts);

          if (lastSelectedAccount) {
            currentState.internalAccounts.selectedAccount =
              lastSelectedAccount.id;
            currentState.internalAccounts.accounts[
              lastSelectedAccount.id
            ].metadata.lastSelected = this.#getLastSelectedIndex();
            this.#publishAccountChangeEvent(lastSelectedAccount);
          } else {
            // It will be undefined if there are no accounts
            currentState.internalAccounts.selectedAccount = '';
          }
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
    const accounts = this.listMultichainAccounts().filter(
      (account) => account.metadata.snap,
    );

    this.update((currentState) => {
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
   *
   * @param keyringType - The type of keyring.
   * @param accounts - Accounts to filter by keyring type.
   * @returns The list of accounts associcated with this keyring type.
   */
  #getAccountsByKeyringType(keyringType: string, accounts?: InternalAccount[]) {
    return (accounts ?? this.listMultichainAccounts()).filter(
      (internalAccount) => {
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
      },
    );
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
    const [accountToSelect] = accounts.sort((accountA, accountB) => {
      // sort by lastSelected descending
      return (
        (accountB.metadata.lastSelected ?? 0) -
        (accountA.metadata.lastSelected ?? 0)
      );
    });

    return accountToSelect;
  }

  /**
   * Returns the next account number for a given keyring type.
   *
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
   * Retrieves the index value for `metadata.lastSelected`.
   *
   * @returns The index value.
   */
  #getLastSelectedIndex() {
    // NOTE: For now we use the current date, since we know this value
    // will always be higher than any already selected account index.
    return Date.now();
  }

  /**
   * Handles the addition of a new account to the controller.
   * If the account is not a Snap Keyring account, generates an internal account for it and adds it to the controller.
   * If the account is a Snap Keyring account, retrieves the account from the keyring and adds it to the controller.
   *
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

    const isFirstAccount = Object.keys(accountsState).length === 0;

    // Get next account name available for this given keyring
    const accountName = this.getNextAvailableAccountName(
      newAccount.metadata.keyring.type,
      Object.values(accountsState),
    );

    const newAccountWithUpdatedMetadata = {
      ...newAccount,
      metadata: {
        ...newAccount.metadata,
        name: accountName,
        importTime: Date.now(),
        lastSelected: isFirstAccount ? this.#getLastSelectedIndex() : 0,
      },
    };
    accountsState[newAccount.id] = newAccountWithUpdatedMetadata;

    this.messagingSystem.publish(
      'AccountsController:accountAdded',
      newAccountWithUpdatedMetadata,
    );

    return accountsState;
  }

  #publishAccountChangeEvent(account: InternalAccount) {
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
   * Handles the removal of an account from the internal accounts list.
   *
   * @param accountsState - AccountsController accounts state that is to be mutated.
   * @param accountId - The ID of the account to be removed.
   * @returns The updated AccountsController state.
   */
  #handleAccountRemoved(
    accountsState: AccountsControllerState['internalAccounts']['accounts'],
    accountId: string,
  ): AccountsControllerState['internalAccounts']['accounts'] {
    delete accountsState[accountId];

    this.messagingSystem.publish(
      'AccountsController:accountRemoved',
      accountId,
    );

    return accountsState;
  }

  /**
   * Handles the change in multichain network by updating the selected account.
   *
   * @param id - The EVM client ID or non-EVM chain ID that changed.
   */
  #handleOnMultichainNetworkDidChange(id: NetworkClientId | CaipChainId) {
    let accountId: string;

    // We only support non-EVM Caip chain IDs at the moment. Ex Solana and Bitcoin
    // MultichainNetworkController will handle throwing an error if the Caip chain ID is not supported
    if (isCaipChainId(id)) {
      // Update selected account to non evm account
      const lastSelectedNonEvmAccount = this.getSelectedMultichainAccount(id);
      // @ts-expect-error - This should never be undefined, otherwise it's a bug that should be handled
      accountId = lastSelectedNonEvmAccount.id;
    } else {
      // Update selected account to evm account
      const lastSelectedEvmAccount = this.getSelectedAccount();
      accountId = lastSelectedEvmAccount.id;
    }

    this.update((currentState) => {
      currentState.internalAccounts.accounts[accountId].metadata.lastSelected =
        Date.now();
      currentState.internalAccounts.selectedAccount = accountId;
    });

    // DO NOT publish AccountsController:setSelectedAccount to prevent circular listener loops
  }

  /**
   * Retrieves the value of a specific metadata key for an existing account.
   *
   * @param accountId - The ID of the account.
   * @param metadataKey - The key of the metadata to retrieve.
   * @param account - The account object to retrieve the metadata key from.
   * @returns The value of the specified metadata key, or undefined if the account or metadata key does not exist.
   */
  // TODO: Either fix this lint violation or explain why it's necessary to ignore.
  #populateExistingMetadata<T extends keyof InternalAccount['metadata']>(
    accountId: string,
    metadataKey: T,
    account?: InternalAccount,
  ): InternalAccount['metadata'][T] | undefined {
    const internalAccount = account ?? this.getAccount(accountId);
    return internalAccount ? internalAccount.metadata[metadataKey] : undefined;
  }

  /**
   * Subscribes to message events.
   */
  #subscribeToMessageEvents() {
    this.messagingSystem.subscribe(
      'SnapController:stateChange',
      (snapStateState) => this.#handleOnSnapStateChange(snapStateState),
    );

    this.messagingSystem.subscribe(
      'KeyringController:stateChange',
      (keyringState) => this.#handleOnKeyringStateChange(keyringState),
    );

    this.messagingSystem.subscribe(
      'SnapKeyring:accountAssetListUpdated',
      (snapAccountEvent) =>
        this.#handleOnSnapKeyringAccountEvent(
          'AccountsController:accountAssetListUpdated',
          snapAccountEvent,
        ),
    );

    this.messagingSystem.subscribe(
      'SnapKeyring:accountBalancesUpdated',
      (snapAccountEvent) =>
        this.#handleOnSnapKeyringAccountEvent(
          'AccountsController:accountBalancesUpdated',
          snapAccountEvent,
        ),
    );

    this.messagingSystem.subscribe(
      'SnapKeyring:accountTransactionsUpdated',
      (snapAccountEvent) =>
        this.#handleOnSnapKeyringAccountEvent(
          'AccountsController:accountTransactionsUpdated',
          snapAccountEvent,
        ),
    );

    // Handle account change when multichain network is changed
    this.messagingSystem.subscribe(
      'MultichainNetworkController:networkDidChange',
      (id) => this.#handleOnMultichainNetworkDidChange(id),
    );
  }

  /**
   * Registers message handlers for the AccountsController.
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

    this.messagingSystem.registerActionHandler(
      `AccountsController:updateAccountMetadata`,
      this.updateAccountMetadata.bind(this),
    );
  }
}
