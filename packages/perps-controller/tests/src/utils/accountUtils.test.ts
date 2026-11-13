/* eslint-disable */
import { describe, expect, it } from 'vitest';

import { PERPS_CONSTANTS } from '../../../src/constants/perpsConfig.js';
import type { AccountState } from '../../../src/types/index.js';
import type { CalculateAccountSummaryParams } from '../../../src/utils/accountUtils.js';
import {
  addSpotBalanceToAccountState,
  aggregateAccountStates,
  calculateAccountSummary,
  calculateWeightedReturnOnEquity,
  getCrossCollateral,
  getCrossMarginSpotCollateral,
  getSpotBalance,
  sumCrossMarginSummaries,
} from '../../../src/utils/accountUtils.js';

describe('aggregateAccountStates', () => {
  const fallback: AccountState = {
    spendableBalance: PERPS_CONSTANTS.FallbackDataDisplay,
    withdrawableBalance: PERPS_CONSTANTS.FallbackDataDisplay,
    totalBalance: PERPS_CONSTANTS.FallbackDataDisplay,
    marginUsed: PERPS_CONSTANTS.FallbackDataDisplay,
    unrealizedPnl: PERPS_CONSTANTS.FallbackDataDisplay,
    returnOnEquity: PERPS_CONSTANTS.FallbackDataDisplay,
  };

  it('returns fallback when given an empty array', () => {
    expect(aggregateAccountStates([])).toEqual(fallback);
  });

  it('canonicalizes balances when given one state', () => {
    const single: AccountState = {
      spendableBalance: '100.000000',
      withdrawableBalance: '100.000000',
      totalBalance: '200.000000',
      marginUsed: '50',
      unrealizedPnl: '10',
      returnOnEquity: '20',
    };
    expect(aggregateAccountStates([single])).toEqual({
      ...single,
      spendableBalance: '100',
      withdrawableBalance: '100',
      totalBalance: '200',
    });
  });

  it('sums numeric fields from two states and recalculates ROE', () => {
    const stateA: AccountState = {
      spendableBalance: '100',
      withdrawableBalance: '100',
      totalBalance: '200',
      marginUsed: '50',
      unrealizedPnl: '10',
      returnOnEquity: '20',
    };
    const stateB: AccountState = {
      spendableBalance: '50',
      withdrawableBalance: '50',
      totalBalance: '150',
      marginUsed: '30',
      unrealizedPnl: '6',
      returnOnEquity: '20',
    };

    const result = aggregateAccountStates([stateA, stateB]);

    expect(parseFloat(result.spendableBalance)).toBe(150);
    expect(parseFloat(result.withdrawableBalance)).toBe(150);
    expect(parseFloat(result.totalBalance)).toBe(350);
    expect(parseFloat(result.marginUsed)).toBe(80);
    expect(parseFloat(result.unrealizedPnl)).toBe(16);
    // ROE = (16 / 80) * 100 = 20
    expect(parseFloat(result.returnOnEquity)).toBe(20);
  });

  it('sums numeric fields from three states', () => {
    const states: AccountState[] = [
      {
        spendableBalance: '100',
        withdrawableBalance: '100',
        totalBalance: '200',
        marginUsed: '50',
        unrealizedPnl: '10',
        returnOnEquity: '20',
      },
      {
        spendableBalance: '200',
        withdrawableBalance: '200',
        totalBalance: '300',
        marginUsed: '100',
        unrealizedPnl: '30',
        returnOnEquity: '30',
      },
      {
        spendableBalance: '50',
        withdrawableBalance: '50',
        totalBalance: '100',
        marginUsed: '50',
        unrealizedPnl: '5',
        returnOnEquity: '10',
      },
    ];

    const result = aggregateAccountStates(states);

    expect(parseFloat(result.spendableBalance)).toBe(350);
    expect(parseFloat(result.withdrawableBalance)).toBe(350);
    expect(parseFloat(result.totalBalance)).toBe(600);
    expect(parseFloat(result.marginUsed)).toBe(200);
    expect(parseFloat(result.unrealizedPnl)).toBe(45);
    // ROE = (45 / 200) * 100 = 22.5
    expect(parseFloat(result.returnOnEquity)).toBe(22.5);
  });

  it('does not mutate the input state object', () => {
    const single: AccountState = {
      spendableBalance: '100',
      withdrawableBalance: '100',
      totalBalance: '200',
      marginUsed: '50',
      unrealizedPnl: '10',
      returnOnEquity: '99',
    };
    const result = aggregateAccountStates([single]);
    // result gets recalculated ROE = (10/50)*100 = 20
    expect(result.returnOnEquity).toBe('20');
    // original must be untouched
    expect(single.returnOnEquity).toBe('99');
  });

  it('sets ROE to 0 when total marginUsed is 0', () => {
    const state: AccountState = {
      spendableBalance: '100',
      withdrawableBalance: '100',
      totalBalance: '100',
      marginUsed: '0',
      unrealizedPnl: '0',
      returnOnEquity: '0',
    };
    const result = aggregateAccountStates([state]);
    expect(result.returnOnEquity).toBe('0');
  });

  it('handles negative unrealizedPnl correctly', () => {
    const stateA: AccountState = {
      spendableBalance: '80',
      withdrawableBalance: '80',
      totalBalance: '180',
      marginUsed: '100',
      unrealizedPnl: '-20',
      returnOnEquity: '-20',
    };
    const stateB: AccountState = {
      spendableBalance: '40',
      withdrawableBalance: '40',
      totalBalance: '90',
      marginUsed: '50',
      unrealizedPnl: '-10',
      returnOnEquity: '-20',
    };

    const result = aggregateAccountStates([stateA, stateB]);

    expect(parseFloat(result.marginUsed)).toBe(150);
    expect(parseFloat(result.unrealizedPnl)).toBe(-30);
    // ROE = (-30 / 150) * 100 = -20
    expect(parseFloat(result.returnOnEquity)).toBe(-20);
  });

  it('handles decimal values correctly', () => {
    const stateA: AccountState = {
      spendableBalance: '100.50',
      withdrawableBalance: '100.50',
      totalBalance: '200.75',
      marginUsed: '50.25',
      unrealizedPnl: '10.10',
      returnOnEquity: '20.1',
    };
    const stateB: AccountState = {
      spendableBalance: '50.50',
      withdrawableBalance: '50.50',
      totalBalance: '150.25',
      marginUsed: '30.75',
      unrealizedPnl: '6.90',
      returnOnEquity: '22.4',
    };

    const result = aggregateAccountStates([stateA, stateB]);

    expect(parseFloat(result.spendableBalance)).toBeCloseTo(151, 0);
    expect(parseFloat(result.withdrawableBalance)).toBeCloseTo(151, 0);
    expect(parseFloat(result.totalBalance)).toBeCloseTo(351, 0);
    expect(parseFloat(result.marginUsed)).toBeCloseTo(81, 0);
    expect(parseFloat(result.unrealizedPnl)).toBeCloseTo(17, 0);
  });

  it('preserves the exact subtotal when aggregating DEX states', () => {
    const stateA: AccountState = {
      spendableBalance: '0.0000009',
      withdrawableBalance: '0.0000009',
      totalBalance: '0.0000009',
      marginUsed: '0',
      unrealizedPnl: '0',
      returnOnEquity: '0',
    };
    const stateB: AccountState = {
      spendableBalance: '0.0000009',
      withdrawableBalance: '0.0000009',
      totalBalance: '0.0000009',
      marginUsed: '0',
      unrealizedPnl: '0',
      returnOnEquity: '0',
    };

    const result = aggregateAccountStates([stateA, stateB]);

    expect(result.spendableBalance).toBe('0.0000018');
    expect(result.withdrawableBalance).toBe('0.0000018');
    expect(result.totalBalance).toBe('0.0000018');
  });
});

