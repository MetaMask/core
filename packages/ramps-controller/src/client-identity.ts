/**
 * Platform-style identity headers sent on every on-ramp API request.
 * Do not overload the `controller` query param — that is the ramps-controller
 * package version used for JWT/auth minimums, not the MetaMask app version.
 */
export const RAMPS_CLIENT_PRODUCT_HEADER = 'x-metamask-clientproduct';
export const RAMPS_CLIENT_VERSION_HEADER = 'x-metamask-clientversion';
export const RAMPS_CLIENT_ENVIRONMENT_HEADER = 'x-metamask-clientenvironment';

/**
 * Host-supplied MetaMask client identity. All fields are optional so older
 * hosts keep compiling; omit them to send no identity headers.
 */
export type RampsClientIdentity = {
  /**
   * Product id, e.g. `metamask-mobile` or `metamask-extension`.
   */
  clientProduct?: string;
  /**
   * App SemVer, e.g. `8.9.0` from `getBaseSemVerVersion()`.
   */
  clientVersion?: string;
  /**
   * Build flavor aligned with Remote Feature Flag Client Config
   * (`prod` / `rc` / `exp` / `dev` / `beta` / `test`). Not an API-host switch.
   */
  clientEnvironment?: string;
};

/**
 * Query-param names mirroring the identity headers. The on-ramp API sits
 * behind a CDN whose cache key is the URL, so cacheable GETs must carry the
 * identity in the query string; headers alone would poison the cache across
 * clients. The API reads params first and falls back to headers.
 */
export const RAMPS_CLIENT_PRODUCT_PARAM = 'clientProduct';
export const RAMPS_CLIENT_VERSION_PARAM = 'clientVersion';
export const RAMPS_CLIENT_ENVIRONMENT_PARAM = 'clientEnvironment';

/**
 * Builds identity headers, omitting empty values.
 *
 * @param identity - Optional product, version, and environment.
 * @returns Headers to merge onto on-ramp fetches.
 */
export function getRampsClientIdentityHeaders(
  identity: RampsClientIdentity,
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (identity.clientProduct) {
    headers[RAMPS_CLIENT_PRODUCT_HEADER] = identity.clientProduct;
  }
  if (identity.clientVersion) {
    headers[RAMPS_CLIENT_VERSION_HEADER] = identity.clientVersion;
  }
  if (identity.clientEnvironment) {
    headers[RAMPS_CLIENT_ENVIRONMENT_HEADER] = identity.clientEnvironment;
  }
  return headers;
}

/**
 * Appends the identity as query params (CDN cache-key friendly), omitting
 * empty values. See {@link RAMPS_CLIENT_PRODUCT_PARAM}.
 *
 * @param url - URL to mutate.
 * @param identity - Optional product, version, and environment.
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
  if (identity.clientEnvironment) {
    url.searchParams.set(
      RAMPS_CLIENT_ENVIRONMENT_PARAM,
      identity.clientEnvironment,
    );
  }
}
