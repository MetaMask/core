import {
  ChainId,
  NetworkType
} from "./chunk-SUZYJ4RW.mjs";

// src/constants.ts
var RPC = "rpc";
var FALL_BACK_VS_CURRENCY = "ETH";
var IPFS_DEFAULT_GATEWAY_URL = "https://cloudflare-ipfs.com/ipfs/";
var GANACHE_CHAIN_ID = "0x539";
var MAX_SAFE_CHAIN_ID = 4503599627370476;
var ERC721 = "ERC721";
var ERC1155 = "ERC1155";
var ERC20 = "ERC20";
var ERC721_INTERFACE_ID = "0x80ac58cd";
var ERC721_METADATA_INTERFACE_ID = "0x5b5e139f";
var ERC721_ENUMERABLE_INTERFACE_ID = "0x780e9d63";
var ERC1155_INTERFACE_ID = "0xd9b67a26";
var ERC1155_METADATA_URI_INTERFACE_ID = "0x0e89341c";
var ERC1155_TOKEN_RECEIVER_INTERFACE_ID = "0x4e2312e0";
var GWEI = "gwei";
var ASSET_TYPES = {
  NATIVE: "NATIVE",
  TOKEN: "TOKEN",
  NFT: "NFT",
  UNKNOWN: "UNKNOWN"
};
var TESTNET_TICKER_SYMBOLS = {
  GOERLI: "GoerliETH",
  SEPOLIA: "SepoliaETH",
  LINEA_GOERLI: "LineaETH",
  LINEA_SEPOLIA: "LineaETH"
};
var BUILT_IN_NETWORKS = {
  [NetworkType.goerli]: {
    chainId: ChainId.goerli,
    ticker: "GoerliETH" /* goerli */,
    rpcPrefs: {
      blockExplorerUrl: `https://${NetworkType.goerli}.etherscan.io`
    }
  },
  [NetworkType.sepolia]: {
    chainId: ChainId.sepolia,
    ticker: "SepoliaETH" /* sepolia */,
    rpcPrefs: {
      blockExplorerUrl: `https://${NetworkType.sepolia}.etherscan.io`
    }
  },
  [NetworkType.mainnet]: {
    chainId: ChainId.mainnet,
    ticker: "ETH" /* mainnet */,
    rpcPrefs: {
      blockExplorerUrl: "https://etherscan.io"
    }
  },
  [NetworkType["linea-goerli"]]: {
    chainId: ChainId["linea-goerli"],
    ticker: "LineaETH" /* linea-goerli */,
    rpcPrefs: {
      blockExplorerUrl: "https://goerli.lineascan.build"
    }
  },
  [NetworkType["linea-sepolia"]]: {
    chainId: ChainId["linea-sepolia"],
    ticker: "LineaETH" /* linea-sepolia */,
    rpcPrefs: {
      blockExplorerUrl: "https://sepolia.lineascan.build"
    }
  },
  [NetworkType["linea-mainnet"]]: {
    chainId: ChainId["linea-mainnet"],
    ticker: "ETH" /* linea-mainnet */,
    rpcPrefs: {
      blockExplorerUrl: "https://lineascan.build"
    }
  },
  [NetworkType.rpc]: {
    chainId: void 0,
    blockExplorerUrl: void 0,
    ticker: void 0,
    rpcPrefs: void 0
  }
};
var OPENSEA_PROXY_URL = "https://proxy.api.cx.metamask.io/opensea/v1/api/v2";
var NFT_API_BASE_URL = "https://nft.api.cx.metamask.io";
var NFT_API_VERSION = "1";
var NFT_API_TIMEOUT = 15e3;
var ORIGIN_METAMASK = "metamask";
var ApprovalType = /* @__PURE__ */ ((ApprovalType2) => {
  ApprovalType2["AddEthereumChain"] = "wallet_addEthereumChain";
  ApprovalType2["ConnectAccounts"] = "connect_accounts";
  ApprovalType2["EthDecrypt"] = "eth_decrypt";
  ApprovalType2["EthGetEncryptionPublicKey"] = "eth_getEncryptionPublicKey";
  ApprovalType2["EthSignTypedData"] = "eth_signTypedData";
  ApprovalType2["PersonalSign"] = "personal_sign";
  ApprovalType2["ResultError"] = "result_error";
  ApprovalType2["ResultSuccess"] = "result_success";
  ApprovalType2["SnapDialogAlert"] = "snap_dialog:alert";
  ApprovalType2["SnapDialogConfirmation"] = "snap_dialog:confirmation";
  ApprovalType2["SnapDialogPrompt"] = "snap_dialog:prompt";
  ApprovalType2["SwitchEthereumChain"] = "wallet_switchEthereumChain";
  ApprovalType2["Transaction"] = "transaction";
  ApprovalType2["Unlock"] = "unlock";
  ApprovalType2["WalletConnect"] = "wallet_connect";
  ApprovalType2["WalletRequestPermissions"] = "wallet_requestPermissions";
  ApprovalType2["WatchAsset"] = "wallet_watchAsset";
  return ApprovalType2;
})(ApprovalType || {});
var CHAIN_ID_TO_ETHERS_NETWORK_NAME_MAP = {
  [ChainId.goerli]: "goerli" /* Goerli */,
  [ChainId.sepolia]: "sepolia" /* Sepolia */,
  [ChainId.mainnet]: "mainnet" /* Mainnet */,
  [ChainId["linea-goerli"]]: "linea-goerli" /* LineaGoerli */,
  [ChainId["linea-sepolia"]]: "linea-sepolia" /* LineaSepolia */,
  [ChainId["linea-mainnet"]]: "linea-mainnet" /* LineaMainnet */,
  [ChainId.aurora]: "aurora" /* Aurora */
};

export {
  RPC,
  FALL_BACK_VS_CURRENCY,
  IPFS_DEFAULT_GATEWAY_URL,
  GANACHE_CHAIN_ID,
  MAX_SAFE_CHAIN_ID,
  ERC721,
  ERC1155,
  ERC20,
  ERC721_INTERFACE_ID,
  ERC721_METADATA_INTERFACE_ID,
  ERC721_ENUMERABLE_INTERFACE_ID,
  ERC1155_INTERFACE_ID,
  ERC1155_METADATA_URI_INTERFACE_ID,
  ERC1155_TOKEN_RECEIVER_INTERFACE_ID,
  GWEI,
  ASSET_TYPES,
  TESTNET_TICKER_SYMBOLS,
  BUILT_IN_NETWORKS,
  OPENSEA_PROXY_URL,
  NFT_API_BASE_URL,
  NFT_API_VERSION,
  NFT_API_TIMEOUT,
  ORIGIN_METAMASK,
  ApprovalType,
  CHAIN_ID_TO_ETHERS_NETWORK_NAME_MAP
};
//# sourceMappingURL=chunk-6RUA2HGN.mjs.map