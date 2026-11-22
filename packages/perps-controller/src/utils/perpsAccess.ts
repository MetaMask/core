import type { Hex } from '@metamask/utils';

import type {
  PerpsAccess,
  PerpsEnrollment,
  PerpsProgram,
  PerpsProviderType,
  PerpsVenueAccess,
} from '../types/index.js';

const MAIN_VENUE = 'main';

/**
 * Normalize a market source so a provider's main venue compares equal whether
 * it is written as null, undefined, '' or 'main'.
 *
 * @param marketSource - Market source as written by any source.
 * @returns The lowercase venue id, `main` for the provider's main venue.
 */
export function normalizeMarketSource(
  marketSource: string | null | undefined,
): string {
  const normalized = marketSource?.trim().toLowerCase();
  if (!normalized) {
    return MAIN_VENUE;
  }
  return normalized;
}

/**
 * Build the comparison key of a venue.
 *
 * @param providerId - Provider id.
 * @param marketSource - Market source, null for the main venue.
 * @returns `<providerId>:<marketSource>` with both parts normalized.
 */
export function getVenueKey(
  providerId: string,
  marketSource: string | null | undefined,
): string {
  return `${providerId.trim().toLowerCase()}:${normalizeMarketSource(marketSource)}`;
}

/**
 * Find a venue's access entry.
 *
 * @param venues - Venues to search.
 * @param providerId - Provider id.
 * @param marketSource - Market source, null for the main venue.
 * @returns The entry, or undefined when the venue is not listed in `venues`.
 */
export function findVenueAccess(
  venues: readonly PerpsVenueAccess[],
  providerId: string,
  marketSource: string | null | undefined,
): PerpsVenueAccess | undefined {
  const key = getVenueKey(providerId, marketSource);
  return venues.find(
    (venue) => getVenueKey(venue.providerId, venue.marketSource) === key,
  );
}

/**
 * Venues of one provider.
 *
 * @param access - Resolved access.
 * @param providerId - Provider id.
 * @returns That provider's venues.
 */
export function getProviderVenues(
  access: PerpsAccess,
  providerId: PerpsProviderType,
): PerpsVenueAccess[] {
  return access.venues.filter((venue) => venue.providerId === providerId);
}

/**
 * Whether every venue of a provider is listed and tradable.
 *
 * @param access - Resolved access.
 * @param providerId - Provider id.
 * @returns True when the provider has venues and all are listed with `trade`.
 */
export function isProviderFullyOpen(
  access: PerpsAccess,
  providerId: PerpsProviderType,
): boolean {
  const venues = getProviderVenues(access, providerId);
  return (
    venues.length > 0 &&
    venues.every((venue) => venue.listed && venue.access === 'trade')
  );
}

/**
 * Listed market sources of one provider, normalized (`main` for the main venue).
 *
 * @param access - Resolved access.
 * @param providerId - Provider id.
 * @returns Listed market sources.
 */
export function getListedMarketSources(
  access: PerpsAccess,
  providerId: PerpsProviderType,
): string[] {
  return getProviderVenues(access, providerId)
    .filter((venue) => venue.listed)
    .map((venue) => normalizeMarketSource(venue.marketSource));
}

/**
 * Venues used when no access policy younger than its TTL is available.
 *
 * @param options - Fallback inputs.
 * @param options.isRegionAllowed - Geolocation is known and not blocked.
 * @param options.hyperLiquidDexes - HyperLiquid DEXes enabled today, `main` included.
 * @param options.isLighterEnabled - Whether the Lighter provider is enabled today.
 * @returns Today's venues: listed with `trade` when allowed, unlisted `view` otherwise.
 */
