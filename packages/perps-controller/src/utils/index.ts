/**
 * Barrel re-export for all portable utilities in controllers/utils/
 *
 * Note: hyperLiquidAdapter and orderCalculations both export calculatePositionSize.
 * We use selective exports to avoid the name collision.
 */
export * from './accountUtils.js';
export * from './errorUtils.js';
// hyperLiquidAdapter: selective export to avoid calculatePositionSize clash with orderCalculations
export {
  adaptOrderToSDK,
  adaptPositionFromSDK,
  adaptOrderFromSDK,
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
export * from './hyperLiquidValidation.js';
export * from './idUtils.js';
export * from './marketDataTransform.js';
export * from './marketSearch.js';
export * from './marketUtils.js';
export * from './orderCalculations.js';
export * from './perpsDiskPersistence.js';
export * from './rewardsUtils.js';
export * from './significantFigures.js';
export * from './sortMarkets.js';
export * from './standaloneInfoClient.js';
export * from './stringParseUtils.js';
export * from './transferData.js';
export * from './wait.js';

// Inline from former utils.ts (getEnvironment was previously at perps/utils.ts root)
export const getEnvironment = (): 'DEV' | 'PROD' => {
  const env = globalThis.process?.env?.NODE_ENV ?? 'production';
  return env === 'production' ? 'PROD' : 'DEV';
};
export * from './perpsFormatters.js';
