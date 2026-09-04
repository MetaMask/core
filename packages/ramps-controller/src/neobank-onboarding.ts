/**
 * Money Account / NeoBank onboarding stage derivation for Mobile routing.
 *
 * {@link RampsController.hydrateNeobankStore} refreshes authoritative KYC /
 * wallet / autoramp signals, then uses {@link deriveNeobankOnboardingStage} to
 * pick a single stage. This ticket returns state only — it never navigates and
 * does not auto-submit wallet registration or autoramp creation (TRAM-3924).
 */

import type {
  KycPhase,
  KycSumSubStatus,
  KycUserStatus,
} from '@metamask/kyc-controller';

import { AutorampStatus } from './autorampAccount.js';
import type { AutorampAccount } from './autorampAccount.js';
import type { RegistrationStatus } from './wallet-registration-service.js';

/**
 * Single Mobile-routable stage for NeoBank / Money Account onboarding.
 *
 * Ordered roughly by funnel position. Terms 1 = vendor disclaimers; Terms 2 =
 * SumSub + idOS provider disclaimers (submitted as a batch — if either is
 * missing after a partial accept, Mobile routes back to Terms 2).
 */
export enum NeobankOnboardingStage {
  /** No vendor customer / identity yet. */
  NoUser = 'NoUser',
  /** MoonPay Auth frame: email OTP required. */
  EmailOtpRequired = 'EmailOtpRequired',
  /** Vendor T&C (Terms 1) not accepted. */
  VendorTermsRequired = 'VendorTermsRequired',
  /** SumSub + idOS T&C (Terms 2) not accepted as a batch. */
  ProviderTermsRequired = 'ProviderTermsRequired',
  /** KYC not started. */
  KycNotStarted = 'KycNotStarted',
  /** SumSub / document flow started but not finished. */
  KycStartedIncomplete = 'KycStartedIncomplete',
  /** Terminal KYC failure / rejection. */
  KycRejected = 'KycRejected',
  /** Needs review / more information (EDD). */
  KycNeedsReview = 'KycNeedsReview',
  /** KYC submitted; vendor still deciding. */
  KycPending = 'KycPending',
  /** Money Account wallet ownership proof not registered. */
  WalletNotSigned = 'WalletNotSigned',
  /** No autoramp standing route yet. */
  AutorampNotCreated = 'AutorampNotCreated',
  /** Autoramp exists but is not yet Approved. */
  AutorampPending = 'AutorampPending',
  /** Autoramp Approved (account ready). */
  AutorampCreated = 'AutorampCreated',
  /** Authoritative lookup failed; Mobile should show a retryable error. */
  LookupFailed = 'LookupFailed',
}

/**
 * Persisted / UI-facing NeoBank slice on {@link RampsController} state.
 */
export type NeobankState = {
  /** Latest derived onboarding stage. */
  stage: NeobankOnboardingStage | null;
  /** ISO-8601 timestamp of the last successful hydrate, or `null`. */
  lastHydratedAt: string | null;
  /** Last hydrate error message when stage is {@link NeobankOnboardingStage.LookupFailed}. */
  lastError: string | null;
};

/**
 * Inputs for {@link deriveNeobankOnboardingStage}. Built by
 * {@link RampsController.hydrateNeobankStore} after refreshing remotes.
 */
export type NeobankOnboardingDerivationInput = {
  kyc: {
    phase: KycPhase;
    userStatus: KycUserStatus | null;
    sumsubStatus: KycSumSubStatus;
    hasCustomerIdentity: boolean;
    hasVendorTerms: boolean;
    /**
     * True only when both SumSub provider disclaimers and idOS disclaimers
     * were accepted together (batch T&C2).
     */
    hasProviderTerms: boolean;
  };
  /**
   * Wallet registration lookup for the Money Account address.
   * `skipped` when KYC is not complete yet.
   */
  wallet:
    | { status: 'skipped' }
    | { status: 'lookupUnavailable'; message?: string }
    | { status: 'resolved'; registration: RegistrationStatus };
  /**
   * Autoramp readiness for the Money Account address.
   * `skipped` when KYC or wallet registration is incomplete.
   */
  autoramp:
    | { status: 'skipped' }
    | { status: 'none' }
    | { status: 'pending' }
    | { status: 'created' };
};

/**
 * Default NeoBank slice for {@link RampsController} state.
 *
 * @returns Empty neobank state.
 */
export function getDefaultNeobankState(): NeobankState {
  return {
    stage: null,
    lastHydratedAt: null,
    lastError: null,
  };
}

/**
 * Whether a SumSub sub-flow status means the applicant started documents but
 * has not reached a terminal outcome yet.
 *
 * @param status - SumSub sub-flow status.
 * @returns Whether the flow is in progress.
 */
