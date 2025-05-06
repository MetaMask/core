import type { Eip1193Provider } from 'ethers';

import { authenticate, authorizeOIDC, getNonce } from './services';
import type {
  AuthConfig,
  AuthSigningOptions,
  AuthStorageOptions,
  AuthType,
  IBaseAuth,
  LoginResponse,
  UserProfile,
} from './types';
import type { MetaMetricsAuth } from '../../shared/types/services';
import { ValidationError } from '../errors';
import { getMetaMaskProviderEIP6963 } from '../utils/eip-6963-metamask-provider';
import {
  MESSAGE_SIGNING_SNAP,
  assertMessageStartsWithMetamask,
  connectSnap,
  isSnapConnected,
} from '../utils/messaging-signing-snap-requests';
import { validateLoginResponse } from '../utils/validate-login-response';

// TODO: Either fix this lint violation or explain why it's necessary to ignore.

type JwtBearerAuth_SRP_Options = {
  storage: AuthStorageOptions;
  signing?: AuthSigningOptions;
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

  readonly #options: Required<JwtBearerAuth_SRP_Options>;

  readonly #metametrics?: MetaMetricsAuth;

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
    // Nonce
    const address = await this.getIdentifier(entropySourceId);
    const nonceRes = await getNonce(address, this.#config.env);
    // TODO: why do we have 2 different getIdentifier methods?
    const publicKey =
      await this.#options.signing.getIdentifier(entropySourceId);
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

  #createSrpLoginRawMessage(
    nonce: string,
    publicKey: string,
  ): `metamask:${string}:${string}` {
    return `metamask:${nonce}:${publicKey}` as const;
  }
}
