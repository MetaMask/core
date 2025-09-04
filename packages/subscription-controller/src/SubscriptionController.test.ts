import { BigNumber } from '@ethersproject/bignumber';
import { Contract } from '@ethersproject/contracts';
import type { AccountsControllerGetSelectedMultichainAccountAction } from '@metamask/accounts-controller';
import { Messenger } from '@metamask/base-controller';
import type { GetGasFeeState } from '@metamask/gas-fee-controller';
import type {
  NetworkControllerFindNetworkClientIdByChainIdAction,
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetStateAction,
} from '@metamask/network-controller';

import {
  controllerName,
  SubscriptionControllerErrorMessage,
} from './constants';
import { SubscriptionServiceError } from './errors';
import {
  getDefaultSubscriptionControllerState,
  SubscriptionController,
  type AllowedActions,
  type AllowedEvents,
  type SubscriptionControllerMessenger,
  type SubscriptionControllerOptions,
  type SubscriptionControllerState,
} from './SubscriptionController';
import type { PriceInfoResponse, ProductPrice, Subscription } from './types';
import { PaymentType, ProductType } from './types';

jest.mock('@ethersproject/contracts');

// Mock data
const MOCK_SUBSCRIPTION: Subscription = {
  id: 'sub_123456789',
  products: [
    {
      name: ProductType.SHIELD,
      id: 'prod_shield_basic',
      currency: 'USD',
      amount: 9.99,
    },
  ],
  currentPeriodStart: '2024-01-01T00:00:00Z',
  currentPeriodEnd: '2024-02-01T00:00:00Z',
  status: 'active',
  interval: 'month',
  paymentMethod: {
    type: PaymentType.CARD,
  },
};

const MOCK_PRODUCT_PRICE: ProductPrice = {
  name: ProductType.SHIELD,
  prices: [
    {
      interval: 'month',
      currency: 'USD',
      unitAmount: 9.99,
      unitDecimals: 18,
      trialPeriodDays: 0,
      minBillingCycles: 1,
    },
  ],
};

const MOCK_PRICE_INFO_RESPONSE: PriceInfoResponse = {
  products: [MOCK_PRODUCT_PRICE],
  paymentMethods: [MOCK_SUBSCRIPTION.paymentMethod],
};

/**
 * Creates a custom subscription messenger, in case tests need different permissions
 *
 * @param props - overrides
 * @param props.overrideEvents - override events
 * @returns base messenger, and messenger. You can pass this into the mocks below to mock messenger calls
 */
function createCustomSubscriptionMessenger(props?: {
  overrideEvents?: AllowedEvents['type'][];
}) {
  const baseMessenger = new Messenger<AllowedActions, AllowedEvents>();

  const messenger = baseMessenger.getRestricted<
    typeof controllerName,
    AllowedActions['type'],
    AllowedEvents['type']
  >({
    name: controllerName,
    allowedActions: [
      'AuthenticationController:getBearerToken',
      'NetworkController:getState',
      'NetworkController:getNetworkClientById',
      'NetworkController:findNetworkClientIdByChainId',
      'AccountsController:getSelectedMultichainAccount',
      'GasFeeController:getState',
    ],
    allowedEvents: props?.overrideEvents ?? [
      'AuthenticationController:stateChange',
    ],
  });

  return {
    baseMessenger,
    messenger,
  };
}

/**
 * Jest Mock Utility to generate a mock Subscription Messenger
 *
 * @param overrideMessengers - override messengers if need to modify the underlying permissions
 * @param overrideMessengers.baseMessenger - base messenger to override
 * @param overrideMessengers.messenger - messenger to override
 * @returns series of mocks to actions that can be called
 */
function mockSubscriptionMessenger(overrideMessengers?: {
  baseMessenger: Messenger<AllowedActions, AllowedEvents>;
  messenger: SubscriptionControllerMessenger;
}) {
  const { baseMessenger, messenger } =
    overrideMessengers ?? createCustomSubscriptionMessenger();

  return {
    baseMessenger,
    messenger,
  };
}

/**
 * Creates a mock subscription messenger for testing.
 *
 * @returns The mock messenger and related mocks.
 */
