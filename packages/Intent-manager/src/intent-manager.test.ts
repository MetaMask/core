// cSpell:words cowswap xsignature xtxhash

import { IntentManager } from './intent-manager';
import type {
  IntentSubmissionParams,
  BaseIntentProvider,
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

  describe('submitIntent', () => {
    it('should submit an intent and return an order', async () => {
      const submissionParams: IntentSubmissionParams = {
        providerName: 'cowswap',
        chainId: 1,
        orderData: {
          sellToken: '0xA0b86a33E6441e6e80D0c4C6C7527d72',
          buyToken: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
          sellAmount: '1000000000000000000',
        },
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
        submitOrder: jest.fn().mockResolvedValue(mockOrder),
        getOrderStatus: jest.fn(),
        cancelOrder: jest.fn(),
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
        submitOrder: jest.fn(),
        getOrderStatus: jest.fn().mockResolvedValue(mockOrder),
        cancelOrder: jest.fn(),
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
