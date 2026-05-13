// TODO: Determine if these should be available directly on Wallet.
import { wordlist } from '@metamask/scure-bip39/dist/wordlists/english';
import type {
  AddTransactionOptions,
  TransactionMeta,
  TransactionParams,
} from '@metamask/transaction-controller';

import { Wallet } from './Wallet';

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

/**
 * Initialize the wallet object with a randomly generated secret recovery phrase.
 *
 * @param wallet - The wallet object.
 * @param password - The password to the MetaMask wallet (not the SRP).
 */
export async function createSecretRecoveryPhrase(
  wallet: Wallet,
  password: string,
): Promise<void> {
  // TODO: This should use the new MultichainAccountService.
  await wallet.messenger.call(
    'KeyringController:createNewVaultAndKeychain',
    password,
  );
}

/**
 * Sign a transaction using the wallet and submit it to the blockchain.
 *
 * @param wallet - The wallet object.
 * @param transaction - The transaction.
 * @param options - The transaction options (including which network to use).
 * @returns The result.
 */
export async function sendTransaction(
  wallet: Wallet,
  transaction: TransactionParams,
  options: AddTransactionOptions,
): Promise<{ transactionMeta: TransactionMeta; result: Promise<string> }> {
  const { transactionMeta, result } = await wallet.messenger.call(
    'TransactionController:addTransaction',
    transaction,
    options,
  );

  const approvalId = transactionMeta.id;

  await wallet.messenger.call('ApprovalController:acceptRequest', approvalId);

  return { transactionMeta, result };
}
