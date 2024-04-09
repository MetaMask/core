import { Env, getEnvUrls } from './env';
import { NonceRetrievalError, SignInError, UnsupportedAuthTypeError, ValidationError } from './errors';
import { MESSAGE_SIGNING_SNAP, connectSnap } from './messaging-signing-snap';

export enum AuthType {
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

type LoginResponse = {
    token: AccessToken;
    profile: UserProfile;
};

type SrpLoginResponse = {
    token: string;
    expiresIn: number;
    profile: UserProfile;
};

export abstract class BaseAuth {
    protected accessToken: AccessToken | null = null;
    protected userProfile: UserProfile | null = null;
    protected envUrls: { authApiUrl: string; oidcApiUrl: string };

    constructor(
        protected config: AuthConfig,
        protected customSignMessage?: (message: string) => Promise<string>,
        protected customGetIdentifier?: () => Promise<string>) {
        this.envUrls = getEnvUrls(config.env);
    }

    abstract getAccessToken(): Promise<AccessToken>;
    abstract getUserProfile(): Promise<UserProfile>;
    protected abstract login(): Promise<LoginResponse>;

    async logout(): Promise<void> {
        this.accessToken = null;
        this.userProfile = null;
    }

    protected async getNonce(id: string): Promise<NonceResponse> {
        const nonceUrl = new URL(`${this.envUrls.authApiUrl}/api/v2/nonce`);
        nonceUrl.searchParams.set('identifier', id);

        try {
            const nonceResponse = await fetch(nonceUrl.toString());
            if (!nonceResponse.ok) {
                const responseBody = await nonceResponse.json()
                throw new Error(`HTTP error message: ${responseBody.message}, error: ${responseBody.error}`);
            }

            const nonceJson = await nonceResponse.json();
            return {
                nonce: nonceJson.nonce,
                identifier: nonceJson.identifier,
                expiresIn: nonceJson.expires_in,
            };
        } catch (e) {
            throw new NonceRetrievalError(`failed to generate nonce ${e}`);
        }
    }

    public async signMessage(message: string): Promise<string> {
        if (this.customSignMessage) {
            return this.customSignMessage(message);
        }

        // in order to use the automatic message signing snap, 
        // all messages have to start with "metamask:" prefix
        if (!message.startsWith('metamask:')) {
            throw new ValidationError('Message must start with "metamask:"');
        }

        const formattedMessage = message as `metamask:${string}`;
        return MESSAGE_SIGNING_SNAP.signMessage(formattedMessage)
    }

    public async getIdentifier(): Promise<string> {
        if (this.customGetIdentifier) {
            return this.customGetIdentifier();
        }
        return MESSAGE_SIGNING_SNAP.getPublicKey();
    }
}

export class JwtBearerAuth extends BaseAuth {
    private grantType = 'urn:ietf:params:oauth:grant-type:jwt-bearer';

    async #getAccessToken(jwtToken: string): Promise<AccessToken> {
        const headers = new Headers({
            'Content-Type': 'application/x-www-form-urlencoded',
        });

        const urlEncodedBody = new URLSearchParams();
        urlEncodedBody.append('grant_type', this.grantType);
        urlEncodedBody.append('client_id', this.#getOidcClientId(this.config.env));
        urlEncodedBody.append('assertion', jwtToken);

        try {
            const response = await fetch(`${this.envUrls.oidcApiUrl}/oauth2/token`, {
                method: 'POST',
                headers,
                body: urlEncodedBody.toString(),
            });

            if (!response.ok) {
                const responseBody = await response.json()
                throw new Error(`HTTP error: ${responseBody.error_description}, error code: ${responseBody.error}`);
            }

            const accessTokenResponse = await response.json();
            return {
                accessToken: accessTokenResponse.access_token,
                expiresIn: accessTokenResponse.expires_in,
                obtainedAt: Date.now(),
            };
        } catch (e) {
            throw new SignInError(`unable to get access token ${e}`);
        }
    }

    async getAccessToken(): Promise<AccessToken> {
        if (this.#hasValidAuthSession()) {
            if (this.accessToken) {
                return this.accessToken;
            }
        }
        const loginResponse = await this.login();
        if (!loginResponse || !loginResponse.token) {
            throw new SignInError('login failed: access token not received');
        }
        return loginResponse.token;
    }

    async getUserProfile(): Promise<UserProfile> {
        if (this.#hasValidAuthSession()) {
            if (this.userProfile) {
                return this.userProfile;
            }
        }
        const loginResponse = await this.login();
        if (!loginResponse || !loginResponse.profile) {
            throw new SignInError('login failed: user profile not received');
        }
        return loginResponse.profile;
    }

    protected async login(): Promise<LoginResponse> {
        switch (this.config.type) {
            case AuthType.SRP: {
                const publicKey = await this.getIdentifier()
                const nonceRes = await this.getNonce(publicKey);
                const rawMessage = this.#createSrpLoginRawMessage(nonceRes.nonce, publicKey);
                const signature = await this.signMessage(rawMessage);
                const loginResponse = await this.#srpLogin(rawMessage, signature);
                if (!loginResponse) {
                    throw new SignInError('SRP login failed');
                }

                const tokenResponse = await this.#getAccessToken(loginResponse.token);
                this.userProfile = loginResponse.profile;
                this.accessToken = tokenResponse;
                return {
                    profile: this.userProfile,
                    token: this.accessToken,
                };
            }
            default:
                throw new UnsupportedAuthTypeError('Unsupported login type');
        }
    }

    async #srpLogin(rawMessage: string, signature: string): Promise<SrpLoginResponse> {
        try {
            const response = await fetch(`${this.envUrls.authApiUrl}/api/v2/srp/login`, {
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
                const responseBody = await response.json();
                throw new Error(`SRP login HTTP error: ${responseBody.message}, error code: ${responseBody.error}`);
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
            throw new SignInError(`unable to perform SRP login ${e}`);
        }
    }

    #hasValidAuthSession(): boolean {
        if (!this.accessToken || !this.accessToken.obtainedAt) {
            return false;
        }

        const sessionLifetimeMs = 45 * 60 * 1000; // 45 minutes in milliseconds
        const currentTime = Date.now();
        const sessionAge = currentTime - this.accessToken.obtainedAt;
        return sessionAge < sessionLifetimeMs;
    }

    #createSrpLoginRawMessage(
        nonce: string,
        publicKey: string,
    ): `metamask:${string}:${string}` {
        return `metamask:${nonce}:${publicKey}` as const;
    }

    #getOidcClientId(env: Env): string {
        switch (env) {
            case Env.DEV:
                return 'f1a963d7-50dc-4cb5-8d81-f1f3654f0df3';
            case Env.PROD:
                return '1132f10a-b4e5-4390-a5f2-d9c6022db564';
            default:
                throw new ValidationError('missing oidc client id');
        }
    }
}

