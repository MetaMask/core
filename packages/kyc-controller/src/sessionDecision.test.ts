import { describe, expect, it } from 'vitest';

import { getDefaultKycVendorSessionState } from './KycController.js';
import type {
  KycProviderFlowStatus,
  KycVendorSessionState,
} from './KycController.js';
import { getKycSessionDecision } from './sessionDecision.js';

const entry = (
  finalStatus: string,
  kycStatus: string,
  providerFlowStatus: KycProviderFlowStatus = 'not_started',
): KycVendorSessionState => ({
  ...getDefaultKycVendorSessionState(),
  providerFlowStatus,
  sessionStatus: {
    id: 'sid',
    finalStatus,
    kycStatus,
    externalUserId: 'ext',
    vendor: 'iron',
    vendorStatus: finalStatus,
  },
});

describe('getKycSessionDecision', () => {
  it('is none without an entry or session', () => {
    expect(getKycSessionDecision(undefined)).toBe('none');
    expect(getKycSessionDecision(getDefaultKycVendorSessionState())).toBe(
      'none',
    );
  });

  // Parity with the ramps controller's former `resolveVbaKycStatus`.
  it.each([
    ['approved', 'approved', 'not_started', 'approved'],
    ['approved', 'pending', 'not_started', 'approved'],
    ['pending', 'approved', 'not_started', 'pending'],
    ['rejected', 'rejected', 'not_started', 'rejected'],
    ['rejected', 'pending', 'submitted', 'rejected'],
    ['retry', 'retry', 'submitted', 'retry'],
    ['pending', 'pending', 'not_started', 'pending'],
    ['new', 'pending', 'not_started', 'pending'],
    ['new', 'new', 'submitted', 'pending'],
    ['new', 'new', 'not_started', 'new'],
    ['new', 'new', 'abandoned', 'new'],
    ['something-else', 'new', 'not_started', 'none'],
  ] as const)(
    'finalStatus %s, kycStatus %s, flow %s → %s',
    (finalStatus, kycStatus, flow, expected) => {
      expect(getKycSessionDecision(entry(finalStatus, kycStatus, flow))).toBe(
        expected,
      );
    },
  );
});
