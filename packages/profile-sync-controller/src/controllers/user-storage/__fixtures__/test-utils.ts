import type nock from 'nock';

import encryption from '../../../shared/encryption/encryption';
import type {
  GetUserStorageAllFeatureEntriesResponse,
  GetUserStorageResponse,
} from '../services';
import { MOCK_STORAGE_KEY } from './mockStorage';

/**
 * Test Utility - creates a realistic mock user-storage entry
 * @param data - data to encrypt
 * @returns user storage entry
 */
export async function createMockUserStorageEntry(
  data: unknown,
): Promise<GetUserStorageResponse> {
  return {
    HashedKey: 'HASHED_KEY',
    Data: await encryption.encryptString(
      JSON.stringify(data),
      MOCK_STORAGE_KEY,
    ),
  };
}

/**
 * Test Utility - creates a realistic mock user-storage get-all entry
 * @param data - data array to encrypt
 * @returns user storage entry
 */
export async function createMockUserStorageEntries(
  data: unknown[],
): Promise<GetUserStorageAllFeatureEntriesResponse> {
  return await Promise.all(data.map((d) => createMockUserStorageEntry(d)));
}

/**
 * Test Utility - decrypts a realistic batch upsert payload
 * @param requestBody - nock body
 * @param storageKey - storage key
 * @returns decrypted body
 */
export async function decryptBatchUpsertBody(
  requestBody: nock.Body,
  storageKey: string,
) {
  if (typeof requestBody === 'string') {
    return requestBody;
  }
  return await Promise.all(
    Object.entries<string>(requestBody.data).map(
      async ([entryKey, entryValue]) => {
        return [
          entryKey,
          await encryption.decryptString(entryValue, storageKey),
        ];
      },
    ),
  );
}

type WaitForOptions = {
  intervalMs?: number;
  timeoutMs?: number;
};

/**
 * Testing Utility - waitFor. Waits for and checks (at an interval) if assertion is reached.
 *
 * @param assertionFn - assertion function
 * @param options - set wait for options
 * @returns promise that you need to await in tests
 */
export const waitFor = async (
  assertionFn: () => void,
  options: WaitForOptions = {},
): Promise<void> => {
  const { intervalMs = 50, timeoutMs = 2000 } = options;

  const startTime = Date.now();

  return new Promise<void>((resolve, reject) => {
    const intervalId = setInterval(() => {
      try {
        assertionFn();
        clearInterval(intervalId);
        resolve();
      } catch (error) {
        if (Date.now() - startTime >= timeoutMs) {
          clearInterval(intervalId);
          reject(new Error(`waitFor: timeout reached after ${timeoutMs}ms`));
        }
      }
    }, intervalMs);
  });
};
