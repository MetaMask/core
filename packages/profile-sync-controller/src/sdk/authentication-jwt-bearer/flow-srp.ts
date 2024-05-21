import { ValidationError } from '../errors';
import { getMetaMaskProviderEIP6963 } from '../utils/eip-6963-metamask-provider';
import { MESSAGE_SIGNING_SNAP } from '../utils/messaging-signing-snap-requests';
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

type JwtBearerAuth_SRP_Options = {
  storage: AuthStorageOptions;
  signing?: AuthSigningOptions;
};

const defaultEIP6963SigningOptions: AuthSigningOptions = {
  getIdentifier: async (): Promise<string> => {
    const provider = await getMetaMaskProviderEIP6963();
    if (!provider) {
      throw new ValidationError('No MetaMask wallet connected');
    }
    return await MESSAGE_SIGNING_SNAP.getPublicKey(provider);
  },
  signMessage: async (message: string): Promise<string> => {
    const provider = await getMetaMaskProviderEIP6963();
    if (!provider) {
      throw new ValidationError('No MetaMask wallet connected');
    }
    if (!message.startsWith('metamask:')) {
      throw new ValidationError('message must start with "metamask:"');
    }
    const formattedMessage = message as `metamask:${string}`;
    return await MESSAGE_SIGNING_SNAP.signMessage(provider, formattedMessage);
  },
};

export class SRPJwtBearerAuth implements IBaseAuth {
  #config: AuthConfig;

  #options: Required<JwtBearerAuth_SRP_Options>;

  constructor(
    config: AuthConfig & { type: AuthType.SRP },
    options: JwtBearerAuth_SRP_Options,
  ) {
    this.#config = config;
    this.#options = {
      storage: options.storage,
      signing: options.signing ?? defaultEIP6963SigningOptions,
    };
  }

  async getAccessToken(): Promise<string> {
    const session = await this.#getAuthSession();
    if (session) {
      return session.token.accessToken;
    }

    const loginResponse = await this.#login();
    return loginResponse.token.accessToken;
  }

  async getUserProfile(): Promise<UserProfile> {
    const session = await this.#getAuthSession();
    if (session) {
      return session.profile;
    }

    const loginResponse = await this.#login();
    return loginResponse.profile;
  }

  async getIdentifier(): Promise<string> {
    return await this.#options.signing.getIdentifier();
  }

  async signMessage(message: string): Promise<string> {
    return await this.#options.signing.signMessage(message);
  }

  // convert expiresIn from seconds to milliseconds and use 90% of expiresIn
  async #getAuthSession(): Promise<LoginResponse | null> {
    const auth = await this.#options.storage.getLoginResponse();
    if (!auth) {
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

  async #login(): Promise<LoginResponse> {
    // Nonce
    const address = await this.getIdentifier();
    const nonceRes = await getNonce(address, this.#config.env);
    const publicKey = await this.#options.signing.getIdentifier();
    const rawMessage = this.#createSrpLoginRawMessage(
      nonceRes.nonce,
      publicKey,
    );
    const signature = await this.signMessage(rawMessage);

    // Authenticate
    const authResponse = await authenticate(
      rawMessage,
      signature,
      this.#config.type,
      this.#config.env,
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

    await this.#options.storage.setLoginResponse(result);

    return result;
  }

  #createSrpLoginRawMessage(
    nonce: string,
    publicKey: string,
  ): `metamask:${string}:${string}` {
    return `metamask:${nonce}:${publicKey}` as const;
  }
}
