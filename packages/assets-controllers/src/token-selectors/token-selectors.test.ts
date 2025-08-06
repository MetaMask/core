import { AccountGroupType, AccountWalletType } from '@metamask/account-api';
import type { AccountTreeControllerState } from '@metamask/account-tree-controller';

import {
  selectAccountsToGroupIdMap,
  selectAllAssets,
  selectAssetsBySelectedAccountGroup,
} from './token-selectors';
import type { MultichainAssetsControllerState } from '../MultichainAssetsController';
import type { TokensControllerState } from '../TokensController';
import { AccountsControllerState } from '@metamask/accounts-controller';

describe('token-selectors', () => {
  it('returns something', () => {
    expect(true).toBe(true);
  });
});

const mockTokensControllerState: TokensControllerState = {
  allTokens: {
    '0x1': {
      '0xb1d018be7a9cfd7ac6c5cce00835a8f2386173d8': [
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
          address: '0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee',
          decimals: 18,
          symbol: 'WEETH',
          name: 'Wrapped eETH',
          image:
            'https://static.cx.metamask.io/api/v1/tokenIcons/1/0xcd5fe23c85820f7b72d0926fc9b05b43e359b7ee.png',
        },
      ],
    },
    '0xa': {
      '0xb1d018be7a9cfd7ac6c5cce00835a8f2386173d8': [
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
      '0xb1d018be7a9cfd7ac6c5cce00835a8f2386173d8': [
        '0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee',
      ],
    },
  },
  allDetectedTokens: {},
};

const mockMultichainAssetsControllerState: MultichainAssetsControllerState = {
  accountsAssets: {
    '093ae07f-377a-495a-8d75-74e8b245a362': [
      'bip122:000000000019d6689c085ae165831e93/slip44:0',
    ],
    '809705ef-40e9-4c87-8cc2-cdb03020cb6d': [
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501',
    ],
  },
  assetsMetadata: {
    'bip122:000000000019d6689c085ae165831e93/slip44:0': {
      fungible: true,
      iconUrl:
        'data:image/svg+xml;base64,PHN2ZyB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgdmVyc2lvbj0iMS4xIiB4bWxuczpjYz0iaHR0cDovL2NyZWF0aXZlY29tbW9ucy5vcmcvbnMjIiB4bWxuczpkYz0iaHR0cDovL3B1cmwub3JnL2RjL2VsZW1lbnRzLzEuMS8iIHZpZXdCb3g9IjAgMCA2NSA2NSIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBjbGFzcz0ibmctc3Rhci1pbnNlcnRlZCI+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMC4wMDYzMDg3NiwtMC4wMDMwMTk4NCkiPjxwYXRoIGQ9Im02My4wMzMsMzkuNzQ0Yy00LjI3NCwxNy4xNDMtMjEuNjM3LDI3LjU3Ni0zOC43ODIsMjMuMzAxLTE3LjEzOC00LjI3NC0yNy41NzEtMjEuNjM4LTIzLjI5NS0zOC43OCw0LjI3Mi0xNy4xNDUsMjEuNjM1LTI3LjU3OSwzOC43NzUtMjMuMzA1LDE3LjE0NCw0LjI3NCwyNy41NzYsMjEuNjQsMjMuMzAyLDM4Ljc4NHoiIGZpbGw9IiNmNzkzMWEiPjwvcGF0aD48cGF0aCBmaWxsPSIjRkZGIiBkPSJtNDYuMTAzLDI3LjQ0NGMwLjYzNy00LjI1OC0yLjYwNS02LjU0Ny03LjAzOC04LjA3NGwxLjQzOC01Ljc2OC0zLjUxMS0wLjg3NS0xLjQsNS42MTZjLTAuOTIzLTAuMjMtMS44NzEtMC40NDctMi44MTMtMC42NjJsMS40MS01LjY1My0zLjUwOS0wLjg3NS0xLjQzOSw1Ljc2NmMtMC43NjQtMC4xNzQtMS41MTQtMC4zNDYtMi4yNDItMC41MjdsMC4wMDQtMC4wMTgtNC44NDItMS4yMDktMC45MzQsMy43NXMyLjYwNSwwLjU5NywyLjU1LDAuNjM0YzEuNDIyLDAuMzU1LDEuNjc5LDEuMjk2LDEuNjM2LDIuMDQybC0xLjYzOCw2LjU3MWMwLjA5OCwwLjAyNSwwLjIyNSwwLjA2MSwwLjM2NSwwLjExNy0wLjExNy0wLjAyOS0wLjI0Mi0wLjA2MS0wLjM3MS0wLjA5MmwtMi4yOTYsOS4yMDVjLTAuMTc0LDAuNDMyLTAuNjE1LDEuMDgtMS42MDksMC44MzQsMC4wMzUsMC4wNTEtMi41NTItMC42MzctMi41NTItMC42MzdsLTEuNzQzLDQuMDE5LDQuNTY5LDEuMTM5YzAuODUsMC4yMTMsMS42ODMsMC40MzYsMi41MDMsMC42NDZsLTEuNDUzLDUuODM0LDMuNTA3LDAuODc1LDEuNDM5LTUuNzcyYzAuOTU4LDAuMjYsMS44ODgsMC41LDIuNzk4LDAuNzI2bC0xLjQzNCw1Ljc0NSwzLjUxMSwwLjg3NSwxLjQ1My01LjgyM2M1Ljk4NywxLjEzMywxMC40ODksMC42NzYsMTIuMzg0LTQuNzM5LDEuNTI3LTQuMzYtMC4wNzYtNi44NzUtMy4yMjYtOC41MTUsMi4yOTQtMC41MjksNC4wMjItMi4wMzgsNC40ODMtNS4xNTV6bS04LjAyMiwxMS4yNDljLTEuMDg1LDQuMzYtOC40MjYsMi4wMDMtMTAuODA2LDEuNDEybDEuOTI4LTcuNzI5YzIuMzgsMC41OTQsMTAuMDEyLDEuNzcsOC44NzgsNi4zMTd6bTEuMDg2LTExLjMxMmMtMC45OSwzLjk2Ni03LjEsMS45NTEtOS4wODIsMS40NTdsMS43NDgtNy4wMWMxLjk4MiwwLjQ5NCw4LjM2NSwxLjQxNiw3LjMzNCw1LjU1M3oiPjwvcGF0aD48L2c+PC9zdmc+',
      name: 'Bitcoin',
      symbol: 'BTC',
      units: [
        {
          decimals: 8,
          name: 'Bitcoin',
          symbol: 'BTC',
        },
        {
          decimals: 6,
          name: 'CentiBitcoin',
          symbol: 'cBTC',
        },
        {
          decimals: 5,
          name: 'MilliBitcoin',
          symbol: 'mBTC',
        },
        {
          decimals: 2,
          name: 'Bit',
          symbol: 'bits',
        },
        {
          decimals: 0,
          name: 'Satoshi',
          symbol: 'satoshi',
        },
      ],
    },
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
    selectedAccountGroup: 'entropy:01JZWEZW8KN28K5S87PE4V6W3A/1',
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
    },
    selectedAccount: 'd7f11451-9d79-4df4-a012-afd253443639',
  },
};
