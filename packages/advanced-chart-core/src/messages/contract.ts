// Message type tags and external payload property names are part of the public
// RN<->WebView contract, so they intentionally use non-camelCase keys — matching
// the core convention for external contract type files
// (see `transaction-controller/src/types.ts`).
/* eslint-disable @typescript-eslint/naming-convention */
// Versioned message contract between React Native and the WebView IIFE.
//
// Strings MUST match RNToWebViewMessageType and WebViewToRNMessageType in
// app/components/UI/Charts/AdvancedChart/AdvancedChart.types.ts. These names
// are part of the public contract; renaming requires a triple-approved PR.
//
// Phase 1 ships the subset that bootstrap + theme + external-link bridge need.
// Subsequent phases extend the unions:
//   Phase 2 — SET_OHLCV_DATA, REALTIME_UPDATE, SET_CHART_TYPE, CROSSHAIR_MOVE,
//             CHART_INTERACTED
//   Phase 3 — ADD_INDICATOR, REMOVE_INDICATOR, SET_MA_VISIBILITY,
//             TOGGLE_VOLUME, SET_SUB_PANE_LAYOUT, INDICATOR_ADDED,
//             INDICATOR_REMOVED, LEGEND_RENDERED
//   Phase 5 — SET_TRADE_MARKERS, PULSE_TRADE_MARKER, FOCUS_TIME (inbound),
//             TRADE_MARKER_PRESSED (outbound)
//   Phase 6 — SET_POSITION_LINES, FETCH_OLDER_BARS_REQUEST,
//             FETCH_OLDER_BARS_RESPONSE
//
// Phase 4 deletes SET_LINE_CHROME alongside the custom-chrome implementation.

import type { ChartType, OHLCVBar, OHLCVPaginationConfig } from '../core/types.js';

/** Inbound — React Native → WebView IIFE. */
export type InboundMessage =
  | SetThemeColorsMessage
  | SetOHLCVDataMessage
  | RealtimeUpdateMessage
  | SetChartTypeMessage
  | AddIndicatorMessage
  | RemoveIndicatorMessage
  | SetMAVisibilityMessage
  | ToggleVolumeMessage
  | SetSubPaneLayoutMessage
  | SetPositionLinesMessage
  | SetTradeMarkersMessage
  | PulseTradeMarkerMessage
  | FocusTimeMessage
  | FetchOlderBarsResponseMessage;

export type SetThemeColorsMessage = {
  type: 'SET_THEME_COLORS';
  payload: SetThemeColorsPayload;
}

export type SetThemeColorsPayload = {
  lineColor?: string;
  successColor?: string;
  errorColor?: string;
  currentPriceColor?: string;
  volumeSuccessColor?: string;
  volumeErrorColor?: string;
}

export type SetOHLCVDataMessage = {
  type: 'SET_OHLCV_DATA';
  payload: SetOHLCVDataPayload;
}

