import type { Infer } from '@metamask/superstruct';
import {
  array,
  boolean,
  is,
  nullable,
  number,
  string,
  type,
} from '@metamask/superstruct';
import type { Hex } from '@metamask/utils';

import {
  PERPS_ACCESS_CONFIG,
  PERPS_CONSTANTS,
} from '../constants/perpsConfig.js';
import { isPerpsProviderType } from '../routing/isPerpsProviderType.js';
import type {
  PerpsAccessPolicy,
  PerpsEnrollment,
  PerpsPlatformDependencies,
  PerpsProgram,
  PerpsVenueAccess,
} from '../types/index.js';
import { ensureError } from '../utils/errorUtils.js';

export type PerpsAccessNetwork = 'mainnet' | 'testnet';

/** An access policy and when it was received. */
export type PerpsAccessPolicyRecord = Readonly<{
  policy: PerpsAccessPolicy;
  fetchedAt: number;
}>;

const VenueStruct = type({
  providerId: string(),
  marketSource: nullable(string()),
  listed: boolean(),
  access: string(),
});

const PolicyStruct = type({
  venues: array(VenueStruct),
  programs: array(
    type({ id: string(), enrollable: boolean(), venues: array(VenueStruct) }),
  ),
  ttlSeconds: number(),
});

const RecordStruct = type({ policy: PolicyStruct, fetchedAt: number() });

/**
 * Keep venues this client knows how to serve. A venue for a provider or an
 * access level added later is dropped, so it stays hidden and blocked.
 *
 * @param venues - Venues as received.
 * @returns Known venues.
 */
function toKnownVenues(
  venues: Infer<typeof VenueStruct>[],
): PerpsVenueAccess[] {
  return venues.flatMap((venue) =>
    isPerpsProviderType(venue.providerId) &&
    (venue.access === 'trade' || venue.access === 'view')
      ? [
          {
            providerId: venue.providerId,
            marketSource: venue.marketSource,
            listed: venue.listed,
            access: venue.access,
          },
        ]
      : [],
  );
}

/**
 * Validate an access policy.
 *
 * @param value - Untrusted value.
 * @returns The policy, or null when it is malformed.
 */
function parsePolicy(value: unknown): PerpsAccessPolicy | null {
  if (
    !is(value, PolicyStruct) ||
    !Number.isFinite(value.ttlSeconds) ||
    value.ttlSeconds <= 0
  ) {
    return null;
  }
  const programs: PerpsProgram[] = value.programs.map((program) => ({
    id: program.id,
    enrollable: program.enrollable,
    venues: toKnownVenues(program.venues),
  }));
  return {
    venues: toKnownVenues(value.venues),
    programs,
    ttlSeconds: value.ttlSeconds,
  };
}

/**
 * PerpsAccessService
 *
 * Fetches the backend access policy, caches it on disk per network, and
 * caches wallet enrollments. It holds no access rules: the backend decides
 * venues and `resolvePerpsAccess` applies them.
 */
export class PerpsAccessService {
  readonly #deps: PerpsPlatformDependencies;

  readonly #records = new Map<PerpsAccessNetwork, PerpsAccessPolicyRecord>();

  readonly #lastAttemptAt = new Map<PerpsAccessNetwork, number>();

  readonly #inFlight = new Map<
    PerpsAccessNetwork,
    Promise<PerpsAccessPolicyRecord | null>
  >();

  readonly #enrollments = new Map<string, Promise<PerpsEnrollment>>();

  readonly #positionVenueKeys = new Map<string, Promise<string[]>>();

  /**
   * Create a new PerpsAccessService instance.
   *
   * @param deps - Platform dependencies; reads `terminalApi.accessPolicyUrl` and `diskCache`.
   */
  constructor(deps: PerpsPlatformDependencies) {
    this.#deps = deps;
  }

  /**
   * Read the cached policy without waiting, from memory or the synchronous
   * disk API.
   *
   * @param network - Network.
   * @returns The cached record, fresh or not, or null.
   */
  readCached(network: PerpsAccessNetwork): PerpsAccessPolicyRecord | null {
    const record = this.#records.get(network);
    if (record) {
      return record;
    }
    try {
      const raw = this.#deps.diskCache.getItemSync?.(this.#diskKey(network));
      return raw ? this.#remember(network, raw) : null;
    } catch {
      return null;
    }
  }

  /**
   * Read the cached policy from memory or disk.
   *
   * @param network - Network.
   * @returns The cached record, fresh or not, or null.
   */
  async loadCached(
    network: PerpsAccessNetwork,
  ): Promise<PerpsAccessPolicyRecord | null> {
    const record = this.readCached(network);
    if (record) {
      return record;
    }
    try {
      const raw = await this.#deps.diskCache.getItem(this.#diskKey(network));
      return raw ? this.#remember(network, raw) : null;
    } catch {
      return null;
    }
  }

  /**
   * Whether a record is younger than its TTL.
   *
   * @param record - Cached record.
   * @param now - Current time in ms.
   * @returns True when the record can be used as the policy.
   */
  isFresh(record: PerpsAccessPolicyRecord | null, now = Date.now()): boolean {
    return (
      record !== null &&
      record.fetchedAt <= now &&
      now < record.fetchedAt + record.policy.ttlSeconds * 1000
    );
  }

