import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';

import type { ComplianceControllerMethodActions } from './ComplianceController-method-action-types';
import type {
  ComplianceServiceCheckWalletComplianceAction,
  ComplianceServiceCheckWalletsComplianceAction,
} from './ComplianceService-method-action-types';
import type { WalletComplianceStatus } from './types';

// === GENERAL ===

/**
 * The name of the {@link ComplianceController}, used to namespace the
 * controller's actions and events and to namespace the controller's state data
 * when composed with other controllers.
 */
export const controllerName = 'ComplianceController';

// === STATE ===

/**
 * Describes the shape of the state object for {@link ComplianceController}.
 */
export type ComplianceControllerState = {
  /**
   * A map of wallet addresses to their compliance check results, used as a
   * fallback cache when the API is unavailable.
   */
  walletComplianceStatusMap: Record<string, WalletComplianceStatus>;

  /**
   * The date/time (in ISO-8601 format) when the last compliance check was
   * performed, or `null` if no checks have been performed yet.
   */
  lastCheckedAt: string | null;
};

/**
 * The metadata for each property in {@link ComplianceControllerState}.
 */
const complianceControllerMetadata = {
  walletComplianceStatusMap: {
    includeInDebugSnapshot: false,
    includeInStateLogs: false,
    persist: true,
    usedInUi: true,
  },
  lastCheckedAt: {
    includeInDebugSnapshot: false,
    includeInStateLogs: true,
    persist: true,
    usedInUi: false,
  },
} satisfies StateMetadata<ComplianceControllerState>;

/**
 * Constructs the default {@link ComplianceController} state. This allows
 * consumers to provide a partial state object when initializing the controller
 * and also helps in constructing complete state objects for this controller in
 * tests.
 *
 * @returns The default {@link ComplianceController} state.
 */
export function getDefaultComplianceControllerState(): ComplianceControllerState {
  return {
    walletComplianceStatusMap: {},
    lastCheckedAt: null,
  };
}

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = [
  'checkWalletCompliance',
  'checkWalletsCompliance',
  'clearComplianceState',
] as const;

/**
 * Retrieves the state of the {@link ComplianceController}.
 */
export type ComplianceControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  ComplianceControllerState
>;

/**
 * Actions that {@link ComplianceController} exposes to other consumers.
 */
export type ComplianceControllerActions =
  | ComplianceControllerGetStateAction
  | ComplianceControllerMethodActions;

/**
 * Actions from other messengers that {@link ComplianceController} calls.
 */
type AllowedActions =
  | ComplianceServiceCheckWalletComplianceAction
  | ComplianceServiceCheckWalletsComplianceAction;

/**
 * Published when the state of {@link ComplianceController} changes.
 */
export type ComplianceControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  ComplianceControllerState
>;

/**
 * Events that {@link ComplianceController} exposes to other consumers.
 */
export type ComplianceControllerEvents = ComplianceControllerStateChangeEvent;

/**
 * Events from other messengers that {@link ComplianceController} subscribes to.
 */
type AllowedEvents = never;

/**
 * The messenger restricted to actions and events accessed by
 * {@link ComplianceController}.
 */
export type ComplianceControllerMessenger = Messenger<
  typeof controllerName,
  ComplianceControllerActions | AllowedActions,
  ComplianceControllerEvents | AllowedEvents
>;

// === CONTROLLER DEFINITION ===

/**
 * `ComplianceController` manages OFAC compliance state for wallet addresses.
 * It performs on-demand compliance checks via the API and caches results
 * per address in state. Cached results serve as a fallback if the API is
 * unavailable for a subsequent check on the same address.
 */
export class ComplianceController extends BaseController<
  typeof controllerName,
  ComplianceControllerState,
  ComplianceControllerMessenger
> {
  /**
   * Constructs a new {@link ComplianceController}.
   *
   * @param args - The constructor arguments.
   * @param args.messenger - The messenger suited for this controller.
   * @param args.state - The desired state with which to init this
   * controller. Missing properties will be filled in with defaults.
   */
  constructor({
    messenger,
    state,
  }: {
    messenger: ComplianceControllerMessenger;
    state?: Partial<ComplianceControllerState>;
  }) {
    super({
      messenger,
      metadata: complianceControllerMetadata,
      name: controllerName,
      state: {
        ...getDefaultComplianceControllerState(),
        ...state,
      },
    });

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Checks compliance status for a single wallet address via the API and
   * persists the result to state. If the API call fails and a previously
   * cached result exists for the address, the cached result is returned as a
   * fallback. If no cached result exists, the error is re-thrown.
   *
   * @param address - The wallet address to check.
   * @returns The compliance status of the wallet.
   */
  async checkWalletCompliance(
    address: string,
  ): Promise<WalletComplianceStatus> {
    try {
      const result = await this.messenger.call(
        'ComplianceService:checkWalletCompliance',
        address,
      );

      const now = new Date().toISOString();
      const status: WalletComplianceStatus = {
        address: result.address,
        blocked: result.blocked,
        checkedAt: now,
      };

      this.update((draftState) => {
        draftState.walletComplianceStatusMap[address] = status;
        draftState.lastCheckedAt = now;
      });

      return status;
    } catch (error) {
      const cached = this.state.walletComplianceStatusMap[address];
      if (cached) {
        return cached;
      }
      throw error;
    }
  }

  /**
   * Checks compliance status for multiple wallet addresses via the API and
   * persists the results to state. If the API call fails and every requested
   * address has a previously cached result, those cached results are returned
   * as a fallback. If any address lacks a cached result, the error is
   * re-thrown.
   *
   * @param addresses - The wallet addresses to check.
   * @returns The compliance statuses of the wallets.
   */
  async checkWalletsCompliance(
    addresses: string[],
  ): Promise<WalletComplianceStatus[]> {
    try {
      const results = await this.messenger.call(
        'ComplianceService:checkWalletsCompliance',
        addresses,
      );

      const now = new Date().toISOString();
      const statuses: WalletComplianceStatus[] = results.map((result) => ({
        address: result.address,
        blocked: result.blocked,
        checkedAt: now,
      }));

      this.update((draftState) => {
        for (let idx = 0; idx < statuses.length; idx++) {
          const callerAddress = addresses[idx];
          draftState.walletComplianceStatusMap[callerAddress] = statuses[idx];
        }
        draftState.lastCheckedAt = now;
      });

      return statuses;
    } catch (error) {
      const cachedStatuses = addresses.map(
        (address) => this.state.walletComplianceStatusMap[address],
      );
      if (cachedStatuses.every(Boolean)) {
        return cachedStatuses;
      }
      throw error;
    }
  }

  /**
   * Clears all compliance data from state.
   */
  clearComplianceState(): void {
    this.update((draftState) => {
      draftState.walletComplianceStatusMap = {};
      draftState.lastCheckedAt = null;
    });
  }
}
