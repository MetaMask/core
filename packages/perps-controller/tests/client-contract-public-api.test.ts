import { describe, expect, it } from 'vitest';

// Imports through the package entrypoint, the way a client does, so a dropped
// or renamed client-contract export fails here.
import {
  PERPS_ERROR_CODES,
  PERPS_ERROR_COPY,
  PERPS_ORDER_TYPE_LABELS,
  aggregateOrderBookLevels,
  estimateCrossLiquidationPrice,
  estimateCrossMaintenanceMargin,
  getBatchOperationStatus,
  getPerpsErrorCopy,
  groupOrderBook,
} from '../src/index.js';
import type {
  BatchOperationStatus,
  CancelOrdersResult,
  CrossMarginPosition,
  GroupedOrderBook,
  PerpsErrorCopy,
  PerpsOrderLimits,
  PerpsOrderTypeLabel,
  PerpsPricePrecision,
  WithBatchOperationStatus,
} from '../src/index.js';

describe('client contract exports', () => {
  it('groups an order book on the grid boundary from the entrypoint', () => {
    const grouped: GroupedOrderBook = groupOrderBook(
      {
        bids: [
          {
            price: '100.1',
            size: '1',
            total: '1',
            notional: '100.1',
            totalNotional: '100.1',
          },
        ],
        asks: [],
      },
      0.1,
      10,
    );

    expect(grouped.bids[0].price).toBe('100.1');
    expect(aggregateOrderBookLevels(grouped.bids, 1, 'ask')[0].price).toBe(
      '101',
    );
  });

  it('estimates cross maintenance and liquidation from the entrypoint', () => {
    const position: CrossMarginPosition = {
      notional: 10_000,
      marginTiers: [{ lowerBound: 0, maxLeverage: 50 }],
    };
    const maintenanceMargin = estimateCrossMaintenanceMargin([position]);

    expect(maintenanceMargin).toBeCloseTo(100, 10);
    expect(
      estimateCrossLiquidationPrice({
        isLong: true,
        markPrice: 100_000,
        positionSize: 0.1,
        accountValue: 1_000,
        maintenanceMargin: maintenanceMargin as number,
        marginTiers: position.marginTiers,
      }),
    ).toBeCloseTo(100_000 - 900 / 0.1 / 0.99, 6);
  });

  it('exports error copy and order-type labels', () => {
    const copy: PerpsErrorCopy = getPerpsErrorCopy(
      PERPS_ERROR_CODES.RATE_LIMIT_EXCEEDED,
    );
    const label: PerpsOrderTypeLabel = PERPS_ORDER_TYPE_LABELS.scale;

    expect(copy).toBe(PERPS_ERROR_COPY.RATE_LIMIT_EXCEEDED);
    expect(label.key).toBe('perps.order.type.scale.title');
  });

  it('exports the batch status and capability types', () => {
    const result: WithBatchOperationStatus<CancelOrdersResult> = {
      success: true,
      successCount: 1,
      failureCount: 1,
      results: [],
      status: 'partial',
    };
    const status: BatchOperationStatus = getBatchOperationStatus(result);
    const precision: PerpsPricePrecision = {
      type: 'fixed_decimals',
      decimals: 2,
      tickSize: '0.01',
    };
    const limits: PerpsOrderLimits = { sizeDecimals: 4 };

    expect(status).toBe(result.status);
    expect([precision.type, limits.sizeDecimals]).toStrictEqual([
      'fixed_decimals',
      4,
    ]);
  });
});
