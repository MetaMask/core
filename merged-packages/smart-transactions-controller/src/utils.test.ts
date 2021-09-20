import * as utils from './utils';
import { SmartTransactionMinedTx, APIType } from './types';
import { API_BASE_URL, CHAIN_IDS } from './constants';

describe('src/utils.js', () => {
  describe('isSmartTransactionPending', () => {
    const createSmartTransaction = () => {
      return {
        uuid: 'sdfasfj345345dfgag45353',
        status: {
          error: undefined,
          minedTx: SmartTransactionMinedTx.NOT_MINED,
          cancellationFeeWei: 10000,
          deadlineRatio: 10,
          minedHash: undefined,
        },
      };
    };

    it('returns true is a smart transaction is not yet mined and there is no error', () => {
      const smartTransaction = createSmartTransaction();
      expect(utils.isSmartTransactionPending(smartTransaction)).toBe(true);
    });

    it('returns false is a smart transaction is not yet mined and there is an error', () => {
      const smartTransaction: any = createSmartTransaction();
      smartTransaction.status.error = 'serverError';
      expect(utils.isSmartTransactionPending(smartTransaction)).toBe(false);
    });

    it('returns true is a smart transaction does not have any status yet', () => {
      const smartTransaction: any = createSmartTransaction();
      smartTransaction.status = undefined;
      expect(utils.isSmartTransactionPending(smartTransaction)).toBe(true);
    });
  });

  describe('getAPIRequestURL', () => {
    it('returns a URL for getting transactions', () => {
      expect(
        utils.getAPIRequestURL(APIType.GET_TRANSACTIONS, CHAIN_IDS.ETHEREUM),
      ).toBe(`${API_BASE_URL}/networks/${CHAIN_IDS.ETHEREUM}/getTransactions`);
    });

    it('returns a URL for submitting transactions', () => {
      expect(
        utils.getAPIRequestURL(APIType.SUBMIT_TRANSACTIONS, CHAIN_IDS.ETHEREUM),
      ).toBe(
        `${API_BASE_URL}/networks/${CHAIN_IDS.ETHEREUM}/submitTransactions`,
      );
    });

    it('returns a URL for transaction cancelation', () => {
      expect(utils.getAPIRequestURL(APIType.CANCEL, CHAIN_IDS.ETHEREUM)).toBe(
        `${API_BASE_URL}/networks/${CHAIN_IDS.ETHEREUM}/cancel`,
      );
    });

    it('returns a URL for checking a smart transactions status', () => {
      expect(
        utils.getAPIRequestURL(APIType.BATCH_STATUS, CHAIN_IDS.ETHEREUM),
      ).toBe(`${API_BASE_URL}/networks/${CHAIN_IDS.ETHEREUM}/batch_status`);
    });

    it('returns a URL for smart transactions API liveness', () => {
      expect(utils.getAPIRequestURL(APIType.LIVENESS, CHAIN_IDS.ETHEREUM)).toBe(
        `${API_BASE_URL}/networks/${CHAIN_IDS.ETHEREUM}/liveness`,
      );
    });

    it('returns a URL for smart transactions API liveness for the BSC chainId', () => {
      expect(utils.getAPIRequestURL(APIType.LIVENESS, CHAIN_IDS.BSC)).toBe(
        `${API_BASE_URL}/networks/${CHAIN_IDS.BSC}/liveness`,
      );
    });
  });
});
