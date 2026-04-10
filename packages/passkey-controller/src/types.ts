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

export type PublicKeyCredentialRpEntityJSON = {
  id?: string;
  name: string;
};

export type PublicKeyCredentialUserEntityJSON = {
  id: Base64URLString;
  name: string;
  displayName: string;
};

export type PublicKeyCredentialParametersJSON = {
  alg: number;
  type: 'public-key';
};

export type AuthenticatorSelectionCriteriaJSON = {
  authenticatorAttachment?: string;
  requireResidentKey?: boolean;
  residentKey?: string;
  userVerification?: string;
};

export type PublicKeyCredentialDescriptorJSON = {
  id: Base64URLString;
  type: 'public-key';
};

export type PrfEvalExtensionJSON = {
  eval: {
    first: Base64URLString;
  };
};

export type AuthenticationExtensionsClientInputsJSON = {
  prf?: PrfEvalExtensionJSON;
};

export type PasskeyRegistrationOptions = {
  rp: PublicKeyCredentialRpEntityJSON;
  user: PublicKeyCredentialUserEntityJSON;
  challenge: Base64URLString;
  pubKeyCredParams: PublicKeyCredentialParametersJSON[];
  timeout?: number;
  excludeCredentials?: PublicKeyCredentialDescriptorJSON[];
  authenticatorSelection?: AuthenticatorSelectionCriteriaJSON;
  attestation?: string;
  extensions?: AuthenticationExtensionsClientInputsJSON;
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
  allowCredentials?: PublicKeyCredentialDescriptorJSON[];
  userVerification?: string;
  hints?: string[];
  extensions?: AuthenticationExtensionsClientInputsJSON;
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
