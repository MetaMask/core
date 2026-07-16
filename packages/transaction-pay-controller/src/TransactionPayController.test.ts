import { jest } from '@jest/globals';
/* eslint-disable no-new */
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { updateFiatPayment } from './actions/update-fiat-payment.js';
import { updatePaymentToken } from './actions/update-payment-token.js';
import { PaymentOverride, TransactionPayStrategy } from './constants.js';
import { TransactionPayController } from './index.js';
import { deriveFiatAssetForFiatPayment } from './strategy/fiat/utils.js';
import { getMessengerMock } from './tests/messenger-mock.js';
import type {
  TransactionPayControllerMessenger,
  TransactionPayControllerOptions,
  TransactionPaySourceAmount,
  UpdateTransactionDataCallback,
} from './types.js';
import { getStrategyOrder } from './utils/feature-flags.js';
import { updateQuotes } from './utils/quotes.js';
import { updateSourceAmounts } from './utils/source-amounts.js';
import {
  getTransaction,
  subscribeAssetChanges,
  subscribeTransactionChanges,
} from './utils/transaction.js';

jest.mock('./actions/update-fiat-payment');
jest.mock('./actions/update-payment-token');
jest.mock('./strategy/fiat/utils');
jest.mock('./utils/source-amounts');
jest.mock('./utils/quotes');
jest.mock('./utils/transaction');
jest.mock('./utils/feature-flags');

