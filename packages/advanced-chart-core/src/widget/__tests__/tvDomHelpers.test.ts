import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  eachChartDocument,
  findOuterChartMarkupTable,
} from '../tvDomHelpers.js';

const mockEl = (className: string): Element =>
  ({
    className,
    classList: {
      contains: (token: string): boolean =>
        className.split(/\s+/u).includes(token),
    },
  }) as unknown as Element;

describe('findOuterChartMarkupTable', () => {
  it('returns null when no document is provided', () => {
    expect(findOuterChartMarkupTable(null)).toBeNull();
    expect(findOuterChartMarkupTable(undefined)).toBeNull();
  });

  it('skips pane and axis-container elements and returns the outer one', () => {
    const list = [
      mockEl('chart-markup-table pane'),
      mockEl('chart-markup-table price-axis-container'),
      mockEl('chart-markup-table time-axis'),
      mockEl('chart-markup-table'),
    ];
    const doc = {
      querySelectorAll: vi.fn().mockReturnValue(list),
    } as unknown as Document;
    expect(findOuterChartMarkupTable(doc)).toBe(list[3]);
  });

  it('falls back to the first element when only pane/axis exist', () => {
    const list = [mockEl('chart-markup-table pane')];
    const doc = {
      querySelectorAll: vi.fn().mockReturnValue(list),
    } as unknown as Document;
    expect(findOuterChartMarkupTable(doc)).toBe(list[0]);
  });

  it('returns null when the document has zero matches', () => {
    const doc = {
      querySelectorAll: vi.fn().mockReturnValue([]),
    } as unknown as Document;
    expect(findOuterChartMarkupTable(doc)).toBeNull();
  });
});

describe('eachChartDocument', () => {
  let mockContainer: HTMLElement | null;

  beforeEach(() => {
    mockContainer = null;
    vi.spyOn(document, 'getElementById').mockImplementation(((id: string) =>
      id === 'tv_chart_container'
        ? mockContainer
        : null) as typeof document.getElementById);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls fn(document) at minimum', () => {
    const fn = vi.fn();
    eachChartDocument(fn);
    expect(fn).toHaveBeenCalledWith(document);
  });

  it('calls fn(iframe.contentDocument) when present', () => {
    const iframeDoc = {} as Document;
    mockContainer = {
      querySelector: vi.fn().mockReturnValue({ contentDocument: iframeDoc }),
    } as unknown as HTMLElement;
    const fn = vi.fn();
    eachChartDocument(fn);
    expect(fn).toHaveBeenCalledWith(document);
    expect(fn).toHaveBeenCalledWith(iframeDoc);
  });

  it('continues when fn(document) throws', () => {
    let secondCalled = false;
    eachChartDocument((doc) => {
      if (doc === document) {
        throw new Error('doc throws');
      }
      secondCalled = true;
    });
    // Even with document throwing, we attempted the iframe path
    // (which is a no-op when no container exists).
    expect(secondCalled).toBe(false);
  });
});
