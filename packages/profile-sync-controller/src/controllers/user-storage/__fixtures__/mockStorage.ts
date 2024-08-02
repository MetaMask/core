import encryption, { createSHA256Hash } from '../encryption';

export const MOCK_STORAGE_KEY_SIGNATURE = 'mockStorageKey';
export const MOCK_STORAGE_KEY = createSHA256Hash(MOCK_STORAGE_KEY_SIGNATURE);
export const MOCK_STORAGE_DATA = JSON.stringify({ hello: 'world' });

// NOTE - bug on mobile that does not work well with encryption.encryptString on start time.
// This is because this fixture is getting added in at run time. Will be improved once we support multiple exports
export const MOCK_ENCRYPTED_STORAGE_DATA = () =>
  encryption.encryptString(MOCK_STORAGE_DATA, MOCK_STORAGE_KEY);