export function getFallbackVenues({
  isRegionAllowed,
  hyperLiquidDexes,
  isLighterEnabled,
}: {
  isRegionAllowed: boolean;
  hyperLiquidDexes: readonly string[];
  isLighterEnabled: boolean;
}): PerpsVenueAccess[] {
  const access = isRegionAllowed ? 'trade' : 'view';
  const venue = (
    providerId: PerpsProviderType,
    marketSource: string,
  ): PerpsVenueAccess => ({
    providerId,
    marketSource:
      normalizeMarketSource(marketSource) === MAIN_VENUE ? null : marketSource,
    listed: isRegionAllowed,
    access,
  });
  const dexes = new Set([
    'main',
    ...hyperLiquidDexes.map(normalizeMarketSource),
  ]);
  return [
    ...Array.from(dexes, (dex) => venue('hyperliquid', dex)),
    ...(isLighterEnabled ? [venue('lighter', MAIN_VENUE)] : []),
  ];
}

/**
 * Apply programs to the region venues for one wallet. No I/O and no policy:
 * the backend decides venues, this only picks which set applies.
 *
 * @param options - Resolution inputs.
 * @param options.address - Selected wallet.
 * @param options.venues - Region venues: the fresh policy's, or the fallback's.
 * @param options.programs - Programs from the fresh policy, else from the last cached one.
 * @param options.enrollments - The wallet's enrollment per program id.
 * @param options.positionVenueKeys - Venue keys (`getVenueKey`) where the wallet has positions.
 * @returns The wallet's access.
 */
export function resolvePerpsAccess({
  address,
  venues,
  programs,
  enrollments,
  positionVenueKeys,
}: {
  address: Hex;
  venues: readonly PerpsVenueAccess[];
  programs: readonly PerpsProgram[];
  enrollments: Readonly<Record<string, PerpsEnrollment>>;
  positionVenueKeys: ReadonlySet<string>;
}): PerpsAccess {
  const asView = (venue: PerpsVenueAccess): PerpsVenueAccess => ({
    ...venue,
    access: 'view',
  });

  // An enrolled wallet gets its program's venues wherever it is.
  const enrolled = programs.find(
    (program) =>
      enrollments[program.id] === 'approved' ||
      enrollments[program.id] === 'reduceOnly',
  );
  if (enrolled) {
    return {
      address,
      venues:
        enrollments[enrolled.id] === 'approved'
          ? [...enrolled.venues]
          : enrolled.venues.map(asView),
    };
  }

  // Positions on a program venue without an approved state can only be viewed,
  // whether a freeze shows as reduce-only or as removal from the allowlist.
  // The venue stays unlisted unless the region lists it; positions stay visible.
  const frozen = programs
    .flatMap((program) => program.venues)
    .filter((venue) =>
      positionVenueKeys.has(getVenueKey(venue.providerId, venue.marketSource)),
    )
    .map((venue) => ({
      ...asView(venue),
      listed:
        findVenueAccess(venues, venue.providerId, venue.marketSource)?.listed ??
        false,
    }));
  const frozenKeys = new Set(
    frozen.map((venue) => getVenueKey(venue.providerId, venue.marketSource)),
  );
  return {
    address,
    venues: [
      ...venues.filter(
        (venue) =>
          !frozenKeys.has(getVenueKey(venue.providerId, venue.marketSource)),
      ),
      ...frozen,
    ],
  };
}

/**
 * Whether two access values are equal.
 *
 * @param a - First value.
 * @param b - Second value.
 * @returns True when both are null or describe the same address and venues.
 */
export function isSamePerpsAccess(
  a: PerpsAccess | null,
  b: PerpsAccess | null,
): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return (
    a.address.toLowerCase() === b.address.toLowerCase() &&
    a.venues.length === b.venues.length &&
    a.venues.every((venue, index) => {
      const other = b.venues[index];
      return (
        other !== undefined &&
        getVenueKey(venue.providerId, venue.marketSource) ===
          getVenueKey(other.providerId, other.marketSource) &&
        venue.listed === other.listed &&
        venue.access === other.access
      );
    })
  );
}
