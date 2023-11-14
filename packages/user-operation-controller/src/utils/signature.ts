/* eslint-disable jsdoc/require-jsdoc */
// Temporary until new keyring is available via KeyringController.

import { defaultAbiCoder } from '@ethersproject/abi';
import { arrayify } from '@ethersproject/bytes';
import { keccak256 } from '@ethersproject/keccak256';
import { Wallet } from '@ethersproject/wallet';

import type { UserOperation } from '../types';

export async function signUserOperation(
  userOperation: UserOperation,
  entrypointAddress: string,
  chainId: string,
  privateKey: string,
): Promise<string> {
  const hash = getUserOperationHash(userOperation, entrypointAddress, chainId);
  const message = arrayify(hash);
  const signer = new Wallet(privateKey);

  return await signer.signMessage(message);
}

function getUserOperationHash(
  userOperation: UserOperation,
  entrypointAddress: string,
  chainId: string,
): string {
  const chainIdDecimal = parseInt(chainId, 16);
  const hash = keccak256(encodeUserOperationForSigning(userOperation));

  const data = defaultAbiCoder.encode(
    ['bytes32', 'address', 'uint256'],
    [hash, entrypointAddress, chainIdDecimal],
  );

  return keccak256(data);
}

function encodeUserOperationForSigning(userOperation: UserOperation): string {
  return defaultAbiCoder.encode(
    [
      'address',
      'uint256',
      'bytes32',
      'bytes32',
      'uint256',
      'uint256',
      'uint256',
      'uint256',
      'uint256',
      'bytes32',
    ],
    [
      userOperation.sender,
      userOperation.nonce,
      keccak256(userOperation.initCode),
      keccak256(userOperation.callData),
      userOperation.callGasLimit,
      userOperation.verificationGasLimit,
      userOperation.preVerificationGas,
      userOperation.maxFeePerGas,
      userOperation.maxPriorityFeePerGas,
      keccak256(userOperation.paymasterAndData),
    ],
  );
}
