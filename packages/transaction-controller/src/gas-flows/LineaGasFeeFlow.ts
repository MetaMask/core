import { ChainId, hexToBN, query, toHex } from '@metamask/controller-utils';
import type EthQuery from '@metamask/eth-query';
import { createModuleLogger, type Hex } from '@metamask/utils';
import type BN from 'bn.js';

import { projectLogger } from '../logger';
import type {
  GasFeeEstimates,
  GasFeeFlow,
  GasFeeFlowRequest,
  GasFeeFlowResponse,
  TransactionMeta,
} from '../types';
import { GasFeeEstimateLevel, GasFeeEstimateType } from '../types';
import { DefaultGasFeeFlow } from './DefaultGasFeeFlow';

type LineaEstimateGasResponse = {
  baseFeePerGas: Hex;
  priorityFeePerGas: Hex;
};

type FeesByLevel = {
  [key in GasFeeEstimateLevel]: BN;
};

const log = createModuleLogger(projectLogger, 'linea-gas-fee-flow');

const LINEA_CHAIN_IDS: Hex[] = [
  ChainId['linea-mainnet'],
  ChainId['linea-goerli'],
  ChainId['linea-sepolia'],
];

const BASE_FEE_MULTIPLIERS = {
  low: 1,
  medium: 1.35,
  high: 1.7,
};

const PRIORITY_FEE_MULTIPLIERS = {
  low: 1,
  medium: 1.05,
  high: 1.1,
};

/**
 * Implementation of a gas fee flow specific to Linea networks that obtains gas fee estimates using:
 * - The `linea_estimateGas` RPC method to obtain the base fee and lowest priority fee.
 * - Static multipliers to increase the base and priority fees.
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

  async #getLineaGasFees(
    request: GasFeeFlowRequest,
  ): Promise<GasFeeFlowResponse> {
    const { ethQuery, transactionMeta } = request;

    const lineaResponse = await this.#getLineaResponse(
      transactionMeta,
      ethQuery,
    );

    log('Received Linea response', lineaResponse);

    const baseFees = this.#getValuesFromMultipliers(
      lineaResponse.baseFeePerGas,
      BASE_FEE_MULTIPLIERS,
    );

    log('Generated base fees', this.#feesToString(baseFees));

    const priorityFees = this.#getValuesFromMultipliers(
      lineaResponse.priorityFeePerGas,
      PRIORITY_FEE_MULTIPLIERS,
    );

    log('Generated priority fees', this.#feesToString(priorityFees));

    const maxFees = this.#getMaxFees(baseFees, priorityFees);

    log('Generated max fees', this.#feesToString(maxFees));

    const estimates = Object.values(GasFeeEstimateLevel).reduce(
      (result, level) => ({
        ...result,
        [level]: {
          maxFeePerGas: toHex(maxFees[level]),
          maxPriorityFeePerGas: toHex(priorityFees[level]),
        },
      }),
      { type: GasFeeEstimateType.FeeMarket } as GasFeeEstimates,
    );

    return { estimates };
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
        // Required in request but no impact on response.
        gasPrice: '0x100000000',
      },
    ]);
  }

  #getValuesFromMultipliers(
    value: Hex,
    multipliers: { low: number; medium: number; high: number },
  ): FeesByLevel {
    const base = hexToBN(value);
    const low = base.muln(multipliers.low);
    const medium = base.muln(multipliers.medium);
    const high = base.muln(multipliers.high);

    return {
      low,
      medium,
      high,
    };
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

  #feesToString(fees: FeesByLevel) {
    return Object.values(GasFeeEstimateLevel).map((level) =>
      fees[level].toString(10),
    );
  }
}
