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
import type { SnapControllerHandleRequestAction } from '@metamask/snaps-controllers';
import type { Json } from '@metamask/utils';

import type {
  LoginResponse,
  ProfileAlias,
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
import {
  createSnapPublicKeyRequest,
  createSnapAllPublicKeysRequest,
  createSnapSignMessageRequest,
} from './auth-snap-requests';
import { AuthenticationControllerMethodActions } from './AuthenticationController-method-action-types';

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
  'refreshCanonicalProfileId',
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

export type ProfileSignInInfo = {
  profileId: string;
  profileAliases: ProfileAlias[];
  profileIdChanged: boolean;
};

export type AuthenticationControllerProfileSignInEvent = {
  type: `${typeof controllerName}:profileSignIn`;
  payload: [ProfileSignInInfo];
};

export type Events =
  | AuthenticationControllerStateChangeEvent
  | AuthenticationControllerProfileSignInEvent;

// Allowed Actions
type AllowedActions =
  | KeyringControllerGetStateAction
  | SnapControllerHandleRequestAction;

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

  #cachedPrimaryEntropySourceId?: string;

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
    const resolvedId =
      entropySourceId ?? (await this.#getPrimaryEntropySourceId());
    if (!this.state.srpSessionData?.[resolvedId]) {
      return null;
    }
    return this.state.srpSessionData[resolvedId];
  }

  async #setLoginResponseToState(
    loginResponse: LoginResponse,
    entropySourceId?: string,
  ) {
    const resolvedId =
      entropySourceId ?? (await this.#getPrimaryEntropySourceId());
    const metaMetricsId = await this.#metametrics.getMetaMetricsId();
    this.update((state) => {
      state.isSignedIn = true;
      if (!state.srpSessionData) {
        state.srpSessionData = {};
      }
      state.srpSessionData[resolvedId] = {
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

  async #getPrimaryEntropySourceId(): Promise<string> {
    if (this.#cachedPrimaryEntropySourceId) {
      return this.#cachedPrimaryEntropySourceId;
    }
    const allPublicKeys = await this.#snapGetAllPublicKeys();

    if (allPublicKeys.length === 0) {
      throw new Error(
        '#getPrimaryEntropySourceId - No entropy sources found from snap',
      );
    }

    const primaryId = allPublicKeys[0][0];
    if (!primaryId) {
      throw new Error(
        '#getPrimaryEntropySourceId - Primary entropy source ID is undefined',
      );
    }

    this.#cachedPrimaryEntropySourceId = primaryId;
    return this.#cachedPrimaryEntropySourceId;
  }

  public async performSignIn(): Promise<string[]> {
    this.#assertIsUnlocked('performSignIn');

    const allPublicKeys = await this.#snapGetAllPublicKeys();
    const accessTokens: string[] = [];

    // We iterate sequentially in order to be sure that the first entry
    // is the primary SRP LoginResponse.
    for (const [entropySourceId] of allPublicKeys) {
      const accessToken = await this.#auth.getAccessToken(entropySourceId);
      accessTokens.push(accessToken);
    }

    // Pair SRP profiles (idempotent — no-op if already paired)
    if (accessTokens.length >= 2) {
      await this.#performPairing(accessTokens);
    }

    return accessTokens;
  }

  async #performPairing(accessTokens: string[]): Promise<void> {
    const previousCanonical = await this.#getCanonicalProfileId();

    try {
      const profileAliases = await this.#pairSrpProfiles(accessTokens);

      const newCanonical = await this.#getCanonicalProfileId();
      const profileIdChanged = previousCanonical !== newCanonical;
      const shouldEmitProfileSignInEvent =
        profileIdChanged || profileAliases.length > 0;

      if (shouldEmitProfileSignInEvent && newCanonical) {
        this.messenger.publish('AuthenticationController:profileSignIn', {
          profileId: newCanonical,
          profileAliases,
          profileIdChanged,
        });
      }
    } catch {
      // Pairing failure is non-fatal — retry on next performSignIn
    }
  }

  async #pairSrpProfiles(accessTokens: string[]): Promise<ProfileAlias[]> {
    if (accessTokens.length < 2) {
      return [];
    }
    const primaryAccessToken = accessTokens[0]; // Associated with primary SRP.
    const {
      profileAliases,
      profile: { canonicalProfileId },
    } = await this.#auth.pairSrpProfiles(accessTokens, primaryAccessToken);
    this.#propagateCanonical(canonicalProfileId);
    return profileAliases;
  }

  #propagateCanonical(canonicalProfileId: string): void {
    const { srpSessionData } = this.state;
    if (!srpSessionData) {
      return;
    }

    this.update((state) => {
      for (const entry of Object.values(state.srpSessionData ?? {})) {
        if (entry?.profile) {
          entry.profile.canonicalProfileId = canonicalProfileId;
        }
      }
    });
  }

  /**
   * Returns the canonical profile id from the primary SRP's cached session.
   * Returns `null` when no session exists yet for the primary SRP.
   *
   * Always reads from the primary SRP because the canonical is shared across
   * all paired SRPs after `#propagateCanonical`.
   *
   * @returns The canonical profile id, or `null` if unavailable.
   */
  async #getCanonicalProfileId(): Promise<string | null> {
    const primaryEntropySourceId = await this.#getPrimaryEntropySourceId();
    return (
      this.state.srpSessionData?.[primaryEntropySourceId]?.profile
        ?.canonicalProfileId ?? null
    );
  }

  public performSignOut(): void {
    this.#cachedPrimaryEntropySourceId = undefined;
    this.update((state) => {
      state.isSignedIn = false;
      state.srpSessionData = undefined;
    });
  }

  /**
   * Returns a bearer token for the specified SRP, logging in if needed.
   *
   * When called without `entropySourceId`, returns the primary (first) SRP's
   * access token, which is effectively the canonical
   * profile's token that can be used by alias-aware consumers for cross-SRP
   * operations.
   *
   * @param entropySourceId - The entropy source ID. Omit for the primary SRP.
   * @returns The OIDC access token.
   */
  public async getBearerToken(entropySourceId?: string): Promise<string> {
    this.#assertIsUnlocked('getBearerToken');
    const resolvedId =
      entropySourceId ?? (await this.#getPrimaryEntropySourceId());
    return await this.#auth.getAccessToken(resolvedId);
  }

  /**
   * Returns the cached session profile, logging in if no session exists.
   *
   * The returned `canonicalProfileId` reflects the value from the most recent
   * login or pairing. In the rare event where a canonical changed because of
   * a pairing that happened on another device, the cached value may be stale
   * until the next login. For guaranteed freshness, call
   * `refreshCanonicalProfileId()` before reading `canonicalProfileId`.
   *
   * @param entropySourceId - The entropy source ID used to derive the key,
   * when multiple sources are available (Multi-SRP).
   * @returns profile for the session.
   */
  public async getSessionProfile(
    entropySourceId?: string,
  ): Promise<UserProfile> {
    this.#assertIsUnlocked('getSessionProfile');
    const resolvedId =
      entropySourceId ?? (await this.#getPrimaryEntropySourceId());
    return await this.#auth.getUserProfile(resolvedId);
  }

  /**
   * Forces a fresh retrieval of the canonical profile ID from the server
   * and propagates it to all cached SRP sessions.
   *
   * This method invalidates the primary SRP's cached session and forces a
   * re-login. Use it before operations that require a guaranteed-fresh
   * canonical (e.g. storage key derivation for Accounts ADR 0005). For
   * best-effort reads, use
   * `getSessionProfile().canonicalProfileId` instead.
   *
   * Only the primary SRP is re-logged-in regardless of how many SRPs exist —
   * the server returns the current canonical for the entire pairing group
   * from any single SRP login.
   *
   * @returns The refreshed canonical profile ID.
   */
  public async refreshCanonicalProfileId(): Promise<string> {
    this.#assertIsUnlocked('refreshCanonicalProfileId');

    const primaryEntropySourceId = await this.#getPrimaryEntropySourceId();
    this.#invalidateSrpSession(primaryEntropySourceId);
    await this.#auth.getAccessToken(primaryEntropySourceId);

    const canonical = await this.#getCanonicalProfileId();
    if (!canonical) {
      throw new Error(
        'refreshCanonicalProfileId - Unable to resolve canonical profile ID',
      );
    }

    this.#propagateCanonical(canonical);
    return canonical;
  }

  #invalidateSrpSession(entropySourceId: string): void {
    this.update((state) => {
      const entry = state.srpSessionData?.[entropySourceId];
      if (entry?.profile) {
        // Setting canonicalProfileId to '' forces a re-fetch on the next
        // #getAuthSession call. The falsy check (!auth.profile.canonicalProfileId)
        // treats '' the same as undefined/null — all signal an invalid session.
        entry.profile.canonicalProfileId = '';
      }
    });
  }

  public async getUserProfileLineage(
    entropySourceId?: string,
  ): Promise<UserProfileLineage> {
    this.#assertIsUnlocked('getUserProfileLineage');
    const resolvedId =
      entropySourceId ?? (await this.#getPrimaryEntropySourceId());
    return await this.#auth.getUserProfileLineage(resolvedId);
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
