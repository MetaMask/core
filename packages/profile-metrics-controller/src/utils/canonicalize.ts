import { toChecksumHexAddress } from '@metamask/controller-utils';
import { KnownCaipNamespace } from '@metamask/utils';

/**
 * Bech32 / bech32m human-readable parts that we lowercase per the auth API
 * canonicalization rules. Only Bitcoin mainnet (`bc1…`) is in scope; other
 * networks are intentionally unhandled until the wallet supports them.
 */
const BECH32_BITCOIN_MAINNET_PREFIX = 'bc1';

/**
 * Thrown when {@link canonicalizeAddress} is given a namespace it does
 * not know how to handle.
 * Callers in the polling pipeline use this to fall back to submitting the
 * account without a proof rather than blocking the batch.
 */
export class ProofUnsupportedNamespaceError extends Error {
  constructor(namespace: string) {
    super(`Proof of ownership is not supported for namespace '${namespace}'.`);
    this.name = 'ProofUnsupportedNamespaceError';
  }
}

/**
 * Returns the address in the canonical encoding the auth API expects for the
 * given CAIP-2 namespace.
 *
 * Encoding rules (per the `PUT /api/v2/profile/accounts` spec):
 *
 * - `eip155` — EIP-55 mixed-case hex checksum.
 * - `solana`, `tron` — base58 / base58check, single canonical encoding; returned
 *   as-is (the server rejects malformed inputs with 400).
 * - `bip122` — bech32 / bech32m addresses (`bc1…`) must be all-lowercase;
 *   legacy P2PKH addresses (starting with `1`) are accepted as-is.
 *
 * @param address - The address to canonicalize.
 * @param namespace - The CAIP-2 namespace of the chain the address belongs to.
 * @returns The address in its canonical form for `namespace`.
 * @throws {ProofUnsupportedNamespaceError} if `namespace` is not one of
 * `eip155`, `solana`, `tron`, or `bip122`.
 */
export function canonicalizeAddress(
  address: string,
  namespace: string,
): string {
  switch (namespace) {
    case KnownCaipNamespace.Eip155:
      return toChecksumHexAddress(address);
    case KnownCaipNamespace.Solana:
    case KnownCaipNamespace.Tron:
      return address;
    case KnownCaipNamespace.Bip122:
      if (address.toLowerCase().startsWith(BECH32_BITCOIN_MAINNET_PREFIX)) {
        return address.toLowerCase();
      }
      return address;
    default:
      throw new ProofUnsupportedNamespaceError(namespace);
  }
}
