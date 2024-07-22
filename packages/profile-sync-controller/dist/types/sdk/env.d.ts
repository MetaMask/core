export declare enum Env {
    DEV = "dev",
    UAT = "uat",
    PRD = "prd"
}
export declare enum Platform {
    MOBILE = "mobile",
    EXTENSION = "extension",
    PORTFOLIO = "portfolio",
    INFURA = "infura"
}
type EnvUrlsEntry = {
    authApiUrl: string;
    oidcApiUrl: string;
    userStorageApiUrl: string;
};
/**
 * Validates and returns correct environment endpoints
 *
 * @param env - environment field
 * @returns the correct environment url
 * @throws on invalid environment passed
 */
export declare function getEnvUrls(env: Env): EnvUrlsEntry;
/**
 * Returns the valid OIDC Client ID (used during authorization)
 *
 * @param env - environment field
 * @param platform - platform field
 * @returns the OIDC client id for the environment
 */
export declare function getOidcClientId(env: Env, platform: Platform): string;
export {};
//# sourceMappingURL=env.d.ts.map