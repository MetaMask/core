import type { Env, Platform } from '../env';
import type { AccessToken, UserProfile } from './types';
import { AuthType } from './types';
export declare const NONCE_URL: (env: Env) => string;
export declare const PAIR_IDENTIFIERS: (env: Env) => string;
export declare const OIDC_TOKEN_URL: (env: Env) => string;
export declare const SRP_LOGIN_URL: (env: Env) => string;
export declare const SIWE_LOGIN_URL: (env: Env) => string;
type NonceResponse = {
    nonce: string;
    identifier: string;
    expiresIn: number;
};
type PairRequest = {
    signature: string;
    raw_message: string;
    encrypted_storage_key: string;
    identifier_type: 'SIWE' | 'SRP';
};
/**
 * Pair multiple identifiers under a single profile
 *
 * @param nonce - session nonce
 * @param logins - pairing request payload
 * @param accessToken - JWT access token used to access protected resources
 * @param env - server environment
 * @returns void.
 */
export declare function pairIdentifiers(nonce: string, logins: PairRequest[], accessToken: string, env: Env): Promise<void>;
/**
 * Service to Get Nonce for JWT Bearer Flow
 *
 * @param id - identifier ID
 * @param env - server environment
 * @returns the nonce.
 */
export declare function getNonce(id: string, env: Env): Promise<NonceResponse>;
/**
 * Service to Authorize And perform OIDC Flow to get the Access Token
 *
 * @param jwtToken - The original token received from Authentication. This is traded for the Access Token. (the authentication token is single-use)
 * @param env - server environment
 * @param platform - SDK platform
 * @returns Access Token from Authorization server
 */
export declare function authorizeOIDC(jwtToken: string, env: Env, platform: Platform): Promise<AccessToken>;
type Authentication = {
    token: string;
    expiresIn: number;
    profile: UserProfile;
};
/**
 * Service to Authenticate/Login a user via SIWE or SRP derived key.
 *
 * @param rawMessage - raw message for validation when authenticating
 * @param signature - signed raw message
 * @param authType - authentication type/flow used
 * @param env - server environment
 * @returns Authentication Token
 */
export declare function authenticate(rawMessage: string, signature: string, authType: AuthType, env: Env): Promise<Authentication>;
export {};
//# sourceMappingURL=services.d.ts.map