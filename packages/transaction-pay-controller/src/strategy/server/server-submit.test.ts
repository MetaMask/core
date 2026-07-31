import { successfulFetch } from '@metamask/controller-utils';
import { TransactionStatus } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { cloneDeep } from 'lodash';

import { PaymentOverride } from '../../constants.js';
import { getMessengerMock } from '../../tests/messenger-mock.js';
import type {
  PayStrategyExecuteRequest,
  TransactionPayQuote,
} from '../../types.js';
import {
  getServerPollingInterval,
  getServerPollingTimeout,
} from '../../utils/feature-flags.js';
import { getLiveTokenBalance } from '../../utils/token.js';
import {
  collectTransactionIds,
  getTransaction,
  waitForTransactionConfirmed,
} from '../../utils/transaction.js';
import { getServerStatus, submitServerIntent } from './server-api.js';
import { submitServerQuotes } from './server-submit.js';
import { ServerProviderName, ServerStatus } from './types.js';
import type { ServerQuote, ServerSignatureStep } from './types.js';

jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  successfulFetch: jest.fn(),
}));
jest.mock('../../utils/feature-flags');
jest.mock('../../utils/token', () => ({
  ...jest.requireActual('../../utils/token'),
  getLiveTokenBalance: jest.fn(),
}));
jest.mock('../../utils/transaction', () => ({
  ...jest.requireActual('../../utils/transaction'),
  collectTransactionIds: jest.fn(),
  getTransaction: jest.fn(),
  waitForTransactionConfirmed: jest.fn(),
}));
jest.mock('./server-api');

const NETWORK_CLIENT_ID_MOCK = 'networkClientIdMock';
const ORIGINAL_TRANSACTION_ID_MOCK = 'original-transaction-id';
const ORIGINAL_FROM_MOCK = '0x1111111111111111111111111111111111111111' as Hex;
const QUOTE_FROM_MOCK = '0x2222222222222222222222222222222222222222' as Hex;
const SOURCE_CHAIN_ID_MOCK = '0x89' as Hex;
const TARGET_HASH_MOCK = '0xtarget' as Hex;
const SOURCE_HASH_MOCK = '0xsource' as Hex;

const TRANSACTION_META_MOCK = {
  chainId: '0x1',
  id: ORIGINAL_TRANSACTION_ID_MOCK,
  networkClientId: 'mainnet',
  status: TransactionStatus.unapproved,
  time: 12345,
  txParams: {
    from: ORIGINAL_FROM_MOCK,
    nonce: '0x7' as Hex,
    to: '0x3333333333333333333333333333333333333333' as Hex,
    value: '0x0' as Hex,
  },
} as TransactionMeta;

const ORIGINAL_QUOTE_MOCK: ServerQuote = {
  client: {
    gasLimits: [25000],
    is7702: false,
    maxFeePerGas: '1000000000',
    maxPriorityFeePerGas: '500000000',
  },
  duration: 30,
  fees: { metamask: '0', provider: '0', subsidized: false },
  gasless: true,
  id: 'server-intent-id',
  input: {
    chainId: 137,
    decimals: 6,
    formatted: '1.23',
    raw: '1230000',
    token: '0x5555555555555555555555555555555555555555' as Hex,
  },
  output: {
    chainId: 1,
    decimals: 6,
    formatted: '1',
    raw: '1000000',
    token: '0x6666666666666666666666666666666666666666' as Hex,
  },
  provider: ServerProviderName.Relay,
  steps: [
    {
      type: 'transaction' as const,
      chainId: 137,
      data: '0xstepdata' as Hex,
      to: '0x4444444444444444444444444444444444444444' as Hex,
      value: '0x10',
    },
  ],
};

const QUOTE_MOCK = {
  dust: { fiat: '0', usd: '0' },
  estimatedDuration: 30,
  fees: {
    metaMask: { fiat: '0', usd: '0' },
    provider: { fiat: '0', usd: '0' },
    sourceNetwork: {
      estimate: { fiat: '0', human: '0', raw: '0', usd: '0' },
      max: { fiat: '0', human: '0', raw: '0', usd: '0' },
    },
    targetNetwork: { fiat: '0', usd: '0' },
  },
  original: ORIGINAL_QUOTE_MOCK,
  request: {
    from: QUOTE_FROM_MOCK,
    sourceBalanceRaw: '10000000',
    sourceChainId: SOURCE_CHAIN_ID_MOCK,
    sourceTokenAddress: '0x5555555555555555555555555555555555555555' as Hex,
    sourceTokenAmount: '1230000',
    targetAmountMinimum: '1000000',
    targetChainId: '0x1' as Hex,
    targetTokenAddress: '0x6666666666666666666666666666666666666666' as Hex,
  },
  sourceAmount: { fiat: '1', human: '1', raw: '1230000', usd: '1' },
  strategy: 'server',
  targetAmount: { fiat: '1', usd: '1' },
} as TransactionPayQuote<ServerQuote>;

