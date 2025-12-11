export type {
  PooledStakingState,
  LendingState,
  NonEvmStakingState,
  NonEvmStakingChainState,
  LendingMarketWithPosition,
  LendingPositionWithMarket,
  LendingPositionWithMarketReference,
  EarnControllerState,
  EarnControllerGetStateAction,
  EarnControllerStateChangeEvent,
  EarnControllerActions,
  EarnControllerEvents,
  EarnControllerMessenger,
} from './EarnController';

export {
  controllerName,
  getDefaultEarnControllerState,
  DEFAULT_NON_EVM_STAKING_CHAIN_STATE,
  EarnController,
} from './EarnController';

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
  selectNonEvmStaking,
  selectNonEvmStakingForChainId,
  selectNonEvmStakingApyForChainId,
} from './selectors';

export {
  CHAIN_ID_TO_AAVE_POOL_CONTRACT,
  isSupportedLendingChain,
  isSupportedPooledStakingChain,
} from '@metamask/stake-sdk';
