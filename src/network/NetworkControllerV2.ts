import { Patch } from 'immer';
import { BaseController, StateMetadata } from '../BaseControllerV2';
import { RestrictedControllerMessenger } from '../ControllerMessenger';

const enum InfuraJsonRpcSupportedNetworks {
  MAINNET = 'mainnet',
  ROPSTEN = 'ropsten',
  RINKEBY = 'rinkeby',
  KOVAN = 'kovan',
  GOERLI = 'goerli',
  POLYGON_MAINNET = 'polygon-mainnet',
  POLYGON_MUMBAI = 'polygon-mumbai',
  OPTIMISM_MAINNET = 'optimism-mainnet',
  OPTIMISM_KOVAN = 'optimism-kovan',
  ARBITRUM_MAINNET = 'arbitrum-mainnet',
  ARBITRUM_RINKEBY = 'arbitrum-rinkeby',
  ETH2_BEACON_MAINNET = 'eth2-beacon-mainnet',
  ETH2_BEACON_PRATER = 'eth2-beacon-prater',
  FILECOIN = 'filecoin',
  PALM_MAINNET = 'palm-mainnet',
}

type KnownNetwork = InfuraJsonRpcSupportedNetworks;

type CustomNetwork = {
  chainId: number;
  rpcUrl: string;
};

export type NetworkControllerState = {
  network: KnownNetwork | CustomNetwork | null;
};

// BOILERPLATE
type NetworkControllerMetadata = StateMetadata<NetworkControllerState>;

// BOILERPLATE
export type GetNetworkControllerState = {
  type: `${typeof name}:getState`;
  handler: () => NetworkControllerState;
};

// BOILERPLATE
export type NetworkControllerStateChange = {
  type: `${typeof name}:stateChange`;
  payload: [NetworkControllerState, Patch[]];
};

// BOILERPLATE
type NetworkControllerMessenger = RestrictedControllerMessenger<
  typeof name,
  GetNetworkControllerState,
  NetworkControllerStateChange,
  never,
  never
>;

type NetworkControllerOptions = {
  // BOILERPLATE
  messenger: NetworkControllerMessenger;
  state?: Partial<NetworkControllerState>;
  // custom
  infuraProjectId: string;
};

// BOILERPLATE (to some degree)
const name = 'NetworkController';
const metadata: NetworkControllerMetadata = {
  network: { persist: true, anonymous: false },
};
const defaultState: NetworkControllerState = {
  network: null,
};

export default class NetworkController extends BaseController<
  typeof name,
  NetworkControllerState,
  NetworkControllerMessenger
> {
  private provider: EthQueryProvider;

  constructor({ messenger, state = {} }: NetworkControllerOptions) {
    super({
      name,
      messenger,
      metadata,
      state: { ...defaultState, ...state },
    });
    this.refreshProvider();
  }

  private refreshProvider() {
    this.provider;
  }
}
