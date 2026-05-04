import type {
  AuthenticatorTransportFuture,
  Base64URLString as Base64URL,
} from '../types';

export type PublicKeyCredentialDescriptorJSON = {
  id: Base64URL;
  type: 'public-key';
  transports?: AuthenticatorTransportFuture[];
};

export type PublicKeyCredentialHint =
  | 'hybrid'
  | 'security-key'
  | 'client-device';

export type PasskeyRegistrationOptions = {
  rp: { name: string; id?: string };
  user: {
    id: Base64URL;
    name: string;
    displayName: string;
  };
  challenge: Base64URL;
  pubKeyCredParams: { alg: number; type: 'public-key' }[];
  timeout?: number;
  excludeCredentials?: PublicKeyCredentialDescriptorJSON[];
  authenticatorSelection?: {
    authenticatorAttachment?: 'cross-platform' | 'platform';
    residentKey?: 'discouraged' | 'preferred' | 'required';
    requireResidentKey?: boolean;
    userVerification?: 'discouraged' | 'preferred' | 'required';
  };
  hints?: PublicKeyCredentialHint[];
  attestation?: 'direct' | 'enterprise' | 'indirect' | 'none';
  extensions?: Record<string, unknown>;
};

export type PasskeyRegistrationResponse = {
  id: Base64URL;
  rawId: Base64URL;
  type: 'public-key';
  response: {
    clientDataJSON: Base64URL;
    attestationObject: Base64URL;
    transports?: string[];
    publicKeyAlgorithm?: number;
    publicKey?: Base64URL;
    authenticatorData?: Base64URL;
  };
  authenticatorAttachment?: 'cross-platform' | 'platform';
  clientExtensionResults: Record<string, unknown>;
};

export type PasskeyAuthenticationOptions = {
  challenge: Base64URL;
  timeout?: number;
  rpId?: string;
  allowCredentials?: PublicKeyCredentialDescriptorJSON[];
  userVerification?: 'discouraged' | 'preferred' | 'required';
  hints?: PublicKeyCredentialHint[];
  extensions?: Record<string, unknown>;
};

export type PasskeyAuthenticationResponse = {
  id: Base64URL;
  rawId: Base64URL;
  type: 'public-key';
  response: {
    clientDataJSON: Base64URL;
    authenticatorData: Base64URL;
    signature: Base64URL;
    userHandle?: Base64URL;
  };
  authenticatorAttachment?: 'cross-platform' | 'platform';
  clientExtensionResults: Record<string, unknown>;
};

export type ClientDataJSON = {
  type: string;
  challenge: string;
  origin: string;
  crossOrigin?: boolean;
  tokenBinding?: {
    id?: string;
    status: 'present' | 'supported' | 'not-supported';
  };
};

export type AttestationFormat =
  | 'fido-u2f'
  | 'packed'
  | 'android-safetynet'
  | 'android-key'
  | 'tpm'
  | 'apple'
  | 'none';

export type AttestationObject = {
  get(key: 'fmt'): AttestationFormat;
  get(key: 'attStmt'): AttestationStatement;
  get(key: 'authData'): Uint8Array;
};

export type AttestationStatement = {
  get(key: 'sig'): Uint8Array | undefined;
  get(key: 'x5c'): Uint8Array[] | undefined;
  get(key: 'alg'): number | undefined;
  readonly size: number;
};

export type AuthenticatorDataFlags = {
  up: boolean;
  uv: boolean;
  be: boolean;
  bs: boolean;
  at: boolean;
  ed: boolean;
  flagsByte: number;
};

export type ParsedAuthenticatorData = {
  rpIdHash: Uint8Array;
  flags: AuthenticatorDataFlags;
  counter: number;
  aaguid?: Uint8Array;
  credentialID?: Uint8Array;
  credentialPublicKey?: Uint8Array;
  extensionsData?: Map<string, unknown>;
  extensionsDataBuffer?: Uint8Array;
};
