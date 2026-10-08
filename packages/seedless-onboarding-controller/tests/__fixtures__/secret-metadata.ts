import type { FetchedSecretDataItem } from '@metamask/toprf-secure-backup';
import { EncAccountDataType } from '@metamask/toprf-secure-backup';
import { stringToBytes } from '@metamask/utils';

import { SecretType } from '../../src/constants.js';
import { SecretMetadata } from '../../src/SecretMetadata.js';

export type FetchedSecretDataItemMock = {
  data: string;
  timestamp: number;
  itemId?: string;
  type?: SecretType;
  dataType?: EncAccountDataType;
  version?: 'v1' | 'v2';
  createdAt?: string;
  storageVersion?: 'v1' | 'v2';
};

export const SRP1 = {
  data: 'first srp',
  timestamp: 100,
  itemId: 'srp-1',
} satisfies FetchedSecretDataItemMock;

export const SRP2 = {
  data: 'second srp',
  timestamp: 200,
  itemId: 'srp-2',
} satisfies FetchedSecretDataItemMock;

export const PrivateKey1 = {
  data: 'private key',
  timestamp: 50,
  type: SecretType.PrivateKey,
  itemId: 'private-key-1',
} satisfies FetchedSecretDataItemMock;

export const PrivateKey2 = {
  data: 'another private key',
  timestamp: 200,
  type: SecretType.PrivateKey,
  itemId: 'private-key-2',
} satisfies FetchedSecretDataItemMock;

export const ImportedSRP1 = {
  ...SRP1,
  dataType: EncAccountDataType.ImportedSrp,
} satisfies FetchedSecretDataItemMock;

export const PrimarySRP2 = {
  ...SRP2,
  dataType: EncAccountDataType.PrimarySrp,
} satisfies FetchedSecretDataItemMock;

export const ImportedPrivateKey1 = {
  ...PrivateKey1,
  dataType: EncAccountDataType.ImportedPrivateKey,
} satisfies FetchedSecretDataItemMock;

export const ImportedPrivateKey2 = {
  ...PrivateKey2,
  dataType: EncAccountDataType.ImportedPrivateKey,
} satisfies FetchedSecretDataItemMock;

/**
 * Build a fetched secret-data item from a shared mock.
 *
 * @param mock - The secret metadata fields to encode.
 * @returns A fetched secret-data item whose payload matches the mock.
 */
export function createFetchedSecretDataItem(
  mock: FetchedSecretDataItemMock,
): FetchedSecretDataItem {
  const {
    data,
    timestamp,
    itemId,
    type = SecretType.Mnemonic,
    dataType,
    version,
    createdAt,
  } = mock;
  const metadata = new SecretMetadata(stringToBytes(data), {
    timestamp,
    type,
    ...(dataType === undefined ? {} : { dataType }),
  });

  return {
    data: metadata.toBytes(),
    itemId,
    version: version ?? (dataType === undefined ? 'v1' : 'v2'),
    dataType,
    ...(createdAt === undefined ? {} : { createdAt }),
  } as FetchedSecretDataItem;
}

/**
 * Build secret metadata for a one-off test secret.
 *
 * @param data - The secret value.
 * @param options - Metadata fields that describe the secret.
 * @returns Secret metadata for the supplied fields.
 */
export function createSecretMetadata(
  data: string,
  options: Omit<FetchedSecretDataItemMock, 'data' | 'timestamp'> = {},
): SecretMetadata {
  return createSecretMetadataFromMock({ data, timestamp: Date.now() }, options);
}

/**
 * Build secret metadata from a shared mock.
 *
 * @param mock - The secret metadata fields to store.
 * @param overrides - Fields that differ from the shared mock.
 * @returns Secret metadata for the combined fields.
 */
export function createSecretMetadataFromMock(
  mock: FetchedSecretDataItemMock,
  overrides: Partial<FetchedSecretDataItemMock> = {},
): SecretMetadata {
  const { data, timestamp, type, itemId, dataType, storageVersion } = {
    ...mock,
    ...overrides,
  };

  return new SecretMetadata(stringToBytes(data), {
    timestamp,
    ...(type === undefined ? {} : { type }),
    ...(itemId === undefined ? {} : { itemId }),
    ...(dataType === undefined ? {} : { dataType }),
    ...(storageVersion === undefined ? {} : { storageVersion }),
  });
}
