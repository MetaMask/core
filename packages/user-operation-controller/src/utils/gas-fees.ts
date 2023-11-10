/* eslint-disable jsdoc/require-jsdoc */

import { gweiDecToWEIBN, toHex } from '@metamask/controller-utils';
import type { GasFeeState } from '@metamask/gas-fee-controller';
import { GAS_ESTIMATE_TYPES } from '@metamask/gas-fee-controller';
import { createModuleLogger } from '@metamask/utils';
import { addHexPrefix } from 'ethereumjs-util';

import { projectLogger } from '../logger';
import { UserOperationMetadata } from '../types';
import {
  TransactionParams,
  UserFeeLevel,
} from '@metamask/transaction-controller';
import { Web3Provider } from '@ethersproject/providers';

export type UpdateGasFeesRequest = {
  getGasFeeEstimates: () => Promise<GasFeeState>;
  metadata: UserOperationMetadata;
  provider: Web3Provider;
};

export type GetGasFeeRequest = UpdateGasFeesRequest & {
  initialParams: TransactionParams;
  suggestedGasFees: Awaited<ReturnType<typeof getSuggestedGasFees>>;
};

const log = createModuleLogger(projectLogger, 'gas-fees');

export async function updateGasFees(request: UpdateGasFeesRequest) {
  const { metadata } = request;
  const initialParams = { ...metadata.transactionParams } as TransactionParams;
  const suggestedGasFees = await getSuggestedGasFees(request);

  log('Suggested gas fees', suggestedGasFees);

  const getGasFeeRequest = {
    ...request,
    initialParams,
    suggestedGasFees,
  };

  metadata.userOperation.maxFeePerGas = getMaxFeePerGas(getGasFeeRequest);

  metadata.userOperation.maxPriorityFeePerGas =
    getMaxPriorityFeePerGas(getGasFeeRequest);

  metadata.userFeeLevel = getUserFeeLevel(getGasFeeRequest) || null;

  log('Updated gas fee properties', {
    maxFeePerGas: metadata.userOperation.maxFeePerGas,
    maxPriorityFeePerGas: metadata.userOperation.maxPriorityFeePerGas,
    userFeeLevel: metadata.userFeeLevel,
  });
}

function getMaxFeePerGas(request: GetGasFeeRequest): string {
  const { initialParams, suggestedGasFees } = request;

  if (initialParams.maxFeePerGas) {
    log('Using maxFeePerGas from request', initialParams.maxFeePerGas);
    return initialParams.maxFeePerGas;
  }

  if (initialParams.gasPrice && !initialParams.maxPriorityFeePerGas) {
    log(
      'Setting maxFeePerGas to gasPrice from request',
      initialParams.gasPrice,
    );
    return initialParams.gasPrice;
  }

  if (suggestedGasFees.maxFeePerGas) {
    log('Using suggested maxFeePerGas', suggestedGasFees.maxFeePerGas);
    return suggestedGasFees.maxFeePerGas;
  }

  throw new Error('Cannot set maxFeePerGas');
}

function getMaxPriorityFeePerGas(request: GetGasFeeRequest): string {
  const { initialParams, suggestedGasFees, metadata } = request;

  if (initialParams.maxPriorityFeePerGas) {
    log(
      'Using maxPriorityFeePerGas from request',
      initialParams.maxPriorityFeePerGas,
    );
    return initialParams.maxPriorityFeePerGas;
  }

  if (initialParams.gasPrice && !initialParams.maxFeePerGas) {
    log(
      'Setting maxPriorityFeePerGas to gasPrice from request',
      initialParams.gasPrice,
    );
    return initialParams.gasPrice;
  }

  if (suggestedGasFees.maxPriorityFeePerGas) {
    log(
      'Using suggested maxPriorityFeePerGas',
      suggestedGasFees.maxPriorityFeePerGas,
    );
    return suggestedGasFees.maxPriorityFeePerGas;
  }

  if (metadata.userOperation.maxFeePerGas) {
    log(
      'Setting maxPriorityFeePerGas to maxFeePerGas',
      metadata.userOperation.maxFeePerGas,
    );
    return metadata.userOperation.maxFeePerGas;
  }

  throw new Error('Cannot set maxPriorityFeePerGas');
}

function getUserFeeLevel(request: GetGasFeeRequest): UserFeeLevel | undefined {
  const { initialParams, suggestedGasFees } = request;

  if (
    !initialParams.maxFeePerGas &&
    !initialParams.maxPriorityFeePerGas &&
    initialParams.gasPrice
  ) {
    return UserFeeLevel.DAPP_SUGGESTED;
  }

  if (
    !initialParams.maxFeePerGas &&
    !initialParams.maxPriorityFeePerGas &&
    suggestedGasFees.maxFeePerGas &&
    suggestedGasFees.maxPriorityFeePerGas
  ) {
    return UserFeeLevel.MEDIUM;
  }

  return UserFeeLevel.DAPP_SUGGESTED;
}

async function getSuggestedGasFees(request: UpdateGasFeesRequest) {
  const { getGasFeeEstimates, metadata } = request;

  if (
    metadata.transactionParams?.maxFeePerGas &&
    metadata.transactionParams?.maxPriorityFeePerGas
  ) {
    return {};
  }

  try {
    const { gasFeeEstimates, gasEstimateType } = await getGasFeeEstimates();

    if (gasEstimateType === GAS_ESTIMATE_TYPES.FEE_MARKET) {
      const {
        medium: { suggestedMaxPriorityFeePerGas, suggestedMaxFeePerGas } = {},
      } = gasFeeEstimates;

      if (suggestedMaxPriorityFeePerGas && suggestedMaxFeePerGas) {
        return {
          maxFeePerGas: gweiDecimalToWeiHex(suggestedMaxFeePerGas),
          maxPriorityFeePerGas: gweiDecimalToWeiHex(
            suggestedMaxPriorityFeePerGas,
          ),
        };
      }
    }

    if (gasEstimateType === GAS_ESTIMATE_TYPES.LEGACY) {
      const maxFeePerGas = gweiDecimalToWeiHex(gasFeeEstimates.medium);

      return {
        maxFeePerGas,
        maxPriorityFeePerGas: maxFeePerGas,
      };
    }

    if (gasEstimateType === GAS_ESTIMATE_TYPES.ETH_GASPRICE) {
      const maxFeePerGas = gweiDecimalToWeiHex(gasFeeEstimates.gasPrice);

      return {
        maxFeePerGas,
        maxPriorityFeePerGas: maxFeePerGas,
      };
    }
  } catch (error) {
    log('Failed to get suggested gas fees', error);
  }

  const gasPriceDecimal = await request.provider.getGasPrice();

  const maxFeePerGas = gasPriceDecimal
    ? addHexPrefix(gasPriceDecimal.toHexString())
    : undefined;

  return { maxFeePerGas, maxPriorityFeePerGas: maxFeePerGas };
}

function gweiDecimalToWeiHex(value: string) {
  return toHex(gweiDecToWEIBN(value));
}
