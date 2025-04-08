import {
  type KeyringAccountType,
  type CaipChainId,
  BtcScope,
  SolScope,
  EthScope,
  EthAccountType,
  BtcAccountType,
  SolAccountType,
} from '@metamask/keyring-api';
import { type NetworkConfiguration } from '@metamask/network-controller';
import { type CaipAccountId, KnownCaipNamespace } from '@metamask/utils';
import log from 'loglevel';

import { MULTICHAIN_ACCOUNTS_DOMAIN } from './constants';
import type { ActiveNetworksResponse } from './types';
import {
  isEvmCaipChainId,
  toEvmCaipChainId,
  convertEvmCaipToHexChainId,
  getChainIdForNonEvmAddress,
  checkIfSupportedCaipChainId,
  toMultichainNetworkConfiguration,
  toMultichainNetworkConfigurationsByChainId,
  formatNetworkActivityResponse,
  buildActiveNetworksUrl,
  validateAccountIds,
  formatCaipAccountId,
  ChainType,
  getChainTypeFromAccountType,
} from './utils';

jest.mock('@metamask/controller-utils', () => ({
  isValidHexAddress: jest.fn((address) => {
    return /^0x[0-9a-fA-F]{40}$/u.test(address);
  }),
  isSolanaAddress: jest.fn((address) => {
    return /^solana:\d+:[1-9A-HJ-NP-Za-km-z]{32,44}$/u.test(address);
  }),
  isBtcMainnetAddress: jest.fn((address) => {
    return /^bip122:\d+:(1|3|bc1)[a-zA-Z0-9]{25,62}$/u.test(address);
  }),
}));

jest.mock('@metamask/utils', () => {
  const actual = jest.requireActual('@metamask/utils');
  return {
    ...actual,
    isCaipAccountId: jest.fn((id) => {
      const evmPattern = /^eip155:\d+:0x[0-9a-fA-F]{40}$/u;
      const solanaPattern = /^solana:\d+:[1-9A-HJ-NP-Za-km-z]{32,44}$/u;
      const bitcoinPattern = /^bip122:\d+:(1|3|bc1)[a-zA-Z0-9]{25,62}$/u;

      return (
        evmPattern.test(id) || solanaPattern.test(id) || bitcoinPattern.test(id)
      );
    }),
    isKnownNamespace: () => {
      return true;
    },
    KnownCaipNamespace: {
      ...actual.KnownCaipNamespace,
      Test: 'test',
    },
    parseCaipAccountId: (id: string) => {
      if (id.startsWith('test:')) {
        return {
          address: '0x1234567890123456789012345678901234567890',
          chain: {
            namespace: 'test',
            reference: '1',
          },
        };
      }
      return actual.parseCaipAccountId(id);
    },
  };
});

