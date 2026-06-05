import { toChecksumHexAddress } from '@metamask/controller-utils';
import { KnownCaipNamespace } from '@metamask/utils';

/**
 * Bitcoin bech32 / bech32m address prefixes that we lowercase per the auth
 * API canonicalization rules. The prefix is the network identifier (`bc`,
 * `tb`, `bcrt`) plus the bech32 separator (`1`); matching against this form
 * pins the check to actual bech32 addresses and avoids accidentally
 * matching legacy base58check addresses that happen to start with the same
 * letters. Both segwit (`…q…`) and taproot (`…p…`) variants are subsumed.
 * Legacy base58check P2PKH addresses (mainnet `1…`, testnet `m…`/`n…`) are
 * case-sensitive and intentionally not in this list.
 *
 * Today the wallet only creates `BtcScope.Mainnet` accounts, but the
 * non-mainnet prefixes are kept here as cheap forward-compat: per the auth
 * API spec the lowercase rule is shape-based, not network-based.
 */
const BECH32_BITCOIN_ADDRESS_PREFIXES = ['bc1', 'tb1', 'bcrt1'] as const;

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
 * - `bip122` — bech32 / bech32m addresses (mainnet `bc1…`, testnet
 *   `tb1…`, regtest `bcrt1…`) must be all-lowercase; legacy base58check
 *   P2PKH addresses (`1…`, `m…`, `n…`) are accepted as-is.
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
    case KnownCaipNamespace.Bip122: {
      const lowercased = address.toLowerCase();
      if (
        BECH32_BITCOIN_ADDRESS_PREFIXES.some((prefix) =>
          lowercased.startsWith(prefix),
        )
      ) {
        return lowercased;
      }
      return address;
    }
    default:
      throw new ProofUnsupportedNamespaceError(namespace);
  }
}
