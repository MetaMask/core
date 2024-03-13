import type EthQuery from '@metamask/eth-query';
import { createModuleLogger, type Hex } from '@metamask/utils';

import { projectLogger } from '../logger';
import type { Layer1GasFeeFlow, TransactionMeta } from '../types';

const log = createModuleLogger(projectLogger, 'layer-1-gas-fee-flow');

export type UpdateLayer1GasFeeRequest = {
  ethQuery: EthQuery;
  layer1GasFeeFlows: Layer1GasFeeFlow[];
  transactionMeta: TransactionMeta;
};

/**
 * Updates the given transactionMeta with the layer 1 gas fee.
 * @param request - The request to use when getting the layer 1 gas fee.
 * @param request.provider - Provider used to create a new underlying EthQuery instance
 * @param request.transactionMeta - The transaction to get the layer 1 gas fee for.
 * @param request.layer1GasFeeFlows - The layer 1 gas fee flows to search.
 */
export async function updateTransactionLayer1GasFee(
  request: UpdateLayer1GasFeeRequest,
) {
  const layer1GasFee = await getTransactionLayer1GasFee(request);

  if (layer1GasFee) {
    const { transactionMeta } = request;
    transactionMeta.layer1GasFee = layer1GasFee;
  }
}

/**
 * Get the layer 1 gas fee flow for a transaction.
 * @param transactionMeta - The transaction to get the layer 1 gas fee flow for.
 * @param layer1GasFeeFlows - The layer 1 gas fee flows to search.
 * @returns The layer 1 gas fee flow for the transaction, or undefined if none match.
 */
function getLayer1GasFeeFlow(
  transactionMeta: TransactionMeta,
  layer1GasFeeFlows: Layer1GasFeeFlow[],
): Layer1GasFeeFlow | undefined {
  return layer1GasFeeFlows.find((layer1GasFeeFlow) =>
    layer1GasFeeFlow.matchesTransaction(transactionMeta),
  );
}

/**
 * Get the layer 1 gas fee for a transaction and return the layer1Fee.
 * @param request - The request to use when getting the layer 1 gas fee.
 * @param request.ethQuery - The EthQuery instance to use to get the layer 1 gas fee.
 * @param request.layer1GasFeeFlows - The layer 1 gas fee flows to search.
 * @param request.transactionMeta - The transaction to get the layer 1 gas fee for.
 */
async function getTransactionLayer1GasFee({
  ethQuery,
  transactionMeta,
  layer1GasFeeFlows,
}: UpdateLayer1GasFeeRequest): Promise<Hex | undefined> {
  const layer1GasFeeFlow = getLayer1GasFeeFlow(
    transactionMeta,
    layer1GasFeeFlows,
  );
  if (!layer1GasFeeFlow) {
    log('Layer 1 gas fee flow not found', transactionMeta.id);
    return undefined;
  }

  try {
    const { layer1Fee } = await layer1GasFeeFlow.getLayer1Fee({
      ethQuery,
      transactionMeta,
    });
    return layer1Fee;
  } catch (error) {
    log('Failed to get layer 1 gas fee', transactionMeta.id, error);
    return undefined;
  }
}
