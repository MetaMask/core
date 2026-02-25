import { toHex } from '@metamask/controller-utils';
import type { GasFeeEstimates } from '@metamask/gas-fee-controller';
import type {
  GasFeeToken,
  TransactionMeta,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { getGasBuffer, getRelayFallbackGas } from './feature-flags';
import { getNativeToken, getTokenBalance, getTokenFiatRate } from './token';
import type { TransactionPayControllerMessenger } from '..';
import { createModuleLogger, projectLogger } from '../logger';
import type { Amount } from '../types';

const log = createModuleLogger(projectLogger, 'gas');

/**
 *
 * Calculate the estimated gas cost for a given transaction in fiat.
 *
 * @param transaction - Transaction to calculate gas cost for
 * @param messenger - Controller messenger.
 * @param options - Calculation options.
 * @param options.isMax - Whether to calculate the maximum fee.
 * @returns Estimated gas cost for the transaction.
 */
export function calculateTransactionGasCost(
  transaction: TransactionMeta,
  messenger: TransactionPayControllerMessenger,
  { isMax }: { isMax?: boolean } = {},
): Amount & { isGasFeeToken?: boolean } {
  const {
    chainId,
    gasUsed: gasUsedOriginal,
    gasLimitNoBuffer,
    txParams,
  } = transaction;

  const { from, gas, maxFeePerGas, maxPriorityFeePerGas } = txParams;
  const gasUsed = isMax ? undefined : gasUsedOriginal;
  const finalGas = gasUsed ?? gasLimitNoBuffer ?? gas ?? '0x0';

  const result = calculateGasCost({
    chainId,
    gas: finalGas,
    isMax,
    maxFeePerGas,
    maxPriorityFeePerGas,
    messenger,
  });

  const max = calculateGasCost({
    chainId,
    gas: finalGas,
    isMax: true,
    messenger,
  });

  const nativeBalance = getTokenBalance(
    messenger,
    from as Hex,
    chainId,
    getNativeToken(chainId),
  );

  const hasBalance = new BigNumber(nativeBalance).gte(max.raw);

  const gasFeeTokenCost = calculateTransactionGasFeeTokenCost({
    hasBalance,
    messenger,
    transaction,
  });

  if (gasFeeTokenCost) {
    return gasFeeTokenCost;
  }

  return result;
}

/**
 * Calculate the gas cost for the specified parameters.
 *
 * @param request - Gas cost calculation parameters.
 * @param request.chainId - ID of the chain.
 * @param request.gas - Amount of gas the transaction will use.
 * @param request.isMax - Whether to calculate the maximum fee.
 * @param request.maxFeePerGas - Max fee to pay per gas.
 * @param request.maxPriorityFeePerGas - Max priority fee to pay per gas.
 * @param request.messenger - Controller messenger.
 
 * @returns Estimated gas cost for the transaction.
 */
export function calculateGasCost(request: {
  chainId: number | Hex;
  gas: BigNumber.Value;
  isMax?: boolean;
  maxFeePerGas?: BigNumber.Value;
  maxPriorityFeePerGas?: BigNumber.Value;
  messenger: TransactionPayControllerMessenger;
}): Amount {
  const {
    chainId: chainIdInput,
    gas,
    isMax,
    maxFeePerGas: maxFeePerGasInput,
    maxPriorityFeePerGas: maxPriorityFeePerGasInput,
    messenger,
  } = request;

  const chainId = toHex(chainIdInput);

  const {
    estimatedBaseFee,
    maxFeePerGas: maxFeePerGasEstimate,
    maxPriorityFeePerGas: maxPriorityFeePerGasEstimate,
  } = getGasFee(chainId, messenger);

  const maxFeePerGas = maxFeePerGasInput ?? maxFeePerGasEstimate;

  const maxPriorityFeePerGas =
    maxPriorityFeePerGasInput ?? maxPriorityFeePerGasEstimate;

  const feePerGas =
    estimatedBaseFee && maxPriorityFeePerGas && !isMax
      ? new BigNumber(estimatedBaseFee).plus(maxPriorityFeePerGas)
      : new BigNumber(maxFeePerGas ?? '0x0');

  const rawValue = new BigNumber(gas).multipliedBy(feePerGas);
  const raw = rawValue.toString(10);

  const humanValue = rawValue.shiftedBy(-18);
  const human = humanValue.toString(10);

  const fiatRate = getTokenFiatRate(
    messenger,
    getNativeToken(chainId),
    chainId,
  );

  if (!fiatRate) {
    throw new Error('Could not fetch fiat rate for native token');
  }

  const usd = humanValue.multipliedBy(fiatRate.usdRate).toString(10);
  const fiat = humanValue.multipliedBy(fiatRate.fiatRate).toString(10);

  return {
    fiat,
    human,
    raw,
    usd,
  };
}

/**
 * Calculate the cost of a gas fee token on a transaction.
 *
 * @param request - Request parameters.
 * @param request.chainId - Chain ID.
 * @param request.gasFeeToken - Gas fee token to calculate cost for.
 * @param request.messenger - Controller messenger.
 * @returns Cost of the gas fee token.
 */
export function calculateGasFeeTokenCost({
  chainId,
  gasFeeToken,
  messenger,
}: {
  chainId: Hex;
  gasFeeToken: GasFeeToken;
  messenger: TransactionPayControllerMessenger;
}): (Amount & { isGasFeeToken?: boolean }) | undefined {
  const { amount, decimals, tokenAddress } = gasFeeToken;

  const tokenFiatRate = getTokenFiatRate(messenger, tokenAddress, chainId);

  if (!tokenFiatRate) {
    log('Cannot get gas fee token info');
    return undefined;
  }

  const rawValue = new BigNumber(amount);
  const raw = rawValue.toString(10);

  const humanValue = rawValue.shiftedBy(-decimals);
  const human = humanValue.toString(10);

  const fiat = humanValue.multipliedBy(tokenFiatRate.fiatRate).toString(10);
  const usd = humanValue.multipliedBy(tokenFiatRate.usdRate).toString(10);

  return {
    isGasFeeToken: true,
    fiat,
    human,
    raw,
    usd,
  };
}

export async function estimateGasLimitWithBufferOrFallback({
  chainId,
  data,
  fallbackOnSimulationFailure = false,
  from,
  messenger,
  to,
  value,
}: {
  chainId: Hex;
  data: Hex;
  fallbackOnSimulationFailure?: boolean;
  from: Hex;
  messenger: TransactionPayControllerMessenger;
  to: Hex;
  value?: Hex;
}): Promise<{
  estimate: number;
  max: number;
  usedFallback: boolean;
  error?: unknown;
}> {
  const gasBuffer = getGasBuffer(messenger, chainId);
  const networkClientId = messenger.call(
    'NetworkController:findNetworkClientIdByChainId',
    chainId,
  );

  let estimateGasError: unknown;
  let simulationError: Error | undefined;

  try {
    const { gas: gasHex, simulationFails } = await messenger.call(
      'TransactionController:estimateGas',
      { from, data, to, value: value ?? '0x0' },
      networkClientId,
    );

    if (simulationFails) {
      simulationError = new Error('Gas simulation failed');
    } else {
      const estimatedGas = parseEstimatedGas(gasHex);
      const bufferedGas = Math.ceil(estimatedGas * gasBuffer);

      return {
        estimate: bufferedGas,
        max: bufferedGas,
        usedFallback: false,
      };
    }
  } catch (caughtError) {
    estimateGasError = caughtError;
  }

  if (simulationError !== undefined && !fallbackOnSimulationFailure) {
    throw simulationError;
  }

  const fallbackGas = getRelayFallbackGas(messenger);

  return {
    estimate: fallbackGas.estimate,
    max: fallbackGas.max,
    usedFallback: true,
    error: estimateGasError ?? simulationError,
  };
}

function parseEstimatedGas(gasValue: string): number {
  const parsedGas = gasValue.startsWith('0x')
    ? new BigNumber(gasValue.slice(2), 16)
    : new BigNumber(gasValue);

  if (!parsedGas.isFinite() || parsedGas.isNaN()) {
    throw new Error(`Invalid gas estimate returned: ${gasValue}`);
  }

  return parsedGas.toNumber();
}

/**
 * Get gas fee estimates for a given chain.
 *
 * @param chainId - Chain ID.
 * @param messenger - Controller messenger.
 * @returns Gas fee estimates for the chain.
 */
function getGasFee(
  chainId: Hex,
  messenger: TransactionPayControllerMessenger,
): {
  estimatedBaseFee: string | undefined;
  maxFeePerGas: string | undefined;
  maxPriorityFeePerGas: string | undefined;
} {
  const gasFeeControllerState = messenger.call('GasFeeController:getState');

  const chainState = gasFeeControllerState?.gasFeeEstimatesByChainId?.[chainId];

  const { estimatedBaseFee: estimatedBaseFeeGwei, medium } =
    (chainState?.gasFeeEstimates as GasFeeEstimates | undefined) ?? {};

  const maxFeePerGasGwei = medium?.suggestedMaxFeePerGas;
  const maxPriorityFeePerGasGwei = medium?.suggestedMaxPriorityFeePerGas;

  const estimatedBaseFee = estimatedBaseFeeGwei
    ? new BigNumber(estimatedBaseFeeGwei).shiftedBy(9).toString(10)
    : undefined;

  const maxFeePerGas = maxFeePerGasGwei
    ? new BigNumber(maxFeePerGasGwei).shiftedBy(9).toString(10)
    : undefined;

  const maxPriorityFeePerGas = maxPriorityFeePerGasGwei
    ? new BigNumber(maxPriorityFeePerGasGwei).shiftedBy(9).toString(10)
    : undefined;

  return { estimatedBaseFee, maxFeePerGas, maxPriorityFeePerGas };
}

/**
 * Calculate the cost of a gas fee token on a transaction.
 *
 * @param request - Request parameters.
 * @param request.hasBalance - Whether the user has enough balance to cover the gas fee.
 * @param request.messenger - Controller messenger.
 * @param request.transaction - Transaction to calculate gas fee token cost for.
 * @returns Cost of the gas fee token.
 */
function calculateTransactionGasFeeTokenCost({
  hasBalance,
  messenger,
  transaction,
}: {
  hasBalance: boolean;
  messenger: TransactionPayControllerMessenger;
  transaction: TransactionMeta;
}): (Amount & { isGasFeeToken?: boolean }) | undefined {
  const {
    chainId,
    gasFeeTokens,
    isGasFeeTokenIgnoredIfBalance,
    selectedGasFeeToken,
  } = transaction;

  if (
    !gasFeeTokens ||
    !selectedGasFeeToken ||
    (isGasFeeTokenIgnoredIfBalance && hasBalance)
  ) {
    return undefined;
  }

  log('Calculating gas fee token cost', { selectedGasFeeToken, chainId });

  const gasFeeToken = gasFeeTokens?.find(
    (singleGasFeeToken) =>
      singleGasFeeToken.tokenAddress.toLowerCase() ===
      selectedGasFeeToken.toLowerCase(),
  );

  if (!gasFeeToken) {
    log('Gas fee token not found', {
      gasFeeTokens,
      selectedGasFeeToken,
    });

    return undefined;
  }

  return calculateGasFeeTokenCost({
    chainId,
    gasFeeToken,
    messenger,
  });
}
