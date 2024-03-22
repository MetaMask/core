import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type {
  BlockTrackerProxy,
  NetworkClientId,
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetSelectedNetworkClientAction,
  NetworkControllerGetStateAction,
  NetworkControllerStateChangeEvent,
  ProviderProxy,
} from '@metamask/network-controller';
import type {
  PermissionControllerStateChange,
  GetSubjects as PermissionControllerGetSubjectsAction,
  HasPermissions as PermissionControllerHasPermissions,
} from '@metamask/permission-controller';
import { createEventEmitterProxy } from '@metamask/swappable-obj-proxy';
import type { Patch } from 'immer';

export const controllerName = 'SelectedNetworkController';

const stateMetadata = {
  domains: { persist: true, anonymous: false },
};

const getDefaultState = () => ({ domains: {} });

export type Domain = string;

export const METAMASK_DOMAIN = 'metamask' as const;

export const SelectedNetworkControllerActionTypes = {
  getState: `${controllerName}:getState` as const,
  getNetworkClientIdForDomain:
    `${controllerName}:getNetworkClientIdForDomain` as const,
  setNetworkClientIdForDomain:
    `${controllerName}:setNetworkClientIdForDomain` as const,
};

export const SelectedNetworkControllerEventTypes = {
  stateChange: `${controllerName}:stateChange` as const,
};

export type SelectedNetworkControllerState = {
  domains: Record<Domain, NetworkClientId>;
};

export type SelectedNetworkControllerStateChangeEvent = {
  type: typeof SelectedNetworkControllerEventTypes.stateChange;
  payload: [SelectedNetworkControllerState, Patch[]];
};

export type SelectedNetworkControllerGetSelectedNetworkStateAction = {
  type: typeof SelectedNetworkControllerActionTypes.getState;
  handler: () => SelectedNetworkControllerState;
};

export type SelectedNetworkControllerGetNetworkClientIdForDomainAction = {
  type: typeof SelectedNetworkControllerActionTypes.getNetworkClientIdForDomain;
  handler: SelectedNetworkController['getNetworkClientIdForDomain'];
};

export type SelectedNetworkControllerSetNetworkClientIdForDomainAction = {
  type: typeof SelectedNetworkControllerActionTypes.setNetworkClientIdForDomain;
  handler: SelectedNetworkController['setNetworkClientIdForDomain'];
};

export type SelectedNetworkControllerActions =
  | SelectedNetworkControllerGetSelectedNetworkStateAction
  | SelectedNetworkControllerGetNetworkClientIdForDomainAction
  | SelectedNetworkControllerSetNetworkClientIdForDomainAction;

export type AllowedActions =
  | NetworkControllerGetNetworkClientByIdAction
  | NetworkControllerGetSelectedNetworkClientAction
  | NetworkControllerGetStateAction
  | PermissionControllerHasPermissions
  | PermissionControllerGetSubjectsAction;

export type SelectedNetworkControllerEvents =
  SelectedNetworkControllerStateChangeEvent;

export type AllowedEvents =
  | NetworkControllerStateChangeEvent
  | PermissionControllerStateChange;

export type SelectedNetworkControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  SelectedNetworkControllerActions | AllowedActions,
  SelectedNetworkControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

export type GetUseRequestQueue = () => boolean;

export type SelectedNetworkControllerOptions = {
  state?: SelectedNetworkControllerState;
  messenger: SelectedNetworkControllerMessenger;
  getUseRequestQueue: GetUseRequestQueue;
  domainProxyMap: Map<Domain, NetworkProxy>;
};

export type NetworkProxy = {
  provider: ProviderProxy;
  blockTracker: BlockTrackerProxy;
};

/**
 * Controller for getting and setting the network for a particular domain.
 */
export class SelectedNetworkController extends BaseController<
  typeof controllerName,
  SelectedNetworkControllerState,
  SelectedNetworkControllerMessenger
