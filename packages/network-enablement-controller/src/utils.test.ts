import { KnownCaipNamespace } from '@metamask/utils';

import type { NetworkEnablementControllerState } from './NetworkEnablementController';
import {
  deriveKeys,
  isOnlyNetworkEnabledInNamespace,
  isPopularNetwork,
} from './utils';

describe('Utils', () => {
  describe('deriveKeys', () => {
    describe('EVM networks', () => {
      it('derives keys from hex chain ID', () => {
        const result = deriveKeys('0x1');

        expect(result).toStrictEqual({
          namespace: 'eip155',
          storageKey: '0x1',
          caipChainId: 'eip155:1',
          reference: '1',
        });
      });

      it('derives keys from CAIP chain ID with decimal reference', () => {
        const result = deriveKeys('eip155:1');

        expect(result).toStrictEqual({
          namespace: 'eip155',
          storageKey: '0x1',
          caipChainId: 'eip155:1',
          reference: '1',
        });
      });

      it('derives keys from CAIP chain ID with large decimal reference', () => {
        const result = deriveKeys('eip155:42161');

        expect(result).toStrictEqual({
          namespace: 'eip155',
          storageKey: '0xa4b1',
          caipChainId: 'eip155:42161',
          reference: '42161',
        });
      });
    });

    describe('non-EVM networks', () => {
      it('derives keys from Solana CAIP chain ID', () => {
        const result = deriveKeys('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp');

        expect(result).toStrictEqual({
          namespace: 'solana',
          storageKey: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
          caipChainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
          reference: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
        });
      });

      it('derives keys from Bitcoin CAIP chain ID', () => {
        const result = deriveKeys('bip122:000000000019d6689c085ae165831e93');

        expect(result).toStrictEqual({
          namespace: 'bip122',
          storageKey: 'bip122:000000000019d6689c085ae165831e93',
          caipChainId: 'bip122:000000000019d6689c085ae165831e93',
          reference: '000000000019d6689c085ae165831e93',
        });
      });
    });
  });

  describe('isOnlyNetworkEnabledInNamespace', () => {
    const createMockState = (
      enabledNetworkMap: NetworkEnablementControllerState['enabledNetworkMap'],
    ): NetworkEnablementControllerState => ({
      enabledNetworkMap,
    });

    describe('EVM namespace scenarios', () => {
      it('returns true when network is the only enabled EVM network (hex chain ID)', () => {
        const state = createMockState({
          [KnownCaipNamespace.Eip155]: {
            '0x1': true,
            '0xa': false,
            '0xa4b1': false,
          },
        });

        const derivedKeys = deriveKeys('0x1');
        const result = isOnlyNetworkEnabledInNamespace(state, derivedKeys);

        expect(result).toBe(true);
      });

      it('returns true when network is the only enabled EVM network (CAIP chain ID)', () => {
        const state = createMockState({
          [KnownCaipNamespace.Eip155]: {
            '0x1': true,
            '0xa': false,
            '0xa4b1': false,
          },
        });

        const derivedKeys = deriveKeys('eip155:1');
        const result = isOnlyNetworkEnabledInNamespace(state, derivedKeys);

        expect(result).toBe(true);
      });

      it('returns false when there are multiple enabled EVM networks', () => {
        const state = createMockState({
          [KnownCaipNamespace.Eip155]: {
            '0x1': true,
            '0xa': true,
            '0xa4b1': false,
          },
        });

        const derivedKeys = deriveKeys('0x1');
        const result = isOnlyNetworkEnabledInNamespace(state, derivedKeys);

        expect(result).toBe(false);
      });

      it('returns false when no EVM networks are enabled', () => {
        const state = createMockState({
          [KnownCaipNamespace.Eip155]: {
            '0x1': false,
            '0xa': false,
            '0xa4b1': false,
          },
        });

        const derivedKeys = deriveKeys('0x1');
        const result = isOnlyNetworkEnabledInNamespace(state, derivedKeys);

        expect(result).toBe(false);
      });

      it('returns false when target network is not the only enabled one', () => {
        const state = createMockState({
          [KnownCaipNamespace.Eip155]: {
            '0x1': false,
            '0xa': true,
            '0xa4b1': false,
          },
        });

        const derivedKeys = deriveKeys('0x1');
        const result = isOnlyNetworkEnabledInNamespace(state, derivedKeys);

        expect(result).toBe(false);
      });
    });

    describe('Solana namespace scenarios', () => {
      it('returns true when network is the only enabled Solana network', () => {
        const state = createMockState({
          [KnownCaipNamespace.Solana]: {
            'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': true,
            'solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z': false,
          },
        });

        const derivedKeys = deriveKeys(
          'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
        );
        const result = isOnlyNetworkEnabledInNamespace(state, derivedKeys);

        expect(result).toBe(true);
      });

      it('returns false when there are multiple enabled Solana networks', () => {
        const state = createMockState({
          [KnownCaipNamespace.Solana]: {
            'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': true,
            'solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z': true,
          },
        });

        const derivedKeys = deriveKeys(
          'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
        );
        const result = isOnlyNetworkEnabledInNamespace(state, derivedKeys);

        expect(result).toBe(false);
      });

      it('returns false when no Solana networks are enabled', () => {
        const state = createMockState({
          [KnownCaipNamespace.Solana]: {
            'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': false,
            'solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z': false,
          },
        });

        const derivedKeys = deriveKeys(
          'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
        );
        const result = isOnlyNetworkEnabledInNamespace(state, derivedKeys);

        expect(result).toBe(false);
      });

      it('returns false when target network is not the only enabled one', () => {
        const state = createMockState({
          [KnownCaipNamespace.Solana]: {
            'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': false,
            'solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z': true,
          },
        });

        const derivedKeys = deriveKeys(
          'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
        );
        const result = isOnlyNetworkEnabledInNamespace(state, derivedKeys);

        expect(result).toBe(false);
      });
    });

    describe('Non-existent namespace scenarios', () => {
      it('returns false when namespace does not exist', () => {
        const state = createMockState({});

        const derivedKeys = deriveKeys('0x1');
        const result = isOnlyNetworkEnabledInNamespace(state, derivedKeys);

        expect(result).toBe(false);
      });

      it('returns false when namespace exists but is empty', () => {
        const state = createMockState({
          [KnownCaipNamespace.Eip155]: {},
        });

        const derivedKeys = deriveKeys('0x1');
        const result = isOnlyNetworkEnabledInNamespace(state, derivedKeys);

        expect(result).toBe(false);
      });
    });

    describe('Cross-format compatibility', () => {
      it('should return consistent results for hex and CAIP formats of the same network', () => {
        const state = createMockState({
          [KnownCaipNamespace.Eip155]: {
            '0x1': true,
            '0xa': false,
            '0xa4b1': false,
          },
        });

        const hexKeys = deriveKeys('0x1');
        const hexResult = isOnlyNetworkEnabledInNamespace(state, hexKeys);

        const caipKeys = deriveKeys('eip155:1');
        const caipResult = isOnlyNetworkEnabledInNamespace(state, caipKeys);

        expect(hexResult).toBe(true);
        expect(caipResult).toBe(true);
        expect(hexResult).toBe(caipResult);
      });
    });
  });

  describe('isPopularNetwork', () => {
    it('returns true for popular EVM networks', () => {
      // Test with Ethereum mainnet (chain ID 1)
      expect(isPopularNetwork('1')).toBe(true);

      // Test with Polygon mainnet (chain ID 137)
      expect(isPopularNetwork('137')).toBe(true);
    });

    it('returns false for non-popular EVM networks', () => {
      // Test with a custom/test network
      expect(isPopularNetwork('999999')).toBe(false);
    });

    it('returns false for non-decimal references (like Bitcoin hashes)', () => {
      // Test with Bitcoin block hash reference
      expect(isPopularNetwork('000000000019d6689c085ae165831e93')).toBe(false);
    });

    it('returns false for invalid references', () => {
      // Test with completely invalid reference
      expect(isPopularNetwork('invalid-reference')).toBe(false);
    });
  });
});
