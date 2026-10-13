import { bytesToString, isObject } from '@metamask/utils';

import { base64UrlToBytes } from './encoding.js';

/**
 * Reads the email claim from a partner identity JWT.
 *
 * Live tokens put email under `ext`.
 *
 * @param token - Compact JWT returned by AuthenticationController.
 * @returns The email claim.
 * @throws If the token is malformed or has no email claim.
 */
export function getEmailFromPartnerIdentityToken(token: string): string {
  const [, payloadSegment] = token.split('.');
  if (!payloadSegment) {
    throw new Error(
      'KycController: partner identity token is not a well-formed JWT',
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(bytesToString(base64UrlToBytes(payloadSegment)));
  } catch {
    throw new Error(
      'KycController: failed to decode partner identity token payload',
    );
  }

  const ext = isObject(payload) ? payload.ext : undefined;
  const email = isObject(ext) ? ext.email : undefined;
  // TODO check: email_verified: true too!
  if (typeof email !== 'string' || email.length === 0) {
    throw new Error(
      'KycController: partner identity token does not contain an email claim',
    );
  }
  return email;
}

/**
 * Whether `error` is an HTTP 422 from partner-identity token minting
 * (`EmailRequiredError.status`).
 *
 * @param error - The caught error.
 * @returns True when `error.status` is 422.
 */
export function isEmailRequiredError(error: unknown): boolean {
  return isObject(error) && error.status === 422;
}
