import type {
  RestrictedControllerMessenger,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { InternalAccount } from '@metamask/keyring-api';
import type { HandleSnapRequest } from '@metamask/snaps-controllers';

import {
  createSnapPublicKeyRequest,
  createSnapSignMessageRequest,
} from './AuthSnapRequests';
import {
  createLoginRawMessage,
  getAccessToken,
  getNonce,
  login,
} from './services/authentication-controller';
import type { UserStorageControllerDisableProfileSyncingAction } from './UserStorageController';

const THIRTY_MIN_MS = 1000 * 60 * 30;

const controllerName = 'AuthenticationController';

type SessionProfile = {
  identifierId: string;
  profileId: string;
};

type SessionData = {
  /** profile - anonymous profile data for the given logged in user */
  profile: SessionProfile;
  /** accessToken - used to make requests authorized endpoints */
  accessToken: string;
  /** expiresIn - string date to determine if new access token is required  */
  expiresIn: string;
};

type MetaMetricsAuth = {
  getMetaMetricsId: () => string;
};

export type AuthenticationControllerState = {
  /**
   * Global isSignedIn state.
   * Can be used to determine if "Profile Syncing" is enabled.
   */
  isSignedIn: boolean;
  sessionData?: SessionData;
  internalAccounts?: {
    accounts: Record<string, InternalAccount>;
    selectedAccount: string;
  };
};

/**
 *
 */
function getDefaultAuthenticationControllerState(): AuthenticationControllerState {
  return { isSignedIn: false };
}

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

export type AuthenticationControllerPerformSignInAction = {
  type: `${typeof controllerName}:performSignInAction`;
  handler: AuthenticationController['performSignIn'];
};
export type AuthenticationControllerPerformSignOutAction = {
  type: `${typeof controllerName}:performSignOutAction`;
  handler: AuthenticationController['performSignOut'];
};
export type AuthenticationControllerGetBearerTokenAction = {
  type: `${typeof controllerName}:getBearerToken`;
  handler: AuthenticationController['getBearerToken'];
};
export type AuthenticationControllerGetSessionProfileAction = {
  type: `${typeof controllerName}:getSessionProfile`;
  handler: AuthenticationController['getSessionProfile'];
};
export type AuthenticationControllerIsSignedInAction = {
  type: `${typeof controllerName}:isSignedIn`;
  handler: AuthenticationController['isSignedIn'];
};
export type AuthenticationControllerActions =
  | AuthenticationControllerPerformSignInAction
  | AuthenticationControllerPerformSignOutAction
  | AuthenticationControllerGetBearerTokenAction
  | AuthenticationControllerGetSessionProfileAction
  | AuthenticationControllerIsSignedInAction;

export type AllowedActions =
  | HandleSnapRequest
  | UserStorageControllerDisableProfileSyncingAction;

export type AuthenticationControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  AuthenticationControllerActions | AllowedActions,
  never,
  AllowedActions['type'],
  never
>;

/**
 * Controller that enables authentication for restricted endpoints.
 * Used for Global Profile Syncing and Notifications
 */
export class AuthenticationController extends BaseController<
  typeof controllerName,
  AuthenticationControllerState,
  AuthenticationControllerMessenger
> {
  #metametrics: MetaMetricsAuth;

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
      state: { ...getDefaultAuthenticationControllerState(), ...state },
    });

    this.#metametrics = metametrics;

    this.#registerMessageHandlers();
  }

  listAccounts(): InternalAccount[] | undefined {
    return (
      this.state.internalAccounts &&
      Object.values(this.state.internalAccounts.accounts)
    );
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
      'AuthenticationController:performSignInAction',
      this.performSignIn.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      'AuthenticationController:performSignOutAction',
      this.performSignOut.bind(this),
    );
  }

  async performSignIn(): Promise<string> {
    const { accessToken } = await this.#performAuthenticationFlow();
    return accessToken;
  }

  performSignOut(): void {
    this.#assertLoggedIn();

    this.update((state) => {
      state.isSignedIn = false;
      state.sessionData = undefined;
    });
  }

  async getBearerToken(): Promise<string> {
    this.#assertLoggedIn();

    if (this.#hasValidSession(this.state.sessionData)) {
      return this.state.sessionData.accessToken;
    }

    const { accessToken } = await this.#performAuthenticationFlow();
    return accessToken;
  }

  /**
   * Will return a session profile.
   * Throws if a user is not logged in.
   *
   * @returns profile for the session.
   */
  async getSessionProfile(): Promise<SessionProfile> {
    this.#assertLoggedIn();

    if (this.#hasValidSession(this.state.sessionData)) {
      return this.state.sessionData.profile;
    }

    const { profile } = await this.#performAuthenticationFlow();
    return profile;
  }

  isSignedIn(): boolean {
    return this.state.isSignedIn;
  }

  #assertLoggedIn(): void {
    if (!this.state.isSignedIn) {
      throw new Error(
        `${controllerName}: Unable to call method, user is not authenticated`,
      );
    }
  }

  async #performAuthenticationFlow(): Promise<{
    profile: SessionProfile;
    accessToken: string;
  }> {
    try {
      // 1. Nonce
      const publicKey = await this.#snapGetPublicKey();
      const nonce = await getNonce(publicKey);
      if (!nonce) {
        throw new Error(`Unable to get nonce`);
      }

      // 2. Login
      const rawMessage = createLoginRawMessage(nonce, publicKey);
      const signature = await this.#snapSignMessage(rawMessage);
      const loginResponse = await login(
        rawMessage,
        signature,
        this.#metametrics.getMetaMetricsId(),
      );
      if (!loginResponse?.token) {
        throw new Error(`Unable to login`);
      }

      const profile: SessionProfile = {
        identifierId: loginResponse.profile.identifier_id,
        profileId: loginResponse.profile.profile_id,
      };

      // 3. Trade for Access Token
      const accessToken = await getAccessToken(loginResponse.token);
      if (!accessToken) {
        throw new Error(`Unable to get Access Token`);
      }

      // Update Internal State
      this.update((state) => {
        state.isSignedIn = true;
        const expiresIn = new Date();
        expiresIn.setTime(expiresIn.getTime() + THIRTY_MIN_MS);
        state.sessionData = {
          profile,
          accessToken,
          expiresIn: expiresIn.toString(),
        };
      });

      return {
        profile,
        accessToken,
      };
    } catch (e) {
      console.error('Failed to authenticate', e);
      // Disable Profile Syncing
      this.messagingSystem.call('UserStorageController:disableProfileSyncing');
      const errorMessage =
        e instanceof Error ? e.message : JSON.stringify(e ?? '');
      throw new Error(
        `${controllerName}: Failed to authenticate - ${errorMessage}`,
      );
    }
  }

  #hasValidSession(
    sessionData: SessionData | undefined,
  ): sessionData is SessionData {
    if (!sessionData) {
      return false;
    }

    const prevDate = Date.parse(sessionData.expiresIn);
    if (isNaN(prevDate)) {
      return false;
    }

    const currentDate = new Date();
    const diffMs = Math.abs(currentDate.getTime() - prevDate);

    return THIRTY_MIN_MS > diffMs;
  }

  /**
   * Returns the auth snap key.
   *
   * @returns The snap key.
   */
  #snapGetPublicKey(): Promise<string> {
    return this.messagingSystem.call(
      'SnapController:handleRequest',
      createSnapPublicKeyRequest(),
    ) as Promise<string>;
  }

  /**
   * Signs a specific message using an underlying auth snap.
   *
   * @param message - A specific tagged message to sign.
   * @returns A Signature created by the snap.
   */
  #snapSignMessage(message: `metamask:${string}`): Promise<string> {
    return this.messagingSystem.call(
      'SnapController:handleRequest',
      createSnapSignMessageRequest(message),
    ) as Promise<string>;
  }
}
