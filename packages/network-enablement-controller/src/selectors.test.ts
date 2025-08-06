import { KnownCaipNamespace } from '@metamask/utils';

import type { NetworkEnablementControllerState } from './NetworkEnablementController';
import {
  selectEnabledNetworkMap,
  selectIsNetworkEnabled,
  createSelectorForEnabledNetworksForNamespace,
  selectAllEnabledNetworks,
  selectEnabledNetworksCount,
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
    it('returns the enabled network map', () => {
      const result = selectEnabledNetworkMap(mockState);
      expect(result).toBe(mockState.enabledNetworkMap);
    });
  });

  describe('selectIsNetworkEnabled', () => {
    it('returns true for enabled EVM network with hex chain ID', () => {
      const selector = selectIsNetworkEnabled('0x1');
      const result = selector(mockState);
      expect(result).toBe(true);
    });

    it('returns true for enabled EVM network with CAIP chain ID', () => {
      const selector = selectIsNetworkEnabled('eip155:1');
      const result = selector(mockState);
      expect(result).toBe(true);
    });

    it('returns true for enabled Solana network', () => {
      const selector = selectIsNetworkEnabled('solana:mainnet');
      const result = selector(mockState);
      expect(result).toBe(true);
    });

    it('returns false for unknown network', () => {
      const selector = selectIsNetworkEnabled('0x999');
      const result = selector(mockState);
      expect(result).toBe(false);
    });
  });

  describe('createSelectorForEnabledNetworksForNamespace', () => {
    it('returns enabled EVM networks', () => {
      const selector = createSelectorForEnabledNetworksForNamespace(
        KnownCaipNamespace.Eip155,
      );
      const result = selector(mockState);
      expect(result).toStrictEqual(['0x1', '0xa4b1']);
    });

    it('returns enabled Solana networks', () => {
      const selector = createSelectorForEnabledNetworksForNamespace(
        KnownCaipNamespace.Solana,
      );
      const result = selector(mockState);
      expect(result).toStrictEqual(['solana:mainnet']);
    });

    it('returns empty array for unknown namespace', () => {
      const selector = createSelectorForEnabledNetworksForNamespace('unknown');
      const result = selector(mockState);
      expect(result).toStrictEqual([]);
    });
  });

  describe('selectAllEnabledNetworks', () => {
    it('returns all enabled networks across namespaces', () => {
      const result = selectAllEnabledNetworks(mockState);
      expect(result).toStrictEqual({
        [KnownCaipNamespace.Eip155]: ['0x1', '0xa4b1'],
        [KnownCaipNamespace.Solana]: ['solana:mainnet'],
      });
    });
  });

  describe('selectEnabledNetworksCount', () => {
    it('returns the total count of enabled networks', () => {
      const result = selectEnabledNetworksCount(mockState);
      expect(result).toBe(3); // 2 EVM + 1 Solana
    });
  });

  describe('selectEnabledEvmNetworks', () => {
    it('returns enabled EVM networks', () => {
      const result = selectEnabledEvmNetworks(mockState);
      expect(result).toStrictEqual(['0x1', '0xa4b1']);
    });
  });

  describe('selectEnabledSolanaNetworks', () => {
    it('returns enabled Solana networks', () => {
      const result = selectEnabledSolanaNetworks(mockState);
      expect(result).toStrictEqual(['solana:mainnet']);
    });
  });
});
