/**
 * Loose structs for market-stats socket data.
 *
 * The data comes off a socket, so it is never trusted and never thrown on. An
 * entry that does not fit a struct is dropped on its own. The rest of the
 * message is still used, and a bad entry cannot break the app.
 */

import {
  coerce,
  array,
  defaulted,
  enums,
  nonempty,
  nullable,
  number,
  optional,
  refine,
  string,
  type,
  unknown,
  validate,
} from '@metamask/superstruct';
import type { Infer, Struct } from '@metamask/superstruct';

/**
 * A number from a number or a numeric string. Anything else is `undefined`.
 *
 * @param value - Value read off the socket.
 * @returns The finite number, or `undefined`.
 */
function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

const FiniteNumber = refine(number(), 'finite', (value) =>
  Number.isFinite(value),
);

/** A required price. A numeric string is accepted. */
const PriceStruct = coerce(
  FiniteNumber,
  unknown(),
  (value) => toFiniteNumber(value) ?? value,
);

/** A percent change. One that is missing or unreadable is left out. */
const OptionalChangeStruct = coerce(
  optional(FiniteNumber),
  unknown(),
  (value) => toFiniteNumber(value),
);

/** A batch percent change. The gateway omits it when unavailable, so it is `null`. */
const BatchChangeStruct = defaulted(nullable(FiniteNumber), null);

/**
 * An asset and currency. Extra properties are allowed.
 */
export const QuoteRefStruct = type({
  assetId: nonempty(string()),
  currency: string(),
});

/**
 * A price in a `pricesUpdated` payload. Extra properties are allowed.
 */
export const QuoteUpdateStruct = type({
  assetId: nonempty(string()),
  currency: string(),
  price: PriceStruct,
  pricePercentChange1d: OptionalChangeStruct,
});

/**
 * A price in a `market-stats.v1` batch. Extra properties are allowed.
 */
export const BatchUpdateStruct = type({
  assetId: nonempty(string()),
  currency: nonempty(string()),
  price: FiniteNumber,
  pricePercentChange1d: BatchChangeStruct,
});

/**
 * The published `{ updates, removed }` object. Each list is read on its own,
 * so one that is missing or malformed does not hide the other.
 */
const PayloadStruct = type({
  updates: optional(unknown()),
  removed: optional(unknown()),
});

/**
 * Chain health from a system notification. Extra properties are allowed, and
 * ids in `chainIds` that are not strings are left out.
 */
const SystemNotificationStruct = type({
  chainIds: coerce(array(nonempty(string())), unknown(), (value) =>
    Array.isArray(value)
      ? value.filter((id) => typeof id === 'string' && id !== '')
      : value,
  ),
  status: enums(['up', 'down'] as const),
});

/**
 * Keep the entries of a list that fit a struct.
 *
 * @param list - A list read off the socket. Anything else gives no entries.
 * @param struct - What a good entry looks like.
 * @returns The entries that fit, as the struct read them.
 */
export function keepValidEntries<Entry, Schema>(
  list: unknown,
  struct: Struct<Entry, Schema>,
): Entry[] {
  if (!Array.isArray(list)) {
    return [];
  }
  const kept: Entry[] = [];
  for (const candidate of list) {
    const [error, entry] = validate(candidate, struct, { coerce: true });
    if (!error) {
      kept.push(entry);
    }
  }
  return kept;
}

/**
 * Read the lists of a `pricesUpdated` payload.
 *
 * @param payload - The object passed to `publish`.
 * @returns The prices and the removed assets that fit. Both are empty when the
 * payload is not an object.
 */
export function readQuotePayload(payload: unknown): {
  updates: Infer<typeof QuoteUpdateStruct>[];
  removed: Infer<typeof QuoteRefStruct>[];
} {
  const [error, lists] = validate(payload, PayloadStruct);
  if (error) {
    return { updates: [], removed: [] };
  }
  return {
    updates: keepValidEntries(lists.updates, QuoteUpdateStruct),
    removed: keepValidEntries(lists.removed, QuoteRefStruct),
  };
}

/**
 * Read a chain-status system notification.
 *
 * @param data - The `data` field of the notification.
 * @returns The chains and their status, or `undefined` when it names no chain
 * or no known status. It never throws.
 */
export function readSystemNotification(
  data: unknown,
): Infer<typeof SystemNotificationStruct> | undefined {
  const [error, notification] = validate(data, SystemNotificationStruct, {
    coerce: true,
  });
  if (error || notification.chainIds.length === 0) {
    return undefined;
  }
  return { chainIds: notification.chainIds, status: notification.status };
}
