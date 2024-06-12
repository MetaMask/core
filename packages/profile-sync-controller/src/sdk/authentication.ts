import { SIWEJwtBearerAuth } from './authentication-jwt-bearer/flow-siwe';
import { SRPJwtBearerAuth } from './authentication-jwt-bearer/flow-srp';
import {
  getNonce,
  pairIdentifiers,
} from './authentication-jwt-bearer/services';
import type { UserProfile, Pair } from './authentication-jwt-bearer/types';
import { AuthType } from './authentication-jwt-bearer/types';
import type { Env } from './env';
import { PairError, UnsupportedAuthTypeError } from './errors';

// Computing the Classes, so we only get back the public methods for the interface.
// TODO: Either fix this lint violation or explain why it's necessary to ignore.
// eslint-disable-next-line @typescript-eslint/naming-convention
type Compute<T> = T extends infer U ? { [K in keyof U]: U[K] } : never;
type SIWEInterface = Compute<SIWEJwtBearerAuth>;
type SRPInterface = Compute<SRPJwtBearerAuth>;

type SiweParams = ConstructorParameters<typeof SIWEJwtBearerAuth>;
type SRPParams = ConstructorParameters<typeof SRPJwtBearerAuth>;
type JwtBearerAuthParams = SiweParams | SRPParams;

export class JwtBearerAuth implements SIWEInterface, SRPInterface {
  #type: AuthType;

  #env: Env;

  #sdk: SIWEJwtBearerAuth | SRPJwtBearerAuth;

  constructor(...args: JwtBearerAuthParams) {
    this.#type = args[0].type;
    this.#env = args[0].env;

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

  async pairIdentifiers(pairing: Pair[]): Promise<void> {
    const profile = await this.getUserProfile();
    const n = await getNonce(profile.profileId, this.#env);

    const logins = await Promise.all(
      pairing.map(async (p) => {
        try {
          const raw = `metamask:${n.nonce}:${p.identifier}`;
          const sig = await p.signMessage(raw);
          return {
            signature: sig,
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/naming-convention
            raw_message: raw,
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/naming-convention
            encrypted_storage_key: p.encryptedStorageKey,
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/naming-convention
            identifier_type: p.identifierType,
          };
        } catch (e) {
          /* istanbul ignore next */
          const errorMessage =
            e instanceof Error ? e.message : JSON.stringify(e ?? '');
          throw new PairError(
            `failed to sign pairing message: ${errorMessage}`,
          );
        }
      }),
    );

    const accessToken = await this.getAccessToken();
    await pairIdentifiers(n.nonce, logins, accessToken, this.#env);
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
