import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';

import type {
  OnRampServiceGetCountriesAction,
  OnRampServiceGetGeolocationAction,
} from './OnRampService-method-action-types';

// === GENERAL ===

/**
 * Represents a country/region returned by the countries API.
 */
export type Country = {
  isoCode: string;
  flag: string;
  name: string;
  phone: {
    prefix: string;
    placeholder: string;
    template: string;
  };
  currency: string;
  supported: boolean;
  recommended: boolean;
  unsupportedStates?: string[];
  transakSupported: boolean;
};

/**
 * The name of the {@link RampsController}, used to namespace the
 * controller's actions and events and to namespace the controller's state data
 * when composed with other controllers.
 */
export const controllerName = 'RampsController';

// === STATE ===

/**
 * Describes the shape of the state object for {@link RampsController}.
 */
export type RampsControllerState = {
  /**
   * The user's country code determined by geolocation.
   */
  geolocation: string | null;
  /**
   * Whether ramp services are available for the user's region.
   */
  regionEligibility: boolean | null;
};

/**
 * The metadata for each property in {@link RampsControllerState}.
 */
const rampsControllerMetadata = {
  geolocation: {
    persist: true,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: true,
  },
  regionEligibility: {
    persist: true,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: true,
  },
} satisfies StateMetadata<RampsControllerState>;

/**
 * Constructs the default {@link RampsController} state. This allows
 * consumers to provide a partial state object when initializing the controller
 * and also helps in constructing complete state objects for this controller in
 * tests.
 *
 * @returns The default {@link RampsController} state.
 */
export function getDefaultRampsControllerState(): RampsControllerState {
  return {
    geolocation: null,
    regionEligibility: null,
  };
}

// === MESSENGER ===

/**
 * Retrieves the state of the {@link RampsController}.
 */
export type RampsControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  RampsControllerState
>;

/**
 * Actions that {@link RampsControllerMessenger} exposes to other consumers.
 */
export type RampsControllerActions = RampsControllerGetStateAction;

/**
 * Actions from other messengers that {@link RampsController} calls.
 */
type AllowedActions =
  | OnRampServiceGetGeolocationAction
  | OnRampServiceGetCountriesAction;

/**
 * Published when the state of {@link RampsController} changes.
 */
export type RampsControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  RampsControllerState
>;

/**
 * Events that {@link RampsControllerMessenger} exposes to other consumers.
 */
export type RampsControllerEvents = RampsControllerStateChangeEvent;

/**
 * Events from other messengers that {@link RampsController} subscribes to.
 */
type AllowedEvents = never;

/**
 * The messenger restricted to actions and events accessed by
 * {@link RampsController}.
 */
export type RampsControllerMessenger = Messenger<
  typeof controllerName,
  RampsControllerActions | AllowedActions,
  RampsControllerEvents | AllowedEvents
>;

// === CONTROLLER DEFINITION ===

/**
 * Manages cryptocurrency on/off ramps functionality.
 */
export class RampsController extends BaseController<
  typeof controllerName,
  RampsControllerState,
  RampsControllerMessenger
> {
  /**
   * Constructs a new {@link RampsController}.
   *
   * @param args - The constructor arguments.
   * @param args.messenger - The messenger suited for this controller.
   * @param args.state - The desired state with which to initialize this
   * controller. Missing properties will be filled in with defaults.
   */
  constructor({
    messenger,
    state = {},
  }: {
    messenger: RampsControllerMessenger;
    state?: Partial<RampsControllerState>;
  }) {
    super({
      messenger,
      metadata: rampsControllerMetadata,
      name: controllerName,
      state: {
        ...getDefaultRampsControllerState(),
        ...state,
      },
    });
  }

  /**
   * Updates the user's geolocation.
   * This method calls the OnRampService to get the geolocation
   * and stores the result in state.
   */
  async updateGeolocation(): Promise<void> {
    const geolocation = await this.messenger.call(
      'OnRampService:getGeolocation',
    );

    this.update((state) => {
      state.geolocation = geolocation;
    });
  }

  /**
   * Determines if ramp services are available for the user's current region
   * based on their stored geolocation.
   * This method calls the OnRampService to get the list of supported countries
   * and checks if the user's country is supported.
   *
   * @param abortController - Optional AbortController for request cancellation.
   * @returns Whether ramp services are available for the user's region.
   * @throws If no geolocation has been set.
   */
  async getRegionEligibility(
    abortController?: AbortController,
  ): Promise<boolean> {
    if (!this.state.geolocation) {
      throw new Error('No geolocation has been set. Call updateGeolocation() first.');
    }

    const countries = await this.messenger.call(
      'OnRampService:getCountries',
      abortController,
    );

    // Extract country code from geolocation (e.g., "US-TX" -> "US")
    const countryCode = this.state.geolocation.split('-')[0];
    const country = countries.find((c) => c.isoCode === countryCode);
    const isEligible = country?.supported ?? false;

    this.update((state) => {
      state.regionEligibility = isEligible;
    });

    return isEligible;
  }
}
