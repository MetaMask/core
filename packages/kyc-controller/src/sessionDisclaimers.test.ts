import {
  consentRecordsFromAcceptedList,
  areSessionDisclaimersCompleted,
} from './sessionDisclaimers.js';
import type { KycConsentDocument, KycSessionDisclaimers } from './types.js';

/**
 * Builds a session catalog document for tests.
 *
 * @param overrides - Fields to overlay on the default document.
 * @returns A complete consent document.
 */
function document(
  overrides: Partial<KycConsentDocument> & Pick<KycConsentDocument, 'key'>,
): KycConsentDocument {
  return {
    version: '1',
    title: overrides.key,
    url: `https://example.test/${overrides.key}`,
    consented: false,
    ...overrides,
  };
}

describe('consentRecordsFromAcceptedList', () => {
  it('returns an empty list when nothing was accepted', () => {
    expect(
      consentRecordsFromAcceptedList([document({ key: 'tos' })], []),
    ).toStrictEqual([]);
  });

  it('maps accepted unconsented catalog documents to consent records', () => {
    expect(
      consentRecordsFromAcceptedList(
        [
          document({ key: 'tos', version: '1' }),
          document({ key: 'privacy', version: '2' }),
        ],
        [
          { key: 'tos', version: '1' },
          { key: 'privacy', version: '2' },
        ],
      ),
    ).toStrictEqual([
      { key: 'tos', version: '1' },
      { key: 'privacy', version: '2' },
    ]);
  });

  it('omits documents that are already consented', () => {
    expect(
      consentRecordsFromAcceptedList(
        [
          document({ key: 'tos', version: '1', consented: true }),
          document({ key: 'privacy', version: '2' }),
        ],
        [
          { key: 'tos', version: '1' },
          { key: 'privacy', version: '2' },
        ],
      ),
    ).toStrictEqual([{ key: 'privacy', version: '2' }]);
  });

  it('omits catalog documents that were not accepted', () => {
    expect(
      consentRecordsFromAcceptedList(
        [
          document({ key: 'tos', version: '1' }),
          document({ key: 'privacy', version: '2' }),
        ],
        [{ key: 'tos', version: '1' }],
      ),
    ).toStrictEqual([{ key: 'tos', version: '1' }]);
  });

  it('requires both key and version to match', () => {
    expect(
      consentRecordsFromAcceptedList(
        [document({ key: 'tos', version: '2' })],
        [{ key: 'tos', version: '1' }],
      ),
    ).toStrictEqual([]);
  });
});

describe('areSessionDisclaimersCompleted', () => {
  /**
   * Builds a session disclaimer catalog for tests.
   *
   * @param overrides - Fields to overlay on a fully-consented catalog.
   * @returns A complete session disclaimer catalog.
   */
  function catalog(
    overrides: Partial<KycSessionDisclaimers> = {},
  ): KycSessionDisclaimers {
    return {
      idOS: [document({ key: 'idos-tos', consented: true })],
      kycProvider: [document({ key: 'sumsub-tos', consented: true })],
      credentialReusabilityConsentGiven: true,
      ...overrides,
    };
  }

  it('returns true when every document is consented and reuse consent is given', () => {
    expect(areSessionDisclaimersCompleted(catalog())).toBe(true);
  });

  it('returns true when both catalogs are empty and reuse consent is given', () => {
    expect(
      areSessionDisclaimersCompleted(catalog({ idOS: [], kycProvider: [] })),
    ).toBe(true);
  });

  it('returns false when credential reuse consent is not given', () => {
    expect(
      areSessionDisclaimersCompleted(
        catalog({ credentialReusabilityConsentGiven: false }),
      ),
    ).toBe(false);
  });

  it('returns false when an idOS document is not consented', () => {
    expect(
      areSessionDisclaimersCompleted(
        catalog({
          idOS: [document({ key: 'idos-tos', consented: false })],
        }),
      ),
    ).toBe(false);
  });

  it('returns false when a KYC-provider document is not consented', () => {
    expect(
      areSessionDisclaimersCompleted(
        catalog({
          kycProvider: [document({ key: 'sumsub-tos', consented: false })],
        }),
      ),
    ).toBe(false);
  });
});
