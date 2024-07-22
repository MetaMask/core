/// <reference types="jest" />
import { JwtBearerAuth } from '../authentication';
import type { AuthSigningOptions } from '../authentication-jwt-bearer/types';
import { AuthType } from '../authentication-jwt-bearer/types';
export type MockVariable = any;
export declare const typedMockFn: <Fn extends (...args: any[]) => any>() => jest.Mock<ReturnType<Fn>, Parameters<Fn>>;
/**
 * Mock Utility - Arrange Auth
 *
 * @param type - choose SIWE or SRP Auth instance
 * @param mockPublicKey - provide the mock public key
 * @param authOptionsOverride - overrides
 * @param authOptionsOverride.signing - override auth signing
 * @returns Auth instance
 */
export declare function arrangeAuth(type: `${AuthType}`, mockPublicKey: string, authOptionsOverride?: {
    signing?: AuthSigningOptions;
}): {
    mockGetLoginResponse: jest.Mock<Promise<import("../authentication").LoginResponse | null>, []>;
    mockSetLoginResponse: jest.Mock<Promise<void>, [val: import("../authentication").LoginResponse]>;
    mockGetIdentifier: jest.Mock<Promise<string>, []>;
    mockSignMessage: jest.Mock<Promise<string>, [message: string]>;
    auth: JwtBearerAuth;
};
//# sourceMappingURL=test-utils.d.ts.map