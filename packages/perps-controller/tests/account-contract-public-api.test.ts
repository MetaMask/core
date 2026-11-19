import type { InfoClient } from '@nktkas/hyperliquid';
import { describe, expect, it, vi } from 'vitest';

// Checks the account/position contract through the package entrypoint, the
// way a client imports it, so a dropped export or broken wiring fails here.
import {
  PERPS_ERROR_CODES,
  adaptAccountStateFromSDK,
  adaptPositionFromSDK,
  getPerpsErrorCopy,
  aggregateAccountStates,
  calculateWeightedReturnOnEquity,
  queryStandaloneClearinghouseStates,
} from '../src/index.js';
import type { StandaloneClearinghouseStatesResult } from '../src/index.js';

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

  it('exposes copy for the new read and estimate failures', () => {
    expect(getPerpsErrorCopy(PERPS_ERROR_CODES.ORDERS_FAILED)?.key).toBe(
      'perps.errors.ordersFailed',
    );
    expect(
      getPerpsErrorCopy(PERPS_ERROR_CODES.LIQUIDATION_PRICE_UNAVAILABLE)?.key,
    ).toBe('perps.errors.liquidationPriceUnavailable');
  });

  it('derives account and cross position values through the public helpers', () => {
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

    const account = adaptAccountStateFromSDK(clearinghouseState);
    expect(account.totalBalance).toBe('100');
    expect(account).not.toHaveProperty('unavailableSubAccounts');

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
          marginUsed: '30',
          maxLeverage: 10,
          leverage: { type: 'cross', value: 10 },
          cumFunding: { allTime: '1', sinceOpen: '0.5', sinceChange: '0.1' },
        },
      },
      {
        ...clearinghouseState.crossMarginSummary,
        accountValue: '50',
        totalMarginUsed: '120',
      },
    );
    expect(position.marginUsed).toBe('30');
    expect(position.displayMarginUsed).toBe('12.5');
    expect(position.cumulativeFunding).toStrictEqual({
      allTime: '1',
      sinceOpen: '0.5',
      sinceChange: '0.1',
    });
  });
});
