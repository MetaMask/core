import {
  BNToHex,
  fractionBN,
  hexToBN,
  toHex,
} from '@metamask/controller-utils';
import type { NetworkClientId } from '@metamask/network-controller';
import type { SentinelSimulationTransaction } from '@metamask/sentinel-api-service';
import type { Hex, Json } from '@metamask/utils';
import {
  add0x,
  createModuleLogger,
  isStrictHexString,
  remove0x,
} from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { simulateTransactions } from '../api/simulation-api.js';
import { projectLogger } from '../logger.js';
import type { TransactionControllerMessenger } from '../TransactionController.js';
import { TransactionEnvelopeType } from '../types.js';
import type {
  AuthorizationList,
  BatchTransactionParams,
  GetSimulationConfig,
  IsAtomicBatchSupportedRequest,
  IsAtomicBatchSupportedResult,
  Revert,
  TransactionBatchSingleRequest,
  TransactionMeta,
  TransactionParams,
} from '../types.js';
import {
  DELEGATION_PREFIX,
  doesAccountSupportEIP7702,
  generateEIP7702BatchTransaction,
  getAuthorizationAuthority,
  getDelegationAddress,
  isAuthorizationSigned,
} from './eip7702.js';
import {
  getGasEstimateBuffer,
  getGasEstimateFallback,
} from './feature-flags.js';
import { getChainId, rpcRequest } from './provider.js';
import { decodeRevert } from './revert-reason.js';

export type UpdateGasRequest = {
  isCustomNetwork: boolean;
  isSimulationEnabled: boolean;
  getSimulationConfig?: GetSimulationConfig;
  messenger: TransactionControllerMessenger;
  txMeta: TransactionMeta;
};

/**
 * How the gas limits of a batch are applied.
 * - `eip7702` - A single gas limit for the outer EIP-7702 transaction.
 * - `separate` - One gas limit per transaction, submitted separately.
 */
export type EstimateGasBatchMode = 'eip7702' | 'separate';

export type EstimateGasBatchResult = {
  /** Gas limits, with a single entry if `mode` is `eip7702`. */
  gasLimits: number[];

  /** How the gas limits are applied. */
  mode: EstimateGasBatchMode;

  /** Whether the outer EIP-7702 transaction upgrades the sender. */
  requiresAuthorizationList?: true;

  /** Total of all gas limits. */
  totalGasLimit: number;
};

export const log = createModuleLogger(projectLogger, 'gas');

export const DEFAULT_GAS_MULTIPLIER = 1.5;
export const MAX_GAS_BLOCK_PERCENT = 90;

export const DUMMY_AUTHORIZATION_SIGNATURE =
  '0x1111111111111111111111111111111111111111111111111111111111111111';

/**
 * EIP-2780 state gas charged at runtime when a valid authorization sets a
 * delegation indicator for an authority that had none at the start of the
 * transaction, at most once per authority.
 *
 * When the authority is the sender, this is the only runtime authorization
 * charge: `ACCOUNT_WRITE` is covered by the transaction base cost, and the
 * sender always exists in state as its nonce is incremented first.
 */
export const EIP_2780_AUTHORIZATION_GAS = 35190;

/**
 * Intrinsic gas cost for each authorization omitted from the node estimate.
 */
export const EIP7280_AUTHORIZATION_INTRINSIC_GAS = 7816;

/**
 * Gas for the upgrade authorization of the sender that is not included in the
 * sum of the provided gas values of a batch: the EIP-7280 intrinsic cost of an
 * authorization plus the delegation indicator charge.
 */
export const UPGRADE_AUTHORIZATION_GAS =
  EIP7280_AUTHORIZATION_INTRINSIC_GAS + EIP_2780_AUTHORIZATION_GAS;

/**
 * Error for a simulated transaction that failed, as opposed to the simulation
 * itself being unavailable.
 */
class SimulatedTransactionError extends Error {}

/**
 * Populate the gas properties of the provided transaction meta.
 *
 * @param request - The request object including the necessary parameters.
 */
