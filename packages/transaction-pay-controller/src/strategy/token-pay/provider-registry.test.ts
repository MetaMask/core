import { getTokenPayProviders } from './provider-registry';
import { AcrossProvider } from '../across/AcrossProvider';
import { RelayProvider } from '../relay/RelayProvider';

describe('provider-registry', () => {
  describe('getTokenPayProviders', () => {
    it('returns array with RelayProvider and AcrossProvider', () => {
      const providers = getTokenPayProviders();

      expect(providers).toHaveLength(2);
      expect(providers[0]).toBeInstanceOf(RelayProvider);
      expect(providers[1]).toBeInstanceOf(AcrossProvider);
    });

    it('returns providers with correct ids', () => {
      const providers = getTokenPayProviders();

      expect(providers[0].id).toBe('relay');
      expect(providers[1].id).toBe('across');
    });
  });
});
