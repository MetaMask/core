import { KnownCaipNamespace } from '@metamask/utils';

import type { NetworkEnablementControllerState } from './NetworkEnablementController';
import { deriveKeys, isOnlyNetworkEnabledInNamespace } from './utils';

describe('Utils', () => {
  describe('deriveKeys', () => {
    describe('EVM networks', () => {
      it('derives keys from hex chain ID', () => {
        const result = deriveKeys('0x1');

        expect(result).toStrictEqual({
          namespace: 'eip155',
          storageKey: '0x1',
          caipId: 'eip155:1',
          reference: '1',
        });
      });

      it('derives keys from CAIP chain ID with decimal reference', () => {
        const result = deriveKeys('eip155:1');

        expect(result).toStrictEqual({
          namespace: 'eip155',
          storageKey: '0x1',
          caipId: 'eip155:1',
          reference: '1',
        });
      });

      it('derives keys from CAIP chain ID with large decimal reference', () => {
        const result = deriveKeys('eip155:42161');

        expect(result).toStrictEqual({
          namespace: 'eip155',
          storageKey: '0xa4b1',
          caipId: 'eip155:42161',
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
          caipId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
          reference: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
        });
      });

      it('derives keys from Bitcoin CAIP chain ID', () => {
        const result = deriveKeys('bip122:000000000019d6689c085ae165831e93');

        expect(result).toStrictEqual({
          namespace: 'bip122',
          storageKey: 'bip122:000000000019d6689c085ae165831e93',
          caipId: 'bip122:000000000019d6689c085ae165831e93',
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

        const result = isOnlyNetworkEnabledInNamespace(
          state,
          KnownCaipNamespace.Eip155,
          '0x1',
        );

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

        const result = isOnlyNetworkEnabledInNamespace(
          state,
          KnownCaipNamespace.Eip155,
          'eip155:1',
        );

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

        const result = isOnlyNetworkEnabledInNamespace(
          state,
          KnownCaipNamespace.Eip155,
          '0x1',
        );

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

        const result = isOnlyNetworkEnabledInNamespace(
          state,
          KnownCaipNamespace.Eip155,
          '0x1',
        );

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

        const result = isOnlyNetworkEnabledInNamespace(
          state,
          KnownCaipNamespace.Eip155,
          '0x1',
        );

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

        const result = isOnlyNetworkEnabledInNamespace(
          state,
          KnownCaipNamespace.Solana,
          'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
        );

        expect(result).toBe(true);
      });

      it('returns false when there are multiple enabled Solana networks', () => {
        const state = createMockState({
          [KnownCaipNamespace.Solana]: {
            'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': true,
            'solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z': true,
          },
        });

        const result = isOnlyNetworkEnabledInNamespace(
          state,
          KnownCaipNamespace.Solana,
          'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
        );

        expect(result).toBe(false);
      });

      it('returns false when no Solana networks are enabled', () => {
        const state = createMockState({
          [KnownCaipNamespace.Solana]: {
            'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': false,
            'solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z': false,
          },
        });

        const result = isOnlyNetworkEnabledInNamespace(
          state,
          KnownCaipNamespace.Solana,
          'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
        );

        expect(result).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('returns false when namespace does not exist in state', () => {
        const state = createMockState({
          [KnownCaipNamespace.Eip155]: {
            '0x1': true,
          },
        });

        const result = isOnlyNetworkEnabledInNamespace(
          state,
          KnownCaipNamespace.Solana,
          'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
        );

        expect(result).toBe(false);
      });

      it('returns false when chain ID namespace does not match provided namespace', () => {
        const state = createMockState({
          [KnownCaipNamespace.Eip155]: {
            '0x1': true,
          },
          [KnownCaipNamespace.Solana]: {
            'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': true,
          },
        });

        // Trying to check EVM chain ID against Solana namespace
        const result = isOnlyNetworkEnabledInNamespace(
          state,
          KnownCaipNamespace.Solana,
          '0x1',
        );

        expect(result).toBe(false);
      });

      it('returns false when enabledNetworkMap is empty', () => {
        const state = createMockState({});

        const result = isOnlyNetworkEnabledInNamespace(
          state,
          KnownCaipNamespace.Eip155,
          '0x1',
        );

        expect(result).toBe(false);
      });

      it('returns false when namespace exists but has no networks', () => {
        const state = createMockState({
          [KnownCaipNamespace.Eip155]: {},
        });

        const result = isOnlyNetworkEnabledInNamespace(
          state,
          KnownCaipNamespace.Eip155,
          '0x1',
        );

        expect(result).toBe(false);
      });
    });

    describe('hex to CAIP ID conversion matching', () => {
      it('matches hex chain ID to equivalent CAIP format correctly', () => {
        const state = createMockState({
          [KnownCaipNamespace.Eip155]: {
            '0xa4b1': true, // Arbitrum One
            '0x1': false,
          },
        });

        // Both should match the same network (Arbitrum One)
        const hexResult = isOnlyNetworkEnabledInNamespace(
          state,
          KnownCaipNamespace.Eip155,
          '0xa4b1',
        );
        const caipResult = isOnlyNetworkEnabledInNamespace(
          state,
          KnownCaipNamespace.Eip155,
          'eip155:42161',
        );

        expect(hexResult).toBe(true);
        expect(caipResult).toBe(true);
      });
    });
  });
});
