import type { GasFeeFlow, GasFeeFlowRequest, GasFeeFlowResponse, TransactionMeta } from '../types';
/**
 * The standard implementation of a gas fee flow that obtains gas fee estimates using only the GasFeeController.
 */
export declare class DefaultGasFeeFlow implements GasFeeFlow {
    #private;
    matchesTransaction(_transactionMeta: TransactionMeta): boolean;
    getGasFees(request: GasFeeFlowRequest): Promise<GasFeeFlowResponse>;
}
//# sourceMappingURL=DefaultGasFeeFlow.d.ts.map