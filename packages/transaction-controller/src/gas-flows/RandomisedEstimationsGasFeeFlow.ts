import type {
  LegacyGasPriceEstimate,
  GasFeeEstimates as FeeMarketGasPriceEstimate,
  EthGasPriceEstimate,
} from '@metamask/gas-fee-controller';
import { GAS_ESTIMATE_TYPES } from '@metamask/gas-fee-controller';
import { createModuleLogger, type Hex } from '@metamask/utils';

import { DefaultGasFeeFlow } from './DefaultGasFeeFlow';
import { projectLogger } from '../logger';
import type {
  FeeMarketGasFeeEstimateForLevel,
  FeeMarketGasFeeEstimates,
  GasFeeEstimates,
  GasFeeFlow,
  GasFeeFlowRequest,
  GasFeeFlowResponse,
  GasPriceGasFeeEstimates,
  LegacyGasFeeEstimates,
  TransactionMeta,
} from '../types';
import { GasFeeEstimateLevel, GasFeeEstimateType } from '../types';
import type { TransactionControllerFeatureFlags } from '../utils/feature-flags';
import { FEATURE_FLAG_RANDOMISE_GAS_FEES } from '../utils/feature-flags';
import { gweiDecimalToWeiHex } from '../utils/gas-fees';

const log = createModuleLogger(
  projectLogger,
  'randomised-estimation-gas-fee-flow',
);

/**
 * Implementation of a gas fee flow that randomises the last digits of gas fee estimations
 */
export class RandomisedEstimationsGasFeeFlow implements GasFeeFlow {
  matchesTransaction(
    transactionMeta: TransactionMeta,
    featureFlags: TransactionControllerFeatureFlags,
  ): boolean {
    const { chainId } = transactionMeta;

    const randomiseGasFeesConfig = getRandomisedGasFeeConfig(featureFlags);

    const enabledChainIds = Object.keys(randomiseGasFeesConfig);

    return enabledChainIds.includes(chainId);
  }

  async getGasFees(request: GasFeeFlowRequest): Promise<GasFeeFlowResponse> {
    try {
      return await this.#getRandomisedGasFees(request);
    } catch (error) {
      log('Using default flow as fallback due to error', error);
      return await this.#getDefaultGasFees(request);
    }
  }

  async #getDefaultGasFees(
    request: GasFeeFlowRequest,
  ): Promise<GasFeeFlowResponse> {
    return new DefaultGasFeeFlow().getGasFees(request);
  }

  async #getRandomisedGasFees(
    request: GasFeeFlowRequest,
  ): Promise<GasFeeFlowResponse> {
    const { featureFlags, gasFeeControllerData, transactionMeta } = request;
    const { gasEstimateType, gasFeeEstimates } = gasFeeControllerData;

    const randomiseGasFeesConfig = getRandomisedGasFeeConfig(featureFlags);
    const lastNDigits = randomiseGasFeesConfig[transactionMeta.chainId];

    let response: GasFeeEstimates;

    switch (gasEstimateType) {
      case GAS_ESTIMATE_TYPES.FEE_MARKET:
        log('Using fee market estimates', gasFeeEstimates);
        response = this.#randomiseFeeMarketEstimates(
          gasFeeEstimates,
          lastNDigits,
        );
        log('Randomised fee market estimates', response);
        break;
      case GAS_ESTIMATE_TYPES.LEGACY:
        log('Using legacy estimates', gasFeeEstimates);
        response = this.#randomiseLegacyEstimates(
          gasFeeEstimates as LegacyGasPriceEstimate,
          lastNDigits,
        );
        log('Randomised legacy estimates', response);
        break;
      case GAS_ESTIMATE_TYPES.ETH_GASPRICE:
        log('Using eth_gasPrice estimates', gasFeeEstimates);
        response = this.#getRandomisedGasPriceEstimate(
          gasFeeEstimates as EthGasPriceEstimate,
          lastNDigits,
        );
        log('Randomised eth_gasPrice estimates', response);
        break;
      default:
        throw new Error(`Unsupported gas estimate type: ${gasEstimateType}`);
    }

    return {
      estimates: response,
    };
  }

  #randomiseFeeMarketEstimates(
    gasFeeEstimates: FeeMarketGasPriceEstimate,
    lastNDigits: number,
  ): FeeMarketGasFeeEstimates {
    const levels = Object.values(GasFeeEstimateLevel).reduce(
      (result, level) => ({
        ...result,
        [level]: this.#getRandomisedFeeMarketLevel(
          gasFeeEstimates,
          level,
          lastNDigits,
        ),
      }),
      {} as Omit<FeeMarketGasFeeEstimates, 'type'>,
    );

    return {
      type: GasFeeEstimateType.FeeMarket,
      ...levels,
    };
  }

  #getRandomisedFeeMarketLevel(
    gasFeeEstimates: FeeMarketGasPriceEstimate,
    level: GasFeeEstimateLevel,
    lastNDigits: number,
  ): FeeMarketGasFeeEstimateForLevel {
    return {
      maxFeePerGas: randomiseDecimalValueAndConvertToHex(
        gasFeeEstimates[level].suggestedMaxFeePerGas,
        lastNDigits,
      ),
      maxPriorityFeePerGas: randomiseDecimalValueAndConvertToHex(
        gasFeeEstimates[level].suggestedMaxPriorityFeePerGas,
        lastNDigits,
      ),
    };
  }

  #randomiseLegacyEstimates(
    gasFeeEstimates: LegacyGasPriceEstimate,
    lastNDigits: number,
  ): LegacyGasFeeEstimates {
    const levels = Object.values(GasFeeEstimateLevel).reduce(
      (result, level) => ({
        ...result,
        [level]: this.#getRandomisedLegacyLevel(
          gasFeeEstimates,
          level,
          lastNDigits,
        ),
      }),
      {} as Omit<LegacyGasFeeEstimates, 'type'>,
    );

    return {
      type: GasFeeEstimateType.Legacy,
      ...levels,
    };
  }

  #getRandomisedLegacyLevel(
    gasFeeEstimates: LegacyGasPriceEstimate,
    level: GasFeeEstimateLevel,
    lastNDigits: number,
  ): Hex {
    return randomiseDecimalValueAndConvertToHex(
      gasFeeEstimates[level],
      lastNDigits,
    );
  }

  #getRandomisedGasPriceEstimate(
    gasFeeEstimates: EthGasPriceEstimate,
    lastNDigits: number,
  ): GasPriceGasFeeEstimates {
    return {
      type: GasFeeEstimateType.GasPrice,
      gasPrice: randomiseDecimalValueAndConvertToHex(
        gasFeeEstimates.gasPrice,
        lastNDigits,
      ),
    };
  }
}

