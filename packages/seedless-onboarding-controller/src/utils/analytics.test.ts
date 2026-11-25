import type { AnalyticsTrackingEvent } from '@metamask/analytics-controller';
import { EncAccountDataType } from '@metamask/toprf-secure-backup';
import type { FetchedSecretDataItem } from '@metamask/toprf-secure-backup';
import { bigIntToHex, bytesToHex, stringToBytes } from '@metamask/utils';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
import {
  SecretType,
  SeedlessIdentityMismatchEventName,
  SeedlessIdentityMismatchReason,
  SeedlessIdentityMismatchSource,
  SeedlessIdentityUserIdSalt,
  SeedlessOnboardingControllerErrorMessage,
  SeedlessPrimarySrpMismatchEventName,
  SeedlessPrimarySrpMissingEventName,
} from '../constants.js';
import { serializeControlRecord } from '../envelope/envelope-keys.js';
import type { ControlRecord } from '../envelope/envelope-keys.js';
import type { IncompleteMetadataBackupEventProperties } from './analytics.js';
import {
  getIncompleteMetadataBackupEventProperties,
  trackIdentityMismatchEvent,
  trackIncompleteMetadataBackupEvents,
} from './analytics.js';
import { SeedlessOnboardingError } from './errors.js';
import { parseSecretMetadata } from './secret-data-utils.js';

const { logMock } = vi.hoisted(() => ({ logMock: vi.fn() }));

vi.mock('../logger.js', () => ({
  projectLogger: {},
  createModuleLogger: (): Mock => logMock,
}));

function expectTrackedEvent(
  trackEvent: Mock,
  {
    name,
    properties,
  }: {
    name: string;
    properties: IncompleteMetadataBackupEventProperties;
  },
): void {
  expect(trackEvent).toHaveBeenCalledTimes(1);
  expect(trackEvent).toHaveBeenCalledWith({
    name,
    properties,
    sensitiveProperties: {},
    saveDataRecording: false,
    hasProperties: true,
  });
}

