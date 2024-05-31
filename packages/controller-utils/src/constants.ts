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
  LINEA_SEPOLIA: 'LineaETH',
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
      blockExplorerUrl: 'https://goerli.lineascan.build',
    },
  },
  [NetworkType['linea-sepolia']]: {
    chainId: ChainId['linea-sepolia'],
    ticker: NetworksTicker['linea-sepolia'],
    rpcPrefs: {
      blockExplorerUrl: 'https://sepolia.lineascan.build',
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
    ticker: undefined,
    rpcPrefs: undefined,
  },
} as const;

// APIs
export const OPENSEA_PROXY_URL =
  'https://proxy.api.cx.metamask.io/opensea/v1/api/v2';

export const NFT_API_BASE_URL = 'https://nft.api.cx.metamask.io';

export const NFT_API_VERSION = '1';

export const NFT_API_TIMEOUT = 15000;

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
  [ChainId['linea-sepolia']]: BuiltInNetworkName.LineaSepolia,
  [ChainId['linea-mainnet']]: BuiltInNetworkName.LineaMainnet,
  [ChainId.aurora]: BuiltInNetworkName.Aurora,
};