  /**
   * Fetch the policy and cache it. Without `force`, a fetch attempted within
   * the refresh interval is not repeated while the cached policy is fresh.
   *
   * @param network - Network.
   * @param options - Options.
   * @param options.force - Fetch even when one was attempted recently (app start, network switch).
   * @returns The new record, or null when nothing was fetched.
   */
  async refresh(
    network: PerpsAccessNetwork,
    options: { force?: boolean } = {},
  ): Promise<PerpsAccessPolicyRecord | null> {
    const pending = this.#inFlight.get(network);
    if (pending) {
      return pending;
    }
    const lastAttemptAt = this.#lastAttemptAt.get(network);
    if (
      !options.force &&
      lastAttemptAt !== undefined &&
      Date.now() - lastAttemptAt < PERPS_ACCESS_CONFIG.RefreshIntervalMs &&
      this.isFresh(this.#records.get(network) ?? null)
    ) {
      return null;
    }
    const url = this.#deps.terminalApi?.accessPolicyUrl;
    if (!url) {
      return null;
    }
    this.#lastAttemptAt.set(network, Date.now());
    const request = this.#fetchAndStore(url, network)
      .catch((error: unknown) => {
        this.#logError(error, 'refresh', { network });
        return null;
      })
      .finally(() => {
        this.#inFlight.delete(network);
      });
    this.#inFlight.set(network, request);
    return request;
  }

  /**
   * Read a wallet's enrollment in a program, cached per wallet until the next
   * policy fetch. No reader (the provider has no `getEnrollment`) or a failed
   * read is `none`.
   *
   * @param options - Options.
   * @param options.network - Network.
   * @param options.address - Wallet address.
   * @param options.programId - Program id.
   * @param options.read - Reads the enrollment from the program venue's provider.
   * @returns The wallet's enrollment.
   */
  async getEnrollment({
    network,
    address,
    programId,
    read,
  }: {
    network: PerpsAccessNetwork;
    address: Hex;
    programId: string;
    read: (() => Promise<PerpsEnrollment>) | undefined;
  }): Promise<PerpsEnrollment> {
    if (!read) {
      return 'none';
    }
    const key = `${network}:${address.toLowerCase()}:${programId}`;
    const cached = this.#enrollments.get(key);
    if (cached) {
      return cached;
    }
    const request = read().catch((error: unknown) => {
      this.#enrollments.delete(key);
      this.#logError(error, 'getEnrollment', { programId });
      return 'none' as const;
    });
    this.#enrollments.set(key, request);
    return request;
  }

  /**
   * Read the program venues where a wallet holds positions, cached per wallet
   * until the next policy fetch. A failed read is not cached and returns
   * `fallback`.
   *
   * @param options - Options.
   * @param options.network - Network.
   * @param options.address - Wallet address.
   * @param options.programId - Program id.
   * @param options.read - Reads the venue keys from the program's provider.
   * @param options.fallback - Result when the read fails.
   * @returns Venue keys with positions.
   */
  async getPositionVenueKeys({
    network,
    address,
    programId,
    read,
    fallback,
  }: {
    network: PerpsAccessNetwork;
    address: Hex;
    programId: string;
    read: () => Promise<string[]>;
    fallback: string[];
  }): Promise<string[]> {
    const key = `${network}:${address.toLowerCase()}:${programId}`;
    const cached = this.#positionVenueKeys.get(key);
    if (cached) {
      return cached;
    }
    const request = read().catch((error: unknown) => {
      this.#positionVenueKeys.delete(key);
      this.#logError(error, 'getPositionVenueKeys', { programId });
      return fallback;
    });
    this.#positionVenueKeys.set(key, request);
    return request;
  }

  async #fetchAndStore(
    url: string,
    network: PerpsAccessNetwork,
  ): Promise<PerpsAccessPolicyRecord> {
    const policy = await this.#fetchPolicy(url, network);
    const record = { policy, fetchedAt: Date.now() };
    this.#records.set(network, record);
    this.#enrollments.clear();
    this.#positionVenueKeys.clear();
    try {
      await this.#deps.diskCache.setItem(
        this.#diskKey(network),
        JSON.stringify(record),
      );
    } catch {
      // Disk persistence is best-effort; the policy stays cached in memory.
    }
    return record;
  }

  async #fetchPolicy(
    baseUrl: string,
    network: PerpsAccessNetwork,
  ): Promise<PerpsAccessPolicy> {
    const url = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}network=${network}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(new Error('Perps access policy timed out')),
      PERPS_ACCESS_CONFIG.FetchTimeoutMs,
    );
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(
          `Perps access policy returned ${String(response.status)}`,
        );
      }
      const policy = parsePolicy(await response.json());
      if (!policy) {
        throw new Error('Perps access policy failed schema validation');
      }
      return policy;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  #remember(
    network: PerpsAccessNetwork,
    raw: string,
  ): PerpsAccessPolicyRecord | null {
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
    if (!is(value, RecordStruct)) {
      return null;
    }
    const policy = parsePolicy(value.policy);
    if (!policy) {
      return null;
    }
    const record = { policy, fetchedAt: value.fetchedAt };
    this.#records.set(network, record);
    return record;
  }

  #diskKey(network: PerpsAccessNetwork): string {
    return `${PERPS_ACCESS_CONFIG.DiskCacheKeyPrefix}${network}`;
  }

  #logError(
    error: unknown,
    method: string,
    data: Record<string, unknown>,
  ): void {
    this.#deps.logger.error(
      ensureError(error, `PerpsAccessService.${method}`),
      {
        tags: { feature: PERPS_CONSTANTS.FeatureName, source: 'access-policy' },
        context: { name: `PerpsAccessService.${method}`, data },
      },
    );
  }
}
