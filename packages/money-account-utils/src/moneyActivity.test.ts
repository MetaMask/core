import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import type { AccountsApiActivity } from './moneyActivity';
import {
  accountsApiItem,
  buildMoneyActivityBuckets,
  mergeMoneyActivity,
  MoneyActivityFilter,
  onchainItem,
} from './moneyActivity';

const onchainTx = (id: string, time: number, hash?: Hex): TransactionMeta =>
  ({ id, time, hash }) as TransactionMeta;

const cardTx = (hash: Hex, time: number): AccountsApiActivity => ({
  kind: 'card',
  hash,
  time,
  chainId: '0x8f',
  token: { address: '0xusdc' as Hex, symbol: 'USDC', decimals: 6 },
  amount: '1000000',
  paidTo: '0xsettlement' as Hex,
});

const cashbackTx = (hash: Hex, time: number): AccountsApiActivity => ({
  kind: 'cashback',
  hash,
  time,
  chainId: '0x8f',
  token: { address: '0xmusd' as Hex, symbol: 'mUSD', decimals: 6 },
  amount: '300000',
  receivedFrom: '0xrewarder' as Hex,
});

const refundTx = (hash: Hex, time: number): AccountsApiActivity => ({
  kind: 'refund',
  hash,
  time,
  chainId: '0x8f',
  token: { address: '0xmusd' as Hex, symbol: 'mUSD', decimals: 6 },
  amount: '10000000',
  receivedFrom: '0xsettlement' as Hex,
});

describe('onchainItem', () => {
  it('tags the row with its source and carries id/time through', () => {
    expect(onchainItem(onchainTx('a', 42))).toStrictEqual({
      kind: 'onchain',
      id: 'a',
      time: 42,
      tx: onchainTx('a', 42),
    });
  });

  it('defaults a missing time to 0', () => {
    const tx = { id: 'a' } as TransactionMeta;
    expect(onchainItem(tx).time).toBe(0);
  });
});

describe('accountsApiItem', () => {
  it('keys the row on its transaction hash', () => {
    const tx = cardTx('0xabc' as Hex, 42);
    expect(accountsApiItem(tx)).toStrictEqual({
      kind: 'accountsApi',
      id: '0xabc',
      time: 42,
      tx,
    });
  });
});

describe('mergeMoneyActivity', () => {
  it('merges both sources, tags by source, and sorts time-descending', () => {
    const onchain = [onchainTx('a', 100), onchainTx('b', 300)];
    const api = [cardTx('0xcard' as Hex, 200)];

    const items = mergeMoneyActivity(onchain, api);

    expect(items.map((i) => [i.kind, i.id, i.time])).toStrictEqual([
      ['onchain', 'b', 300],
      ['accountsApi', '0xcard', 200],
      ['onchain', 'a', 100],
    ]);
  });

  it('drops an on-chain row that collides with an API hash (double-count guard)', () => {
    const shared = '0xAbC123' as Hex;
    const onchain = [onchainTx('dup', 100, shared)];
    const api = [cardTx('0xabc123' as Hex, 100)];

    const items = mergeMoneyActivity(onchain, api);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'accountsApi', id: '0xabc123' });
  });

  it('returns an empty list when both sources are empty', () => {
    expect(mergeMoneyActivity([], [])).toStrictEqual([]);
  });

  it('orders rows sharing a timestamp deterministically by id', () => {
    // A spend and its cashback can settle in the same second; the tie must
    // resolve the same way regardless of input order.
    const onchain = [onchainTx('zzz', 100)];
    const api = [cardTx('0xccc' as Hex, 100), cashbackTx('0xaaa' as Hex, 100)];

    const forward = mergeMoneyActivity(onchain, api).map((i) => i.id);
    const reversed = mergeMoneyActivity([...onchain], [...api].reverse()).map(
      (i) => i.id,
    );

    expect(forward).toStrictEqual(['0xaaa', '0xccc', 'zzz']);
    expect(reversed).toStrictEqual(forward);
  });
});