function createMockSubscriptionMessenger(): {
  messenger: SubscriptionControllerMessenger;
  baseMessenger: Messenger<AllowedActions, AllowedEvents>;
} {
  return mockSubscriptionMessenger();
}

/**
 * Creates a mock subscription service for testing.
 *
 * @returns The mock service and related mocks.
 */
function createMockSubscriptionService() {
  const mockGetSubscriptions = jest.fn().mockImplementation();
  const mockCancelSubscription = jest.fn();
  const mockGetPriceInfo = jest.fn();

  const mockService = {
    getSubscriptions: mockGetSubscriptions,
    cancelSubscription: mockCancelSubscription,
    getPriceInfo: mockGetPriceInfo,
  };

  return {
    mockService,
    mockGetSubscriptions,
    mockCancelSubscription,
    mockGetPriceInfo,
  };
}

/**
 * Helper function to create controller with options.
 */
type WithControllerCallback<ReturnValue> = (params: {
  controller: SubscriptionController;
  initialState: SubscriptionControllerState;
  messenger: SubscriptionControllerMessenger;
  baseMessenger: Messenger<AllowedActions, AllowedEvents>;
  mockService: ReturnType<typeof createMockSubscriptionService>['mockService'];
  mockAddTransactionFn: jest.Mock;
  mockEstimateGasFeeFn: jest.Mock;
}) => Promise<ReturnValue> | ReturnValue;

type WithControllerOptions = Partial<SubscriptionControllerOptions>;

type WithControllerArgs<ReturnValue> =
  | [WithControllerCallback<ReturnValue>]
  | [WithControllerOptions, WithControllerCallback<ReturnValue>];

/**
 * Builds a controller based on the given options and calls the given function with that controller.
 *
 * @param args - Either a function, or an options bag + a function.
 * @returns Whatever the callback returns.
 */
async function withController<ReturnValue>(
  ...args: WithControllerArgs<ReturnValue>
) {
  const [{ ...rest }, fn] = args.length === 2 ? args : [{}, args[0]];
  const { messenger, baseMessenger } = createMockSubscriptionMessenger();
  const { mockService } = createMockSubscriptionService();
  const mockAddTransactionFn = jest.fn();
  const mockEstimateGasFeeFn = jest.fn();

  const controller = new SubscriptionController({
    messenger,
    subscriptionService: mockService,
    addTransactionFn: mockAddTransactionFn,
    estimateGasFeeFn: mockEstimateGasFeeFn,
    ...rest,
  });

  return await fn({
    controller,
    initialState: controller.state,
    messenger,
    baseMessenger,
    mockService,
    mockAddTransactionFn,
    mockEstimateGasFeeFn,
  });
}