jest.mock('loglevel', () => ({
  error: jest.fn(),
}));

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

    it('updates the network configuration for a single non-EVM network with undefined name', () => {
      const network: NetworkConfiguration = {
        chainId: '0x1',
        // @ts-expect-error - set as undefined for test case
        name: undefined,
        nativeCurrency: 'ETH',
        blockExplorerUrls: ['https://etherscan.io'],
        defaultBlockExplorerUrlIndex: 0,
        rpcEndpoints: [
          {
            url: 'https://mainnet.infura.io/',
            failoverUrls: [],
            networkClientId: 'random-id',
            // @ts-expect-error - network-controller does not export RpcEndpointType
            type: 'custom',
          },
        ],
        defaultRpcEndpointIndex: 0,
      };
      expect(toMultichainNetworkConfiguration(network)).toStrictEqual({
        chainId: 'eip155:1',
        isEvm: true,
        name: 'https://mainnet.infura.io/',
        nativeCurrency: 'ETH',
        blockExplorerUrls: ['https://etherscan.io'],
        defaultBlockExplorerUrlIndex: 0,
      });
    });

    it('uses default block explorer index when undefined', () => {
      const network: NetworkConfiguration = {
        chainId: '0x1',
        name: 'Ethereum Mainnet',
        nativeCurrency: 'ETH',
        blockExplorerUrls: ['https://etherscan.io'],
        defaultBlockExplorerUrlIndex: undefined,
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

  describe('convertEvmCaipToHexChainId', () => {
    it('converts a hex chain ID to a CAIP chain ID', () => {
      expect(toEvmCaipChainId('0x1')).toBe('eip155:1');
      expect(toEvmCaipChainId('0xe708')).toBe('eip155:59144');
      expect(toEvmCaipChainId('0x539')).toBe('eip155:1337');
    });
  });

  describe('convertCaipToHexChainId', () => {
    it('converts a CAIP chain ID to a hex chain ID', () => {
      expect(convertEvmCaipToHexChainId(EthScope.Mainnet)).toBe('0x1');
      expect(convertEvmCaipToHexChainId('eip155:56')).toBe('0x38');
      expect(convertEvmCaipToHexChainId('eip155:80094')).toBe('0x138de');
      expect(convertEvmCaipToHexChainId('eip155:8453')).toBe('0x2105');
    });

    it('throws an error given a CAIP chain ID with an unsupported namespace', () => {
      expect(() => convertEvmCaipToHexChainId(BtcScope.Mainnet)).toThrow(
        'Unsupported CAIP chain ID namespace: bip122. Only eip155 is supported.',
      );
      expect(() => convertEvmCaipToHexChainId(SolScope.Mainnet)).toThrow(
        'Unsupported CAIP chain ID namespace: solana. Only eip155 is supported.',
      );
    });
  });

  describe('isEvmCaipChainId', () => {
    it('returns true for EVM chain IDs', () => {
      expect(isEvmCaipChainId(EthScope.Mainnet)).toBe(true);
      expect(isEvmCaipChainId(SolScope.Mainnet)).toBe(false);
      expect(isEvmCaipChainId(BtcScope.Mainnet)).toBe(false);
    });
  });

  describe('validateAccountIds', () => {
    const mockValidEvmId =
      'eip155:1:0x1234567890123456789012345678901234567890';
    const mockValidSolanaId =
      'solana:1:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const mockInvalidId = 'invalid:format:address';

    it('should not throw for valid EVM account ID', () => {
      expect(() => validateAccountIds([mockValidEvmId])).not.toThrow();
    });

    it('should not throw for valid Solana account ID', () => {
      expect(() => validateAccountIds([mockValidSolanaId])).not.toThrow();
    });

    it('should not throw for multiple valid account IDs', () => {
      expect(() =>
        validateAccountIds([mockValidEvmId, mockValidSolanaId]),
      ).not.toThrow();
    });

    it('should throw for empty array', () => {
      expect(() => validateAccountIds([])).toThrow(
        'At least one account ID is required',
      );
    });

    it('should throw for invalid account ID format', () => {
      expect(() => validateAccountIds([mockInvalidId])).toThrow(
        `Invalid CAIP-10 account IDs: ${mockInvalidId}`,
      );
      expect(log.error).toHaveBeenCalledWith(
        'Account ID validation failed: invalid CAIP-10 format',
        expect.objectContaining({
          invalidIds: [mockInvalidId],
        }),
      );
    });

    it('should throw and list all invalid IDs when multiple invalid IDs are provided', () => {
      const secondInvalidId = 'another:invalid:id';
      expect(() =>
        validateAccountIds([mockInvalidId, secondInvalidId]),
      ).toThrow(
        `Invalid CAIP-10 account IDs: ${mockInvalidId}, ${secondInvalidId}`,
      );
      expect(log.error).toHaveBeenCalledWith(
        'Account ID validation failed: invalid CAIP-10 format',
        expect.objectContaining({
          invalidIds: [mockInvalidId, secondInvalidId],
        }),
      );
    });

    it('should throw even if some IDs are valid when at least one is invalid', () => {
      expect(() => validateAccountIds([mockValidEvmId, mockInvalidId])).toThrow(
        `Invalid CAIP-10 account IDs: ${mockInvalidId}`,
      );
      expect(log.error).toHaveBeenCalledWith(
        'Account ID validation failed: invalid CAIP-10 format',
        expect.objectContaining({
          invalidIds: [mockInvalidId],
        }),
      );
    });

    it('should throw for unsupported namespace', () => {
      const unsupportedNamespaceId =
        'cosmos:1:cosmos1hsk6jryyqjfhp5dhc55tc9jtckygx0eph6dd02';
      expect(() => validateAccountIds([unsupportedNamespaceId])).toThrow(
        `Invalid CAIP-10 account IDs: ${unsupportedNamespaceId}`,
      );
      expect(log.error).toHaveBeenCalledWith(
        'Account ID validation failed: invalid CAIP-10 format',
        expect.objectContaining({
          invalidIds: [unsupportedNamespaceId],
        }),
      );
    });

    it('should throw for invalid EVM address', () => {
      const invalidEvmId = 'eip155:1:0xinvalid';
      expect(() => validateAccountIds([invalidEvmId])).toThrow(
        `Invalid CAIP-10 account IDs: ${invalidEvmId}`,
      );
      expect(log.error).toHaveBeenCalledWith(
        'Account ID validation failed: invalid CAIP-10 format',
        expect.objectContaining({
          invalidIds: [invalidEvmId],
        }),
      );
    });

    it('should throw for invalid Solana address', () => {
      const invalidSolanaId = 'solana:1:invalid';
      expect(() => validateAccountIds([invalidSolanaId])).toThrow(
        `Invalid CAIP-10 account IDs: ${invalidSolanaId}`,
      );
      expect(log.error).toHaveBeenCalledWith(
        'Account ID validation failed: invalid CAIP-10 format',
        expect.objectContaining({
          invalidIds: [invalidSolanaId],
        }),
      );
    });

    it('should throw for invalid Bitcoin address', () => {
      const invalidBitcoinId = 'bip122:1:invalid';
      expect(() => validateAccountIds([invalidBitcoinId])).toThrow(
        `Invalid CAIP-10 account IDs: ${invalidBitcoinId}`,
      );
      expect(log.error).toHaveBeenCalledWith(
        'Account ID validation failed: invalid CAIP-10 format',
        expect.objectContaining({
          invalidIds: [invalidBitcoinId],
        }),
      );
    });

    it('should handle unknown namespace in address validation', () => {
      const customNamespaceId =
        'custom:1:0x1234567890123456789012345678901234567890';
      expect(() => validateAccountIds([customNamespaceId])).toThrow(
        `Invalid CAIP-10 account IDs: ${customNamespaceId}`,
      );
      expect(log.error).toHaveBeenCalledWith(
        'Account ID validation failed: invalid CAIP-10 format',
        expect.objectContaining({
          invalidIds: [customNamespaceId],
        }),
      );
    });

    it('should handle switch default case in address validation', () => {
      const testNamespaceId =
        'test:1:0x1234567890123456789012345678901234567890';
      expect(() => validateAccountIds([testNamespaceId])).toThrow(
        `Invalid CAIP-10 account IDs: ${testNamespaceId}`,
      );
      expect(log.error).toHaveBeenCalledWith(
        'Account ID validation failed: invalid CAIP-10 format',
        expect.objectContaining({
          invalidIds: [testNamespaceId],
        }),
      );
    });
  });

  describe('buildActiveNetworksUrl', () => {
    it('should construct URL with single account ID', () => {
      const accountId = 'eip155:1:0x1234567890123456789012345678901234567890';
      const url = buildActiveNetworksUrl([accountId]);
      expect(url.toString()).toBe(
        `${MULTICHAIN_ACCOUNTS_DOMAIN}/v2/activeNetworks?accountIds=${encodeURIComponent(accountId)}`,
      );
    });

    it('should construct URL with multiple account IDs', () => {
      const accountIds: CaipAccountId[] = [
        'eip155:1:0x1234567890123456789012345678901234567890',
        'solana:1:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      ];
      const url = buildActiveNetworksUrl(accountIds);
      expect(url.toString()).toBe(
        `${MULTICHAIN_ACCOUNTS_DOMAIN}/v2/activeNetworks?accountIds=${encodeURIComponent(accountIds.join(','))}`,
      );
    });
  });

  describe('formatNetworkActivityResponse', () => {
    it('should format EVM network responses correctly', () => {
      const response: ActiveNetworksResponse = {
        activeNetworks: [
          'eip155:1:0x1234567890123456789012345678901234567890',
          'eip155:137:0x1234567890123456789012345678901234567890',
        ],
      };

      const result = formatNetworkActivityResponse(response);

      expect(result).toStrictEqual({
        '0x1234567890123456789012345678901234567890': {
          namespace: KnownCaipNamespace.Eip155,
          activeChains: ['1', '137'],
        },
      });
    });

    it('should format non-EVM network responses correctly', () => {
      const response: ActiveNetworksResponse = {
        activeNetworks: [
          'solana:1:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        ],
      };

      const result = formatNetworkActivityResponse(response);

      expect(result).toStrictEqual({
        EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: {
          namespace: KnownCaipNamespace.Solana,
          activeChains: ['1'],
        },
      });
    });

    it('should handle mixed EVM and non-EVM networks', () => {
      const response: ActiveNetworksResponse = {
        activeNetworks: [
          'eip155:1:0x1234567890123456789012345678901234567890',
          'solana:1:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        ],
      };

      const result = formatNetworkActivityResponse(response);

      expect(result).toStrictEqual({
        '0x1234567890123456789012345678901234567890': {
          namespace: KnownCaipNamespace.Eip155,
          activeChains: ['1'],
        },
        EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: {
          namespace: KnownCaipNamespace.Solana,
          activeChains: ['1'],
        },
      });
    });

    it('should handle empty response', () => {
      const response: ActiveNetworksResponse = {
        activeNetworks: [],
      };

      const result = formatNetworkActivityResponse(response);

      expect(result).toStrictEqual({});
    });

    it('should handle multiple addresses with different networks', () => {
      const response: ActiveNetworksResponse = {
        activeNetworks: [
          'eip155:1:0x1234567890123456789012345678901234567890',
          'eip155:137:0x9876543210987654321098765432109876543210',
        ],
      };

      const result = formatNetworkActivityResponse(response);

      expect(result).toStrictEqual({
        '0x1234567890123456789012345678901234567890': {
          namespace: KnownCaipNamespace.Eip155,
          activeChains: ['1'],
        },
        '0x9876543210987654321098765432109876543210': {
          namespace: KnownCaipNamespace.Eip155,
          activeChains: ['137'],
        },
      });
    });
  });

  describe('formatCaipAccountId', () => {
    it('formats EVM addresses correctly', () => {
      const evmAddress = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599';
      expect(formatCaipAccountId(evmAddress, ChainType.Evm)).toBe(
        `${KnownCaipNamespace.Eip155}:0:${evmAddress}`,
      );
    });

    it('formats Solana addresses correctly', () => {
      const solanaAddress = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
      expect(formatCaipAccountId(solanaAddress, ChainType.Solana)).toBe(
        `${KnownCaipNamespace.Solana}:1:${solanaAddress}`,
      );
    });

    it('formats Bitcoin addresses correctly', () => {
      const bitcoinAddress = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
      expect(formatCaipAccountId(bitcoinAddress, ChainType.Bitcoin)).toBe(
        `${KnownCaipNamespace.Bip122}:1:${bitcoinAddress}`,
      );
    });

    it('maintains address case sensitivity', () => {
      const mixedCaseAddress = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599';
      const result = formatCaipAccountId(mixedCaseAddress, ChainType.Evm);
      expect(result).toContain(mixedCaseAddress);
      expect(result).not.toContain(mixedCaseAddress.toLowerCase());
    });

    it('throws an error for unsupported chain types', () => {
      const unsupportedChainType = -1 as unknown as ChainType;
      expect(() =>
        formatCaipAccountId('address', unsupportedChainType),
      ).toThrow('Unsupported chain type: -1');
    });
  });

  describe('getChainTypeFromAccountType', () => {
    it('returns EVM for EthAccountType.Eoa', () => {
      const result = getChainTypeFromAccountType(EthAccountType.Eoa);
      expect(result).toBe(ChainType.Evm);
    });

    it('returns Bitcoin for BtcAccountType.P2wpkh', () => {
      const result = getChainTypeFromAccountType(BtcAccountType.P2wpkh);
      expect(result).toBe(ChainType.Bitcoin);
    });

    it('returns Solana for SolAccountType.DataAccount', () => {
      const result = getChainTypeFromAccountType(SolAccountType.DataAccount);
      expect(result).toBe(ChainType.Solana);
    });

    it('throws an error for unsupported account types', () => {
      const unsupportedAccountType = 'unsupported' as KeyringAccountType;
      expect(() => getChainTypeFromAccountType(unsupportedAccountType)).toThrow(
        'Unsupported account type: unsupported',
      );
    });
  });
});
