import type {
  PublishHookResult,
  TransactionMeta,
} from '@metamask/transaction-controller';

import { TransactionPayStrategy } from '..';
import { getMessengerMock } from '../tests/messenger-mock';
import type {
  TransactionData,
  TransactionPayControllerState,
  TransactionPayQuote,
} from '../types';
import { getStrategyByName } from '../utils/strategy';
import { TransactionPayPublishHook } from './TransactionPayPublishHook';

jest.mock('../utils/strategy');

const TRANSACTION_META_MOCK = {
  id: '123-456',
  txParams: {
    from: '0xabc',
  },
} as TransactionMeta;

const QUOTE_MOCK = {
  strategy: TransactionPayStrategy.Test,
} as TransactionPayQuote<unknown>;

const PAYMENT_TOKEN_MOCK = {
  address: '0xdef',
  balanceFiat: '1',
  balanceHuman: '1',
  balanceRaw: '1000000',
  balanceUsd: '1',
  chainId: '0x1',
  decimals: 6,
  symbol: 'TEST',
};

const EMPTY_TRANSACTION_DATA_MOCK = {
  isLoading: false,
  tokens: [],
} as TransactionData;

describe('TransactionPayPublishHook', () => {
  const isSmartTransactionMock = jest.fn();
  const executeMock = jest.fn();
  const getStrategyByNameMock = jest.mocked(getStrategyByName);

  const {
    messenger,
    getControllerStateMock,
    getKeyringControllerStateMock,
    getTransactionControllerStateMock,
    updateTransactionMock,
  } = getMessengerMock();

  let hook: TransactionPayPublishHook;

  /**
   * Run the publish hook.
   *
   * @returns  The result of the publish hook.
   */
  function runHook(): Promise<PublishHookResult> {
    return hook.getHook()(TRANSACTION_META_MOCK, '0x1234');
  }

  beforeEach(() => {
    jest.resetAllMocks();

    getKeyringControllerStateMock.mockReturnValue({
      isUnlocked: true,
      keyrings: [
        {
          type: 'HD Key Tree',
          accounts: ['0xabc'],
          metadata: { id: 'hd-keyring', name: 'HD Key Tree' },
        },
      ],
    });

    hook = new TransactionPayPublishHook({
      isSmartTransaction: isSmartTransactionMock,
      messenger,
    });

    getStrategyByNameMock.mockReturnValue({
      execute: executeMock,
      getQuotes: jest.fn(),
    } as never);

    isSmartTransactionMock.mockReturnValue(false);

    getControllerStateMock.mockReturnValue({
      transactionData: {
        [TRANSACTION_META_MOCK.id]: {
          quotes: [QUOTE_MOCK, QUOTE_MOCK],
        },
      },
    } as TransactionPayControllerState);

    getTransactionControllerStateMock.mockReturnValue({
      transactions: [TRANSACTION_META_MOCK],
    });
  });

  it('executes strategy with quotes', async () => {
    await runHook();

    expect(executeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountSupports7702: true,
        quotes: [QUOTE_MOCK, QUOTE_MOCK],
      }),
    );
  });

  it('selects strategy from quote', async () => {
    await runHook();

    expect(getStrategyByNameMock).toHaveBeenCalledWith(QUOTE_MOCK.strategy);
  });

  it('does nothing if no quotes in state', async () => {
    getControllerStateMock.mockReturnValue({
      transactionData: {},
    });

    await runHook();

    expect(executeMock).not.toHaveBeenCalled();
  });

  it('does nothing if no quotes exist for transaction data without explicit pay config', async () => {
    getControllerStateMock.mockReturnValue({
      transactionData: {
        [TRANSACTION_META_MOCK.id]: EMPTY_TRANSACTION_DATA_MOCK,
      },
    });

    await runHook();

    expect(executeMock).not.toHaveBeenCalled();
  });

  it.each([
    ['account override', { accountOverride: '0xdef' }],
    [
      'fiat payment method',
      { fiatPayment: { selectedPaymentMethodId: 'test-payment-method' } },
    ],
    ['payment override', { paymentOverride: {} }],
    ['payment token', { paymentToken: PAYMENT_TOKEN_MOCK }],
    ['post-quote flag', { isPostQuote: true }],
  ] as [string, Partial<TransactionData>][])(
    'throws if no quotes exist for transaction data with %s',
    async (_description, transactionData) => {
      getControllerStateMock.mockReturnValue({
        transactionData: {
          [TRANSACTION_META_MOCK.id]: {
            ...EMPTY_TRANSACTION_DATA_MOCK,
            ...transactionData,
          },
        },
      });

      await expect(runHook()).rejects.toThrow(
        'MetaMask Pay: No pay quote available',
      );

      expect(executeMock).not.toHaveBeenCalled();
    },
  );

  it('sets submittedTime on the transaction before executing strategy', async () => {
    await runHook();

    expect(updateTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: TRANSACTION_META_MOCK.id,
        submittedTime: expect.any(Number),
      }),
      'Set submittedTime at pay publish hook start',
    );
  });

  it('sets submittedTime before strategy.execute is called', async () => {
    const callOrder: string[] = [];

    updateTransactionMock.mockImplementation(() => {
      callOrder.push('updateTransaction');
    });

    executeMock.mockImplementation(() => {
      callOrder.push('execute');
      return { transactionHash: '0x123' };
    });

    await runHook();

    expect(callOrder).toStrictEqual(['updateTransaction', 'execute']);
  });

  it('does not set submittedTime if no quotes', async () => {
    getControllerStateMock.mockReturnValue({
      transactionData: {},
    });

    await runHook();

    expect(updateTransactionMock).not.toHaveBeenCalled();
  });

  it('defaults to accountSupports7702 false when keyring not found', async () => {
    getKeyringControllerStateMock.mockReturnValue({
      isUnlocked: true,
      keyrings: [],
    });

    await runHook();

    expect(executeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountSupports7702: false,
      }),
    );
  });

  it('sets accountSupports7702 false for hardware wallet keyring', async () => {
    getKeyringControllerStateMock.mockReturnValue({
      isUnlocked: true,
      keyrings: [
        {
          type: 'Ledger Hardware',
          accounts: ['0xabc'],
          metadata: { id: 'ledger', name: 'Ledger' },
        },
      ],
    });

    await runHook();

    expect(executeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountSupports7702: false,
      }),
    );
  });

  it('sets accountSupports7702 true for money keyring', async () => {
    getKeyringControllerStateMock.mockReturnValue({
      isUnlocked: true,
      keyrings: [
        {
          type: 'Money Keyring',
          accounts: ['0xabc'],
          metadata: { id: 'money-keyring', name: 'Money Keyring' },
        },
      ],
    });

    await runHook();

    expect(executeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountSupports7702: true,
      }),
    );
  });

  it('throws errors from submit prefixed with MetaMask Pay', async () => {
    executeMock.mockRejectedValue(new Error('Test error'));

    await expect(runHook()).rejects.toThrow('MetaMask Pay: Test error');
  });

  it('cascades MetaMask Pay prefix on top of strategy-level prefixes', async () => {
    executeMock.mockRejectedValue(
      new Error('Relay submit: Relay execute: backend boom'),
    );

    await expect(runHook()).rejects.toThrow(
      'MetaMask Pay: Relay submit: Relay execute: backend boom',
    );
  });

  it('wraps non-Error throws with the MetaMask Pay prefix', async () => {
    executeMock.mockRejectedValue('boom');

    await expect(runHook()).rejects.toThrow('MetaMask Pay: boom');
  });
});
