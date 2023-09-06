import type { Hex } from '@metamask/utils';

import {
  NetworkType,
  NetworksTicker,
  ChainId,
  BuiltInNetworkName,
} from './types';

export const RPC = 'rpc';
export const FALL_BACK_VS_CURRENCY = 'ETH';
export const IPFS_DEFAULT_GATEWAY_URL = 'https://cloudflare-ipfs.com/ipfs/';

// NETWORKS ID
// `toHex` not invoked to avoid cyclic dependency
export const GANACHE_CHAIN_ID = '0x539'; // toHex(1337)
/**
 * The largest possible chain ID we can handle.
 * Explanation: https://gist.github.com/rekmarks/a47bd5f2525936c4b8eee31a16345553
 */
export const MAX_SAFE_CHAIN_ID = 4503599627370476;

// TOKEN STANDARDS
export const ERC721 = 'ERC721';
export const ERC1155 = 'ERC1155';
export const ERC20 = 'ERC20';

// TOKEN INTERFACE IDS
export const ERC721_INTERFACE_ID = '0x80ac58cd';
export const ERC721_METADATA_INTERFACE_ID = '0x5b5e139f';
export const ERC721_ENUMERABLE_INTERFACE_ID = '0x780e9d63';
export const ERC1155_INTERFACE_ID = '0xd9b67a26';
export const ERC1155_METADATA_URI_INTERFACE_ID = '0x0e89341c';
export const ERC1155_TOKEN_RECEIVER_INTERFACE_ID = '0x4e2312e0';

// UNITS
export const GWEI = 'gwei';

// ASSET TYPES
export const ASSET_TYPES = {
  NATIVE: 'NATIVE',
  TOKEN: 'TOKEN',
  NFT: 'NFT',
  UNKNOWN: 'UNKNOWN',
};

// TICKER SYMBOLS
export const TESTNET_TICKER_SYMBOLS = {
  GOERLI: 'GoerliETH',
  SEPOLIA: 'SepoliaETH',
  LINEA_GOERLI: 'LineaETH',
};

/**
 * Map of all build-in Infura networks to their network, ticker and chain IDs.
 */
export const BUILT_IN_NETWORKS = {
  [NetworkType.goerli]: {
    chainId: ChainId.goerli,
    ticker: NetworksTicker.goerli,
    rpcPrefs: {
      blockExplorerUrl: `https://${NetworkType.goerli}.etherscan.io`,
    },
  },
  [NetworkType.sepolia]: {
    chainId: ChainId.sepolia,
    ticker: NetworksTicker.sepolia,
    rpcPrefs: {
      blockExplorerUrl: `https://${NetworkType.sepolia}.etherscan.io`,
    },
  },
  [NetworkType.mainnet]: {
    chainId: ChainId.mainnet,
    ticker: NetworksTicker.mainnet,
    rpcPrefs: {
      blockExplorerUrl: 'https://etherscan.io',
    },
  },
  [NetworkType['linea-goerli']]: {
    chainId: ChainId['linea-goerli'],
    ticker: NetworksTicker['linea-goerli'],
    rpcPrefs: {
      blockExplorerUrl: 'https://explorer.goerli.linea.build',
    },
  },
  [NetworkType['linea-mainnet']]: {
    chainId: ChainId['linea-mainnet'],
    ticker: NetworksTicker['linea-mainnet'],
    rpcPrefs: {
      blockExplorerUrl: 'https://lineascan.build',
    },
  },
  [NetworkType.rpc]: {
    chainId: undefined,
    blockExplorerUrl: undefined,
    rpcPrefs: undefined,
  },
} as const;

// APIs
export const OPENSEA_PROXY_URL =
  'https://proxy.metafi.codefi.network/opensea/v1/api/v1';
export const OPENSEA_API_URL = 'https://api.opensea.io/api/v1';
export const OPENSEA_TEST_API_URL = 'https://testnets-api.opensea.io/api/v1';

// Default origin for controllers
export const ORIGIN_METAMASK = 'metamask';

/**
 * Approval request types for various operations.
 * These types are used by different controllers to create and manage
 * approval requests consistently.
 */
