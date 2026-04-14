/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { EarnController } from './EarnController';

/**
 * Refreshes the pooled stakes data for the current account.
 * Fetches updated stake information including lifetime rewards, assets, and exit requests
 * from the staking API service and updates the state.
 *
 * @param options - Optional arguments
 * @param [options.resetCache] - Control whether the BE cache should be invalidated (optional).
 * @param [options.address] - The address to refresh pooled stakes for (optional).
 * @param [options.chainId] - The chain id to refresh pooled stakes for (optional).
 * @returns A promise that resolves when the stakes data has been updated
 */
export type EarnControllerRefreshPooledStakesAction = {
  type: `EarnController:refreshPooledStakes`;
  handler: EarnController['refreshPooledStakes'];
};

/**
 * Refreshes the earn eligibility status for the current account.
 * Updates the eligibility status in the controller state based on the location and address blocklist for compliance.
 *
 * Note: Pooled-staking and Lending used the same result since there isn't a need to split these up right now.
 *
 * @param options - Optional arguments
 * @param [options.address] - Address to refresh earn eligibility for (optional).
 * @returns A promise that resolves when the eligibility status has been updated
 */
export type EarnControllerRefreshEarnEligibilityAction = {
  type: `EarnController:refreshEarnEligibility`;
  handler: EarnController['refreshEarnEligibility'];
};

/**
 * Refreshes pooled staking vault metadata for the current chain.
 * Updates the vault metadata in the controller state including APY, capacity,
 * fee percentage, total assets, and vault address.
 *
 * @param [chainId] - The chain id to refresh pooled staking vault metadata for (optional).
 * @returns A promise that resolves when the vault metadata has been updated
 */
export type EarnControllerRefreshPooledStakingVaultMetadataAction = {
  type: `EarnController:refreshPooledStakingVaultMetadata`;
  handler: EarnController['refreshPooledStakingVaultMetadata'];
};

/**
 * Refreshes pooled staking vault daily apys for the current chain.
 * Updates the pooled staking vault daily apys controller state.
 *
 * @param [options] - The options for refreshing pooled staking vault daily apys.
 * @param [options.chainId] - The chain id to refresh pooled staking vault daily apys for (defaults to Ethereum).
 * @param [options.days] - The number of days to fetch pooled staking vault daily apys for (defaults to 365).
 * @param [options.order] - The order in which to fetch pooled staking vault daily apys. Descending order fetches the latest N days (latest working backwards). Ascending order fetches the oldest N days (oldest working forwards) (defaults to 'desc').
 * @returns A promise that resolves when the pooled staking vault daily apys have been updated.
 */
export type EarnControllerRefreshPooledStakingVaultDailyApysAction = {
  type: `EarnController:refreshPooledStakingVaultDailyApys`;
  handler: EarnController['refreshPooledStakingVaultDailyApys'];
};

/**
 * Refreshes pooled staking vault apy averages for the current chain.
 * Updates the pooled staking vault apy averages controller state.
 *
 * @param [chainId] - The chain id to refresh pooled staking vault apy averages for (optional).
 * @returns A promise that resolves when the pooled staking vault apy averages have been updated.
 */
export type EarnControllerRefreshPooledStakingVaultApyAveragesAction = {
  type: `EarnController:refreshPooledStakingVaultApyAverages`;
  handler: EarnController['refreshPooledStakingVaultApyAverages'];
};

/**
 * Refreshes all pooled staking related data including stakes, eligibility, and vault data.
 * This method allows partial success, meaning some data may update while other requests fail.
 * All errors are collected and thrown as a single error message.
 *
 * @param options - Optional arguments
 * @param [options.resetCache] - Control whether the BE cache should be invalidated (optional).
 * @param [options.address] - The address to refresh pooled stakes for (optional).
 * @returns A promise that resolves when all possible data has been updated
 * @throws {Error} If any of the refresh operations fail, with concatenated error messages
 */
export type EarnControllerRefreshPooledStakingDataAction = {
  type: `EarnController:refreshPooledStakingData`;
  handler: EarnController['refreshPooledStakingData'];
};

/**
 * Refreshes the lending markets data for all chains.
 * Updates the lending markets in the controller state.
 *
 * @returns A promise that resolves when the lending markets have been updated
 */
