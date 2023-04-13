import { NetworkType, NetworksTicker, NetworksChainId } from './types';

export const RPC = 'rpc';
export const FALL_BACK_VS_CURRENCY = 'ETH';
export const IPFS_DEFAULT_GATEWAY_URL = 'https://cloudflare-ipfs.com/ipfs/';

// NETWORKS ID
export const GANACHE_CHAIN_ID = '1337';
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
};

/**
 * Map of all build-in Infura networks to their network, ticker and chain IDs.
 */
export const BUILT_IN_NETWORKS = {
  [NetworkType.goerli]: {
    chainId: NetworksChainId.goerli,
    ticker: NetworksTicker.goerli,
    rpcPrefs: {
      blockExplorerUrl: `https://${NetworkType.goerli}.etherscan.io`,
    },
  },
  [NetworkType.sepolia]: {
    chainId: NetworksChainId.sepolia,
    ticker: NetworksTicker.sepolia,
    rpcPrefs: {
      blockExplorerUrl: `https://${NetworkType.sepolia}.etherscan.io`,
    },
  },
  [NetworkType.mainnet]: {
    chainId: NetworksChainId.mainnet,
    ticker: NetworksTicker.mainnet,
    rpcPrefs: {
      blockExplorerUrl: 'https://etherscan.io',
    },
  },
  [NetworkType.localhost]: {
    chainId: NetworksChainId.localhost,
    blockExplorerUrl: undefined,
    rpcPrefs: undefined,
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

/**
 * Approval request types for various operations.
 * These types are used by different controllers to create and manage
 * approval requests consistently.
 */
export const APPROVAL_TYPES = {
  ADD_ETHEREUM_CHAIN: 'wallet_addEthereumChain',
  ETH_ACCOUNTS: 'eth_accounts',
  ETH_DECRYPT: 'eth_decrypt',
  ETH_GET_ENCRYPTION_PUBLIC_KEY: 'eth_getEncryptionPublicKey',
  ETH_REQUEST_ACCOUNTS: 'eth_requestAccounts',
  ETH_SIGN: 'eth_sign',
  ETH_SIGN_TYPED_DATA: 'eth_signTypedData',
  ETH_SIGN_TYPED_DATA_V3: 'eth_signTypedData_v3',
  ETH_SIGN_TYPED_DATA_V4: 'eth_signTypedData_v4',
  GET_PROVIDER_STATE: 'metamask_getProviderState',
  LOG_WEB3_SHIM_USAGE: 'metamask_logWeb3ShimUsage',
  PERSONAL_SIGN: 'personal_sign',
  SEND_METADATA: 'metamask_sendDomainMetadata',
  SWITCH_ETHEREUM_CHAIN: 'wallet_switchEthereumChain',
  WALLET_REQUEST_PERMISSIONS: 'wallet_requestPermissions',
  WATCH_ASSET: 'wallet_watchAsset',
  WATCH_ASSET_LEGACY: 'metamask_watchAsset',
  SNAP_DIALOG_ALERT: 'snap_dialog:alert',
  SNAP_DIALOG_CONFIRMATION: 'snap_dialog:confirmation',
  SNAP_DIALOG_PROMPT: 'snap_dialog:prompt',
  MMI_AUTHENTICATE: 'metamaskinstitutional_authenticate',
  MMI_REAUTHENTICATE: 'metamaskinstitutional_reauthenticate',
  MMI_REFRESH_TOKEN: 'metamaskinstitutional_refresh_token',
  MMI_SUPPORTED: 'metamaskinstitutional_supported',
  MMI_PORTFOLIO: 'metamaskinstitutional_portfolio',
  MMI_OPEN_SWAPS: 'metamaskinstitutional_open_swaps',
  MMI_CHECK_IF_TOKEN_IS_PRESENT: 'metamaskinstitutional_checkIfTokenIsPresent',
  MMI_SET_ACCOUNT_AND_NETWORK: 'metamaskinstitutional_setAccountAndNetwork',
  MMI_OPEN_ADD_HARDWARE_WALLET: 'metamaskinstitutional_openAddHardwareWallet',
} as const;
