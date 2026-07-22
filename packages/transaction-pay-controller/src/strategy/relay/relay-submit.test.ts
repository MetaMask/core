import { ORIGIN_METAMASK } from '@metamask/controller-utils';
import { TransactionType } from '@metamask/transaction-controller';
import type {
  BatchTransactionParams,
  TransactionMeta,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { cloneDeep } from 'lodash';

import { PaymentOverride } from '../../constants';
import { getMessengerMock } from '../../tests/messenger-mock';
import type {
  PayStrategyExecuteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import type { FeatureFlags } from '../../utils/feature-flags';
import {
  getFeatureFlags,
  getRelayPollingInterval,
  getRelayPollingTimeout,
} from '../../utils/feature-flags';
import { submitMoneyAccountVaultDeposit } from '../../utils/ma-vault-deposit';
import { getLiveTokenBalance, normalizeTokenAddress } from '../../utils/token';
import {
  collectTransactionIds,
  getTransaction,
  getTransferredAmountFromTxHash,
  updateTransaction,
  waitForTransactionConfirmed,
} from '../../utils/transaction';
import { FALLBACK_HASH, RELAY_STATUS_URL } from './constants';
import { submitRelayQuotes } from './relay-submit';
import { submitViaRelayExecute } from './relay-submit-execute';
import type { RelayQuote } from './types';

jest.mock('../../utils/ma-vault-deposit');
jest.mock('../../utils/token');
jest.mock('../../utils/transaction');
jest.mock('../../utils/feature-flags');
jest.mock('./hyperliquid-withdraw');
jest.mock('./polymarket/withdraw');
jest.mock('./relay-submit-execute');

const NETWORK_CLIENT_ID_MOCK = 'networkClientIdMock';
const TRANSACTION_HASH_MOCK = '0x1234';
const SOURCE_HASH_MOCK = '0xsourcehash';
const REQUEST_ID_MOCK = '0x1234567890abcdef';
const ORIGINAL_TRANSACTION_ID_MOCK = '456-789';
const FROM_MOCK = '0xabcde' as Hex;
const CHAIN_ID_MOCK = '0x1' as Hex;
const TOKEN_ADDRESS_MOCK = '0x123' as Hex;

const TRANSACTION_META_MOCK = {
  id: '123-456',
  hash: TRANSACTION_HASH_MOCK,
} as TransactionMeta;

const ORIGINAL_QUOTE_MOCK = {
  details: {
    currencyIn: {
      currency: {
        chainId: 1,
      },
    },
    currencyOut: {
      currency: {
        chainId: 2,
      },
    },
  },
  metamask: {
    gasLimits: [21000, 21000],
    is7702: false,
  },
  request: {},
  steps: [
    {
      id: 'swap',
      kind: 'transaction',
      requestId: REQUEST_ID_MOCK,
      items: [
        {
          data: {
            chainId: 1,
            data: '0x1234' as Hex,
            from: FROM_MOCK,
            gas: '21000',
            maxFeePerGas: '25000000000',
            maxPriorityFeePerGas: '1000000000',
            to: '0xfedcb' as Hex,
            value: '1234',
          },
          status: 'complete',
        },
      ],
    },
  ],
} as RelayQuote;

const STATUS_RESPONSE_MOCK = {
  status: 'success',
  inTxHashes: [SOURCE_HASH_MOCK],
  txHashes: [TRANSACTION_HASH_MOCK],
};

const SOURCE_AMOUNT_RAW_MOCK = '1000000';

const REQUEST_MOCK: PayStrategyExecuteRequest<RelayQuote> = {
  accountSupports7702: true,
  quotes: [
    {
      fees: {
        sourceNetwork: {},
      },
      original: ORIGINAL_QUOTE_MOCK,
      request: {
        from: FROM_MOCK,
        sourceChainId: CHAIN_ID_MOCK,
        sourceTokenAddress: TOKEN_ADDRESS_MOCK,
      },
      sourceAmount: {
        raw: SOURCE_AMOUNT_RAW_MOCK,
        human: '1',
        fiat: '1',
        usd: '1',
      },
    } as TransactionPayQuote<RelayQuote>,
  ],
  messenger: {} as TransactionPayControllerMessenger,
  isSmartTransaction: () => false,
  transaction: {
    id: ORIGINAL_TRANSACTION_ID_MOCK,
    txParams: { from: FROM_MOCK },
  } as TransactionMeta,
};

describe('Relay Submit Utils', () => {
  const updateTransactionMock = jest.mocked(updateTransaction);
  let successfulFetchMock: jest.SpyInstance;
  const getTransactionMock = jest.mocked(getTransaction);
  const collectTransactionIdsMock = jest.mocked(collectTransactionIds);
  const getFeatureFlagsMock = jest.mocked(getFeatureFlags);
  const getLiveTokenBalanceMock = jest.mocked(getLiveTokenBalance);
  const normalizeTokenAddressMock = jest.mocked(normalizeTokenAddress);
  const getRelayPollingIntervalMock = jest.mocked(getRelayPollingInterval);
  const getRelayPollingTimeoutMock = jest.mocked(getRelayPollingTimeout);

  const {
    addTransactionMock,
    addTransactionBatchMock,
    getControllerStateMock,
    getDelegationTransactionMock,
    findNetworkClientIdByChainIdMock,
    getPaymentOverrideDataMock,
    messenger,
  } = getMessengerMock();

  let request: PayStrategyExecuteRequest<RelayQuote>;

  const waitForTransactionConfirmedMock = jest.mocked(
    waitForTransactionConfirmed,
  );

  const submitViaRelayExecuteMock = jest.mocked(submitViaRelayExecute);
  const submitMoneyAccountVaultDepositMock = jest.mocked(
    submitMoneyAccountVaultDeposit,
  );
  const getTransferredAmountFromTxHashMock = jest.mocked(
    getTransferredAmountFromTxHash,
  );

  beforeEach(() => {
    jest.resetAllMocks();

    successfulFetchMock = jest.spyOn(global, 'fetch');

    getRelayPollingIntervalMock.mockReturnValue(1);
    getRelayPollingTimeoutMock.mockReturnValue(undefined);

    getLiveTokenBalanceMock.mockResolvedValue('9999999999');
    normalizeTokenAddressMock.mockImplementation(
      (tokenAddress) => tokenAddress,
    );
    findNetworkClientIdByChainIdMock.mockReturnValue(NETWORK_CLIENT_ID_MOCK);

    addTransactionMock.mockResolvedValue({
      result: Promise.resolve(TRANSACTION_HASH_MOCK),
      transactionMeta: TRANSACTION_META_MOCK,
    });

    waitForTransactionConfirmedMock.mockResolvedValue();
    getTransactionMock.mockReturnValue(TRANSACTION_META_MOCK);

    getFeatureFlagsMock.mockReturnValue({
      relayFallbackGas: {
        max: 123,
      },
    } as FeatureFlags);

    collectTransactionIdsMock.mockImplementation(
      (_chainId, _from, _messenger, fn) => {
        fn(TRANSACTION_META_MOCK.id);
        return { end: jest.fn() };
      },
    );

    successfulFetchMock.mockResolvedValue({
      ok: true,
      json: async () => STATUS_RESPONSE_MOCK,
    } as Response);

    request = cloneDeep(REQUEST_MOCK);
    request.messenger = messenger;
  });

  afterEach(() => {
    successfulFetchMock.mockRestore();
  });

  describe('submitRelayQuotes', () => {
    it('throws if there are no Relay quotes to submit', async () => {
      request.quotes = [];

      await expect(submitRelayQuotes(request)).rejects.toThrow(
        'Relay: No quotes to submit',
      );
    });

    it('adds transaction', async () => {
      await submitRelayQuotes(request);

      expect(addTransactionMock).toHaveBeenCalledTimes(1);
      expect(addTransactionMock).toHaveBeenCalledWith(
        {
          data: '0x1234',
          from: '0xabcde',
          gas: '0x5208',
          maxFeePerGas: '0x5d21dba00',
          maxPriorityFeePerGas: '0x3b9aca00',
          to: '0xfedcb',
          value: '0x4d2',
        },
        {
          gasFeeToken: undefined,
          networkClientId: NETWORK_CLIENT_ID_MOCK,
          origin: ORIGIN_METAMASK,
          isInternal: true,
          requireApproval: false,
          type: TransactionType.relayDeposit,
        },
      );
    });

    it('passes sponsored gas options when parent sponsorship applies to same-chain quote', async () => {
      request.transaction.chainId = CHAIN_ID_MOCK;
      request.transaction.isGasFeeSponsored = true;
      request.quotes[0].request.targetChainId = CHAIN_ID_MOCK;
      request.quotes[0].original.details.currencyOut.currency.chainId = 1;

      await submitRelayQuotes(request);

      expect(addTransactionMock).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          isGasFeeSponsored: true,
        }),
      );
    });

    it('uses predictRelayDeposit type when parent transaction is predictDeposit', async () => {
      request.transaction = {
        ...request.transaction,
        type: TransactionType.predictDeposit,
      } as TransactionMeta;

      await submitRelayQuotes(request);

      expect(addTransactionMock).toHaveBeenCalledTimes(1);
      expect(addTransactionMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: TransactionType.predictRelayDeposit,
        }),
      );
    });

    it('uses perpsRelayDeposit type when parent transaction is perpsDeposit', async () => {
      request.transaction = {
        ...request.transaction,
        type: TransactionType.perpsDeposit,
      } as TransactionMeta;

      await submitRelayQuotes(request);

      expect(addTransactionMock).toHaveBeenCalledTimes(1);
      expect(addTransactionMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: TransactionType.perpsRelayDeposit,
        }),
      );
    });

    it('falls back to relayDeposit type when parent transaction type is not mapped', async () => {
      request.transaction = {
        ...request.transaction,
        type: TransactionType.simpleSend,
      } as TransactionMeta;

      await submitRelayQuotes(request);

      expect(addTransactionMock).toHaveBeenCalledTimes(1);
      expect(addTransactionMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: TransactionType.relayDeposit,
        }),
      );
    });

    it('uses musdRelayDeposit type when parent transaction is musdConversion', async () => {
      request.transaction = {
        ...request.transaction,
        type: TransactionType.musdConversion,
      } as TransactionMeta;

      await submitRelayQuotes(request);

      expect(addTransactionMock).toHaveBeenCalledTimes(1);
      expect(addTransactionMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: TransactionType.musdRelayDeposit,
        }),
      );
    });

    it.each([
      [TransactionType.predictDeposit, TransactionType.predictRelayDeposit],
      [TransactionType.perpsDeposit, TransactionType.perpsRelayDeposit],
      [TransactionType.musdConversion, TransactionType.musdRelayDeposit],
    ])(
      'resolves %s from nestedTransactions when type is batch',
      async (nestedType, expectedType) => {
        request.transaction = {
          ...request.transaction,
          type: TransactionType.batch,
          nestedTransactions: [{ type: nestedType }],
        } as TransactionMeta;

        await submitRelayQuotes(request);

        expect(addTransactionMock).toHaveBeenCalledTimes(1);
        expect(addTransactionMock).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            type: expectedType,
          }),
        );
      },
    );

    it('falls back to relayDeposit when type is batch and nestedTransactions have no mapped type', async () => {
      request.transaction = {
        ...request.transaction,
        type: TransactionType.batch,
        nestedTransactions: [{ type: TransactionType.tokenMethodApprove }],
      } as TransactionMeta;

      await submitRelayQuotes(request);

      expect(addTransactionMock).toHaveBeenCalledTimes(1);
      expect(addTransactionMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: TransactionType.relayDeposit,
        }),
      );
    });

    it('adds transaction with gas fee token if isSourceGasFeeToken', async () => {
      request.quotes[0].fees.isSourceGasFeeToken = true;

      await submitRelayQuotes(request);

      expect(addTransactionMock).toHaveBeenCalledTimes(1);
      expect(addTransactionMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          gasFeeToken: TOKEN_ADDRESS_MOCK,
        }),
      );
    });

    it('keeps max-gas-station submissions on current gasFeeToken-only options', async () => {
      request.quotes[0].fees.isSourceGasFeeToken = true;
      request.quotes[0].original.metamask.isMaxGasStation = true;

      await submitRelayQuotes(request);

      expect(addTransactionMock).toHaveBeenCalledTimes(1);
      expect(addTransactionMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          gasFeeToken: TOKEN_ADDRESS_MOCK,
        }),
      );
      expect(addTransactionMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.not.objectContaining({
          gasFeeTokenAmount: expect.anything(),
        }),
      );
    });

    it('adds transaction with authorization list if same chain and authorization list present', async () => {
      request.quotes[0].original.details.currencyOut.currency.chainId = 1;
      request.quotes[0].original.request = {
        authorizationList: [
          {
            address: '0xabc' as Hex,
            chainId: 1,
            nonce: 2,
            r: '0xr' as Hex,
            s: '0xs' as Hex,
            yParity: 1,
          },
          {
            address: '0xdef' as Hex,
            chainId: 1,
            nonce: 3,
            r: '0xr2' as Hex,
            s: '0xs2' as Hex,
            yParity: 0,
          },
        ],
      } as never;

      await submitRelayQuotes(request);

      expect(addTransactionMock).toHaveBeenCalledTimes(1);
      expect(addTransactionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          authorizationList: [
            {
              address: '0xabc',
              chainId: '0x1',
            },
            {
              address: '0xdef',
              chainId: '0x1',
            },
          ],
        }),
        expect.anything(),
      );
    });

    it('does not add authorization list if different chains', async () => {
      request.quotes[0].original.request = {
        authorizationList: [
          {
            address: '0xabc' as Hex,
            chainId: 1,
            nonce: 2,
            r: '0xr' as Hex,
            s: '0xs' as Hex,
            yParity: 1,
          },
        ],
      } as never;

      await submitRelayQuotes(request);

      expect(addTransactionMock).toHaveBeenCalledTimes(1);
      expect(addTransactionMock).toHaveBeenCalledWith(
        expect.not.objectContaining({
          authorizationList: expect.anything(),
        }),
        expect.anything(),
      );
    });

    it('does not add authorization list if same chain but no authorization list', async () => {
      request.quotes[0].original.details.currencyOut.currency.chainId = 1;
      request.quotes[0].original.request = {} as never;

      await submitRelayQuotes(request);

      expect(addTransactionMock).toHaveBeenCalledTimes(1);
      expect(addTransactionMock).toHaveBeenCalledWith(
        expect.not.objectContaining({
          authorizationList: expect.anything(),
        }),
        expect.anything(),
      );
    });

    it('adds transaction batch if multiple params', async () => {
      request.quotes[0].original.steps[0].items.push({
        ...request.quotes[0].original.steps[0].items[0],
      });

      await submitRelayQuotes(request);

      expect(addTransactionBatchMock).toHaveBeenCalledTimes(1);
      expect(addTransactionBatchMock).toHaveBeenCalledWith({
        disable7702: true,
        disableHook: false,
        disableSequential: false,
        from: FROM_MOCK,
        gasFeeToken: undefined,
        gasLimit7702: undefined,
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        origin: ORIGIN_METAMASK,
        isInternal: true,
        overwriteUpgrade: true,
        requireApproval: false,
        transactions: [
          {
            params: {
              data: '0x1234',
              gas: '0x5208',
              maxFeePerGas: '0x5d21dba00',
              maxPriorityFeePerGas: '0x3b9aca00',
              to: '0xfedcb',
              value: '0x4d2',
            },
            type: TransactionType.tokenMethodApprove,
          },
          {
            params: {
              data: '0x1234',
              gas: '0x5208',
              maxFeePerGas: '0x5d21dba00',
              maxPriorityFeePerGas: '0x3b9aca00',
              to: '0xfedcb',
              value: '0x4d2',
            },
            type: TransactionType.relayDeposit,
          },
        ],
      });
    });

    it('uses mapped relay deposit type in batch when parent is predictDeposit', async () => {
      request.transaction = {
        ...request.transaction,
        type: TransactionType.predictDeposit,
      } as TransactionMeta;

      request.quotes[0].original.steps[0].items.push({
        ...request.quotes[0].original.steps[0].items[0],
      });

      await submitRelayQuotes(request);

      expect(addTransactionBatchMock).toHaveBeenCalledTimes(1);
      expect(addTransactionBatchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          transactions: [
            expect.objectContaining({
              type: TransactionType.tokenMethodApprove,
            }),
            expect.objectContaining({
              type: TransactionType.predictRelayDeposit,
            }),
          ],
        }),
      );
    });

    it('uses mapped relay deposit type in batch when parent is perpsDeposit', async () => {
      request.transaction = {
        ...request.transaction,
        type: TransactionType.perpsDeposit,
      } as TransactionMeta;

      request.quotes[0].original.steps[0].items.push({
        ...request.quotes[0].original.steps[0].items[0],
      });

      await submitRelayQuotes(request);

      expect(addTransactionBatchMock).toHaveBeenCalledTimes(1);
      expect(addTransactionBatchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          transactions: [
            expect.objectContaining({
              type: TransactionType.tokenMethodApprove,
            }),
            expect.objectContaining({
              type: TransactionType.perpsRelayDeposit,
            }),
          ],
        }),
      );
    });

    it('adds transaction batch with gas fee token if isSourceGasFeeToken', async () => {
      request.quotes[0].original.steps[0].items.push({
        ...request.quotes[0].original.steps[0].items[0],
      });

      request.quotes[0].fees.isSourceGasFeeToken = true;

      await submitRelayQuotes(request);

      expect(addTransactionBatchMock).toHaveBeenCalledTimes(1);
      expect(addTransactionBatchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          gasFeeToken: TOKEN_ADDRESS_MOCK,
        }),
      );
    });

    it('adds transaction if params missing', async () => {
      request.quotes[0].original.steps[0].items[0].data.value =
        undefined as never;

      request.quotes[0].original.steps[0].items[0].data.gas =
        undefined as never;

      await submitRelayQuotes(request);

      expect(addTransactionMock).toHaveBeenCalledTimes(1);
      expect(addTransactionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          gas: '0x5208',
          value: '0x0',
        }),
        expect.anything(),
      );
    });

    it('adds transaction if gas fee params missing', async () => {
      request.quotes[0].original.steps[0].items[0].data.maxFeePerGas =
        undefined as never;

      request.quotes[0].original.steps[0].items[0].data.maxPriorityFeePerGas =
        undefined as never;

      await submitRelayQuotes(request);

      expect(addTransactionMock).toHaveBeenCalledTimes(1);
      expect(addTransactionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          maxFeePerGas: undefined,
          maxPriorityFeePerGas: undefined,
        }),
        expect.anything(),
      );
    });

    it('throws if step kind is unsupported', async () => {
      request.quotes[0].original.steps[0].kind = 'unsupported' as never;

      await expect(submitRelayQuotes(request)).rejects.toThrow(
        'Relay: Unsupported step kind: unsupported',
      );
    });

    it('waits for relay status to be success', async () => {
      successfulFetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'pending' }),
      } as Response);

      await submitRelayQuotes(request);

      expect(successfulFetchMock).toHaveBeenCalledTimes(2);
      expect(successfulFetchMock).toHaveBeenCalledWith(
        `${RELAY_STATUS_URL}?requestId=${REQUEST_ID_MOCK}`,
        {
          method: 'GET',
        },
      );
    });

    it('does not wait for relay status if same chain', async () => {
      request.quotes[0].original.details.currencyOut.currency.chainId = 1;

      const result = await submitRelayQuotes(request);

      expect(result.transactionHash).toBe('0x0');
      expect(successfulFetchMock).toHaveBeenCalledTimes(0);
    });

    it('returns fallback hash if same-chain polling returns no target hash', async () => {
      request.quotes[0].original.details.currencyOut.currency.chainId = 1;
      request.quotes[0].original.steps = [
        {
          ...request.quotes[0].original.steps[0],
          id: 'deposit',
        },
      ];
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          ...STATUS_RESPONSE_MOCK,
          txHashes: [],
        }),
      } as Response);

      const result = await submitRelayQuotes(request);

      expect(result.transactionHash).toBe('0x0');
    });

    it('waits for relay status if same chain with single deposit step', async () => {
      request.quotes[0].original.details.currencyOut.currency.chainId = 1;
      request.quotes[0].original.steps = [
        {
          ...request.quotes[0].original.steps[0],
          id: 'deposit',
        },
      ];

      await submitRelayQuotes(request);

      expect(successfulFetchMock).toHaveBeenCalledTimes(1);
      expect(successfulFetchMock).toHaveBeenCalledWith(
        `${RELAY_STATUS_URL}?requestId=${REQUEST_ID_MOCK}`,
        {
          method: 'GET',
        },
      );
    });

    it('rethrows confirmation failures bare (the Relay submit prefix is applied at RelayStrategy.execute)', async () => {
      waitForTransactionConfirmedMock.mockRejectedValue(
        new Error('Transaction failed'),
      );

      await expect(submitRelayQuotes(request)).rejects.toThrow(
        'Relay: Transaction failed',
      );
    });

    it('rethrows addTransaction failures bare (the Relay submit prefix is applied at RelayStrategy.execute)', async () => {
      addTransactionMock.mockRejectedValueOnce(
        new Error('addTransaction boom'),
      );

      await expect(submitRelayQuotes(request)).rejects.toThrow(
        'Relay: addTransaction boom',
      );
    });

    it('throws if no Relay child transactions are collected', async () => {
      collectTransactionIdsMock.mockReturnValue({ end: jest.fn() });

      await expect(submitRelayQuotes(request)).rejects.toThrow(
        'Relay: No transactions submitted',
      );
    });

    it('throws if the confirmed Relay child transaction has no hash', async () => {
      getTransactionMock.mockReturnValue({} as TransactionMeta);

      await expect(submitRelayQuotes(request)).rejects.toThrow(
        'Relay: Missing transaction hash',
      );
    });

    it.each(['failure', 'refund'])(
      'throws if relay status is %s',
      async (status) => {
        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => ({ status }),
        } as Response);

        await expect(submitRelayQuotes(request)).rejects.toThrow(
          `Relay: Request failed with status: ${status}`,
        );
      },
    );

    it('throws if relay returns unrecognized status', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'unknown_status' }),
      } as Response);

      await expect(submitRelayQuotes(request)).rejects.toThrow(
        'Relay: Unrecognized status: unknown_status',
      );
    });

    it.each(['delayed', 'depositing', 'pending', 'submitted', 'waiting'])(
      'continues polling on pending status %s',
      async (pendingStatus) => {
        successfulFetchMock
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ status: pendingStatus }),
          } as Response)
          .mockResolvedValue({
            ok: true,
            json: async () => STATUS_RESPONSE_MOCK,
          } as Response);

        await submitRelayQuotes(request);

        expect(successfulFetchMock).toHaveBeenCalledTimes(2);
      },
    );

    it('reads polling interval from feature flags', async () => {
      await submitRelayQuotes(request);

      expect(getRelayPollingIntervalMock).toHaveBeenCalledWith(messenger);
    });

    it('ignores network errors and retries when no timeout is set', async () => {
      successfulFetchMock
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue({
          ok: true,
          json: async () => STATUS_RESPONSE_MOCK,
        } as Response);

      const result = await submitRelayQuotes(request);

      expect(result.transactionHash).toBe(TRANSACTION_HASH_MOCK);
    });

    it('ignores network errors until timeout is reached', async () => {
      getRelayPollingTimeoutMock.mockReturnValue(100);

      jest.spyOn(Date, 'now').mockReturnValue(0);

      successfulFetchMock
        .mockRejectedValueOnce(new Error('Network error'))
        .mockImplementation(() => {
          jest.spyOn(Date, 'now').mockReturnValue(200);
          return Promise.reject(new Error('Network error'));
        });

      await expect(submitRelayQuotes(request)).rejects.toThrow(
        'Relay: Polling timed out',
      );
    });

    it('throws timeout error with last status when polling exceeds configured timeout', async () => {
      getRelayPollingTimeoutMock.mockReturnValue(100);

      jest.spyOn(Date, 'now').mockReturnValue(0);

      successfulFetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: 'pending' }),
        } as Response)
        .mockImplementation(() => {
          jest.spyOn(Date, 'now').mockReturnValue(200);
          return Promise.resolve({
            json: async () => ({ status: 'pending' }),
          } as Response);
        });

      await expect(submitRelayQuotes(request)).rejects.toThrow(
        'Relay: Polling timed out (last status: pending)',
      );
    });

    it('does not timeout when polling timeout is zero', async () => {
      getRelayPollingTimeoutMock.mockReturnValue(0);

      successfulFetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: 'pending' }),
        } as Response)
        .mockResolvedValue({
          ok: true,
          json: async () => STATUS_RESPONSE_MOCK,
        } as Response);

      await submitRelayQuotes(request);

      expect(successfulFetchMock).toHaveBeenCalledTimes(2);
    });

    it('does not timeout when polling timeout is undefined', async () => {
      getRelayPollingTimeoutMock.mockReturnValue(undefined);

      successfulFetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: 'pending' }),
        } as Response)
        .mockResolvedValue({
          ok: true,
          json: async () => STATUS_RESPONSE_MOCK,
        } as Response);

      await submitRelayQuotes(request);

      expect(successfulFetchMock).toHaveBeenCalledTimes(2);
    });

    it('updates transaction', async () => {
      await submitRelayQuotes(request);

      expect(updateTransactionMock).toHaveBeenCalledWith(
        {
          transactionId: ORIGINAL_TRANSACTION_ID_MOCK,
          messenger,
          note: expect.any(String),
        },
        expect.any(Function),
      );

      const txDraft = { txParams: { nonce: '0x1' } } as TransactionMeta;
      updateTransactionMock.mock.calls.map((call) => call[1](txDraft));

      expect(txDraft).toStrictEqual(
        expect.objectContaining({
          isIntentComplete: true,
          requiredTransactionIds: [TRANSACTION_META_MOCK.id],
          txParams: {
            nonce: undefined,
          },
        }),
      );
    });

    it('returns target hash', async () => {
      const result = await submitRelayQuotes(request);
      expect(result.transactionHash).toBe(TRANSACTION_HASH_MOCK);
    });

    it('returns fallback hash if none included', async () => {
      successfulFetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          ...STATUS_RESPONSE_MOCK,
          txHashes: [],
        }),
      } as Response);

      const result = await submitRelayQuotes(request);
      expect(result.transactionHash).toBe('0x0');
    });

    it('adds required transaction IDs', async () => {
      await submitRelayQuotes(request);

      const txDraft = { txParams: {} } as TransactionMeta;
      updateTransactionMock.mock.calls.map((call) => call[1](txDraft));

      expect(txDraft.requiredTransactionIds).toStrictEqual([
        TRANSACTION_META_MOCK.id,
      ]);
    });

    describe('paymentOverride flow', () => {
      const TRANSACTION_DATA_MOCK = {
        isLoading: false,
        tokens: [],
      };

      const PAYMENT_OVERRIDE_TX_MOCK: BatchTransactionParams = {
        to: '0xpaymentoverride' as Hex,
        data: '0xpaymentoverride' as Hex,
        value: '0x0' as Hex,
      };

      beforeEach(() => {
        getControllerStateMock.mockReturnValue({
          transactionData: {
            [ORIGINAL_TRANSACTION_ID_MOCK]: TRANSACTION_DATA_MOCK,
          },
        });

        // The payment override is only prepended onto the source execute batch
        // for same-chain flows, so align the quote's source and destination
        // chains for these override-prepend assertions.
        request.quotes[0].original.details.currencyOut.currency.chainId =
          request.quotes[0].original.details.currencyIn.currency.chainId;
      });

      it('prepends override tx params to submit batch', async () => {
        request.quotes[0].request.paymentOverride =
          PaymentOverride.MoneyAccount;
        getPaymentOverrideDataMock.mockResolvedValue({
          calls: [PAYMENT_OVERRIDE_TX_MOCK],
        });

        await submitRelayQuotes(request);

        expect(getPaymentOverrideDataMock).toHaveBeenCalledWith({
          amount: request.quotes[0].sourceAmount.human,
          transaction: request.transaction,
          transactionData: TRANSACTION_DATA_MOCK,
        });

        const batchCall = addTransactionBatchMock.mock.calls[0][0];
        expect(batchCall.transactions[0].params).toStrictEqual(
          expect.objectContaining({
            data: PAYMENT_OVERRIDE_TX_MOCK.data,
            to: PAYMENT_OVERRIDE_TX_MOCK.to,
            value: PAYMENT_OVERRIDE_TX_MOCK.value,
          }),
        );
      });

      it('does not call getPaymentOverrideData when paymentOverride is not defined', async () => {
        await submitRelayQuotes(request);

        expect(getPaymentOverrideDataMock).not.toHaveBeenCalled();
      });

      it('does not prepend override for cross-chain flows', async () => {
        request.quotes[0].request.paymentOverride =
          PaymentOverride.MoneyAccount;
        request.quotes[0].original.details.currencyIn.currency.chainId = 137;
        request.quotes[0].original.details.currencyOut.currency.chainId = 143;
        getPaymentOverrideDataMock.mockResolvedValue({
          calls: [PAYMENT_OVERRIDE_TX_MOCK],
        });

        await submitRelayQuotes(request);

        expect(getPaymentOverrideDataMock).not.toHaveBeenCalled();
      });

      it('does not prepend when callback returns empty array', async () => {
        request.quotes[0].request.paymentOverride =
          PaymentOverride.MoneyAccount;
        getPaymentOverrideDataMock.mockResolvedValue({ calls: [] });

        await submitRelayQuotes(request);

        expect(addTransactionBatchMock).not.toHaveBeenCalled();
        expect(addTransactionMock).toHaveBeenCalledTimes(1);
      });

      it('skips source balance validation', async () => {
        request.quotes[0].request.paymentOverride =
          PaymentOverride.MoneyAccount;
        getPaymentOverrideDataMock.mockResolvedValue({
          calls: [PAYMENT_OVERRIDE_TX_MOCK],
        });
        getLiveTokenBalanceMock.mockResolvedValue('0');

        await submitRelayQuotes(request);

        expect(getLiveTokenBalanceMock).not.toHaveBeenCalled();
      });

      it('assigns correct gas limits with override tx', async () => {
        request.quotes[0].request.paymentOverride =
          PaymentOverride.MoneyAccount;
        request.quotes[0].original.metamask.gasLimits = [10000, 30000, 50000];

        request.quotes[0].original.steps[0].items.push({
          ...request.quotes[0].original.steps[0].items[0],
          data: {
            ...request.quotes[0].original.steps[0].items[0].data,
            data: '0xapprove' as Hex,
            to: '0xapproveTarget' as Hex,
          },
        });

        getPaymentOverrideDataMock.mockResolvedValue({
          calls: [PAYMENT_OVERRIDE_TX_MOCK],
        });

        await submitRelayQuotes(request);

        const { transactions } = addTransactionBatchMock.mock
          .calls[0][0] as unknown as Record<
          string,
          { params: { gas?: string } }[]
        >;

        expect(transactions).toHaveLength(3);
        expect(transactions[0].params.gas).toBe('0x2710');
        expect(transactions[1].params.gas).toBe('0x7530');
        expect(transactions[2].params.gas).toBe('0xc350');
      });

      it('assigns correct transaction types with multi-step relay (approve + deposit)', async () => {
        request.quotes[0].request.paymentOverride =
          PaymentOverride.MoneyAccount;
        request.transaction = {
          ...request.transaction,
          type: TransactionType.simpleSend,
        } as TransactionMeta;

        request.quotes[0].original.steps[0].items.push({
          ...request.quotes[0].original.steps[0].items[0],
          data: {
            ...request.quotes[0].original.steps[0].items[0].data,
            data: '0xapprove' as Hex,
            to: '0xapproveTarget' as Hex,
          },
        });

        getPaymentOverrideDataMock.mockResolvedValue({
          calls: [PAYMENT_OVERRIDE_TX_MOCK],
        });

        await submitRelayQuotes(request);

        const { transactions } = addTransactionBatchMock.mock
          .calls[0][0] as unknown as Record<string, unknown[]>;

        expect(transactions).toHaveLength(3);
        expect(transactions[0]).toStrictEqual(
          expect.objectContaining({
            type: TransactionType.simpleSend,
          }),
        );
        expect(transactions[1]).toStrictEqual(
          expect.objectContaining({
            type: TransactionType.tokenMethodApprove,
          }),
        );
        expect(transactions[2]).toStrictEqual(
          expect.objectContaining({
            type: TransactionType.relayDeposit,
          }),
        );
      });
    });

    describe('post-quote flow', () => {
      beforeEach(() => {
        request.quotes[0].request.isPostQuote = true;
        request.transaction = {
          id: ORIGINAL_TRANSACTION_ID_MOCK,
          txParams: {
            from: FROM_MOCK,
            to: '0xrecipient' as Hex,
            data: '0xorigdata' as Hex,
            value: '0x100' as Hex,
          },
          type: TransactionType.simpleSend,
        } as TransactionMeta;
      });

      it('skips source balance validation', async () => {
        getLiveTokenBalanceMock.mockResolvedValue('0');

        await submitRelayQuotes(request);

        expect(getLiveTokenBalanceMock).not.toHaveBeenCalled();
      });

      it('adds transaction batch with original transaction prepended', async () => {
        await submitRelayQuotes(request);

        expect(addTransactionBatchMock).toHaveBeenCalledTimes(1);
        expect(addTransactionBatchMock).toHaveBeenCalledWith(
          expect.objectContaining({
            from: FROM_MOCK,
            gasFeeToken: undefined,
            networkClientId: NETWORK_CLIENT_ID_MOCK,
            origin: ORIGIN_METAMASK,
            requireApproval: false,
            transactions: [
              {
                params: expect.objectContaining({
                  data: '0xorigdata',
                  to: '0xrecipient',
                  value: '0x100',
                }),
                type: TransactionType.simpleSend,
              },
              {
                params: expect.objectContaining({
                  data: '0x1234',
                  to: '0xfedcb',
                  value: '0x4d2',
                }),
                type: TransactionType.relayDeposit,
              },
            ],
          }),
        );
      });

      it('assigns correct transaction types with multi-step relay (approve + deposit)', async () => {
        // Add a second item to simulate approve + deposit from the relay
        request.quotes[0].original.steps[0].items.push({
          ...request.quotes[0].original.steps[0].items[0],
          data: {
            ...request.quotes[0].original.steps[0].items[0].data,
            data: '0xapprove' as Hex,
            to: '0xapproveTarget' as Hex,
          },
        });

        await submitRelayQuotes(request);

        expect(addTransactionBatchMock).toHaveBeenCalledTimes(1);

        const { transactions } = addTransactionBatchMock.mock
          .calls[0][0] as unknown as Record<string, unknown[]>;

        expect(transactions).toHaveLength(3);
        expect(transactions[0]).toStrictEqual(
          expect.objectContaining({
            type: TransactionType.simpleSend,
          }),
        );
        expect(transactions[1]).toStrictEqual(
          expect.objectContaining({
            type: TransactionType.tokenMethodApprove,
          }),
        );
        expect(transactions[2]).toStrictEqual(
          expect.objectContaining({
            type: TransactionType.relayDeposit,
          }),
        );
      });

      it('uses mapped relay deposit type in post-quote when parent is predictDeposit', async () => {
        request.transaction = {
          ...request.transaction,
          type: TransactionType.predictDeposit,
        } as TransactionMeta;

        await submitRelayQuotes(request);

        expect(addTransactionBatchMock).toHaveBeenCalledTimes(1);
        expect(addTransactionBatchMock).toHaveBeenCalledWith(
          expect.objectContaining({
            transactions: [
              expect.objectContaining({
                type: TransactionType.predictDeposit,
              }),
              expect.objectContaining({
                type: TransactionType.predictRelayDeposit,
              }),
            ],
          }),
        );
      });

      it('does not activate 7702 mode with multiple post-quote gas limits', async () => {
        request.quotes[0].original.metamask.gasLimits = [21000, 21000];

        await submitRelayQuotes(request);

        expect(addTransactionBatchMock).toHaveBeenCalledWith(
          expect.objectContaining({
            disableHook: false,
            disableSequential: false,
            gasLimit7702: undefined,
            transactions: [
              expect.objectContaining({
                params: expect.objectContaining({
                  gas: expect.any(String),
                }),
                type: TransactionType.simpleSend,
              }),
              expect.objectContaining({
                params: expect.objectContaining({
                  gas: expect.any(String),
                }),
                type: TransactionType.relayDeposit,
              }),
            ],
          }),
        );
      });

      describe('with accountOverride', () => {
        const ACCOUNT_OVERRIDE_MOCK = '0xaccountOverride' as Hex;
        const DELEGATION_TO_MOCK = '0xdelegationManager' as Hex;
        const DELEGATION_DATA_MOCK = '0xdelegationdata' as Hex;
        const DELEGATION_VALUE_MOCK = '0x0' as Hex;

        beforeEach(() => {
          request.quotes[0].request.from = ACCOUNT_OVERRIDE_MOCK;
          getDelegationTransactionMock.mockResolvedValue({
            data: DELEGATION_DATA_MOCK,
            to: DELEGATION_TO_MOCK,
            value: DELEGATION_VALUE_MOCK,
          });
        });

        it('passes the original transaction through to getDelegationTransaction', async () => {
          await submitRelayQuotes(request);

          expect(getDelegationTransactionMock).toHaveBeenCalledTimes(1);
          expect(getDelegationTransactionMock).toHaveBeenCalledWith({
            transaction: expect.objectContaining({
              id: ORIGINAL_TRANSACTION_ID_MOCK,
              txParams: expect.objectContaining({
                from: FROM_MOCK,
                to: '0xrecipient',
                data: '0xorigdata',
                value: '0x100',
              }),
            }),
          });
        });

        it('uses the delegation result as the first batch tx', async () => {
          await submitRelayQuotes(request);

          expect(addTransactionBatchMock).toHaveBeenCalledTimes(1);
          expect(addTransactionBatchMock).toHaveBeenCalledWith(
            expect.objectContaining({
              from: ACCOUNT_OVERRIDE_MOCK,
              transactions: [
                expect.objectContaining({
                  params: expect.objectContaining({
                    data: DELEGATION_DATA_MOCK,
                    to: DELEGATION_TO_MOCK,
                    value: DELEGATION_VALUE_MOCK,
                  }),
                  type: TransactionType.simpleSend,
                }),
                expect.objectContaining({
                  params: expect.objectContaining({
                    data: '0x1234',
                    to: '0xfedcb',
                  }),
                  type: TransactionType.relayDeposit,
                }),
              ],
            }),
          );
        });
      });

      it('does not call getDelegationTransaction when accountOverride is not set', async () => {
        await submitRelayQuotes(request);

        expect(getDelegationTransactionMock).not.toHaveBeenCalled();
      });

      it('activates 7702 mode with single combined post-quote gas limit', async () => {
        request.quotes[0].original.metamask.gasLimits = [203093];
        request.quotes[0].original.metamask.is7702 = true;

        await submitRelayQuotes(request);

        expect(addTransactionBatchMock).toHaveBeenCalledWith(
          expect.objectContaining({
            disable7702: false,
            disableHook: true,
            disableSequential: true,
            gasLimit7702: '0x31955',
            transactions: [
              expect.objectContaining({
                params: expect.objectContaining({
                  gas: undefined,
                }),
                type: TransactionType.simpleSend,
              }),
              expect.objectContaining({
                params: expect.objectContaining({
                  gas: undefined,
                }),
                type: TransactionType.relayDeposit,
              }),
            ],
          }),
        );
      });
    });

    it('adds transaction batch with single gasLimit7702', async () => {
      request.quotes[0].original.steps[0].items.push({
        ...request.quotes[0].original.steps[0].items[0],
      });

      request.quotes[0].original.metamask.gasLimits = [42000];
      request.quotes[0].original.metamask.is7702 = true;

      await submitRelayQuotes(request);

      expect(addTransactionBatchMock).toHaveBeenCalledTimes(1);
      expect(addTransactionBatchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          disable7702: false,
          disableHook: true,
          disableSequential: true,
          gasLimit7702: '0xa410',
          transactions: [
            expect.objectContaining({
              params: expect.objectContaining({
                gas: undefined,
              }),
            }),
            expect.objectContaining({
              params: expect.objectContaining({
                gas: undefined,
              }),
            }),
          ],
        }),
      );
    });

    it('adds transaction batch without gasLimit7702 when multiple gas limits', async () => {
      request.quotes[0].original.steps[0].items.push({
        ...request.quotes[0].original.steps[0].items[0],
      });

      request.quotes[0].original.metamask.gasLimits = [21000, 22000];

      await submitRelayQuotes(request);

      expect(addTransactionBatchMock).toHaveBeenCalledTimes(1);
      expect(addTransactionBatchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          disableHook: false,
          disableSequential: false,
          gasLimit7702: undefined,
          transactions: [
            expect.objectContaining({
              params: expect.objectContaining({
                gas: '0x5208',
              }),
            }),
            expect.objectContaining({
              params: expect.objectContaining({
                gas: '0x55f0',
              }),
            }),
          ],
        }),
      );
    });

    it('passes sponsored gas options to same-chain batch submissions', async () => {
      request.transaction.chainId = CHAIN_ID_MOCK;
      request.transaction.isGasFeeSponsored = true;
      request.quotes[0].request.targetChainId = CHAIN_ID_MOCK;
      request.quotes[0].original.details.currencyOut.currency.chainId = 1;
      request.quotes[0].original.steps[0].items.push({
        ...request.quotes[0].original.steps[0].items[0],
      });

      await submitRelayQuotes(request);

      expect(addTransactionBatchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          isGasFeeSponsored: true,
        }),
      );
    });

    it('validates source balance before submitting single transaction', async () => {
      await submitRelayQuotes(request);

      expect(getLiveTokenBalanceMock).toHaveBeenCalledWith(
        messenger,
        FROM_MOCK,
        CHAIN_ID_MOCK,
        TOKEN_ADDRESS_MOCK,
      );
    });

    it('validates source balance before submitting batch transactions', async () => {
      request.quotes[0].original.steps[0].items.push({
        ...request.quotes[0].original.steps[0].items[0],
      });

      await submitRelayQuotes(request);

      expect(getLiveTokenBalanceMock).toHaveBeenCalledWith(
        messenger,
        FROM_MOCK,
        CHAIN_ID_MOCK,
        TOKEN_ADDRESS_MOCK,
      );
    });

    it('throws if source balance is insufficient for single transaction', async () => {
      getLiveTokenBalanceMock.mockResolvedValue('500000');

      await expect(submitRelayQuotes(request)).rejects.toThrow(
        'Relay: Insufficient source token balance for relay deposit. Required: 1000000, Available: 500000',
      );

      expect(addTransactionMock).not.toHaveBeenCalled();
    });

    it('throws if source balance is insufficient for batch transactions', async () => {
      request.quotes[0].original.steps[0].items.push({
        ...request.quotes[0].original.steps[0].items[0],
      });

      getLiveTokenBalanceMock.mockResolvedValue('500000');

      await expect(submitRelayQuotes(request)).rejects.toThrow(
        'Relay: Insufficient source token balance for relay deposit. Required: 1000000, Available: 500000',
      );

      expect(addTransactionBatchMock).not.toHaveBeenCalled();
    });

    it('throws if source balance is zero', async () => {
      getLiveTokenBalanceMock.mockResolvedValue('0');

      await expect(submitRelayQuotes(request)).rejects.toThrow(
        'Relay: Insufficient source token balance for relay deposit. Required: 1000000, Available: 0',
      );

      expect(addTransactionMock).not.toHaveBeenCalled();
    });

    it('proceeds if source balance exactly equals required amount', async () => {
      getLiveTokenBalanceMock.mockResolvedValue(SOURCE_AMOUNT_RAW_MOCK);

      await submitRelayQuotes(request);

      expect(addTransactionMock).toHaveBeenCalledTimes(1);
    });

    it('proceeds if source balance exceeds required amount', async () => {
      getLiveTokenBalanceMock.mockResolvedValue('2000000');

      await submitRelayQuotes(request);

      expect(addTransactionMock).toHaveBeenCalledTimes(1);
    });

    it('throws descriptive error if balance check fails', async () => {
      getLiveTokenBalanceMock.mockRejectedValue(new Error('RPC timeout'));

      await expect(submitRelayQuotes(request)).rejects.toThrow(
        'Relay: Cannot validate payment token balance - RPC timeout',
      );
    });

    describe('HyperLiquid source', () => {
      it('calls submitHyperliquidWithdraw instead of submitTransactions', async () => {
        const { submitHyperliquidWithdraw: hlWithdrawMock } = jest.requireMock(
          './hyperliquid-withdraw',
        );

        request.quotes[0].request.isHyperliquidSource = true;
        request.quotes[0].original.steps[0].kind = 'transaction';

        await submitRelayQuotes(request);

        expect(hlWithdrawMock).toHaveBeenCalledTimes(1);
        expect(hlWithdrawMock).toHaveBeenCalledWith(
          request.quotes[0],
          FROM_MOCK,
          messenger,
        );
        expect(addTransactionMock).not.toHaveBeenCalled();
        expect(addTransactionBatchMock).not.toHaveBeenCalled();
      });

      it('uses quote.request.from (accountOverride) for signing when accountOverride is set', async () => {
        const { submitHyperliquidWithdraw: hlWithdrawMock } = jest.requireMock(
          './hyperliquid-withdraw',
        );

        const ACCOUNT_OVERRIDE_MOCK = '0xaccountOverride' as Hex;

        request.quotes[0].request.isHyperliquidSource = true;
        request.quotes[0].request.from = ACCOUNT_OVERRIDE_MOCK;
        request.quotes[0].original.steps[0].kind = 'transaction';

        await submitRelayQuotes(request);

        expect(hlWithdrawMock).toHaveBeenCalledTimes(1);
        expect(hlWithdrawMock).toHaveBeenCalledWith(
          request.quotes[0],
          ACCOUNT_OVERRIDE_MOCK,
          messenger,
        );
      });

      it('still polls relay status after HyperLiquid withdraw', async () => {
        request.quotes[0].request.isHyperliquidSource = true;

        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => STATUS_RESPONSE_MOCK,
        } as Response);

        const result = await submitRelayQuotes(request);

        expect(result.transactionHash).toBe(TRANSACTION_HASH_MOCK);
        expect(successfulFetchMock).toHaveBeenCalledWith(
          `${RELAY_STATUS_URL}?requestId=${REQUEST_ID_MOCK}`,
          { method: 'GET' },
        );
      });

      it('does not call submitHyperliquidWithdraw for non-HL source', async () => {
        const { submitHyperliquidWithdraw: hlWithdrawMock } = jest.requireMock(
          './hyperliquid-withdraw',
        );

        request.quotes[0].request.isHyperliquidSource = false;

        await submitRelayQuotes(request);

        expect(hlWithdrawMock).not.toHaveBeenCalled();
        expect(addTransactionMock).toHaveBeenCalled();
      });
    });

    describe('Polymarket deposit-wallet source', () => {
      const POLYMARKET_SOURCE_HASH_MOCK: Hex = `0x${'bb'.repeat(32)}`;

      function getPolymarketMocks(): {
        submitPolymarketWithdraw: jest.Mock;
        sweepPolymarketDepositWallet: jest.Mock;
      } {
        const mod = jest.requireMock('./polymarket/withdraw');
        return {
          submitPolymarketWithdraw: mod.submitPolymarketWithdraw as jest.Mock,
          sweepPolymarketDepositWallet:
            mod.sweepPolymarketDepositWallet as jest.Mock,
        };
      }

      beforeEach(() => {
        const { submitPolymarketWithdraw, sweepPolymarketDepositWallet } =
          getPolymarketMocks();
        submitPolymarketWithdraw.mockResolvedValue({
          sourceHash: POLYMARKET_SOURCE_HASH_MOCK,
          preSubmitUsdceBalance: 0n,
        });
        sweepPolymarketDepositWallet.mockResolvedValue(undefined);
        request.quotes[0].request.isPolymarketDepositWallet = true;
        request.quotes[0].original.steps[0].kind = 'transaction';
      });

      it('routes the source leg through submitPolymarketWithdraw and skips submitTransactions', async () => {
        const { submitPolymarketWithdraw } = getPolymarketMocks();

        await submitRelayQuotes(request);

        expect(submitPolymarketWithdraw).toHaveBeenCalledWith(
          request.quotes[0],
          FROM_MOCK,
          messenger,
        );
        expect(addTransactionMock).not.toHaveBeenCalled();
        expect(addTransactionBatchMock).not.toHaveBeenCalled();
      });

      it('runs the USDC.e sweep with the success status on success', async () => {
        const { sweepPolymarketDepositWallet } = getPolymarketMocks();

        await submitRelayQuotes(request);

        expect(sweepPolymarketDepositWallet).toHaveBeenCalledWith(
          FROM_MOCK,
          messenger,
          { relayStatus: 'success', preSubmitUsdceBalance: 0n },
        );
      });

      it('passes the refund status and pre-submit balance to the sweep on refund', async () => {
        const { submitPolymarketWithdraw, sweepPolymarketDepositWallet } =
          getPolymarketMocks();
        submitPolymarketWithdraw.mockResolvedValue({
          sourceHash: POLYMARKET_SOURCE_HASH_MOCK,
          preSubmitUsdceBalance: 1000000n,
        });
        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => ({ status: 'refund' }),
        } as Response);

        await expect(submitRelayQuotes(request)).rejects.toThrow(
          'Relay: Request failed with status: refund',
        );
        expect(sweepPolymarketDepositWallet).toHaveBeenCalledWith(
          FROM_MOCK,
          messenger,
          { relayStatus: 'refund', preSubmitUsdceBalance: 1000000n },
        );
      });

      it('passes the refunded status and pre-submit balance to the sweep on refunded', async () => {
        const { submitPolymarketWithdraw, sweepPolymarketDepositWallet } =
          getPolymarketMocks();
        submitPolymarketWithdraw.mockResolvedValue({
          sourceHash: POLYMARKET_SOURCE_HASH_MOCK,
          preSubmitUsdceBalance: 2500000n,
        });
        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => ({ status: 'refunded' }),
        } as Response);

        await expect(submitRelayQuotes(request)).rejects.toThrow(
          'Relay: Request failed with status: refunded',
        );
        expect(sweepPolymarketDepositWallet).toHaveBeenCalledWith(
          FROM_MOCK,
          messenger,
          { relayStatus: 'refunded', preSubmitUsdceBalance: 2500000n },
        );
      });

      it('returns timeout (tolerated) when Relay polling times out', async () => {
        const { sweepPolymarketDepositWallet } = getPolymarketMocks();
        getRelayPollingTimeoutMock.mockReturnValue(1);
        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => ({ status: 'pending' }),
        } as Response);

        await expect(submitRelayQuotes(request)).rejects.toThrow(
          'Relay: Request failed with status: timeout',
        );
        expect(sweepPolymarketDepositWallet).toHaveBeenCalledWith(
          FROM_MOCK,
          messenger,
          { relayStatus: 'timeout', preSubmitUsdceBalance: 0n },
        );
      });
    });

    describe('EIP-7702 execute path', () => {
      beforeEach(() => {
        request.quotes[0].original.metamask.isExecute = true;
        submitViaRelayExecuteMock.mockResolvedValue(undefined);
      });

      it('delegates to submitViaRelayExecute when isExecute is true', async () => {
        await submitRelayQuotes(request);

        expect(submitViaRelayExecuteMock).toHaveBeenCalledTimes(1);
      });
    });

    describe('atomic: false post-completion', () => {
      const RECIPIENT_MOCK = '0xrecip0000000000000000000000000000000001' as Hex;
      const TARGET_HASH_MOCK =
        '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as Hex;
      const ON_CHAIN_AMOUNT_MOCK = '535000';
      const MINIMUM_AMOUNT_MOCK = '530000';
      const VAULT_HASH_MOCK =
        '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' as Hex;
      const TARGET_CHAIN_ID_MOCK = '0x2797' as Hex;
      const TARGET_TOKEN_ADDRESS_MOCK =
        '0xtoken000000000000000000000000000000001' as Hex;

      beforeEach(() => {
        request.quotes[0].request.atomic = false;
        request.quotes[0].request.recipient = RECIPIENT_MOCK;
        request.quotes[0].request.targetChainId = TARGET_CHAIN_ID_MOCK;
        request.quotes[0].request.targetTokenAddress =
          TARGET_TOKEN_ADDRESS_MOCK;
        request.quotes[0].original.details.currencyOut = {
          ...request.quotes[0].original.details.currencyOut,
          currency: {
            ...request.quotes[0].original.details.currencyOut.currency,
            decimals: 6,
          },
          minimumAmount: MINIMUM_AMOUNT_MOCK,
        };

        submitMoneyAccountVaultDepositMock.mockResolvedValue({
          transactionHash: VAULT_HASH_MOCK,
        });

        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => ({
            status: 'success',
            inTxHashes: [SOURCE_HASH_MOCK],
            txHashes: [TARGET_HASH_MOCK],
          }),
        } as Response);
      });

      it('resolves settled amount from on-chain Transfer log and submits vault deposit', async () => {
        getTransferredAmountFromTxHashMock.mockResolvedValue({
          amountRaw: ON_CHAIN_AMOUNT_MOCK,
          blockNumber: undefined,
        });

        const result = await submitRelayQuotes(request);

        expect(getTransferredAmountFromTxHashMock).toHaveBeenCalledWith({
          messenger: expect.anything(),
          txHash: TARGET_HASH_MOCK,
          chainId: TARGET_CHAIN_ID_MOCK,
          tokenAddress: TARGET_TOKEN_ADDRESS_MOCK,
          walletAddress: RECIPIENT_MOCK,
        });
        expect(submitMoneyAccountVaultDepositMock).toHaveBeenCalledWith(
          expect.objectContaining({
            sourceAmountRaw: ON_CHAIN_AMOUNT_MOCK,
            moneyAccountAddress: RECIPIENT_MOCK,
            vaultDisabled: false,
          }),
        );
        expect(result).toStrictEqual({ transactionHash: VAULT_HASH_MOCK });
      });

      it('falls back to quote minimum output when on-chain amount is unavailable', async () => {
        getTransferredAmountFromTxHashMock.mockResolvedValue({
          amountRaw: undefined,
          blockNumber: undefined,
        });

        await submitRelayQuotes(request);

        expect(submitMoneyAccountVaultDepositMock).toHaveBeenCalledWith(
          expect.objectContaining({ sourceAmountRaw: MINIMUM_AMOUNT_MOCK }),
        );
      });

      it('falls back to quote minimum output when on-chain read throws', async () => {
        getTransferredAmountFromTxHashMock.mockRejectedValue(
          new Error('rpc error'),
        );

        await submitRelayQuotes(request);

        expect(submitMoneyAccountVaultDepositMock).toHaveBeenCalledWith(
          expect.objectContaining({ sourceAmountRaw: MINIMUM_AMOUNT_MOCK }),
        );
      });

      it('skips on-chain read and uses quote minimum when targetHash is FALLBACK_HASH', async () => {
        successfulFetchMock.mockResolvedValue({
          ok: true,
          json: async () => ({
            status: 'success',
            inTxHashes: [SOURCE_HASH_MOCK],
            txHashes: [FALLBACK_HASH],
          }),
        } as Response);

        await submitRelayQuotes(request);

        expect(getTransferredAmountFromTxHashMock).not.toHaveBeenCalled();
        expect(submitMoneyAccountVaultDepositMock).toHaveBeenCalledWith(
          expect.objectContaining({ sourceAmountRaw: MINIMUM_AMOUNT_MOCK }),
        );
      });

      it('throws when neither on-chain nor quote-minimum amount is available', async () => {
        request.quotes[0].original.details.currencyOut.minimumAmount = '';
        getTransferredAmountFromTxHashMock.mockResolvedValue({
          amountRaw: undefined,
          blockNumber: undefined,
        });

        await expect(submitRelayQuotes(request)).rejects.toThrow(
          'Cannot resolve post-completion amount',
        );
      });

      it('falls back to completion targetHash when submit returns no hash', async () => {
        getTransferredAmountFromTxHashMock.mockResolvedValue({
          amountRaw: ON_CHAIN_AMOUNT_MOCK,
          blockNumber: undefined,
        });
        submitMoneyAccountVaultDepositMock.mockResolvedValue({
          transactionHash: undefined,
        });

        const result = await submitRelayQuotes(request);

        expect(result).toStrictEqual({ transactionHash: TARGET_HASH_MOCK });
      });

      it('falls back to quote.request.from when no recipient is set', async () => {
        request.quotes[0].request.recipient = undefined;
        getTransferredAmountFromTxHashMock.mockResolvedValue({
          amountRaw: ON_CHAIN_AMOUNT_MOCK,
          blockNumber: undefined,
        });

        await submitRelayQuotes(request);

        expect(getTransferredAmountFromTxHashMock).toHaveBeenCalledWith(
          expect.objectContaining({ walletAddress: FROM_MOCK }),
        );
        expect(submitMoneyAccountVaultDepositMock).toHaveBeenCalledWith(
          expect.objectContaining({ moneyAccountAddress: FROM_MOCK }),
        );
      });

      describe('post-quote flow', () => {
        const DEPOSIT_CALLS_MOCK: BatchTransactionParams[] = [
          {
            to: '0xapprove0000000000000000000000000000001' as Hex,
            data: '0xapprove' as Hex,
            value: '0x0' as Hex,
          },
          {
            to: '0xteller00000000000000000000000000000001' as Hex,
            data: '0xdeposit' as Hex,
            value: '0x0' as Hex,
          },
        ];

        beforeEach(() => {
          request.quotes[0].request.isPostQuote = true;
          getControllerStateMock.mockReturnValue({
            transactionData: {
              [ORIGINAL_TRANSACTION_ID_MOCK]: {},
            },
          } as never);
          getPaymentOverrideDataMock.mockResolvedValue({
            calls: DEPOSIT_CALLS_MOCK,
          });
          getTransferredAmountFromTxHashMock.mockResolvedValue({
            amountRaw: ON_CHAIN_AMOUNT_MOCK,
            blockNumber: undefined,
          });
        });

        it('calls getPaymentOverrideData with the settled amount (in human units) and forwards deposit calls', async () => {
          await submitRelayQuotes(request);

          expect(getPaymentOverrideDataMock).toHaveBeenCalledWith({
            // 535000 raw with 6 decimals → 0.535 human
            amount: '0.535',
            transaction: expect.objectContaining({
              id: ORIGINAL_TRANSACTION_ID_MOCK,
            }),
            transactionData: expect.anything(),
          });
          expect(submitMoneyAccountVaultDepositMock).toHaveBeenCalledWith(
            expect.objectContaining({
              depositCalls: DEPOSIT_CALLS_MOCK,
              sourceAmountRaw: ON_CHAIN_AMOUNT_MOCK,
            }),
          );
        });

        it('forwards undefined depositCalls when getPaymentOverrideData returns no calls', async () => {
          getPaymentOverrideDataMock.mockResolvedValue({ calls: [] });

          await submitRelayQuotes(request);

          expect(submitMoneyAccountVaultDepositMock).toHaveBeenCalledWith(
            expect.objectContaining({
              depositCalls: undefined,
              sourceAmountRaw: ON_CHAIN_AMOUNT_MOCK,
            }),
          );
        });
      });

      describe('non-post-quote flow', () => {
        beforeEach(() => {
          request.quotes[0].request.isPostQuote = false;
          getTransferredAmountFromTxHashMock.mockResolvedValue({
            amountRaw: ON_CHAIN_AMOUNT_MOCK,
            blockNumber: undefined,
          });
        });

        it('does not call getPaymentOverrideData and forwards no depositCalls', async () => {
          await submitRelayQuotes(request);

          expect(getPaymentOverrideDataMock).not.toHaveBeenCalled();
          expect(submitMoneyAccountVaultDepositMock).toHaveBeenCalledWith(
            expect.objectContaining({ depositCalls: undefined }),
          );
        });
      });
    });
  });
});
