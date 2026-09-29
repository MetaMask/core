import type { FetchedSecretDataItem } from '@metamask/toprf-secure-backup';
import { EncAccountDataType } from '@metamask/toprf-secure-backup';
import { stringToBytes } from '@metamask/utils';

import { SecretType } from '../constants.js';
import { SecretMetadata } from '../SecretMetadata.js';
import {
  identifyIncompleteMetadataBackup,
  SeedlessPrimarySrpMismatchEventName,
  SeedlessPrimarySrpMissingEventName,
} from './analytics.js';

function createFetchedSecretDataItemMock({
  data,
  timestamp,
  type = SecretType.Mnemonic,
  itemId = `${type}-${timestamp}`,
  dataType,
  version,
}: {
  data: string;
  timestamp: number;
  type?: SecretType;
  itemId?: string;
  dataType?: EncAccountDataType;
  version?: 'v1' | 'v2';
}): FetchedSecretDataItem {
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
  } as FetchedSecretDataItem;
}

function expectEvent(
  trackEvent: jest.Mock,
  name: string,
): void {
  expect(trackEvent).toHaveBeenCalledTimes(1);
  expect(trackEvent).toHaveBeenCalledWith(
    expect.objectContaining({ name }),
  );
}

describe('identifyIncompleteMetadataBackup', () => {
  it('does not track an event when the legacy primary matches the local primary', async () => {
    const fetchAllSecretDataFn = jest.fn().mockResolvedValue([
      createFetchedSecretDataItemMock({
        data: 'private key',
        timestamp: 50,
        type: SecretType.PrivateKey,
      }),
      createFetchedSecretDataItemMock({
        data: 'primary srp',
        timestamp: 100,
      }),
      createFetchedSecretDataItemMock({
        data: 'imported srp',
        timestamp: 200,
      }),
    ]);
    const getPrimaryKeyringSeedPhraseFn = jest
      .fn()
      .mockResolvedValue(stringToBytes('primary srp'));
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
    const fetchAllSecretDataFn = jest.fn().mockResolvedValue([
      createFetchedSecretDataItemMock({
        data: 'imported srp',
        timestamp: 100,
      }),
      createFetchedSecretDataItemMock({
        data: 'another imported srp',
        timestamp: 200,
      }),
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

    expectEvent(trackEvent, SeedlessPrimarySrpMismatchEventName);
    expect(logFn).not.toHaveBeenCalled();
  });

  it('uses the explicitly tagged V2 primary when it matches the local primary', async () => {
    const fetchAllSecretDataFn = jest.fn().mockResolvedValue([
      createFetchedSecretDataItemMock({
        data: 'imported srp',
        timestamp: 100,
        dataType: EncAccountDataType.ImportedSrp,
      }),
      createFetchedSecretDataItemMock({
        data: 'primary srp',
        timestamp: 200,
        dataType: EncAccountDataType.PrimarySrp,
      }),
    ]);
    const getPrimaryKeyringSeedPhraseFn = jest
      .fn()
      .mockResolvedValue(stringToBytes('primary srp'));
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
    const fetchAllSecretDataFn = jest.fn().mockResolvedValue([
      createFetchedSecretDataItemMock({
        data: 'imported srp',
        timestamp: 100,
        dataType: EncAccountDataType.ImportedSrp,
      }),
      createFetchedSecretDataItemMock({
        data: 'incorrect primary srp',
        timestamp: 200,
        dataType: EncAccountDataType.PrimarySrp,
      }),
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

    expectEvent(trackEvent, SeedlessPrimarySrpMismatchEventName);
    expect(logFn).not.toHaveBeenCalled();
  });

  it.each([
    {
      description: 'an empty response',
      secretDataItems: [],
    },
    {
      description: 'metadata containing only imported SRPs',
      secretDataItems: [
        createFetchedSecretDataItemMock({
          data: 'imported srp',
          timestamp: 100,
          dataType: EncAccountDataType.ImportedSrp,
        }),
      ],
    },
    {
      description: 'metadata containing only private keys',
      secretDataItems: [
        createFetchedSecretDataItemMock({
          data: 'private key',
          timestamp: 100,
          type: SecretType.PrivateKey,
        }),
      ],
    },
  ])('tracks a missing-primary event for $description', async ({
    secretDataItems,
  }) => {
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

    expectEvent(trackEvent, SeedlessPrimarySrpMissingEventName);
    expect(getPrimaryKeyringSeedPhraseFn).not.toHaveBeenCalled();
    expect(logFn).not.toHaveBeenCalled();
  });

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
    const fetchAllSecretDataFn = jest.fn().mockResolvedValue([
      createFetchedSecretDataItemMock({
        data: 'primary srp',
        timestamp: 100,
      }),
    ]);
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

    await expect(
      identifyIncompleteMetadataBackup({
        fetchAllSecretDataFn,
        getPrimaryKeyringSeedPhraseFn: jest.fn(),
        trackEvent,
        logFn,
      }),
    ).resolves.toBeUndefined();

    expect(trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({ name: SeedlessPrimarySrpMissingEventName }),
    );
    expect(logFn).toHaveBeenCalledWith(
      'Error tracking incomplete metadata backup event',
      trackError,
    );
  });
});
