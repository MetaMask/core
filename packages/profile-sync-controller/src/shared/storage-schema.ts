import { createSHA256Hash } from './encryption';

/**
 * The User Storage Endpoint requires a feature name and a namespace key.
 * Developers can provide additional features and keys by extending these types below.
 *
 * Adding ALLOW_ARBITRARY_KEYS as the first key in the array allows for any key to be used for this feature.
 * This can be useful for features where keys are not deterministic (eg. accounts addresses).
 */
const ALLOW_ARBITRARY_KEYS = 'ALLOW_ARBITRARY_KEYS' as const;

export const USER_STORAGE_FEATURE_NAMES = {
  notifications: 'notifications',
  accounts: 'accounts_v2',
  networks: 'networks',
} as const;

export type UserStorageFeatureNames =
  (typeof USER_STORAGE_FEATURE_NAMES)[keyof typeof USER_STORAGE_FEATURE_NAMES];

export const USER_STORAGE_SCHEMA = {
  [USER_STORAGE_FEATURE_NAMES.notifications]: ['notification_settings'],
  [USER_STORAGE_FEATURE_NAMES.accounts]: [ALLOW_ARBITRARY_KEYS], // keyed by account addresses
  [USER_STORAGE_FEATURE_NAMES.networks]: [ALLOW_ARBITRARY_KEYS], // keyed by chains/networks
} as const;

type UserStorageSchema = typeof USER_STORAGE_SCHEMA;

export type UserStorageFeatureKeys<Feature extends UserStorageFeatureNames> =
  UserStorageSchema[Feature][0] extends typeof ALLOW_ARBITRARY_KEYS
    ? string
    : UserStorageSchema[Feature][number];

type UserStorageFeatureAndKey = {
  feature: UserStorageFeatureNames;
  key: UserStorageFeatureKeys<UserStorageFeatureNames>;
};

export type UserStoragePathWithFeatureOnly = UserStorageFeatureNames;
export type UserStoragePathWithFeatureAndKey = {
  [K in UserStorageFeatureNames]: `${K}.${UserStorageFeatureKeys<K>}`;
}[UserStoragePathWithFeatureOnly];

/**
 * The below types are mainly used for the SDK.
 * These exist so that the SDK can be used with arbitrary feature names and keys.
 *
 * We only type enforce feature names and keys when using UserStorageController.
 * This is done so we don't end up with magic strings within the applications.
 */

export type UserStorageGenericFeatureName = string;
export type UserStorageGenericFeatureKey = string;
export type UserStorageGenericPathWithFeatureAndKey =
  `${UserStorageGenericFeatureName}.${UserStorageGenericFeatureKey}`;
export type UserStorageGenericPathWithFeatureOnly =
  UserStorageGenericFeatureName;

type UserStorageGenericFeatureAndKey = {
  feature: UserStorageGenericFeatureName;
  key: UserStorageGenericFeatureKey;
};

export const getFeatureAndKeyFromPath = <T extends boolean>(
  path: T extends true
    ? UserStoragePathWithFeatureAndKey
    : UserStorageGenericPathWithFeatureAndKey,
  options: {
    validateAgainstSchema: T;
  } = { validateAgainstSchema: true as T },
): T extends true
  ? UserStorageFeatureAndKey
  : UserStorageGenericFeatureAndKey => {
  const pathRegex = /^\w+\.\w+$/u;

  if (!pathRegex.test(path)) {
    throw new Error(
      `user-storage - path is not in the correct format. Correct format: 'feature.key'`,
    );
  }

  const [feature, key] = path.split('.');

  if (options.validateAgainstSchema) {
    const featureToValidate = feature as UserStorageFeatureNames;
    const keyToValidate = key as UserStorageFeatureKeys<
      typeof featureToValidate
    >;

    if (!(featureToValidate in USER_STORAGE_SCHEMA)) {
      throw new Error(
        `user-storage - invalid feature provided: ${featureToValidate}. Valid features: ${Object.keys(
          USER_STORAGE_SCHEMA,
        ).join(', ')}`,
      );
    }

    const validFeature = USER_STORAGE_SCHEMA[
      featureToValidate
    ] as readonly string[];

    if (
      !validFeature.includes(keyToValidate) &&
      !validFeature.includes(ALLOW_ARBITRARY_KEYS)
    ) {
      const validKeys = USER_STORAGE_SCHEMA[featureToValidate].join(', ');

      throw new Error(
        `user-storage - invalid key provided for this feature: ${keyToValidate}. Valid keys: ${validKeys}`,
      );
    }
  }

  return { feature, key } as T extends true
    ? UserStorageFeatureAndKey
    : UserStorageGenericFeatureAndKey;
};

/**
 * Constructs a unique entry path for a user.
 * This can be done due to the uniqueness of the storage key (no users will share the same storage key).
 * The users entry is a unique hash that cannot be reversed.
 *
 * @param path - string in the form of `${feature}.${key}` that matches schema
 * @param storageKey - users storage key
 * @param options - options object
 * @param options.validateAgainstSchema - whether to validate the path against the schema.
 * This defaults to true, and should only be set to false when using the SDK with arbitrary feature names and keys.
 * @returns path to store entry
 */
export function createEntryPath<T extends boolean>(
  path: T extends true
    ? UserStoragePathWithFeatureAndKey
    : UserStorageGenericPathWithFeatureAndKey,
  storageKey: string,
  options: {
    validateAgainstSchema: T;
  } = { validateAgainstSchema: true as T },
): string {
  const { feature, key } = getFeatureAndKeyFromPath(path, options);
  const hashedKey = createSHA256Hash(key + storageKey);

  return `${feature}/${hashedKey}`;
}
