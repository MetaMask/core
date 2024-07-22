import type { GasFeeFlow, GasFeeFlowRequest, GasFeeFlowResponse, TransactionMeta } from '../types';
/**
 * Implementation of a gas fee flow specific to Linea networks that obtains gas fee estimates using:
 * - The `linea_estimateGas` RPC method to obtain the base fee and lowest priority fee.
 * - Static multipliers to increase the base and priority fees.
 */
export declare class LineaGasFeeFlow implements GasFeeFlow {
    #private;
    matchesTransaction(transactionMeta: TransactionMeta): boolean;
    getGasFees(request: GasFeeFlowRequest): Promise<GasFeeFlowResponse>;
}
//# sourceMappingURL=LineaGasFeeFlow.d.ts.map