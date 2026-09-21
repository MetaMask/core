// DOM legend overlay for active indicator studies.
//
// Ported from chartLogic.js: createStudyLegendOverlay (~4365),
// refreshStudyLegendFromExport (~4644), buildLegendHTML (~4497),
// updateLegendOverlayLayout (~4401), legend retry/timeout machinery
// (~4630-4785), getMainPriceAxisLeftRelativeTo (~1472).
//
// The overlay is a `<div id="study-legend-overlay">` injected into
// #tv_chart_container that holds one `.legend-pill` per active indicator.
// Theme-aware text colors are computed from CONFIG.theme; per-plot colors
// come from the legend config supplied by RN.
//
// `LEGEND_RENDERED` is posted to RN once the overlay has settled (either
// real values returned by chart.exportData() or after the retry timeout).

import { postToRN } from '../../core/bridge.js';
import {
  doesLegendOwnLayoutSettle,
  getActiveStudies,
  getLegendStudyOrder,
  getMaStudies,
  getTheme,
  getVolumeStudyId,
  getWidget,
  isChartReady,
  setLegendOwnsLayoutSettle,
} from '../../core/state.js';
import type {
  LegendIndicatorCfg,
  LegendOverlayConfig,
  LegendPlotCfg,
  StudyId,
  TVActiveChart,
  TVExportData,
} from '../../core/types.js';
import { eachChartDocument } from '../../widget/tvDomHelpers.js';

const OVERLAY_ID = 'study-legend-overlay';
const OVERLAY_LEFT_PX = 8;
const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 100;
const RENDER_TIMEOUT_MS = 3000;

let exportGeneration = 0;
let retryCount = 0;
let timeoutId: ReturnType<typeof setTimeout> | null = null;
let legendOverlayEnabled = false;
/** Typed legend config from RN — the single source of truth for legend rendering. */
let legendConfig: Record<string, LegendIndicatorCfg> | undefined;
/** Sub-pane overlay elements keyed by indicator name. */
const subPaneOverlays = new Map<string, HTMLDivElement>();

// ----- Lifecycle ---------------------------------------------------------

/**
 * Called once on chart-ready to set up the DOM container.
 *
 * @param config - The legend overlay configuration, or undefined.
 */
export function setupLegendOverlay(
  config: LegendOverlayConfig | undefined,
): void {
  legendOverlayEnabled = Boolean(config?.enabled);
  legendConfig = config?.config;
  if (!legendOverlayEnabled) {
    return;
  }
  createOverlayElement();
  injectHideLegendButtonsCSS();
}

/**
 * Subscribes to the widget's `panes_height_changed` event so the overlay
 * max-width is recomputed whenever a pane resize (e.g. after adding MACD
 * or RSI) shifts the price-axis boundary.
 *
 * @param widget - The TradingView widget (subset used here).
 * @param widget.subscribe - Subscribes to the `panes_height_changed` event.
 * @param widget.activeChart - Returns the active chart.
 */
export function attachLegendResizeListener(widget: {
  subscribe(event: 'panes_height_changed', handler: () => void): void;
  activeChart(): TVActiveChart;
}): void {
  try {
    widget.subscribe('panes_height_changed', () => {
      const el = document.getElementById(OVERLAY_ID);
      if (el) {
        updateLegendOverlayLayout();
      }
      repositionSubPaneOverlays(widget.activeChart());
    });
  } catch {
    // TV may throw if subscribe isn't ready; safe to ignore.
  }
}

function createOverlayElement(): void {
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) {
    existing.remove();
  }
  const container = document.getElementById('tv_chart_container');
  if (!container) {
    return;
  }
  const div = document.createElement('div');
  div.id = OVERLAY_ID;
  div.style.cssText =
    `position:absolute;top:1px;left:${OVERLAY_LEFT_PX}px;z-index:5;` +
    `pointer-events:none;display:flex;flex-wrap:wrap;align-items:flex-start;` +
    `column-gap:8px;row-gap:2px;`;
  container.style.position = 'relative';
  container.appendChild(div);
}

