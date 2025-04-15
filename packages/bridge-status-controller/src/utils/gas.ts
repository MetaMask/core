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

export const getTxGasEstimates = async ({
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
