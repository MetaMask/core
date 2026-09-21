import type { Eip1193Provider } from 'ethers';

import type { MetaMetricsAuth } from '../../shared/types/services.js';
import { MfaError, ValidationError, RateLimitedError } from '../errors.js';
import { getMetaMaskProviderEIP6963 } from '../utils/eip-6963-metamask-provider.js';
import {
  MESSAGE_SIGNING_SNAP,
  assertMessageStartsWithMetamask,
  connectSnap,
  isSnapConnected,
} from '../utils/messaging-signing-snap-requests.js';
import { isFreshLoginResponse } from '../utils/is-fresh-login-response.js';
import {
  getMfaCredentials,
  mfaEnroll,
  mfaEnrollComplete,
  mfaVerify,
  mfaVerifyComplete,
} from './mfa/services.js';
import type { MfaStepUpAssertion } from './mfa/services.js';
import type {
  EnrolledCredential,
  EnrollmentChallenge,
  EnrollmentProof,
  MfaCredentialType,
  StepUpChallenge,
  StepUpProof,
} from './mfa/types.js';
import {
  authenticate,
  authorizeOIDC,
  getCustomerServiceToken,
  getNonce,
  getPartnerIdentityToken,
  getUserProfileLineage,
  pairProfiles,
  pairSocialIdentifier,
} from './services.js';
import type { PairProfilesResponse } from './services.js';
import type {
  AuthConfig,
  AccessToken,
  AuthSigningOptions,
  AuthStorageOptions,
  AuthType,
  IBaseAuth,
  LoginIdentifierType,
  LoginResponse,
  OidcTokenAudience,
  OidcTokenClaims,
  PairSocialIdentifierParams,
  SrpLoginTag,
  UserProfile,
  UserProfileLineage,
} from './types.js';
import { computeIdentifierId } from './utils/identifier.js';
import * as timeUtils from './utils/time.js';

type JwtBearerAuth_SRP_Options = {
  storage: AuthStorageOptions;
  signing?: AuthSigningOptions;
  /**
   * Resolves the login tag for a given entropy source.
   * When omitted, `raw_message` stays untagged (`metamask:<nonce>:<pubkey>`).
   */
  getLoginTag?: (entropySourceId?: string) => Promise<SrpLoginTag>;
  /**
   * Resolves the metametrics `identifier_type` for a given entropy source.
   * Defaults to `'SRP'` when omitted.
   */
  getLoginIdentifierType?: (
    entropySourceId?: string,
  ) => Promise<LoginIdentifierType>;
  rateLimitRetry?: {
    cooldownDefaultMs?: number; // default cooldown when 429 has no Retry-After
    maxLoginRetries?: number; // maximum number of login retries on rate limit
  };
};

// How long a successful pairing result stays cached so identical payloads
// (concurrent or sequential retries) reuse it instead of re-hitting the endpoint.
export const PAIR_DEDUPE_TTL_MS = 30_000;

const getDefaultEIP6963Provider = async () => {
  const provider = await getMetaMaskProviderEIP6963();
  if (!provider) {
    throw new ValidationError('No MetaMask wallet connected');
  }
  return provider;
};

const getDefaultEIP6963SigningOptions = (
  customProvider?: Eip1193Provider,
): AuthSigningOptions => ({
  getIdentifier: async (entropySourceId?: string): Promise<string> => {
    const provider = customProvider ?? (await getDefaultEIP6963Provider());
    return await MESSAGE_SIGNING_SNAP.getPublicKey(provider, entropySourceId);
  },
  signMessage: async (
    message: string,
    entropySourceId?: string,
  ): Promise<string> => {
    const provider = customProvider ?? (await getDefaultEIP6963Provider());
    assertMessageStartsWithMetamask(message);
    return await MESSAGE_SIGNING_SNAP.signMessage(
      provider,
      message,
      entropySourceId,
    );
  },
});

export class SRPJwtBearerAuth implements IBaseAuth {
  readonly #config: AuthConfig;

