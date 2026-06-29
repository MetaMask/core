import { ORIGIN_METAMASK } from '@metamask/controller-utils';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { TransactionType } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../logger';
import { MUSD_MONAD_FIAT_ASSET } from '../strategy/fiat/constants';
import type { TransactionPayControllerMessenger } from '../types';
import { findRecentChompVaultDeposit } from './chomp';
import { prefixError } from './error-prefix';
import { getNetworkClientId } from './provider';
import {
  collectTransactionIds,
  getTransaction,
  updateTransaction,
  waitForTransactionConfirmed,
} from './transaction';

const log = createModuleLogger(projectLogger, 'ma-vault-deposit');

export const VAULT_ERROR_PREFIX = 'Vault: ';

/**
 * Submits a Money Account mUSD vault deposit batch on Monad once the source
 * mUSD has settled in the Money Account (fiat on-ramp, Relay bridge, or any
 * other path). Re-encodes the original nested vault calldata with the
 * settled `sourceAmountRaw` via `getAmountData` and submits as a sponsored,
 * internal EIP-7702 batch. Callers decide whether to honour any vault
 * kill-switch by passing `vaultDisabled`.
 *
 * @param options - Submit options.
 * @param options.fromBlock - Block number to start searching for CHOMP deposits.
 * @param options.messenger - Controller messenger.
 * @param options.sourceAmountRaw - Settled mUSD amount in raw units.
 * @param options.transaction - Original Money Account transaction meta.
 * @param options.vaultDisabled - When `true`, skip the vault batch and leave
 * the settled mUSD in the Money Account. Caller-evaluated kill-switch.
 * @returns Hash of the final submitted child transaction, if available.
 */
