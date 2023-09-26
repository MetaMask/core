import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseControllerV2 } from '@metamask/base-controller';
import type {
  BlockTrackerProxy,
  NetworkClientId,
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerStateChangeEvent,
  ProviderProxy,
} from '@metamask/network-controller';
import { createEventEmitterProxy } from '@metamask/swappable-obj-proxy';
import type { Patch } from 'immer';

const controllerName = 'SelectedNetworkController';

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

export type SelectedNetworkControllerAction =
  | SelectedNetworkControllerGetSelectedNetworkStateAction
  | SelectedNetworkControllerGetNetworkClientIdForDomainAction
  | SelectedNetworkControllerSetNetworkClientIdForDomainAction
  | NetworkControllerGetNetworkClientByIdAction;

export type SelectedNetworkControllerEvent =
  SelectedNetworkControllerStateChangeEvent;

export type SelectedNetworkControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  SelectedNetworkControllerAction,
  NetworkControllerStateChangeEvent | SelectedNetworkControllerEvent,
  string,
  string
>;

export type SelectedNetworkControllerOptions = {
  messenger: SelectedNetworkControllerMessenger;
};

export type NetworkProxy = {
  provider: ProviderProxy;
  blockTracker: BlockTrackerProxy;
};

/**
 * Controller for getting and setting the network for a particular domain.
 */
export class SelectedNetworkController extends BaseControllerV2<
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
   */
  constructor({ messenger }: SelectedNetworkControllerOptions) {
    super({
      name: controllerName,
      metadata: stateMetadata,
      messenger,
      state: getDefaultState(),
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

  setNetworkClientIdForDomain(
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
      if (state.perDomainNetwork) {
        state.domains[domain] = networkClientId;
        return;
      }
      state.domains[METAMASK_DOMAIN] = networkClientId;
    });
  }

  getNetworkClientIdForDomain(domain: Domain) {
    if (this.state.perDomainNetwork) {
      return this.state.domains[domain];
    }
    return this.state.domains[METAMASK_DOMAIN];
  }

  /**
   * Accesses the provider and block tracker for the currently selected network.
   *
   * @param domain - the domain for the provider
   * @returns The proxy and block tracker proxies.
   */
  getProviderAndBlockTracker(domain: Domain): NetworkProxy | undefined {
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
}
