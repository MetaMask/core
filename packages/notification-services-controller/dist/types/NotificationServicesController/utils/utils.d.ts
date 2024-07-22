import type { TRIGGER_TYPES } from '../constants/notification-schema';
import type { UserStorage } from '../types/user-storage/user-storage';
export type NotificationTrigger = {
    id: string;
    chainId: string;
    kind: string;
    address: string;
    enabled: boolean;
};
type MapTriggerFn<Result> = (trigger: NotificationTrigger) => Result | undefined;
type TraverseTriggerOpts<Result> = {
    address?: string;
    mapTrigger?: MapTriggerFn<Result>;
};
/**
 * Create a completely new user storage object with the given accounts and state.
 * This method initializes the user storage with a version key and iterates over each account to populate it with triggers.
 * Each trigger is associated with supported chains, and for each chain, a unique identifier (UUID) is generated.
 * The trigger object contains a kind (`k`) indicating the type of trigger and an enabled state (`e`).
 * The kind and enabled state are stored with abbreviated keys to reduce the JSON size.
 *
 * This is used primarily for creating a new user storage (e.g. when first signing in/enabling notification profile syncing),
 * caution is needed in case you need to remove triggers that you don't want (due to notification setting filters)
 *
 * @param accounts - An array of account objects, each optionally containing an address.
 * @param state - A boolean indicating the initial enabled state for all triggers in the user storage.
 * @returns A `UserStorage` object populated with triggers for each account and chain.
 */
export declare function initializeUserStorage(accounts: {
    address?: string;
}[], state: boolean): UserStorage;
/**
 * Iterates over user storage to find and optionally transform notification triggers.
 * This method allows for flexible retrieval and transformation of triggers based on provided options.
 *
 * @param userStorage - The user storage object containing notification triggers.
 * @param options - Optional parameters to filter and map triggers:
 * - `address`: If provided, only triggers for this address are considered.
 * - `mapTrigger`: A function to transform each trigger. If not provided, triggers are returned as is.
 * @returns An array of triggers, potentially transformed by the `mapTrigger` function.
 */
export declare function traverseUserStorageTriggers<ResultTriggers = NotificationTrigger>(userStorage: UserStorage, options?: TraverseTriggerOpts<ResultTriggers>): ResultTriggers[];
/**
 * Verifies the presence of specified accounts and their chains in the user storage.
 * This method checks if each provided account exists in the user storage and if all its supported chains are present.
 *
 * @param userStorage - The user storage object containing notification triggers.
 * @param accounts - An array of account addresses to check for presence.
 * @returns A record where each key is an account address and each value is a boolean indicating whether the account and all its supported chains are present in the user storage.
 */
export declare function checkAccountsPresence(userStorage: UserStorage, accounts: string[]): Record<string, boolean>;
/**
 * Infers and returns an array of enabled notification trigger kinds from the user storage.
 * This method counts the occurrences of each kind of trigger and returns the kinds that are present.
 *
 * @param userStorage - The user storage object containing notification triggers.
 * @returns An array of trigger kinds (`TRIGGER_TYPES`) that are enabled in the user storage.
 */
export declare function inferEnabledKinds(userStorage: UserStorage): TRIGGER_TYPES[];
/**
 * Retrieves all UUIDs associated with a specific account address from the user storage.
 * This function utilizes `traverseUserStorageTriggers` with a mapping function to extract
 * just the UUIDs of the notification triggers for the given address.
 *
 * @param userStorage - The user storage object containing notification triggers.
 * @param address - The specific account address to retrieve UUIDs for.
 * @returns An array of UUID strings associated with the given account address.
 */
export declare function getUUIDsForAccount(userStorage: UserStorage, address: string): string[];
/**
 * Retrieves all UUIDs from the user storage, regardless of the account address or chain ID.
 * This method leverages `traverseUserStorageTriggers` with a specific mapping function (`triggerToId`)
 * to extract only the UUIDs from all notification triggers present in the user storage.
 *
 * @param userStorage - The user storage object containing notification triggers.
 * @returns An array of UUID strings from all notification triggers in the user storage.
 */
