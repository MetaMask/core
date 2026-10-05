import type { FetchedSecretDataItem } from '@metamask/toprf-secure-backup';
import { stringToBytes } from '@metamask/utils';

import {
  createFetchedSecretDataItem,
  createSecretMetadataFromMock,
  ImportedPrivateKey1,
  ImportedPrivateKey2,
  ImportedSRP1,
  PrimarySRP2,
  PrivateKey1,
  SRP1,
  SRP2,
} from '../../tests/__fixtures__/secret-metadata.js';
import { SecretType } from '../constants.js';
import type { IncompleteMetadataBackupEventProperties } from './analytics.js';
import {
  getIncompleteMetadataBackupEventProperties,
  identifyIncompleteMetadataBackup,
  SeedlessPrimarySrpMismatchEventName,
  SeedlessPrimarySrpMissingEventName,
} from './analytics.js';
import { parseSecretMetadata } from './secret-data-utils.js';

function expectTrackedEvent(
  trackEvent: jest.Mock,
  {
    name,
    properties,
    hasProperties,
  }: {
    name: string;
    properties: IncompleteMetadataBackupEventProperties;
    hasProperties: boolean;
  },
): void {
  expect(trackEvent).toHaveBeenCalledTimes(1);
  expect(trackEvent).toHaveBeenCalledWith({
    name,
    properties,
    sensitiveProperties: {},
    saveDataRecording: false,
    hasProperties,
  });
}