describe('identifyIncompleteMetadataBackup', () => {
  beforeEach(() => {
    logMock.mockClear();
  });

  it('does not track an event when the legacy primary matches the local primary', async () => {
    const fetchAllSecretDataFn = vi
      .fn()
      .mockResolvedValue([
        createFetchedSecretDataItem(PrivateKey1),
        createFetchedSecretDataItem(SRP1),
        createFetchedSecretDataItem(SRP2),
      ]);
    const getPrimaryKeyringSeedPhraseFn = vi
      .fn()
      .mockResolvedValue(stringToBytes(SRP1.data));
    const trackEvent = vi.fn();

    await trackIncompleteMetadataBackupEvents({
      fetchAllSecretDataFn,
      getPrimaryKeyringSeedPhraseFn,
      trackEvent,
    });

    expect(getPrimaryKeyringSeedPhraseFn).toHaveBeenCalledTimes(1);
    expect(trackEvent).not.toHaveBeenCalled();
    expect(logMock).not.toHaveBeenCalled();
  });

  it('tracks a mismatch when the earliest legacy SRP is not the local primary', async () => {
    const fetchAllSecretDataFn = vi
      .fn()
      .mockResolvedValue([
        createFetchedSecretDataItem(PrivateKey1),
        createFetchedSecretDataItem(SRP1),
        createFetchedSecretDataItem(SRP2),
      ]);
    const getPrimaryKeyringSeedPhraseFn = vi
      .fn()
      .mockResolvedValue(stringToBytes('actual primary srp'));
    const trackEvent = vi.fn();

    await trackIncompleteMetadataBackupEvents({
      fetchAllSecretDataFn,
      getPrimaryKeyringSeedPhraseFn,
      trackEvent,
    });

    expectTrackedEvent(trackEvent, {
      name: SeedlessPrimarySrpMismatchEventName,
      properties: {
        metadata_schema_version: 'v1',
        number_of_imported_wallets: 1,
        number_of_imported_accounts: 1,
      },
    });
    expect(logMock).not.toHaveBeenCalled();
  });

  it('uses the explicitly tagged V2 primary when it matches the local primary', async () => {
    const fetchAllSecretDataFn = vi
      .fn()
      .mockResolvedValue([
        createFetchedSecretDataItem(ImportedSRP1),
        createFetchedSecretDataItem(PrimarySRP2),
      ]);
    const getPrimaryKeyringSeedPhraseFn = vi
      .fn()
      .mockResolvedValue(stringToBytes(PrimarySRP2.data));
    const trackEvent = vi.fn();

    await trackIncompleteMetadataBackupEvents({
      fetchAllSecretDataFn,
      getPrimaryKeyringSeedPhraseFn,
      trackEvent,
    });

    expect(trackEvent).not.toHaveBeenCalled();
    expect(logMock).not.toHaveBeenCalled();
  });

  it('tracks a mismatch when the explicitly tagged V2 primary differs', async () => {
    const fetchAllSecretDataFn = vi
      .fn()
      .mockResolvedValue([
        createFetchedSecretDataItem(ImportedSRP1),
        createFetchedSecretDataItem(PrimarySRP2),
      ]);
    const getPrimaryKeyringSeedPhraseFn = vi
      .fn()
      .mockResolvedValue(stringToBytes('actual primary srp'));
    const trackEvent = vi.fn();

    await trackIncompleteMetadataBackupEvents({
      fetchAllSecretDataFn,
      getPrimaryKeyringSeedPhraseFn,
      trackEvent,
    });

    expectTrackedEvent(trackEvent, {
      name: SeedlessPrimarySrpMismatchEventName,
      properties: {
        metadata_schema_version: 'v2',
        number_of_imported_wallets: 1,
        number_of_imported_accounts: 0,
      },
    });
    expect(logMock).not.toHaveBeenCalled();
  });

  it('ignores EnvelopeControl items mixed into the fetched items', async () => {
    const controlRecord: ControlRecord = {
      v: 1,
      seq: 1,
      passwordNamespace: {
        verifier: 'verifier',
        verifierId: 'user',
        authSk: bigIntToHex(1n),
        keyIndex: 1,
      },
      migratedAt: 1,
    };
    const controlItem = {
      data: serializeControlRecord(controlRecord),
      version: 'v2',
      dataType: EncAccountDataType.EnvelopeControl,
    } as FetchedSecretDataItem;
    const fetchAllSecretDataFn = vi
      .fn()
      .mockResolvedValue([
        createFetchedSecretDataItem(PrivateKey1),
        controlItem,
        createFetchedSecretDataItem(SRP1),
        createFetchedSecretDataItem(SRP2),
      ]);
    const getPrimaryKeyringSeedPhraseFn = vi
      .fn()
      .mockResolvedValue(stringToBytes('actual primary srp'));
    const trackEvent = vi.fn();

    await trackIncompleteMetadataBackupEvents({
      fetchAllSecretDataFn,
      getPrimaryKeyringSeedPhraseFn,
      trackEvent,
    });

    expectTrackedEvent(trackEvent, {
      name: SeedlessPrimarySrpMismatchEventName,
      properties: {
        metadata_schema_version: 'v1',
        number_of_imported_wallets: 1,
        number_of_imported_accounts: 1,
      },
    });
    expect(logMock).not.toHaveBeenCalled();
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
      const fetchAllSecretDataFn = vi.fn().mockResolvedValue(secretDataItems);
      const getPrimaryKeyringSeedPhraseFn = vi.fn();
      const trackEvent = vi.fn();

      await trackIncompleteMetadataBackupEvents({
        fetchAllSecretDataFn,
        getPrimaryKeyringSeedPhraseFn,
        trackEvent,
      });

      expectTrackedEvent(trackEvent, {
        name: SeedlessPrimarySrpMissingEventName,
        properties: properties as IncompleteMetadataBackupEventProperties,
      });
      expect(getPrimaryKeyringSeedPhraseFn).not.toHaveBeenCalled();
      expect(logMock).not.toHaveBeenCalled();
    },
  );

  it('logs fetch failures without tracking an affected-user event', async () => {
    const error = new Error('network failure');
    const fetchAllSecretDataFn = vi.fn().mockRejectedValue(error);
    const trackEvent = vi.fn();

    await trackIncompleteMetadataBackupEvents({
      fetchAllSecretDataFn,
      getPrimaryKeyringSeedPhraseFn: vi.fn(),
      trackEvent,
    });

    expect(logMock).toHaveBeenCalledWith(
      'Error identifying incomplete metadata backup',
      error,
    );
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('logs malformed metadata without tracking an affected-user event', async () => {
    const fetchAllSecretDataFn = vi.fn().mockResolvedValue([
      {
        data: stringToBytes('malformed metadata'),
        version: 'v1',
      } as FetchedSecretDataItem,
    ]);
    const trackEvent = vi.fn();

    await trackIncompleteMetadataBackupEvents({
      fetchAllSecretDataFn,
      getPrimaryKeyringSeedPhraseFn: vi.fn(),
      trackEvent,
    });

    expect(logMock).toHaveBeenCalledWith(
      'Error identifying incomplete metadata backup',
      expect.any(Error),
    );
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('logs local keyring failures without tracking an affected-user event', async () => {
    const error = new Error('keyring unavailable');
    const fetchAllSecretDataFn = vi
      .fn()
      .mockResolvedValue([createFetchedSecretDataItem(SRP1)]);
    const getPrimaryKeyringSeedPhraseFn = vi.fn().mockRejectedValue(error);
    const trackEvent = vi.fn();

    await trackIncompleteMetadataBackupEvents({
      fetchAllSecretDataFn,
      getPrimaryKeyringSeedPhraseFn,
      trackEvent,
    });

    expect(logMock).toHaveBeenCalledWith(
      'Error identifying incomplete metadata backup',
      error,
    );
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('does not propagate analytics tracking failures', async () => {
    const fetchAllSecretDataFn = vi.fn().mockResolvedValue([]);
    const trackError = new Error('analytics unavailable');
    const trackEvent = vi.fn().mockRejectedValue(trackError);

    await trackIncompleteMetadataBackupEvents({
      fetchAllSecretDataFn,
      getPrimaryKeyringSeedPhraseFn: vi.fn(),
      trackEvent,
    });

    expectTrackedEvent(trackEvent, {
      name: SeedlessPrimarySrpMissingEventName,
      properties: {
        metadata_schema_version: 'none',
        number_of_imported_wallets: 0,
        number_of_imported_accounts: 0,
      },
    });
    expect(logMock).toHaveBeenCalledWith(
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

function hashUserId(userId: string): string {
  return bytesToHex(
    hmac(
      sha256,
      stringToBytes(SeedlessIdentityUserIdSalt),
      stringToBytes(userId),
    ),
  );
}

describe('trackIdentityMismatchEvent', () => {
  beforeEach(() => {
    logMock.mockClear();
  });

  it('tracks the source and reason', () => {
    const trackEvent = vi.fn();
    const error = new SeedlessOnboardingError(
      SeedlessOnboardingControllerErrorMessage.IdentityMismatch,
      { details: SeedlessIdentityMismatchReason.UserIdMismatch },
    );

    trackIdentityMismatchEvent({
      source: SeedlessIdentityMismatchSource.TokenRefresh,
      error,
      trackEvent,
    });

    expect(trackEvent).toHaveBeenCalledWith({
      name: SeedlessIdentityMismatchEventName,
      properties: {
        source: SeedlessIdentityMismatchSource.TokenRefresh,
        reason: SeedlessIdentityMismatchReason.UserIdMismatch,
        expected_user_id: 'NONE',
        actual_user_id: 'NONE',
        metadata_schema_version: 'v1',
      },
      sensitiveProperties: {},
      saveDataRecording: false,
      hasProperties: true,
    });
  });

  it('does not track other errors', () => {
    const trackEvent = vi.fn();

    trackIdentityMismatchEvent({
      source: SeedlessIdentityMismatchSource.ToprfAuthenticate,
      error: new Error('other'),
      trackEvent,
    });

    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('includes salted hashes of the user ids', () => {
    const trackEvent = vi.fn<(event: AnalyticsTrackingEvent) => void>();
    const expectedUserId = 'user-1';
    const actualUserId = 'other-user';

    trackIdentityMismatchEvent({
      source: SeedlessIdentityMismatchSource.ToprfAuthenticate,
      error: new SeedlessOnboardingError(
        SeedlessOnboardingControllerErrorMessage.IdentityMismatch,
        { details: SeedlessIdentityMismatchReason.UserIdMismatch },
      ),
      trackEvent,
      expectedUserId,
      actualUserId,
    });

    const properties = trackEvent.mock.calls[0]?.[0].properties;
    expect(properties).toStrictEqual({
      source: SeedlessIdentityMismatchSource.ToprfAuthenticate,
      reason: SeedlessIdentityMismatchReason.UserIdMismatch,
      expected_user_id: hashUserId(expectedUserId),
      actual_user_id: hashUserId(actualUserId),
      metadata_schema_version: 'v1',
    });
    expect(JSON.stringify(properties)).not.toContain(expectedUserId);
    expect(JSON.stringify(properties)).not.toContain(actualUserId);
  });

  it('reports NONE when a user id is missing', () => {
    const trackEvent = vi.fn<(event: AnalyticsTrackingEvent) => void>();

    trackIdentityMismatchEvent({
      source: SeedlessIdentityMismatchSource.TokenRefresh,
      error: new SeedlessOnboardingError(
        SeedlessOnboardingControllerErrorMessage.IdentityMismatch,
        { details: SeedlessIdentityMismatchReason.MissingIdToken },
      ),
      trackEvent,
      expectedUserId: 'user-1',
      actualUserId: undefined,
      migrationVersion: 1,
    });

    expect(trackEvent.mock.calls[0]?.[0].properties).toStrictEqual({
      source: SeedlessIdentityMismatchSource.TokenRefresh,
      reason: SeedlessIdentityMismatchReason.MissingIdToken,
      expected_user_id: hashUserId('user-1'),
      actual_user_id: 'NONE',
      metadata_schema_version: 'v2',
    });
  });

  it('logs a tracking failure without throwing', async () => {
    const trackError = new Error('analytics unavailable');

    trackIdentityMismatchEvent({
      source: SeedlessIdentityMismatchSource.RotateRefreshToken,
      error: new SeedlessOnboardingError(
        SeedlessOnboardingControllerErrorMessage.IdentityMismatch,
      ),
      trackEvent: vi.fn().mockRejectedValue(trackError),
    });

    await vi.waitFor(() => {
      expect(logMock).toHaveBeenCalledWith(
        'Error tracking identity mismatch event',
        trackError,
      );
    });
  });
});