describe('spot balance helpers', () => {
  it('returns zero spot balance when no spot state is provided', () => {
    expect(getSpotBalance()).toBe(0);
  });

  it('emits the same exact balance for equivalent decimal inputs', () => {
    const accountState: AccountState = {
      spendableBalance: '0',
      withdrawableBalance: '0',
      totalBalance: '0',
      marginUsed: '0',
      unrealizedPnl: '0',
      returnOnEquity: '0',
    };

    const results = [
      ['8.000006', '6.524823'],
      ['4.000004', '2.524821'],
    ].map(([total, hold]) =>
      addSpotBalanceToAccountState(
        accountState,
        { balances: [{ coin: 'USDC', total, hold }] } as never,
        { foldIntoCollateral: true },
      ),
    );

    expect(
      results.map(
        ({ spendableBalance, withdrawableBalance, totalBalance }) => ({
          spendableBalance,
          withdrawableBalance,
          totalBalance,
        }),
      ),
    ).toEqual([
      {
        spendableBalance: '1.475183',
        withdrawableBalance: '1.475183',
        totalBalance: '1.475183',
      },
      {
        spendableBalance: '1.475183',
        withdrawableBalance: '1.475183',
        totalBalance: '1.475183',
      },
    ]);
  });

  it('preserves a genuine one-micro-USDC balance change', () => {
    const accountState: AccountState = {
      spendableBalance: '0',
      withdrawableBalance: '0',
      totalBalance: '0',
      marginUsed: '0',
      unrealizedPnl: '0',
      returnOnEquity: '0',
    };
    const getWithdrawableBalance = (total: string) =>
      addSpotBalanceToAccountState(
        accountState,
        {
          balances: [{ coin: 'USDC', total, hold: '6.524823' }],
        } as never,
        { foldIntoCollateral: true },
      ).withdrawableBalance;

    expect(getWithdrawableBalance('8.000006')).toBe('1.475183');
    expect(getWithdrawableBalance('8.000007')).toBe('1.475184');
  });

  it('rounds once after combining fractional perps and spot balances', () => {
    const perpsState: AccountState = {
      spendableBalance: '10.0000009',
      withdrawableBalance: '10.0000009',
      totalBalance: '10.0000009',
      marginUsed: '0',
      unrealizedPnl: '0',
      returnOnEquity: '0',
    };

    const result = addSpotBalanceToAccountState(
      aggregateAccountStates([perpsState]),
      {
        balances: [{ coin: 'USDC', total: '0.0000009', hold: '0' }],
      } as never,
      { foldIntoCollateral: true },
    );

    expect(result.spendableBalance).toBe('10.000001');
    expect(result.withdrawableBalance).toBe('10.000001');
    expect(result.totalBalance).toBe('10.000001');
  });

  it('bumps totalBalance, spendableBalance, and withdrawableBalance by spot USDC without mutating the input', () => {
    const accountState: AccountState = {
      spendableBalance: '0',
      withdrawableBalance: '0',
      totalBalance: '100',
      marginUsed: '0',
      unrealizedPnl: '0',
      returnOnEquity: '0',
    };

    const result = addSpotBalanceToAccountState(
      accountState,
      {
        balances: [
          { coin: 'USDC', total: '25.5' },
          { coin: 'HYPE', total: '0.5' },
        ],
      } as never,
      { foldIntoCollateral: true },
    );

    // Only USDC contributes — non-stablecoin spot assets are not convertible
    // to perps collateral and must not inflate balances.
    expect(result.totalBalance).toBe('125.5');
    expect(result.spendableBalance).toBe('25.5');
    expect(result.withdrawableBalance).toBe('25.5');
    expect(accountState.totalBalance).toBe('100');
  });

  it('ignores non-collateral spot balances entirely', () => {
    const accountState: AccountState = {
      spendableBalance: '0',
      withdrawableBalance: '0',
      totalBalance: '50',
      marginUsed: '0',
      unrealizedPnl: '0',
      returnOnEquity: '0',
    };

    const result = addSpotBalanceToAccountState(accountState, {
      balances: [
        { coin: 'HYPE', total: '1000' },
        { coin: 'PURR', total: '5000' },
      ],
    } as never);

    expect(result).toBe(accountState);
  });

  it('excludes non-USDC-only spot balance from funded-state totals', () => {
    const accountState: AccountState = {
      spendableBalance: '0',
      withdrawableBalance: '0',
      totalBalance: '0',
      marginUsed: '0',
      unrealizedPnl: '0',
      returnOnEquity: '0',
    };

    const result = addSpotBalanceToAccountState(accountState, {
      balances: [
        { coin: 'DAI', total: '75.25' },
        { coin: 'HYPE', total: '999' },
      ],
    } as never);

    expect(result).toBe(accountState);
  });

  it('adds only the USDC portion when USDC and a non-USDC token are both present', () => {
    const accountState: AccountState = {
      spendableBalance: '0',
      withdrawableBalance: '0',
      totalBalance: '10',
      marginUsed: '0',
      unrealizedPnl: '0',
      returnOnEquity: '0',
    };

    const result = addSpotBalanceToAccountState(
      accountState,
      {
        balances: [
          { coin: 'USDC', total: '20' },
          { coin: 'DAI', total: '30' },
          { coin: 'HYPE', total: '9999' },
        ],
      } as never,
      { foldIntoCollateral: true },
    );

    expect(result.totalBalance).toBe('30');
    expect(result.spendableBalance).toBe('20');
    expect(result.withdrawableBalance).toBe('20');
  });

  it('does not fold USDC spot collateral into spendable/withdrawable for Standard modes', () => {
    const accountState: AccountState = {
      spendableBalance: '7',
      withdrawableBalance: '7',
      totalBalance: '10',
      marginUsed: '0',
      unrealizedPnl: '0',
      returnOnEquity: '0',
    };

    const result = addSpotBalanceToAccountState(
      accountState,
      {
        balances: [{ coin: 'USDC', total: '25', hold: '5' }],
      } as never,
      { foldIntoCollateral: false },
    );

    expect(result.totalBalance).toBe('30');
    expect(result.spendableBalance).toBe('7');
    expect(result.withdrawableBalance).toBe('7');
  });

  it('keeps spot USDC separate from withdrawable even when withdrawable=0 in Standard mode', () => {
    // Standard / DEX-abstraction users with $0 perps withdrawable but free
    // spot USDC must NOT see spot fold into withdrawable — withdraw3 only
    // draws from the perps ledger in those modes. Folding would surface a
    // withdrawable amount the API can't actually fulfill.
    const accountState: AccountState = {
      spendableBalance: '0',
      withdrawableBalance: '0',
      totalBalance: '0',
      marginUsed: '0',
      unrealizedPnl: '0',
      returnOnEquity: '0',
    };

    const result = addSpotBalanceToAccountState(
      accountState,
      {
        balances: [{ coin: 'USDC', total: '2500', hold: '0' }],
      } as never,
      { foldIntoCollateral: false },
    );

    expect(result.spendableBalance).toBe('0');
    expect(result.withdrawableBalance).toBe('0');
    expect(result.totalBalance).toBe('2500');
  });

  it('subtracts spot hold from total and only folds free spot into spendable/withdrawable', () => {
    const accountState: AccountState = {
      spendableBalance: '10',
      withdrawableBalance: '10',
      totalBalance: '100',
      marginUsed: '0',
      unrealizedPnl: '0',
      returnOnEquity: '0',
    };

    const result = addSpotBalanceToAccountState(
      accountState,
      {
        balances: [{ coin: 'USDC', total: '40', hold: '15' }],
      } as never,
      { foldIntoCollateral: true },
    );

    // totalBalance += spotTotal - spotHold = 100 + 40 - 15 = 125
    expect(parseFloat(result.totalBalance)).toBe(125);
    // spendable/withdrawable += freeSpot = 10 + (40 - 15) = 35
    expect(parseFloat(result.spendableBalance)).toBe(35);
    expect(parseFloat(result.withdrawableBalance)).toBe(35);
  });

  it('returns the input untouched when no collateral spot balance is present', () => {
    const accountState: AccountState = {
      spendableBalance: '1',
      withdrawableBalance: '1',
      totalBalance: '2',
      marginUsed: '3',
      unrealizedPnl: '4',
      returnOnEquity: '5',
    };

    const result = addSpotBalanceToAccountState(accountState, {
      balances: [],
    } as never);

    expect(result).toBe(accountState);
  });

  it('does NOT fold spot into spendable/withdrawable when foldIntoCollateral is false (e.g. HL Standard mode)', () => {
    const accountState: AccountState = {
      spendableBalance: '5',
      withdrawableBalance: '5',
      totalBalance: '5',
      marginUsed: '0',
      unrealizedPnl: '0',
      returnOnEquity: '0',
    };

    const result = addSpotBalanceToAccountState(
      accountState,
      { balances: [{ coin: 'USDC', total: '30' }] } as never,
      { foldIntoCollateral: false },
    );

    // Total still reflects combined wealth (display).
    expect(parseFloat(result.totalBalance)).toBe(35);
    // Spendable/withdrawable must remain perps-only — spot isn't auto-collateral
    // on Standard mode, so surfacing a folded value would mislead the validation
    // hook into approving submissions HL will reject.
    expect(result.spendableBalance).toBe('5');
    expect(result.withdrawableBalance).toBe('5');
  });

  it('folds spot into spendable/withdrawable when foldIntoCollateral is explicitly true', () => {
    const accountState: AccountState = {
      spendableBalance: '5',
      withdrawableBalance: '5',
      totalBalance: '5',
      marginUsed: '0',
      unrealizedPnl: '0',
      returnOnEquity: '0',
    };

    const result = addSpotBalanceToAccountState(
      accountState,
      { balances: [{ coin: 'USDC', total: '30' }] } as never,
      { foldIntoCollateral: true },
    );

    expect(parseFloat(result.totalBalance)).toBe(35);
    expect(parseFloat(result.spendableBalance)).toBe(35);
    expect(parseFloat(result.withdrawableBalance)).toBe(35);
  });

  it('publishes spotCollateral from the abstraction mode without treating an unknown mode as zero', () => {
    const accountState: AccountState = {
      spendableBalance: '100',
      withdrawableBalance: '100',
      totalBalance: '100',
      marginUsed: '0',
      unrealizedPnl: '0',
      returnOnEquity: '0',
    };
    const spot = {
      balances: [{ coin: 'USDC', total: '900', hold: '0' }],
    } as never;

    const unified = addSpotBalanceToAccountState(accountState, spot, {
      foldIntoCollateral: true,
      abstractionMode: 'unifiedAccount',
    });
    expect(unified.spotCollateral).toBe('900');
    expect(unified.spendableBalance).toBe('1000');

    const standard = addSpotBalanceToAccountState(accountState, spot, {
      foldIntoCollateral: false,
      abstractionMode: 'disabled',
    });
    expect(standard.spotCollateral).toBe('0');
    expect(standard.spendableBalance).toBe('100');

    const unresolved = addSpotBalanceToAccountState(accountState, spot, {
      foldIntoCollateral: false,
      abstractionMode: null,
    });
    expect(unresolved.spotCollateral).toBeUndefined();
    expect(unresolved.spendableBalance).toBe('100');
  });
});

