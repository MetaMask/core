import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseControllerV2 } from '@metamask/base-controller';
import { SnapKeyring } from '@metamask/eth-snap-keyring';
import type { InternalAccount } from '@metamask/keyring-api';
import type {
  KeyringControllerState,
  KeyringController,
  KeyringControllerEvents,
} from '@metamask/keyring-controller';
import type {
  SnapControllerEvents,
  SnapControllerState,
} from '@metamask/snaps-controllers';
import { sha256FromString } from 'ethereumjs-util';
import type { Patch } from 'immer';
import { v4 as uuid } from 'uuid';

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

export type AccountsControllerActions = AccountsControllerGetStateAction;

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

const accountsControllerMetadata = {
  internalAccounts: {
    persist: true,
    anonymous: false,
  },
  selectedAccount: {
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
  getKeyringForAccount: KeyringController['getKeyringForAccount'];

  getKeyringByType: KeyringController['getKeyringsByType'];

  getAccounts: KeyringController['getAccounts'];

  keyringApiEnabled: boolean;

  /**
   * Constructor for AccountsController.
   *
   * @param options - The controller options.
   * @param options.messenger - The messenger object.
   * @param options.state - Initial state to set on this controller
   * @param [options.keyringApiEnabled] - The keyring API enabled flag.
   * @param options.getKeyringForAccount - Gets the keyring for a given account from the keyring controller.
   * @param options.getKeyringByType - Gets the keyring instance for the given type from the keyring controller.
   * @param options.getAccounts - Gets all the accounts from the keyring controller.
   * @param options.onKeyringStateChange - Allows subscribing to the keyring controller state changes.
   * @param options.onSnapStateChange - Allows subscribing to the snap controller state changes.
   */
  constructor({
    messenger,
    state,
    keyringApiEnabled,
    getKeyringForAccount,
    getKeyringByType,
    getAccounts,
    onSnapStateChange,
    onKeyringStateChange,
  }: {
    messenger: AccountsControllerMessenger;
    state: AccountsControllerState;
    keyringApiEnabled?: boolean;
    getKeyringForAccount: KeyringController['getKeyringForAccount'];
    getKeyringByType: KeyringController['getKeyringsByType'];
    getAccounts: KeyringController['getAccounts'];
    onKeyringStateChange: (
      listener: (keyringState: KeyringControllerState) => void,
    ) => void;
    onSnapStateChange: (
      listener: (snapState: SnapControllerState) => void,
    ) => void;
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

    this.getKeyringForAccount = getKeyringForAccount;
    this.getKeyringByType = getKeyringByType;
    this.getAccounts = getAccounts;
    this.keyringApiEnabled = Boolean(keyringApiEnabled);

    if (this.keyringApiEnabled) {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      onSnapStateChange(async (snapState: SnapControllerState) => {
        // only check if snaps changed in status
        const { snaps } = snapState;
        const accounts = this.listAccounts().filter(
          (account) => account.metadata.snap,
        );

        this.update((currentState: AccountsControllerState) => {
          accounts.forEach((account) => {
            const currentAccount =
              currentState.internalAccounts.accounts[account.id];
            if (currentAccount?.metadata?.snap) {
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore this account is guaranteed to have snap metadata
              currentState.internalAccounts.accounts[
                account.id
              ].metadata.snap.enabled =
                snaps[currentAccount.metadata.snap.id].enabled &&
                !snaps[currentAccount.metadata.snap.id].blocked;
            }
          });
        });
      });
    }

    onKeyringStateChange(
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async (keyringState: KeyringControllerState): Promise<void> => {
        // check if there are any new accounts added
        // TODO: change when accountAdded event is added to the keyring controller

        if (keyringState.isUnlocked) {
          // TODO: ACCOUNTS_CONTROLLER keyring will return accounts instead of addresses, remove this flatMap after and just get the latest id
          const updatedKeyringAddresses = keyringState.keyrings.flatMap(
            (keyring) => keyring.accounts,
          );
          const previousAccounts = this.listAccounts();

          // if there are no overlaps between the addresses in the keyring and previous accounts,
          // it means the keyring is being reinitialized because the vault is being restored with the same SRP
          const overlaps = updatedKeyringAddresses.filter((address) =>
            previousAccounts.find(
              (account) =>
                account.address.toLowerCase() === address.toLowerCase(),
            ),
          );

          await this.updateAccounts();

          if (updatedKeyringAddresses.length > previousAccounts.length) {
            this.#handleNewAccountAdded(
              updatedKeyringAddresses,
              previousAccounts,
            );
          } else if (
            updatedKeyringAddresses.length > 0 &&
            overlaps.length === 0
          ) {
            // if the keyring is being reinitialized, the selected account will be reset to the first account
            this.setSelectedAccount(this.listAccounts()[0].id);
          } else if (
            updatedKeyringAddresses.length < previousAccounts.length &&
            overlaps.length > 0 &&
            !this.getAccount(this.state.internalAccounts.selectedAccount)
          ) {
            this.#handleSelectedAccountRemoved();
          }
        }
      },
    );

    // if somehow the selected account becomes lost then select the first account
    if (
      this.state.internalAccounts.selectedAccount !== '' &&
      !this.getAccount(this.state.internalAccounts.selectedAccount)
    ) {
      this.setSelectedAccount(this.listAccounts()[0]?.id);
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
        type: 'eip155:eoa',
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

    this.messagingSystem.publish(`${this.name}:selectedAccountChange`, account);
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
   * Updates the internal accounts list by retrieving legacy and snap accounts,
   * removing duplicates, and updating the metadata of each account.
   *
   * @returns A Promise that resolves when the accounts have been updated.
   */
  async updateAccounts(): Promise<void> {
    let legacyAccounts = await this.#listLegacyAccounts();
    let snapAccounts: InternalAccount[] = [];
    if (this.keyringApiEnabled) {
      snapAccounts = await this.#listSnapAccounts();
      // remove duplicate accounts that are retrieved from the snap keyring.
      legacyAccounts = legacyAccounts.filter(
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
      ...legacyAccounts,
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
   * Returns a list of internal accounts created using the SnapKeyring.
   *
   * @returns A promise that resolves to an array of InternalAccount objects.
   */
  async #listSnapAccounts(): Promise<InternalAccount[]> {
    const [snapKeyring] = this.getKeyringByType(SnapKeyring.type);
    // snap keyring is not available until the first account is created in the keyring controller
    if (!snapKeyring) {
      return [];
    }

    const snapAccounts = await (snapKeyring as SnapKeyring).listAccounts(false);
    return snapAccounts;
  }

  /**
   * Returns a list of legacy accounts.
   * Note: listLegacyAccounts is a temporary method until the keyrings all implement the InternalAccount interface.
   * Once all keyrings implement the InternalAccount interface, this method can be removed and getAccounts can be used instead.
   *
   * @returns A Promise that resolves to an array of InternalAccount objects.
   */
  async #listLegacyAccounts(): Promise<InternalAccount[]> {
    const addresses = await this.getAccounts();
    const internalAccounts: InternalAccount[] = [];
    for (const address of addresses) {
      const keyring = await this.getKeyringForAccount(address);
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
          'eth_signTypedData',
          'eth_signTypedData_v1',
          'eth_signTypedData_v3',
          'eth_signTypedData_v4',
        ],
        type: 'eip155:eoa',
        metadata: {
          name: '',
          keyring: {
            type: (keyring as any).type as string,
          },
        },
      });
    }

    return internalAccounts.filter(
      (account) => account.metadata.keyring.type !== 'Snap Keyring',
    );
  }

  /**
   * Handles the removal of the currently selected account by selecting the previous account in the list.
   */
  #handleSelectedAccountRemoved() {
    const previousAccount = this.listAccounts()
      .filter(
        (account) => account.id !== this.state.internalAccounts.selectedAccount,
      )
      .sort((accountA, accountB) => {
        // sort by lastSelected descending
        return (
          (accountB.metadata?.lastSelected ?? 0) -
          (accountA.metadata?.lastSelected ?? 0)
        );
      })[0];

    this.setSelectedAccount(previousAccount.id);
  }

  /**
   * Handles the event when a new account is added to the keyring.
   *
   * @param updatedKeyringAddresses - An array of updated keyring addresses.
   * @param previousAccounts - An array of previous internal accounts.
   */
  #handleNewAccountAdded(
    updatedKeyringAddresses: string[],
    previousAccounts: InternalAccount[],
  ) {
    const newAddress = updatedKeyringAddresses.find(
      (address) =>
        !previousAccounts.find(
          (account) => account.address.toLowerCase() === address.toLowerCase(),
        ),
    );

    const newAccount = this.listAccounts().find(
      (account) =>
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        account.address.toLowerCase() === newAddress!.toLowerCase(),
    );

    // set the first new account as the selected account
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.setSelectedAccount(newAccount!.id);
  }
}

/**
 * Returns the name of the keyring type.
 *
 * @param keyringType - The type of the keyring.
 * @returns The name of the keyring type.
 */
export function keyringTypeToName(keyringType: string): string {
  switch (keyringType) {
    case 'Simple Key Pair': {
      return 'Account';
    }
    case 'HD Key Tree': {
      return 'Account';
    }
    case 'Trezor Hardware': {
      return 'Trezor';
    }
    case 'Ledger Hardware': {
      return 'Ledger';
    }
    case 'Lattice Hardware': {
      return 'Lattice';
    }
    case 'QR Hardware Wallet Device': {
      return 'QR';
    }
    case 'Snap Keyring': {
      return 'Snap Account';
    }
    case 'Custody': {
      return 'Custody';
    }
    default: {
      console.warn(`Unknown keyring ${keyringType}`);
      return 'Account';
    }
  }
}