function injectHideLegendButtonsCSS(): void {
  const styleId = 'mm-hide-legend-buttons';
  if (document.getElementById(styleId)) {
    return;
  }
  let targetDoc: Document = document;
  eachChartDocument((doc) => {
    if (targetDoc === document && doc !== document) {
      targetDoc = doc;
    }
  });
  const style = targetDoc.createElement('style');
  style.id = styleId;
  style.textContent =
    '.chart-controls-bar .apply-common-tooltip,' +
    '.legendElement .showHide,' +
    '.legendElement button[data-name="legend-show-hide-action"],' +
    '.legendElement button[data-name="legend-settings-action"],' +
    '.legendElement button[data-name="legend-delete-action"],' +
    '.legendElement .buttons-wrapper,' +
    '.legendElement .buttonsWrapper{display:none!important;}';
  targetDoc.head.appendChild(style);
}

// ----- Legend rebuild ---------------------------------------------------

/**
 * Returns the per-indicator legend config supplied by RN via legendOverlay.config.
 * Consumers must pass their own config — there is no built-in fallback.
 *
 * @returns The per-indicator legend config map (empty when unset).
 */
function getPresetMap(): Record<string, LegendIndicatorCfg> {
  return legendConfig ?? {};
}

function getLegendAltColor(): string {
  const theme = getTheme();
  return (
    theme?.legendTextColor ??
    theme?.textAlternativeColor ??
    theme?.textColor ??
    'rgb(133,136,152)'
  );
}

type StudyValueEntry = {
  title: string;
  value: string;
};

type StudyDataEntry = {
  name: string;
  values: StudyValueEntry[];
};

function isEmptyValue(value: string): boolean {
  return !value || value === '' || value === 'n/a' || value === '∅';
}

function plotValue(
  indicatorConfig: LegendIndicatorCfg,
  plotCfg: LegendPlotCfg,
  plotIndex: number,
  values: StudyValueEntry[],
): string {
  if (indicatorConfig.useIndex && plotIndex < values.length) {
    return values[plotIndex].value;
  }
  const match = values.find((candidate) => candidate.title === plotCfg.tvTitle);
  return match?.value ?? '';
}

function wrapPill(innerHtml: string, color?: string): string {
  const style = color ? ` style="color:${color};"` : '';
  return `<span class="legend-pill"${style}>${innerHtml}</span>`;
}

function buildHTML(entries: StudyDataEntry[]): string {
  const altColor = getLegendAltColor();
  const presets = getPresetMap();
  const successColor = getTheme()?.successColor ?? 'rgb(38,166,154)';
  const pills: string[] = [];

  for (const entry of entries) {
    const indicatorConfig = presets[entry.name];
    if (!indicatorConfig) {
      continue;
    }

    if (indicatorConfig.isMA) {
      const ma = indicatorConfig.plots[0];
      const value = plotValue(indicatorConfig, ma, 0, entry.values);
      if (isEmptyValue(value)) {
        continue;
      }
      pills.push(wrapPill(`${ma.label} ${value}`, ma.color ?? undefined));
      continue;
    }

    if (indicatorConfig.combineInOnePill) {
      const labelColor = indicatorConfig.plots[0].color ?? successColor;
      let inner = `<span style="color:${labelColor}">${indicatorConfig.title ?? indicatorConfig.plots[0].label}</span>`;
      let hasValues = false;
      indicatorConfig.plots.forEach((plot, idx) => {
        const value = plotValue(indicatorConfig, plot, idx, entry.values);
        if (isEmptyValue(value)) {
          return;
        }
        hasValues = true;
        inner +=
          `<span style="color:${labelColor}">&nbsp;${plot.label}</span>` +
          `<span style="color:${altColor}">&nbsp;${value}</span>`;
      });
      if (hasValues) {
        pills.push(wrapPill(inner));
      }
      continue;
    }

    indicatorConfig.plots.forEach((plot, idx) => {
      const value = plotValue(indicatorConfig, plot, idx, entry.values);
      if (isEmptyValue(value)) {
        return;
      }
      const color = plot.color ?? successColor;
      const inner =
        `<span style="color:${color}">${plot.label}</span>` +
        `<span style="color:${altColor}">&nbsp;${value}</span>`;
      pills.push(wrapPill(inner));
    });
  }
  return pills.join('');
}

