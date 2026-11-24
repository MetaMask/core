/**
 * Build channel of the MetaMask client. The on-ramp API reads it to evaluate
 * release-candidate builds against release-candidate flag configuration, so
 * flags turned on for RC testing don't reach production builds of the
 * same version.
 */
export enum RampsClientBuild {
  ReleaseCandidate = 'rc',
  Production = 'prod',
}

/** Host-supplied MetaMask client identity. All fields optional. */
export type RampsClientIdentity = {
  /** Product id, e.g. `metamask-mobile` or `metamask-extension`. */
  clientProduct?: string;
  /** App SemVer, e.g. `8.9.0` (not the ramps-controller package version). */
  clientVersion?: string;
  /** Build channel, `rc` or `prod`. Any other value is not sent. */
  clientBuild?: RampsClientBuild;
};

/**
 * Query-param names for the client identity, sent on every on-ramp API
 * request. Identity travels in the URL (not headers) because the on-ramp CDN
 * cache key is the URL — the API's version-gated feature flags evaluate these
 * params so cached responses always match the requesting cohort.
 */
export const RAMPS_CLIENT_PRODUCT_PARAM = 'clientProduct';
export const RAMPS_CLIENT_VERSION_PARAM = 'clientVersion';
export const RAMPS_CLIENT_BUILD_PARAM = 'clientBuild';

const RAMPS_CLIENT_BUILDS: readonly string[] = Object.values(RampsClientBuild);

/**
 * Checks whether a value is a known {@link RampsClientBuild}.
 *
 * @param value - Value to check.
 * @returns Whether the value is `rc` or `prod`.
 */
export function isRampsClientBuild(value: unknown): value is RampsClientBuild {
  return typeof value === 'string' && RAMPS_CLIENT_BUILDS.includes(value);
}

/**
 * Appends the identity as query params (CDN cache-key friendly), omitting
 * empty values. See {@link RAMPS_CLIENT_PRODUCT_PARAM}.
 *
 * `clientBuild` is sent only when it is a known {@link RampsClientBuild}. A
 * missing or unknown build is left out, so the API evaluates the request as a
 * production build, which is how clients without this param already behave.
 *
 * @param url - URL to mutate.
 * @param identity - Optional product, version and build.
 */
export function addRampsClientIdentityParams(
  url: URL,
  identity: RampsClientIdentity,
): void {
  if (identity.clientProduct) {
    url.searchParams.set(RAMPS_CLIENT_PRODUCT_PARAM, identity.clientProduct);
  }
  if (identity.clientVersion) {
    url.searchParams.set(RAMPS_CLIENT_VERSION_PARAM, identity.clientVersion);
  }
  if (isRampsClientBuild(identity.clientBuild)) {
    url.searchParams.set(RAMPS_CLIENT_BUILD_PARAM, identity.clientBuild);
  }
}
