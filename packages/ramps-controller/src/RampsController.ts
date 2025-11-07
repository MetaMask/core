import { BaseController } from '@metamask/base-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';

const controllerName = 'RampsController';

type RegionState = {
  id: string;
  deposit: boolean;
  aggregator: boolean;
  global: boolean;
};

export enum SdkEnvironment {
  Staging = 'stg',
  Production = 'prd',
}

export enum Context {
  Browser = 'browser',
  Extension = 'extension',
  MobileAndroid = 'mobile-android',
  MobileIOS = 'mobile-ios',
}

/**
 * Ramps controller state
 */
export type RampsControllerState = {
  // Environment tells us which API urls to us
  metamaskEnvironment: SdkEnvironment;
  // Determines front end context (browser, mobile, etc)
  context: Context;
  // The region ID is the ID of the region to use for the purchase
  region: RegionState | null;
};

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
  | RampsControllerGetCountriesAction;

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
  metamaskEnvironment: SdkEnvironment.Staging,
  context: Context.Browser,
  region: null,
};

enum ApiService {
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
  /**
   * Constructor for RampsController.
   *
   * @param options - The controller options.
   * @param options.messenger - The messenger object.
   * @param options.state - Initial state to set on this controller.
   */
  constructor({
    messenger,
    state,
  }: {
    messenger: RampsControllerMessenger;
    state: Partial<RampsControllerState>;
  }) {
    super({
      messenger,
      name: controllerName,
      metadata: rampsControllerMetadata,
      state: { ...defaultState, ...state } as RampsControllerState,
    });

    this.#registerMessageHandlers();
  }

  /**
   * Gets the non-cached API URL based on the metamask environment.
   *
   * @param service - The API service to append to the base URL.
   * @returns The non-cached API URL based on the metamask environment.
   */
  #getApiUrl(service?: ApiService): string {
    let url = 'http://localhost:3000';
    if (this.state.metamaskEnvironment === SdkEnvironment.Production) {
      url = 'https://on-ramp.api.cx.metamask.io';
    } else if (this.state.metamaskEnvironment === SdkEnvironment.Staging) {
      url = 'https://on-ramp.uat-api.cx.metamask.io';
    }

    const urlWithPath = new URL(service ?? '', url);
    return urlWithPath.toString();
  }

  async #getGeolocation(): Promise<string> {
    try {
      const url = this.#getApiUrl();
      const response = await fetch(new URL('geolocation', url).toString());

      if (!response.ok) {
        throw new Error(
          `Failed to fetch geolocation: ${response.statusText}`,
        );
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching geolocation:', error);
      throw error;
    }
  }

  /**
   * Gets the countries for the given geolocation.
   *
   * @returns The countries for the given geolocation.
   */
  async getCountries(): Promise<void> {
    try {
      const geolocation = await this.#getGeolocation();
      const url = this.#getApiUrl(ApiService.Regions);
      const response = await fetch(
        new URL(`countries/${geolocation}`, `${url}/`).toString(),
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch country data: ${response.statusText}`);
      }

      const data = await response.json();

      // Validate expected data properties to handle invalid responses
      if (
        typeof data !== 'object' ||
        data === null ||
        typeof data.deposit !== 'boolean' ||
        typeof data.aggregator !== 'boolean' ||
        typeof data.global !== 'boolean'
      ) {
        throw new Error('Invalid country data format');
      }

      this.update((state) => {
        state.region = {
          id: geolocation as string,
          deposit: data.deposit,
          aggregator: data.aggregator,
          global: data.global,
        };
      });
    } catch (error) {
      // Handle or re-throw as needed; here we simply log
      console.error('Error in getCountries:', error);
      // Optionally, clear region on error:
      this.update((state) => {
        state.region = null;
      });
      // Or rethrow if you want the caller to handle it:
      // throw error;
    }
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
