import type {
  PositionModifyPreviewCurrent,
  PositionModifyPreviewParams,
  PositionModifyPreviewResult,
  PositionPreviewValue,
} from '../types/index.js';

/** Token-size comparison tolerance (floating-point / szDecimals noise). */
const SIZE_EPSILON = 1e-10;

/**
 * HyperLiquid documents margin-table IDs below 50 as a single tier whose max
 * leverage equals the table id. Multi-tier tables need the `meta.marginTables`
 * entry; without it liquidation is withheld.
 *
 * @see https://hyperliquid.gitbook.io/hyperliquid-docs/trading/margin-and-pnl
 */
const SINGLE_TIER_MARGIN_TABLE_ID_MAX = 50;

export type HyperLiquidMarginTier = {
  /** Inclusive notional lower bound in USD. */
  lowerBound: number;
  maxLeverage: number;
};

export type PreviewHyperLiquidIsolatedPositionModifyParams =
  PositionModifyPreviewParams & {
    /**
     * Maintenance tiers for the asset, lowest notional first. `null` or empty
     * withholds liquidation while still returning margin when it can be known.
     */
    marginTiers?: HyperLiquidMarginTier[] | null;
  };

type MaintenanceScheduleTier = {
  lowerBound: number;
  upperBound: number;
  maxLeverage: number;
  maintenanceMarginRate: number;
  maintenanceDeduction: number;
};

const unavailable = (): PositionPreviewValue => ({ available: false });

const available = (value: number): PositionPreviewValue => ({
  available: true,
  value,
});

const parseFiniteNumber = (value: string | null | undefined): number =>
  Number.parseFloat(value ?? '');

const isPositiveFinite = (value: number): boolean =>
  Number.isFinite(value) && value > 0;

const isNonNegativeFinite = (value: number): boolean =>
  Number.isFinite(value) && value >= 0;

const currentFromPosition = (params: {
  currentMargin: number;
  currentLiquidationPrice: number;
}): PositionModifyPreviewCurrent => ({
  margin: isNonNegativeFinite(params.currentMargin)
    ? available(params.currentMargin)
    : unavailable(),
  liquidationPrice: isPositiveFinite(params.currentLiquidationPrice)
    ? available(params.currentLiquidationPrice)
    : unavailable(),
});

/**
 * Resolves the HyperLiquid margin table into preview tiers.
 *
 * Table IDs below 50 are single-tier. IDs at or above 50 require the matching
 * `marginTables` row; missing data returns `null` so liquidation is withheld.
 *
 * @param params - Margin table id, asset max leverage, and optional tables.
 * @param params.marginTableId - HyperLiquid margin table id from `meta.universe`.
 * @param params.maxLeverage - Asset max leverage used for single-tier tables.
 * @param params.marginTables - `meta.marginTables` rows; required for table ids ≥ 50.
 * @returns Tiers for liquidation, or `null` when the table is required but missing.
 */
export function resolveHyperLiquidMarginTiers(params: {
  marginTableId?: number;
  maxLeverage: number;
  marginTables?:
    | [number, { marginTiers: { lowerBound: string; maxLeverage: number }[] }][]
    | null;
}): HyperLiquidMarginTier[] | null {
  const { marginTableId, maxLeverage, marginTables } = params;

  if (
    typeof marginTableId === 'number' &&
    marginTableId >= SINGLE_TIER_MARGIN_TABLE_ID_MAX
  ) {
    const table = marginTables?.find(([id]) => id === marginTableId)?.[1];
    const tiers = table?.marginTiers
      ?.map((tier) => ({
        lowerBound: Number.parseFloat(tier.lowerBound),
        maxLeverage: tier.maxLeverage,
      }))
      .filter(
        (tier) =>
          Number.isFinite(tier.lowerBound) &&
          tier.lowerBound >= 0 &&
          isPositiveFinite(tier.maxLeverage),
      );
    return tiers && tiers.length > 0 ? tiers : null;
  }

  if (isPositiveFinite(maxLeverage)) {
    return [{ lowerBound: 0, maxLeverage }];
  }

  return null;
}

