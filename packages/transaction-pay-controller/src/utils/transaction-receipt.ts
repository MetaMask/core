import { Interface } from '@ethersproject/abi';
import { Web3Provider } from '@ethersproject/providers';
import { abiERC20 } from '@metamask/metamask-eth-abis';
import type { Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import type { TransactionPayControllerMessenger } from '../types';
import { getNativeToken } from './token';

// transfer(address,uint256) selector
const ERC20_TRANSFER_SELECTOR = '0xa9059cbb';

const erc20Interface = new Interface(abiERC20);

/**
 * Reads the transferred token amount from a completed on-chain transaction.
 *
 * For native tokens, the amount is read from the transaction's `value` field.
 * For ERC-20 tokens, the amount is decoded from the transaction's input data,
 * expecting a direct `transfer(address,uint256)` call.
 *
 * @param options - The options.
 * @param options.messenger - Controller messenger for network access.
 * @param options.txHash - Transaction hash of the completed on-chain transaction.
 * @param options.chainId - Chain ID where the transaction was executed.
 * @param options.tokenAddress - Address of the transferred token.
 * @returns The raw (atomic) transferred amount as a decimal string,
 * or `undefined` if the amount cannot be determined.
 */
export async function getTransferredAmountFromTxHash({
  messenger,
  txHash,
  chainId,
  tokenAddress,
}: {
  messenger: TransactionPayControllerMessenger;
  txHash: string;
  chainId: Hex;
  tokenAddress: Hex;
}): Promise<string | undefined> {
  const networkClientId = messenger.call(
    'NetworkController:findNetworkClientIdByChainId',
    chainId,
  );

  const { provider } = messenger.call(
    'NetworkController:getNetworkClientById',
    networkClientId,
  );

  const ethersProvider = new Web3Provider(provider);
  const tx = await ethersProvider.getTransaction(txHash);

  if (!tx) {
    return undefined;
  }

  const isNative =
    tokenAddress.toLowerCase() === getNativeToken(chainId).toLowerCase();

  if (isNative) {
    return positiveOrUndefined(tx.value.toString());
  }

  if (tx.to?.toLowerCase() !== tokenAddress.toLowerCase()) {
    return undefined;
  }

  if (!tx.data?.startsWith(ERC20_TRANSFER_SELECTOR)) {
    return undefined;
  }

  const decoded = erc20Interface.decodeFunctionData('transfer', tx.data);

  return positiveOrUndefined(decoded._value.toString());
}

function positiveOrUndefined(amount: string): string | undefined {
  return new BigNumber(amount).gt(0) ? amount : undefined;
}
