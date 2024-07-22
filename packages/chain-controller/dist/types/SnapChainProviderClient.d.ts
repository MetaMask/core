import type { Chain, CaipAssetTypeOrId, BalancesResult } from '@metamask/chain-api';
import type { CaipChainId } from '@metamask/utils';
import type { SnapHandlerClient } from './SnapHandlerClient';
/**
 * Snap client that implement the Chain API.
 */
export declare class SnapChainProviderClient implements Chain {
    #private;
    /**
     * Constructor for `SnapChainProviderClient`.
     *
     * @param client - A Snap handler client.
     */
    constructor(client: SnapHandlerClient);
    /**
     * Fetches asset balances for each given accounts.
     *
     * @param scope - CAIP-2 chain ID that must compatible with `accounts`.
     * @param accounts - Accounts (addresses).
     * @param assets - List of CAIP-19 asset identifiers to fetch balances from.
     * @returns Assets balances for each accounts.
     */
    getBalances: (scope: CaipChainId, accounts: string[], assets: CaipAssetTypeOrId[]) => Promise<BalancesResult>;
}
//# sourceMappingURL=SnapChainProviderClient.d.ts.map