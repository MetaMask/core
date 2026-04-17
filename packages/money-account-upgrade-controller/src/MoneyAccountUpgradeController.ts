import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type {
  ChompApiServiceAssociateAddressAction,
  ChompApiServiceCreateIntentsAction,
  ChompApiServiceCreateUpgradeAction,
  ChompApiServiceGetServiceDetailsAction,
  ChompApiServiceGetUpgradeAction,
  ChompApiServiceVerifyDelegationAction,
  SignedDelegation,
} from '@metamask/chomp-api-service';
import type { DelegationControllerSignDelegationAction } from '@metamask/delegation-controller';
import type {
  KeyringControllerSignEip7702AuthorizationAction,
  KeyringControllerSignPersonalMessageAction,
} from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';
import type { MoneyAccountControllerGetMoneyAccountAction } from '@metamask/money-account-controller';
import type { Hex } from '@metamask/utils';
import { webcrypto } from 'node:crypto';

import { MAX_UINT256, ROOT_AUTHORITY, STEP_ORDER } from './constants';
import { encodeCaveatTerms } from './encode-caveat-terms';
import type { MoneyAccountUpgradeControllerMethodActions } from './MoneyAccountUpgradeController-method-action-types';
import { associateAddress } from './steps/associate-address';
import type { Step } from './steps/types';
import type {
  AccountUpgradeEntry,
  InitConfig,
  UpgradeConfig,
  UpgradeStep,
} from './types';

export const controllerName = 'MoneyAccountUpgradeController';

export type MoneyAccountUpgradeControllerState = {
  upgrades: Record<string, AccountUpgradeEntry>;
};

const moneyAccountUpgradeControllerMetadata = {
  upgrades: {
    includeInDebugSnapshot: false,
    includeInStateLogs: false,
    persist: true,
    usedInUi: false,
  },
} satisfies StateMetadata<MoneyAccountUpgradeControllerState>;

export function getDefaultMoneyAccountUpgradeControllerState(): MoneyAccountUpgradeControllerState {
  return {
    upgrades: {},
  };
}

const MESSENGER_EXPOSED_METHODS = ['upgradeAccount'] as const;

export type MoneyAccountUpgradeControllerGetStateAction =
  ControllerGetStateAction<
    typeof controllerName,
    MoneyAccountUpgradeControllerState
  >;

export type MoneyAccountUpgradeControllerActions =
  | MoneyAccountUpgradeControllerGetStateAction
  | MoneyAccountUpgradeControllerMethodActions;

type AllowedActions =
  | ChompApiServiceAssociateAddressAction
  | ChompApiServiceCreateUpgradeAction
  | ChompApiServiceGetUpgradeAction
  | ChompApiServiceVerifyDelegationAction
  | ChompApiServiceCreateIntentsAction
  | ChompApiServiceGetServiceDetailsAction
  | KeyringControllerSignPersonalMessageAction
  | KeyringControllerSignEip7702AuthorizationAction
  | DelegationControllerSignDelegationAction
  | MoneyAccountControllerGetMoneyAccountAction;

export type MoneyAccountUpgradeControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    MoneyAccountUpgradeControllerState
  >;

export type MoneyAccountUpgradeControllerEvents =
  MoneyAccountUpgradeControllerStateChangeEvent;

type AllowedEvents = never;

export type MoneyAccountUpgradeControllerMessenger = Messenger<
  typeof controllerName,
  MoneyAccountUpgradeControllerActions | AllowedActions,
  MoneyAccountUpgradeControllerEvents | AllowedEvents
>;

/**
 * Controller that orchestrates the multi-step Money Account upgrade sequence.
 */
export class MoneyAccountUpgradeController extends BaseController<
  typeof controllerName,
  MoneyAccountUpgradeControllerState,
  MoneyAccountUpgradeControllerMessenger
