import type {
  AccountsController,
  AccountsControllerActions,
  AccountsControllerEvents,
  AccountsControllerState,
} from '@metamask/accounts-controller';
import type {
  ApprovalController,
  ApprovalControllerActions,
  ApprovalControllerEvents,
  ApprovalControllerState,
} from '@metamask/approval-controller';
import type {
  CurrencyRateController,
  CurrencyRateControllerActions,
  CurrencyRateControllerEvents,
  CurrencyRateState,
} from '@metamask/assets-controllers';
import type {
  ControllerGetStateAction,
  ControllerMessenger,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import type {
  GasFeeController,
  GasFeeControllerActions,
  GasFeeControllerEvents,
  GasFeeState,
} from '@metamask/gas-fee-controller';
import type { JsonRpcEngine } from '@metamask/json-rpc-engine';
import type {
  KeyringController,
  KeyringControllerActions,
  KeyringControllerEvents,
  KeyringControllerState,
} from '@metamask/keyring-controller';
import type {
  NetworkController,
  NetworkControllerActions,
  NetworkControllerEvents,
  NetworkState,
} from '@metamask/network-controller';
import type {
  CaveatSpecificationConstraint,
  ExtractPermission,
  PermissionController,
  PermissionControllerActions,
  PermissionControllerEvents,
  PermissionControllerState,
  PermissionSpecificationConstraint,
  SubjectType,
} from '@metamask/permission-controller';
import type {
  PreferencesController,
  PreferencesControllerActions,
  PreferencesControllerEvents,
  PreferencesState,
} from '@metamask/preferences-controller';
import type {
  TransactionController,
  TransactionControllerActions,
  TransactionControllerEvents,
  TransactionControllerState,
} from '@metamask/transaction-controller';

import type {
  InternalCaveatSpecification,
  InternalPermissionSpecification,
} from './permissions';

/**
 * MetaMask wallet state.
 */
export type MetamaskState<
  ControllerPermissionSpecification extends PermissionSpecificationConstraint &
    InternalPermissionSpecification = InternalPermissionSpecification,
  ControllerCaveatSpecification extends CaveatSpecificationConstraint &
    InternalCaveatSpecification = InternalCaveatSpecification,
> = {
  accountsController: AccountsControllerState;
  approvalController: ApprovalControllerState;
  currencyRateController: CurrencyRateState;
  gasFeeController: GasFeeState;
  keyringController: KeyringControllerState;
  networkController: NetworkState;
  permissionController: PermissionControllerState<
    ExtractPermission<
      ControllerPermissionSpecification,
      ControllerCaveatSpecification & InternalCaveatSpecification
    >
  >;
  preferencesController: PreferencesState;
  transactionController: TransactionControllerState;
};

export type WalletGetState<
  ControllerPermissionSpecification extends PermissionSpecificationConstraint &
    InternalPermissionSpecification = InternalPermissionSpecification,
  ControllerCaveatSpecification extends CaveatSpecificationConstraint &
    InternalCaveatSpecification = InternalCaveatSpecification,
> = ControllerGetStateAction<
  'Wallet',
  MetamaskState<
    ControllerPermissionSpecification,
    ControllerCaveatSpecification
  >
>;

export type WalletActions<
  ControllerPermissionSpecification extends PermissionSpecificationConstraint &
    InternalPermissionSpecification = InternalPermissionSpecification,
  ControllerCaveatSpecification extends CaveatSpecificationConstraint &
    InternalCaveatSpecification = InternalCaveatSpecification,
> = WalletGetState<
  ControllerPermissionSpecification,
  ControllerCaveatSpecification
>;

/**
 * All wallet actions.
 */
export type AllWalletActions<
  ControllerPermissionSpecification extends PermissionSpecificationConstraint &
    InternalPermissionSpecification = InternalPermissionSpecification,
  ControllerCaveatSpecification extends CaveatSpecificationConstraint &
    InternalCaveatSpecification = InternalCaveatSpecification,
> =
  | AccountsControllerActions
  | ApprovalControllerActions
  | CurrencyRateControllerActions
  | GasFeeControllerActions
  | KeyringControllerActions
  | NetworkControllerActions
  | PermissionControllerActions
  | PreferencesControllerActions
  | TransactionControllerActions
  | WalletActions<
      ControllerPermissionSpecification,
      ControllerCaveatSpecification
    >;

export type WalletStateChange<
  ControllerPermissionSpecification extends PermissionSpecificationConstraint &
    InternalPermissionSpecification = InternalPermissionSpecification,
  ControllerCaveatSpecification extends CaveatSpecificationConstraint &
    InternalCaveatSpecification = InternalCaveatSpecification,
> = ControllerStateChangeEvent<
  'Wallet',
  MetamaskState<
    ControllerPermissionSpecification,
    ControllerCaveatSpecification
  >
>;

export type WalletEvents<
  ControllerPermissionSpecification extends PermissionSpecificationConstraint &
    InternalPermissionSpecification = InternalPermissionSpecification,
  ControllerCaveatSpecification extends CaveatSpecificationConstraint &
    InternalCaveatSpecification = InternalCaveatSpecification,
> = WalletStateChange<
  ControllerPermissionSpecification,
  ControllerCaveatSpecification
>;

/**
 * All wallet events.
 */
export type AllWalletEvents<
  ControllerPermissionSpecification extends PermissionSpecificationConstraint &
    InternalPermissionSpecification = InternalPermissionSpecification,
  ControllerCaveatSpecification extends CaveatSpecificationConstraint &
    InternalCaveatSpecification = InternalCaveatSpecification,
> =
  | AccountsControllerEvents
  | ApprovalControllerEvents
  | CurrencyRateControllerEvents
  | GasFeeControllerEvents
  | KeyringControllerEvents
  | NetworkControllerEvents
  | PermissionControllerEvents
  | PreferencesControllerEvents
  | TransactionControllerEvents
  | WalletEvents<
      ControllerPermissionSpecification,
      ControllerCaveatSpecification
    >;

/**
 * A MetaMask wallet.
 *
 * @template ControllerPermissionSpecification - A union of the types of all
 * permission specifications available to the controller. Any referenced caveats
 * must be included in the controller's caveat specifications.
 * @template ControllerCaveatSpecification - A union of the types of all
 * caveat specifications available to the controller.
 */
export class MetamaskWallet<
  ControllerPermissionSpecification extends PermissionSpecificationConstraint &
    InternalPermissionSpecification = InternalPermissionSpecification,
  ControllerCaveatSpecification extends CaveatSpecificationConstraint &
    InternalCaveatSpecification = InternalCaveatSpecification,
> {
  #controllerMessenger: ControllerMessenger<AllWalletActions, AllWalletEvents>;

  #controllers: {
    accountsController: AccountsController;
    approvalController: ApprovalController;
    currencyRateController: CurrencyRateController;
    gasFeeController: GasFeeController;
    keyringController: KeyringController;
    networkController: NetworkController;
    permissionController: PermissionController<
      ControllerPermissionSpecification,
      ControllerCaveatSpecification
    >;
    preferencesController: PreferencesController;
    transactionController: TransactionController;
  };

  #services: {
    // TODO: Create EVM RPC request service, extracting from fetch middleware
    evmRpcRequest: () => void;
    // TODO: Create Etherscan service, extracting from transaction controller
  };

  /**
   * Construct a MetaMask wallet.
   *
   * @param options - Options.
   * @param options.controllerMessenger - An unrestricted global messenger, used as the primary
   * message broker for the wallet.
   * @param options.state - The initial wallet state, broken down by controller.
   */
  constructor({
    controllerMessenger,
    state = {},
  }: {
    controllerMessenger: ControllerMessenger<AllWalletActions, AllWalletEvents>;
    state?: Partial<
      MetamaskState<
        ControllerPermissionSpecification,
        ControllerCaveatSpecification
      >
    >;
  });

  /**
   * Initialize the wallet.
   *
   * This step is for asynchronous operations that should be performed after the wallet is
   * initially constructed. For example, status checks, remote configuration updates, or preemptive
   * caching.
   *
   * Note that this initialziation may not occur right away after wallet construction. For new
   * wallet installations, this initialization will not be run until after onboarding.
   */
  initialize(): Promise<void>;

  // TODO: Consider adding state reset to base controller

  /**
   * Reset all transient wallet state.
   *
   * This method is meant for applications that expect to automatically restart during typical
   * operation (e.g. a wallet running in a service worker). Such applications can persist all
   * wallet state, including transient state, to ensure caches are not cleared during these routine
   * restarts. But after a fresh application start, we still want to have the ability to clear
   * transient data that is not intended to be persisted.
   *
   * This method will erase all transient wallet state, leaving only persistent state. It should be
   * called before initialization during a new application session.
   */
  resetState(): void;

  /**
   * Create a "provider engine" for the given subject.
   *
   * A provider engine is a JSON-RPC request handler for provider JSON-RPC requests. It can be
   * used to construct a provider, or to implement a wallet API.
   *
   * @param options - Options
   * @param options.origin - The origin of the subject.
   * @param options.subjectType - The type of the subject.
   */
  createProviderEngine({
    origin,
    subjectType,
  }: {
    origin: string;
    subjectType: SubjectType;
  }): JsonRpcEngine;

  // TODO: Add start/resume, pause, stop methods to control all polling/services

  // Additional jotnotes:
  //
  // Step0: Rename controller messenger, write ADR about services and selectors, refactor guts of ComposableController into compose function
  // Step1: Create wallet package
  // Step2: Update options to take the root controller messenger, no controllers and no restricted controller
  // Step3: Add controllers and services one-by-one, starting with keyring
  // Step4: After adding the network controller, add `createProviderEngine` method for RPC pipeline
  // Step5: Handle state reset
  //
  // The wallet API is called through the messenger, same as for a controller
  // Actions and events
  // We would also expose actions and events from internal controllers/services
  // Leave the controller API to the clients
}
