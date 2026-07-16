export type PasskeyControllerInstanceOptions = {
  expectedRPID: string | string[];

  /**
   * Allowed value(s) for the WebAuthn client origin.
   */
  expectedOrigin: string | string[];

  /**
   * Relying party ID(s) for verification (SHA-256 hash match in authenticator data). Pass a string or array of strings; an empty array skips RP ID
   * allowlist checks in {@link verifyRegistrationResponse} / {@link verifyAuthenticationResponse}.
   *
   * @default undefined
   */
  rpId?: string;

  /**
   * Relying party name shown in the platform passkey UI.
   *
   * @default 'MetaMask'
   */
  rpName?: string;

  /**
   * Optional passkey user name; defaults to `rpName`.
   *
   * @default 'MetaMask Wallet'
   */
  userName?: string;

  /**
   * Optional display name; defaults to `rpName`.
   *
   * @default 'MetaMask Wallet'
   */
  userDisplayName?: string;
};
