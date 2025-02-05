import type { ChainConfig } from '@ethereumjs/common';
import { Common, Hardfork } from '@ethereumjs/common';
import type { TypedTransaction, TypedTxData } from '@ethereumjs/tx';
import { TransactionFactory } from '@ethereumjs/tx';
import { bytesToHex } from '@ethereumjs/util';
import type { Hex } from '@metamask/utils';

import type { TransactionParams } from '../types';

export const HARDFORK = Hardfork.Prague;

/**
 * Creates an `etheruemjs/tx` transaction object from the raw transaction parameters.
 *
 * @param chainId - Chain ID of the transaction.
 * @param txParams - Transaction parameters.
 * @returns The transaction object.
 */
export function prepareTransaction(
  chainId: Hex,
  txParams: TransactionParams,
): TypedTransaction {
  // Does not allow `gasPrice` on type 4 transactions.
  const data = txParams as TypedTxData;

  return TransactionFactory.fromTxData(data, {
    freeze: false,
    common: getCommonConfiguration(chainId),
  });
}

/**
 * Serializes a transaction object into a hex string.
 *
 * @param transaction - The transaction object.
 * @returns The prefixed hex string.
 */
export function serializeTransaction(transaction: TypedTransaction) {
  return bytesToHex(transaction.serialize());
}

/**
 * Generates the configuration used to prepare transactions.
 *
 * @param chainId - Chain ID.
 * @returns The common configuration.
 */
function getCommonConfiguration(chainId: Hex): Common {
  const customChainParams: Partial<ChainConfig> = {
    chainId: parseInt(chainId, 16),
    defaultHardfork: HARDFORK,
  };

  return Common.custom(customChainParams, {
    eips: [7702],
  });
}
