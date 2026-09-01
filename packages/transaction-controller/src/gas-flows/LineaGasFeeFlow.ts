import {
  ChainId,
  fractionBN,
  hexToBN,
  toHex,
} from '@metamask/controller-utils';
import type { NetworkClientId } from '@metamask/network-controller';
import { createModuleLogger } from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import type BN from 'bn.js';

import { projectLogger } from '../logger.js';
import type { TransactionControllerMessenger } from '../TransactionController.js';
import type {
  GasFeeEstimates,
  GasFeeFlow,
  GasFeeFlowRequest,
  GasFeeFlowResponse,
  TransactionMeta,
} from '../types.js';
import { GasFeeEstimateLevel, GasFeeEstimateType } from '../types.js';
import { rpcRequest } from '../utils/provider.js';
import { DefaultGasFeeFlow } from './DefaultGasFeeFlow.js';

type LineaEstimateGasResponse = {
  baseFeePerGas: Hex;
  priorityFeePerGas: Hex;
};

type FeesByLevel = {
  [key in GasFeeEstimateLevel]: BN;
};

const log = createModuleLogger(projectLogger, 'linea-gas-fee-flow');

/**
 * Precision used to convert a decimal multiplier (e.g. 1.35) into an integer
 * numerator/denominator pair for `fractionBN`, which does the multiplication
 * as an arbitrary-precision BN operation. `BN.muln` cannot be used directly
 * with a fractional multiplier: it silently truncates to the integer part on
 * a per-26-bit-word basis instead of throwing, so `base.muln(1.35)` returns a
 * wrong, under-computed result rather than failing loudly.
 */
const MULTIPLIER_PRECISION = 100;

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
  matchesTransaction({
    transactionMeta,
  }: {
    transactionMeta: TransactionMeta;
    messenger: TransactionControllerMessenger;
  }): boolean {
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
    const { messenger, transactionMeta } = request;
    const { networkClientId } = transactionMeta;

    const lineaResponse = await this.#getLineaResponse(
      transactionMeta,
      messenger,
      networkClientId,
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
    messenger: TransactionControllerMessenger,
    networkClientId: NetworkClientId,
  ): Promise<LineaEstimateGasResponse> {
    const { from, to, value, data } = transactionMeta.txParams;

    const params: Record<string, string> = { from };

    if (to) {
      params.to = to;
    }

    if (value) {
      params.value = value;
    }

    if (data) {
      params.input = data;
    }

    return rpcRequest({
      messenger,
      networkClientId,
      method: 'linea_estimateGas',
      params: [params],
    }) as Promise<LineaEstimateGasResponse>;
  }

  #getValuesFromMultipliers(
    value: Hex,
    multipliers: { low: number; medium: number; high: number },
  ): FeesByLevel {
    const base = hexToBN(value);
    const low = this.#applyMultiplier(base, multipliers.low);
    const medium = this.#applyMultiplier(base, multipliers.medium);
    const high = this.#applyMultiplier(base, multipliers.high);

    return {
      low,
      medium,
      high,
    };
  }

  /**
   * Multiplies a BN value by a decimal multiplier, quantized to
   * `MULTIPLIER_PRECISION` decimal places, without `BN.muln`'s word-boundary
   * truncation. All multipliers this flow uses have at most two decimal
   * places, so this is exact for them; it is not a general-purpose
   * arbitrary-precision decimal multiply.
   *
   * @param value - The value to multiply.
   * @param multiplier - The decimal multiplier (e.g. 1.35).
   * @returns The multiplied value.
   */
  #applyMultiplier(value: BN, multiplier: number): BN {
    return fractionBN(
      value,
      Math.round(multiplier * MULTIPLIER_PRECISION),
      MULTIPLIER_PRECISION,
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

  #feesToString(fees: FeesByLevel): string[] {
    return Object.values(GasFeeEstimateLevel).map((level) =>
      fees[level].toString(10),
    );
  }
}
