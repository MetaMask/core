import {
  ApprovalController,
  type ApprovalControllerActions,
  type ApprovalControllerEvents,
  type ApprovalControllerState,
} from '@metamask/approval-controller';
import {
  type ControllerGetStateAction,
  type ControllerMessenger,
  type ControllerStateChangeEvent,
} from '@metamask/base-controller';
import { ApprovalType } from '@metamask/controller-utils';
import {
  type TypedMessageParams,
  type TypedMessageV1Params,
  createWalletMiddleware,
} from '@metamask/eth-json-rpc-middleware';
import {
  JsonRpcEngine,
  type JsonRpcMiddleware,
  createScaffoldMiddleware,
  mergeMiddleware,
} from '@metamask/json-rpc-engine';
import {
  type ExportableKeyEncryptor,
  type GenericEncryptor,
  KeyringController,
  type KeyringControllerActions,
  type KeyringControllerEvents,
  type KeyringControllerState,
  SignTypedDataVersion,
} from '@metamask/keyring-controller';
import {
  type CaveatSpecificationConstraint,
  type ExtractPermission,
  PermissionController,
  type PermissionControllerActions,
  type PermissionControllerEvents,
  type PermissionControllerState,
  type PermissionSpecificationConstraint,
  SubjectMetadataController,
  type SubjectMetadataControllerActions,
  type SubjectMetadataControllerEvents,
  SubjectType,
  type SubjectMetadataControllerState,
  type CaveatSpecificationMap,
  type PermissionSpecificationMap,
} from '@metamask/permission-controller';
import { errorCodes, rpcErrors } from '@metamask/rpc-errors';
import {
  hasProperty,
  isObject,
  type Hex,
  type Json,
  type JsonRpcParams,
} from '@metamask/utils';

import { createEthAccountsMiddleware } from './middleware/createEthAccountsMiddleware';
import createOriginMiddleware from './middleware/createOriginMiddleware';
import {
  RestrictedMethods,
  defaultUnrestrictedMethods,
  getDefaultCaveatSpecifications,
  getDefaultPermissionSpecifications,
  type DefaultCaveatSpecification,
  type DefaultPermissionSpecification,
} from './permissions';

/**
 * MetaMask wallet state.
 */
export type MetamaskState<
  ControllerPermissionSpecification extends PermissionSpecificationConstraint &
    DefaultPermissionSpecification = DefaultPermissionSpecification,
  ControllerCaveatSpecification extends CaveatSpecificationConstraint &
    DefaultCaveatSpecification = DefaultCaveatSpecification,
> = {
  approvalController: ApprovalControllerState;
  keyringController: KeyringControllerState;
  permissionController: PermissionControllerState<
    ExtractPermission<
      ControllerPermissionSpecification,
      ControllerCaveatSpecification & DefaultCaveatSpecification
    >
  >;
  subjectMetadataController: SubjectMetadataControllerState;
};

export type WalletGetState<
  ControllerPermissionSpecification extends PermissionSpecificationConstraint &
    DefaultPermissionSpecification = DefaultPermissionSpecification,
  ControllerCaveatSpecification extends CaveatSpecificationConstraint &
    DefaultCaveatSpecification = DefaultCaveatSpecification,
> = ControllerGetStateAction<
  'Wallet',
  MetamaskState<
    ControllerPermissionSpecification,
    ControllerCaveatSpecification
  >
>;

export type WalletActions<
  ControllerPermissionSpecification extends PermissionSpecificationConstraint &
    DefaultPermissionSpecification = DefaultPermissionSpecification,
  ControllerCaveatSpecification extends CaveatSpecificationConstraint &
    DefaultCaveatSpecification = DefaultCaveatSpecification,
> = WalletGetState<
  ControllerPermissionSpecification,
  ControllerCaveatSpecification
>;

/**
 * All wallet actions.
 */
