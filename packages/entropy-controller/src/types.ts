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
 * The implementation of an entropy source within its category.
 */
export type EntropyImplementation =
  | 'mnemonic'
  | 'ledger'
  | 'trezor'
  | 'private-key'
  | 'mpc';

/**
 * The type of an entropy source, expressed as `category:implementation`.
 *
 * @example `'bip44:mnemonic'`, `'bip44:ledger'`, `'raw:private-key'`, `'raw:mpc'`
 */
export type EntropyType = `${EntropyCategory}:${EntropyImplementation}`;

/**
 * Unique identifier for an entropy source.
 *
 * Format: `entropy:{category}:{implementation}:{uuid}` where the UUID is a
 * deterministic fingerprint of the underlying secret, or `'_'` for hardware
 * wallets whose secret never leaves the device.
 */
export type EntropyId = string;

/**
 * Represents a source of entropy.
 */
export type Entropy = {
  /**
   * The unique identifier for this entropy source.
   */
  id: EntropyId;

  /**
   * The type of this entropy source.
   */
  type: EntropyType;
};

/**
 * An entropy source backed by a BIP-39 mnemonic (SRP).
 */
export type Bip44MnemonicEntropy = Entropy & {
  type: 'bip44:mnemonic';
};

/**
 * Type guard for {@link Bip44MnemonicEntropy}.
 *
 * @param entropy - The entropy source to check.
 * @returns `true` if the entropy source is a {@link Bip44MnemonicEntropy}.
 */
export function isBip44MnemonicEntropy(
  entropy: Entropy,
): entropy is Bip44MnemonicEntropy {
  return entropy.type === 'bip44:mnemonic';
}
