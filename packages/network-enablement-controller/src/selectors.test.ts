import { KnownCaipNamespace } from '@metamask/utils';

import type { NetworkEnablementControllerState } from './NetworkEnablementController';
import {
  selectEnabledNetworkMap,
  selectIsNetworkEnabled,
  selectEnabledNetworksForNamespace,
  selectAllEnabledNetworks,
  selectEnabledNetworksCount,
  selectHasEnabledNetworksForNamespace,
  selectEnabledEvmNetworks,
  selectEnabledSolanaNetworks,
} from './selectors';

describe('NetworkEnablementController Selectors', () => {
  const mockState: NetworkEnablementControllerState = {
    enabledNetworkMap: {
      [KnownCaipNamespace.Eip155]: {
        '0x1': true, // Ethereum mainnet
        '0xa': false, // Optimism (disabled)
        '0xa4b1': true, // Arbitrum One
      },
      [KnownCaipNamespace.Solana]: {
        'solana:mainnet': true,
        'solana:testnet': false,
      },
    },
  };

  describe('selectEnabledNetworkMap', () => {
    it('should return the enabled network map', () => {
      const result = selectEnabledNetworkMap(mockState);
      expect(result).toBe(mockState.enabledNetworkMap);
    });
  });

  describe('selectIsNetworkEnabled', () => {
    it('should return true for enabled EVM network with hex chain ID', () => {
      const selector = selectIsNetworkEnabled('0x1');
      const result = selector(mockState);
      expect(result).toBe(true);
    });

    it('should return true for enabled EVM network with CAIP chain ID', () => {
      const selector = selectIsNetworkEnabled('eip155:1');
      const result = selector(mockState);
      expect(result).toBe(true);
    });

    it('should return false for disabled EVM network', () => {
      const selector = selectIsNetworkEnabled('0xa');
      const result = selector(mockState);
      expect(result).toBe(false);
    });

    it('should return true for enabled Solana network', () => {
      const selector = selectIsNetworkEnabled('solana:mainnet');
      const result = selector(mockState);
      expect(result).toBe(true);
    });

    it('should return false for disabled Solana network', () => {
      const selector = selectIsNetworkEnabled('solana:testnet');
      const result = selector(mockState);
      expect(result).toBe(false);
    });

    it('should return false for unknown network', () => {
      const selector = selectIsNetworkEnabled('0x999');
      const result = selector(mockState);
      expect(result).toBe(false);
    });
  });

  describe('selectEnabledNetworksForNamespace', () => {
    it('should return enabled EVM networks', () => {
      const selector = selectEnabledNetworksForNamespace(
        KnownCaipNamespace.Eip155,
      );
      const result = selector(mockState);
      expect(result).toStrictEqual(['0x1', '0xa4b1']);
    });

    it('should return enabled Solana networks', () => {
      const selector = selectEnabledNetworksForNamespace(
        KnownCaipNamespace.Solana,
      );
      const result = selector(mockState);
      expect(result).toStrictEqual(['solana:mainnet']);
    });

    it('should return empty array for unknown namespace', () => {
      const selector = selectEnabledNetworksForNamespace('unknown');
      const result = selector(mockState);
      expect(result).toStrictEqual([]);
    });
  });

  describe('selectAllEnabledNetworks', () => {
    it('should return all enabled networks across namespaces', () => {
      const result = selectAllEnabledNetworks(mockState);
      expect(result).toStrictEqual({
        [KnownCaipNamespace.Eip155]: ['0x1', '0xa4b1'],
        [KnownCaipNamespace.Solana]: ['solana:mainnet'],
      });
    });
  });

  describe('selectEnabledNetworksCount', () => {
    it('should return the total count of enabled networks', () => {
      const result = selectEnabledNetworksCount(mockState);
      expect(result).toBe(3); // 2 EVM + 1 Solana
    });
  });

  describe('selectHasEnabledNetworksForNamespace', () => {
    it('should return true when namespace has enabled networks', () => {
      const selector = selectHasEnabledNetworksForNamespace(
        KnownCaipNamespace.Eip155,
      );
      const result = selector(mockState);
      expect(result).toBe(true);
    });

    it('should return false when namespace has no enabled networks', () => {
      const emptyState: NetworkEnablementControllerState = {
        enabledNetworkMap: {
          [KnownCaipNamespace.Eip155]: {
            '0x1': false,
          },
        },
      };
      const selector = selectHasEnabledNetworksForNamespace(
        KnownCaipNamespace.Eip155,
      );
      const result = selector(emptyState);
      expect(result).toBe(false);
    });
  });

  describe('selectEnabledEvmNetworks', () => {
    it('should return enabled EVM networks', () => {
      const result = selectEnabledEvmNetworks(mockState);
      expect(result).toStrictEqual(['0x1', '0xa4b1']);
    });
  });

  describe('selectEnabledSolanaNetworks', () => {
    it('should return enabled Solana networks', () => {
      const result = selectEnabledSolanaNetworks(mockState);
      expect(result).toStrictEqual(['solana:mainnet']);
    });
  });
});
