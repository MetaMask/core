import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type {
  BlockTrackerProxy,
  NetworkClientId,
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerStateChangeEvent,
  ProviderProxy,
} from '@metamask/network-controller';
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

const METAMASK_DOMAIN = 'metamask' as const;

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
  handler: (domain: string) => NetworkClientId;
};

export type SelectedNetworkControllerSetNetworkClientIdForDomainAction = {
  type: typeof SelectedNetworkControllerActionTypes.setNetworkClientIdForDomain;
  handler: (domain: string, NetworkClientId: NetworkClientId) => void;
};

export type SelectedNetworkControllerActions =
  | SelectedNetworkControllerGetSelectedNetworkStateAction
  | SelectedNetworkControllerGetNetworkClientIdForDomainAction
  | SelectedNetworkControllerSetNetworkClientIdForDomainAction;

export type AllowedActions = NetworkControllerGetNetworkClientByIdAction;

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
      if (!state.perDomainNetwork) {
        state.domains[METAMASK_DOMAIN] = networkClientId;
      }
    });
  }

  setNetworkClientIdForDomain(
    domain: Domain,
    networkClientId: NetworkClientId,
  ) {
    if (!this.state.perDomainNetwork) {
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
    this.#setNetworkClientIdForDomain(domain, networkClientId);
  }

  getNetworkClientIdForDomain(domain: Domain): NetworkClientId {
    if (this.state.perDomainNetwork) {
      return this.state.domains[domain] ?? this.state.domains[METAMASK_DOMAIN];
    }
    return this.state.domains[METAMASK_DOMAIN];
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
        this.getNetworkClientIdForDomain(domain),
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
    Object.keys(this.state.domains).forEach((domain) => {
      // when perDomainNetwork is false, getNetworkClientIdForDomain always returns the networkClientId for the domain 'metamask'
      this.setNetworkClientIdForDomain(
        domain,
        this.getNetworkClientIdForDomain(domain),
      );
    });
  }
}
