/* eslint-disable jsdoc/require-jsdoc */

import {
  BNToHex,
  fractionBN,
  hexToBN,
  query,
} from '@metamask/controller-utils';
import type EthQuery from '@metamask/eth-query';
import type { Hex } from '@metamask/utils';
import { add0x, createModuleLogger } from '@metamask/utils';

import { GAS_BUFFER_CHAIN_OVERRIDES } from '../constants';
import { projectLogger } from '../logger';
import type { TransactionMeta, TransactionParams } from '../types';

export type UpdateGasRequest = {
  ethQuery: EthQuery;
  isCustomNetwork: boolean;
  chainId: Hex;
  txMeta: TransactionMeta;
};

export const log = createModuleLogger(projectLogger, 'gas');

export const FIXED_GAS = '0x5208';
export const DEFAULT_GAS_MULTIPLIER = 1.5;

export async function updateGas(request: UpdateGasRequest) {
  const { txMeta } = request;
  const initialParams = { ...txMeta.txParams };

  const [gas, simulationFails] = await getGas(request);

  txMeta.txParams.gas = gas;
  txMeta.simulationFails = simulationFails;

  if (!initialParams.gas) {
    txMeta.originalGasEstimate = txMeta.txParams.gas;
  }

  if (!txMeta.defaultGasEstimates) {
    txMeta.defaultGasEstimates = {};
  }

  txMeta.defaultGasEstimates.gas = txMeta.txParams.gas;
}

export async function estimateGas(
  txParams: TransactionParams,
  ethQuery: EthQuery,
) {
  const request = { ...txParams };
  const { data, value } = request;

  const { gasLimit: gasLimitHex, number: blockNumber } = await getLatestBlock(
    ethQuery,
  );

  const gasLimitBN = hexToBN(gasLimitHex);

  request.data = data ? add0x(data) : data;
  request.gas = BNToHex(fractionBN(gasLimitBN, 19, 20));
  request.value = value || '0x0';

  let estimatedGas = request.gas;
  let simulationFails;

  try {
    estimatedGas = await query(ethQuery, 'estimateGas', [request]);
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

export function addGasBuffer(
  estimatedGas: string,
  blockGasLimit: string,
  multiplier: number,
) {
  const estimatedGasBN = hexToBN(estimatedGas);
  const maxGasBN = hexToBN(blockGasLimit).muln(0.9);
  const paddedGasBN = estimatedGasBN.muln(multiplier);

  if (estimatedGasBN.gt(maxGasBN)) {
    const estimatedGasHex = add0x(estimatedGas);
    log('Using estimated value', estimatedGasHex);
    return estimatedGasHex;
  }

  if (paddedGasBN.lt(maxGasBN)) {
    const paddedHex = add0x(BNToHex(paddedGasBN));
    log('Using padded estimate', paddedHex, multiplier);
    return paddedHex;
  }

  const maxHex = add0x(BNToHex(maxGasBN));
  log('Using 90% of block gas limit', maxHex);
  return maxHex;
}

async function getGas(
  request: UpdateGasRequest,
): Promise<[string, TransactionMeta['simulationFails']?]> {
  const { isCustomNetwork, chainId, txMeta } = request;

  if (txMeta.txParams.gas) {
    log('Using value from request', txMeta.txParams.gas);
    return [txMeta.txParams.gas];
  }

  if (await requiresFixedGas(request)) {
    log('Using fixed value', FIXED_GAS);
    return [FIXED_GAS];
  }

  const { blockGasLimit, estimatedGas, simulationFails } = await estimateGas(
    txMeta.txParams,
    request.ethQuery,
  );

  if (isCustomNetwork) {
    log('Using original estimate as custom network');
    return [estimatedGas, simulationFails];
  }

  const bufferMultiplier =
    GAS_BUFFER_CHAIN_OVERRIDES[
      chainId as keyof typeof GAS_BUFFER_CHAIN_OVERRIDES
    ] ?? DEFAULT_GAS_MULTIPLIER;

  const bufferedGas = addGasBuffer(
    estimatedGas,
    blockGasLimit,
    bufferMultiplier,
  );

  return [bufferedGas, simulationFails];
}

async function requiresFixedGas({
  ethQuery,
  txMeta,
  isCustomNetwork,
}: UpdateGasRequest): Promise<boolean> {
  const {
    txParams: { to, data },
  } = txMeta;

  if (isCustomNetwork || !to || data) {
    return false;
  }

  const code = await getCode(ethQuery, to);

  return !code || code === '0x';
}

async function getCode(
  ethQuery: EthQuery,
  address: string,
): Promise<string | undefined> {
  return await query(ethQuery, 'getCode', [address]);
}

async function getLatestBlock(
  ethQuery: EthQuery,
): Promise<{ gasLimit: string; number: string }> {
  return await query(ethQuery, 'getBlockByNumber', ['latest', false]);
}