> {
  #config: UpgradeConfig | undefined;

  #chainId: Hex | undefined;

  initialized: boolean;

  /**
   * Constructor for the MoneyAccountUpgradeController.
   *
   * @param options - The options for constructing the controller.
   * @param options.messenger - The messenger to use for inter-controller communication.
   * @param options.state - The initial state of the controller.
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

    this.initialized = false;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Fetches service details and builds the upgrade config.
   *
   * @param chainId - The chain to initialize for.
   * @param initConfig - Contract addresses not available from the service details API.
   */
  async init(chainId: Hex, initConfig: InitConfig): Promise<void> {
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

    const [firstToken] = vedaProtocol.supportedTokens;
    if (!firstToken) {
      throw new Error(
        `No supported tokens found for vedaProtocol on chain ${chainId}`,
      );
    }

    this.#config = {
      delegateAddress: chain.autoDepositDelegate as Hex,
      erc20TransferAmountEnforcer: firstToken.tokenAddress as Hex,
      vedaVaultAdapterAddress: vedaProtocol.adapterAddress as Hex,
      ...initConfig,
    };
    this.#chainId = chainId;
    this.initialized = true;
  }

  /**
   * Returns the upgrade config, throwing if the controller has not been initialized.
   *
   * @returns The upgrade config.
   */
  #requireConfig(): UpgradeConfig {
    if (!this.#config) {
      throw new Error(
        'MoneyAccountUpgradeController is not initialized. Call init() first.',
      );
    }
    return this.#config;
  }

  /**
   * Runs the full upgrade sequence for a Money Account. Each step is
   * idempotent — if the step has already been completed, it is skipped.
   *
   * @param address - The Money Account address to upgrade.
   * @param chainId - The target chain for the upgrade.
   */
  async upgradeAccount(address: Hex, chainId: Hex): Promise<void> {
    // Validates that init() has been called, throwing if not.
    this.#requireConfig();

    if (chainId !== this.#chainId) {
      throw new Error(
        `Chain ID mismatch: controller was initialized for ${
          this.#chainId
        } but upgradeAccount was called with ${chainId}`,
      );
    }
    await this.#runStep(address, chainId, 'associate-address', associateAddress);
    await this.#submitAuthorization(address, chainId);
    await this.#verifyDelegation(address, chainId);
    await this.#saveDelegation(address, chainId);
    await this.#registerIntents(address, chainId);
  }

  /**
   * Returns true if the persisted upgrade entry for the given address
   * shows a step at or past the target step.
   *
   * @param address - The account address.
   * @param step - The step to check.
   * @returns Whether the step has already been completed.
   */
  #isStepCompleted(address: Hex, step: UpgradeStep): boolean {
    const entry = this.state.upgrades[address];
    if (!entry) {
      return false;
    }
    return STEP_ORDER.indexOf(entry.step) >= STEP_ORDER.indexOf(step);
  }

  /**
   * Runs an extracted step function unless it has already been completed,
   * then merges the returned patch into state.
   *
   * @param address - The account address.
   * @param chainId - The target chain.
   * @param step - The step being run (used for the skip check).
   * @param fn - The extracted step function.
   */
  async #runStep(
    address: Hex,
    chainId: Hex,
    step: UpgradeStep,
    fn: Step,
  ): Promise<void> {
    if (this.#isStepCompleted(address, step)) {
      return;
    }
    const patch = await fn({
      messenger: this.messenger,
      config: this.#requireConfig(),
      address,
      chainId,
      entry: this.state.upgrades[address],
    });
    this.#updateUpgrade(address, patch);
  }

  /**
   * Step 1: Sign and submit an EIP-7702 authorization to CHOMP.
   *
   * Skips if CHOMP already has an upgrade record for this address.
   *
   * @param address - The Money Account address.
   * @param chainId - The target chain.
   */
  async #submitAuthorization(address: Hex, chainId: Hex): Promise<void> {
    if (this.#isStepCompleted(address, 'submit-authorization')) {
      return;
    }

    const existing = await this.messenger.call(
      'ChompApiService:getUpgrade',
      address,
    );

    if (existing) {
      this.#updateUpgrade(address, { step: 'submit-authorization', chainId });
      return;
    }

    // TODO: Fetch on-chain nonce. Using 0 as placeholder.
    const nonce = 0;
    const chainIdDecimal = parseInt(chainId, 16);

    const config = this.#requireConfig();
    const signature = await this.messenger.call(
      'KeyringController:signEip7702Authorization',
      {
        chainId: chainIdDecimal,
        contractAddress: config.delegatorImplAddress,
        nonce,
        from: address,
      },
    );

    const sigR = signature.slice(0, 66);
    const sigS = `0x${signature.slice(66, 130)}`;
    const sigV = parseInt(signature.slice(130, 132), 16);
    const yParity = sigV - 27 === 0 ? 0 : 1;

    await this.messenger.call('ChompApiService:createUpgrade', {
      r: sigR,
      s: sigS,
      v: sigV,
      yParity,
      address,
      chainId,
      nonce: nonce.toString(),
    });

    this.#updateUpgrade(address, { step: 'submit-authorization', chainId });
  }

  /**
   * Step 2: Build, sign, and verify a delegation with CHOMP.
   *
   * Constructs an unsigned delegation with three caveat enforcers
   * (ERC20TransferAmount, Redeemer, ValueLte), signs it via the
   * DelegationController, and verifies it with CHOMP.
   *
   * @param address - The Money Account address (delegator).
   * @param chainId - The target chain.
   */
  async #verifyDelegation(address: Hex, chainId: Hex): Promise<void> {
    if (this.#isStepCompleted(address, 'verify-delegation')) {
      return;
    }

    const salt: Hex = `0x${Array.from(
      webcrypto.getRandomValues(new Uint8Array(32)),
    )
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')}`;

    const config = this.#requireConfig();

    const delegation = {
      delegate: config.delegateAddress,
      delegator: address,
      authority: ROOT_AUTHORITY,
      caveats: [
        {
          enforcer: config.erc20TransferAmountEnforcer,
          terms: encodeCaveatTerms(MAX_UINT256, config.musdTokenAddress),
          args: '0x' as Hex,
        },
        {
          enforcer: config.redeemerEnforcer,
          terms: encodeCaveatTerms(config.vedaVaultAdapterAddress),
          args: '0x' as Hex,
        },
        {
          enforcer: config.valueLteEnforcer,
          terms:
            '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
          args: '0x' as Hex,
        },
      ],
      salt,
    };

    const signature: string = await this.messenger.call(
      'DelegationController:signDelegation',
      { delegation, chainId },
    );

    const signedDelegation: SignedDelegation = {
      ...delegation,
      signature: signature as Hex,
    };

    const result = await this.messenger.call(
      'ChompApiService:verifyDelegation',
      { signedDelegation, chainId },
    );

    if (!result.valid) {
      throw new Error(
        `Delegation verification failed: ${
          result.errors?.join(', ') ?? 'unknown error'
        }`,
      );
    }

    this.#updateUpgrade(address, {
      step: 'verify-delegation',
      chainId,
      delegationHash: result.delegationHash,
    });
  }

  /**
   * Step 3: Save the signed delegation to Authenticated User Storage.
   *
   * @param address - The Money Account address.
   * @param _chainId - The target chain (unused in stub).
   */
  async #saveDelegation(address: Hex, _chainId: Hex): Promise<void> {
    if (this.#isStepCompleted(address, 'save-delegation')) {
      return;
    }

    // TODO: Save delegation to Authenticated User Storage once the
    // @metamask/authenticated-user-storage wrapper is available.
    this.#updateUpgrade(address, { step: 'save-delegation' });
  }

  /**
   * Step 4: Register intents with CHOMP so it begins monitoring the account.
   *
   * @param address - The Money Account address.
   * @param chainId - The target chain.
   */
  async #registerIntents(address: Hex, chainId: Hex): Promise<void> {
    if (this.#isStepCompleted(address, 'register-intents')) {
      return;
    }

    const entry = this.state.upgrades[address];
    const delegationHash = entry?.delegationHash;

    if (!delegationHash) {
      throw new Error(
        'Cannot register intents: no delegationHash found. Run verify-delegation first.',
      );
    }

    const config = this.#requireConfig();
    await this.messenger.call('ChompApiService:createIntents', [
      {
        account: address,
        delegationHash: delegationHash as Hex,
        chainId,
        metadata: {
          allowance: MAX_UINT256,
          tokenSymbol: 'mUSD',
          tokenAddress: config.musdTokenAddress,
          type: 'cash-deposit',
        },
      },
      {
        account: address,
        delegationHash: delegationHash as Hex,
        chainId,
        metadata: {
          allowance: MAX_UINT256,
          tokenSymbol: 'mUSD',
          tokenAddress: config.musdTokenAddress,
          type: 'cash-withdrawal',
        },
      },
    ]);

    this.#updateUpgrade(address, { step: 'register-intents' });
  }

  /**
   * Merges an update into the upgrade entry for the given address.
   *
   * @param address - The account address.
   * @param update - Fields to merge into the existing entry.
   */
  #updateUpgrade(
    address: Hex,
    update: Partial<AccountUpgradeEntry> & Pick<AccountUpgradeEntry, 'step'>,
  ): void {
    this.update((state) => {
      state.upgrades[address] = {
        ...state.upgrades[address],
        ...update,
      } as AccountUpgradeEntry;
    });
  }
}
