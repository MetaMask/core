import {
  gweiDecToWEIBN,
  hexToBN,
  query,
  toHex,
} from '@metamask/controller-utils';
import type { GasFeeEstimates as GasFeeControllerEstimates } from '@metamask/gas-fee-controller';
import { GAS_ESTIMATE_TYPES } from '@metamask/gas-fee-controller';
import { createModuleLogger, type Hex } from '@metamask/utils';
import type { BN } from 'ethereumjs-util';

import { projectLogger } from '../logger';
import type {
  GasFeeEstimates,
  GasFeeFlow,
  GasFeeFlowRequest,
  GasFeeFlowResponse,
  TransactionMeta,
} from '../types';
import { GasFeeEstimateLevel } from '../types';
import { CHAIN_IDS } from '../constants';
import { DefaultGasFeeFlow } from './DefaultGasFeeFlow';

type LineaEstimateGasResponse = {
  baseFeePerGas: Hex;
  priorityFeePerGas: Hex;
};

type FeesByLevel = {
  [key in GasFeeEstimateLevel]: BN;
};

const log = createModuleLogger(projectLogger, 'linea-gas-fee-flow');

const ONE_GWEI_IN_WEI = 1e9;

const LINEA_CHAIN_IDS: Hex[] = [
  CHAIN_IDS.LINEA_MAINNET,
  CHAIN_IDS.LINEA_GOERLI,
];

const BASE_FEE_MULTIPLIERS = {
  low: 1,
  medium: 1.35,
  high: 1.7,
};

/**
 * Implementation of a gas fee flow specific to Linea networks that obtains gas fee estimates using:
 * - The `linea_estimateGas` RPC method to obtain the base fee and lowest priority fee.
 * - The GasFeeController to provide the priority fee deltas based on recent block analysis.
 */
export class LineaGasFeeFlow implements GasFeeFlow {
  matchesTransaction(transactionMeta: TransactionMeta): boolean {
    return LINEA_CHAIN_IDS.includes(transactionMeta.chainId as Hex);
  }

  async getGasFees(request: GasFeeFlowRequest): Promise<GasFeeFlowResponse> {
    try {
      return await this.#getLineaGasFees(request);
    } catch (error) {
      log('Using default flow as fallback due to error', error);
      return new DefaultGasFeeFlow().getGasFees(request);
    }
  }

