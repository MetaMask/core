/**
 * Minimal RFC 6238 TOTP (HMAC-SHA1, 30s step, 6 digits) for mock escrow and
 * onboarding enrollment. Not a general-purpose authenticator library.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encodes bytes as unpadded base32 (RFC 4648).
 *
 * @param bytes - Input bytes.
 * @returns Uppercase base32 string.
 */
export function encodeBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/**
 * Decodes an unpadded base32 string to bytes.
 *
 * @param input - Base32 string (spaces ignored; case-insensitive).
 * @returns Decoded bytes.
 */
export function decodeBase32(input: string): Uint8Array {
  const normalized = input.replace(/\s+/gu, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of normalized) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) {
      throw new Error('Invalid base32 character');
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

/**
 * Generates a random 20-byte TOTP shared secret as base32.
 *
 * @param getRandomBytes - Optional RNG (defaults to Web Crypto).
 * @returns Base32-encoded secret.
 */
export function generateTotpSecret(
  getRandomBytes: (length: number) => Uint8Array = (length) => {
    const bytes = new Uint8Array(length);
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  },
): string {
  return encodeBase32(getRandomBytes(20));
}

/**
 * Builds an `otpauth://` URI for authenticator apps.
 *
 * @param params - Label / issuer / secret.
 * @param params.secret - Base32 shared secret.
 * @param params.accountName - Account label (e.g. email).
 * @param params.issuer - Issuer name (defaults to MetaMask).
 * @returns otpauth URI string.
 */
export function buildTotpOtpAuthUri(params: {
  secret: string;
  accountName: string;
  issuer?: string;
}): string {
  const issuer = params.issuer ?? 'MetaMask';
  const label = encodeURIComponent(`${issuer}:${params.accountName}`);
  const query = new URLSearchParams({
    secret: params.secret.replace(/\s+/gu, ''),
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

/**
 * Computes a 6-digit TOTP for the given secret and unix time.
 *
 * @param secretBase32 - Shared secret (base32).
 * @param unixTimeSeconds - Unix timestamp in seconds (defaults to now).
 * @returns Six-digit code string.
 */
export async function computeTotpCode(
  secretBase32: string,
  unixTimeSeconds: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const key = decodeBase32(secretBase32);
  const counter = Math.floor(unixTimeSeconds / 30);
  const counterBytes = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i -= 1) {
    counterBytes[i] = c & 0xff;
    c = Math.floor(c / 256);
  }

  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(
    await globalThis.crypto.subtle.sign('HMAC', cryptoKey, counterBytes),
  );
  const offset = signature[signature.length - 1] & 0x0f;
  const binary =
    ((signature[offset] & 0x7f) << 24) |
    ((signature[offset + 1] & 0xff) << 16) |
    ((signature[offset + 2] & 0xff) << 8) |
    (signature[offset + 3] & 0xff);
  const otp = binary % 1_000_000;
  return otp.toString().padStart(6, '0');
}

/**
 * Verifies a TOTP code with ±1 step window.
 *
 * @param secretBase32 - Shared secret (base32).
 * @param code - User-provided code.
 * @param unixTimeSeconds - Unix timestamp in seconds (defaults to now).
 * @returns Whether the code is valid.
 */
export async function verifyTotpCode(
  secretBase32: string,
  code: string,
  unixTimeSeconds: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const normalized = code.replace(/\s+/gu, '');
  if (!/^\d{6}$/u.test(normalized)) {
    return false;
  }
  for (const skew of [-1, 0, 1]) {
    const expected = await computeTotpCode(
      secretBase32,
      unixTimeSeconds + skew * 30,
    );
    if (expected === normalized) {
      return true;
    }
  }
  return false;
}
