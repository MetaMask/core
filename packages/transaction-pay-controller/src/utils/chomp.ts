import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { CHAIN_ID_MONAD, MUSD_MONAD_ADDRESS } from '../constants.js';
import { projectLogger } from '../logger.js';
import type { TransactionPayControllerMessenger } from '../types.js';
import { rpcRequest } from './provider.js';

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

/**
 * Finds a recent mUSD Transfer from the Money Account into the boring vault
 * whose amount exactly matches `sourceAmountRaw`. Exact amount + vault `to`
 * avoid treating Pix/other outbound transfers as CHOMP vault success.
 *
 * @param options - Scan options.
 * @param options.messenger - Controller messenger for RPC.
 * @param options.moneyAccountAddress - Money Account that sent the transfer.
 * @param options.sourceAmountRaw - Exact raw mUSD amount expected.
 * @param options.fromBlock - Inclusive block to start the log scan.
 * @param options.vaultAddress - Boring vault address that must be the Transfer `to`.
 * @returns Matching transaction hash, if any.
 */
export async function findRecentChompVaultDeposit({
  messenger,
  moneyAccountAddress,
  sourceAmountRaw,
  fromBlock,
  vaultAddress,
}: {
  messenger: TransactionPayControllerMessenger;
  moneyAccountAddress: Hex;
  sourceAmountRaw: string;
  fromBlock: Hex;
  vaultAddress: Hex;
}): Promise<Hex | undefined> {
  const fromPadded = padAddress(moneyAccountAddress);
  const toPadded = padAddress(vaultAddress);

  const logs = await rpcRequest<RpcLog[]>({
    messenger,
    chainId: CHAIN_ID_MONAD,
    method: 'eth_getLogs',
    params: [
      {
        address: MUSD_MONAD_ADDRESS,
        fromBlock,
        toBlock: 'latest',
        topics: [ERC20_TRANSFER_TOPIC, fromPadded, toPadded],
      },
    ],
  });

  log('CHOMP scan: mUSD Transfer logs found', {
    count: logs.length,
    fromBlock,
    moneyAccountAddress,
    vaultAddress,
  });

  const requiredAmount = BigInt(sourceAmountRaw);
  const vaultTopic = toPadded.toLowerCase();

  // Examine newest logs first so we return the most recent CHOMP match.
  for (const txLog of [...logs].reverse()) {
    const logTo = txLog.topics[2]?.toLowerCase();
    if (logTo !== vaultTopic) {
      log('CHOMP scan: skipping log - transfer is not to the vault', {
        expectedTo: vaultAddress,
        logTo,
        txHash: txLog.transactionHash,
      });
      continue;
    }

    const transferAmount = BigInt(txLog.data === '0x' ? '0x0' : txLog.data);

    // Exact amount only: >= would falsely treat larger outbound transfers
    // (e.g. Pix) as vault deposits when `to` filtering alone is insufficient.
    if (transferAmount !== requiredAmount) {
      log('CHOMP scan: skipping log - transfer amount is not an exact match', {
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
      vaultAddress,
    });

    return txLog.transactionHash;
  }

  log('CHOMP scan: no match found', {
    fromBlock,
    moneyAccountAddress,
    vaultAddress,
  });
  return undefined;
}

function padAddress(address: Hex): string {
  return `0x${address.replace(/^0x/u, '').toLowerCase().padStart(64, '0')}`;
}
