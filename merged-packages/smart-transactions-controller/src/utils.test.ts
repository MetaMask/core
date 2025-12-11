import { arrayify, hexlify } from '@ethersproject/bytes';
import { keccak256 } from '@ethersproject/keccak256';
import { ChainId, NetworkType } from '@metamask/controller-utils';
import {
  type TransactionMeta,
  TransactionStatus,
} from '@metamask/transaction-controller';

import packageJson from '../package.json';
import { API_BASE_URL, SENTINEL_API_BASE_URL_MAP } from './constants';
import {
  SmartTransactionMinedTx,
  APIType,
  SmartTransactionStatuses,
  SmartTransactionCancellationReason,
  ClientId,
} from './types';
import * as utils from './utils';

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
          minedTx: SmartTransactionMinedTx.NOT_MINED,
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

  describe('getAPIRequestURL', () => {
    const ethereumChainIdDec = parseInt(ChainId.mainnet, 16);
    const ethSepoliaChainIdDec = parseInt(ChainId.sepolia, 16);

    it('returns a URL for getting transactions', () => {
      expect(utils.getAPIRequestURL(APIType.GET_FEES, ChainId.mainnet)).toBe(
        `${API_BASE_URL}/networks/${ethereumChainIdDec}/getFees`,
      );
    });

    it('returns correct URL for ESTIMATE_GAS', () => {
      const chainId = '0x1'; // Mainnet in hex
      const expectedUrl = `${API_BASE_URL}/networks/1/estimateGas`;
      const result = utils.getAPIRequestURL(APIType.ESTIMATE_GAS, chainId);
      expect(result).toBe(expectedUrl);
    });

    it('converts hex chainId to decimal for ESTIMATE_GAS', () => {
      const chainId = '0x89'; // Polygon in hex (137 in decimal)
      const expectedUrl = `${API_BASE_URL}/networks/137/estimateGas`;
      const result = utils.getAPIRequestURL(APIType.ESTIMATE_GAS, chainId);
      expect(result).toBe(expectedUrl);
    });

    it('returns a URL for submitting transactions', () => {
      expect(
        utils.getAPIRequestURL(APIType.SUBMIT_TRANSACTIONS, ChainId.mainnet),
      ).toBe(
        `${API_BASE_URL}/networks/${ethereumChainIdDec}/submitTransactions?stxControllerVersion=${packageJson.version}`,
      );
    });

    it('returns a URL for transaction cancelation', () => {
      expect(utils.getAPIRequestURL(APIType.CANCEL, ChainId.mainnet)).toBe(
        `${API_BASE_URL}/networks/${ethereumChainIdDec}/cancel`,
      );
    });

    it('returns a URL for checking a smart transactions status', () => {
      expect(
        utils.getAPIRequestURL(APIType.BATCH_STATUS, ChainId.mainnet),
      ).toBe(`${API_BASE_URL}/networks/${ethereumChainIdDec}/batchStatus`);
    });

    it('returns a URL for smart transactions API liveness on ETH Mainnet', () => {
      expect(utils.getAPIRequestURL(APIType.LIVENESS, ChainId.mainnet)).toBe(
        `${SENTINEL_API_BASE_URL_MAP[ethereumChainIdDec]}/network`,
      );
    });

    it('returns a URL for smart transactions API liveness on ETH Sepolia', () => {
      expect(utils.getAPIRequestURL(APIType.LIVENESS, ChainId.sepolia)).toBe(
        `${SENTINEL_API_BASE_URL_MAP[ethSepoliaChainIdDec]}/network`,
      );
    });

    it('returns a URL for smart transactions API liveness on BSC', () => {
      const bscChainIdHex = '0x38';
      const bscChainIdDec = parseInt(bscChainIdHex, 16);
      expect(utils.getAPIRequestURL(APIType.LIVENESS, bscChainIdHex)).toBe(
        `${SENTINEL_API_BASE_URL_MAP[bscChainIdDec]}/network`,
      );
    });

    it('returns a URL for smart transactions API liveness on Base', () => {
      const baseChainIdHex = '0x2105';
      const baseChainIdDec = parseInt(baseChainIdHex, 16);
      expect(utils.getAPIRequestURL(APIType.LIVENESS, baseChainIdHex)).toBe(
        `${SENTINEL_API_BASE_URL_MAP[baseChainIdDec]}/network`,
      );
    });
  });

  describe('isSmartTransactionStatusResolved', () => {
    it('returns true if status response is "uuid_not_found"', () => {
      const statusResponse = 'uuid_not_found';
      expect(utils.isSmartTransactionStatusResolved(statusResponse)).toBe(true);
    });

    it('returns false if status response is not', () => {
      const statusResponse = {
        minedTx: SmartTransactionMinedTx.NOT_MINED,
        cancellationReason: SmartTransactionCancellationReason.NOT_CANCELLED,
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
      minedTx: SmartTransactionMinedTx.NOT_MINED,
      cancellationReason: SmartTransactionCancellationReason.NOT_CANCELLED,
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
        minedTx: SmartTransactionMinedTx.SUCCESS,
      };
      expect(utils.calculateStatus(statusResponse)).toStrictEqual(
        SmartTransactionStatuses.SUCCESS,
      );
    });

    it('returns cancelled if minedTx is cancelled', () => {
      const statusResponse = {
        ...createStatusResponse(),
        minedTx: SmartTransactionMinedTx.CANCELLED,
      };
      expect(utils.calculateStatus(statusResponse)).toStrictEqual(
        SmartTransactionStatuses.CANCELLED,
      );
    });

    it('returns reverted if minedTx is reverted', () => {
      const statusResponse = {
        ...createStatusResponse(),
        minedTx: SmartTransactionMinedTx.REVERTED,
      };
      expect(utils.calculateStatus(statusResponse)).toStrictEqual(
        SmartTransactionStatuses.REVERTED,
      );
    });

    it('returns unknown if minedTx is unknown', () => {
      const statusResponse = {
        ...createStatusResponse(),
        minedTx: SmartTransactionMinedTx.UNKNOWN,
      };
      expect(utils.calculateStatus(statusResponse)).toStrictEqual(
        SmartTransactionStatuses.UNKNOWN,
      );
    });

    it('returns status "pending" if a tx was user cancelled, but is not settled yet', () => {
      const statusResponse = {
        ...createStatusResponse(),
        cancellationReason: SmartTransactionCancellationReason.USER_CANCELLED,
        isSettled: false,
      };
      expect(utils.calculateStatus(statusResponse)).toStrictEqual(
        SmartTransactionStatuses.PENDING,
      );
    });

    it('returns status "cancelled_user_cancelled" if the "user_cancelled" cancellationReason is provided', () => {
      const statusResponse = {
        ...createStatusResponse(),
        cancellationReason: SmartTransactionCancellationReason.USER_CANCELLED,
      };
      expect(utils.calculateStatus(statusResponse)).toStrictEqual(
        SmartTransactionStatuses.CANCELLED_USER_CANCELLED,
      );
    });

    it('returns status "cancelled" if the "would_revert" cancellationReason is provided', () => {
      const statusResponse = {
        ...createStatusResponse(),
        cancellationReason: SmartTransactionCancellationReason.WOULD_REVERT,
      };
      expect(utils.calculateStatus(statusResponse)).toStrictEqual(
        SmartTransactionStatuses.CANCELLED,
      );
    });

    it('returns status "cancelled" if the "too_cheap" cancellationReason is provided', () => {
      const statusResponse = {
        ...createStatusResponse(),
        cancellationReason: SmartTransactionCancellationReason.TOO_CHEAP,
      };
      expect(utils.calculateStatus(statusResponse)).toStrictEqual(
        SmartTransactionStatuses.CANCELLED,
      );
    });

    it('returns status "cancelled" if the "deadline_missed" cancellationReason is provided', () => {
      const statusResponse = {
        ...createStatusResponse(),
        cancellationReason: SmartTransactionCancellationReason.DEADLINE_MISSED,
      };
      expect(utils.calculateStatus(statusResponse)).toStrictEqual(
        SmartTransactionStatuses.CANCELLED,
      );
    });

    it('returns status "cancelled" if the "invalid_nonce" cancellationReason is provided', () => {
      const statusResponse = {
        ...createStatusResponse(),
        cancellationReason: SmartTransactionCancellationReason.INVALID_NONCE,
      };
      expect(utils.calculateStatus(statusResponse)).toStrictEqual(
        SmartTransactionStatuses.CANCELLED,
      );
    });

    it('returns status "pending" if the "not_cancelled" cancellationReason is provided', () => {
      const statusResponse = {
        ...createStatusResponse(),
        cancellationReason: SmartTransactionCancellationReason.NOT_CANCELLED,
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
        minedTx: SmartTransactionMinedTx.NOT_MINED,
        cancellationFeeWei: 10000,
        cancellationReason: SmartTransactionCancellationReason.NOT_CANCELLED,
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
        cancellationReason: SmartTransactionCancellationReason.USER_CANCELLED,
      });
      expect(utils.isSmartTransactionCancellable(stxStatus)).toBe(false);
    });

    it('returns false if minedTx is CANCELLED and cancellationReason is NOT_CANCELLED', () => {
      const stxStatus = createStxStatus({
        minedTx: SmartTransactionMinedTx.CANCELLED,
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

  describe('mapKeysToCamel', () => {
    it('returns keys and nested keys in camelCase', () => {
      const errResponse = {
        error_props: {
          balance_needed_wei: 235105211121513150,
          current_balance_wei: 230652394534126820,
        },
        error: 'not_enough_funds',
        error_details:
          'Not enough funds. Balance is only 230652394534126801 wei and we need 235105211121513136 wei at the very least.',
      };
      const errResponseCamelCase = utils.mapKeysToCamel(errResponse);
      expect(errResponseCamelCase.errorProps.balanceNeededWei).toStrictEqual(
        errResponse.error_props.balance_needed_wei,
      );

      expect(errResponseCamelCase.errorProps.currentBalanceWei).toStrictEqual(
        errResponse.error_props.current_balance_wei,
      );

      expect(errResponseCamelCase.errorDetails).toStrictEqual(
        errResponse.error_details,
      );
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
        minedTx: SmartTransactionMinedTx.NOT_MINED,
        isSettled: false,
      },
    });

    const mockGetFeatureFlags =
      (returnTxHashAsap = true) =>
      () => ({
        smartTransactions: {
          extensionReturnTxHashAsap: returnTxHashAsap,
          mobileReturnTxHashAsap: returnTxHashAsap,
        },
      });

    it('returns true for "cancelled" status when feature flag is enabled', () => {
      const result = utils.shouldMarkRegularTransactionsAsFailed({
        smartTransaction: createSmartTransaction(
          SmartTransactionStatuses.CANCELLED,
        ),
        clientId: ClientId.Extension,
        getFeatureFlags: mockGetFeatureFlags(true),
      });
      expect(result).toBe(true);
    });

    it('returns true for "cancelled_user_cancelled" status when feature flag is enabled', () => {
      const result = utils.shouldMarkRegularTransactionsAsFailed({
        smartTransaction: createSmartTransaction(
          SmartTransactionStatuses.CANCELLED_USER_CANCELLED,
        ),
        clientId: ClientId.Extension,
        getFeatureFlags: mockGetFeatureFlags(true),
      });
      expect(result).toBe(true);
    });

    it('returns true for "unknown" status when feature flag is enabled', () => {
      const result = utils.shouldMarkRegularTransactionsAsFailed({
        smartTransaction: createSmartTransaction(
          SmartTransactionStatuses.UNKNOWN,
        ),
        clientId: ClientId.Extension,
        getFeatureFlags: mockGetFeatureFlags(true),
      });
      expect(result).toBe(true);
    });

    it('returns true for "resolved" status when feature flag is enabled', () => {
      const result = utils.shouldMarkRegularTransactionsAsFailed({
        smartTransaction: createSmartTransaction(
          SmartTransactionStatuses.RESOLVED,
        ),
        clientId: ClientId.Extension,
        getFeatureFlags: mockGetFeatureFlags(true),
      });
      expect(result).toBe(true);
    });

    it('returns false for "pending" status when feature flag is enabled', () => {
      const result = utils.shouldMarkRegularTransactionsAsFailed({
        smartTransaction: createSmartTransaction(
          SmartTransactionStatuses.PENDING,
        ),
        clientId: ClientId.Extension,
        getFeatureFlags: mockGetFeatureFlags(true),
      });
      expect(result).toBe(false);
    });

    it('returns false for "success" status when feature flag is enabled', () => {
      const result = utils.shouldMarkRegularTransactionsAsFailed({
        smartTransaction: createSmartTransaction(
          SmartTransactionStatuses.SUCCESS,
        ),
        clientId: ClientId.Extension,
        getFeatureFlags: mockGetFeatureFlags(true),
      });
      expect(result).toBe(false);
    });

    it('returns false when feature flag is disabled regardless of status', () => {
      const result = utils.shouldMarkRegularTransactionsAsFailed({
        smartTransaction: createSmartTransaction(
          SmartTransactionStatuses.CANCELLED,
        ),
        clientId: ClientId.Extension,
        getFeatureFlags: mockGetFeatureFlags(false),
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
        getFeatureFlags: mockGetFeatureFlags(true),
      });
      expect(result).toBe(false);
    });

    it('returns true for mobile client when mobile feature flag is enabled', () => {
      const result = utils.shouldMarkRegularTransactionsAsFailed({
        smartTransaction: createSmartTransaction(
          SmartTransactionStatuses.CANCELLED,
        ),
        clientId: ClientId.Mobile,
        getFeatureFlags: mockGetFeatureFlags(true),
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
        minedTx: SmartTransactionMinedTx.NOT_MINED,
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

    it('updates transaction with failed status and error message', () => {
      const updateTransactionMock = jest.fn();

      utils.markRegularTransactionsAsFailed({
        smartTransaction: createSmartTransaction(
          SmartTransactionStatuses.CANCELLED,
        ),
        getRegularTransactions: () => [mockTransaction],
        updateTransaction: updateTransactionMock,
      });

      expect(updateTransactionMock).toHaveBeenCalledWith(
        {
          ...mockTransaction,
          status: TransactionStatus.failed,
          error: {
            name: 'SmartTransactionFailed',
            message: 'Smart transaction failed with status: cancelled',
          },
        },
        'Smart transaction status: cancelled',
      );
    });

    it('throws error if original transaction cannot be found', () => {
      const updateTransactionMock = jest.fn();
      const getRegularTransactionsMock = jest.fn(() => []);

      expect(() =>
        utils.markRegularTransactionsAsFailed({
          smartTransaction: createSmartTransaction(
            SmartTransactionStatuses.CANCELLED,
          ),
          getRegularTransactions: getRegularTransactionsMock,
          updateTransaction: updateTransactionMock,
        }),
      ).toThrow('Cannot find regular transaction to mark it as failed');

      expect(updateTransactionMock).not.toHaveBeenCalled();
    });

    it('does not update transaction if status is already failed', () => {
      const updateTransactionMock = jest.fn();
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
        updateTransaction: updateTransactionMock,
      });

      expect(updateTransactionMock).not.toHaveBeenCalled();
    });

    it('marks multiple transactions as failed when txHashes match', () => {
      const updateTransactionMock = jest.fn();
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
        updateTransaction: updateTransactionMock,
      });

      expect(updateTransactionMock).toHaveBeenCalledTimes(2);
      expect(updateTransactionMock).toHaveBeenCalledWith(
        {
          ...transaction1,
          status: TransactionStatus.failed,
          error: {
            name: 'SmartTransactionFailed',
            message: 'Smart transaction failed with status: cancelled',
          },
        },
        'Smart transaction status: cancelled',
      );
      expect(updateTransactionMock).toHaveBeenCalledWith(
        {
          ...transaction2,
          status: TransactionStatus.failed,
          error: {
            name: 'SmartTransactionFailed',
            message: 'Smart transaction failed with status: cancelled',
          },
        },
        'Smart transaction status: cancelled',
      );
    });
  });
});
