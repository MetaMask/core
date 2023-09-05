import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseControllerV2 } from '@metamask/base-controller';
import type {
  NetworkClientId,
  NetworkControllerStateChangeEvent,
  NetworkState,
} from '@metamask/network-controller';
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

export type SelectedNetworkControllerActions =
  | SelectedNetworkControllerGetSelectedNetworkStateAction
  | SelectedNetworkControllerGetNetworkClientIdForDomainAction
  | SelectedNetworkControllerSetNetworkClientIdForDomainAction;

export type SelectedNetworkControllerEvents =
  SelectedNetworkControllerStateChangeEvent;

export type SelectedNetworkControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  SelectedNetworkControllerActions,
  NetworkControllerStateChangeEvent | SelectedNetworkControllerEvents,
  string,
  string
>;

export type SelectedNetworkControllerOptions = {
  messenger: SelectedNetworkControllerMessenger;
};

/**
 * Controller for getting and setting the network for a particular domain.
 */
export class SelectedNetworkController extends BaseControllerV2<
  typeof controllerName,
  SelectedNetworkControllerState,
  SelectedNetworkControllerMessenger
> {
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

    // subscribe to networkController statechange:: selectedNetworkClientId changed
    // update the value for the domain 'metamask'
    this.messagingSystem.subscribe(
      'NetworkController:stateChange',
      (state: NetworkState, patch: Patch[]) => {
        const isChangingNetwork = patch.some(
          (p) => p.path[0] === 'selectedNetworkClientId',
        );
        if (!isChangingNetwork) {
          return;
        }

        // set it for the 'global' network to preserve functionality for the
        // selectedNetworkController.perDomainNetwork feature flag being off
        this.setNetworkClientIdForMetamask(state.selectedNetworkClientId);
      },
    );
  }

  /**
   * Reset the controller state to the initial state.
   */
  resetState() {
    this.update(getDefaultState);
  }

  setNetworkClientIdForMetamask(networkClientId: NetworkClientId) {
    this.setNetworkClientIdForDomain(METAMASK_DOMAIN, networkClientId);
  }

  setNetworkClientIdForDomain(
    domain: Domain,
    networkClientId: NetworkClientId,
  ) {
    this.update((state) => {
      state.domains[domain] = networkClientId;
    });
  }

  getNetworkClientIdForDomain(domain: Domain) {
    if (this.state.perDomainNetwork) {
      return this.state.domains[domain];
    }
    return this.state.domains[METAMASK_DOMAIN];
  }
}
