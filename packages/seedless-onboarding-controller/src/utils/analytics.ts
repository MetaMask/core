import type { AnalyticsContext, AnalyticsTrackingEvent } from '@metamask/analytics-controller';
import type { FetchedSecretDataItem } from '@metamask/toprf-secure-backup';
import { areUint8ArraysEqual } from '@metamask/utils';

import { InvalidPrimarySecretDataTypeError } from '../errors.js';
import { parseAndSortSecretMetadata } from './secret-data-utils.js';

export const SeedlessPrimarySrpMissingEventName = 'Seedless Onboarding Primary SRP Missing';
export const SeedlessPrimarySrpMismatchEventName = 'Seedless Onboarding Primary SRP Mismatch';

/**
 * Identify whether the local primary SRP is missing from or differs from the
 * remote TOPRF metadata backup.
 *
 * Legacy metadata is ordered by the client-side timestamp and its first
 * mnemonic is treated as the remote primary candidate. Newer metadata uses
 * the explicit `PrimarySrp` data type. The candidate is compared with the
 * primary SRP supplied by the keyring callback.
 *
 * This function only reads the supplied data and emits telemetry. It does not
 * modify local or remote backup data. Fetch, parsing, keyring, and comparison
 * failures are logged and are not classified as affected users.
 *
 * @param params - Functions used to read the remote metadata and local primary
 * SRP, emit telemetry, and log inconclusive failures.
 * @param params.fetchAllSecretDataFn - Fetches the decrypted remote secret
 * metadata items.
 * @param params.getPrimaryKeyringSeedPhraseFn - Returns the local primary SRP
 * bytes from the keyring.
 * @param params.trackEvent - Emits a non-sensitive analytics event.
 * @param params.logFn - Records failures that prevent identification.
 * @returns A promise that resolves after identification and best-effort
 * telemetry have completed.
 */
export async function identifyIncompleteMetadataBackup({
  fetchAllSecretDataFn,
  getPrimaryKeyringSeedPhraseFn,
  trackEvent,
  logFn,
}: {
  fetchAllSecretDataFn: () => Promise<FetchedSecretDataItem[]>;
  trackEvent: (
    event: AnalyticsTrackingEvent,
    context?: AnalyticsContext,
  ) => void | Promise<void>;
  getPrimaryKeyringSeedPhraseFn: () => Promise<Uint8Array>;
  logFn: (message: string, error?: unknown) => void;
}): Promise<void> {
  const trackEventSafely = async (
    event: AnalyticsTrackingEvent,
  ): Promise<void> => {
    try {
      await trackEvent(event);
    } catch (error) {
      logFn('Error tracking incomplete metadata backup event', error);
    }
  };

  try {
    const secretDataItems = await fetchAllSecretDataFn();
    const [primarySecretMetadata] = parseAndSortSecretMetadata(secretDataItems);
    const localPrimarySrp = await getPrimaryKeyringSeedPhraseFn();

    if (areUint8ArraysEqual(primarySecretMetadata.data, localPrimarySrp)) {
      return;
    }

    await trackEventSafely(
      {
        name: SeedlessPrimarySrpMismatchEventName,
        properties: {},
        sensitiveProperties: {},
        saveDataRecording: false,
        hasProperties: false,
      },
    );
  } catch (error) {
    if (error instanceof InvalidPrimarySecretDataTypeError) {
      await trackEventSafely(
        {
          name: SeedlessPrimarySrpMissingEventName,
          properties: {
            error: error.message,
          },
          sensitiveProperties: {},
          saveDataRecording: false,
          hasProperties: true,
        },
      );

      return;
    }

    logFn('Error identifying incomplete metadata backup', error);
  }
}
