import type {
  UserStoragePathWithFeatureAndKey,
  UserStoragePathWithFeatureOnly,
} from '../../shared/storage-schema';
import type { NativeScrypt } from '../../shared/types/encryption';

export type UserStorageBaseOptions = {
  bearerToken: string;
  storageKey: string;
  nativeScryptCrypto?: NativeScrypt;
};

export type UserStorageOptions = UserStorageBaseOptions & {
  path: UserStoragePathWithFeatureAndKey;
};

export type UserStorageAllFeatureEntriesOptions = UserStorageBaseOptions & {
  path: UserStoragePathWithFeatureOnly;
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

export enum BackupAndSyncFeatures {
  Main = 'Backup and Sync',
  Account = 'Account Syncing',
}
