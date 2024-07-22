import type { AuthConfig, AuthSigningOptions, AuthStorageOptions, AuthType, IBaseAuth, UserProfile } from './types';
type JwtBearerAuth_SRP_Options = {
    storage: AuthStorageOptions;
    signing?: AuthSigningOptions;
};
export declare class SRPJwtBearerAuth implements IBaseAuth {
    #private;
    constructor(config: AuthConfig & {
        type: AuthType.SRP;
    }, options: JwtBearerAuth_SRP_Options);
    getAccessToken(): Promise<string>;
    getUserProfile(): Promise<UserProfile>;
    getIdentifier(): Promise<string>;
    signMessage(message: string): Promise<string>;
}
export {};
//# sourceMappingURL=flow-srp.d.ts.map