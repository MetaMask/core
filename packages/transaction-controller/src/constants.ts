export const CHAIN_IDS = {
  MAINNET: '0x1',
  GOERLI: '0x5',
  BASE: '0x2105',
  BASE_TESTNET: '0x14a33',
  BSC: '0x38',
  BSC_TESTNET: '0x61',
  OPTIMISM: '0xa',
  OPTIMISM_TESTNET: '0x1a4',
  OPBNB: '0xcc',
  OPBNB_TESTNET: '0x15eb',
  OPTIMISM_SEPOLIA: '0xaa37dc',
  POLYGON: '0x89',
  POLYGON_TESTNET: '0x13881',
  AVALANCHE: '0xa86a',
  AVALANCHE_TESTNET: '0xa869',
  FANTOM: '0xfa',
  FANTOM_TESTNET: '0xfa2',
  SEPOLIA: '0xaa36a7',
  LINEA_GOERLI: '0xe704',
  LINEA_SEPOLIA: '0xe705',
  LINEA_MAINNET: '0xe708',
  MOONBEAM: '0x504',
  MOONBEAM_TESTNET: '0x507',
  MOONRIVER: '0x505',
  GNOSIS: '0x64',
  ARBITRUM: '0xa4b1',
  ZKSYNC_ERA: '0x144',
} as const;

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
    subdomain: `${DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX}-goerli`,
  },
  [CHAIN_IDS.LINEA_SEPOLIA]: {
    domain: 'lineascan.build',
    subdomain: `${DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX}-sepolia`,
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
  [CHAIN_IDS.OPTIMISM_SEPOLIA]: {
    domain: DEFAULT_ETHERSCAN_DOMAIN,
    subdomain: `${DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX}-sepolia-optimistic`,
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

export const GAS_BUFFER_CHAIN_OVERRIDES = {
  [CHAIN_IDS.OPTIMISM]: 1,
  [CHAIN_IDS.OPTIMISM_SEPOLIA]: 1,
};