/**
 * Builds the continuous maintenance-margin schedule from HyperLiquid tiers.
 *
 * `maintenance_margin = notional * mmr - deduction`, with
 * `mmr = 1 / (2 * tierMaxLeverage)` and deduction chosen so the function is
 * continuous across tier boundaries.
 *
 * @param tiers - Notional lower bounds and per-tier max leverage.
 * @returns Sorted schedule used to pick the tier at liquidation notional.
 */
export function buildMaintenanceSchedule(
  tiers: HyperLiquidMarginTier[],
): MaintenanceScheduleTier[] {
  const sorted = [...tiers]
    .filter(
      (tier) =>
        Number.isFinite(tier.lowerBound) &&
        tier.lowerBound >= 0 &&
        isPositiveFinite(tier.maxLeverage),
    )
    .sort((left, right) => left.lowerBound - right.lowerBound);

  const schedule: MaintenanceScheduleTier[] = [];
  let deduction = 0;
  let previousMmr = 0;

  for (let index = 0; index < sorted.length; index++) {
    const tier = sorted[index];
    const maintenanceMarginRate = 1 / (2 * tier.maxLeverage);
    if (index > 0) {
      deduction += tier.lowerBound * (maintenanceMarginRate - previousMmr);
    }
    schedule.push({
      lowerBound: tier.lowerBound,
      upperBound:
        index + 1 < sorted.length ? sorted[index + 1].lowerBound : Infinity,
      maxLeverage: tier.maxLeverage,
      maintenanceMarginRate,
      maintenanceDeduction: deduction,
    });
    previousMmr = maintenanceMarginRate;
  }

  return schedule;
}

/**
 * Isolated liquidation from entry, margin, size, and a maintenance tier.
 *
 * Long:  `(entry - margin/size - deduction/size) / (1 - mmr)`
 * Short: `(entry + margin/size + deduction/size) / (1 + mmr)`
 *
 * @param params - Position geometry plus the tier's mmr and deduction.
 * @param params.isLong - Whether the remaining position is long.
 * @param params.entryPrice - Resulting average entry price.
 * @param params.margin - Isolated margin after the proposed fill.
 * @param params.positionSize - Absolute remaining size in token units.
 * @param params.maintenanceMarginRate - `1 / (2 * tierMaxLeverage)` for the tier.
 * @param params.maintenanceDeduction - Continuity deduction at this tier.
 * @returns Liquidation price, or `null` when the inputs cannot produce one.
 */
export function estimateIsolatedLiquidationPrice(params: {
  isLong: boolean;
  entryPrice: number;
  margin: number;
  positionSize: number;
  maintenanceMarginRate: number;
  maintenanceDeduction?: number;
}): number | null {
  const {
    isLong,
    entryPrice,
    margin,
    positionSize,
    maintenanceMarginRate,
    maintenanceDeduction = 0,
  } = params;

  if (
    !isPositiveFinite(entryPrice) ||
    !isPositiveFinite(margin) ||
    !isPositiveFinite(positionSize) ||
    !Number.isFinite(maintenanceMarginRate) ||
    maintenanceMarginRate < 0 ||
    !Number.isFinite(maintenanceDeduction)
  ) {
    return null;
  }

  const direction = isLong ? -1 : 1;
  const side = isLong ? 1 : -1;
  const adjustmentFactor = 1 - maintenanceMarginRate * side;
  if (Math.abs(adjustmentFactor) < 0.0001) {
    return null;
  }

  const liquidationPrice =
    (entryPrice +
      direction * (margin / positionSize) +
      direction * (maintenanceDeduction / positionSize)) /
    adjustmentFactor;

  if (!isPositiveFinite(liquidationPrice)) {
    return null;
  }

  return liquidationPrice;
}