export type EarnControllerRefreshLendingMarketsAction = {
  type: `EarnController:refreshLendingMarkets`;
  handler: EarnController['refreshLendingMarkets'];
};

/**
 * Refreshes the lending positions for the current account.
 * Updates the lending positions in the controller state.
 *
 * @param options - Optional arguments
 * @param [options.address] - The address to refresh lending positions for (optional).
 * @returns A promise that resolves when the lending positions have been updated
 */
export type EarnControllerRefreshLendingPositionsAction = {
  type: `EarnController:refreshLendingPositions`;
  handler: EarnController['refreshLendingPositions'];
};

/**
 * Refreshes all lending related data including markets, positions, and eligibility.
 * This method allows partial success, meaning some data may update while other requests fail.
 * All errors are collected and thrown as a single error message.
 *
 * @returns A promise that resolves when all possible data has been updated
 * @throws {Error} If any of the refresh operations fail, with concatenated error messages
 */
export type EarnControllerRefreshLendingDataAction = {
  type: `EarnController:refreshLendingData`;
  handler: EarnController['refreshLendingData'];
};

/**
 * Refreshes the APY for TRON staking.
 * The consumer provides a fetcher function that returns the APY for TRON.
 *
 * @param apyFetcher - An async function that fetches and returns the APY as a decimal string.
 * @returns A promise that resolves when the APY has been updated.
 */
export type EarnControllerRefreshTronStakingApyAction = {
  type: `EarnController:refreshTronStakingApy`;
  handler: EarnController['refreshTronStakingApy'];
};

/**
 * Gets the TRON staking APY.
 *
 * @returns The APY for TRON staking, or undefined if not available.
 */
export type EarnControllerGetTronStakingApyAction = {
  type: `EarnController:getTronStakingApy`;
  handler: EarnController['getTronStakingApy'];
};

/**
 * Gets the lending position history for the current account.
 *
 * @param options - Optional arguments
 * @param [options.address] - The address to get lending position history for (optional).
 * @param options.chainId - The chain id to get lending position history for.
 * @param [options.positionId] - The position id to get lending position history for.
 * @param [options.marketId] - The market id to get lending position history for.
 * @param [options.marketAddress] - The market address to get lending position history for.
 * @param [options.protocol] - The protocol to get lending position history for.
 * @param [options.days] - The number of days to get lending position history for (optional).
 * @returns A promise that resolves when the lending position history has been updated
 */
export type EarnControllerGetLendingPositionHistoryAction = {
  type: `EarnController:getLendingPositionHistory`;
  handler: EarnController['getLendingPositionHistory'];
};

/**
 * Gets the lending market daily apys and averages for the current chain.
 *
 * @param options - Optional arguments
 * @param options.chainId - The chain id to get lending market daily apys and averages for.
 * @param [options.protocol] - The protocol to get lending market daily apys and averages for.
 * @param [options.marketId] - The market id to get lending market daily apys and averages for.
 * @param [options.days] - The number of days to get lending market daily apys and averages for (optional).
 * @returns A promise that resolves when the lending market daily apys and averages have been updated
 */
export type EarnControllerGetLendingMarketDailyApysAndAveragesAction = {
  type: `EarnController:getLendingMarketDailyApysAndAverages`;
  handler: EarnController['getLendingMarketDailyApysAndAverages'];
};

/**
 * Executes a lending deposit transaction.
 *
 * @param options - The options for the lending deposit transaction.
 * @param options.amount - The amount to deposit.
 * @param options.chainId - The chain ID for the lending deposit transaction.
 * @param options.protocol - The protocol of the lending market.
 * @param options.underlyingTokenAddress - The address of the underlying token.
 * @param options.gasOptions - The gas options for the transaction.
 * @param options.gasOptions.gasLimit - The gas limit for the transaction.
 * @param options.gasOptions.gasBufferPct - The gas buffer percentage for the transaction.
 * @param options.txOptions - The transaction options for the transaction.
 * @returns A promise that resolves to the transaction hash.
 */
export type EarnControllerExecuteLendingDepositAction = {
  type: `EarnController:executeLendingDeposit`;
  handler: EarnController['executeLendingDeposit'];
};

