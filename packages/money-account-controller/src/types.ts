import type {
  KeyringAccount,
  KeyringAccountEntropyMnemonicOptions,
  EntropySourceId,
} from '@metamask/keyring-api';

/**
 * Entropy options for MPC-backed money accounts. The entropy source ID is a
 * static identifier, as the MPC architecture currently yields a single keyring
 * (and account) per wallet.
 */
export type MoneyAccountEntropyMpcOptions = {
  type: 'mpc';

  /**
   * The entropy source ID (e.g. `entropy:mpc:_`).
   */
  id: EntropySourceId;
};

/**
 * Entropy options for money accounts.
 *
 * - `'mnemonic'`: the account is derived from a BIP-44 mnemonic (SRP). This is
 * the SFA (single-factor authentication) account.
 * - `'mpc'`: the account is backed by an MPC keyring. This is the MFA
 * (multi-factor authentication) account.
 */
export type MoneyAccountEntropyOptions =
  | KeyringAccountEntropyMnemonicOptions
  | MoneyAccountEntropyMpcOptions;

/** A money account represents an account managed by the MoneyAccountController. */
export type MoneyAccount = Omit<KeyringAccount, 'options'> & {
  // We use stricter options for money accounts. They can be seen as BIP-44 accounts
  // and we make them non-exportable too.
  options: {
    entropy: MoneyAccountEntropyOptions;
    exportable: false;
  };
};
