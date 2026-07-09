import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

/**
 * The filter tabs of the Money activity list.
 */
export enum MoneyActivityFilter {
  All = 'all',
  Deposits = 'deposits',
  Transfers = 'transfers',
  Purchases = 'purchases',
}

/**
 * When set on mock or enriched {@link TransactionMeta}, overrides the default
 * title derived from the transaction type.
 */
export type MoneyActivityTitleKey =
  | 'deposited'
  | 'received'
  | 'card_transaction'
  | 'converted'
  | 'sent';

/**
 * {@link TransactionMeta} plus optional Money activity presentation fields.
 */
export type MoneyActivityTransactionMeta = TransactionMeta & {
  moneySubtitle?: string;
  moneyActivityTitleKey?: MoneyActivityTitleKey;
};

/**
 * Card spends and mUSD-back from the Accounts API. These aren't created in
 * the client, so they never reach the local `TransactionController` — they
 * come from the MetaMask Accounts API.
 */
type AccountsApiSettlement = {
  /** On-chain tx hash. Stable identity for the activity row. */
  hash: Hex;
  /** Settlement time, epoch ms (parsed from the API's ISO timestamp). */
  time: number;
  chainId: Hex;
  /** The settlement token. */
  token: {
    address: Hex;
    symbol: string;
    decimals: number;
  };
  /** Raw, minimal-unit amount of the settlement transfer. */
  amount: string;
};

export type AccountsApiActivity =
  | (AccountsApiSettlement & {
      kind: 'card';
      paidTo: Hex;
    })
  | (AccountsApiSettlement & {
      kind: 'cashback';
      receivedFrom: Hex;
    })
  | (AccountsApiSettlement & {
      kind: 'refund';
      receivedFrom: Hex;
    });

/**
 * One row in the Money activity list, tagged by source.
 */
export type MoneyActivityItem =
  | { kind: 'onchain'; id: string; time: number; tx: TransactionMeta }
  | { kind: 'accountsApi'; id: string; time: number; tx: AccountsApiActivity };

/**
 * Wrap a local on-chain transaction as an activity row.
 *
 * @param tx - The transaction to wrap.
 * @returns The source-tagged activity row.
 */
export const onchainItem = (tx: TransactionMeta): MoneyActivityItem => ({
  kind: 'onchain',
  id: tx.id,
  time: tx.time ?? 0,
  tx,
});

/**
 * Wrap an Accounts-API activity entry as an activity row.
 *
 * @param tx - The activity entry to wrap.
 * @returns The source-tagged activity row.
 */
export const accountsApiItem = (
  tx: AccountsApiActivity,
): MoneyActivityItem => ({
  kind: 'accountsApi',
  id: tx.hash,
  time: tx.time,
  tx,
});

/**
 * The list shown for each activity filter tab.
 */
export type MoneyActivityBuckets = Record<
  MoneyActivityFilter,
  MoneyActivityItem[]
>;

/**
 * Withhold merged rows at or below the Accounts-API watermark: below it there
 * may be un-fetched API rows that belong higher in the list, so showing those
 * rows now would let older activity pop in above them on the next page load.
 * The gate is strict (`>`): timestamps are second-resolution, so the next
 * un-fetched page can open with rows at exactly the watermark whose id
 * tiebreak would sort them above an already-rendered row.
 *
 * @param items - The merged activity rows.
 * @param watermark - The pagination watermark in epoch ms.
 * @returns The rows that are safe to display.
 */
function safeItems(
  items: MoneyActivityItem[],
  watermark: number,
): MoneyActivityItem[] {
  if (watermark === Number.NEGATIVE_INFINITY) {
    return items;
  }
  return items.filter((item) => item.time > watermark);
}

/**
 * Merge local on-chain Money transactions with Accounts-API activity (card
 * spends and cashback) into a single source-tagged, time-descending list.
 *
 * @param onchainTransactions - Local on-chain Money transactions.
 * @param apiActivity - Parsed Accounts-API activity rows.
 * @returns The merged, time-descending activity list.
 */
export function mergeMoneyActivity(
  onchainTransactions: TransactionMeta[],
  apiActivity: AccountsApiActivity[],
): MoneyActivityItem[] {
  const apiHashes = new Set(apiActivity.map((a) => a.hash.toLowerCase()));
  const onchain = onchainTransactions
    // we ignore any on chain data that exists in the accounts API response.
    .filter((tx) => !(tx.hash && apiHashes.has(tx.hash.toLowerCase())))
    .map(onchainItem);
  // Time-descending, with `id` as a stable tiebreak so rows sharing a timestamp
  // (e.g. a spend and its cashback in the same second) keep a deterministic
  // order across renders/refetches and across the two merged sources.
  return [...onchain, ...apiActivity.map(accountsApiItem)].sort(
    (a, b) => b.time - a.time || a.id.localeCompare(b.id),
  );
}

/**
 * Build the per-filter-tab activity lists from the two activity sources.
 *
 * @param onchain - Local on-chain transactions, pre-split per tab.
 * @param onchain.all - Transactions for the "All" tab.
 * @param onchain.deposits - Transactions for the "Deposits" tab.
 * @param onchain.transfers - Transactions for the "Transfers" tab.
 * @param apiActivity - Parsed Accounts-API activity rows.
 * @param watermark - The pagination watermark in epoch ms; rows at or below
 * it are withheld. Defaults to `-Infinity` (everything shown).
 * @returns The merged, gated activity list for every filter tab.
 */
export function buildMoneyActivityBuckets(
  onchain: {
    all: TransactionMeta[];
    deposits: TransactionMeta[];
    transfers: TransactionMeta[];
  },
  apiActivity: AccountsApiActivity[],
  watermark: number = Number.NEGATIVE_INFINITY,
): MoneyActivityBuckets {
  const cards = apiActivity.filter((a) => a.kind === 'card');
  const cashback = apiActivity.filter((a) => a.kind === 'cashback');
  const refunds = apiActivity.filter((a) => a.kind === 'refund');
  return {
    [MoneyActivityFilter.All]: safeItems(
      mergeMoneyActivity(onchain.all, apiActivity),
      watermark,
    ),
    [MoneyActivityFilter.Deposits]: safeItems(
      mergeMoneyActivity(onchain.deposits, cashback),
      watermark,
    ),
    [MoneyActivityFilter.Transfers]: safeItems(
      mergeMoneyActivity(onchain.transfers, cards),
      watermark,
    ),
    // Purchases is API-only, but the strict gate still applies: a fetched row
    // at exactly the watermark may have same-timestamp siblings on the next
    // page that would sort above it, so it's withheld like everything else.
    [MoneyActivityFilter.Purchases]: safeItems(
      mergeMoneyActivity([], [...cards, ...cashback, ...refunds]),
      watermark,
    ),
  };
}
