import type { UserStoragePath } from './schema';
export declare const USER_STORAGE_API: string;
export declare const USER_STORAGE_ENDPOINT: string;
/**
 * This is the Server Response shape
 */
export type GetUserStorageResponse = {
    HashedKey: string;
    Data: string;
};
export type UserStorageOptions = {
    path: UserStoragePath;
    bearerToken: string;
    storageKey: string;
};
/**
 * User Storage Service - Get Storage Entry.
 *
 * @param opts - User Storage Options
 * @returns The storage entry, or null if fails to find entry
 */
export declare function getUserStorage(opts: UserStorageOptions): Promise<string | null>;
/**
 * User Storage Service - Set Storage Entry.
 *
 * @param data - data to store
 * @param opts - storage options
 */
export declare function upsertUserStorage(data: string, opts: UserStorageOptions): Promise<void>;
//# sourceMappingURL=services.d.ts.map