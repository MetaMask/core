import {
  type CaipChainId,
  BtcScope,
  SolScope,
  EthScope,
  EthAccountType,
  BtcAccountType,
  SolAccountType,
} from '@metamask/keyring-api';
import { type NetworkConfiguration } from '@metamask/network-controller';
import {
  type CaipAccountId,
  KnownCaipNamespace,
  type Json,
} from '@metamask/utils';

import {
  type ActiveNetworksResponse,
  MULTICHAIN_ACCOUNTS_BASE_URL,
} from './api/accounts-api';
import {
  isEvmCaipChainId,
  toEvmCaipChainId,
  convertEvmCaipToHexChainId,
  getChainIdForNonEvmAddress,
  checkIfSupportedCaipChainId,
  toMultichainNetworkConfiguration,
  toMultichainNetworkConfigurationsByChainId,
  toActiveNetworksByAddress,
  buildActiveNetworksUrl,
  toAllowedCaipAccountIds,
  isKnownCaipNamespace,
} from './utils';

const MOCK_ADDRESSES: {
  evm: string;
  solana: string;
  bitcoin: string;
} = {
  evm: '0x1234567890123456789012345678901234567890',
  solana: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  bitcoin: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
};

const MOCK_CAIP_IDS: {
  evm: CaipAccountId;
  solana: CaipAccountId;
  bitcoin: CaipAccountId;
  invalid: string;
  invalidEvm: string;
  invalidSolana: string;
  invalidBitcoin: string;
  unsupportedNamespace: string;
  customNamespace: string;
  testNamespace: string;
} = {
  evm: `eip155:1:${MOCK_ADDRESSES.evm}`,
  solana: `solana:1:${MOCK_ADDRESSES.solana}`,
  bitcoin: `bip122:1:${MOCK_ADDRESSES.bitcoin}`,
  invalid: 'invalid:format:address',
  invalidEvm: 'eip155:1:0xinvalid',
  invalidSolana: 'solana:1:invalid',
  invalidBitcoin: 'bip122:1:invalid',
  unsupportedNamespace:
    'cosmos:1:cosmos1hsk6jryyqjfhp5dhc55tc9jtckygx0eph6dd02',
  customNamespace: `custom:1:${MOCK_ADDRESSES.evm}`,
  testNamespace: `test:1:${MOCK_ADDRESSES.evm}`,
};

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
    isKnownCaipNamespace: () => {
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

  describe('buildActiveNetworksUrl', () => {
    it('constructs URL with single account ID', () => {
      const url = buildActiveNetworksUrl([MOCK_CAIP_IDS.evm]);
      expect(url.toString()).toBe(
        `${MULTICHAIN_ACCOUNTS_BASE_URL}/v2/activeNetworks?accountIds=${encodeURIComponent(MOCK_CAIP_IDS.evm)}`,
      );
    });

    it('constructs URL with multiple account IDs', () => {
      const accountIds: CaipAccountId[] = [
        MOCK_CAIP_IDS.evm,
        MOCK_CAIP_IDS.solana,
      ];
      const url = buildActiveNetworksUrl(accountIds);
      expect(url.toString()).toBe(
        `${MULTICHAIN_ACCOUNTS_BASE_URL}/v2/activeNetworks?accountIds=${encodeURIComponent(accountIds.join(','))}`,
      );
    });
  });

  describe('toActiveNetworksByAddress', () => {
    it('formats EVM network responses', () => {
      const response: ActiveNetworksResponse = {
        activeNetworks: [
          `eip155:1:${MOCK_ADDRESSES.evm}`,
          `eip155:137:${MOCK_ADDRESSES.evm}`,
        ],
      };

      const result = toActiveNetworksByAddress(response);

      expect(result).toStrictEqual({
        [MOCK_ADDRESSES.evm]: {
          namespace: KnownCaipNamespace.Eip155,
          activeChains: ['1', '137'],
        },
      });
    });

    it('formats non-EVM network responses', () => {
      const response: ActiveNetworksResponse = {
        activeNetworks: [`solana:1:${MOCK_ADDRESSES.solana}`],
      };

      const result = toActiveNetworksByAddress(response);

      expect(result).toStrictEqual({
        [MOCK_ADDRESSES.solana]: {
          namespace: KnownCaipNamespace.Solana,
          activeChains: ['1'],
        },
      });
    });

    it('formats mixed EVM and non-EVM networks', () => {
      const response: ActiveNetworksResponse = {
        activeNetworks: [
          `eip155:1:${MOCK_ADDRESSES.evm}`,
          `solana:1:${MOCK_ADDRESSES.solana}`,
        ],
      };

      const result = toActiveNetworksByAddress(response);

      expect(result).toStrictEqual({
        [MOCK_ADDRESSES.evm]: {
          namespace: KnownCaipNamespace.Eip155,
          activeChains: ['1'],
        },
        [MOCK_ADDRESSES.solana]: {
          namespace: KnownCaipNamespace.Solana,
          activeChains: ['1'],
        },
      });
    });

    it('returns empty object for empty response', () => {
      const response: ActiveNetworksResponse = {
        activeNetworks: [],
      };

      const result = toActiveNetworksByAddress(response);

      expect(result).toStrictEqual({});
    });

    it('formats multiple addresses with different networks', () => {
      const secondEvmAddress = '0x9876543210987654321098765432109876543210';
      const response: ActiveNetworksResponse = {
        activeNetworks: [
          `eip155:1:${MOCK_ADDRESSES.evm}`,
          `eip155:137:${secondEvmAddress}`,
        ],
      };

      const result = toActiveNetworksByAddress(response);

      expect(result).toStrictEqual({
        [MOCK_ADDRESSES.evm]: {
          namespace: KnownCaipNamespace.Eip155,
          activeChains: ['1'],
        },
        [secondEvmAddress]: {
          namespace: KnownCaipNamespace.Eip155,
          activeChains: ['137'],
        },
      });
    });
  });

  describe('toAllowedCaipAccountIds', () => {
    type AccountType = {
      type: EthAccountType | BtcAccountType | SolAccountType;
      id: string;
      options: Record<string, Json>;
      methods: string[];
      metadata: {
        name: string;
        importTime: number;
        keyring: { type: string };
      };
      address: string;
      scopes: `${string}:${string}`[];
    };

    const createMockAccount = (
      address: string,
      scopes: `${string}:${string}`[],
      type: EthAccountType | BtcAccountType | SolAccountType,
    ): AccountType => ({
      address,
      scopes,
      type,
      id: '1',
      options: {},
      methods: [],
      metadata: {
        name: 'Test Account',
        importTime: Date.now(),
        keyring: { type: 'test' },
      },
    });

    it('formats account with EVM scopes', () => {
      const account = createMockAccount(
        MOCK_ADDRESSES.evm,
        [EthScope.Eoa, EthScope.Mainnet, EthScope.Testnet],
        EthAccountType.Eoa,
      );

      const result = toAllowedCaipAccountIds(account);
      expect(result).toStrictEqual([
        `${EthScope.Eoa}:${MOCK_ADDRESSES.evm}`,
        `${EthScope.Mainnet}:${MOCK_ADDRESSES.evm}`,
        `${EthScope.Testnet}:${MOCK_ADDRESSES.evm}`,
      ]);
    });

    it('formats account with BTC scope', () => {
      const account = createMockAccount(
        MOCK_ADDRESSES.bitcoin,
        [BtcScope.Mainnet],
        BtcAccountType.P2wpkh,
      );

      const result = toAllowedCaipAccountIds(account);
      expect(result).toStrictEqual([
        `${BtcScope.Mainnet}:${MOCK_ADDRESSES.bitcoin}`,
      ]);
    });

    it('formats account with Solana scope', () => {
      const account = createMockAccount(
        MOCK_ADDRESSES.solana,
        [SolScope.Mainnet],
        SolAccountType.DataAccount,
      );

      const result = toAllowedCaipAccountIds(account);
      expect(result).toStrictEqual([
        `${SolScope.Mainnet}:${MOCK_ADDRESSES.solana}`,
      ]);
    });

    it('excludes unsupported scopes', () => {
      const account = createMockAccount(
        MOCK_ADDRESSES.evm,
        [EthScope.Eoa, 'unsupported:123'],
        EthAccountType.Eoa,
      );

      const result = toAllowedCaipAccountIds(account);
      expect(result).toStrictEqual([`${EthScope.Eoa}:${MOCK_ADDRESSES.evm}`]);
    });

    it('returns empty array for account with no supported scopes', () => {
      const account = createMockAccount(
        MOCK_ADDRESSES.evm,
        ['unsupported:123'],
        EthAccountType.Eoa,
      );

      const result = toAllowedCaipAccountIds(account);
      expect(result).toStrictEqual([]);
    });
  });

  describe('isKnownCaipNamespace', () => {
    it('returns true for known CAIP namespaces', () => {
      expect(isKnownCaipNamespace(KnownCaipNamespace.Eip155)).toBe(true);
      expect(isKnownCaipNamespace(KnownCaipNamespace.Bip122)).toBe(true);
      expect(isKnownCaipNamespace(KnownCaipNamespace.Solana)).toBe(true);
    });

    it('returns false for unknown namespaces', () => {
      expect(isKnownCaipNamespace('unknown')).toBe(false);
      expect(isKnownCaipNamespace('cosmos')).toBe(false);
      expect(isKnownCaipNamespace('')).toBe(false);
    });
  });
});
