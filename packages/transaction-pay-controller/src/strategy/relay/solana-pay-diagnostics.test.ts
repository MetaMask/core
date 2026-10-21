import type {
  MetamaskPaySolanaExecution,
  MetamaskPaySource,
} from '@metamask/transaction-controller';

import {
  getSolanaPaySupportDiagnostics,
  isSolanaPayLifecycleTransition,
} from './solana-pay-diagnostics.js';
import { getSolanaPayStatus } from './solana-pay.js';
import { SOLANA_SOURCE_EXPIRED_REASON } from './solana-transaction.js';

const SOLANA_CHAIN_ID = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';

const TOKEN_SOURCE: MetamaskPaySource = {
  sourceAccountId: `${SOLANA_CHAIN_ID}:private-account`,
  sourceAssetId: `${SOLANA_CHAIN_ID}/token:private-mint`,
};

const NATIVE_SOURCE: MetamaskPaySource = {
  ...TOKEN_SOURCE,
  sourceAssetId: `${SOLANA_CHAIN_ID}/slip44:501`,
};

function getExecution(
  overrides: Partial<MetamaskPaySolanaExecution> = {},
): MetamaskPaySolanaExecution {
  return {
    atomicProductActionIncluded: false,
    atomicProductActionRequired: false,
    followUpStatus: 'not-required',
    notificationStatus: 'not-ready',
    phase: 'attempting',
    relayStatus: 'not-observed',
    requestId: 'private-request-id',
    requiresNonAtomicFollowUp: false,
    sourceAmountRaw: '1000000',
    sourceChainId: SOLANA_CHAIN_ID,
    sourceStatus: 'not-observed',
    sourceWalletAccountId: 'private-wallet-account-id',
    targetChainId: '0xa4b1',
    targetTokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    ...overrides,
  } as MetamaskPaySolanaExecution;
}

function getDiagnostics(
  overrides: Partial<MetamaskPaySolanaExecution> = {},
  source: MetamaskPaySource = TOKEN_SOURCE,
): ReturnType<typeof getSolanaPaySupportDiagnostics> {
  const execution = getExecution(overrides);

  return getSolanaPaySupportDiagnostics(
    getSolanaPayStatus(execution),
    execution,
    source,
  );
}

