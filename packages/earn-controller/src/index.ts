export type {
  PooledStakingState,
  LendingState,
  TronStakingState,
  LendingMarketWithPosition,
  LendingPositionWithMarket,
  LendingPositionWithMarketReference,
  EarnControllerState,
  EarnControllerGetStateAction,
  EarnControllerStateChangeEvent,
  EarnControllerActions,
  EarnControllerEvents,
  EarnControllerMessenger,
} from './EarnController.js';

export {
  controllerName,
  getDefaultEarnControllerState,
  DEFAULT_TRON_STAKING_STATE,
  EarnController,
} from './EarnController.js';

export type {
  EarnControllerRefreshPooledStakesAction,
  EarnControllerRefreshEarnEligibilityAction,
  EarnControllerRefreshPooledStakingVaultMetadataAction,
  EarnControllerRefreshPooledStakingVaultDailyApysAction,
  EarnControllerRefreshPooledStakingVaultApyAveragesAction,
  EarnControllerRefreshPooledStakingDataAction,
  EarnControllerRefreshLendingMarketsAction,
  EarnControllerRefreshLendingPositionsAction,
  EarnControllerRefreshLendingDataAction,
  EarnControllerRefreshTronStakingApyAction,
  EarnControllerGetTronStakingApyAction,
  EarnControllerGetLendingPositionHistoryAction,
  EarnControllerGetLendingMarketDailyApysAndAveragesAction,
  EarnControllerExecuteLendingDepositAction,
  EarnControllerExecuteLendingWithdrawAction,
  EarnControllerExecuteLendingTokenApproveAction,
  EarnControllerGetLendingTokenAllowanceAction,
  EarnControllerGetLendingTokenMaxWithdrawAction,
  EarnControllerGetLendingTokenMaxDepositAction,
} from './EarnController-method-action-types.js';

export {
  selectLendingMarkets,
  selectLendingPositions,
  selectLendingMarketsWithPosition,
  selectLendingPositionsByProtocol,
  selectLendingMarketByProtocolAndTokenAddress,
  selectLendingMarketForProtocolAndTokenAddress,
  selectLendingPositionsByChainId,
  selectLendingMarketsByChainId,
  selectLendingMarketsByProtocolAndId,
  selectLendingMarketForProtocolAndId,
  selectLendingPositionsWithMarket,
  selectLendingMarketsForChainId,
  selectIsLendingEligible,
  selectLendingPositionsByProtocolChainIdMarketId,
  selectLendingMarketsByTokenAddress,
  selectLendingMarketsByChainIdAndOutputTokenAddress,
  selectLendingMarketsByChainIdAndTokenAddress,
  selectTronStaking,
  selectTronStakingApy,
} from './selectors.js';

export {
  CHAIN_ID_TO_AAVE_POOL_CONTRACT,
  isSupportedLendingChain,
  isSupportedPooledStakingChain,
} from '@metamask/stake-sdk';
