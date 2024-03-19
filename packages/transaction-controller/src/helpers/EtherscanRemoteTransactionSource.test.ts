import * as sinon from 'sinon';
import { v1 as random } from 'uuid';

import { advanceTime } from '../../../../tests/helpers';
import {
  ID_MOCK,
  ETHERSCAN_TRANSACTION_RESPONSE_EMPTY_MOCK,
  ETHERSCAN_TOKEN_TRANSACTION_RESPONSE_EMPTY_MOCK,
  ETHERSCAN_TRANSACTION_RESPONSE_MOCK,
  EXPECTED_NORMALISED_TRANSACTION_SUCCESS,
  EXPECTED_NORMALISED_TRANSACTION_ERROR,
  ETHERSCAN_TOKEN_TRANSACTION_RESPONSE_MOCK,
  EXPECTED_NORMALISED_TOKEN_TRANSACTION,
  ETHERSCAN_TOKEN_TRANSACTION_RESPONSE_ERROR_MOCK,
  ETHERSCAN_TRANSACTION_RESPONSE_ERROR_MOCK,
} from '../../tests/EtherscanMocks';
import { CHAIN_IDS } from '../constants';
import {
  fetchEtherscanTokenTransactions,
  fetchEtherscanTransactions,
} from '../utils/etherscan';
import { EtherscanRemoteTransactionSource } from './EtherscanRemoteTransactionSource';

jest.mock('../utils/etherscan', () => ({
  fetchEtherscanTransactions: jest.fn(),
  fetchEtherscanTokenTransactions: jest.fn(),
}));

jest.mock('uuid');

