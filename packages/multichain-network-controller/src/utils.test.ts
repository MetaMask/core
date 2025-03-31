import { handleFetch } from '@metamask/controller-utils';
import {
  BtcScope,
  SolScope,
  EthScope,
  type CaipChainId,
} from '@metamask/keyring-api';
import { type NetworkConfiguration } from '@metamask/network-controller';
import { type Hex, KnownCaipNamespace } from '@metamask/utils';

import { MULTICHAIN_ACCOUNTS_DOMAIN } from './constants';
import {
  isEvmCaipChainId,
  toEvmCaipChainId,
  convertEvmCaipToHexChainId,
  getChainIdForNonEvmAddress,
  checkIfSupportedCaipChainId,
  toMultichainNetworkConfiguration,
  toMultichainNetworkConfigurationsByChainId,
  fetchNetworkActivityByAccounts,
  formatNetworkActivityResponse,
  buildActiveNetworksUrl,
  validateAccountIds,
  parseNetworkString,
} from './utils';

jest.mock('@metamask/controller-utils', () => ({
  handleFetch: jest.fn(),
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

  describe('fetchNetworkActivityByAccounts', () => {
    const mockValidAccountId =
      'eip155:1:0x1234567890123456789012345678901234567890';
    const mockValidSolanaAccountId =
      'solana:1:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const mockInvalidAccountId = 'invalid:0:123';

    beforeEach(() => {
      jest.clearAllMocks();
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should successfully fetch active networks for valid EVM account ID', async () => {
      const mockResponse = {
        activeNetworks: [
          'eip155:1:0x1234567890123456789012345678901234567890',
          'eip155:137:0x1234567890123456789012345678901234567890',
        ],
      };

      (handleFetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      const expectedUrl = new URL(
        `${MULTICHAIN_ACCOUNTS_DOMAIN}/v2/activeNetworks`,
      );
      expectedUrl.searchParams.append('accountIds', mockValidAccountId);

      const result = await fetchNetworkActivityByAccounts([mockValidAccountId]);

      const [calledUrl, calledOptions] = (handleFetch as jest.Mock).mock
        .calls[0];
      expect(new URL(calledUrl).toString()).toBe(expectedUrl.toString());
      expect(calledOptions.method).toBe('GET');
      expect(calledOptions.headers).toStrictEqual({
        Accept: 'application/json',
      });
      expect(result).toStrictEqual(mockResponse);
    });

    it('should successfully fetch active networks for valid Solana account ID', async () => {
      const mockResponse = {
        activeNetworks: [
          'solana:1:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        ],
      };

      (handleFetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await fetchNetworkActivityByAccounts([
        mockValidSolanaAccountId,
      ]);
      expect(result).toStrictEqual(mockResponse);
    });

    it('should handle multiple account IDs correctly', async () => {
      const mockResponse = {
        activeNetworks: [
          'eip155:1:0x1234567890123456789012345678901234567890',
          'solana:1:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        ],
      };

      (handleFetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      const expectedUrl = new URL(
        `${MULTICHAIN_ACCOUNTS_DOMAIN}/v2/activeNetworks`,
      );
      expectedUrl.searchParams.append(
        'accountIds',
        `${mockValidAccountId},${mockValidSolanaAccountId}`,
      );

      const result = await fetchNetworkActivityByAccounts([
        mockValidAccountId,
        mockValidSolanaAccountId,
      ]);

      const [calledUrl, calledOptions] = (handleFetch as jest.Mock).mock
        .calls[0];
      expect(new URL(calledUrl).toString()).toBe(expectedUrl.toString());
      expect(calledOptions.method).toBe('GET');
      expect(calledOptions.headers).toStrictEqual({
        Accept: 'application/json',
      });
      expect(result).toStrictEqual(mockResponse);
    });

    it('should throw error for empty account IDs array', async () => {
      await expect(fetchNetworkActivityByAccounts([])).rejects.toThrow(
        'At least one account ID is required',
      );
    });

    it('should throw error for invalid account ID format', async () => {
      await expect(
        fetchNetworkActivityByAccounts([mockInvalidAccountId]),
      ).rejects.toThrow(/Invalid CAIP-10 account IDs/u);
    });

    it('should throw error for invalid API response format', async () => {
      (handleFetch as jest.Mock).mockResolvedValueOnce({
        invalidKey: [],
      });

      await expect(
        fetchNetworkActivityByAccounts([mockValidAccountId]),
      ).rejects.toThrow('Invalid response format from active networks API');
    });

    it('should handle request timeout', async () => {
      (handleFetch as jest.Mock).mockRejectedValueOnce(
        Object.assign(new Error(), { name: 'AbortError' }),
      );

      await expect(
        fetchNetworkActivityByAccounts([mockValidAccountId]),
      ).rejects.toThrow('Request timeout: Failed to fetch active networks');
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network failure');
      (handleFetch as jest.Mock).mockRejectedValueOnce(networkError);

      await expect(
        fetchNetworkActivityByAccounts([mockValidAccountId]),
      ).rejects.toThrow(networkError);
    });

    it('should handle non-Error objects in catch block', async () => {
      (handleFetch as jest.Mock).mockRejectedValueOnce('String error');

      await expect(
        fetchNetworkActivityByAccounts([mockValidAccountId]),
      ).rejects.toThrow('Failed to fetch active networks: String error');
    });
  });

  describe('validateAccountIds', () => {
    it('should throw error for empty account IDs array', () => {
      expect(() => validateAccountIds([])).toThrow(
        'At least one account ID is required',
      );
    });

    it('should throw error for invalid account ID format', () => {
      expect(() => validateAccountIds(['invalid:0:123'])).toThrow(
        'Invalid CAIP-10 account IDs: invalid:0:123',
      );
    });

    it('should not throw for valid account IDs', () => {
      expect(() =>
        validateAccountIds([
          'eip155:1:0x1234567890123456789012345678901234567890',
          'solana:1:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        ]),
      ).not.toThrow();
    });

    it('should throw for mixed valid and invalid account IDs', () => {
      expect(() =>
        validateAccountIds([
          'eip155:1:0x1234567890123456789012345678901234567890',
          'invalid:0:123',
        ]),
      ).toThrow('Invalid CAIP-10 account IDs: invalid:0:123');
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
      const accountIds = [
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
      const response = {
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
      const response = {
        activeNetworks: [
          'solana:1:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        ],
      };

      const result = formatNetworkActivityResponse(response);

      expect(result).toStrictEqual({
        EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: {
          namespace: KnownCaipNamespace.Solana,
          activeChains: [],
        },
      });
    });

    it('should handle mixed EVM and non-EVM networks', () => {
      const response = {
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
          activeChains: [],
        },
      });
    });

    it('should skip entries with invalid addresses', () => {
      const response = {
        activeNetworks: [
          'eip155:1:invalid-address',
          'eip155:1:0x1234567890123456789012345678901234567890',
        ],
      };

      const result = formatNetworkActivityResponse(response);

      expect(result).toStrictEqual({
        '0x1234567890123456789012345678901234567890': {
          namespace: KnownCaipNamespace.Eip155,
          activeChains: ['1'],
        },
      });
    });

    it('should handle empty response', () => {
      const response = {
        activeNetworks: [],
      };

      const result = formatNetworkActivityResponse(response);

      expect(result).toStrictEqual({});
    });

    it('should handle invalid network format', () => {
      const response = {
        activeNetworks: ['invalid:network:format'],
      };

      const result = formatNetworkActivityResponse(response);

      expect(result).toStrictEqual({});
    });

    it('should handle missing chainId in network string', () => {
      const response = {
        activeNetworks: ['eip155::0x1234567890123456789012345678901234567890'],
      };

      const result = formatNetworkActivityResponse(response);

      expect(result).toStrictEqual({
        '0x1234567890123456789012345678901234567890': {
          namespace: KnownCaipNamespace.Eip155,
          activeChains: [],
        },
      });
    });

    it('should handle multiple addresses with different networks', () => {
      const response = {
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

  describe('parseNetworkString', () => {
    it('should parse valid EVM network string', () => {
      const result = parseNetworkString(
        'eip155:1:0x298fe5fdca148135e84407fa3c24042f038d3b5a',
      );
      expect(result).toStrictEqual({
        namespace: KnownCaipNamespace.Eip155,
        chainId: '1',
        address: '0x298fe5fdca148135e84407fa3c24042f038d3b5a' as Hex,
      });
    });

    it('should parse EVM network string with large chain ID', () => {
      const result = parseNetworkString(
        'eip155:534352:0x5197b5b062288bbf29008c92b08010a92dd677cd',
      );
      expect(result).toStrictEqual({
        namespace: KnownCaipNamespace.Eip155,
        chainId: '534352',
        address: '0x5197b5b062288bbf29008c92b08010a92dd677cd' as Hex,
      });
    });

    it('should reject invalid EVM address format', () => {
      const result = parseNetworkString('eip155:1:0xinvalid');
      expect(result).toBeNull();
    });

    it('should parse valid Solana network string', () => {
      const result = parseNetworkString(
        'solana:1:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      );
      expect(result).toStrictEqual({
        namespace: KnownCaipNamespace.Solana,
        chainId: '1',
        address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' as Hex,
      });
    });

    it('should reject invalid Solana address', () => {
      const result = parseNetworkString('solana:1:invalid_solana_address');
      expect(result).toBeNull();
    });

    it('should parse valid Bitcoin network string', () => {
      // Test legacy address
      const legacy = parseNetworkString(
        'bip122:1:1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
      );
      expect(legacy).toStrictEqual({
        namespace: KnownCaipNamespace.Bip122,
        chainId: '1',
        address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2' as Hex,
      });

      // Test SegWit address
      const segwit = parseNetworkString(
        'bip122:1:3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy',
      );
      expect(segwit).toStrictEqual({
        namespace: KnownCaipNamespace.Bip122,
        chainId: '1',
        address: '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy' as Hex,
      });

      // Test Native SegWit address
      const nativeSegwit = parseNetworkString(
        'bip122:1:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
      );
      expect(nativeSegwit).toStrictEqual({
        namespace: KnownCaipNamespace.Bip122,
        chainId: '1',
        address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq' as Hex,
      });
    });

    it('should reject invalid Bitcoin address format', () => {
      const result = parseNetworkString('bip122:1:invalid');
      expect(result).toBeNull();
    });

    it('should handle missing chainId', () => {
      const result = parseNetworkString(
        'eip155::0x298fe5fdca148135e84407fa3c24042f038d3b5a',
      );
      expect(result).toStrictEqual({
        namespace: KnownCaipNamespace.Eip155,
        chainId: '',
        address: '0x298fe5fdca148135e84407fa3c24042f038d3b5a' as Hex,
      });
    });

    it('should handle missing components', () => {
      expect(parseNetworkString('eip155:')).toBeNull();
      expect(parseNetworkString('eip155:1')).toBeNull();
      expect(parseNetworkString(':1:address')).toBeNull();
      expect(parseNetworkString('::address')).toBeNull();
    });

    it('should handle unknown namespace', () => {
      const result = parseNetworkString(
        'unknown:1:0x298fe5fdca148135e84407fa3c24042f038d3b5a',
      );
      expect(result).toBeNull();
    });

    it('should handle empty string', () => {
      const result = parseNetworkString('');
      expect(result).toBeNull();
    });
  });
});
