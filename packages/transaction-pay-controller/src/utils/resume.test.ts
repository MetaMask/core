import {
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDefaultRemoteFeatureFlagControllerState } from '../../../remote-feature-flag-controller/src/remote-feature-flag-controller.js';
import { getMessengerMock } from '../../tests/messenger-mock.js';
import { TransactionPayStrategy } from '../constants.js';
import { isPayTransactionResumable } from './resume.js';
import { getStrategyByName } from './strategy.js';

vi.mock(import('./strategy.js'));

const TRANSACTION_ID_MOCK = 'transaction-id';
const RESUME_ENABLED_FEATURE_FLAGS_MOCK = {
  confirmations_pay_extended: {
    resume: {
      [TransactionPayStrategy.Fiat]: [TransactionType.predictDeposit],
    },
  },
};

function getTransactionMock(
  overrides: Partial<TransactionMeta> = {},
): TransactionMeta {
  return {
    id: TRANSACTION_ID_MOCK,
    chainId: '0x1',
    metamaskPay: { strategy: TransactionPayStrategy.Fiat },
    status: TransactionStatus.approved,
    time: 0,
    txParams: {},
    type: TransactionType.predictDeposit,
    ...overrides,
  } as TransactionMeta;
}

describe('isPayTransactionResumable', () => {
  const getStrategyByNameMock = vi.mocked(getStrategyByName);
  const { messenger, getRemoteFeatureFlagControllerStateMock } =
    getMessengerMock();

  beforeEach(() => {
    vi.resetAllMocks();
    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      ...getDefaultRemoteFeatureFlagControllerState(),
      remoteFeatureFlags: RESUME_ENABLED_FEATURE_FLAGS_MOCK,
    });
    getStrategyByNameMock.mockReturnValue({
      canResume: vi.fn().mockReturnValue(true),
      execute: vi.fn(),
      getQuotes: vi.fn(),
    });
  });

  it('returns true when the flag enables the pay type and strategy can resume', () => {
    expect(isPayTransactionResumable(messenger, getTransactionMock())).toBe(
      true,
    );
  });

  it('returns false when resume flags are empty', () => {
    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      ...getDefaultRemoteFeatureFlagControllerState(),
    });

    expect(isPayTransactionResumable(messenger, getTransactionMock())).toBe(
      false,
    );
  });

  it('returns false when the strategy key is not enabled', () => {
    getRemoteFeatureFlagControllerStateMock.mockReturnValue({
      ...getDefaultRemoteFeatureFlagControllerState(),
      remoteFeatureFlags: {
        confirmations_pay_extended: {
          resume: {
            [TransactionPayStrategy.Relay]: [TransactionType.predictDeposit],
          },
        },
      },
    });

    expect(isPayTransactionResumable(messenger, getTransactionMock())).toBe(
      false,
    );
  });

  it('returns false when canResume is undefined', () => {
    getStrategyByNameMock.mockReturnValue({
      execute: vi.fn(),
      getQuotes: vi.fn(),
    });

    expect(isPayTransactionResumable(messenger, getTransactionMock())).toBe(
      false,
    );
  });

  it('returns false when canResume returns false', () => {
    getStrategyByNameMock.mockReturnValue({
      canResume: vi.fn().mockReturnValue(false),
      execute: vi.fn(),
      getQuotes: vi.fn(),
    });

    expect(isPayTransactionResumable(messenger, getTransactionMock())).toBe(
      false,
    );
  });

  it('returns false when resume was already attempted', () => {
    expect(
      isPayTransactionResumable(
        messenger,
        getTransactionMock({
          metamaskPay: {
            resumeAttemptedAt: 123,
            strategy: TransactionPayStrategy.Fiat,
          },
        }),
      ),
    ).toBe(false);
  });

  it('returns false when metamaskPay is missing', () => {
    expect(
      isPayTransactionResumable(
        messenger,
        getTransactionMock({ metamaskPay: undefined }),
      ),
    ).toBe(false);
  });

  it('returns false when strategy is none', () => {
    expect(
      isPayTransactionResumable(
        messenger,
        getTransactionMock({
          metamaskPay: { strategy: TransactionPayStrategy.None },
        }),
      ),
    ).toBe(false);
  });

  it('returns false when status is submitted', () => {
    expect(
      isPayTransactionResumable(
        messenger,
        getTransactionMock({ status: TransactionStatus.submitted }),
      ),
    ).toBe(false);
  });

  it('returns false when a check throws', () => {
    getStrategyByNameMock.mockImplementation(() => {
      throw new Error('boom');
    });

    expect(isPayTransactionResumable(messenger, getTransactionMock())).toBe(
      false,
    );
  });

  it('uses the first pay-specific nested type for batch transactions', () => {
    expect(
      isPayTransactionResumable(
        messenger,
        getTransactionMock({
          nestedTransactions: [
            { type: TransactionType.tokenMethodApprove },
            { type: TransactionType.predictDeposit },
          ],
          type: TransactionType.batch,
        }),
      ),
    ).toBe(true);
  });
});
