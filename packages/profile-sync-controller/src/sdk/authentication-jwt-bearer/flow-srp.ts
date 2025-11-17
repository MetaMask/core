import type { Eip1193Provider } from 'ethers';

import {
  authenticate,
  authorizeOIDC,
  getNonce,
  getUserProfileLineage,
} from './services';
import type {
  AuthConfig,
  AuthSigningOptions,
  AuthStorageOptions,
  AuthType,
  IBaseAuth,
  LoginResponse,
  UserProfile,
  UserProfileLineage,
} from './types';
import * as timeUtils from './utils/time';
import type { MetaMetricsAuth } from '../../shared/types/services';
import { ValidationError, RateLimitedError } from '../errors';
import { getMetaMaskProviderEIP6963 } from '../utils/eip-6963-metamask-provider';
import {
  MESSAGE_SIGNING_SNAP,
  assertMessageStartsWithMetamask,
  connectSnap,
  isSnapConnected,
} from '../utils/messaging-signing-snap-requests';
import { validateLoginResponse } from '../utils/validate-login-response';

type JwtBearerAuth_SRP_Options = {
  storage: AuthStorageOptions;
  signing?: AuthSigningOptions;
  rateLimitRetry?: {
    cooldownDefaultMs?: number; // default cooldown when 429 has no Retry-After
    maxLoginRetries?: number; // maximum number of login retries on rate limit
  };
};

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
  readonly #ongoingLogins = new Map<string, Promise<LoginResponse>>();

  // Default cooldown when 429 has no Retry-After header
  readonly #cooldownDefaultMs: number;

  // Maximum number of login retries on rate limit errors
  readonly #maxLoginRetries: number;

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

  async getUserProfileLineage(): Promise<UserProfileLineage> {
    const accessToken = await this.getAccessToken();
    return await getUserProfileLineage(this.#config.env, accessToken);
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

  // convert expiresIn from seconds to milliseconds and use 90% of expiresIn
  async #getAuthSession(
    entropySourceId?: string,
  ): Promise<LoginResponse | null> {
    const auth = await this.#options.storage.getLoginResponse(entropySourceId);
    if (!validateLoginResponse(auth)) {
      return null;
    }

    const currentTime = Date.now();
    const sessionAge = currentTime - auth.token.obtainedAt;
    const refreshThreshold = auth.token.expiresIn * 1000 * 0.9;

    if (sessionAge < refreshThreshold) {
      return auth;
    }
    return null;
  }

  async #login(entropySourceId?: string): Promise<LoginResponse> {
    // Use a deferred login to avoid race conditions
    return await this.#deferredLogin(entropySourceId);
  }

  async #performLogin(entropySourceId?: string): Promise<LoginResponse> {
    // Nonce
    const publicKey = await this.getIdentifier(entropySourceId);
    const nonceRes = await getNonce(publicKey, this.#config.env);

    const rawMessage = this.#createSrpLoginRawMessage(
      nonceRes.nonce,
      publicKey,
    );
    const signature = await this.signMessage(rawMessage, entropySourceId);

    // Authenticate
    const authResponse = await authenticate(
      rawMessage,
      signature,
      this.#config.type,
      this.#config.env,
      this.#metametrics,
    );

    // Authorize
    const tokenResponse = await authorizeOIDC(
      authResponse.token,
      this.#config.env,
      this.#config.platform,
    );

    // Save
    const result: LoginResponse = {
      profile: authResponse.profile,
      token: tokenResponse,
    };

    await this.#options.storage.setLoginResponse(result, entropySourceId);

    return result;
  }

  async #deferredLogin(entropySourceId?: string): Promise<LoginResponse> {
    // Use a key that accounts for undefined entropySourceId
    const loginKey = entropySourceId ?? '__default__';

    // Check if there's already an ongoing login for this entropySourceId
    const existingLogin = this.#ongoingLogins.get(loginKey);
    if (existingLogin) {
      return existingLogin;
    }

    // Create a new login promise
    const loginPromise = this.#loginWithRetry(entropySourceId);

    // Store the promise in the map
    this.#ongoingLogins.set(loginKey, loginPromise);

    try {
      // Wait for the login to complete
      const result = await loginPromise;
      return result;
    } finally {
      // Always clean up the ongoing login promise when done
      this.#ongoingLogins.delete(loginKey);
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
  ): `metamask:${string}:${string}` {
    return `metamask:${nonce}:${publicKey}` as const;
  }
}
