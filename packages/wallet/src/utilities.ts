import { wordlist } from '@metamask/scure-bip39/dist/wordlists/english.js';

import { Wallet } from './Wallet.js';

/**
 * Import a secret recovery phrase using the wallet object.
 *
 * @param wallet - The wallet object.
 * @param password - The password to the MetaMask wallet (not the SRP).
 * @param phrase - The SRP as a string.
 */
export async function importSecretRecoveryPhrase(
  wallet: Wallet,
  password: string,
  phrase: string,
): Promise<void> {
  const indices = phrase.split(' ').map((word) => wordlist.indexOf(word));
  const mnemonic = new Uint8Array(new Uint16Array(indices).buffer);

  // TODO: This should use the new MultichainAccountService.
  await wallet.messenger.call(
    'KeyringController:createNewVaultAndRestore',
    password,
    mnemonic,
  );
}
