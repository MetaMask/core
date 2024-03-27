import { Common, Hardfork } from '@ethereumjs/common';
import { TransactionFactory } from '@ethereumjs/tx';
import { Contract } from '@ethersproject/contracts';
import { Web3Provider, type ExternalProvider } from '@ethersproject/providers';
import { createModuleLogger, type Hex, remove0x } from '@metamask/utils';
import BN from 'bn.js';
import { omit } from 'lodash';

import { CHAIN_IDS } from '../constants';
import { projectLogger } from '../logger';
import type {
  Layer1GasFeeFlow,
  Layer1GasFeeFlowRequest,
  Layer1GasFeeFlowResponse,
  TransactionMeta,
} from '../types';

// This gas flow to be used for the following OP stack chains
const OPTIMISM_STACK_CHAIN_IDS: Hex[] = [
  CHAIN_IDS.OPTIMISM,
  CHAIN_IDS.OPTIMISM_TESTNET,
  CHAIN_IDS.BASE,
  CHAIN_IDS.BASE_TESTNET,
  CHAIN_IDS.OPBNB,
  CHAIN_IDS.OPBNB_TESTNET,
  CHAIN_IDS.ZORA,
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
    return OPTIMISM_STACK_CHAIN_IDS.includes(transactionMeta.chainId);
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

  async #getOptimisimLayer1GasFee(
    request: Layer1GasFeeFlowRequest,
  ): Promise<Layer1GasFeeFlowResponse> {
    const { provider, transactionMeta } = request;

    const contract = new Contract(
      OPTIMISM_GAS_PRICE_ORACLE_ADDRESS,
      OPTIMISM_GAS_PRICE_ORACLE_ABI,
      // Network controller provider type is uncompatible with ethers provider
      new Web3Provider(provider as unknown as ExternalProvider),
    );

    const serializedTransaction =
      this.#buildUnserializedTransaction(transactionMeta).serialize();

    const result = await contract.getL1Fee(serializedTransaction);

    if (result === undefined) {
      throw new Error(
        'Failed to retrieve layer 1 gas fee from Optimism Gas Price Oracle.',
      );
    }

    return {
      layer1Fee: result.toHexString(),
    };
  }

  /**
   * Build an unserialized transaction for a transaction.
   *
   * @param transactionMeta - The transaction to build an unserialized transaction for.
   * @returns The unserialized transaction.
   */
  #buildUnserializedTransaction(transactionMeta: TransactionMeta) {
    const txParams = this.#buildTransactionParams(transactionMeta);
    const common = this.#buildTransactionCommon(transactionMeta);
    return TransactionFactory.fromTxData(txParams, { common });
  }

  /**
   * Build transactionParams to be used in the unserialized transaction.
   *
   * @param transactionMeta - The transaction to build transactionParams.
   * @returns The transactionParams for the unserialized transaction.
   */
  #buildTransactionParams(
    transactionMeta: TransactionMeta,
  ): TransactionMeta['txParams'] {
    return {
      ...omit(transactionMeta.txParams, 'gas'),
      gasLimit: transactionMeta.txParams.gas,
    };
  }

  /**
   * This produces a transaction whose information does not completely match an
   * Optimism transaction — for instance, DEFAULT_CHAIN is still 'mainnet' and
   * genesis points to the mainnet genesis, not the Optimism genesis — but
   * considering that all we want to do is serialize a transaction, this works
   * fine for our use case.
   *
   * @param transactionMeta - The transaction to build an unserialized transaction for.
   * @returns The unserialized transaction.
   */
  #buildTransactionCommon(transactionMeta: TransactionMeta) {
    return Common.custom({
      chainId: new BN(
        remove0x(transactionMeta.chainId),
        16,
      ) as unknown as number,
      // Optimism only supports type-0 transactions; it does not support any of
      // the newer EIPs since EIP-155. Source:
      // <https://github.com/ethereum-optimism/optimism/blob/develop/specs/l2geth/transaction-types.md>
      defaultHardfork: Hardfork.London,
    });
  }
}
