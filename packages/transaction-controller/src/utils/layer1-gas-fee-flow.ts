import type { Provider } from '@metamask/network-controller';
import { createModuleLogger, type Hex } from '@metamask/utils';

import { projectLogger } from '../logger';
import type { TransactionControllerMessenger } from '../TransactionController';
import type { Layer1GasFeeFlow, TransactionMeta } from '../types';

const log = createModuleLogger(projectLogger, 'layer-1-gas-fee-flow');

export type UpdateLayer1GasFeeRequest = {
  layer1GasFeeFlows: Layer1GasFeeFlow[];
  messenger: TransactionControllerMessenger;
  provider: Provider;
  transactionMeta: TransactionMeta;
};

/**
 * Updates the given transactionMeta with the layer 1 gas fee.
 *
 * @param request - The request to use when getting the layer 1 gas fee.
 * @param request.provider - Provider used to create a new underlying EthQuery instance
 * @param request.transactionMeta - The transaction to get the layer 1 gas fee for.
 * @param request.layer1GasFeeFlows - The layer 1 gas fee flows to search.
 */
export async function updateTransactionLayer1GasFee(
  request: UpdateLayer1GasFeeRequest,
) {
  const layer1GasFee = await getTransactionLayer1GasFee(request);

  if (!layer1GasFee) {
    return;
  }

  const { transactionMeta } = request;

  transactionMeta.layer1GasFee = layer1GasFee;

  log('Updated layer 1 gas fee', layer1GasFee, transactionMeta.id);
}

/**
 * Get the layer 1 gas fee flow for a transaction.
 *
 * @param transactionMeta - The transaction to get the layer 1 gas fee flow for.
 * @param layer1GasFeeFlows - The layer 1 gas fee flows to search.
 * @param messenger - The messenger instance.
 * @returns The layer 1 gas fee flow for the transaction, or undefined if none match.
 */
function getLayer1GasFeeFlow(
  transactionMeta: TransactionMeta,
  layer1GasFeeFlows: Layer1GasFeeFlow[],
  messenger: TransactionControllerMessenger,
): Layer1GasFeeFlow | undefined {
  return layer1GasFeeFlows.find((layer1GasFeeFlow) =>
    layer1GasFeeFlow.matchesTransaction({
      transactionMeta,
      messenger,
    }),
  );
}

/**
 * Get the layer 1 gas fee for a transaction.
 *
 * @param request - The request to use when getting the layer 1 gas fee.
 * @param request.layer1GasFeeFlows - The layer 1 gas fee flows to search.
 * @param request.provider - The provider to use to get the layer 1 gas fee.
 * @param request.transactionMeta - The transaction to get the layer 1 gas fee for.
 * @param request.messenger - The messenger instance.
 * @returns The layer 1 gas fee.
 */
export async function getTransactionLayer1GasFee({
  layer1GasFeeFlows,
  messenger,
  provider,
  transactionMeta,
}: UpdateLayer1GasFeeRequest): Promise<Hex | undefined> {
  const layer1GasFeeFlow = getLayer1GasFeeFlow(
    transactionMeta,
    layer1GasFeeFlows,
    messenger,
  );

  if (!layer1GasFeeFlow) {
    return undefined;
  }

  log(
    'Found layer 1 gas fee flow',
    layer1GasFeeFlow.constructor.name,
    transactionMeta.id,
  );

  try {
    const { layer1Fee } = await layer1GasFeeFlow.getLayer1Fee({
      provider,
      transactionMeta,
    });
    return layer1Fee;
  } catch (error) {
    log('Failed to get layer 1 gas fee', transactionMeta.id, error);
    return undefined;
  }
}
