import type {
  KycConsentDocument,
  KycConsentRecord,
  KycVendor,
} from './types.js';

/**
 * UKYC / relay error indicating the applicant already finished KYC. Mapped to
 * the simplified `completed` user status for the Money toast surface.
 */
const SESSION_NOT_IN_VALID_STATE = 'session_not_in_valid_state';

/**
 * Stable identity for a consent document version.
 *
 * @param record - A `{ key, version }` consent record.
 * @returns `key:version`.
 */
export function consentRecordKey(
  record: Pick<KycConsentRecord, 'key' | 'version'>,
): string {
  return `${record.key}:${record.version}`;
}

/**
 * Whether an error indicates the applicant already finished KYC — the UKYC /
 * relay `session_not_in_valid_state` signal — which the controller maps to the
 * simplified `completed` user status.
 *
 * @param error - The caught error.
 * @returns `true` when the error carries the `session_not_in_valid_state`
 * marker.
 */
export function isSessionAlreadyCompletedError(error: unknown): boolean {
  return String(error).includes(SESSION_NOT_IN_VALID_STATE);
}

/**
 * Whether recording session disclaimers failed because those document
 * versions were already consented for the session (`409 Conflict`).
 *
 * @param error - The caught error.
 * @returns `true` when the error is an HTTP 409.
 */
export function isConsentConflictError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { httpStatus?: unknown }).httpStatus === 'number' &&
    (error as { httpStatus: number }).httpStatus === 409
  );
}

/**
 * @param value - The value to validate.
 * @returns `true` when `value` is a valid consent record list.
 */
export function isValidConsentRecordList(
  value: unknown,
): value is KycConsentRecord[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as KycConsentRecord).key === 'string' &&
        typeof (item as KycConsentRecord).version === 'string',
    )
  );
}

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
  const acceptedKeys = new Set(accepted.map(consentRecordKey));
  return documents
    .filter(
      (document) =>
        !document.consented && acceptedKeys.has(consentRecordKey(document)),
    )
    .map(({ key, version }) => ({ key, version }));
}

/**
 * Whether accepted disclaimers reference a missing catalog category.
 *
 * @param documents - Catalog documents for one consent category.
 * @param accepted - Accepted `{ key, version }` records from the caller.
 * @returns `true` when the caller accepted docs but the catalog is empty.
 */
export function isAcceptedCategoryEmpty(
  documents: KycConsentDocument[],
  accepted: KycConsentRecord[],
): boolean {
  return accepted.length > 0 && documents.length === 0;
}

/**
 * Whether accepted disclaimers are still missing consent after a 409 re-GET:
 * empty catalog or any accepted document still unconsented.
 *
 * @param documents - Latest catalog documents for one consent category.
 * @param accepted - Accepted `{ key, version }` records from the caller.
 * @returns `true` when accepted documents are not fully consented.
 */
export function acceptedCategoryStillMissing(
  documents: KycConsentDocument[],
  accepted: KycConsentRecord[],
): boolean {
  if (accepted.length === 0) {
    return false;
  }
  if (documents.length === 0) {
    return true;
  }
  const acceptedKeys = new Set(accepted.map(consentRecordKey));
  const relevant = documents.filter((document) =>
    acceptedKeys.has(consentRecordKey(document)),
  );
  return (
    relevant.length === 0 || relevant.some((document) => !document.consented)
  );
}

/**
 * Vendors other than MoonPay skip Check/Auth frames and use the empty-shell
 * customer + consents path instead.
 *
 * @param vendor - The identity vendor for the current flow.
 * @returns `true` when the vendor uses the consents session path.
 */
export function usesConsentsFlow(vendor: KycVendor): boolean {
  return vendor !== 'moonpay';
}
