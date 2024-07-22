import type { Fragment } from '@ethersproject/abi';
import { type Hex } from '@metamask/utils';
import type { SimulationData } from '../types';
import { SimulationTokenStandard } from '../types';
import type { SimulationResponse } from './simulation-api';
export declare enum SupportedToken {
    ERC20 = "erc20",
    ERC721 = "erc721",
    ERC1155 = "erc1155",
    ERC20_WRAPPED = "erc20Wrapped",
    ERC721_LEGACY = "erc721Legacy"
}
type ABI = Fragment[];
export type GetSimulationDataRequest = {
    chainId: Hex;
    from: Hex;
    to?: Hex;
    value?: Hex;
    data?: Hex;
};
type ParsedEvent = {
    contractAddress: Hex;
    tokenStandard: SimulationTokenStandard;
    name: string;
    args: Record<string, Hex | Hex[]>;
    abi: ABI;
};
/**
 * Generate simulation data for a transaction.
 * @param request - The transaction to simulate.
 * @param request.chainId - The chain ID of the transaction.
 * @param request.from - The sender of the transaction.
 * @param request.to - The recipient of the transaction.
 * @param request.value - The value of the transaction.
 * @param request.data - The data of the transaction.
 * @returns The simulation data.
 */
export declare function getSimulationData(request: GetSimulationDataRequest): Promise<SimulationData>;
/**
 * Extract events from a simulation response.
 * @param response - The simulation response.
 * @returns The parsed events.
 */
export declare function getEvents(response: SimulationResponse): ParsedEvent[];
export {};
//# sourceMappingURL=simulation.d.ts.map