const DELEGATION_MOCK = {
  authorizationList: [
    {
      address: '0x7777777777777777777777777777777777777777' as Hex,
      chainId: '0x89' as Hex,
      nonce: '0x2' as Hex,
      r: '0xr' as Hex,
      s: '0xs' as Hex,
      yParity: '0x1' as Hex,
    },
  ],
  data: '0xdelegationdata' as Hex,
  to: '0x8888888888888888888888888888888888888888' as Hex,
  value: '0x10' as Hex,
};

describe('submitServerQuotes', () => {
  const getLiveTokenBalanceMock = jest.mocked(getLiveTokenBalance);
  const getServerPollingIntervalMock = jest.mocked(getServerPollingInterval);
  const getServerPollingTimeoutMock = jest.mocked(getServerPollingTimeout);
  const getServerStatusMock = jest.mocked(getServerStatus);
  const submitServerIntentMock = jest.mocked(submitServerIntent);

  const {
    addTransactionMock: addTxMock,
    addTransactionBatchMock: addTxBatchMock,
    findNetworkClientIdByChainIdMock,
    getControllerStateMock,
    getDelegationTransactionMock,
    getPaymentOverrideDataMock,
    getTransactionControllerStateMock,
    messenger,
    updateTransactionMock,
  } = getMessengerMock();

  let currentTransaction: TransactionMeta;
  let request: PayStrategyExecuteRequest<ServerQuote>;

  beforeEach(() => {
    jest.resetAllMocks();

    currentTransaction = cloneDeep(TRANSACTION_META_MOCK);
    request = {
      accountSupports7702: true,
      isSmartTransaction: (): boolean => false,
      messenger,
      quotes: [cloneDeep(QUOTE_MOCK)],
      transaction: cloneDeep(TRANSACTION_META_MOCK),
    };

    findNetworkClientIdByChainIdMock.mockReturnValue(NETWORK_CLIENT_ID_MOCK);
    getDelegationTransactionMock.mockResolvedValue(DELEGATION_MOCK);
    getLiveTokenBalanceMock.mockResolvedValue('999999999999999999');
    getServerPollingIntervalMock.mockReturnValue(0);
    getServerPollingTimeoutMock.mockReturnValue(undefined);
    getServerStatusMock.mockResolvedValue({
      status: ServerStatus.Confirmed,
      targetHash: TARGET_HASH_MOCK,
    });
    getTransactionControllerStateMock.mockImplementation(
      () => ({ transactions: [currentTransaction] }) as never,
    );
    submitServerIntentMock.mockResolvedValue({ success: true });
    updateTransactionMock.mockImplementation((transaction) => {
      currentTransaction = transaction;
    });
  });

  it('submits with mapped fields from the quote and delegation', async () => {
    await submitServerQuotes(request);

    expect(submitServerIntentMock).toHaveBeenCalledWith(messenger, {
      authorizationList: [
        {
          address: DELEGATION_MOCK.authorizationList[0].address,
          chainId: 137,
          nonce: 2,
          r: DELEGATION_MOCK.authorizationList[0].r,
          s: DELEGATION_MOCK.authorizationList[0].s,
          yParity: 1,
        },
      ],
      chainId: 137,
      data: DELEGATION_MOCK.data,
      id: ORIGINAL_QUOTE_MOCK.id,
      provider: ServerProviderName.Relay,
      to: DELEGATION_MOCK.to,
      value: '16',
    });
  });

  it('omits authorizationList when delegation has no authorization entries', async () => {
    getDelegationTransactionMock.mockResolvedValue({
      ...DELEGATION_MOCK,
      authorizationList: [],
    });

    await submitServerQuotes(request);

    expect(submitServerIntentMock).toHaveBeenCalledWith(
      messenger,
      expect.not.objectContaining({ authorizationList: expect.anything() }),
    );
  });

  it('uses quote.request.from for the delegation transaction', async () => {
    await submitServerQuotes(request);

    expect(getDelegationTransactionMock).toHaveBeenCalledWith({
      transaction: expect.objectContaining({
        chainId: SOURCE_CHAIN_ID_MOCK,
        nestedTransactions: [
          {
            data: ORIGINAL_QUOTE_MOCK.steps[0].data,
            to: ORIGINAL_QUOTE_MOCK.steps[0].to,
            value: ORIGINAL_QUOTE_MOCK.steps[0].value,
          },
        ],
        networkClientId: NETWORK_CLIENT_ID_MOCK,
        txParams: expect.objectContaining({ from: QUOTE_FROM_MOCK }),
      }),
    });
  });

  it('throws when the submit response is unsuccessful', async () => {
    submitServerIntentMock.mockResolvedValue({
      error: 'provider rejected',
      success: false,
    });

    await expect(submitServerQuotes(request)).rejects.toThrow(
      'Server submit failed: provider rejected',
    );
  });

  it('falls back to unknown when submit response has no error message', async () => {
    submitServerIntentMock.mockResolvedValue({ success: false });

    await expect(submitServerQuotes(request)).rejects.toThrow(
      'Server submit failed: unknown',
    );
  });

  it('polls until confirmed and returns the target hash', async () => {
    getServerStatusMock
      .mockResolvedValueOnce({ status: ServerStatus.Submitted })
      .mockResolvedValueOnce({
        status: ServerStatus.Confirmed,
        targetHash: TARGET_HASH_MOCK,
      });

    const result = await submitServerQuotes(request);

    expect(result).toStrictEqual({ transactionHash: TARGET_HASH_MOCK });
    expect(getServerStatusMock).toHaveBeenCalledTimes(2);
  });

  it('marks the parent transaction isIntentComplete after confirmation', async () => {
    getServerStatusMock.mockResolvedValue({
      status: ServerStatus.Confirmed,
      targetHash: TARGET_HASH_MOCK,
    });

    await submitServerQuotes(request);

    const completionUpdate = updateTransactionMock.mock.calls.find(
      ([, note]) => note === 'Intent complete after Server completion',
    );
    expect(completionUpdate).toBeDefined();
    expect(completionUpdate?.[0]).toStrictEqual(
      expect.objectContaining({ isIntentComplete: true }),
    );
  });

  it('does not mark isIntentComplete when polling fails', async () => {
    getServerStatusMock.mockResolvedValue({ status: ServerStatus.Failed });

    await expect(submitServerQuotes(request)).rejects.toThrow(
      'Server intent failed',
    );

    const completionUpdate = updateTransactionMock.mock.calls.find(
      ([, note]) => note === 'Intent complete after Server completion',
    );
    expect(completionUpdate).toBeUndefined();
  });

  it('throws on failed status', async () => {
    getServerStatusMock.mockResolvedValue({ status: ServerStatus.Failed });

    await expect(submitServerQuotes(request)).rejects.toThrow(
      'Server intent failed',
    );
  });

  it('throws on refunded status', async () => {
    getServerStatusMock.mockResolvedValue({ status: ServerStatus.Refunded });

    await expect(submitServerQuotes(request)).rejects.toThrow(
      'Server intent refunded',
    );
  });

  it('honors the polling timeout and includes the last status', async () => {
    const dateNowMock = jest
      .spyOn(Date, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(110);

    getServerPollingTimeoutMock.mockReturnValue(5);
    getServerStatusMock.mockResolvedValue({ status: ServerStatus.Pending });

    await expect(submitServerQuotes(request)).rejects.toThrow(
      'Server polling timed out (last status: PENDING)',
    );

    dateNowMock.mockRestore();
  });

  it('omits last status detail when polling times out before any status is received', async () => {
    const dateNowMock = jest
      .spyOn(Date, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(110);

    getServerPollingTimeoutMock.mockReturnValue(5);
    getServerStatusMock.mockRejectedValue(new Error('network error'));

    await expect(submitServerQuotes(request)).rejects.toThrow(
      /^Server polling timed out$/u,
    );

    dateNowMock.mockRestore();
  });

  it('emits the source hash once when it appears in status', async () => {
    getServerStatusMock
      .mockResolvedValueOnce({
        sourceHash: SOURCE_HASH_MOCK,
        status: ServerStatus.Submitted,
      })
      .mockResolvedValueOnce({
        sourceHash: '0xsecondsource' as Hex,
        status: ServerStatus.Confirmed,
        targetHash: TARGET_HASH_MOCK,
      });

    await submitServerQuotes(request);

    const sourceHashUpdates = updateTransactionMock.mock.calls.filter(
      ([, note]) => note === 'Add source hash from server status',
    );

    expect(sourceHashUpdates).toHaveLength(1);
    expect(currentTransaction.metamaskPay?.sourceHash).toBe(SOURCE_HASH_MOCK);
  });

  it('does not call TransactionController submit actions', async () => {
    await submitServerQuotes(request);

    expect(addTxMock).not.toHaveBeenCalled();
    expect(addTxBatchMock).not.toHaveBeenCalled();
  });

  it('falls back to 0x / 0x0 for undefined data and value in override calls', async () => {
    getControllerStateMock.mockReturnValue({
      transactionData: {},
      transactions: [],
    } as never);
    getPaymentOverrideDataMock.mockResolvedValue({
      calls: [{ to: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex }],
      recipient: undefined,
      authorizationList: undefined,
    } as never);

    const req = {
      ...request,
      quotes: [
        {
          ...cloneDeep(QUOTE_MOCK),
          request: {
            ...QUOTE_MOCK.request,
            paymentOverride: PaymentOverride.MoneyAccount,
          },
        },
      ],
    };

    await submitServerQuotes(req);

    expect(submitServerIntentMock).toHaveBeenCalledWith(
      messenger,
      expect.objectContaining({ data: DELEGATION_MOCK.data }),
    );
  });

  it('continues polling when getServerStatus throws a network error', async () => {
    getServerStatusMock
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValue({ status: ServerStatus.Confirmed });

    await submitServerQuotes(request);

    expect(getServerStatusMock).toHaveBeenCalledTimes(2);
  });

  describe('non-gasless fallback', () => {
    const collectTransactionIdsMock = jest.mocked(collectTransactionIds);
    const getTransactionMock = jest.mocked(getTransaction);
    const waitForTransactionConfirmedMock = jest.mocked(
      waitForTransactionConfirmed,
    );
    const SUBMITTED_TX_ID_MOCK = 'submitted-tx-id';
    const SUBMITTED_TX_HASH_MOCK = '0xsubmittedtx' as Hex;

    beforeEach(() => {
      collectTransactionIdsMock.mockImplementation(
        (_chainId, _from, _messenger, onTransactionId) => {
          onTransactionId(SUBMITTED_TX_ID_MOCK);
          return { end: jest.fn() };
        },
      );
      getTransactionMock.mockReturnValue({
        hash: SUBMITTED_TX_HASH_MOCK,
      } as TransactionMeta);
      waitForTransactionConfirmedMock.mockResolvedValue(undefined);
      addTxMock.mockResolvedValue({
        result: Promise.resolve(SUBMITTED_TX_HASH_MOCK),
      } as never);
      addTxBatchMock.mockResolvedValue({
        batchId: 'batch-id',
      } as never);
    });

    const buildNonGaslessRequest = (
      overrides: Partial<ServerQuote> = {},
    ): PayStrategyExecuteRequest<ServerQuote> => {
      const quote = cloneDeep(QUOTE_MOCK);
      quote.original = {
        ...quote.original,
        gasless: false,
        ...overrides,
      };
      return {
        accountSupports7702: true,
        isSmartTransaction: (): boolean => false,
        messenger,
        quotes: [quote],
        transaction: cloneDeep(TRANSACTION_META_MOCK),
      };
    };

    it('uses addTransaction when the quote has a single step', async () => {
      await submitServerQuotes(buildNonGaslessRequest());

      expect(addTxMock).toHaveBeenCalledTimes(1);
      expect(addTxBatchMock).not.toHaveBeenCalled();
      expect(submitServerIntentMock).not.toHaveBeenCalled();
    });

    it('uses addTransactionBatch when the quote has multiple steps', async () => {
      await submitServerQuotes(
        buildNonGaslessRequest({
          steps: [
            ORIGINAL_QUOTE_MOCK.steps[0],
            {
              type: 'transaction' as const,
              chainId: 137,
              data: '0xseconddata' as Hex,
              to: '0x9999999999999999999999999999999999999999' as Hex,
              value: '0x20',
            },
          ],
        }),
      );

      expect(addTxBatchMock).toHaveBeenCalledTimes(1);
      expect(addTxMock).not.toHaveBeenCalled();
    });

    it('passes gasFeeToken when fees.isSourceGasFeeToken is true', async () => {
      const reqWithGasFeeToken = buildNonGaslessRequest();
      reqWithGasFeeToken.quotes[0].fees.isSourceGasFeeToken = true;

      await submitServerQuotes(reqWithGasFeeToken);

      expect(addTxMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          gasFeeToken: reqWithGasFeeToken.quotes[0].request.sourceTokenAddress,
        }),
      );
    });

    it('records submitted transaction ids onto requiredTransactionIds', async () => {
      await submitServerQuotes(buildNonGaslessRequest());

      const requiredUpdate = updateTransactionMock.mock.calls.find(
        ([, note]) =>
          note === 'Add required transaction ID from server submission',
      );
      expect(requiredUpdate).toBeDefined();
    });

    it('still polls /status after submitting via TransactionController', async () => {
      await submitServerQuotes(buildNonGaslessRequest());

      expect(getServerStatusMock).toHaveBeenCalled();
    });

    it('throws when the quote has no steps', async () => {
      await expect(
        submitServerQuotes(buildNonGaslessRequest({ steps: [] })),
      ).rejects.toThrow('Server quote has no steps to submit');
    });

    it('records source hash onto transaction after non-gasless submission', async () => {
      await submitServerQuotes(buildNonGaslessRequest());

      const sourceHashUpdate = updateTransactionMock.mock.calls.find(
        ([, note]) =>
          note === 'Add source hash from server transaction submission',
      );
      expect(sourceHashUpdate).toBeDefined();
      expect(sourceHashUpdate?.[0]).toStrictEqual(
        expect.objectContaining({
          metamaskPay: expect.objectContaining({
            sourceHash: SUBMITTED_TX_HASH_MOCK,
          }),
        }),
      );
    });

    it('skips source hash update when no transaction ids were collected', async () => {
      collectTransactionIdsMock.mockImplementation(() => ({ end: jest.fn() }));

      await submitServerQuotes(buildNonGaslessRequest());

      const sourceHashUpdate = updateTransactionMock.mock.calls.find(
        ([, note]) =>
          note === 'Add source hash from server transaction submission',
      );
      expect(sourceHashUpdate).toBeUndefined();
    });

    it('includes gas fields in transaction params when step provides them', async () => {
      await submitServerQuotes(
        buildNonGaslessRequest({
          steps: [
            {
              ...ORIGINAL_QUOTE_MOCK.steps[0],
              gasLimit: '21000',
              maxFeePerGas: '1000000000',
              maxPriorityFeePerGas: '500000000',
            },
          ],
        }),
      );

      expect(addTxMock).toHaveBeenCalledWith(
        expect.objectContaining({
          gas: expect.any(String),
          maxFeePerGas: expect.any(String),
          maxPriorityFeePerGas: expect.any(String),
        }),
        expect.anything(),
      );
    });

    it('uses step.gasLimit when no client gasLimit is provided for the step', async () => {
      const req = buildNonGaslessRequest({
        client: {
          gasLimits: [],
          is7702: false,
          maxFeePerGas: '1000000000',
          maxPriorityFeePerGas: '500000000',
        },
        steps: [
          {
            ...ORIGINAL_QUOTE_MOCK.steps[0],
            gasLimit: '30000',
          },
        ],
      });

      await submitServerQuotes(req);

      expect(addTxMock).toHaveBeenCalledWith(
        expect.objectContaining({ gas: expect.any(String) }),
        expect.anything(),
      );
    });

    it('omits gas fields when neither client gasLimit nor step gasLimit is present', async () => {
      const req = buildNonGaslessRequest({
        client: {
          gasLimits: [],
          is7702: false,
          maxFeePerGas: undefined,
          maxPriorityFeePerGas: undefined,
        },
        steps: [{ ...ORIGINAL_QUOTE_MOCK.steps[0] }],
      });

      await submitServerQuotes(req);

      expect(addTxMock).toHaveBeenCalledWith(
        expect.objectContaining({ gas: undefined }),
        expect.anything(),
      );
    });

    it('uses is7702 gasLimit7702 and disable7702:false when quote is 7702 with multiple steps', async () => {
      const req = buildNonGaslessRequest({
        client: {
          gasLimits: [21000, 25000],
          is7702: true,
          maxFeePerGas: '1000000000',
          maxPriorityFeePerGas: '500000000',
        },
        steps: [
          ORIGINAL_QUOTE_MOCK.steps[0],
          {
            type: 'transaction' as const,
            chainId: 137,
            data: '0xseconddata' as Hex,
            to: '0x9999999999999999999999999999999999999999' as Hex,
            value: '0x20',
          },
        ],
      });

      await submitServerQuotes(req);

      expect(addTxBatchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          disable7702: false,
          gasLimit7702: expect.any(String),
        }),
      );
    });
  });

  describe('signature steps', () => {
    const SIGNATURE_MOCK = `0x${'a'.repeat(64)}${'b'.repeat(64)}1c`;
    const SIGNATURE_STEP_MOCK: ServerSignatureStep = {
      type: 'signature' as const,
      sign: {
        domain: { name: 'Test', chainId: 137 },
        types: { Order: [{ name: 'amount', type: 'uint256' }] },
        primaryType: 'Order',
        value: { amount: '1000' },
      },
      post: {
        endpoint: 'https://api.example.com/sign',
        method: 'POST',
        body: { orderId: 'abc' },
        signatureFormat: 'queryParam' as const,
      },
    };

    const signTypedMessageMock = jest.fn();
    const successfulFetchMock = jest.mocked(successfulFetch);

    // Register the handler once — can't re-register after the first test.
    // The outer beforeEach resets mock implementations so we re-apply in
    // our own beforeEach which runs after the outer one.
    beforeAll(() => {
      messenger.registerActionHandler(
        'KeyringController:signTypedMessage' as never,
        signTypedMessageMock as never,
      );
    });

    beforeEach(() => {
      signTypedMessageMock.mockResolvedValue(SIGNATURE_MOCK);
      successfulFetchMock.mockResolvedValue({
        json: jest.fn().mockResolvedValue({ success: true }),
      } as never);
    });

    const buildSignatureRequest = (
      overrides: Partial<ServerQuote> = {},
    ): PayStrategyExecuteRequest<ServerQuote> => {
      const quote = cloneDeep(QUOTE_MOCK);
      quote.original = {
        ...quote.original,
        steps: [SIGNATURE_STEP_MOCK],
        gasless: true,
        ...overrides,
      };
      return {
        accountSupports7702: true,
        isSmartTransaction: (): boolean => false,
        messenger,
        quotes: [quote],
        transaction: cloneDeep(TRANSACTION_META_MOCK),
      };
    };

    it('signs and POSTs signature step with queryParam format', async () => {
      await submitServerQuotes(buildSignatureRequest());

      expect(successfulFetchMock).toHaveBeenCalledWith(
        `${SIGNATURE_STEP_MOCK.post.endpoint}?signature=${SIGNATURE_MOCK}`,
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('signs and POSTs signature step with rsv format', async () => {
      successfulFetchMock.mockResolvedValue({
        json: jest.fn().mockResolvedValue({ status: 'ok' }),
      } as never);

      const rsvStep: ServerSignatureStep = {
        ...SIGNATURE_STEP_MOCK,
        post: { ...SIGNATURE_STEP_MOCK.post, signatureFormat: 'rsv' as const },
      };

      await submitServerQuotes(buildSignatureRequest({ steps: [rsvStep] }));

      expect(successfulFetchMock).toHaveBeenCalledWith(
        SIGNATURE_STEP_MOCK.post.endpoint,
        expect.objectContaining({
          body: expect.stringContaining('"signature"'),
        }),
      );
    });

    it('throws when rsv POST response status is not ok', async () => {
      successfulFetchMock.mockResolvedValue({
        json: jest
          .fn()
          .mockResolvedValue({ status: 'error', message: 'rejected' }),
      } as never);

      const rsvStep: ServerSignatureStep = {
        ...SIGNATURE_STEP_MOCK,
        post: { ...SIGNATURE_STEP_MOCK.post, signatureFormat: 'rsv' as const },
      };

      await expect(
        submitServerQuotes(buildSignatureRequest({ steps: [rsvStep] })),
      ).rejects.toThrow('Signature step rejected by server');
    });

    it('throws when signature POST fails', async () => {
      successfulFetchMock.mockRejectedValue(new Error('network error'));

      await expect(submitServerQuotes(buildSignatureRequest())).rejects.toThrow(
        'Signature step POST failed: network error',
      );
    });

    it('no-ops transaction phase when gasless quote has only signature steps', async () => {
      await submitServerQuotes(buildSignatureRequest());

      expect(addTxMock).not.toHaveBeenCalled();
      expect(addTxBatchMock).not.toHaveBeenCalled();
      expect(submitServerIntentMock).not.toHaveBeenCalled();
      expect(getServerStatusMock).toHaveBeenCalled();
    });

    it('does not throw for a signature-only non-gasless quote (no transaction steps)', async () => {
      const quote = cloneDeep(QUOTE_MOCK);
      quote.original.steps = [SIGNATURE_STEP_MOCK];
      quote.original.gasless = false;

      successfulFetchMock.mockResolvedValue({
        json: async () => ({}),
        ok: true,
      } as Response);

      const req: PayStrategyExecuteRequest<ServerQuote> = {
        accountSupports7702: true,
        isSmartTransaction: (): boolean => false,
        messenger,
        quotes: [quote],
        transaction: cloneDeep(TRANSACTION_META_MOCK),
      };

      await submitServerQuotes(req);

      expect(successfulFetchMock).toHaveBeenCalled();
    });
  });

  describe('validateSourceBalance', () => {
    it('throws when source balance is insufficient', async () => {
      jest.mocked(getLiveTokenBalance).mockResolvedValue('0');

      const quote = cloneDeep(QUOTE_MOCK);
      quote.original.gasless = false;
      const req: PayStrategyExecuteRequest<ServerQuote> = {
        accountSupports7702: true,
        isSmartTransaction: (): boolean => false,
        messenger,
        quotes: [quote],
        transaction: cloneDeep(TRANSACTION_META_MOCK),
      };

      await expect(submitServerQuotes(req)).rejects.toThrow(
        'Insufficient source token balance',
      );
    });

    it('wraps getLiveTokenBalance errors with context message', async () => {
      jest
        .mocked(getLiveTokenBalance)
        .mockRejectedValue(new Error('RPC timeout'));

      const quote = cloneDeep(QUOTE_MOCK);
      quote.original.gasless = false;
      const req: PayStrategyExecuteRequest<ServerQuote> = {
        accountSupports7702: true,
        isSmartTransaction: (): boolean => false,
        messenger,
        quotes: [quote],
        transaction: cloneDeep(TRANSACTION_META_MOCK),
      };

      await expect(submitServerQuotes(req)).rejects.toThrow(
        'Cannot validate payment token balance - RPC timeout',
      );
    });
  });

  describe('buildTransactionParams', () => {
    const buildRequest = (
      overrides: Partial<TransactionPayQuote<ServerQuote>> = {},
    ): PayStrategyExecuteRequest<ServerQuote> => {
      const quote = { ...cloneDeep(QUOTE_MOCK), ...overrides };
      quote.original.gasless = false;
      return {
        accountSupports7702: true,
        isSmartTransaction: (): boolean => false,
        messenger,
        quotes: [quote],
        transaction: cloneDeep(TRANSACTION_META_MOCK),
      };
    };

    beforeEach(() => {
      jest
        .mocked(collectTransactionIds)
        .mockImplementation((_chainId, _from, _messenger, onTransactionId) => {
          onTransactionId('submitted-tx-id');
          return { end: jest.fn() };
        });
      jest.mocked(getTransaction).mockReturnValue({
        hash: '0xsubmitted' as Hex,
      } as TransactionMeta);
      jest.mocked(waitForTransactionConfirmed).mockResolvedValue(undefined);
      addTxMock.mockResolvedValue({
        result: Promise.resolve('0xsubmitted' as Hex),
      } as never);
      getControllerStateMock.mockReturnValue({
        transactionData: {},
        transactions: [],
      } as never);
    });

    it('skips prepend when paymentOverride returns empty calls', async () => {
      getPaymentOverrideDataMock.mockResolvedValue({
        calls: [],
        recipient: undefined,
        authorizationList: undefined,
      } as never);

      await submitServerQuotes(
        buildRequest({
          request: {
            ...QUOTE_MOCK.request,
            paymentOverride: PaymentOverride.MoneyAccount,
          },
        }),
      );

      // No calls prepended — relay step submitted directly via TransactionController
      expect(addTxMock).toHaveBeenCalled();
    });

    it('prepends payment override calls before relay steps', async () => {
      const overrideCall = {
        data: '0xoverridedata' as Hex,
        to: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex,
        value: '0x0' as Hex,
      };

      getPaymentOverrideDataMock.mockResolvedValue({
        calls: [overrideCall],
        recipient: undefined,
        authorizationList: undefined,
      } as never);

      await submitServerQuotes(
        buildRequest({
          request: {
            ...QUOTE_MOCK.request,
            paymentOverride: PaymentOverride.MoneyAccount,
          },
        }),
      );

      expect(addTxBatchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          transactions: expect.arrayContaining([
            expect.objectContaining({
              params: expect.objectContaining({ to: overrideCall.to }),
            }),
          ]),
        }),
      );
    });

    it('prepends original tx before relay steps in post-quote flow (no account override)', async () => {
      const transaction = cloneDeep(TRANSACTION_META_MOCK);

      await submitServerQuotes(
        buildRequest({
          request: {
            ...QUOTE_MOCK.request,
            from: ORIGINAL_FROM_MOCK,
            isPostQuote: true,
          },
          original: {
            ...ORIGINAL_QUOTE_MOCK,
            gasless: false,
          },
        }),
      );

      expect(addTxBatchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          transactions: expect.arrayContaining([
            expect.objectContaining({
              params: expect.objectContaining({
                to: transaction.txParams.to,
                maxFeePerGas: expect.any(String),
                maxPriorityFeePerGas: expect.any(String),
              }),
            }),
          ]),
        }),
      );
    });

    it('prepends original tx with undefined fee caps when client has no fee estimates', async () => {
      const transaction = cloneDeep(TRANSACTION_META_MOCK);

      await submitServerQuotes(
        buildRequest({
          request: {
            ...QUOTE_MOCK.request,
            from: ORIGINAL_FROM_MOCK,
            isPostQuote: true,
          },
          original: {
            ...ORIGINAL_QUOTE_MOCK,
            client: {
              ...ORIGINAL_QUOTE_MOCK.client,
              maxFeePerGas: undefined,
              maxPriorityFeePerGas: undefined,
            },
            gasless: false,
          },
        }),
      );

      expect(addTxBatchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          transactions: expect.arrayContaining([
            expect.objectContaining({
              params: expect.objectContaining({
                to: transaction.txParams.to,
                maxFeePerGas: undefined,
                maxPriorityFeePerGas: undefined,
              }),
            }),
          ]),
        }),
      );
    });

    it('prepends delegation tx before relay steps in post-quote flow with account override', async () => {
      await submitServerQuotes(
        buildRequest({
          request: {
            ...QUOTE_MOCK.request,
            from: QUOTE_FROM_MOCK,
            isPostQuote: true,
          },
          original: {
            ...ORIGINAL_QUOTE_MOCK,
            gasless: false,
          },
        }),
      );

      expect(getDelegationTransactionMock).toHaveBeenCalled();
      expect(addTxBatchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          transactions: expect.arrayContaining([
            expect.objectContaining({
              params: expect.objectContaining({
                to: DELEGATION_MOCK.to,
                maxFeePerGas: expect.any(String),
                maxPriorityFeePerGas: expect.any(String),
              }),
            }),
          ]),
        }),
      );
    });

    it('resolves effective type through batch transaction to nested perps type', async () => {
      const batchTransaction: TransactionMeta = {
        ...TRANSACTION_META_MOCK,
        type: 'batch' as never,
        nestedTransactions: [
          {
            type: 'relayPerpsDeposit' as never,
            to: '0x1111111111111111111111111111111111111111' as Hex,
            data: '0x',
          },
        ],
      };

      const req: PayStrategyExecuteRequest<ServerQuote> = {
        accountSupports7702: true,
        isSmartTransaction: (): boolean => false,
        messenger,
        quotes: [
          {
            ...cloneDeep(QUOTE_MOCK),
            original: { ...ORIGINAL_QUOTE_MOCK, gasless: false },
          },
        ],
        transaction: batchTransaction,
      };

      await submitServerQuotes(req);

      expect(addTxMock).toHaveBeenCalled();
    });
  });
});
