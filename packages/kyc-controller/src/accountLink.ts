/**
 * Device-signed account link adapter supplied by each client.
 */

/**
 * MFA methods a vendor can ask for while it verifies the account link.
 */
export type KycAccountLinkMfaMethod = 'sms' | 'email' | 'authenticator-app';

/**
 * The calls that create or link a vendor's own account (Kalshi). They are
 * signed with a key that lives on the device, so each client supplies them.
 * The adapter sends the signed call through kyc-api. The controller then asks
 * kyc-api for the next step, so it never keeps the link state itself.
 */
export type KycAccountLinkAdapter = {
  /**
   * Starts the link by sending the vendor's code to the email.
   */
  startLink: (params: { email: string }) => Promise<void>;
  /**
   * Verifies the code the vendor sent.
   *
   * @returns The MFA method the vendor wants next, if it wants one.
   */
  verifyLink: (params: { code: string }) => Promise<{
    mfaMethod?: KycAccountLinkMfaMethod;
  }>;
};
