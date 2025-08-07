import { AccountGroupType, AccountWalletType } from '@metamask/account-api';
import type { AccountTreeControllerState } from '@metamask/account-tree-controller';
import type { AccountsControllerState } from '@metamask/accounts-controller';

import {
  selectAccountsToGroupIdMap,
  selectAllAssets,
  selectAssetsBySelectedAccountGroup,
} from './token-selectors';
import type { MultichainAssetsControllerState } from '../MultichainAssetsController';
import type { TokensControllerState } from '../TokensController';

const mockTokensControllerState: TokensControllerState = {
  allTokens: {
    '0x1': {
      '0x2bd63233fe369b0f13eaf25292af5a9b63d2b7ab': [
        {
          address: '0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f',
          decimals: 18,
          symbol: 'GHO',
          name: 'GHO Token',
          image:
            'https://static.cx.metamask.io/api/v1/tokenIcons/1/0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f.png',
        },
        {
          address: '0x6B3595068778DD592e39A122f4f5a5cF09C90fE2',
          decimals: 18,
          symbol: 'SUSHI',
          name: 'SushiSwap',
          image:
            'https://static.cx.metamask.io/api/v1/tokenIcons/1/0x6b3595068778dd592e39a122f4f5a5cf09c90fe2.png',
        },
        {
          // This token will be skipped because it exists in the ignored tokens list
          address: '0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee',
          decimals: 18,
          symbol: 'WEETH',
          name: 'Wrapped eETH',
          image:
            'https://static.cx.metamask.io/api/v1/tokenIcons/1/0xcd5fe23c85820f7b72d0926fc9b05b43e359b7ee.png',
        },
      ],
      '0x0413078b85a6cb85f8f75181ad1a23d265d49202': [
        {
          address: '0x5e74c9036fb86bd7ecdcb084a0673efc32ea31cb',
          decimals: 18,
          symbol: 'SETH',
          name: 'Synth sETH',
          image:
            'https://static.cx.metamask.io/api/v1/tokenIcons/1/0x5e74c9036fb86bd7ecdcb084a0673efc32ea31cb.png',
        },
      ],
    },
    '0xa': {
      '0x2bd63233fe369b0f13eaf25292af5a9b63d2b7ab': [
        {
          address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
          decimals: 6,
          symbol: 'USDC',
          name: 'USDCoin',
          image:
            'https://static.cx.metamask.io/api/v1/tokenIcons/10/0x0b2c639c533813f4aa9d7837caf62653d097ff85.png',
        },
      ],
    },
  },
  allIgnoredTokens: {
    '0x1': {
      '0x2bd63233fe369b0f13eaf25292af5a9b63d2b7ab': [
        '0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee',
      ],
    },
  },
  allDetectedTokens: {},
};

const mockMultichainAssetsControllerState: MultichainAssetsControllerState = {
  accountsAssets: {
    '2d89e6a0-b4e6-45a8-a707-f10cef143b42': [
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501',
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
    ],
  },
  assetsMetadata: {
    'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501': {
      fungible: true,
      iconUrl:
        'https://static.cx.metamask.io/api/v2/tokenIcons/assets/solana/5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44/501.png',
      name: 'Solana',
      symbol: 'SOL',
      units: [
        {
          decimals: 9,
          name: 'Solana',
          symbol: 'SOL',
        },
      ],
    },
    'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN':
      {
        name: 'Jupiter',
        symbol: 'JUP',
        fungible: true,
        iconUrl:
          'https://static.cx.metamask.io/api/v2/tokenIcons/assets/solana/5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token/JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN.png',
        units: [
          {
            name: 'Jupiter',
            symbol: 'JUP',
            decimals: 6,
          },
        ],
      },
  },
};

