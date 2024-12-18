import { stripArrayTypeIfPresent } from './common';

describe('CommonUtils', () => {
  describe('stripArrayTypeIfPresent', () => {
    it('remove array brackets from the type if present', () => {
      expect(stripArrayTypeIfPresent('string[]')).toBe('string');
      expect(stripArrayTypeIfPresent('string[5]')).toBe('string');
    });

    it('return types which are not array without any change', () => {
      expect(stripArrayTypeIfPresent('string')).toBe('string');
      expect(stripArrayTypeIfPresent('string []')).toBe('string []');
    });
  });
});
