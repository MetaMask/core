/**
 * HyperLiquid SDK Type Aliases
 *
 * The @nktkas/hyperliquid SDK only exports Response types (e.g., ClearinghouseStateResponse).
 * We extract commonly-used nested types here to avoid repetitive type extraction syntax.
 *
 * Pattern: Import Response types, extract nested types using TypeScript index access.
 * This is the SDK's intentional design - not bad practice!
 */
import type {
  ClearinghouseStateResponse,
  SpotClearinghouseStateResponse,
  MetaResponse,
  FrontendOpenOrdersResponse,
  MetaAndAssetCtxsResponse,
  AllMidsResponse,
  PredictedFundingsResponse,
  OrderParameters,
} from '@nktkas/hyperliquid';

// Clearinghouse (Account) Types
export type AssetPosition =
  ClearinghouseStateResponse['assetPositions'][number];
export type SpotBalance = SpotClearinghouseStateResponse['balances'][number];

// Market/Asset Types
export type PerpsUniverse = MetaResponse['universe'][number];
export type PerpsAssetCtx = MetaAndAssetCtxsResponse[1][number];
export type PredictedFunding = PredictedFundingsResponse[number];

// Order Types
export type FrontendOrder = FrontendOpenOrdersResponse[number];
export type SDKOrderParams = OrderParameters['orders'][number];
export type OrderType = FrontendOrder['orderType'];

// Re-export Response types for convenience
export type {
  ClearinghouseStateResponse,
  SpotClearinghouseStateResponse,
  MetaResponse,
  FrontendOpenOrdersResponse,
  AllMidsResponse,
  MetaAndAssetCtxsResponse,
  PredictedFundingsResponse,
};

/**
 * Extended asset metadata including Growth Mode fields not in SDK types.
 *
 * The HyperLiquid API returns these fields but the SDK doesn't type them.
 *
 * @see https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees#fee-formula-for-developers
 */
export type ExtendedAssetMeta = {
  name: string;
  szDecimals: number;
  maxLeverage: number;
  /** Per-asset Growth Mode status - "enabled" means 90% fee reduction */
  growthMode?: 'enabled' | null;
  /** ISO timestamp of last Growth Mode change */
  lastGrowthModeChangeTime?: string;
};

/**
 * Extended perp DEX info including fee scale fields not in SDK types.
 *
 * The HyperLiquid API returns these fields but the SDK doesn't type them.
 *
 * @see https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees#fee-formula-for-developers
 */
export type ExtendedPerpDex = {
  name: string;
  fullName?: string;
  deployer?: string;
  /** DEX-level fee scale (e.g., "1.0" for xyz DEX) - determines HIP-3 multiplier */
  deployerFeeScale?: string;
  /** ISO timestamp of last fee scale change */
  lastDeployerFeeScaleChangeTime?: string;
};
