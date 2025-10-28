import { deriveStateFromMetadata } from '@metamask/base-controller';
import {
  Messenger,
  MOCK_ANY_NAMESPACE,
  type MockAnyNamespace,
  type MessengerActions,
  type MessengerEvents,
} from '@metamask/messenger';
import {
  OnRampSdk,
  Environment,
  Context,
  RegionsService,
  OrdersService,
} from '@consensys/on-ramp-sdk';
import { RampsController, getSdkEnvironment } from './RampsController';
import type { RampsControllerMessenger } from './RampsController';

import { flushPromises } from '../../../tests/helpers';

// Mock the OnRampSdk
jest.mock('@consensys/on-ramp-sdk', () => ({
  OnRampSdk: {
    create: jest.fn(),
  },
  Environment: {
    Production: 'production',
    Staging: 'staging',
  },
  Context: {
    Browser: 'browser',
    Mobile: 'mobile',
  },
  RegionsService: jest.fn(),
  OrdersService: jest.fn(),
}));

describe('RampsController', () => {
  let mockOnRampSdk: jest.Mocked<typeof OnRampSdk>;
  let mockRegionsService: jest.Mocked<RegionsService>;
  let mockOrdersService: jest.Mocked<OrdersService>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock services
    mockRegionsService = {
      getCountries: jest.fn(),
      getSellCountries: jest.fn(),
      getPaymentMethods: jest.fn(),
      getPaymentMethodsForCrypto: jest.fn(),
      getSellPaymentMethods: jest.fn(),
      getSellPaymentMethodsForCrypto: jest.fn(),
      getCryptoCurrencies: jest.fn(),
      getSellCryptoCurrencies: jest.fn(),
      getCryptoCurrency: jest.fn(),
      getFiatCurrencies: jest.fn(),
      getSellFiatCurrencies: jest.fn(),
      getFiatCurrency: jest.fn(),
      getAllFiatCurrencies: jest.fn(),
      getAllCryptoCurrencies: jest.fn(),
      getNetworkDetails: jest.fn(),
      getLimits: jest.fn(),
      getSellLimits: jest.fn(),
      getQuotes: jest.fn(),
      getSellQuotes: jest.fn(),
    } as any;

    mockOrdersService = {
      getOrderIdFromCallback: jest.fn(),
      getOrderFromCallback: jest.fn(),
      getSellOrderFromCallback: jest.fn(),
      getOrder: jest.fn(),
      getSellOrder: jest.fn(),
      submitApplePayOrder: jest.fn(),
      getProvider: jest.fn(),
      getRecurringOrders: jest.fn(),
      addRedirectionListener: jest.fn(),
    } as any;

    // Mock OnRampSdk.create to return a mock SDK
    mockOnRampSdk = OnRampSdk as jest.Mocked<typeof OnRampSdk>;
    const mockSdk = {
      regions: jest.fn().mockResolvedValue(mockRegionsService),
      orders: jest.fn().mockResolvedValue(mockOrdersService),
    };
    mockOnRampSdk.create.mockReturnValue(mockSdk as any);
  });

  describe('getSdkEnvironment', () => {
    it('returns Production environment for production, beta, rc', () => {
      expect(getSdkEnvironment('production')).toBe(Environment.Production);
      expect(getSdkEnvironment('beta')).toBe(Environment.Production);
      expect(getSdkEnvironment('rc')).toBe(Environment.Production);
    });

    it('returns Staging environment for dev, exp, test, e2e, and default', () => {
      expect(getSdkEnvironment('dev')).toBe(Environment.Staging);
      expect(getSdkEnvironment('exp')).toBe(Environment.Staging);
      expect(getSdkEnvironment('test')).toBe(Environment.Staging);
      expect(getSdkEnvironment('e2e')).toBe(Environment.Staging);
      expect(getSdkEnvironment('unknown')).toBe(Environment.Staging);
    });
  });

  describe('constructor', () => {
    it('initializes with default state', async () => {
      await withController(({ controller }) => {
        expect(controller.state).toStrictEqual({
          metamaskEnvironment: 'staging',
          context: 'browser',
        });
      });
    });

    it('initializes with custom state', async () => {
      const customState = {
        metamaskEnvironment: 'production',
        context: 'mobile',
      };

      await withController(
        { options: { state: customState } },
        ({ controller }) => {
          expect(controller.state).toStrictEqual(customState);
        },
      );
    });

    it('creates OnRampSdk with correct parameters', async () => {
      await withController(({ controller }) => {
        expect(mockOnRampSdk.create).toHaveBeenCalledWith(
          Environment.Staging,
          Context.Browser,
        );
      });
    });

    it('creates OnRampSdk with production environment when specified', async () => {
      const customState = {
        metamaskEnvironment: 'production',
        context: 'browser',
      };

      await withController(
        { options: { state: customState } },
        ({ controller }) => {
          expect(mockOnRampSdk.create).toHaveBeenCalledWith(
            Environment.Production,
            Context.Browser,
          );
        },
      );
    });

    it('creates OnRampSdk with mobile context when specified', async () => {
      const customState = {
        metamaskEnvironment: 'staging',
        context: 'mobile',
      };

      await withController(
        { options: { state: customState } },
        ({ controller }) => {
          expect(mockOnRampSdk.create).toHaveBeenCalledWith(
            Environment.Staging,
            Context.Mobile,
          );
        },
      );
    });
  });

  describe('RegionsService wrapper methods', () => {
    beforeEach(async () => {
      await withController(({ controller }) => {
        // Ensure services are initialized
        expect(controller).toBeDefined();
      });
    });

    describe('getCountries', () => {
      it('calls regions service getCountries method', async () => {
        const mockCountries = [
          { id: 'US', name: 'United States', code: 'US' },
          { id: 'CA', name: 'Canada', code: 'CA' },
        ];
        mockRegionsService.getCountries.mockResolvedValue(mockCountries as any);

        await withController(async ({ controller }) => {
          const result = await controller.getCountries();
          expect(result).toStrictEqual(mockCountries);
          expect(mockRegionsService.getCountries).toHaveBeenCalledTimes(1);
        });
      });
    });

    describe('getSellCountries', () => {
      it('calls regions service getSellCountries method', async () => {
        const mockCountries = [
          { id: 'US', name: 'United States', code: 'US' },
        ];
        mockRegionsService.getSellCountries.mockResolvedValue(mockCountries as any);

        await withController(async ({ controller }) => {
          const result = await controller.getSellCountries();
          expect(result).toStrictEqual(mockCountries);
          expect(mockRegionsService.getSellCountries).toHaveBeenCalledTimes(1);
        });
      });
    });

    describe('getPaymentMethods', () => {
      it('calls regions service getPaymentMethods method', async () => {
        const mockPaymentMethods = [
          { id: 'card', name: 'Credit Card' },
          { id: 'bank', name: 'Bank Transfer' },
        ];
        mockRegionsService.getPaymentMethods.mockResolvedValue(mockPaymentMethods as any);

        await withController(async ({ controller }) => {
          const result = await controller.getPaymentMethods('US');
          expect(result).toStrictEqual(mockPaymentMethods);
          expect(mockRegionsService.getPaymentMethods).toHaveBeenCalledWith('US', undefined);
        });
      });
    });

    describe('getPaymentMethodsForCrypto', () => {
      it('calls regions service getPaymentMethodsForCrypto method', async () => {
        const mockPaymentMethods = [
          { id: 'card', name: 'Credit Card' },
        ];
        mockRegionsService.getPaymentMethodsForCrypto.mockResolvedValue(mockPaymentMethods as any);

        await withController(async ({ controller }) => {
          const result = await controller.getPaymentMethodsForCrypto('US', 'ETH', 'USD');
          expect(result).toStrictEqual(mockPaymentMethods);
          expect(mockRegionsService.getPaymentMethodsForCrypto).toHaveBeenCalledWith('US', 'ETH', 'USD', undefined);
        });
      });
    });

    describe('getSellPaymentMethods', () => {
      it('calls regions service getSellPaymentMethods method', async () => {
        const mockPaymentMethods = [
          { id: 'bank', name: 'Bank Transfer' },
        ];
        mockRegionsService.getSellPaymentMethods.mockResolvedValue(mockPaymentMethods as any);

        await withController(async ({ controller }) => {
          const result = await controller.getSellPaymentMethods('US');
          expect(result).toStrictEqual(mockPaymentMethods);
          expect(mockRegionsService.getSellPaymentMethods).toHaveBeenCalledWith('US', undefined);
        });
      });
    });

    describe('getSellPaymentMethodsForCrypto', () => {
      it('calls regions service getSellPaymentMethodsForCrypto method', async () => {
        const mockPaymentMethods = [
          { id: 'bank', name: 'Bank Transfer' },
        ];
        mockRegionsService.getSellPaymentMethodsForCrypto.mockResolvedValue(mockPaymentMethods as any);

        await withController(async ({ controller }) => {
          const result = await controller.getSellPaymentMethodsForCrypto('US', 'ETH', 'USD');
          expect(result).toStrictEqual(mockPaymentMethods);
          expect(mockRegionsService.getSellPaymentMethodsForCrypto).toHaveBeenCalledWith('US', 'ETH', 'USD', undefined);
        });
      });
    });

    describe('getCryptoCurrencies', () => {
      it('calls regions service getCryptoCurrencies method', async () => {
        const mockCryptoCurrencies = [
          { id: 'ETH', name: 'Ethereum', symbol: 'ETH' },
          { id: 'BTC', name: 'Bitcoin', symbol: 'BTC' },
        ];
        mockRegionsService.getCryptoCurrencies.mockResolvedValue(mockCryptoCurrencies as any);

        await withController(async ({ controller }) => {
          const result = await controller.getCryptoCurrencies('US', ['card', 'bank']);
          expect(result).toStrictEqual(mockCryptoCurrencies);
          expect(mockRegionsService.getCryptoCurrencies).toHaveBeenCalledWith('US', ['card', 'bank'], undefined, undefined);
        });
      });
    });

    describe('getSellCryptoCurrencies', () => {
      it('calls regions service getSellCryptoCurrencies method', async () => {
        const mockCryptoCurrencies = [
          { id: 'ETH', name: 'Ethereum', symbol: 'ETH' },
        ];
        mockRegionsService.getSellCryptoCurrencies.mockResolvedValue(mockCryptoCurrencies as any);

        await withController(async ({ controller }) => {
          const result = await controller.getSellCryptoCurrencies('US', ['bank']);
          expect(result).toStrictEqual(mockCryptoCurrencies);
          expect(mockRegionsService.getSellCryptoCurrencies).toHaveBeenCalledWith('US', ['bank'], undefined, undefined);
        });
      });
    });

    describe('getCryptoCurrency', () => {
      it('calls regions service getCryptoCurrency method', async () => {
        const mockCryptoCurrency = { id: 'ETH', name: 'Ethereum', symbol: 'ETH' };
        mockRegionsService.getCryptoCurrency.mockResolvedValue(mockCryptoCurrency as any);

        await withController(async ({ controller }) => {
          const result = await controller.getCryptoCurrency('US', 'ETH');
          expect(result).toStrictEqual(mockCryptoCurrency);
          expect(mockRegionsService.getCryptoCurrency).toHaveBeenCalledWith('US', 'ETH');
        });
      });
    });

    describe('getFiatCurrencies', () => {
      it('calls regions service getFiatCurrencies method', async () => {
        const mockFiatCurrencies = [
          { id: 'USD', name: 'US Dollar', symbol: 'USD' },
          { id: 'EUR', name: 'Euro', symbol: 'EUR' },
        ];
        mockRegionsService.getFiatCurrencies.mockResolvedValue(mockFiatCurrencies as any);

        await withController(async ({ controller }) => {
          const result = await controller.getFiatCurrencies('US', ['card']);
          expect(result).toStrictEqual(mockFiatCurrencies);
          expect(mockRegionsService.getFiatCurrencies).toHaveBeenCalledWith('US', ['card'], undefined);
        });
      });
    });

    describe('getSellFiatCurrencies', () => {
      it('calls regions service getSellFiatCurrencies method', async () => {
        const mockFiatCurrencies = [
          { id: 'USD', name: 'US Dollar', symbol: 'USD' },
        ];
        mockRegionsService.getSellFiatCurrencies.mockResolvedValue(mockFiatCurrencies as any);

        await withController(async ({ controller }) => {
          const result = await controller.getSellFiatCurrencies('US', ['bank']);
          expect(result).toStrictEqual(mockFiatCurrencies);
          expect(mockRegionsService.getSellFiatCurrencies).toHaveBeenCalledWith('US', ['bank'], undefined);
        });
      });
    });

    describe('getFiatCurrency', () => {
      it('calls regions service getFiatCurrency method', async () => {
        const mockFiatCurrency = { id: 'USD', name: 'US Dollar', symbol: 'USD' };
        mockRegionsService.getFiatCurrency.mockResolvedValue(mockFiatCurrency as any);

        await withController(async ({ controller }) => {
          const result = await controller.getFiatCurrency('US', 'USD');
          expect(result).toStrictEqual(mockFiatCurrency);
          expect(mockRegionsService.getFiatCurrency).toHaveBeenCalledWith('US', 'USD');
        });
      });
    });

    describe('getAllFiatCurrencies', () => {
      it('calls regions service getAllFiatCurrencies method', async () => {
        const mockFiatCurrencies = [
          { id: 'USD', name: 'US Dollar', symbol: 'USD' },
          { id: 'EUR', name: 'Euro', symbol: 'EUR' },
        ];
        mockRegionsService.getAllFiatCurrencies.mockResolvedValue(mockFiatCurrencies as any);

        await withController(async ({ controller }) => {
          const result = await controller.getAllFiatCurrencies('US');
          expect(result).toStrictEqual(mockFiatCurrencies);
          expect(mockRegionsService.getAllFiatCurrencies).toHaveBeenCalledWith('US', undefined);
        });
      });
    });

    describe('getAllCryptoCurrencies', () => {
      it('calls regions service getAllCryptoCurrencies method', async () => {
        const mockCryptoCurrencies = [
          { id: 'ETH', name: 'Ethereum', symbol: 'ETH' },
          { id: 'BTC', name: 'Bitcoin', symbol: 'BTC' },
        ];
        mockRegionsService.getAllCryptoCurrencies.mockResolvedValue(mockCryptoCurrencies as any);

        await withController(async ({ controller }) => {
          const result = await controller.getAllCryptoCurrencies('US');
          expect(result).toStrictEqual(mockCryptoCurrencies);
          expect(mockRegionsService.getAllCryptoCurrencies).toHaveBeenCalledWith('US', undefined);
        });
      });
    });

    describe('getNetworkDetails', () => {
      it('calls regions service getNetworkDetails method', async () => {
        const mockNetworkDetails = [
          { id: 'ethereum', name: 'Ethereum Mainnet' },
        ];
        mockRegionsService.getNetworkDetails.mockResolvedValue(mockNetworkDetails as any);

        await withController(async ({ controller }) => {
          const result = await controller.getNetworkDetails();
          expect(result).toStrictEqual(mockNetworkDetails);
          expect(mockRegionsService.getNetworkDetails).toHaveBeenCalledTimes(1);
        });
      });
    });

    describe('getLimits', () => {
      it('calls regions service getLimits method', async () => {
        const mockLimits = {
          min: 10,
          max: 10000,
        };
        mockRegionsService.getLimits.mockResolvedValue(mockLimits as any);

        await withController(async ({ controller }) => {
          const result = await controller.getLimits('US', ['card'], 'ETH', 'USD');
          expect(result).toStrictEqual(mockLimits);
          expect(mockRegionsService.getLimits).toHaveBeenCalledWith('US', ['card'], 'ETH', 'USD', undefined);
        });
      });
    });

    describe('getSellLimits', () => {
      it('calls regions service getSellLimits method', async () => {
        const mockLimits = {
          min: 10,
          max: 10000,
        };
        mockRegionsService.getSellLimits.mockResolvedValue(mockLimits as any);

        await withController(async ({ controller }) => {
          const result = await controller.getSellLimits('US', ['bank'], 'ETH', 'USD');
          expect(result).toStrictEqual(mockLimits);
          expect(mockRegionsService.getSellLimits).toHaveBeenCalledWith('US', ['bank'], 'ETH', 'USD');
        });
      });
    });

    describe('getQuotes', () => {
      it('calls regions service getQuotes method', async () => {
        const mockQuotes = {
          quotes: [
            { provider: 'provider1', amount: 100 },
            { provider: 'provider2', amount: 95 },
          ],
        };
        mockRegionsService.getQuotes.mockResolvedValue(mockQuotes as any);

        await withController(async ({ controller }) => {
          const result = await controller.getQuotes('US', ['card'], 'ETH', 'USD', 100);
          expect(result).toStrictEqual(mockQuotes);
          expect(mockRegionsService.getQuotes).toHaveBeenCalledWith('US', ['card'], 'ETH', 'USD', 100, undefined, undefined);
        });
      });
    });

    describe('getSellQuotes', () => {
      it('calls regions service getSellQuotes method', async () => {
        const mockQuotes = {
          quotes: [
            { provider: 'provider1', amount: 100 },
            { provider: 'provider2', amount: 95 },
          ],
        };
        mockRegionsService.getSellQuotes.mockResolvedValue(mockQuotes as any);

        await withController(async ({ controller }) => {
          const result = await controller.getSellQuotes('US', ['bank'], 'ETH', 'USD', 100);
          expect(result).toStrictEqual(mockQuotes);
          expect(mockRegionsService.getSellQuotes).toHaveBeenCalledWith('US', ['bank'], 'ETH', 'USD', 100, undefined, undefined);
        });
      });
    });
  });

  describe('OrdersService wrapper methods', () => {
    beforeEach(async () => {
      await withController(({ controller }) => {
        // Ensure services are initialized
        expect(controller).toBeDefined();
      });
    });

    describe('getOrderIdFromCallback', () => {
      it('calls orders service getOrderIdFromCallback method', async () => {
        const mockOrderId = 'order-123';
        mockOrdersService.getOrderIdFromCallback.mockResolvedValue(mockOrderId);

        await withController(async ({ controller }) => {
          const result = await controller.getOrderIdFromCallback('provider1', 'https://callback.url');
          expect(result).toBe(mockOrderId);
          expect(mockOrdersService.getOrderIdFromCallback).toHaveBeenCalledWith('provider1', 'https://callback.url');
        });
      });
    });

    describe('getOrderFromCallback', () => {
      it('calls orders service getOrderFromCallback method', async () => {
        const mockOrder = { id: 'order-123', status: 'pending' };
        mockOrdersService.getOrderFromCallback.mockResolvedValue(mockOrder as any);

        await withController(async ({ controller }) => {
          const result = await controller.getOrderFromCallback('provider1', 'https://callback.url', '0x123');
          expect(result).toStrictEqual(mockOrder);
          expect(mockOrdersService.getOrderFromCallback).toHaveBeenCalledWith('provider1', 'https://callback.url', '0x123');
        });
      });
    });

    describe('getSellOrderFromCallback', () => {
      it('calls orders service getSellOrderFromCallback method', async () => {
        const mockOrder = { id: 'order-123', status: 'pending' };
        mockOrdersService.getSellOrderFromCallback.mockResolvedValue(mockOrder as any);

        await withController(async ({ controller }) => {
          const result = await controller.getSellOrderFromCallback('provider1', 'https://callback.url', '0x123');
          expect(result).toStrictEqual(mockOrder);
          expect(mockOrdersService.getSellOrderFromCallback).toHaveBeenCalledWith('provider1', 'https://callback.url', '0x123');
        });
      });
    });

    describe('getOrder', () => {
      it('calls orders service getOrder method', async () => {
        const mockOrder = { id: 'order-123', status: 'completed' };
        mockOrdersService.getOrder.mockResolvedValue(mockOrder as any);

        await withController(async ({ controller }) => {
          const result = await controller.getOrder('order-123', '0x123');
          expect(result).toStrictEqual(mockOrder);
          expect(mockOrdersService.getOrder).toHaveBeenCalledWith('order-123', '0x123');
        });
      });
    });

    describe('getSellOrder', () => {
      it('calls orders service getSellOrder method', async () => {
        const mockOrder = { id: 'order-123', status: 'completed' };
        mockOrdersService.getSellOrder.mockResolvedValue(mockOrder as any);

        await withController(async ({ controller }) => {
          const result = await controller.getSellOrder('order-123', '0x123');
          expect(result).toStrictEqual(mockOrder);
          expect(mockOrdersService.getSellOrder).toHaveBeenCalledWith('order-123', '0x123');
        });
      });
    });

    describe('submitApplePayOrder', () => {
      it('calls orders service submitApplePayOrder method', async () => {
        const mockResult = { success: true, orderId: 'order-123' };
        mockOrdersService.submitApplePayOrder.mockResolvedValue(mockResult as any);

        await withController(async ({ controller }) => {
          const result = await controller.submitApplePayOrder('0x123', 'provider1', { paymentData: 'test' });
          expect(result).toStrictEqual(mockResult);
          expect(mockOrdersService.submitApplePayOrder).toHaveBeenCalledWith('0x123', 'provider1', { paymentData: 'test' });
        });
      });
    });

    describe('getProvider', () => {
      it('calls orders service getProvider method', async () => {
        const mockProvider = { id: 'provider1', name: 'Test Provider' };
        mockOrdersService.getProvider.mockResolvedValue(mockProvider as any);

        await withController(async ({ controller }) => {
          const result = await controller.getProvider('provider1');
          expect(result).toStrictEqual(mockProvider);
          expect(mockOrdersService.getProvider).toHaveBeenCalledWith('provider1');
        });
      });
    });

    describe('getRecurringOrders', () => {
      it('calls orders service getRecurringOrders method', async () => {
        const mockOrders = [
          { id: 'order-1', status: 'completed' },
          { id: 'order-2', status: 'pending' },
        ];
        mockOrdersService.getRecurringOrders.mockResolvedValue(mockOrders as any);

        const startDate = new Date('2024-01-01');
        const endDate = new Date('2024-01-31');

        await withController(async ({ controller }) => {
          const result = await controller.getRecurringOrders('order-123', '0x123', startDate, endDate);
          expect(result).toStrictEqual(mockOrders);
          expect(mockOrdersService.getRecurringOrders).toHaveBeenCalledWith('order-123', '0x123', startDate, endDate);
        });
      });
    });

    describe('addRedirectionListener', () => {
      it('calls orders service addRedirectionListener method', async () => {
        const mockCallback = jest.fn();
        mockOrdersService.addRedirectionListener.mockImplementation(mockCallback);

        await withController(async ({ controller }) => {
          controller.addRedirectionListener(mockCallback);
          await flushPromises();
          expect(mockOrdersService.addRedirectionListener).toHaveBeenCalledWith(mockCallback);
        });
      });
    });
  });

  describe('messenger action handlers', () => {
    it('registers all action handlers', async () => {
      await withController(async ({ rootMessenger }) => {
        // Test that the controller's action handlers are properly registered
        // by calling them through the messenger
        mockRegionsService.getCountries.mockResolvedValue([]);
        mockRegionsService.getPaymentMethods.mockResolvedValue([]);
        mockOrdersService.getOrder.mockResolvedValue({} as any);

        await rootMessenger.call('RampsController:getCountries');
        await rootMessenger.call('RampsController:getPaymentMethods', 'US');
        await rootMessenger.call('RampsController:getOrder', 'order-123', '0x123');

        expect(mockRegionsService.getCountries).toHaveBeenCalledTimes(1);
        expect(mockRegionsService.getPaymentMethods).toHaveBeenCalledWith('US', undefined);
        expect(mockOrdersService.getOrder).toHaveBeenCalledWith('order-123', '0x123');
      });
    });
  });

  describe('error handling', () => {
    it('handles regions service errors', async () => {
      const error = new Error('Regions service error');
      mockRegionsService.getCountries.mockRejectedValue(error);

      await withController(async ({ controller }) => {
        await expect(controller.getCountries()).rejects.toThrow('Regions service error');
      });
    });

    it('handles orders service errors', async () => {
      const error = new Error('Orders service error');
      mockOrdersService.getOrder.mockRejectedValue(error);

      await withController(async ({ controller }) => {
        await expect(controller.getOrder('order-123', '0x123')).rejects.toThrow('Orders service error');
      });
    });

    it('handles SDK initialization errors', async () => {
      const error = new Error('SDK initialization error');
      mockOnRampSdk.create.mockImplementation(() => {
        throw error;
      });

      await expect(
        withController(({ controller }) => {
          expect(controller).toBeDefined();
        }),
      ).rejects.toThrow('SDK initialization error');
    });
  });

  describe('metadata', () => {
    it('includes expected state in debug snapshots', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'includeInDebugSnapshot',
          ),
        ).toMatchInlineSnapshot(`
          Object {
            "context": "browser",
            "metamaskEnvironment": "staging",
          }
        `);
      });
    });

    it('includes expected state in state logs', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'includeInStateLogs',
          ),
        ).toMatchInlineSnapshot(`
          Object {
            "context": "browser",
            "metamaskEnvironment": "staging",
          }
        `);
      });
    });

    it('persists expected state', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'persist',
          ),
        ).toMatchInlineSnapshot(`
          Object {
            "context": "browser",
            "metamaskEnvironment": "staging",
          }
        `);
      });
    });

    it('exposes expected state to UI', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'usedInUi',
          ),
        ).toMatchInlineSnapshot(`
          Object {
            "context": "browser",
            "metamaskEnvironment": "staging",
          }
        `);
      });
    });
  });
});

