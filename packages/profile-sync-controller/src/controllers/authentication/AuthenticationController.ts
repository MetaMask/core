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
import { authorizeOIDC } from '../../sdk/authentication-jwt-bearer/services';
import type {
  InitiateOtpResponse,
  VerifyOtpOptions,
} from '../../sdk/authentication-jwt-bearer/services-otp';
import {
  initiateEmailLogin,
  initiatePhoneLogin,
  verifyEmailLogin,
  verifyPhoneLogin,
} from '../../sdk/authentication-jwt-bearer/services-otp';
import type { MetaMetricsAuth } from '../../shared/types/services';

const controllerName = 'AuthenticationController';

// OTP session storage keys
export const OTP_SESSION_KEY_EMAIL = 'otp:email' as const;
export const OTP_SESSION_KEY_PHONE = 'otp:phone' as const;
export type OtpSessionKey =
  | typeof OTP_SESSION_KEY_EMAIL
  | typeof OTP_SESSION_KEY_PHONE;

export type OtpIdentifierType = 'email' | 'phone';

function otpSessionKeyFromType(type: OtpIdentifierType): OtpSessionKey {
  return type === 'email' ? OTP_SESSION_KEY_EMAIL : OTP_SESSION_KEY_PHONE;
}

// State
export type AuthenticationControllerState = {
  isSignedIn: boolean;
  srpSessionData?: Record<string, LoginResponse>;
  otpSessionData?: Record<string, LoginResponse>;
};
export const defaultState: AuthenticationControllerState = {
  isSignedIn: false,
};

const sanitizeSessionDataForLogs = (
  sessionData: Record<string, LoginResponse> | null | undefined,
): Record<string, Json> | null => {
  if (sessionData === null || sessionData === undefined) {
    return null;
  }
  return Object.entries(sessionData).reduce<Record<string, Json>>(
    (sanitized, [key, value]) => {
      const { accessToken: _unused, ...tokenWithoutAccessToken } = value.token;
      sanitized[key] = {
        ...value,
        token: tokenWithoutAccessToken,
      };
      return sanitized;
    },
    {},
  );
};

