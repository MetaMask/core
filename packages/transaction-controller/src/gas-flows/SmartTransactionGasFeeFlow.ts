import { createModuleLogger, type Hex } from '@metamask/utils';

import { projectLogger } from '../logger';
import type {
  GasFeeFlow,
  GasFeeFlowRequest,
  GasFeeFlowResponse,
  TransactionMeta,
} from '../types';

type SmartTransactionGasResponse = {
  baseFeePerGas: Hex;
  priorityFeePerGas: Hex;
};

const log = createModuleLogger(projectLogger, 'linea-gas-fee-flow');

/**
 * Implementation of a smart transaction gas fee flow specific to Smart Transactions.
 */
export class SmartTransactionGasFeeFlow implements GasFeeFlow {
  matchesTransaction(transactionMeta: TransactionMeta): boolean {
    return !!transactionMeta.isSmartTransaction;
  }


  async getGasFees(request: GasFeeFlowRequest): Promise<GasFeeFlowResponse> {

    return {
      estimates: {
        low: {
          maxFeePerGas: '0x0',
          maxPriorityFeePerGas: '0x0',
        },
        medium: {
          maxFeePerGas: '0x0',
          maxPriorityFeePerGas: '0x0',
        },
        high: {
          maxFeePerGas: '0x0',
          maxPriorityFeePerGas: '0x0',
        },
      },
    };
  }
}
