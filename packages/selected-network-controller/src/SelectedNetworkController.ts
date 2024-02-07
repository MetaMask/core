import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type {
  BlockTrackerProxy,
  NetworkClientId,
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetStateAction,
  NetworkControllerStateChangeEvent,
  ProviderProxy,
} from '@metamask/network-controller';
import type { HasPermissions } from '@metamask/permission-controller';
import { createEventEmitterProxy } from '@metamask/swappable-obj-proxy';
import type { Patch } from 'immer';

export const controllerName = 'SelectedNetworkController';

const stateMetadata = {
  domains: { persist: true, anonymous: false },
  perDomainNetwork: { persist: true, anonymous: false },
};

const getDefaultState = () => ({
  domains: {},
  perDomainNetwork: false,
});

type Domain = string;

export const METAMASK_DOMAIN = 'metamask' as const;

export const SelectedNetworkControllerActionTypes = {
  getState: `${controllerName}:getState` as const,
  getNetworkClientIdForDomain:
    `${controllerName}:getNetworkClientIdForDomain` as const,
  getNetworkClientIdForMetamask:
    `${controllerName}:getNetworkClientIdForMetamask` as const,
  setNetworkClientIdForDomain:
    `${controllerName}:setNetworkClientIdForDomain` as const,
};

export const SelectedNetworkControllerEventTypes = {
  stateChange: `${controllerName}:stateChange` as const,
};

