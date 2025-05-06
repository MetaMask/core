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
import type { WritableDraft } from 'immer/dist/internal.js';

import type { MultichainNetworkControllerNetworkDidChangeEvent } from './types';
import {
  getDerivationPathForIndex,
  getUUIDFromAddressOfNormalAccount,
  isHdKeyringType,
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

export type AccountsControllerSetAccountNameAndSelectAccountAction = {
  type: `${typeof controllerName}:setAccountNameAndSelectAccount`;
  handler: AccountsController['setAccountNameAndSelectAccount'];
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
  | AccountsControllerSetAccountNameAndSelectAccountAction
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
    const {
      internalAccounts: { selectedAccount },
    } = this.state;

    // Edge case where the extension is setup but the srp is not yet created
    // certain ui elements will query the selected address before any accounts are created.
    if (selectedAccount === '') {
      return EMPTY_ACCOUNT;
    }

    const account = this.getAccountExpect(selectedAccount);
    if (isEvmAccountType(account.type)) {
      return account;
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
    const {
      internalAccounts: { selectedAccount },
    } = this.state;

    // Edge case where the extension is setup but the srp is not yet created
    // certain ui elements will query the selected address before any accounts are created.
    if (selectedAccount === '') {
      return EMPTY_ACCOUNT;
    }

    if (!chainId) {
      return this.getAccountExpect(selectedAccount);
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

    this.#update((state) => {
      const { internalAccounts } = state;

      internalAccounts.accounts[account.id].metadata.lastSelected = Date.now();
      internalAccounts.selectedAccount = account.id;
    });
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
   * Sets the name of the account with the given ID and select it.
   *
   * @param accountId - The ID of the account to set the name for and select.
   * @param accountName - The new name for the account.
   * @throws An error if an account with the same name already exists.
   */
  setAccountNameAndSelectAccount(accountId: string, accountName: string): void {
    const account = this.getAccountExpect(accountId);

    this.#assertAccountCanBeRenamed(account, accountName);

    const internalAccount = {
      ...account,
      metadata: {
        ...account.metadata,
        name: accountName,
        nameLastUpdatedAt: Date.now(),
        lastSelected: this.#getLastSelectedIndex(),
      },
    };

    this.#update((state) => {
      // FIXME: Using the state as-is cause the following error: "Type instantiation is excessively
      // deep and possibly infinite.ts(2589)" (https://github.com/MetaMask/utils/issues/168)
      // Using a type-cast workaround this error and is slightly better than using a @ts-expect-error
      // which sometimes fail when compiling locally.
      (state as AccountsControllerState).internalAccounts.accounts[account.id] =
        internalAccount;
      (state as AccountsControllerState).internalAccounts.selectedAccount =
        account.id;
    });

    this.messagingSystem.publish(
      'AccountsController:accountRenamed',
      internalAccount,
    );
  }

  #assertAccountCanBeRenamed(account: InternalAccount, accountName: string) {
    if (
      this.listMultichainAccounts().find(
        (internalAccount) =>
          internalAccount.metadata.name === accountName &&
          internalAccount.id !== account.id,
      )
    ) {
      throw new Error('Account name already exists');
    }
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

    if (metadata.name) {
      this.#assertAccountCanBeRenamed(account, metadata.name);
    }

    const internalAccount = {
      ...account,
      metadata: { ...account.metadata, ...metadata },
    };

    this.#update((state) => {
      // FIXME: Using the state as-is cause the following error: "Type instantiation is excessively
      // deep and possibly infinite.ts(2589)" (https://github.com/MetaMask/utils/issues/168)
      // Using a type-cast workaround this error and is slightly better than using a @ts-expect-error
      // which sometimes fail when compiling locally.
      (state as AccountsControllerState).internalAccounts.accounts[accountId] =
        internalAccount;
    });

    if (metadata.name) {
      this.messagingSystem.publish(
        'AccountsController:accountRenamed',
        internalAccount,
      );
    }
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

    this.#update((state) => {
      state.internalAccounts.accounts = accounts;
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
   * Get Snap keyring from the keyring controller.
   *
   * @returns The Snap keyring if available.
   */
  #getSnapKeyring(): SnapKeyring | undefined {
    const [snapKeyring] = this.messagingSystem.call(
      'KeyringController:getKeyringsByType',
      SnapKeyring.type,
    );

    // Snap keyring is not available until the first account is created in the keyring
    // controller, so this might be undefined.
    return snapKeyring as SnapKeyring | undefined;
  }

  /**
   * Returns a list of internal accounts created using the SnapKeyring.
   *
   * @returns A promise that resolves to an array of InternalAccount objects.
   */
  async #listSnapAccounts(): Promise<InternalAccount[]> {
    const keyring = this.#getSnapKeyring();

    if (!keyring) {
      return [];
    }

    return keyring.listAccounts();
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
    const { keyrings, keyringsMetadata } = this.messagingSystem.call(
      'KeyringController:getState',
    );

    for (const [keyringIndex, keyring] of keyrings.entries()) {
      const keyringType = keyring.type;
      if (!isNormalKeyringType(keyringType as KeyringTypes)) {
        // We only consider "normal accounts" here, so keep looping
        continue;
      }

      for (const [accountIndex, address] of keyring.accounts.entries()) {
        const id = getUUIDFromAddressOfNormalAccount(address);

        let options = {};

        if (isHdKeyringType(keyring.type as KeyringTypes)) {
          options = {
            entropySource: keyringsMetadata[keyringIndex].id,
            // NOTE: We are not using the `hdPath` from the associated keyring here and
            // getting the keyring instance here feels a bit overkill.
            // This will be naturally fixed once every keyring start using `KeyringAccount` and implement the keyring API.
            derivationPath: getDerivationPathForIndex(accountIndex),
          };
        }

        const nameLastUpdatedAt = this.#populateExistingMetadata(
          id,
          'nameLastUpdatedAt',
        );

        internalAccounts.push({
          id,
          address,
          options,
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
   * @param keyringState.isUnlocked - True if the keyrings are unlocked, false otherwise.
   * @param keyringState.keyrings - List of all keyrings.
   */
  #handleOnKeyringStateChange({
    isUnlocked,
    keyrings,
  }: KeyringControllerState): void {
    // TODO: Change when accountAdded event is added to the keyring controller.

    // We check for keyrings length to be greater than 0 because the extension client may try execute
    // submit password twice and clear the keyring state.
    // https://github.com/MetaMask/KeyringController/blob/2d73a4deed8d013913f6ef0c9f5c0bb7c614f7d3/src/KeyringController.ts#L910
    if (!isUnlocked || keyrings.length === 0) {
      return;
    }

    // State patches.
    const generatePatch = () => {
      return {
        previous: {} as Record<string, InternalAccount>,
        added: [] as {
          address: string;
          type: string;
        }[],
        updated: [] as InternalAccount[],
        removed: [] as InternalAccount[],
      };
    };
    const patches = {
      snap: generatePatch(),
      normal: generatePatch(),
    };

    // Gets the patch object based on the keyring type (since Snap accounts and other accounts
    // are handled differently).
    const patchOf = (type: string) => {
      if (type === KeyringTypes.snap) {
        return patches.snap;
      }
      return patches.normal;
    };

    // Create a map (with lower-cased addresses) of all existing accounts.
    for (const account of this.listMultichainAccounts()) {
      const address = account.address.toLowerCase();
      const patch = patchOf(account.metadata.keyring.type);

      patch.previous[address] = account;
    }

    // Go over all keyring changes and create patches out of it.
    const addresses = new Set<string>();
    for (const keyring of keyrings) {
      const patch = patchOf(keyring.type);

      for (const accountAddress of keyring.accounts) {
        // Lower-case address to use it in the `previous` map.
        const address = accountAddress.toLowerCase();
        const account = patch.previous[address];

        if (account) {
          // If the account exists before, this might be an update.
          patch.updated.push(account);
        } else {
          // Otherwise, that's a new account.
          patch.added.push({
            address,
            type: keyring.type,
          });
        }

        // Keep track of those address to check for removed accounts later.
        addresses.add(address);
      }
    }

    // We might have accounts associated with removed keyrings, so we iterate
    // over all previous known accounts and check against the keyring addresses.
    for (const patch of [patches.snap, patches.normal]) {
      for (const [address, account] of Object.entries(patch.previous)) {
        // If a previous address is not part of the new addesses, then it got removed.
        if (!addresses.has(address)) {
          patch.removed.push(account);
        }
      }
    }

    // Diff that we will use to publish events afterward.
    const diff = {
      removed: [] as string[],
      added: [] as InternalAccount[],
    };

    this.#update((state) => {
      const { internalAccounts } = state;

      for (const patch of [patches.snap, patches.normal]) {
        for (const account of patch.removed) {
          delete internalAccounts.accounts[account.id];

          diff.removed.push(account.id);
        }

        for (const added of patch.added) {
          const account = this.#getInternalAccountFromAddressAndType(
            added.address,
            added.type,
          );

          if (account) {
            // Re-compute the list of accounts everytime, so we can make sure new names
            // are also considered.
            const accounts = Object.values(
              internalAccounts.accounts,
            ) as InternalAccount[];

            // Get next account name available for this given keyring.
            const name = this.getNextAvailableAccountName(
              account.metadata.keyring.type,
              accounts,
            );

            // If it's the first account, we need to select it.
            const lastSelected =
              accounts.length === 0 ? this.#getLastSelectedIndex() : 0;

            internalAccounts.accounts[account.id] = {
              ...account,
              metadata: {
                ...account.metadata,
                name,
                importTime: Date.now(),
                lastSelected,
              },
            };

            diff.added.push(internalAccounts.accounts[account.id]);
          }
        }
      }
    });

    // Now publish events
    for (const id of diff.removed) {
      this.messagingSystem.publish('AccountsController:accountRemoved', id);
    }

    for (const account of diff.added) {
      this.messagingSystem.publish('AccountsController:accountAdded', account);
    }

    // NOTE: Since we also track "updated" accounts with our patches, we could fire a new event
    // like `accountUpdated` (we would still need to check if anything really changed on the account).
  }

  /**
   * Update the state and fixup the currently selected account.
   *
   * @param callback - Callback for updating state, passed a draft state object.
   */
  #update(callback: (state: WritableDraft<AccountsControllerState>) => void) {
    // The currently selected account might get deleted during the update, so keep track
    // of it before doing any change.
    const previouslySelectedAccount =
      this.state.internalAccounts.selectedAccount;

    this.update((state) => {
      callback(state);

      // If the account no longer exists (or none is selected), we need to re-select another one.
      const { internalAccounts } = state;
      if (!internalAccounts.accounts[previouslySelectedAccount]) {
        const accounts = Object.values(
          internalAccounts.accounts,
        ) as InternalAccount[];

        // Get the lastly selected account (according to the current accounts).
        const lastSelectedAccount = this.#getLastSelectedAccount(accounts);
        if (lastSelectedAccount) {
          internalAccounts.selectedAccount = lastSelectedAccount.id;
          internalAccounts.accounts[
            lastSelectedAccount.id
          ].metadata.lastSelected = this.#getLastSelectedIndex();
        } else {
          // It will be undefined if there are no accounts.
          internalAccounts.selectedAccount = '';
        }
      }
    });

    // Now, we compare the newly selected account, and we send event if different.
    const { selectedAccount } = this.state.internalAccounts;
    if (selectedAccount && selectedAccount !== previouslySelectedAccount) {
      const account = this.getSelectedMultichainAccount();

      // The account should always be defined at this point, since we have already checked for
      // `selectedAccount` to be non-empty.
      if (account) {
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

    const accounts: { id: string; enabled: boolean }[] = [];
    for (const account of this.listMultichainAccounts()) {
      if (account.metadata.snap) {
        const snap: Snap = snaps[account.metadata.snap.id as SnapId];
        const enabled = snap.enabled && !snap.blocked;
        const metadata = account.metadata.snap;

        if (metadata.enabled !== enabled) {
          accounts.push({ id: account.id, enabled });
        }
      }
    }

    if (accounts.length > 0) {
      this.update((state) => {
        for (const { id, enabled } of accounts) {
          const account = state.internalAccounts.accounts[id];

          if (account.metadata.snap) {
            account.metadata.snap.enabled = enabled;
          }
        }
      });
    }
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
   * Get an internal account given an address and a keyring type.
   *
   * If the account is not a Snap Keyring account, generates an internal account for it and adds it to the controller.
   * If the account is a Snap Keyring account, retrieves the account from the keyring and adds it to the controller.
   *
   * @param address - The address of the new account.
   * @param type - The keyring type of the new account.
   * @returns The newly generated/retrieved internal account.
   */
  #getInternalAccountFromAddressAndType(
    address: string,
    type: string,
  ): InternalAccount | undefined {
    if (type === KeyringTypes.snap) {
      const keyring = this.#getSnapKeyring();

      // We need the Snap keyring to retrieve the account from its address.
      if (!keyring) {
        return undefined;
      }

      // This might be undefined if the Snap deleted the account before
      // reaching that point.
      return keyring.getAccountByAddress(address);
    }

    return this.#generateInternalAccountForNonSnapAccount(address, type);
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
      `${controllerName}:setAccountNameAndSelectAccount`,
      this.setAccountNameAndSelectAccount.bind(this),
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
