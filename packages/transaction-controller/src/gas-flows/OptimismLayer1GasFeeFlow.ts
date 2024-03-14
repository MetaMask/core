import { Contract } from '@ethersproject/contracts';
import type { Web3Provider } from '@ethersproject/providers';
import { createModuleLogger, type Hex } from '@metamask/utils';

import { CHAIN_IDS } from '../constants';
import { projectLogger } from '../logger';
import type {
  Layer1GasFeeFlow,
  Layer1GasFeeFlowRequest,
  Layer1GasFeeFlowResponse,
  TransactionMeta,
} from '../types';
import { buildUnserializedTransaction } from '../utils/layer1-gas-fee-flow';

const OPTIMISIM_CHAIN_IDS: Hex[] = [
  CHAIN_IDS.OPTIMISM,
  CHAIN_IDS.OPTIMISM_TESTNET,
];

const log = createModuleLogger(projectLogger, 'optimisim-layer1-gas-fee-flow');

// Snippet of the ABI that we need
// Should we need more of it at some point, the full ABI can be found here:
// https://github.com/ethereum-optimism/optimism/blob/develop/gas-oracle/abis/OVM_GasPriceOracle.json
const OPTIMISM_GAS_PRICE_ORACLE_ABI = [
  {
    inputs: [{ internalType: 'bytes', name: '_data', type: 'bytes' }],
    name: 'getL1Fee',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
];

// BlockExplorer link: https://optimistic.etherscan.io/address/0x420000000000000000000000000000000000000f#code
const OPTIMISM_GAS_PRICE_ORACLE_ADDRESS =
  '0x420000000000000000000000000000000000000F';

/**
 * Optimism layer 1 gas fee flow that obtains gas fee estimate using Optimisim oracle contract.
 */
export class OptimismLayer1GasFeeFlow implements Layer1GasFeeFlow {
  matchesTransaction(transactionMeta: TransactionMeta): boolean {
    return OPTIMISIM_CHAIN_IDS.includes(transactionMeta.chainId);
  }

  async #getOptimisimLayer1GasFee(
    request: Layer1GasFeeFlowRequest,
  ): Promise<Layer1GasFeeFlowResponse> {
    const { ethQuery, transactionMeta } = request;

    const contract = new Contract(
      OPTIMISM_GAS_PRICE_ORACLE_ADDRESS,
      OPTIMISM_GAS_PRICE_ORACLE_ABI,
      // Network controller provider type is uncompatible with ethers provider
      ethQuery.currentProvider as unknown as Web3Provider,
    );

    const serializedTransaction =
      buildUnserializedTransaction(transactionMeta).serialize();
    const result = await contract.getL1Fee(serializedTransaction);

    return {
      layer1Fee: result?.toHexString(),
    };
  }

  async getLayer1Fee(
    request: Layer1GasFeeFlowRequest,
  ): Promise<Layer1GasFeeFlowResponse> {
    try {
      return await this.#getOptimisimLayer1GasFee(request);
    } catch (error) {
      log('Failed to get Optimism layer 1 gas fee due to error', error);
      throw new Error(`Failed to get Optimism layer 1 gas fee`);
    }
  }
}
