/**
 * Client identity headers sent on every on-ramp API request, matching the
 * convention used by `@metamask/core-backend` and the bridge status API.
 */
export const RAMPS_CLIENT_PRODUCT_HEADER = 'x-metamask-clientproduct';
export const RAMPS_CLIENT_VERSION_HEADER = 'x-metamask-clientversion';

/** Host-supplied MetaMask client identity. All fields optional. */
export type RampsClientIdentity = {
  /** Product id, e.g. `metamask-mobile` or `metamask-extension`. */
  clientProduct?: string;
  /** App SemVer, e.g. `8.9.0` (not the ramps-controller package version). */
  clientVersion?: string;
};

/**
 * Query-param names mirroring the identity headers. The on-ramp CDN cache
 * key is the URL, so cacheable GETs must carry the identity in the query
 * string. The API reads params first and falls back to headers.
 */
export const RAMPS_CLIENT_PRODUCT_PARAM = 'clientProduct';
export const RAMPS_CLIENT_VERSION_PARAM = 'clientVersion';

/**
 * Builds identity headers, omitting empty values.
 *
 * @param identity - Optional product and version.
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
  return headers;
}

/**
 * Appends the identity as query params (CDN cache-key friendly), omitting
 * empty values. See {@link RAMPS_CLIENT_PRODUCT_PARAM}.
 *
 * @param url - URL to mutate.
 * @param identity - Optional product and version.
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
}