/**
 * The type of the messenger populated with all external actions and events
 * required by the controller under test.
 */
type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<RampsControllerMessenger>,
  MessengerEvents<RampsControllerMessenger>
>;

/**
 * The callback that `withController` calls.
 */
type WithControllerCallback<ReturnValue> = (payload: {
  controller: RampsController;
  rootMessenger: RootMessenger;
  messenger: RampsControllerMessenger;
}) => Promise<ReturnValue> | ReturnValue;

/**
 * The options bag that `withController` takes.
 */
type WithControllerOptions = {
  options: Partial<ConstructorParameters<typeof RampsController>[0]>;
};

/**
 * Constructs the messenger populated with all external actions and events
 * required by the controller under test.
 *
 * @returns The root messenger.
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

/**
 * Constructs the messenger for the controller under test.
 *
 * @param rootMessenger - The root messenger, with all external actions and
 * events required by the controller's messenger.
 * @returns The controller-specific messenger.
 */
function getMessenger(
  rootMessenger: RootMessenger,
): RampsControllerMessenger {
  const messenger: RampsControllerMessenger = new Messenger({
    namespace: 'RampsController',
    parent: rootMessenger,
  });
  return messenger;
}

/**
 * Wrap tests for the controller under test by ensuring that the controller is
 * created ahead of time and then safely destroyed afterward as needed.
 *
 * @param args - Either a function, or an options bag + a function. The options
 * bag contains arguments for the controller constructor. All constructor
 * arguments are optional and will be filled in with defaults in as needed
 * (including `messenger`). The function is called with the new
 * controller, root messenger, and controller messenger.
 * @returns The same return value as the given function.
 */
async function withController<ReturnValue>(
  ...args:
    | [WithControllerCallback<ReturnValue>]
    | [WithControllerOptions, WithControllerCallback<ReturnValue>]
): Promise<ReturnValue> {
  const [{ options = {} }, testFunction] =
    args.length === 2 ? args : [{}, args[0]];
  const rootMessenger = getRootMessenger();
  const messenger = getMessenger(rootMessenger);
  const controller = new RampsController({
    messenger,
    ...options,
  });
  return await testFunction({ controller, rootMessenger, messenger });
}
