import { Patch } from 'immer';
import { BaseController, StateMetadata } from '../BaseControllerV2';
import { RestrictedControllerMessenger } from '../ControllerMessenger';

enum InfuraSupportedNetworks {
  MAINNET = 'mainnet',
  ROPSTEN = 'ropsten',
  RINKEBY = 'rinkeby',
}

type KnownNetwork = InfuraSupportedNetworks;

export type NetworkControllerState = {
  network: KnownNetwork | CustomNetwork | null;
};

type NetworkControllerMetadata = StateMetadata<NetworkControllerState>;

export type GetNetworkControllerState = {
  type: `${typeof name}:getState`;
  handler: () => NetworkControllerState;
};

export type NetworkControllerStateChange = {
  type: `${typeof name}:stateChange`;
  payload: [NetworkControllerState, Patch[]];
};

type NetworkControllerMessenger = RestrictedControllerMessenger<
  typeof name,
  GetNetworkControllerState,
  NetworkControllerStateChange,
  never,
  never
>;

type NetworkControllerOptions = {
  // default
  messenger: NetworkControllerMessenger;
  state?: Partial<NetworkControllerState>;
  // additional
};

const name = 'NetworkController';
const metadata: NetworkControllerMetadata = {
  currentNetworkId: { persist: true, anonymous: false },
};
const defaultState: NetworkControllerState = {
  network: null,
};

export default class NetworkController extends BaseController<
  typeof name,
  NetworkControllerState,
  NetworkControllerMessenger
> {
  constructor({ messenger, state = {} }: NetworkControllerOptions) {
    super({
      name,
      messenger,
      metadata,
      state: { ...defaultState, ...state },
    });
  }
}
