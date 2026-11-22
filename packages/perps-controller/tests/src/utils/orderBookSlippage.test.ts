import { describe, expect, it } from 'vitest';

import type { OrderBookLevel } from '../../../src/types/index.js';
import { estimateOrderBookSlippage } from '../../../src/utils/orderBookSlippage.js';

const level = (price: string, size: string): OrderBookLevel => ({
  price,
  size,
  total: '0',
  notional: '0',
  totalNotional: '0',
});

// Sizes differ from the cumulative totals so a formula that read `total`
// instead of `size` would give a different answer.
const orderBook = {
  midPrice: '100',
  bids: [level('99.9', '1'), level('99.5', '4'), level('99', '10')],
  asks: [level('100.1', '1'), level('100.5', '4'), level('101', '10')],
};

describe('estimateOrderBookSlippage', () => {
  it('fills within the first level', () => {
    const estimate = estimateOrderBookSlippage({
      orderBook,
      isBuy: true,
      sizeUsd: 50,
    });

    expect(estimate.canFill).toBe(true);
    expect(estimate.estimatedSlippageBps).toBeCloseTo(10, 9);
    expect(estimate.worstSlippageBps).toBeCloseTo(10, 9);
  });

  it('weights the fill price across levels for a buy', () => {
    // 3 units: 1 at 100.1 and 2 at 100.5 -> VWAP 100.3666…
    const estimate = estimateOrderBookSlippage({
      orderBook,
      isBuy: true,
      size: 3,
    });

    expect(estimate.estimatedSlippageBps).toBeCloseTo(36.6667, 3);
    expect(estimate.worstSlippageBps).toBeCloseTo(50, 9);
    expect(estimate.canFill).toBe(true);
  });

  it('measures a sell against the bids', () => {
    const estimate = estimateOrderBookSlippage({
      orderBook,
      isBuy: false,
      size: '-3',
    });

    expect(estimate.estimatedSlippageBps).toBeCloseTo(36.6667, 3);
    expect(estimate.worstSlippageBps).toBeCloseTo(50, 9);
  });

  it('measures from a supplied reference price', () => {
    expect(
      estimateOrderBookSlippage({
        orderBook,
        isBuy: true,
        size: 1,
        referencePrice: '100.1',
      }).estimatedSlippageBps,
    ).toBe(0);
  });

  it('floors favourable fills at zero', () => {
    expect(
      estimateOrderBookSlippage({
        orderBook,
        isBuy: true,
        size: 1,
        referencePrice: 101,
      }),
    ).toStrictEqual({
      estimatedSlippageBps: 0,
      worstSlippageBps: 0,
      canFill: true,
    });
  });

  it('skips unreadable and empty levels', () => {
    expect(
      estimateOrderBookSlippage({
        orderBook: {
          ...orderBook,
          asks: [
            level('abc', '5'),
            level('100.1', '0'),
            level('0', '5'),
            level('100.5', '5'),
          ],
        },
        isBuy: true,
        size: 1,
      }).worstSlippageBps,
    ).toBeCloseTo(50, 9);
  });

  it('reports a size the book cannot hold', () => {
    expect(
      estimateOrderBookSlippage({ orderBook, isBuy: true, sizeUsd: 100000 }),
    ).toStrictEqual({
      estimatedSlippageBps: undefined,
      worstSlippageBps: undefined,
      canFill: false,
    });
    expect(
      estimateOrderBookSlippage({
        orderBook: { ...orderBook, asks: [] },
        isBuy: true,
        size: 1,
      }).canFill,
    ).toBe(false);
  });

  it.each([
    { orderBook, isBuy: true },
    { orderBook, isBuy: true, sizeUsd: 0 },
    { orderBook, isBuy: true, size: 'abc' },
    { orderBook: { ...orderBook, midPrice: '0' }, isBuy: true, sizeUsd: 10 },
    { orderBook, isBuy: true, sizeUsd: 10, referencePrice: 'x' },
  ])('returns all fields undefined for unusable input %#', (params) => {
    expect(estimateOrderBookSlippage(params)).toStrictEqual({
      estimatedSlippageBps: undefined,
      worstSlippageBps: undefined,
      canFill: undefined,
    });
  });
});
