/**
 * Pure helpers for a `MarketStatsService:pricesUpdated` quote map.
 *
 * The map is not `AssetsController` state. The UI keeps it in its own cache.
 * Polled prices stay in `assetsPrice` and show when this map has no quote.
 */

import {
  isCaipAssetType,
  KnownCaipNamespace,
  parseCaipAssetType,
  parseCaipChainId,
} from '@metamask/utils';
import type { CaipAssetType } from '@metamask/utils';
import type { QueryClient } from '@tanstack/query-core';

import { readQuotePayload } from './structs.js';

export type LiveQuote = {
  price: number;
  pricePercentChange1d?: number;
};

export type LivePriceMap = ReadonlyMap<string, LiveQuote>;

export type MarketStatsQuotesQueryKey = readonly [
  'market-stats',
  'quotes',
  string,
];

const EMPTY_QUOTES: LivePriceMap = new Map();

/**
 * Query key for the live quote map of one currency.
 * A tick writes it with `setQueryData`. There is no fetch.
 *
 * @param currency - Selected currency. Case is ignored.
 * @returns The query key.
 */
export function marketStatsQueryKey(
  currency: string,
): MarketStatsQuotesQueryKey {
  return ['market-stats', 'quotes', currency.toLowerCase()];
}

type MarketStatsQuoteReader = Pick<QueryClient, 'getQueryData'>;

type MarketStatsQuoteCache = Pick<QueryClient, 'getQueryData' | 'setQueryData'>;

/**
 * The quote map stored for this currency, or one shared empty map before the
 * first tick. The empty map keeps the same reference across reads.
 *
 * @param queryClient - Cache that can read a query by key.
 * @param currency - Selected currency. Case is ignored.
 * @returns The stored map, or the shared empty map.
 */
export function quotesFor(
  queryClient: MarketStatsQuoteReader,
  currency: string,
): LivePriceMap {
  return (
    queryClient.getQueryData<LivePriceMap>(marketStatsQueryKey(currency)) ??
    EMPTY_QUOTES
  );
}

/**
 * Key a market-stats asset id the same way on the tick and on the lookup.
 * An EVM asset reference is lowercased, which is the form the gateway sends.
 * The API Platform team wanted EVM keys all lowercase.
 * Anything else is kept as given.
 *
 * @param assetId - CAIP-19 asset id, or any other string the caller uses as a key.
 * @returns The map key.
 */
export function marketStatsAssetKey(assetId: string): string {
  if (!isCaipAssetType(assetId)) {
    return assetId;
  }
  const parsed = parseCaipAssetType(assetId);
  if (
    parseCaipChainId(parsed.chainId).namespace !== KnownCaipNamespace.Eip155
  ) {
    return assetId;
  }
  return `${parsed.chainId}/${parsed.assetNamespace}:${parsed.assetReference.toLowerCase()}`;
}

const NO_LIVE_QUOTES: readonly (LiveQuote | undefined)[] = [];

function quoteAt(
  quotes: LivePriceMap,
  assetId: string | undefined,
): LiveQuote | undefined {
  if (!assetId) {
    return undefined;
  }
  return quotes.get(marketStatsAssetKey(assetId));
}

/**
 * Quotes for these assets, in the same order.
 * An id with no streamed quote is undefined. An empty list is one shared array.
 *
 * @param quotes - Current quote map.
 * @param assetIds - CAIP-19 asset ids. Case of an EVM address does not matter.
 * @returns One quote per id.
 */
export function readLiveQuotes(
  quotes: LivePriceMap,
  assetIds: readonly (string | undefined)[],
): readonly (LiveQuote | undefined)[] {
  if (assetIds.length === 0) {
    return NO_LIVE_QUOTES;
  }
  return assetIds.map((assetId) => quoteAt(quotes, assetId));
}

/**
 * Keep a previous `readLiveQuotes` result when every quote is the same object.
 * A quote map is always the next one: the map reference is what a tick changes.
 *
 * Pass this as a query's `structuralSharing`. It runs on the stored map and
 * on the selected list.
 *
 * @param previous - The value already shown.
 * @param next - The value just produced.
 * @returns `previous` when a list's quotes did not change, otherwise `next`.
 */
export function shareMarketStatsData(
  previous: unknown,
  next: unknown,
): unknown {
  if (previous === undefined || Object.is(previous, next)) {
    return next;
  }
  if (previous instanceof Map || next instanceof Map) {
    return next;
  }
  if (
    Array.isArray(previous) &&
    Array.isArray(next) &&
    previous.length === next.length &&
    previous.every((entry, index) => Object.is(entry, next[index]))
  ) {
    return previous;
  }
  return next;
}

