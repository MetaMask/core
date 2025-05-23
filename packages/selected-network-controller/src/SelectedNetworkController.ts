import type { RestrictedMessenger } from '@metamask/base-controller';
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
import type { Hex } from '@metamask/utils';
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

export type SelectedNetworkControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  SelectedNetworkControllerActions | AllowedActions,
  SelectedNetworkControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

export type SelectedNetworkControllerOptions = {
  state?: SelectedNetworkControllerState;
  messenger: SelectedNetworkControllerMessenger;
  useRequestQueuePreference: boolean;
  onPreferencesStateChange: (
    listener: (preferencesState: { useRequestQueue: boolean }) => void,
  ) => void;
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

  #useRequestQueuePreference: boolean;

  /**
   * Construct a SelectedNetworkController controller.
   *
   * @param options - The controller options.
   * @param options.messenger - The restricted messenger for the EncryptionPublicKey controller.
   * @param options.state - The controllers initial state.
   * @param options.useRequestQueuePreference - A boolean indicating whether to use the request queue preference.
   * @param options.onPreferencesStateChange - A callback that is called when the preference state changes.
   * @param options.domainProxyMap - A map for storing domain-specific proxies that are held in memory only during use.
   */
  constructor({
    messenger,
    state = getDefaultState(),
    useRequestQueuePreference,
    onPreferencesStateChange,
    domainProxyMap,
  }: SelectedNetworkControllerOptions) {
    super({
      name: controllerName,
      metadata: stateMetadata,
      messenger,
      state,
    });
    this.#useRequestQueuePreference = useRequestQueuePreference;
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
      (
        { selectedNetworkClientId, networkConfigurationsByChainId },
        patches,
      ) => {
        const patch = patches.find(
          ({ op, path }) =>
            (op === 'replace' || op === 'remove') &&
            path[0] === 'networkConfigurationsByChainId',
        );

        if (patch) {
          const networkClientIdToChainId = Object.values(
            networkConfigurationsByChainId,
          ).reduce((acc, network) => {
            network.rpcEndpoints.forEach(
              ({ networkClientId }) => (acc[networkClientId] = network.chainId),
            );
            return acc;
          }, {} as Record<string, Hex>);

          Object.entries(this.state.domains).forEach(
            ([domain, networkClientIdForDomain]) => {
              const chainIdForDomain =
                networkClientIdToChainId[networkClientIdForDomain];

              if (patch.op === 'remove' && !chainIdForDomain) {
                // If the network was removed, fall back to the globally selected network
                this.setNetworkClientIdForDomain(
                  domain,
                  selectedNetworkClientId,
                );
              } else if (patch.op === 'replace') {
                // If the network was updated, redirect to the network's default endpoint

                const updatedChainId = patch.path[1] as Hex;
                if (!chainIdForDomain || chainIdForDomain === updatedChainId) {
                  const network =
                    networkConfigurationsByChainId[updatedChainId];

                  const { networkClientId: defaultNetworkClientId } =
                    network.rpcEndpoints[network.defaultRpcEndpointIndex];

                  if (networkClientIdForDomain !== defaultNetworkClientId) {
                    this.setNetworkClientIdForDomain(
                      domain,
                      defaultNetworkClientId,
                    );
                  }
                }
              }
            },
          );
        }
      },
    );

    onPreferencesStateChange(({ useRequestQueue }) => {
      if (this.#useRequestQueuePreference !== useRequestQueue) {
        if (!useRequestQueue) {
          // Loop through all domains and points each domain's proxy
          // to the NetworkController's own proxy of the globally selected networkClient
          Object.keys(this.state.domains).forEach((domain) => {
            this.#unsetNetworkClientIdForDomain(domain);
          });
        } else {
          this.#resetAllPermissionedDomains();
        }
        this.#useRequestQueuePreference = useRequestQueue;
      }
    });
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

    // This needs to happen before getProviderAndBlockTracker,
    // otherwise we may be referencing a network client ID that no longer exists.
    this.update((state) => {
      state.domains[domain] = networkClientId;
    });

    const networkProxy = this.getProviderAndBlockTracker(domain);
    networkProxy.provider.setTarget(networkClient.provider);
    networkProxy.blockTracker.setTarget(networkClient.blockTracker);
  }

  /**
   * This method is used when a domain is removed from the PermissionsController.
   * It will remove re-point the network proxy to the globally selected network in the domainProxyMap or, if no globally selected network client is available, delete the proxy.
   *
   * @param domain - The domain for which to unset the network client ID.
   */
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

  // Loop through all domains and for those with permissions it points that domain's proxy
  // to an unproxied instance of the globally selected network client.
  // NOT the NetworkController's proxy of the globally selected networkClient
  #resetAllPermissionedDomains() {
    this.#domainProxyMap.forEach((_: NetworkProxy, domain: string) => {
      const { selectedNetworkClientId } = this.messagingSystem.call(
        'NetworkController:getState',
      );
      // can't use public setNetworkClientIdForDomain because it will throw an error
      // rather than simply skip if the domain doesn't have permissions which can happen
      // in this case since proxies are added for each site the user visits
      if (this.#domainHasPermissions(domain)) {
        this.#setNetworkClientIdForDomain(domain, selectedNetworkClientId);
      }
    });
  }

  setNetworkClientIdForDomain(
    domain: Domain,
    networkClientId: NetworkClientId,
  ) {
    if (!this.#useRequestQueuePreference) {
      return;
    }

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
    if (!this.#useRequestQueuePreference) {
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
    // If the domain is 'metamask', return the NetworkController's globally selected network client proxy
    if (domain === METAMASK_DOMAIN) {
      const networkClient = this.messagingSystem.call(
        'NetworkController:getSelectedNetworkClient',
      );
      if (networkClient === undefined) {
        throw new Error('Selected network not initialized');
      }
      return networkClient;
    }

    let networkProxy = this.#domainProxyMap.get(domain);
    if (networkProxy === undefined) {
      let networkClient;
      if (
        this.#useRequestQueuePreference &&
        this.#domainHasPermissions(domain)
      ) {
        const networkClientId = this.getNetworkClientIdForDomain(domain);
        networkClient = this.messagingSystem.call(
          'NetworkController:getNetworkClientById',
          networkClientId,
        );
      } else {
        networkClient = this.messagingSystem.call(
          'NetworkController:getSelectedNetworkClient',
        );
        if (networkClient === undefined) {
          throw new Error('Selected network not initialized');
        }
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
