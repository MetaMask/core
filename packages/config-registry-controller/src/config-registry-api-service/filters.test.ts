import { filterNetworks } from './filters';
import type { RegistryNetworkConfig } from './types';
import { createMockNetworkConfig } from '../test-helpers';

describe('filters', () => {
  describe('filterNetworks', () => {
    const networks: RegistryNetworkConfig[] = [
      createMockNetworkConfig({
        isFeatured: true,
        isTestnet: false,
        isActive: true,
        isDeprecated: false,
        isDefault: true,
      }),
      createMockNetworkConfig({
        chainId: '0x5',
        isFeatured: false,
        isTestnet: true,
        isActive: true,
        isDeprecated: false,
        isDefault: false,
      }),
      createMockNetworkConfig({
        chainId: '0x2a',
        isFeatured: true,
        isTestnet: false,
        isActive: false,
        isDeprecated: true,
        isDefault: false,
      }),
    ];

    it('returns all networks when no filters applied', () => {
      const result = filterNetworks(networks);

      expect(result).toHaveLength(3);
    });

    it('filters by isFeatured', () => {
      const result = filterNetworks(networks, { isFeatured: true });

      expect(result).toHaveLength(2);
      expect(result.every((network) => network.isFeatured)).toBe(true);
    });

    it('filters by isTestnet', () => {
      const result = filterNetworks(networks, { isTestnet: true });

      expect(result).toHaveLength(1);
      expect(result[0].chainId).toBe('0x5');
    });

    it('filters by isActive', () => {
      const result = filterNetworks(networks, { isActive: true });

      expect(result).toHaveLength(2);
      expect(result.every((network) => network.isActive)).toBe(true);
    });

    it('filters by isDeprecated', () => {
      const result = filterNetworks(networks, { isDeprecated: true });

      expect(result).toHaveLength(1);
      expect(result[0].chainId).toBe('0x2a');
    });

    it('filters by isDefault', () => {
      const result = filterNetworks(networks, { isDefault: true });

      expect(result).toHaveLength(1);
      expect(result[0].chainId).toBe('0x1');
    });

    it('filters by multiple criteria', () => {
      const result = filterNetworks(networks, {
        isFeatured: true,
        isActive: true,
        isTestnet: false,
      });

      expect(result).toHaveLength(1);
      expect(result[0].chainId).toBe('0x1');
    });

    it('returns empty array for empty input', () => {
      const result = filterNetworks([]);

      expect(result).toStrictEqual([]);
    });
  });
});
