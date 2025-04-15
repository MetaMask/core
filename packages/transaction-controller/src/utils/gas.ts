import {
  BNToHex,
  fractionBN,
  hexToBN,
  query,
  toHex,
} from '@metamask/controller-utils';
import type EthQuery from '@metamask/eth-query';
import type { Hex } from '@metamask/utils';
import { add0x, createModuleLogger, remove0x } from '@metamask/utils';

import { DELEGATION_PREFIX } from './eip7702';
import { getGasEstimateFallback } from './feature-flags';
import { simulateTransactions } from './simulation-api';
import { GAS_BUFFER_CHAIN_OVERRIDES } from '../constants';
import { projectLogger } from '../logger';
import type { TransactionControllerMessenger } from '../TransactionController';
import {
  TransactionEnvelopeType,
  TransactionType,
  type TransactionMeta,
  type TransactionParams,
} from '../types';

export type UpdateGasRequest = {
  chainId: Hex;
  ethQuery: EthQuery;
  isCustomNetwork: boolean;
  isSimulationEnabled: boolean;
  messenger: TransactionControllerMessenger;
  txMeta: TransactionMeta;
};

export const log = createModuleLogger(projectLogger, 'gas');

export const FIXED_GAS = '0x5208';
export const DEFAULT_GAS_MULTIPLIER = 1.5;
export const MAX_GAS_BLOCK_PERCENT = 90;
export const INTRINSIC_GAS = 21000;

export const DUMMY_AUTHORIZATION_SIGNATURE =
  '0x1111111111111111111111111111111111111111111111111111111111111111';

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
 * @param options - The options object.
 * @param options.chainId - The chain ID of the transaction.
 * @param options.ethQuery - The EthQuery instance to interact with the network.
 * @param options.isSimulationEnabled - Whether the simulation is enabled.
 * @param options.messenger - The messenger instance for communication.
 * @param options.txParams - The transaction parameters.
 * @returns The estimated gas and related info.
 */
