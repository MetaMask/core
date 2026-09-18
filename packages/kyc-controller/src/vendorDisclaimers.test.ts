import {
  acceptedVendorDisclaimerIds,
  areVendorDisclaimersCompleted,
  clearVendorDisclaimerAcceptance,
  hasVendorDisclaimerAcceptance,
  ironDisclaimerIds,
  recordVendorDisclaimerAcceptance,
} from './vendorDisclaimers.js';

describe('vendorDisclaimers', () => {
  describe('hasVendorDisclaimerAcceptance', () => {
    it('returns true when MoonPay terms are persisted', () => {
      expect(
        hasVendorDisclaimerAcceptance(
          { moonpay: { termsAcceptedAt: 't' }, iron: null },
          'moonpay',
        ),
      ).toBe(true);
    });

    it('returns false when MoonPay terms are missing', () => {
      expect(
        hasVendorDisclaimerAcceptance({ moonpay: null, iron: null }, 'moonpay'),
      ).toBe(false);
    });

    it('returns true when Iron disclaimer ids are persisted', () => {
      expect(
        hasVendorDisclaimerAcceptance(
          { moonpay: null, iron: { disclaimerIds: ['d1'] } },
          'iron',
        ),
      ).toBe(true);
    });

    it('returns false when Iron disclaimer ids are empty', () => {
      expect(
        hasVendorDisclaimerAcceptance(
          { moonpay: null, iron: { disclaimerIds: [] } },
          'iron',
        ),
      ).toBe(false);
    });

    it('returns false for an unknown vendor at runtime', () => {
      expect(
        hasVendorDisclaimerAcceptance(
          { moonpay: null, iron: null },
          'unknown' as 'moonpay',
        ),
      ).toBe(false);
    });
  });

  describe('ironDisclaimerIds', () => {
    it('returns persisted Iron disclaimer ids', () => {
      expect(
        ironDisclaimerIds({
          moonpay: null,
          iron: { disclaimerIds: ['d1'] },
        }),
      ).toStrictEqual(['d1']);
    });

    it('returns an empty array when Iron acceptance is missing', () => {
      expect(
        ironDisclaimerIds({
          moonpay: null,
          iron: null,
        }),
      ).toStrictEqual([]);
    });
  });

  describe('acceptedVendorDisclaimerIds', () => {
    it('returns Iron disclaimer ids', () => {
      expect(
        acceptedVendorDisclaimerIds(
          { moonpay: null, iron: { disclaimerIds: ['d1', 'd2'] } },
          'iron',
        ),
      ).toStrictEqual(['d1', 'd2']);
    });

    it('returns an empty list for MoonPay', () => {
      expect(
        acceptedVendorDisclaimerIds(
          { moonpay: { termsAcceptedAt: 't' }, iron: null },
          'moonpay',
        ),
      ).toStrictEqual([]);
    });
  });

  describe('areVendorDisclaimersCompleted', () => {
    const catalog = [
      { id: 'd1', display_name: 'T1', url: 'u1' },
      { id: 'd2', display_name: 'T2', url: 'u2' },
    ];

    it('returns true when every fetched Iron disclaimer id is accepted', () => {
      expect(
        areVendorDisclaimersCompleted(
          { moonpay: null, iron: { disclaimerIds: ['d1', 'd2', 'extra'] } },
          'iron',
          catalog,
        ),
      ).toBe(true);
    });

    it('returns false when a fetched Iron disclaimer id is missing', () => {
      expect(
        areVendorDisclaimersCompleted(
          { moonpay: null, iron: { disclaimerIds: ['d1'] } },
          'iron',
          catalog,
        ),
      ).toBe(false);
    });

    it('returns true when the fetched catalog is empty', () => {
      expect(
        areVendorDisclaimersCompleted(
          { moonpay: null, iron: null },
          'iron',
          [],
        ),
      ).toBe(true);
    });

    it('returns false for MoonPay when the catalog has documents', () => {
      expect(
        areVendorDisclaimersCompleted(
          { moonpay: { termsAcceptedAt: 't' }, iron: null },
          'moonpay',
          catalog,
        ),
      ).toBe(false);
    });
  });

  describe('recordVendorDisclaimerAcceptance', () => {
    it('records MoonPay acceptance', () => {
      expect(
        recordVendorDisclaimerAcceptance(
          { moonpay: null, iron: null },
          'moonpay',
          { termsAcceptedAt: 't', disclaimerIds: [] },
        ),
      ).toStrictEqual({ moonpay: { termsAcceptedAt: 't' }, iron: null });
    });

    it('records Iron acceptance', () => {
      expect(
        recordVendorDisclaimerAcceptance(
          { moonpay: null, iron: null },
          'iron',
          { termsAcceptedAt: 't', disclaimerIds: ['d1'] },
        ),
      ).toStrictEqual({ moonpay: null, iron: { disclaimerIds: ['d1'] } });
    });

    it('leaves acceptance unchanged for an unknown vendor at runtime', () => {
      const accepted = { moonpay: null, iron: null };
      expect(
        recordVendorDisclaimerAcceptance(accepted, 'unknown' as 'moonpay', {
          termsAcceptedAt: 't',
          disclaimerIds: ['d1'],
        }),
      ).toBe(accepted);
    });
  });

  describe('clearVendorDisclaimerAcceptance', () => {
    it('clears MoonPay acceptance', () => {
      expect(
        clearVendorDisclaimerAcceptance(
          { moonpay: { termsAcceptedAt: 't' }, iron: null },
          'moonpay',
        ),
      ).toStrictEqual({ moonpay: null, iron: null });
    });

    it('clears Iron acceptance', () => {
      expect(
        clearVendorDisclaimerAcceptance(
          { moonpay: null, iron: { disclaimerIds: ['d1'] } },
          'iron',
        ),
      ).toStrictEqual({ moonpay: null, iron: null });
    });

    it('leaves acceptance unchanged for an unknown vendor at runtime', () => {
      const accepted = { moonpay: null, iron: { disclaimerIds: ['d1'] } };
      expect(
        clearVendorDisclaimerAcceptance(accepted, 'unknown' as 'moonpay'),
      ).toBe(accepted);
    });
  });
});
