import { toChecksumAddress } from '@ethereumjs/util';
import { AccountGroupType, AccountWalletType } from '@metamask/account-api';
import type {
  AccountTreeControllerState,
  AccountWalletObject,
} from '@metamask/account-tree-controller';
import type { AccountsControllerState } from '@metamask/accounts-controller';
import { TrxScope } from '@metamask/keyring-api';
import type { NetworkState } from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';
import { cloneDeep } from 'lodash';

import { MOCK_TRON_TOKENS } from './__fixtures__/arrange-tron-state';
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
      '0x1010101010101010101010101010101010101010': [
        {
          address: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84',
          decimals: 18,
          symbol: 'stETH',
          name: 'Lido Staked Ether',
          image:
            'https://static.cx.metamask.io/api/v1/tokenIcons/10/0xae7ab96520de3a18e5e111b5eaab095312d7fe84.png',
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
    '767fef5b-0cfd-417a-b618-60ed0f459df7': [
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
  allIgnoredAssets: {},
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
  accountIdByAddress: {
    '0x2bd63233fe369b0f13eaf25292af5a9b63d2b7ab':
      'd7f11451-9d79-4df4-a012-afd253443639',
    '0x0413078b85a6cb85f8f75181ad1a23d265d49202':
      '2c311cc8-eeeb-48c7-a629-bb1d9c146b47',
    '4ktpypssbugxhe67nc9jurqwfcbnkdqto4k8rzmyaps7':
      '2d89e6a0-b4e6-45a8-a707-f10cef143b42',
    '7xrst6xecmjwtvrdfgch6jfvaisnokb8ldwcvimugbjc':
      '40fe5e20-525a-4434-bb83-c51ce5560a8c',
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

const mockNetworkControllerState = {
  networkConfigurationsByChainId: {
    '0x1': {
      nativeCurrency: 'ETH',
    },
    '0xa': {
      nativeCurrency: 'ETH',
    },
    '0x89': {
      nativeCurrency: 'POL',
    },
  },
} as unknown as NetworkState;

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
      '0x1010101010101010101010101010101010101010': {
        balance: '0xDE0B6B3A7640000', // 1000000000000000000 (1 - 18 decimals)
      },
    },
    '0xa': {
      '0x2bd63233fe369b0f13eaf25292af5a9b63d2b7ab': {
        balance: '0xDE0B6B3A7640000', // 1000000000000000000 (1 - 18 decimals)
      },
    },
    '0x89': {
      '0x0413078b85a6cb85f8f75181ad1a23d265d49202': {
        balance: '0x8AC7230489E80000', // 10000000000000000000 (10 - 18 decimals)
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
  ...mockNetworkControllerState,
  ...mockAccountsTrackerControllerState,
};

const expectedMockResult = {
  '0x1': [
    {
      accountType: 'eip155:eoa',
      accountId: 'd7f11451-9d79-4df4-a012-afd253443639',
      chainId: '0x1',
      assetId: '0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f',
      address: '0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f',
      image:
        'https://static.cx.metamask.io/api/v1/tokenIcons/1/0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f.png',
      name: 'GHO Token',
      symbol: 'GHO',
      isNative: false,
      decimals: 18,
      rawBalance: '0x56BC75E2D63100000',
      balance: '100',
      fiat: {
        balance: 21.6,
        conversionRate: 2400,
        currency: 'USD',
      },
    },
    {
      accountType: 'eip155:eoa',
      accountId: 'd7f11451-9d79-4df4-a012-afd253443639',
      chainId: '0x1',
      assetId: '0x6B3595068778DD592e39A122f4f5a5cF09C90fE2',
      address: '0x6B3595068778DD592e39A122f4f5a5cF09C90fE2',
      image:
        'https://static.cx.metamask.io/api/v1/tokenIcons/1/0x6b3595068778dd592e39a122f4f5a5cf09c90fe2.png',
      name: 'SushiSwap',
      symbol: 'SUSHI',
      isNative: false,
      decimals: 18,
      rawBalance: '0xAD78EBC5AC6200000',
      balance: '200',
      fiat: {
        balance: 960,
        conversionRate: 2400,
        currency: 'USD',
      },
    },
    {
      accountType: 'eip155:eoa',
      accountId: 'd7f11451-9d79-4df4-a012-afd253443639',
      chainId: '0x1',
      assetId: '0x0000000000000000000000000000000000000000',
      address: '0x0000000000000000000000000000000000000000',
      image: '',
      name: 'Ethereum',
      symbol: 'ETH',
      isNative: true,
      decimals: 18,
      rawBalance: '0x8AC7230489E80000',
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
      accountType: 'eip155:eoa',
      accountId: 'd7f11451-9d79-4df4-a012-afd253443639',
      chainId: '0xa',
      assetId: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
      address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
      image:
        'https://static.cx.metamask.io/api/v1/tokenIcons/10/0x0b2c639c533813f4aa9d7837caf62653d097ff85.png',
      name: 'USDCoin',
      symbol: 'USDC',
      isNative: false,
      decimals: 6,
      rawBalance: '0x3B9ACA00',
      balance: '1000',
      fiat: {
        balance: 12000,
        conversionRate: 2400,
        currency: 'USD',
      },
    },
    {
      accountType: 'eip155:eoa',
      accountId: 'd7f11451-9d79-4df4-a012-afd253443639',
      chainId: '0xa',
      assetId: '0x0000000000000000000000000000000000000000',
      address: '0x0000000000000000000000000000000000000000',
      image: '',
      name: 'Ethereum',
      symbol: 'ETH',
      isNative: true,
      decimals: 18,
      rawBalance: '0xDE0B6B3A7640000',
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
      accountType: 'solana:data-account',
      accountId: '2d89e6a0-b4e6-45a8-a707-f10cef143b42',
      chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
      assetId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501',
      image:
        'https://static.cx.metamask.io/api/v2/tokenIcons/assets/solana/5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44/501.png',
      name: 'Solana',
      symbol: 'SOL',
      isNative: true,
      decimals: 9,
      rawBalance: '0x2540be400',
      balance: '10',
      fiat: {
        balance: 1635.5,
        conversionRate: 163.55,
        currency: 'USD',
      },
    },
    {
      accountType: 'solana:data-account',
      accountId: '2d89e6a0-b4e6-45a8-a707-f10cef143b42',
      chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
      assetId:
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
      image:
        'https://static.cx.metamask.io/api/v2/tokenIcons/assets/solana/5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token/JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN.png',
      name: 'Jupiter',
      symbol: 'JUP',
      isNative: false,
      decimals: 6,
      rawBalance: '0xbebc200',
      balance: '200',
      fiat: {
        balance: 92.7462,
        conversionRate: 0.463731,
        currency: 'USD',
      },
    },
  ],
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
        accountId: '2c311cc8-eeeb-48c7-a629-bb1d9c146b47',
        address: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84',
        assetId: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84',
        rawBalance: '0x56BC75E2D63100000',
        balance: '100',
        chainId: '0x1',
        decimals: 18,
        fiat: undefined,
        image:
          'https://static.cx.metamask.io/api/v1/tokenIcons/10/0xae7ab96520de3a18e5e111b5eaab095312d7fe84.png',
        isNative: false,
        name: 'Lido Staked Ether',
        symbol: 'stETH',
        accountType: 'eip155:eoa',
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
        accountId: '2c311cc8-eeeb-48c7-a629-bb1d9c146b47',
        address: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
        assetId: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
        rawBalance: '0x56BC75E2D63100000',
        balance: '100',
        chainId: '0x1',
        decimals: 18,
        fiat: undefined,
        image:
          'https://static.cx.metamask.io/api/v1/tokenIcons/10/0x514910771AF9Ca656af840dff83E8264EcF986CA.png',
        isNative: false,
        name: 'ChainLink Token',
        symbol: 'LINK',
        accountType: 'eip155:eoa',
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
        accountId: '40fe5e20-525a-4434-bb83-c51ce5560a8c',
        assetId:
          'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv',
        rawBalance: '0x5f5e100',
        balance: '100',
        chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
        decimals: 6,
        fiat: undefined,
        image:
          'https://static.cx.metamask.io/api/v2/tokenIcons/assets/solana/5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token/2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv.png',
        isNative: false,
        name: 'Pudgy Penguins',
        symbol: 'PENGU',
        accountType: 'solana:data-account',
      });
    });

    it('extracts native currency names from network configuration', () => {
      const result = selectAssetsBySelectedAccountGroup({
        ...mockedMergedState,
        accountTree: {
          ...mockedMergedState.accountTree,
          selectedAccountGroup: 'entropy:01K1TJY9QPSCKNBSVGZNG510GJ/1',
        },
      });

      const nativeToken = result['0x89'].find((asset) => asset.isNative);

      expect(nativeToken).toStrictEqual({
        accountId: '2c311cc8-eeeb-48c7-a629-bb1d9c146b47',
        assetId: '0x0000000000000000000000000000000000001010',
        address: '0x0000000000000000000000000000000000001010',
        rawBalance: '0x8AC7230489E80000',
        chainId: '0x89',
        name: 'POL',
        symbol: 'POL',
        image: '',
        isNative: true,
        decimals: 18,
        balance: '10',
        fiat: undefined,
        accountType: 'eip155:eoa',
      });
    });

    it('returns all assets for the selected account group', () => {
      const result = selectAssetsBySelectedAccountGroup(mockedMergedState);

      expect(result).toStrictEqual(expectedMockResult);
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

    it('returns assets even when addresses from AccountsTrackerController are checksummed', () => {
      const result = selectAssetsBySelectedAccountGroup({
        ...mockedMergedState,
        accountsByChainId: Object.fromEntries(
          Object.entries(mockedMergedState.accountsByChainId).map(
            ([chainId, accounts]) => [
              chainId,
              Object.fromEntries(
                Object.entries(accounts).map(([address, data]) => [
                  toChecksumAddress(address),
                  data,
                ]),
              ),
            ],
          ),
        ),
      });

      expect(result).toStrictEqual(expectedMockResult);
    });

    const arrangeTronState = () => {
      const state = cloneDeep(mockedMergedState);

      // Add Tron account to the selected account group
      state.accountTree.wallets['entropy:01K1TJY9QPSCKNBSVGZNG510GJ'].groups[
        'entropy:01K1TJY9QPSCKNBSVGZNG510GJ/0'
      ].accounts.push('de5c3465-d01e-4091-a219-232903e982bb');

      // Add Tron account to accounts controller
      state.internalAccounts.accounts['de5c3465-d01e-4091-a219-232903e982bb'] =
        {
          id: 'de5c3465-d01e-4091-a219-232903e982bb',
          address: 'TYasKMTpukV8rLfkSzqrFH7VcCwjBFJ7s9',
          type: 'tron:eoa',
          scopes: ['tron:728126428', 'tron:3448148188', 'tron:2494104990'],
          methods: ['tron_signTransaction', 'tron_signMessage'],
          options: {
            entropySource: '01K1TJY9QPSCKNBSVGZNG510GJ',
            groupIndex: 0,
          },
          metadata: {
            name: 'Tron Account 1',
            keyring: { type: 'Snap Keyring' },
            importTime: Date.now(),
          },
        };

      // Extract asset IDs from MOCK_TRON_TOKENS and add to accountsAssets
      const allTronAssetIds = Object.values(MOCK_TRON_TOKENS)
        .flat()
        .map((token) => token.assetId);
      state.accountsAssets['de5c3465-d01e-4091-a219-232903e982bb'] =
        allTronAssetIds;

      // Create metadata from MOCK_TRON_TOKENS
      Object.values(MOCK_TRON_TOKENS)
        .flat()
        .forEach((token) => {
          state.assetsMetadata[token.assetId] = {
            fungible: true,
            iconUrl: token.image,
            name: token.name,
            symbol: token.symbol,
            units: [
              {
                decimals: token.decimals,
                name: token.name,
                symbol: token.symbol,
              },
            ],
          };
        });

      // Create balances from MOCK_TRON_TOKENS
      state.balances['de5c3465-d01e-4091-a219-232903e982bb'] = {};
      Object.values(MOCK_TRON_TOKENS)
        .flat()
        .forEach((token) => {
          state.balances['de5c3465-d01e-4091-a219-232903e982bb'][
            token.assetId
          ] = {
            amount: token.balance,
            unit: token.symbol,
          };
        });

      // Create conversion rates from MOCK_TRON_TOKENS (only for tokens with fiat data)
      Object.values(MOCK_TRON_TOKENS)
        .flat()
        .forEach((token) => {
          if (token.fiat?.conversionRate) {
            state.conversionRates[token.assetId] = {
              rate: token.fiat.conversionRate.toString(),
              conversionTime: Date.now(),
            };
          }
        });

      return state;
    };

    it('filters out tron staked tokens', () => {
      const state = arrangeTronState();

      const result = selectAssetsBySelectedAccountGroup(state);

      expect(result[TrxScope.Mainnet]).toHaveLength(1);
      expect(result[TrxScope.Nile]).toHaveLength(1);
      expect(result[TrxScope.Shasta]).toHaveLength(1);
    });

    it('does not filter out tron staked tokens', () => {
      const state = arrangeTronState();

      const result = selectAssetsBySelectedAccountGroup(state, {
        filterTronStakedTokens: false,
      });

      expect(result[TrxScope.Mainnet].length > 1).toBe(true);
      expect(result[TrxScope.Nile].length > 1).toBe(true);
      expect(result[TrxScope.Shasta].length > 1).toBe(true);
    });

    it('calculates fiat for native token using currency rate fallback when market data is missing', () => {
      // Setup: Add a new chain (Ink chain 0xdef1) with native balance but NO market data
      const inkChainId = '0xdef1' as Hex;
      const stateWithInkChain = {
        ...mockedMergedState,
        // Add Ink chain to network configuration
        networkConfigurationsByChainId: {
          ...mockNetworkControllerState.networkConfigurationsByChainId,
          [inkChainId]: {
            nativeCurrency: 'ETH', // Ink chain uses ETH as native currency
          },
        },
        // Add native balance for the account on Ink chain
        accountsByChainId: {
          ...mockAccountsTrackerControllerState.accountsByChainId,
          [inkChainId]: {
            '0x2bd63233fe369b0f13eaf25292af5a9b63d2b7ab': {
              balance: '0xDE0B6B3A7640000', // 1 ETH (1000000000000000000 wei)
            },
          },
        },
        // Market data does NOT include Ink chain native token
        // (using existing mockTokenRatesControllerState which doesn't have 0xdef1)
      };

      const result = selectAssetsBySelectedAccountGroup(stateWithInkChain);

      // Find the Ink chain native token
      const inkNativeToken = result[inkChainId]?.find(
        (asset) => asset.isNative,
      );

      // Should have fiat calculated using the ETH currency rate fallback
      expect(inkNativeToken).toStrictEqual({
        accountType: 'eip155:eoa',
        accountId: 'd7f11451-9d79-4df4-a012-afd253443639',
        chainId: inkChainId,
        assetId: '0x0000000000000000000000000000000000000000',
        address: '0x0000000000000000000000000000000000000000',
        image: '',
        name: 'Ethereum',
        symbol: 'ETH',
        isNative: true,
        decimals: 18,
        rawBalance: '0xDE0B6B3A7640000',
        balance: '1',
        fiat: {
          balance: 2400, // 1 ETH * 2400 USD/ETH
          conversionRate: 2400,
          currency: 'USD',
        },
      });
    });

    it('returns undefined fiat for native token when both market data and currency rate are missing', () => {
      const inkChainId = '0xdef1' as Hex;
      const stateWithMissingCurrencyRate = {
        ...mockedMergedState,
        networkConfigurationsByChainId: {
          ...mockNetworkControllerState.networkConfigurationsByChainId,
          [inkChainId]: {
            nativeCurrency: 'INK', // Custom native currency with no currency rate
          },
        },
        accountsByChainId: {
          ...mockAccountsTrackerControllerState.accountsByChainId,
          [inkChainId]: {
            '0x2bd63233fe369b0f13eaf25292af5a9b63d2b7ab': {
              balance: '0xDE0B6B3A7640000',
            },
          },
        },
        // currencyRates doesn't have 'INK', only 'ETH'
      };

      const result = selectAssetsBySelectedAccountGroup(
        stateWithMissingCurrencyRate,
      );

      const inkNativeToken = result[inkChainId]?.find(
        (asset) => asset.isNative,
      );

      // Should have undefined fiat since there's no currency rate for 'INK'
      expect(inkNativeToken?.fiat).toBeUndefined();
    });
  });
});
