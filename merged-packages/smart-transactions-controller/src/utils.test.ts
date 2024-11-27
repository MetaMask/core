import { ChainId } from '@metamask/controller-utils';

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

    it('returns a URL for smart transactions API liveness', () => {
      expect(utils.getAPIRequestURL(APIType.LIVENESS, ChainId.mainnet)).toBe(
        `${SENTINEL_API_BASE_URL_MAP[ethereumChainIdDec]}/network`,
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

    it('returns cancellation state if cancellationReason provided', () => {
      const statusResponse = {
        ...createStatusResponse(),
        cancellationReason: SmartTransactionCancellationReason.USER_CANCELLED,
      };
      expect(utils.calculateStatus(statusResponse)).toStrictEqual(
        SmartTransactionStatuses.CANCELLED_USER_CANCELLED,
      );
    });

    it('returns pending if a tx was user cancelled, but is not settled yet', () => {
      const statusResponse = {
        ...createStatusResponse(),
        cancellationReason: SmartTransactionCancellationReason.USER_CANCELLED,
        isSettled: false,
      };
      expect(utils.calculateStatus(statusResponse)).toStrictEqual(
        SmartTransactionStatuses.PENDING,
      );
    });

    it('returns cancellation state "CANCELLED_PREVIOUS_TX_CANCELLED" if cancellationReason provided', () => {
      const statusResponse = {
        ...createStatusResponse(),
        cancellationReason:
          SmartTransactionCancellationReason.PREVIOUS_TX_CANCELLED,
      };
      expect(utils.calculateStatus(statusResponse)).toStrictEqual(
        SmartTransactionStatuses.CANCELLED_PREVIOUS_TX_CANCELLED,
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
      }).toThrow('kzg instance required to instantiate blob tx');
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
});