> {
  #domainProxyMap: Map<Domain, NetworkProxy>;

  #getUseRequestQueue: GetUseRequestQueue;

  /**
   * Construct a SelectedNetworkController controller.
   *
   * @param options - The controller options.
   * @param options.messenger - The restricted controller messenger for the EncryptionPublicKey controller.
   * @param options.state - The controllers initial state.
   * @param options.getUseRequestQueue - feature flag for perDappNetwork & request queueing features
   * @param options.domainProxyMap - A map for storing domain-specific proxies that are held in memory only during use.
   */
  constructor({
    messenger,
    state = getDefaultState(),
    getUseRequestQueue,
    domainProxyMap,
  }: SelectedNetworkControllerOptions) {
    super({
      name: controllerName,
      metadata: stateMetadata,
      messenger,
      state,
    });
    this.#getUseRequestQueue = getUseRequestQueue;
    this.#domainProxyMap = domainProxyMap;
    this.#registerMessageHandlers();

    // this is fetching all the dapp permissions from the PermissionsController and looking for any domains that are not in domains state in this controller. Then we take any missing domains and add them to state here, setting it with the globally selected networkClientId (fetched from the NetworkController)
    this.messagingSystem
      .call('PermissionController:getSubjectNames')
      .filter((domain) => this.state.domains[domain] === undefined)
      .forEach((domain) =>
        this.setNetworkClientIdForDomain(
          domain,
          this.messagingSystem.call('NetworkController:getState')
            .selectedNetworkClientId,
        ),
      );

    this.messagingSystem.subscribe(
      'PermissionController:stateChange',
      (_, patches) => {
        patches.forEach(({ op, path }) => {
          const isChangingSubject =
            path[0] === 'subjects' && path[1] !== undefined;
          if (isChangingSubject && typeof path[1] === 'string') {
            const domain = path[1];
            if (op === 'add' && this.state.domains[domain] === undefined) {
              this.setNetworkClientIdForDomain(
                domain,
                this.messagingSystem.call('NetworkController:getState')
                  .selectedNetworkClientId,
              );
            } else if (
              op === 'remove' &&
              this.state.domains[domain] !== undefined
            ) {
              this.#unsetNetworkClientIdForDomain(domain);
            }
          }
        });
      },
    );

    this.messagingSystem.subscribe(
      'NetworkController:stateChange',
      ({ selectedNetworkClientId }, patches) => {
        patches.forEach(({ op, path }) => {
          // if a network is removed, update the networkClientId for all domains that were using it to the selected network
          if (op === 'remove' && path[0] === 'networkConfigurations') {
            const removedNetworkClientId = path[1] as NetworkClientId;
            Object.entries(this.state.domains).forEach(
              ([domain, networkClientIdForDomain]) => {
                if (networkClientIdForDomain === removedNetworkClientId) {
                  this.setNetworkClientIdForDomain(
                    domain,
                    selectedNetworkClientId,
                  );
                }
              },
            );
          }
        });
      },
    );
  }

  #registerMessageHandlers(): void {
    this.messagingSystem.registerActionHandler(
      SelectedNetworkControllerActionTypes.getNetworkClientIdForDomain,
      this.getNetworkClientIdForDomain.bind(this),
    );
    this.messagingSystem.registerActionHandler(
      SelectedNetworkControllerActionTypes.setNetworkClientIdForDomain,
      this.setNetworkClientIdForDomain.bind(this),
    );
  }

  #setNetworkClientIdForDomain(
    domain: Domain,
    networkClientId: NetworkClientId,
  ) {
    const networkClient = this.messagingSystem.call(
      'NetworkController:getNetworkClientById',
      networkClientId,
    );
    const networkProxy = this.getProviderAndBlockTracker(domain);
    networkProxy.provider.setTarget(networkClient.provider);
    networkProxy.blockTracker.setTarget(networkClient.blockTracker);

    this.update((state) => {
      state.domains[domain] = networkClientId;
    });
  }

  #unsetNetworkClientIdForDomain(domain: Domain) {
    const globallySelectedNetworkClient = this.messagingSystem.call(
      'NetworkController:getSelectedNetworkClient',
    );
    const networkProxy = this.#domainProxyMap.get(domain);
    if (networkProxy && globallySelectedNetworkClient) {
      networkProxy.provider.setTarget(globallySelectedNetworkClient.provider);
      networkProxy.blockTracker.setTarget(
        globallySelectedNetworkClient.blockTracker,
      );
    } else if (networkProxy) {
      this.#domainProxyMap.delete(domain);
    }
    this.update((state) => {
      delete state.domains[domain];
    });
  }

  #domainHasPermissions(domain: Domain): boolean {
    return this.messagingSystem.call(
      'PermissionController:hasPermissions',
      domain,
    );
  }

  setNetworkClientIdForDomain(
    domain: Domain,
    networkClientId: NetworkClientId,
  ) {
    if (domain === METAMASK_DOMAIN) {
      throw new Error(
        `NetworkClientId for domain "${METAMASK_DOMAIN}" cannot be set on the SelectedNetworkController`,
      );
    }

    if (!this.#domainHasPermissions(domain)) {
      throw new Error(
        'NetworkClientId for domain cannot be called with a domain that has not yet been granted permissions',
      );
    }

    this.#setNetworkClientIdForDomain(domain, networkClientId);
  }

  getNetworkClientIdForDomain(domain: Domain): NetworkClientId {
    const { selectedNetworkClientId: metamaskSelectedNetworkClientId } =
      this.messagingSystem.call('NetworkController:getState');
    if (!this.#getUseRequestQueue()) {
      return metamaskSelectedNetworkClientId;
    }
    return this.state.domains[domain] ?? metamaskSelectedNetworkClientId;
  }

  /**
   * Accesses the provider and block tracker for the currently selected network.
   *
   * @param domain - the domain for the provider
   * @returns The proxy and block tracker proxies.
   */
  getProviderAndBlockTracker(domain: Domain): NetworkProxy {
    const networkClientId = this.state.domains[domain];
    let networkProxy = this.#domainProxyMap.get(domain);
    if (networkProxy === undefined) {
      let networkClient;
      if (networkClientId === undefined) {
        networkClient = this.messagingSystem.call(
          'NetworkController:getSelectedNetworkClient',
        );
        if (networkClient === undefined) {
          throw new Error('Network not initialized');
        }
      } else {
        networkClient = this.messagingSystem.call(
          'NetworkController:getNetworkClientById',
          networkClientId,
        );
      }
      networkProxy = {
        provider: createEventEmitterProxy(networkClient.provider),
        blockTracker: createEventEmitterProxy(networkClient.blockTracker, {
          eventFilter: 'skipInternal',
        }),
      };
      this.#domainProxyMap.set(domain, networkProxy);
    }

    return networkProxy;
  }
}
