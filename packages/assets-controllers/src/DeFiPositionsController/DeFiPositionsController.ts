import type {
  AccountsControllerAccountAddedEvent,
  AccountsControllerListAccountsAction,
} from '@metamask/accounts-controller';
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
import {
  groupDeFiPositions,
  type GroupedDeFiPositions,
} from './group-defi-positions';
import { reduceInBatchesSerially } from '../assetsUtil';

const TEN_MINUTES_IN_MS = 600_000;

const FETCH_POSITIONS_BATCH_SIZE = 10;

const controllerName = 'DeFiPositionsController';

type GroupedDeFiPositionsPerChain = {
  [chain: Hex]: GroupedDeFiPositions;
};

export type DeFiPositionsControllerState = {
  /**
   * Object containing DeFi positions per account and network
   */
  allDeFiPositions: {
    [accountAddress: string]: GroupedDeFiPositionsPerChain | null;
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
  | TransactionControllerTransactionConfirmedEvent
  | AccountsControllerAccountAddedEvent;

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

  readonly #isEnabled: () => boolean;

  /**
   * DeFiPositionsController constuctor
   *
   * @param options - Constructor options.
   * @param options.messenger - The controller messenger.
   * @param options.isEnabled - Function that returns whether the controller is enabled. (default: () => true)
   */
  constructor({
    messenger,
    isEnabled = () => true,
  }: {
    messenger: DeFiPositionsControllerMessenger;
    isEnabled?: () => boolean;
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

    this.messagingSystem.subscribe('KeyringController:unlock', () => {
      this.startPolling(null);
    });

    this.messagingSystem.subscribe('KeyringController:lock', () => {
      this.stopAllPolling();
    });

    this.messagingSystem.subscribe(
      'TransactionController:transactionConfirmed',
      async (transactionMeta) => {
        if (!this.#isEnabled()) {
          return;
        }

        await this.#updateAccountPositions(transactionMeta.txParams.from);
      },
    );

    this.messagingSystem.subscribe(
      'AccountsController:accountAdded',
      async (account) => {
        if (!this.#isEnabled() || !account.type.startsWith('eip155:')) {
          return;
        }

        await this.#updateAccountPositions(account.address);
      },
    );
  }

  async _executePoll(): Promise<void> {
    if (!this.#isEnabled()) {
      return;
    }

    const accounts = this.messagingSystem.call(
      'AccountsController:listAccounts',
    );

    const initialResult: {
      accountAddress: string;
      positions: GroupedDeFiPositionsPerChain | null;
    }[] = [];

    const results = await reduceInBatchesSerially({
      initialResult,
      values: accounts,
      batchSize: FETCH_POSITIONS_BATCH_SIZE,
      eachBatch: async (workingResult, batch) => {
        const batchResults = (
          await Promise.all(
            batch.map(async ({ address: accountAddress, type }) => {
              if (type.startsWith('eip155:')) {
                const positions =
                  await this.#fetchAccountPositions(accountAddress);

                return {
                  accountAddress,
                  positions,
                };
              }

              return undefined;
            }),
          )
        ).filter(Boolean) as {
          accountAddress: string;
          positions: GroupedDeFiPositionsPerChain | null;
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
  ): Promise<GroupedDeFiPositionsPerChain | null> {
    try {
      const defiPositionsResponse = await this.#fetchPositions(accountAddress);

      return groupDeFiPositions(defiPositionsResponse);
    } catch {
      return null;
    }
  }
}