describe('buildMoneyActivityBuckets', () => {
  const onchain = {
    all: [onchainTx('all', 50)],
    deposits: [onchainTx('dep', 40)],
    transfers: [onchainTx('xfer', 30)],
  };
  const card = cardTx('0xcard' as Hex, 200);
  const cashback = cashbackTx('0xback' as Hex, 300);
  const refund = refundTx('0xrefund' as Hex, 250);

  it('routes card spends to Transfers and cashback to Deposits; both into All', () => {
    const buckets = buildMoneyActivityBuckets(onchain, [card, cashback]);

    const ids = (filter: MoneyActivityFilter): string[] =>
      buckets[filter].map((item) => item.id);

    // All contains both API rows.
    expect(ids(MoneyActivityFilter.All)).toStrictEqual(
      expect.arrayContaining(['0xback', '0xcard', 'all']),
    );
    // Deposits: cashback inflow, not the card spend.
    expect(ids(MoneyActivityFilter.Deposits)).toContain('0xback');
    expect(ids(MoneyActivityFilter.Deposits)).not.toContain('0xcard');
    // Transfers: card outflow, not the cashback.
    expect(ids(MoneyActivityFilter.Transfers)).toContain('0xcard');
    expect(ids(MoneyActivityFilter.Transfers)).not.toContain('0xback');
  });

  it('groups all card activity (spend, cashback, refund) into Purchases without on-chain rows', () => {
    const buckets = buildMoneyActivityBuckets(onchain, [
      card,
      cashback,
      refund,
    ]);

    const ids = (filter: MoneyActivityFilter): string[] =>
      buckets[filter].map((item) => item.id);

    // Purchases: every card-related row, time-descending, and no on-chain rows.
    expect(ids(MoneyActivityFilter.Purchases)).toStrictEqual([
      '0xback',
      '0xrefund',
      '0xcard',
    ]);
    // Refund flows into All but leaves Deposits/Sends untouched (additive).
    expect(ids(MoneyActivityFilter.All)).toContain('0xrefund');
    expect(ids(MoneyActivityFilter.Deposits)).not.toContain('0xrefund');
    expect(ids(MoneyActivityFilter.Transfers)).not.toContain('0xrefund');
  });

  it('keeps each bucket time-descending', () => {
    const buckets = buildMoneyActivityBuckets(onchain, [card, cashback]);
    const times = buckets[MoneyActivityFilter.All].map((i) => i.time);
    expect(times).toStrictEqual([...times].sort((a, b) => b - a));
  });

  it('withholds rows older than the watermark from every bucket', () => {
    // Watermark at 100: the on-chain rows (50/40/30) are below it and may have
    // un-fetched API rows above them, so they must not render yet.
    const buckets = buildMoneyActivityBuckets(onchain, [card, cashback], 100);

    expect(buckets[MoneyActivityFilter.All].map((i) => i.id)).toStrictEqual([
      '0xback',
      '0xcard',
    ]);
    expect(
      buckets[MoneyActivityFilter.Deposits].map((i) => i.id),
    ).toStrictEqual(['0xback']);
    expect(
      buckets[MoneyActivityFilter.Transfers].map((i) => i.id),
    ).toStrictEqual(['0xcard']);
  });

  it('withholds rows at exactly the watermark (second-resolution ties)', () => {
    // The card row sits exactly on the watermark (200). The next un-fetched
    // page can open with rows at the same timestamp whose id tiebreak would
    // sort them above this one, so it must not render yet — from any bucket,
    // including the API-only Purchases tab.
    const buckets = buildMoneyActivityBuckets(onchain, [card, cashback], 200);

    expect(buckets[MoneyActivityFilter.All].map((i) => i.id)).toStrictEqual([
      '0xback',
    ]);
    expect(
      buckets[MoneyActivityFilter.Purchases].map((i) => i.id),
    ).toStrictEqual(['0xback']);
  });

  it('shows everything when the watermark is -Infinity (fully loaded)', () => {
    const buckets = buildMoneyActivityBuckets(
      onchain,
      [card, cashback],
      Number.NEGATIVE_INFINITY,
    );
    expect(buckets[MoneyActivityFilter.All]).toHaveLength(3);
  });
});