export type AllWalletActions<
  ControllerPermissionSpecification extends PermissionSpecificationConstraint &
    DefaultPermissionSpecification = DefaultPermissionSpecification,
  ControllerCaveatSpecification extends CaveatSpecificationConstraint &
    DefaultCaveatSpecification = DefaultCaveatSpecification,
> =
  | ApprovalControllerActions
  | KeyringControllerActions
  | PermissionControllerActions
  | SubjectMetadataControllerActions
  | WalletActions<
      ControllerPermissionSpecification,
      ControllerCaveatSpecification
    >;

export type WalletStateChange<
  ControllerPermissionSpecification extends PermissionSpecificationConstraint &
    DefaultPermissionSpecification = DefaultPermissionSpecification,
  ControllerCaveatSpecification extends CaveatSpecificationConstraint &
    DefaultCaveatSpecification = DefaultCaveatSpecification,
> = ControllerStateChangeEvent<
  'Wallet',
  MetamaskState<
    ControllerPermissionSpecification,
    ControllerCaveatSpecification
  >
>;

export type WalletEvents<
  ControllerPermissionSpecification extends PermissionSpecificationConstraint &
    DefaultPermissionSpecification = DefaultPermissionSpecification,
  ControllerCaveatSpecification extends CaveatSpecificationConstraint &
    DefaultCaveatSpecification = DefaultCaveatSpecification,
> = WalletStateChange<
  ControllerPermissionSpecification,
  ControllerCaveatSpecification
>;

/**
 * All wallet events.
 */
export type AllWalletEvents<
  ControllerPermissionSpecification extends PermissionSpecificationConstraint &
    DefaultPermissionSpecification = DefaultPermissionSpecification,
  ControllerCaveatSpecification extends CaveatSpecificationConstraint &
    DefaultCaveatSpecification = DefaultCaveatSpecification,
> =
  | ApprovalControllerEvents
  | KeyringControllerEvents
  | PermissionControllerEvents
  | SubjectMetadataControllerEvents
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
    DefaultPermissionSpecification = DefaultPermissionSpecification,
  ControllerCaveatSpecification extends CaveatSpecificationConstraint &
    DefaultCaveatSpecification = DefaultCaveatSpecification,
