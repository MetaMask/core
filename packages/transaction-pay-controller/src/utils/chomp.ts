import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { CHAIN_ID_MONAD, MUSD_MONAD_ADDRESS } from '../constants';
import { projectLogger } from '../logger';
import type { TransactionPayControllerMessenger } from '../types';
import { rpcRequest } from './provider';

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

function padAddress(address: Hex): string {
  return `0x${address.replace(/^0x/u, '').toLowerCase().padStart(64, '0')}`;
}
