import { GasFeeEstimates, EthGasPriceEstimate, EstimatedGasFeeTimeBounds, LegacyGasPriceEstimate } from './GasFeeController';
/**
 * Convert a decimal GWEI value to a decimal string rounded to the nearest WEI.
 *
 * @param n - The input GWEI amount, as a decimal string or a number.
 * @returns The decimal string GWEI amount.
 */
export declare function normalizeGWEIDecimalNumbers(n: string | number): any;
/**
 * Fetch gas estimates from the given URL.
 *
 * @param url - The gas estimate URL.
 * @param clientId - The client ID used to identify to the API who is asking for estimates.
 * @returns The gas estimates.
 */
export declare function fetchGasEstimates(url: string, clientId?: string): Promise<GasFeeEstimates>;
/**
 * Hit the legacy MetaSwaps gasPrices estimate api and return the low, medium
 * high values from that API.
 *
 * @param url - The URL to fetch gas price estimates from.
 * @param clientId - The client ID used to identify to the API who is asking for estimates.
 * @returns The gas price estimates.
 */
export declare function fetchLegacyGasPriceEstimates(url: string, clientId?: string): Promise<LegacyGasPriceEstimate>;
/**
 * Get a gas price estimate from the network using the `eth_gasPrice` method.
 *
 * @param ethQuery - The EthQuery instance to call the network with.
 * @returns A gas price estimate.
 */
export declare function fetchEthGasPriceEstimate(ethQuery: any): Promise<EthGasPriceEstimate>;
/**
 * Estimate the time it will take for a transaction to be confirmed.
 *
 * @param maxPriorityFeePerGas - The max priority fee per gas.
 * @param maxFeePerGas - The max fee per gas.
 * @param gasFeeEstimates - The gas fee estimates.
 * @returns The estimated lower and upper bounds for when this transaction will be confirmed.
 */
export declare function calculateTimeEstimate(maxPriorityFeePerGas: string, maxFeePerGas: string, gasFeeEstimates: GasFeeEstimates): EstimatedGasFeeTimeBounds;
