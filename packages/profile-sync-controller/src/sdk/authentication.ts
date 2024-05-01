import { SiweMessage } from 'siwe';

import { Env, getEnvUrls } from './env';
import {
  NonceRetrievalError,
  SignInError,
  UnsupportedAuthTypeError,
  ValidationError,
} from './errors';
import { getMetaMaskProviderEIP6963 } from './utils/eip-6963-metamask-provider';
import { MESSAGE_SIGNING_SNAP } from './utils/messaging-signing-snap-requests';

const SESSION_LIFETIME_MS = 45 * 60 * 1000; // 45 minutes in milliseconds

export const NONCE_URL = (env: Env) =>
  `${getEnvUrls(env).authApiUrl}/api/v2/nonce`;

export const OIDC_TOKEN_URL = (env: Env) =>
  `${getEnvUrls(env).oidcApiUrl}/oauth2/token`;

export const SRP_LOGIN_URL = (env: Env) =>
  `${getEnvUrls(env).authApiUrl}/api/v2/srp/login`;

export const SIWE_LOGIN_URL = (env: Env) =>
  `${getEnvUrls(env).authApiUrl}/api/v2/siwe/login`;

export const enum AuthType {
  /* sign in using a private key derived from your secret recovery phrase (SRP). 
       Uses message signing snap to perform this operation */
  SRP = 'SRP',

  /* sign in with Ethereum */
  SiWE = 'SiWE',
}

export type AuthConfig = {
  env: Env;
  type: AuthType;
};

export type AuthSigningOptions = {
  signMessage: (message: string) => Promise<string>;
  getIdentifier: () => Promise<string>;
};

export type AuthStorageOptions = {
  getLoginResponse: () => Promise<LoginResponse | null>;
  setLoginResponse: (val: LoginResponse) => Promise<void>;
};

export type AuthOptions = {
  signing?: AuthSigningOptions;
  storage: AuthStorageOptions;
};

export type AccessToken = {
  accessToken: string;
  expiresIn: number;
  obtainedAt: number;
};

export type UserProfile = {
  identifierId: string;
  profileId: string;
  metaMetricsId: string;
};

type NonceResponse = {
  nonce: string;
  identifier: string;
  expiresIn: number;
};

export type LoginResponse = {
  token: AccessToken;
  profile: UserProfile;
};

type Authentication = {
  token: string;
  expiresIn: number;
  profile: UserProfile;
};

export type SiweLogin = {
  address: string;
  domain: string;
  chainId: number;
};

type ErrorMessage = {
  message: string;
  error: string;
};

export abstract class BaseAuth {
  protected config: AuthConfig;

  protected options: AuthOptions;

  protected siweLogin: SiweLogin | null = null;

  protected env: Env;

  constructor(config: AuthConfig, options: AuthOptions) {
    if (config.type !== AuthType.SRP && config.type !== AuthType.SiWE) {
      throw new UnsupportedAuthTypeError('unsupported auth type');
    }

    this.env = config.env;
    this.config = config;
    this.options = options;
  }

  abstract getAccessToken(): Promise<AccessToken>;

  abstract getUserProfile(): Promise<UserProfile>;

  protected abstract login(): Promise<LoginResponse>;

  protected async getNonce(id: string): Promise<NonceResponse> {
    const nonceUrl = new URL(NONCE_URL(this.env));
    nonceUrl.searchParams.set('identifier', id);

    try {
      const nonceResponse = await fetch(nonceUrl.toString());
      if (!nonceResponse.ok) {
        const responseBody = (await nonceResponse.json()) as ErrorMessage;
        throw new Error(
          `HTTP error message: ${responseBody.message}, error: ${responseBody.error}`,
        );
      }

      const nonceJson = await nonceResponse.json();
      return {
        nonce: nonceJson.nonce,
        identifier: nonceJson.identifier,
        expiresIn: nonceJson.expires_in,
      };
    } catch (e) {
      /* istanbul ignore next */
      const errorMessage =
        e instanceof Error ? e.message : JSON.stringify(e ?? '');
      throw new NonceRetrievalError(
        `failed to generate nonce: ${errorMessage}`,
      );
    }
  }

