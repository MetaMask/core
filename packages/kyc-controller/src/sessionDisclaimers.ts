import type {
  KycConsentDocument,
  KycConsentRecord,
  KycSessionDisclaimers,
} from './types.js';

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

/**
 * Returns whether every session catalog document is consented and credential
 * reuse was accepted.
 *
 * @param disclaimers - Session-scoped disclaimer catalog.
 * @returns Whether all documents are consented and reuse consent is given.
 */
export function areSessionDisclaimersCompleted(
  disclaimers: KycSessionDisclaimers,
): boolean {
  return (
    disclaimers.credentialReusabilityConsentGiven &&
    disclaimers.idOS.every((document) => document.consented) &&
    disclaimers.kycProvider.every((document) => document.consented)
  );
}