export type SetOHLCVDataPayload = {
  data: OHLCVBar[];
  pagination?: OHLCVPaginationConfig;
  /** When enabled, getBars sends FETCH_OLDER_BARS_REQUEST to RN instead of fetching Price API. */
  rnBackedPagination?: { enabled: boolean };
  /** Visible-range start (ms) so the WebView can call setVisibleRange after reset. */
  visibleFromMs?: number;
  /** Visible-range end (ms) anchored to the last candle. */
  visibleToMs?: number;
  /** Optional symbol/vsCurrency for downstream pagination strategies. */
  symbol?: string;
  vsCurrency?: string;
  /**
   * SocialLeaderboard (SLB) scoping flag. Activates the third pagination
   * strategy ("Strategy C — SLB bulk back-fill"):
   *
   * **Strategy A** (Price API / WebView-driven) — Token Details default.
   * The WebView fetches older pages from the public Price API using
   * cursor-based pagination (assetId + nextCursor). RN is not involved
   * after the initial SET_OHLCV_DATA handoff.
   *
   * **Strategy B** (RN-backed) — Perps. The WebView sends
   * FETCH_OLDER_BARS_REQUEST to RN, which fetches from a private candle
   * source and sends bars back via FETCH_OLDER_BARS_RESPONSE.
   * Opt-in: `rnBackedPagination.enabled`.
   *
   * **Strategy C** (SLB bulk back-fill) — Social Leaderboard. RN
   * pre-loads the full OHLCV dataset covering the trade window
   * (visibleFromMs to visibleToMs) and sends it in a single
   * SET_OHLCV_DATA. The WebView does NOT paginate — getBars returns
   * noData for any request outside the pre-loaded range. After data
   * loads, the viewport is centered on the trade window so the user
   * sees all relevant trades immediately. When the user taps a
   * different trade row, RN re-sends the full dataset with updated
   * visibleFromMs/visibleToMs and the viewport re-centers.
   * Opt-in: `slbMode: true` on the payload.
   *
   * The branching is in datafeed.ts getBars:
   * 1. slbMode -> noData (all data pre-loaded by RN)
   * 2. pag.assetId -> Price API (Strategy A)
   * 3. rnBackedPagination.enabled -> RN callback (Strategy B)
   * 4. else -> noData: true
   */
  slbMode?: boolean;
}

export type RealtimeUpdateMessage = {
  type: 'REALTIME_UPDATE';
  payload: { bar: OHLCVBar };
}

export type SetChartTypeMessage = {
  type: 'SET_CHART_TYPE';
  payload: { type: ChartType };
}

export type AddIndicatorMessage = {
  type: 'ADD_INDICATOR';
  payload: { name: string; inputs?: Record<string, unknown> };
}

export type RemoveIndicatorMessage = {
  type: 'REMOVE_INDICATOR';
  payload: { name: string };
}

export type SetMAVisibilityMessage = {
  type: 'SET_MA_VISIBILITY';
  payload: { visible: string[] };
}

export type ToggleVolumeMessage = {
  type: 'TOGGLE_VOLUME';
  payload: { visible: boolean; volumeOverlay?: boolean };
}

export type SetSubPaneLayoutMessage = {
  type: 'SET_SUB_PANE_LAYOUT';
  payload: { heightRatio: number | null };
}

/**
 * A single trade marker anchored to a candle in `time` (unix ms). `intent`
 * selects the theme color (successColor for 'enter', errorColor for 'exit');
 * `price` is a fallback anchor when the candle is outside the loaded range.
 * Mirrors the shape RN sends in `TradeMarker` from AdvancedChart.types.ts.
 */
export type TradeMarker = {
  id: string | number;
  time: number;
  intent: 'enter' | 'exit';
  price?: number;
}

export type SetTradeMarkersMessage = {
  type: 'SET_TRADE_MARKERS';
  payload: SetTradeMarkersPayload;
}

export type SetTradeMarkersPayload = {
  /** Full marker set; RN sends every trade, not just the visible window. */
  markers: TradeMarker[] | null;
}

export type PulseTradeMarkerMessage = {
  type: 'PULSE_TRADE_MARKER';
  payload: { id: string | number };
}

export type FocusTimeMessage = {
  type: 'FOCUS_TIME';
  payload: FocusTimePayload;
}

export type FocusTimePayload = {
  timeMs: number;
  /** Optional explicit visible span (ms); omitted → preserve current zoom. */
  spanMs?: number;
  /** false disables the slide animation (jump instead). Default true. */
  animate?: boolean;
}

// ----- Position Lines (Perps) ------------------------------------------------

export type PositionSide = 'long' | 'short';

export type PositionLines = {
  side: PositionSide;
  entryPrice?: number;
  currentPrice?: number;
  takeProfitPrice?: number;
  stopLossPrice?: number;
  liquidationPrice?: number;
}

export type PositionLineColors = {
  currentPrice?: string;
  entry: string;
  takeProfit: string;
  stopLoss: string;
  liquidation: string;
}

export type SetPositionLinesMessage = {
  type: 'SET_POSITION_LINES';
  payload: SetPositionLinesPayload;
}

