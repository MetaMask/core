import {
  MONEY_ACCOUNT_SIWE_CHAIN_ID,
  MONEY_ACCOUNT_SIWE_CHALLENGE_TTL_MS,
  MONEY_ACCOUNT_SIWE_CLOCK_SKEW_MS,
  MONEY_ACCOUNT_SIWE_STATEMENT,
} from './constants.js';

// Mirrors `buildSiweMessage` in the Money Account API's `vba-siwe.service.ts`.
// Any change to that template must be mirrored here, otherwise every challenge
// is rejected before signing.

/**
 * The domain and URI a Money Account SIWE message is bound to.
 */
export type SiweMessageTemplate = {
  /** Host the message is addressed to, such as `money.api.cx.metamask.io`. */
  domain: string;
  /** Origin the message is bound to, such as `https://money.api.cx.metamask.io`. */
  uri: string;
};

const SIWE_NONCE_PATTERN = /^[0-9a-f]{64}$/u;

const SIWE_ISSUED_AT_PATTERN = /^Issued At: (.+)$/mu;

const SIWE_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

/**
 * Derives the SIWE domain and URI bound to a Money Account API base URL.
 *
 * @param baseUrl - The Money Account API base URL for the active environment.
 * @returns The domain and URI the API should embed in its challenges.
 */
export function getSiweMessageTemplate(baseUrl: string): SiweMessageTemplate {
  const url = new URL(baseUrl);
  return { domain: url.host, uri: url.origin };
}

/**
 * Builds the exact SIWE message the Money Account API produces for a challenge.
 *
 * @param template - Domain and URI the message is bound to.
 * @param address - The account address being authenticated.
 * @param nonce - The challenge nonce, 64 lowercase hex characters.
 * @param issuedAtMs - Challenge issue time in milliseconds since the epoch.
 * @returns The expected message.
 */
export function buildSiweMessage(
  template: SiweMessageTemplate,
  address: string,
  nonce: string,
  issuedAtMs: number,
): string {
  return [
    `${template.domain} wants you to sign in with your Ethereum account:`,
    address.toLowerCase(),
    '',
    MONEY_ACCOUNT_SIWE_STATEMENT,
    '',
    `URI: ${template.uri}`,
    'Version: 1',
    `Chain ID: ${MONEY_ACCOUNT_SIWE_CHAIN_ID}`,
    `Nonce: ${nonce}`,
    `Issued At: ${new Date(issuedAtMs).toISOString()}`,
    `Expiration Time: ${new Date(
      issuedAtMs + MONEY_ACCOUNT_SIWE_CHALLENGE_TTL_MS,
    ).toISOString()}`,
  ].join('\n');
}

/**
 * Validates a challenge message before it is handed to the keyring for signing.
 *
 * Only the message's `Issued At` value is trusted, and only to rebuild the
 * expected message. Every other field comes from the client's template, so a
 * message with an extra, missing, or reordered field fails the exact-equality
 * check.
 *
 * @param options - The challenge and the context it must match.
 * @param options.template - Domain and URI the message is bound to.
 * @param options.address - The lowercased account address being authenticated.
 * @param options.nonce - The challenge nonce from the challenge response.
 * @param options.message - The challenge message returned by the API.
 * @param options.now - Current time in milliseconds since the epoch.
 * @returns A short failure reason, or `null` when the message is valid.
 */
export function validateSiweChallengeMessage({
  template,
  address,
  nonce,
  message,
  now,
}: {
  template: SiweMessageTemplate;
  address: string;
  nonce: string;
  message: string;
  now: number;
}): string | null {
  if (!SIWE_NONCE_PATTERN.test(nonce)) {
    return 'nonce is not 64 lowercase hex characters';
  }

  const issuedAtValue = SIWE_ISSUED_AT_PATTERN.exec(message)?.[1];
  if (issuedAtValue === undefined) {
    return 'issuedAt is missing';
  }

  if (!SIWE_TIMESTAMP_PATTERN.test(issuedAtValue)) {
    return 'issuedAt is malformed';
  }

  const issuedAtMs = Date.parse(issuedAtValue);
  if (Number.isNaN(issuedAtMs)) {
    return 'issuedAt is malformed';
  }

  if (issuedAtMs > now + MONEY_ACCOUNT_SIWE_CLOCK_SKEW_MS) {
    return 'issuedAt is too far in the future';
  }

  if (issuedAtMs + MONEY_ACCOUNT_SIWE_CHALLENGE_TTL_MS <= now) {
    return 'challenge has expired';
  }

  if (message !== buildSiweMessage(template, address, nonce, issuedAtMs)) {
    return 'message does not match the expected template';
  }

  return null;
}
