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

/**
 * Convert a decimal GWEI value to a decimal string rounded to the nearest WEI.
 *
 * @param n - The input GWEI amount, as a decimal string or a number.
 * @returns The decimal string GWEI amount.
 */
export function normalizeGWEIDecimalNumbers(n: string | number) {
  const numberAsWEIHex = gweiDecToWEIBN(n).toString(16);
  const numberAsGWEI = weiHexToGweiDec(numberAsWEIHex).toString(10);
  return numberAsGWEI;
}

/**
 * Fetch gas estimates from the given URL.
 *
 * @param url - The gas estimate URL.
 * @param clientId - The client ID used to identify to the API who is asking for estimates.
 * @returns The gas estimates.
 */
export async function fetchGasEstimates(
  url: string,
  clientId?: string,
): Promise<GasFeeEstimates> {
  const estimates = await handleFetch(
    url,
    clientId ? { headers: makeClientIdHeader(clientId) } : undefined,
  );
  return {
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
    estimatedBaseFee: normalizeGWEIDecimalNumbers(estimates.estimatedBaseFee),
    networkCongestion: estimates.networkCongestion,
  };
}

/**
 * Hit the legacy MetaSwaps gasPrices estimate api and return the low, medium
 * high values from that API.
 *
 * @param url - The URL to fetch gas price estimates from.
 * @param clientId - The client ID used to identify to the API who is asking for estimates.
 * @returns The gas price estimates.
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

/**
 * Get a gas price estimate from the network using the `eth_gasPrice` method.
 *
 * @param ethQuery - The EthQuery instance to call the network with.
 * @returns A gas price estimate.
 */
export async function fetchEthGasPriceEstimate(
  ethQuery: any,
): Promise<EthGasPriceEstimate> {
  const gasPrice = await query(ethQuery, 'gasPrice');
  return {
    gasPrice: weiHexToGweiDec(gasPrice).toString(),
  };
}

/**
 * Estimate the time it will take for a transaction to be confirmed.
 *
 * @param maxPriorityFeePerGas - The max priority fee per gas.
 * @param maxFeePerGas - The max fee per gas.
 * @param gasFeeEstimates - The gas fee estimates.
 * @returns The estimated lower and upper bounds for when this transaction will be confirmed.
 */
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