const mockAccountTreeControllerState: AccountTreeControllerState = {
  accountTree: {
    wallets: {
      'entropy:01K1TJY9QPSCKNBSVGZNG510GJ': {
        id: 'entropy:01K1TJY9QPSCKNBSVGZNG510GJ',
        type: AccountWalletType.Entropy,
        groups: {
          'entropy:01K1TJY9QPSCKNBSVGZNG510GJ/0': {
            id: 'entropy:01K1TJY9QPSCKNBSVGZNG510GJ/0',
            type: AccountGroupType.MultichainAccount,
            accounts: [
              'd7f11451-9d79-4df4-a012-afd253443639',
              '2d89e6a0-b4e6-45a8-a707-f10cef143b42',
            ],
            metadata: {
              name: 'Account 1',
              entropy: {
                groupIndex: 0,
              },
            },
          },
          'entropy:01K1TJY9QPSCKNBSVGZNG510GJ/1': {
            id: 'entropy:01K1TJY9QPSCKNBSVGZNG510GJ/1',
            type: AccountGroupType.MultichainAccount,
            accounts: [
              '2c311cc8-eeeb-48c7-a629-bb1d9c146b47',
              '40fe5e20-525a-4434-bb83-c51ce5560a8c',
            ],
            metadata: {
              name: 'Account 2',
              entropy: {
                groupIndex: 1,
              },
            },
          },
        },
        metadata: {
          name: 'Wallet 1',
          entropy: {
            id: '01K1TJY9QPSCKNBSVGZNG510GJ',
            index: 0,
          },
        },
      },
    },
    selectedAccountGroup: 'entropy:01K1TJY9QPSCKNBSVGZNG510GJ/0',
  },
};

const mockAccountControllerState: AccountsControllerState = {
  internalAccounts: {
    accounts: {
      'd7f11451-9d79-4df4-a012-afd253443639': {
        id: 'd7f11451-9d79-4df4-a012-afd253443639',
        address: '0x2bd63233fe369b0f13eaf25292af5a9b63d2b7ab',
        options: {
          entropySource: '01K1TJY9QPSCKNBSVGZNG510GJ',
          derivationPath: "m/44'/60'/0'/0/0",
          groupIndex: 0,
          entropy: {
            type: 'mnemonic',
            id: '01K1TJY9QPSCKNBSVGZNG510GJ',
            derivationPath: "m/44'/60'/0'/0/0",
            groupIndex: 0,
          },
        },
        methods: [
          'personal_sign',
          'eth_sign',
          'eth_signTransaction',
          'eth_signTypedData_v1',
          'eth_signTypedData_v3',
          'eth_signTypedData_v4',
        ],
        scopes: ['eip155:0'],
        type: 'eip155:eoa',
        metadata: {
          name: 'My main test',
          importTime: 1754312681246,
          lastSelected: 1754312803548,
          keyring: {
            type: 'HD Key Tree',
          },
          nameLastUpdatedAt: 1753697497354,
        },
      },
      '2c311cc8-eeeb-48c7-a629-bb1d9c146b47': {
        id: '2c311cc8-eeeb-48c7-a629-bb1d9c146b47',
        address: '0x0413078b85a6cb85f8f75181ad1a23d265d49202',
        options: {
          entropySource: '01K1TJY9QPSCKNBSVGZNG510GJ',
          derivationPath: "m/44'/60'/0'/0/1",
          groupIndex: 1,
          entropy: {
            type: 'mnemonic',
            id: '01K1TJY9QPSCKNBSVGZNG510GJ',
            derivationPath: "m/44'/60'/0'/0/1",
            groupIndex: 1,
          },
        },
        methods: [
          'personal_sign',
          'eth_sign',
          'eth_signTransaction',
          'eth_signTypedData_v1',
          'eth_signTypedData_v3',
          'eth_signTypedData_v4',
        ],
        scopes: ['eip155:0'],
        type: 'eip155:eoa',
        metadata: {
          name: 'Account 2',
          importTime: 1754312687780,
          lastSelected: 0,
          keyring: {
            type: 'HD Key Tree',
          },
        },
      },
      '2d89e6a0-b4e6-45a8-a707-f10cef143b42': {
        type: 'solana:data-account',
        id: '2d89e6a0-b4e6-45a8-a707-f10cef143b42',
        address: '4KTpypSSbugxHe67NC9JURQWfCBNKdQTo4K8rZmYapS7',
        options: {
          scope: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
          derivationPath: "m/44'/501'/0'/0'",
          entropySource: '01K1TJY9QPSCKNBSVGZNG510GJ',
          synchronize: true,
          index: 0,
          entropy: {
            type: 'mnemonic',
            id: '01K1TJY9QPSCKNBSVGZNG510GJ',
            groupIndex: 0,
            derivationPath: "m/44'/501'/0'/0'",
          },
        },
        methods: [
          'signAndSendTransaction',
          'signTransaction',
          'signMessage',
          'signIn',
        ],
        scopes: [
          'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
          'solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z',
          'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
        ],
        metadata: {
          name: 'Solana Account 2',
          importTime: 1754312691747,
          keyring: {
            type: 'Snap Keyring',
          },
          snap: {
            id: 'npm:@metamask/solana-wallet-snap',
            name: 'Solana',
            enabled: true,
          },
          lastSelected: 1754312843994,
        },
      },
      '40fe5e20-525a-4434-bb83-c51ce5560a8c': {
        type: 'solana:data-account',
        id: '40fe5e20-525a-4434-bb83-c51ce5560a8c',
        address: '7XrST6XEcmjwTVrdfGcH6JFvaiSnokB8LdWCviMuGBjc',
        options: {
          scope: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
          derivationPath: "m/44'/501'/1'/0'",
          entropySource: '01K1TJY9QPSCKNBSVGZNG510GJ',
          synchronize: true,
          index: 1,
          entropy: {
            type: 'mnemonic',
            id: '01K1TJY9QPSCKNBSVGZNG510GJ',
            groupIndex: 1,
            derivationPath: "m/44'/501'/1'/0'",
          },
        },
        methods: [
          'signAndSendTransaction',
          'signTransaction',
          'signMessage',
          'signIn',
        ],
        scopes: [
          'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
          'solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z',
          'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
        ],
        metadata: {
          name: 'Solana Account 3',
          importTime: 1754312692867,
          keyring: {
            type: 'Snap Keyring',
          },
          snap: {
            id: 'npm:@metamask/solana-wallet-snap',
            name: 'Solana',
            enabled: true,
          },
          lastSelected: 0,
        },
      },
    },
    selectedAccount: 'd7f11451-9d79-4df4-a012-afd253443639',
  },
};

