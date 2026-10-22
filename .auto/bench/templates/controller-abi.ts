// AUTO-GENERATED playground harness — vendored copy of
// packages/controller-utils/src/abi.ts (encodeFunctionData + FastAbiCoder),
// with the @metamask/utils byte helpers inlined so the Hermes bundle is
// self-contained. Semantics identical; only used off the final optimized path
// (baseline encode goes through this, matching production).
import { AbiCoder, Interface, ParamType } from '@ethersproject/abi';
import { keccak256 } from '@ethersproject/keccak256';

// --- inlined @metamask/utils helpers (byte-identical semantics) ---

function isHexString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith('0x') &&
    value.length % 2 === 0
  );
}

function add0x(hex: string): string {
  return hex.startsWith('0x') ? hex : `0x${hex}`;
}

function utf8ToBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) {
    bytes[i] = value.charCodeAt(i);
  }
  return bytes;
}

function hexToBytes(hex: string): Uint8Array {
  if (!isHexString(hex)) {
    throw new Error(`Value must be a hexadecimal string, but received ${hex}`);
  }
  const stripped = hex.slice(2);
  const bytes = new Uint8Array(stripped.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(stripped.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '0x';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function concatBytes(arrays: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const array of arrays) {
    total += array.length;
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }
  return result;
}

function getChecksumAddress(address: string): string {
  // EIP-55. Only used by FastAddressCoder#decode (address outputs) — not on
  // the aggregate3 hot path, kept for fidelity.
  const lower = address.toLowerCase();
  const nibbles = lower.slice(2);
  const hash = keccak256(utf8ToBytes(nibbles));
  let out = '0x';
  for (let i = 0; i < nibbles.length; i++) {
    const nibble = parseInt(hash[2 + i], 16);
    const char = nibbles[i];
    out += nibble >= 8 ? char.toUpperCase() : char;
  }
  return out;
}

// --- vendored from packages/controller-utils/src/abi.ts ---

type Coder = ReturnType<AbiCoder['_getCoder']>;
type Writer = Parameters<Coder['encode']>[0];
type Reader = Parameters<Coder['decode']>[0];

// FastAddressCoder that skips checksumming addresses when encoding and uses the memoized `getChecksumAddress` for decoding.
class FastAddressCoder implements Coder {
  name = 'address';

  type = 'address';

  dynamic = false;

  localName: string;

  constructor(localName: string) {
    this.localName = localName;
  }

  encode(writer: Writer, value: string): number {
    return writer.writeValue(value);
  }

  decode(reader: Reader): unknown {
    const value = reader.readValue();
    const paddedHex = value.toHexString().slice(2).padStart(40);
    return getChecksumAddress(add0x(paddedHex));
  }

  defaultValue(): string {
    return '0x0000000000000000000000000000000000000000';
  }

  /* istanbul ignore next */
  _throwError(_message: string, _value: unknown): void {
    throw new Error('Method not implemented.');
  }
}

class FastAbiCoder extends AbiCoder {
  _getCoder(param: ParamType): Coder {
    if (param.type === 'address') {
      return new FastAddressCoder(param.name);
    }
    return super._getCoder(param);
  }
}

const fastAbiCoder = new FastAbiCoder();

export function encodeFunctionData(
  abi: Interface,
  functionName: string,
  values: unknown[],
): `0x${string}` {
  const func = abi.getFunction(functionName);
  const sigHash = hexToBytes(abi.getSighash(func));
  const encodedParams = fastAbiCoder.encode(func.inputs, values);
  // @metamask/utils concatBytes implicitly runs valueToBytes on each element
  // (hex string -> bytes); replicate that for the AbiCoder hex output.
  return bytesToHex(
    concatBytes([sigHash, hexToBytes(encodedParams)]),
  ) as `0x${string}`;
}