export async function updateGas(request: UpdateGasRequest): Promise<void> {
  const { txMeta } = request;
  const initialParams = { ...txMeta.txParams };

  const [gas, simulationFails, gasLimitNoBuffer, gasRevert] =
    await getGas(request);

  txMeta.txParams.gas = gas;
  txMeta.simulationFails = simulationFails;
  txMeta.gasLimitNoBuffer = gasLimitNoBuffer;

  if (gasRevert) {
    txMeta.revert = { ...txMeta.revert, gas: gasRevert };
  }

  if (!initialParams.gas) {
    txMeta.originalGasEstimate = txMeta.txParams.gas;
  }

  txMeta.defaultGasEstimates ??= {};
  txMeta.defaultGasEstimates.gas = txMeta.txParams.gas;
}

/**
 * Estimate the gas for the provided transaction parameters.
 * If the gas estimate fails, the fallback value is returned.
 *
 * @param options - The options object.
 * @param options.ignoreDelegationSignatures - Ignore signature errors if submitting delegations to the DelegationManager.
 * @param options.isSimulationEnabled - Whether the simulation is enabled.
 * @param options.getSimulationConfig - Optional callback to rewrite the simulation request URL.
 * @param options.messenger - The messenger instance for communication.
 * @param options.networkClientId - The network client ID.
 * @param options.txParams - The transaction parameters.
 * @returns The estimated gas and related info.
 */
