import type {
  GasFeeEstimates,
  GasFeeState,
} from '@metamask/gas-fee-controller';
import type {
  FeeMarketGasFeeEstimates,
  TransactionController,
} from '@metamask/transaction-controller';
import { BigNumber } from 'bignumber.js';

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