/**
 * Returns the randomised gas fee config from the feature flags
 * 
 * @param featureFlags - All feature flags
 */
function getRandomisedGasFeeConfig(
  featureFlags: TransactionControllerFeatureFlags,
) {
  const randomiseGasFeesConfig =
    featureFlags?.[FEATURE_FLAG_RANDOMISE_GAS_FEES]?.config ?? {};

  return randomiseGasFeesConfig;
}

/**
 * Randomises the least significant digits of a decimal gas fee value and converts it to a hexadecimal Wei value.
 *
 * This function preserves the more significant digits while randomizing only the least significant ones,
 * ensuring that fees remain close to the original estimation while providing fingerprinting protection.
 *
 * @param gweiDecimalValue - The original gas fee value in Gwei (decimal)
 * @param [lastNumberOfDigitsToRandomise] - The number of least significant digits to randomise
 * @returns The randomised value converted to Wei in hexadecimal format
 *
 * @example
 * // Randomise last 3 digits of "200000"
 * randomiseDecimalValueAndConvertToHex("200000", 3)
 * // Decimal output range: 200000 to 200999
 *
 * @example
 * // Randomise last 5 digits of "200000"
 * randomiseDecimalValueAndConvertToHex("200000", 5)
 * // Decimal output range: 200000 to 299999
 *
 * @example
 * // Randomise last 6 digits of "200000"
 * randomiseDecimalValueAndConvertToHex("200000", 6)
 * // Decimal output range: 200000 to 299999
 *
 * @example
 * // Randomise last 8 digits of "200000"
 * randomiseDecimalValueAndConvertToHex("200000", 8)
 * // Decimal output range: 200000 to 299999
 */
function randomiseDecimalValueAndConvertToHex(
  gweiDecimalValue: string | number,
  lastNumberOfDigitsToRandomise = 6,
): Hex {
  const decimalValue =
    typeof gweiDecimalValue === 'string'
      ? gweiDecimalValue
      : gweiDecimalValue.toString();

  const decimalLength = decimalValue.length;

  // Determine how many digits to randomise while preserving the first digit
  const effectiveDigitsToRandomise = Math.min(
    lastNumberOfDigitsToRandomise,
    decimalLength - 1,
  );

  const multiplier = 10 ** effectiveDigitsToRandomise;

  // Remove last digits - this keeps the first (decimalLength - effectiveDigitsToRandomise) digits intact
  const basePart = Math.floor(Number(decimalValue) / multiplier) * multiplier;

  // Generate random digits
  const randomDigits = Math.floor(Math.random() * multiplier);

  // Combine base and random parts
  const randomisedDecimal = basePart + randomDigits;

  // Convert to gwei to hex
  return gweiDecimalToWeiHex(randomisedDecimal.toString());
}