// ----- Refresh from chart.exportData() ----------------------------------

function collectStudyIdMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [name, id] of getActiveStudies().entries()) {
    map[String(id)] = name;
  }
  for (const [name, id] of getMaStudies().entries()) {
    map[String(id)] = name;
  }
  const vol = getVolumeStudyId();
  if (vol) {
    map[String(vol)] = 'Volume';
  }
  return map;
}

function buildOrderedEntries(
  byStudy: Record<string, StudyValueEntry[]>,
): StudyDataEntry[] {
  const result: StudyDataEntry[] = [];
  for (const [name, studyId] of getLegendStudyOrder().entries()) {
    const sid = String(studyId);
    const values = byStudy[sid];
    if (values) {
      result.push({ name, values });
    }
  }
  return result;
}

function formatLegendValue(value: number): string {
  if (!Number.isFinite(value)) {
    return '';
  }
  const abs = Math.abs(value);
  if (abs >= 1e9) {
    return `${(value / 1e9).toFixed(2)}B`;
  }
  if (abs >= 1e6) {
    return `${(value / 1e6).toFixed(2)}M`;
  }
  if (abs >= 1e4) {
    return `${(value / 1e3).toFixed(1)}K`;
  }
  if (abs >= 1000) {
    return value.toFixed(2);
  }
  if (abs >= 1) {
    return value.toFixed(2);
  }
  if (abs >= 0.01) {
    return value.toFixed(4);
  }
  return value.toPrecision(4);
}

function hasAnyEmpty(entries: StudyDataEntry[]): boolean {
  for (const entry of entries) {
    for (const value of entry.values) {
      if (isEmptyValue(value.value)) {
        return true;
      }
    }
  }
  return false;
}

function notifyLegendRendered(): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      postToRN('LEGEND_RENDERED', {});
      if (doesLegendOwnLayoutSettle()) {
        setLegendOwnsLayoutSettle(false);
        postToRN('CHART_LAYOUT_SETTLED', {});
      }
    });
  });
}

function clearTimer(): void {
  if (timeoutId !== null) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
}

function startTimeout(gen: number): void {
  clearTimer();
  timeoutId = setTimeout(() => {
    if (gen !== exportGeneration) {
      return;
    }
    retryCount = 0;
    clearTimer();
    notifyLegendRendered();
  }, RENDER_TIMEOUT_MS);
}

function scheduleRetry(gen: number): void {
  if (retryCount >= MAX_RETRIES) {
    retryCount = 0;
    clearTimer();
    notifyLegendRendered();
    return;
  }
  retryCount += 1;
  setTimeout(() => {
    if (gen === exportGeneration) {
      refreshStudyLegendFromExport();
    }
  }, RETRY_DELAY_MS);
}

function renderOverlay(entries: StudyDataEntry[]): void {
  const presets = getPresetMap();
  const widget = getWidget();
  const chart = widget?.activeChart();
  const activeStudies = getActiveStudies();

  const mainEntries: StudyDataEntry[] = [];
  const subPaneEntries: {
    name: string;
    paneIdx: number;
    entry: StudyDataEntry;
  }[] = [];

  for (const entry of entries) {
    const preset = presets[entry.name];
    if (preset?.subPaneLegend && chart) {
      const studyId = activeStudies.get(entry.name);
      const study = studyId ? chart.getStudyById(studyId) : null;
      const paneIdx = study?.paneIndex?.();
      if (paneIdx !== undefined && paneIdx > 0) {
        subPaneEntries.push({ name: entry.name, paneIdx, entry });
        continue;
      }
    }
    mainEntries.push(entry);
  }

  const mainOverlay = document.getElementById(OVERLAY_ID);
  if (mainOverlay) {
    mainOverlay.innerHTML = buildHTML(mainEntries);
  }

  const activeNames = new Set(subPaneEntries.map((subPane) => subPane.name));
  for (const name of subPaneOverlays.keys()) {
    if (!activeNames.has(name)) {
      removeSubPaneOverlay(name);
    }
  }

  for (const { name, paneIdx, entry } of subPaneEntries) {
    const overlay = ensureSubPaneOverlay(name, paneIdx, chart ?? undefined);
    if (overlay) {
      overlay.innerHTML = buildHTML([entry]);
    }
  }

  updateLegendOverlayLayout();
  if (chart) {
    repositionSubPaneOverlays(chart);
  }
}

