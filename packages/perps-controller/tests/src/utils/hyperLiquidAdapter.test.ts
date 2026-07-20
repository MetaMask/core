import type { FrontendOrder } from '../../../src/types/hyperliquid-types';
import { adaptOrderFromSDK } from '../../../src/utils/hyperLiquidAdapter';

/**
 * Builds a minimal valid `FrontendOrder` fixture, overridable per test.
 *
 * @param overrides - Fields to override on the base fixture.
 * @returns A `FrontendOrder` fixture.
 */
function buildFrontendOrder(
  overrides: Partial<FrontendOrder> = {},
): FrontendOrder {
  return {
    coin: 'BTC',
    side: 'B',
    limitPx: '50000',
    sz: '0.1',
    oid: 12345,
    timestamp: Date.now(),
    origSz: '0.1',
    triggerCondition: 'N/A',
    isTrigger: false,
    triggerPx: '',
    children: [],
    isPositionTpsl: false,
    reduceOnly: false,
    orderType: 'Limit',
    ...overrides,
  } as FrontendOrder;
}

describe('adaptOrderFromSDK', () => {
  it('converts a child take-profit order with limitPx instead of triggerPx', () => {
    const frontendOrder = buildFrontendOrder({
      coin: 'ADA',
      oid: 66666,
      children: [
        buildFrontendOrder({
          oid: 66667,
          orderType: 'Take Profit Limit',
          isTrigger: true,
          // HyperLiquid represents "no trigger price" as an empty string,
          // with the actual price carried in limitPx instead.
          triggerPx: '',
          limitPx: '0.6',
        }),
      ],
    });

    const result = adaptOrderFromSDK(frontendOrder);

    expect(result.takeProfitPrice).toBe('0.6');
    expect(result.takeProfitOrderId).toBe('66667');
  });

  it('converts a child stop-loss order with limitPx instead of triggerPx', () => {
    const frontendOrder = buildFrontendOrder({
      coin: 'ADA',
      oid: 66666,
      children: [
        buildFrontendOrder({
          oid: 66668,
          orderType: 'Stop Limit',
          isTrigger: true,
          triggerPx: '',
          limitPx: '0.4',
        }),
      ],
    });

    const result = adaptOrderFromSDK(frontendOrder);

    expect(result.stopLossPrice).toBe('0.4');
    expect(result.stopLossOrderId).toBe('66668');
  });

  it('prefers triggerPx over limitPx when triggerPx is a non-empty value', () => {
    const frontendOrder = buildFrontendOrder({
      coin: 'ADA',
      oid: 66666,
      children: [
        buildFrontendOrder({
          oid: 66667,
          orderType: 'Take Profit Limit',
          isTrigger: true,
          triggerPx: '0.75',
          limitPx: '0.6',
        }),
      ],
    });

    const result = adaptOrderFromSDK(frontendOrder);

    expect(result.takeProfitPrice).toBe('0.75');
  });

  it('does not set take-profit/stop-loss fields when there are no children', () => {
    const frontendOrder = buildFrontendOrder({ children: [] });

    const result = adaptOrderFromSDK(frontendOrder);

    expect(result.takeProfitPrice).toBeUndefined();
    expect(result.stopLossPrice).toBeUndefined();
  });
});
