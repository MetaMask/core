import type {
  UserStorageGenericPathWithFeatureAndKey,
  UserStorageGenericPathWithFeatureOnly,
} from '../../shared/storage-schema';
import type { NativeScrypt } from '../../shared/types/encryption';

export type UserStorageBaseOptions = {
  bearerToken: string;
  storageKey: string;
  nativeScryptCrypto?: NativeScrypt;
};

export type UserStorageOptions = UserStorageBaseOptions & {
  path: UserStorageGenericPathWithFeatureAndKey;
};

export type UserStorageAllFeatureEntriesOptions = UserStorageBaseOptions & {
  path: UserStorageGenericPathWithFeatureOnly;
};

export type UserStorageBatchUpsertOptions = UserStorageAllFeatureEntriesOptions;

export type GetUserStorageResponse = {
  HashedKey: string;
  Data: string;
};

export type GetUserStorageAllFeatureEntriesResponse = {
  HashedKey: string;
  Data: string;
}[];
