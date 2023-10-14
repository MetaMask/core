/* eslint-disable jsdoc/require-jsdoc */

import {
  ORIGIN_METAMASK,
  gweiDecToWEIBN,
  query,
  toHex,
} from '@metamask/controller-utils';
import type EthQuery from '@metamask/eth-query';
import type { GasFeeState } from '@metamask/gas-fee-controller';
import { GAS_ESTIMATE_TYPES } from '@metamask/gas-fee-controller';
import { createModuleLogger } from '@metamask/utils';
import { addHexPrefix } from 'ethereumjs-util';

import { projectLogger } from '../logger';
import type { TransactionParams } from '../types';
import { UserFeeLevel, type TransactionMeta } from '../types';

export type UpdateGasFeesRequest = {
  eip1559: boolean;
  ethQuery: EthQuery;
  getGasFeeEstimates: () => Promise<GasFeeState>;
  txMeta: TransactionMeta;
};

export type GetGasFeeRequest = UpdateGasFeesRequest & {
  initialParams: TransactionParams;
  suggestedGasFees: Awaited<ReturnType<typeof getSuggestedGasFees>>;
};

const log = createModuleLogger(projectLogger, 'gas-fees');

export async function updateGasFees(request: UpdateGasFeesRequest) {
  const { txMeta } = request;
  const initialParams = { ...txMeta.txParams };

  const suggestedGasFees = await getSuggestedGasFees(request);

  log('Suggested gas fees', suggestedGasFees);

  const getGasFeeRequest = { ...request, initialParams, suggestedGasFees };

  txMeta.txParams.maxFeePerGas = getMaxFeePerGas(getGasFeeRequest);

  txMeta.txParams.maxPriorityFeePerGas =
    getMaxPriorityFeePerGas(getGasFeeRequest);

  txMeta.txParams.gasPrice = getGasPrice(getGasFeeRequest);
  txMeta.userFeeLevel = getUserFeeLevel(getGasFeeRequest);

  log('Updated gas fee properties', {
    maxFeePerGas: txMeta.txParams.maxFeePerGas,
    maxPriorityFeePerGas: txMeta.txParams.maxPriorityFeePerGas,
    gasPrice: txMeta.txParams.gasPrice,
  });

  if (txMeta.txParams.maxFeePerGas || txMeta.txParams.maxPriorityFeePerGas) {
    delete txMeta.txParams.gasPrice;
  }

  if (txMeta.txParams.gasPrice) {
    delete txMeta.txParams.maxFeePerGas;
    delete txMeta.txParams.maxPriorityFeePerGas;
  }
}

function getMaxFeePerGas(request: GetGasFeeRequest): string | undefined {
  const { eip1559, initialParams, suggestedGasFees } = request;

  if (!eip1559) {
    return undefined;
  }

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

  if (suggestedGasFees.gasPrice) {
    log(
      'Setting maxFeePerGas to suggested gasPrice',
      suggestedGasFees.gasPrice,
    );
    return suggestedGasFees.gasPrice;
  }

  log('maxFeePerGas not set');
  return undefined;
}

function getMaxPriorityFeePerGas(
  request: GetGasFeeRequest,
): string | undefined {
  const { eip1559, initialParams, suggestedGasFees, txMeta } = request;

  if (!eip1559) {
    return undefined;
  }

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

  if (txMeta.txParams.maxFeePerGas) {
    log(
      'Setting maxPriorityFeePerGas to maxFeePerGas',
      txMeta.txParams.maxFeePerGas,
    );
    return txMeta.txParams.maxFeePerGas;
  }

  log('maxPriorityFeePerGas not set');
  return undefined;
}

function getGasPrice(request: GetGasFeeRequest): string | undefined {
  const { eip1559, initialParams, suggestedGasFees } = request;

  if (eip1559) {
    return undefined;
  }

  if (initialParams.gasPrice) {
    log('Using gasPrice from request', initialParams.gasPrice);
    return initialParams.gasPrice;
  }

  if (suggestedGasFees.gasPrice) {
    log('Using suggested gasPrice', suggestedGasFees.gasPrice);
    return suggestedGasFees.gasPrice;
  }

  log('gasPrice not set');
  return undefined;
}

function getUserFeeLevel(request: GetGasFeeRequest): UserFeeLevel | undefined {
  const { eip1559, initialParams, suggestedGasFees, txMeta } = request;

  if (!eip1559) {
    return undefined;
  }

  if (
    !initialParams.maxFeePerGas &&
    !initialParams.maxPriorityFeePerGas &&
    initialParams.gasPrice
  ) {
    return txMeta.origin === ORIGIN_METAMASK
      ? UserFeeLevel.MEDIUM
      : UserFeeLevel.DAPP_SUGGESTED;
  }

  if (
    !initialParams.maxFeePerGas &&
    !initialParams.maxPriorityFeePerGas &&
    suggestedGasFees.maxFeePerGas &&
    suggestedGasFees.maxPriorityFeePerGas
  ) {
    return UserFeeLevel.MEDIUM;
  }

  if (txMeta.origin === ORIGIN_METAMASK) {
    return UserFeeLevel.MEDIUM;
  }

  return UserFeeLevel.DAPP_SUGGESTED;
}

async function getSuggestedGasFees(request: UpdateGasFeesRequest) {
  const { eip1559, ethQuery, getGasFeeEstimates } = request;

  try {
    const { gasFeeEstimates, gasEstimateType } = await getGasFeeEstimates();

    if (eip1559 && gasEstimateType === GAS_ESTIMATE_TYPES.FEE_MARKET) {
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
      // The LEGACY type includes low, medium and high estimates of
      // gas price values.
      return {
        gasPrice: gweiDecimalToWeiHex(gasFeeEstimates.medium),
      };
    }

    if (gasEstimateType === GAS_ESTIMATE_TYPES.ETH_GASPRICE) {
      // The ETH_GASPRICE type just includes a single gas price property,
      // which we can assume was retrieved from eth_gasPrice
      return {
        gasPrice: gweiDecimalToWeiHex(gasFeeEstimates.gasPrice),
      };
    }
  } catch (e) {
    console.error(e);
  }

  const gasPriceDecimal = (await query(ethQuery, 'gasPrice')) as number;

  const gasPrice = gasPriceDecimal
    ? addHexPrefix(gasPriceDecimal.toString(16))
    : undefined;

  return { gasPrice };
}

function gweiDecimalToWeiHex(value: string) {
  return toHex(gweiDecToWEIBN(value));
}
