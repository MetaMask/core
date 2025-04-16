import type { DefiPositionResponse } from '../fetch-positions';

/**
 * Entries are from different chains
 */
export const MOCK_DEFI_RESPONSE_MULTI_CHAIN: DefiPositionResponse[] = [
  {
    protocolId: 'aave-v3',
    name: 'Aave v3 AToken',
    description: 'Aave v3 defi adapter for yield-generating token',
    siteUrl: 'https://aave.com/',
    iconUrl: 'https://cryptologos.cc/logos/aave-aave-logo.png',
    positionType: 'supply',
    chainId: 1,
    productId: 'a-token',
    chainName: 'ethereum',
    protocolDisplayName: 'Aave V3',
    metadata: {
      groupPositions: true,
    },
    success: true,
    tokens: [
      {
        address: '0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8',
        name: 'Aave Ethereum WETH',
        symbol: 'aEthWETH',
        decimals: 18,
        balanceRaw: '5000000000000000000',
        balance: 5,
        type: 'protocol',
        tokens: [
          {
            address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            name: 'Wrapped Ether',
            symbol: 'WETH',
            decimals: 18,
            type: 'underlying',
            balanceRaw: '5000000000000000000',
            balance: 5,
            price: 1000,
            iconUrl:
              'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
          },
        ],
      },
    ],
  },
  {
    protocolId: 'aave-v3',
    name: 'Aave v3 AToken',
    description: 'Aave v3 defi adapter for yield-generating token',
    siteUrl: 'https://aave.com/',
    iconUrl: 'https://cryptologos.cc/logos/aave-aave-logo.png',
    positionType: 'supply',
    chainId: 8453,
    productId: 'a-token',
    chainName: 'base',
    protocolDisplayName: 'Aave V3',
    metadata: {
      groupPositions: true,
    },
    success: true,
    tokens: [
      {
        address: '0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8',
        name: 'Aave Ethereum WETH',
        symbol: 'aEthWETH',
        decimals: 18,
        balanceRaw: '5000000000000000000',
        balance: 5,
        type: 'protocol',
        tokens: [
          {
            address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            name: 'Wrapped Ether',
            symbol: 'WETH',
            decimals: 18,
            type: 'underlying',
            balanceRaw: '5000000000000000000',
            balance: 5,
            price: 1000,
            iconUrl:
              'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
          },
        ],
      },
    ],
  },
];

/**
 * The first entry is a failed entry
 */
export const MOCK_DEFI_RESPONSE_FAILED_ENTRY: DefiPositionResponse[] = [
  {
    protocolId: 'aave-v3',
    name: 'Aave v3 VariableDebtToken',
    description: 'Aave v3 defi adapter for variable interest-accruing token',
    siteUrl: 'https://aave.com/',
    iconUrl: 'https://cryptologos.cc/logos/aave-aave-logo.png',
    positionType: 'borrow',
    chainId: 1,
    productId: 'variable-debt-token',
    chainName: 'ethereum',
    protocolDisplayName: 'Aave V3',
    metadata: {
      groupPositions: true,
    },
    success: false,
    error: {
      message: 'Failed to fetch positions',
    },
  },
  {
    protocolId: 'aave-v3',
    name: 'Aave v3 AToken',
    description: 'Aave v3 defi adapter for yield-generating token',
    siteUrl: 'https://aave.com/',
    iconUrl: 'https://cryptologos.cc/logos/aave-aave-logo.png',
    positionType: 'supply',
    chainId: 1,
    productId: 'a-token',
    chainName: 'ethereum',
    protocolDisplayName: 'Aave V3',
    metadata: {
      groupPositions: true,
    },
    success: true,
    tokens: [
      {
        address: '0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8',
        name: 'Aave Ethereum WETH',
        symbol: 'aEthWETH',
        decimals: 18,
        balanceRaw: '5000000000000000000',
        balance: 5,
        type: 'protocol',
        tokens: [
          {
            address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            name: 'Wrapped Ether',
            symbol: 'WETH',
            decimals: 18,
            type: 'underlying',
            balanceRaw: '5000000000000000000',
            balance: 5,
            price: 1000,
            iconUrl:
              'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
          },
        ],
      },
    ],
  },
];

/**
 * The second entry has no price
 */
