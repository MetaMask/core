import { BtcScope, SolScope, type CaipChainId } from '@metamask/keyring-api';
import { type NetworkConfiguration } from '@metamask/network-controller';

import {
  toEvmCaipChainId,
  getChainIdForNonEvmAddress,
  checkIfSupportedCaipChainId,
  toMultichainNetworkConfiguration,
  toMultichainNetworkConfigurationsByChainId,
} from './utils';

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
  });

  describe('toMultichainNetworkConfiguration', () => {
    it('updates the network configuration for a single EVM network', () => {
      const network: NetworkConfiguration = {
        chainId: '0x1',
        name: 'Ethereum Mainnet',
        nativeCurrency: 'ETH',
        blockExplorerUrls: ['https://etherscan.io'],
        defaultBlockExplorerUrlIndex: 0,
        rpcEndpoints: [],
        defaultRpcEndpointIndex: 0,
      };
      expect(toMultichainNetworkConfiguration(network)).toStrictEqual({
        chainId: 'eip155:1',
        isEvm: true,
        name: 'Ethereum Mainnet',
        nativeCurrency: 'ETH',
        blockExplorerUrls: ['https://etherscan.io'],
        defaultBlockExplorerUrlIndex: 0,
      });
    });
  });

  describe('toMultichainNetworkConfigurationsByChainId', () => {
    it('updates the network configurations for multiple EVM networks', () => {
      const networks: Record<string, NetworkConfiguration> = {
        '0x1': {
          chainId: '0x1',
          name: 'Ethereum Mainnet',
          nativeCurrency: 'ETH',
          blockExplorerUrls: ['https://etherscan.io'],
          defaultBlockExplorerUrlIndex: 0,
          rpcEndpoints: [],
          defaultRpcEndpointIndex: 0,
        },
        '0xe708': {
          chainId: '0xe708',
          name: 'Linea',
          nativeCurrency: 'ETH',
          blockExplorerUrls: ['https://lineascan.build'],
          defaultBlockExplorerUrlIndex: 0,
          rpcEndpoints: [],
          defaultRpcEndpointIndex: 0,
        },
      };
      expect(
        toMultichainNetworkConfigurationsByChainId(networks),
      ).toStrictEqual({
        'eip155:1': {
          chainId: 'eip155:1',
          isEvm: true,
          name: 'Ethereum Mainnet',
          nativeCurrency: 'ETH',
          blockExplorerUrls: ['https://etherscan.io'],
          defaultBlockExplorerUrlIndex: 0,
        },
        'eip155:59144': {
          chainId: 'eip155:59144',
          isEvm: true,
          name: 'Linea',
          nativeCurrency: 'ETH',
          blockExplorerUrls: ['https://lineascan.build'],
          defaultBlockExplorerUrlIndex: 0,
        },
      });
    });
  });

  describe('toEvmCaipChainId', () => {
    it('converts a hex chain ID to a CAIP chain ID', () => {
      expect(toEvmCaipChainId('0x1')).toBe('eip155:1');
      expect(toEvmCaipChainId('0xe708')).toBe('eip155:59144');
      expect(toEvmCaipChainId('0x539')).toBe('eip155:1337');
    });
  });
});
