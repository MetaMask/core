/* eslint-disable jsdoc/require-jsdoc */

import { defaultAbiCoder } from '@ethersproject/abi';
import { Contract } from '@ethersproject/contracts';
import type { Web3Provider } from '@ethersproject/providers';
import { stripHexPrefix } from 'ethereumjs-util';

import { ENTRYPOINT } from '../../constants';
import { createModuleLogger, projectLogger } from '../../logger';
import type { UserOperation } from '../../types';
import VerifyingPaymasterABI from './abi/VerifyingPaymaster.json';
import { signHash } from './ecdsa';

const log = createModuleLogger(projectLogger, 'verifying-paymaster');

export async function getPaymasterAndData(
  paymasterAddress: string,
  validUntil: number,
  validAfter: number,
  userOperation: UserOperation,
  privateKey: string,
  provider: Web3Provider,
): Promise<string> {
  const verifyingPaymasterContract = new Contract(
    paymasterAddress,
    VerifyingPaymasterABI,
    provider,
  );

  const hash = await verifyingPaymasterContract.getHash(
    userOperation,
    validUntil,
    validAfter,
  );

  log('Retrieved user operation hash from paymaster', hash);

  const signature = await signHash(hash, privateKey);

  log('Generated user operation signature', signature);

  const data =
    paymasterAddress +
    stripHexPrefix(
      defaultAbiCoder.encode(['uint48', 'uint48'], [validUntil, validAfter]),
    ) +
    stripHexPrefix(signature);

  log('Generated paymaster data', data);

  const isValid = await verifyPaymasterData(
    userOperation,
    data,
    verifyingPaymasterContract,
  );

  if (!isValid) {
    throw new Error('Validation of paymaster data failed');
  }

  return data;
}

async function verifyPaymasterData(
  userOperation: UserOperation,
  paymasterAndData: string,
  paymasterContract: Contract,
): Promise<boolean> {
  const testUserOperation = { ...userOperation, paymasterAndData };

  const result = await paymasterContract.callStatic.validatePaymasterUserOp(
    testUserOperation,
    '0x'.padEnd(66, '0'),
    1,
    { from: ENTRYPOINT },
  );

  const packedResult = result[1].toHexString() as string;
  const failed = packedResult.endsWith('1');

  log('Validated paymaster data with contract', { packedResult, failed });

  return !failed;
}
