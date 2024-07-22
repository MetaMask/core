// src/NotificationServicesController/constants/notification-schema.ts
var TRIGGER_TYPES = /* @__PURE__ */ ((TRIGGER_TYPES2) => {
  TRIGGER_TYPES2["FEATURES_ANNOUNCEMENT"] = "features_announcement";
  TRIGGER_TYPES2["METAMASK_SWAP_COMPLETED"] = "metamask_swap_completed";
  TRIGGER_TYPES2["ERC20_SENT"] = "erc20_sent";
  TRIGGER_TYPES2["ERC20_RECEIVED"] = "erc20_received";
  TRIGGER_TYPES2["ETH_SENT"] = "eth_sent";
  TRIGGER_TYPES2["ETH_RECEIVED"] = "eth_received";
  TRIGGER_TYPES2["ROCKETPOOL_STAKE_COMPLETED"] = "rocketpool_stake_completed";
  TRIGGER_TYPES2["ROCKETPOOL_UNSTAKE_COMPLETED"] = "rocketpool_unstake_completed";
  TRIGGER_TYPES2["LIDO_STAKE_COMPLETED"] = "lido_stake_completed";
  TRIGGER_TYPES2["LIDO_WITHDRAWAL_REQUESTED"] = "lido_withdrawal_requested";
  TRIGGER_TYPES2["LIDO_WITHDRAWAL_COMPLETED"] = "lido_withdrawal_completed";
  TRIGGER_TYPES2["LIDO_STAKE_READY_TO_BE_WITHDRAWN"] = "lido_stake_ready_to_be_withdrawn";
  TRIGGER_TYPES2["ERC721_SENT"] = "erc721_sent";
  TRIGGER_TYPES2["ERC721_RECEIVED"] = "erc721_received";
  TRIGGER_TYPES2["ERC1155_SENT"] = "erc1155_sent";
  TRIGGER_TYPES2["ERC1155_RECEIVED"] = "erc1155_received";
  return TRIGGER_TYPES2;
})(TRIGGER_TYPES || {});
var TRIGGER_TYPES_WALLET_SET = /* @__PURE__ */ new Set([
  "metamask_swap_completed" /* METAMASK_SWAP_COMPLETED */,
  "erc20_sent" /* ERC20_SENT */,
  "erc20_received" /* ERC20_RECEIVED */,
  "eth_sent" /* ETH_SENT */,
  "eth_received" /* ETH_RECEIVED */,
  "rocketpool_stake_completed" /* ROCKETPOOL_STAKE_COMPLETED */,
  "rocketpool_unstake_completed" /* ROCKETPOOL_UNSTAKE_COMPLETED */,
  "lido_stake_completed" /* LIDO_STAKE_COMPLETED */,
  "lido_withdrawal_requested" /* LIDO_WITHDRAWAL_REQUESTED */,
  "lido_withdrawal_completed" /* LIDO_WITHDRAWAL_COMPLETED */,
  "lido_stake_ready_to_be_withdrawn" /* LIDO_STAKE_READY_TO_BE_WITHDRAWN */,
  "erc721_sent" /* ERC721_SENT */,
  "erc721_received" /* ERC721_RECEIVED */,
  "erc1155_sent" /* ERC1155_SENT */,
  "erc1155_received" /* ERC1155_RECEIVED */
]);
var TRIGGER_TYPES_GROUPS = /* @__PURE__ */ ((TRIGGER_TYPES_GROUPS2) => {
  TRIGGER_TYPES_GROUPS2["RECEIVED"] = "received";
  TRIGGER_TYPES_GROUPS2["SENT"] = "sent";
  TRIGGER_TYPES_GROUPS2["DEFI"] = "defi";
  return TRIGGER_TYPES_GROUPS2;
})(TRIGGER_TYPES_GROUPS || {});
var NOTIFICATION_CHAINS_ID = {
  ETHEREUM: "1",
  OPTIMISM: "10",
  BSC: "56",
  POLYGON: "137",
  ARBITRUM: "42161",
  AVALANCHE: "43114",
  LINEA: "59144"
};
var NOTIFICATION_CHAINS = NOTIFICATION_CHAINS_ID;
var CHAIN_SYMBOLS = {
  [NOTIFICATION_CHAINS.ETHEREUM]: "ETH",
  [NOTIFICATION_CHAINS.OPTIMISM]: "ETH",
  [NOTIFICATION_CHAINS.BSC]: "BNB",
  [NOTIFICATION_CHAINS.POLYGON]: "MATIC",
  [NOTIFICATION_CHAINS.ARBITRUM]: "ETH",
  [NOTIFICATION_CHAINS.AVALANCHE]: "AVAX",
  [NOTIFICATION_CHAINS.LINEA]: "ETH"
};
var SUPPORTED_CHAINS = [
  NOTIFICATION_CHAINS.ETHEREUM,
  NOTIFICATION_CHAINS.OPTIMISM,
  NOTIFICATION_CHAINS.BSC,
  NOTIFICATION_CHAINS.POLYGON,
  NOTIFICATION_CHAINS.ARBITRUM,
  NOTIFICATION_CHAINS.AVALANCHE,
  NOTIFICATION_CHAINS.LINEA
];
var TRIGGERS = {
  ["metamask_swap_completed" /* METAMASK_SWAP_COMPLETED */]: {
    supported_chains: [
      NOTIFICATION_CHAINS.ETHEREUM,
      NOTIFICATION_CHAINS.OPTIMISM,
      NOTIFICATION_CHAINS.BSC,
      NOTIFICATION_CHAINS.POLYGON,
      NOTIFICATION_CHAINS.ARBITRUM,
      NOTIFICATION_CHAINS.AVALANCHE
    ]
  },
  ["erc20_sent" /* ERC20_SENT */]: {
    supported_chains: [
      NOTIFICATION_CHAINS.ETHEREUM,
      NOTIFICATION_CHAINS.OPTIMISM,
      NOTIFICATION_CHAINS.BSC,
      NOTIFICATION_CHAINS.POLYGON,
      NOTIFICATION_CHAINS.ARBITRUM,
      NOTIFICATION_CHAINS.AVALANCHE,
      NOTIFICATION_CHAINS.LINEA
    ]
  },
  ["erc20_received" /* ERC20_RECEIVED */]: {
    supported_chains: [
      NOTIFICATION_CHAINS.ETHEREUM,
      NOTIFICATION_CHAINS.OPTIMISM,
      NOTIFICATION_CHAINS.BSC,
      NOTIFICATION_CHAINS.POLYGON,
      NOTIFICATION_CHAINS.ARBITRUM,
      NOTIFICATION_CHAINS.AVALANCHE,
      NOTIFICATION_CHAINS.LINEA
    ]
  },
  ["erc721_sent" /* ERC721_SENT */]: {
    supported_chains: [
      NOTIFICATION_CHAINS.ETHEREUM,
      NOTIFICATION_CHAINS.POLYGON
    ]
  },
  ["erc721_received" /* ERC721_RECEIVED */]: {
    supported_chains: [
      NOTIFICATION_CHAINS.ETHEREUM,
      NOTIFICATION_CHAINS.POLYGON
    ]
  },
  ["erc1155_sent" /* ERC1155_SENT */]: {
    supported_chains: [
      NOTIFICATION_CHAINS.ETHEREUM,
      NOTIFICATION_CHAINS.POLYGON
    ]
  },
  ["erc1155_received" /* ERC1155_RECEIVED */]: {
    supported_chains: [
      NOTIFICATION_CHAINS.ETHEREUM,
      NOTIFICATION_CHAINS.POLYGON
    ]
  },
  ["eth_sent" /* ETH_SENT */]: {
    supported_chains: [
      NOTIFICATION_CHAINS.ETHEREUM,
      NOTIFICATION_CHAINS.OPTIMISM,
      NOTIFICATION_CHAINS.BSC,
      NOTIFICATION_CHAINS.POLYGON,
      NOTIFICATION_CHAINS.ARBITRUM,
      NOTIFICATION_CHAINS.AVALANCHE,
      NOTIFICATION_CHAINS.LINEA
    ]
  },
  ["eth_received" /* ETH_RECEIVED */]: {
    supported_chains: [
      NOTIFICATION_CHAINS.ETHEREUM,
      NOTIFICATION_CHAINS.OPTIMISM,
      NOTIFICATION_CHAINS.BSC,
      NOTIFICATION_CHAINS.POLYGON,
      NOTIFICATION_CHAINS.ARBITRUM,
      NOTIFICATION_CHAINS.AVALANCHE,
      NOTIFICATION_CHAINS.LINEA
    ]
  },
  ["rocketpool_stake_completed" /* ROCKETPOOL_STAKE_COMPLETED */]: {
    supported_chains: [NOTIFICATION_CHAINS.ETHEREUM]
  },
  ["rocketpool_unstake_completed" /* ROCKETPOOL_UNSTAKE_COMPLETED */]: {
    supported_chains: [NOTIFICATION_CHAINS.ETHEREUM]
  },
  ["lido_stake_completed" /* LIDO_STAKE_COMPLETED */]: {
    supported_chains: [NOTIFICATION_CHAINS.ETHEREUM]
  },
  ["lido_withdrawal_requested" /* LIDO_WITHDRAWAL_REQUESTED */]: {
    supported_chains: [NOTIFICATION_CHAINS.ETHEREUM]
  },
  ["lido_withdrawal_completed" /* LIDO_WITHDRAWAL_COMPLETED */]: {
    supported_chains: [NOTIFICATION_CHAINS.ETHEREUM]
  }
};

export {
  TRIGGER_TYPES,
  TRIGGER_TYPES_WALLET_SET,
  TRIGGER_TYPES_GROUPS,
  NOTIFICATION_CHAINS_ID,
  NOTIFICATION_CHAINS,
  CHAIN_SYMBOLS,
  SUPPORTED_CHAINS,
  TRIGGERS
};
//# sourceMappingURL=chunk-J4D2NH6Y.mjs.map