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
import type {
  PermissionControllerStateChange,
  GetSubjects as PermissionControllerGetSubjectsAction,
} from '@metamask/permission-controller';
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

export type SelectedNetworkControllerSetNetworkClientIdForDomainAction = {
  type: typeof SelectedNetworkControllerActionTypes.setNetworkClientIdForDomain;
  handler: SelectedNetworkController['setNetworkClientIdForDomain'];
};

type PermissionControllerHasPermissions = {
  type: `PermissionController:hasPermissions`;
  handler: (domain: string) => boolean;
};

export type SelectedNetworkControllerActions =
  | SelectedNetworkControllerGetSelectedNetworkStateAction
  | SelectedNetworkControllerGetNetworkClientIdForDomainAction
  | SelectedNetworkControllerSetNetworkClientIdForDomainAction;

export type AllowedActions =
  | NetworkControllerGetNetworkClientByIdAction
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

    this.messagingSystem
      .call('PermissionController:getSubjectNames')
      .filter(
        (domain) =>
          this.state.domains[domain] === undefined &&
          this.state.domains[domain] === undefined,
      )
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
              this.update(({ domains }) => {
                delete domains[domain];
              });
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
    if (!this.state.perDomainNetwork) {
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
    if (!this.state.perDomainNetwork) {
      throw new Error(
        'Provider and BlockTracker should be fetched from NetworkController when perDomainNetwork is false',
      );
    }
    const networkClientId = this.state.domains[domain];
    if (!networkClientId) {
      throw new Error(
        'NetworkClientId has not been set for the requested domain',
      );
    }
    let networkProxy = this.#proxies.get(domain);
    if (networkProxy === undefined) {
      const networkClient = this.messagingSystem.call(
        'NetworkController:getNetworkClientById',
        networkClientId,
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
  }
}
