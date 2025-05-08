import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedMessenger,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type {
  KeyringControllerGetStateAction,
  KeyringControllerLockEvent,
  KeyringControllerUnlockEvent,
} from '@metamask/keyring-controller';
import type { HandleSnapRequest } from '@metamask/snaps-controllers';

import {
  createSnapPublicKeyRequest,
  createSnapSignMessageRequest,
} from './auth-snap-requests';
import type { LoginResponse, SRPInterface, UserProfile } from '../../sdk';
import {
  assertMessageStartsWithMetamask,
  AuthType,
  Env,
  JwtBearerAuth,
} from '../../sdk';
import type { MetaMetricsAuth } from '../../shared/types/services';

const controllerName = 'AuthenticationController';

// State
export type AuthenticationControllerState = {
  isSignedIn: boolean;
  sessionData?: LoginResponse;
};
export const defaultState: AuthenticationControllerState = {
  isSignedIn: false,
};
const metadata: StateMetadata<AuthenticationControllerState> = {
  isSignedIn: {
    persist: true,
    anonymous: true,
  },
  sessionData: {
    persist: true,
    anonymous: false,
  },
};

// Messenger Actions
type CreateActionsObj<Controller extends keyof AuthenticationController> = {
  [K in Controller]: {
    type: `${typeof controllerName}:${K}`;
    handler: AuthenticationController[K];
  };
};
type ActionsObj = CreateActionsObj<
  | 'performSignIn'
  | 'performSignOut'
  | 'getBearerToken'
  | 'getSessionProfile'
  | 'isSignedIn'
>;
export type Actions =
  | ActionsObj[keyof ActionsObj]
  | AuthenticationControllerGetStateAction;
export type AuthenticationControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  AuthenticationControllerState
>;
export type AuthenticationControllerPerformSignIn = ActionsObj['performSignIn'];
export type AuthenticationControllerPerformSignOut =
  ActionsObj['performSignOut'];
export type AuthenticationControllerGetBearerToken =
  ActionsObj['getBearerToken'];
export type AuthenticationControllerGetSessionProfile =
  ActionsObj['getSessionProfile'];
export type AuthenticationControllerIsSignedIn = ActionsObj['isSignedIn'];

export type AuthenticationControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    AuthenticationControllerState
  >;

export type Events = AuthenticationControllerStateChangeEvent;

// Allowed Actions
export type AllowedActions =
  | HandleSnapRequest
  | KeyringControllerGetStateAction;

export type AllowedEvents =
  | KeyringControllerLockEvent
  | KeyringControllerUnlockEvent;

// Messenger
export type AuthenticationControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  Actions | AllowedActions,
  Events | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

/**
 * Controller that enables authentication for restricted endpoints.
 * Used for Backup & Sync, Notifications, and other services.
 */
export default class AuthenticationController extends BaseController<
  typeof controllerName,
  AuthenticationControllerState,
  AuthenticationControllerMessenger
