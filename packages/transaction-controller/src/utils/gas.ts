/* eslint-disable jsdoc/require-jsdoc */

import {
  BNToHex,
  NetworkType,
  fractionBN,
  hexToBN,
  query,
} from '@metamask/controller-utils';
import type { ProviderConfig } from '@metamask/network-controller';
import { createModuleLogger } from '@metamask/utils';
import { addHexPrefix } from 'ethereumjs-util';

import { projectLogger } from '../logger';
import type { TransactionMeta, Transaction } from '../types';

export type UpdateGasRequest = {
  ethQuery: any;
  providerConfig: ProviderConfig;
  txMeta: TransactionMeta;
};

export const log = createModuleLogger(projectLogger, 'gas');

export const FIXED_GAS = '0x5208';

export async function updateGas(request: UpdateGasRequest) {
  const { txMeta } = request;
  const initialParams = { ...txMeta.transaction };

  const [gas, simulationFails] = await getGas(request);

  txMeta.transaction.gas = gas;
  txMeta.simulationFails = simulationFails;

  if (!initialParams.gas) {
    txMeta.originalGasEstimate = txMeta.transaction.gas;
  }

  if (!txMeta.defaultGasEstimates) {
    txMeta.defaultGasEstimates = {};
  }

  txMeta.defaultGasEstimates.gas = txMeta.transaction.gas;
}

export async function estimateGas(txParams: Transaction, ethQuery: any) {
  const request = { ...txParams };
  const { data, value } = request;

  const { gasLimit: gasLimitHex, number: blockNumber } = await getLatestBlock(
    ethQuery,
  );

  const gasLimitBN = hexToBN(gasLimitHex);

  request.data = data ? addHexPrefix(data) : data;
  request.gas = BNToHex(fractionBN(gasLimitBN, 19, 20));
  request.value = value || '0x0';

  let estimatedGas = request.gas;
  let simulationFails;

  try {
    estimatedGas = await query(ethQuery, 'estimateGas', [request]);
  } catch (error: any) {
    simulationFails = {
      reason: error.message,
      errorKey: error.errorKey,
      debug: {
        blockNumber,
        blockGasLimit: gasLimitHex,
      },
    };

    log('Estimation failed', { ...simulationFails, fallback: estimateGas });
  }

  return {
    blockGasLimit: gasLimitHex,
    estimatedGas,
    simulationFails,
  };
}

async function getGas(
  request: UpdateGasRequest,
): Promise<[string, TransactionMeta['simulationFails']?]> {
  const { providerConfig, txMeta } = request;

  if (txMeta.transaction.gas) {
    log('Using value from request', txMeta.transaction.gas);
    return [txMeta.transaction.gas];
  }

  if (await requiresFixedGas(request)) {
    log('Using fixed value', FIXED_GAS);
    return [FIXED_GAS];
  }

  const { blockGasLimit, estimatedGas, simulationFails } = await estimateGas(
    txMeta.transaction,
    request.ethQuery,
  );

  const estimatedGasBN = hexToBN(estimatedGas);
  const maxGasBN = hexToBN(blockGasLimit).muln(0.9);
  const paddedGasBN = estimatedGasBN.muln(1.5);
  const isCustomNetwork = providerConfig.type === NetworkType.rpc;

  if (estimatedGasBN.gt(maxGasBN) || isCustomNetwork) {
    const estimatedGasHex = addHexPrefix(estimatedGas);
    log('Using estimated value', estimatedGasHex);
    return [estimatedGasHex, simulationFails];
  }

  if (paddedGasBN.lt(maxGasBN)) {
    const paddedHex = addHexPrefix(BNToHex(paddedGasBN));
    log('Using 150% of estimated value', paddedHex);
    return [paddedHex, simulationFails];
  }

  const maxHex = addHexPrefix(BNToHex(maxGasBN));
  log('Using 90% of block gas limit', maxHex);
  return [maxHex, simulationFails];
}

async function requiresFixedGas({
  ethQuery,
  txMeta,
  providerConfig,
}: UpdateGasRequest): Promise<boolean> {
  const isCustomNetwork = providerConfig.type === NetworkType.rpc;

  const {
    transaction: { to, data },
  } = txMeta;

  if (isCustomNetwork) {
    return false;
  }

  if (!to) {
    return true;
  }

  const code = await getCode(ethQuery, to);

  return !data && (!code || code === '0x');
}

async function getCode(
  ethQuery: any,
  address: string,
): Promise<string | undefined> {
  return await query(ethQuery, 'getCode', [address]);
}

async function getLatestBlock(
  ethQuery: any,
): Promise<{ gasLimit: string; number: string }> {
  return await query(ethQuery, 'getBlockByNumber', ['latest', false]);
}
