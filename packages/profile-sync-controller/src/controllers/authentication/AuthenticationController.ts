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
import type { SeedlessOnboardingControllerGetStateAction } from '@metamask/seedless-onboarding-controller';
import type { SnapControllerHandleRequestAction } from '@metamask/snaps-controllers';
import type { Json } from '@metamask/utils';

import type {
  LoginIdentifierType,
  LoginResponse,
  ProfileAlias,
  SRPInterface,
  SrpLoginTag,
  UserProfile,
  UserProfileLineage,
} from '../../sdk/index.js';
import {
  assertMessageStartsWithMetamask,
  AuthType,
  Env,
  JwtBearerAuth,
} from '../../sdk/index.js';
import type { MetaMetricsAuth } from '../../shared/types/services.js';
import {
  getHdKeyringEntropySourceIds,
  getPrimaryHdKeyringEntropySourceId,
} from '../../shared/utils/entropy-source.js';
import {
  createSnapPublicKeyRequest,
  createSnapSignMessageRequest,
} from './auth-snap-requests.js';
import { AuthenticationControllerMethodActions } from './AuthenticationController-method-action-types.js';

const controllerName = 'AuthenticationController';

// State
export type AuthenticationControllerState = {
  isSignedIn: boolean;
  srpSessionData?: Record<string, LoginResponse>;
  /**
   * Client gate for profile pairing. Defaults to `true` (fresh install /
   * upgrade), set to `false` after a successful `performSignIn` pair, set
   * back to `true` via `requestProfilePairing()` when the SRP set changes,
   * and left `true` on pair failure so the next state shift retries.
   *
   * Optional in the type so partial-state selectors stay assignable to
   * `AuthenticationControllerState`. The controller seeds it via
   * `defaultState` at construction; consumers should read `undefined` as
   * `true` to mirror that runtime default.
   */
  needsProfilePairing?: boolean;
};
export const defaultState: AuthenticationControllerState = {
  isSignedIn: false,
  needsProfilePairing: true,
};
const metadata: StateMetadata<AuthenticationControllerState> = {
  isSignedIn: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  needsProfilePairing: {
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
  'getCustomerServiceToken',
  'isSignedIn',
  'requestProfilePairing',
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
  | SnapControllerHandleRequestAction
  | SeedlessOnboardingControllerGetStateAction;

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

  // Bumped by `requestProfilePairing`. `performSignIn` snapshots this
  // before its first await; if it changes mid-flight we must NOT clear
  // `needsProfilePairing` (the rearm signal wins).
  #profilePairingRequestEpoch = 0;

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
        getLoginTag: this.#getLoginTag.bind(this),
        getLoginIdentifierType: this.#getLoginIdentifierType.bind(this),
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
    const resolvedId = entropySourceId ?? this.#getPrimaryEntropySourceId();
    if (!this.state.srpSessionData?.[resolvedId]) {
      return null;
    }
    return this.state.srpSessionData[resolvedId];
  }

  async #setLoginResponseToState(
    loginResponse: LoginResponse,
    entropySourceId?: string,
  ) {
    const resolvedId = entropySourceId ?? this.#getPrimaryEntropySourceId();
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

  /**
   * Reads the HD keyring entropy source IDs from KeyringController.
   *
   * @returns The HD keyring metadata IDs, primary first.
   */
  #getHdKeyringEntropySourceIds(): string[] {
    const { keyrings } = this.messenger.call('KeyringController:getState');
    return getHdKeyringEntropySourceIds(keyrings);
  }

  /**
   * Resolves the primary SRP's entropy source ID from KeyringController rather
   * than the message-signing snap, so callers like `getBearerToken()` are not
   * blocked on snap boot.
   *
   * @returns The primary HD keyring metadata ID.
   * @throws If no HD keyring is available; callers must only resolve while
   * the wallet is unlocked.
   */
  #getPrimaryEntropySourceId(): string {
    const { keyrings } = this.messenger.call('KeyringController:getState');
    return getPrimaryHdKeyringEntropySourceId(keyrings);
  }

  /**
   * Resolves the SRP login tag for `raw_message`.
   *
   * - `primary` for the first HD entropy source
   * - `secondary` for any other entropy source
   *
   * @param entropySourceId - Entropy source for this login attempt.
   * @returns The login tag to append to the signed message.
   */
  async #getLoginTag(entropySourceId?: string): Promise<SrpLoginTag> {
    const primaryEntropySourceId = this.#getPrimaryEntropySourceId();
    const resolvedId = entropySourceId ?? primaryEntropySourceId;

    return resolvedId === primaryEntropySourceId ? 'primary' : 'secondary';
  }

  /**
   * Resolves metametrics `identifier_type` for `/srp/login`
   * (`SRP` | `GOOGLE` | `APPLE` | `TELEGRAM`).
   *
   * This is the auth method for the entropy source, independent of
   * {@link SrpLoginTag} (`primary` / `secondary`).
   *
   * SeedlessOnboarding currently exposes a single vault-level
   * `authConnection`, which always backs the primary entropy source. Non-
   * primary sources therefore return `SRP`. If social identities become
   * per-entropy later, resolve from that metadata instead of assuming
   * primary === social.
   *
   * Soft-fails to `SRP` when SeedlessOnboarding is not registered.
   *
   * @param entropySourceId - Entropy source for this login attempt.
   * @returns The login identifier type.
   */
  async #getLoginIdentifierType(
    entropySourceId?: string,
  ): Promise<LoginIdentifierType> {
    const primaryEntropySourceId = this.#getPrimaryEntropySourceId();
    const resolvedId = entropySourceId ?? primaryEntropySourceId;

    // Social vault authConnection is only associated with the primary source.
    if (resolvedId !== primaryEntropySourceId) {
      return 'SRP';
    }

    return this.#resolveSocialIdentifierType();
  }

  /**
   * Maps `SeedlessOnboardingController.state.authConnection` to a login
   * identifier type when a social vault is present.
   *
   * Returns `SRP` if there is no vault, the provider is unrecognized, or
   * SeedlessOnboardingController is unavailable on the messenger.
   *
   * @returns The social provider identifier type, or `SRP`.
   */
  #resolveSocialIdentifierType(): LoginIdentifierType {
    try {
      const { vault, authConnection } = this.messenger.call(
        'SeedlessOnboardingController:getState',
      );
      if (vault === null || vault === undefined) {
        return 'SRP';
      }

      // Match provider strings from SeedlessOnboarding state rather than
      // importing AuthConnection — a value import would load that package
      // (and its heavy deps) whenever this controller is imported.
      switch (authConnection) {
        case 'google':
          return 'GOOGLE';
        case 'apple':
          return 'APPLE';
        case 'telegram':
          return 'TELEGRAM';
        default:
          return 'SRP';
      }
    } catch {
      return 'SRP';
    }
  }

  public async performSignIn(): Promise<string[]> {
    this.#assertIsUnlocked('performSignIn');

    const epochAtStart = this.#profilePairingRequestEpoch;
    const entropySourceIds = this.#getHdKeyringEntropySourceIds();
    const accessTokens: string[] = [];

    // We iterate sequentially in order to be sure that the first entry
    // is the primary SRP LoginResponse.
    for (const entropySourceId of entropySourceIds) {
      const accessToken = await this.#auth.getAccessToken(entropySourceId);
      accessTokens.push(accessToken);
    }

    if (entropySourceIds.length < 2) {
      // Single-SRP wallet: nothing to pair.
      this.#tryClearNeedsProfilePairing(epochAtStart);
    } else {
      // Pair failures must not break sign-in; the gate stays `true` for retry.
      try {
        await this.#doPair(accessTokens, epochAtStart);
      } catch {
        // noop
      }
    }

    return accessTokens;
  }

  /**
   * Marks profile pairing as needed. Clients call this when the SRP set
   * changes (e.g. a new keyring was added) so the next auto-sign-in cycle
   * re-runs `performSignIn` and re-pairs.
   */
  public requestProfilePairing(): void {
    this.#profilePairingRequestEpoch += 1;
    if (!this.state.needsProfilePairing) {
      this.update((state) => {
        state.needsProfilePairing = true;
      });
    }
  }

  /**
   * Clears `needsProfilePairing` only if no `requestProfilePairing` call
   * landed since `epochAtStart` was captured. Prevents `performSignIn`
   * from silently overwriting a concurrent rearm.
   *
   * @param epochAtStart - Epoch value captured at the start of `performSignIn`.
   */
  #tryClearNeedsProfilePairing(epochAtStart: number): void {
    if (this.#profilePairingRequestEpoch !== epochAtStart) {
      return;
    }
    if (this.state.needsProfilePairing) {
      this.update((state) => {
        state.needsProfilePairing = false;
      });
    }
  }

  /**
   * Pairs all SRPs via `POST /profile/pair`, propagates the canonical
   * profile ID, clears `needsProfilePairing`, and emits
   * `AuthenticationController:profileSignIn` when the canonical changes or
   * new aliases are returned. Throws on failure.
   *
   * @param accessTokens - Per-SRP access tokens, primary first.
   * @param epochAtStart - Pairing-request epoch captured by the caller.
   * Used to skip the gate clear if `requestProfilePairing` ran while the
   * pair API call was in-flight.
   */
  async #doPair(accessTokens: string[], epochAtStart: number): Promise<void> {
    const previousCanonical = this.#getCanonicalProfileId();

    const profileAliases = await this.#pairSrpProfiles(accessTokens);
    const newCanonical = this.#getCanonicalProfileId();

    // If somehow we cannot compute the new canonical profile ID after pairing,
    // we just return now and do not update the `needsProfilePairing` flag.
    if (!newCanonical) {
      return;
    }

    this.#tryClearNeedsProfilePairing(epochAtStart);

    const profileIdChanged = previousCanonical !== newCanonical;
    const shouldEmitProfileSignInEvent =
      profileIdChanged || profileAliases.length > 0;

    if (shouldEmitProfileSignInEvent) {
      this.messenger.publish('AuthenticationController:profileSignIn', {
        profileId: newCanonical,
        profileAliases,
        profileIdChanged,
      });
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
  #getCanonicalProfileId(): string | null {
    const primaryEntropySourceId = this.#getPrimaryEntropySourceId();
    return (
      this.state.srpSessionData?.[primaryEntropySourceId]?.profile
        ?.canonicalProfileId ?? null
    );
  }

  public performSignOut(): void {
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
    const resolvedId = entropySourceId ?? this.#getPrimaryEntropySourceId();
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
    const resolvedId = entropySourceId ?? this.#getPrimaryEntropySourceId();
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

    const primaryEntropySourceId = this.#getPrimaryEntropySourceId();
    this.#invalidateSrpSession(primaryEntropySourceId);
    await this.#auth.getAccessToken(primaryEntropySourceId);

    const canonical = this.#getCanonicalProfileId();
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
    const resolvedId = entropySourceId ?? this.#getPrimaryEntropySourceId();
    return await this.#auth.getUserProfileLineage(resolvedId);
  }

  /**
   * Returns a Customer Service specific access token for the specified SRP,
   * logging in if needed.
   *
   * Exchanges the OIDC access token for a short-lived token scoped to the
   * customer-service audience. Customer Service tooling consumes this token to
   * identify and authenticate the user.
   *
   * @param entropySourceId - The entropy source ID. Omit for the primary SRP.
   * @returns The customer-service access token.
   */
  public async getCustomerServiceToken(
    entropySourceId?: string,
  ): Promise<string> {
    this.#assertIsUnlocked('getCustomerServiceToken');
    const resolvedId = entropySourceId ?? this.#getPrimaryEntropySourceId();
    return await this.#auth.getCustomerServiceToken(resolvedId);
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
