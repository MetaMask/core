import type { Env, Platform } from '../../shared/env';

export enum AuthType {
  /* sign in using a private key derived from your secret recovery phrase (SRP).
       Uses message signing snap to perform this operation */
  SRP = 'SRP',

  /* sign in with Ethereum */
  SiWE = 'SiWE',
}

export type AuthConfig = {
  env: Env;
  platform: Platform;
  type: AuthType;
};

export type AccessToken = {
  /**
   * The JWT Access Token
   */
  accessToken: string;
  /**
   * Expiration in seconds
   */
  expiresIn: number;
  /**
   * Date in milliseconds
   */
  obtainedAt: number;
};

export type UserProfile = {
  /**
   * The "Identifier" used to log in with.
   */
  identifierId: string;
  /**
   * The original per-SRP profile ID. Immutable after first login.
   * Used for user storage key derivation — MUST NOT be replaced with the canonical.
   */
  profileId: string;
  /**
   * The unified canonical profile ID across all paired SRPs.
   * Set from the server response and updated after pairing via canonical propagation.
   * For pre-upgrade state, defaults to profileId.
   */
  canonicalProfileId: string;
  /**
   * Server MetaMetrics ID. Allows grouping of user events cross platform.
   */
  metaMetricsId: string;
};

/**
 * Represents a profile alias returned by the server in profile_aliases.
 * Transient — this is not persisted in LoginResponse or srpSessionData.
 */
export type ProfileAlias = {
  aliasProfileId: string;
  canonicalProfileId: string;
  identifierIds: { id: string; type: string }[];
};

export type LoginResponse = {
  token: AccessToken;
  profile: UserProfile;
};

export type IBaseAuth = {
  // TODO: figure out if these need the entropy source id param or if that can be abstracted on another layer
  getAccessToken: (entropySourceId?: string) => Promise<string>;
  getUserProfile: (entropySourceId?: string) => Promise<UserProfile>;
  getIdentifier: (entropySourceId?: string) => Promise<string>;
  signMessage: (message: string, entropySourceId?: string) => Promise<string>;
};

export type AuthStorageOptions = {
  // TODO: figure out if these need the entropy source id param or if that can be abstracted on another layer
  getLoginResponse: (entropySourceId?: string) => Promise<LoginResponse | null>;
  setLoginResponse: (
    val: LoginResponse,
    entropySourceId?: string,
  ) => Promise<void>;
};

export type AuthSigningOptions = {
  // TODO: figure out if these need the entropy source id param or if that can be abstracted on another layer
  signMessage: (message: string, entropySourceId?: string) => Promise<string>;
  getIdentifier: (entropySourceId?: string) => Promise<string>;
};

export type ErrorMessage = {
  message: string;
  error: string;
};

export type Pair = {
  identifier: string;
  encryptedStorageKey: string;
  identifierType: 'SIWE' | 'SRP';
  signMessage: (message: string) => Promise<string>;
};

export type UserProfileLineage = {
  profile_id: string;
  created_at: string;
  lineage: {
    metametrics_id: string;
    agent: Platform;
    created_at: string;
    updated_at: string;
    counter: number;
  }[];
};
