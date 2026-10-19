import type {
  KeyringAccount,
  KeyringAccountEntropyMnemonicOptions,
  KeyringAccountEntropyMpcOptions,
} from '@metamask/keyring-api';

/**
 * Entropy options for money accounts.
 *
 * - `'mnemonic'`: the account is derived from a BIP-44 mnemonic (SRP). This is
 * the SFA (single-factor authentication) account.
 * - `'mpc'`: the account is backed by an MPC Money keyring. This is the MFA
 * (multi-factor authentication) account.
 */
export type MoneyAccountEntropyOptions =
  | KeyringAccountEntropyMnemonicOptions
  | KeyringAccountEntropyMpcOptions;

/** A money account represents an account managed by the MoneyAccountController. */
export type MoneyAccount = Omit<KeyringAccount, 'options'> & {
  // We use stricter options for money accounts. They can be seen as BIP-44 accounts
  // and we make them non-exportable too.
  options: {
    entropy: MoneyAccountEntropyOptions;
    exportable: false;
  };
};
