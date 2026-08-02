export type {
  Base64URLString,
  EscrowAssertion,
  EscrowFactor,
  EscrowPublicKeyJwk,
  ExportCompleteParams,
  ExportCompleteResult,
  ExportInitParams,
  ExportInitResult,
  RegisterParams,
  RegisterResult,
  RevokeParams,
  SecretEscrowClient,
  WebAuthnEscrowFactor,
} from './types.js';
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
