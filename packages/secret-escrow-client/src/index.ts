export type {
  AddFactorParams,
  Base64URLString,
  EnrollmentCapableSecretEscrowClient,
  EscrowAssertion,
  EscrowEnrollmentMetadata,
  EscrowFactor,
  EscrowFactorPublic,
  EscrowPublicKeyJwk,
  EscrowWrappedPassword,
  ExportCompleteParams,
  ExportCompleteResult,
  ExportInitParams,
  ExportInitResult,
  FactorProof,
  PasswordEscrowFactor,
  PasswordEscrowFactorPublic,
  RegisterParams,
  RegisterResult,
  RevokeParams,
  SecretEscrowClient,
  TotpEscrowFactor,
  TotpEscrowFactorPublic,
  WebAuthnEscrowFactor,
} from './types.js';
export { toPublicEscrowFactor } from './types.js';
export {
  SecretEscrowError,
  SecretEscrowErrorCode,
  SecretEscrowErrorMessage,
} from './errors.js';
export type { SecretEscrowErrorOptions } from './errors.js';
export { MockSecretEscrowClient } from './MockSecretEscrowClient.js';
export type {
  MockSecretEscrowClientOptions,
  MockSecretEscrowSnapshot,
} from './MockSecretEscrowClient.js';
export { HttpSecretEscrowClient } from './HttpSecretEscrowClient.js';
export type { HttpSecretEscrowClientOptions } from './HttpSecretEscrowClient.js';
export {
  buildTotpOtpAuthUri,
  computeTotpCode,
  decodeBase32,
  encodeBase32,
  generateTotpSecret,
  verifyTotpCode,
} from './totp.js';
