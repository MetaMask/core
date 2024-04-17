import { Common, Hardfork } from '@ethereumjs/common';
import { TransactionFactory } from '@ethereumjs/tx';
import { Contract } from '@ethersproject/contracts';
import { Web3Provider, type ExternalProvider } from '@ethersproject/providers';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { omit } from 'lodash';

import { projectLogger } from '../logger';
import type {
  Layer1GasFeeFlow,
  Layer1GasFeeFlowRequest,
  Layer1GasFeeFlowResponse,
  TransactionMeta,
} from '../types';

const log = createModuleLogger(projectLogger, 'oracle-layer1-gas-fee-flow');

const DUMMY_KEY =
  'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

const GAS_PRICE_ORACLE_ABI = [
  {
    inputs: [{ internalType: 'bytes', name: '_data', type: 'bytes' }],
    name: 'getL1Fee',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
];

/**
 * Layer 1 gas fee flow that obtains gas fee estimate using an oracle smart contract.
 */
export abstract class OracleLayer1GasFeeFlow implements Layer1GasFeeFlow {
  #oracleAddress: Hex;

  #signTransaction: boolean;

  constructor(oracleAddress: Hex, signTransaction?: boolean) {
    this.#oracleAddress = oracleAddress;
    this.#signTransaction = signTransaction ?? false;
  }

  abstract matchesTransaction(transactionMeta: TransactionMeta): boolean;

  async getLayer1Fee(
    request: Layer1GasFeeFlowRequest,
  ): Promise<Layer1GasFeeFlowResponse> {
    try {
      return await this.#getOracleLayer1GasFee(request);
    } catch (error) {
      log('Failed to get oracle layer 1 gas fee', error);
      throw new Error(`Failed to get oracle layer 1 gas fee`);
    }
  }

  async #getOracleLayer1GasFee(
    request: Layer1GasFeeFlowRequest,
  ): Promise<Layer1GasFeeFlowResponse> {
    const { provider, transactionMeta } = request;

    const contract = new Contract(
      this.#oracleAddress,
      GAS_PRICE_ORACLE_ABI,
      // Network controller provider type is incompatible with ethers provider
      new Web3Provider(provider as unknown as ExternalProvider),
    );

    const serializedTransaction = this.#buildUnserializedTransaction(
      transactionMeta,
      this.#signTransaction,
    ).serialize();

    const result = await contract.getL1Fee(serializedTransaction);

    if (result === undefined) {
      throw new Error('No value returned from oracle contract');
    }

    return {
      layer1Fee: result.toHexString(),
    };
  }

  #buildUnserializedTransaction(
    transactionMeta: TransactionMeta,
    sign: boolean,
  ) {
    const txParams = this.#buildTransactionParams(transactionMeta);
    const common = this.#buildTransactionCommon(transactionMeta);

    let unserializedTransaction = TransactionFactory.fromTxData(txParams, {
      common,
    });

    if (sign) {
      const keyBuffer = Buffer.from(DUMMY_KEY, 'hex');
      unserializedTransaction = unserializedTransaction.sign(keyBuffer);
    }

    return unserializedTransaction;
  }

  #buildTransactionParams(
    transactionMeta: TransactionMeta,
  ): TransactionMeta['txParams'] {
    return {
      ...omit(transactionMeta.txParams, 'gas'),
      gasLimit: transactionMeta.txParams.gas,
    };
  }

  #buildTransactionCommon(transactionMeta: TransactionMeta) {
    const chainId = Number(transactionMeta.chainId);

    return Common.custom({
      chainId,
      defaultHardfork: Hardfork.London,
    });
  }
}
