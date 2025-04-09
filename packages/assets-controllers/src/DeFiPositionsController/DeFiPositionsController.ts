import type { AccountsControllerListAccountsAction } from '@metamask/accounts-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedMessenger,
  StateMetadata,
} from '@metamask/base-controller';
import type { KeyringControllerUnlockEvent } from '@metamask/keyring-controller';
import type { KeyringControllerLockEvent } from '@metamask/keyring-controller';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type { TransactionControllerTransactionConfirmedEvent } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import type { DefiPositionResponse } from './fetch-positions';
import { buildPositionFetcher } from './fetch-positions';
import { groupPositions, type GroupedPositions } from './group-positions';
import { reduceInBatchesSerially } from '../assetsUtil';

const TEN_MINUTES_IN_MS = 60_000;

const FETCH_POSITIONS_BATCH_SIZE = 10;

const controllerName = 'DeFiPositionsController';

type GroupedPositionsPerChain = {
  [chain: Hex]: GroupedPositions;
};

export type DeFiPositionsControllerState = {
  /**
   * Object containing DeFi positions per account and network
   */
  allDeFiPositions: {
    [accountAddress: string]: GroupedPositionsPerChain | null;
  };
};

const controllerMetadata: StateMetadata<DeFiPositionsControllerState> = {
  allDeFiPositions: {
    persist: false,
    anonymous: false,
  },
};

export const getDefaultDefiPositionsControllerState =
  (): DeFiPositionsControllerState => {
    return {
      allDeFiPositions: {},
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
export type AllowedActions = AccountsControllerListAccountsAction;

/**
 * The external events available to the {@link DeFiPositionsController}.
 */
export type AllowedEvents =
  | KeyringControllerUnlockEvent
  | KeyringControllerLockEvent
  | TransactionControllerTransactionConfirmedEvent;

/**
 * The messenger of the {@link DeFiPositionsController}.
 */
export type DeFiPositionsControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  DeFiPositionsControllerActions | AllowedActions,
  DeFiPositionsControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
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

  /**
   * Tokens controller options
   *
   * @param options - Constructor options.
   * @param options.messenger - The controller messenger.
   * @param options.apiUrl - Override for the API URL to use for fetching DeFi positions.
   * @param options.interval - Override for the interval to use for polling DeFi positions. (default: 10 minutes)
   * @param options.isEnabled - Whether the controller is enabled. (default: true)
   */
  constructor({
    messenger,
    apiUrl,
    interval = TEN_MINUTES_IN_MS,
    isEnabled = true,
  }: {
    messenger: DeFiPositionsControllerMessenger;
    apiUrl?: string;
    interval?: number;
    isEnabled?: boolean;
  }) {
    super({
      name: controllerName,
      metadata: controllerMetadata,
      messenger,
      state: getDefaultDefiPositionsControllerState(),
    });

    this.setIntervalLength(interval);

    this.#fetchPositions = buildPositionFetcher(apiUrl);

    this.messagingSystem.subscribe('KeyringController:unlock', async () => {
      if (!isEnabled) {
        return;
      }

      this.startPolling(null);
    });

    this.messagingSystem.subscribe('KeyringController:lock', () => {
      if (!isEnabled) {
        return;
      }

      this.stopAllPolling();
    });

    this.messagingSystem.subscribe(
      'TransactionController:transactionConfirmed',
      async (transactionMeta) => {
        if (!isEnabled) {
          return;
        }

        const accountAddress = transactionMeta.txParams.from;
        await this.#updateAccountPositions(accountAddress);
      },
    );
  }

  async _executePoll(): Promise<void> {
    const accounts = this.messagingSystem.call(
      'AccountsController:listAccounts',
    );

    const results = await reduceInBatchesSerially({
      initialResult: [] as {
        accountAddress: string;
        positions: GroupedPositionsPerChain | null;
      }[],
      values: accounts,
      batchSize: FETCH_POSITIONS_BATCH_SIZE,
      eachBatch: async (workingResult, batch) => {
        const batchResults = (
          await Promise.all(
            batch.map(async ({ address: accountAddress, type }) => {
              if (type.startsWith('eip155:')) {
                try {
                  const positions =
                    await this.#fetchAccountPositions(accountAddress);

                  return {
                    accountAddress,
                    positions,
                  };
                } catch (error) {
                  return {
                    accountAddress,
                    positions: null,
                  };
                }
              }

              return undefined;
            }),
          )
        ).filter(Boolean) as {
          accountAddress: string;
          positions: GroupedPositionsPerChain | null;
        }[];

        return [...workingResult, ...batchResults];
      },
    });

    const allDefiPositions = results.reduce(
      (acc, { accountAddress, positions }) => {
        acc[accountAddress] = positions;
        return acc;
      },
      {} as DeFiPositionsControllerState['allDeFiPositions'],
    );

    this.update((state) => {
      state.allDeFiPositions = allDefiPositions;
    });
  }

  async #updateAccountPositions(accountAddress: string): Promise<void> {
    const accountPositionsPerChain =
      await this.#fetchAccountPositions(accountAddress);

    this.update((state) => {
      state.allDeFiPositions[accountAddress] = accountPositionsPerChain;
    });
  }

  async #fetchAccountPositions(
    accountAddress: string,
  ): Promise<GroupedPositionsPerChain> {
    const defiPositionsResponse = await this.#fetchPositions(accountAddress);

    return groupPositions(defiPositionsResponse);
  }
}