describe('getCrossMarginSpotCollateral', () => {
  const freeSpot = {
    balances: [{ coin: 'USDC', total: '900', hold: '0' }],
  } as never;
  const spotWithHold = {
    balances: [{ coin: 'USDC', total: '40', hold: '15' }],
  } as never;

  it('returns 0 for Standard when spot is present but is not collateral', () => {
    expect(getCrossMarginSpotCollateral(freeSpot, 'disabled')).toBe('0');
    expect(getCrossMarginSpotCollateral(freeSpot, 'default')).toBe('0');
  });

  it('returns free spot USDC for Unified', () => {
    expect(getCrossMarginSpotCollateral(freeSpot, 'unifiedAccount')).toBe(
      '900',
    );
  });

  it('returns free spot USDC for portfolio margin', () => {
    expect(getCrossMarginSpotCollateral(freeSpot, 'portfolioMargin')).toBe(
      '900',
    );
  });

  it('subtracts the hold for Unified and never goes negative', () => {
    expect(getCrossMarginSpotCollateral(spotWithHold, 'unifiedAccount')).toBe(
      '25',
    );
    expect(
      getCrossMarginSpotCollateral(
        { balances: [{ coin: 'USDC', total: '10', hold: '40' }] } as never,
        'portfolioMargin',
      ),
    ).toBe('0');
  });

  it('returns undefined when spot state is missing', () => {
    expect(
      getCrossMarginSpotCollateral(undefined, 'unifiedAccount'),
    ).toBeUndefined();
    expect(
      getCrossMarginSpotCollateral(null, 'portfolioMargin'),
    ).toBeUndefined();
  });

  it('returns undefined when the abstraction mode is unresolved', () => {
    expect(getCrossMarginSpotCollateral(freeSpot, undefined)).toBeUndefined();
    expect(getCrossMarginSpotCollateral(freeSpot, null)).toBeUndefined();
  });

  it('ignores non-USDC balances when the spot state is known', () => {
    expect(
      getCrossMarginSpotCollateral(
        { balances: [{ coin: 'HYPE', total: '500', hold: '0' }] } as never,
        'unifiedAccount',
      ),
    ).toBe('0');
    expect(
      getCrossMarginSpotCollateral({ balances: [] } as never, 'unifiedAccount'),
    ).toBe('0');
  });

  describe('malformed USDC amounts', () => {
    it.each([
      ['invalid total', { coin: 'USDC', total: 'invalid', hold: '0' }],
      ['invalid hold', { coin: 'USDC', total: '900', hold: 'invalid' }],
      ['non-finite total', { coin: 'USDC', total: 'Infinity', hold: '0' }],
      ['non-finite hold', { coin: 'USDC', total: '900', hold: 'NaN' }],
      ['missing total', { coin: 'USDC', hold: '0' }],
      ['missing hold', { coin: 'USDC', total: '900' }],
      ['empty total', { coin: 'USDC', total: '', hold: '0' }],
      ['null hold', { coin: 'USDC', total: '900', hold: null }],
    ])('returns undefined for Unified with %s', (_label, balance) => {
      const spotState = { balances: [balance] } as never;

      expect(
        getCrossMarginSpotCollateral(spotState, 'unifiedAccount'),
      ).toBeUndefined();
      expect(
        getCrossMarginSpotCollateral(spotState, 'portfolioMargin'),
      ).toBeUndefined();
    });

    it('returns undefined when one of several USDC balances is malformed', () => {
      const spotState = {
        balances: [
          { coin: 'USDC', total: '900', hold: '0' },
          { coin: 'USDC', total: '50', hold: 'invalid' },
        ],
      } as never;

      expect(
        getCrossMarginSpotCollateral(spotState, 'unifiedAccount'),
      ).toBeUndefined();
    });

    it('returns undefined when balances is not a list', () => {
      expect(
        getCrossMarginSpotCollateral({} as never, 'unifiedAccount'),
      ).toBeUndefined();
      expect(
        getCrossMarginSpotCollateral(
          { balances: 'nope' } as never,
          'unifiedAccount',
        ),
      ).toBeUndefined();
    });

    it('ignores a malformed non-USDC balance', () => {
      const spotState = {
        balances: [
          { coin: 'USDC', total: '900', hold: '0' },
          { coin: 'HYPE', total: 'invalid', hold: 'invalid' },
        ],
      } as never;

      expect(getCrossMarginSpotCollateral(spotState, 'unifiedAccount')).toBe(
        '900',
      );
    });

    it('keeps a genuine zero for a valid empty or fully held balance', () => {
      expect(
        getCrossMarginSpotCollateral(
          { balances: [] } as never,
          'unifiedAccount',
        ),
      ).toBe('0');
      expect(
        getCrossMarginSpotCollateral(
          { balances: [{ coin: 'USDC', total: '0', hold: '0' }] } as never,
          'unifiedAccount',
        ),
      ).toBe('0');
      expect(
        getCrossMarginSpotCollateral(
          { balances: [{ coin: 'USDC', total: '25', hold: '25' }] } as never,
          'unifiedAccount',
        ),
      ).toBe('0');
    });

    it('does not read the amounts for Standard, which is always 0', () => {
      expect(
        getCrossMarginSpotCollateral(
          {
            balances: [{ coin: 'USDC', total: '900', hold: 'invalid' }],
          } as never,
          'disabled',
        ),
      ).toBe('0');
    });

    it('keeps the ratio unknown rather than computing it from a guess', () => {
      const summary = calculateAccountSummary({
        totalEquity: '1000',
        crossMarginSummary: {
          accountValue: '100',
          maintenanceMargin: '60',
          marginUsed: '60',
          notional: '0',
        },
        spotCollateral: getCrossMarginSpotCollateral(
          {
            balances: [{ coin: 'USDC', total: '900', hold: 'invalid' }],
          } as never,
          'unifiedAccount',
        ),
      });

      expect(summary.accountRatio).toBeUndefined();
      expect(summary.crossMarginUsage).toBeUndefined();
    });
  });

  it('makes the venue ratio 6% when 900 of free spot backs a 100 perps account', () => {
    const crossMarginSummary = {
      accountValue: '100',
      maintenanceMargin: '60',
      marginUsed: '60',
      notional: '0',
    };
    const unified = calculateAccountSummary({
      totalEquity: '1000',
      crossMarginSummary,
      spotCollateral: getCrossMarginSpotCollateral(freeSpot, 'unifiedAccount'),
    });
    expect(unified.accountRatio).toBeCloseTo(0.06);
    expect(unified.crossMarginUsage).toBeCloseTo(0.06);

    const standard = calculateAccountSummary({
      totalEquity: '100',
      crossMarginSummary,
      spotCollateral: getCrossMarginSpotCollateral(freeSpot, 'disabled'),
    });
    expect(standard.accountRatio).toBeCloseTo(0.6);

    const unknown = calculateAccountSummary({
      totalEquity: '100',
      crossMarginSummary,
      spotCollateral: getCrossMarginSpotCollateral(freeSpot, null),
    });
    expect(unknown.accountRatio).toBeUndefined();
    expect(unknown.crossMarginUsage).toBeUndefined();
  });
});

