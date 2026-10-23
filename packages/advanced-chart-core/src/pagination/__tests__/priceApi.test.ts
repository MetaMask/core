import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import {
  _resetStateForTests,
  bumpOhlcvGeneration,
  getOhlcvData,
  setOhlcvPagination,
} from '../../core/state.js';
import { fetchOlderBarsFromPriceApi, OHLCV_BASE_URL } from '../priceApi.js';

type MockBridge = {
  postMessage: Mock<(...args: [string]) => void>;
};

const installRNBridge = (): MockBridge => {
  const bridge: MockBridge = { postMessage: vi.fn() };
  window.ReactNativeWebView = bridge;
  return bridge;
};

const mockFetchOk = (body: unknown): Mock =>
  vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(body),
  } as Response);

describe('pagination/priceApi', () => {
  beforeEach(() => {
    _resetStateForTests();
    delete window.ReactNativeWebView;
  });

  afterEach(() => {
    delete (globalThis as { fetch?: typeof fetch }).fetch;
  });

  it('returns noData when there is no cursor', async () => {
    const result = await fetchOlderBarsFromPriceApi({ oldestAtDefer: 100 });
    expect(result).toStrictEqual({ olderBars: [], noData: true });
  });

  it('returns noData when hasMore is false', async () => {
    setOhlcvPagination({
      nextCursor: 'abc',
      hasMore: false,
      assetId: 'eip155:1/slip44:60',
      vsCurrency: 'usd',
    });
    const result = await fetchOlderBarsFromPriceApi({ oldestAtDefer: 100 });
    expect(result).toStrictEqual({ olderBars: [], noData: true });
  });

  it('fetches older bars via the Price API and merges them into state', async () => {
    setOhlcvPagination({
      nextCursor: 'abc=',
      hasMore: true,
      assetId: 'eip155:1/slip44:60',
      vsCurrency: 'usd',
    });
    (globalThis as { fetch?: typeof fetch }).fetch = mockFetchOk({
      data: [
        { timestamp: 50, open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 },
        { timestamp: 80, open: 2, high: 3, low: 1.5, close: 2.5, volume: 200 },
      ],
      nextCursor: 'def=',
      hasNext: true,
    }) as unknown as typeof fetch;

    const result = await fetchOlderBarsFromPriceApi({ oldestAtDefer: 100 });

    expect(
      (globalThis as unknown as { fetch?: Mock }).fetch,
    ).toHaveBeenCalledWith(
      `${OHLCV_BASE_URL}/eip155:1/slip44:60?nextCursor=abc%3D&vsCurrency=usd`,
    );
    expect(result.olderBars).toHaveLength(2);
    expect(result.noData).toBe(false);
    expect(getOhlcvData()).toHaveLength(2);
  });

  it('drops the response when generation changes mid-flight', async () => {
    setOhlcvPagination({
      nextCursor: 'abc',
      hasMore: true,
      assetId: 'a',
      vsCurrency: 'usd',
    });
    (globalThis as { fetch?: typeof fetch }).fetch = vi
      .fn()
      .mockImplementation(() => {
        bumpOhlcvGeneration();
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ data: [], nextCursor: null, hasNext: false }),
        } as Response);
      }) as unknown as typeof fetch;

    const result = await fetchOlderBarsFromPriceApi({ oldestAtDefer: 100 });
    expect(result).toStrictEqual({ olderBars: [], noData: true });
  });

  it('reports network failures to RN and returns noData', async () => {
    const bridge = installRNBridge();
    setOhlcvPagination({
      nextCursor: 'abc',
      hasMore: true,
      assetId: 'a',
      vsCurrency: null,
    });
    (globalThis as { fetch?: typeof fetch }).fetch = vi
      .fn()
      .mockRejectedValue(new Error('offline')) as unknown as typeof fetch;

    const result = await fetchOlderBarsFromPriceApi({ oldestAtDefer: 100 });
    expect(result).toStrictEqual({ olderBars: [], noData: true });
    expect(bridge.postMessage).toHaveBeenCalledWith(
      expect.stringContaining('"message":"offline"'),
    );
  });

  it('only returns bars strictly older than oldestAtDefer', async () => {
    setOhlcvPagination({
      nextCursor: 'abc',
      hasMore: true,
      assetId: 'a',
      vsCurrency: 'usd',
    });
    (globalThis as { fetch?: typeof fetch }).fetch = mockFetchOk({
      data: [
        { timestamp: 50, open: 1, high: 1, low: 1, close: 1 },
        { timestamp: 150, open: 1, high: 1, low: 1, close: 1 },
      ],
      nextCursor: null,
      hasNext: false,
    }) as unknown as typeof fetch;

    const result = await fetchOlderBarsFromPriceApi({ oldestAtDefer: 100 });
    expect(result.olderBars).toHaveLength(1);
    expect(result.olderBars[0].time).toBe(50);
  });

  it('reports HTTP non-ok response to RN and returns noData', async () => {
    const bridge = installRNBridge();
    setOhlcvPagination({
      nextCursor: 'abc',
      hasMore: true,
      assetId: 'a',
      vsCurrency: 'usd',
    });
    (globalThis as { fetch?: typeof fetch }).fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: () => Promise.resolve({}),
    } as unknown as Response) as unknown as typeof fetch;

    const result = await fetchOlderBarsFromPriceApi({ oldestAtDefer: 100 });

    expect(result).toStrictEqual({ olderBars: [], noData: true });
    expect(bridge.postMessage).toHaveBeenCalledWith(
      expect.stringContaining('"message":"OHLCV API error: 429"'),
    );
  });

  it('returns noData silently when generation is stale on HTTP error', async () => {
    const bridge = installRNBridge();
    setOhlcvPagination({
      nextCursor: 'abc',
      hasMore: true,
      assetId: 'a',
      vsCurrency: 'usd',
    });
    (globalThis as { fetch?: typeof fetch }).fetch = vi
      .fn()
      .mockImplementation(() => {
        bumpOhlcvGeneration();
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({}),
        } as unknown as Response);
      }) as unknown as typeof fetch;

    const result = await fetchOlderBarsFromPriceApi({ oldestAtDefer: 100 });

    expect(result).toStrictEqual({ olderBars: [], noData: true });
    // Should NOT report error because generation changed
    expect(bridge.postMessage).not.toHaveBeenCalled();
  });

  it('reports JSON parse failure to RN and returns noData', async () => {
    const bridge = installRNBridge();
    setOhlcvPagination({
      nextCursor: 'abc',
      hasMore: true,
      assetId: 'a',
      vsCurrency: 'usd',
    });
    (globalThis as { fetch?: typeof fetch }).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new Error('Unexpected token')),
    } as unknown as Response) as unknown as typeof fetch;

    const result = await fetchOlderBarsFromPriceApi({ oldestAtDefer: 100 });

    expect(result).toStrictEqual({ olderBars: [], noData: true });
    expect(bridge.postMessage).toHaveBeenCalledWith(
      expect.stringContaining('"message":"Unexpected token"'),
    );
  });

  it('reports invalid payload when data is not an array', async () => {
    const bridge = installRNBridge();
    setOhlcvPagination({
      nextCursor: 'abc',
      hasMore: true,
      assetId: 'a',
      vsCurrency: 'usd',
    });
    (globalThis as { fetch?: typeof fetch }).fetch = mockFetchOk({
      data: 'not-an-array',
      nextCursor: null,
      hasNext: false,
    }) as unknown as typeof fetch;

    const result = await fetchOlderBarsFromPriceApi({ oldestAtDefer: 100 });

    expect(result).toStrictEqual({ olderBars: [], noData: true });
    expect(bridge.postMessage).toHaveBeenCalledWith(
      expect.stringContaining(
        '"message":"OHLCV API response: invalid payload"',
      ),
    );
  });

  it('omits vsCurrency param from URL when vsCurrency is null', async () => {
    setOhlcvPagination({
      nextCursor: 'abc',
      hasMore: true,
      assetId: 'eip155:1/slip44:60',
      vsCurrency: null,
    });
    (globalThis as { fetch?: typeof fetch }).fetch = mockFetchOk({
      data: [],
      nextCursor: null,
      hasNext: false,
    }) as unknown as typeof fetch;

    await fetchOlderBarsFromPriceApi({ oldestAtDefer: 100 });

    const calledUrl = (
      (globalThis as unknown as { fetch?: Mock }).fetch as Mock
    ).mock.calls[0][0] as string;
    expect(calledUrl).toBe(
      `${OHLCV_BASE_URL}/eip155:1/slip44:60?nextCursor=abc`,
    );
    expect(calledUrl).not.toContain('vsCurrency');
  });

  it('does not prepend or notify when response yields zero bars', async () => {
    setOhlcvPagination({
      nextCursor: 'abc',
      hasMore: true,
      assetId: 'a',
      vsCurrency: 'usd',
    });
    (globalThis as { fetch?: typeof fetch }).fetch = mockFetchOk({
      data: [],
      nextCursor: null,
      hasNext: false,
    }) as unknown as typeof fetch;

    const result = await fetchOlderBarsFromPriceApi({ oldestAtDefer: 100 });

    expect(result).toStrictEqual({ olderBars: [], noData: true });
    // State should remain empty — prependOhlcvBars was never called
    expect(getOhlcvData()).toHaveLength(0);
  });
});
