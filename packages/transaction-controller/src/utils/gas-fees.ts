/* eslint-disable jsdoc/require-jsdoc */

import {
  ORIGIN_METAMASK,
  gweiDecToWEIBN,
  query,
  toHex,
} from '@metamask/controller-utils';
import type EthQuery from '@metamask/eth-query';
import type {
  FetchGasFeeEstimateOptions,
  GasFeeState,
} from '@metamask/gas-fee-controller';
import type { Hex } from '@metamask/utils';
import { add0x, createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../logger';
import type {
  SavedGasFees,
  TransactionParams,
  TransactionMeta,
  TransactionType,
  GasFeeFlow,
} from '../types';
import { GasFeeEstimateType, UserFeeLevel } from '../types';
import { getGasFeeFlow } from './gas-flow';
import { SWAP_TRANSACTION_TYPES } from './swaps';

export type UpdateGasFeesRequest = {
  eip1559: boolean;
  ethQuery: EthQuery;
  gasFeeFlows: GasFeeFlow[];
  getGasFeeEstimates: (
    options: FetchGasFeeEstimateOptions,
  ) => Promise<GasFeeState>;
  getSavedGasFees: (chainId: Hex) => SavedGasFees | undefined;
  txMeta: TransactionMeta;
};

export type GetGasFeeRequest = UpdateGasFeesRequest & {
  initialParams: TransactionParams;
  savedGasFees?: SavedGasFees;
  suggestedGasFees: SuggestedGasFees;
};

type SuggestedGasFees = {
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  gasPrice?: string;
};

const log = createModuleLogger(projectLogger, 'gas-fees');

export async function updateGasFees(request: UpdateGasFeesRequest) {
  const { txMeta } = request;
  const initialParams = { ...txMeta.txParams };

  const isSwap = SWAP_TRANSACTION_TYPES.includes(
    txMeta.type as TransactionType,
  );
  const savedGasFees = isSwap
    ? undefined
    : request.getSavedGasFees(txMeta.chainId);

  const suggestedGasFees = await getSuggestedGasFees(request);

  log('Suggested gas fees', suggestedGasFees);

  const getGasFeeRequest: GetGasFeeRequest = {
    ...request,
    initialParams,
    savedGasFees,
    suggestedGasFees,
  };

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

  updateDefaultGasEstimates(txMeta);
}

export function gweiDecimalToWeiHex(value: string) {
  return toHex(gweiDecToWEIBN(value));
}

function getMaxFeePerGas(request: GetGasFeeRequest): string | undefined {
  const { savedGasFees, eip1559, initialParams, suggestedGasFees } = request;

  if (!eip1559) {
    return undefined;
  }

  if (savedGasFees) {
    const maxFeePerGas = gweiDecimalToWeiHex(savedGasFees.maxBaseFee as string);
    log('Using maxFeePerGas from savedGasFees', maxFeePerGas);
    return maxFeePerGas;
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
  const { eip1559, initialParams, savedGasFees, suggestedGasFees, txMeta } =
    request;

  if (!eip1559) {
    return undefined;
  }

  if (savedGasFees) {
    const maxPriorityFeePerGas = gweiDecimalToWeiHex(savedGasFees.priorityFee);
    log(
      'Using maxPriorityFeePerGas from savedGasFees.priorityFee',
      maxPriorityFeePerGas,
    );
    return maxPriorityFeePerGas;
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

  if (suggestedGasFees.maxFeePerGas) {
    log('Using suggested maxFeePerGas', suggestedGasFees.maxFeePerGas);
    return suggestedGasFees.maxFeePerGas;
  }

  if (suggestedGasFees.gasPrice) {
    log('Using suggested gasPrice', suggestedGasFees.gasPrice);
    return suggestedGasFees.gasPrice;
  }

  log('gasPrice not set');
  return undefined;
}

function getUserFeeLevel(request: GetGasFeeRequest): UserFeeLevel | undefined {
  const { eip1559, initialParams, savedGasFees, suggestedGasFees, txMeta } =
    request;

  if (!eip1559) {
    return undefined;
  }

  if (savedGasFees) {
    return UserFeeLevel.CUSTOM;
  }

  if (
    !initialParams.maxFeePerGas &&
    !initialParams.maxPriorityFeePerGas &&
    initialParams.gasPrice
  ) {
    return txMeta.origin === ORIGIN_METAMASK
      ? UserFeeLevel.CUSTOM
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

function updateDefaultGasEstimates(txMeta: TransactionMeta) {
  if (!txMeta.defaultGasEstimates) {
    txMeta.defaultGasEstimates = {};
  }

  txMeta.defaultGasEstimates.maxFeePerGas = txMeta.txParams.maxFeePerGas;

  txMeta.defaultGasEstimates.maxPriorityFeePerGas =
    txMeta.txParams.maxPriorityFeePerGas;

  txMeta.defaultGasEstimates.gasPrice = txMeta.txParams.gasPrice;
  txMeta.defaultGasEstimates.estimateType = txMeta.userFeeLevel;
}

async function getSuggestedGasFees(
  request: UpdateGasFeesRequest,
): Promise<SuggestedGasFees> {
  const { eip1559, ethQuery, gasFeeFlows, getGasFeeEstimates, txMeta } =
    request;

  const { networkClientId } = txMeta;

  if (
    (!eip1559 && txMeta.txParams.gasPrice) ||
    (eip1559 &&
      txMeta.txParams.maxFeePerGas &&
      txMeta.txParams.maxPriorityFeePerGas)
  ) {
    return {};
  }

  const gasFeeFlow = getGasFeeFlow(txMeta, gasFeeFlows) as GasFeeFlow;

  try {
    const gasFeeControllerData = await getGasFeeEstimates({ networkClientId });

    const response = await gasFeeFlow.getGasFees({
      ethQuery,
      gasFeeControllerData,
      transactionMeta: txMeta,
    });

    const gasFeeEstimateType = response.estimates?.type;

    switch (gasFeeEstimateType) {
      case GasFeeEstimateType.FeeMarket:
        return response.estimates.medium;
      case GasFeeEstimateType.Legacy:
        return {
          gasPrice: response.estimates.medium,
        };
      case GasFeeEstimateType.GasPrice:
        return { gasPrice: response.estimates.gasPrice };
      default:
        throw new Error(
          `Unsupported gas fee estimate type returned from flow: ${gasFeeEstimateType}`,
        );
    }
  } catch (error) {
    log('Failed to get suggested gas fees', error);
  }

  const gasPriceDecimal = (await query(ethQuery, 'gasPrice')) as number;

  const gasPrice = gasPriceDecimal
    ? add0x(gasPriceDecimal.toString(16))
    : undefined;

  return { gasPrice };
}
