import type { TokenAmountValues, TxData } from '@metamask/bridge-controller';
import { toHex } from '@metamask/controller-utils';
import type {
  GasFeeEstimates,
  GasFeeState,
} from '@metamask/gas-fee-controller';
import type {
  FeeMarketGasFeeEstimates,
  TransactionController,
  TransactionReceipt,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import type {
  BridgeHistoryItem,
  BridgeStatusControllerMessenger,
} from '../types';

const getTransaction1559GasFeeEstimates = (
  txGasFeeEstimates: FeeMarketGasFeeEstimates,
  estimatedBaseFee: string,
) => {
  const { maxFeePerGas, maxPriorityFeePerGas } = txGasFeeEstimates?.high ?? {};

  const baseAndPriorityFeePerGas = maxPriorityFeePerGas
    ? new BigNumber(estimatedBaseFee, 10)
        .times(10 ** 9)
        .plus(maxPriorityFeePerGas, 16)
    : undefined;

  return {
    baseAndPriorityFeePerGas,
    maxFeePerGas,
    maxPriorityFeePerGas,
  };
};

/**
 * Get the gas fee estimates for a transaction
 *
 * @param params - The parameters for the gas fee estimates
 * @param params.txGasFeeEstimates - The gas fee estimates for the transaction (TransactionController)
 * @param params.networkGasFeeEstimates - The gas fee estimates for the network (GasFeeController)
 * @returns The gas fee estimates for the transaction
 */
export const getTxGasEstimates = ({
  txGasFeeEstimates,
  networkGasFeeEstimates,
}: {
  txGasFeeEstimates: Awaited<
    ReturnType<TransactionController['estimateGasFee']>
  >['estimates'];
  networkGasFeeEstimates: GasFeeState['gasFeeEstimates'];
}) => {
  const { estimatedBaseFee = '0' } = networkGasFeeEstimates as GasFeeEstimates;
  return getTransaction1559GasFeeEstimates(
    txGasFeeEstimates as unknown as FeeMarketGasFeeEstimates,
    estimatedBaseFee,
  );
};

export const calculateGasFees = async (
  disable7702: boolean,
  messagingSystem: BridgeStatusControllerMessenger,
  estimateGasFeeFn: typeof TransactionController.prototype.estimateGasFee,
  { chainId: _, gasLimit, ...trade }: TxData,
  networkClientId: string,
  chainId: Hex,
  txFee?: { maxFeePerGas: string; maxPriorityFeePerGas: string },
) => {
  if (!disable7702) {
    return {};
  }
  if (txFee) {
    return { ...txFee, gas: gasLimit?.toString() };
  }
  const transactionParams = {
    ...trade,
    gas: gasLimit?.toString(),
    data: trade.data as `0x${string}`,
    to: trade.to as `0x${string}`,
    value: trade.value as `0x${string}`,
  };
  const { gasFeeEstimates } = messagingSystem.call('GasFeeController:getState');
  const { estimates: txGasFeeEstimates } = await estimateGasFeeFn({
    transactionParams,
    chainId,
    networkClientId,
  });
  const { maxFeePerGas, maxPriorityFeePerGas } = getTxGasEstimates({
    networkGasFeeEstimates: gasFeeEstimates,
    txGasFeeEstimates,
  });
  const maxGasLimit = toHex(transactionParams.gas ?? 0);

  return {
    maxFeePerGas,
    maxPriorityFeePerGas,
    gas: maxGasLimit,
  };
};

const calcGasInHexWei = (gasLimit?: string, gasPrice?: string) => {
  return gasLimit && gasPrice
    ? new BigNumber(gasLimit, 16).times(new BigNumber(gasPrice, 16))
    : null;
};

export const calcActualGasUsed = (
  { pricingData }: BridgeHistoryItem,
  txReceipt?: TransactionReceipt,
  approvalTxReceipt?: TransactionReceipt,
): Omit<TokenAmountValues, 'valueInCurrency'> | null => {
  const usdExchangeRate =
    pricingData?.quotedGasInUsd && pricingData?.quotedGasAmount
      ? new BigNumber(pricingData?.quotedGasInUsd).div(
          pricingData.quotedGasAmount,
        )
      : null;

  const actualGasInHexWei = calcGasInHexWei(
    txReceipt?.gasUsed,
    txReceipt?.effectiveGasPrice,
  )?.plus(
    calcGasInHexWei(
      approvalTxReceipt?.gasUsed,
      approvalTxReceipt?.effectiveGasPrice,
    ) ?? 0,
  );

  const actualGasInDecEth = actualGasInHexWei
    ?.div(new BigNumber(10).pow(18))
    .toString(10);

  return actualGasInHexWei && actualGasInDecEth
    ? {
        amount: actualGasInHexWei.toString(10),
        usd:
          usdExchangeRate?.multipliedBy(actualGasInDecEth).toString(10) ?? null,
      }
    : null;
};
