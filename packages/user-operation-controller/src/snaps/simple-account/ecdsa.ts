/* eslint-disable jsdoc/require-jsdoc */

import { defaultAbiCoder } from '@ethersproject/abi';
import { arrayify } from '@ethersproject/bytes';
import { keccak256 } from '@ethersproject/keccak256';
import { Wallet } from '@ethersproject/wallet';
import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../../logger';
import type { UserOperation } from '../../types';

const log = createModuleLogger(projectLogger, 'ecdsa');

export function signHash(hash: string, privateKey: string): Promise<string> {
  log('Signing hash', hash);

  const data = arrayify(hash);
  const signer = new Wallet(privateKey);

  return signer.signMessage(data);
}

export async function signUserOperation(
  userOperation: UserOperation,
  entrypointAddress: string,
  chainId: string,
  privateKey: string,
): Promise<string> {
  log('Signing user operation', userOperation);

  const hash = getUserOperationHash(userOperation, entrypointAddress, chainId);

  log('Generated user operation hash', hash);

  return await signHash(hash, privateKey);
}

function getUserOperationHash(
  userOperation: UserOperation,
  entrypointAddress: string,
  chainId: string,
): string {
  const chainIdDecimal = parseInt(chainId, 16);
  const hash = keccak256(encodeUserOperation(userOperation));

  const data = defaultAbiCoder.encode(
    ['bytes32', 'address', 'uint256'],
    [hash, entrypointAddress, chainIdDecimal],
  );

  return keccak256(data);
}

function encodeUserOperation(userOperation: UserOperation): string {
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
