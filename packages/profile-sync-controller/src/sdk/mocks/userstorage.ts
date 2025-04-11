import encryption, { createSHA256Hash } from '../../shared/encryption';
import { Env } from '../../shared/env';
import { USER_STORAGE_FEATURE_NAMES } from '../../shared/storage-schema';
import { STORAGE_URL } from '../user-storage';

// Example mock notifications storage entry (wildcard)
export const MOCK_STORAGE_URL = STORAGE_URL(
  Env.PRD,
  `${USER_STORAGE_FEATURE_NAMES.notifications}.notification_settings`,
);
export const MOCK_STORAGE_URL_ALL_FEATURE_ENTRIES = STORAGE_URL(
  Env.PRD,
  USER_STORAGE_FEATURE_NAMES.notifications,
);

export const MOCK_STORAGE_KEY_SIGNATURE = 'mockStorageKey';
export const MOCK_STORAGE_KEY = createSHA256Hash(MOCK_STORAGE_KEY_SIGNATURE);
export const MOCK_NOTIFICATIONS_DATA = '{ is_compact: false }';
export const MOCK_NOTIFICATIONS_DATA_ENCRYPTED = async (data?: string) =>
  await encryption.encryptString(
    data ?? MOCK_NOTIFICATIONS_DATA,
    MOCK_STORAGE_KEY,
  );

export const MOCK_STORAGE_RESPONSE = async (data?: string) => ({
  HashedKey: '8485d2c14c333ebca415140a276adaf546619b0efc204586b73a5d400a18a5e2',
  Data: await MOCK_NOTIFICATIONS_DATA_ENCRYPTED(data),
});