/**
 * Picks the maintenance tier whose notional range contains the liquidation
 * notional (`size * liqPrice`), including that tier's deduction.
 *
 * @param params - Resulting geometry and the asset's maintenance schedule.
 * @param params.isLong - Whether the remaining position is long.
 * @param params.entryPrice - Resulting average entry price.
 * @param params.margin - Isolated margin after the proposed fill.
 * @param params.positionSize - Absolute remaining size in token units.
 * @param params.marginTiers - Maintenance tiers, lowest notional first.
 * @returns Liquidation price when a consistent tier exists.
 */
export function estimateIsolatedLiquidationPriceAtTier(params: {
  isLong: boolean;
  entryPrice: number;
  margin: number;
  positionSize: number;
  marginTiers: HyperLiquidMarginTier[] | null | undefined;
}): number | null {
  const schedule = buildMaintenanceSchedule(params.marginTiers ?? []);
  if (schedule.length === 0) {
    return null;
  }

  for (const tier of schedule) {
    const liquidationPrice = estimateIsolatedLiquidationPrice({
      isLong: params.isLong,
      entryPrice: params.entryPrice,
      margin: params.margin,
      positionSize: params.positionSize,
      maintenanceMarginRate: tier.maintenanceMarginRate,
      maintenanceDeduction: tier.maintenanceDeduction,
    });
    if (liquidationPrice === null) {
      continue;
    }
    const notionalAtLiquidation = params.positionSize * liquidationPrice;
    if (
      notionalAtLiquidation >= tier.lowerBound &&
      notionalAtLiquidation < tier.upperBound
    ) {
      return liquidationPrice;
    }
  }

  return null;
}

const resultingLeverage = (params: {
  size: number;
  entryPrice: number;
  margin: number;
  fallback: number;
}): number => {
  const notional = params.size * params.entryPrice;
  if (params.margin > 0 && notional > 0) {
    return notional / params.margin;
  }
  return params.fallback;
};

/**
 * Projects the isolated position that would remain after a proposed order.
 *
 * Models HyperLiquid's isolated `updateLeverage` (the selected leverage is
 * applied to the whole asset before the fill) and maintenance tiers at the
 * resulting liquidation notional. Cross-margin positions return
 * `{ status: 'unsupported', reason: 'cross_margin' }`.
 *
 * `price` is the fill or resting-limit price the caller expects. A marketable
 * order should pass its execution price; a limit should pass the limit. The
 * preview does not distinguish order types itself, does not model whether a
 * resting limit would fill, and treats scale/TWAP/chase as one aggregated fill.
 * Decrease margin is the remaining isolated collateral after leverage
 * reallocation; close fees and realized PnL settle to the account, not the
 * leftover margin.
 *
 * @param params - Live isolated position, proposed order, and optional tiers.
 * @returns Discriminated preview; margin and liquidation are independently available.
 */
