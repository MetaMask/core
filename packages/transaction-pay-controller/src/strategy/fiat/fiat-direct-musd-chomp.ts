import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { CHAIN_ID_MONAD, MUSD_MONAD_ADDRESS } from '../../constants';
import { projectLogger } from '../../logger';
import type { TransactionPayControllerMessenger } from '../../types';
import { rpcRequest } from '../../utils/provider';

const log = createModuleLogger(projectLogger, 'fiat-direct-musd-chomp');

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
 * Scans recent Monad logs for a CHOMP auto-vault deposit that already
 * transferred the required mUSD amount out of the Money Account. Returns
 * the on-chain tx hash of the first (newest) matching Transfer log.
 *
 * Detection requires both conditions:
 * 1. A Transfer(from=moneyAccount) on the mUSD contract within [fromBlock, latest].
 * 2. The transferred amount is >= sourceAmountRaw.
 *
 * Logs are examined newest-first so the most recent CHOMP deposit wins.
 * Only a single `eth_getLogs` call is made — no per-tx follow-up requests.
 *
 * @param options - Detection options.
 * @param options.messenger - Controller messenger.
 * @param options.moneyAccountAddress - Money Account that owns the mUSD.
 * @param options.sourceAmountRaw - Minimum mUSD amount (in raw units) that must
 *   have been transferred out of the Money Account for the CHOMP deposit to count.
 * @param options.fromBlock - Starting block for the log query (hex block number
 *   derived from the ramps settlement tx, e.g. "0x1a2b3c").
 * @returns The transaction hash of the matching CHOMP deposit, or `undefined` if
 *   none is found.
 */
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
 * Pads an EVM address to a 32-byte (64 hex character) topics value.
 *
 * @param address - 20-byte hex address with or without 0x prefix.
 * @returns 0x-prefixed 32-byte hex string suitable for `eth_getLogs` topics.
 */
function padAddress(address: Hex): string {
  return `0x${address.replace(/^0x/u, '').toLowerCase().padStart(64, '0')}`;
}