export async function estimateGas({
  ignoreDelegationSignatures,
  isSimulationEnabled,
  getSimulationConfig,
  messenger,
  networkClientId,
  txParams,
}: {
  ignoreDelegationSignatures?: boolean;
  isSimulationEnabled: boolean;
  getSimulationConfig?: GetSimulationConfig;
  messenger: TransactionControllerMessenger;
  networkClientId: NetworkClientId;
  txParams: TransactionParams;
}): Promise<{
  blockGasLimit: string;
  estimatedGas: string;
  gasRevert?: Revert;
  isUpgradeWithData: boolean;
  simulationFails: TransactionMeta['simulationFails'];
}> {
  const request = { ...txParams };
  const { authorizationList, data, value } = request;
  const chainId = getChainId({ messenger, networkClientId });

  if (ignoreDelegationSignatures && !isSimulationEnabled) {
    throw new Error(
      'Gas estimation with ignored delegation signatures is not supported as simulation disabled',
    );
  }

  const { gasLimit: blockGasLimit, number: blockNumber } = await getLatestBlock(
    messenger,
    networkClientId,
  );

  const blockGasLimitBN = hexToBN(blockGasLimit);
  const { percentage, fixed, maxGasLimit } = getGasEstimateFallback(
    chainId,
    messenger,
  );

  const uncappedFallback = fixed
    ? toHex(fixed)
    : BNToHex(fractionBN(blockGasLimitBN, percentage, 100));

  // Clamp the fallback to the chain's per-transaction gas cap so it can never
  // exceed the gas limit the RPC will accept. Without this, a percentage of a
  // high block gas limit can overshoot the cap (e.g. 35% of Polygon's ~140M
  // block limit is ~49M, but the node caps a tx at ~33.5M and rejects it with
  // "transaction gas limit too high").
  const fallback =
    maxGasLimit !== undefined &&
    hexToBN(uncappedFallback).gt(hexToBN(toHex(maxGasLimit)))
      ? toHex(maxGasLimit)
      : uncappedFallback;

  log('Estimation fallback values', fallback);

  request.data = data ? add0x(data) : data;
  request.value = normalizeValue(value);

  request.authorizationList = normalizeAuthorizationList(
    request.authorizationList,
    chainId,
  );

  delete request.gasPrice;
  delete request.maxFeePerGas;
  delete request.maxPriorityFeePerGas;

  let estimatedGas = fallback;
  let simulationFails: TransactionMeta['simulationFails'];
  let gasRevert: Revert | undefined;

  const isUpgradeWithData =
    txParams.type === TransactionEnvelopeType.setCode &&
    Boolean(authorizationList?.length) &&
    Boolean(data) &&
    data !== '0x';

  const type4AuthorizationList =
    txParams.type === TransactionEnvelopeType.setCode &&
    authorizationList?.length
      ? authorizationList
      : undefined;

  try {
    if (type4AuthorizationList) {
      estimatedGas = await estimateGasType4({
        authorizationList: type4AuthorizationList,
        chainId,
        getSimulationConfig,
        isSimulationEnabled,
        messenger,
        networkClientId,
        txParams: request,
      });
    } else if (ignoreDelegationSignatures && isSimulationEnabled) {
      estimatedGas = await simulateGas({
        chainId,
        getSimulationConfig,
        messenger,
        transaction: request,
      });
    } else {
      estimatedGas = await estimateGasNode(messenger, networkClientId, request);
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

    gasRevert = decodeRevert(error, 'gas');

    log('Estimation failed', { ...simulationFails, fallback, gasRevert });
  }

  return {
    blockGasLimit,
    estimatedGas,
    gasRevert,
    isUpgradeWithData,
    simulationFails,
  };
}

/**
 * Sum caller-provided gas limits across a batch.
 *
 * If every transaction in the batch already has a `gas` value, returns the
 * parsed per-tx limits and their sum. Otherwise returns `undefined`.
 *
 * Used by `estimateGasBatch`:
 * - non-7702 path: short-circuits simulation entirely when present.
 * - EIP-7702 path: used as a fallback when simulation fails — required for
 *   callers that submit batches whose individual sub-calls cannot be simulated
 *   standalone (e.g. predict-withdraw, where the batch's first sub-call
 *   provides source-token balance to subsequent sub-calls). When 7702
 *   simulation succeeds it is preferred since the bundled call has no per-tx
 *   intrinsic gas cost and produces a tighter estimate. If the sender requires
 *   an upgrade, the fallback adds the authorization intrinsic gas and, if no
 *   delegation exists yet, the delegation indicator charge. The provided gas
 *   values do not include these authorization costs.
 *
 * @param transactions - Batch transactions to inspect.
 * @returns Parsed gas limits and total when every transaction has gas; otherwise `undefined`.
 */
export function getProvidedBatchGasLimits(
  transactions: BatchTransactionParams[],
): { gasLimits: number[]; totalGasLimit: number } | undefined {
  if (!transactions.every((transaction) => transaction.gas !== undefined)) {
    return undefined;
  }

  const gasLimits = transactions.map((transaction) =>
    new BigNumber(transaction.gas as Hex).toNumber(),
  );
  const totalGasLimit = gasLimits.reduce((acc, gasLimit) => acc + gasLimit, 0);

  return { gasLimits, totalGasLimit };
}

export async function estimateGasBatch({
  from,
  getSimulationConfig,
  isAtomicBatchSupported,
  messenger,
  networkClientId,
  transactions,
}: {
  from: Hex;
  getSimulationConfig?: GetSimulationConfig;
  isAtomicBatchSupported: (
    request: IsAtomicBatchSupportedRequest,
  ) => Promise<IsAtomicBatchSupportedResult>;
  messenger: TransactionControllerMessenger;
  networkClientId: NetworkClientId;
  transactions: BatchTransactionParams[];
}): Promise<EstimateGasBatchResult> {
  const chainId = getChainId({ messenger, networkClientId });

  const is7702Result = await isAtomicBatchSupported({
    address: from,
    chainIds: [chainId],
  });

  const accountSupports7702 = doesAccountSupportEIP7702(messenger, from);

  const chainResult = accountSupports7702
    ? is7702Result.find((result) => result.chainId === chainId)
    : undefined;

  const isUpgradeRequired = Boolean(chainResult && !chainResult.isSupported);

  if (isUpgradeRequired && !chainResult?.upgradeContractAddress) {
    throw new Error('Upgrade contract address not found');
  }

  if (chainResult) {
    const providedBatchGasLimits = getProvidedBatchGasLimits(transactions);

    const authorizationList = isUpgradeRequired
      ? [{ address: chainResult.upgradeContractAddress as Hex }]
      : undefined;

    const type = isUpgradeRequired
      ? TransactionEnvelopeType.setCode
      : undefined;

    const params: TransactionParams = {
      ...generateEIP7702BatchTransaction(from, transactions),
      authorizationList,
      from,
      type,
    };

    // Prefer real EIP-7702 simulation when it succeeds — the bundled call has
    // no per-tx intrinsic gas cost so the estimate is typically lower than
    // summing per-tx provided limits. Fall back to the provided sum when the
    // node-level simulation fails (e.g. predict-withdraw, where the batch's
    // first sub-call provides source-token balance to subsequent sub-calls).
    const { estimatedGas: gasLimitHex, simulationFails } = await estimateGas({
      isSimulationEnabled: true,
      getSimulationConfig,
      messenger,
      networkClientId,
      txParams: params,
    });

    if (simulationFails && providedBatchGasLimits) {
      const upgradeGas = chainResult.delegationAddress
        ? EIP7280_AUTHORIZATION_INTRINSIC_GAS
        : UPGRADE_AUTHORIZATION_GAS;
      const fallbackGasLimit =
        providedBatchGasLimits.totalGasLimit +
        (isUpgradeRequired ? upgradeGas : 0);

      log(
        'EIP-7702 estimation failed, using batch parameter gas limits',
        { fallbackGasLimit },
        simulationFails,
      );

      return {
        gasLimits: [fallbackGasLimit],
        mode: 'eip7702',
        ...(isUpgradeRequired ? { requiresAuthorizationList: true } : {}),
        totalGasLimit: fallbackGasLimit,
      };
    }

    const totalGasLimit = new BigNumber(gasLimitHex).toNumber();

    log('Estimated EIP-7702 gas limit', totalGasLimit);

    return {
      gasLimits: [totalGasLimit],
      mode: 'eip7702',
      ...(isUpgradeRequired ? { requiresAuthorizationList: true } : {}),
      totalGasLimit,
    };
  }

  const providedBatchGasLimits = getProvidedBatchGasLimits(transactions);
  if (providedBatchGasLimits) {
    log('Using batch parameter gas limits', providedBatchGasLimits);
    return { ...providedBatchGasLimits, mode: 'separate' };
  }

  const { gasLimits: gasLimitsHex } = await simulateGasBatch({
    chainId,
    from,
    getSimulationConfig,
    messenger,
    transactions: transactions.map((transaction) => ({
      params: transaction,
    })),
  });

  const gasLimits = transactions.map((transaction, index) =>
    transaction.gas
      ? new BigNumber(transaction.gas).toNumber()
      : new BigNumber(gasLimitsHex[index]).toNumber(),
  );

  const totalGasLimit = gasLimits.reduce((acc, gasLimit) => acc + gasLimit, 0);

  log('Simulated batch gas limits', { totalGasLimit, gasLimits });

  return { gasLimits, mode: 'separate', totalGasLimit };
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
): string {
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
 * Simulate the required gas for a batch of transactions using the simulation API.
 *
 * @param options - The options object.
 * @param options.chainId - The chain ID of the transactions.
 * @param options.from - The address of the sender.
 * @param options.getSimulationConfig - Optional callback to rewrite the simulation request URL.
 * @param options.messenger - The messenger instance used to invoke the Sentinel simulation action.
 * @param options.transactions - The array of transactions within a batch request.
 * @returns An object containing the transactions with their gas limits and the total gas limit.
 */
export async function simulateGasBatch({
  chainId,
  from,
  getSimulationConfig,
  messenger,
  transactions,
}: {
  chainId: Hex;
  from: Hex;
  getSimulationConfig?: GetSimulationConfig;
  messenger: TransactionControllerMessenger;
  transactions: TransactionBatchSingleRequest[];
}): Promise<{ totalGasLimit: Hex; gasLimits: Hex[] }> {
  try {
    const response = await simulateTransactions(
      messenger,
      chainId,
      {
        transactions: transactions.map((transaction) => ({
          ...transaction.params,
          from,
        })),
      },
      { getSimulationConfig },
    );

    if (response?.transactions?.length !== transactions.length) {
      throw new Error('Simulation response does not match transaction count');
    }

    return response.transactions.reduce<{
      totalGasLimit: Hex;
      gasLimits: Hex[];
    }>(
      (acc, transaction) => {
        const gasLimit = transaction?.gasLimit;

        if (!gasLimit) {
          throw new Error(
            'No simulated gas returned for one of the transactions',
          );
        }

        acc.gasLimits.push(gasLimit);

        acc.totalGasLimit = BNToHex(
          hexToBN(acc.totalGasLimit).add(hexToBN(gasLimit)),
        );

        return acc;
      },
      {
        totalGasLimit: '0x0',
        gasLimits: [],
      },
    );
  } catch (error: unknown) {
    log('Error while simulating gas batch', error);
    throw new Error(
      'Cannot estimate transaction batch total gas as simulation failed',
    );
  }
}

/**
 * Determine the gas for the provided request.
 *
 * @param request - The request object including the necessary parameters.
 * @returns The final gas value and the estimate used.
 */
async function getGas(
  request: UpdateGasRequest,
): Promise<[string, TransactionMeta['simulationFails']?, string?, Revert?]> {
  const {
    isCustomNetwork,
    isSimulationEnabled,
    getSimulationConfig,
    messenger,
    txMeta,
  } = request;
  const { networkClientId } = txMeta;
  const chainId = getChainId({ messenger, networkClientId });
  const { disableGasBuffer } = txMeta;

  if (txMeta.txParams.gas) {
    log('Using value from request', txMeta.txParams.gas);
    return [txMeta.txParams.gas, undefined, txMeta.txParams.gas];
  }

  const {
    blockGasLimit,
    estimatedGas,
    gasRevert,
    isUpgradeWithData,
    simulationFails,
  } = await estimateGas({
    isSimulationEnabled,
    getSimulationConfig,
    messenger,
    networkClientId,
    txParams: txMeta.txParams,
  });

  log('Original estimated gas', estimatedGas);

  if (simulationFails) {
    log('Using original fallback estimate as simulation failed');
  }

  if (disableGasBuffer) {
    log('Gas buffer disabled');
  }

  if (simulationFails || disableGasBuffer) {
    return [estimatedGas, simulationFails, estimatedGas, gasRevert];
  }

  const bufferMultiplier = getGasEstimateBuffer({
    chainId,
    isCustomRPC: isCustomNetwork,
    isUpgradeWithData,
    messenger,
  });

  log('Buffer', bufferMultiplier);

  const bufferedGas = addGasBuffer(
    estimatedGas,
    blockGasLimit,
    bufferMultiplier,
  );

  log('Buffered gas', bufferedGas);

  return [bufferedGas, simulationFails, estimatedGas, gasRevert];
}

/**
 * Get the latest block from the network.
 *
 * @param messenger - The messenger instance for communication.
 * @param networkClientId - The network client ID.
 * @returns The latest block number.
 */
async function getLatestBlock(
  messenger: TransactionControllerMessenger,
  networkClientId: NetworkClientId,
): Promise<{ gasLimit: string; number: string }> {
  return (await rpcRequest({
    messenger,
    networkClientId,
    method: 'eth_getBlockByNumber',
    params: ['latest', false],
  })) as { gasLimit: string; number: string };
}

/**
 * Estimate the gas for a type 4 transaction as one outer transaction.
 *
 * - If all authorizations are signed, the selected node estimates the exact
 * transaction.
 * - Otherwise, the Simulation API estimates the exact transaction, with the
 * authority of each authorization so that it can apply any EIP-2780 runtime
 * authorization charges.
 * - If the Simulation API is disabled, unsupported or unavailable, the selected
 * node estimates the transaction without unsigned authorizations and with the
 * delegation of the sender overridden. Intrinsic gas is added for each omitted
 * authorization, plus the EIP-2780 delegation charge if the sender is not yet
 * delegated. A simulated transaction error is not retried using the node.
 *
 * @param options - The options object.
 * @param options.authorizationList - The original authorization list of the transaction.
 * @param options.chainId - The chain ID of the transaction.
 * @param options.getSimulationConfig - Optional callback to rewrite the simulation request URL.
 * @param options.isSimulationEnabled - Whether the simulation is enabled.
 * @param options.messenger - The messenger instance for communication.
 * @param options.networkClientId - The network client ID.
 * @param options.txParams - The normalized transaction parameters.
 * @returns The estimated gas.
 */
async function estimateGasType4({
  authorizationList,
  chainId,
  getSimulationConfig,
  isSimulationEnabled,
  messenger,
  networkClientId,
  txParams,
}: {
  authorizationList: AuthorizationList;
  chainId: Hex;
  getSimulationConfig?: GetSimulationConfig;
  isSimulationEnabled: boolean;
  messenger: TransactionControllerMessenger;
  networkClientId: NetworkClientId;
  txParams: TransactionParams;
}): Promise<Hex> {
  if (authorizationList.every(isAuthorizationSigned)) {
    log('Estimating type 4 gas using node as all authorizations signed');
    return await estimateGasNode(messenger, networkClientId, txParams);
  }

  if (isSimulationEnabled) {
    const simulationAuthorizationList = authorizationList.map(
      (authorization) => {
        const authority = getAuthorizationAuthority(
          authorization,
          txParams.from,
        );

        if (!authority) {
          throw new Error('Cannot determine authority of signed authorization');
        }

        return { address: authorization.address, from: authority };
      },
    );

    log('Estimating type 4 gas using simulation', simulationAuthorizationList);

    try {
      return await simulateGas({
        authorizationList: simulationAuthorizationList,
        chainId,
        getSimulationConfig,
        messenger,
        transaction: txParams,
      });
    } catch (error) {
      if (error instanceof SimulatedTransactionError) {
        throw error;
      }

      log('Simulation unavailable, estimating type 4 gas using node', error);
    }
  }

  return await estimateGasType4Node({
    authorizationList,
    messenger,
    networkClientId,
    txParams,
  });
}

/**
 * Estimate the gas for a type 4 transaction with unsigned authorizations using
 * the selected node.
 *
 * Unsigned authorizations are omitted from the node request and their intrinsic
 * gas is added manually per entry. Their authority is the sender, so the
 * delegation of the sender is set with a state override, and the EIP-2780 charge
 * for a new delegation indicator is added once if the sender is not yet
 * delegated. Signed authorizations remain in the request and are charged by the
 * node.
 *
 * @param options - The options object.
 * @param options.authorizationList - The original authorization list of the transaction.
 * @param options.messenger - The messenger instance for communication.
 * @param options.networkClientId - The network client ID.
 * @param options.txParams - The normalized transaction parameters.
 * @returns The estimated gas including omitted authorization costs.
 */
async function estimateGasType4Node({
  authorizationList,
  messenger,
  networkClientId,
  txParams,
}: {
  authorizationList: AuthorizationList;
  messenger: TransactionControllerMessenger;
  networkClientId: NetworkClientId;
  txParams: TransactionParams;
}): Promise<Hex> {
  const unsignedAuthorizations = authorizationList.filter(
    (authorization) => !isAuthorizationSigned(authorization),
  );
  const signedAuthorizations = authorizationList.filter(isAuthorizationSigned);
  const nodeTxParams = {
    ...txParams,
    authorizationList: signedAuthorizations.length
      ? signedAuthorizations
      : undefined,
    type: signedAuthorizations.length ? txParams.type : undefined,
  };

  // Unsigned authorizations are signed by the sender, and the last valid
  // authorization for an authority sets its delegation.
  const delegationAddress =
    unsignedAuthorizations[unsignedAuthorizations.length - 1].address;

  const [nodeGas, currentDelegationAddress] = await Promise.all([
    estimateGasNode(
      messenger,
      networkClientId,
      nodeTxParams,
      delegationAddress,
    ),
    getDelegationAddress(txParams.from as Hex, messenger, networkClientId),
  ]);

  const intrinsicGas =
    unsignedAuthorizations.length * EIP7280_AUTHORIZATION_INTRINSIC_GAS;
  const delegationGas = currentDelegationAddress
    ? 0
    : EIP_2780_AUTHORIZATION_GAS;

  log('Type 4 gas using node', {
    currentDelegationAddress,
    delegationGas,
    intrinsicGas,
    nodeGas,
  });

  return BNToHex(hexToBN(nodeGas).addn(intrinsicGas + delegationGas));
}

/**
 * Simulate the required gas using the simulation API.
 *
 * If an authorization list is provided, it is included in the simulated
 * transaction, a simulated transaction error is thrown as a
 * `SimulatedTransactionError`, and the response must include a non-zero gas
 * limit.
 *
 * @param options - The options object.
 * @param options.authorizationList - The authorization list with the authority of each entry.
 * @param options.chainId - The chain ID of the transaction.
 * @param options.getSimulationConfig - Optional callback to rewrite the simulation request URL.
 * @param options.messenger - The messenger instance used to invoke the Sentinel simulation action.
 * @param options.transaction - The transaction parameters.
 * @returns The simulated gas.
 */
async function simulateGas({
  authorizationList,
  chainId,
  getSimulationConfig,
  messenger,
  transaction,
}: {
  authorizationList?: SentinelSimulationTransaction['authorizationList'];
  chainId: Hex;
  getSimulationConfig?: GetSimulationConfig;
  messenger: TransactionControllerMessenger;
  transaction: TransactionParams;
}): Promise<Hex> {
  const response = await simulateTransactions(
    messenger,
    chainId,
    {
      transactions: [
        {
          ...(authorizationList ? { authorizationList } : {}),
          to: transaction.to as Hex,
          from: transaction.from as Hex,
          data: transaction.data as Hex,
          value: transaction.value as Hex,
        },
      ],
    },
    { getSimulationConfig },
  );

  const simulatedTransaction = response?.transactions?.[0];
  const gasLimit = simulatedTransaction?.gasLimit;

  if (authorizationList && simulatedTransaction?.error) {
    throw new SimulatedTransactionError(
      `Simulation failed: ${simulatedTransaction.error}`,
    );
  }

  if (!gasLimit || (authorizationList && hexToBN(gasLimit).isZero())) {
    throw new Error('No simulated gas returned');
  }

  return gasLimit;
}

/**
 * Populate the authorization list with dummy values.
 *
 * @param authorizationList - The authorization list to prepare.
 * @param chainId - The chain ID to use.
 * @returns The authorization list with dummy values.
 */
function normalizeAuthorizationList(
  authorizationList: AuthorizationList | undefined,
  chainId: Hex,
): AuthorizationList | undefined {
  return authorizationList?.map((authorization) => ({
    ...authorization,
    chainId: authorization.chainId ?? chainId,
    nonce: authorization.nonce ?? '0x1',
    r: authorization.r ?? DUMMY_AUTHORIZATION_SIGNATURE,
    s: authorization.s ?? DUMMY_AUTHORIZATION_SIGNATURE,
    yParity: authorization.yParity ?? '0x1',
  }));
}

/**
 * Normalize the value to a canonical hex quantity with no leading zero digits.
 * Some RPC nodes (e.g. Go's `hexutil`) reject quantities such as `0x00` or
 * `0x0de0b6b3a7640000`, failing gas estimation entirely.
 *
 * @param value - The transaction value to normalize.
 * @returns The normalized transaction value.
 */
function normalizeValue(value: string | undefined): string {
  const valueOrDefault = value ?? '0x0';

  if (!isStrictHexString(valueOrDefault)) {
    return valueOrDefault;
  }

  const stripped = remove0x(valueOrDefault).replace(/^0+/u, '');

  return stripped.length === 0 ? '0x0' : add0x(stripped);
}

/**
 * Estimate the gas for a transaction using the `eth_estimateGas` method.
 *
 * @param messenger - The messenger instance for communication.
 * @param networkClientId - The network client ID.
 * @param txParams - The transaction parameters.
 * @param delegationAddress - The delegation address of the sender to mock.
 * @returns The estimated gas as a hex string.
 */
async function estimateGasNode(
  messenger: TransactionControllerMessenger,
  networkClientId: NetworkClientId,
  txParams: TransactionParams,
  delegationAddress?: Hex,
): Promise<Hex> {
  const { from } = txParams;
  const params = [txParams] as Json[];

  if (delegationAddress) {
    params.push('latest');

    params.push({
      [from]: {
        code: DELEGATION_PREFIX + remove0x(delegationAddress),
      },
    });
  }

  return (await rpcRequest({
    messenger,
    networkClientId,
    method: 'eth_estimateGas',
    params,
  })) as Hex;
}
