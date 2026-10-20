import {
  CAPABILITY_AUTHORIZATION_STATUSES,
  needsCapabilityAuthorizationRefresh,
} from './types.js';
import type { KycSessionStatus } from './types.js';

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