describe('getSolanaPaySupportDiagnostics', () => {
  it.each([
    [{ phase: 'user-rejected' }, 'user_rejected'],
    [{ phase: 'not-submitted' }, 'preflight_failed'],
    [{ phase: 'unknown' }, 'submission_unknown'],
    [{ sourceStatus: 'failed' }, 'source_transaction_failed'],
    [
      {
        sourceFailureReason: 'Solana source transaction failed: {}',
        sourceStatus: 'failed',
      },
      'source_transaction_failed',
    ],
    [
      {
        sourceFailureReason: SOLANA_SOURCE_EXPIRED_REASON,
        sourceStatus: 'failed',
      },
      'source_transaction_expired',
    ],
    [{ sourceStatus: 'unknown' }, 'source_status_unknown'],
    [{ relayStatus: 'failure' }, 'settlement_failed'],
    [{ relayStatus: 'refund' }, 'settlement_refunded'],
    [{ relayStatus: 'unknown' }, 'settlement_status_unknown'],
    [{ followUpStatus: 'failed' }, 'follow_up_failed'],
    [{ followUpStatus: 'unknown' }, 'follow_up_status_unknown'],
    [{ followUpStatus: 'attempting' }, 'follow_up_status_unknown'],
    [
      {
        atomicProductActionIncluded: false,
        atomicProductActionRequired: true,
      },
      'construction_failed',
    ],
    [{ notificationStatus: 'failure' }, 'provider_notification_failed'],
  ] as const)('maps checkpoint %o to %s', (overrides, errorCode) => {
    expect(getDiagnostics(overrides).errorCode).toBe(errorCode);
  });

  it.each([
    [
      'a failed source over a Relay failure',
      { relayStatus: 'failure', sourceStatus: 'failed' },
      'source_transaction_failed',
    ],
    [
      'a failed follow-up over a failed notification',
      { followUpStatus: 'failed', notificationStatus: 'failure' },
      'follow_up_failed',
    ],
  ] as const)('prefers %s', (_title, overrides, errorCode) => {
    expect(getDiagnostics(overrides).errorCode).toBe(errorCode);
  });

  it('omits the error code for a healthy execution', () => {
    expect(getDiagnostics()).not.toHaveProperty('errorCode');
  });

  it('returns only categorical values and identifier-presence flags', () => {
    const diagnostics = getDiagnostics({
      followUpFailureReason: 'raw follow-up reason',
      followUpStatus: 'confirmed',
      followUpTransactionId: '0xprivate-follow-up',
      notificationStatus: 'success',
      phase: 'submitted',
      relayFailureReason: 'raw provider reason',
      relayStatus: 'success',
      sourceFailureReason: 'raw source reason',
      sourceStatus: 'confirmed',
      sourceTransactionId: 'private-signature',
      targetTransactionId: '0xprivate-target',
    });

    expect(diagnostics).toStrictEqual({
      followUpStatus: 'confirmed',
      followUpTransactionIdPresent: true,
      notificationStatus: 'success',
      outcome: 'succeeded',
      phase: 'submitted',
      provider: 'relay',
      relayStatus: 'success',
      sourceAssetClass: 'token',
      sourceStatus: 'confirmed',
      sourceTransactionIdPresent: true,
      targetTransactionIdPresent: true,
    });
    expect(JSON.stringify(diagnostics)).not.toMatch(/private|raw/u);
  });

  it('reports a missing source signature as absent', () => {
    expect(getDiagnostics()).toMatchObject({
      followUpTransactionIdPresent: false,
      sourceTransactionIdPresent: false,
      targetTransactionIdPresent: false,
    });
  });

  it('classifies native SOL without exposing its asset identifier', () => {
    const diagnostics = getDiagnostics({}, NATIVE_SOURCE);

    expect(diagnostics.sourceAssetClass).toBe('native');
    expect(JSON.stringify(diagnostics)).not.toContain('slip44');
  });

  it('omits the asset class when the transaction has no source', () => {
    const execution = getExecution();

    expect(
      getSolanaPaySupportDiagnostics(
        getSolanaPayStatus(execution),
        execution,
        undefined,
      ),
    ).not.toHaveProperty('sourceAssetClass');
  });
});

describe('isSolanaPayLifecycleTransition', () => {
  it('treats the first checkpoint as a transition', () => {
    expect(isSolanaPayLifecycleTransition(undefined, getDiagnostics())).toBe(
      true,
    );
  });

  it('ignores checkpoint changes that keep every categorical value', () => {
    expect(
      isSolanaPayLifecycleTransition(
        getDiagnostics({ lastValidBlockHeight: 1 }),
        getDiagnostics({ lastValidBlockHeight: 2 }),
      ),
    ).toBe(false);
  });

  it.each([
    ['phase', { phase: 'submitted', sourceTransactionId: 'signature' }],
    ['source', { sourceStatus: 'pending' }],
    ['Relay', { relayStatus: 'pending' }],
    ['notification', { notificationStatus: 'pending' }],
    ['follow-up', { followUpStatus: 'not-started' }],
    ['target identifier presence', { targetTransactionId: '0xtarget' }],
    ['error code', { notificationStatus: 'failure' }],
  ] as const)('detects a %s transition', (_title, overrides) => {
    expect(
      isSolanaPayLifecycleTransition(
        getDiagnostics(),
        getDiagnostics(overrides),
      ),
    ).toBe(true);
  });

  it('detects a source asset class transition', () => {
    expect(
      isSolanaPayLifecycleTransition(
        getDiagnostics(),
        getDiagnostics({}, NATIVE_SOURCE),
      ),
    ).toBe(true);
  });
});
