/**
 * Market search ranking (TAT-2413).
 *
 * Provisional, standalone helper layered on the same match semantics as
 * `filterMarketsByQuery` (case-insensitive substring on a market's ticker symbol
 * and human-readable name), additionally matching any optional annotation
 * `keywords` (TAT-3338). It adds the one thing `filterMarketsByQuery` does not:
 * relevance ranking — exact matches first, then prefix, then substring; ties keep
 * their input order (stable). No fuzzy/phonetic matching (out of scope for v1).
 *
 * Kept in its own file so it can be promoted or relocated later without touching
 * the shared `marketUtils`. A market matches here (rank !== null) iff
 * `filterMarketsByQuery` would include it, so the two stay behaviorally aligned.
 *
 * Portable: no platform-specific imports.
 */
import type { PerpsMarketData } from '../types';

/**
 * Relevance tier for a market/query match. Lower values sort first.
 */
export enum MarketMatchRank {
  Exact = 0,
  Prefix = 1,
  Substring = 2,
}

/**
 * Rank a single field value against a normalized query.
 *
 * @param value - Field value (e.g. symbol or name); may be undefined.
 * @param query - Already trimmed, lower-cased, non-empty query.
 * @returns The match tier, or null when the field does not match.
 */
function fieldRank(
  value: string | undefined,
  query: string,
): MarketMatchRank | null {
  if (!value) {
    return null;
  }
  const normalized = value.toLowerCase();
  if (normalized === query) {
    return MarketMatchRank.Exact;
  }
  if (normalized.startsWith(query)) {
    return MarketMatchRank.Prefix;
  }
  if (normalized.includes(query)) {
    return MarketMatchRank.Substring;
  }
  return null;
}

/**
 * Compute the best (lowest) relevance rank for a market against a search query,
 * considering its ticker symbol, human-readable name, and any annotation
 * keywords. Keywords are ranked with the same exact/prefix/substring tiers as
 * the symbol and name, so a market matched only via a keyword still participates
 * in ranking.
 *
 * @param market - Market to score (uses `symbol`, `name`, and `keywords`).
 * @param searchQuery - User search text (trimmed/cased internally).
 * @returns The match rank, or null when the market does not match (or the query
 * is empty/whitespace).
 */
export function getMarketMatchRank(
  market: Pick<PerpsMarketData, 'symbol' | 'name' | 'keywords'>,
  searchQuery: string,
): MarketMatchRank | null {
  if (!searchQuery?.trim()) {
    return null;
  }
  const query = searchQuery.toLowerCase().trim();
  const ranks = [
    fieldRank(market.symbol, query),
    fieldRank(market.name, query),
    ...(market.keywords ?? []).map((keyword) => fieldRank(keyword, query)),
  ].filter((rank): rank is MarketMatchRank => rank !== null);

  return ranks.length > 0 ? Math.min(...ranks) : null;
}

/**
 * Filter and rank markets by a search query, matching the human-readable name,
 * ticker symbol, or any annotation keywords. Exact matches sort first, then
 * prefix, then substring; markets sharing a rank keep their input order (stable).
 * An empty/whitespace query returns the markets unchanged (no filtering),
 * matching `filterMarketsByQuery`.
 *
 * @param markets - Markets to search.
 * @param searchQuery - User search text.
 * @returns Matching markets ordered by relevance.
 */
export function rankMarketsByQuery(
  markets: PerpsMarketData[],
  searchQuery: string,
): PerpsMarketData[] {
  if (!searchQuery?.trim()) {
    return markets;
  }
  const query = searchQuery.toLowerCase().trim();

  const matches: { market: PerpsMarketData; rank: MarketMatchRank }[] = [];
  markets.forEach((market) => {
    const rank = getMarketMatchRank(market, query);
    if (rank !== null) {
      matches.push({ market, rank });
    }
  });

  // Stable sort by rank only; Array.prototype.sort is stable in modern engines,
  // so equal-rank markets retain their original relative order.
  matches.sort((a, b) => a.rank - b.rank);
  return matches.map((match) => match.market);
}
