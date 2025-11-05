import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import {
  NativeRampsSdk,
  Context,
  SdkEnvironment,
  type NativeRampsSdkConfig,
} from '@consensys/native-ramps-sdk';
import axios from 'axios';

const controllerName = 'RampsController';

type RegionState = {
  id: string;
  deposit: boolean;
  aggregator: boolean;
  global: boolean;
};

/**
 * Ramps controller state
 */
export type RampsControllerState = {
  // Environment tells us which API urls to us
  metamaskEnvironment: string;
  // Determines front end context (browser, mobile, etc)
  context: string;
  // The region ID is the ID of the region to use for the purchase
  region: RegionState | null;
}

export type RampsControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  RampsControllerState
>;

export type RampsControllerGetCountriesAction = {
  type: `${typeof controllerName}:getCountries`;
  handler: RampsController['getCountries'];
};

export type RampsControllerActions =
  | RampsControllerGetStateAction
  | RampsControllerGetCountriesAction

export type RampsControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  RampsControllerState
>;

export type RampsControllerEvents = RampsControllerStateChangeEvent;

export type RampsControllerMessenger = Messenger<
  typeof controllerName,
  RampsControllerActions,
  RampsControllerEvents
>;

const rampsControllerMetadata = {
  metamaskEnvironment: {
    persist: true,
    anonymous: true,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: true,
  },
  context: {
    persist: true,
    anonymous: true,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: true,
  },
  region: {
    persist: true,
    anonymous: true,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: true,
  },
};

const defaultState: RampsControllerState = {
  metamaskEnvironment: 'staging',
  context: Context.Browser,
  region: null,
};

function getNativeSdkEnvironment(metamaskEnvironment: string) {
  switch (metamaskEnvironment) {
    case 'production':
    case 'beta':
    case 'rc':
      return SdkEnvironment.Production;

    case 'dev':
    case 'exp':
    case 'test':
    case 'e2e':
    default:
      return SdkEnvironment.Staging;
  }
}

enum ApiService {
  Orders = 'providers',
  Regions = 'regions',
}

/**
 * Controller that manages on-ramp and off-ramp operations.
 * The ramps controller is responsible for handling cryptocurrency purchase and sale operations.
 *
 */
export class RampsController extends BaseController<
  typeof controllerName,
  RampsControllerState,
  RampsControllerMessenger
> {
  readonly #nativeSdk: NativeRampsSdk;

  /**
   * Constructor for RampsController.
   *
   * @param options - The controller options.
   * @param options.messenger - The messenger object.
   * @param options.state - Initial state to set on this controller
   */
  constructor({
    messenger,
    state,
  }: {
    messenger: RampsControllerMessenger;
    state?: Partial<RampsControllerState>;
  }) {
    super({
      messenger,
      name: controllerName,
      metadata: rampsControllerMetadata,
      state: { ...defaultState, ...state } as RampsControllerState,
    });

    // Initialize the OnRampSDK
    const environment = state?.metamaskEnvironment ?? SdkEnvironment.Staging;
    const context = state?.context ?? Context.Browser;

    // Initialize the Native Ramps SDK
    const nativeEnv = getNativeSdkEnvironment(environment);
    // Map the shared context string into the native SDK enum
    const nativeContext = (context as unknown as string) as keyof typeof Context;
    const nativeConfig: NativeRampsSdkConfig = {
      context: Context[nativeContext] ?? Context.Browser,
    };
    this.#nativeSdk = new NativeRampsSdk(nativeConfig, nativeEnv);

    this.#registerMessageHandlers();
  }

  /**
   * Gets the non-cached API URL based on the metamask environment
   * @returns The non-cached API URL based on the metamask environment
   */
  #getApiUrl(service?: ApiService): string {
    let url = 'http://localhost:3000'
    if (this.state.metamaskEnvironment === SdkEnvironment.Production) {
      url = 'https://on-ramp.api.cx.metamask.io';
    } else if (this.state.metamaskEnvironment === SdkEnvironment.Staging) {
      url = 'https://on-ramp.uat-api.cx.metamask.io';
    }

    const urlWithPath = new URL(service ?? '', url);
    return urlWithPath.toString();
  }


  async #getGeolocation(): Promise<String> {
    const url = this.#getApiUrl();
    const response = await axios.get(`${url}/geolocation`);
    return response.data;
  }

  async getCountries(): Promise<void> {
    const geolocation = await this.#getGeolocation();
    const url = this.#getApiUrl(ApiService.Regions);
    const response = await axios.get(`${url}/countries/${geolocation}`);
    const data = response.data;
   
    this.update((state) => {
      state.region = {
        id: geolocation as string,
        deposit: data.deposit,
        aggregator: data.aggregator,
        global: data.global,
      }
    });
  }

  /**
   * Registers message handlers for the RampsController.
   */
  #registerMessageHandlers() {
    // RegionsService methods
    this.messenger.registerActionHandler(
      `${controllerName}:getCountries`,
      this.getCountries.bind(this),
    );
  }
}

export default RampsController;

