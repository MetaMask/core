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

/**
 * In-memory state for one **in-flight** WebAuthn **registration** ceremony
 * (from `create()` options until `protectVaultKeyWithPasskey` completes). This is
 * not a user login session; it is keyed by challenge and distinct from the full
 * spec ceremony (which includes the authenticator round-trip).
 */
export type PasskeyRegistrationCeremony = {
  userHandle: Base64URLString;
  prfSalt: Base64URLString;
  challenge: Base64URLString;
  /** When this ceremony was started (ms since epoch); used for TTL pruning. */
  createdAt: number;
};

/**
 * In-memory state for one **in-flight** WebAuthn **authentication** ceremony
 * (`get()` options until the assertion is verified). Not a user login session.
 */
export type PasskeyAuthenticationCeremony = {
  challenge: Base64URLString;
  /** When this ceremony was started (ms since epoch); used for TTL pruning. */
  createdAt: number;
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
