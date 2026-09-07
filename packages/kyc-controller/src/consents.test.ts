import {
  acceptedCategoryStillMissing,
  consentRecordKey,
  consentRecordsFromAcceptedList,
  isAcceptedCategoryEmpty,
  isConsentConflictError,
  isSessionAlreadyCompletedError,
  isValidConsentRecordList,
  usesConsentsFlow,
} from './consents.js';
import type { KycConsentDocument } from './types.js';

const DOCUMENTS: KycConsentDocument[] = [
  {
    key: 'a',
    version: '1',
    title: 'A',
    url: 'https://example.com/a',
    consented: false,
  },
  {
    key: 'b',
    version: '2',
    title: 'B',
    url: 'https://example.com/b',
    consented: true,
  },
];

describe('consents', () => {
  describe('consentRecordKey', () => {
    it('joins key and version', () => {
      expect(consentRecordKey({ key: 'tos', version: '3' })).toBe('tos:3');
    });
  });

  describe('isSessionAlreadyCompletedError', () => {
    it('detects the UKYC session_not_in_valid_state marker', () => {
      expect(
        isSessionAlreadyCompletedError(
          new Error('session_not_in_valid_state: already done'),
        ),
      ).toBe(true);
    });

    it('returns false for unrelated errors', () => {
      expect(isSessionAlreadyCompletedError(new Error('network'))).toBe(false);
    });
  });

  describe('isConsentConflictError', () => {
    it('returns true for HTTP 409', () => {
      expect(isConsentConflictError({ httpStatus: 409 })).toBe(true);
    });

    it('returns false for other statuses, non-objects, and missing httpStatus', () => {
      expect(isConsentConflictError({ httpStatus: 400 })).toBe(false);
      expect(isConsentConflictError(null)).toBe(false);
      expect(isConsentConflictError('409')).toBe(false);
      expect(isConsentConflictError({ httpStatus: '409' })).toBe(false);
    });
  });

  describe('isValidConsentRecordList', () => {
    it('accepts an array of key/version records', () => {
      expect(isValidConsentRecordList([])).toBe(true);
      expect(isValidConsentRecordList([{ key: 'a', version: '1' }])).toBe(true);
    });

    it('rejects non-arrays and malformed items', () => {
      expect(isValidConsentRecordList(undefined)).toBe(false);
      expect(isValidConsentRecordList([{ key: 'a' }])).toBe(false);
      expect(isValidConsentRecordList([{ version: '1' }])).toBe(false);
      expect(isValidConsentRecordList([null])).toBe(false);
    });
  });

  describe('consentRecordsFromAcceptedList', () => {
    it('returns nothing when the caller accepted no documents', () => {
      expect(consentRecordsFromAcceptedList(DOCUMENTS, [])).toStrictEqual([]);
    });

    it('posts only unconsented catalog rows the caller accepted', () => {
      expect(
        consentRecordsFromAcceptedList(DOCUMENTS, [
          { key: 'a', version: '1' },
          { key: 'b', version: '2' },
          { key: 'missing', version: '1' },
        ]),
      ).toStrictEqual([{ key: 'a', version: '1' }]);
    });
  });

  describe('isAcceptedCategoryEmpty', () => {
    it('is true only when the caller accepted docs but the catalog is empty', () => {
      expect(isAcceptedCategoryEmpty([], [{ key: 'a', version: '1' }])).toBe(
        true,
      );
      expect(
        isAcceptedCategoryEmpty(DOCUMENTS, [{ key: 'a', version: '1' }]),
      ).toBe(false);
      expect(isAcceptedCategoryEmpty([], [])).toBe(false);
    });
  });

  describe('acceptedCategoryStillMissing', () => {
    it('returns false when nothing was accepted', () => {
      expect(acceptedCategoryStillMissing([], [])).toBe(false);
    });

    it('returns true when the catalog is empty or has no matching rows', () => {
      expect(
        acceptedCategoryStillMissing([], [{ key: 'a', version: '1' }]),
      ).toBe(true);
      expect(
        acceptedCategoryStillMissing(DOCUMENTS, [
          { key: 'missing', version: '1' },
        ]),
      ).toBe(true);
    });

    it('returns true when a matching catalog row is still unconsented', () => {
      expect(
        acceptedCategoryStillMissing(DOCUMENTS, [{ key: 'a', version: '1' }]),
      ).toBe(true);
    });

    it('returns false when every accepted document is consented', () => {
      expect(
        acceptedCategoryStillMissing(DOCUMENTS, [{ key: 'b', version: '2' }]),
      ).toBe(false);
    });
  });

  describe('usesConsentsFlow', () => {
    it('is true for non-MoonPay vendors', () => {
      expect(usesConsentsFlow('moonpay')).toBe(false);
      expect(usesConsentsFlow('iron')).toBe(true);
    });
  });
});
