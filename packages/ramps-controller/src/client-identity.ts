/** Host-supplied MetaMask client identity. All fields optional. */
export type RampsClientIdentity = {
  /** Product id, e.g. `metamask-mobile` or `metamask-extension`. */
  clientProduct?: string;
  /** App SemVer, e.g. `8.9.0` (not the ramps-controller package version). */
  clientVersion?: string;
};

/**
 * Query-param names for the client identity, sent on every on-ramp API
 * request. Identity travels in the URL (not headers) because the on-ramp CDN
 * cache key is the URL — the API's version-gated feature flags evaluate these
 * params so cached responses always match the requesting cohort.
 */
export const RAMPS_CLIENT_PRODUCT_PARAM = 'clientProduct';
export const RAMPS_CLIENT_VERSION_PARAM = 'clientVersion';

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
