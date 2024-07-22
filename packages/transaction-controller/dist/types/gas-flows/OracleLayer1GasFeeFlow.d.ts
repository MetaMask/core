import type { Hex } from '@metamask/utils';
import type { Layer1GasFeeFlow, Layer1GasFeeFlowRequest, Layer1GasFeeFlowResponse, TransactionMeta } from '../types';
/**
 * Layer 1 gas fee flow that obtains gas fee estimate using an oracle smart contract.
 */
export declare abstract class OracleLayer1GasFeeFlow implements Layer1GasFeeFlow {
    #private;
    constructor(oracleAddress: Hex, signTransaction?: boolean);
    abstract matchesTransaction(transactionMeta: TransactionMeta): boolean;
    getLayer1Fee(request: Layer1GasFeeFlowRequest): Promise<Layer1GasFeeFlowResponse>;
}
//# sourceMappingURL=OracleLayer1GasFeeFlow.d.ts.map