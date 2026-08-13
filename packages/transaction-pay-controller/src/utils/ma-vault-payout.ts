import { Web3Provider } from '@ethersproject/providers';
import { buildMoneyAccountDepositBatch } from '@metamask/money-account-utils';
import type { Hex } from '@metamask/utils';

import { CHAIN_ID_MONAD, MUSD_MONAD_ADDRESS } from '../constants.js';
import type { TransactionPayControllerMessenger } from '../types.js';
import type { SubmitMoneyAccountVaultDepositResult } from './ma-vault-deposit.js';
import { submitMoneyAccountVaultDepositBatch } from './ma-vault-deposit.js';
import {
  getMoneyAccountVaultConfig,
  isMoneyAccountVaultActionEnabled,
} from './money-account-vault-config.js';
import { getNetworkClientId } from './provider.js';
import { getTransferredAmountFromTxHash } from './transaction.js';

export type SubmitMoneyAccountVaultDepositRequest = {
  moneyAccountAddress: Hex;
  transactionHash: Hex;
  vaultDisabled?: boolean;
};

/**
 * Resolves an Iron payout transaction and vaults the received mUSD.
 *
 * @param request - Iron payout details.
 * @param messenger - Transaction Pay controller messenger.
 * @returns Hash of the confirmed vault transaction, or `{ skipped: true }` when
 * vaulting is disabled.
 */
export async function submitMoneyAccountVaultDepositFromPayout(
  request: SubmitMoneyAccountVaultDepositRequest,
  messenger: TransactionPayControllerMessenger,
): Promise<SubmitMoneyAccountVaultDepositResult> {
  const {
    moneyAccountAddress,
    transactionHash,
    vaultDisabled = false,
  } = request;

  if (
    vaultDisabled ||
    !isMoneyAccountVaultActionEnabled(messenger, 'deposit')
  ) {
    return { skipped: true };
  }

  const { amountRaw, blockNumber } = await getTransferredAmountFromTxHash({
    chainId: CHAIN_ID_MONAD,
    messenger,
    tokenAddress: MUSD_MONAD_ADDRESS,
    txHash: transactionHash,
    walletAddress: moneyAccountAddress,
  });

  if (!amountRaw || BigInt(amountRaw) <= 0n) {
    throw new Error('Payout transaction has no mUSD transfer');
  }

  const vaultConfig = getMoneyAccountVaultConfig(messenger);
  const networkClientId = getNetworkClientId(messenger, CHAIN_ID_MONAD);
  const networkClient = messenger.call(
    'NetworkController:getNetworkClientById',
    networkClientId,
  );
  const provider = new Web3Provider(networkClient.provider);
  const { approveTx, depositTx } = await buildMoneyAccountDepositBatch({
    amount: BigInt(amountRaw),
    provider,
    ...vaultConfig,
  });

  return await submitMoneyAccountVaultDepositBatch({
    depositCalls: [
      { ...approveTx.params, type: approveTx.type },
      { ...depositTx.params, type: depositTx.type },
    ],
    fromBlock: blockNumber,
    messenger,
    moneyAccountAddress,
    sourceAmountRaw: amountRaw,
    vaultDisabled: false,
  });
}
