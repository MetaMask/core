import { SIWEJwtBearerAuth } from './authentication-jwt-bearer/flow-siwe';
import { SRPJwtBearerAuth } from './authentication-jwt-bearer/flow-srp';
import type { UserProfile, Pair } from './authentication-jwt-bearer/types';
type Compute<T> = T extends infer U ? {
    [K in keyof U]: U[K];
} : never;
type SIWEInterface = Compute<SIWEJwtBearerAuth>;
type SRPInterface = Compute<SRPJwtBearerAuth>;
type SiweParams = ConstructorParameters<typeof SIWEJwtBearerAuth>;
type SRPParams = ConstructorParameters<typeof SRPJwtBearerAuth>;
type JwtBearerAuthParams = SiweParams | SRPParams;
export declare class JwtBearerAuth implements SIWEInterface, SRPInterface {
    #private;
    constructor(...args: JwtBearerAuthParams);
    getAccessToken(): Promise<string>;
    getUserProfile(): Promise<UserProfile>;
    getIdentifier(): Promise<string>;
    signMessage(message: string): Promise<string>;
    pairIdentifiers(pairing: Pair[]): Promise<void>;
    prepare(signer: {
        address: string;
        chainId: number;
        signMessage: (message: string) => Promise<string>;
        domain: string;
    }): void;
}
export { SIWEJwtBearerAuth } from './authentication-jwt-bearer/flow-siwe';
export { SRPJwtBearerAuth } from './authentication-jwt-bearer/flow-srp';
export * from './authentication-jwt-bearer/types';
//# sourceMappingURL=authentication.d.ts.map