export type PasskeyDerivationMethod = 'prf' | 'userHandle';

export type PasskeyRecord = {
  /** base64-encoded credential ID */
  credentialId: string;
  derivationMethod: PasskeyDerivationMethod;
  /** base64 — vault encryption key wrapped with passkey-derived key */
  wrappedEncryptionKey: string;
  /** base64 — AES-GCM IV for the wrapping operation */
  iv: string;
  /** base64 — PRF eval salt (present when derivationMethod === 'prf') */
  prfSalt?: string;
  /** Vault encryption salt at time of enrollment (needed for submitEncryptionKey) */
  encryptionSalt?: string;
};

export type CredentialCreationResult = {
  credentialId: Uint8Array;
  userHandle: Uint8Array;
  prfEnabled: boolean;
  prfFirst?: ArrayBuffer;
};

export type AssertionResult = {
  userHandle?: ArrayBuffer | null;
  prfFirst?: ArrayBuffer;
};

export type CreationParams = {
  userHandle: Uint8Array;
  prfSalt: Uint8Array;
};

export type AssertionParams = {
  credentialId: Uint8Array;
  prfSalt?: Uint8Array;
  usePrf: boolean;
};
