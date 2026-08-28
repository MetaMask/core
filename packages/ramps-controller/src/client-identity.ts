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