  public async signMessage(message: string): Promise<string> {
    if (this.options.signing) {
      return this.options.signing.signMessage(message);
    }

    if (!this.options.signing && this.config.type === AuthType.SiWE) {
      throw new ValidationError(
        'SiWE login requires signMessage callback to be set',
      );
    }

    // Use built-in signing mechanism
    const provider = await getMetaMaskProviderEIP6963();
    if (!provider) {
      throw new ValidationError('No MetaMask wallet connected');
    }

    if (!message.startsWith('metamask:')) {
      throw new ValidationError('message must start with "metamask:"');
    }

    const formattedMessage = message as `metamask:${string}`;
    return await MESSAGE_SIGNING_SNAP.signMessage(provider, formattedMessage);
  }

  public async getIdentifier(): Promise<string> {
    if (this.options.signing) {
      return this.options.signing.getIdentifier();
    }

    if (this.config.type === AuthType.SiWE) {
      return this.siweLogin?.address || '';
    }

    // Use built-in signing mechanism
    const provider = await getMetaMaskProviderEIP6963();
    if (!provider) {
      throw new ValidationError('No MetaMask wallet connected');
    }
    return await MESSAGE_SIGNING_SNAP.getPublicKey(provider);
  }

  public initialize(login: SiweLogin) {
    this.siweLogin = login;
  }
}

export class JwtBearerAuth extends BaseAuth {
  private readonly grantType = 'urn:ietf:params:oauth:grant-type:jwt-bearer';

  async #getAccessToken(jwtToken: string): Promise<AccessToken> {
    const headers = new Headers({
      'Content-Type': 'application/x-www-form-urlencoded',
    });

    const urlEncodedBody = new URLSearchParams();
    urlEncodedBody.append('grant_type', this.grantType);
    urlEncodedBody.append('client_id', this.#getOidcClientId(this.config.env));
    urlEncodedBody.append('assertion', jwtToken);

    try {
      const response = await fetch(OIDC_TOKEN_URL(this.env), {
        method: 'POST',
        headers,
        body: urlEncodedBody.toString(),
      });

      if (!response.ok) {
        const responseBody = (await response.json()) as {
          error_description: string;
          error: string;
        };
        throw new Error(
          `HTTP error: ${responseBody.error_description}, error code: ${responseBody.error}`,
        );
      }

      const accessTokenResponse = await response.json();
      return {
        accessToken: accessTokenResponse.access_token,
        expiresIn: accessTokenResponse.expires_in,
        obtainedAt: Date.now(),
      };
    } catch (e) {
      /* istanbul ignore next */
      const errorMessage =
        e instanceof Error ? e.message : JSON.stringify(e ?? '');
      throw new SignInError(`unable to get access token: ${errorMessage}`);
    }
  }

  async getAccessToken(): Promise<AccessToken> {
    const session = await this.#getAuthSession();
    if (session) {
      return session.token;
    }

    const loginResponse = await this.login();
    return loginResponse.token;
  }

  async getUserProfile(): Promise<UserProfile> {
    const session = await this.#getAuthSession();
    if (session) {
      return session.profile;
    }

    const loginResponse = await this.login();
    return loginResponse.profile;
  }

  protected async login(): Promise<LoginResponse> {
    switch (this.config.type) {
      case AuthType.SRP:
        return this.#handleSrpLogin();
      case AuthType.SiWE:
        return this.#handleSiweLogin();
      /* istanbul ignore next */
      default:
        throw new UnsupportedAuthTypeError('unsupported login type');
    }
  }

