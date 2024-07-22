export declare const AUTH_NONCE_ENDPOINT: string;
export declare const AUTH_LOGIN_ENDPOINT: string;
export declare const OIDC_TOKENS_ENDPOINT: string;
export type NonceResponse = {
    nonce: string;
};
/**
 * Auth Service - Get Nonce. Used for the initial JWTBearer flow
 *
 * @param publicKey - public key to associate a nonce with
 * @returns the nonce or null if failed
 */
export declare function getNonce(publicKey: string): Promise<string | null>;
/**
 * The Login API Server Response Shape
 */
export type LoginResponse = {
    token: string;
    expires_in: string;
    /**
     * Contains anonymous information about the logged in profile.
     *
     * @property identifier_id - a deterministic unique identifier on the method used to sign in
     * @property profile_id - a unique id for a given profile
     * @property metametrics_id - an anonymous server id
     */
    profile: {
        identifier_id: string;
        profile_id: string;
    };
};
type ClientMetaMetrics = {
    metametricsId: string;
    agent: 'extension' | 'mobile';
};
/**
 * Auth Service - Login. Will perform login with a given signature and will return a single use JWT Token.
 *
 * @param rawMessage - the original message before signing
 * @param signature - the signed message
 * @param clientMetaMetrics - optional client metametrics id (to associate on backend)
 * @returns The Login Response
 */
export declare function login(rawMessage: string, signature: string, clientMetaMetrics: ClientMetaMetrics): Promise<LoginResponse | null>;
/**
 * The Auth API Token Response Shape
 */
export type OAuthTokenResponse = {
    access_token: string;
    expires_in: number;
};
/**
 * OIDC Service - Access Token. Trades the Auth Token for an access token (to be used for other authenticated endpoints)
 * NOTE - the access token is short lived, which means it is best practice to validate session before calling authenticated endpoints
 *
 * @param jwtToken - the JWT Auth Token, received from `/login`
 * @param platform - the OIDC platform to retrieve access token
 * @returns JWT Access token to store and use on authorized endpoints.
 */
export declare function getAccessToken(jwtToken: string, platform: ClientMetaMetrics['agent']): Promise<string | null>;
/**
 * Utility to create the raw login message for the JWT bearer flow (via SRP)
 *
 * @param nonce - nonce received from `/nonce` endpoint
 * @param publicKey - public key used to retrieve nonce and for message signing
 * @returns Raw Message which will be used for signing & logging in.
 */
export declare function createLoginRawMessage(nonce: string, publicKey: string): `metamask:${string}:${string}`;
export {};
//# sourceMappingURL=services.d.ts.map