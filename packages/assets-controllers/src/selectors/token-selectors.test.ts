import { AccountGroupType, AccountWalletType } from '@metamask/account-api';
import type {
  AccountTreeControllerState,
  AccountWalletObject,
} from '@metamask/account-tree-controller';
import type { AccountsControllerState } from '@metamask/accounts-controller';
import type { Hex } from '@metamask/utils';

import { selectAssetsBySelectedAccountGroup } from './token-selectors';
import type { AccountGroupMultichainAccountObject } from '../../../account-tree-controller/src/group';
import type { CurrencyRateState } from '../CurrencyRateController';
import type { MultichainAssetsControllerState } from '../MultichainAssetsController';
import type { MultichainAssetsRatesControllerState } from '../MultichainAssetsRatesController';
import type { MultichainBalancesControllerState } from '../MultichainBalancesController';
import type { TokenBalancesControllerState } from '../TokenBalancesController';
import type { TokenRatesControllerState } from '../TokenRatesController';
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
        {
          // This token will be skipped because it has no balance
          address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
          decimals: 18,
          symbol: 'DAI',
          name: 'Dai Stablecoin',
          image:
            'https://static.cx.metamask.io/api/v1/tokenIcons/1/0x6B175474E89094C44Da98b954EedeAC495271d0F.png',
        },
      ],
      '0x0413078b85a6cb85f8f75181ad1a23d265d49202': [
        {
          // This token is missing market data
          address: '0x5e74c9036fb86bd7ecdcb084a0673efc32ea31cb',
          decimals: 18,
          symbol: 'SETH',
          name: 'Synth sETH',
          image:
            'https://static.cx.metamask.io/api/v1/tokenIcons/1/0x5e74c9036fb86bd7ecdcb084a0673efc32ea31cb.png',
        },
        {
          // This token is missing a conversion rate
          address: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84',
          decimals: 18,
          symbol: 'stETH',
          name: 'Lido Staked Ether',
          image:
            'https://static.cx.metamask.io/api/v1/tokenIcons/10/0xae7ab96520de3a18e5e111b5eaab095312d7fe84.png',
        },
        {
          address: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
          decimals: 18,
          symbol: 'LINK',
          name: 'ChainLink Token',
          image:
            'https://static.cx.metamask.io/api/v1/tokenIcons/10/0x514910771AF9Ca656af840dff83E8264EcF986CA.png',
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

const mockTokenBalancesControllerState: TokenBalancesControllerState = {
  tokenBalances: {
    '0x2bd63233fe369b0f13eaf25292af5a9b63d2b7ab': {
      '0x1': {
        '0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f': '0x56BC75E2D63100000', // 100000000000000000000 (100 18 decimals)
        '0x6B3595068778DD592e39A122f4f5a5cF09C90fE2': '0xAD78EBC5AC6200000', // 200000000000000000000 (200 18 decimals)
        '0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee': '0x2B5E3AF16B1880000', // 50000000000000000000 (50 18 decimals)
      },
      '0xa': {
        '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85': '0x3B9ACA00', // 1000000000 (1000 6 decimals)
      },
    },
    '0x0413078b85a6cb85f8f75181ad1a23d265d49202': {
      '0x1': {
        '0x5e74c9036fb86bd7ecdcb084a0673efc32ea31cb': '0x56BC75E2D63100000', // 100000000000000000000 (100 18 decimals)
        '0xae7ab96520de3a18e5e111b5eaab095312d7fe84': '0x56BC75E2D63100000', // 100000000000000000000 (100 18 decimals)
        '0x514910771AF9Ca656af840dff83E8264EcF986CA': '0x56BC75E2D63100000', // 100000000000000000000 (100 18 decimals)
      },
    },
  },
};

const mockTokenRatesControllerState = {
  marketData: {
    '0x1': {
      '0x0000000000000000000000000000000000000000': {
        tokenAddress: '0x0000000000000000000000000000000000000000',
        currency: 'ETH',
        price: 1,
      },
      '0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f': {
        tokenAddress: '0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f',
        currency: 'ETH',
        price: 0.00009,
      },
      '0x6B3595068778DD592e39A122f4f5a5cF09C90fE2': {
        tokenAddress: '0x6B3595068778DD592e39A122f4f5a5cF09C90fE2',
        currency: 'ETH',
        price: 0.002,
      },
      '0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee': {
        tokenAddress: '0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee',
        currency: 'ETH',
        price: 0.1,
      },
      '0x5e74c9036fb86bd7ecdcb084a0673efc32ea31cb': {
        tokenAddress: '0x5e74c9036fb86bd7ecdcb084a0673efc32ea31cb',
        currency: 'ETH',
        price: 0.25,
      },
      '0x514910771AF9Ca656af840dff83E8264EcF986CA': {
        tokenAddress: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
        currency: 'ETH',
        price: 0.005,
      },
    },
    '0xa': {
      '0x0000000000000000000000000000000000000000': {
        tokenAddress: '0x0000000000000000000000000000000000000000',
        currency: 'ETH',
        price: 1,
      },
      '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85': {
        tokenAddress: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
        currency: 'ETH',
        price: 0.005,
      },
    },
  },
} as unknown as TokenRatesControllerState;

const mockCurrencyRateControllerState = {
  currentCurrency: 'USD',
  currencyRates: {
    ETH: {
      conversionRate: 2400,
    },
  },
} as unknown as CurrencyRateState;

const mockMultichainAssetsControllerState: MultichainAssetsControllerState = {
  accountsAssets: {
    '2d89e6a0-b4e6-45a8-a707-f10cef143b42': [
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501',
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:2fUFhZyd47Mapv9wcfXh5gnQwFXtqcYu9xAN4THBpump',
    ],
    '40fe5e20-525a-4434-bb83-c51ce5560a8c': [
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv',
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
    'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:2fUFhZyd47Mapv9wcfXh5gnQwFXtqcYu9xAN4THBpump':
      {
        fungible: true,
        iconUrl:
          'https://static.cx.metamask.io/api/v2/tokenIcons/assets/solana/5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token/2fUFhZyd47Mapv9wcfXh5gnQwFXtqcYu9xAN4THBpump.png',
        name: 'RNT',
        symbol: 'RNT',
        units: [
          {
            decimals: 6,
            name: 'RNT',
            symbol: 'RNT',
          },
        ],
      },
    'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv':
      {
        fungible: true,
        iconUrl:
          'https://static.cx.metamask.io/api/v2/tokenIcons/assets/solana/5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token/2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv.png',
        name: 'Pudgy Penguins',
        symbol: 'PENGU',
        units: [
          {
            decimals: 6,
            name: 'Pudgy Penguins',
            symbol: 'PENGU',
          },
        ],
      },
  },
};

const mockAccountTreeControllerState = {
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
          } as unknown as AccountGroupMultichainAccountObject,
          'entropy:01K1TJY9QPSCKNBSVGZNG510GJ/1': {
            id: 'entropy:01K1TJY9QPSCKNBSVGZNG510GJ/1',
            type: AccountGroupType.MultichainAccount,
            accounts: [
              '2c311cc8-eeeb-48c7-a629-bb1d9c146b47',
              '40fe5e20-525a-4434-bb83-c51ce5560a8c',
            ],
          } as unknown as AccountGroupMultichainAccountObject,
        },
      },
    } as unknown as AccountWalletObject,
    selectedAccountGroup: 'entropy:01K1TJY9QPSCKNBSVGZNG510GJ/0',
  },
} as unknown as AccountTreeControllerState;

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

