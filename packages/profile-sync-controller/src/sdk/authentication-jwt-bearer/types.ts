import type { Env, Platform } from '../env';

export const enum AuthType {
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
   * The Unique profile for a logged in user. A Profile can be logged in via multiple Identifiers
   */
  profileId: string;
  /**
   * Server MetaMetrics ID. Allows grouping of user events cross platform.
   */
  metaMetricsId: string;
};

export type LoginResponse = {
  token: AccessToken;
  profile: UserProfile;
};

export type IBaseAuth = {
  getAccessToken: () => Promise<string>;
  getUserProfile: () => Promise<UserProfile>;
  getIdentifier: () => Promise<string>;
  signMessage: (message: string) => Promise<string>;
};

export type AuthStorageOptions = {
  getLoginResponse: () => Promise<LoginResponse | null>;
  setLoginResponse: (val: LoginResponse) => Promise<void>;
};

export type AuthSigningOptions = {
  signMessage: (message: string) => Promise<string>;
  getIdentifier: () => Promise<string>;
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
