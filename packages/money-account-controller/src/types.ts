import type {
  KeyringAccount,
  KeyringAccountEntropyMnemonicOptions,
} from '@metamask/keyring-api';

/** A money account represents an account managed by the MoneyAccountController. */
export type MoneyAccount = Omit<KeyringAccount, 'options'> & {
  // We use stricter options for money accounts. They can be seen as BIP-44 accounts
  // and we make them non-exportable too.
  options: {
    entropy: KeyringAccountEntropyMnemonicOptions;
    exportable: false;
  };
};
