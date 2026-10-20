import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { CHAIN_ID_MONAD, MUSD_MONAD_ADDRESS } from '../constants.js';
import { projectLogger } from '../logger.js';
import { isMoneyAccountDepositTransaction } from '../strategy/fiat/utils.js';
import type { TransactionPayControllerMessenger } from '../types.js';
import { prefixError } from './error-prefix.js';
import { rpcRequest } from './provider.js';

export const VAULT_ERROR_PREFIX = 'Vault: ';

const log = createModuleLogger(projectLogger, 'chomp');

/** keccak256('Transfer(address,address,uint256)') */
const ERC20_TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

type RpcLog = {
  address: string;
  topics: string[];
  data: string;
  transactionHash: Hex;
};

export async function findRecentChompVaultDeposit({
  messenger,
  moneyAccountAddress,
  sourceAmountRaw,
  fromBlock,
}: {
  messenger: TransactionPayControllerMessenger;
  moneyAccountAddress: Hex;
  sourceAmountRaw: string;
  fromBlock: Hex;
}): Promise<Hex | undefined> {
  const fromPadded = padAddress(moneyAccountAddress);

  const logs = await rpcRequest<RpcLog[]>({
    messenger,
    chainId: CHAIN_ID_MONAD,
    method: 'eth_getLogs',
    params: [
      {
        address: MUSD_MONAD_ADDRESS,
        fromBlock,
        toBlock: 'latest',
        topics: [ERC20_TRANSFER_TOPIC, fromPadded, null],
      },
    ],
  });

  log('CHOMP scan: mUSD Transfer logs found', {
    count: logs.length,
    fromBlock,
    moneyAccountAddress,
  });

  const requiredAmount = BigInt(sourceAmountRaw);

  // Examine newest logs first so we return the most recent CHOMP match.
  for (const txLog of [...logs].reverse()) {
    const transferAmount = BigInt(txLog.data === '0x' ? '0x0' : txLog.data);

    if (transferAmount < requiredAmount) {
      log('CHOMP scan: skipping log — transfer amount below required', {
        requiredAmount: requiredAmount.toString(),
        transferAmount: transferAmount.toString(),
        txHash: txLog.transactionHash,
      });
      continue;
    }

    log('CHOMP scan: match found', {
      moneyAccountAddress,
      sourceAmountRaw,
      transferAmount: transferAmount.toString(),
      txHash: txLog.transactionHash,
    });

    return txLog.transactionHash;
  }

  log('CHOMP scan: no match found', { fromBlock, moneyAccountAddress });
  return undefined;
}

/**
 * Runs a second-leg submission, recovering when CHOMP (the automated vaulting
 * service) wins the race to vault a Money Account deposit.
 *
 * Runs `submit` directly when the transaction is not a Money Account deposit.
 * Otherwise a pre-check skips submission if CHOMP already vaulted the funds,
 * and on any submission failure a post-check returns the CHOMP hash instead of
 * surfacing the error. Unrecovered errors get the `Vault: ` prefix. CHOMP
 * checks only run when `fromBlock` is known.
 *
 * @param options - Recovery options.
 * @param options.from - Money Account submitting the second leg.
 * @param options.fromBlock - Block at or after which the funds settled.
 * @param options.messenger - Controller messenger.
 * @param options.sourceAmountRaw - Settled amount in raw units.
 * @param options.transaction - Parent transaction meta.
 * @param submit - Performs the second-leg submission.
 * @returns Hash of the submitted or CHOMP transaction, if available.
 */
export async function withChompRecovery(
  {
    from,
    fromBlock,
    messenger,
    sourceAmountRaw,
    transaction,
  }: {
    from: Hex;
    fromBlock?: Hex;
    messenger: TransactionPayControllerMessenger;
    sourceAmountRaw: string;
    transaction: TransactionMeta;
  },
  submit: () => Promise<{ transactionHash?: Hex }>,
): Promise<{ transactionHash?: Hex }> {
  if (!isMoneyAccountDepositTransaction(transaction)) {
    return await submit();
  }

  const findChompDeposit = async (): Promise<Hex | undefined> =>
    await tryFindChompDeposit({
      fromBlock,
      messenger,
      moneyAccountAddress: from,
      sourceAmountRaw,
      transactionId: transaction.id,
    });

  const preChompHash = await findChompDeposit();

  if (preChompHash) {
    log('CHOMP already vaulted the funds, skipping submission', {
      preChompHash,
      transactionId: transaction.id,
    });

    return { transactionHash: preChompHash };
  }

  try {
    return await submit();
  } catch (error) {
    const postChompHash = await findChompDeposit();

    if (postChompHash) {
      log('CHOMP vaulted the funds during submission', {
        postChompHash,
        transactionId: transaction.id,
      });

      return { transactionHash: postChompHash };
    }

    throw prefixError(error, VAULT_ERROR_PREFIX);
  }
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

function padAddress(address: Hex): string {
  return `0x${address.replace(/^0x/u, '').toLowerCase().padStart(64, '0')}`;
}