export function refreshStudyLegendFromExport(): void {
  if (!legendOverlayEnabled) {
    return;
  }
  const widget = getWidget();
  if (!widget || !isChartReady()) {
    return;
  }
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) {
    return;
  }

  const studyIdMap = collectStudyIdMap();
  const studyIds = Object.keys(studyIdMap);
  if (studyIds.length === 0) {
    overlay.innerHTML = '';
    removeAllSubPaneOverlays();
    retryCount = 0;
    clearTimer();
    return;
  }

  exportGeneration += 1;
  const gen = exportGeneration;
  if (retryCount === 0) {
    startTimeout(gen);
  }

  const chart = widget.activeChart();
  chart
    .exportData({
      includeSeries: false,
      includedStudies: studyIds,
    })
    .then((data) => {
      if (gen === exportGeneration) {
        handleExportData(data, gen);
      }
      return undefined;
    })
    .catch(() => scheduleRetry(gen));
}

function isValidExportData(data: TVExportData): boolean {
  return Boolean(data?.schema && data.data && data.data.length > 0);
}

function resolveDisplayValue(
  rawVal: number | undefined,
  colIndex: number,
  displayedData: TVExportData['displayedData'],
): string {
  let displayVal =
    rawVal !== undefined && !Number.isNaN(rawVal)
      ? formatLegendValue(rawVal)
      : '';
  if (displayedData && displayedData.length > 0) {
    const dispRow = displayedData.at(-1);
    if (dispRow?.[colIndex]) {
      displayVal = dispRow[colIndex];
    }
  }
  return displayVal;
}

function buildStudyMap(
  data: TVExportData,
  lastRow: (number | undefined)[],
): Record<string, StudyValueEntry[]> {
  const byStudy: Record<string, StudyValueEntry[]> = {};
  for (let index = 0; index < data.schema.length; index++) {
    const field = data.schema[index];
    if (field.type === 'time' || field.type === 'userTime') {
      continue;
    }
    const sid = field.sourceId ? String(field.sourceId) : '';
    if (!sid) {
      continue;
    }
    if (!byStudy[sid]) {
      byStudy[sid] = [];
    }
    const displayVal = resolveDisplayValue(
      lastRow[index],
      index,
      data.displayedData,
    );
    byStudy[sid].push({ title: field.plotTitle ?? '', value: displayVal });
  }
  return byStudy;
}

function handleExportData(data: TVExportData, gen: number): void {
  if (!isValidExportData(data)) {
    scheduleRetry(gen);
    return;
  }
  const lastRow = data.data.at(-1);
  if (!lastRow) {
    scheduleRetry(gen);
    return;
  }

  const byStudy = buildStudyMap(data, lastRow);
  const entries = buildOrderedEntries(byStudy);
  if (hasAnyEmpty(entries) && retryCount < MAX_RETRIES) {
    scheduleRetry(gen);
    return;
  }

  retryCount = 0;
  renderOverlay(entries);
  clearTimer();
  notifyLegendRendered();
}

/**
 * Used by indicator handlers to request a legend rebuild after a study has
 * been added/removed. Two rAFs to wait for TV's internal layout pass.
 */
export function scheduleLegendRefresh(): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => refreshStudyLegendFromExport());
  });
}

/**
 * Subscribes to a study's onDataLoaded event so the legend refreshes once
 * the study's calculation finishes. Falls back to immediate refresh when
 * the subscription API isn't available.
 *
 * @param chart - The active TradingView chart.
 * @param studyId - The id of the study to subscribe to.
 */
