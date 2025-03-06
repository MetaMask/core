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
export const GAS_ESTIMATE_FALLBACK_BLOCK_PERCENT = 35;
export const MAX_GAS_BLOCK_PERCENT = 90;

/**
 * Populate the gas properties of the provided transaction meta.
 *
 * @param request - The request object including the necessary parameters.
 */
export async function updateGas(request: UpdateGasRequest) {
  const { txMeta } = request;
  const initialParams = { ...txMeta.txParams };

  const [gas, simulationFails, gasLimitNoBuffer] = await getGas(request);

  txMeta.txParams.gas = gas;
  txMeta.simulationFails = simulationFails;
  txMeta.gasLimitNoBuffer = gasLimitNoBuffer;

  if (!initialParams.gas) {
    txMeta.originalGasEstimate = txMeta.txParams.gas;
  }

  if (!txMeta.defaultGasEstimates) {
    txMeta.defaultGasEstimates = {};
  }

  txMeta.defaultGasEstimates.gas = txMeta.txParams.gas;
}

/**
 * Estimate the gas for the provided transaction parameters.
 * If the gas estimate fails, the fallback value is returned.
 *
 * @param txParams - The transaction parameters.
 * @param ethQuery - The EthQuery instance to interact with the network.
 * @returns The estimated gas and related info.
 */
export async function estimateGas(
  txParams: TransactionParams,
  ethQuery: EthQuery,
) {
  const request = { ...txParams };
  const { data, value } = request;

  const { gasLimit: blockGasLimit, number: blockNumber } =
    await getLatestBlock(ethQuery);

  const blockGasLimitBN = hexToBN(blockGasLimit);

  const fallback = BNToHex(
    fractionBN(blockGasLimitBN, GAS_ESTIMATE_FALLBACK_BLOCK_PERCENT, 100),
  );

  request.data = data ? add0x(data) : data;
  request.value = value || '0x0';

  delete request.gasPrice;
  delete request.maxFeePerGas;
  delete request.maxPriorityFeePerGas;

  let estimatedGas = fallback;
  let simulationFails: TransactionMeta['simulationFails'];

  try {
    estimatedGas = await query(ethQuery, 'estimateGas', [request]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    simulationFails = {
      reason: error.message,
      errorKey: error.errorKey,
      debug: {
        blockNumber,
        blockGasLimit,
      },
    };

    log('Estimation failed', { ...simulationFails, fallback });
  }

  return {
    blockGasLimit,
    estimatedGas,
    simulationFails,
  };
}

/**
 * Add a buffer to the provided estimated gas.
 * The buffer is calculated based on the block gas limit and a multiplier.
 *
 * @param estimatedGas - The estimated gas.
 * @param blockGasLimit - The block gas limit.
 * @param multiplier - The multiplier to apply to the estimated gas.
 * @returns The gas with the buffer applied.
 */
export function addGasBuffer(
  estimatedGas: string,
  blockGasLimit: string,
  multiplier: number,
) {
  const estimatedGasBN = hexToBN(estimatedGas);

  const maxGasBN = fractionBN(
    hexToBN(blockGasLimit),
    MAX_GAS_BLOCK_PERCENT,
    100,
  );

  const paddedGasBN = fractionBN(estimatedGasBN, multiplier * 100, 100);

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

/**
 * Determine the gas for the provided request.
 *
 * @param request - The request object including the necessary parameters.
 * @returns The final gas value and the estimate used.
 */
async function getGas(
  request: UpdateGasRequest,
): Promise<[string, TransactionMeta['simulationFails']?, string?]> {
  const { isCustomNetwork, chainId, txMeta } = request;

  if (txMeta.txParams.gas) {
    log('Using value from request', txMeta.txParams.gas);
    return [txMeta.txParams.gas, undefined, txMeta.txParams.gas];
  }

  if (await requiresFixedGas(request)) {
    log('Using fixed value', FIXED_GAS);
    return [FIXED_GAS, undefined, FIXED_GAS];
  }

  const { blockGasLimit, estimatedGas, simulationFails } = await estimateGas(
    txMeta.txParams,
    request.ethQuery,
  );

  if (isCustomNetwork || simulationFails) {
    log(
      isCustomNetwork
        ? 'Using original estimate as custom network'
        : 'Using original fallback estimate as simulation failed',
    );
    return [estimatedGas, simulationFails, estimatedGas];
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

  return [bufferedGas, simulationFails, estimatedGas];
}

/**
 * Determine if the gas for the provided request should be fixed.
 *
 * @param options - The options object.
 * @param options.ethQuery - The EthQuery instance to interact with the network.
 * @param options.txMeta - The transaction meta object.
 * @param options.isCustomNetwork - Whether the network is a custom network.
 * @returns Whether the gas should be fixed.
 */
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

/**
 * Get the contract code for the provided address.
 *
 * @param ethQuery - The EthQuery instance to interact with the network.
 * @param address - The address to get the code for.
 * @returns The contract code.
 */
async function getCode(
  ethQuery: EthQuery,
  address: string,
): Promise<string | undefined> {
  return await query(ethQuery, 'getCode', [address]);
}

/**
 * Get the latest block from the network.
 *
 * @param ethQuery - The EthQuery instance to interact with the network.
 * @returns The latest block number.
 */
async function getLatestBlock(
  ethQuery: EthQuery,
): Promise<{ gasLimit: string; number: string }> {
  return await query(ethQuery, 'getBlockByNumber', ['latest', false]);
}
