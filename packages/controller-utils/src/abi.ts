import { AbiCoder, Interface, ParamType } from '@ethersproject/abi';
import {
  concatBytes,
  hexToBytes,
  bytesToHex,
  getChecksumAddress,
  add0x,
} from '@metamask/utils';
import type { Hex } from '@metamask/utils';

// Ethers does not export these unfortunately.
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

/**
 * Encode the data required for a function call.
 *
 * Note: This uses `@ethersproject/abi` under the hood, but for improved
 * performance, does not verify checksums of addresses. Make sure addresses
 * passed to this function are valid and checksummed if necessary.
 *
 * @param abi - The ABI instance.
 * @param functionName - The function name.
 * @param values - The parameters to encode.
 * @returns The encoded data for the function call in hexadecimal.
 */
export function encodeFunctionData(
  abi: Interface,
  functionName: string,
  values: unknown[],
): Hex {
  const func = abi.getFunction(functionName);
  const sigHash = hexToBytes(abi.getSighash(func));
  const encodedParams = fastAbiCoder.encode(func.inputs, values);
  return bytesToHex(concatBytes([sigHash, encodedParams]));
}
