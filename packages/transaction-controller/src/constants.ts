import { TransactionType } from './types';

export const CHAIN_IDS = {
  MAINNET: '0x1',
  GOERLI: '0x5',
  BSC: '0x38',
  BSC_TESTNET: '0x61',
  OPTIMISM: '0xa',
  OPTIMISM_TESTNET: '0x1a4',
  POLYGON: '0x89',
  POLYGON_TESTNET: '0x13881',
  AVALANCHE: '0xa86a',
  AVALANCHE_TESTNET: '0xa869',
  FANTOM: '0xfa',
  FANTOM_TESTNET: '0xfa2',
  SEPOLIA: '0xaa36a7',
  LINEA_GOERLI: '0xe704',
  LINEA_MAINNET: '0xe708',
  MOONBEAM: '0x504',
  MOONBEAM_TESTNET: '0x507',
  MOONRIVER: '0x505',
  GNOSIS: '0x64',
  ARBITRUM: '0xa4b1',
  ZKSYNC_ERA: '0x144',
} as const;
const SWAPS_TESTNET_CHAIN_ID = '0x539';

// An address that the metaswap-api recognizes as the default token for the current network,
// in place of the token address that ERC-20 tokens have
export const DEFAULT_TOKEN_ADDRESS =
  '0x0000000000000000000000000000000000000000';

export const DEFAULT_ETHERSCAN_DOMAIN = 'etherscan.io';
export const DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX = 'api';

export const ETHERSCAN_SUPPORTED_NETWORKS = {
  [CHAIN_IDS.GOERLI]: {
    domain: DEFAULT_ETHERSCAN_DOMAIN,
    subdomain: `${DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX}-goerli`,
  },
  [CHAIN_IDS.MAINNET]: {
    domain: DEFAULT_ETHERSCAN_DOMAIN,
    subdomain: DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX,
  },
  [CHAIN_IDS.SEPOLIA]: {
    domain: DEFAULT_ETHERSCAN_DOMAIN,
    subdomain: `${DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX}-sepolia`,
  },
  [CHAIN_IDS.LINEA_GOERLI]: {
    domain: 'lineascan.build',
    subdomain: 'goerli',
  },
  [CHAIN_IDS.LINEA_MAINNET]: {
    domain: 'lineascan.build',
    subdomain: DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX,
  },
  [CHAIN_IDS.BSC]: {
    domain: 'bscscan.com',
    subdomain: DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX,
  },
  [CHAIN_IDS.BSC_TESTNET]: {
    domain: 'bscscan.com',
    subdomain: `${DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX}-testnet`,
  },
  [CHAIN_IDS.OPTIMISM]: {
    domain: DEFAULT_ETHERSCAN_DOMAIN,
    subdomain: `${DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX}-optimistic`,
  },
  [CHAIN_IDS.OPTIMISM_TESTNET]: {
    domain: DEFAULT_ETHERSCAN_DOMAIN,
    subdomain: `${DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX}-goerli-optimistic`,
  },
  [CHAIN_IDS.POLYGON]: {
    domain: 'polygonscan.com',
    subdomain: DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX,
  },
  [CHAIN_IDS.POLYGON_TESTNET]: {
    domain: 'polygonscan.com',
    subdomain: `${DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX}-mumbai`,
  },
  [CHAIN_IDS.AVALANCHE]: {
    domain: 'snowtrace.io',
    subdomain: DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX,
  },
  [CHAIN_IDS.AVALANCHE_TESTNET]: {
    domain: 'snowtrace.io',
    subdomain: `${DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX}-testnet`,
  },
  [CHAIN_IDS.FANTOM]: {
    domain: 'ftmscan.com',
    subdomain: DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX,
  },
  [CHAIN_IDS.FANTOM_TESTNET]: {
    domain: 'ftmscan.com',
    subdomain: `${DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX}-testnet`,
  },
  [CHAIN_IDS.MOONBEAM]: {
    domain: 'moonscan.io',
    subdomain: `${DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX}-moonbeam`,
  },
  [CHAIN_IDS.MOONBEAM_TESTNET]: {
    domain: 'moonscan.io',
    subdomain: `${DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX}-moonbase`,
  },
  [CHAIN_IDS.MOONRIVER]: {
    domain: 'moonscan.io',
    subdomain: `${DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX}-moonriver`,
  },
  [CHAIN_IDS.GNOSIS]: {
    domain: 'gnosisscan.io',
    subdomain: `${DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX}-gnosis`,
  },
};

export const SWAP_TRANSACTION_TYPES = [
  TransactionType.swap,
  TransactionType.swapApproval,
];

// Only certain types of transactions should be allowed to be specified when
// adding a new unapproved transaction.
export const VALID_UNAPPROVED_TRANSACTION_TYPES = [
  ...SWAP_TRANSACTION_TYPES,
  TransactionType.simpleSend,
  TransactionType.tokenMethodTransfer,
  TransactionType.tokenMethodTransferFrom,
  TransactionType.contractInteraction,
];

export interface SwapsTokenObject {
  /**
   * The name for the network
   */
  name: string;
  /**
   * An address that the metaswap-api recognizes as the default token
   */
  address: string;
  /**
   * Number of digits after decimal point
   */
  decimals: number;
}

export const ETH_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  name: 'Ether',
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 18,
};

export const BNB_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  name: 'Binance Coin',
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 18,
} as const;

export const MATIC_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  name: 'Matic',
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 18,
} as const;

export const AVAX_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  name: 'Avalanche',
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 18,
} as const;

export const TEST_ETH_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  name: 'Test Ether',
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 18,
} as const;

export const GOERLI_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  name: 'Ether',
  address: DEFAULT_TOKEN_ADDRESS,
  decimals: 18,
} as const;

export const ARBITRUM_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  ...ETH_SWAPS_TOKEN_OBJECT,
} as const;

export const OPTIMISM_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  ...ETH_SWAPS_TOKEN_OBJECT,
} as const;

export const ZKSYNC_ERA_SWAPS_TOKEN_OBJECT: SwapsTokenObject = {
  ...ETH_SWAPS_TOKEN_OBJECT,
} as const;

export const SWAPS_CHAINID_DEFAULT_TOKEN_MAP = {
  [CHAIN_IDS.MAINNET]: ETH_SWAPS_TOKEN_OBJECT,
  [SWAPS_TESTNET_CHAIN_ID]: TEST_ETH_SWAPS_TOKEN_OBJECT,
  [CHAIN_IDS.BSC]: BNB_SWAPS_TOKEN_OBJECT,
  [CHAIN_IDS.POLYGON]: MATIC_SWAPS_TOKEN_OBJECT,
  [CHAIN_IDS.GOERLI]: GOERLI_SWAPS_TOKEN_OBJECT,
  [CHAIN_IDS.AVALANCHE]: AVAX_SWAPS_TOKEN_OBJECT,
  [CHAIN_IDS.OPTIMISM]: OPTIMISM_SWAPS_TOKEN_OBJECT,
  [CHAIN_IDS.ARBITRUM]: ARBITRUM_SWAPS_TOKEN_OBJECT,
  [CHAIN_IDS.ZKSYNC_ERA]: ZKSYNC_ERA_SWAPS_TOKEN_OBJECT,
} as const;
