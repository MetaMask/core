import type {
  AuthenticatedUserStorageServiceCreateDelegationAction,
  AuthenticatedUserStorageServiceListDelegationsAction,
} from '@metamask/authenticated-user-storage';
import type {
  ControllerGetStateAction,
  ControllerStateChangedEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type {
  ChompApiServiceAssociateAddressAction,
  ChompApiServiceCreateIntentsAction,
  ChompApiServiceCreateUpgradeAction,
  ChompApiServiceGetAssociatedAddressesAction,
  ChompApiServiceGetIntentsByAddressAction,
  ChompApiServiceGetServiceDetailsAction,
  ChompApiServiceVerifyDelegationAction,
} from '@metamask/chomp-api-service';
import type { DelegationControllerSignDelegationAction } from '@metamask/delegation-controller';
import { DELEGATOR_CONTRACTS } from '@metamask/delegation-deployments';
import type {
  KeyringControllerSignEip7702AuthorizationAction,
  KeyringControllerSignPersonalMessageAction,
} from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';
import type {
  NetworkControllerFindNetworkClientIdByChainIdAction,
  NetworkControllerGetNetworkClientByIdAction,
} from '@metamask/network-controller';
import { hexToNumber } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import {
  MoneyAccountUpgradeStepError,
  isMoneyAccountUpgradeStepError,
  isTerminalMoneyAccountUpgradeError,
} from './errors';
import type { MoneyAccountUpgradeControllerMethodActions } from './MoneyAccountUpgradeController-method-action-types';
import { associateAddressStep } from './steps/associate-address';
import { buildDelegationStep } from './steps/build-delegations';
import { eip7702AuthorizationStep } from './steps/eip-7702-authorization';
import { registerIntentsStep } from './steps/register-intents';
import type { Step } from './steps/step';
import type { UpgradeConfig } from './types';

/**
 * The Delegation Framework deployment version we resolve contract addresses
 * against in `@metamask/delegation-deployments`.
 */
const DELEGATION_FRAMEWORK_VERSION = '1.3.0';

export const controllerName = 'MoneyAccountUpgradeController';

/**
 * Delays between retry attempts in
 * {@link MoneyAccountUpgradeController.upgradeAccountWithRetry}. Once the
 * schedule is exhausted the last delay repeats.
 */
const RETRY_DELAYS_MS = [10_000, 20_000, 40_000, 60_000];

const DEFAULT_MAX_RETRY_ATTEMPTS = 5;

const RETRY_ABORTED_MESSAGE = 'Money Account upgrade retry aborted';

/**
 * Record of a Money Account upgrade sequence that ran to completion.
 */
export type MoneyAccountUpgradeStatus = {
  /**
   * Fingerprint of the upgrade config the sequence completed under. The
   * record is only trusted while the active config produces the same
   * fingerprint — if the chain, CHOMP contracts, or Delegation Framework
   * version change, the sequence re-runs.
   */
  configFingerprint: string;
  /** Unix timestamp (in milliseconds) when the sequence completed. */
  completedAt: number;
};

export type MoneyAccountUpgradeControllerState = {
  /**
   * Accounts whose upgrade sequence has fully completed, keyed by lowercased
   * account address.
   */
  upgradedAccounts: { [address: Hex]: MoneyAccountUpgradeStatus };
};

const moneyAccountUpgradeControllerMetadata = {
  upgradedAccounts: {
    includeInDebugSnapshot: false,
    includeInStateLogs: false,
    persist: true,
    usedInUi: false,
  },
} satisfies StateMetadata<MoneyAccountUpgradeControllerState>;

/**
 * Constructs the default {@link MoneyAccountUpgradeController} state. This
 * allows consumers to provide a partial state object when initializing the
 * controller and also helps in constructing complete state objects for this
 * controller in tests.
 *
 * @returns The default {@link MoneyAccountUpgradeController} state.
 */
export function getDefaultMoneyAccountUpgradeControllerState(): MoneyAccountUpgradeControllerState {
  return {
    upgradedAccounts: {},
  };
}

const MESSENGER_EXPOSED_METHODS = [
  'upgradeAccount',
  'upgradeAccountWithRetry',
] as const;

export type MoneyAccountUpgradeControllerGetStateAction =
  ControllerGetStateAction<
    typeof controllerName,
    MoneyAccountUpgradeControllerState
  >;

export type MoneyAccountUpgradeControllerActions =
  | MoneyAccountUpgradeControllerGetStateAction
  | MoneyAccountUpgradeControllerMethodActions;

type AllowedActions =
  | AuthenticatedUserStorageServiceCreateDelegationAction
  | AuthenticatedUserStorageServiceListDelegationsAction
  | ChompApiServiceAssociateAddressAction
  | ChompApiServiceCreateIntentsAction
  | ChompApiServiceCreateUpgradeAction
  | ChompApiServiceGetAssociatedAddressesAction
  | ChompApiServiceGetIntentsByAddressAction
  | ChompApiServiceGetServiceDetailsAction
  | ChompApiServiceVerifyDelegationAction
  | DelegationControllerSignDelegationAction
  | KeyringControllerSignEip7702AuthorizationAction
  | KeyringControllerSignPersonalMessageAction
  | NetworkControllerFindNetworkClientIdByChainIdAction
  | NetworkControllerGetNetworkClientByIdAction;

export type MoneyAccountUpgradeControllerStateChangedEvent =
  ControllerStateChangedEvent<
    typeof controllerName,
    MoneyAccountUpgradeControllerState
  >;

export type MoneyAccountUpgradeControllerEvents =
  MoneyAccountUpgradeControllerStateChangedEvent;

type AllowedEvents = never;

export type MoneyAccountUpgradeControllerMessenger = Messenger<
  typeof controllerName,
  MoneyAccountUpgradeControllerActions | AllowedActions,
  MoneyAccountUpgradeControllerEvents | AllowedEvents
>;

/**
 * Controller that orchestrates the Money Account upgrade sequence.
 */
export class MoneyAccountUpgradeController extends BaseController<
  typeof controllerName,
  MoneyAccountUpgradeControllerState,
  MoneyAccountUpgradeControllerMessenger
> {
  #config?: UpgradeConfig & { chainId: Hex };

  readonly #steps: Step[] = [
    associateAddressStep,
    eip7702AuthorizationStep,
    buildDelegationStep,
    registerIntentsStep,
  ];

  /**
   * Constructor for the MoneyAccountUpgradeController.
   *
   * @param options - The options for constructing the controller.
   * @param options.messenger - The messenger to use for inter-controller communication.
   * @param options.state - The initial state, merged with the defaults.
   */
  constructor({
    messenger,
    state,
  }: {
    messenger: MoneyAccountUpgradeControllerMessenger;
    state?: Partial<MoneyAccountUpgradeControllerState>;
  }) {
    super({
      messenger,
      metadata: moneyAccountUpgradeControllerMetadata,
      name: controllerName,
      state: {
        ...getDefaultMoneyAccountUpgradeControllerState(),
        ...state,
      },
    });

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Fetches service details and validates the controller can operate on the
   * given chain. Resolves the Delegation Framework contract addresses for the
   * chain from `@metamask/delegation-deployments`.
   *
   * @param params - The parameters for initialization.
   * @param params.chainId - The chain to initialize for.
   * @param params.boringVaultAddress - The Veda boring vault contract
   * (vmUSD) for the given chain. Used as the withdrawal-side delegation
   * token. Supplied by the consumer until the CHOMP service-details API
   * exposes it.
   */
  async init({
    chainId,
    boringVaultAddress,
  }: {
    chainId: Hex;
    boringVaultAddress: Hex;
  }): Promise<void> {
    const contracts =
      DELEGATOR_CONTRACTS[DELEGATION_FRAMEWORK_VERSION][hexToNumber(chainId)];
    if (!contracts) {
      throw new Error(
        `Delegation Framework ${DELEGATION_FRAMEWORK_VERSION} is not deployed on chain ${chainId}`,
      );
    }

    const response = await this.messenger.call(
      'ChompApiService:getServiceDetails',
      [chainId],
    );

    const chain = response.chains[chainId];
    if (!chain) {
      throw new Error(`Chain ${chainId} not found in service details response`);
    }

    const { vedaProtocol } = chain.protocol;
    if (!vedaProtocol) {
      throw new Error(
        `vedaProtocol not found for chain ${chainId} in service details response`,
      );
    }

    if (vedaProtocol.supportedTokens.length === 0) {
      throw new Error(
        `No supported tokens found for vedaProtocol on chain ${chainId}`,
      );
    }

    this.#config = {
      chainId,
      delegateAddress: chain.autoDepositDelegate,
      musdTokenAddress: vedaProtocol.supportedTokens[0].tokenAddress,
      boringVaultAddress,
      vedaVaultAdapterAddress: vedaProtocol.adapterAddress,
      delegatorImplAddress: contracts.EIP7702StatelessDeleGatorImpl,
      erc20TransferAmountEnforcer: contracts.ERC20TransferAmountEnforcer,
      redeemerEnforcer: contracts.RedeemerEnforcer,
      valueLteEnforcer: contracts.ValueLteEnforcer,
    };
  }

  /**
   * Runs each step in the upgrade sequence in order. A step that reports
   * `'already-done'` is skipped without performing any action; a step that
   * reports `'completed'` has performed its action. An error thrown by any
   * step halts the sequence and is re-thrown wrapped in a
   * {@link MoneyAccountUpgradeStepError} that records which step failed (the
   * original error is preserved as `cause`).
   *
   * A run that completes is recorded in state (keyed by lowercased address,
   * fingerprinted against the active config); subsequent calls for a
   * recorded account return immediately without running any steps. If the
   * active config no longer matches the recorded fingerprint, the sequence
   * re-runs.
   *
   * @param address - The Money Account address to upgrade.
   */
  async upgradeAccount(address: Hex): Promise<void> {
    if (!this.#config) {
      throw new Error(
        'MoneyAccountUpgradeController must be initialized via init() before upgradeAccount() can be called',
      );
    }
    const config = this.#config;

    const accountKey = address.toLowerCase() as Hex;
    const configFingerprint = computeConfigFingerprint(config);
    if (
      this.state.upgradedAccounts[accountKey]?.configFingerprint ===
      configFingerprint
    ) {
      return;
    }

    for (const step of this.#steps) {
      try {
        await step.run({
          messenger: this.messenger,
          address,
          ...config,
        });
      } catch (error) {
        throw new MoneyAccountUpgradeStepError(step.name, error);
      }
    }

    this.update((state) => {
      state.upgradedAccounts[accountKey] = {
        configFingerprint,
        completedAt: Date.now(),
      };
    });
  }

  /**
   * Runs the upgrade sequence via
   * {@link MoneyAccountUpgradeController.upgradeAccount}, retrying failed
   * attempts with capped exponential backoff (10s, 20s, 40s, then 60s
   * between attempts). Rethrows the last error without further attempts when
   * the failure is terminal (see `isTerminalMoneyAccountUpgradeError`), when
   * it is not a step failure at all, or when `maxAttempts` is exhausted.
   *
   * @param address - The Money Account address to upgrade.
   * @param options - Retry options.
   * @param options.signal - Aborts waiting between attempts and prevents
   * further attempts. An aborted run rejects with an error stating the retry
   * was aborted.
   * @param options.maxAttempts - Maximum number of attempts, including the
   * first. Must be an integer of at least 1. Defaults to 5.
   */
  async upgradeAccountWithRetry(
    address: Hex,
    {
      signal,
      maxAttempts = DEFAULT_MAX_RETRY_ATTEMPTS,
    }: { signal?: AbortSignal; maxAttempts?: number } = {},
  ): Promise<void> {
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      throw new Error(`maxAttempts must be an integer >= 1, got ${maxAttempts}`);
    }
    for (let attempt = 1; ; attempt++) {
      if (signal?.aborted) {
        throw new Error(RETRY_ABORTED_MESSAGE);
      }
      try {
        await this.upgradeAccount(address);
        return;
      } catch (error) {
        if (
          attempt >= maxAttempts ||
          !isMoneyAccountUpgradeStepError(error) ||
          isTerminalMoneyAccountUpgradeError(error)
        ) {
          throw error;
        }
        await waitUnlessAborted(retryDelayMs(attempt), signal);
      }
    }
  }
}

