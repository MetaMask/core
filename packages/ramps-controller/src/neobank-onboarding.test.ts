import { AutorampStatus } from './autorampAccount.js';
import type { AutorampAccount } from './autorampAccount.js';
import {
  NeobankOnboardingStage,
  deriveNeobankOnboardingStage,
  getDefaultNeobankState,
  summarizeAutorampsForWallet,
} from './neobank-onboarding.js';
import type { NeobankOnboardingDerivationInput } from './neobank-onboarding.js';

/**
 * Builds a derivation input with KYC complete and wallet/autoramp skipped by
 * default so each test can override the branch under assertion.
 *
 * @param overrides - Partial input overrides.
 * @returns A complete derivation input.
 */
function buildInput(
  overrides: {
    kyc?: Partial<NeobankOnboardingDerivationInput['kyc']>;
    wallet?: NeobankOnboardingDerivationInput['wallet'];
    autoramp?: NeobankOnboardingDerivationInput['autoramp'];
  } = {},
): NeobankOnboardingDerivationInput {
  return {
    kyc: {
      phase: 'done',
      userStatus: 'completed',
      sumsubStatus: 'complete',
      hasCustomerIdentity: true,
      hasVendorTerms: true,
      hasProviderTerms: true,
      ...overrides.kyc,
    },
    wallet: overrides.wallet ?? { status: 'skipped' },
    autoramp: overrides.autoramp ?? { status: 'skipped' },
  };
}

describe('getDefaultNeobankState', () => {
  it('returns an empty neobank slice', () => {
    expect(getDefaultNeobankState()).toStrictEqual({
      stage: null,
      lastHydratedAt: null,
      lastError: null,
    });
  });
});

describe('summarizeAutorampsForWallet', () => {
  const base: AutorampAccount = {
    id: 'ar-1',
    customerId: 'cust-1',
    walletAddress: '0xAbC',
    status: AutorampStatus.Created,
    lastSeenStatus: AutorampStatus.Created,
    updatedAt: 1,
  };

  it('returns none when no autoramp matches the wallet', () => {
    expect(summarizeAutorampsForWallet([base], '0xdef')).toStrictEqual({
      status: 'none',
    });
  });

  it('returns created when any matching autoramp is Approved', () => {
    expect(
      summarizeAutorampsForWallet(
        [
          { ...base, status: AutorampStatus.Authorized },
          {
            ...base,
            id: 'ar-2',
            status: AutorampStatus.Approved,
            lastSeenStatus: AutorampStatus.Approved,
          },
        ],
        '0xabc',
      ),
    ).toStrictEqual({ status: 'created' });
  });

  it('returns pending when a matching autoramp is still in progress', () => {
    expect(
      summarizeAutorampsForWallet(
        [{ ...base, status: AutorampStatus.DepositAccountAdded }],
        '0xabc',
      ),
    ).toStrictEqual({ status: 'pending' });
  });

  it('returns none when matching autoramps are only rejected or cancelled', () => {
    expect(
      summarizeAutorampsForWallet(
        [
          {
            ...base,
            status: AutorampStatus.Rejected,
            lastSeenStatus: AutorampStatus.Rejected,
          },
        ],
        '0xabc',
      ),
    ).toStrictEqual({ status: 'none' });
  });
});

