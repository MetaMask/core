import { encode } from '@metamask/abi-utils';
import { hashDelegation } from '@metamask/delegation-core';
import {
  bytesToHex,
  concatBytes,
  hexToBytes,
  numberToBytes,
  stringToBytes,
} from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import { keccak_256 as keccak256 } from '@noble/hashes/sha3';

import { DELEGATION_TYPES } from './constants.js';
import type { DelegationMessage } from './delegation.js';
import type { Eip7702Authorization, MfaWhitelistConfig } from './types.js';

const EIP712_DOMAIN_TYPEHASH = keccak256(
  stringToBytes(
    `EIP712Domain(${DELEGATION_TYPES.EIP712Domain.map(
      ({ name, type }) => `${type} ${name}`,
    ).join(',')})`,
  ),
);

/** The EIP-7702 authorization magic byte. */
const EIP7702_MAGIC = 0x05;

/**
 * Computes the EIP-191 hash of a personal message, as signed by
 * `personal_sign`.
 *
 * @param message - The message as hex-encoded bytes.
 * @returns The hash.
 */
export function hashPersonalMessage(message: Hex): Hex {
  const bytes = hexToBytes(message);
  return bytesToHex(
    keccak256(
      concatBytes([
        stringToBytes(`\x19Ethereum Signed Message:\n${bytes.length}`),
        bytes,
      ]),
    ),
  );
}

/**
 * Computes the EIP-712 hash of a delegation for the pinned
 * `DelegationManager` on the Money Account chain.
 *
 * @param delegation - The delegation message.
 * @param config - The whitelist config.
 * @returns The hash.
 */
export function hashDelegationTypedData(
  delegation: DelegationMessage,
  config: MfaWhitelistConfig,
): Hex {
  const domainSeparator = keccak256(
    encode(
      ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
      [
        EIP712_DOMAIN_TYPEHASH,
        keccak256(stringToBytes('DelegationManager')),
        keccak256(stringToBytes('1')),
        BigInt(config.chainId),
        config.contracts.DelegationManager,
      ],
    ),
  );
  const structHash = hashDelegation(
    {
      ...delegation,
      caveats: delegation.caveats.map((caveat) => ({ ...caveat, args: '0x' })),
      signature: '0x',
    },
    { out: 'bytes' },
  );
  return bytesToHex(
    keccak256(
      concatBytes([new Uint8Array([0x19, 0x01]), domainSeparator, structHash]),
    ),
  );
}

/**
 * RLP-encodes a byte string.
 *
 * @param bytes - The byte string, at most 55 bytes long.
 * @returns The encoding.
 */
function encodeRlpBytes(bytes: Uint8Array): Uint8Array {
  if (bytes.length === 1 && bytes[0] < 0x80) {
    return bytes;
  }
  return concatBytes([new Uint8Array([0x80 + bytes.length]), bytes]);
}

/**
 * RLP-encodes a non-negative integer as its minimal big-endian bytes.
 *
 * @param value - The integer.
 * @returns The encoding.
 */
function encodeRlpInteger(value: number): Uint8Array {
  return encodeRlpBytes(value === 0 ? new Uint8Array() : numberToBytes(value));
}

/**
 * Computes the hash of an EIP-7702 authorization:
 * `keccak256(0x05 || rlp([chainId, address, nonce]))`.
 *
 * @param authorization - The `[chainId, contractAddress, nonce]` tuple.
 * @returns The hash.
 */
export function hashEip7702Authorization(
  authorization: Eip7702Authorization,
): Hex {
  const [chainId, contractAddress, nonce] = authorization;
  // Safe integers and an address keep the payload within the 55 bytes of a
  // short RLP list.
  const payload = concatBytes([
    encodeRlpInteger(chainId),
    encodeRlpBytes(hexToBytes(contractAddress)),
    encodeRlpInteger(nonce),
  ]);
  return bytesToHex(
    keccak256(
      concatBytes([
        new Uint8Array([EIP7702_MAGIC, 0xc0 + payload.length]),
        payload,
      ]),
    ),
  );
}
