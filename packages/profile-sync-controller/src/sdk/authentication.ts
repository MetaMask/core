import { SIWEJwtBearerAuth } from './authentication-jwt-bearer/flow-siwe';
import { SRPJwtBearerAuth } from './authentication-jwt-bearer/flow-srp';
import type { UserProfile } from './authentication-jwt-bearer/types';
import { AuthType } from './authentication-jwt-bearer/types';
import { UnsupportedAuthTypeError } from './errors';

// Computing the Classes, so we only get back the public methods for the interface.
type Compute<T> = T extends infer U ? { [K in keyof U]: U[K] } : never;
type SIWEInterface = Compute<SIWEJwtBearerAuth>;
type SRPInterface = Compute<SRPJwtBearerAuth>;

type SiweParams = ConstructorParameters<typeof SIWEJwtBearerAuth>;
type SRPParams = ConstructorParameters<typeof SRPJwtBearerAuth>;
type JwtBearerAuthParams = SiweParams | SRPParams;

export class JwtBearerAuth implements SIWEInterface, SRPInterface {
  #type: AuthType;

  #sdk: SIWEJwtBearerAuth | SRPJwtBearerAuth;

  constructor(...args: JwtBearerAuthParams) {
    this.#type = args[0].type;

    if (args[0].type === AuthType.SRP) {
      this.#sdk = new SRPJwtBearerAuth(args[0], args[1]);
      return;
    }

    if (args[0].type === AuthType.SiWE) {
      this.#sdk = new SIWEJwtBearerAuth(args[0], args[1]);
      return;
    }

    throw new UnsupportedAuthTypeError('unsupported auth type');
  }

  async getAccessToken(): Promise<string> {
    return await this.#sdk.getAccessToken();
  }

  async getUserProfile(): Promise<UserProfile> {
    return await this.#sdk.getUserProfile();
  }

  async getIdentifier(): Promise<string> {
    return await this.#sdk.getIdentifier();
  }

  async signMessage(message: string): Promise<string> {
    return await this.#sdk.signMessage(message);
  }

  prepare(signer: {
    address: string;
    chainId: number;
    signMessage: (message: string) => Promise<string>;
    domain: string;
  }): void {
    this.#assertSIWE(this.#type, this.#sdk);
    this.#sdk.prepare(signer);
  }

  #assertSIWE(
    type: AuthType,
    sdk: SIWEJwtBearerAuth | SRPJwtBearerAuth,
  ): asserts sdk is SIWEJwtBearerAuth {
    if (type === AuthType.SiWE) {
      return;
    }

    throw new UnsupportedAuthTypeError(
      'This method is only available via SIWE auth type',
    );
  }
}

export { SIWEJwtBearerAuth } from './authentication-jwt-bearer/flow-siwe';
export { SRPJwtBearerAuth } from './authentication-jwt-bearer/flow-srp';
export * from './authentication-jwt-bearer/types';