  async #getLineaGasFees(
    request: GasFeeFlowRequest,
  ): Promise<GasFeeFlowResponse> {
    const { ethQuery, getGasFeeControllerEstimates, transactionMeta } = request;

    const lineaResponse = await this.#getLineaResponse(
      transactionMeta,
      ethQuery,
    );

    log('Received Linea response', lineaResponse);

    const gasFeeControllerEstimates = await getGasFeeControllerEstimates();

    log('Received gas fee controller estimates', gasFeeControllerEstimates);

    if (
      gasFeeControllerEstimates.gasEstimateType !==
      GAS_ESTIMATE_TYPES.FEE_MARKET
    ) {
      throw new Error('No gas fee estimates available');
    }

    const baseFees = this.#getBaseFees(lineaResponse);

    const priorityFees = this.#getPriorityFees(
      lineaResponse,
      gasFeeControllerEstimates.gasFeeEstimates,
    );

    const maxFees = this.#getMaxFees(baseFees, priorityFees);

    this.#logDifferencesToGasFeeController(
      maxFees,
      gasFeeControllerEstimates.gasFeeEstimates,
    );

    const estimates = Object.values(GasFeeEstimateLevel).reduce(
      (result, level) => ({
        ...result,
        [level]: {
          maxFeePerGas: toHex(maxFees[level]),
          maxPriorityFeePerGas: toHex(priorityFees[level]),
        },
      }),
      {} as GasFeeEstimates,
    );

    return { estimates };
  }

  #getLineaResponse(
    transactionMeta: TransactionMeta,
    ethQuery: any,
  ): Promise<LineaEstimateGasResponse> {
    return query(ethQuery, 'linea_estimateGas', [
      {
        from: transactionMeta.transaction.from,
        to: transactionMeta.transaction.to,
        value: transactionMeta.transaction.value,
        input: transactionMeta.transaction.data,
        gasPrice: '0x100000000',
      },
    ]);
  }

  #getBaseFees(lineaResponse: LineaEstimateGasResponse): FeesByLevel {
    const baseFeeLow = hexToBN(lineaResponse.baseFeePerGas);
    const baseFeeMedium = baseFeeLow.muln(BASE_FEE_MULTIPLIERS.medium);
    const baseFeeHigh = baseFeeLow.muln(BASE_FEE_MULTIPLIERS.high);

    return {
      low: baseFeeLow,
      medium: baseFeeMedium,
      high: baseFeeHigh,
    };
  }

  #getPriorityFees(
    lineaResponse: LineaEstimateGasResponse,
    gasFeeEstimates: GasFeeControllerEstimates,
  ): FeesByLevel {
    const mediumPriorityIncrease = this.#getPriorityLevelDifference(
      gasFeeEstimates,
      GasFeeEstimateLevel.medium,
      GasFeeEstimateLevel.low,
    );

    const highPriorityIncrease = this.#getPriorityLevelDifference(
      gasFeeEstimates,
      GasFeeEstimateLevel.high,
      GasFeeEstimateLevel.medium,
    );

    const priorityFeeLow = hexToBN(lineaResponse.priorityFeePerGas);
    const priorityFeeMedium = priorityFeeLow.add(mediumPriorityIncrease);
    const priorityFeeHigh = priorityFeeMedium.add(highPriorityIncrease);

    return {
      low: priorityFeeLow,
      medium: priorityFeeMedium,
      high: priorityFeeHigh,
    };
  }

  #getPriorityLevelDifference(
    gasFeeEstimates: GasFeeControllerEstimates,
    firstLevel: GasFeeEstimateLevel,
    secondLevel: GasFeeEstimateLevel,
  ): BN {
    return gweiDecToWEIBN(
      gasFeeEstimates[firstLevel].suggestedMaxPriorityFeePerGas,
    ).sub(
      gweiDecToWEIBN(
        gasFeeEstimates[secondLevel].suggestedMaxPriorityFeePerGas,
      ),
    );
  }

  #getMaxFees(
    baseFees: Record<GasFeeEstimateLevel, BN>,
    priorityFees: Record<GasFeeEstimateLevel, BN>,
  ): FeesByLevel {
    return {
      low: baseFees.low.add(priorityFees.low),
      medium: baseFees.medium.add(priorityFees.medium),
      high: baseFees.high.add(priorityFees.high),
    };
  }

  #logDifferencesToGasFeeController(
    maxFees: FeesByLevel,
    gasFeeControllerEstimates: GasFeeControllerEstimates,
  ) {
    const calculateDifference = (level: GasFeeEstimateLevel) => {
      const newMaxFeeWeiDec = maxFees[level].toNumber();
      const newMaxFeeGweiDec = newMaxFeeWeiDec / ONE_GWEI_IN_WEI;

      const oldMaxFeeGweiDec = parseFloat(
        gasFeeControllerEstimates[level].suggestedMaxFeePerGas,
      );

      const percentDifference = (newMaxFeeGweiDec / oldMaxFeeGweiDec - 1) * 100;

      /* istanbul ignore next */
      return `${percentDifference > 0 ? '+' : ''}${percentDifference.toFixed(
        2,
      )}%`;
    };

    log(
      'Difference to gas fee controller',
      calculateDifference(GasFeeEstimateLevel.low),
      calculateDifference(GasFeeEstimateLevel.medium),
      calculateDifference(GasFeeEstimateLevel.high),
    );
  }
}
