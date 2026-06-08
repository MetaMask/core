import { mergeAccountBalances, mergeBalanceRow } from './utils';

describe('mergeBalanceRow', () => {
  it('applies incoming amount and unit onto an existing row', () => {
    expect(
      mergeBalanceRow(
        { amount: '0', unit: '' },
        { amount: '1', unit: 'BTC' },
      ),
    ).toStrictEqual({
      amount: '1',
      unit: 'BTC',
    });
  });

  it('preserves extra when incoming omits it', () => {
    expect(
      mergeBalanceRow(
        { amount: '1', unit: 'BTC', extra: { limit: '500' } },
        { amount: '2', unit: 'BTC' },
      ),
    ).toStrictEqual({
      amount: '2',
      unit: 'BTC',
      extra: { limit: '500' },
    });
  });

  it('overwrites extra when incoming provides it', () => {
    expect(
      mergeBalanceRow(
        { amount: '0', unit: 'USDC', extra: { limit: '0' } },
        { extra: { limit: '1000' } },
      ),
    ).toStrictEqual({
      amount: '0',
      unit: 'USDC',
      extra: { limit: '1000' },
    });
  });
});

describe('mergeAccountBalances', () => {
  it('merges incoming rows while preserving untouched assets', () => {
    expect(
      mergeAccountBalances(
        {
          assetA: { amount: '1', unit: 'A', extra: { limit: '1' } },
          assetB: { amount: '2', unit: 'B' },
        },
        {
          assetA: { amount: '3', unit: 'A' },
        },
      ),
    ).toStrictEqual({
      assetA: { amount: '3', unit: 'A', extra: { limit: '1' } },
      assetB: { amount: '2', unit: 'B' },
    });
  });
});