describe('identifyIncompleteMetadataBackup', () => {
  it('does not track an event when the legacy primary matches the local primary', async () => {
    const fetchAllSecretDataFn = jest
      .fn()
      .mockResolvedValue([
        createFetchedSecretDataItem(PrivateKey1),
        createFetchedSecretDataItem(SRP1),
        createFetchedSecretDataItem(SRP2),
      ]);
    const getPrimaryKeyringSeedPhraseFn = jest
      .fn()
      .mockResolvedValue(stringToBytes(SRP1.data));
    const trackEvent = jest.fn();
    const logFn = jest.fn();

    await identifyIncompleteMetadataBackup({
      fetchAllSecretDataFn,
      getPrimaryKeyringSeedPhraseFn,
      trackEvent,
      logFn,
    });

    expect(getPrimaryKeyringSeedPhraseFn).toHaveBeenCalledTimes(1);
    expect(trackEvent).not.toHaveBeenCalled();
    expect(logFn).not.toHaveBeenCalled();
  });

  it('tracks a mismatch when the earliest legacy SRP is not the local primary', async () => {
    const fetchAllSecretDataFn = jest
      .fn()
      .mockResolvedValue([
        createFetchedSecretDataItem(PrivateKey1),
        createFetchedSecretDataItem(SRP1),
        createFetchedSecretDataItem(SRP2),
      ]);
    const getPrimaryKeyringSeedPhraseFn = jest
      .fn()
      .mockResolvedValue(stringToBytes('actual primary srp'));
    const trackEvent = jest.fn();
    const logFn = jest.fn();

    await identifyIncompleteMetadataBackup({
      fetchAllSecretDataFn,
      getPrimaryKeyringSeedPhraseFn,
      trackEvent,
      logFn,
    });

    expectTrackedEvent(trackEvent, {
      name: SeedlessPrimarySrpMismatchEventName,
      properties: {
        metadata_schema_version: 'v1',
        number_of_imported_wallets: 1,
        number_of_imported_accounts: 1,
      },
      hasProperties: false,
    });
    expect(logFn).not.toHaveBeenCalled();
  });

  it('uses the explicitly tagged V2 primary when it matches the local primary', async () => {
    const fetchAllSecretDataFn = jest
      .fn()
      .mockResolvedValue([
        createFetchedSecretDataItem(ImportedSRP1),
        createFetchedSecretDataItem(PrimarySRP2),
      ]);
    const getPrimaryKeyringSeedPhraseFn = jest
      .fn()
      .mockResolvedValue(stringToBytes(PrimarySRP2.data));
    const trackEvent = jest.fn();
    const logFn = jest.fn();

    await identifyIncompleteMetadataBackup({
      fetchAllSecretDataFn,
      getPrimaryKeyringSeedPhraseFn,
      trackEvent,
      logFn,
    });

    expect(trackEvent).not.toHaveBeenCalled();
    expect(logFn).not.toHaveBeenCalled();
  });

  it('tracks a mismatch when the explicitly tagged V2 primary differs', async () => {
    const fetchAllSecretDataFn = jest
      .fn()
      .mockResolvedValue([
        createFetchedSecretDataItem(ImportedSRP1),
        createFetchedSecretDataItem(PrimarySRP2),
      ]);
    const getPrimaryKeyringSeedPhraseFn = jest
      .fn()
      .mockResolvedValue(stringToBytes('actual primary srp'));
    const trackEvent = jest.fn();
    const logFn = jest.fn();

    await identifyIncompleteMetadataBackup({
      fetchAllSecretDataFn,
      getPrimaryKeyringSeedPhraseFn,
      trackEvent,
      logFn,
    });

    expectTrackedEvent(trackEvent, {
      name: SeedlessPrimarySrpMismatchEventName,
      properties: {
        metadata_schema_version: 'v2',
        number_of_imported_wallets: 1,
        number_of_imported_accounts: 0,
      },
      hasProperties: false,
    });
    expect(logFn).not.toHaveBeenCalled();
  });

  it.each([
    {
      description: 'an empty response',
      secretDataItems: [],
      properties: {
        metadata_schema_version: 'none',
        number_of_imported_wallets: 0,
        number_of_imported_accounts: 0,
      },
    },
    {
      description: 'metadata containing only imported SRPs',
      secretDataItems: [createFetchedSecretDataItem(ImportedSRP1)],
      properties: {
        metadata_schema_version: 'v2' as const,
        number_of_imported_wallets: 1,
        number_of_imported_accounts: 0,
      },
    },
    {
      description: 'metadata containing only private keys',
      secretDataItems: [createFetchedSecretDataItem(PrivateKey1)],
      properties: {
        metadata_schema_version: 'v1' as const,
        number_of_imported_wallets: 0,
        number_of_imported_accounts: 1,
      },
    },
  ])(
    'tracks a missing-primary event for $description',
    async ({ secretDataItems, properties }) => {
      const fetchAllSecretDataFn = jest.fn().mockResolvedValue(secretDataItems);
      const getPrimaryKeyringSeedPhraseFn = jest.fn();
      const trackEvent = jest.fn();
      const logFn = jest.fn();

      await identifyIncompleteMetadataBackup({
        fetchAllSecretDataFn,
        getPrimaryKeyringSeedPhraseFn,
        trackEvent,
        logFn,
      });

      expectTrackedEvent(trackEvent, {
        name: SeedlessPrimarySrpMissingEventName,
        properties: properties as IncompleteMetadataBackupEventProperties,
        hasProperties: true,
      });
      expect(getPrimaryKeyringSeedPhraseFn).not.toHaveBeenCalled();
      expect(logFn).not.toHaveBeenCalled();
    },
  );

  it('logs fetch failures without tracking an affected-user event', async () => {
    const error = new Error('network failure');
    const fetchAllSecretDataFn = jest.fn().mockRejectedValue(error);
    const trackEvent = jest.fn();
    const logFn = jest.fn();

    await identifyIncompleteMetadataBackup({
      fetchAllSecretDataFn,
      getPrimaryKeyringSeedPhraseFn: jest.fn(),
      trackEvent,
      logFn,
    });

    expect(logFn).toHaveBeenCalledWith(
      'Error identifying incomplete metadata backup',
      error,
    );
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('logs malformed metadata without tracking an affected-user event', async () => {
    const fetchAllSecretDataFn = jest.fn().mockResolvedValue([
      {
        data: stringToBytes('malformed metadata'),
        version: 'v1',
      } as FetchedSecretDataItem,
    ]);
    const trackEvent = jest.fn();
    const logFn = jest.fn();

    await identifyIncompleteMetadataBackup({
      fetchAllSecretDataFn,
      getPrimaryKeyringSeedPhraseFn: jest.fn(),
      trackEvent,
      logFn,
    });

    expect(logFn).toHaveBeenCalledWith(
      'Error identifying incomplete metadata backup',
      expect.any(Error),
    );
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('logs local keyring failures without tracking an affected-user event', async () => {
    const error = new Error('keyring unavailable');
    const fetchAllSecretDataFn = jest
      .fn()
      .mockResolvedValue([createFetchedSecretDataItem(SRP1)]);
    const getPrimaryKeyringSeedPhraseFn = jest.fn().mockRejectedValue(error);
    const trackEvent = jest.fn();
    const logFn = jest.fn();

    await identifyIncompleteMetadataBackup({
      fetchAllSecretDataFn,
      getPrimaryKeyringSeedPhraseFn,
      trackEvent,
      logFn,
    });

    expect(logFn).toHaveBeenCalledWith(
      'Error identifying incomplete metadata backup',
      error,
    );
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('does not propagate analytics tracking failures', async () => {
    const fetchAllSecretDataFn = jest.fn().mockResolvedValue([]);
    const trackError = new Error('analytics unavailable');
    const trackEvent = jest.fn().mockRejectedValue(trackError);
    const logFn = jest.fn();

    await identifyIncompleteMetadataBackup({
      fetchAllSecretDataFn,
      getPrimaryKeyringSeedPhraseFn: jest.fn(),
      trackEvent,
      logFn,
    });

    expectTrackedEvent(trackEvent, {
      name: SeedlessPrimarySrpMissingEventName,
      properties: {
        metadata_schema_version: 'none',
        number_of_imported_wallets: 0,
        number_of_imported_accounts: 0,
      },
      hasProperties: true,
    });
    expect(logFn).toHaveBeenCalledWith(
      'Error tracking incomplete metadata backup event',
      trackError,
    );
  });
});

describe('getIncompleteMetadataBackupEventProperties', () => {
  it('excludes the oldest legacy mnemonic from the imported wallet count', () => {
    const secretMetadata = parseSecretMetadata([
      createFetchedSecretDataItem(PrivateKey1),
      createFetchedSecretDataItem(SRP2),
      createFetchedSecretDataItem(SRP1),
    ]);

    expect(
      getIncompleteMetadataBackupEventProperties(secretMetadata),
    ).toStrictEqual({
      metadata_schema_version: 'v1',
      number_of_imported_wallets: 1,
      number_of_imported_accounts: 1,
    });
  });

  it('counts v2 imported SRPs and private keys without the tagged primary', () => {
    const secretMetadata = parseSecretMetadata([
      createFetchedSecretDataItem(ImportedPrivateKey1),
      createFetchedSecretDataItem(ImportedSRP1),
      createFetchedSecretDataItem(PrimarySRP2),
    ]);

    expect(
      getIncompleteMetadataBackupEventProperties(secretMetadata),
    ).toStrictEqual({
      metadata_schema_version: 'v2',
      number_of_imported_wallets: 1,
      number_of_imported_accounts: 1,
    });
  });

  it('counts every mnemonic when none can be the primary secret', () => {
    const secretMetadata = parseSecretMetadata([
      createFetchedSecretDataItem(ImportedSRP1),
      createFetchedSecretDataItem(ImportedPrivateKey2),
    ]);

    expect(
      getIncompleteMetadataBackupEventProperties(secretMetadata),
    ).toStrictEqual({
      metadata_schema_version: 'v2',
      number_of_imported_wallets: 1,
      number_of_imported_accounts: 1,
    });
  });

  it('reports v1 when stored schema versions are mixed', () => {
    const secretMetadata = parseSecretMetadata([
      createFetchedSecretDataItem(SRP1),
      createFetchedSecretDataItem(ImportedPrivateKey2),
    ]);

    expect(
      getIncompleteMetadataBackupEventProperties(secretMetadata),
    ).toStrictEqual({
      metadata_schema_version: 'mixed',
      number_of_imported_wallets: 0,
      number_of_imported_accounts: 1,
    });
  });

  it('does not count a secret that is neither a mnemonic nor a private key', () => {
    // Technically, this should never happen, TOPRF client sdk should filter this before reaching to controller.
    // But just in case, we should handle it gracefully.
    const unknownSecret = createSecretMetadataFromMock({
      data: 'password backup',
      timestamp: 100,
      type: 'PWD_BACKUP' as SecretType,
      storageVersion: 'v1',
    });

    expect(
      getIncompleteMetadataBackupEventProperties([unknownSecret]),
    ).toStrictEqual({
      metadata_schema_version: 'v1',
      number_of_imported_wallets: 0,
      number_of_imported_accounts: 0,
    });
  });

  it('returns zero counts for an empty backup', () => {
    expect(getIncompleteMetadataBackupEventProperties([])).toStrictEqual({
      metadata_schema_version: 'none',
      number_of_imported_wallets: 0,
      number_of_imported_accounts: 0,
    });
  });
});
