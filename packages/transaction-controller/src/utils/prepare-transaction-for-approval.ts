import type { TransactionMeta } from '../types.js';

/** Facts that determine whether sponsorship is retained at approval time. */
export type TransactionApprovalSponsorshipFacts = {
  /** Whether simulation or the caller reports sponsorship as available. */
  available: boolean;

  /** Whether the actual account and selected publication path support optional sponsorship. */
  supported: boolean;

  /** Whether the user explicitly disabled optional sponsorship. */
  optedOut: boolean;

  /**
   * Whether the product transaction requires a sponsored publication path and
   * therefore cannot safely fall back to unsponsored publication.
   */
  required: boolean;
};

/** Facts that determine how the approved transaction is signed. */
export type TransactionApprovalSigningFacts = {
  /** Whether the selected sponsored publication path signs outside local keyring signing. */
  externalSigningSupported: boolean;
};

/** Input for preparing transaction metadata immediately before approval. */
export type PrepareTransactionForApprovalRequest = {
  /** Transaction metadata to prepare. This object is not mutated. */
  transactionMeta: TransactionMeta;

  /** Sponsorship facts determined by simulation and the client integration. */
  sponsorship: TransactionApprovalSponsorshipFacts;

  /** Signing facts for the selected publication path. */
  signing: TransactionApprovalSigningFacts;
};

/** The signing mode selected for the prepared transaction. */
export type TransactionApprovalSigningMode = 'local' | 'external';

/** Output from preparing transaction metadata for approval. */
export type PrepareTransactionForApprovalResult = {
  /** A copy of the transaction metadata containing the normalized fields. */
  transactionMeta: TransactionMeta;

  /** Explicit decisions made from the supplied facts. */
  decisions: {
    /** Whether sponsorship is retained. */
    sponsorshipEnabled: boolean;

    /** Whether Core should sign locally or defer signing to the publication path. */
    signingMode: TransactionApprovalSigningMode;
  };
};

/**
 * Normalize the execution-sensitive sponsorship and signing metadata used when
 * approving a transaction.
 *
 * `isExternalSign` describes the selected publication path, rather than the
 * account alone: when true, TransactionController skips local keyring signing.
 * A supported sponsored path may still use local signing (for example, a Smart
 * Transaction path), so sponsorship does not imply external signing.
 *
 * Sponsorship availability is supplied by the caller, typically from the most
 * recent simulation. Product integrations also supply `required` explicitly;
 * it is not inferred from transaction type. A required flow can override the
 * optional-support result only when its external publication path is available.
 * If a required path is unavailable, preparation throws rather than risk
 * publishing a semantically invalid parent transaction. Explicit user opt-out
 * is always authoritative and deliberately selects unsponsored local signing.
 *
 * Gas-fee-token selection is intentionally outside this helper.
 * `checkGasFeeTokenBeforePublish` remains authoritative for final native-balance
 * validation, refreshing token quotes, clearing or retaining the selected fee
 * token, removing the nonce, and selecting external signing at publication.
 *
 * @param request - Transaction metadata and normalized preparation facts.
 * @param request.signing - Signing facts for the selected publication path.
 * @param request.sponsorship - Sponsorship facts determined by the caller.
 * @param request.transactionMeta - Transaction metadata to prepare.
 * @returns Prepared transaction metadata and the resulting decisions.
 * @throws If sponsorship is required but no sponsored publication path is available.
 */
export function prepareTransactionForApproval({
  signing,
  sponsorship,
  transactionMeta,
}: PrepareTransactionForApprovalRequest): PrepareTransactionForApprovalResult {
  const sponsorshipEnabled =
    sponsorship.available &&
    !sponsorship.optedOut &&
    (sponsorship.supported ||
      (sponsorship.required && signing.externalSigningSupported));

  if (sponsorship.required && !sponsorship.optedOut && !sponsorshipEnabled) {
    throw new Error('Required transaction sponsorship is unavailable');
  }

  const signingMode: TransactionApprovalSigningMode =
    sponsorshipEnabled && signing.externalSigningSupported
      ? 'external'
      : 'local';

  return {
    decisions: {
      signingMode,
      sponsorshipEnabled,
    },
    transactionMeta: {
      ...transactionMeta,
      isExternalSign: signingMode === 'external',
      isGasFeeSponsored: sponsorshipEnabled,
    },
  };
}