export function subscribeStudyDataLoaded(
  chart: TVActiveChart,
  studyId: StudyId,
): void {
  try {
    const study = chart.getStudyById(studyId);
    if (study?.onDataLoaded) {
      study.onDataLoaded().subscribe(null, () => {
        scheduleLegendRefresh();
      });
      return;
    }
  } catch {
    // Fallthrough to direct refresh.
  }
  scheduleLegendRefresh();
}

// ----- Sub-pane overlay management ----------------------------------------

function subPaneOverlayId(name: string): string {
  return `${OVERLAY_ID}-pane-${name}`;
}

function getSubPaneTopPx(paneIndex: number, chart: TVActiveChart): number {
  const heights = chart.getAllPanesHeight();
  let top = 0;
  for (let i = 0; i < paneIndex && i < heights.length; i++) {
    top += heights[i];
  }
  return top + 4;
}

function ensureSubPaneOverlay(
  name: string,
  paneIndex: number,
  chart?: TVActiveChart,
): HTMLDivElement | null {
  const existing = subPaneOverlays.get(name);
  if (existing && document.contains(existing)) {
    return existing;
  }

  const container = document.getElementById('tv_chart_container');
  if (!container) {
    return null;
  }

  const div = document.createElement('div');
  div.id = subPaneOverlayId(name);
  const topPx = chart ? getSubPaneTopPx(paneIndex, chart) : 0;
  div.style.cssText =
    `position:absolute;top:${topPx}px;left:${OVERLAY_LEFT_PX}px;z-index:5;` +
    `pointer-events:none;display:flex;flex-wrap:wrap;align-items:flex-start;` +
    `column-gap:8px;row-gap:2px;`;
  container.appendChild(div);
  subPaneOverlays.set(name, div);
  return div;
}

export function removeSubPaneOverlay(name: string): void {
  const el = subPaneOverlays.get(name);
  if (el) {
    el.remove();
    subPaneOverlays.delete(name);
  }
}

function removeAllSubPaneOverlays(): void {
  for (const el of subPaneOverlays.values()) {
    el.remove();
  }
  subPaneOverlays.clear();
}

function repositionSubPaneOverlays(chart: TVActiveChart): void {
  const activeStudies = getActiveStudies();
  for (const [name, el] of subPaneOverlays) {
    const studyId = activeStudies.get(name);
    const study = studyId ? chart.getStudyById(studyId) : null;
    const paneIdx = study?.paneIndex?.();
    if (paneIdx !== undefined && paneIdx > 0) {
      el.style.top = `${getSubPaneTopPx(paneIdx, chart)}px`;
    }
  }
}

// ----- Layout ------------------------------------------------------------

const FALLBACK_SCALE_WIDTH = 48;
const SCALE_GAP = 4;

function getPriceScaleWidth(): number {
  const widget = getWidget();
  if (!widget) {
    return FALLBACK_SCALE_WIDTH;
  }
  const chart = widget.activeChart();
  const panes = chart.getPanes?.();
  if (!panes || panes.length === 0) {
    return FALLBACK_SCALE_WIDTH;
  }
  const scales = panes[0].getRightPriceScales?.();
  const width = scales?.[0]?.width?.();
  return width && width > 0 ? width : FALLBACK_SCALE_WIDTH;
}

export function updateLegendOverlayLayout(): void {
  const container = document.getElementById('tv_chart_container');
  if (!container) {
    return;
  }
  const containerWidth = container.clientWidth;
  if (containerWidth <= 0) {
    return;
  }

  const scaleWidth = getPriceScaleWidth();
  const maxWidth = `${containerWidth - OVERLAY_LEFT_PX - scaleWidth - SCALE_GAP}px`;

  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay) {
    overlay.style.maxWidth = maxWidth;
  }

  for (const el of subPaneOverlays.values()) {
    el.style.maxWidth = maxWidth;
  }
}

/** Test-only: clear all module-local state between cases. */
export function _resetLegendForTests(): void {
  exportGeneration = 0;
  retryCount = 0;
  clearTimer();
  legendOverlayEnabled = false;
  legendConfig = undefined;
  removeAllSubPaneOverlays();
}
