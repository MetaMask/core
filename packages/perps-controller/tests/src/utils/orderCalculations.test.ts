import { BASIS_POINTS_DIVISOR } from '../../../src/constants/hyperLiquidConfig.js';
import { ORDER_SLIPPAGE_CONFIG } from '../../../src/constants/perpsConfig.js';
import {
  calculateFinalPositionSize,
  calculateOrderPriceAndSize,
  getMaxAllowedAmount,
} from '../../../src/utils/orderCalculations.js';

/**
 * Margin HyperLiquid charges for an order, which is based on the price the order
 * is actually submitted at, not the market price the size was derived from.
 *
 * @param options - The order details.
 * @param options.usdAmount - Order notional in USD, priced at the market price.
 * @param options.assetPrice - Current market (mid) price of the asset.
 * @param options.assetSzDecimals - Size decimals for the asset.
 * @param options.leverage - Leverage the order is placed with.
 * @param options.isBuy - Whether the order is a buy.
 * @param options.maxSlippageBps - Max slippage in basis points.
 * @returns The margin the exchange requires for the resulting order.
 */
function exchangeRequiredMargin({
  usdAmount,
  assetPrice,
  assetSzDecimals,
  leverage,
  isBuy,
  maxSlippageBps,
}: {
  usdAmount: number;
  assetPrice: number;
  assetSzDecimals: number;
  leverage: number;
  isBuy: boolean;
  maxSlippageBps?: number;
}): number {
  const { finalPositionSize } = calculateFinalPositionSize({
    usdAmount: usdAmount.toString(),
    currentPrice: assetPrice,
    szDecimals: assetSzDecimals,
    leverage,
  });

  const { orderPrice, formattedSize } = calculateOrderPriceAndSize({
    orderType: 'market',
    isBuy,
    finalPositionSize,
    currentPrice: assetPrice,
    maxSlippageBps,
    szDecimals: assetSzDecimals,
  });

  return (parseFloat(formattedSize) * orderPrice) / leverage;
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
  // Market buys are submitted at market price * (1 + slippage) and the exchange
  // charges margin against that price, so the max must be sized off it too.
  it('keeps a max market buy within the spendable balance', () => {
    const spendableBalance = 1000;
    const assetPrice = 100000;
    const assetSzDecimals = 5;
    const leverage = 5;

    const maxAmount = getMaxAllowedAmount({
      spendableBalance,
      assetPrice,
      assetSzDecimals,
      leverage,
    });

    expect(maxAmount).toBeGreaterThan(0);
    expect(
      exchangeRequiredMargin({
        usdAmount: maxAmount,
        assetPrice,
        assetSzDecimals,
        leverage,
        isBuy: true,
      }),
    ).toBeLessThanOrEqual(spendableBalance);
  });

  it('honors a custom max slippage for market buys', () => {
    const spendableBalance = 500;
    const assetPrice = 2500;
    const assetSzDecimals = 4;
    const leverage = 10;
    const maxSlippageBps = 1000;

    const maxAmount = getMaxAllowedAmount({
      spendableBalance,
      assetPrice,
      assetSzDecimals,
      leverage,
      isBuy: true,
      maxSlippageBps,
    });

    expect(
      exchangeRequiredMargin({
        usdAmount: maxAmount,
        assetPrice,
        assetSzDecimals,
        leverage,
        isBuy: true,
        maxSlippageBps,
      }),
    ).toBeLessThanOrEqual(spendableBalance);
  });

  it('applies the slippage haircut by default so unaware callers stay safe', () => {
    const params = {
      spendableBalance: 1000,
      assetPrice: 100000,
      assetSzDecimals: 5,
      leverage: 5,
    };
    const slippageMultiplier =
      1 + ORDER_SLIPPAGE_CONFIG.DefaultMarketSlippageBps / BASIS_POINTS_DIVISOR;

    expect(getMaxAllowedAmount(params)).toBe(
      getMaxAllowedAmount({ ...params, isBuy: true, orderType: 'market' }),
    );
    expect(getMaxAllowedAmount(params)).toBeLessThan(
      (params.spendableBalance * params.leverage) / slippageMultiplier,
    );
  });

  it('does not apply the slippage haircut to sells or limit orders', () => {
    const params = {
      spendableBalance: 1000,
      assetPrice: 100000,
      assetSzDecimals: 5,
      leverage: 5,
    };

    const buyMax = getMaxAllowedAmount({ ...params, isBuy: true });
    const sellMax = getMaxAllowedAmount({ ...params, isBuy: false });
    const limitMax = getMaxAllowedAmount({ ...params, orderType: 'limit' });

    expect(sellMax).toBeGreaterThan(buyMax);
    expect(limitMax).toBe(sellMax);
    expect(sellMax).toBeLessThanOrEqual(
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
      isBuy: false,
    });

    expect(
      exchangeRequiredMargin({
        usdAmount: maxAmount,
        assetPrice,
        assetSzDecimals,
        leverage,
        isBuy: false,
      }),
    ).toBeLessThanOrEqual(spendableBalance);
  });
});
