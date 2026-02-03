import type {
  AccountTreeControllerGetAccountsFromSelectedAccountGroupAction,
  AccountTreeControllerSelectedAccountGroupChangeEvent,
} from '@metamask/account-tree-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { isEvmAccountType } from '@metamask/keyring-api';
import type { KeyringControllerLockEvent } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { Messenger } from '@metamask/messenger';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type { TransactionControllerTransactionConfirmedEvent } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { calculateDeFiPositionMetrics } from './calculate-defi-metrics';
import type { DefiPositionResponse } from './fetch-positions';
import { buildPositionFetcher } from './fetch-positions';
import { groupDeFiPositions } from './group-defi-positions';
import type { GroupedDeFiPositions } from './group-defi-positions';

const TEN_MINUTES_IN_MS = 600_000;

const controllerName = 'DeFiPositionsController';

export type GroupedDeFiPositionsPerChain = {
  [chain: Hex]: GroupedDeFiPositions;
};

export type TrackingEventPayload = {
  event: string;
  category: string;
  properties: {
    totalPositions: number;
    totalMarketValueUSD: number;
    breakdown?: {
      protocolId: string;
      marketValueUSD: number;
      chainId: Hex;
      count: number;
    }[];
  };
};

type TrackEventHook = (event: TrackingEventPayload) => void;

export type DeFiPositionsControllerState = {
  /**
   * Object containing DeFi positions per account and network
   */
  allDeFiPositions: {
    [accountAddress: string]: GroupedDeFiPositionsPerChain | null;
  };

  /**
   * Object containing DeFi positions count per account
   */
  allDeFiPositionsCount: {
    [accountAddress: string]: number;
  };
};

const controllerMetadata: StateMetadata<DeFiPositionsControllerState> = {
  allDeFiPositions: {
    includeInStateLogs: false,
    persist: false,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
  allDeFiPositionsCount: {
    includeInStateLogs: false,
    persist: false,
    includeInDebugSnapshot: false,
    usedInUi: false,
  },
};

export const getDefaultDefiPositionsControllerState =
  (): DeFiPositionsControllerState => {
    return {
      allDeFiPositions: {},
      allDeFiPositionsCount: {},
    };
  };

export type DeFiPositionsControllerActions =
  DeFiPositionsControllerGetStateAction;

export type DeFiPositionsControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  DeFiPositionsControllerState
>;

export type DeFiPositionsControllerEvents =
  DeFiPositionsControllerStateChangeEvent;

export type DeFiPositionsControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    DeFiPositionsControllerState
  >;

/**
 * The external actions available to the {@link DeFiPositionsController}.
 */
export type AllowedActions =
  AccountTreeControllerGetAccountsFromSelectedAccountGroupAction;

/**
 * The external events available to the {@link DeFiPositionsController}.
 */
export type AllowedEvents =
  | KeyringControllerLockEvent
  | TransactionControllerTransactionConfirmedEvent
  | AccountTreeControllerSelectedAccountGroupChangeEvent;

/**
 * The messenger of the {@link DeFiPositionsController}.
 */
export type DeFiPositionsControllerMessenger = Messenger<
  typeof controllerName,
  DeFiPositionsControllerActions | AllowedActions,
  DeFiPositionsControllerEvents | AllowedEvents
>;

/**
 * Controller that stores assets and exposes convenience methods
 */
export class DeFiPositionsController extends StaticIntervalPollingController()<
  typeof controllerName,
  DeFiPositionsControllerState,
  DeFiPositionsControllerMessenger
> {
  readonly #fetchPositions: (
    accountAddress: string,
  ) => Promise<DefiPositionResponse[]>;

  readonly #isEnabled: () => boolean;

  readonly #trackEvent?: TrackEventHook;

  /**
   * DeFiPositionsController constuctor
   *
   * @param options - Constructor options.
   * @param options.messenger - The controller messenger.
   * @param options.isEnabled - Function that returns whether the controller is enabled. (default: () => true)
   * @param options.trackEvent - Function to track events. (default: undefined)
   */
  constructor({
    messenger,
    isEnabled = () => true,
    trackEvent,
  }: {
    messenger: DeFiPositionsControllerMessenger;
    isEnabled?: () => boolean;
    trackEvent?: TrackEventHook;
  }) {
    super({
      name: controllerName,
      metadata: controllerMetadata,
      messenger,
      state: getDefaultDefiPositionsControllerState(),
    });

    this.setIntervalLength(TEN_MINUTES_IN_MS);

    this.#fetchPositions = buildPositionFetcher();
    this.#isEnabled = isEnabled;

    this.messenger.subscribe('KeyringController:lock', () => {
      this.stopAllPolling();
    });

    this.messenger.subscribe(
      'TransactionController:transactionConfirmed',
      async (transactionMeta) => {
        const selectedAddress = this.#getSelectedEvmAdress();

        if (
          selectedAddress?.toLowerCase() !== transactionMeta.txParams.from.toLowerCase()
        ) {
          return;
        }

        await this.#updateAccountPositions(selectedAddress);
      },
    );

    this.messenger.subscribe(
      'AccountTreeController:selectedAccountGroupChange',
      async () => {
        const selectedAddress = this.#getSelectedEvmAdress();

        if (!selectedAddress) {
          return;
        }

        await this.#updateAccountPositions(selectedAddress);
      },
    );

    this.#trackEvent = trackEvent;
  }

  async _executePoll(): Promise<void> {
    if (!this.#isEnabled()) {
      return;
    }

    const selectedAddress = this.#getSelectedEvmAdress();

    if (!selectedAddress) {
      return;
    }

    const accountPositions = await this.#fetchAccountPositions(selectedAddress);

    this.update((state) => {
      state.allDeFiPositions[selectedAddress] = accountPositions;
    });
  }

  async #updateAccountPositions(accountAddress: string): Promise<void> {
    if (!this.#isEnabled()) {
      return;
    }

    const accountPositionsPerChain =
      await this.#fetchAccountPositions(accountAddress);

    this.update((state) => {
      state.allDeFiPositions[accountAddress] = accountPositionsPerChain;
    });
  }

  async #fetchAccountPositions(
    accountAddress: string,
  ): Promise<GroupedDeFiPositionsPerChain | null> {
    try {
      const defiPositionsResponse = await this.#fetchPositions(accountAddress);

      const groupedDeFiPositions = groupDeFiPositions(defiPositionsResponse);

      try {
        this.#updatePositionsCountMetrics(groupedDeFiPositions, accountAddress);
      } catch (error) {
        console.error(
          `Failed to update positions count for account ${accountAddress}:`,
          error,
        );
      }

      return groupedDeFiPositions;
    } catch {
      return null;
    }
  }

  #updatePositionsCountMetrics(
    groupedDeFiPositions: GroupedDeFiPositionsPerChain,
    accountAddress: string,
  ) {
    // If no track event passed then skip the metrics update
    if (!this.#trackEvent) {
      return;
    }

    const defiMetrics = calculateDeFiPositionMetrics(groupedDeFiPositions);
    const { totalPositions } = defiMetrics.properties;

    if (totalPositions !== this.state.allDeFiPositionsCount[accountAddress]) {
      this.update((state) => {
        state.allDeFiPositionsCount[accountAddress] = totalPositions;
      });

      this.#trackEvent?.(defiMetrics);
    }
  }

  #getSelectedEvmAdress(): string | undefined {
    return this.messenger
      .call('AccountTreeController:getAccountsFromSelectedAccountGroup')
      .find((account: InternalAccount) => isEvmAccountType(account.type))
      ?.address;
  }
}