describe('calculateWeightedReturnOnEquity', () => {
  it('returns 0 for empty array', () => {
    expect(calculateWeightedReturnOnEquity([])).toBe('0');
  });

  it('returns the single account ROE for one account', () => {
    const result = calculateWeightedReturnOnEquity([
      { unrealizedPnl: '10', returnOnEquity: '20' },
    ]);
    expect(parseFloat(result)).toBeCloseTo(20, 5);
  });
});

describe('cross margin summary aggregation', () => {
  const base: AccountState = {
    spendableBalance: '100',
    withdrawableBalance: '100',
    totalBalance: '200',
    marginUsed: '50',
    unrealizedPnl: '10',
    returnOnEquity: '20',
  };
  const withSummary = (accountValue: string): AccountState => ({
    ...base,
    crossMarginSummary: {
      accountValue,
      maintenanceMargin: '5',
      marginUsed: '25',
      notional: '250',
    },
  });

  it('sums every DEX summary', () => {
    expect(
      sumCrossMarginSummaries([withSummary('100'), withSummary('50.5')]),
    ).toStrictEqual({
      accountValue: '150.5',
      maintenanceMargin: '10',
      marginUsed: '50',
      notional: '500',
    });
  });

  it('sums decimal DEX summaries without floating-point artifacts', () => {
    expect(
      sumCrossMarginSummaries([withSummary('0.1'), withSummary('0.2')]),
    ).toMatchObject({
      accountValue: '0.3',
    });
  });

  it('returns undefined when any DEX lacks a summary', () => {
    expect(sumCrossMarginSummaries([withSummary('100'), base])).toBeUndefined();
    expect(sumCrossMarginSummaries([])).toBeUndefined();
  });

  it('carries the summed summary through aggregateAccountStates', () => {
    expect(
      aggregateAccountStates([withSummary('100'), withSummary('20')])
        .crossMarginSummary,
    ).toStrictEqual({
      accountValue: '120',
      maintenanceMargin: '10',
      marginUsed: '50',
      notional: '500',
    });
  });

  it('drops a single DEX summary rather than reporting a partial sum', () => {
    expect(
      aggregateAccountStates([withSummary('100'), base]),
    ).not.toHaveProperty('crossMarginSummary');
  });
});

