import type { KycConsentDocument, KycConsentRecord } from './types.js';

/**
 * Maps accepted disclaimer records onto unconsented catalog documents.
 *
 * @param documents - Catalog documents for one consent category.
 * @param accepted - Accepted `{ key, version }` records from the caller.
 * @returns Consent records to POST, omitting already-consented documents.
 */
export function consentRecordsFromAcceptedList(
  documents: KycConsentDocument[],
  accepted: KycConsentRecord[],
): KycConsentRecord[] {
  if (accepted.length === 0) {
    return [];
  }
  const acceptedKeys = new Set(
    accepted.map((record) => `${record.key}:${record.version}`),
  );
  return documents
    .filter(
      (document) =>
        !document.consented &&
        acceptedKeys.has(`${document.key}:${document.version}`),
    )
    .map(({ key, version }) => ({ key, version }));
}
