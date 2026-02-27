import { filterNetworks } from './filters';
import type { RegistryNetworkConfig } from './types';
import { createMockNetworkConfig } from '../../tests/helpers';

describe('filters', () => {
  describe('filterNetworks', () => {
    const networks: RegistryNetworkConfig[] = [
      createMockNetworkConfig({
        config: {
          isFeatured: true,
          isTestnet: false,
          isActive: true,
          isDeprecated: false,
          isDefault: true,
        },
      }),
      createMockNetworkConfig({
        chainId: 'eip155:5',
        config: {
          isFeatured: false,
          isTestnet: true,
          isActive: true,
          isDeprecated: false,
          isDefault: false,
        },
      }),
      createMockNetworkConfig({
        chainId: 'eip155:42',
        config: {
          isFeatured: true,
          isTestnet: false,
          isActive: false,
          isDeprecated: true,
          isDefault: false,
        },
      }),
    ];

    it('returns all networks when no filters applied', () => {
      const result = filterNetworks(networks);

      expect(result).toHaveLength(3);
    });

    it('filters by isFeatured', () => {
      const result = filterNetworks(networks, { isFeatured: true });

      expect(result).toHaveLength(2);
      expect(result.every((network) => network.config.isFeatured)).toBe(true);
    });

    it('filters by isTestnet', () => {
      const result = filterNetworks(networks, { isTestnet: true });

      expect(result).toHaveLength(1);
      expect(result[0].chainId).toBe('eip155:5');
    });

    it('filters by isActive', () => {
      const result = filterNetworks(networks, { isActive: true });

      expect(result).toHaveLength(2);
      expect(result.every((network) => network.config.isActive)).toBe(true);
    });

    it('filters by isDeprecated', () => {
      const result = filterNetworks(networks, { isDeprecated: true });

      expect(result).toHaveLength(1);
      expect(result[0].chainId).toBe('eip155:42');
    });

    it('filters by isDefault', () => {
      const result = filterNetworks(networks, { isDefault: true });

      expect(result).toHaveLength(1);
      expect(result[0].chainId).toBe('eip155:1');
    });

    it('filters by multiple criteria (requiring all filters to match)', () => {
      const result = filterNetworks(networks, {
        isFeatured: true,
        isActive: true,
        isTestnet: false,
      });

      expect(result).toHaveLength(1);
      expect(result[0].chainId).toBe('eip155:1');
    });

    it('returns empty array for empty input', () => {
      const result = filterNetworks([]);

      expect(result).toStrictEqual([]);
    });
  });
});
