import { bytesToString, isObject } from '@metamask/utils';

import { fromBase64Url } from './crypto.js';

/**
 * The claims the controller reads from an AuthController (Hydra) access token,
 * in the token's shape with camelCase names. The Auth API token hook adds the
 * step-up bindings under `ext`; a token that did not step up has none of them.
 */
export type AuthControllerTokenClaims = {
  /**
   * The profile id.
   */
  sub: string;
  /**
   * Unix time in seconds.
   */
  exp: number;
  ext: {
    requestHash: string;
    /**
     * Authentication assurance level.
     */
    aal?: number;
    /**
     * Only present when the step-up was bound to a payload's identifiers.
     */
    identifiersHash?: string;
  };
};

/**
 * Decodes the claims of an AuthController token without verifying its
 * signature; the escrow verifies the token. Required claims must be present;
 * optional ones may be absent but, when present, must have the right type.
 *
 * @param token - Compact JWT.
 * @returns The claims, or `undefined` if the token is malformed.
 */
export function decodeAuthControllerToken(
  token: unknown,
): AuthControllerTokenClaims | undefined {
  if (typeof token !== 'string') {
    return undefined;
  }
  let claims: unknown;
  try {
    claims = JSON.parse(
      bytesToString(fromBase64Url(token.split('.')[1] ?? '')),
    );
  } catch {
    return undefined;
  }
  if (!isObject(claims) || !isObject(claims.ext)) {
    return undefined;
  }
  const { sub, exp, ext } = claims;
  const { aal, request_hash: requestHash, identifiers_hash: identifiersHash } =
    ext;
  if (
    typeof sub !== 'string' ||
    typeof exp !== 'number' ||
    typeof requestHash !== 'string' ||
    (aal !== undefined && typeof aal !== 'number') ||
    (identifiersHash !== undefined && typeof identifiersHash !== 'string')
  ) {
    return undefined;
  }
  return { sub, exp, ext: { requestHash, aal, identifiersHash } };
}
