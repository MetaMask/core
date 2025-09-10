// cSpell:words cowswap xsignature xtxhash

import { IntentManager } from './intent-manager';
import type {
  IntentQuote,
  IntentSubmissionParams,
  BaseIntentProvider,
  IntentQuoteRequest,
  IntentOrder,
} from './types';
import { IntentOrderStatus } from './types';

describe('IntentManager', () => {
  let intentManager: IntentManager;

  beforeEach(() => {
    intentManager = new IntentManager();
    // Clear all providers to start with clean state
    intentManager.unregisterProvider('cowswap');
  });

  describe('constructor', () => {
    it('should initialize with default state', () => {
      expect(intentManager).toBeDefined();
    });
  });

  describe('generateQuotes', () => {
    it('should generate quotes using the provider manager', async () => {
      const quoteRequest: IntentQuoteRequest = {
        srcChainId: 1,
        destChainId: 42161,
        srcTokenAddress: '0xA0b86a33E6441e6e80D0c4C6C7527d72',
        destTokenAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
        amount: '1000000000000000000',
        userAddress: '0x123',
      };

      const mockQuotes: IntentQuote[] = [
        {
          id: 'test-quote-1',
          provider: 'cowswap',
          srcAmount: '1000000000000000000',
          destAmount: '900000000000000000',
          estimatedGas: '21000',
          estimatedTime: 300,
          priceImpact: 0.01,
          fees: [],
          validUntil: Date.now() + 300000,
          metadata: {},
        },
      ];

      // Create a complete mock provider that implements BaseIntentProvider
      const mockProvider: BaseIntentProvider = {
        getName: () => 'cowswap',
        getVersion: () => '1.0.0',
        getSupportedChains: () => [1, 42161],
        validateQuoteRequest: jest.fn().mockResolvedValue(true),
        generateQuote: jest.fn().mockResolvedValue(mockQuotes[0]),
        submitOrder: jest.fn(),
        getOrderStatus: jest.fn(),
        cancelOrder: jest.fn(),
        estimateGas: jest.fn(),
      };

      // Register the mock provider
      intentManager.registerProvider(mockProvider);

      const result = await intentManager.generateQuotes(quoteRequest);

      expect(result).toStrictEqual(mockQuotes);
      expect(mockProvider.generateQuote).toHaveBeenCalledWith(quoteRequest);
    });
  });

  describe('submitIntent', () => {
    it('should submit an intent and return an order', async () => {
      const mockQuote: IntentQuote = {
        id: 'test-quote-1',
        provider: 'cowswap',
        srcAmount: '1000000000000000000',
        destAmount: '900000000000000000',
        estimatedGas: '21000',
        estimatedTime: 300,
        priceImpact: 0.01,
        fees: [],
        validUntil: Date.now() + 300000,
        metadata: {},
      };

      const submissionParams: IntentSubmissionParams = {
        quote: mockQuote,
        signature: '0xsignature',
        userAddress: '0x123',
      };

      const mockOrder: IntentOrder = {
        id: 'test-order-1',
        status: IntentOrderStatus.PENDING,
        txHash: undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {},
      };

      // Create a complete mock provider that implements BaseIntentProvider
      const mockProvider: BaseIntentProvider = {
        getName: () => 'cowswap',
        getVersion: () => '1.0.0',
        getSupportedChains: () => [1, 42161],
        validateQuoteRequest: jest.fn(),
        generateQuote: jest.fn(),
        submitOrder: jest.fn().mockResolvedValue(mockOrder),
        getOrderStatus: jest.fn(),
        cancelOrder: jest.fn(),
        estimateGas: jest.fn(),
      };

      // Register the mock provider
      intentManager.registerProvider(mockProvider);

      const result = await intentManager.submitIntent(submissionParams);

      expect(result).toStrictEqual(mockOrder);
      expect(mockProvider.submitOrder).toHaveBeenCalledWith(submissionParams);
    });
  });

  describe('getOrderStatus', () => {
    it('should get order status from the provider', async () => {
      const orderId = 'test-order-1';
      const providerName = 'cowswap';
      const chainId = 1;

      const mockOrder: IntentOrder = {
        id: orderId,
        status: IntentOrderStatus.CONFIRMED,
        txHash: '0xtxhash',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {},
      };

      // Create a complete mock provider that implements BaseIntentProvider
      const mockProvider: BaseIntentProvider = {
        getName: () => 'cowswap',
        getVersion: () => '1.0.0',
        getSupportedChains: () => [1, 42161],
        validateQuoteRequest: jest.fn(),
        generateQuote: jest.fn(),
        submitOrder: jest.fn(),
        getOrderStatus: jest.fn().mockResolvedValue(mockOrder),
        cancelOrder: jest.fn(),
        estimateGas: jest.fn(),
      };

      // Register the mock provider
      intentManager.registerProvider(mockProvider);

      const result = await intentManager.getOrderStatus(
        orderId,
        providerName,
        chainId,
      );

      expect(result).toStrictEqual(mockOrder);
      expect(mockProvider.getOrderStatus).toHaveBeenCalledWith(
        orderId,
        chainId,
      );
    });
  });
});
