import type { TransactionMeta } from '../types';
import { OracleLayer1GasFeeFlow } from './OracleLayer1GasFeeFlow';
/**
 * Optimism layer 1 gas fee flow that obtains gas fee estimate using an oracle contract.
 */
export declare class OptimismLayer1GasFeeFlow extends OracleLayer1GasFeeFlow {
    constructor();
    matchesTransaction(transactionMeta: TransactionMeta): boolean;
}
//# sourceMappingURL=OptimismLayer1GasFeeFlow.d.ts.map