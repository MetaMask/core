import type {
  TransactionError,
  TransactionMeta,
  TransactionParams,
  TransactionType,
} from '@metamask/transaction-controller';
import {
  TransactionStatus,
  UserFeeLevel,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { BN, addHexPrefix, stripHexPrefix } from 'ethereumjs-util';

import { UserOperationStatus } from '../types';
import type { UserOperationMetadata } from '../types';

/**
 * Converts a user operation metadata object into a transaction metadata object.
 * @param metadata - The user operation metadata object to convert.
 * @returns The equivalent transaction metadata object.
 */
export function getTransactionMetadata(
  metadata: UserOperationMetadata,
): TransactionMeta | undefined {
  const {
    actualGasCost,
    actualGasUsed,
    baseFeePerGas,
    chainId,
    error: rawError,
    transactionHash,
    id,
    time,
    transactionParams,
    userOperation,
  } = metadata;

  if (!transactionParams) {
    return undefined;
  }

  const { nonce } = userOperation ?? {};

  const effectiveGasPrice =
    actualGasCost && actualGasUsed
      ? addHexPrefix(
          new BN(stripHexPrefix(actualGasCost), 16)
            .div(new BN(stripHexPrefix(actualGasUsed), 16))
            .toString(16),
        )
      : undefined;

  const error = (
    rawError
      ? {
          name: rawError.name,
          message: rawError.message,
          stack: rawError.stack,
          code: (rawError as any).code,
          rpc: (rawError as any).rpc,
        }
      : undefined
  ) as TransactionError;

  const status: TransactionStatus = {
    [UserOperationStatus.Unapproved]: TransactionStatus.unapproved,
    [UserOperationStatus.Approved]: TransactionStatus.approved,
    [UserOperationStatus.Signed]: TransactionStatus.signed,
    [UserOperationStatus.Submitted]: TransactionStatus.submitted,
    [UserOperationStatus.Confirmed]: TransactionStatus.confirmed,
    [UserOperationStatus.Failed]: TransactionStatus.failed,
  }[metadata.status];

  const gas = addHex(
    userOperation?.preVerificationGas,
    userOperation?.verificationGasLimit,
    userOperation?.callGasLimit,
  );

  const hasPaymaster = userOperation.paymasterAndData !== '0x';

  const maxFeePerGas = hasPaymaster ? '0x0' : userOperation.maxFeePerGas;

  const maxPriorityFeePerGas = hasPaymaster
    ? '0x0'
    : userOperation.maxPriorityFeePerGas;

  const userFeeLevel = UserFeeLevel.CUSTOM;

  const txParams = {
    ...transactionParams,
    from: userOperation.sender,
    gas,
    nonce,
    maxFeePerGas,
    maxPriorityFeePerGas,
  } as TransactionParams;

  // Since the user operations only support EIP-1559, we won't need this.
  delete txParams.gasPrice;

  const type = 'userOperation' as TransactionType;

  return {
    baseFeePerGas: (baseFeePerGas as Hex) ?? undefined,
    chainId: chainId as Hex,
    error,
    hash: transactionHash ?? undefined,
    id,
    txReceipt: {
      effectiveGasPrice: effectiveGasPrice ?? undefined,
      gasUsed: actualGasUsed ?? undefined,
    },
    status,
    time,
    txParams,
    type,
    userFeeLevel: userFeeLevel || undefined,
  };
}

/**
 * Adds the given hexadecimal values together.
 * @param values - The hexadecimal values to add together.
 * @returns The sum of the given hexadecimal values.
 */
function addHex(...values: (string | undefined)[]) {
  const total = new BN(0);

  for (const value of values) {
    if (!value) {
      continue;
    }

    total.iadd(new BN(stripHexPrefix(value), 16));
  }

  return addHexPrefix(total.toString(16));
}