export type SelectedNetworkControllerState = {
  domains: Record<Domain, NetworkClientId>;
  /**
   * Feature flag to start returning networkClientId based on the domain.
   * when the flag is false, the 'metamask' domain will always be used.
   * defaults to false
   */
  perDomainNetwork: boolean;
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

export type SelectedNetworkControllerGetNetworkClientIdForMetamaskAction = {
  type: typeof SelectedNetworkControllerActionTypes.getNetworkClientIdForMetamask;
  handler: SelectedNetworkController['getNetworkClientIdForMetamask'];
};

export type SelectedNetworkControllerSetNetworkClientIdForDomainAction = {
  type: typeof SelectedNetworkControllerActionTypes.setNetworkClientIdForDomain;
  handler: SelectedNetworkController['setNetworkClientIdForDomain'];
};

export type SelectedNetworkControllerActions =
  | SelectedNetworkControllerGetSelectedNetworkStateAction
  | SelectedNetworkControllerGetNetworkClientIdForDomainAction
  | SelectedNetworkControllerGetNetworkClientIdForMetamaskAction
  | SelectedNetworkControllerSetNetworkClientIdForDomainAction;

export type AllowedActions =
  | NetworkControllerGetNetworkClientByIdAction
  | NetworkControllerGetStateAction
  | HasPermissions;

export type SelectedNetworkControllerEvents =
  SelectedNetworkControllerStateChangeEvent;

export type AllowedEvents = NetworkControllerStateChangeEvent;

export type SelectedNetworkControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  SelectedNetworkControllerActions | AllowedActions,
  SelectedNetworkControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

export type SelectedNetworkControllerOptions = {
  state?: SelectedNetworkControllerState;
  messenger: SelectedNetworkControllerMessenger;
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
  #proxies = new Map<Domain, NetworkProxy>();

  /**
   * Construct a SelectedNetworkController controller.
   *
   * @param options - The controller options.
   * @param options.messenger - The restricted controller messenger for the EncryptionPublicKey controller.
   * @param options.state - The controllers initial state.
   */
  constructor({
    messenger,
    state = getDefaultState(),
  }: SelectedNetworkControllerOptions) {
    super({
      name: controllerName,
      metadata: stateMetadata,
      messenger,
      state,
    });
    this.#registerMessageHandlers();

    // if the network for metamask is not set, set it to the currently selected network upon initialization
    if (this.state.domains[METAMASK_DOMAIN] === undefined) {
      const { selectedNetworkClientId } = this.messagingSystem.call(
        'NetworkController:getState',
      );
      this.setNetworkClientIdForDomain(
        METAMASK_DOMAIN,
        selectedNetworkClientId,
      );
    }

    this.messagingSystem.subscribe(
      'NetworkController:stateChange',
      ({ selectedNetworkClientId }) => {
        this.setNetworkClientIdForMetamask(selectedNetworkClientId);
      },
    );
  }

  #registerMessageHandlers(): void {
    this.messagingSystem.registerActionHandler(
      SelectedNetworkControllerActionTypes.getNetworkClientIdForDomain,
      this.getNetworkClientIdForDomain.bind(this),
    );
    this.messagingSystem.registerActionHandler(
      SelectedNetworkControllerActionTypes.getNetworkClientIdForMetamask,
      this.getNetworkClientIdForMetamask.bind(this),
    );
    this.messagingSystem.registerActionHandler(
      SelectedNetworkControllerActionTypes.setNetworkClientIdForDomain,
      this.setNetworkClientIdForDomain.bind(this),
    );
  }

  setNetworkClientIdForMetamask(networkClientId: NetworkClientId) {
    this.setNetworkClientIdForDomain(METAMASK_DOMAIN, networkClientId);
  }

  #setNetworkClientIdForDomain(
    domain: Domain,
    networkClientId: NetworkClientId,
  ) {
    const networkClient = this.messagingSystem.call(
      'NetworkController:getNetworkClientById',
      networkClientId,
    );
    const networkProxy = this.#proxies.get(domain);
    if (networkProxy === undefined) {
      this.#proxies.set(domain, {
        provider: createEventEmitterProxy(networkClient.provider),
        blockTracker: createEventEmitterProxy(networkClient.blockTracker, {
          eventFilter: 'skipInternal',
        }),
      });
    } else {
      networkProxy.provider.setTarget(networkClient.provider);
      networkProxy.blockTracker.setTarget(networkClient.blockTracker);
    }

    this.update((state) => {
      state.domains[domain] = networkClientId;
    });
  }

  domainHasPermissions(domain: Domain): boolean {
    return this.messagingSystem.call(
      'PermissionController:hasPermissions',
      domain,
    );
  }

  setNetworkClientIdForDomain(
    domain: Domain,
    networkClientId: NetworkClientId,
  ) {
    // Early return if perDomainNetwork is disabled and the domain is not Metamask, unless it's setting for Metamask specifically
    if (domain !== METAMASK_DOMAIN && !this.state.perDomainNetwork) {
      return;
    }

    // Check and, if not a metamask request, return early if the domain lacks permissions
    if (domain !== METAMASK_DOMAIN && !this.domainHasPermissions(domain)) {
      return;
    }

    // If setting for Metamask and perDomainNetwork is disabled, update all domains to the Metamask networkClientId
    if (domain === METAMASK_DOMAIN && !this.state.perDomainNetwork) {
      Object.entries(this.state.domains).forEach(
        ([entryDomain, networkClientIdForDomain]) => {
          if (
            networkClientIdForDomain !== networkClientId &&
            entryDomain !== domain
          ) {
            this.#setNetworkClientIdForDomain(entryDomain, networkClientId);
          }
        },
      );
    }
    // Update the network client ID for the specified domain
    this.#setNetworkClientIdForDomain(domain, networkClientId);
  }

  getNetworkClientIdForDomain(domain: Domain): NetworkClientId | undefined {
    if (domain === METAMASK_DOMAIN) {
      return this.getNetworkClientIdForMetamask();
    }
    if (!this.state.perDomainNetwork) {
      return undefined;
    }
    return this.state.domains[domain];
  }

  getNetworkClientIdForMetamask(): NetworkClientId {
    return this.state.domains[METAMASK_DOMAIN];
  }

  #getNetworkClientIdForDomainOrMetamask(domain: Domain): NetworkClientId {
    return (
      this.getNetworkClientIdForDomain(domain) ??
      this.getNetworkClientIdForMetamask()
    );
  }

  /**
   * Accesses the provider and block tracker for the currently selected network.
   *
   * @param domain - the domain for the provider
   * @returns The proxy and block tracker proxies.
   */
  getProviderAndBlockTracker(domain: Domain): NetworkProxy {
    let networkProxy = this.#proxies.get(domain);
    if (networkProxy === undefined) {
      const networkClient = this.messagingSystem.call(
        'NetworkController:getNetworkClientById',
        this.#getNetworkClientIdForDomainOrMetamask(domain),
      );
      networkProxy = {
        provider: createEventEmitterProxy(networkClient.provider),
        blockTracker: createEventEmitterProxy(networkClient.blockTracker, {
          eventFilter: 'skipInternal',
        }),
      };
      this.#proxies.set(domain, networkProxy);
    }

    return networkProxy;
  }

  setPerDomainNetwork(enabled: boolean) {
    this.update((state) => {
      state.perDomainNetwork = enabled;
      return state;
    });
    // when perDomainNetwork is toggled on or off we need to update the proxies for all domains
    // when toggled on all domains should have their own proxies
    // when toggled off all domains should use the same proxies as the metamask domain
    Object.keys(this.state.domains).forEach((domain) => {
      this.setNetworkClientIdForDomain(
        domain,
        // when perDomainNetwork is false, getNetworkClientIdForDomainOrMetamask always returns the networkClientId for the domain 'metamask'
        this.#getNetworkClientIdForDomainOrMetamask(domain),
      );
    });
  }
}
