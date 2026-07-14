import { decodePartialCBOR } from '@levischuck/tiny-cbor';

import type { ParsedAuthenticatorData, AuthenticatorDataFlags } from './types';

/* eslint-disable no-bitwise */

/**
 * Parse an authenticator data buffer per §6.1 of the WebAuthn spec.
 *
 * @param authData - Raw authenticator data bytes.
 * @returns Parsed authenticator data with flags, rpIdHash, counter, and
 *   optional attested credential data.
 */
export function parseAuthenticatorData(
  authData: Uint8Array,
): ParsedAuthenticatorData {
  if (authData.byteLength < 37) {
    throw new Error(
      `authenticatorData is ${authData.byteLength} bytes, expected at least 37`,
    );
  }

  let pointer = 0;

  const rpIdHash = authData.slice(pointer, pointer + 32);
  pointer += 32;

  const flagsByte = authData[pointer];
  const flags: AuthenticatorDataFlags = {
    up: Boolean(flagsByte & (1 << 0)),
    uv: Boolean(flagsByte & (1 << 2)),
    be: Boolean(flagsByte & (1 << 3)),
    bs: Boolean(flagsByte & (1 << 4)),
    at: Boolean(flagsByte & (1 << 6)),
    ed: Boolean(flagsByte & (1 << 7)),
    flagsByte,
  };
  pointer += 1;

  const counterView = new DataView(
    authData.buffer,
    authData.byteOffset + pointer,
    4,
  );
  const counter = counterView.getUint32(0, false);
  pointer += 4;

  const result: ParsedAuthenticatorData = {
    rpIdHash,
    flags,
    counter,
  };

  if (flags.at) {
    const aaguid = authData.slice(pointer, pointer + 16);
    pointer += 16;

    const credIDLenView = new DataView(
      authData.buffer,
      authData.byteOffset + pointer,
      2,
    );
    const credIDLen = credIDLenView.getUint16(0, false);
    pointer += 2;

    const credentialID = authData.slice(pointer, pointer + credIDLen);
    pointer += credIDLen;

    const pubKeyBytes = authData.slice(pointer);
    const [, nextOffset] = decodePartialCBOR(
      new Uint8Array(pubKeyBytes),
      0,
    ) as [unknown, number];
    const credentialPublicKey = authData.slice(pointer, pointer + nextOffset);
    pointer += nextOffset;

    result.aaguid = aaguid;
    result.credentialID = credentialID;
    result.credentialPublicKey = credentialPublicKey;
  }

  if (flags.ed) {
    const remaining = authData.slice(pointer);
    const [decoded, consumed] = decodePartialCBOR(
      new Uint8Array(remaining),
      0,
    ) as [Map<string, unknown>, number];
    result.extensionsData = decoded;
    result.extensionsDataBuffer = remaining.slice(0, consumed);
    pointer += consumed;
  }

  if (authData.byteLength > pointer) {
    throw new Error('Leftover bytes detected while parsing authenticator data');
  }

  return result;
}

/* eslint-enable no-bitwise */
