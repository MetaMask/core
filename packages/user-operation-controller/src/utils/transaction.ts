import type {
  TransactionError,
  TransactionMeta,
  TransactionParams,
} from '@metamask/transaction-controller';
import {
  TransactionStatus,
  UserFeeLevel,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { add0x, remove0x } from '@metamask/utils';
import BN from 'bn.js';

import { EMPTY_BYTES, VALUE_ZERO } from '../constants';
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
    origin,
    transactionHash,
    id,
    swapsMetadata,
    time,
    transactionParams,
    transactionType,
    userFeeLevel: rawUserFeeLevel,
    userOperation,
  } = metadata;

  if (!transactionParams) {
    return undefined;
  }

  // effectiveGasPrice = actualGasCost / actualGasUsed
  const effectiveGasPrice =
    actualGasCost && actualGasUsed
      ? add0x(
          new BN(remove0x(actualGasCost), 16)
            .div(new BN(remove0x(actualGasUsed), 16))
            .toString(16),
        )
      : undefined;

  const error = (
    rawError
      ? {
          name: rawError.name,
          message: rawError.message,
          stack: rawError.stack,
          code: rawError.code,
          rpc: rawError.rpc,
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
    userOperation.preVerificationGas,
    userOperation.verificationGasLimit,
    userOperation.callGasLimit,
  );

  const hasPaymaster = userOperation.paymasterAndData !== EMPTY_BYTES;

  const maxFeePerGas = hasPaymaster ? VALUE_ZERO : userOperation.maxFeePerGas;

  const maxPriorityFeePerGas = hasPaymaster
    ? VALUE_ZERO
    : userOperation.maxPriorityFeePerGas;

  const nonce =
    userOperation.nonce === EMPTY_BYTES ? undefined : userOperation.nonce;

  const txParams = {
    ...transactionParams,
    from: userOperation.sender,
    gas,
    nonce,
    maxFeePerGas,
    maxPriorityFeePerGas,
  } as TransactionParams;

  // User operations only support EIP-1559 gas fee properties.
  delete txParams.gasPrice;

  const swaps = {
    approvalTxId: swapsMetadata?.approvalTxId ?? undefined,
    destinationTokenAddress:
      swapsMetadata?.destinationTokenAddress ?? undefined,
    destinationTokenAmount: swapsMetadata?.destinationTokenAmount ?? undefined,
    destinationTokenDecimals:
      swapsMetadata?.destinationTokenDecimals ?? undefined,
    destinationTokenSymbol: swapsMetadata?.destinationTokenSymbol ?? undefined,
    estimatedBaseFee: swapsMetadata?.estimatedBaseFee ?? undefined,
    sourceTokenAddress: swapsMetadata?.sourceTokenAddress ?? undefined,
    sourceTokenAmount: swapsMetadata?.sourceTokenAmount ?? undefined,
    sourceTokenDecimals: swapsMetadata?.sourceTokenDecimals ?? undefined,
    sourceTokenSymbol: swapsMetadata?.sourceTokenSymbol ?? undefined,
    swapAndSendRecipient: swapsMetadata?.swapAndSendRecipient ?? undefined,
    swapMetaData: swapsMetadata?.swapMetaData ?? undefined,
    swapTokenValue: swapsMetadata?.swapTokenValue ?? undefined,
  };

  const userFeeLevel = hasPaymaster ? UserFeeLevel.CUSTOM : rawUserFeeLevel;

  return {
    baseFeePerGas: (baseFeePerGas as Hex) ?? undefined,
    chainId: chainId as Hex,
    error,
    hash: transactionHash ?? undefined,
    id,
    isUserOperation: true,
    origin,
    status,
    time,
    txParams,
    txReceipt: {
      effectiveGasPrice: effectiveGasPrice ?? undefined,
      gasUsed: actualGasUsed ?? undefined,
    },
    type: transactionType ?? undefined,
    userFeeLevel: userFeeLevel as string,
    ...swaps,
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

    total.iadd(new BN(remove0x(value), 16));
  }

  return add0x(total.toString(16));
}
