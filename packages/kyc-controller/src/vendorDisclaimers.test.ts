import { describe, expect, it } from 'vitest';

import { areVendorDisclaimersCompleted } from './vendorDisclaimers.js';

const catalog = [
  { id: 'a', display_name: 'A', url: 'https://a' },
  { id: 'b', display_name: 'B', url: 'https://b' },
];

describe('areVendorDisclaimersCompleted', () => {
  it('treats an empty catalog as complete', () => {
    expect(areVendorDisclaimersCompleted(null, [])).toBe(true);
  });

  it('is incomplete without acceptance', () => {
    expect(areVendorDisclaimersCompleted(null, catalog)).toBe(false);
  });

  it('does not count acceptance that was not submitted', () => {
    expect(
      areVendorDisclaimersCompleted(
        { disclaimerIds: ['a', 'b'], acceptedAt: null, submitted: false },
        catalog,
      ),
    ).toBe(false);
  });

  it('is complete when submitted acceptance covers the catalog', () => {
    expect(
      areVendorDisclaimersCompleted(
        { disclaimerIds: ['a', 'b', 'old'], acceptedAt: null, submitted: true },
        catalog,
      ),
    ).toBe(true);
  });

  it('is incomplete when a catalog document is missing', () => {
    expect(
      areVendorDisclaimersCompleted(
        { disclaimerIds: ['a'], acceptedAt: null, submitted: true },
        catalog,
      ),
    ).toBe(false);
  });
});