/**
 * Executes a lending withdraw transaction.
 *
 * @param options - The options for the lending withdraw transaction.
 * @param options.amount - The amount to withdraw.
 * @param options.chainId - The chain ID for the lending withdraw transaction.
 * @param options.protocol - The protocol of the lending market.
 * @param options.underlyingTokenAddress - The address of the underlying token.
 * @param options.gasOptions - The gas options for the transaction.
 * @param options.gasOptions.gasLimit - The gas limit for the transaction.
 * @param options.gasOptions.gasBufferPct - The gas buffer percentage for the transaction.
 * @param options.txOptions - The transaction options for the transaction.
 * @returns A promise that resolves to the transaction hash.
 */
export type EarnControllerExecuteLendingWithdrawAction = {
  type: `EarnController:executeLendingWithdraw`;
  handler: EarnController['executeLendingWithdraw'];
};

/**
 * Executes a lending token approve transaction.
 *
 * @param options - The options for the lending token approve transaction.
 * @param options.amount - The amount to approve.
 * @param options.chainId - The chain ID for the lending token approve transaction.
 * @param options.protocol - The protocol of the lending market.
 * @param options.underlyingTokenAddress - The address of the underlying token.
 * @param options.gasOptions - The gas options for the transaction.
 * @param options.gasOptions.gasLimit - The gas limit for the transaction.
 * @param options.gasOptions.gasBufferPct - The gas buffer percentage for the transaction.
 * @param options.txOptions - The transaction options for the transaction.
 * @returns A promise that resolves to the transaction hash.
 */
export type EarnControllerExecuteLendingTokenApproveAction = {
  type: `EarnController:executeLendingTokenApprove`;
  handler: EarnController['executeLendingTokenApprove'];
};

/**
 * Gets the allowance for a lending token.
 *
 * @param protocol - The protocol of the lending market.
 * @param underlyingTokenAddress - The address of the underlying token.
 * @returns A promise that resolves to the allowance.
 */
export type EarnControllerGetLendingTokenAllowanceAction = {
  type: `EarnController:getLendingTokenAllowance`;
  handler: EarnController['getLendingTokenAllowance'];
};

/**
 * Gets the maximum withdraw amount for a lending token's output token or shares if no output token.
 *
 * @param protocol - The protocol of the lending market.
 * @param underlyingTokenAddress - The address of the underlying token.
 * @returns A promise that resolves to the maximum withdraw amount.
 */
export type EarnControllerGetLendingTokenMaxWithdrawAction = {
  type: `EarnController:getLendingTokenMaxWithdraw`;
  handler: EarnController['getLendingTokenMaxWithdraw'];
};

/**
 * Gets the maximum deposit amount for a lending token.
 *
 * @param protocol - The protocol of the lending market.
 * @param underlyingTokenAddress - The address of the underlying token.
 * @returns A promise that resolves to the maximum deposit amount.
 */
export type EarnControllerGetLendingTokenMaxDepositAction = {
  type: `EarnController:getLendingTokenMaxDeposit`;
  handler: EarnController['getLendingTokenMaxDeposit'];
};

/**
 * Union of all EarnController action types.
 */
export type EarnControllerMethodActions =
  | EarnControllerRefreshPooledStakesAction
  | EarnControllerRefreshEarnEligibilityAction
  | EarnControllerRefreshPooledStakingVaultMetadataAction
  | EarnControllerRefreshPooledStakingVaultDailyApysAction
  | EarnControllerRefreshPooledStakingVaultApyAveragesAction
  | EarnControllerRefreshPooledStakingDataAction
  | EarnControllerRefreshLendingMarketsAction
  | EarnControllerRefreshLendingPositionsAction
  | EarnControllerRefreshLendingDataAction
  | EarnControllerRefreshTronStakingApyAction
  | EarnControllerGetTronStakingApyAction
  | EarnControllerGetLendingPositionHistoryAction
  | EarnControllerGetLendingMarketDailyApysAndAveragesAction
  | EarnControllerExecuteLendingDepositAction
  | EarnControllerExecuteLendingWithdrawAction
  | EarnControllerExecuteLendingTokenApproveAction
  | EarnControllerGetLendingTokenAllowanceAction
  | EarnControllerGetLendingTokenMaxWithdrawAction
  | EarnControllerGetLendingTokenMaxDepositAction;
