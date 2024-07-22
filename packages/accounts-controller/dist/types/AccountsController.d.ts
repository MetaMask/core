import type { ControllerGetStateAction, ControllerStateChangeEvent, RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { InternalAccount } from '@metamask/keyring-api';
import { EthAccountType } from '@metamask/keyring-api';
import type { KeyringControllerGetKeyringForAccountAction, KeyringControllerGetKeyringsByTypeAction, KeyringControllerGetAccountsAction, KeyringControllerStateChangeEvent } from '@metamask/keyring-controller';
import type { SnapStateChange } from '@metamask/snaps-controllers';
import type { CaipChainId } from '@metamask/utils';
declare const controllerName = "AccountsController";
export type AccountId = string;
export type AccountsControllerState = {
    internalAccounts: {
        accounts: Record<AccountId, InternalAccount>;
        selectedAccount: string;
    };
};
export type AccountsControllerGetStateAction = ControllerGetStateAction<typeof controllerName, AccountsControllerState>;
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
export type AllowedActions = KeyringControllerGetKeyringForAccountAction | KeyringControllerGetKeyringsByTypeAction | KeyringControllerGetAccountsAction;
export type AccountsControllerActions = AccountsControllerGetStateAction | AccountsControllerSetSelectedAccountAction | AccountsControllerListAccountsAction | AccountsControllerListMultichainAccountsAction | AccountsControllerSetAccountNameAction | AccountsControllerUpdateAccountsAction | AccountsControllerGetAccountByAddressAction | AccountsControllerGetSelectedAccountAction | AccountsControllerGetNextAvailableAccountNameAction | AccountsControllerGetAccountAction | AccountsControllerGetSelectedMultichainAccountAction;
export type AccountsControllerChangeEvent = ControllerStateChangeEvent<typeof controllerName, AccountsControllerState>;
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
export type AllowedEvents = SnapStateChange | KeyringControllerStateChangeEvent;
export type AccountsControllerEvents = AccountsControllerChangeEvent | AccountsControllerSelectedAccountChangeEvent | AccountsControllerSelectedEvmAccountChangeEvent | AccountsControllerAccountAddedEvent | AccountsControllerAccountRemovedEvent;
export type AccountsControllerMessenger = RestrictedControllerMessenger<typeof controllerName, AccountsControllerActions | AllowedActions, AccountsControllerEvents | AllowedEvents, AllowedActions['type'], AllowedEvents['type']>;
export declare const EMPTY_ACCOUNT: {
    id: string;
    address: string;
    options: {};
    methods: never[];
    type: EthAccountType;
    metadata: {
        name: string;
        keyring: {
            type: string;
        };
        importTime: number;
    };
};
/**
 * Controller that manages internal accounts.
 * The accounts controller is responsible for creating and managing internal accounts.
 * It also provides convenience methods for accessing and updating the internal accounts.
 * The accounts controller also listens for keyring state changes and updates the internal accounts accordingly.
 * The accounts controller also listens for snap state changes and updates the internal accounts accordingly.
 *
 */
export declare class AccountsController extends BaseController<typeof controllerName, AccountsControllerState, AccountsControllerMessenger> {
    #private;
    /**
     * Constructor for AccountsController.
     *
     * @param options - The controller options.
     * @param options.messenger - The messenger object.
     * @param options.state - Initial state to set on this controller
     */
    constructor({ messenger, state, }: {
        messenger: AccountsControllerMessenger;
        state: AccountsControllerState;
    });
    /**
     * Returns the internal account object for the given account ID, if it exists.
     *
     * @param accountId - The ID of the account to retrieve.
     * @returns The internal account object, or undefined if the account does not exist.
     */
    getAccount(accountId: string): InternalAccount | undefined;
    /**
     * Returns an array of all evm internal accounts.
     *
     * @returns An array of InternalAccount objects.
     */
    listAccounts(): InternalAccount[];
    /**
     * Returns an array of all internal accounts.
     *
     * @param chainId - The chain ID.
     * @returns An array of InternalAccount objects.
     */
    listMultichainAccounts(chainId?: CaipChainId): InternalAccount[];
    /**
     * Returns the internal account object for the given account ID.
     *
     * @param accountId - The ID of the account to retrieve.
     * @returns The internal account object.
     * @throws An error if the account ID is not found.
     */
    getAccountExpect(accountId: string): InternalAccount;
    /**
     * Returns the last selected EVM account.
     *
     * @returns The selected internal account.
     */
    getSelectedAccount(): InternalAccount;
    /**
     * __WARNING The return value may be undefined if there isn't an account for that chain id.__
     *
     * Retrieves the last selected account by chain ID.
     *
     * @param chainId - The chain ID to filter the accounts.
     * @returns The last selected account compatible with the specified chain ID or undefined.
     */
    getSelectedMultichainAccount(chainId?: CaipChainId): InternalAccount | undefined;
    /**
     * Returns the account with the specified address.
     * ! This method will only return the first account that matches the address
     * @param address - The address of the account to retrieve.
     * @returns The account with the specified address, or undefined if not found.
     */
    getAccountByAddress(address: string): InternalAccount | undefined;
    /**
     * Sets the selected account by its ID.
     *
     * @param accountId - The ID of the account to be selected.
     */
    setSelectedAccount(accountId: string): void;
    /**
     * Sets the name of the account with the given ID.
     *
     * @param accountId - The ID of the account to set the name for.
     * @param accountName - The new name for the account.
     * @throws An error if an account with the same name already exists.
     */
    setAccountName(accountId: string, accountName: string): void;
    /**
     * Updates the internal accounts list by retrieving normal and snap accounts,
     * removing duplicates, and updating the metadata of each account.
     *
     * @returns A Promise that resolves when the accounts have been updated.
     */
    updateAccounts(): Promise<void>;
    /**
     * Loads the backup state of the accounts controller.
     *
     * @param backup - The backup state to load.
     */
    loadBackup(backup: AccountsControllerState): void;
    /**
     * Returns the next account number for a given keyring type.
     * @param keyringType - The type of keyring.
     * @param accounts - Existing accounts to check for the next available account number.
     * @returns An object containing the account prefix and index to use.
     */
    getNextAvailableAccountName(keyringType?: string, accounts?: InternalAccount[]): string;
}
export {};
//# sourceMappingURL=AccountsController.d.ts.map