import type {
  BatchTransactionParams,
  TransactionMeta,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../logger.js';
import { MUSD_MONAD_FIAT_ASSET } from '../strategy/fiat/constants.js';
import type { TransactionPayControllerMessenger } from '../types.js';
import { findRecentChompVaultDeposit } from './chomp.js';
import { resolveSecondLegCalls, submitSecondLeg } from './second-leg.js';

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
 * A thin, Money-Account-specific wrapper around {@link submitSecondLeg} that
 * pins the chain to Monad and layers on CHOMP race handling.
 *
 * @param options - Submit options.
 * @param options.fromBlock - Block number to start searching for CHOMP deposits.
 * @param options.messenger - Controller messenger.
 * @param options.moneyAccountAddress - Money Account address sending the vault
 * deposit. Defaults to `transaction.txParams.from` (the deposit-flow sender);
 * withdraw flows pass it explicitly since their `from` is the funding EOA.
 * @param options.depositCalls - Pre-built vault-deposit batch for withdraw
 * flows, whose parent transaction carries no vault calls. When omitted the
 * batch is derived from the transaction's own nested calls re-encoded via
 * `getAmountData`.
 * @param options.sourceAmountRaw - Settled mUSD amount in raw units.
 * @param options.transaction - Original Money Account transaction meta.
 * @param options.vaultDisabled - When `true`, skip the vault batch and leave
 * the settled mUSD in the Money Account. Caller-evaluated kill-switch.
 * @returns Hash of the final submitted child transaction, if available.
 */
export async function submitMoneyAccountVaultDeposit({
  fromBlock,
  messenger,
  moneyAccountAddress: moneyAccountAddressOverride,
  depositCalls,
  sourceAmountRaw,
  transaction,
  vaultDisabled,
}: {
  fromBlock?: Hex;
  messenger: TransactionPayControllerMessenger;
  moneyAccountAddress?: Hex;
  depositCalls?: BatchTransactionParams[];
  sourceAmountRaw: string;
  transaction: TransactionMeta;
  vaultDisabled: boolean;
}): Promise<{ transactionHash?: Hex }> {
  const transactionId = transaction.id;
  const moneyAccountAddress = (moneyAccountAddressOverride ??
    transaction.txParams.from) as Hex | undefined;

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

  // Resolved up front so the parent transaction reflects the settled amount
  // even when the CHOMP pre-check short-circuits the submission below.
  const calls = await resolveSecondLegCalls({
    calls: depositCalls,
    messenger,
    note: 'Money Account vault deposit: update vault amount',
    sourceAmountRaw,
    transaction,
  });

  // CHOMP pre-check: skip the batch entirely if CHOMP has already auto-vaulted
  // the funds during or before the checkout window.
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

  return await submitSecondLeg({
    calls,
    chainId: MUSD_MONAD_FIAT_ASSET.chainId,
    errorPrefix: VAULT_ERROR_PREFIX,
    from: moneyAccountAddress,
    messenger,
    // CHOMP post-check: CHOMP may have won the race between the pre-check and
    // submit. Return the CHOMP hash instead of surfacing a Vault error.
    onError: async () =>
      await tryFindChompDeposit({
        fromBlock,
        messenger,
        moneyAccountAddress,
        sourceAmountRaw,
        transactionId,
      }),
    sourceAmountRaw,
    transaction,
  });
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
