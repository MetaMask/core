import { ALPHA2_TO_ALPHA3, alpha2ToAlpha3 } from './countryCodes';

describe('countryCodes', () => {
  it('exposes the alpha-2 to alpha-3 map', () => {
    expect(ALPHA2_TO_ALPHA3.US).toBe('USA');
  });

  it('maps a known uppercase alpha-2 code', () => {
    expect(alpha2ToAlpha3('GB')).toBe('GBR');
  });

  it('is case-insensitive', () => {
    expect(alpha2ToAlpha3('fr')).toBe('FRA');
  });

  it('returns undefined for an unknown code', () => {
    expect(alpha2ToAlpha3('ZZ')).toBeUndefined();
  });
});