export async function estimateGas({
  chainId,
  ethQuery,
  isSimulationEnabled,
  messenger,
  txParams,
}: {
  chainId: Hex;
  ethQuery: EthQuery;
  isSimulationEnabled: boolean;
  messenger: TransactionControllerMessenger;
  txParams: TransactionParams;
}) {
  const request = { ...txParams };
  const { authorizationList, data, from, value, to } = request;

  const { gasLimit: blockGasLimit, number: blockNumber } =
    await getLatestBlock(ethQuery);

  const blockGasLimitBN = hexToBN(blockGasLimit);
  const { percentage, fixed } = getGasEstimateFallback(chainId, messenger);

  const fallback = fixed
    ? toHex(fixed)
    : BNToHex(fractionBN(blockGasLimitBN, percentage, 100));

  log('Estimation fallback values', fallback);

  request.data = data ? add0x(data) : data;
  request.value = value || '0x0';

  request.authorizationList = normalizeAuthorizationList(
    request.authorizationList,
    chainId,
  );

  delete request.gasPrice;
  delete request.maxFeePerGas;
  delete request.maxPriorityFeePerGas;

  let estimatedGas = fallback;
  let simulationFails: TransactionMeta['simulationFails'];

  const isUpgradeWithDataToSelf =
    txParams.type === TransactionEnvelopeType.setCode &&
    authorizationList?.length &&
    data &&
    data !== '0x' &&
    from?.toLowerCase() === to?.toLowerCase();

  try {
    if (isSimulationEnabled && isUpgradeWithDataToSelf) {
      estimatedGas = await estimateGasUpgradeWithDataToSelf(
        request,
        ethQuery,
        chainId,
      );
    } else {
      estimatedGas = await query(ethQuery, 'estimateGas', [request]);
    }
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
  const { chainId, isCustomNetwork, isSimulationEnabled, txMeta } = request;
  const { disableGasBuffer } = txMeta;

  if (txMeta.txParams.gas) {
    log('Using value from request', txMeta.txParams.gas);
    return [txMeta.txParams.gas, undefined, txMeta.txParams.gas];
  }

  if (await requiresFixedGas(request)) {
    log('Using fixed value', FIXED_GAS);
    return [FIXED_GAS, undefined, FIXED_GAS];
  }

  const { blockGasLimit, estimatedGas, simulationFails } = await estimateGas({
    chainId: request.chainId,
    ethQuery: request.ethQuery,
    isSimulationEnabled,
    messenger: request.messenger,
    txParams: txMeta.txParams,
  });

  if (isCustomNetwork || simulationFails) {
    log(
      isCustomNetwork
        ? 'Using original estimate as custom network'
        : 'Using original fallback estimate as simulation failed',
    );
    return [estimatedGas, simulationFails, estimatedGas];
  }

  let finalGas = estimatedGas;

  if (!disableGasBuffer) {
    const bufferMultiplier =
      GAS_BUFFER_CHAIN_OVERRIDES[
        chainId as keyof typeof GAS_BUFFER_CHAIN_OVERRIDES
      ] ?? DEFAULT_GAS_MULTIPLIER;

    finalGas = addGasBuffer(estimatedGas, blockGasLimit, bufferMultiplier);
  }

  return [finalGas, simulationFails, estimatedGas];
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
    txParams: { to, data, type },
  } = txMeta;

  if (
    isCustomNetwork ||
    !to ||
    data ||
    type === TransactionEnvelopeType.setCode
  ) {
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

/**
 * Estimate the gas for a type 4 transaction.
 *
 * @param txParams - The transaction parameters.
 * @param ethQuery - The EthQuery instance to interact with the network.
 * @param chainId - The chain ID of the transaction.
 * @returns The estimated gas.
 */
async function estimateGasUpgradeWithDataToSelf(
  txParams: TransactionParams,
  ethQuery: EthQuery,
  chainId: Hex,
) {
  const upgradeGas = await query(ethQuery, 'estimateGas', [
    {
      ...txParams,
      data: '0x',
    },
  ]);

  log('Upgrade only gas', upgradeGas);

  const delegationAddress = txParams.authorizationList?.[0].address as Hex;

  const executeGas = await simulateGas({
    chainId: chainId as Hex,
    delegationAddress,
    transaction: txParams,
  });

  log('Execute gas', executeGas);

  const total = BNToHex(
    hexToBN(upgradeGas).add(hexToBN(executeGas)).subn(INTRINSIC_GAS),
  );

  log('Total type 4 gas', total);

  return total;
}

/**
 * Simulate the required gas using the simulation API.
 *
 * @param options - The options object.
 * @param options.chainId - The chain ID of the transaction.
 * @param options.delegationAddress - The delegation address of the sender to mock.
 * @param options.transaction - The transaction parameters.
 * @returns The simulated gas.
 */
async function simulateGas({
  chainId,
  delegationAddress,
  transaction,
}: {
  chainId: Hex;
  delegationAddress?: Hex;
  transaction: TransactionParams;
}): Promise<Hex> {
  const response = await simulateTransactions(chainId, {
    transactions: [
      {
        to: transaction.to as Hex,
        from: transaction.from as Hex,
        data: transaction.data as Hex,
        value: transaction.value as Hex,
      },
    ],
    overrides: {
      [transaction.from as string]: {
        code:
          delegationAddress &&
          ((DELEGATION_PREFIX + remove0x(delegationAddress)) as Hex),
      },
    },
  });

  const gasUsed = response?.transactions?.[0].gasUsed;

  if (!gasUsed) {
    throw new Error('No simulated gas returned');
  }

  return gasUsed;
}

/**
 * Populate the authorization list with dummy values.
 *
 * @param authorizationList - The authorization list to prepare.
 * @param chainId - The chain ID to use.
 * @returns The authorization list with dummy values.
 */
function normalizeAuthorizationList(
  authorizationList: TransactionParams['authorizationList'],
  chainId: Hex,
) {
  return authorizationList?.map((authorization) => ({
    ...authorization,
    chainId: authorization.chainId ?? chainId,
    nonce: authorization.nonce ?? '0x1',
    r: authorization.r ?? DUMMY_AUTHORIZATION_SIGNATURE,
    s: authorization.s ?? DUMMY_AUTHORIZATION_SIGNATURE,
    yParity: authorization.yParity ?? '0x1',
  }));
}
