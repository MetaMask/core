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

import type { MoneyAccountUpgradeControllerMethodActions } from './MoneyAccountUpgradeController-method-action-types';
import type { AccountUpgradeEntry, UpgradeConfig } from './types';

export const controllerName = 'MoneyAccountUpgradeController';

// The root authority constant for top-level delegations.
const ROOT_AUTHORITY =
  '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' as Hex;

// Maximum uint256 — used as the allowance for the ERC20TransferAmountEnforcer.
const MAX_UINT256 =
  '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' as Hex;

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
  readonly #config: UpgradeConfig;

  /**
   * Constructor for the MoneyAccountUpgradeController.
   *
   * @param options - The options for constructing the controller.
   * @param options.messenger - The messenger to use for inter-controller communication.
   * @param options.state - The initial state of the controller.
   * @param options.config - Contract addresses and configuration for the upgrade sequence.
   */
  constructor({
    messenger,
    state,
    config,
  }: {
    messenger: MoneyAccountUpgradeControllerMessenger;
    state?: Partial<MoneyAccountUpgradeControllerState>;
    config: UpgradeConfig;
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

    this.#config = config;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Runs the full upgrade sequence for a Money Account. Each step is
   * idempotent — if the step has already been completed, it is skipped.
   *
   * @param address - The Money Account address to upgrade.
   * @param chainId - The target chain for the upgrade.
   */
  async upgradeAccount(address: Hex, chainId: Hex): Promise<void> {
    await this.#associateAddress(address);
    await this.#submitAuthorization(address, chainId);
    await this.#verifyDelegation(address, chainId);
    await this.#saveDelegation(address, chainId);
    await this.#registerIntents(address, chainId);
  }

  /**
   * Step 0: Associate the Money Account address with the user's CHOMP profile.
   *
   * Signs "CHOMP Authentication {timestamp}" via personal_sign and submits
   * it to CHOMP. The API accepts 409 (already associated) as success.
   *
   * @param address - The Money Account address.
   */
  async #associateAddress(address: Hex): Promise<void> {
    const timestamp = Date.now().toString();
    const message = `CHOMP Authentication ${timestamp}`;

    const signature = await this.messenger.call(
      'KeyringController:signPersonalMessage',
      { data: message, from: address },
    );

    await this.messenger.call('ChompApiService:associateAddress', {
      signature,
      timestamp,
      address,
    });

    this.#updateUpgrade(address, { step: 'associate-address' });
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

    const signature = await this.messenger.call(
      'KeyringController:signEip7702Authorization',
      {
        chainId: chainIdDecimal,
        contractAddress: this.#config.delegatorImplAddress,
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
    const salt: Hex = `0x${Array.from(
      webcrypto.getRandomValues(new Uint8Array(32)),
    )
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')}`;

    const delegation = {
      delegate: this.#config.delegateAddress,
      delegator: address,
      authority: ROOT_AUTHORITY,
      caveats: [
        {
          enforcer: this.#config.erc20TransferAmountEnforcer,
          terms: this.#encodeCaveatTerms(
            MAX_UINT256,
            this.#config.musdTokenAddress,
          ),
          args: '0x' as Hex,
        },
        {
          enforcer: this.#config.redeemerEnforcer,
          terms: this.#encodeCaveatTerms(this.#config.vedaVaultAdapterAddress),
          args: '0x' as Hex,
        },
        {
          enforcer: this.#config.valueLteEnforcer,
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
    const entry = this.state.upgrades[address];
    const delegationHash = entry?.delegationHash;

    if (!delegationHash) {
      throw new Error(
        'Cannot register intents: no delegationHash found. Run verify-delegation first.',
      );
    }

    await this.messenger.call('ChompApiService:createIntents', [
      {
        account: address,
        delegationHash: delegationHash as Hex,
        chainId,
        metadata: {
          allowance: MAX_UINT256,
          tokenSymbol: 'mUSD',
          tokenAddress: this.#config.musdTokenAddress,
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
          tokenAddress: this.#config.musdTokenAddress,
          type: 'cash-withdrawal',
        },
      },
    ]);

    this.#updateUpgrade(address, { step: 'register-intents' });
  }

  /**
   * Encodes caveat terms by concatenating hex values (ABI-style).
   *
   * @param values - The hex values to pack.
   * @returns The concatenated hex string.
   */
  #encodeCaveatTerms(...values: Hex[]): Hex {
    return `0x${values.map((v) => v.slice(2).padStart(64, '0')).join('')}`;
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