export async function submitMoneyAccountVaultDeposit({
  fromBlock,
  messenger,
  sourceAmountRaw,
  transaction,
  vaultDisabled,
}: {
  fromBlock?: Hex;
  messenger: TransactionPayControllerMessenger;
  sourceAmountRaw: string;
  transaction: TransactionMeta;
  vaultDisabled: boolean;
}): Promise<{ transactionHash?: Hex }> {
  const transactionId = transaction.id;
  const moneyAccountAddress = transaction.txParams.from as Hex | undefined;

  if (!moneyAccountAddress) {
    throw new Error('Missing Money Account address');
  }

  if (vaultDisabled) {
    log('Skipping vault deposit because vaultDisabled is true', {
      moneyAccountAddress,
      sourceAmountRaw,
      transactionId,
    });

    return { transactionHash: '0x' };
  }

  const updatedTransaction =
    getTransaction(transactionId, messenger) ?? transaction;
  const { updates } = await messenger.call(
    'TransactionPayController:getAmountData',
    {
      amount: sourceAmountRaw,
      transaction: updatedTransaction,
    },
  );

  if (!updates.length) {
    throw new Error('No amount updates');
  }

  const nestedTransactions = updatedTransaction.nestedTransactions?.map(
    (nestedTransaction) => ({ ...nestedTransaction }),
  );

  if (!nestedTransactions?.length) {
    throw new Error('Missing nested transactions');
  }

  for (const { nestedTransactionIndex, data } of updates) {
    if (nestedTransactions[nestedTransactionIndex]) {
      nestedTransactions[nestedTransactionIndex].data = data;
    }
  }

  updateTransaction(
    {
      transactionId,
      messenger,
      note: 'Money Account vault deposit: update vault amount',
    },
    (tx) => {
      for (const { nestedTransactionIndex, data } of updates) {
        if (tx.nestedTransactions?.[nestedTransactionIndex]) {
          tx.nestedTransactions[nestedTransactionIndex].data = data;
        }
      }

      if (tx.requiredAssets?.[0]) {
        tx.requiredAssets[0].amount = `0x${BigInt(sourceAmountRaw).toString(
          16,
        )}`;
      }
    },
  );

  // CHOMP pre-check: skip addTransactionBatch entirely if CHOMP has already
  // auto-vaulted the funds during or before the checkout window.
  const preChompHash = await tryFindChompDeposit({
    fromBlock,
    messenger,
    moneyAccountAddress,
    sourceAmountRaw,
    transactionId,
  });

  if (preChompHash) {
    return { transactionHash: preChompHash };
  }

  const networkClientId = getNetworkClientId(
    messenger,
    MUSD_MONAD_FIAT_ASSET.chainId,
  );
  const transactionIds: string[] = [];
  const { end } = collectTransactionIds(
    MUSD_MONAD_FIAT_ASSET.chainId,
    moneyAccountAddress,
    messenger,
    (id) => {
      transactionIds.push(id);
      updateTransaction(
        {
          transactionId,
          messenger,
          note: 'Add required transaction ID from Money Account vault submission',
        },
        (tx) => {
          tx.requiredTransactionIds ??= [];
          tx.requiredTransactionIds.push(id);
        },
      );
    },
  );

  log('Submitting Money Account vault deposit', {
    moneyAccountAddress,
    nestedTransactionCount: nestedTransactions.length,
    networkClientId,
    sourceAmountRaw,
    transactionId,
  });

  try {
    await messenger.call('TransactionController:addTransactionBatch', {
      disableHook: true,
      disableSequential: true,
      disableUpgrade: true,
      from: moneyAccountAddress,
      isGasFeeSponsored: true,
      isInternal: true,
      networkClientId,
      origin: ORIGIN_METAMASK,
      requireApproval: false,
      skipInitialGasEstimate: true,
      transactions: nestedTransactions.map((nestedTransaction, index) => ({
        params: {
          data: nestedTransaction.data,
          to: nestedTransaction.to,
          value: nestedTransaction.value ?? '0x0',
        },
        type:
          index === 0
            ? (nestedTransaction.type ?? TransactionType.tokenMethodApprove)
            : TransactionType.contractInteraction,
      })),
    });
  } catch (error) {
    // CHOMP post-check: CHOMP may have won the race between pre-check and
    // submit. Return the CHOMP hash instead of surfacing a Vault-prefixed error.
    const postChompHash = await tryFindChompDeposit({
      fromBlock,
      messenger,
      moneyAccountAddress,
      sourceAmountRaw,
      transactionId,
    });

    if (postChompHash) {
      return { transactionHash: postChompHash };
    }

    throw prefixError(error, VAULT_ERROR_PREFIX);
  } finally {
    end();
  }

  log('Submitted Money Account vault deposit', {
    moneyAccountAddress,
    nestedTransactionCount: nestedTransactions.length,
    networkClientId,
    sourceAmountRaw,
    transactionId,
    transactionIds,
  });

  if (!transactionIds.length) {
    throw new Error('No transactions submitted');
  }

  await Promise.all(
    transactionIds.map((id) => waitForTransactionConfirmed(id, messenger)),
  );

  const hash = getTransaction(transactionIds.slice(-1)[0], messenger)?.hash;

  if (!hash) {
    throw new Error('Missing transaction hash');
  }

  log('Confirmed Money Account vault deposit', {
    hash,
    moneyAccountAddress,
    nestedTransactionCount: nestedTransactions.length,
    networkClientId,
    sourceAmountRaw,
    transactionId,
    transactionIds,
  });

  return { transactionHash: hash as Hex };
}

async function tryFindChompDeposit({
  fromBlock,
  messenger,
  moneyAccountAddress,
  sourceAmountRaw,
  transactionId,
}: {
  fromBlock: Hex | undefined;
  messenger: TransactionPayControllerMessenger;
  moneyAccountAddress: Hex;
  sourceAmountRaw: string;
  transactionId: string;
}): Promise<Hex | undefined> {
  if (!fromBlock) {
    return undefined;
  }

  try {
    return await findRecentChompVaultDeposit({
      fromBlock,
      messenger,
      moneyAccountAddress,
      sourceAmountRaw,
    });
  } catch (chompError) {
    log('CHOMP check failed', { chompError, transactionId });
    return undefined;
  }
}
