import { describe, expect, it } from 'vitest';

import type { AccountState } from '../../../src/types/index.js';
import {
  aggregateAccountTotals,
  buildAggregatedAccountState,
} from '../../../src/utils/accountAggregation.js';

const state: AccountState = {
  totalBalance: '100',
  spendableBalance: '60',
  withdrawableBalance: '50',
  marginUsed: '40',
  unrealizedPnl: '10',
  returnOnEquity: '25',
};

const additiveFields = [
  'totalBalance',
  'spendableBalance',
  'withdrawableBalance',
  'marginUsed',
  'unrealizedPnl',
] as const;

describe('buildAggregatedAccountState', () => {
  describe.each(additiveFields)('%s validation', (field) => {
    it.each(['--', 'NaN', 'Infinity', '-Infinity', '', undefined, null])(
      'excludes a venue reporting %s instead of a finite decimal',
      (value) => {
        const invalid = { ...state, [field]: value };
        const result = buildAggregatedAccountState({
          entries: [
            { status: 'available', providerId: 'hyperliquid', state },
            { status: 'available', providerId: 'lighter', state: invalid },
          ],
        });

        expect(result).toStrictEqual({
          ...state,
          providerStates: {
            hyperliquid: {
              status: 'available',
              providerId: 'hyperliquid',
              state,
            },
            lighter: { status: 'unavailable', providerId: 'lighter' },
          },
          aggregate: {
            status: 'partial',
            availableProviders: ['hyperliquid'],
            unavailableProviders: ['lighter'],
          },
        });
        expect(invalid[field]).toBe(value);
      },
    );
  });

  it('returns null when no venue has valid data', () => {
    expect(
      buildAggregatedAccountState({
        entries: [
          {
            status: 'available',
            providerId: 'lighter',
            state: { ...state, marginUsed: '--' },
          },
          { status: 'pending', providerId: 'hyperliquid' },
        ],
      }),
    ).toBeNull();
  });

  it('accepts a confirmed zero balance without marking it unavailable', () => {
    const zeroState: AccountState = {
      totalBalance: '0',
      spendableBalance: '0',
      withdrawableBalance: '0',
      marginUsed: '0',
      unrealizedPnl: '0',
      returnOnEquity: '0',
    };
    const result = buildAggregatedAccountState({
      entries: [
        { status: 'available', providerId: 'lighter', state: zeroState },
      ],
    });
    expect(result?.aggregate).toStrictEqual({
      status: 'complete',
      availableProviders: ['lighter'],
      unavailableProviders: [],
    });
    expect(result?.totalBalance).toBe('0');
  });
});

describe('aggregateAccountTotals', () => {
  it('sums decimals exactly and weights RoE by margin, not by venue', () => {
    expect(
      aggregateAccountTotals([
        { ...state, marginUsed: '0.1', unrealizedPnl: '0.01' },
        { ...state, marginUsed: '0.2', unrealizedPnl: '0.08' },
      ]),
    ).toMatchObject({
      marginUsed: '0.3',
      unrealizedPnl: '0.09',
      returnOnEquity: '30',
    });
  });

  it.each(['0', '-1'])(
    'uses zero RoE for nonpositive margin %s',
    (marginUsed) => {
      expect(
        aggregateAccountTotals([{ ...state, marginUsed }]).returnOnEquity,
      ).toBe('0');
    },
  );
});
