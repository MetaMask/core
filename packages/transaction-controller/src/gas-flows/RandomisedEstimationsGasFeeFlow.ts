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
import { gweiDecimalToWeiDecimal } from '../utils/gas-fees';

const log = createModuleLogger(
  projectLogger,
  'randomised-estimation-gas-fee-flow',
);

const PRESERVE_NUMBER_OF_DIGITS = 2;
const DEFAULT_NUMBER_OF_DIGITS_TO_RANDOMISE = 4;

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
      maxFeePerGas: randomiseDecimalGWEIAndConvertToHex(
        gasFeeEstimates[level].suggestedMaxFeePerGas,
        lastNDigits,
      ),
      maxPriorityFeePerGas: randomiseDecimalGWEIAndConvertToHex(
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
    return randomiseDecimalGWEIAndConvertToHex(
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
      gasPrice: randomiseDecimalGWEIAndConvertToHex(
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
 * @returns The randomised gas fee config
 */
function getRandomisedGasFeeConfig(
  featureFlags: TransactionControllerFeatureFlags,
): Record<Hex, number> {
  const randomiseGasFeesConfig =
    featureFlags?.[FEATURE_FLAG_RANDOMISE_GAS_FEES]?.config ?? {};

  return randomiseGasFeesConfig;
}

/**
 * Randomises the least significant digits of a decimal gas fee value and converts it to a hexadecimal Wei value.
 *
 * This function preserves the more significant digits while randomizing only the least significant ones,
 * ensuring that fees remain close to the original estimation while providing randomisation.
 * The randomisation is performed in Wei units for more precision.
 *
 * @param gweiDecimalValue - The original gas fee value in Gwei (decimal)
 * @param [numberOfDigitsToRandomizeAtTheEnd] - The number of least significant digits to randomise
 * @returns The randomised value converted to Wei in hexadecimal format
 */
export function randomiseDecimalGWEIAndConvertToHex(
  gweiDecimalValue: string | number,
  numberOfDigitsToRandomizeAtTheEnd = DEFAULT_NUMBER_OF_DIGITS_TO_RANDOMISE,
): Hex {
  const weiDecimalValue = gweiDecimalToWeiDecimal(gweiDecimalValue);
  const decimalLength = weiDecimalValue.length;

  // Determine how many digits to randomise while preserving the PRESERVE_NUMBER_OF_DIGITS
  const effectiveDigitsToRandomise = Math.min(
    numberOfDigitsToRandomizeAtTheEnd,
    decimalLength - PRESERVE_NUMBER_OF_DIGITS,
  );

  const multiplier = 10 ** effectiveDigitsToRandomise;

  // Keep the original value up to the digits we want to preserve
  const basePart =
    Math.floor(Number(weiDecimalValue) / multiplier) * multiplier;

  // Get the original ending digits
  const originalEndingDigits = Number(weiDecimalValue) % multiplier;

  // Generate random digits, but always greater than or equal to original ending digits
  // This ensures we only randomize within the specified number of digits
  const randomEndingDigits =
    originalEndingDigits +
    Math.floor(Math.random() * (multiplier - originalEndingDigits));

  // Combine base and random parts
  const randomisedWeiDecimal = basePart + randomEndingDigits;

  // Convert wei decimal to hex
  return `0x${randomisedWeiDecimal.toString(16)}` as Hex;
}