describe('token-selectors', () => {
  describe('selectAccountsToGroupIdMap', () => {
    it('creates a map of accounts to group ids', () => {
      const result = selectAccountsToGroupIdMap({
        ...mockAccountTreeControllerState,
        ...mockAccountControllerState,
      });

      expect(result).toStrictEqual({
        '0x2bd63233fe369b0f13eaf25292af5a9b63d2b7ab':
          'entropy:01K1TJY9QPSCKNBSVGZNG510GJ/0',
        '2d89e6a0-b4e6-45a8-a707-f10cef143b42':
          'entropy:01K1TJY9QPSCKNBSVGZNG510GJ/0',
        '0x0413078b85a6cb85f8f75181ad1a23d265d49202':
          'entropy:01K1TJY9QPSCKNBSVGZNG510GJ/1',
        '40fe5e20-525a-4434-bb83-c51ce5560a8c':
          'entropy:01K1TJY9QPSCKNBSVGZNG510GJ/1',
      });
    });
  });

  describe('selectAllAssets', () => {
    it('returns all assets for every account group id', () => {
      const result = selectAllAssets({
        ...mockAccountTreeControllerState,
        ...mockAccountControllerState,
        ...mockTokensControllerState,
        ...mockMultichainAssetsControllerState,
      });

      expect(result).toStrictEqual({
        'entropy:01K1TJY9QPSCKNBSVGZNG510GJ/0': {
          '0x1': [
            {
              type: 'evm',
              assetId: '0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f',
              icon: 'https://static.cx.metamask.io/api/v1/tokenIcons/1/0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f.png',
              name: 'GHO Token',
              symbol: 'GHO',
              decimals: 18,
            },
            {
              type: 'evm',
              assetId: '0x6B3595068778DD592e39A122f4f5a5cF09C90fE2',
              icon: 'https://static.cx.metamask.io/api/v1/tokenIcons/1/0x6b3595068778dd592e39a122f4f5a5cf09c90fe2.png',
              name: 'SushiSwap',
              symbol: 'SUSHI',
              decimals: 18,
            },
          ],
          '0xa': [
            {
              type: 'evm',
              assetId: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
              icon: 'https://static.cx.metamask.io/api/v1/tokenIcons/10/0x0b2c639c533813f4aa9d7837caf62653d097ff85.png',
              name: 'USDCoin',
              symbol: 'USDC',
              decimals: 6,
            },
          ],
          'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': [
            {
              type: 'multichain',
              assetId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501',
              icon: 'https://static.cx.metamask.io/api/v2/tokenIcons/assets/solana/5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44/501.png',
              name: 'Solana',
              symbol: 'SOL',
              decimals: 9,
            },
            {
              type: 'multichain',
              assetId:
                'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
              icon: 'https://static.cx.metamask.io/api/v2/tokenIcons/assets/solana/5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token/JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN.png',
              name: 'Jupiter',
              symbol: 'JUP',
              decimals: 6,
            },
          ],
        },
        'entropy:01K1TJY9QPSCKNBSVGZNG510GJ/1': {
          '0x1': [
            {
              type: 'evm',
              assetId: '0x5e74c9036fb86bd7ecdcb084a0673efc32ea31cb',
              icon: 'https://static.cx.metamask.io/api/v1/tokenIcons/1/0x5e74c9036fb86bd7ecdcb084a0673efc32ea31cb.png',
              name: 'Synth sETH',
              symbol: 'SETH',
              decimals: 18,
            },
          ],
        },
      });
    });
  });

  describe('selectAssetsBySelectedAccountGroup', () => {
    it('returns all assets for every account group id', () => {
      const result = selectAssetsBySelectedAccountGroup({
        ...mockAccountTreeControllerState,
        ...mockAccountControllerState,
        ...mockTokensControllerState,
        ...mockMultichainAssetsControllerState,
      });

      expect(result).toStrictEqual({
        '0x1': [
          {
            type: 'evm',
            assetId: '0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f',
            icon: 'https://static.cx.metamask.io/api/v1/tokenIcons/1/0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f.png',
            name: 'GHO Token',
            symbol: 'GHO',
            decimals: 18,
          },
          {
            type: 'evm',
            assetId: '0x6B3595068778DD592e39A122f4f5a5cF09C90fE2',
            icon: 'https://static.cx.metamask.io/api/v1/tokenIcons/1/0x6b3595068778dd592e39a122f4f5a5cf09c90fe2.png',
            name: 'SushiSwap',
            symbol: 'SUSHI',
            decimals: 18,
          },
        ],
        '0xa': [
          {
            type: 'evm',
            assetId: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
            icon: 'https://static.cx.metamask.io/api/v1/tokenIcons/10/0x0b2c639c533813f4aa9d7837caf62653d097ff85.png',
            name: 'USDCoin',
            symbol: 'USDC',
            decimals: 6,
          },
        ],
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': [
          {
            type: 'multichain',
            assetId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501',
            icon: 'https://static.cx.metamask.io/api/v2/tokenIcons/assets/solana/5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44/501.png',
            name: 'Solana',
            symbol: 'SOL',
            decimals: 9,
          },
          {
            type: 'multichain',
            assetId:
              'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
            icon: 'https://static.cx.metamask.io/api/v2/tokenIcons/assets/solana/5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token/JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN.png',
            name: 'Jupiter',
            symbol: 'JUP',
            decimals: 6,
          },
        ],
      });
    });
  });
});
