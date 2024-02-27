// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { API_BASE_URL, CHAIN_IDS } from './constants';
import {
  SmartTransactionMinedTx,
  APIType,
  SmartTransactionStatuses,
  SmartTransactionCancellationReason,
} from './types';
import * as utils from './utils';
import packageJson from '../package.json';

describe('src/utils.js', () => {
  describe('isSmartTransactionPending', () => {
    const createSmartTransaction = () => {
      return {
        uuid: 'sdfasfj345345dfgag45353',
        status: 'pending',
        statusMetadata: {
          error: undefined,
          minedTx: SmartTransactionMinedTx.NOT_MINED,
          cancellationFeeWei: 10000,
          deadlineRatio: 10,
          minedHash: undefined,
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
    const ethereumChainIdDec = parseInt(CHAIN_IDS.ETHEREUM, 16);

    it('returns a URL for getting transactions', () => {
      expect(utils.getAPIRequestURL(APIType.GET_FEES, CHAIN_IDS.ETHEREUM)).toBe(
        `${API_BASE_URL}/networks/${ethereumChainIdDec}/getFees`,
      );
    });

    it('returns a URL for submitting transactions', () => {
      expect(
        utils.getAPIRequestURL(APIType.SUBMIT_TRANSACTIONS, CHAIN_IDS.ETHEREUM),
      ).toBe(
        `${API_BASE_URL}/networks/${ethereumChainIdDec}/submitTransactions?stxControllerVersion=${packageJson.version}`,
      );
    });

    it('returns a URL for transaction cancelation', () => {
      expect(utils.getAPIRequestURL(APIType.CANCEL, CHAIN_IDS.ETHEREUM)).toBe(
        `${API_BASE_URL}/networks/${ethereumChainIdDec}/cancel`,
      );
    });

    it('returns a URL for checking a smart transactions status', () => {
      expect(
        utils.getAPIRequestURL(APIType.BATCH_STATUS, CHAIN_IDS.ETHEREUM),
      ).toBe(`${API_BASE_URL}/networks/${ethereumChainIdDec}/batchStatus`);
    });

    it('returns a URL for smart transactions API liveness', () => {
      expect(utils.getAPIRequestURL(APIType.LIVENESS, CHAIN_IDS.ETHEREUM)).toBe(
        `${API_BASE_URL}/networks/${ethereumChainIdDec}/health`,
      );
    });

    it('returns a URL for smart transactions API liveness for the BSC chainId', () => {
      const bscChainIdDec = parseInt(CHAIN_IDS.BSC, 16);
      expect(utils.getAPIRequestURL(APIType.LIVENESS, CHAIN_IDS.BSC)).toBe(
        `${API_BASE_URL}/networks/${bscChainIdDec}/health`,
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
        minedHash: undefined,
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
});