> {
  #controllerMessenger: ControllerMessenger<AllWalletActions, AllWalletEvents>;

  #controllers: {
    approvalController: ApprovalController;
    keyringController: KeyringController;
    permissionController: PermissionController<
      ControllerPermissionSpecification,
      ControllerCaveatSpecification
    >;
    subjectMetadataController: SubjectMetadataController;
  };

  #metamaskMiddleware: JsonRpcMiddleware<JsonRpcParams, Json>;

  /**
   * Construct a MetaMask wallet.
   *
   * @param options - Options.
   * @param options.cacheEncryptionKey - Whether to or not to cache the vault encryption key
   * (requires encryptor to support exporting encryption key)
   * @param options.controllerMessenger - An unrestricted global messenger, used as the primary
   * message broker for the wallet.
   * @param options.encryptor - The vault encryptor.
   * @param options.getCaveatSpecifications - Returns specifications for all PermissionController caveats.
   * @param options.getPermissionSpecifications - Returns specifications for all
   * PermissionController permissions.
   * @param options.keyringBuilders - Keyring builder functions for any additional supported
   * keyring types.
   * @param options.showApprovalRequest - Function for showing an approval request to the user.
   * @param options.state - The initial wallet state, broken down by controller.
   * @param options.unrestrictedMethods - Methods that are ignored by the permission system.
   * @param options.version - The wallet version.
   */
  constructor({
    cacheEncryptionKey,
    controllerMessenger,
    encryptor,
    getCaveatSpecifications,
    getPermissionSpecifications,
    keyringBuilders,
    showApprovalRequest,
    state = {},
    unrestrictedMethods,
    version: walletVersion,
  }:
    | {
        keyringBuilders?: ConstructorParameters<
          typeof KeyringController
        >[0]['keyringBuilders'];
        controllerMessenger: ControllerMessenger<
          AllWalletActions,
          AllWalletEvents
        >;
        getCaveatSpecifications: () => CaveatSpecificationMap<ControllerCaveatSpecification>;
        getPermissionSpecifications: () => PermissionSpecificationMap<ControllerPermissionSpecification>;
        showApprovalRequest: ConstructorParameters<
          typeof ApprovalController
        >[0]['showApprovalRequest'];
        state?: Partial<
          MetamaskState<
            ControllerPermissionSpecification,
            ControllerCaveatSpecification
          >
        >;
        unrestrictedMethods?: string[];
        version: string;
      } & (
        | {
            cacheEncryptionKey: true;
            encryptor?: ExportableKeyEncryptor;
          }
        | {
            cacheEncryptionKey?: false;
            encryptor?: GenericEncryptor | ExportableKeyEncryptor;
          }
      )) {
    this.#controllerMessenger = controllerMessenger;

    const keyringControllerMessenger = this.#controllerMessenger.getRestricted({
      allowedActions: [],
      allowedEvents: [],
      name: 'KeyringController',
    });

    // @ts-expect-error The `cacheEncryptionKey` and `encryptor` parameter types are identical
    // between here and the KeyringController, but they're being "collapsed" into a single type
    // here that violates the type signature.
    // TODO: Simplify these parameter types by making all encryptors use the same interface.
    const keyringController = new KeyringController({
      cacheEncryptionKey,
      keyringBuilders,
      state: state?.keyringController,
      encryptor,
      messenger: keyringControllerMessenger,
    });

    const approvalController = new ApprovalController({
      messenger: this.#controllerMessenger.getRestricted({
        allowedActions: [],
        allowedEvents: [],
        name: 'ApprovalController',
      }),
      showApprovalRequest,
      typesExcludedFromRateLimiting: [
        ApprovalType.PersonalSign,
        ApprovalType.EthSignTypedData,
        ApprovalType.Transaction,
        ApprovalType.WatchAsset,
        ApprovalType.EthGetEncryptionPublicKey,
        ApprovalType.EthDecrypt,
      ],
    });

    const subjectMetadataController = new SubjectMetadataController({
      messenger: this.#controllerMessenger.getRestricted({
        allowedActions: [`PermissionController:hasPermissions`],
        allowedEvents: [],
        name: 'SubjectMetadataController',
      }),
      state: state?.subjectMetadataController,
      subjectCacheLimit: 100,
    });

    const permissionController = new PermissionController<
      ControllerPermissionSpecification,
      ControllerCaveatSpecification
    >({
      messenger: this.#controllerMessenger.getRestricted({
        allowedActions: [
          `ApprovalController:addRequest`,
          `ApprovalController:hasRequest`,
          `ApprovalController:acceptRequest`,
          `ApprovalController:rejectRequest`,
          `SubjectMetadataController:getSubjectMetadata`,
        ],
        allowedEvents: [],
        name: 'PermissionController',
      }),
      state: state?.permissionController,
      caveatSpecifications: {
        ...getDefaultCaveatSpecifications({
          getAccounts: () =>
            keyringController.state.keyrings
              .map((keyrings) => keyrings.accounts)
              .flat() as Hex[],
        }),
        ...getCaveatSpecifications(),
      },
      permissionSpecifications: {
        ...getDefaultPermissionSpecifications({
          getAccounts: () =>
            keyringController.state.keyrings
              .map((keyrings) => keyrings.accounts)
              .flat() as Hex[],
        }),
        ...getPermissionSpecifications(),
      },
      unrestrictedMethods: unrestrictedMethods || defaultUnrestrictedMethods,
    });

    // This middleware is not origin-specific, it's shared between all origins.
    this.#metamaskMiddleware = mergeMiddleware([
      createScaffoldMiddleware({
        // These properties match RPC method names, which follow a different naming convention
        /* eslint-disable @typescript-eslint/naming-convention */
        // TODO: Investigate, can we remove this? It looks like it is already not supported,
        // not listed as unrestricted.
        eth_syncing: false,
        // TODO: Add client type to this version
        web3_clientVersion: `MetaMask/v${walletVersion}`,
        /* eslint-enable @typescript-eslint/naming-convention */
      }),
      // @ts-expect-error Wallet middleware types are broken
      createWalletMiddleware({
        getAccounts: async (
          // @ts-expect-error origin insn't included in the JsonRpcRequest type, but we add this
          // origin property in earlier middleware.
          { origin },
        ) => {
          if (this.#controllers.keyringController.isUnlocked()) {
            try {
              const accounts =
                await this.#controllers.permissionController.executeRestrictedMethod(
                  origin,
                  RestrictedMethods.eth_accounts,
                );
              // TODO: Find a way to remove this cast
              return accounts as Hex[];
            } catch (error) {
              if (
                isObject(error) &&
                hasProperty(error, 'code') &&
                error.code === errorCodes.provider.unauthorized
              ) {
                return [];
              }
              throw error;
            }
          }
          // Empty array returned when no acounts are authorized
          // for backwards compatibility reasons
          return [];
        },
        processPersonalMessage: (msgParams) =>
          this.#controllers.keyringController.signPersonalMessage(msgParams),
        processTypedMessage: (
          msgParams: TypedMessageV1Params,
          _req,
          version: string,
        ) => {
          if (version !== SignTypedDataVersion.V1) {
            throw rpcErrors.invalidParams('Invalid version');
          }
          return this.#controllers.keyringController.signTypedMessage(
            msgParams,
            version,
          );
        },
        processTypedMessageV3: (
          msgParams: TypedMessageParams,
          _req,
          version: string,
        ) => {
          if (version !== SignTypedDataVersion.V3) {
            throw rpcErrors.invalidParams('Invalid version');
          }
          return this.#controllers.keyringController.signTypedMessage(
            msgParams,
            version,
          );
        },
        processTypedMessageV4: (
          msgParams: TypedMessageParams,
          _req,
          version: string,
        ) => {
          if (version !== SignTypedDataVersion.V4) {
            throw rpcErrors.invalidParams('Invalid version');
          }
          return this.#controllers.keyringController.signTypedMessage(
            msgParams,
            version,
          );
        },
      }),
    ]);

    this.#controllers = {
      approvalController,
      keyringController,
      permissionController,
      subjectMetadataController,
    };
  }

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
  async initialize(): Promise<void> {
    // no-op
  }

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
  resetState(): void {
    // no-op
  }

  /**
   * Create a "provider engine" for the given subject.
   *
   * A provider engine is a JSON-RPC request handler for provider JSON-RPC requests. It can be
   * used to construct a provider, or to implement a wallet API.
   *
   * @param options - Options
   * @param options.origin - The origin of the subject.
   * @param options.subjectType - The type of the subject.
   * @returns A JSON-RPC provider engine.
   */
  createProviderEngine({
    origin,
    subjectType,
  }: {
    origin: string;
    subjectType: SubjectType;
  }): JsonRpcEngine {
    const engine = new JsonRpcEngine();

    engine.push(createOriginMiddleware({ origin }));

    // Legacy RPC methods that need to be implemented _ahead of_ the permission
    // middleware.
    engine.push(
      createEthAccountsMiddleware({
        messenger: this.#controllerMessenger.getRestricted({
          name: 'createEthAccountsMiddleware',
          allowedActions: ['PermissionController:executeRestrictedMethod'],
          allowedEvents: [],
        }),
      }),
    );

    if (subjectType !== SubjectType.Internal) {
      engine.push(
        this.#controllers.permissionController.createPermissionMiddleware({
          origin,
        }),
      );
    }

    // method middleware, inclduing requestAccounts

    engine.push(this.#metamaskMiddleware);

    return engine;
  }

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
