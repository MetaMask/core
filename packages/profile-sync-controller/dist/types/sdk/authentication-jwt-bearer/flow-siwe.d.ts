import type { AuthConfig, AuthStorageOptions, AuthType, IBaseAuth, UserProfile } from './types';
type JwtBearerAuth_SIWE_Options = {
    storage: AuthStorageOptions;
};
type JwtBearerAuth_SIWE_Signer = {
    address: string;
    chainId: number;
    signMessage: (message: string) => Promise<string>;
    domain: string;
};
export declare class SIWEJwtBearerAuth implements IBaseAuth {
    #private;
    constructor(config: AuthConfig & {
        type: AuthType.SiWE;
    }, options: JwtBearerAuth_SIWE_Options);
    getAccessToken(): Promise<string>;
    getUserProfile(): Promise<UserProfile>;
    getIdentifier(): Promise<string>;
    signMessage(message: string): Promise<string>;
    prepare(signer: JwtBearerAuth_SIWE_Signer): void;
}
export {};
//# sourceMappingURL=flow-siwe.d.ts.map