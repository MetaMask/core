// Sub-pane height ratio handler.
//
// Ported from chartLogic.js handleSetSubPaneLayout (~line 783) +
// applySubPaneHeightRatio (~line 750). The consumer-supplied ratio
// (subPaneHeightRatio prop) governs the size of RSI/MACD sub-panes.

import { reportErrorToRN } from '../../core/bridge.js';
import {
  getActiveStudies,
  getSubPaneHeightRatio,
  getWidget,
  isChartReady,
  setSubPaneHeightRatio,
} from '../../core/state.js';
import type { TVActiveChart } from '../../core/types.js';
import type { SetSubPaneLayoutMessage } from '../../messages/contract.js';

const MIN_MAIN_PX = 72;

export function hasActiveSubPaneIndicators(): boolean {
  const widget = getWidget();
  if (!widget) {return false;}
  const chart = widget.activeChart();
  for (const studyId of getActiveStudies().values()) {
    const study = chart.getStudyById(studyId);
    const paneIdx = study?.paneIndex?.();
    if (paneIdx !== undefined && paneIdx > 0) {return true;}
  }
  return false;
}

export function applySubPaneHeightRatio(chart: TVActiveChart): void {
  const ratio = getSubPaneHeightRatio();
  if (ratio === null) {return;}
  try {
    const heights = chart.getAllPanesHeight();
    if (heights.length < 2) {return;}
    const total = heights.reduce((sum, height) => sum + height, 0);
    const bottomCount = heights.length - 1;

    let bottomTotal = Math.round(total * ratio * bottomCount);
    let main = total - bottomTotal;
    if (main < MIN_MAIN_PX) {
      main = MIN_MAIN_PX;
      bottomTotal = total - main;
    }

    const newHeights = [main];
    let remaining = bottomTotal;
    for (let i = 0; i < bottomCount; i++) {
      const paneHeight =
        i === bottomCount - 1
          ? remaining
          : Math.floor(bottomTotal / bottomCount);
      newHeights.push(paneHeight);
      remaining -= paneHeight;
    }
    chart.setAllPanesHeight(newHeights);
  } catch (error) {
    reportErrorToRN(error);
  }
}

export function handleSetSubPaneLayout(
  payload: SetSubPaneLayoutMessage['payload'],
): void {
  if (payload.heightRatio === null || payload.heightRatio === undefined) {
    setSubPaneHeightRatio(null);
    return;
  }
  const ratio = payload.heightRatio;
  if (typeof ratio !== 'number' || !(ratio > 0 && ratio <= 1)) {
    return;
  }
  setSubPaneHeightRatio(ratio);

  const widget = getWidget();
  if (widget && isChartReady() && hasActiveSubPaneIndicators()) {
    applySubPaneHeightRatio(widget.activeChart());
  }
}