  readonly #options: {
    storage: AuthStorageOptions;
    signing: AuthSigningOptions;
  };

  readonly #metametrics?: MetaMetricsAuth;

  // Map to store ongoing login promises by entropySourceId
  readonly #ongoingLogins = new Map<
    string | undefined,
    Promise<LoginResponse>
  >();

  // Map to dedupe pairing calls by an order-insensitive token-set key.
  // Holds the in-flight promise (coalescing concurrent callers) and keeps it
  // for a short TTL after success (collapsing sequential retries).
  readonly #ongoingPairings = new Map<
    string,
    { promise: Promise<PairProfilesResponse>; expiresAt: number }
  >();

  // Default cooldown when 429 has no Retry-After header
  readonly #cooldownDefaultMs: number;

  // Maximum number of login retries on rate limit errors
  readonly #maxLoginRetries: number;

  readonly #getLoginTag?: (entropySourceId?: string) => Promise<SrpLoginTag>;

  readonly #getLoginIdentifierType?: (
    entropySourceId?: string,
  ) => Promise<LoginIdentifierType>;

  #customProvider?: Eip1193Provider;

  constructor(
    config: AuthConfig & { type: AuthType.SRP },
    options: JwtBearerAuth_SRP_Options & {
      customProvider?: Eip1193Provider;
      metametrics?: MetaMetricsAuth;
    },
  ) {
    this.#config = config;
    this.#customProvider = options.customProvider;
    this.#getLoginTag = options.getLoginTag;
    this.#getLoginIdentifierType = options.getLoginIdentifierType;
    this.#options = {
      storage: options.storage,
      signing:
        options.signing ??
        getDefaultEIP6963SigningOptions(this.#customProvider),
    };
    this.#metametrics = options.metametrics;

    // Apply rate limit retry config if provided
    this.#cooldownDefaultMs =
      options.rateLimitRetry?.cooldownDefaultMs ?? 10000;
    this.#maxLoginRetries = options.rateLimitRetry?.maxLoginRetries ?? 1;
  }

  setCustomProvider(provider: Eip1193Provider) {
    this.#customProvider = provider;
    this.#options.signing = getDefaultEIP6963SigningOptions(provider);
  }

  // TODO: might be easier to keep entropySourceId as a class param and use multiple SRPJwtBearerAuth instances where needed
  async getAccessToken(entropySourceId?: string): Promise<string> {
    const session = await this.#getAuthSession(entropySourceId);
    if (session) {
      return session.token.accessToken;
    }

    const loginResponse = await this.#login(entropySourceId);
    return loginResponse.token.accessToken;
  }

  async getUserProfile(entropySourceId?: string): Promise<UserProfile> {
    const session = await this.#getAuthSession(entropySourceId);
    if (session) {
      return session.profile;
    }

    const loginResponse = await this.#login(entropySourceId);
    return loginResponse.profile;
  }

  async getIdentifier(entropySourceId?: string): Promise<string> {
    return await this.#options.signing.getIdentifier(entropySourceId);
  }

  async getUserProfileLineage(
    entropySourceId?: string,
  ): Promise<UserProfileLineage> {
    const accessToken = await this.getAccessToken(entropySourceId);
    return await getUserProfileLineage(this.#config.env, accessToken);
  }

  async getCustomerServiceToken(entropySourceId?: string): Promise<string> {
    const accessToken = await this.getAccessToken(entropySourceId);
    return await getCustomerServiceToken(this.#config.env, accessToken);
  }

  async getPartnerIdentityToken(
    claims: OidcTokenClaims,
    audience: OidcTokenAudience,
    entropySourceId?: string,
  ): Promise<string> {
    const accessToken = await this.getAccessToken(entropySourceId);
    return await getPartnerIdentityToken(
      this.#config.env,
      accessToken,
      claims,
      audience,
    );
  }

  /**
   * Begins enrollment of an MFA credential for the primary profile.
   *
   * @param type - Credential type to enroll.
   * @param options - Enrollment options.
   * @param options.email - Email address, required for email OTP.
   * @param options.entropySourceId - Entropy source whose profile owns the
   * credential.
   * @returns Enrollment challenge for the client ceremony.
   */
  async beginMfaEnrollment(
    type: MfaCredentialType,
    options?: { email?: string; entropySourceId?: string },
  ): Promise<EnrollmentChallenge> {
    const { email, entropySourceId } = options ?? {};
    const accessToken = await this.getAccessToken(entropySourceId);
    const result = await mfaEnroll(this.#config.env, accessToken, {
      credential_type: type,
      ...(email ? { identifier: email } : {}),
    });

    if (type === 'passkey') {
      if (!result.publicKey) {
        throw new MfaError(
          'invalid_response',
          'Passkey enrollment response is missing creation data',
        );
      }
      return {
        type,
        flowId: result.flowId,
        expiresAt: result.expiresAt,
        publicKey: result.publicKey,
      };
    }
    return {
      type,
      flowId: result.flowId,
      expiresAt: result.expiresAt,
    };
  }

  /**
   * Completes enrollment of an MFA credential.
   *
   * @param flowId - Identifier returned by the begin call.
   * @param proof - Platform attestation or email code.
   * @param entropySourceId - Entropy source whose profile owns the credential.
   */
  async completeMfaEnrollment(
    flowId: string,
    proof: EnrollmentProof,
    entropySourceId?: string,
  ): Promise<void> {
    const accessToken = await this.getAccessToken(entropySourceId);
    await mfaEnrollComplete(this.#config.env, accessToken, {
      credential_type: proof.type,
      flow_id: flowId,
      ...(proof.type === 'passkey'
        ? { passkey_attestation: proof.attestation }
        : { otp_code: proof.code }),
    });
  }

  /**
   * Begins step-up verification with an enrolled credential.
   *
   * @param type - Credential type to verify.
   * @param entropySourceId - Entropy source whose profile owns the credential.
   * @returns Verification challenge for the client ceremony.
   */
  async beginMfaVerification(
    type: MfaCredentialType,
    entropySourceId?: string,
  ): Promise<StepUpChallenge> {
    const accessToken = await this.getAccessToken(entropySourceId);
    const result = await mfaVerify(this.#config.env, accessToken, {
      credential_type: type,
    });

    if (type === 'passkey') {
      if (!result.publicKey) {
        throw new MfaError(
          'invalid_response',
          'Passkey verification response is missing request data',
        );
      }
      return {
        type,
        flowId: result.flowId,
        expiresAt: result.expiresAt,
        publicKey: result.publicKey,
      };
    }
    return {
      type,
      flowId: result.flowId,
      expiresAt: result.expiresAt,
    };
  }

  /**
   * Completes step-up verification with an enrolled credential.
   *
   * @param flowId - Identifier returned by the begin call.
   * @param proof - Platform assertion or email code.
   * @param entropySourceId - Entropy source whose profile owns the credential.
   * @returns AAL2 assertion issued after verification.
   */
  async completeMfaVerification(
    flowId: string,
    proof: StepUpProof,
    entropySourceId?: string,
  ): Promise<MfaStepUpAssertion> {
    const accessToken = await this.getAccessToken(entropySourceId);
    return await mfaVerifyComplete(this.#config.env, accessToken, {
      credential_type: proof.type,
      flow_id: flowId,
      ...(proof.type === 'passkey'
        ? { passkey_assertion: proof.assertion }
        : { otp_code: proof.code }),
    });
  }

  /**
   * Gets credentials enrolled on the primary profile.
   *
   * @param entropySourceId - Entropy source whose profile owns the credentials.
   * @returns Supported enrolled credentials.
   */
  async getMfaCredentials(
    entropySourceId?: string,
  ): Promise<EnrolledCredential[]> {
    const accessToken = await this.getAccessToken(entropySourceId);
    return await getMfaCredentials(this.#config.env, accessToken);
  }

  /**
   * Exchanges an MFA assertion for an elevated access token.
   *
   * @param assertionJwt - AAL2 authentication assertion.
   * @returns Elevated access token.
   */
  async exchangeMfaAssertion(assertionJwt: string): Promise<AccessToken> {
    return await authorizeOIDC(
      assertionJwt,
      this.#config.env,
      this.#config.platform,
    );
  }

  async pairSocialIdentifier(
    params: PairSocialIdentifierParams,
    authAccessToken: string,
  ): Promise<void> {
    await pairSocialIdentifier(params, authAccessToken, this.#config.env);
  }

  async pairSrpProfiles(
    accessTokens: string[],
    authAccessToken: string,
  ): Promise<PairProfilesResponse> {
    // Order-insensitive key: the same token set in any order maps to the same
    // entry. Sort a copy so the request payload itself stays primary-first.
    const key = JSON.stringify([...accessTokens].sort());

    const cached = this.#ongoingPairings.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return await cached.promise;
    }

    const promise = pairProfiles(
      accessTokens,
      authAccessToken,
      this.#config.env,
    );
    // Store the in-flight promise immediately so concurrent callers coalesce
    // regardless of how long the request takes.
    this.#ongoingPairings.set(key, {
      promise,
      expiresAt: Number.MAX_SAFE_INTEGER,
    });

    try {
      const result = await promise;
      // Keep the resolved result cached for a short window so sequential
      // retries with the same payload reuse it.
      this.#ongoingPairings.set(key, {
        promise,
        expiresAt: Date.now() + PAIR_DEDUPE_TTL_MS,
      });
      return result;
    } catch (error) {
      // Never cache failures: the pairing retry loop must be able to re-hit
      // the endpoint on the next attempt.
      this.#ongoingPairings.delete(key);
      throw error;
    }
  }

  async signMessage(
    message: string,
    entropySourceId?: string,
  ): Promise<string> {
    return await this.#options.signing.signMessage(message, entropySourceId);
  }

  async isSnapConnected(): Promise<boolean> {
    const provider =
      this.#customProvider ?? (await getDefaultEIP6963Provider());
    if (!provider) {
      return false;
    }

    const isConnected = await isSnapConnected(provider);
    return isConnected;
  }

  async connectSnap(): Promise<string> {
    const provider =
      this.#customProvider ?? (await getDefaultEIP6963Provider());

    const res = await connectSnap(provider);
    return res;
  }

  async #getAuthSession(
    entropySourceId?: string,
  ): Promise<LoginResponse | null> {
    const auth = await this.#options.storage.getLoginResponse(entropySourceId);
    if (!isFreshLoginResponse(auth)) {
      return null;
    }

    // get canonical profile id from server if not present in the cached session
    if (!auth.profile.canonicalProfileId) {
      return null;
    }

    return auth;
  }

  async #login(entropySourceId?: string): Promise<LoginResponse> {
    // Use a deferred login to avoid race conditions
    return await this.#deferredLogin(entropySourceId);
  }

  async #performLogin(entropySourceId?: string): Promise<LoginResponse> {
    // Nonce
    const publicKey = await this.getIdentifier(entropySourceId);
    const nonceRes = await getNonce(publicKey, this.#config.env);

    // Tag only when the wallet supplies getLoginTag. SDK callers keep the
    // legacy 3-part message rather than guessing `primary`.
    const tag = await this.#getLoginTag?.(entropySourceId);
    const identifierType =
      (await this.#getLoginIdentifierType?.(entropySourceId)) ?? 'SRP';
    const rawMessage = this.#createSrpLoginRawMessage(
      nonceRes.nonce,
      publicKey,
      tag,
    );
    const signature = await this.signMessage(rawMessage, entropySourceId);

    // Authenticate
    const authResponse = await authenticate(
      rawMessage,
      signature,
      this.#config.type,
      this.#config.env,
      this.#metametrics,
      identifierType,
    );

    // Resolve original profileId from aliases.
    // This is done mainly to preserve the original profileId for storage key derivation
    // until we migrate to the canonical profileId storage system.
    const canonicalProfileId = authResponse.profile.profileId;
    const profile = { ...authResponse.profile };

    if (authResponse.profileAliases?.length > 0) {
      const targetIdentifierId = computeIdentifierId(
        publicKey,
        this.#config.env,
      );

      const matchingAliases = authResponse.profileAliases.filter((alias) =>
        alias.identifierIds.some((id) => id.id === targetIdentifierId),
      );

      // Prefer the leaf alias (single identifier) — it's the original profile
      // created for this SRP. Multi-identifier aliases are former canonicals
      // that absorbed other profiles; they are correct only when this SRP's
      // original profile was itself a canonical before being absorbed.
      const targetAlias =
        matchingAliases.find((alias) => alias.identifierIds.length === 1) ??
        matchingAliases[0];

      if (targetAlias) {
        profile.profileId = targetAlias.aliasProfileId;
      }
    }

    profile.canonicalProfileId = canonicalProfileId;

    // Authorize
    const tokenResponse = await authorizeOIDC(
      authResponse.token,
      this.#config.env,
      this.#config.platform,
    );

    // Save
    const result: LoginResponse = {
      profile,
      token: tokenResponse,
    };

    await this.#options.storage.setLoginResponse(result, entropySourceId);

    return result;
  }

  async #deferredLogin(entropySourceId?: string): Promise<LoginResponse> {
    // Check if there's already an ongoing login for this entropySourceId
    const existingLogin = this.#ongoingLogins.get(entropySourceId);
    if (existingLogin) {
      return existingLogin;
    }

    // Create a new login promise
    const loginPromise = this.#loginWithRetry(entropySourceId);

    // Store the promise in the map
    this.#ongoingLogins.set(entropySourceId, loginPromise);

    try {
      // Wait for the login to complete
      return await loginPromise;
    } finally {
      // Always clean up the ongoing login promise when done
      this.#ongoingLogins.delete(entropySourceId);
    }
  }

  async #loginWithRetry(entropySourceId?: string): Promise<LoginResponse> {
    // Allow max attempts: initial + maxLoginRetries on 429
    for (let attempt = 0; attempt < 1 + this.#maxLoginRetries; attempt += 1) {
      try {
        return await this.#performLogin(entropySourceId);
      } catch (e) {
        // Only retry on rate-limit (429) errors
        if (!RateLimitedError.isRateLimitError(e)) {
          throw e;
        }

        // If we've exhausted attempts, rethrow
        if (attempt >= this.#maxLoginRetries) {
          throw e;
        }

        // Wait for Retry-After or default cooldown
        const waitMs = e.retryAfterMs ?? this.#cooldownDefaultMs;
        await timeUtils.delay(waitMs);

        // Loop continues to retry
      }
    }

    // Should never reach here due to loop logic, but TypeScript needs a return
    throw new Error('Unexpected: login loop exhausted without result');
  }

  #createSrpLoginRawMessage(
    nonce: string,
    publicKey: string,
    tag?: SrpLoginTag,
  ):
    | `metamask:${string}:${string}`
    | `metamask:${string}:${string}:${SrpLoginTag}` {
    if (tag) {
      return `metamask:${nonce}:${publicKey}:${tag}` as const;
    }
    return `metamask:${nonce}:${publicKey}` as const;
  }
}