/**
 * Merge one `pricesUpdated` payload into a quote map.
 * Entries in another currency are ignored. Assets listed in `removed` leave
 * the map, so the polled price shows. The same map is returned when nothing
 * changed, so an unchanged quote keeps its object.
 *
 * The argument is the object passed to `publish`, not the forwarded argument
 * list a messenger subscription may wrap it in.
 *
 * @param quotes - Current quote map.
 * @param currency - Selected currency. Case is ignored.
 * @param payload - Published `{ updates, removed }` object. `removed` lists
 * assets whose channel just closed.
 * @returns The next map, or `quotes` when the payload changes nothing.
 */
export function applyMarketStatsPrices(
  quotes: LivePriceMap,
  currency: string,
  payload: unknown,
): LivePriceMap {
  const { updates, removed } = readQuotePayload(payload);
  if (updates.length === 0 && removed.length === 0) {
    return quotes;
  }

  const selected = currency.toLowerCase();
  let changed = false;
  const updated = new Map(quotes);

  for (const update of updates) {
    if (update.currency.toLowerCase() !== selected) {
      continue;
    }
    const { price, pricePercentChange1d } = update;
    const key = marketStatsAssetKey(update.assetId);
    const previous = updated.get(key);
    if (
      previous?.price === price &&
      previous.pricePercentChange1d === pricePercentChange1d
    ) {
      continue;
    }
    updated.set(
      key,
      pricePercentChange1d === undefined
        ? { price }
        : { price, pricePercentChange1d },
    );
    changed = true;
  }

  for (const entry of removed) {
    if (
      entry.currency.toLowerCase() === selected &&
      updated.delete(marketStatsAssetKey(entry.assetId))
    ) {
      changed = true;
    }
  }
  return changed ? updated : quotes;
}

/**
 * Extension forwards a messenger notification as one array. The published
 * object is the first entry. Mobile passes that object through.
 *
 * @param payload - Notification payload from either messenger.
 * @returns The object passed to `publish`.
 */
function unwrapMarketStatsPayload(payload: unknown): unknown {
  return Array.isArray(payload) ? payload[0] : payload;
}

export type MarketStatsQuoteHandlers = {
  onPricesUpdated: (payload: unknown) => void;
};

type ClientUnsubscribe = () => void | Promise<void>;

export type UnsubscribeMarketStats = () => void;

/**
 * Start listening to market-stats events.
 * Extension's background connection resolves the unsubscribe later. Mobile's
 * messenger returns it immediately. Both shapes are accepted.
 */
export type SubscribeToMarketStats = (
  handlers: MarketStatsQuoteHandlers,
) => ClientUnsubscribe | Promise<ClientUnsubscribe | void> | void;

/**
 * Listen for market-stats ticks and write them into the query cache.
 * The caller passes its own messenger subscribe, because extension and mobile
 * do not share one.
 *
 * A subscribe that resolves after the listener has stopped releases only that
 * subscription.
 *
 * @param options - Cache, currency, and the client's messenger subscribe.
 * @param options.queryClient - Cache that holds the quote map.
 * @param options.currency - Selected currency. Case is ignored.
 * @param options.subscribe - Register the `pricesUpdated` handler.
 * @returns Unsubscribe.
 */
export function subscribeLiveQuotes({
  queryClient,
  currency,
  subscribe,
}: {
  queryClient: MarketStatsQuoteCache;
  currency: string;
  subscribe: SubscribeToMarketStats;
}): UnsubscribeMarketStats {
  let cancelled = false;
  let stop: ClientUnsubscribe | undefined;

  const attach = (unsubscribe: ClientUnsubscribe | void): void => {
    if (!unsubscribe) {
      return;
    }
    if (cancelled) {
      Promise.resolve(unsubscribe()).catch(() => undefined);
      return;
    }
    stop = unsubscribe;
  };

  const write = (current: LivePriceMap, next: LivePriceMap): void => {
    if (next !== current) {
      queryClient.setQueryData(marketStatsQueryKey(currency), next);
    }
  };

  const pending = subscribe({
    onPricesUpdated: (payload) => {
      const current = quotesFor(queryClient, currency);
      write(
        current,
        applyMarketStatsPrices(
          current,
          currency,
          unwrapMarketStatsPayload(payload),
        ),
      );
    },
  });

  Promise.resolve(pending)
    .then(attach)
    .catch(() => undefined);

  return () => {
    cancelled = true;
    const unsubscribe = stop;
    stop = undefined;
    if (unsubscribe) {
      Promise.resolve(unsubscribe()).catch(() => undefined);
    }
  };
}

/**
 * Fiat value of a holding at a streamed unit price.
 * Returns undefined when either input cannot be multiplied.
 *
 * @param balanceAmount - Unformatted token amount.
 * @param price - Unit price in the selected currency.
 * @returns The holding in fiat, or undefined.
 */