/**
 * Derives a stable fingerprint of the config fields that define what
 * "upgraded" means for an account. A recorded upgrade is only trusted while
 * the active config produces the same fingerprint.
 *
 * @param config - The active upgrade config.
 * @returns A canonical string over the config's identifying fields.
 */
function computeConfigFingerprint(
  config: UpgradeConfig & { chainId: Hex },
): string {
  return [
    DELEGATION_FRAMEWORK_VERSION,
    config.chainId,
    config.delegateAddress,
    config.musdTokenAddress,
    config.boringVaultAddress,
    config.vedaVaultAdapterAddress,
    config.delegatorImplAddress,
    config.erc20TransferAmountEnforcer,
    config.redeemerEnforcer,
    config.valueLteEnforcer,
  ]
    .map((value) => value.toLowerCase())
    .join('|');
}

/**
 * The backoff delay to wait after the given (1-indexed) failed attempt. Once
 * the schedule is exhausted, the last delay repeats.
 *
 * @param attempt - The attempt that just failed.
 * @returns The delay in milliseconds.
 */
function retryDelayMs(attempt: number): number {
  return RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length) - 1];
}

/**
 * Waits for the given duration, rejecting early if `signal` aborts. Rejects
 * immediately when the signal is already aborted on entry (e.g. the abort
 * landed while an upgrade attempt was in flight).
 *
 * @param durationMs - How long to wait.
 * @param signal - Abort signal that cancels the wait.
 * @returns A promise that resolves after the wait, or rejects on abort.
 */
async function waitUnlessAborted(
  durationMs: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error(RETRY_ABORTED_MESSAGE));
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, durationMs);

    function onAbort(): void {
      clearTimeout(timer);
      reject(new Error(RETRY_ABORTED_MESSAGE));
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
