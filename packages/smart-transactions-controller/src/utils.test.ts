import { arrayify, hexlify } from '@ethersproject/bytes';
import { keccak256 } from '@ethersproject/keccak256';
import { ChainId, NetworkType } from '@metamask/controller-utils';
import {
  SentinelCancellationReason,
  SentinelMinedTxStatus,
  SentinelOriginalTransactionStatus,
} from '@metamask/sentinel-api-service';
import { TransactionStatus } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { describe, expect, it, vi } from 'vitest';

import { SmartTransactionStatuses, ClientId } from './types.js';
import * as utils from './utils.js';

const createSignedTransaction = () => {
  return '0xf86c098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a76400008025a02b79f322a625d623a2bb2911e0c6b3e7eaf741a7c7c5d2e8c67ef3ff4acf146ca01ae168fea63dc3391b75b586c8a7c0cb55cdf3b8e2e4d8e097957a3a56c6f2c5';
};

describe('src/utils.js', () => {
  describe('isSmartTransactionPending', () => {
    const createSmartTransaction = () => {
      return {
        uuid: 'sdfasfj345345dfgag45353',
        txHash:
          '0x3c3e7c5e09c250d2200bcc3530f4a9088d7e3fb4ea3f4fccfd09f535a3539e84',
        status: 'pending',
        statusMetadata: {
          error: undefined,
          minedTx: SentinelMinedTxStatus.NotMined,
          cancellationFeeWei: 10000,
          deadlineRatio: 10,
          minedHash: '',
          isSettled: true,
        },
      };
    };

    it('returns true is a smart transaction is not yet mined and there is no error', () => {
      const smartTransaction = createSmartTransaction();
      expect(utils.isSmartTransactionPending(smartTransaction)).toBe(true);
    });
  });

  describe('isSmartTransactionStatusResolved', () => {
    it('returns true if status response is "uuid_not_found"', () => {
      const statusResponse = 'uuid_not_found';
      expect(utils.isSmartTransactionStatusResolved(statusResponse)).toBe(true);
    });

    it('returns false if status response is not', () => {
      const statusResponse = {
        minedTx: SentinelMinedTxStatus.NotMined,
        cancellationReason: SentinelCancellationReason.NotCancelled,
        minedHash: '',
        cancellationFeeWei: 0.1,
        deadlineRatio: 0.1,
        isSettled: true,
      };
      expect(utils.isSmartTransactionStatusResolved(statusResponse)).toBe(
        false,
      );
    });
  });

  describe('calculateStatus', () => {
    const createStatusResponse = () => ({
      minedTx: SentinelMinedTxStatus.NotMined,
      cancellationReason: SentinelCancellationReason.NotCancelled,
      minedHash: '',
      cancellationFeeWei: 0.1,
      deadlineRatio: 0.1,
      isSettled: true,
    });

    it('returns pending if transaction is not mined and has no cancellationReason', () => {
      const statusResponse = createStatusResponse();
      expect(utils.calculateStatus(statusResponse)).toStrictEqual(
        SmartTransactionStatuses.PENDING,
      );
    });

    it('returns success if minedTx is success', () => {
      const statusResponse = {
        ...createStatusResponse(),
        minedTx: SentinelMinedTxStatus.Success,
      };
      expect(utils.calculateStatus(statusResponse)).toStrictEqual(
        SmartTransactionStatuses.SUCCESS,
      );
    });

    it('returns cancelled if minedTx is cancelled', () => {
      const statusResponse = {
        ...createStatusResponse(),
        minedTx: SentinelMinedTxStatus.Cancelled,
      };
      expect(utils.calculateStatus(statusResponse)).toStrictEqual(
        SmartTransactionStatuses.CANCELLED,
      );
    });

    it('returns reverted if minedTx is reverted', () => {
      const statusResponse = {
        ...createStatusResponse(),
        minedTx: SentinelMinedTxStatus.Reverted,
      };
      expect(utils.calculateStatus(statusResponse)).toStrictEqual(
        SmartTransactionStatuses.REVERTED,
      );
    });

    it('returns unknown if minedTx is not a known value', () => {
      const statusResponse = {
        ...createStatusResponse(),
        minedTx: 'unknown' as SentinelMinedTxStatus,
      };
      expect(utils.calculateStatus(statusResponse)).toStrictEqual(
        SmartTransactionStatuses.UNKNOWN,
      );
    });

    it('returns status "pending" if a tx was user cancelled, but is not settled yet', () => {
      const statusResponse = {
        ...createStatusResponse(),
        cancellationReason: SentinelCancellationReason.UserCancelled,
        isSettled: false,
      };
      expect(utils.calculateStatus(statusResponse)).toStrictEqual(
        SmartTransactionStatuses.PENDING,
      );
    });

    it('returns status "cancelled_user_cancelled" if the "user_cancelled" cancellationReason is provided', () => {
      const statusResponse = {
        ...createStatusResponse(),
        cancellationReason: SentinelCancellationReason.UserCancelled,
      };
      expect(utils.calculateStatus(statusResponse)).toStrictEqual(
        SmartTransactionStatuses.CANCELLED_USER_CANCELLED,
      );
    });

    it('returns status "cancelled" if the "would_revert" cancellationReason is provided', () => {
      const statusResponse = {
        ...createStatusResponse(),
        cancellationReason: SentinelCancellationReason.WouldRevert,
      };
      expect(utils.calculateStatus(statusResponse)).toStrictEqual(
        SmartTransactionStatuses.CANCELLED,
      );
    });

    it('returns status "cancelled" if the "too_cheap" cancellationReason is provided', () => {
      const statusResponse = {
        ...createStatusResponse(),
        cancellationReason: SentinelCancellationReason.TooCheap,
      };
      expect(utils.calculateStatus(statusResponse)).toStrictEqual(
        SmartTransactionStatuses.CANCELLED,
      );
    });

    it('returns status "cancelled" if the "deadline_missed" cancellationReason is provided', () => {
      const statusResponse = {
        ...createStatusResponse(),
        cancellationReason: SentinelCancellationReason.DeadlineMissed,
      };
      expect(utils.calculateStatus(statusResponse)).toStrictEqual(
        SmartTransactionStatuses.CANCELLED,
      );
    });

    it('returns status "cancelled" if the "invalid_nonce" cancellationReason is provided', () => {
      const statusResponse = {
        ...createStatusResponse(),
        cancellationReason: SentinelCancellationReason.InvalidNonce,
      };
      expect(utils.calculateStatus(statusResponse)).toStrictEqual(
        SmartTransactionStatuses.CANCELLED,
      );
    });

    it('returns status "pending" if the "not_cancelled" cancellationReason is provided', () => {
      const statusResponse = {
        ...createStatusResponse(),
        cancellationReason: SentinelCancellationReason.NotCancelled,
      };
      expect(utils.calculateStatus(statusResponse)).toStrictEqual(
        SmartTransactionStatuses.PENDING,
      );
    });
  });

  describe('getStxProcessingTime', () => {
    it('returns undefined if no smartTransactionTimeSubmitted', () => {
      expect(utils.getStxProcessingTime(undefined)).toBeUndefined();
    });

    it('returns 2m and 57s if processing time is 3s ago', () => {
      const THREE_SECONDS_AGO = 3 * 1000;
      const processingTime = utils.getStxProcessingTime(
        Date.now() - THREE_SECONDS_AGO,
      );
      expect(processingTime).toBe(3);
    });
  });

  describe('isSmartTransactionCancellable', () => {
    const createStxStatus = (customProps = {}) => {
      return {
        error: undefined,
        minedTx: SentinelMinedTxStatus.NotMined,
        cancellationFeeWei: 10000,
        cancellationReason: SentinelCancellationReason.NotCancelled,
        deadlineRatio: 10,
        minedHash: '',
        isSettled: true,
        ...customProps,
      };
    };

    it('returns true if minedTx is NOT_MINED and cancellationReason is NOT_CANCELLED', () => {
      const stxStatus = createStxStatus();
      expect(utils.isSmartTransactionCancellable(stxStatus)).toBe(true);
    });

    it('returns true if minedTx is NOT_MINED and cancellationReason is undefined', () => {
      const stxStatus = createStxStatus({
        cancellationReason: undefined,
      });
      expect(utils.isSmartTransactionCancellable(stxStatus)).toBe(true);
    });

    it('returns false if minedTx is NOT_MINED and cancellationReason is USER_CANCELLED', () => {
      const stxStatus = createStxStatus({
        cancellationReason: SentinelCancellationReason.UserCancelled,
      });
      expect(utils.isSmartTransactionCancellable(stxStatus)).toBe(false);
    });

    it('returns false if minedTx is CANCELLED and cancellationReason is NOT_CANCELLED', () => {
      const stxStatus = createStxStatus({
        minedTx: SentinelMinedTxStatus.Cancelled,
      });
      expect(utils.isSmartTransactionCancellable(stxStatus)).toBe(false);
    });
  });

  describe('incrementNonceInHex', () => {
    it('returns "0x57" if we pass "0x56"', () => {
      const incrementedNonce = utils.incrementNonceInHex('0x56');
      expect(incrementedNonce).toBe('0x57');
    });
  });

  describe('getTxHash', () => {
    it('returns a transaction hash from a signed transaction', () => {
      const expectedTxHash =
        '0x0302b75dfb9fd9eb34056af031efcaee2a8cbd799ea054a85966165cd82a7356';
      const txHash = utils.getTxHash(createSignedTransaction());
      expect(txHash).toBe(expectedTxHash);
    });

    it('returns an empty string if there is no signed transaction', () => {
      const expectedTxHash = '';
      const txHash = utils.getTxHash('');
      expect(txHash).toBe(expectedTxHash);
    });

    it('throws an error with an incorrect signed transaction', () => {
      expect(() => {
        utils.getTxHash('0x0302b75dfb9fd9eb34056af0');
      }).toThrow('unsupported transaction type: 3');
    });

    it('computes hash for type 4 transaction', () => {
      const type4TxHex = '0x04010203040506070809';
      const expectedHash = hexlify(keccak256(arrayify(type4TxHex)));
      const txHash = utils.getTxHash(type4TxHex);
      expect(txHash).toBe(expectedHash);
    });
  });

  describe('getReturnTxHashAsap', () => {
    it('returns extensionReturnTxHashAsap value for Extension client', () => {
      const result = utils.getReturnTxHashAsap(ClientId.Extension, {
        extensionReturnTxHashAsap: true,
        mobileReturnTxHashAsap: false,
      });
      expect(result).toBe(true);
    });

    it('returns mobileReturnTxHashAsap value for Mobile client', () => {
      const result = utils.getReturnTxHashAsap(ClientId.Mobile, {
        extensionReturnTxHashAsap: false,
        mobileReturnTxHashAsap: true,
      });
      expect(result).toBe(true);
    });
  });

  describe('shouldMarkRegularTransactionsAsFailed', () => {
    const createSmartTransaction = (status: SmartTransactionStatuses) => ({
      uuid: 'test-uuid',
      status,
      transactionId: '123',
      time: 12345,
      statusMetadata: {
        cancellationFeeWei: 0,
        deadlineRatio: 0,
        minedHash: '',
        minedTx: SentinelMinedTxStatus.NotMined,
        isSettled: false,
      },
    });

    const createFeatureFlags = (returnTxHashAsap = true) => ({
      extensionReturnTxHashAsap: returnTxHashAsap,
      mobileReturnTxHashAsap: returnTxHashAsap,
    });

    it('returns true for "cancelled" status when feature flag is enabled', () => {
      const result = utils.shouldMarkRegularTransactionsAsFailed({
        smartTransaction: createSmartTransaction(
          SmartTransactionStatuses.CANCELLED,
        ),
        clientId: ClientId.Extension,
        featureFlags: createFeatureFlags(true),
      });
      expect(result).toBe(true);
    });

    it('returns true for "cancelled_user_cancelled" status when feature flag is enabled', () => {
      const result = utils.shouldMarkRegularTransactionsAsFailed({
        smartTransaction: createSmartTransaction(
          SmartTransactionStatuses.CANCELLED_USER_CANCELLED,
        ),
        clientId: ClientId.Extension,
        featureFlags: createFeatureFlags(true),
      });
      expect(result).toBe(true);
    });

    it('returns true for "unknown" status when feature flag is enabled', () => {
      const result = utils.shouldMarkRegularTransactionsAsFailed({
        smartTransaction: createSmartTransaction(
          SmartTransactionStatuses.UNKNOWN,
        ),
        clientId: ClientId.Extension,
        featureFlags: createFeatureFlags(true),
      });
      expect(result).toBe(true);
    });

    it('returns true for "resolved" status when feature flag is enabled', () => {
      const result = utils.shouldMarkRegularTransactionsAsFailed({
        smartTransaction: createSmartTransaction(
          SmartTransactionStatuses.RESOLVED,
        ),
        clientId: ClientId.Extension,
        featureFlags: createFeatureFlags(true),
      });
      expect(result).toBe(true);
    });

    it('returns false for "pending" status when feature flag is enabled', () => {
      const result = utils.shouldMarkRegularTransactionsAsFailed({
        smartTransaction: createSmartTransaction(
          SmartTransactionStatuses.PENDING,
        ),
        clientId: ClientId.Extension,
        featureFlags: createFeatureFlags(true),
      });
      expect(result).toBe(false);
    });

    it('returns false for "success" status when feature flag is enabled', () => {
      const result = utils.shouldMarkRegularTransactionsAsFailed({
        smartTransaction: createSmartTransaction(
          SmartTransactionStatuses.SUCCESS,
        ),
        clientId: ClientId.Extension,
        featureFlags: createFeatureFlags(true),
      });
      expect(result).toBe(false);
    });

    it('returns false when feature flag is disabled regardless of status', () => {
      const result = utils.shouldMarkRegularTransactionsAsFailed({
        smartTransaction: createSmartTransaction(
          SmartTransactionStatuses.CANCELLED,
        ),
        clientId: ClientId.Extension,
        featureFlags: createFeatureFlags(false),
      });
      expect(result).toBe(false);
    });

    it('returns false when transactionId is missing', () => {
      const smartTransaction = {
        ...createSmartTransaction(SmartTransactionStatuses.CANCELLED),
        transactionId: undefined,
      };
      const result = utils.shouldMarkRegularTransactionsAsFailed({
        smartTransaction,
        clientId: ClientId.Extension,
        featureFlags: createFeatureFlags(true),
      });
      expect(result).toBe(false);
    });

    it('returns true for mobile client when mobile feature flag is enabled', () => {
      const result = utils.shouldMarkRegularTransactionsAsFailed({
        smartTransaction: createSmartTransaction(
          SmartTransactionStatuses.CANCELLED,
        ),
        clientId: ClientId.Mobile,
        featureFlags: createFeatureFlags(true),
      });
      expect(result).toBe(true);
    });
  });

  describe('markRegularTransactionsAsFailed', () => {
    const createSmartTransaction = (status: SmartTransactionStatuses) => ({
      uuid: 'test-uuid',
      status,
      transactionId: '123',
      time: 12345,
      statusMetadata: {
        cancellationFeeWei: 0,
        deadlineRatio: 0,
        minedHash: '',
        minedTx: SentinelMinedTxStatus.NotMined,
        isSettled: false,
      },
    });

    const mockTransaction: TransactionMeta = {
      chainId: ChainId.mainnet,
      id: '123',
      origin: 'test1.com',
      status: TransactionStatus.submitted,
      time: 1631714313,
      txParams: {
        from: '0x6',
      },
      hash: '0x7',
      rawTx: '0x8',
      networkClientId: NetworkType.mainnet,
    };

    it('fails the transaction with a SmartTransactionFailed error', () => {
      const failTransactionMock = vi.fn();

      utils.markRegularTransactionsAsFailed({
        smartTransaction: createSmartTransaction(
          SmartTransactionStatuses.CANCELLED,
        ),
        getRegularTransactions: () => [mockTransaction],
        failTransaction: failTransactionMock,
      });

      expect(failTransactionMock).toHaveBeenCalledWith(
        '123',
        expect.objectContaining({
          name: 'SmartTransactionFailed',
          message: 'Smart transaction failed with status: cancelled',
        }),
      );
    });

    it('includes originalTransactionStatus in error message when available', () => {
      const failTransactionMock = vi.fn();
      const smartTransaction = {
        ...createSmartTransaction(SmartTransactionStatuses.CANCELLED),
        statusMetadata: {
          cancellationFeeWei: 0,
          deadlineRatio: 0,
          minedHash: '',
          minedTx: SentinelMinedTxStatus.NotMined,
          isSettled: false,
          originalTransactionStatus:
            SentinelOriginalTransactionStatus.FailedWouldRevert,
        },
      };

      utils.markRegularTransactionsAsFailed({
        smartTransaction,
        getRegularTransactions: () => [mockTransaction],
        failTransaction: failTransactionMock,
      });

      expect(failTransactionMock).toHaveBeenCalledWith(
        '123',
        expect.objectContaining({
          name: 'SmartTransactionFailed',
          message:
            'Smart transaction failed with status: cancelled, originalTransactionStatus: FAILED_WOULD_REVERT',
        }),
      );
    });

    it('throws error if original transaction cannot be found', () => {
      const failTransactionMock = vi.fn();
      const getRegularTransactionsMock = vi.fn(() => []);

      expect(() =>
        utils.markRegularTransactionsAsFailed({
          smartTransaction: createSmartTransaction(
            SmartTransactionStatuses.CANCELLED,
          ),
          getRegularTransactions: getRegularTransactionsMock,
          failTransaction: failTransactionMock,
        }),
      ).toThrow('Cannot find regular transaction to mark it as failed');

      expect(failTransactionMock).not.toHaveBeenCalled();
    });

    it('does not fail the transaction if status is already failed', () => {
      const failTransactionMock = vi.fn();
      const failedTransaction = {
        ...mockTransaction,
        status: TransactionStatus.failed,
        error: {
          name: 'SmartTransactionFailed',
          message: 'Smart transaction failed',
        },
      };

      utils.markRegularTransactionsAsFailed({
        smartTransaction: createSmartTransaction(
          SmartTransactionStatuses.CANCELLED,
        ),
        getRegularTransactions: () => [failedTransaction],
        failTransaction: failTransactionMock,
      });

      expect(failTransactionMock).not.toHaveBeenCalled();
    });

    it('fails multiple transactions when txHashes match', () => {
      const failTransactionMock = vi.fn();
      const transaction1: TransactionMeta = {
        ...mockTransaction,
        id: '456',
        hash: '0xhash1',
      };
      const transaction2: TransactionMeta = {
        ...mockTransaction,
        id: '789',
        hash: '0xhash2',
      };
      const smartTransaction = {
        ...createSmartTransaction(SmartTransactionStatuses.CANCELLED),
        txHashes: ['0xhash1', '0xhash2'],
      };

      utils.markRegularTransactionsAsFailed({
        smartTransaction,
        getRegularTransactions: () => [transaction1, transaction2],
        failTransaction: failTransactionMock,
      });

      expect(failTransactionMock).toHaveBeenCalledTimes(2);
      expect(failTransactionMock).toHaveBeenCalledWith(
        '456',
        expect.objectContaining({
          name: 'SmartTransactionFailed',
          message: 'Smart transaction failed with status: cancelled',
        }),
      );
      expect(failTransactionMock).toHaveBeenCalledWith(
        '789',
        expect.objectContaining({
          name: 'SmartTransactionFailed',
          message: 'Smart transaction failed with status: cancelled',
        }),
      );
    });
  });

  describe('getSmartTransactionMetricsProperties', () => {
    it('includes stx_original_transaction_status from statusMetadata', () => {
      const smartTransaction = {
        uuid: 'test-uuid',
        status: SmartTransactionStatuses.SUCCESS,
        time: Date.now(),
        statusMetadata: {
          cancellationFeeWei: 0,
          deadlineRatio: 0.5,
          minedHash: '0xabc',
          minedTx: SentinelMinedTxStatus.Success,
          isSettled: true,
          duplicated: false,
          timedOut: false,
          proxied: false,
          originalTransactionStatus:
            SentinelOriginalTransactionStatus.Validated,
        },
      };

      const result =
        utils.getSmartTransactionMetricsProperties(smartTransaction);

      expect(result).toStrictEqual(
        expect.objectContaining({
          stx_original_transaction_status:
            SentinelOriginalTransactionStatus.Validated,
          stx_duplicated: false,
          stx_timed_out: false,
          stx_proxied: false,
        }),
      );
    });

    it('returns undefined for stx_original_transaction_status when not in statusMetadata', () => {
      const smartTransaction = {
        uuid: 'test-uuid',
        status: SmartTransactionStatuses.PENDING,
        time: Date.now(),
        statusMetadata: {
          cancellationFeeWei: 0,
          deadlineRatio: 0,
          minedHash: '',
          minedTx: SentinelMinedTxStatus.NotMined,
          isSettled: false,
        },
      };

      const result =
        utils.getSmartTransactionMetricsProperties(smartTransaction);

      expect(result.stx_original_transaction_status).toBeUndefined();
    });
  });

  describe('getErrorData', () => {
    it('returns data.error from a thrown fetch error object', () => {
      const error = Object.assign({}, new Error('Fetch error: 400'), {
        data: { error: 'too_cheap' },
      });

      expect(error instanceof Error).toBe(false);
      expect(utils.getErrorData(error)).toBe('too_cheap');
    });

    it('returns data.error object from a thrown fetch error object', () => {
      const error = Object.assign({}, new Error('Fetch error: 400'), {
        data: { error: { message: 'too_cheap' } },
      });

      expect(error instanceof Error).toBe(false);
      expect(utils.getErrorData(error)).toBe(
        '{"error":{"message":"too_cheap"}}',
      );
    });

    it('returns error.message for a real Error', () => {
      expect(utils.getErrorData(new Error('boom'))).toBe('boom');
    });
  });
});
