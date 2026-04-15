import { base64ToBytes, bytesToBase64 } from '@metamask/utils';

export function bytesToBase64URL(bytes: Uint8Array): string {
  const base64 = bytesToBase64(bytes);
  return base64.replace(/\+/gu, '-').replace(/\//gu, '_').replace(/[=]+$/u, '');
}

export function base64URLToBytes(input: string): Uint8Array {
  let base64 = input.replace(/-/gu, '+').replace(/_/gu, '/');
  const pad = base64.length % 4;
  if (pad !== 0) {
    base64 += '='.repeat(4 - pad);
  }
  return base64ToBytes(base64);
}
