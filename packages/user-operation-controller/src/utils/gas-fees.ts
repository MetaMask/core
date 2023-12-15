/* eslint-disable jsdoc/require-jsdoc */
import { BN, bnToHex } from 'ethereumjs-util';

import { EMPTY_BYTES } from '../constants';
import { createModuleLogger, projectLogger } from '../logger';
import type { UserOperationMetadata } from '../types';
import type { AddUserOperationRequest } from '../UserOperationController';

const log = createModuleLogger(projectLogger, 'gas-fees');

const DEFAULT_VALUE = bnToHex(new BN(1.5e9));

export async function updateGasFees(
  metadata: UserOperationMetadata,
  request: AddUserOperationRequest,
) {
  const { userOperation } = metadata;

  userOperation.maxFeePerGas = getMaxFeePerGas(request);
  userOperation.maxPriorityFeePerGas = getMaxPriorityFeePerGas(request);
}

function getMaxFeePerGas(request: AddUserOperationRequest) {
  const { maxFeePerGas } = request;

  if (maxFeePerGas && maxFeePerGas !== EMPTY_BYTES) {
    log('Using maxFeePerGas from request', maxFeePerGas);
    return maxFeePerGas;
  }

  log('Using default maxFeePerGas');
  return DEFAULT_VALUE;
}

function getMaxPriorityFeePerGas(request: AddUserOperationRequest) {
  const { maxPriorityFeePerGas, maxFeePerGas } = request;

  if (maxPriorityFeePerGas && maxPriorityFeePerGas !== EMPTY_BYTES) {
    log('Using maxPriorityFeePerGas from request', maxPriorityFeePerGas);
    return maxPriorityFeePerGas;
  }

  if (maxFeePerGas && maxFeePerGas !== EMPTY_BYTES) {
    log('Using maxPriorityFeePerGas as maxFeePerGas', maxFeePerGas);
    return maxFeePerGas;
  }

  log('Using default maxPriorityFeePerGas');
  return DEFAULT_VALUE;
}
