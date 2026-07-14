import { validateMnemonic } from '@metamask/scure-bip39';
import { wordlist } from '@metamask/scure-bip39/dist/wordlists/english';

const REDACTED = '[redacted]';

const VALID_SRP_WORD_COUNTS: readonly number[] = [12, 15, 18, 21, 24];

const INSPECT_CUSTOM = Symbol.for('nodejs.util.inspect.custom');

const WORDLIST_SET: ReadonlySet<string> = new Set(wordlist);

/**
 * Opaque wrapper around a wallet password.
 *
 * Constructed via {@link Password.from}, which validates the input. The
 * underlying string is only reachable through {@link Password.unwrap}; every
 * other path (`toString`, `JSON.stringify`, `util.inspect`, template-literal
 * interpolation) yields `[redacted]`. This makes accidental logging produce a
 * harmless placeholder instead of leaking the secret.
 */
export class Password {
  readonly #value: string;

  // See .from() for why this is private.
  // eslint-disable-next-line no-restricted-syntax
  private constructor(value: string) {
    this.#value = value;
  }

  /**
   * Wrap a non-empty string as a {@link Password}.
   *
   * Matches the `@metamask/keyring-controller` convention: any non-empty
   * string is acceptable; minimum-length policy is left to the keyring.
   *
   * @param value - The raw password string.
   * @returns A redacting {@link Password} wrapper.
   * @throws If `value` is empty.
   */
  static from(value: string): Password {
    if (value.length === 0) {
      throw new Error('Password must be a non-empty string');
    }
    return new Password(value);
  }

  /**
   * Reveal the underlying password string. Call this only at trust boundaries
   * (e.g. handing the value to the keyring or to a child-process env var).
   *
   * @returns The original password string.
   */
  unwrap(): string {
    return this.#value;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  [INSPECT_CUSTOM](): string {
    return REDACTED;
  }
}

/**
 * Opaque wrapper around a BIP-39 secret recovery phrase.
 *
 * Constructed via {@link Srp.from}, which validates the word count
 * (12/15/18/21/24) and that every word is present in the BIP-39 English
 * wordlist. The underlying string is only reachable through {@link Srp.unwrap};
 * every other path yields `[redacted]`.
 */
export class Srp {
  readonly #value: string;

  // See .from() for why this is private.
  // eslint-disable-next-line no-restricted-syntax
  private constructor(value: string) {
    this.#value = value;
  }

  /**
   * Validate and wrap a BIP-39 mnemonic phrase.
   *
   * Whitespace is normalized (trimmed and collapsed) before validation so that
   * copy-pasted phrases with accidental leading/trailing/extra spaces are
   * accepted. Catching malformed input here (rather than letting it reach
   * `KeyringController:createNewVaultAndRestore`) produces a clearer error.
   *
   * @param value - The raw mnemonic string.
   * @returns A redacting {@link Srp} wrapper containing the normalized phrase.
   * @throws If the word count is not one of 12/15/18/21/24, if any word is
   * not present in the BIP-39 English wordlist, or if the checksum is invalid.
   */
  static from(value: string): Srp {
    const words = value.trim().split(/\s+/u);
    if (!VALID_SRP_WORD_COUNTS.includes(words.length)) {
      throw new Error(
        `Secret recovery phrase must be 12, 15, 18, 21, or 24 words (got ${words.length})`,
      );
    }
    for (const word of words) {
      if (!WORDLIST_SET.has(word)) {
        throw new Error(
          'Secret recovery phrase contains a word not in the BIP-39 English wordlist',
        );
      }
    }

    const normalized = words.join(' ');
    if (!validateMnemonic(normalized, wordlist)) {
      throw new Error('Secret recovery phrase has an invalid checksum');
    }
    return new Srp(normalized);
  }

  /**
   * Reveal the underlying mnemonic string. Call this only at trust boundaries.
   *
   * @returns The original mnemonic string.
   */
  unwrap(): string {
    return this.#value;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  [INSPECT_CUSTOM](): string {
    return REDACTED;
  }
}