describe('EtherscanRemoteTransactionSource', () => {
  let clock: sinon.SinonFakeTimers;

  const fetchEtherscanTransactionsMock =
    fetchEtherscanTransactions as jest.MockedFn<
      typeof fetchEtherscanTransactions
    >;

  const fetchEtherscanTokenTransactionsMock =
    fetchEtherscanTokenTransactions as jest.MockedFn<
      typeof fetchEtherscanTokenTransactions
    >;

  const randomMock = random as jest.MockedFn<typeof random>;

  beforeEach(() => {
    jest.resetAllMocks();

    clock = sinon.useFakeTimers();

    fetchEtherscanTransactionsMock.mockResolvedValue(
      ETHERSCAN_TRANSACTION_RESPONSE_EMPTY_MOCK,
    );

    fetchEtherscanTokenTransactionsMock.mockResolvedValue(
      ETHERSCAN_TOKEN_TRANSACTION_RESPONSE_EMPTY_MOCK,
    );

    randomMock.mockReturnValue(ID_MOCK);
  });

  afterEach(() => {
    clock.restore();
  });

  describe('isSupportedNetwork', () => {
    it('returns true if chain ID in constant', () => {
      expect(
        new EtherscanRemoteTransactionSource().isSupportedNetwork(
          CHAIN_IDS.MAINNET,
        ),
      ).toBe(true);
    });

    it('returns false if chain ID not in constant', () => {
      expect(
        new EtherscanRemoteTransactionSource().isSupportedNetwork(
          '0x1324567891234',
        ),
      ).toBe(false);
    });
  });

  describe('getLastBlockVariations', () => {
    it('returns normal if normal request', () => {
      expect(
        new EtherscanRemoteTransactionSource().getLastBlockVariations(),
      ).toStrictEqual(['normal']);
    });

    it('returns token if token request', async () => {
      const remoteSource = new EtherscanRemoteTransactionSource();
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await remoteSource.fetchTransactions({} as any);

      expect(remoteSource.getLastBlockVariations()).toStrictEqual(['token']);
    });

    it('always returns normal if token requests disabled', async () => {
      const remoteSource = new EtherscanRemoteTransactionSource({
        includeTokenTransfers: false,
      });

      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await remoteSource.fetchTransactions({} as any);

      expect(remoteSource.getLastBlockVariations()).toStrictEqual(['normal']);
    });
  });

  describe('fetchTransactions', () => {
    it('returns normalized transactions fetched from Etherscan', async () => {
      fetchEtherscanTransactionsMock.mockResolvedValueOnce(
        ETHERSCAN_TRANSACTION_RESPONSE_MOCK,
      );

      const transactions =
        await new EtherscanRemoteTransactionSource().fetchTransactions(
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          {} as any,
        );

      expect(transactions).toStrictEqual([
        EXPECTED_NORMALISED_TRANSACTION_SUCCESS,
        EXPECTED_NORMALISED_TRANSACTION_ERROR,
      ]);
    });

    it('returns normalized token transactions fetched from Etherscan', async () => {
      fetchEtherscanTokenTransactionsMock.mockResolvedValueOnce(
        ETHERSCAN_TOKEN_TRANSACTION_RESPONSE_MOCK,
      );

      const remoteSource = new EtherscanRemoteTransactionSource();

      const promiseForFetchTransactions = remoteSource.fetchTransactions(
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {} as any,
      );
      await advanceTime({ clock, duration: 5000 });
      await promiseForFetchTransactions;

      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transactions = await remoteSource.fetchTransactions({} as any);

      expect(transactions).toStrictEqual([
        EXPECTED_NORMALISED_TOKEN_TRANSACTION,
        EXPECTED_NORMALISED_TOKEN_TRANSACTION,
      ]);
    });

    it('alternates between normal and token transactions', async () => {
      fetchEtherscanTransactionsMock.mockResolvedValueOnce(
        ETHERSCAN_TRANSACTION_RESPONSE_MOCK,
      );

      fetchEtherscanTokenTransactionsMock.mockResolvedValueOnce(
        ETHERSCAN_TOKEN_TRANSACTION_RESPONSE_MOCK,
      );

      const remoteSource = new EtherscanRemoteTransactionSource();

      const promiseForFetchTransactions1 = remoteSource.fetchTransactions(
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {} as any,
      );
      await advanceTime({ clock, duration: 5000 });
      await promiseForFetchTransactions1;
      expect(fetchEtherscanTransactionsMock).toHaveBeenCalledTimes(1);
      expect(fetchEtherscanTokenTransactionsMock).toHaveBeenCalledTimes(0);

      const promiseForFetchTransactions2 = remoteSource.fetchTransactions(
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {} as any,
      );
      await advanceTime({ clock, duration: 5000 });
      await promiseForFetchTransactions2;
      expect(fetchEtherscanTransactionsMock).toHaveBeenCalledTimes(1);
      expect(fetchEtherscanTokenTransactionsMock).toHaveBeenCalledTimes(1);

      const promiseForFetchTransactions3 = remoteSource.fetchTransactions(
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {} as any,
      );
      await advanceTime({ clock, duration: 5000 });
      await promiseForFetchTransactions3;
      expect(fetchEtherscanTransactionsMock).toHaveBeenCalledTimes(2);
      expect(fetchEtherscanTokenTransactionsMock).toHaveBeenCalledTimes(1);

      const promiseForFetchTransactions4 = remoteSource.fetchTransactions(
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {} as any,
      );
      await advanceTime({ clock, duration: 5000 });
      await promiseForFetchTransactions4;
      expect(fetchEtherscanTransactionsMock).toHaveBeenCalledTimes(2);
      expect(fetchEtherscanTokenTransactionsMock).toHaveBeenCalledTimes(2);

      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await remoteSource.fetchTransactions({} as any);
      expect(fetchEtherscanTransactionsMock).toHaveBeenCalledTimes(3);
      expect(fetchEtherscanTokenTransactionsMock).toHaveBeenCalledTimes(2);
    });

    it('returns no normalized token transactions if flag disabled', async () => {
      fetchEtherscanTokenTransactionsMock.mockResolvedValueOnce(
        ETHERSCAN_TOKEN_TRANSACTION_RESPONSE_MOCK,
      );

      const remoteSource = new EtherscanRemoteTransactionSource({
        includeTokenTransfers: false,
      });

      const promiseForFetchTransactions1 = remoteSource.fetchTransactions(
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {} as any,
      );
      await advanceTime({ clock, duration: 5000 });
      await promiseForFetchTransactions1;
      const promiseForFetchTransactions2 = remoteSource.fetchTransactions(
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {} as any,
      );
      await advanceTime({ clock, duration: 5000 });
      await promiseForFetchTransactions2;
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await remoteSource.fetchTransactions({} as any);

      expect(fetchEtherscanTokenTransactionsMock).toHaveBeenCalledTimes(0);
      expect(fetchEtherscanTransactionsMock).toHaveBeenCalledTimes(3);
    });

    it.each([
      ['no transactions found', ETHERSCAN_TRANSACTION_RESPONSE_EMPTY_MOCK],
      ['error', ETHERSCAN_TRANSACTION_RESPONSE_ERROR_MOCK],
    ])(
      'returns empty array if %s in normal transaction request',
      async (_, response) => {
        fetchEtherscanTransactionsMock.mockResolvedValueOnce(response);

        const transactions =
          await new EtherscanRemoteTransactionSource().fetchTransactions(
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            {} as any,
          );

        expect(transactions).toStrictEqual([]);
      },
    );

    it.each([
      [
        'no transactions found',
        ETHERSCAN_TOKEN_TRANSACTION_RESPONSE_EMPTY_MOCK,
      ],
      ['error', ETHERSCAN_TOKEN_TRANSACTION_RESPONSE_ERROR_MOCK],
    ])(
      'returns empty array if %s in token transaction request',
      async (_, response) => {
        fetchEtherscanTokenTransactionsMock.mockResolvedValueOnce(response);

        const remoteSource = new EtherscanRemoteTransactionSource();
        const promiseForFetchTransactions = remoteSource.fetchTransactions(
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          {} as any,
        );
        await advanceTime({ clock, duration: 5000 });
        await promiseForFetchTransactions;

        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const transactions = await remoteSource.fetchTransactions({} as any);

        expect(transactions).toStrictEqual([]);
      },
    );
  });
});
