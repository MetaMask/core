import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';

import type { UserProfileServiceMethodActions } from './user-profile-service-method-action-types';

/**
 * The name of the {@link UserProfileController}, used to namespace the
 * controller's actions and events and to namespace the controller's state data
 * when composed with other controllers.
 */
export const controllerName = 'UserProfileController';

/**
 * Describes the shape of the state object for {@link UserProfileController}.
 */
export type UserProfileControllerState = {
  firstSyncCompleted: boolean;
};

/**
 * The metadata for each property in {@link UserProfileControllerState}.
 */
const userProfileControllerMetadata = {
  firstSyncCompleted: {
    persist: true,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: false,
  },
} satisfies StateMetadata<UserProfileControllerState>;

/**
 * Constructs the default {@link UserProfileController} state. This allows
 * consumers to provide a partial state object when initializing the controller
 * and also helps in constructing complete state objects for this controller in
 * tests.
 *
 * @returns The default {@link UserProfileController} state.
 */
export function getDefaultUserProfileControllerState(): UserProfileControllerState {
  return {
    firstSyncCompleted: false,
  };
}

const MESSENGER_EXPOSED_METHODS = [] as const;

/**
 * Retrieves the state of the {@link UserProfileController}.
 */
export type UserProfileControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  UserProfileControllerState
>;

/**
 * Actions that {@link UserProfileControllerMessenger} exposes to other consumers.
 */
export type UserProfileControllerActions =
  | UserProfileControllerGetStateAction
  | UserProfileServiceMethodActions;

/**
 * Actions from other messengers that {@link UserProfileControllerMessenger} calls.
 */
type AllowedActions = UserProfileServiceMethodActions;

/**
 * Published when the state of {@link UserProfileController} changes.
 */
export type UserProfileControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  UserProfileControllerState
>;

/**
 * Events that {@link UserProfileControllerMessenger} exposes to other consumers.
 */
export type UserProfileControllerEvents = UserProfileControllerStateChangeEvent;

/**
 * Events from other messengers that {@link UserProfileControllerMessenger} subscribes
 * to.
 */
type AllowedEvents = never;

/**
 * The messenger restricted to actions and events accessed by
 * {@link UserProfileController}.
 */
export type UserProfileControllerMessenger = Messenger<
  typeof controllerName,
  UserProfileControllerActions | AllowedActions,
  UserProfileControllerEvents | AllowedEvents
>;

export class UserProfileController extends BaseController<
  typeof controllerName,
  UserProfileControllerState,
  UserProfileControllerMessenger
> {
  /**
   * Constructs a new {@link UserProfileController}.
   *
   * @param args - The constructor arguments.
   * @param args.messenger - The messenger suited for this controller.
   * @param args.state - The desired state with which to initialize this
   * controller. Missing properties will be filled in with defaults.
   */
  constructor({
    messenger,
    state,
  }: {
    messenger: UserProfileControllerMessenger;
    state?: Partial<UserProfileControllerState>;
  }) {
    super({
      messenger,
      metadata: userProfileControllerMetadata,
      name: controllerName,
      state: {
        ...getDefaultUserProfileControllerState(),
        ...state,
      },
    });

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }
}
