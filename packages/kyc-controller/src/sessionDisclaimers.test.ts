import { consentRecordsFromAcceptedList } from './sessionDisclaimers.js';
import type { KycConsentDocument } from './types.js';

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
      consentRecordsFromAcceptedList(
        [document({ key: 'tos' })],
        [],
      ),
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