const metadata: StateMetadata<AuthenticationControllerState> = {
  isSignedIn: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  srpSessionData: {
    includeInStateLogs: sanitizeSessionDataForLogs,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
  otpSessionData: {
    includeInStateLogs: sanitizeSessionDataForLogs,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
};

type ControllerConfig = {
  env: Env;
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
  | 'getUserProfileLineage'
  | 'isSignedIn'
  | 'initiateOtpLogin'
  | 'verifyOtpLogin'
  | 'getOtpBearerToken'
  | 'getOtpSessionProfile'
  | 'performOtpSignOut'
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
export type AuthenticationControllerGetUserProfileLineage =
  ActionsObj['getUserProfileLineage'];
export type AuthenticationControllerIsSignedIn = ActionsObj['isSignedIn'];

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
export default class AuthenticationController extends BaseController<
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
    setupLockedStateSubscriptions: (): void => {
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
    this.#registerMessageHandlers();
  }

  /**
   * Constructor helper for registering this controller's messaging system
   * actions.
   */
  #registerMessageHandlers(): void {
    this.messenger.registerActionHandler(
      'AuthenticationController:getBearerToken',
      this.getBearerToken.bind(this),
    );

    this.messenger.registerActionHandler(
      'AuthenticationController:getSessionProfile',
      this.getSessionProfile.bind(this),
    );

    this.messenger.registerActionHandler(
      'AuthenticationController:isSignedIn',
      this.isSignedIn.bind(this),
    );

    this.messenger.registerActionHandler(
      'AuthenticationController:performSignIn',
      this.performSignIn.bind(this),
    );

    this.messenger.registerActionHandler(
      'AuthenticationController:performSignOut',
      this.performSignOut.bind(this),
    );

    this.messenger.registerActionHandler(
      'AuthenticationController:getUserProfileLineage',
      this.getUserProfileLineage.bind(this),
    );

    this.messenger.registerActionHandler(
      'AuthenticationController:initiateOtpLogin',
      this.initiateOtpLogin.bind(this),
    );

    this.messenger.registerActionHandler(
      'AuthenticationController:verifyOtpLogin',
      this.verifyOtpLogin.bind(this),
    );

    this.messenger.registerActionHandler(
      'AuthenticationController:getOtpBearerToken',
      this.getOtpBearerToken.bind(this),
    );

    this.messenger.registerActionHandler(
      'AuthenticationController:getOtpSessionProfile',
      this.getOtpSessionProfile.bind(this),
    );

    this.messenger.registerActionHandler(
      'AuthenticationController:performOtpSignOut',
      this.performOtpSignOut.bind(this),
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
      this.state.srpSessionData ?? {},
    )?.[0];

    if (!primarySrpLoginResponse) {
      return null;
    }

    return primarySrpLoginResponse;
  }

  async #setLoginResponseToState(
    loginResponse: LoginResponse,
    entropySourceId?: string,
  ): Promise<void> {
    const metaMetricsId = await this.#metametrics.getMetaMetricsId();
    this.update((state) => {
      if (entropySourceId) {
        state.isSignedIn = true;
        state.srpSessionData ??= {};
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

  async #setOtpLoginResponseToState(
    loginResponse: LoginResponse,
    sessionKey: OtpSessionKey,
  ): Promise<void> {
    const metaMetricsId = await this.#metametrics.getMetaMetricsId();
    this.update((state) => {
      state.otpSessionData ??= {};
      state.otpSessionData[sessionKey] = {
        ...loginResponse,
        profile: {
          ...loginResponse.profile,
          metaMetricsId,
        },
      };
    });
  }

  async #getOtpLoginResponseFromState(
    sessionKey: OtpSessionKey,
  ): Promise<LoginResponse | null> {
    const session = this.state.otpSessionData?.[sessionKey];
    if (!session) {
      return null;
    }
    const sessionAge = Date.now() - session.token.obtainedAt;
    const refreshThreshold = session.token.expiresIn * 1000 * 0.9;
    return sessionAge < refreshThreshold ? session : null;
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
   * Initiates OTP login by sending a code to the given email or phone.
   *
   * @param identifier - Email address or phone number
   * @param identifierType - 'email' or 'phone'
   * @returns Flow ID, type, and expiration for the verify step
   */
  public async initiateOtpLogin(
    identifier: string,
    identifierType: OtpIdentifierType,
  ): Promise<InitiateOtpResponse> {
    if (identifierType === 'email') {
      return await initiateEmailLogin(identifier, this.#config.env);
    }
    return await initiatePhoneLogin(identifier, this.#config.env);
  }

  /**
   * Verifies OTP code and stores the session in otpSessionData.
   *
   * @param options - Flow ID, flow type, OTP code, optional metametrics/accounts, and identifier type
   * @returns The access token for the new OTP session
   */
  public async verifyOtpLogin(
    options: VerifyOtpOptions & { identifierType: OtpIdentifierType },
  ): Promise<string> {
    const { identifierType, ...verifyOptions } = options;

    const verifyOptionsWithMetametrics: VerifyOtpOptions = {
      ...verifyOptions,
      metametrics: verifyOptions.metametrics ?? {
        metametricsId: await this.#metametrics.getMetaMetricsId(),
        agent: this.#metametrics.agent,
      },
    };

    const authResponse =
      identifierType === 'email'
        ? await verifyEmailLogin(verifyOptionsWithMetametrics, this.#config.env)
        : await verifyPhoneLogin(
            verifyOptionsWithMetametrics,
            this.#config.env,
          );

    const tokenResponse = await authorizeOIDC(
      authResponse.token,
      this.#config.env,
      this.#metametrics.agent,
    );

    const result: LoginResponse = {
      profile: authResponse.profile,
      token: tokenResponse,
    };

    const sessionKey = otpSessionKeyFromType(identifierType);
    await this.#setOtpLoginResponseToState(result, sessionKey);

    return result.token.accessToken;
  }

  /**
   * Returns the bearer token for an OTP session.
   * Throws if no valid session exists for the given key.
   *
   * @param sessionKey - 'otp:email' or 'otp:phone'
   * @returns The access token
   */
  public async getOtpBearerToken(sessionKey: OtpSessionKey): Promise<string> {
    const session = await this.#getOtpLoginResponseFromState(sessionKey);
    if (!session) {
      throw new Error(`getOtpBearerToken - no session for: ${sessionKey}.`);
    }
    return session.token.accessToken;
  }

  /**
   * Returns the session profile for an OTP session.
   * Throws if no valid session exists for the given key.
   *
   * @param sessionKey - 'otp:email' or 'otp:phone'
   * @returns The user profile
   */
  public async getOtpSessionProfile(
    sessionKey: OtpSessionKey,
  ): Promise<UserProfile> {
    const session = await this.#getOtpLoginResponseFromState(sessionKey);
    if (!session) {
      throw new Error(`getOtpSessionProfile - no session for: ${sessionKey}.`);
    }
    return session.profile;
  }

  /**
   * Clears OTP session(s).
   *
   * @param identifierType - If provided, clears only that session ('email' or 'phone'); otherwise clears all OTP sessions.
   */
  public performOtpSignOut(identifierType?: OtpIdentifierType): void {
    this.update((state) => {
      if (!state.otpSessionData) {
        return;
      }
      if (identifierType) {
        delete state.otpSessionData[otpSessionKeyFromType(identifierType)];
      } else {
        state.otpSessionData = undefined;
      }
    });
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
