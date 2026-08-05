// Using SCREAMING_SNAKE_CASE for enum name and members to mirror snake_case API string values for readability
/* eslint-disable @typescript-eslint/naming-convention */
export enum TRIGGER_TYPES {
  FEATURES_ANNOUNCEMENT = 'features_announcement',
  METAMASK_SWAP_COMPLETED = 'metamask_swap_completed',
  ERC20_SENT = 'erc20_sent',
  ERC20_RECEIVED = 'erc20_received',
  ETH_SENT = 'eth_sent',
  ETH_RECEIVED = 'eth_received',
  ROCKETPOOL_STAKE_COMPLETED = 'rocketpool_stake_completed',
  ROCKETPOOL_UNSTAKE_COMPLETED = 'rocketpool_unstake_completed',
  LIDO_STAKE_COMPLETED = 'lido_stake_completed',
  LIDO_WITHDRAWAL_REQUESTED = 'lido_withdrawal_requested',
  LIDO_WITHDRAWAL_COMPLETED = 'lido_withdrawal_completed',
  LIDO_STAKE_READY_TO_BE_WITHDRAWN = 'lido_stake_ready_to_be_withdrawn',
  ERC721_SENT = 'erc721_sent',
  ERC721_RECEIVED = 'erc721_received',
  ERC1155_SENT = 'erc1155_sent',
  ERC1155_RECEIVED = 'erc1155_received',
  SNAP = 'snap',
  PLATFORM = 'platform',
}
/* eslint-enable @typescript-eslint/naming-convention */

export const NOTIFICATION_API_TRIGGER_TYPES_SET: Set<string> = new Set([
  TRIGGER_TYPES.METAMASK_SWAP_COMPLETED,
  TRIGGER_TYPES.ERC20_SENT,
  TRIGGER_TYPES.ERC20_RECEIVED,
  TRIGGER_TYPES.ETH_SENT,
  TRIGGER_TYPES.ETH_RECEIVED,
  TRIGGER_TYPES.ROCKETPOOL_STAKE_COMPLETED,
  TRIGGER_TYPES.ROCKETPOOL_UNSTAKE_COMPLETED,
  TRIGGER_TYPES.LIDO_STAKE_COMPLETED,
  TRIGGER_TYPES.LIDO_WITHDRAWAL_REQUESTED,
  TRIGGER_TYPES.LIDO_WITHDRAWAL_COMPLETED,
  TRIGGER_TYPES.LIDO_STAKE_READY_TO_BE_WITHDRAWN,
  TRIGGER_TYPES.ERC721_SENT,
  TRIGGER_TYPES.ERC721_RECEIVED,
  TRIGGER_TYPES.ERC1155_SENT,
  TRIGGER_TYPES.ERC1155_RECEIVED,
  TRIGGER_TYPES.PLATFORM,
]);
