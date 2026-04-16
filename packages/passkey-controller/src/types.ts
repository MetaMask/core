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
  /** Authenticator signature counter for replay detection */
  counter: number;
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
