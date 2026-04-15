export type PasskeyDerivationMethod = 'prf' | 'userHandle';

export type Base64String = string;

export type Base64URLString = string;

export type AuthenticatorTransportFuture =
  | 'ble'
  | 'cable'
  | 'hybrid'
  | 'internal'
  | 'nfc'
  | 'smart-card'
  | 'usb';

export type PasskeyRecord = {
  /** WebAuthn credential ID (base64url) */
  credentialId: Base64URLString;
  /** PRF or userHandle */
  derivationMethod: PasskeyDerivationMethod;
  /** AES-GCM IV for the encryption operation */
  iv: Base64String;
  /** PRF salt (present when derivationMethod === 'prf') */
  prfSalt?: Base64URLString;
  /** vault key encrypted with passkey-derived key */
  encryptedVaultKey: Base64String;
  /** Credential public key for signature verification (base64url-encoded COSE key) */
  publicKey: Base64URLString;
  /** Authenticator transports for allowCredentials hints */
  transports?: AuthenticatorTransportFuture[];
};

/** In-memory registration session: creation material + RP challenge bytes. */
export type PasskeyRegistrationSession = {
  userHandle: Base64URLString;
  prfSalt: Base64URLString;
  challenge: Base64URLString;
};

/** In-memory authentication session: challenge bytes. */
export type PasskeyAuthenticationSession = {
  challenge: Base64URLString;
};

/**
 * PRF extension types not covered by DOM typings.
 */
export type PrfEvalExtension = {
  eval: {
    first: Base64URLString;
  };
};

export type PrfClientExtensionResults = {
  prf?: {
    enabled?: boolean;
    results?: { first?: Base64URLString };
  };
};

// ─── WebAuthn Options/Response JSON types ────────────────────────────────────

export type PublicKeyCredentialDescriptorJSON = {
  id: Base64URLString;
  type: 'public-key';
  transports?: AuthenticatorTransportFuture[];
};

export type PasskeyRegistrationOptions = {
  rp: { name: string; id: string };
  user: {
    id: Base64URLString;
    name: string;
    displayName: string;
  };
  challenge: Base64URLString;
  pubKeyCredParams: { alg: number; type: 'public-key' }[];
  timeout?: number;
  excludeCredentials?: PublicKeyCredentialDescriptorJSON[];
  authenticatorSelection?: {
    authenticatorAttachment?: 'cross-platform' | 'platform';
    residentKey?: 'discouraged' | 'preferred' | 'required';
    requireResidentKey?: boolean;
    userVerification?: 'discouraged' | 'preferred' | 'required';
  };
  attestation?: 'direct' | 'enterprise' | 'indirect' | 'none';
  extensions?: Record<string, unknown>;
};

export type PasskeyRegistrationResponse = {
  id: Base64URLString;
  rawId: Base64URLString;
  type: 'public-key';
  response: {
    clientDataJSON: Base64URLString;
    attestationObject: Base64URLString;
    transports?: string[];
    publicKeyAlgorithm?: number;
    publicKey?: Base64URLString;
    authenticatorData?: Base64URLString;
  };
  authenticatorAttachment?: 'cross-platform' | 'platform';
  clientExtensionResults: Record<string, unknown>;
};

export type PasskeyAuthenticationOptions = {
  challenge: Base64URLString;
  timeout?: number;
  rpId?: string;
  allowCredentials?: PublicKeyCredentialDescriptorJSON[];
  userVerification?: 'discouraged' | 'preferred' | 'required';
  extensions?: Record<string, unknown>;
};

export type PasskeyAuthenticationResponse = {
  id: Base64URLString;
  rawId: Base64URLString;
  type: 'public-key';
  response: {
    clientDataJSON: Base64URLString;
    authenticatorData: Base64URLString;
    signature: Base64URLString;
    userHandle?: Base64URLString;
  };
  authenticatorAttachment?: 'cross-platform' | 'platform';
  clientExtensionResults: Record<string, unknown>;
};
