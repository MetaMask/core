import { Web3Provider } from '@ethersproject/providers';
import { ORIGIN_METAMASK } from '@metamask/controller-utils';
import { buildMoneyAccountWithdrawBatch } from '@metamask/money-account-utils';
import type { TransactionBatchResult } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { isValidHexAddress } from '@metamask/utils';

import { CHAIN_ID_MONAD } from '../constants.js';
import type { TransactionPayControllerMessenger } from '../types.js';
import {
  getMoneyAccountVaultConfig,
  isMoneyAccountVaultActionEnabled,
} from './money-account-vault-config.js';
import { getNetworkClientId } from './provider.js';

/**
 * On-chain withdraw intent. Quote / Pix / Iron identifiers stay outside Core;
 * Monad and mUSD are fixed by the Money Account vault config constants.
 */
export type SubmitMoneyAccountVaultWithdrawRequest = {
  amountInRaw: string;
  moneyAccountAddress: Hex;
  recipient: Hex;
  requestId: string;
};

/**
 * Creates a user-confirmed atomic vmUSD withdrawal and mUSD transfer to Iron.
 *
 * @param request - Exact-out withdraw intent.
 * @param messenger - Transaction Pay controller messenger.
 * @returns The pending transaction batch ID.
 */
export async function submitMoneyAccountVaultWithdraw(
  request: SubmitMoneyAccountVaultWithdrawRequest,
  messenger: TransactionPayControllerMessenger,
): Promise<TransactionBatchResult> {
  validateRequest(request);

  if (!isMoneyAccountVaultActionEnabled(messenger, 'withdraw')) {
    throw new Error('Money Account vault withdrawal is disabled');
  }

  const amount = BigInt(request.amountInRaw);
  const balance = await messenger.call(
    'MoneyAccountBalanceService:getMoneyAccountBalance',
    request.moneyAccountAddress,
  );

  if (amount > BigInt(balance.vmusdValueInMusd)) {
    throw new Error('Insufficient withdrawable vmUSD balance');
  }

  const vaultConfig = getMoneyAccountVaultConfig(messenger);
  const networkClientId = getNetworkClientId(messenger, CHAIN_ID_MONAD);
  const networkClient = messenger.call(
    'NetworkController:getNetworkClientById',
    networkClientId,
  );
  const provider = new Web3Provider(networkClient.provider);
  const { withdrawTx, transferTx } = await buildMoneyAccountWithdrawBatch({
    accountantAddress: vaultConfig.accountantAddress,
    amount,
    chainId: CHAIN_ID_MONAD,
    moneyAccountAddress: request.moneyAccountAddress,
    provider,
    recipient: request.recipient,
    tellerAddress: vaultConfig.tellerAddress,
  });

  return await messenger.call('TransactionController:addTransactionBatch', {
    atomic: true,
    disableHook: true,
    disableSequential: true,
    disableUpgrade: true,
    from: request.moneyAccountAddress,
    isGasFeeSponsored: true,
    isInternal: true,
    networkClientId,
    origin: ORIGIN_METAMASK,
    requestId: request.requestId,
    requireApproval: true,
    skipInitialGasEstimate: true,
    transactions: [withdrawTx, transferTx],
  });
}

function validateRequest(
  request: SubmitMoneyAccountVaultWithdrawRequest,
): void {
  if (!request.requestId) {
    throw new Error('Missing withdraw request id');
  }

  let amount: bigint;
  try {
    amount = BigInt(request.amountInRaw);
  } catch {
    throw new Error('Withdrawal amount must be greater than zero');
  }

  if (amount <= 0n) {
    throw new Error('Withdrawal amount must be greater than zero');
  }

  if (!isValidHexAddress(request.recipient)) {
    throw new Error('Iron recipient is invalid');
  }
  if (
    request.recipient.toLowerCase() ===
    request.moneyAccountAddress.toLowerCase()
  ) {
    throw new Error('Iron recipient must differ from the Money Account');
  }
}
