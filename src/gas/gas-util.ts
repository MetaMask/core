import { BN } from 'ethereumjs-util';
import { query, handleFetch } from '../util';
import {
  GasFeeEstimates,
  LegacyGasPriceEstimate,
  EstimatedGasFeeTimeBounds,
  unknownString,
} from './GasFeeController';

const GAS_FEE_API = 'http://127.0.0.1:3000';

export async function fetchGasEstimates(): Promise<GasFeeEstimates> {
  return await handleFetch(GAS_FEE_API);
}

export async function fetchLegacyGasPriceEstimate(
  ethQuery: any,
): Promise<LegacyGasPriceEstimate> {
  const gasPrice = await query(ethQuery, 'gasPrice');
  return {
    gasPrice,
  };
}

function gweiHexToWEIBN(n: any) {
  const BN_1000 = new BN(1000, 10);
  return new BN(n, 16).mul(BN_1000);
}

export function calculateTimeEstimate(
  maxPriorityFeePerGas: string,
  maxFeePerGas: string,
  gasFeeEstimates: GasFeeEstimates,
): EstimatedGasFeeTimeBounds {
  const { low, medium, high, estimatedBaseFee } = gasFeeEstimates;

  const maxPriorityFeePerGasInWEI = gweiHexToWEIBN(maxPriorityFeePerGas);
  const maxFeePerGasInWEI = gweiHexToWEIBN(maxFeePerGas);
  const estimatedBaseFeeInWEI = gweiHexToWEIBN(estimatedBaseFee);

  const effectiveMaxPriorityFee = BN.min(
    maxPriorityFeePerGasInWEI,
    maxFeePerGasInWEI.sub(estimatedBaseFeeInWEI),
  );

  const lowMaxPriorityFeeInWEI = gweiHexToWEIBN(
    low.suggestedMaxPriorityFeePerGas,
  );
  const mediumMaxPriorityFeeInWEI = gweiHexToWEIBN(
    medium.suggestedMaxPriorityFeePerGas,
  );
  const highMaxPriorityFeeInWEI = gweiHexToWEIBN(
    high.suggestedMaxPriorityFeePerGas,
  );

  let lowerTimeBound;
  let upperTimeBound;

  if (effectiveMaxPriorityFee.lt(lowMaxPriorityFeeInWEI)) {
    lowerTimeBound = null;
    upperTimeBound = 'unknown' as unknownString;
  } else if (
    effectiveMaxPriorityFee.gte(lowMaxPriorityFeeInWEI) &&
    effectiveMaxPriorityFee.lt(mediumMaxPriorityFeeInWEI)
  ) {
    lowerTimeBound = low.minWaitTimeEstimate;
    upperTimeBound = low.maxWaitTimeEstimate;
  } else if (
    effectiveMaxPriorityFee.gte(mediumMaxPriorityFeeInWEI) &&
    effectiveMaxPriorityFee.lt(highMaxPriorityFeeInWEI)
  ) {
    lowerTimeBound = medium.minWaitTimeEstimate;
    upperTimeBound = medium.maxWaitTimeEstimate;
  } else if (effectiveMaxPriorityFee.eq(highMaxPriorityFeeInWEI)) {
    lowerTimeBound = high.minWaitTimeEstimate;
    upperTimeBound = high.maxWaitTimeEstimate;
  } else {
    lowerTimeBound = 0;
    upperTimeBound = high.maxWaitTimeEstimate;
  }

  return {
    lowerTimeBound,
    upperTimeBound,
  };
}
