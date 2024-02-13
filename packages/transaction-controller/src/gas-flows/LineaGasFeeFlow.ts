import {
  ChainId,
  gweiDecToWEIBN,
  hexToBN,
  query,
  toHex,
} from '@metamask/controller-utils';
import type EthQuery from '@metamask/eth-query';
import type { GasFeeEstimates } from '@metamask/gas-fee-controller';
import { GAS_ESTIMATE_TYPES } from '@metamask/gas-fee-controller';
import { createModuleLogger, type Hex } from '@metamask/utils';
import type { BN } from 'ethereumjs-util';

import { projectLogger } from '../logger';
import type {
  GasFeeFlow,
  GasFeeFlowRequest,
  GasFeeFlowResponse,
  TransactionMeta,
} from '../types';
import { DefaultGasFeeFlow } from './DefaultGasFeeFlow';

type LineaEstimateGasResponse = {
  baseFeePerGas: Hex;
  priorityFeePerGas: Hex;
};

type FeesByLevel = {
  low: BN;
  medium: BN;
  high: BN;
};

const log = createModuleLogger(projectLogger, 'linea-gas-fee-flow');

const ONE_GWEI_IN_WEI = 1e9;

const LINEA_CHAIN_IDS: Hex[] = [
  ChainId['linea-mainnet'],
  ChainId['linea-goerli'],
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
    return LINEA_CHAIN_IDS.includes(transactionMeta.chainId);
  }

  async getGasFees(request: GasFeeFlowRequest): Promise<GasFeeFlowResponse> {
    try {
      return await this.#getLineaGasFees(request);
    } catch (error) {
      log('Using default flow as fallback due to error', error);
      return new DefaultGasFeeFlow().getGasFees(request);
    }
  }

  async #getLineaGasFees(request: GasFeeFlowRequest) {
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

    return {
      estimates: {
        low: {
          maxFeePerGas: toHex(maxFees.low),
          maxPriorityFeePerGas: toHex(priorityFees.low),
        },
        medium: {
          maxFeePerGas: toHex(maxFees.medium),
          maxPriorityFeePerGas: toHex(priorityFees.medium),
        },
        high: {
          maxFeePerGas: toHex(maxFees.high),
          maxPriorityFeePerGas: toHex(priorityFees.high),
        },
      },
    };
  }

  #getLineaResponse(
    transactionMeta: TransactionMeta,
    ethQuery: EthQuery,
  ): Promise<LineaEstimateGasResponse> {
    return query(ethQuery, 'linea_estimateGas', [
      {
        from: transactionMeta.txParams.from,
        to: transactionMeta.txParams.to,
        value: transactionMeta.txParams.value,
        input: transactionMeta.txParams.data,
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
    gasFeeEstimates: GasFeeEstimates,
  ): FeesByLevel {
    const mediumPriorityIncrease = gweiDecToWEIBN(
      gasFeeEstimates.medium.suggestedMaxPriorityFeePerGas,
    ).sub(gweiDecToWEIBN(gasFeeEstimates.low.suggestedMaxPriorityFeePerGas));

    const highPriorityIncrease = gweiDecToWEIBN(
      gasFeeEstimates.high.suggestedMaxPriorityFeePerGas,
    ).sub(gweiDecToWEIBN(gasFeeEstimates.medium.suggestedMaxPriorityFeePerGas));

    const priorityFeeLow = hexToBN(lineaResponse.priorityFeePerGas);
    const priorityFeeMedium = priorityFeeLow.add(mediumPriorityIncrease);
    const priorityFeeHigh = priorityFeeMedium.add(highPriorityIncrease);

    return {
      low: priorityFeeLow,
      medium: priorityFeeMedium,
      high: priorityFeeHigh,
    };
  }

  #getMaxFees(
    baseFees: Record<'low' | 'medium' | 'high', BN>,
    priorityFees: Record<'low' | 'medium' | 'high', BN>,
  ): FeesByLevel {
    return {
      low: baseFees.low.add(priorityFees.low),
      medium: baseFees.medium.add(priorityFees.medium),
      high: baseFees.high.add(priorityFees.high),
    };
  }

  #logDifferencesToGasFeeController(
    maxFees: FeesByLevel,
    gasFeeControllerEstimates: GasFeeEstimates,
  ) {
    const calculateDifference = (level: keyof FeesByLevel) => {
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
      calculateDifference('low'),
      calculateDifference('medium'),
      calculateDifference('high'),
    );
  }
}