const mockMultichainBalancesControllerState = {
  balances: {
    '2d89e6a0-b4e6-45a8-a707-f10cef143b42': {
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501': {
        amount: '10',
        unit: 'SOL',
      },
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN':
        {
          amount: '200',
          unit: 'JUP',
        },
    },
    '40fe5e20-525a-4434-bb83-c51ce5560a8c': {
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501': {
        amount: '5',
        unit: 'SOL',
      },
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv':
        {
          amount: '100',
          unit: 'PENGU',
        },
    },
  },
} as unknown as MultichainBalancesControllerState;

const mockMultichainAssetsRatesControllerState = {
  conversionRates: {
    'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501': {
      rate: '163.55',
      currency: 'swift:0/iso4217:USD',
    },
    'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN':
      {
        rate: '0.463731',
        currency: 'swift:0/iso4217:USD',
      },
  },
} as unknown as MultichainAssetsRatesControllerState;

const mockAccountsTrackerControllerState: {
  accountsByChainId: Record<
    Hex,
    Record<
      Hex,
      {
        balance: Hex | null;
      }
    >
  >;
} = {
  accountsByChainId: {
    '0x1': {
      '0x2bd63233fe369b0f13eaf25292af5a9b63d2b7ab': {
        balance: '0x8AC7230489E80000', // 10000000000000000000 (10 - 18 decimals)
      },
      '0x0413078b85a6cb85f8f75181ad1a23d265d49202': {
        balance: '0xDE0B6B3A7640000', // 1000000000000000000 (1 - 18 decimals)
      },
    },
    '0xa': {
      '0x2bd63233fe369b0f13eaf25292af5a9b63d2b7ab': {
        balance: '0xDE0B6B3A7640000', // 1000000000000000000 (1 - 18 decimals)
      },
    },
  },
};