export declare function getAllUUIDs(userStorage: UserStorage): string[];
/**
 * Retrieves UUIDs for notification triggers that match any of the specified kinds.
 * This method filters triggers based on their kind and returns an array of UUIDs for those that match the allowed kinds.
 * It utilizes `traverseUserStorageTriggers` with a custom mapping function that checks if a trigger's kind is in the allowed list.
 *
 * @param userStorage - The user storage object containing notification triggers.
 * @param allowedKinds - An array of kinds (as strings) to filter the triggers by.
 * @returns An array of UUID strings for triggers that match the allowed kinds.
 */
export declare function getUUIDsForKinds(userStorage: UserStorage, allowedKinds: string[]): string[];
/**
 * Retrieves notification triggers for a specific account address that match any of the specified kinds.
 * This method filters triggers both by the account address and their kind, returning triggers that match the allowed kinds for the specified address.
 * It leverages `traverseUserStorageTriggers` with a custom mapping function to filter and return only the relevant triggers.
 *
 * @param userStorage - The user storage object containing notification triggers.
 * @param address - The specific account address for which to retrieve triggers.
 * @param allowedKinds - An array of trigger kinds (`TRIGGER_TYPES`) to filter the triggers by.
 * @returns An array of `NotificationTrigger` objects that match the allowed kinds for the specified account address.
 */
export declare function getUUIDsForAccountByKinds(userStorage: UserStorage, address: string, allowedKinds: TRIGGER_TYPES[]): NotificationTrigger[];
/**
 * Upserts (updates or inserts) notification triggers for a given account across all supported chains.
 * This method ensures that each supported trigger type exists for each chain associated with the account.
 * If a trigger type does not exist for a chain, it creates a new trigger with a unique UUID.
 *
 * @param _account - The account address for which to upsert triggers. The address is normalized to lowercase.
 * @param userStorage - The user storage object to be updated with new or existing triggers.
 * @returns The updated user storage object with upserted triggers for the specified account.
 */
export declare function upsertAddressTriggers(_account: string, userStorage: UserStorage): UserStorage;
/**
 * Upserts (updates or inserts) notification triggers of a specific type across all accounts and chains in user storage.
 * This method ensures that a trigger of the specified type exists for each account and chain. If a trigger of the specified type
 * does not exist for an account and chain, it creates a new trigger with a unique UUID.
 *
 * @param triggerType - The type of trigger to upsert across all accounts and chains.
 * @param userStorage - The user storage object to be updated with new or existing triggers of the specified type.
 * @returns The updated user storage object with upserted triggers of the specified type for all accounts and chains.
 */
export declare function upsertTriggerTypeTriggers(triggerType: TRIGGER_TYPES, userStorage: UserStorage): UserStorage;
/**
 * Toggles the enabled status of a user storage trigger.
 *
 * @param userStorage - The user storage object.
 * @param address - The user's address.
 * @param chainId - The chain ID.
 * @param uuid - The unique identifier for the trigger.
 * @param enabled - The new enabled status.
 * @returns The updated user storage object.
 */
export declare function toggleUserStorageTriggerStatus(userStorage: UserStorage, address: string, chainId: string, uuid: string, enabled: boolean): UserStorage;
/**
 * Performs an API call with automatic retries on failure.
 *
 * @param bearerToken - The JSON Web Token for authorization.
 * @param endpoint - The URL of the API endpoint to call.
 * @param method - The HTTP method ('POST' or 'DELETE').
 * @param body - The body of the request. It should be an object that can be serialized to JSON.
 * @returns A Promise that resolves to the response of the fetch request.
 */
export declare function makeApiCall<Body>(bearerToken: string, endpoint: string, method: 'POST' | 'DELETE', body: Body): Promise<Response>;
export {};
//# sourceMappingURL=utils.d.ts.map