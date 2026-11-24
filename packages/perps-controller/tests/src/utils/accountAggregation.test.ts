import { describe, expect, it } from 'vitest';

import type { AccountState } from '../../../src/types/index.js';
import {
  aggregateAccountTotals,
  buildAggregatedAccountState,
  calculateAccountReturnOnEquity,
} from '../../../src/utils/accountAggregation.js';
import { calculateWeightedReturnOnEquity } from '../../../src/utils/accountUtils.js';

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

  it('keeps a non-finite RoE instead of reporting zero', () => {
    expect(
      aggregateAccountTotals([
        { ...state, marginUsed: '100', unrealizedPnl: 'NaN' },
      ]).returnOnEquity,
    ).toBe('NaN');
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

describe('calculateAccountReturnOnEquity', () => {
  it('returns unrealized PnL over margin used in percent', () => {
    expect(
      calculateAccountReturnOnEquity({ unrealizedPnl: 12, marginUsed: 120 }),
    ).toBe(10);
    expect(
      calculateAccountReturnOnEquity({
        unrealizedPnl: '-3',
        marginUsed: '60',
      }),
    ).toBe(-5);
  });

  it.each([
    { unrealizedPnl: 12, marginUsed: 0 },
    { unrealizedPnl: 12, marginUsed: -1 },
    { unrealizedPnl: 'abc', marginUsed: 120 },
    { unrealizedPnl: 12, marginUsed: Number.POSITIVE_INFINITY },
  ])('returns undefined for %o', (params) => {
    expect(calculateAccountReturnOnEquity(params)).toBeUndefined();
  });

  it('matches the margin-weighted RoE when each position RoE is its PnL over margin used', () => {
    // Equal only under that condition: 37.5 / 250 and -9 / 150.
    const positions = [
      { unrealizedPnl: 37.5, marginUsed: 250, returnOnEquity: 0.15 },
      { unrealizedPnl: -9, marginUsed: 150, returnOnEquity: -0.06 },
    ];

    expect(
      calculateAccountReturnOnEquity({ unrealizedPnl: 28.5, marginUsed: 400 }),
    ).toBeCloseTo(Number(calculateWeightedReturnOnEquity(positions)) * 100);
  });

  it('differs from the margin-weighted RoE of venue position RoE over another margin', () => {
    // Hyperliquid's position RoE is over the entry initial margin (150 here),
    // not the current marginUsed (200), so its stream's account RoE differs.
    const positions = [
      { unrealizedPnl: 30, marginUsed: 200, returnOnEquity: 0.2 },
      { unrealizedPnl: 0, marginUsed: 100, returnOnEquity: 0 },
    ];

    expect(
      calculateAccountReturnOnEquity({ unrealizedPnl: 30, marginUsed: 300 }),
    ).toBe(10);
    expect(
      Number(calculateWeightedReturnOnEquity(positions)) * 100,
    ).toBeCloseTo(13.333, 3);
  });
});