describe('SubscriptionController', () => {
  beforeEach(() => {
    // Clear all instances and calls to constructor and all methods:
    (Contract as unknown as jest.Mock).mockClear();
  });

  describe('constructor', () => {
    it('should be able to instantiate with default options', async () => {
      await withController(async ({ controller }) => {
        expect(controller.state).toStrictEqual(
          getDefaultSubscriptionControllerState(),
        );
      });
    });

    it('should be able to instantiate with initial state', () => {
      const { mockService } = createMockSubscriptionService();
      const { messenger } = createMockSubscriptionMessenger();
      const initialState: Partial<SubscriptionControllerState> = {
        subscriptions: [MOCK_SUBSCRIPTION],
      };
      const mockAddTransactionFn = jest.fn();
      const mockEstimateGasFeeFn = jest.fn();

      const controller = new SubscriptionController({
        messenger,
        state: initialState,
        subscriptionService: mockService,
        addTransactionFn: mockAddTransactionFn,
        estimateGasFeeFn: mockEstimateGasFeeFn,
      });

      expect(controller).toBeDefined();
      expect(controller.state.subscriptions).toStrictEqual([MOCK_SUBSCRIPTION]);
    });

    it('should be able to instantiate with custom subscription service', () => {
      const { messenger } = createMockSubscriptionMessenger();
      const { mockService } = createMockSubscriptionService();
      const mockAddTransactionFn = jest.fn();
      const mockEstimateGasFeeFn = jest.fn();

      const controller = new SubscriptionController({
        messenger,
        subscriptionService: mockService,
        addTransactionFn: mockAddTransactionFn,
        estimateGasFeeFn: mockEstimateGasFeeFn,
      });

      expect(controller).toBeDefined();
      expect(controller.state).toStrictEqual(
        getDefaultSubscriptionControllerState(),
      );
    });
  });

  describe('getSubscription', () => {
    it('should fetch and store subscription successfully', async () => {
      await withController(async ({ controller, mockService }) => {
        mockService.getSubscriptions.mockResolvedValue({
          customerId: 'cus_1',
          subscriptions: [MOCK_SUBSCRIPTION],
          trialedProducts: [],
        });

        const result = await controller.getSubscriptions();

        expect(result).toStrictEqual([MOCK_SUBSCRIPTION]);
        // For backward compatibility during refactor, keep single subscription mirror if present
        // but assert new state field
        expect(controller.state.subscriptions).toStrictEqual([
          MOCK_SUBSCRIPTION,
        ]);
        expect(mockService.getSubscriptions).toHaveBeenCalledTimes(1);
      });
    });

    it('should handle null subscription response', async () => {
      await withController(async ({ controller, mockService }) => {
        mockService.getSubscriptions.mockResolvedValue({
          customerId: 'cus_1',
          subscriptions: [],
          trialedProducts: [],
        });

        const result = await controller.getSubscriptions();

        expect(result).toHaveLength(0);
        expect(controller.state.subscriptions).toStrictEqual([]);
        expect(mockService.getSubscriptions).toHaveBeenCalledTimes(1);
      });
    });

    it('should handle subscription service errors', async () => {
      await withController(async ({ controller, mockService }) => {
        const errorMessage = 'Failed to fetch subscription';
        mockService.getSubscriptions.mockRejectedValue(
          new SubscriptionServiceError(errorMessage),
        );

        await expect(controller.getSubscriptions()).rejects.toThrow(
          SubscriptionServiceError,
        );

        expect(controller.state.subscriptions).toStrictEqual([]);
        expect(mockService.getSubscriptions).toHaveBeenCalledTimes(1);
      });
    });

    it('should update state when subscription is fetched', async () => {
      const initialSubscription = { ...MOCK_SUBSCRIPTION, id: 'sub_old' };
      const newSubscription = { ...MOCK_SUBSCRIPTION, id: 'sub_new' };

      await withController(
        {
          state: {
            subscriptions: [initialSubscription],
          },
        },
        async ({ controller, mockService }) => {
          expect(controller.state.subscriptions).toStrictEqual([
            initialSubscription,
          ]);

          // Fetch new subscription
          mockService.getSubscriptions.mockResolvedValue({
            customerId: 'cus_1',
            subscriptions: [newSubscription],
            trialedProducts: [],
          });
          const result = await controller.getSubscriptions();

          expect(result).toStrictEqual([newSubscription]);
          expect(controller.state.subscriptions).toStrictEqual([
            newSubscription,
          ]);
          expect(controller.state.subscriptions[0]?.id).toBe('sub_new');
        },
      );
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel subscription successfully', async () => {
      const mockSubscription2 = { ...MOCK_SUBSCRIPTION, id: 'sub_2' };
      await withController(
        {
          state: {
            subscriptions: [MOCK_SUBSCRIPTION, mockSubscription2],
          },
        },
        async ({ controller, mockService }) => {
          mockService.cancelSubscription.mockResolvedValue(undefined);
          expect(
            await controller.cancelSubscription({
              subscriptionId: MOCK_SUBSCRIPTION.id,
            }),
          ).toBeUndefined();
          expect(controller.state.subscriptions).toStrictEqual([
            { ...MOCK_SUBSCRIPTION, status: 'cancelled' },
            mockSubscription2,
          ]);
          expect(mockService.cancelSubscription).toHaveBeenCalledWith({
            subscriptionId: MOCK_SUBSCRIPTION.id,
          });
          expect(mockService.cancelSubscription).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('should throw error when user is not subscribed', async () => {
      await withController(
        {
          state: {
            subscriptions: [],
          },
        },
        async ({ controller }) => {
          await expect(
            controller.cancelSubscription({
              subscriptionId: 'sub_123456789',
            }),
          ).rejects.toThrow(
            SubscriptionControllerErrorMessage.UserNotSubscribed,
          );
        },
      );
    });

    it('should not call subscription service when user is not subscribed', async () => {
      await withController(
        {
          state: {
            subscriptions: [],
          },
        },
        async ({ controller, mockService }) => {
          await expect(
            controller.cancelSubscription({
              subscriptionId: 'sub_123456789',
            }),
          ).rejects.toThrow(
            SubscriptionControllerErrorMessage.UserNotSubscribed,
          );

          // Verify the subscription service was not called
          expect(mockService.cancelSubscription).not.toHaveBeenCalled();
        },
      );
    });

    it('should handle subscription service errors during cancellation', async () => {
      await withController(
        {
          state: {
            subscriptions: [MOCK_SUBSCRIPTION],
          },
        },
        async ({ controller, mockService }) => {
          const errorMessage = 'Failed to cancel subscription';
          mockService.cancelSubscription.mockRejectedValue(
            new SubscriptionServiceError(errorMessage),
          );

          await expect(
            controller.cancelSubscription({
              subscriptionId: 'sub_123456789',
            }),
          ).rejects.toThrow(SubscriptionServiceError);

          expect(mockService.cancelSubscription).toHaveBeenCalledWith({
            subscriptionId: 'sub_123456789',
          });
          expect(mockService.cancelSubscription).toHaveBeenCalledTimes(1);
        },
      );
    });
  });

  describe('getPriceInfo', () => {
    it('should get price info successfully', async () => {
      await withController(async ({ controller, mockService }) => {
        mockService.getPriceInfo.mockResolvedValue(MOCK_PRICE_INFO_RESPONSE);
        const result = await controller.getPriceInfo();
        expect(result).toStrictEqual(MOCK_PRICE_INFO_RESPONSE);
        expect(mockService.getPriceInfo).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete subscription lifecycle with updated logic', async () => {
      await withController(async ({ controller, mockService }) => {
        // 1. Initially no subscription
        expect(controller.state.subscriptions).toStrictEqual([]);

        // 2. Try to cancel subscription (should fail - user not subscribed)
        await expect(
          controller.cancelSubscription({
            subscriptionId: 'sub_123456789',
          }),
        ).rejects.toThrow(SubscriptionControllerErrorMessage.UserNotSubscribed);

        // 3. Fetch subscription
        mockService.getSubscriptions.mockResolvedValue({
          customerId: 'cus_1',
          subscriptions: [MOCK_SUBSCRIPTION],
          trialedProducts: [],
        });
        const subscriptions = await controller.getSubscriptions();

        expect(subscriptions).toStrictEqual([MOCK_SUBSCRIPTION]);
        expect(controller.state.subscriptions).toStrictEqual([
          MOCK_SUBSCRIPTION,
        ]);

        // 4. Now cancel should work (user is subscribed)
        mockService.cancelSubscription.mockResolvedValue(undefined);
        expect(
          await controller.cancelSubscription({
            subscriptionId: 'sub_123456789',
          }),
        ).toBeUndefined();

        expect(mockService.cancelSubscription).toHaveBeenCalledWith({
          subscriptionId: 'sub_123456789',
        });
      });
    });
  });

  describe('createCryptoApproveTransaction', () => {
    const ContractCtor = Contract as unknown as jest.Mock;
    beforeEach(() => {
      // ethers.js Contract method is added at runtime depend on abi so we need to mock it dynamically here
      const instance = {
        allowance: jest
          .fn()
          .mockResolvedValue(BigNumber.from('1000000000000000000000')),
      } as unknown as Contract;
      ContractCtor.mockImplementation(() => instance);
    });

    it('returns alreadyAllowed when allowance is sufficient', async () => {
      await withController(
        async ({
          controller,
          mockService,
          mockAddTransactionFn,
          mockEstimateGasFeeFn,
          baseMessenger,
        }) => {
          // Register mocks for required cross-controller actions on the provided base messenger
          baseMessenger.registerActionHandler(
            'NetworkController:getState',
            (..._args) =>
              ({
                selectedNetworkClientId: 'test-client-id',
              }) as ReturnType<NetworkControllerGetStateAction['handler']>,
          );
          baseMessenger.registerActionHandler(
            'NetworkController:getNetworkClientById',
            (..._args) =>
              ({
                provider: { request: jest.fn() },
              }) as unknown as ReturnType<
                NetworkControllerGetNetworkClientByIdAction['handler']
              >,
          );
          baseMessenger.registerActionHandler(
            'AccountsController:getSelectedMultichainAccount',
            (..._args) =>
              ({
                address: '0xabc',
              }) as ReturnType<
                AccountsControllerGetSelectedMultichainAccountAction['handler']
              >,
          );
          baseMessenger.registerActionHandler(
            'NetworkController:findNetworkClientIdByChainId',
            (..._args) =>
              'test-client-id' as ReturnType<
                NetworkControllerFindNetworkClientIdByChainIdAction['handler']
              >,
          );

          // Provide product pricing and crypto payment info
          mockService.getPriceInfo.mockResolvedValue({
            products: [
              {
                name: ProductType.SHIELD,
                prices: [
                  {
                    interval: 'month',
                    currency: 'USD',
                    unitAmount: 10,
                    unitDecimals: 18,
                    trialPeriodDays: 0,
                    minBillingCycles: 1,
                  },
                ],
              },
            ],
            paymentMethods: [
              {
                type: PaymentType.CRYPTO,
                chains: [
                  {
                    chainId: '0x1',
                    paymentAddress: '0xspender',
                    tokens: [
                      {
                        address: '0xtoken',
                        decimals: 18,
                        conversionRate: { USD: '1.0' },
                      },
                    ],
                  },
                ],
              },
            ],
          });

          const result = await controller.createCryptoApproveTransaction({
            chainId: '0x1',
            tokenAddress: '0xtoken',
            productType: ProductType.SHIELD,
            interval: 'month',
          });

          expect(result).toStrictEqual({ alreadyAllowed: true });
          expect(mockAddTransactionFn).not.toHaveBeenCalled();
          expect(mockEstimateGasFeeFn).not.toHaveBeenCalled();
        },
      );
    });

    it('returns transactionResult when allowance is insufficient and adds approve tx', async () => {
      // Override Contract mock to simulate low allowance and encode approve data
      const encodeFunctionDataMock = jest.fn().mockReturnValue('0xabcdef');
      const instance = {
        allowance: jest.fn().mockResolvedValue(BigNumber.from('0')),
        interface: {
          encodeFunctionData: encodeFunctionDataMock,
        },
      } as unknown as Contract;
      ContractCtor.mockImplementation(() => instance);

      await withController(
        async ({
          controller,
          mockService,
          mockAddTransactionFn,
          mockEstimateGasFeeFn,
          baseMessenger,
        }) => {
          // Register required cross-controller handlers
          baseMessenger.registerActionHandler(
            'NetworkController:getState',
            (..._args) =>
              ({
                selectedNetworkClientId: 'test-client-id',
              }) as ReturnType<NetworkControllerGetStateAction['handler']>,
          );
          baseMessenger.registerActionHandler(
            'NetworkController:getNetworkClientById',
            (..._args) =>
              ({
                provider: { request: jest.fn() },
              }) as unknown as ReturnType<
                NetworkControllerGetNetworkClientByIdAction['handler']
              >,
          );
          baseMessenger.registerActionHandler(
            'AccountsController:getSelectedMultichainAccount',
            (..._args) =>
              ({
                address: '0xabc',
              }) as ReturnType<
                AccountsControllerGetSelectedMultichainAccountAction['handler']
              >,
          );
          baseMessenger.registerActionHandler(
            'NetworkController:findNetworkClientIdByChainId',
            (..._args) =>
              'test-client-id' as ReturnType<
                NetworkControllerFindNetworkClientIdByChainIdAction['handler']
              >,
          );
          baseMessenger.registerActionHandler(
            'GasFeeController:getState',
            (..._args) =>
              ({
                gasFeeEstimates: { estimatedBaseFee: '1' },
              }) as ReturnType<GetGasFeeState['handler']>,
          );

          // Gas estimates returned by TransactionController.estimateGasFee
          mockEstimateGasFeeFn.mockResolvedValue({
            estimates: {
              high: {
                maxFeePerGas: '0x1',
                maxPriorityFeePerGas: '0x2',
              },
            },
          });

          // Mock transaction addition result
          const mockTxResult = { transactionMeta: { id: 'tx-123' } };
          mockAddTransactionFn.mockResolvedValue(mockTxResult);

          // Provide product pricing and crypto payment info with unitDecimals small to avoid integer div to 0
          mockService.getPriceInfo.mockResolvedValue({
            products: [
              {
                name: ProductType.SHIELD,
                prices: [
                  {
                    interval: 'month',
                    currency: 'USD',
                    unitAmount: 10,
                    unitDecimals: 0,
                    trialPeriodDays: 0,
                    minBillingCycles: 1,
                  },
                ],
              },
            ],
            paymentMethods: [
              {
                type: PaymentType.CRYPTO,
                chains: [
                  {
                    chainId: '0x1',
                    paymentAddress: '0xspender',
                    tokens: [
                      {
                        address: '0xtoken',
                        decimals: 18,
                        conversionRate: { USD: '1.0' },
                      },
                    ],
                  },
                ],
              },
            ],
          });

          const result = await controller.createCryptoApproveTransaction({
            chainId: '0x1',
            tokenAddress: '0xtoken',
            productType: ProductType.SHIELD,
            interval: 'month',
          });

          expect(result).toStrictEqual({ transactionResult: mockTxResult });
          expect(mockAddTransactionFn).toHaveBeenCalledTimes(1);
          expect(mockEstimateGasFeeFn).toHaveBeenCalledTimes(1);
          // Ensure approve calldata was built
          expect(encodeFunctionDataMock).toHaveBeenCalledWith('approve', [
            '0xspender',
            expect.anything(),
          ]);
          // Ensure the encoded data is used in the transaction params
          const [txParamsArg] = mockAddTransactionFn.mock.calls[0];
          expect(txParamsArg).toMatchObject({
            to: '0xtoken',
            from: '0xabc',
            value: '0',
            data: '0xabcdef',
          });
        },
      );
    });

    it('throws when product price not found', async () => {
      await withController(async ({ controller, mockService }) => {
        mockService.getPriceInfo.mockResolvedValue({
          products: [],
          paymentMethods: [],
        });

        await expect(
          controller.createCryptoApproveTransaction({
            chainId: '0x1',
            tokenAddress: '0xtoken',
            productType: ProductType.SHIELD,
            interval: 'month',
          }),
        ).rejects.toThrow('Product price not found');
      });
    });

    it('throws when price not found for interval', async () => {
      await withController(async ({ controller, mockService }) => {
        mockService.getPriceInfo.mockResolvedValue({
          products: [
            {
              name: ProductType.SHIELD,
              prices: [
                {
                  interval: 'year',
                  currency: 'USD',
                  unitAmount: 10,
                  unitDecimals: 18,
                  trialPeriodDays: 0,
                  minBillingCycles: 1,
                },
              ],
            },
          ],
          paymentMethods: [],
        });

        await expect(
          controller.createCryptoApproveTransaction({
            chainId: '0x1',
            tokenAddress: '0xtoken',
            productType: ProductType.SHIELD,
            interval: 'month',
          }),
        ).rejects.toThrow('Price not found');
      });
    });

    it('throws when chains payment info not found', async () => {
      await withController(async ({ controller, mockService }) => {
        mockService.getPriceInfo.mockResolvedValue({
          products: [
            {
              name: ProductType.SHIELD,
              prices: [
                {
                  interval: 'month',
                  currency: 'USD',
                  unitAmount: 10,
                  unitDecimals: 18,
                  trialPeriodDays: 0,
                  minBillingCycles: 1,
                },
              ],
            },
          ],
          paymentMethods: [
            {
              type: PaymentType.CARD,
            },
          ],
        });

        await expect(
          controller.createCryptoApproveTransaction({
            chainId: '0x1',
            tokenAddress: '0xtoken',
            productType: ProductType.SHIELD,
            interval: 'month',
          }),
        ).rejects.toThrow('Chains payment info not found');
      });
    });

    it('throws when invalid chain id', async () => {
      await withController(async ({ controller, mockService }) => {
        mockService.getPriceInfo.mockResolvedValue({
          products: [
            {
              name: ProductType.SHIELD,
              prices: [
                {
                  interval: 'month',
                  currency: 'USD',
                  unitAmount: 10,
                  unitDecimals: 18,
                  trialPeriodDays: 0,
                  minBillingCycles: 1,
                },
              ],
            },
          ],
          paymentMethods: [
            {
              type: PaymentType.CRYPTO,
              chains: [
                {
                  chainId: '0x2',
                  paymentAddress: '0xspender',
                  tokens: [],
                },
              ],
            },
          ],
        });

        await expect(
          controller.createCryptoApproveTransaction({
            chainId: '0x1',
            tokenAddress: '0xtoken',
            productType: ProductType.SHIELD,
            interval: 'month',
          }),
        ).rejects.toThrow('Invalid chain id');
      });
    });

    it('throws when invalid token address', async () => {
      await withController(async ({ controller, mockService }) => {
        mockService.getPriceInfo.mockResolvedValue({
          products: [
            {
              name: ProductType.SHIELD,
              prices: [
                {
                  interval: 'month',
                  currency: 'USD',
                  unitAmount: 10,
                  unitDecimals: 18,
                  trialPeriodDays: 0,
                  minBillingCycles: 1,
                },
              ],
            },
          ],
          paymentMethods: [
            {
              type: PaymentType.CRYPTO,
              chains: [
                {
                  chainId: '0x1',
                  paymentAddress: '0xspender',
                  tokens: [
                    {
                      address: '0xothertoken',
                      decimals: 18,
                      conversionRate: { USD: '1.0' },
                    },
                  ],
                },
              ],
            },
          ],
        });

        await expect(
          controller.createCryptoApproveTransaction({
            chainId: '0x1',
            tokenAddress: '0xtoken',
            productType: ProductType.SHIELD,
            interval: 'month',
          }),
        ).rejects.toThrow('Invalid token address');
      });
    });

    it('throws when no provider found', async () => {
      await withController(
        async ({ controller, mockService, baseMessenger }) => {
          // Provide full, valid pricing so it reaches provider retrieval
          mockService.getPriceInfo.mockResolvedValue({
            products: [
              {
                name: ProductType.SHIELD,
                prices: [
                  {
                    interval: 'month',
                    currency: 'USD',
                    unitAmount: 10,
                    unitDecimals: 18,
                    trialPeriodDays: 0,
                    minBillingCycles: 1,
                  },
                ],
              },
            ],
            paymentMethods: [
              {
                type: PaymentType.CRYPTO,
                chains: [
                  {
                    chainId: '0x1',
                    paymentAddress: '0xspender',
                    tokens: [
                      {
                        address: '0xtoken',
                        decimals: 18,
                        conversionRate: { USD: '1.0' },
                      },
                    ],
                  },
                ],
              },
            ],
          });

          // Selected network client id exists, but provider missing
          baseMessenger.registerActionHandler(
            'NetworkController:getState',
            (..._args) =>
              ({
                selectedNetworkClientId: 'test-client-id',
              }) as ReturnType<NetworkControllerGetStateAction['handler']>,
          );
          baseMessenger.registerActionHandler(
            'NetworkController:getNetworkClientById',
            (..._args) =>
              ({}) as unknown as ReturnType<
                NetworkControllerGetNetworkClientByIdAction['handler']
              >,
          );
          baseMessenger.registerActionHandler(
            'NetworkController:findNetworkClientIdByChainId',
            (..._args) =>
              'test-client-id' as ReturnType<
                NetworkControllerFindNetworkClientIdByChainIdAction['handler']
              >,
          );

          await expect(
            controller.createCryptoApproveTransaction({
              chainId: '0x1',
              tokenAddress: '0xtoken',
              productType: ProductType.SHIELD,
              interval: 'month',
            }),
          ).rejects.toThrow('No provider found');
        },
      );
    });

    it('throws when conversion rate not found', async () => {
      await withController(
        async ({ controller, mockService, baseMessenger }) => {
          // Valid product and chain/token, but token lacks conversion rate for currency
          mockService.getPriceInfo.mockResolvedValue({
            products: [
              {
                name: ProductType.SHIELD,
                prices: [
                  {
                    interval: 'month',
                    currency: 'USD',
                    unitAmount: 10,
                    unitDecimals: 18,
                    trialPeriodDays: 0,
                    minBillingCycles: 1,
                  },
                ],
              },
            ],
            paymentMethods: [
              {
                type: PaymentType.CRYPTO,
                chains: [
                  {
                    chainId: '0x1',
                    paymentAddress: '0xspender',
                    tokens: [
                      {
                        address: '0xtoken',
                        decimals: 18,
                        conversionRate: {},
                      },
                    ],
                  },
                ],
              },
            ],
          });

          // Set up required cross-controller handlers so we reach conversion rate check
          baseMessenger.registerActionHandler(
            'NetworkController:getState',
            (..._args) =>
              ({
                selectedNetworkClientId: 'test-client-id',
              }) as ReturnType<NetworkControllerGetStateAction['handler']>,
          );
          baseMessenger.registerActionHandler(
            'NetworkController:getNetworkClientById',
            (..._args) =>
              ({
                provider: { request: jest.fn() },
              }) as unknown as ReturnType<
                NetworkControllerGetNetworkClientByIdAction['handler']
              >,
          );
          baseMessenger.registerActionHandler(
            'AccountsController:getSelectedMultichainAccount',
            (..._args) =>
              ({
                address: '0xabc',
              }) as ReturnType<
                AccountsControllerGetSelectedMultichainAccountAction['handler']
              >,
          );
          baseMessenger.registerActionHandler(
            'NetworkController:findNetworkClientIdByChainId',
            (..._args) =>
              'test-client-id' as ReturnType<
                NetworkControllerFindNetworkClientIdByChainIdAction['handler']
              >,
          );

          await expect(
            controller.createCryptoApproveTransaction({
              chainId: '0x1',
              tokenAddress: '0xtoken',
              productType: ProductType.SHIELD,
              interval: 'month',
            }),
          ).rejects.toThrow('Conversion rate not found');
        },
      );
    });

    it('throws when no wallet address found', async () => {
      const ContractCtorLocal = Contract as unknown as jest.Mock;
      const instance = {
        allowance: jest.fn().mockResolvedValue(BigNumber.from('0')),
        interface: { encodeFunctionData: jest.fn() },
      } as unknown as Contract;
      ContractCtorLocal.mockImplementation(() => instance);

      await withController(
        async ({ controller, mockService, baseMessenger }) => {
          baseMessenger.registerActionHandler(
            'NetworkController:getState',
            (..._args) =>
              ({
                selectedNetworkClientId: 'test-client-id',
              }) as ReturnType<NetworkControllerGetStateAction['handler']>,
          );
          baseMessenger.registerActionHandler(
            'NetworkController:getNetworkClientById',
            (..._args) =>
              ({
                provider: { request: jest.fn() },
              }) as unknown as ReturnType<
                NetworkControllerGetNetworkClientByIdAction['handler']
              >,
          );
          baseMessenger.registerActionHandler(
            'AccountsController:getSelectedMultichainAccount',
            (..._args) =>
              undefined as ReturnType<
                AccountsControllerGetSelectedMultichainAccountAction['handler']
              >,
          );
          baseMessenger.registerActionHandler(
            'NetworkController:findNetworkClientIdByChainId',
            (..._args) =>
              'test-client-id' as ReturnType<
                NetworkControllerFindNetworkClientIdByChainIdAction['handler']
              >,
          );

          mockService.getPriceInfo.mockResolvedValue({
            products: [
              {
                name: ProductType.SHIELD,
                prices: [
                  {
                    interval: 'month',
                    currency: 'USD',
                    unitAmount: 800,
                    unitDecimals: 2,
                    trialPeriodDays: 0,
                    minBillingCycles: 12,
                  },
                ],
              },
            ],
            paymentMethods: [
              {
                type: PaymentType.CRYPTO,
                chains: [
                  {
                    chainId: '0x1',
                    paymentAddress: '0xspender',
                    tokens: [
                      {
                        address: '0xtoken',
                        decimals: 18,
                        conversionRate: { USD: '1.0' },
                      },
                    ],
                  },
                ],
              },
            ],
          });

          await expect(
            controller.createCryptoApproveTransaction({
              chainId: '0x1',
              tokenAddress: '0xtoken',
              productType: ProductType.SHIELD,
              interval: 'month',
            }),
          ).rejects.toThrow('No wallet address found');
        },
      );
    });
  });
});