describe('deriveNeobankOnboardingStage', () => {
  it('returns EmailOtpRequired while the MoonPay auth phase is active', () => {
    expect(
      deriveNeobankOnboardingStage(
        buildInput({
          kyc: {
            phase: 'auth',
            userStatus: null,
            hasVendorTerms: false,
            hasProviderTerms: false,
            hasCustomerIdentity: false,
            sumsubStatus: 'idle',
          },
        }),
      ),
    ).toBe(NeobankOnboardingStage.EmailOtpRequired);
  });

  it('returns NoUser when there is no identity, no terms, and no status', () => {
    expect(
      deriveNeobankOnboardingStage(
        buildInput({
          kyc: {
            phase: 'idle',
            userStatus: null,
            hasVendorTerms: false,
            hasProviderTerms: false,
            hasCustomerIdentity: false,
            sumsubStatus: 'idle',
          },
        }),
      ),
    ).toBe(NeobankOnboardingStage.NoUser);
  });

  it('returns VendorTermsRequired when vendor T&C1 is missing', () => {
    expect(
      deriveNeobankOnboardingStage(
        buildInput({
          kyc: {
            phase: 'terms',
            userStatus: 'not-started',
            hasVendorTerms: false,
            hasProviderTerms: false,
            hasCustomerIdentity: true,
            sumsubStatus: 'idle',
          },
        }),
      ),
    ).toBe(NeobankOnboardingStage.VendorTermsRequired);
  });

  it('returns ProviderTermsRequired when T&C2 batch is incomplete', () => {
    expect(
      deriveNeobankOnboardingStage(
        buildInput({
          kyc: {
            phase: 'terms',
            userStatus: 'not-started',
            hasVendorTerms: true,
            hasProviderTerms: false,
            hasCustomerIdentity: true,
            sumsubStatus: 'idle',
          },
        }),
      ),
    ).toBe(NeobankOnboardingStage.ProviderTermsRequired);
  });

  it('maps userStatus need-more-information to KycNeedsReview', () => {
    expect(
      deriveNeobankOnboardingStage(
        buildInput({
          kyc: { userStatus: 'need-more-information', sumsubStatus: 'failed' },
        }),
      ),
    ).toBe(NeobankOnboardingStage.KycNeedsReview);
  });

  it('maps userStatus terminal-failure to KycRejected', () => {
    expect(
      deriveNeobankOnboardingStage(
        buildInput({
          kyc: { userStatus: 'terminal-failure', sumsubStatus: 'failed' },
        }),
      ),
    ).toBe(NeobankOnboardingStage.KycRejected);
  });

  it('maps userStatus pending to KycPending', () => {
    expect(
      deriveNeobankOnboardingStage(
        buildInput({
          kyc: { userStatus: 'pending', sumsubStatus: 'polling' },
        }),
      ),
    ).toBe(NeobankOnboardingStage.KycPending);
  });

  it('maps in-progress SumSub to KycStartedIncomplete before completion', () => {
    expect(
      deriveNeobankOnboardingStage(
        buildInput({
          kyc: {
            userStatus: 'not-started',
            sumsubStatus: 'inProgress',
            phase: 'submit',
          },
        }),
      ),
    ).toBe(NeobankOnboardingStage.KycStartedIncomplete);
  });

  it('maps idle not-started KYC to KycNotStarted', () => {
    expect(
      deriveNeobankOnboardingStage(
        buildInput({
          kyc: {
            userStatus: 'not-started',
            sumsubStatus: 'idle',
            phase: 'done',
          },
        }),
      ),
    ).toBe(NeobankOnboardingStage.KycNotStarted);
  });

  it('returns WalletNotSigned when KYC is complete and wallet is absent', () => {
    expect(
      deriveNeobankOnboardingStage(
        buildInput({
          wallet: { status: 'resolved', registration: { type: 'absent' } },
          autoramp: { status: 'none' },
        }),
      ),
    ).toBe(NeobankOnboardingStage.WalletNotSigned);
  });

  it('returns LookupFailed when wallet lookup is unavailable', () => {
    expect(
      deriveNeobankOnboardingStage(
        buildInput({
          wallet: { status: 'lookupUnavailable', message: 'down' },
        }),
      ),
    ).toBe(NeobankOnboardingStage.LookupFailed);
  });

  it('returns AutorampNotCreated when the wallet is registered but no route exists', () => {
    expect(
      deriveNeobankOnboardingStage(
        buildInput({
          wallet: {
            status: 'resolved',
            registration: {
              type: 'active',
              registration: {
                id: 'w1',
                address: '0xabc',
                blockchain: 'Monad',
                disabled: false,
                isSelf: true,
              },
            },
          },
          autoramp: { status: 'none' },
        }),
      ),
    ).toBe(NeobankOnboardingStage.AutorampNotCreated);
  });

  it('returns AutorampPending when a standing route is not Approved', () => {
    expect(
      deriveNeobankOnboardingStage(
        buildInput({
          wallet: {
            status: 'resolved',
            registration: {
              type: 'active',
              registration: {
                id: 'w1',
                address: '0xabc',
                blockchain: 'Monad',
                disabled: false,
                isSelf: true,
              },
            },
          },
          autoramp: { status: 'pending' },
        }),
      ),
    ).toBe(NeobankOnboardingStage.AutorampPending);
  });

  it('returns AutorampCreated when a standing route is Approved', () => {
    expect(
      deriveNeobankOnboardingStage(
        buildInput({
          wallet: {
            status: 'resolved',
            registration: {
              type: 'disabled',
              registration: {
                id: 'w1',
                address: '0xabc',
                blockchain: 'Monad',
                disabled: true,
                isSelf: true,
              },
            },
          },
          autoramp: { status: 'created' },
        }),
      ),
    ).toBe(NeobankOnboardingStage.AutorampCreated);
  });

  it('maps submit/session phases to KycStartedIncomplete', () => {
    expect(
      deriveNeobankOnboardingStage(
        buildInput({
          kyc: {
            userStatus: 'not-started',
            sumsubStatus: 'idle',
            phase: 'submit',
            hasVendorTerms: true,
            hasProviderTerms: true,
          },
        }),
      ),
    ).toBe(NeobankOnboardingStage.KycStartedIncomplete);
    expect(
      deriveNeobankOnboardingStage(
        buildInput({
          kyc: {
            userStatus: 'not-started',
            sumsubStatus: 'idle',
            phase: 'session',
            hasVendorTerms: true,
            hasProviderTerms: true,
          },
        }),
      ),
    ).toBe(NeobankOnboardingStage.KycStartedIncomplete);
  });

  it('maps error phase to KycRejected when status is incomplete', () => {
    expect(
      deriveNeobankOnboardingStage(
        buildInput({
          kyc: {
            userStatus: 'not-started',
            sumsubStatus: 'idle',
            phase: 'error',
            hasVendorTerms: true,
            hasProviderTerms: true,
          },
        }),
      ),
    ).toBe(NeobankOnboardingStage.KycRejected);
  });

  it('maps failed SumSub to KycRejected before completion', () => {
    expect(
      deriveNeobankOnboardingStage(
        buildInput({
          kyc: {
            userStatus: 'not-started',
            sumsubStatus: 'failed',
            phase: 'done',
            hasVendorTerms: true,
            hasProviderTerms: true,
          },
        }),
      ),
    ).toBe(NeobankOnboardingStage.KycRejected);
  });

  it('returns LookupFailed when KYC is complete but wallet was skipped', () => {
    expect(
      deriveNeobankOnboardingStage(
        buildInput({
          wallet: { status: 'skipped' },
          autoramp: { status: 'skipped' },
        }),
      ),
    ).toBe(NeobankOnboardingStage.LookupFailed);
  });

  it('returns LookupFailed when wallet is registered but autoramp was skipped', () => {
    expect(
      deriveNeobankOnboardingStage(
        buildInput({
          wallet: {
            status: 'resolved',
            registration: {
              type: 'active',
              registration: {
                id: 'w1',
                address: '0xabc',
                blockchain: 'Monad',
                disabled: false,
                isSelf: true,
              },
            },
          },
          autoramp: { status: 'skipped' },
        }),
      ),
    ).toBe(NeobankOnboardingStage.LookupFailed);
  });
});
