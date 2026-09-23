import type { PublicInterface } from '@metamask/utils';
import type { Eip1193Provider } from 'ethers';

import type { Env } from '../shared/env.js';
import { SIWEJwtBearerAuth } from './authentication-jwt-bearer/flow-siwe.js';
import { SRPJwtBearerAuth } from './authentication-jwt-bearer/flow-srp.js';
import type { MfaStepUpAssertion } from './authentication-jwt-bearer/mfa/services.js';
import type {
  EnrolledCredential,
  EnrollmentChallenge,
  EnrollmentProof,
  MfaCredentialType,
  StepUpChallenge,
  StepUpProof,
} from './authentication-jwt-bearer/mfa/types.js';
import {
  getNonce,
  pairIdentifiers,
} from './authentication-jwt-bearer/services.js';
import type { PairProfilesResponse } from './authentication-jwt-bearer/services.js';
import type {
  AccessToken,
  UserProfile,
  Pair,
  PairSocialIdentifierParams,
  ProfileIdentifier,
  OidcTokenAudience,
  OidcTokenClaims,
  UserProfileLineage,
} from './authentication-jwt-bearer/types.js';
import { AuthType } from './authentication-jwt-bearer/types.js';
import { PairError, UnsupportedAuthTypeError } from './errors.js';

// Computing the Classes, so we only get back the public methods for the interface.

type SIWEInterface = PublicInterface<SIWEJwtBearerAuth>;
export type SRPInterface = PublicInterface<SRPJwtBearerAuth>;

type SiweParams = ConstructorParameters<typeof SIWEJwtBearerAuth>;
type SRPParams = ConstructorParameters<typeof SRPJwtBearerAuth>;
type JwtBearerAuthParams = SiweParams | SRPParams;

export class JwtBearerAuth implements SIWEInterface, SRPInterface {
  readonly #type: AuthType;

  readonly #env: Env;

  readonly #sdk: SIWEJwtBearerAuth | SRPJwtBearerAuth;

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

  setCustomProvider(provider: Eip1193Provider) {
    this.#assertSRP(this.#type, this.#sdk);
    this.#sdk.setCustomProvider(provider);
  }

  async getAccessToken(entropySourceId?: string): Promise<string> {
    return await this.#sdk.getAccessToken(entropySourceId);
  }

  async connectSnap(): Promise<string> {
    this.#assertSRP(this.#type, this.#sdk);
    return this.#sdk.connectSnap();
  }

  async isSnapConnected(): Promise<boolean> {
    this.#assertSRP(this.#type, this.#sdk);
    return this.#sdk.isSnapConnected();
  }

  async getUserProfile(entropySourceId?: string): Promise<UserProfile> {
    return await this.#sdk.getUserProfile(entropySourceId);
  }

  async getIdentifier(entropySourceId?: string): Promise<string> {
    return await this.#sdk.getIdentifier(entropySourceId);
  }

  async getUserProfileLineage(
    entropySourceId?: string,
  ): Promise<UserProfileLineage> {
    return await this.#sdk.getUserProfileLineage(entropySourceId);
  }

  async getCustomerServiceToken(entropySourceId?: string): Promise<string> {
    return await this.#sdk.getCustomerServiceToken(entropySourceId);
  }

  async getPartnerIdentityToken(
    claims: OidcTokenClaims,
    audience: OidcTokenAudience,
    entropySourceId?: string,
  ): Promise<string> {
    return await this.#sdk.getPartnerIdentityToken(
      claims,
      audience,
      entropySourceId,
    );
  }

  async beginMfaEnrollment(
    type: MfaCredentialType,
    options?: {
      email?: string;
      entropySourceId?: string;
      accessToken?: string;
    },
  ): Promise<EnrollmentChallenge> {
    this.#assertSRP(this.#type, this.#sdk);
    return await this.#sdk.beginMfaEnrollment(type, options);
  }

  async completeMfaEnrollment(
    flowId: string,
    proof: EnrollmentProof,
    entropySourceId?: string,
  ): Promise<void> {
    this.#assertSRP(this.#type, this.#sdk);
    await this.#sdk.completeMfaEnrollment(flowId, proof, entropySourceId);
  }

  async beginMfaVerification(
    type: MfaCredentialType,
    entropySourceId?: string,
  ): Promise<StepUpChallenge> {
    this.#assertSRP(this.#type, this.#sdk);
    return await this.#sdk.beginMfaVerification(type, entropySourceId);
  }

  async completeMfaVerification(
    flowId: string,
    proof: StepUpProof,
    entropySourceId?: string,
  ): Promise<MfaStepUpAssertion> {
    this.#assertSRP(this.#type, this.#sdk);
    return await this.#sdk.completeMfaVerification(
      flowId,
      proof,
      entropySourceId,
    );
  }

  async getMfaCredentials(
    entropySourceId?: string,
  ): Promise<EnrolledCredential[]> {
    this.#assertSRP(this.#type, this.#sdk);
    return await this.#sdk.getMfaCredentials(entropySourceId);
  }

  async exchangeMfaAssertion(assertionJwt: string): Promise<AccessToken> {
    this.#assertSRP(this.#type, this.#sdk);
    return await this.#sdk.exchangeMfaAssertion(assertionJwt);
  }

  async pairSrpProfiles(
    accessTokens: string[],
    authAccessToken: string,
  ): Promise<PairProfilesResponse> {
    this.#assertSRP(this.#type, this.#sdk);
    return await this.#sdk.pairSrpProfiles(accessTokens, authAccessToken);
  }

  async pairSocialIdentifier(
    params: PairSocialIdentifierParams,
    authAccessToken: string,
  ): Promise<ProfileIdentifier[] | undefined> {
    this.#assertSRP(this.#type, this.#sdk);
    return await this.#sdk.pairSocialIdentifier(params, authAccessToken);
  }

  async signMessage(
    message: string,
    entropySourceId?: string,
  ): Promise<string> {
    return await this.#sdk.signMessage(message, entropySourceId);
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
            raw_message: raw,
            encrypted_storage_key: p.encryptedStorageKey,
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
    _sdk: SIWEJwtBearerAuth | SRPJwtBearerAuth,
  ): asserts _sdk is SIWEJwtBearerAuth {
    if (type === AuthType.SiWE) {
      return;
    }

    throw new UnsupportedAuthTypeError(
      'This method is only available via SIWE auth type',
    );
  }

  #assertSRP(
    type: AuthType,
    _sdk: SIWEJwtBearerAuth | SRPJwtBearerAuth,
  ): asserts _sdk is SRPJwtBearerAuth {
    if (type === AuthType.SRP) {
      return;
    }

    throw new UnsupportedAuthTypeError(
      'This method is only available via SRP auth type',
    );
  }
}

export { SIWEJwtBearerAuth } from './authentication-jwt-bearer/flow-siwe.js';
export { SRPJwtBearerAuth } from './authentication-jwt-bearer/flow-srp.js';
export * from './authentication-jwt-bearer/types.js';
