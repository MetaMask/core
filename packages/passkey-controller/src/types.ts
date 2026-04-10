export type PasskeyDerivationMethod = 'prf' | 'userHandle';

export type PasskeyRecord = {
  credentialId: Base64URLString;
  derivationMethod: PasskeyDerivationMethod;
  /** base64 — vault encryption key wrapped with passkey-derived key */
  wrappedEncryptionKey: string;
  /** base64 — AES-GCM IV for the wrapping operation */
  iv: string;
  /** base64 — PRF eval salt (present when derivationMethod === 'prf') */
  prfSalt?: Base64URLString;
  /** Vault encryption salt at time of enrollment (needed for submitEncryptionKey) */
  encryptionSalt?: string;
};

/** In-memory registration session: creation material + RP challenge bytes. */
export type PasskeyRegistrationSession = {
  userHandle: Base64URLString;
  prfSalt: Base64URLString;
  challenge: Base64URLString;
};

export type PasskeyAuthenticationSession = {
  challenge: Base64URLString;
};

/** WebAuthn JSON wire types (base64url for binary fields). */

export type Base64URLString = string;

export type ResidentKeyRequirement = 'discouraged' | 'preferred' | 'required';
export type UserVerificationRequirement =
  | 'discouraged'
  | 'preferred'
  | 'required';
export type AuthenticatorAttachment = 'cross-platform' | 'platform';
export type AttestationConveyancePreference =
  | 'direct'
  | 'enterprise'
  | 'indirect'
  | 'none';
export type PublicKeyCredentialHint =
  | 'hybrid'
  | 'security-key'
  | 'client-device';

export type PublicKeyCredentialRpEntity = {
  id?: string;
  name: string;
};

export type COSEAlgorithmIdentifier = number;
export type PublicKeyCredentialType = 'public-key';

export type PublicKeyCredentialParameters = {
  alg: COSEAlgorithmIdentifier;
  type: PublicKeyCredentialType;
};

export type PublicKeyCredentialUserEntity = {
  id: Base64URLString;
  name: string;
  displayName: string;
};

export type AuthenticatorSelectionCriteria = {
  authenticatorAttachment?: AuthenticatorAttachment;
  requireResidentKey?: boolean;
  residentKey?: ResidentKeyRequirement;
  userVerification?: UserVerificationRequirement;
};

export type PublicKeyCredentialDescriptor = {
  id: Base64URLString;
  type: 'public-key';
};

export type PrfEvalExtension = {
  eval: {
    first: Base64URLString;
  };
};

export type AuthenticationExtensionsClientInputs = {
  prf?: PrfEvalExtension;
};

export type PasskeyRegistrationOptions = {
  rp: PublicKeyCredentialRpEntity;
  user: PublicKeyCredentialUserEntity;
  challenge: Base64URLString;
  pubKeyCredParams: PublicKeyCredentialParameters[];
  timeout?: number;
  excludeCredentials?: PublicKeyCredentialDescriptor[];
  authenticatorSelection?: AuthenticatorSelectionCriteria;
  attestation?: AttestationConveyancePreference;
  /** WebAuthn L3 credential hints (`client-device`, `hybrid`, etc.). */
  hints?: string[];
  extensions?: AuthenticationExtensionsClientInputs;
};

export type AuthenticatorTransportFuture = string;

export type PasskeyRegistrationResponse = {
  id: Base64URLString;
  rawId: Base64URLString;
  response: {
    clientDataJSON: Base64URLString;
    attestationObject: Base64URLString;
    transports?: AuthenticatorTransportFuture[];
  };
  type: string;
  clientExtensionResults?: {
    prf?: {
      enabled?: boolean;
      results?: { first?: Base64URLString };
    };
  };
};

export type PasskeyAuthenticationOptions = {
  challenge: Base64URLString;
  timeout?: number;
  rpId?: string;
  allowCredentials?: PublicKeyCredentialDescriptor[];
  userVerification?: UserVerificationRequirement;
  hints?: PublicKeyCredentialHint[];
  extensions?: AuthenticationExtensionsClientInputs;
};

export type PasskeyAuthenticationResponse = {
  id: Base64URLString;
  rawId: Base64URLString;
  response: {
    clientDataJSON: Base64URLString;
    authenticatorData: Base64URLString;
    signature: Base64URLString;
    userHandle?: Base64URLString;
  };
  type: string;
  clientExtensionResults?: {
    prf?: {
      enabled?: boolean;
      results?: { first?: Base64URLString };
    };
  };
};