  async #handleSrpLogin(): Promise<LoginResponse> {
    const publicKey = await this.getIdentifier();
    const nonceRes = await this.getNonce(publicKey);
    const rawMessage = this.#createSrpLoginRawMessage(
      nonceRes.nonce,
      publicKey,
    );
    const signature = await this.signMessage(rawMessage);
    const authResponse = await this.#srpLogin(rawMessage, signature);
    return this.#finalizeLogin(authResponse);
  }

  async #handleSiweLogin(): Promise<LoginResponse> {
    if (!this.siweLogin) {
      throw new ValidationError(
        'you must call the initialize function before using SiWE flow',
      );
    }
    const address = await this.getIdentifier();
    const nonceRes = await this.getNonce(address);
    const rawMessage = this.#createSiWELoginRawMessage(nonceRes.nonce);
    const signature = await this.signMessage(rawMessage);
    const authResponse = await this.#siweLogin(rawMessage, signature);
    return this.#finalizeLogin(authResponse);
  }

  async #finalizeLogin(authResponse: Authentication): Promise<LoginResponse> {
    const tokenResponse = await this.#getAccessToken(authResponse.token);
    const response = {
      profile: authResponse.profile,
      token: tokenResponse,
    };

    await this.options.storage.setLoginResponse(response);
    return response;
  }

  async #srpLogin(
    rawMessage: string,
    signature: string,
  ): Promise<Authentication> {
    try {
      const response = await fetch(SRP_LOGIN_URL(this.env), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signature,
          raw_message: rawMessage,
        }),
      });

      if (!response.ok) {
        const responseBody = (await response.json()) as ErrorMessage;
        throw new Error(
          `SRP login HTTP error: ${responseBody.message}, error code: ${responseBody.error}`,
        );
      }

      const loginResponse = await response.json();
      return {
        token: loginResponse.token,
        expiresIn: loginResponse.expires_in,
        profile: {
          identifierId: loginResponse.profile.identifier_id,
          metaMetricsId: loginResponse.profile.metametrics_id,
          profileId: loginResponse.profile.profile_id,
        },
      };
    } catch (e) {
      /* istanbul ignore next */
      const errorMessage =
        e instanceof Error ? e.message : JSON.stringify(e ?? '');
      throw new SignInError(`unable to perform SRP login: ${errorMessage}`);
    }
  }

  async #siweLogin(
    rawMessage: string,
    signature: string,
  ): Promise<Authentication> {
    try {
      const response = await fetch(SIWE_LOGIN_URL(this.env), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signature,
          raw_message: rawMessage,
        }),
      });

      if (!response.ok) {
        const responseBody = (await response.json()) as ErrorMessage;
        throw new Error(
          `SiWE login HTTP error: ${responseBody.message}, error code: ${responseBody.error}`,
        );
      }

      const loginResponse = await response.json();
      return {
        token: loginResponse.token,
        expiresIn: loginResponse.expires_in,
        profile: {
          identifierId: loginResponse.profile.identifier_id,
          metaMetricsId: loginResponse.profile.metametrics_id,
          profileId: loginResponse.profile.profile_id,
        },
      };
    } catch (e) {
      /* istanbul ignore next */
      const errorMessage =
        e instanceof Error ? e.message : JSON.stringify(e ?? '');
      throw new SignInError(`unable to perform siwe login: ${errorMessage}`);
    }
  }

  async #getAuthSession(): Promise<LoginResponse | null> {
    const auth = await this.options.storage.getLoginResponse();
    if (!auth) {
      return null;
    }

    const currentTime = Date.now();
    const sessionAge = currentTime - auth.token.obtainedAt;
    if (sessionAge < SESSION_LIFETIME_MS) {
      return auth;
    }
    return null;
  }

  #createSrpLoginRawMessage(
    nonce: string,
    publicKey: string,
  ): `metamask:${string}:${string}` {
    return `metamask:${nonce}:${publicKey}` as const;
  }

  #createSiWELoginRawMessage(nonce: string): string {
    return new SiweMessage({
      domain: this.siweLogin?.domain,
      address: this.siweLogin?.address,
      uri: SIWE_LOGIN_URL(this.env),
      version: '1',
      chainId: this.siweLogin?.chainId,
      nonce,
      issuedAt: new Date().toISOString(),
    }).prepareMessage();
  }

  #getOidcClientId(env: Env): string {
    switch (env) {
      case Env.DEV:
        return 'f1a963d7-50dc-4cb5-8d81-f1f3654f0df3';
      /* istanbul ignore next */
      case Env.UAT:
        return 'a9de167c-c9a6-43d8-af39-d301fd44c485';
      /* istanbul ignore next */
      case Env.PRD:
        return '1132f10a-b4e5-4390-a5f2-d9c6022db564';
      /* istanbul ignore next */
      default:
        throw new ValidationError(
          'invalid env: cannot determine oidc client id',
        );
    }
  }
}