export const MOCK_DEFI_RESPONSE_NO_PRICES: DefiPositionResponse[] = [
  {
    protocolId: 'aave-v3',
    name: 'Aave v3 AToken',
    description: 'Aave v3 defi adapter for yield-generating token',
    siteUrl: 'https://aave.com/',
    iconUrl: 'https://cryptologos.cc/logos/aave-aave-logo.png',
    positionType: 'supply',
    chainId: 1,
    productId: 'a-token',
    chainName: 'ethereum',
    protocolDisplayName: 'Aave V3',
    metadata: {
      groupPositions: true,
    },
    success: true,
    tokens: [
      {
        address: '0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8',
        name: 'Aave Ethereum WETH',
        symbol: 'aEthWETH',
        decimals: 18,
        balanceRaw: '40000000000000000',
        balance: 0.04,
        type: 'protocol',
        tokens: [
          {
            address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            name: 'Wrapped Ether',
            symbol: 'WETH',
            decimals: 18,
            type: 'underlying',
            balanceRaw: '40000000000000000',
            balance: 0.04,
            price: 1000,
            iconUrl:
              'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
          },
        ],
      },
      {
        address: '0x5Ee5bf7ae06D1Be5997A1A72006FE6C607eC6DE8',
        name: 'Aave Ethereum WBTC',
        symbol: 'aEthWBTC',
        decimals: 8,
        balanceRaw: '300000000',
        balance: 3,
        type: 'protocol',
        tokens: [
          {
            address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
            name: 'Wrapped BTC',
            symbol: 'WBTC',
            decimals: 8,
            type: 'underlying',
            balanceRaw: '300000000',
            balance: 3,
            price: undefined,
            iconUrl:
              'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599/logo.png',
          },
        ],
      },
    ],
  },
];

/**
 * The second entry is a borrow position
 */
export const MOCK_DEFI_RESPONSE_BORROW: DefiPositionResponse[] = [
  {
    protocolId: 'aave-v3',
    name: 'Aave v3 AToken',
    description: 'Aave v3 defi adapter for yield-generating token',
    siteUrl: 'https://aave.com/',
    iconUrl: 'https://cryptologos.cc/logos/aave-aave-logo.png',
    positionType: 'supply',
    chainId: 1,
    productId: 'a-token',
    chainName: 'ethereum',
    protocolDisplayName: 'Aave V3',
    metadata: {
      groupPositions: true,
    },
    success: true,
    tokens: [
      {
        address: '0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8',
        name: 'Aave Ethereum WETH',
        symbol: 'aEthWETH',
        decimals: 18,
        balanceRaw: '40000000000000000',
        balance: 0.04,
        type: 'protocol',
        tokens: [
          {
            address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            name: 'Wrapped Ether',
            symbol: 'WETH',
            decimals: 18,
            type: 'underlying',
            balanceRaw: '40000000000000000',
            balance: 0.04,
            price: 1000,
            iconUrl:
              'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
          },
        ],
      },
      {
        address: '0x5Ee5bf7ae06D1Be5997A1A72006FE6C607eC6DE8',
        name: 'Aave Ethereum WBTC',
        symbol: 'aEthWBTC',
        decimals: 8,
        balanceRaw: '300000000',
        balance: 3,
        type: 'protocol',
        tokens: [
          {
            address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
            name: 'Wrapped BTC',
            symbol: 'WBTC',
            decimals: 8,
            type: 'underlying',
            balanceRaw: '300000000',
            balance: 3,
            price: 500,
            iconUrl:
              'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599/logo.png',
          },
        ],
      },
    ],
  },
  {
    protocolId: 'aave-v3',
    name: 'Aave v3 VariableDebtToken',
    description: 'Aave v3 defi adapter for variable interest-accruing token',
    siteUrl: 'https://aave.com/',
    iconUrl: 'https://cryptologos.cc/logos/aave-aave-logo.png',
    positionType: 'borrow',
    chainId: 1,
    productId: 'variable-debt-token',
    chainName: 'ethereum',
    protocolDisplayName: 'Aave V3',
    metadata: {
      groupPositions: true,
    },
    success: true,
    tokens: [
      {
        address: '0x6df1C1E379bC5a00a7b4C6e67A203333772f45A8',
        name: 'Aave Ethereum Variable Debt USDT',
        symbol: 'variableDebtEthUSDT',
        decimals: 6,
        balanceRaw: '1000000000',
        type: 'protocol',
        tokens: [
          {
            address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
            name: 'Tether USD',
            symbol: 'USDT',
            decimals: 6,
            type: 'underlying',
            balanceRaw: '1000000000',
            balance: 1000,
            price: 1,
            iconUrl:
              'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png',
          },
        ],
        balance: 1000,
      },
    ],
  },
];

