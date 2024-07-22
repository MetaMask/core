import { type GasFeeFlow, type GasFeeFlowRequest, type GasFeeFlowResponse, type TransactionMeta } from '../types';
/**
 * A gas fee flow to facilitate testing in the clients.
 * Increments the total gas fee by a fixed amount each time it is called.
 * Relies on the transaction's gas value to generate a distinct total fee in the UI.
 */
export declare class TestGasFeeFlow implements GasFeeFlow {
    #private;
    matchesTransaction(_transactionMeta: TransactionMeta): boolean;
    getGasFees(request: GasFeeFlowRequest): Promise<GasFeeFlowResponse>;
}
//# sourceMappingURL=TestGasFeeFlow.d.ts.map