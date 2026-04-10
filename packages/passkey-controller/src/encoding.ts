export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function bytesToBase64URL(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/gu, '-').replace(/\//gu, '_').replace(/[=]+$/u, '');
}

export function decodeBase64UrlString(input: string): Uint8Array {
  let base64 = input.replace(/-/gu, '+').replace(/_/gu, '/');
  const pad = base64.length % 4;
  if (pad !== 0) {
    base64 += '='.repeat(4 - pad);
  }
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/**
 * Decodes a WebAuthn base64url wire string (or padded base64) into an `ArrayBuffer`.
 *
 * @param input - Base64url-encoded bytes (may use `-` / `_` and omit padding).
 * @returns The decoded bytes as an `ArrayBuffer`.
 */
export function base64UrlStringToArrayBuffer(input: string): ArrayBuffer {
  const bytes = decodeBase64UrlString(input);
  return new Uint8Array(bytes).buffer;
}
