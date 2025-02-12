import { BtcScope, CaipChainId, SolScope } from '@metamask/keyring-api';

import {
  getChainIdForNonEvmAddress,
  checkIfSupportedCaipChainId,
} from './utils';
import { SupportedCaipChainId } from './types';

describe('utils', () => {
  describe('getChainIdForNonEvmAddress', () => {
    it('returns Solana chain ID for Solana addresses', () => {
      const solanaAddress = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
      expect(getChainIdForNonEvmAddress(solanaAddress)).toBe(SolScope.Mainnet);
    });

    it('returns Bitcoin chain ID for non-Solana addresses', () => {
      const bitcoinAddress = 'bc1qzqc2aqlw8nwa0a05ehjkk7dgt8308ac7kzw9a6';
      expect(getChainIdForNonEvmAddress(bitcoinAddress)).toBe(BtcScope.Mainnet);
    });
  });

  describe('checkIfSupportedCaipChainId', () => {
    it('returns true for supported CAIP chain IDs', () => {
      expect(checkIfSupportedCaipChainId(SolScope.Mainnet)).toBe(true);
      expect(checkIfSupportedCaipChainId(BtcScope.Mainnet)).toBe(true);
    });

    it('returns false for non-CAIP IDs', () => {
      expect(checkIfSupportedCaipChainId('mainnet' as CaipChainId)).toBe(false);
    });

    it('returns false for unsupported CAIP chain IDs', () => {
      expect(checkIfSupportedCaipChainId('eip155:1')).toBe(false);
    });

    it('provides type guard functionality', () => {
      const chainId = SolScope.Mainnet;
      if (checkIfSupportedCaipChainId(chainId)) {
        // TypeScript should recognize chainId as SupportedCaipChainId
        const supportedChainId: SupportedCaipChainId = chainId;
        expect(supportedChainId).toBe(chainId);
      }
    });
  });
});