export type SetPositionLinesPayload = {
  position: PositionLines | null;
  positionLineColors?: PositionLineColors;
}

// ----- RN-Backed Pagination (Perps) ------------------------------------------

export type FetchOlderBarsResponseMessage = {
  type: 'FETCH_OLDER_BARS_RESPONSE';
  payload: FetchOlderBarsResponsePayload;
}

export type FetchOlderBarsResponsePayload = {
  requestId: string;
  seriesGeneration: number;
  bars: OHLCVBar[];
  noData?: boolean;
  error?: string;
}

export type FetchOlderBarsRequestPayload = {
  requestId: string;
  seriesGeneration: number;
  symbol: string;
  resolution: string;
  fromSec: number;
  toSec: number;
  countBack?: number;
  oldestLoadedTimeMs: number;
}

export type InboundMessageType = InboundMessage['type'];

/** Outbound — WebView IIFE → React Native. */
export type OutboundMessageType =
  | 'CHART_READY'
  | 'CHART_LAYOUT_SETTLED'
  | 'CHART_TRADINGVIEW_CLICKED'
  | 'CROSSHAIR_MOVE'
  | 'CHART_INTERACTED'
  | 'INDICATOR_ADDED'
  | 'INDICATOR_REMOVED'
  | 'LEGEND_RENDERED'
  | 'TRADE_MARKER_PRESSED'
  | 'FETCH_OLDER_BARS_REQUEST'
  | 'ERROR'
  | 'DEBUG';

// Reserved — RN reads no fields today but the slot stays open for
// metadata (e.g. library version) without breaking the contract.
export type ChartReadyPayload = Record<string, never>;

// Same as ChartReadyPayload.
export type ChartLayoutSettledPayload = Record<string, never>;

export type ChartTradingViewClickedPayload = {
  url?: string;
}

export type ErrorPayload = {
  message: string;
}

export type DebugPayload = {
  message: string;
  [extra: string]: unknown;
}

/**
 * Crosshair OHLC data forwarded from the WebView when the user scrubs over
 * the chart. Shape matches `CrosshairData` in AdvancedChart.types.ts so the
 * RN-side parseWebViewMessage decodes our messages without translation.
 */
export type CrosshairData = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export type CrosshairMovePayload = {
  /** OHLC of the bar nearest the crosshair; null when the crosshair dismisses. */
  data: CrosshairData | null;
}

export type ChartInteractionType = 'zoom' | 'pan' | 'tooltip';

export type ChartInteractedPayload = {
  interaction_type: ChartInteractionType;
}

export type IndicatorAddedPayload = {
  name: string;
  id: string;
}

export type IndicatorRemovedPayload = {
  name: string;
}

export type LegendRenderedPayload = Record<string, never>;

export type TradeMarkerPressedPayload = {
  id: string;
}

export type OutboundPayloads = {
  CHART_READY: ChartReadyPayload;
  CHART_LAYOUT_SETTLED: ChartLayoutSettledPayload;
  CHART_TRADINGVIEW_CLICKED: ChartTradingViewClickedPayload;
  CROSSHAIR_MOVE: CrosshairMovePayload;
  CHART_INTERACTED: ChartInteractedPayload;
  INDICATOR_ADDED: IndicatorAddedPayload;
  INDICATOR_REMOVED: IndicatorRemovedPayload;
  LEGEND_RENDERED: LegendRenderedPayload;
  TRADE_MARKER_PRESSED: TradeMarkerPressedPayload;
  FETCH_OLDER_BARS_REQUEST: FetchOlderBarsRequestPayload;
  ERROR: ErrorPayload;
  DEBUG: DebugPayload;
}

/** Re-export for callers writing Phase 3 handlers. */
export type { IndicatorName } from '../core/types.js';

/** Helper for messages/handler.ts — narrows InboundMessage by type tag. */
export type InboundMessageOf<Type extends InboundMessageType> = Extract<
  InboundMessage,
  { type: Type }
>;

/** Re-exports for consumers that want to import shapes alongside types. */
export type { ChartTheme } from '../core/types.js';
