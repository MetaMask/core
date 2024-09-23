import { createSHA256Hash } from './encryption';

/**
 * The User Storage Endpoint requires a feature name and a namespace key.
 * Developers can provide additional features and keys by extending these types below.
 *
 * Adding ALLOW_ARBITRARY_KEYS as the first key in the array allows for any key to be used for this feature.
 * This can be useful for features where keys are not deterministic (eg. accounts addresses).
 */
const ALLOW_ARBITRARY_KEYS = 'ALLOW_ARBITRARY_KEYS' as const;

export const USER_STORAGE_SCHEMA = {
  notifications: ['notification_settings'],
  accounts: [ALLOW_ARBITRARY_KEYS], // keyed by account addresses
  networks: [ALLOW_ARBITRARY_KEYS], // keyed by chains/networks
} as const;

type UserStorageSchema = typeof USER_STORAGE_SCHEMA;

export type UserStorageFeatures = keyof UserStorageSchema;
export type UserStorageFeatureKeys<Feature extends UserStorageFeatures> =
  UserStorageSchema[Feature][0] extends typeof ALLOW_ARBITRARY_KEYS
    ? string
    : UserStorageSchema[Feature][number];

type UserStorageFeatureAndKey = {
  feature: UserStorageFeatures;
  key: UserStorageFeatureKeys<UserStorageFeatures>;
};

export type UserStoragePathWithFeatureOnly = keyof UserStorageSchema;
export type UserStoragePathWithKeyOnly = {
  [K in UserStorageFeatures]: `${UserStorageFeatureKeys<K>}`;
}[UserStoragePathWithFeatureOnly];
export type UserStoragePathWithFeatureAndKey = {
  [K in UserStorageFeatures]: `${K}.${UserStorageFeatureKeys<K>}`;
}[UserStoragePathWithFeatureOnly];

export const getFeatureAndKeyFromPath = (
  path: UserStoragePathWithFeatureAndKey,
): UserStorageFeatureAndKey => {
  const pathRegex = /^\w+\.\w+$/u;

  if (!pathRegex.test(path)) {
    throw new Error(
      `user-storage - path is not in the correct format. Correct format: 'feature.key'`,
    );
  }

  const [feature, key] = path.split('.') as [
    UserStorageFeatures,
    UserStorageFeatureKeys<UserStorageFeatures>,
  ];

  if (!(feature in USER_STORAGE_SCHEMA)) {
    throw new Error(`user-storage - invalid feature provided: ${feature}`);
  }

  const validFeature = USER_STORAGE_SCHEMA[feature] as readonly string[];

  if (
    !validFeature.includes(key) &&
    !validFeature.includes(ALLOW_ARBITRARY_KEYS)
  ) {
    const validKeys = USER_STORAGE_SCHEMA[feature].join(', ');

    throw new Error(
      `user-storage - invalid key provided for this feature: ${key}. Valid keys: ${validKeys}`,
    );
  }

  return { feature, key };
};

export const isPathWithFeatureAndKey = (
  path: string,
): path is UserStoragePathWithFeatureAndKey => {
  const pathRegex = /^\w+\.\w+$/u;

  return pathRegex.test(path);
};

/**
 * Constructs a unique entry path for a user.
 * This can be done due to the uniqueness of the storage key (no users will share the same storage key).
 * The users entry is a unique hash that cannot be reversed.
 *
 * @param path - string in the form of `${feature}.${key}` that matches schema
 * @param storageKey - users storage key
 * @returns path to store entry
 */
export function createEntryPath(
  path: UserStoragePathWithFeatureAndKey,
  storageKey: string,
): string {
  const { feature, key } = getFeatureAndKeyFromPath(path);
  const hashedKey = createSHA256Hash(key + storageKey);

  return `${feature}/${hashedKey}`;
}
