import { type Hex } from '@metamask/utils';
/** Single transaction to simulate in a simulation API request.  */
export type SimulationRequestTransaction = {
    /** Data to send with the transaction. */
    data?: Hex;
    /** Sender of the transaction. */
    from: Hex;
    /** Gas limit for the transaction. */
    gas?: Hex;
    /** Maximum fee per gas for the transaction. */
    maxFeePerGas?: Hex;
    /** Maximum priority fee per gas for the transaction. */
    maxPriorityFeePerGas?: Hex;
    /** Recipient of the transaction. */
    to?: Hex;
    /** Value to send with the transaction. */
    value?: Hex;
};
/** Request to the simulation API to simulate transactions. */
export type SimulationRequest = {
    /**
     * Transactions to be sequentially simulated.
     * State changes impact subsequent transactions in the list.
     */
    transactions: SimulationRequestTransaction[];
    /**
     * Overrides to the state of the blockchain, keyed by smart contract address.
     */
    overrides?: {
        [address: Hex]: {
            /** Overrides to the storage slots for a smart contract account. */
            stateDiff: {
                [slot: Hex]: Hex;
            };
        };
    };
    /**
     * Whether to include call traces in the response.
     * Defaults to false.
     */
    withCallTrace?: boolean;
    /**
     * Whether to include event logs in the response.
     * Defaults to false.
     */
    withLogs?: boolean;
};
/** Raw event log emitted by a simulated transaction. */
export type SimulationResponseLog = {
    /** Address of the account that created the event. */
    address: Hex;
    /** Raw data in the event that is not indexed. */
    data: Hex;
    /** Raw indexed data from the event. */
    topics: Hex[];
};
/** Call trace of a single simulated transaction. */
export type SimulationResponseCallTrace = {
    /** Nested calls. */
    calls: SimulationResponseCallTrace[];
    /** Raw event logs created by the call. */
    logs: SimulationResponseLog[];
};
/**
 * Changes to the blockchain state.
 * Keyed by account address.
 */
export type SimulationResponseStateDiff = {
    [address: Hex]: {
        /** Native balance of the account. */
        balance?: Hex;
        /** Nonce of the account. */
        nonce?: Hex;
        /** Storage values per slot. */
        storage?: {
            [slot: Hex]: Hex;
        };
    };
};
/** Response from the simulation API for a single transaction. */
export type SimulationResponseTransaction = {
    /** An error message indicating the transaction could not be simulated. */
    error?: string;
    /** Return value of the transaction, such as the balance if calling balanceOf. */
    return: Hex;
    /** Hierarchy of call data including nested calls and logs. */
    callTrace?: SimulationResponseCallTrace;
    /** Changes to the blockchain state. */
    stateDiff?: {
        /** Initial blockchain state before the transaction. */
        pre?: SimulationResponseStateDiff;
        /** Updated blockchain state after the transaction. */
        post?: SimulationResponseStateDiff;
    };
};
/** Response from the simulation API. */
export type SimulationResponse = {
    /** Simulation data for each transaction in the request. */
    transactions: SimulationResponseTransaction[];
};
/**
 * Simulate transactions using the transaction simulation API.
 * @param chainId - The chain ID to simulate transactions on.
 * @param request - The request to simulate transactions.
 */
export declare function simulateTransactions(chainId: Hex, request: SimulationRequest): Promise<SimulationResponse>;
//# sourceMappingURL=simulation-api.d.ts.map