/**
 * The category of an entropy source.
 *
 * - `'bip44'` — Entropy that uses BIP-44 to derive signers (e.g. SRP, hardware
 *   wallets).
 * - `'raw'` — Entropy that exposes a single key directly, without derivation
 *   (e.g. imported private keys, MPC).
 */
export type EntropyCategory = 'bip44' | 'raw';

/**
 * The type of an entropy source, expressed as `category:implementation`.
 *
 * @example `'bip44:srp'`, `'bip44:ledger'`, `'raw:private-key'`, `'raw:mpc'`
 */
export type EntropyType = `${EntropyCategory}:${string}`;

/**
 * Unique identifier for an entropy source.
 */
export type EntropyId = string;

/**
 * Metadata associated with an entropy source.
 *
 * Currently a placeholder — fields will be added as requirements emerge.
 */
export type EntropyMetadata = {
  /**
   * The ID of the keyring that owns this entropy source.
   * Prefixed `legacy` because keyrings are a transitional backing store —
   * future entropy sources may not originate from a `KeyringController` keyring.
   */
  legacyEntropySource: string;
};
