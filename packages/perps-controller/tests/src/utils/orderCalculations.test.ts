import {
  calculateFinalPositionSize,
  getMaxAllowedAmount,
} from '../../../src/utils/orderCalculations.js';

/**
 * Margin HyperLiquid reserves for a resting order, which is based on the price
 * the order is submitted at, not the market price the size was derived from.
 *
 * @param options - The order details.
 * @param options.usdAmount - Order notional in USD, priced at the market price.
 * @param options.assetPrice - Current market (mid) price of the asset.
 * @param options.assetSzDecimals - Size decimals for the asset.
 * @param options.leverage - Leverage the order is placed with.
 * @param options.orderPrice - Price the order is submitted at.
 * @returns The margin the exchange reserves for the resulting order.
 */
function exchangeRequiredMargin({
  usdAmount,
  assetPrice,
  assetSzDecimals,
  leverage,
  orderPrice,
}: {
  usdAmount: number;
  assetPrice: number;
  assetSzDecimals: number;
  leverage: number;
  orderPrice: number;
}): number {
  const { finalPositionSize } = calculateFinalPositionSize({
    usdAmount: usdAmount.toString(),
    currentPrice: assetPrice,
    szDecimals: assetSzDecimals,
    leverage,
  });

  return (finalPositionSize * orderPrice) / leverage;
}

describe('getMaxAllowedAmount', () => {
  it('returns 0 when inputs are missing', () => {
    expect(
      getMaxAllowedAmount({
        spendableBalance: 0,
        assetPrice: 100000,
        assetSzDecimals: 5,
        leverage: 3,
      }),
    ).toBe(0);

    expect(
      getMaxAllowedAmount({
        spendableBalance: 100,
        assetPrice: 0,
        assetSzDecimals: 5,
        leverage: 3,
      }),
    ).toBe(0);
  });

  // Regression: TAT-3344 - "order 0: insufficient margin to place order".
  // A limit order resting above the market price has margin reserved at that
  // submitted price, so the max must be sized off it and not off the mid.
  it('keeps a max limit order resting above the market price within the balance', () => {
    const spendableBalance = 1000;
    const assetPrice = 100000;
    const assetSzDecimals = 5;
    const leverage = 5;
    const limitPrice = assetPrice * 1.05;

    const maxAmount = getMaxAllowedAmount({
      spendableBalance,
      assetPrice,
      assetSzDecimals,
      leverage,
      orderType: 'limit',
      limitPrice,
    });

    expect(maxAmount).toBeGreaterThan(0);
    expect(
      exchangeRequiredMargin({
        usdAmount: maxAmount,
        assetPrice,
        assetSzDecimals,
        leverage,
        orderPrice: limitPrice,
      }),
    ).toBeLessThanOrEqual(spendableBalance);
  });

  it('scales the reduction with how far above the market price the order rests', () => {
    const params = {
      spendableBalance: 1000,
      assetPrice: 100000,
      assetSzDecimals: 5,
      leverage: 5,
      orderType: 'limit' as const,
    };

    const near = getMaxAllowedAmount({
      ...params,
      limitPrice: params.assetPrice * 1.02,
    });
    const far = getMaxAllowedAmount({
      ...params,
      limitPrice: params.assetPrice * 1.2,
    });

    expect(far).toBeLessThan(near);
    expect(
      exchangeRequiredMargin({
        usdAmount: far,
        assetPrice: params.assetPrice,
        assetSzDecimals: params.assetSzDecimals,
        leverage: params.leverage,
        orderPrice: params.assetPrice * 1.2,
      }),
    ).toBeLessThanOrEqual(params.spendableBalance);
  });

  it('does not reduce the max for orders that are not priced above the market', () => {
    const params = {
      spendableBalance: 1000,
      assetPrice: 100000,
      assetSzDecimals: 5,
      leverage: 5,
    };
    const uncapped = getMaxAllowedAmount(params);

    // A resting buy sits below the market price, so it reserves less margin.
    expect(
      getMaxAllowedAmount({
        ...params,
        orderType: 'limit',
        limitPrice: params.assetPrice * 0.9,
      }),
    ).toBe(uncapped);

    // A marketable order is charged at the fill price, not the padded price it
    // is submitted with, so it is unaffected too.
    expect(getMaxAllowedAmount({ ...params, orderType: 'market' })).toBe(
      uncapped,
    );

    expect(uncapped).toBeLessThanOrEqual(
      params.spendableBalance * params.leverage,
    );
  });

  it('steps down by one size increment when rounding pushes margin over the balance', () => {
    // szDecimals 0 means the size increment is a whole unit, so the rounded-up
    // size can exceed the balance without the step-down.
    const spendableBalance = 100;
    const assetPrice = 30;
    const assetSzDecimals = 0;
    const leverage = 3;

    const maxAmount = getMaxAllowedAmount({
      spendableBalance,
      assetPrice,
      assetSzDecimals,
      leverage,
    });

    expect(
      exchangeRequiredMargin({
        usdAmount: maxAmount,
        assetPrice,
        assetSzDecimals,
        leverage,
        orderPrice: assetPrice,
      }),
    ).toBeLessThanOrEqual(spendableBalance);
  });
});
