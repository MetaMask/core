import { describe, expect, it } from 'vitest';

import {
  patchKycSessionStatus,
  CAPABILITY_AUTHORIZATION_STATUSES,
  KYC_CURRENT_STEPS,
  KYC_STATUSES,
  needsCapabilityAuthorizationRefresh,
} from './types.js';
import type { KycCurrentStep, KycSessionStatus } from './types.js';

/**
 * Builds a minimal session status for capability-authorization refresh checks.
 *
 * @param overrides - Fields to overlay on the default status.
 * @returns A session status object.
 */
function status(overrides: Partial<KycSessionStatus> = {}): KycSessionStatus {
  return {
    id: 'sid',
    finalStatus: 'pending',
    externalUserId: 'ext-1',
    kycStatus: 'pending',
    vendor: 'sumsub',
    vendorStatus: 'pending',
    currentStep: KYC_CURRENT_STEPS.processing,
    ...overrides,
  };
}

describe('needsCapabilityAuthorizationRefresh', () => {
  it.each(['new', 'expired'] as const)(
    'returns true when capability authorization is %s',
    (capabilityAuthorizationStatus) => {
      expect(
        needsCapabilityAuthorizationRefresh(
          status({ capabilityAuthorizationStatus }),
        ),
      ).toBe(true);
    },
  );

  it.each(['pending', 'stored', 'wiped'] as const)(
    'returns false when capability authorization is %s',
    (capabilityAuthorizationStatus) => {
      expect(
        needsCapabilityAuthorizationRefresh(
          status({ capabilityAuthorizationStatus }),
        ),
      ).toBe(false);
    },
  );

  it('returns false when capability authorization status is missing', () => {
    expect(needsCapabilityAuthorizationRefresh(status())).toBe(false);
  });

  it.each(['approved', 'rejected'] as const)(
    'returns false when finalStatus is %s even if capability authorization is expired',
    (finalStatus) => {
      expect(
        needsCapabilityAuthorizationRefresh(
          status({
            finalStatus,
            capabilityAuthorizationStatus:
              CAPABILITY_AUTHORIZATION_STATUSES.expired,
          }),
        ),
      ).toBe(false);
    },
  );

  it('returns true when finalStatus is retry and capability authorization is new', () => {
    expect(
      needsCapabilityAuthorizationRefresh(
        status({
          finalStatus: 'retry',
          capabilityAuthorizationStatus: CAPABILITY_AUTHORIZATION_STATUSES.new,
        }),
      ),
    ).toBe(true);
  });
});

describe('patchKycSessionStatus', () => {
  it('keeps finalStatus when the session is pending on a step other than kyc', () => {
    const session = status({
      finalStatus: 'pending',
      currentStep: KYC_CURRENT_STEPS.emailOtpCollection,
    });

    expect(patchKycSessionStatus(session)).toBe(session);
  });

  it.each([
    KYC_CURRENT_STEPS.processing,
    KYC_CURRENT_STEPS.phoneOtpCollection,
    KYC_CURRENT_STEPS.capabilityAuthorization,
    KYC_CURRENT_STEPS.approved,
    KYC_CURRENT_STEPS.rejected,
  ] as const satisfies readonly KycCurrentStep[])(
    'keeps a pending finalStatus when currentStep is %s',
    (currentStep) => {
      const session = status({ finalStatus: 'pending', currentStep });

      expect(patchKycSessionStatus(session).finalStatus).toBe('pending');
    },
  );

  it('reports finalStatus as new when the API status is pending at the kyc step', () => {
    const session = status({
      finalStatus: 'pending',
      currentStep: KYC_CURRENT_STEPS.kyc,
    });

    expect(patchKycSessionStatus(session)).toStrictEqual({
      ...session,
      finalStatus: KYC_STATUSES.new,
    });
  });

  it.each(['approved', 'rejected', 'retry', 'new'] as const)(
    'keeps finalStatus %s even when currentStep is kyc',
    (finalStatus) => {
      const session = status({
        finalStatus,
        currentStep: KYC_CURRENT_STEPS.kyc,
      });

      expect(patchKycSessionStatus(session)).toBe(session);
    },
  );

  it('keeps finalStatus and an unrecognized currentStep', () => {
    const session = status({
      finalStatus: 'pending',
      currentStep: 'addressCollection',
    });

    expect(patchKycSessionStatus(session)).toBe(session);
  });

  it('keeps finalStatus when currentStep is missing', () => {
    const session = status({ finalStatus: 'pending' });
    delete session.currentStep;

    expect(patchKycSessionStatus(session)).toBe(session);
  });
});