/**
 * Complex mock with multiple chains, failed entries, borrow positions, etc.
 */
export const MOCK_DEFI_RESPONSE_COMPLEX: DefiPositionResponse[] = [
  {
    protocolId: 'aave-v3',
    name: 'Aave v3 AToken',
    description: 'Aave v3 defi adapter for yield-generating token',
    siteUrl: 'https://aave.com/',
    iconUrl: 'https://cryptologos.cc/logos/aave-aave-logo.png',
    positionType: 'supply',
    chainId: 1,
    productId: 'a-token',
    chainName: 'ethereum',
    protocolDisplayName: 'Aave V3',
    metadata: {
      groupPositions: true,
    },
    success: true,
    tokens: [
      {
        address: '0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8',
        name: 'Aave Ethereum WETH',
        symbol: 'aEthWETH',
        decimals: 18,
        balanceRaw: '40000000000000000',
        balance: 0.04,
        type: 'protocol',
        tokens: [
          {
            address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            name: 'Wrapped Ether',
            symbol: 'WETH',
            decimals: 18,
            type: 'underlying',
            balanceRaw: '40000000000000000',
            balance: 0.04,
            price: 1000,
            iconUrl:
              'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
          },
        ],
      },
      {
        address: '0x5Ee5bf7ae06D1Be5997A1A72006FE6C607eC6DE8',
        name: 'Aave Ethereum WBTC',
        symbol: 'aEthWBTC',
        decimals: 8,
        balanceRaw: '300000000',
        balance: 3,
        type: 'protocol',
        tokens: [
          {
            address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
            name: 'Wrapped BTC',
            symbol: 'WBTC',
            decimals: 8,
            type: 'underlying',
            balanceRaw: '300000000',
            balance: 3,
            price: 500,
            iconUrl:
              'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599/logo.png',
          },
        ],
      },
    ],
  },
  {
    protocolId: 'aave-v3',
    name: 'Aave v3 VariableDebtToken',
    description: 'Aave v3 defi adapter for variable interest-accruing token',
    siteUrl: 'https://aave.com/',
    iconUrl: 'https://cryptologos.cc/logos/aave-aave-logo.png',
    positionType: 'borrow',
    chainId: 1,
    productId: 'variable-debt-token',
    chainName: 'ethereum',
    protocolDisplayName: 'Aave V3',
    metadata: {
      groupPositions: true,
    },
    success: true,
    tokens: [
      {
        address: '0x6df1C1E379bC5a00a7b4C6e67A203333772f45A8',
        name: 'Aave Ethereum Variable Debt USDT',
        symbol: 'variableDebtEthUSDT',
        decimals: 6,
        balanceRaw: '1000000000',
        type: 'protocol',
        tokens: [
          {
            address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
            name: 'Tether USD',
            symbol: 'USDT',
            decimals: 6,
            type: 'underlying',
            balanceRaw: '1000000000',
            balance: 1000,
            price: 1,
            iconUrl:
              'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png',
          },
        ],
        balance: 1000,
      },
    ],
  },
  {
    protocolId: 'lido',
    name: 'Lido wstEth',
    description: 'Lido defi adapter for wstEth',
    siteUrl: 'https://stake.lido.fi/wrap',
    iconUrl:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84/logo.png',
    positionType: 'stake',
    chainId: 1,
    productId: 'wst-eth',
    chainName: 'ethereum',
    protocolDisplayName: 'Lido',
    success: true,
    tokens: [
      {
        address: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0',
        name: 'Wrapped liquid staked Ether 2.0',
        symbol: 'wstETH',
        decimals: 18,
        balanceRaw: '800000000000000000000',
        balance: 800,
        type: 'protocol',
        tokens: [
          {
            address: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
            name: 'Liquid staked Ether 2.0',
            symbol: 'stETH',
            decimals: 18,
            type: 'underlying',
            balanceRaw: '1000000000000000000',
            balance: 10,
            price: 2000,
            iconUrl:
              'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84/logo.png',
            tokens: [
              {
                address: '0x0000000000000000000000000000000000000000',
                name: 'Ethereum',
                symbol: 'ETH',
                decimals: 18,
                type: 'underlying',
                balanceRaw: '1000000000000000000',
                balance: 10,
                price: 2000,
                iconUrl:
                  'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    protocolId: 'uniswap-v3',
    name: 'UniswapV3',
    description: 'UniswapV3 defi adapter',
    siteUrl: 'https://uniswap.org/',
    iconUrl:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984/logo.png',
    positionType: 'supply',
    chainId: 8453,
    productId: 'pool',
    chainName: 'base',
    protocolDisplayName: 'Uniswap V3',
    success: true,
    tokens: [
      {
        address: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
        tokenId: '940758',
        name: 'GASP / USDT - 0.3%',
        symbol: 'GASP / USDT - 0.3%',
        decimals: 18,
        balanceRaw: '1000000000000000000',
        balance: 1,
        type: 'protocol',
        tokens: [
          {
            address: '0x736ECc5237B31eDec6f1aB9a396FaE2416b1d96E',
            name: 'GASP',
            symbol: 'GASP',
            decimals: 18,
            balanceRaw: '100000000000000000000',
            type: 'underlying',
            balance: 100,
            price: 0.1,
            iconUrl:
              'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x736ECc5237B31eDec6f1aB9a396FaE2416b1d96E/logo.png',
          },
          {
            address: '0x736ECc5237B31eDec6f1aB9a396FaE2416b1d96E',
            name: 'GASP',
            symbol: 'GASP',
            decimals: 18,
            balanceRaw: '10000000000000000000',
            type: 'underlying-claimable',
            balance: 10,
            price: 0.1,
            iconUrl:
              'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x736ECc5237B31eDec6f1aB9a396FaE2416b1d96E/logo.png',
          },
          {
            address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
            name: 'Tether USD',
            symbol: 'USDT',
            decimals: 6,
            balanceRaw: '500000000',
            type: 'underlying',
            balance: 500,
            price: 1,
            iconUrl:
              'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png',
          },
          {
            address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
            name: 'Tether USD',
            symbol: 'USDT',
            decimals: 6,
            balanceRaw: '2000000',
            type: 'underlying-claimable',
            balance: 2,
            price: 1,
            iconUrl:
              'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png',
          },
        ],
      },
      {
        address: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
        tokenId: '940760',
        name: 'GASP / USDT - 0.3%',
        symbol: 'GASP / USDT - 0.3%',
        decimals: 18,
        balanceRaw: '2000000000000000000',
        balance: 2,
        type: 'protocol',
        tokens: [
          {
            address: '0x736ECc5237B31eDec6f1aB9a396FaE2416b1d96E',
            name: 'GASP',
            symbol: 'GASP',
            decimals: 18,
            balanceRaw: '90000000000000000000000',
            type: 'underlying',
            balance: 90000,
            price: 0.1,
            iconUrl:
              'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x736ECc5237B31eDec6f1aB9a396FaE2416b1d96E/logo.png',
          },
          {
            address: '0x736ECc5237B31eDec6f1aB9a396FaE2416b1d96E',
            name: 'GASP',
            symbol: 'GASP',
            decimals: 18,
            balanceRaw: '50000000000000000000',
            type: 'underlying-claimable',
            balance: 50,
            price: 0.1,
            iconUrl:
              'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x736ECc5237B31eDec6f1aB9a396FaE2416b1d96E/logo.png',
          },
          {
            address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
            name: 'Tether USD',
            symbol: 'USDT',
            decimals: 6,
            balanceRaw: '60000000',
            type: 'underlying',
            balance: 60,
            price: 1,
            iconUrl:
              'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png',
          },
          {
            address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
            name: 'Tether USD',
            symbol: 'USDT',
            decimals: 6,
            balanceRaw: '2000000',
            type: 'underlying-claimable',
            balance: 2,
            price: 1,
            iconUrl:
              'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png',
          },
        ],
      },
    ],
  },
];
