import {
  addSpotUsdcToAvailableToTradeBalance,
  aggregateAccountStates,
} from '../src/utils/accountUtils';
import { adaptAccountStateFromSDK } from '../src/utils/hyperLiquidAdapter';

describe('availableToTradeBalance', () => {
  it('includes only spot USDC in HyperLiquid buying power', () => {
    const accountState = adaptAccountStateFromSDK(
      {
        withdrawable: '0',
        marginSummary: {
          accountValue: '0.0',
          totalMarginUsed: '0.0',
        },
        crossMarginSummary: {
          accountValue: '0.0',
          totalMarginUsed: '0.0',
        },
        assetPositions: [],
      },
      {
        balances: [
          { coin: 'USDC', total: '100.76531791', hold: '0.0' },
          { coin: 'HYPE', total: '0.36975137', hold: '0.0' },
        ],
      },
    );

    expect(accountState.availableBalance).toBe('0');
    expect(accountState.availableToTradeBalance).toBe('100.76531791');
    expect(accountState.totalBalance).toBe('101.13506928');
  });

  it('preserves non-USDC spot outside the funded-state field', () => {
    const accountState = addSpotUsdcToAvailableToTradeBalance(
      {
        availableBalance: '5',
        availableToTradeBalance: '5',
        totalBalance: '7',
        marginUsed: '0',
        unrealizedPnl: '0',
        returnOnEquity: '0',
      },
      {
        balances: [
          { coin: 'USDC', total: '10.5', hold: '0.0' },
          { coin: 'HYPE', total: '3.25', hold: '0.0' },
        ],
      },
    );

    expect(accountState.availableBalance).toBe('5');
    expect(accountState.availableToTradeBalance).toBe('15.5');
    expect(accountState.totalBalance).toBe('7');
  });

  it('aggregates the funded-state field across providers', () => {
    const accountState = aggregateAccountStates([
      {
        availableBalance: '1',
        availableToTradeBalance: '11',
        totalBalance: '20',
        marginUsed: '2',
        unrealizedPnl: '3',
        returnOnEquity: '4',
      },
      {
        availableBalance: '2',
        availableToTradeBalance: '22',
        totalBalance: '30',
        marginUsed: '5',
        unrealizedPnl: '6',
        returnOnEquity: '7',
      },
    ]);

    expect(accountState.availableBalance).toBe('3');
    expect(accountState.availableToTradeBalance).toBe('33');
    expect(accountState.totalBalance).toBe('50');
  });
});