export function liveHoldingFiat(
  balanceAmount: number | undefined,
  price: number | undefined,
): number | undefined {
  if (
    balanceAmount === undefined ||
    price === undefined ||
    !Number.isFinite(balanceAmount) ||
    !Number.isFinite(price)
  ) {
    return undefined;
  }
  const holding = balanceAmount * price;
  return Number.isFinite(holding) ? holding : undefined;
}

type TokenFiat = {
  balance?: string;
  tokenFiatAmount?: number | null;
  fiat?: {
    balance?: number;
    conversionRate?: number;
    currency?: string;
  };
};

/**
 * Replace a row's fiat balance with `balance * livePrice`.
 * Leaves the row unchanged when there is no tick or the balance is not numeric.
 *
 * `fiat.conversionRate` stays as the list built it. For ERC-20s that field is
 * the native currency's fiat rate, not the token price.
 *
 * @param token - Token row.
 * @param livePrice - Streamed price in the selected currency.
 * @returns The same row, or a copy with an updated fiat balance.
 */
export function applyLiveTokenFiat<TokenRow extends TokenFiat>(
  token: TokenRow,
  livePrice: number | undefined,
): TokenRow {
  if (livePrice === undefined || !Number.isFinite(livePrice)) {
    return token;
  }

  const amount =
    token.balance === undefined ? Number.NaN : Number(token.balance);
  if (!Number.isFinite(amount)) {
    return token;
  }

  const nextFiat = amount * livePrice;
  if (token.tokenFiatAmount === nextFiat && token.fiat?.balance === nextFiat) {
    return token;
  }

  return {
    ...token,
    tokenFiatAmount: nextFiat,
    ...(token.fiat ? { fiat: { ...token.fiat, balance: nextFiat } } : {}),
  };
}

type PricedAsset = {
  balance?: string;
  fiat?: { balance?: number };
};

/**
 * How much the account total should move when streamed prices replace the
 * polled fiat balances.
 *
 * @param assets - Asset rows that already have a polled fiat balance.
 * @param livePrices - Streamed prices keyed by normalized CAIP-19 id.
 * @param toAssetId - Resolves a row to that key.
 * @returns Sum of `balance * livePrice - previousFiat`.
 */
export function liveFiatDelta<AssetRow extends PricedAsset>(
  assets: AssetRow[],
  livePrices: LivePriceMap,
  toAssetId: (asset: AssetRow) => CaipAssetType | string | undefined,
): number {
  if (livePrices.size === 0) {
    return 0;
  }

  let delta = 0;
  for (const asset of assets) {
    const assetId = toAssetId(asset);
    if (!assetId) {
      continue;
    }
    const livePrice = quoteAt(livePrices, assetId)?.price;
    const previous = asset.fiat?.balance;
    if (
      livePrice === undefined ||
      previous === undefined ||
      !Number.isFinite(previous)
    ) {
      continue;
    }
    const amount =
      asset.balance === undefined ? Number.NaN : Number(asset.balance);
    if (!Number.isFinite(amount)) {
      continue;
    }
    delta += amount * livePrice - previous;
  }
  return delta;
}

const NO_LIVE_ADJUSTMENTS: ReadonlyMap<string, number> = new Map();

/**
 * Live price adjustment for each account group's polled fiat total.
 * Groups with no streamed quote are omitted, so their polled total stays.
 *
 * @param assetsByGroup - Asset rows keyed by account group, then chain.
 * @param livePrices - Streamed prices keyed by normalized CAIP-19 id.
 * @param toAssetId - Resolves a row to that key.
 * @returns Deltas to add to each group's polled total.
 */
export function liveGroupFiatAdjustments<AssetRow extends PricedAsset>(
  assetsByGroup: Readonly<
    Record<string, Readonly<Record<string, readonly AssetRow[]>> | undefined>
  >,
  livePrices: LivePriceMap,
  toAssetId: (asset: AssetRow) => CaipAssetType | string | undefined,
): ReadonlyMap<string, number> {
  if (livePrices.size === 0) {
    return NO_LIVE_ADJUSTMENTS;
  }

  const adjustments = new Map<string, number>();
  for (const [groupId, assetsByChain] of Object.entries(assetsByGroup)) {
    if (!assetsByChain) {
      continue;
    }
    const assets: AssetRow[] = [];
    for (const chainAssets of Object.values(assetsByChain)) {
      if (chainAssets) {
        assets.push(...chainAssets);
      }
    }
    const delta = liveFiatDelta(assets, livePrices, toAssetId);
    if (delta !== 0) {
      adjustments.set(groupId, delta);
    }
  }
  return adjustments;
}