function isSumSubInProgress(status: KycSumSubStatus): boolean {
  return (
    status === 'creatingSession' ||
    status === 'fetchingToken' ||
    status === 'launching' ||
    status === 'inProgress' ||
    status === 'polling' ||
    status === 'vendorProcessing'
  );
}

/**
 * Whether an autoramp status counts as "created / ready" for Mobile routing.
 *
 * @param status - Autoramp status.
 * @returns Whether the autoramp is Approved.
 */
export function isAutorampCreatedStatus(status: AutorampStatus): boolean {
  return status === AutorampStatus.Approved;
}

/**
 * Whether an autoramp status counts as still pending (exists but not ready).
 *
 * @param status - Autoramp status.
 * @returns Whether Mobile should show a pending autoramp stage.
 */
export function isAutorampPendingStatus(status: AutorampStatus): boolean {
  return (
    status !== AutorampStatus.Approved &&
    status !== AutorampStatus.Rejected &&
    status !== AutorampStatus.Cancelled
  );
}

/**
 * Summarizes local autoramp accounts for a wallet into a derivation input.
 *
 * @param autoramps - Local last-seen autoramp cache.
 * @param walletAddress - Money Account wallet address (case-insensitive).
 * @returns Autoramp branch for {@link NeobankOnboardingDerivationInput}.
 */
export function summarizeAutorampsForWallet(
  autoramps: readonly AutorampAccount[],
  walletAddress: string,
): NeobankOnboardingDerivationInput['autoramp'] {
  const normalized = walletAddress.toLowerCase();
  const matching = autoramps.filter(
    (autoramp) => autoramp.walletAddress.toLowerCase() === normalized,
  );
  if (matching.length === 0) {
    return { status: 'none' };
  }
  if (matching.some((autoramp) => isAutorampCreatedStatus(autoramp.status))) {
    return { status: 'created' };
  }
  if (matching.some((autoramp) => isAutorampPendingStatus(autoramp.status))) {
    return { status: 'pending' };
  }
  // Only rejected/cancelled remain — treat as needing a new autoramp.
  return { status: 'none' };
}

/**
 * Derives the single Mobile-routable NeoBank onboarding stage.
 *
 * Priority follows the product funnel: identity / terms / KYC, then wallet
 * registration, then autoramp. Safe to call twice with the same inputs.
 *
 * @param input - Refreshed KYC + wallet + autoramp signals.
 * @returns The onboarding stage.
 */
export function deriveNeobankOnboardingStage(
  input: NeobankOnboardingDerivationInput,
): NeobankOnboardingStage {
  const { kyc, wallet, autoramp } = input;

  if (kyc.phase === 'auth') {
    return NeobankOnboardingStage.EmailOtpRequired;
  }

  if (!kyc.hasVendorTerms) {
    if (!kyc.hasCustomerIdentity && kyc.userStatus === null) {
      return NeobankOnboardingStage.NoUser;
    }
    return NeobankOnboardingStage.VendorTermsRequired;
  }

  if (!kyc.hasProviderTerms) {
    return NeobankOnboardingStage.ProviderTermsRequired;
  }

  if (kyc.userStatus === 'need-more-information') {
    return NeobankOnboardingStage.KycNeedsReview;
  }
  if (kyc.userStatus === 'terminal-failure') {
    return NeobankOnboardingStage.KycRejected;
  }
  if (kyc.userStatus === 'pending') {
    return NeobankOnboardingStage.KycPending;
  }

  if (kyc.userStatus !== 'completed') {
    if (isSumSubInProgress(kyc.sumsubStatus) || kyc.sumsubStatus === 'failed') {
      return kyc.sumsubStatus === 'failed'
        ? NeobankOnboardingStage.KycRejected
        : NeobankOnboardingStage.KycStartedIncomplete;
    }
    if (kyc.phase === 'error') {
      return NeobankOnboardingStage.KycRejected;
    }
    if (kyc.phase === 'submit' || kyc.phase === 'session') {
      return NeobankOnboardingStage.KycStartedIncomplete;
    }
    return NeobankOnboardingStage.KycNotStarted;
  }

  // KYC completed — wallet / autoramp stages.
  if (wallet.status === 'lookupUnavailable') {
    return NeobankOnboardingStage.LookupFailed;
  }
  if (wallet.status === 'skipped') {
    return NeobankOnboardingStage.LookupFailed;
  }
  if (wallet.registration.type === 'absent') {
    return NeobankOnboardingStage.WalletNotSigned;
  }
  // active or disabled registrations both count as "signed"; disabled is a
  // downstream product concern, not a missing ownership proof.
  if (autoramp.status === 'skipped') {
    return NeobankOnboardingStage.LookupFailed;
  }
  if (autoramp.status === 'none') {
    return NeobankOnboardingStage.AutorampNotCreated;
  }
  if (autoramp.status === 'pending') {
    return NeobankOnboardingStage.AutorampPending;
  }
  return NeobankOnboardingStage.AutorampCreated;
}