const mockedMergedState = {
  ...mockAccountTreeControllerState,
  ...mockAccountControllerState,
  ...mockTokensControllerState,
  ...mockMultichainAssetsControllerState,
  ...mockTokenBalancesControllerState,
  ...mockTokenRatesControllerState,
  ...mockCurrencyRateControllerState,
  ...mockMultichainBalancesControllerState,
  ...mockMultichainAssetsRatesControllerState,
  ...mockAccountsTrackerControllerState,
};

describe('token-selectors', () => {
  describe('selectAssetsBySelectedAccountGroup', () => {
    it('does not include ignored evm tokens', () => {
      const result = selectAssetsBySelectedAccountGroup(mockedMergedState);

      const ignoredTokenAddress = '0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee';

      expect(
        result['0x1'].find((asset) => asset.assetId === ignoredTokenAddress),
      ).toBeUndefined();
    });

    it('does not include evm tokens with no balance', () => {
      const result = selectAssetsBySelectedAccountGroup(mockedMergedState);

      const tokenWithNoBalance = '0x6B175474E89094C44Da98b954EedeAC495271d0F';

      expect(
        result['0x1'].find((asset) => asset.assetId === tokenWithNoBalance),
      ).toBeUndefined();
    });

    it('includes evm tokens with no fiat balance due to missing conversion rate to native token', () => {
      const result = selectAssetsBySelectedAccountGroup({
        ...mockedMergedState,
        accountTree: {
          ...mockedMergedState.accountTree,
          selectedAccountGroup: 'entropy:01K1TJY9QPSCKNBSVGZNG510GJ/1',
        },
      });

      const tokenWithNoFiatBalance = result['0x1'].find(
        (asset) =>
          asset.assetId === '0xae7ab96520de3a18e5e111b5eaab095312d7fe84',
      );

      expect(tokenWithNoFiatBalance).toStrictEqual({
        address: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84',
        assetId: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84',
        balance: '100',
        chainId: '0x1',
        decimals: 18,
        fiat: undefined,
        image:
          'https://static.cx.metamask.io/api/v1/tokenIcons/10/0xae7ab96520de3a18e5e111b5eaab095312d7fe84.png',
        isNative: false,
        name: 'Lido Staked Ether',
        symbol: 'stETH',
        type: 'evm',
      });
    });

    it('includes evm tokens with no fiat balance due to missing conversion rate to fiat', () => {
      const result = selectAssetsBySelectedAccountGroup({
        ...mockedMergedState,
        accountTree: {
          ...mockedMergedState.accountTree,
          selectedAccountGroup: 'entropy:01K1TJY9QPSCKNBSVGZNG510GJ/1',
        },
        currencyRates: {},
      });

      const tokenWithNoFiatBalance = result['0x1'].find(
        (asset) =>
          asset.assetId === '0x514910771AF9Ca656af840dff83E8264EcF986CA',
      );

      expect(tokenWithNoFiatBalance).toStrictEqual({
        address: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
        assetId: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
        balance: '100',
        chainId: '0x1',
        decimals: 18,
        fiat: undefined,
        image:
          'https://static.cx.metamask.io/api/v1/tokenIcons/10/0x514910771AF9Ca656af840dff83E8264EcF986CA.png',
        isNative: false,
        name: 'ChainLink Token',
        symbol: 'LINK',
        type: 'evm',
      });
    });

    it('does not include multichaintokens with no balance', () => {
      const result = selectAssetsBySelectedAccountGroup(mockedMergedState);

      const tokenWithNoBalance =
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:2fUFhZyd47Mapv9wcfXh5gnQwFXtqcYu9xAN4THBpump';

      expect(
        result['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'].find(
          (asset) => asset.assetId === tokenWithNoBalance,
        ),
      ).toBeUndefined();
    });

    it('includes multichain tokens with no fiat balance due to missing conversion rate to fiat', () => {
      const result = selectAssetsBySelectedAccountGroup({
        ...mockedMergedState,
        accountTree: {
          ...mockedMergedState.accountTree,
          selectedAccountGroup: 'entropy:01K1TJY9QPSCKNBSVGZNG510GJ/1',
        },
      });

      const tokenWithNoFiatBalance = result[
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'
      ].find(
        (asset) =>
          asset.assetId ===
          'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv',
      );

      expect(tokenWithNoFiatBalance).toStrictEqual({
        assetId:
          'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv',
        balance: '100',
        chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
        decimals: 6,
        fiat: undefined,
        image:
          'https://static.cx.metamask.io/api/v2/tokenIcons/assets/solana/5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token/2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv.png',
        isNative: false,
        name: 'Pudgy Penguins',
        symbol: 'PENGU',
        type: 'multichain',
      });
    });

    it('returns all assets for the selected account group', () => {
      const result = selectAssetsBySelectedAccountGroup(mockedMergedState);

      expect(result).toStrictEqual({
        '0x1': [
          {
            type: 'evm',
            chainId: '0x1',
            assetId: '0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f',
            address: '0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f',
            image:
              'https://static.cx.metamask.io/api/v1/tokenIcons/1/0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f.png',
            name: 'GHO Token',
            symbol: 'GHO',
            isNative: false,
            decimals: 18,
            balance: '100',
            fiat: {
              balance: 21.6,
              conversionRate: 2400,
              currency: 'USD',
            },
          },
          {
            type: 'evm',
            chainId: '0x1',
            assetId: '0x6B3595068778DD592e39A122f4f5a5cF09C90fE2',
            address: '0x6B3595068778DD592e39A122f4f5a5cF09C90fE2',
            image:
              'https://static.cx.metamask.io/api/v1/tokenIcons/1/0x6b3595068778dd592e39a122f4f5a5cf09c90fe2.png',
            name: 'SushiSwap',
            symbol: 'SUSHI',
            isNative: false,
            decimals: 18,
            balance: '200',
            fiat: {
              balance: 960,
              conversionRate: 2400,
              currency: 'USD',
            },
          },
          {
            type: 'evm',
            chainId: '0x1',
            assetId: '0x0000000000000000000000000000000000000000',
            address: '0x0000000000000000000000000000000000000000',
            image: '',
            name: 'Ethereum',
            symbol: 'ETH',
            isNative: true,
            decimals: 18,
            balance: '10',
            fiat: {
              balance: 24000,
              conversionRate: 2400,
              currency: 'USD',
            },
          },
        ],
        '0xa': [
          {
            type: 'evm',
            chainId: '0xa',
            assetId: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
            address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
            image:
              'https://static.cx.metamask.io/api/v1/tokenIcons/10/0x0b2c639c533813f4aa9d7837caf62653d097ff85.png',
            name: 'USDCoin',
            symbol: 'USDC',
            isNative: false,
            decimals: 6,
            balance: '1000',
            fiat: {
              balance: 12000,
              conversionRate: 2400,
              currency: 'USD',
            },
          },
          {
            type: 'evm',
            chainId: '0xa',
            assetId: '0x0000000000000000000000000000000000000000',
            address: '0x0000000000000000000000000000000000000000',
            image: '',
            name: 'Ethereum',
            symbol: 'ETH',
            isNative: true,
            decimals: 18,
            balance: '1',
            fiat: {
              balance: 2400,
              conversionRate: 2400,
              currency: 'USD',
            },
          },
        ],
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': [
          {
            type: 'multichain',
            chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
            assetId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501',
            image:
              'https://static.cx.metamask.io/api/v2/tokenIcons/assets/solana/5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44/501.png',
            name: 'Solana',
            symbol: 'SOL',
            isNative: true,
            decimals: 9,
            balance: '10',
            fiat: {
              balance: 1635.5,
              conversionRate: 163.55,
              currency: 'USD',
            },
          },
          {
            type: 'multichain',
            chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
            assetId:
              'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
            image:
              'https://static.cx.metamask.io/api/v2/tokenIcons/assets/solana/5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token/JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN.png',
            name: 'Jupiter',
            symbol: 'JUP',
            isNative: false,
            decimals: 6,
            balance: '200',
            fiat: {
              balance: 92.7462,
              conversionRate: 0.463731,
              currency: 'USD',
            },
          },
        ],
      });
    });

    it('returns no tokens if there is no selected account group', () => {
      const result = selectAssetsBySelectedAccountGroup({
        ...mockedMergedState,
        accountTree: {
          ...mockedMergedState.accountTree,
          selectedAccountGroup: '',
        },
      });

      expect(result).toStrictEqual({});
    });
  });
});
