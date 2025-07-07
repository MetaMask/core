import type {
  EstimatedGasFeeTimeBounds,
  EthGasPriceEstimate,
  GasFeeEstimates,
  GasFeeState as GasFeeCalculations,
  LegacyGasPriceEstimate,
} from './GasFeeController';
import { GAS_ESTIMATE_TYPES } from './GasFeeController';

type DetermineGasFeeCalculationsRequest = {
  isEIP1559Compatible: boolean;
  isLegacyGasAPICompatible: boolean;
  fetchGasEstimates: (
    url: string,
    clientId?: string,
  ) => Promise<GasFeeEstimates>;
  fetchGasEstimatesUrl: string;
  fetchLegacyGasPriceEstimates: (
    url: string,
    clientId?: string,
  ) => Promise<LegacyGasPriceEstimate>;
  fetchLegacyGasPriceEstimatesUrl: string;
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fetchEthGasPriceEstimate: (ethQuery: any) => Promise<EthGasPriceEstimate>;
  calculateTimeEstimate: (
    maxPriorityFeePerGas: string,
    maxFeePerGas: string,
    gasFeeEstimates: GasFeeEstimates,
  ) => EstimatedGasFeeTimeBounds;
  clientId: string | undefined;
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ethQuery: any;
  nonRPCGasFeeApisDisabled?: boolean;
};

/**
 * Obtains a set of max base and priority fee estimates along with time estimates so that we
 * can present them to users when they are sending transactions or making swaps.
 *
 * @param args - The arguments.
 * @param args.isEIP1559Compatible - Governs whether or not we can use an EIP-1559-only method to
 * produce estimates.
 * @param args.isLegacyGasAPICompatible - Governs whether or not we can use a non-EIP-1559 method to
 * produce estimates (for instance, testnets do not support estimates altogether).
 * @param args.fetchGasEstimates - A function that fetches gas estimates using an EIP-1559-specific
 * API.
 * @param args.fetchGasEstimatesUrl - The URL for the API we can use to obtain EIP-1559-specific
 * estimates.
 * @param args.fetchLegacyGasPriceEstimates - A function that fetches gas estimates using an
 * non-EIP-1559-specific API.
 * @param args.fetchLegacyGasPriceEstimatesUrl - The URL for the API we can use to obtain
 * non-EIP-1559-specific estimates.
 * @param args.fetchEthGasPriceEstimate - A function that fetches gas estimates using
 * `eth_gasPrice`.
 * @param args.calculateTimeEstimate - A function that determine time estimate bounds.
 * @param args.clientId - An identifier that an API can use to know who is asking for estimates.
 * @param args.ethQuery - An EthQuery instance we can use to talk to Ethereum directly.
 * @param args.nonRPCGasFeeApisDisabled - Whether to disable requests to the legacyAPIEndpoint and the EIP1559APIEndpoint
 * @returns The gas fee calculations.
 */
export default async function determineGasFeeCalculations(
  args: DetermineGasFeeCalculationsRequest,
): Promise<GasFeeCalculations> {
  try {
    return await getEstimatesUsingFallbacks(args);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Gas fee/price estimation failed. Message: ${error.message}`,
      );
    }

    throw error;
  }
}

/**
 * Retrieve the gas fee estimates using a series of fallback mechanisms.
 * @param request - The request object.
 * @returns The gas fee estimates.
 */
async function getEstimatesUsingFallbacks(
  request: DetermineGasFeeCalculationsRequest,
): Promise<GasFeeCalculations> {
  const {
    isEIP1559Compatible,
    isLegacyGasAPICompatible,
    nonRPCGasFeeApisDisabled,
  } = request;

  try {
    if (isEIP1559Compatible && !nonRPCGasFeeApisDisabled) {
      return await getEstimatesUsingFeeMarketEndpoint(request);
    }

    if (isLegacyGasAPICompatible && !nonRPCGasFeeApisDisabled) {
      return await getEstimatesUsingLegacyEndpoint(request);
    }

    throw new Error('Main gas fee/price estimation failed. Use fallback');
  } catch {
    return await getEstimatesUsingProvider(request);
  }
}

/**
 * Retrieve gas fee estimates using the EIP-1559 endpoint of the gas API.
 * @param request - The request object.
 * @returns The gas fee estimates.
 */
async function getEstimatesUsingFeeMarketEndpoint(
  request: DetermineGasFeeCalculationsRequest,
): Promise<GasFeeCalculations> {
  const {
    fetchGasEstimates,
    fetchGasEstimatesUrl,
    clientId,
    calculateTimeEstimate,
  } = request;

  const estimates = await fetchGasEstimates(fetchGasEstimatesUrl, clientId);

  const { suggestedMaxPriorityFeePerGas, suggestedMaxFeePerGas } =
    estimates.medium;

  const estimatedGasFeeTimeBounds = calculateTimeEstimate(
    suggestedMaxPriorityFeePerGas,
    suggestedMaxFeePerGas,
    estimates,
  );

  return {
    gasFeeEstimates: estimates,
    estimatedGasFeeTimeBounds,
    gasEstimateType: GAS_ESTIMATE_TYPES.FEE_MARKET,
  };
}

/**
 * Retrieve gas fee estimates using the legacy endpoint of the gas API.
 * @param request - The request object.
 * @returns The gas fee estimates.
 */
async function getEstimatesUsingLegacyEndpoint(
  request: DetermineGasFeeCalculationsRequest,
): Promise<GasFeeCalculations> {
  const {
    fetchLegacyGasPriceEstimates,
    fetchLegacyGasPriceEstimatesUrl,
    clientId,
  } = request;

  const estimates = await fetchLegacyGasPriceEstimates(
    fetchLegacyGasPriceEstimatesUrl,
    clientId,
  );

  return {
    gasFeeEstimates: estimates,
    estimatedGasFeeTimeBounds: {},
    gasEstimateType: GAS_ESTIMATE_TYPES.LEGACY,
  };
}

/**
 * Retrieve gas fee estimates using an `eth_gasPrice` call to the RPC provider.
 * @param request - The request object.
 * @returns The gas fee estimates.
 */
async function getEstimatesUsingProvider(
  request: DetermineGasFeeCalculationsRequest,
): Promise<GasFeeCalculations> {
  const { ethQuery, fetchEthGasPriceEstimate } = request;

  const estimates = await fetchEthGasPriceEstimate(ethQuery);

  return {
    gasFeeEstimates: estimates,
    estimatedGasFeeTimeBounds: {},
    gasEstimateType: GAS_ESTIMATE_TYPES.ETH_GASPRICE,
  };
}
