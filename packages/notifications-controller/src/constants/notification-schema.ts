export enum TriggerType {
  FeaturesAnnouncement = 'features_announcement',
  MetamaskSwapCompleted = 'metamask_swap_completed',
  Erc20Sent = 'erc20_sent',
  Erc20Received = 'erc20_received',
  EthSent = 'eth_sent',
  EthReceived = 'eth_received',
  RocketpoolStakeCompleted = 'rocketpool_stake_completed',
  RocketpoolUnstakeCompleted = 'rocketpool_unstake_completed',
  LidoStakeCompleted = 'lido_stake_completed',
  LidoWithdrawalRequested = 'lido_withdrawal_requested',
  LidoWithdrawalCompleted = 'lido_withdrawal_completed',
  LidoStakeReadyToBeWithdrawn = 'lido_stake_ready_to_be_withdrawn',
  Erc721Sent = 'erc721_sent',
  Erc721Received = 'erc721_received',
  Erc1155Sent = 'erc1155_sent',
  Erc1155Received = 'erc1155_received',
}

export enum TriggerTypeGroups {
  received = 'received',
  sent = 'sent',
  defi = 'defi',
}

export const TRIGGER_TYPES_WALLET_SET: Set<string> = new Set([
  TriggerType.MetamaskSwapCompleted,
  TriggerType.Erc20Sent,
  TriggerType.Erc20Received,
  TriggerType.EthSent,
  TriggerType.EthReceived,
  TriggerType.RocketpoolStakeCompleted,
  TriggerType.RocketpoolUnstakeCompleted,
  TriggerType.LidoStakeCompleted,
  TriggerType.LidoWithdrawalRequested,
  TriggerType.LidoWithdrawalCompleted,
  TriggerType.LidoStakeReadyToBeWithdrawn,
  TriggerType.Erc721Sent,
  TriggerType.Erc721Received,
  TriggerType.Erc1155Sent,
  TriggerType.Erc1155Received,
]) satisfies Set<Exclude<TriggerType, TriggerType.FeaturesAnnouncement>>;

export const NOTIFICATION_CHAINS = {
  ETHEREUM: '1',
  OPTIMISM: '10',
  BSC: '56',
  POLYGON: '137',
  ARBITRUM: '42161',
  AVALANCHE: '43114',
  LINEA: '59144',
} as const;

export const CHAIN_SYMBOLS = {
  [NOTIFICATION_CHAINS.ETHEREUM]: 'ETH',
  [NOTIFICATION_CHAINS.OPTIMISM]: 'ETH',
  [NOTIFICATION_CHAINS.BSC]: 'BNB',
  [NOTIFICATION_CHAINS.POLYGON]: 'MATIC',
  [NOTIFICATION_CHAINS.ARBITRUM]: 'ETH',
  [NOTIFICATION_CHAINS.AVALANCHE]: 'AVAX',
  [NOTIFICATION_CHAINS.LINEA]: 'ETH',
} as const;

export const SUPPORTED_CHAINS = [
  NOTIFICATION_CHAINS.ETHEREUM,
  NOTIFICATION_CHAINS.OPTIMISM,
  NOTIFICATION_CHAINS.BSC,
  NOTIFICATION_CHAINS.POLYGON,
  NOTIFICATION_CHAINS.ARBITRUM,
  NOTIFICATION_CHAINS.AVALANCHE,
  NOTIFICATION_CHAINS.LINEA,
] as const;

export type Trigger = {
  supported_chains: (typeof SUPPORTED_CHAINS)[number][];
};

