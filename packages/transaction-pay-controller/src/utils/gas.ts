import { toHex } from '@metamask/controller-utils';
import type { GasFeeEstimates } from '@metamask/gas-fee-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { getNativeToken, getTokenFiatRate } from './token';
import type { TransactionPayControllerMessenger } from '..';
import type { FiatValue } from '../types';

/**
 *
 * Calculate the estimated gas cost for a given transaction in fiat.
 *
 * @param transaction - Transaction to calculate gas cost for
 * @param messenger - Controller messenger.
 * @returns Estimated gas cost for the transaction.
 */
export function calculateTransactionGasCost(
  transaction: TransactionMeta,
  messenger: TransactionPayControllerMessenger,
): FiatValue {
  const { chainId, gasUsed, gasLimitNoBuffer, txParams } = transaction;
  const { gas, maxFeePerGas, maxPriorityFeePerGas } = txParams;
  const finalGas = gasUsed || gasLimitNoBuffer || gas || '0x0';

  return calculateGasCost({
    chainId,
    gas: finalGas,
    maxFeePerGas,
    maxPriorityFeePerGas,
    messenger,
  });
}

/**
 * Calculate the gas cost for the specified parameters.
 *
 * @param request - Gas cost calculation parameters.
 * @param request.chainId - ID of the chain.
 * @param request.gas - Amount of gas the transaction will use.
 * @param request.maxFeePerGas - Max fee to pay per gas.
 * @param request.maxPriorityFeePerGas - Max priority fee to pay per gas.
 * @param request.messenger - Controller messenger.
 * @returns Estimated gas cost for the transaction.
 */
export function calculateGasCost(request: {
  chainId: number | Hex;
  gas: BigNumber.Value;
  maxFeePerGas?: BigNumber.Value;
  maxPriorityFeePerGas?: BigNumber.Value;
  messenger: TransactionPayControllerMessenger;
}): FiatValue {
  const {
    chainId: chainIdInput,
    gas,
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

  const maxFeePerGas = maxFeePerGasInput || maxFeePerGasEstimate;

  const maxPriorityFeePerGas =
    maxPriorityFeePerGasInput || maxPriorityFeePerGasEstimate;

  const feePerGas =
    estimatedBaseFee && maxPriorityFeePerGas
      ? new BigNumber(estimatedBaseFee).plus(maxPriorityFeePerGas)
      : new BigNumber(maxFeePerGas || '0x0');

  const gasCostNative = new BigNumber(gas)
    .multipliedBy(feePerGas)
    .shiftedBy(-18);

  const fiatRate = getTokenFiatRate(
    messenger,
    getNativeToken(chainId),
    chainId,
  );

  if (!fiatRate) {
    throw new Error('Could not fetch fiat rate for native token');
  }

  const usd = gasCostNative.multipliedBy(fiatRate.usdRate).toString(10);
  const fiat = gasCostNative.multipliedBy(fiatRate.fiatRate).toString(10);

  return {
    usd,
    fiat,
  };
}

/**
 * Get gas fee estimates for a given chain.
 *
 * @param chainId - Chain ID.
 * @param messenger - Controller messenger.
 * @returns Gas fee estimates for the chain.
 */
function getGasFee(chainId: Hex, messenger: TransactionPayControllerMessenger) {
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
