import type { SignatureControllerOptions } from '@metamask/signature-controller';

/**
 * Per-instance options for the wallet's `SignatureController`. All fields are
 * optional.
 */
export type SignatureControllerInstanceOptions = Omit<
  SignatureControllerOptions,
  'messenger' | 'state'
>;