const TRANSACTION_ID_MOCK = '123-456';
const TRANSACTION_META_MOCK = { id: TRANSACTION_ID_MOCK } as TransactionMeta;
const TOKEN_ADDRESS_MOCK = '0xabc' as Hex;
const CHAIN_ID_MOCK = '0x1' as Hex;
describe('TransactionPayController', () => {
  const updateFiatPaymentMock = jest.mocked(updateFiatPayment);
  const updatePaymentTokenMock = jest.mocked(updatePaymentToken);
  const deriveFiatAssetForFiatPaymentMock = jest.mocked(
    deriveFiatAssetForFiatPayment,
  );
  const getTransactionMock = jest.mocked(getTransaction);
  const updateSourceAmountsMock = jest.mocked(updateSourceAmounts);
  const updateQuotesMock = jest.mocked(updateQuotes);
  const subscribeTransactionChangesMock = jest.mocked(
    subscribeTransactionChanges,
  );
  const subscribeAssetChangesMock = jest.mocked(subscribeAssetChanges);
  const getStrategyOrderMock = jest.mocked(getStrategyOrder);
  let messenger: TransactionPayControllerMessenger;
  let getKeyringControllerStateMock: jest.Mock;

  /**
   * Create a TransactionPayController.
   *
   * @param options - Controller options.
   * @returns The created controller.
   */
  function createController(
    options: Partial<TransactionPayControllerOptions> = {},
  ): TransactionPayController {
    return new TransactionPayController({
      ...options,
      getDelegationTransaction: jest.fn(),
      messenger,
    });
  }

  beforeEach(() => {
    jest.resetAllMocks();

    const mocks = getMessengerMock({ skipRegister: true });
    messenger = mocks.messenger;
    getKeyringControllerStateMock = mocks.getKeyringControllerStateMock;

    getKeyringControllerStateMock.mockReturnValue({
      isUnlocked: true,
      keyrings: [
        {
          type: 'HD Key Tree',
          accounts: ['0x1234567890123456789012345678901234567891'],
          metadata: { id: 'hd-keyring', name: 'HD Key Tree' },
        },
      ],
    });

    getStrategyOrderMock.mockReturnValue([TransactionPayStrategy.Relay]);
    updateQuotesMock.mockResolvedValue(true);
  });

  describe('constructor', () => {
    it('subscribes to rate changes for in-flight retry', () => {
      const controller = createController();

      expect(subscribeAssetChangesMock).toHaveBeenCalledWith(
        messenger,
        expect.any(Function),
        expect.any(Function),
      );

      const getControllerState = subscribeAssetChangesMock.mock.calls[0][1];
      expect(getControllerState()).toBe(controller.state);
    });
  });

  describe('updatePaymentToken', () => {
    it('calls util', () => {
      createController().updatePaymentToken({
        transactionId: TRANSACTION_ID_MOCK,
        tokenAddress: TOKEN_ADDRESS_MOCK,
        chainId: CHAIN_ID_MOCK,
      });

      expect(updatePaymentTokenMock).toHaveBeenCalledWith(
        {
          transactionId: TRANSACTION_ID_MOCK,
          tokenAddress: TOKEN_ADDRESS_MOCK,
          chainId: CHAIN_ID_MOCK,
        },
        {
          messenger,
          updateTransactionData: expect.any(Function),
        },
      );
    });
  });

  describe('updateFiatPayment', () => {
    it('calls util', () => {
      const callback = jest.fn();

      createController().updateFiatPayment({
        transactionId: TRANSACTION_ID_MOCK,
        callback,
      });

      expect(updateFiatPaymentMock).toHaveBeenCalledWith(
        {
          transactionId: TRANSACTION_ID_MOCK,
          callback,
        },
        {
          messenger,
          updateTransactionData: expect.any(Function),
        },
      );
    });

    it('is callable via messenger action handler', () => {
      const callback = jest.fn();

      createController();

      messenger.call('TransactionPayController:updateFiatPayment', {
        transactionId: TRANSACTION_ID_MOCK,
        callback,
      });

      expect(updateFiatPaymentMock).toHaveBeenCalledWith(
        {
          transactionId: TRANSACTION_ID_MOCK,
          callback,
        },
        {
          messenger,
          updateTransactionData: expect.any(Function),
        },
      );
    });
  });

  describe('setTransactionConfig', () => {
    it('updates isMaxAmount in state', () => {
      const controller = createController();

      controller.setTransactionConfig(TRANSACTION_ID_MOCK, (config) => {
        config.isMaxAmount = true;
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK].isMaxAmount,
      ).toBe(true);
    });

    it('updates isPostQuote in state', () => {
      const controller = createController();

      controller.setTransactionConfig(TRANSACTION_ID_MOCK, (config) => {
        config.isPostQuote = true;
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK].isPostQuote,
      ).toBe(true);
    });

    it('updates isHyperliquidSource in state', () => {
      const controller = createController();

      controller.setTransactionConfig(TRANSACTION_ID_MOCK, (config) => {
        config.isHyperliquidSource = true;
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK]
          .isHyperliquidSource,
      ).toBe(true);
    });

    it('updates paymentOverride in state', () => {
      const controller = createController();

      controller.setTransactionConfig(TRANSACTION_ID_MOCK, (config) => {
        config.paymentOverride = PaymentOverride.MoneyAccount;
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK].paymentOverride,
      ).toBe(PaymentOverride.MoneyAccount);
    });

    it('triggers source amounts and quotes update when only isPostQuote changes', () => {
      const controller = createController();

      // First call creates the entry with defaults
      controller.setTransactionConfig(TRANSACTION_ID_MOCK, () => {
        // no-op, just initializes
      });

      updateSourceAmountsMock.mockClear();
      updateQuotesMock.mockClear();

      // Second call only changes isPostQuote
      controller.setTransactionConfig(TRANSACTION_ID_MOCK, (config) => {
        config.isPostQuote = true;
      });

      expect(updateSourceAmountsMock).toHaveBeenCalledTimes(1);
      expect(updateQuotesMock).toHaveBeenCalledTimes(1);
    });

    it('triggers source amounts and quotes update when accountOverride changes', () => {
      const controller = createController();
      const accountOverride =
        '0xdeadbeef00000000000000000000000000000002' as Hex;

      controller.setTransactionConfig(TRANSACTION_ID_MOCK, () => {
        // no-op, just initializes
      });

      updateSourceAmountsMock.mockClear();
      updateQuotesMock.mockClear();

      controller.setTransactionConfig(TRANSACTION_ID_MOCK, (config) => {
        config.accountOverride = accountOverride;
      });

      expect(updateSourceAmountsMock).toHaveBeenCalledTimes(1);
      expect(updateQuotesMock).toHaveBeenCalledTimes(1);
    });

    it('updates refundTo in state', () => {
      const controller = createController();
      const refundTo = '0xdeadbeef00000000000000000000000000000001' as Hex;

      controller.setTransactionConfig(TRANSACTION_ID_MOCK, (config) => {
        config.refundTo = refundTo;
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK].refundTo,
      ).toBe(refundTo);
    });

    it('clears refundTo when set to undefined', () => {
      const controller = createController();
      const refundTo = '0xdeadbeef00000000000000000000000000000001' as Hex;

      controller.setTransactionConfig(TRANSACTION_ID_MOCK, (config) => {
        config.refundTo = refundTo;
      });

      controller.setTransactionConfig(TRANSACTION_ID_MOCK, (config) => {
        config.refundTo = undefined;
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK].refundTo,
      ).toBeUndefined();
    });

    it('updates accountOverride in state', () => {
      const controller = createController();
      const accountOverride =
        '0xdeadbeef00000000000000000000000000000002' as Hex;

      controller.setTransactionConfig(TRANSACTION_ID_MOCK, (config) => {
        config.accountOverride = accountOverride;
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK].accountOverride,
      ).toBe(accountOverride);
    });

    it('clears paymentToken when accountOverride changes', () => {
      const controller = createController();
      const accountOverride =
        '0xdeadbeef00000000000000000000000000000002' as Hex;

      controller.updatePaymentToken({
        transactionId: TRANSACTION_ID_MOCK,
        tokenAddress: TOKEN_ADDRESS_MOCK,
        chainId: CHAIN_ID_MOCK,
      });

      const { updateTransactionData } = updatePaymentTokenMock.mock.calls[0][1];

      updateTransactionData(TRANSACTION_ID_MOCK, (data) => {
        data.paymentToken = {
          address: TOKEN_ADDRESS_MOCK,
          balanceFiat: '1',
          balanceHuman: '1',
          balanceRaw: '1',
          balanceUsd: '1',
          chainId: CHAIN_ID_MOCK,
          decimals: 6,
          symbol: 'USDC',
        };
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK].paymentToken,
      ).toBeDefined();

      controller.setTransactionConfig(TRANSACTION_ID_MOCK, (config) => {
        config.accountOverride = accountOverride;
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK].paymentToken,
      ).toBeUndefined();
    });

    it('does not clear paymentToken when accountOverride is unchanged', () => {
      const controller = createController();
      const accountOverride =
        '0xdeadbeef00000000000000000000000000000002' as Hex;

      controller.setTransactionConfig(TRANSACTION_ID_MOCK, (config) => {
        config.accountOverride = accountOverride;
      });

      controller.updatePaymentToken({
        transactionId: TRANSACTION_ID_MOCK,
        tokenAddress: TOKEN_ADDRESS_MOCK,
        chainId: CHAIN_ID_MOCK,
      });

      const { updateTransactionData } = updatePaymentTokenMock.mock.calls[0][1];

      updateTransactionData(TRANSACTION_ID_MOCK, (data) => {
        data.paymentToken = {
          address: TOKEN_ADDRESS_MOCK,
          balanceFiat: '1',
          balanceHuman: '1',
          balanceRaw: '1',
          balanceUsd: '1',
          chainId: CHAIN_ID_MOCK,
          decimals: 6,
          symbol: 'USDC',
        };
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK].paymentToken,
      ).toBeDefined();

      controller.setTransactionConfig(TRANSACTION_ID_MOCK, (config) => {
        config.accountOverride = accountOverride;
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK].paymentToken,
      ).toBeDefined();
    });

    it('does not clear paymentToken when accountOverride changes if isPostQuote is true', () => {
      const controller = createController();
      const accountOverride =
        '0xdeadbeef00000000000000000000000000000002' as Hex;

      controller.setTransactionConfig(TRANSACTION_ID_MOCK, (config) => {
        config.isPostQuote = true;
      });

      controller.updatePaymentToken({
        transactionId: TRANSACTION_ID_MOCK,
        tokenAddress: TOKEN_ADDRESS_MOCK,
        chainId: CHAIN_ID_MOCK,
      });

      const { updateTransactionData } = updatePaymentTokenMock.mock.calls[0][1];

      updateTransactionData(TRANSACTION_ID_MOCK, (data) => {
        data.paymentToken = {
          address: TOKEN_ADDRESS_MOCK,
          balanceFiat: '1',
          balanceHuman: '1',
          balanceRaw: '1',
          balanceUsd: '1',
          chainId: CHAIN_ID_MOCK,
          decimals: 6,
          symbol: 'USDC',
        };
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK].paymentToken,
      ).toBeDefined();

      controller.setTransactionConfig(TRANSACTION_ID_MOCK, (config) => {
        config.accountOverride = accountOverride;
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK].paymentToken,
      ).toBeDefined();
    });

    it('updates multiple config properties at once', () => {
      const controller = createController();
      const refundTo = '0xdeadbeef00000000000000000000000000000001' as Hex;

      controller.setTransactionConfig(TRANSACTION_ID_MOCK, (config) => {
        config.isMaxAmount = true;
        config.isPostQuote = true;
        config.refundTo = refundTo;
      });

      const transactionData =
        controller.state.transactionData[TRANSACTION_ID_MOCK];
      expect(transactionData.isMaxAmount).toBe(true);
      expect(transactionData.isPostQuote).toBe(true);
      expect(transactionData.refundTo).toBe(refundTo);
    });
  });

  describe('getDelegationTransaction', () => {
    it('delegates to the callback', async () => {
      const resultMock = { data: '0x1', to: '0x2', value: '0x3' };
      const getDelegationTransactionMock = jest
        .fn()
        .mockResolvedValue(resultMock);

      new TransactionPayController({
        getDelegationTransaction: getDelegationTransactionMock,
        messenger,
      });

      const result = await messenger.call(
        'TransactionPayController:getDelegationTransaction',
        { transaction: TRANSACTION_META_MOCK },
      );

      expect(getDelegationTransactionMock).toHaveBeenCalledWith({
        transaction: TRANSACTION_META_MOCK,
      });
      expect(result).toBe(resultMock);
    });
  });

  describe('getPaymentOverrideData', () => {
    it('delegates to the callback', async () => {
      const resultMock = {
        calls: [{ to: '0xdef' as const, data: '0xabc' as const }],
      };
      const getPaymentOverrideDataMock = jest
        .fn()
        .mockResolvedValue(resultMock);

      new TransactionPayController({
        getDelegationTransaction: jest.fn(),
        getPaymentOverrideData: getPaymentOverrideDataMock,
        messenger,
      });

      const requestMock = {
        amount: '1.5',
        transaction: TRANSACTION_META_MOCK,
        transactionData: { isLoading: false, tokens: [] },
      };

      const result = await messenger.call(
        'TransactionPayController:getPaymentOverrideData',
        requestMock,
      );

      expect(getPaymentOverrideDataMock).toHaveBeenCalledWith(requestMock);
      expect(result).toStrictEqual(resultMock);
    });

    it('returns empty array when no callback is configured', async () => {
      new TransactionPayController({
        getDelegationTransaction: jest.fn(),
        messenger,
      });

      const result = await messenger.call(
        'TransactionPayController:getPaymentOverrideData',
        {
          amount: '1.5',
          transaction: TRANSACTION_META_MOCK,
          transactionData: { isLoading: false, tokens: [] },
        },
      );

      expect(result).toStrictEqual({ calls: [] });
    });
  });

  describe('getAmountData', () => {
    it('delegates to the callback', async () => {
      const resultMock = {
        updates: [{ nestedTransactionIndex: 0, data: '0xabc' as const }],
      };
      const getAmountDataMock = jest.fn().mockResolvedValue(resultMock);

      new TransactionPayController({
        getAmountData: getAmountDataMock,
        getDelegationTransaction: jest.fn(),
        messenger,
      });

      const requestMock = {
        amount: '5000000',
        transaction: TRANSACTION_META_MOCK,
      };

      const result = await messenger.call(
        'TransactionPayController:getAmountData',
        requestMock,
      );

      expect(getAmountDataMock).toHaveBeenCalledWith(requestMock);
      expect(result).toStrictEqual(resultMock);
    });

    it('returns empty updates when no callback is configured', async () => {
      new TransactionPayController({
        getDelegationTransaction: jest.fn(),
        messenger,
      });

      const result = await messenger.call(
        'TransactionPayController:getAmountData',
        {
          amount: '5000000',
          transaction: TRANSACTION_META_MOCK,
        },
      );

      expect(result).toStrictEqual({ updates: [] });
    });
  });

  describe('getFiatOptions', () => {
    it('returns configured fiat options', () => {
      const fiatOptions = {
        testFundingSource: '0x1111111111111111111111111111111111111111' as Hex,
        testAmountOverride: '0.1',
      };

      createController({ fiatOptions });

      const result = messenger.call('TransactionPayController:getFiatOptions');

      expect(result).toBe(fiatOptions);
    });

    it('returns undefined when no fiat options are configured', () => {
      createController();

      const result = messenger.call('TransactionPayController:getFiatOptions');

      expect(result).toBeUndefined();
    });
  });

  describe('polymarket callbacks', () => {
    const EOA_MOCK = '0x1111111111111111111111111111111111111111' as Hex;
    const DEPOSIT_WALLET_MOCK =
      '0x2222222222222222222222222222222222222222' as Hex;
    const SOURCE_HASH_MOCK: Hex = `0x${'aa'.repeat(32)}`;

    it('delegates polymarketGetDepositWalletAddress to the callback', async () => {
      const getDepositWalletAddressMock = jest
        .fn()
        .mockResolvedValue(DEPOSIT_WALLET_MOCK);

      new TransactionPayController({
        getDelegationTransaction: jest.fn(),
        messenger,
        polymarket: {
          getDepositWalletAddress: getDepositWalletAddressMock,
          submitDepositWalletBatch: jest.fn(),
        },
      });

      const result = await messenger.call(
        'TransactionPayController:polymarketGetDepositWalletAddress',
        { eoa: EOA_MOCK },
      );

      expect(getDepositWalletAddressMock).toHaveBeenCalledWith({
        eoa: EOA_MOCK,
      });
      expect(result).toBe(DEPOSIT_WALLET_MOCK);
    });

    it('delegates polymarketSubmitDepositWalletBatch to the callback', async () => {
      const submitDepositWalletBatchMock = jest
        .fn()
        .mockResolvedValue({ sourceHash: SOURCE_HASH_MOCK });

      new TransactionPayController({
        getDelegationTransaction: jest.fn(),
        messenger,
        polymarket: {
          getDepositWalletAddress: jest.fn(),
          submitDepositWalletBatch: submitDepositWalletBatchMock,
        },
      });

      const params = {
        eoa: EOA_MOCK,
        depositWallet: DEPOSIT_WALLET_MOCK,
        calls: [],
      };
      const result = await messenger.call(
        'TransactionPayController:polymarketSubmitDepositWalletBatch',
        params,
      );

      expect(submitDepositWalletBatchMock).toHaveBeenCalledWith(params);
      expect(result).toStrictEqual({ sourceHash: SOURCE_HASH_MOCK });
    });

    it('throws if polymarketGetDepositWalletAddress is invoked without callbacks supplied', () => {
      new TransactionPayController({
        getDelegationTransaction: jest.fn(),
        messenger,
      });

      expect(() =>
        messenger.call(
          'TransactionPayController:polymarketGetDepositWalletAddress',
          { eoa: EOA_MOCK },
        ),
      ).toThrow('Polymarket callbacks missing');
    });

    it('throws if polymarketSubmitDepositWalletBatch is invoked without callbacks supplied', () => {
      new TransactionPayController({
        getDelegationTransaction: jest.fn(),
        messenger,
      });

      expect(() =>
        messenger.call(
          'TransactionPayController:polymarketSubmitDepositWalletBatch',
          { eoa: EOA_MOCK, depositWallet: DEPOSIT_WALLET_MOCK, calls: [] },
        ),
      ).toThrow('Polymarket callbacks missing');
    });
  });

  describe('getStrategy Action', () => {
    it('returns relay if no callback', async () => {
      createController();

      expect(
        messenger.call(
          'TransactionPayController:getStrategy',
          TRANSACTION_META_MOCK,
        ),
      ).toBe(TransactionPayStrategy.Relay);
    });

    it('returns callback value if provided', async () => {
      new TransactionPayController({
        getDelegationTransaction: jest.fn(),
        getStrategy: (): TransactionPayStrategy =>
          TransactionPayStrategy.Across,
        messenger,
      });

      expect(
        messenger.call(
          'TransactionPayController:getStrategy',
          TRANSACTION_META_MOCK,
        ),
      ).toBe(TransactionPayStrategy.Across);
    });

    it('does not query feature flag strategy order when getStrategies callback returns values', async () => {
      new TransactionPayController({
        getDelegationTransaction: jest.fn(),
        getStrategies: (): TransactionPayStrategy[] => [
          TransactionPayStrategy.Across,
        ],
        messenger,
      });

      getStrategyOrderMock.mockClear();

      expect(
        messenger.call(
          'TransactionPayController:getStrategy',
          TRANSACTION_META_MOCK,
        ),
      ).toBe(TransactionPayStrategy.Across);

      expect(getStrategyOrderMock).not.toHaveBeenCalled();
    });

    it('returns relay if getStrategies callback returns empty', async () => {
      getStrategyOrderMock.mockReturnValue([TransactionPayStrategy.Across]);

      new TransactionPayController({
        getDelegationTransaction: jest.fn(),
        getStrategies: (): TransactionPayStrategy[] => [],
        messenger,
      });

      expect(
        messenger.call(
          'TransactionPayController:getStrategy',
          TRANSACTION_META_MOCK,
        ),
      ).toBe(TransactionPayStrategy.Across);
    });

    it('falls back to feature flag if getStrategies callback returns invalid first value', async () => {
      getStrategyOrderMock.mockReturnValue([TransactionPayStrategy.Across]);

      new TransactionPayController({
        getDelegationTransaction: jest.fn(),
        getStrategies: (): TransactionPayStrategy[] =>
          [undefined] as unknown as TransactionPayStrategy[],
        messenger,
      });

      expect(
        messenger.call(
          'TransactionPayController:getStrategy',
          TRANSACTION_META_MOCK,
        ),
      ).toBe(TransactionPayStrategy.Across);
    });

    it('returns default strategy order when no callbacks and no strategy order feature flag', async () => {
      getStrategyOrderMock.mockReturnValue([TransactionPayStrategy.Relay]);

      createController();

      expect(
        messenger.call(
          'TransactionPayController:getStrategy',
          TRANSACTION_META_MOCK,
        ),
      ).toBe(TransactionPayStrategy.Relay);
    });

    it('returns strategy from feature flag when no callbacks are provided', async () => {
      getStrategyOrderMock.mockReturnValue([
        TransactionPayStrategy.Across,
        TransactionPayStrategy.Relay,
      ]);

      createController();

      expect(
        messenger.call(
          'TransactionPayController:getStrategy',
          TRANSACTION_META_MOCK,
        ),
      ).toBe(TransactionPayStrategy.Across);
    });

    it('passes payment token route args into feature flag fallback', async () => {
      const controller = createController();

      controller.updatePaymentToken({
        transactionId: TRANSACTION_ID_MOCK,
        tokenAddress: TOKEN_ADDRESS_MOCK,
        chainId: CHAIN_ID_MOCK,
      });

      const { updateTransactionData } = updatePaymentTokenMock.mock.calls[0][1];

      updateTransactionData(TRANSACTION_ID_MOCK, (data) => {
        data.paymentToken = {
          address: TOKEN_ADDRESS_MOCK,
          balanceFiat: '1',
          balanceHuman: '1',
          balanceRaw: '1',
          balanceUsd: '1',
          chainId: CHAIN_ID_MOCK,
          decimals: 6,
          symbol: 'USDC',
        };
      });

      const transactionMeta = {
        id: TRANSACTION_ID_MOCK,
        type: 'perpsDeposit',
      } as TransactionMeta;

      messenger.call('TransactionPayController:getStrategy', transactionMeta);

      expect(getStrategyOrderMock).toHaveBeenCalledWith(
        messenger,
        CHAIN_ID_MOCK,
        TOKEN_ADDRESS_MOCK,
        'perpsDeposit',
        undefined,
      );
    });

    it('passes fiat payment method ID into getStrategyOrder', async () => {
      const controller = createController();

      controller.updatePaymentToken({
        transactionId: TRANSACTION_ID_MOCK,
        tokenAddress: TOKEN_ADDRESS_MOCK,
        chainId: CHAIN_ID_MOCK,
      });

      const { updateTransactionData } = updatePaymentTokenMock.mock.calls[0][1];

      updateTransactionData(TRANSACTION_ID_MOCK, (data) => {
        data.paymentToken = {
          address: TOKEN_ADDRESS_MOCK,
          balanceFiat: '1',
          balanceHuman: '1',
          balanceRaw: '1',
          balanceUsd: '1',
          chainId: CHAIN_ID_MOCK,
          decimals: 6,
          symbol: 'USDC',
        };
        data.fiatPayment = { selectedPaymentMethodId: 'card-123' };
      });

      const transactionMeta = {
        id: TRANSACTION_ID_MOCK,
        type: 'perpsDeposit',
      } as TransactionMeta;

      messenger.call('TransactionPayController:getStrategy', transactionMeta);

      expect(getStrategyOrderMock).toHaveBeenCalledWith(
        messenger,
        CHAIN_ID_MOCK,
        TOKEN_ADDRESS_MOCK,
        'perpsDeposit',
        'card-123',
      );
    });
  });

  describe('transaction data update', () => {
    it('updates state', () => {
      const controller = createController();

      controller.updatePaymentToken({
        transactionId: TRANSACTION_ID_MOCK,
        tokenAddress: TOKEN_ADDRESS_MOCK,
        chainId: CHAIN_ID_MOCK,
      });

      const { updateTransactionData } = updatePaymentTokenMock.mock.calls[0][1];

      updateTransactionData(TRANSACTION_ID_MOCK, (data) => {
        data.sourceAmounts = [
          { sourceAmountHuman: '1.23' } as TransactionPaySourceAmount,
        ];
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK],
      ).toStrictEqual({
        fiatPayment: {},
        isLoading: false,
        sourceAmounts: [{ sourceAmountHuman: '1.23' }],
        tokens: [],
      });
    });

    it('updates source amounts and quotes', () => {
      const controller = createController();

      controller.updatePaymentToken({
        transactionId: TRANSACTION_ID_MOCK,
        tokenAddress: TOKEN_ADDRESS_MOCK,
        chainId: CHAIN_ID_MOCK,
      });

      const { updateTransactionData } = updatePaymentTokenMock.mock.calls[0][1];

      updateTransactionData(TRANSACTION_ID_MOCK, (data) => {
        data.sourceAmounts = [
          { sourceAmountHuman: '1.23' } as TransactionPaySourceAmount,
        ];
      });

      expect(updateSourceAmountsMock).toHaveBeenCalledWith(
        TRANSACTION_ID_MOCK,
        expect.objectContaining({
          sourceAmounts: [{ sourceAmountHuman: '1.23' }],
        }),
        messenger,
      );

      expect(updateQuotesMock).toHaveBeenCalledWith({
        getStrategies: expect.any(Function),
        messenger,
        transactionData: expect.objectContaining({
          sourceAmounts: [{ sourceAmountHuman: '1.23' }],
        }),
        transactionId: TRANSACTION_ID_MOCK,
        updateTransactionData: expect.any(Function),
      });
    });
  });

  describe('transaction data removal', () => {
    it('removes state', async () => {
      const controller = createController();

      controller.updatePaymentToken({
        transactionId: TRANSACTION_ID_MOCK,
        tokenAddress: TOKEN_ADDRESS_MOCK,
        chainId: CHAIN_ID_MOCK,
      });

      const { updateTransactionData } = updatePaymentTokenMock.mock.calls[0][1];

      updateTransactionData(TRANSACTION_ID_MOCK, (data) => {
        data.sourceAmounts = [
          { sourceAmountHuman: '1.23' } as TransactionPaySourceAmount,
        ];
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK],
      ).toBeDefined();

      const removeTransactionDataCallback =
        subscribeTransactionChangesMock.mock.calls[0][2];

      removeTransactionDataCallback(TRANSACTION_ID_MOCK);

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK],
      ).toBeUndefined();
    });
  });

  describe('fiat token selection', () => {
    const FIAT_ASSET_MOCK = {
      address: '0x0000000000000000000000000000000000001010' as Hex,
      chainId: '0x89' as Hex,
    };

    function getControllerAndUpdateTransactionData(): {
      controller: TransactionPayController;
      updateTransactionData: UpdateTransactionDataCallback;
    } {
      const controller = createController();
      controller.updatePaymentToken({
        transactionId: TRANSACTION_ID_MOCK,
        tokenAddress: TOKEN_ADDRESS_MOCK,
        chainId: CHAIN_ID_MOCK,
      });
      return {
        controller,
        updateTransactionData:
          updatePaymentTokenMock.mock.calls[0][1].updateTransactionData,
      };
    }

    it('does not set caipAssetId when only fiat amount changes', () => {
      getTransactionMock.mockReturnValue(TRANSACTION_META_MOCK);
      deriveFiatAssetForFiatPaymentMock.mockReturnValue(FIAT_ASSET_MOCK);

      const { controller, updateTransactionData } =
        getControllerAndUpdateTransactionData();

      updateTransactionData(TRANSACTION_ID_MOCK, (data) => {
        data.fiatPayment = { amountFiat: '100' };
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK]?.fiatPayment
          ?.caipAssetId,
      ).toBeUndefined();
    });

    it('does not set caipAssetId when payment method changes (set by quote functions instead)', () => {
      getTransactionMock.mockReturnValue(TRANSACTION_META_MOCK);
      deriveFiatAssetForFiatPaymentMock.mockReturnValue(FIAT_ASSET_MOCK);

      const { controller, updateTransactionData } =
        getControllerAndUpdateTransactionData();

      updateTransactionData(TRANSACTION_ID_MOCK, (data) => {
        data.fiatPayment = { selectedPaymentMethodId: 'card-123' };
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK]?.fiatPayment
          ?.caipAssetId,
      ).toBeUndefined();
    });

    it('triggers quote update when fiat payment changes', () => {
      getTransactionMock.mockReturnValue(TRANSACTION_META_MOCK);
      deriveFiatAssetForFiatPaymentMock.mockReturnValue(FIAT_ASSET_MOCK);

      const { updateTransactionData } = getControllerAndUpdateTransactionData();

      updateTransactionData(TRANSACTION_ID_MOCK, (data) => {
        data.fiatPayment = { amountFiat: '100' };
      });

      expect(updateQuotesMock).toHaveBeenCalledTimes(1);
    });

    it('does not set caipAssetId when transaction is not found', () => {
      getTransactionMock.mockReturnValue(undefined);

      const { controller, updateTransactionData } =
        getControllerAndUpdateTransactionData();

      updateTransactionData(TRANSACTION_ID_MOCK, (data) => {
        data.fiatPayment = { selectedPaymentMethodId: 'card-123' };
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK]?.fiatPayment
          ?.caipAssetId,
      ).toBeUndefined();
    });

    it('does not set caipAssetId when fiat asset cannot be derived', () => {
      getTransactionMock.mockReturnValue(TRANSACTION_META_MOCK);
      deriveFiatAssetForFiatPaymentMock.mockReturnValue(undefined as never);

      const { controller, updateTransactionData } =
        getControllerAndUpdateTransactionData();

      updateTransactionData(TRANSACTION_ID_MOCK, (data) => {
        data.fiatPayment = { selectedPaymentMethodId: 'card-123' };
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK]?.fiatPayment
          ?.caipAssetId,
      ).toBeUndefined();
    });

    it('does not set caipAssetId when fiat payment does not change', () => {
      getTransactionMock.mockReturnValue(TRANSACTION_META_MOCK);
      deriveFiatAssetForFiatPaymentMock.mockReturnValue(FIAT_ASSET_MOCK);

      const { controller, updateTransactionData } =
        getControllerAndUpdateTransactionData();

      updateTransactionData(TRANSACTION_ID_MOCK, (data) => {
        data.sourceAmounts = [
          { sourceAmountHuman: '1.23' } as TransactionPaySourceAmount,
        ];
      });

      expect(
        controller.state.transactionData[TRANSACTION_ID_MOCK]?.fiatPayment
          ?.caipAssetId,
      ).toBeUndefined();
    });
  });
});
