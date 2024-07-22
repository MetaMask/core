import type { Hex } from '@metamask/utils';
export declare class SimulationError extends Error {
    code?: string | number;
    constructor(message?: string, code?: string | number);
}
export declare class SimulationChainNotSupportedError extends SimulationError {
    constructor(chainId: Hex);
}
export declare class SimulationInvalidResponseError extends SimulationError {
    constructor();
}
export declare class SimulationRevertedError extends SimulationError {
    constructor();
}
//# sourceMappingURL=errors.d.ts.map