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
} as const;

const DEFAULT_ETHERSCAN_DOMAIN = 'etherscan.io';
const DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX = 'api';

export const ETHERSCAN_SUPPORTED_NETWORKS = {
  [CHAIN_IDS.GOERLI]: {
    domain: DEFAULT_ETHERSCAN_DOMAIN,
    subdomain: `${DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX}-goerli`,
    networkId: parseInt(CHAIN_IDS.GOERLI, 16).toString(),
  },
  [CHAIN_IDS.MAINNET]: {
    domain: DEFAULT_ETHERSCAN_DOMAIN,
    subdomain: DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX,
    networkId: parseInt(CHAIN_IDS.MAINNET, 16).toString(),
  },
  [CHAIN_IDS.SEPOLIA]: {
    domain: DEFAULT_ETHERSCAN_DOMAIN,
    subdomain: `${DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX}-sepolia`,
    networkId: parseInt(CHAIN_IDS.SEPOLIA, 16).toString(),
  },
  [CHAIN_IDS.LINEA_GOERLI]: {
    domain: 'lineascan.build',
    subdomain: 'goerli',
    networkId: parseInt(CHAIN_IDS.LINEA_GOERLI, 16).toString(),
  },
  [CHAIN_IDS.LINEA_MAINNET]: {
    domain: 'lineascan.build',
    subdomain: DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX,
    networkId: parseInt(CHAIN_IDS.LINEA_MAINNET, 16).toString(),
  },
  [CHAIN_IDS.BSC]: {
    domain: 'bscscan.com',
    subdomain: DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX,
    networkId: parseInt(CHAIN_IDS.BSC, 16).toString(),
  },
  [CHAIN_IDS.BSC_TESTNET]: {
    domain: 'bscscan.com',
    subdomain: `${DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX}-testnet`,
    networkId: parseInt(CHAIN_IDS.BSC_TESTNET, 16).toString(),
  },
  [CHAIN_IDS.OPTIMISM]: {
    domain: DEFAULT_ETHERSCAN_DOMAIN,
    subdomain: `${DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX}-optimistic`,
    networkId: parseInt(CHAIN_IDS.OPTIMISM, 16).toString(),
  },
  [CHAIN_IDS.OPTIMISM_TESTNET]: {
    domain: DEFAULT_ETHERSCAN_DOMAIN,
    subdomain: `${DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX}-goerli-optimistic`,
    networkId: parseInt(CHAIN_IDS.OPTIMISM_TESTNET, 16).toString(),
  },
  [CHAIN_IDS.POLYGON]: {
    domain: 'polygonscan.com',
    subdomain: DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX,
    networkId: parseInt(CHAIN_IDS.POLYGON, 16).toString(),
  },
  [CHAIN_IDS.POLYGON_TESTNET]: {
    domain: 'polygonscan.com',
    subdomain: `${DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX}-mumbai`,
    networkId: parseInt(CHAIN_IDS.POLYGON_TESTNET, 16).toString(),
  },
  [CHAIN_IDS.AVALANCHE]: {
    domain: 'snowtrace.io',
    subdomain: DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX,
    networkId: parseInt(CHAIN_IDS.AVALANCHE, 16).toString(),
  },
  [CHAIN_IDS.AVALANCHE_TESTNET]: {
    domain: 'snowtrace.io',
    subdomain: `${DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX}-testnet`,
    networkId: parseInt(CHAIN_IDS.AVALANCHE_TESTNET, 16).toString(),
  },
  [CHAIN_IDS.FANTOM]: {
    domain: 'ftmscan.com',
    subdomain: DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX,
    networkId: parseInt(CHAIN_IDS.FANTOM, 16).toString(),
  },
  [CHAIN_IDS.FANTOM_TESTNET]: {
    domain: 'ftmscan.com',
    subdomain: `${DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX}-testnet`,
    networkId: parseInt(CHAIN_IDS.FANTOM_TESTNET, 16).toString(),
  },
  [CHAIN_IDS.MOONBEAM]: {
    domain: 'moonscan.io',
    subdomain: `${DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX}-moonbeam`,
    networkId: parseInt(CHAIN_IDS.MOONBEAM, 16).toString(),
  },
  [CHAIN_IDS.MOONBEAM_TESTNET]: {
    domain: 'moonscan.io',
    subdomain: `${DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX}-moonbase`,
    networkId: parseInt(CHAIN_IDS.MOONBEAM_TESTNET, 16).toString(),
  },
  [CHAIN_IDS.MOONRIVER]: {
    domain: 'moonscan.io',
    subdomain: `${DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX}-moonriver`,
    networkId: parseInt(CHAIN_IDS.MOONRIVER, 16).toString(),
  },
  [CHAIN_IDS.GNOSIS]: {
    domain: 'gnosisscan.io',
    subdomain: `${DEFAULT_ETHERSCAN_SUBDOMAIN_PREFIX}-gnosis`,
    networkId: parseInt(CHAIN_IDS.GNOSIS, 16).toString(),
  },
};
