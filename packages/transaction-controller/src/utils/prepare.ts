import type { ChainConfig } from '@ethereumjs/common';
import { Common, Hardfork } from '@ethereumjs/common';
import type { TypedTransaction, TypedTxData } from '@ethereumjs/tx';
import { TransactionFactory } from '@ethereumjs/tx';
import { bytesToHex } from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import { cloneDeep } from 'lodash';

import type { AuthorizationList, TransactionParams } from '../types';

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
  const normalizedData = normalizeParams(txParams);

  // Does not allow `gasPrice` on type 4 transactions.
  const data = normalizedData as TypedTxData;

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

/**
 * Normalize the transaction parameters for compatibility with `ethereumjs/tx`.
 *
 * @param params - The transaction parameters to normalize.
 * @returns The normalized transaction parameters.
 */
function normalizeParams(params: TransactionParams): TransactionParams {
  const newParams = cloneDeep(params);
  normalizeAuthorizationList(newParams.authorizationList);
  return newParams;
}

/**
 * Normalize the authorization list for `ethereumjs/tx` compatibility.
 *
 * @param authorizationList - The list of authorizations to normalize.
 */
function normalizeAuthorizationList(authorizationList?: AuthorizationList) {
  if (!authorizationList) {
    return;
  }

  for (const authorization of authorizationList) {
    authorization.nonce = removeLeadingZeroes(authorization.nonce);
    authorization.r = removeLeadingZeroes(authorization.r);
    authorization.s = removeLeadingZeroes(authorization.s);
    authorization.yParity = removeLeadingZeroes(authorization.yParity);
  }
}

/**
 * Remove leading zeroes from a hexadecimal string.
 *
 * @param value - The hexadecimal string to process.
 * @returns The processed hexadecimal string.
 */
function removeLeadingZeroes(value: Hex | undefined): Hex | undefined {
  if (!value) {
    return value;
  }

  if (value === '0x0') {
    return '0x';
  }

  return (value.replace?.(/^0x(00)+/u, '0x') as Hex) ?? value;
}
