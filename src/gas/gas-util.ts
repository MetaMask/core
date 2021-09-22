import { BN } from 'ethereumjs-util';
import { query, handleFetch, gweiDecToWEIBN, weiHexToGweiDec } from '../util';
import {
  GasFeeEstimates,
  EthGasPriceEstimate,
  EstimatedGasFeeTimeBounds,
  unknownString,
  LegacyGasPriceEstimate,
} from './GasFeeController';

const makeClientIdHeader = (clientId: string) => ({ 'X-Client-Id': clientId });

export function normalizeGWEIDecimalNumbers(n: string | number) {
  const numberAsWEIHex = gweiDecToWEIBN(n).toString(16);
  const numberAsGWEI = weiHexToGweiDec(numberAsWEIHex).toString(10);
  return numberAsGWEI;
}

export async function fetchGasEstimates(
  url: string,
  clientId?: string,
): Promise<GasFeeEstimates> {
  const estimates: GasFeeEstimates = await handleFetch(
    url,
    clientId ? { headers: makeClientIdHeader(clientId) } : undefined,
  );
  const normalizedEstimates: GasFeeEstimates = {
    estimatedBaseFee: normalizeGWEIDecimalNumbers(estimates.estimatedBaseFee),
    low: {
      ...estimates.low,
      suggestedMaxPriorityFeePerGas: normalizeGWEIDecimalNumbers(
        estimates.low.suggestedMaxPriorityFeePerGas,
      ),
      suggestedMaxFeePerGas: normalizeGWEIDecimalNumbers(
        estimates.low.suggestedMaxFeePerGas,
      ),
    },
    medium: {
      ...estimates.medium,
      suggestedMaxPriorityFeePerGas: normalizeGWEIDecimalNumbers(
        estimates.medium.suggestedMaxPriorityFeePerGas,
      ),
      suggestedMaxFeePerGas: normalizeGWEIDecimalNumbers(
        estimates.medium.suggestedMaxFeePerGas,
      ),
    },
    high: {
      ...estimates.high,
      suggestedMaxPriorityFeePerGas: normalizeGWEIDecimalNumbers(
        estimates.high.suggestedMaxPriorityFeePerGas,
      ),
      suggestedMaxFeePerGas: normalizeGWEIDecimalNumbers(
        estimates.high.suggestedMaxFeePerGas,
      ),
    },
  };
  return normalizedEstimates;
}

/**
 * Hit the legacy MetaSwaps gasPrices estimate api and return the low, medium
 * high values from that API.
 */
export async function fetchLegacyGasPriceEstimates(
  url: string,
  clientId?: string,
): Promise<LegacyGasPriceEstimate> {
  const result = await handleFetch(url, {
    referrer: url,
    referrerPolicy: 'no-referrer-when-downgrade',
    method: 'GET',
    mode: 'cors',
    headers: {
      'Content-Type': 'application/json',
      ...(clientId && makeClientIdHeader(clientId)),
    },
  });
  return {
    low: result.SafeGasPrice,
    medium: result.ProposeGasPrice,
    high: result.FastGasPrice,
  };
}

export async function fetchEthGasPriceEstimate(
  ethQuery: any,
): Promise<EthGasPriceEstimate> {
  const gasPrice = await query(ethQuery, 'gasPrice');
  return {
    gasPrice: weiHexToGweiDec(gasPrice).toString(),
  };
}

export function calculateTimeEstimate(
  maxPriorityFeePerGas: string,
  maxFeePerGas: string,
  gasFeeEstimates: GasFeeEstimates,
): EstimatedGasFeeTimeBounds {
  const { low, medium, high, estimatedBaseFee } = gasFeeEstimates;

  const maxPriorityFeePerGasInWEI = gweiDecToWEIBN(maxPriorityFeePerGas);
  const maxFeePerGasInWEI = gweiDecToWEIBN(maxFeePerGas);
  const estimatedBaseFeeInWEI = gweiDecToWEIBN(estimatedBaseFee);

  const effectiveMaxPriorityFee = BN.min(
    maxPriorityFeePerGasInWEI,
    maxFeePerGasInWEI.sub(estimatedBaseFeeInWEI),
  );

  const lowMaxPriorityFeeInWEI = gweiDecToWEIBN(
    low.suggestedMaxPriorityFeePerGas,
  );
  const mediumMaxPriorityFeeInWEI = gweiDecToWEIBN(
    medium.suggestedMaxPriorityFeePerGas,
  );
  const highMaxPriorityFeeInWEI = gweiDecToWEIBN(
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
