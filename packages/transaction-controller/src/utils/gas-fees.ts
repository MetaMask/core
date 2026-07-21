import { gweiDecToWEIBN, toHex } from '@metamask/controller-utils';
import type {
  FetchGasFeeEstimateOptions,
  GasFeeState,
} from '@metamask/gas-fee-controller';
import type { Hex } from '@metamask/utils';
import { add0x, createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../logger.js';
import type { TransactionControllerMessenger } from '../TransactionController.js';
import type {
  SavedGasFees,
  TransactionParams,
  TransactionMeta,
  GasFeeFlow,
} from '../types.js';
import {
  GasFeeEstimateLevel,
  GasFeeEstimateType,
  UserFeeLevel,
} from '../types.js';
import { getGasFeeFlow } from './gas-flow.js';
import { rpcRequest } from './provider.js';

export type UpdateGasFeesRequest = {
  eip1559: boolean;
  gasFeeFlows: GasFeeFlow[];
  getGasFeeEstimates: (
    options: FetchGasFeeEstimateOptions,
  ) => Promise<GasFeeState>;
  getSavedGasFees: (
    transactionMeta: TransactionMeta,
  ) => SavedGasFees | undefined;
  messenger: TransactionControllerMessenger;
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

  /**
   * Whether the suggested fee was derived from a specific estimate level,
   * such as `low`/`medium`/`high`. This is `false` for estimate types that
   * do not support per-level pricing, such as a flat `eth_gasPrice` value,
   * or when the gas fee flow failed and a raw RPC fallback was used.
   */
  isEstimateLevelApplied?: boolean;
};

const log = createModuleLogger(projectLogger, 'gas-fees');

/**
 * Update the gas fee properties of the provided transaction meta.
 *
 * @param request - The request object.
 */
export async function updateGasFees(
  request: UpdateGasFeesRequest,
): Promise<void> {
  const { txMeta } = request;
  const initialParams = { ...txMeta.txParams };

  // User-saved (advanced) gas fees only apply to dApp transactions. Internal
  // transactions (e.g. swaps and bridges) have their fees dictated by the
  // aggregator or relay, so applying saved gas fees could underprice them and
  // cause them to fail or get stuck.
  const savedGasFees =
    txMeta.isInternal || hasInitialGasFeeParams(initialParams)
      ? undefined
      : request.getSavedGasFees(txMeta);

  const suggestedGasFees = await getSuggestedGasFees({
    ...request,
    savedGasFees,
  });

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

/**
 * Convert GWEI from decimal string to WEI as hex string.
 *
 * @param value - The GWEI value as a decimal string.
 * @returns The WEI value in hex.
 */
export function gweiDecimalToWeiHex(value: string): Hex {
  return toHex(gweiDecToWEIBN(value));
}

/**
 * Converts a value from Gwei decimal representation to Wei decimal representation
 *
 * @param gweiDecimal - The value in Gwei as a string or number
 * @returns The value in Wei as a string
 *
 * @example
 * // Convert 1.5 Gwei to Wei
 * gweiDecimalToWeiDecimal("1.5")
 * // Returns "1500000000"
 */
export function gweiDecimalToWeiDecimal(gweiDecimal: string | number): string {
  const weiValue = Number(gweiDecimal) * 1e9;

  return weiValue.toString().split('.')[0];
}

/**
 * Determine the maxFeePerGas value for the transaction.
 *
 * @param request - The request object.
 * @returns The maxFeePerGas value.
 */
function getMaxFeePerGas(request: GetGasFeeRequest): string | undefined {
  const { savedGasFees, eip1559, initialParams, suggestedGasFees } = request;

  if (!eip1559) {
    return undefined;
  }

  if (savedGasFees?.maxBaseFee) {
    const maxFeePerGas = gweiDecimalToWeiHex(savedGasFees.maxBaseFee);
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

/**
 * Determine the maxPriorityFeePerGas value for the transaction.
 *
 * @param request - The request object.
 * @returns The maxPriorityFeePerGas value.
 */
function getMaxPriorityFeePerGas(
  request: GetGasFeeRequest,
): string | undefined {
  const { eip1559, initialParams, savedGasFees, suggestedGasFees, txMeta } =
    request;

  if (!eip1559) {
    return undefined;
  }

  if (savedGasFees?.priorityFee) {
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

/**
 * Determine the gasPrice value for the transaction.
 *
 * @param request - The request object.
 * @returns The gasPrice value.
 */
function getGasPrice(request: GetGasFeeRequest): string | undefined {
  const { eip1559, initialParams, savedGasFees, suggestedGasFees } = request;

  if (eip1559) {
    return undefined;
  }

  if (savedGasFees?.gasPrice) {
    const gasPrice = gweiDecimalToWeiHex(savedGasFees.gasPrice);
    log('Using gasPrice from savedGasFees.gasPrice', gasPrice);
    return gasPrice;
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

/**
 * Determine the user fee level.
 *
 * @param request - The request object.
 * @returns The user fee level.
 */
function getUserFeeLevel(request: GetGasFeeRequest): string | undefined {
  const { initialParams, savedGasFees, suggestedGasFees, txMeta } = request;

  if (savedGasFees) {
    const hasCustomOverride =
      savedGasFees.maxBaseFee !== undefined ||
      savedGasFees.priorityFee !== undefined ||
      savedGasFees.gasPrice !== undefined;

    const canUseSavedLevel =
      !hasCustomOverride &&
      savedGasFees.level !== undefined &&
      suggestedGasFees.isEstimateLevelApplied;

    // A custom override on any field, or an estimate type that does not
    // support per-level pricing (e.g. a flat eth_gasPrice value), means the
    // fee is no longer purely level-derived, so it must not be tracked as a
    // live estimate level by the gas fee poller, which would otherwise
    // overwrite the override or misrepresent the fee as matching the level.
    return canUseSavedLevel ? savedGasFees.level : UserFeeLevel.CUSTOM;
  }

  if (
    !initialParams.maxFeePerGas &&
    !initialParams.maxPriorityFeePerGas &&
    initialParams.gasPrice
  ) {
    return txMeta.isInternal
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

  if (
    !initialParams.maxFeePerGas &&
    !initialParams.maxPriorityFeePerGas &&
    suggestedGasFees.gasPrice
  ) {
    return UserFeeLevel.MEDIUM;
  }

  if (txMeta.isInternal) {
    return UserFeeLevel.MEDIUM;
  }

  return UserFeeLevel.DAPP_SUGGESTED;
}

/**
 * Update the default gas estimates for the provided transaction.
 *
 * @param txMeta - The transaction metadata.
 */
function updateDefaultGasEstimates(txMeta: TransactionMeta): void {
  txMeta.defaultGasEstimates ??= {};
  txMeta.defaultGasEstimates.maxFeePerGas = txMeta.txParams.maxFeePerGas;

  txMeta.defaultGasEstimates.maxPriorityFeePerGas =
    txMeta.txParams.maxPriorityFeePerGas;

  txMeta.defaultGasEstimates.gasPrice = txMeta.txParams.gasPrice;
  txMeta.defaultGasEstimates.estimateType = txMeta.userFeeLevel;
}

/**
 * Retrieve the suggested gas fees using the gas fee flows.
 *
 * @param request - The request object.
 * @returns The suggested gas fees.
 */
async function getSuggestedGasFees(
  request: UpdateGasFeesRequest & { savedGasFees?: SavedGasFees },
): Promise<SuggestedGasFees> {
  const {
    eip1559,
    gasFeeFlows,
    getGasFeeEstimates,
    messenger,
    savedGasFees,
    txMeta,
  } = request;
  const { networkClientId } = txMeta;

  if (
    (!eip1559 && txMeta.txParams.gasPrice) ||
    (eip1559 &&
      txMeta.txParams.maxFeePerGas &&
      txMeta.txParams.maxPriorityFeePerGas)
  ) {
    return {};
  }

  const gasFeeFlow = getGasFeeFlow(
    txMeta,
    gasFeeFlows,
    messenger,
  ) as GasFeeFlow;

  try {
    const gasFeeControllerData = await getGasFeeEstimates({ networkClientId });

    const response = await gasFeeFlow.getGasFees({
      gasFeeControllerData,
      messenger,
      transactionMeta: txMeta,
    });

    const gasFeeEstimateType = response.estimates?.type;
    const savedGasFeeEstimateLevel = getSavedGasFeeEstimateLevel(savedGasFees);

    switch (gasFeeEstimateType) {
      case GasFeeEstimateType.FeeMarket:
        return {
          ...(response.estimates[savedGasFeeEstimateLevel] ??
            response.estimates.medium),
          isEstimateLevelApplied: true,
        };
      case GasFeeEstimateType.Legacy:
        return {
          gasPrice:
            response.estimates[savedGasFeeEstimateLevel] ??
            response.estimates.medium,
          isEstimateLevelApplied: true,
        };
      case GasFeeEstimateType.GasPrice:
        return {
          gasPrice: response.estimates.gasPrice,
          isEstimateLevelApplied: false,
        };
      default:
        throw new Error(
          `Unsupported gas fee estimate type returned from flow: ${String(gasFeeEstimateType)}`,
        );
    }
  } catch (error) {
    log('Failed to get suggested gas fees', error);
  }

  const gasPriceHex = (await rpcRequest({
    messenger,
    networkClientId,
    method: 'eth_gasPrice',
  })) as Hex | undefined;

  const gasPrice = gasPriceHex ? add0x(gasPriceHex) : undefined;

  return { gasPrice };
}

function hasInitialGasFeeParams(initialParams: TransactionParams): boolean {
  return [
    initialParams.maxFeePerGas,
    initialParams.maxPriorityFeePerGas,
    initialParams.gasPrice,
  ].some(Boolean);
}

function getSavedGasFeeEstimateLevel(
  savedGasFees: SavedGasFees | undefined,
): GasFeeEstimateLevel {
  return isGasFeeEstimateLevel(savedGasFees?.level)
    ? savedGasFees.level
    : GasFeeEstimateLevel.Medium;
}

function isGasFeeEstimateLevel(level: unknown): level is GasFeeEstimateLevel {
  return Object.values(GasFeeEstimateLevel).includes(
    level as GasFeeEstimateLevel,
  );
}
