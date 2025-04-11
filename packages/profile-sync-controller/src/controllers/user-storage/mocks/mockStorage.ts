import encryption, { createSHA256Hash } from '../../../shared/encryption';

export const MOCK_STORAGE_KEY_SIGNATURE = 'mockStorageKey';
export const MOCK_STORAGE_KEY = createSHA256Hash(MOCK_STORAGE_KEY_SIGNATURE);
export const MOCK_STORAGE_DATA = JSON.stringify({ hello: 'world' });
export const MOCK_ENCRYPTION_PRIVATE_KEY = '29411742c5cf3d7eb1a0cf57230488900e86778c876078fb87164ec6864841cd';
export const MOCK_ENCRYPTION_PUBLIC_KEY = '37a3160dda3e0086a89974854f1ba7c3e6b1bc960e06311bcc4c15264d95ee36';

// NOTE - using encryption.encryptString directly in fixtures causes issues on mobile.
// This is because this fixture is getting added in at run time. Will be improved once we support multiple exports
let cachedMockEncryptedData: string;
export const MOCK_ENCRYPTED_STORAGE_DATA = async (data?: string) =>
  (cachedMockEncryptedData ??= await encryption.encryptString(
    data ?? MOCK_STORAGE_DATA,
    MOCK_STORAGE_KEY,
  ));
