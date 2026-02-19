import { BaseController } from '@metamask/base-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import type {
  KeyringControllerGetStateAction,
  KeyringControllerLockEvent,
  KeyringControllerUnlockEvent,
} from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';
import type { HandleSnapRequest } from '@metamask/snaps-controllers';
import type { Json } from '@metamask/utils';

import {
  createSnapPublicKeyRequest,
  createSnapAllPublicKeysRequest,
  createSnapSignMessageRequest,
} from './auth-snap-requests';
import { AuthenticationControllerMethodActions } from './AuthenticationController-method-action-types';
import type {
  LoginResponse,
  SRPInterface,
  UserProfile,
  UserProfileLineage,
} from '../../sdk';
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
  srpSessionData?: Record<string, LoginResponse>;
};
export const defaultState: AuthenticationControllerState = {
  isSignedIn: false,
};
const metadata: StateMetadata<AuthenticationControllerState> = {
  isSignedIn: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  srpSessionData: {
    // Remove access token from state logs
    includeInStateLogs: (srpSessionData) => {
      // Unreachable branch, included just to fix a type error for the case where this property is
      // unset. The type gets collapsed to include `| undefined` even though `undefined` is never
      // set here, because we don't yet use `exactOptionalPropertyTypes`.
      // TODO: Remove branch after enabling `exactOptionalPropertyTypes`
      // ref: https://github.com/MetaMask/core/issues/6565
      if (srpSessionData === null || srpSessionData === undefined) {
        return null;
      }
      return Object.entries(srpSessionData).reduce<Record<string, Json>>(
        (sanitizedSrpSessionData, [key, value]) => {
          const { accessToken: _unused, ...tokenWithoutAccessToken } =
            value.token;
          sanitizedSrpSessionData[key] = {
            ...value,
            token: tokenWithoutAccessToken,
          };
          return sanitizedSrpSessionData;
        },
        {},
      );
    },
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
};

type ControllerConfig = {
  env: Env;
};

const MESSENGER_EXPOSED_METHODS = [
  'performSignIn',
  'performSignOut',
  'getBearerToken',
  'getSessionProfile',
  'getUserProfileLineage',
  'isSignedIn',
] as const;

export type Actions =
  | AuthenticationControllerGetStateAction
  | AuthenticationControllerMethodActions;

export type AuthenticationControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  AuthenticationControllerState
>;

export type AuthenticationControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    AuthenticationControllerState
  >;

export type Events = AuthenticationControllerStateChangeEvent;

// Allowed Actions
type AllowedActions = HandleSnapRequest | KeyringControllerGetStateAction;

type AllowedEvents = KeyringControllerLockEvent | KeyringControllerUnlockEvent;

// Messenger
export type AuthenticationControllerMessenger = Messenger<
  typeof controllerName,
  Actions | AllowedActions,
  Events | AllowedEvents
>;

/**
 * Controller that enables authentication for restricted endpoints.
 * Used for Backup & Sync, Notifications, and other services.
 */
export class AuthenticationController extends BaseController<
  typeof controllerName,
  AuthenticationControllerState,
  AuthenticationControllerMessenger
> {
  readonly #metametrics: MetaMetricsAuth;

  readonly #auth: SRPInterface;

  readonly #config: ControllerConfig = {
    env: Env.PRD,
  };

  #isUnlocked = false;

  readonly #keyringController = {
    setupLockedStateSubscriptions: () => {
      const { isUnlocked } = this.messenger.call('KeyringController:getState');
      this.#isUnlocked = isUnlocked;

      this.messenger.subscribe('KeyringController:unlock', () => {
        this.#isUnlocked = true;
      });

      this.messenger.subscribe('KeyringController:lock', () => {
        this.#isUnlocked = false;
      });
    },
  };

  constructor({
    messenger,
    state,
    config,
    metametrics,
  }: {
    messenger: AuthenticationControllerMessenger;
    state?: AuthenticationControllerState;
    config?: Partial<ControllerConfig>;
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

    this.#config = {
      ...this.#config,
      ...config,
    };

    this.#metametrics = metametrics;

    this.#auth = new JwtBearerAuth(
      {
        env: this.#config.env,
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

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  async #getLoginResponseFromState(
    entropySourceId?: string,
  ): Promise<LoginResponse | null> {
    if (entropySourceId) {
      if (!this.state.srpSessionData?.[entropySourceId]) {
        return null;
      }
      return this.state.srpSessionData[entropySourceId];
    }

    const primarySrpLoginResponse = Object.values(
      this.state.srpSessionData || {},
    )?.[0];

    if (!primarySrpLoginResponse) {
      return null;
    }

    return primarySrpLoginResponse;
  }

  async #setLoginResponseToState(
    loginResponse: LoginResponse,
    entropySourceId?: string,
  ) {
    const metaMetricsId = await this.#metametrics.getMetaMetricsId();
    this.update((state) => {
      if (entropySourceId) {
        state.isSignedIn = true;
        if (!state.srpSessionData) {
          state.srpSessionData = {};
        }
        state.srpSessionData[entropySourceId] = {
          ...loginResponse,
          profile: {
            ...loginResponse.profile,
            metaMetricsId,
          },
        };
      }
    });
  }

  #assertIsUnlocked(methodName: string): void {
    if (!this.#isUnlocked) {
      throw new Error(`${methodName} - unable to proceed, wallet is locked`);
    }
  }

  public async performSignIn(): Promise<string[]> {
    this.#assertIsUnlocked('performSignIn');

    const allPublicKeys = await this.#snapGetAllPublicKeys();
    const accessTokens = [];

    // We iterate sequentially in order to be sure that the first entry
    // is the primary SRP LoginResponse.
    for (const [entropySourceId] of allPublicKeys) {
      const accessToken = await this.#auth.getAccessToken(entropySourceId);
      accessTokens.push(accessToken);
    }

    return accessTokens;
  }

  public performSignOut(): void {
    this.update((state) => {
      state.isSignedIn = false;
      state.srpSessionData = undefined;
    });
  }

  /**
   * Will return a bearer token.
   * Logs a user in if a user is not logged in.
   *
   * @returns profile for the session.
   */

  public async getBearerToken(entropySourceId?: string): Promise<string> {
    this.#assertIsUnlocked('getBearerToken');
    return await this.#auth.getAccessToken(entropySourceId);
  }

  /**
   * Will return a session profile.
   * Logs a user in if a user is not logged in.
   *
   * @param entropySourceId - The entropy source ID used to derive the key,
   * when multiple sources are available (Multi-SRP).
   * @returns profile for the session.
   */
  public async getSessionProfile(
    entropySourceId?: string,
  ): Promise<UserProfile> {
    this.#assertIsUnlocked('getSessionProfile');
    return await this.#auth.getUserProfile(entropySourceId);
  }

  public async getUserProfileLineage(): Promise<UserProfileLineage> {
    this.#assertIsUnlocked('getUserProfileLineage');
    return await this.#auth.getUserProfileLineage();
  }

  public isSignedIn(): boolean {
    return this.state.isSignedIn;
  }

  /**
   * Returns the auth snap public key.
   *
   * @param entropySourceId - The entropy source ID used to derive the key,
   * when multiple sources are available (Multi-SRP).
   * @returns The snap public key.
   */
  async #snapGetPublicKey(entropySourceId?: string): Promise<string> {
    this.#assertIsUnlocked('#snapGetPublicKey');

    const result = (await this.messenger.call(
      'SnapController:handleRequest',
      createSnapPublicKeyRequest(entropySourceId),
    )) as string;

    return result;
  }

  /**
   * Returns a mapping of entropy source IDs to auth snap public keys.
   *
   * @returns A mapping of entropy source IDs to public keys.
   */
  async #snapGetAllPublicKeys(): Promise<[string, string][]> {
    this.#assertIsUnlocked('#snapGetAllPublicKeys');

    const result = (await this.messenger.call(
      'SnapController:handleRequest',
      createSnapAllPublicKeysRequest(),
    )) as [string, string][];

    return result;
  }

  #_snapSignMessageCache: Record<`metamask:${string}`, string> = {};

  /**
   * Signs a specific message using an underlying auth snap.
   *
   * @param message - A specific tagged message to sign.
   * @param entropySourceId - The entropy source ID used to derive the key,
   * when multiple sources are available (Multi-SRP).
   * @returns A Signature created by the snap.
   */
  async #snapSignMessage(
    message: string,
    entropySourceId?: string,
  ): Promise<string> {
    assertMessageStartsWithMetamask(message);

    if (this.#_snapSignMessageCache[message]) {
      return this.#_snapSignMessageCache[message];
    }

    this.#assertIsUnlocked('#snapSignMessage');

    const result = (await this.messenger.call(
      'SnapController:handleRequest',
      createSnapSignMessageRequest(message, entropySourceId),
    )) as string;

    this.#_snapSignMessageCache[message] = result;

    return result;
  }
}
