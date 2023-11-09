import { UserOperationMetadata, UserOperationStatus } from '../types';
import {
  TransactionError,
  TransactionMeta,
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';
import { Hex } from '@metamask/utils';
import { BN, addHexPrefix, stripHexPrefix } from 'ethereumjs-util';

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

  const maxFeePerGas =
    userOperation.maxFeePerGas === '0x'
      ? undefined
      : userOperation.maxFeePerGas;

  const maxPriorityFeePerGas =
    userOperation.maxPriorityFeePerGas === '0x'
      ? undefined
      : userOperation.maxPriorityFeePerGas;

  const txParams = {
    ...transactionParams,
    from: userOperation.sender,
    gas,
    nonce,
    maxFeePerGas,
    maxPriorityFeePerGas,
  };

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
  };
}

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
