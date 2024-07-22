import type { Provider } from '@metamask/network-controller';
import { type Hex } from '@metamask/utils';
import type { Layer1GasFeeFlow, TransactionMeta } from '../types';
export type UpdateLayer1GasFeeRequest = {
    layer1GasFeeFlows: Layer1GasFeeFlow[];
    provider: Provider;
    transactionMeta: TransactionMeta;
};
/**
 * Updates the given transactionMeta with the layer 1 gas fee.
 * @param request - The request to use when getting the layer 1 gas fee.
 * @param request.provider - Provider used to create a new underlying EthQuery instance
 * @param request.transactionMeta - The transaction to get the layer 1 gas fee for.
 * @param request.layer1GasFeeFlows - The layer 1 gas fee flows to search.
 */
export declare function updateTransactionLayer1GasFee(request: UpdateLayer1GasFeeRequest): Promise<void>;
/**
 * Get the layer 1 gas fee for a transaction and return the layer1Fee.
 * @param request - The request to use when getting the layer 1 gas fee.
 * @param request.layer1GasFeeFlows - The layer 1 gas fee flows to search.
 * @param request.provider - The provider to use to get the layer 1 gas fee.
 * @param request.transactionMeta - The transaction to get the layer 1 gas fee for.
 */
export declare function getTransactionLayer1GasFee({ layer1GasFeeFlows, provider, transactionMeta, }: UpdateLayer1GasFeeRequest): Promise<Hex | undefined>;
//# sourceMappingURL=layer1-gas-fee-flow.d.ts.map