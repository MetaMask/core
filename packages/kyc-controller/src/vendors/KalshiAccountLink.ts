/**
 * Device-signed Kalshi account link adapter supplied by each client.
 */

/**
 * MFA methods Kalshi can ask for while it verifies the account link.
 */
export type KalshiAccountLinkMfaMethod = 'sms' | 'email' | 'authenticator-app';

/**
 * The calls that create or link a Kalshi account. They are signed with a key
 * that lives on the device, so each client supplies them. The adapter sends
 * the signed call through kyc-api. The controller then asks kyc-api for the
 * next step, so it never keeps the link state itself.
 */
export type KalshiAccountLinkAdapter = {
  /**
   * Starts the link by sending Kalshi's code to the email.
   */
  startLink: (params: { email: string }) => Promise<void>;
  /**
   * Verifies the code Kalshi sent.
   *
   * @returns The MFA method Kalshi wants next, if it wants one.
   */
  verifyLink: (params: { code: string }) => Promise<{
    mfaMethod?: KalshiAccountLinkMfaMethod;
  }>;
};