describe('calculateAccountSummary', () => {
  // 40 USD of cross account value, 5 USD maintenance margin, 250 USD notional
  // and 25 USD of margin held, in a 1,000 USD account.
  const crossMarginSummary = {
    accountValue: '40',
    maintenanceMargin: '5',
    notional: '250',
    marginUsed: '25',
  };

  // Shared fixtures (TAT-4464): clients assert the same rows against
  // `calculateAccountSummary`. Leverage is cross notional over total equity,
  // isolated margin included; ratio and usage are over cross collateral
  // (cross account value plus spot collateral). Expected figures are rounded
  // to 4 decimals.
  const ACCOUNT_SUMMARY_ROWS: {
    account: string;
    params: CalculateAccountSummaryParams;
    maintenanceMargin: number;
    leverage: number;
    ratio: number;
    usage: number;
  }[] = [
    {
      // 15.57 USD of equity, of which 10.4 USD backs the cross positions.
      account: 'cross and isolated positions',
      params: {
        totalEquity: '15.57',
        crossMarginSummary: {
          accountValue: '10.4',
          maintenanceMargin: '0.2444',
          notional: '12.31',
          marginUsed: '1.231',
        },
        spotCollateral: 0,
      },
      maintenanceMargin: 0.2444,
      leverage: 0.7906,
      ratio: 0.0235,
      usage: 0.1184,
    },
    {
      account: 'cross positions with spot collateral',
      params: { totalEquity: '1000', crossMarginSummary, spotCollateral: '60' },
      maintenanceMargin: 5,
      leverage: 0.25,
      ratio: 0.05,
      usage: 0.25,
    },
  ];

  it.each(ACCOUNT_SUMMARY_ROWS)(
    'gives $leverage leverage, $ratio ratio and $usage usage for $account',
    ({ params, maintenanceMargin, leverage, ratio, usage }) => {
      const summary = calculateAccountSummary(params);

      expect(summary.maintenanceMargin).toBe(maintenanceMargin);
      expect(summary.accountLeverage).toBeCloseTo(leverage, 4);
      expect(summary.accountRatio).toBeCloseTo(ratio, 4);
      expect(summary.crossMarginUsage).toBeCloseTo(usage, 4);
    },
  );

  it('accepts numeric figures', () => {
    expect(
      calculateAccountSummary({
        totalEquity: 1000,
        crossMarginSummary: {
          accountValue: 40,
          maintenanceMargin: 5,
          notional: 250,
          marginUsed: 25,
        },
        spotCollateral: 60,
      }),
    ).toStrictEqual({
      maintenanceMargin: 5,
      accountRatio: 0.05,
      accountLeverage: 0.25,
      crossMarginUsage: 0.25,
    });
  });

  it('keeps leverage known while the spot collateral is unknown', () => {
    expect(
      calculateAccountSummary({
        totalEquity: '1000',
        crossMarginSummary,
        spotCollateral: undefined,
      }),
    ).toStrictEqual({
      maintenanceMargin: 5,
      accountRatio: undefined,
      accountLeverage: 0.25,
      crossMarginUsage: undefined,
    });
  });

  it.each(['0', '-10', '--'])(
    'leaves leverage unknown with %s total equity',
    (totalEquity) => {
      const summary = calculateAccountSummary({
        totalEquity,
        crossMarginSummary,
        spotCollateral: '60',
      });

      expect(summary.accountLeverage).toBeUndefined();
      expect(summary.accountRatio).toBe(0.05);
      expect(summary.crossMarginUsage).toBe(0.25);
    },
  );

  it('reports zero leverage for an account with only isolated positions', () => {
    expect(
      calculateAccountSummary({
        totalEquity: '1000',
        crossMarginSummary: {
          accountValue: '0',
          maintenanceMargin: '0',
          notional: '0',
          marginUsed: '0',
        },
        spotCollateral: '0',
      }),
    ).toStrictEqual({
      maintenanceMargin: 0,
      accountRatio: undefined,
      accountLeverage: 0,
      crossMarginUsage: undefined,
    });
  });

  it('leaves every figure unknown until the cross margin is read', () => {
    expect(
      calculateAccountSummary({
        totalEquity: '1000',
        crossMarginSummary: undefined,
        spotCollateral: '60',
      }),
    ).toStrictEqual({
      maintenanceMargin: undefined,
      accountRatio: undefined,
      accountLeverage: undefined,
      crossMarginUsage: undefined,
    });
  });
});

describe('getCrossCollateral', () => {
  it('adds the spot collateral to the cross account value', () => {
    expect(
      getCrossCollateral(
        {
          accountValue: '40',
          maintenanceMargin: '5',
          notional: '250',
          marginUsed: '25',
        },
        60,
      ),
    ).toBe(100);
  });

  it('is unknown until both are read', () => {
    expect(getCrossCollateral(undefined, 60)).toBeUndefined();
    expect(
      getCrossCollateral(
        {
          accountValue: '40',
          maintenanceMargin: '5',
          notional: '250',
          marginUsed: '25',
        },
        undefined,
      ),
    ).toBeUndefined();
  });
});
