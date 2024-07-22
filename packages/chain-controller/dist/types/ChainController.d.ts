import type { ControllerGetStateAction, ControllerStateChangeEvent, RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { CaipAssetType, BalancesResult, Chain } from '@metamask/chain-api';
import type { InternalAccount } from '@metamask/keyring-api';
import type { HandleSnapRequest as SnapControllerHandleSnapRequestAction } from '@metamask/snaps-controllers';
import type { SnapId } from '@metamask/snaps-sdk';
import type { CaipChainId } from '@metamask/utils';
import { SnapChainProviderClient } from './SnapChainProviderClient';
declare const controllerName = "ChainController";
export type ChainControllerState = Record<string, never>;
export type ChainControllerGetStateAction = ControllerGetStateAction<typeof controllerName, ChainControllerState>;
export type AllowedActions = SnapControllerHandleSnapRequestAction;
export type ChainControllerActions = never;
export type ChainControllerChangeEvent = ControllerStateChangeEvent<typeof controllerName, ChainControllerState>;
export type AllowedEvents = ChainControllerEvents;
export type ChainControllerEvents = ChainControllerChangeEvent;
export type ChainControllerMessenger = RestrictedControllerMessenger<typeof controllerName, ChainControllerActions | AllowedActions, ChainControllerEvents | AllowedEvents, AllowedActions['type'], AllowedEvents['type']>;
/**
 * Controller that manages chain-agnostic providers throught the chain API.
 */
export declare class ChainController extends BaseController<typeof controllerName, ChainControllerState, ChainControllerMessenger> implements Chain {
    #private;
    /**
     * Constructor for ChainController.
     *
     * @param options - The controller options.
     * @param options.messenger - The messenger object.
     * @param options.state - Initial state to set on this controller
     */
    constructor({ messenger, state, }: {
        messenger: ChainControllerMessenger;
        state?: ChainControllerState;
    });
    /**
     * Fetches asset balances for each given accounts.
     *
     * @param scope - CAIP-2 chain ID that must compatible with `accounts`.
     * @param accounts - Accounts (addresses).
     * @param assets - List of CAIP-19 asset identifiers to fetch balances from.
     * @returns Assets balances for each accounts.
     */
    getBalances: (scope: CaipChainId, accounts: string[], assets: CaipAssetType[]) => Promise<BalancesResult>;
    /**
     * Fetches asset balances for a given internal account.
     *
     * @param scope - CAIP-2 chain ID that must compatible with `accounts`.
     * @param account - The internal account.
     * @param assets - List of CAIP-19 asset identifiers to fetch balances from.
     * @returns Assets balances for the internal accounts.
     */
    getBalancesFromAccount: (scope: CaipChainId, account: InternalAccount, assets: CaipAssetType[]) => Promise<BalancesResult>;
    /**
     * Checks whether a chain provider has been registered for a given scope.
     *
     * @param scope - CAIP-2 chain ID.
     * @returns True if there is a registerd provider, false otherwise.
     */
    hasProviderFor(scope: CaipChainId): boolean;
    /**
     * Registers a Snap chain provider for a given scope.
     *
     * @param scope - CAIP-2 chain ID.
     * @param snapId - Snap ID that implements the Chain API methods.
     * @returns A SnapChainProviderClient for this Snap.
     */
    registerProvider(scope: CaipChainId, snapId: SnapId): SnapChainProviderClient;
}
export {};
//# sourceMappingURL=ChainController.d.ts.map