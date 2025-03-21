import type {
  LegacyGasPriceEstimate,
  GasFeeEstimates as FeeMarketGasPriceEstimate,
  EthGasPriceEstimate,
} from '@metamask/gas-fee-controller';
import { GAS_ESTIMATE_TYPES } from '@metamask/gas-fee-controller';
import { createModuleLogger, type Hex } from '@metamask/utils';

import { DefaultGasFeeFlow } from './DefaultGasFeeFlow';
import { projectLogger } from '../logger';
import type { TransactionControllerMessenger } from '../TransactionController';
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
import { getRandomisedGasFeeDigits } from '../utils/feature-flags';
import { gweiDecimalToWeiDecimal } from '../utils/gas-fees';

const log = createModuleLogger(
  projectLogger,
  'randomised-estimation-gas-fee-flow',
);

const PRESERVE_NUMBER_OF_DIGITS = 2;

/**
 * Implementation of a gas fee flow that randomises the last digits of gas fee estimations
 */
export class RandomisedEstimationsGasFeeFlow implements GasFeeFlow {
  matchesTransaction({
    transactionMeta,
    messenger,
  }: {
    transactionMeta: TransactionMeta;
    messenger: TransactionControllerMessenger;
  }): boolean {
    const { chainId } = transactionMeta;

    const randomisedGasFeeDigits = getRandomisedGasFeeDigits(
      chainId,
      messenger,
    );

    return randomisedGasFeeDigits !== undefined;
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
    const { messenger, gasFeeControllerData, transactionMeta } = request;
    const { gasEstimateType, gasFeeEstimates } = gasFeeControllerData;

    const randomisedGasFeeDigits = getRandomisedGasFeeDigits(
      transactionMeta.chainId,
      messenger,
    ) as number;

    let response: GasFeeEstimates;

    if (gasEstimateType === GAS_ESTIMATE_TYPES.FEE_MARKET) {
      log('Using fee market estimates', gasFeeEstimates);
      response = this.#randomiseFeeMarketEstimates(
        gasFeeEstimates,
        randomisedGasFeeDigits,
      );
      log('Randomised fee market estimates', response);
    } else if (gasEstimateType === GAS_ESTIMATE_TYPES.LEGACY) {
      log('Using legacy estimates', gasFeeEstimates);
      response = this.#randomiseLegacyEstimates(
        gasFeeEstimates,
        randomisedGasFeeDigits,
      );
      log('Randomised legacy estimates', response);
    } else if (gasEstimateType === GAS_ESTIMATE_TYPES.ETH_GASPRICE) {
      log('Using eth_gasPrice estimates', gasFeeEstimates);
      response = this.#getRandomisedGasPriceEstimate(
        gasFeeEstimates,
        randomisedGasFeeDigits,
      );
      log('Randomised eth_gasPrice estimates', response);
    } else {
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
 * Generates a random number with the specified number of digits that is greater than or equal to the given minimum value.
 *
 * @param digitCount - The number of digits the random number should have
 * @param minValue - The minimum value the random number should have
 * @returns A random number with the specified number of digits
 */
function generateRandomDigits(digitCount: number, minValue: number): number {
  const multiplier = 10 ** digitCount;
  return minValue + Math.floor(Math.random() * (multiplier - minValue));
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
  numberOfDigitsToRandomizeAtTheEnd: number,
): Hex {
  const weiDecimalValue = gweiDecimalToWeiDecimal(gweiDecimalValue);
  const decimalLength = weiDecimalValue.length;

  // Determine how many digits to randomise while preserving the PRESERVE_NUMBER_OF_DIGITS
  const effectiveDigitsToRandomise = Math.min(
    numberOfDigitsToRandomizeAtTheEnd,
    decimalLength - PRESERVE_NUMBER_OF_DIGITS,
  );

  // Handle the case when the value is 0 or too small
  if (Number(weiDecimalValue) === 0 || effectiveDigitsToRandomise <= 0) {
    return `0x${Number(weiDecimalValue).toString(16)}` as Hex;
  }

  // Use string manipulation to get the base part (significant digits)
  const significantDigitsCount = decimalLength - effectiveDigitsToRandomise;
  const significantDigits = weiDecimalValue.slice(0, significantDigitsCount);

  // Get the original ending digits using string manipulation
  const endingDigits = weiDecimalValue.slice(-effectiveDigitsToRandomise);
  const originalEndingDigits = Number(endingDigits);

  // Generate random digits that are greater than or equal to the original ending digits
  const randomEndingDigits = generateRandomDigits(
    effectiveDigitsToRandomise,
    originalEndingDigits,
  );

  const basePart = BigInt(
    significantDigits + '0'.repeat(effectiveDigitsToRandomise),
  );
  const randomisedWeiDecimal = basePart + BigInt(randomEndingDigits);

  return `0x${randomisedWeiDecimal.toString(16)}` as Hex;
}