export const TRIGGERS: Partial<Record<TriggerType, Trigger>> = {
  [TriggerType.MetamaskSwapCompleted]: {
    supported_chains: [
      NOTIFICATION_CHAINS.ETHEREUM,
      NOTIFICATION_CHAINS.OPTIMISM,
      NOTIFICATION_CHAINS.BSC,
      NOTIFICATION_CHAINS.POLYGON,
      NOTIFICATION_CHAINS.ARBITRUM,
      NOTIFICATION_CHAINS.AVALANCHE,
    ],
  },
  [TriggerType.Erc20Sent]: {
    supported_chains: [
      NOTIFICATION_CHAINS.ETHEREUM,
      NOTIFICATION_CHAINS.OPTIMISM,
      NOTIFICATION_CHAINS.BSC,
      NOTIFICATION_CHAINS.POLYGON,
      NOTIFICATION_CHAINS.ARBITRUM,
      NOTIFICATION_CHAINS.AVALANCHE,
      NOTIFICATION_CHAINS.LINEA,
    ],
  },
  [TriggerType.Erc20Received]: {
    supported_chains: [
      NOTIFICATION_CHAINS.ETHEREUM,
      NOTIFICATION_CHAINS.OPTIMISM,
      NOTIFICATION_CHAINS.BSC,
      NOTIFICATION_CHAINS.POLYGON,
      NOTIFICATION_CHAINS.ARBITRUM,
      NOTIFICATION_CHAINS.AVALANCHE,
      NOTIFICATION_CHAINS.LINEA,
    ],
  },
  [TriggerType.Erc721Sent]: {
    supported_chains: [
      NOTIFICATION_CHAINS.ETHEREUM,
      NOTIFICATION_CHAINS.POLYGON,
    ],
  },
  [TriggerType.Erc721Received]: {
    supported_chains: [
      NOTIFICATION_CHAINS.ETHEREUM,
      NOTIFICATION_CHAINS.POLYGON,
    ],
  },
  [TriggerType.Erc1155Sent]: {
    supported_chains: [
      NOTIFICATION_CHAINS.ETHEREUM,
      NOTIFICATION_CHAINS.POLYGON,
    ],
  },
  [TriggerType.Erc1155Received]: {
    supported_chains: [
      NOTIFICATION_CHAINS.ETHEREUM,
      NOTIFICATION_CHAINS.POLYGON,
    ],
  },
  [TriggerType.EthSent]: {
    supported_chains: [
      NOTIFICATION_CHAINS.ETHEREUM,
      NOTIFICATION_CHAINS.OPTIMISM,
      NOTIFICATION_CHAINS.BSC,
      NOTIFICATION_CHAINS.POLYGON,
      NOTIFICATION_CHAINS.ARBITRUM,
      NOTIFICATION_CHAINS.AVALANCHE,
      NOTIFICATION_CHAINS.LINEA,
    ],
  },
  [TriggerType.EthReceived]: {
    supported_chains: [
      NOTIFICATION_CHAINS.ETHEREUM,
      NOTIFICATION_CHAINS.OPTIMISM,
      NOTIFICATION_CHAINS.BSC,
      NOTIFICATION_CHAINS.POLYGON,
      NOTIFICATION_CHAINS.ARBITRUM,
      NOTIFICATION_CHAINS.AVALANCHE,
      NOTIFICATION_CHAINS.LINEA,
    ],
  },
  [TriggerType.RocketpoolStakeCompleted]: {
    supported_chains: [NOTIFICATION_CHAINS.ETHEREUM],
  },
  [TriggerType.RocketpoolUnstakeCompleted]: {
    supported_chains: [NOTIFICATION_CHAINS.ETHEREUM],
  },
  [TriggerType.LidoStakeCompleted]: {
    supported_chains: [NOTIFICATION_CHAINS.ETHEREUM],
  },
  [TriggerType.LidoWithdrawalRequested]: {
    supported_chains: [NOTIFICATION_CHAINS.ETHEREUM],
  },
  [TriggerType.LidoWithdrawalCompleted]: {
    supported_chains: [NOTIFICATION_CHAINS.ETHEREUM],
  },
} as const satisfies Partial<Record<TriggerType, Trigger>>;