> {
  readonly #metametrics: MetaMetricsAuth;

  readonly #auth: SRPInterface;

  #isUnlocked = false;

  readonly #keyringController = {
    setupLockedStateSubscriptions: () => {
      const { isUnlocked } = this.messagingSystem.call(
        'KeyringController:getState',
      );
      this.#isUnlocked = isUnlocked;

      this.messagingSystem.subscribe('KeyringController:unlock', () => {
        this.#isUnlocked = true;
      });

      this.messagingSystem.subscribe('KeyringController:lock', () => {
        this.#isUnlocked = false;
      });
    },
  };

  constructor({
    messenger,
    state,
    metametrics,
  }: {
    messenger: AuthenticationControllerMessenger;
    state?: AuthenticationControllerState;
    /**
     * Not using the Messaging System as we
     * do not want to tie this strictly to extension
     */
    metametrics: MetaMetricsAuth;
  }) {
    super({
      messenger,
      metadata,
      name: controllerName,
      state: { ...defaultState, ...state },
    });

    if (!metametrics) {
      throw new Error('`metametrics` field is required');
    }

    this.#metametrics = metametrics;

    this.#auth = new JwtBearerAuth(
      {
        env: Env.PRD,
        platform: metametrics.agent,
        type: AuthType.SRP,
      },
      {
        storage: {
          getLoginResponse: this.#getLoginResponseFromState.bind(this),
          setLoginResponse: this.#setLoginResponseToState.bind(this),
        },
        signing: {
          getIdentifier: this.#snapGetPublicKey.bind(this),
          signMessage: this.#snapSignMessage.bind(this),
        },
        metametrics: this.#metametrics,
      },
    );

    this.#keyringController.setupLockedStateSubscriptions();
    this.#registerMessageHandlers();
  }

  /**
   * Constructor helper for registering this controller's messaging system
   * actions.
   */
  #registerMessageHandlers(): void {
    this.messagingSystem.registerActionHandler(
      'AuthenticationController:getBearerToken',
      this.getBearerToken.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      'AuthenticationController:getSessionProfile',
      this.getSessionProfile.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      'AuthenticationController:isSignedIn',
      this.isSignedIn.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      'AuthenticationController:performSignIn',
      this.performSignIn.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      'AuthenticationController:performSignOut',
      this.performSignOut.bind(this),
    );
  }

  async #getLoginResponseFromState(): Promise<LoginResponse | null> {
    if (!this.state.sessionData) {
      return null;
    }

    return this.state.sessionData;
  }

  async #setLoginResponseToState(loginResponse: LoginResponse) {
    const metaMetricsId = await this.#metametrics.getMetaMetricsId();
    this.update((state) => {
      state.isSignedIn = true;
      state.sessionData = {
        ...loginResponse,
        profile: {
          ...loginResponse.profile,
          metaMetricsId,
        },
      };
    });
  }

  #assertIsUnlocked(methodName: string): void {
    if (!this.#isUnlocked) {
      throw new Error(`${methodName} - unable to proceed, wallet is locked`);
    }
  }

  public async performSignIn(): Promise<string> {
    this.#assertIsUnlocked('performSignIn');
    return await this.#auth.getAccessToken();
  }

  public performSignOut(): void {
    this.update((state) => {
      state.isSignedIn = false;
      state.sessionData = undefined;
    });
  }

  /**
   * Will return a bearer token.
   * Logs a user in if a user is not logged in.
   *
   * @returns profile for the session.
   */

  public async getBearerToken(): Promise<string> {
    this.#assertIsUnlocked('getBearerToken');
    return await this.#auth.getAccessToken();
  }

  /**
   * Will return a session profile.
   * Logs a user in if a user is not logged in.
   *
   * @returns profile for the session.
   */
  public async getSessionProfile(): Promise<UserProfile> {
    this.#assertIsUnlocked('getSessionProfile');
    return await this.#auth.getUserProfile();
  }

  public isSignedIn(): boolean {
    return this.state.isSignedIn;
  }

  /**
   * Returns the auth snap public key.
   *
   * @returns The snap public key.
   */
  async #snapGetPublicKey(): Promise<string> {
    this.#assertIsUnlocked('#snapGetPublicKey');

    const result = (await this.messagingSystem.call(
      'SnapController:handleRequest',
      createSnapPublicKeyRequest(),
    )) as string;

    return result;
  }

  #_snapSignMessageCache: Record<`metamask:${string}`, string> = {};

  /**
   * Signs a specific message using an underlying auth snap.
   *
   * @param message - A specific tagged message to sign.
   * @returns A Signature created by the snap.
   */
  async #snapSignMessage(message: string): Promise<string> {
    assertMessageStartsWithMetamask(message);

    if (this.#_snapSignMessageCache[message]) {
      return this.#_snapSignMessageCache[message];
    }

    this.#assertIsUnlocked('#snapSignMessage');

    const result = (await this.messagingSystem.call(
      'SnapController:handleRequest',
      createSnapSignMessageRequest(message),
    )) as string;

    this.#_snapSignMessageCache[message] = result;

    return result;
  }
}
