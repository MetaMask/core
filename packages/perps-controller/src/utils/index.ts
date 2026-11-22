/**
 * Barrel re-export for all portable utilities in controllers/utils/
 *
 * Note: hyperLiquidAdapter and orderCalculations both export calculatePositionSize.
 * We use selective exports to avoid the name collision.
 */
export * from './accountUtils.js';
export * from './advancedOrderLists.js';
export * from './advancedOrders.js';
export { getBatchOperationStatus } from './batchOperationStatus.js';
export {
  estimateCloseReceive,
  calculateNetClosedPnl,
  calculateCloseSize,
} from './closeCalculations.js';
export type {
  CloseSize,
  CloseSizeParams,
  CloseReceiveEstimateParams,
  CloseReceiveEstimate,
  NetClosedPnlParams,
} from './closeCalculations.js';
export * from './errorUtils.js';
export {
  calculateFeeNotionalUsd,
  calculateUndiscountedFeeAmount,
  getUndiscountedFeeRate,
} from './feeAmounts.js';
export type { FeeNotionalParams } from './feeAmounts.js';
// hyperLiquidAdapter: selective export to avoid calculatePositionSize clash with orderCalculations
export {
  adaptOrderToSDK,
  adaptPositionFromSDK,
  adaptOrderFromSDK,
  adaptPositionTriggerOrderFromSDK,
  adaptTpslLinkageToGrouping,
  adaptTriggerOrderTypeFromSDK,
  adaptMarketFromSDK,
  adaptAccountStateFromSDK,
  buildAssetMapping,
  formatHyperLiquidPrice,
  formatHyperLiquidSize,
  calculateHip3AssetId,
  parseAssetName,
  adaptHyperLiquidLedgerUpdateToUserHistoryItem,
} from './hyperLiquidAdapter.js';
export * from './hyperLiquidOrderBookProcessor.js';
export * from './hyperLiquidPositionPreview.js';
export * from './hyperLiquidValidation.js';
export {
  calculateMaxRemovableMargin,
  estimateLiquidationPriceAfterMarginChange,
} from './marginAdjustment.js';
export type {
  MaxRemovableMarginParams,
  LiquidationPriceAfterMarginChangeParams,
} from './marginAdjustment.js';
export * from './idUtils.js';
export * from './marketDataTransform.js';
export * from './marketSearch.js';
export * from './marketUtils.js';
export {
  aggregateOrderBookLevels,
  calculateOrderBookAggregationParams,
  calculateOrderBookGroupingOptions,
  calculateOrderBookSpread,
  groupOrderBook,
  selectDefaultOrderBookGrouping,
} from './orderBookGrouping.js';
export type {
  GroupedOrderBook,
  OrderBookAggregationParams,
  OrderBookSpread,
} from './orderBookGrouping.js';
export { estimateOrderBookSlippage } from './orderBookSlippage.js';
export type {
  OrderBookSlippageEstimate,
  OrderBookSlippageParams,
} from './orderBookSlippage.js';
export * from './orderCalculations.js';
export { getFillAggregationKey, getOrderFillKey } from './orderFills.js';
export * from './orderTypes.js';
export {
  getPerpsErrorCopy,
  PERPS_ERROR_COPY,
  PERPS_ORDER_TYPE_LABELS,
} from './perpsClientCopy.js';
export type { PerpsErrorCopy, PerpsOrderTypeLabel } from './perpsClientCopy.js';
export * from './perpsDiskPersistence.js';
export { roundPerpsPrice } from './pricePrecision.js';
export * from './rewardsUtils.js';
export * from './significantFigures.js';
export * from './sortMarkets.js';
export * from './standaloneInfoClient.js';
export * from './stringParseUtils.js';
export * from './subscriptionFeeWaiver.js';
export * from './tpslCalculations.js';
export * from './transferData.js';
export * from './wait.js';

// Inline from former utils.ts (getEnvironment was previously at perps/utils.ts root)
export const getEnvironment = (): 'DEV' | 'PROD' => {
  const env = globalThis.process?.env?.NODE_ENV ?? 'production';
  return env === 'production' ? 'PROD' : 'DEV';
};
export * from './perpsFormatters.js';
