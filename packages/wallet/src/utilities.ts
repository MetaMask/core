import { ApprovalRequest } from '@metamask/approval-controller';
import { wordlist } from '@metamask/scure-bip39/dist/wordlists/english';
import type {
  AddTransactionOptions,
  TransactionMeta,
  TransactionParams,
} from '@metamask/transaction-controller';
import {
  CaipAccountId,
  CaipChainId,
  Json,
  parseCaipAccountId,
} from '@metamask/utils';

import { Wallet } from './Wallet';

// TODO: Determine if these should be available directly on Wallet.
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

  const multichainWallet = await wallet.messenger.call(
    'MultichainAccountService:createMultichainAccountWallet',
    { type: 'restore', password, mnemonic },
  );

  await multichainWallet.discoverAccounts();
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
  const multichainWallet = await wallet.messenger.call(
    'MultichainAccountService:createMultichainAccountWallet',
    { type: 'create', password },
  );

  await multichainWallet.discoverAccounts();
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

/**
 * Sign a Solana transaction using the wallet.
 *
 * @param wallet - The wallet object.
 * @param scope - The CAIP-2 scope.
 * @param address - The CAIP-10 address.
 * @param transaction - A base64 encoded Solana transaction.
 * @returns The result.
 */
export async function signSolanaTransaction(
  wallet: Wallet,
  scope: CaipChainId,
  address: CaipAccountId,
  transaction: string,
): Promise<{ signedTransaction: string }> {
  const promise = wallet.messenger.call(
    'MultichainRoutingService:handleRequest',
    {
      origin: 'metamask',
      connectedAddresses: [address],
      scope,
      // @ts-expect-error The type here is wrong, a full JSON-RPC request is not required.
      request: {
        method: 'signTransaction',
        params: {
          account: {
            address: parseCaipAccountId(address).address,
          },
          transaction,
          scope,
        },
      },
    },
  );

  // TODO: Figure out a better way to do this.
  const approval = await new Promise<
    ApprovalRequest<Record<string, Json> | null>
  >((resolve) => {
    wallet.messenger.subscribe(
      'ApprovalController:stateChange',
      (approvals: ApprovalRequest<Record<string, Json> | null>[]) => {
        if (approvals.length > 0) {
          resolve(approvals[0]);
        }
      },
      (state) => Object.values(state.pendingApprovals),
    );
  });

  await wallet.messenger.call(
    'ApprovalController:acceptRequest',
    approval.id,
    true,
  );

  const result = await promise;

  return result as { signedTransaction: string };
}
