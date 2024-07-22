import type EthQuery from '@metamask/eth-query';
import type { FetchGasFeeEstimateOptions, GasFeeState } from '@metamask/gas-fee-controller';
import type { Hex } from '@metamask/utils';
import type { SavedGasFees, TransactionParams, TransactionMeta, GasFeeFlow } from '../types';
export type UpdateGasFeesRequest = {
    eip1559: boolean;
    ethQuery: EthQuery;
    gasFeeFlows: GasFeeFlow[];
    getGasFeeEstimates: (options: FetchGasFeeEstimateOptions) => Promise<GasFeeState>;
    getSavedGasFees: (chainId: Hex) => SavedGasFees | undefined;
    txMeta: TransactionMeta;
};
export type GetGasFeeRequest = UpdateGasFeesRequest & {
    initialParams: TransactionParams;
    savedGasFees?: SavedGasFees;
    suggestedGasFees: SuggestedGasFees;
};
type SuggestedGasFees = {
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
    gasPrice?: string;
};
export declare function updateGasFees(request: UpdateGasFeesRequest): Promise<void>;
export declare function gweiDecimalToWeiHex(value: string): `0x${string}`;
export {};
//# sourceMappingURL=gas-fees.d.ts.map