export function previewHyperLiquidIsolatedPositionModify(
  params: PreviewHyperLiquidIsolatedPositionModifyParams,
): PositionModifyPreviewResult {
  const { position, direction, reduceOnly = false, marginTiers } = params;

  if (position.leverage.type === 'cross') {
    return { status: 'unsupported', reason: 'cross_margin' };
  }

  const currentSize = Math.abs(parseFiniteNumber(position.size));
  const signedSize = parseFiniteNumber(position.size);
  const currentMargin = parseFiniteNumber(position.marginUsed);
  const currentEntry = parseFiniteNumber(position.entryPrice);
  const currentLiquidationPrice = parseFiniteNumber(position.liquidationPrice);
  const currentLeverage = position.leverage.value;
  const selectedLeverage = params.leverage;
  const orderSize = parseFiniteNumber(params.size);
  const orderPrice = parseFiniteNumber(params.price);
  const feeAmountUsd =
    typeof params.feeAmountUsd === 'number' && params.feeAmountUsd > 0
      ? params.feeAmountUsd
      : 0;

  if (
    !isPositiveFinite(currentSize) ||
    !Number.isFinite(signedSize) ||
    signedSize === 0 ||
    !isNonNegativeFinite(currentMargin) ||
    !isPositiveFinite(currentEntry) ||
    !isPositiveFinite(selectedLeverage) ||
    !isPositiveFinite(currentLeverage)
  ) {
    return { status: 'none' };
  }

  const openDirection: 'long' | 'short' = signedSize > 0 ? 'long' : 'short';
  const currentSnapshot = currentFromPosition({
    currentMargin,
    currentLiquidationPrice,
  });

  if (!isPositiveFinite(orderSize)) {
    return { status: 'none' };
  }

  const positionValue = parseFiniteNumber(position.positionValue);
  const currentNotional = isPositiveFinite(positionValue)
    ? positionValue
    : currentSize * currentEntry;

  const leverageChanged =
    Math.abs(selectedLeverage - currentLeverage) > SIZE_EPSILON;
  const existingMarginAfterLeverage = leverageChanged
    ? currentNotional / selectedLeverage
    : currentMargin;

  const withResultingLiquidation = (preview: {
    kind: 'increase' | 'decrease' | 'flip';
    resultingDirection: 'long' | 'short';
    resultingSize: number;
    resultingEntryPrice: number;
    newMargin: number;
  }): PositionModifyPreviewResult => {
    const liquidationPrice = estimateIsolatedLiquidationPriceAtTier({
      isLong: preview.resultingDirection === 'long',
      entryPrice: preview.resultingEntryPrice,
      margin: preview.newMargin,
      positionSize: preview.resultingSize,
      marginTiers,
    });

    return {
      status: 'open',
      kind: preview.kind,
      current: currentSnapshot,
      resulting: {
        direction: preview.resultingDirection,
        size: preview.resultingSize,
        entryPrice: preview.resultingEntryPrice,
        leverage: resultingLeverage({
          size: preview.resultingSize,
          entryPrice: preview.resultingEntryPrice,
          margin: preview.newMargin,
          fallback: selectedLeverage,
        }),
        margin: available(preview.newMargin),
        liquidationPrice:
          liquidationPrice === null
            ? unavailable()
            : available(liquidationPrice),
      },
    };
  };

  const isSameDirection = openDirection === direction;
  const fillPrice = isPositiveFinite(orderPrice) ? orderPrice : null;

  // Reduce-only in the position's own direction cannot add size and does not
  // close it, so there is no resulting position to project.
  if (isSameDirection && reduceOnly) {
    return { status: 'none' };
  }

  if (isSameDirection) {
    if (fillPrice === null) {
      return { status: 'none' };
    }
    const orderMargin = (orderSize * fillPrice) / selectedLeverage;
    const resultingSize = currentSize + orderSize;
    const resultingEntryPrice =
      (currentSize * currentEntry + orderSize * fillPrice) / resultingSize;
    const newMargin = Math.max(
      0,
      existingMarginAfterLeverage + orderMargin - feeAmountUsd,
    );

    return withResultingLiquidation({
      kind: 'increase',
      resultingDirection: openDirection,
      resultingSize,
      resultingEntryPrice,
      newMargin,
    });
  }

  if (orderSize + SIZE_EPSILON < currentSize) {
    const remainingRatio = (currentSize - orderSize) / currentSize;
    const resultingSize = currentSize - orderSize;
    const newMargin = Math.max(0, existingMarginAfterLeverage * remainingRatio);

    return withResultingLiquidation({
      kind: 'decrease',
      resultingDirection: openDirection,
      resultingSize,
      resultingEntryPrice: currentEntry,
      newMargin,
    });
  }

  const leftover = orderSize - currentSize;
  if (leftover > SIZE_EPSILON && !reduceOnly) {
    if (fillPrice === null) {
      return { status: 'none' };
    }
    const orderMargin = (orderSize * fillPrice) / selectedLeverage;
    const leftoverRatio = leftover / orderSize;
    const leftoverMargin = Math.max(
      0,
      (orderMargin - feeAmountUsd) * leftoverRatio,
    );

    return withResultingLiquidation({
      kind: 'flip',
      resultingDirection: direction,
      resultingSize: leftover,
      resultingEntryPrice: fillPrice,
      newMargin: leftoverMargin,
    });
  }

  return {
    status: 'full_close',
    current: currentSnapshot,
    resultingDirection: openDirection,
  };
}
