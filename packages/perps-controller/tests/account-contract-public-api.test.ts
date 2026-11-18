import type { InfoClient } from '@nktkas/hyperliquid';
import { describe, expect, it, vi } from 'vitest';

// Checks the account/position contract through the package entrypoint, the
// way a client imports it, so a dropped export or broken wiring fails here.
import {
  PERPS_ERROR_CODES,
  adaptPositionFromSDK,
  aggregateAccountStates,
  calculateWeightedReturnOnEquity,
  queryStandaloneClearinghouseStates,
} from '../src/index.js';
import type {
  AccountState,
  Position,
  StandaloneClearinghouseStatesResult,
} from '../src/index.js';

type ClearinghouseState = Awaited<ReturnType<InfoClient['clearinghouseState']>>;

const clearinghouseState = {
  assetPositions: [],
  marginSummary: {
    accountValue: '100',
    totalMarginUsed: '0',
    totalNtlPos: '0',
    totalRawUsd: '100',
  },
  crossMarginSummary: {
    accountValue: '100',
    totalMarginUsed: '0',
    totalNtlPos: '0',
    totalRawUsd: '100',
  },
  crossMaintenanceMarginUsed: '0',
  withdrawable: '100',
  time: 0,
} as ClearinghouseState;

describe('@metamask/perps-controller account contract', () => {
  it('reports answered and failed DEXs from queryStandaloneClearinghouseStates', async () => {
    const cause = new Error('xyz down');
    const clearinghouseStateRead = vi
      .fn<InfoClient['clearinghouseState']>()
      .mockResolvedValueOnce(clearinghouseState)
      .mockRejectedValueOnce(cause);
    const client: Pick<InfoClient, 'clearinghouseState'> = {
      clearinghouseState: clearinghouseStateRead,
    };

    const result: StandaloneClearinghouseStatesResult =
      await queryStandaloneClearinghouseStates(client as InfoClient, '0xabc', [
        null,
        'xyz',
      ]);

    expect(result).toStrictEqual({
      results: [{ dex: null, data: clearinghouseState }],
      failedDexs: [{ dex: 'xyz', error: cause }],
    });
  });

  it('exposes the unknown-not-zero account and position fields', () => {
    expect(PERPS_ERROR_CODES.ORDERS_FAILED).toBe('ORDERS_FAILED');
    expect(() => aggregateAccountStates([])).toThrow(
      PERPS_ERROR_CODES.ACCOUNT_STATE_FAILED,
    );
    expect(
      Number(
        calculateWeightedReturnOnEquity([
          { unrealizedPnl: '10', returnOnEquity: '10', marginUsed: '100' },
          { unrealizedPnl: '0', returnOnEquity: '0', marginUsed: '100' },
        ]),
      ),
    ).toBe(5);

    const partial: AccountState = {
      totalBalance: '100',
      spendableBalance: '100',
      withdrawableBalance: '100',
      marginUsed: '0',
      unrealizedPnl: '0',
      returnOnEquity: '0',
      unavailableSubAccounts: ['xyz'],
    };
    // Funding and leverage are optional: an unknown value is absent.
    const unknownPosition: Position = {
      symbol: 'ETH',
      size: '1',
      entryPrice: '100',
      positionValue: '100',
      unrealizedPnl: '0',
      marginUsed: '10',
      leverage: { type: 'cross' },
      liquidationPrice: null,
      maxLeverage: 10,
      returnOnEquity: '0',
      takeProfitCount: 0,
      stopLossCount: 0,
    };
    expect(partial.unavailableSubAccounts).toStrictEqual(['xyz']);
    expect(unknownPosition.cumulativeFunding).toBeUndefined();

    const position = adaptPositionFromSDK(
      {
        type: 'oneWay',
        position: {
          coin: 'ETH',
          szi: '1',
          entryPx: '100',
          positionValue: '100',
          unrealizedPnl: '0',
          returnOnEquity: '0',
          liquidationPx: null,
          marginUsed: '10',
          maxLeverage: 10,
          leverage: { type: 'cross', value: 10 },
          cumFunding: { allTime: '0', sinceOpen: '0', sinceChange: '0' },
        },
      },
      {
        ...clearinghouseState.crossMarginSummary,
        accountValue: '5',
        totalMarginUsed: '10',
      },
    );
    expect(position.marginUsed).toBe('10');
    expect(position.displayMarginUsed).toBe('5');
  });
});
