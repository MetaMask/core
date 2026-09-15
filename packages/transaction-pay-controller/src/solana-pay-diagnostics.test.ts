import type { MetamaskPaySolanaExecution } from '@metamask/transaction-controller';
import type { CaipAccountId, CaipAssetType } from '@metamask/utils';

import {
  getSolanaPaySupportDiagnostics,
  isSolanaPayLifecycleTransition,
  withSolanaPayErrorCode,
} from './solana-pay-diagnostics.js';
import type { TransactionPaySource } from './types.js';

const SOURCE: TransactionPaySource = {
  sourceAccountId:
    'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:account' as CaipAccountId,
  sourceAssetId:
    'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:asset' as CaipAssetType,
};

function getExecution(
  overrides: Partial<MetamaskPaySolanaExecution> = {},
): MetamaskPaySolanaExecution {
  return {
    atomicProductActionIncluded: false,
    atomicProductActionRequired: false,
    followUpStatus: 'not-required',
    notificationStatus: 'not-ready',
    phase: 'ready',
    relayStatus: 'not-observed',
    requestId: 'relay-request-id',
    requiresNonAtomicFollowUp: false,
    sourceAmountRaw: '1000000',
    sourceChainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
    sourceStatus: 'not-observed',
    sourceWalletAccountId: 'wallet-account-id',
    ...overrides,
  } as MetamaskPaySolanaExecution;
}

describe('getSolanaPaySupportDiagnostics', () => {
  it.each([
    [{ phase: 'user-rejected' }, 'user_rejected'],
    [{ phase: 'not-submitted' }, 'preflight_failed'],
    [{ phase: 'unknown' }, 'submission_unknown'],
    [{ sourceStatus: 'unknown' }, 'source_status_unknown'],
    [{ sourceStatus: 'failed' }, 'source_transaction_failed'],
    [{ relayStatus: 'failure' }, 'settlement_failed'],
    [{ relayStatus: 'refund' }, 'settlement_refunded'],
    [{ relayStatus: 'unknown' }, 'settlement_status_unknown'],
    [{ followUpStatus: 'failed' }, 'follow_up_failed'],
    [{ followUpStatus: 'unknown' }, 'follow_up_status_unknown'],
    [{ notificationStatus: 'failure' }, 'provider_notification_failed'],
  ] as const)('maps execution override %# to %s', (override, errorCode) => {
    expect(
      getSolanaPaySupportDiagnostics(SOURCE, getExecution(override)).errorCode,
    ).toBe(errorCode);
  });

  it('preserves a client-mapped pre-submission code', () => {
    const execution = withSolanaPayErrorCode(
      getExecution({
        errorCode: 'construction_failed',
        phase: 'not-submitted',
      }),
    );

    expect(execution.errorCode).toBe('construction_failed');
  });

  it('returns only categorical values and identifier-presence flags', () => {
    const diagnostic = getSolanaPaySupportDiagnostics(
      {
        ...SOURCE,
        sourceAccountId:
          'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:private-account' as CaipAccountId,
      },
      getExecution({
        phase: 'submitted',
        relayFailureReason: 'raw provider reason',
        sourceFailureReason: 'raw source reason',
        sourceStatus: 'pending',
        sourceTransactionId: 'private-signature',
        targetTransactionId: 'private-target-hash',
      }),
    );

    expect(diagnostic).toStrictEqual({
      followUpStatus: 'not-required',
      followUpTransactionIdPresent: false,
      notificationStatus: 'not-ready',
      outcome: 'submitted',
      phase: 'submitted',
      provider: 'relay',
      relayStatus: 'not-observed',
      requestIdPresent: true,
      sourceAssetClass: 'token',
      sourceStatus: 'pending',
      sourceTransactionIdPresent: true,
      targetTransactionIdPresent: true,
    });
    expect(JSON.stringify(diagnostic)).not.toContain('private');
    expect(JSON.stringify(diagnostic)).not.toContain('raw');
  });

  it('classifies native SOL without exposing its asset identifier', () => {
    const diagnostic = getSolanaPaySupportDiagnostics(
      {
        ...SOURCE,
        sourceAssetId:
          'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501' as CaipAssetType,
      },
      getExecution(),
    );

    expect(diagnostic.sourceAssetClass).toBe('native');
    expect(JSON.stringify(diagnostic)).not.toContain('slip44:501');
  });
});

describe('isSolanaPayLifecycleTransition', () => {
  it('deduplicates an identical categorical projection', () => {
    const diagnostic = getSolanaPaySupportDiagnostics(SOURCE, getExecution());

    expect(isSolanaPayLifecycleTransition(diagnostic, diagnostic)).toBe(false);
  });

  it.each([
    ['source', { sourceStatus: 'pending' }],
    ['Relay', { relayStatus: 'pending' }],
    ['notification', { notificationStatus: 'pending' }],
    ['follow-up', { followUpStatus: 'not-started' }],
    ['phase and outcome', { phase: 'attempting' }],
    ['error', { notificationStatus: 'failure' }],
    [
      'source identifier presence',
      { phase: 'submitted', sourceTransactionId: 'signature' },
    ],
    ['target identifier presence', { targetTransactionId: 'target-hash' }],
    [
      'follow-up identifier presence',
      { followUpTransactionId: 'follow-up-hash' },
    ],
  ] as const)('detects a %s transition', (_name, overrides) => {
    const previous = getSolanaPaySupportDiagnostics(SOURCE, getExecution());
    const next = getSolanaPaySupportDiagnostics(
      SOURCE,
      getExecution(overrides),
    );

    expect(isSolanaPayLifecycleTransition(previous, next)).toBe(true);
  });

  it('treats the initial durable execution as a transition', () => {
    const diagnostic = getSolanaPaySupportDiagnostics(SOURCE, getExecution());

    expect(isSolanaPayLifecycleTransition(undefined, diagnostic)).toBe(true);
  });
});
