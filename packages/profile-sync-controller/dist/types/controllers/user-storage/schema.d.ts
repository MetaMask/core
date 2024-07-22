/**
 * The User Storage Endpoint requires a feature name and a namespace key.
 * Developers can provide additional features and keys by extending these types below.
 */
export declare const USER_STORAGE_SCHEMA: {
    readonly notifications: readonly ["notificationSettings"];
};
type UserStorageSchema = typeof USER_STORAGE_SCHEMA;
type UserStorageFeatures = keyof UserStorageSchema;
type UserStorageFeatureKeys<Feature extends UserStorageFeatures> = UserStorageSchema[Feature][number];
type UserStorageFeatureAndKey = {
    feature: UserStorageFeatures;
    key: UserStorageFeatureKeys<UserStorageFeatures>;
};
export type UserStoragePath = {
    [K in keyof UserStorageSchema]: `${K}.${UserStorageSchema[K][number]}`;
}[keyof UserStorageSchema];
export declare const getFeatureAndKeyFromPath: (path: UserStoragePath) => UserStorageFeatureAndKey;
/**
 * Constructs a unique entry path for a user.
 * This can be done due to the uniqueness of the storage key (no users will share the same storage key).
 * The users entry is a unique hash that cannot be reversed.
 *
 * @param path - string in the form of `${feature}.${key}` that matches schema
 * @param storageKey - users storage key
 * @returns path to store entry
 */
export declare function createEntryPath(path: UserStoragePath, storageKey: string): string;
export {};
//# sourceMappingURL=schema.d.ts.map