export enum ApprovalType {
  AddEthereumChain = 'wallet_addEthereumChain',
  ConnectAccounts = 'connect_accounts',
  EthDecrypt = 'eth_decrypt',
  EthGetEncryptionPublicKey = 'eth_getEncryptionPublicKey',
  EthSign = 'eth_sign',
  EthSignTypedData = 'eth_signTypedData',
  PersonalSign = 'personal_sign',
  ResultError = 'result_error',
  ResultSuccess = 'result_success',
  SnapDialogAlert = 'snap_dialog:alert',
  SnapDialogConfirmation = 'snap_dialog:confirmation',
  SnapDialogPrompt = 'snap_dialog:prompt',
  SwitchEthereumChain = 'wallet_switchEthereumChain',
  Transaction = 'transaction',
  Unlock = 'unlock',
  WalletConnect = 'wallet_connect',
  WalletRequestPermissions = 'wallet_requestPermissions',
  WatchAsset = 'wallet_watchAsset',
}

export const CHAIN_ID_TO_ETHERS_NETWORK_NAME_MAP: Record<
  ChainId,
  BuiltInNetworkName
> = {
  [ChainId.goerli]: BuiltInNetworkName.Goerli,
  [ChainId.sepolia]: BuiltInNetworkName.Sepolia,
  [ChainId.mainnet]: BuiltInNetworkName.Mainnet,
  [ChainId['linea-goerli']]: BuiltInNetworkName.LineaGoerli,
  [ChainId['linea-mainnet']]: BuiltInNetworkName.LineaMainnet,
  [ChainId.aurora]: BuiltInNetworkName.Aurora,
};

/**
 * Compiled from https://chainid.network/chains.json
 * A mapping of network ID to chain IDs for all chains
 * that have mismatched network ID and chain ID. Most
 * notably ETC with network ID of 1 but chain ID of 61
 */
export const NON_MATCHING_NETWORK_ID_TO_CHAIN_IDS: Record<string, Hex[]> = {
  '0': [
    '0x18', // toHex(24)
    '0xd3', // toHex(211)
    '0x3d4', // toHex(980)
    '0x3dd', // toHex(989)
  ],
  '1': [
    '0x2', // toHex(2)
    '0x3d', // toHex(61)
    '0x65', // toHex(101)
    '0x8a', // toHex(138)
    '0x106', // toHex(262)
    '0x334', // toHex(820)
    '0x740', // toHex(1856)
    '0x76a', // toHex(1898)
    '0x797e', // toHex(31102)
    '0xa869', // toHex(43113)
    '0x116e1', // toHex(71393)
    '0x192b2', // toHex(103090)
    '0x3113a', // toHex(201018)
    '0x31146', // toHex(201030)
    '0x335f9', // toHex(210425)
    '0x66b3a', // toHex(420666)
    '0x219e2d', // toHex(2203181)
    '0x21a9b4', // toHex(2206132)
    '0x133edce', // toHex(20180430)
  ],
  '2': [
    '0x9', // toHex(9)
    '0x3e', // toHex(62)
    '0x335', // toHex(821)
  ],
  '7': [
    '0x3f', // toHex(63)
  ],
  '10': [
    '0x96f', // toHex(2415)
  ],
  '21': [
    '0x85a', // toHex(2138)
  ],
  '79': [
    '0x50f9', // toHex(20729)
  ],
  '1000': [
    '0x1f4', // toHex(500)
  ],
  '1001': [
    '0x1f5', // toHex(501)
  ],
  '1024': [
    '0x208', // toHex(520)
  ],
  '1230': [
    '0x3012', // toHex(12306)
  ],
  '2048': [
    '0x4b2', // toHex(1202)
  ],
  '2221': [
    '0xde', // toHex(222)
  ],
  '3344': [
    '0x10804', // toHex(67588)
  ],
  '37129': [
    '0x5fa4', // toHex(24484)
  ],
  '37480': [
    '0x609e', // toHex(24734)
  ],
  '48501': [
    '0x14dc9', // toHex(85449)
  ],
  '103090': [
    '0x66a44', // toHex(420420)
  ],
  '11235813': [
    '0x654', // toHex(1620)
  ],
};
