import type { PerpsProviderType, PublicTrade } from '../types/index.js';
import { parseFiniteDecimal } from './stringParseUtils.js';

/**
 * Venue fields of one public trade, before validation.
 */
export type PublicTradeFields = {
  id: unknown;
  symbol: string;
  price: unknown;
  size: unknown;
  side: PublicTrade['side'] | null;
  timestamp: unknown;
  txHash?: string;
  providerId: PerpsProviderType;
};

const isPositiveDecimal = (value: unknown): value is string => {
  const parsed = parseFiniteDecimal(value);
  return parsed !== null && parsed > 0;
};

/**
 * Build a {@link PublicTrade} from venue fields, or null when a field is
 * malformed. Public feeds skip a malformed trade instead of failing the batch.
 *
 * @param fields - Venue fields mapped to the shared names.
 * @returns The trade, or null.
 */
export function buildPublicTrade(
  fields: PublicTradeFields,
): PublicTrade | null {
  const { id, symbol, price, size, side, timestamp, txHash, providerId } =
    fields;
  if (
    typeof id !== 'string' ||
    id.length === 0 ||
    !isPositiveDecimal(price) ||
    !isPositiveDecimal(size) ||
    side === null ||
    typeof timestamp !== 'number' ||
    !Number.isSafeInteger(timestamp) ||
    timestamp <= 0
  ) {
    return null;
  }
  return {
    id,
    symbol,
    price,
    size,
    side,
    timestamp,
    ...(txHash ? { txHash } : {}),
    providerId,
  };
}

/**
 * Order trades newest first, the order every provider returns.
 *
 * @param trades - Trades to sort (not mutated).
 * @returns A new array, newest first.
 */
export function sortPublicTradesNewestFirst(
  trades: readonly PublicTrade[],
): PublicTrade[] {
  return [...trades].sort((a, b) => b.timestamp - a.timestamp);
}
