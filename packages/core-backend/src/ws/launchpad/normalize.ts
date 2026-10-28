/**
 * Pure (dependency-free) helpers for the launchpad token stream: normalizing the
 * gateway's abbreviated-key events into a readable discriminated union, parsing a
 * delivered batch array, and building the per-asset channel name. Kept pure so a
 * later Explore phase can import them directly.
 */

import type {
  LaunchpadEventType,
  LaunchpadTokenCreatedEvent,
  LaunchpadTokenEvent,
  LaunchpadTokenMigratedEvent,
  LaunchpadTokenStatsEvent,
  RawLaunchpadTokenEvent,
} from './types.js';

/** Channel type / namespace for launchpad token subscriptions. */
export const LAUNCHPAD_SUBSCRIPTION_NAMESPACE = 'launchpad-tokens.v1';

/**
 * Build the per-asset launchpad token detail channel name.
 *
 * Token Details are delivered on the asset's own channel, e.g.
 * `launchpad-tokens.v1.eip155:8453/erc20:0x...`.
 *
 * @param assetId - CAIP-19 asset identifier.
 * @returns The fully-qualified channel name.
 */
export function buildChannel(assetId: string): string {
  return `${LAUNCHPAD_SUBSCRIPTION_NAMESPACE}.${assetId}`;
}

const EVENT_TYPES: ReadonlySet<LaunchpadEventType> = new Set([
  'created',
  'stats',
  'migrated',
]);

/**
 * Type guard for a plausible raw launchpad token event. Tolerant by design:
 * only the discriminator, timestamp and asset id are required.
 *
 * @param value - Candidate value.
 * @returns True if the value looks like a raw launchpad token event.
 */
function isRawLaunchpadTokenEvent(
  value: unknown,
): value is RawLaunchpadTokenEvent {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<RawLaunchpadTokenEvent>;
  return (
    typeof candidate.evt === 'string' &&
    EVENT_TYPES.has(candidate.evt) &&
    typeof candidate.ts === 'number' &&
    typeof candidate.a === 'string'
  );
}

/**
 * Normalize a single raw launchpad token event into the readable discriminated
 * union. Only the fields relevant to the event type are mapped.
 *
 * @param raw - The raw abbreviated-key event.
 * @returns The normalized event.
 */
export function normalizeEvent(
  raw: RawLaunchpadTokenEvent,
): LaunchpadTokenEvent {
  const base = {
    timestamp: raw.ts,
    assetId: raw.a,
  };

  switch (raw.evt) {
    case 'created': {
      const event: LaunchpadTokenCreatedEvent = {
        eventType: 'created',
        ...base,
        chainId: raw.c,
        name: raw.n,
        symbol: raw.s,
        launchpadId: raw.lp,
        launchpadProtocol: raw.lpp,
        decimals: raw.d,
        devAddress: raw.da,
        pairAddress: raw.pa,
        graduationPercent: raw.gp,
        graduationStage: raw.gs,
      };
      return event;
    }
    case 'migrated': {
      const event: LaunchpadTokenMigratedEvent = {
        eventType: 'migrated',
        ...base,
        chainId: raw.c,
        decimals: raw.d,
        devAddress: raw.da,
        pairAddress: raw.pa,
        graduationStage: raw.gs,
      };
      return event;
    }
    case 'stats':
    default: {
      const event: LaunchpadTokenStatsEvent = {
        eventType: 'stats',
        ...base,
        graduationPercent: raw.gp,
        graduationStage: raw.gs,
        marketCap: raw.mc,
        price: raw.p,
        liquidity: raw.l,
        holderCount: raw.h,
        volume1h: raw.v,
        txCount: raw.txs,
        buyCount: raw.bc,
        sellCount: raw.sc,
        sniperCount: raw.snc,
        sniperHoldingPercent: raw.snhp,
        deployerHoldingPercent: raw.dhp,
        insiderHoldingPercent: raw.ihp,
        top10HoldingPercent: raw.t10hp,
        circulatingSupply: raw.cs,
      };
      return event;
    }
  }
}

/**
 * Parse a delivered launchpad batch into normalized events. Tolerant of
 * non-array input and of malformed/partial entries, which are skipped.
 *
 * @param data - The `data` payload of a server notification (expected to be an
 * array of raw events).
 * @returns An array of normalized launchpad token events.
 */
export function parseBatch(data: unknown): LaunchpadTokenEvent[] {
  if (!Array.isArray(data)) {
    return [];
  }

  const events: LaunchpadTokenEvent[] = [];
  for (const entry of data) {
    if (isRawLaunchpadTokenEvent(entry)) {
      events.push(normalizeEvent(entry));
    }
  }
  return events;
}
