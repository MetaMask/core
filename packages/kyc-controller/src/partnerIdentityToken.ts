import { bytesToString, isObject } from '@metamask/utils';

import { base64UrlToBytes } from './encoding.js';

/**
 * Reads the email claim from a partner identity JWT.
 *
 * Live tokens put email under `ext`.
 *
 * @param token - Compact JWT returned by AuthenticationController.
 * @returns The verified email claim.
 * @throws If the token is malformed, the payload or `ext` is not an object,
 * the email claim is missing, or `ext.email_verified` is not `true`.
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

  if (!isObject(payload)) {
    throw new Error(
      'KycController: partner identity token payload is not an object',
    );
  }
  const { ext } = payload;
  if (!isObject(ext)) {
    throw new Error(
      'KycController: partner identity token payload has no ext object',
    );
  }
  const { email, email_verified: emailVerified } = ext;
  if (typeof email !== 'string' || email.length === 0) {
    throw new Error(
      'KycController: partner identity token does not contain an email claim',
    );
  }
  if (emailVerified !== true) {
    throw new Error(
      'KycController: partner identity token email is not verified',
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
