import type { Hex } from '@metamask/utils';

import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import type { HyperLiquidProvider } from '../../../src/providers/HyperLiquidProvider.js';
import {
  AGENT_ADDRESS,
  L1_PAYLOAD,
  MAIN_ADDRESS,
  MAINNET_ACCOUNT,
  unknownWalletError,
} from '../../helpers/agentFixtures.js';
import {
  NOW,
  RESTING_ORDER_ID,
  cancelStatusesResponse,
  createAccountSignerProvider,
  orderIdOf,
  setUpAccountSignerSuite,
} from '../../helpers/hyperLiquidAccountSignerFixture.js';
import { createFrontendOpenOrder } from '../../helpers/providerMocks.js';

// The SDK ships ES modules only; the provider reaches it through the mocked
// client service, so the module itself is never loaded. The provider checks
// cancel errors against its error class.
jest.mock('@nktkas/hyperliquid', () => ({
  HyperliquidError: class MockHyperliquidError extends Error {},
}));

// The client and subscription services are mocked: they own the SDK's
// REST/exchange/info clients and the WebSocket subscriptions. The wallet
// service, the signing caches and the validation run for real.
jest.mock('../../../src/services/HyperLiquidClientService');
jest.mock('../../../src/services/HyperLiquidSubscriptionService');

describe('HyperLiquidProvider with accountSigner: strategy cancels', () => {
  let loggerError: jest.SpyInstance;

  beforeEach(() => {
    ({ loggerError } = setUpAccountSignerSuite());
  });

  describe('with an agent', () => {
    describe('when a strategy cancel cannot be signed', () => {
      const ETH_ORDER = {
        symbol: 'ETH',
        isBuy: true,
        size: '1',
        currentPrice: 3000,
      } as const;
      const SCALE_ORDER = {
        ...ETH_ORDER,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 2,
      } as const;
      const TWAP_HISTORY = [
        {
          time: 1_700_000_030,
          twapId: 987,
          state: {
            coin: 'ETH',
            executedNtl: '0',
            executedSz: '0',
            minutes: 30,
            randomize: false,
            reduceOnly: false,
            side: 'B',
            sz: '1',
            timestamp: NOW,
            user: MAIN_ADDRESS,
          },
          status: { status: 'activated' },
        },
      ];

      /**
       * An ETH book whose best bid is the given price.
       *
       * @param bid - The best bid.
       * @returns The book.
       */
      const bookAt = (bid: string): Record<string, unknown> => ({
        coin: 'ETH',
        levels: [
          [{ px: bid, sz: '10', n: 1 }],
          [{ px: '3001', sz: '10', n: 1 }],
        ],
      });

      /**
       * An exchange response carrying one status per request.
       *
       * @param statuses - The statuses.
       * @returns The response.
       */
      const withStatuses = (
        ...statuses: unknown[]
      ): Record<string, unknown> => ({
        status: 'ok',
        response: { data: { statuses } },
      });

      type SignerFailure = 'locked' | 'unavailable' | 'rejected' | 'reported';

      /**
       * A provider whose strategy orders are placed while signing works, and
       * whose later cancels sign through the SDK wallet: `failSigning` makes
       * the account signer not ready (no agent), makes the agent fail to sign,
       * or has the venue reject the agent, by throwing or in the cancel status
       * entries.
       *
       * @param failure - How the cancel fails to be signed.
       * @returns The provider, its endpoints and the failure switch.
       */
      function createStrategyProvider(failure: SignerFailure): {
        provider: HyperLiquidProvider;
        order: jest.Mock;
        cancel: jest.Mock;
        cancelByCloid: jest.Mock;
        twapCancel: jest.Mock;
        twapOrder: jest.Mock;
        l2Book: jest.Mock;
        getAgentSigner: jest.Mock;
        onAgentRejected: jest.Mock;
        signL1Action: () => Promise<Hex>;
        failSigning: () => void;
      } {
        let signerReady = true;
        const cancel = jest.fn();
        const cancelByCloid = jest.fn();
        const twapCancel = jest.fn();
        const twapOrder = jest.fn();
        const l2Book = jest.fn().mockResolvedValue(bookAt('2999'));
        const getAgentSigner = jest.fn();
        const onAgentRejected = jest.fn();
        const fixture = createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          signer: { isReady: () => signerReady },
          getAgentSigner,
          onAgentRejected,
          exchange: { cancel, cancelByCloid, twapCancel, twapOrder },
          info: {
            twapHistory: jest.fn().mockResolvedValue(TWAP_HISTORY),
            userTwapSliceFills: jest.fn().mockResolvedValue([]),
            l2Book,
            // The resting chase order, read before a re-price.
            orderStatus: jest.fn().mockResolvedValue({
              status: 'order',
              order: {
                status: 'open',
                order: createFrontendOpenOrder({
                  coin: 'ETH',
                  limitPx: '2999.1',
                  sz: '1',
                  origSz: '1',
                  tif: 'Alo',
                }),
              },
            }),
          },
        });
        getAgentSigner.mockResolvedValue(
          failure === 'locked' ? null : fixture.agentSigner,
        );
        const signL1Action = async (): Promise<Hex> =>
          await fixture.sdkWallet().signTypedData(L1_PAYLOAD);
        const signedCancel = async (): Promise<never> => {
          await signL1Action();
          // Only a rejected agent gets this far.
          throw unknownWalletError(fixture.agentSigner.address);
        };
        // The venue answers with a rejection in every status entry.
        const rejectedEntry = {
          error: unknownWalletError(fixture.agentSigner.address).message,
        };
        const reportedCancel = async ({
          cancels,
        }: {
          cancels: unknown[];
        }): Promise<Record<string, unknown>> => {
          await signL1Action();
          return withStatuses(...cancels.map(() => rejectedEntry));
        };
        const reportedTwapCancel = async (): Promise<
          Record<string, unknown>
        > => {
          await signL1Action();
          return {
            status: 'ok',
            response: { type: 'twapCancel', data: { status: rejectedEntry } },
          };
        };
        return {
          provider: fixture.accountSignerProvider,
          order: fixture.exchangeClient.order,
          cancel,
          cancelByCloid,
          twapCancel,
          twapOrder,
          l2Book,
          getAgentSigner,
          onAgentRejected,
          signL1Action,
          failSigning: (): void => {
            signerReady = failure !== 'locked';
            if (failure === 'unavailable') {
              fixture.agentSigner.signTypedData.mockRejectedValue(
                new Error('agent key locked'),
              );
            }
            if (failure === 'reported') {
              cancel.mockImplementation(reportedCancel);
              cancelByCloid.mockImplementation(reportedCancel);
              twapCancel.mockImplementation(reportedTwapCancel);
              return;
            }
            for (const endpoint of [cancel, cancelByCloid, twapCancel]) {
              endpoint.mockImplementation(signedCancel);
            }
          },
        };
      }

      const SIGNER_FAILURES = [
        {
          name: 'an account signer that is not ready',
          failure: 'locked',
          rejectedAgents: [],
        },
        {
          name: 'an agent that cannot sign',
          failure: 'unavailable',
          rejectedAgents: [],
        },
        {
          name: 'an agent the venue rejects',
          failure: 'rejected',
          rejectedAgents: [[MAINNET_ACCOUNT, AGENT_ADDRESS]],
        },
        {
          name: 'an agent the venue rejects in status entries',
          failure: 'reported',
          rejectedAgents: [[MAINNET_ACCOUNT, AGENT_ADDRESS]],
        },
      ] as const;

      it.each(SIGNER_FAILURES)(
        'fails a TWAP cancel with KEYRING_LOCKED without logging it, for $name',
        async ({ failure, rejectedAgents }) => {
          const { provider, twapCancel, onAgentRejected, failSigning } =
            createStrategyProvider(failure);
          await provider.getMarketDataWithPrices();
          failSigning();

          const result = await provider.cancelOrder({
            orderId: '987',
            symbol: 'ETH',
            orderType: 'twap',
          });

          expect(result).toStrictEqual({
            success: false,
            orderId: '987',
            error: PERPS_ERROR_CODES.KEYRING_LOCKED,
          });
          expect(twapCancel.mock.calls).toStrictEqual([[{ a: 1, t: 987 }]]);
          expect(onAgentRejected.mock.calls).toStrictEqual(rejectedAgents);
          expect(loggerError).not.toHaveBeenCalled();
        },
      );

      it.each(SIGNER_FAILURES)(
        'fails a scale cancel with KEYRING_LOCKED and keeps the ladder cancellable, for $name',
        async ({ failure, rejectedAgents }) => {
          const { provider, order, cancel, onAgentRejected, failSigning } =
            createStrategyProvider(failure);
          order.mockResolvedValueOnce(
            withStatuses({ resting: { oid: 11 } }, { resting: { oid: 22 } }),
          );
          const placed = await provider.placeOrder(SCALE_ORDER);
          failSigning();

          const result = await provider.cancelOrder({
            orderId: orderIdOf(placed),
            symbol: 'ETH',
            orderType: 'scale',
          });
          cancel.mockResolvedValue(withStatuses('success', 'success'));
          const retry = await provider.cancelOrder({
            orderId: orderIdOf(placed),
            symbol: 'ETH',
            orderType: 'scale',
          });

          expect(result).toStrictEqual({
            success: false,
            orderId: placed.orderId,
            error: PERPS_ERROR_CODES.KEYRING_LOCKED,
          });
          expect(retry).toStrictEqual({
            success: true,
            orderId: placed.orderId,
          });
          expect(cancel.mock.calls).toStrictEqual([
            [
              {
                cancels: [
                  { a: 1, o: 11 },
                  { a: 1, o: 22 },
                ],
              },
            ],
            [
              {
                cancels: [
                  { a: 1, o: 11 },
                  { a: 1, o: 22 },
                ],
              },
            ],
          ]);
          expect(onAgentRejected.mock.calls).toStrictEqual(rejectedAgents);
          expect(loggerError).not.toHaveBeenCalled();
        },
      );

      it.each(['returned', 'thrown'] as const)(
        'keeps only the rungs a cancel by client order ID left resting when the venue cancels one and rejects the agent on the other (%s by the SDK)',
        async (delivery) => {
          const {
            provider,
            order,
            cancelByCloid,
            onAgentRejected,
            signL1Action,
          } = createStrategyProvider('reported');
          // Neither rung rests, and the cleanup cannot cancel them, so the
          // ladder stays registered by client order ID.
          order.mockResolvedValueOnce(
            withStatuses('waitingForFill', 'waitingForFill'),
          );
          cancelByCloid.mockResolvedValueOnce(
            withStatuses({ error: 'Busy' }, { error: 'Busy' }),
          );
          const placed = await provider.placeOrder(SCALE_ORDER);
          const [[{ orders }]] = order.mock.calls as [
            [{ orders: { c: Hex }[] }],
          ];
          loggerError.mockClear();
          cancelByCloid.mockImplementationOnce(async () => {
            await signL1Action();
            return cancelStatusesResponse(
              ['success', { error: unknownWalletError(AGENT_ADDRESS).message }],
              delivery,
            );
          });

          const result = await provider.cancelOrder({
            orderId: orderIdOf(placed),
            symbol: 'ETH',
            orderType: 'scale',
          });
          cancelByCloid.mockResolvedValueOnce(withStatuses('success'));
          const retry = await provider.cancelOrder({
            orderId: orderIdOf(placed),
            symbol: 'ETH',
            orderType: 'scale',
          });

          expect(result).toStrictEqual({
            success: false,
            orderId: placed.orderId,
            error: PERPS_ERROR_CODES.KEYRING_LOCKED,
          });
          expect(retry).toStrictEqual({
            success: true,
            orderId: placed.orderId,
          });
          const bothRungs = {
            cancels: orders.map(({ c }) => ({ asset: 1, cloid: c })),
          };
          // The placement's cleanup, the cancel, then the retry of the rung
          // that was not cancelled.
          expect(cancelByCloid.mock.calls).toStrictEqual([
            [bothRungs],
            [bothRungs],
            [{ cancels: [{ asset: 1, cloid: orders[1].c }] }],
          ]);
          expect(onAgentRejected.mock.calls).toStrictEqual([
            [MAINNET_ACCOUNT, AGENT_ADDRESS],
          ]);
          expect(loggerError).not.toHaveBeenCalled();
        },
      );

      it.each(SIGNER_FAILURES)(
        'fails a scale cancel by client order ID with KEYRING_LOCKED, for $name',
        async ({ failure, rejectedAgents }) => {
          const {
            provider,
            order,
            cancelByCloid,
            onAgentRejected,
            failSigning,
          } = createStrategyProvider(failure);
          // Neither rung rests, and the cleanup cannot cancel them, so the
          // ladder stays registered by client order ID.
          order.mockResolvedValueOnce(
            withStatuses('waitingForFill', 'waitingForFill'),
          );
          cancelByCloid.mockResolvedValueOnce(
            withStatuses({ error: 'Busy' }, { error: 'Busy' }),
          );
          const placed = await provider.placeOrder(SCALE_ORDER);
          const [[{ orders }]] = order.mock.calls as [
            [{ orders: { c: Hex }[] }],
          ];
          loggerError.mockClear();
          failSigning();

          const result = await provider.cancelOrder({
            orderId: orderIdOf(placed),
            symbol: 'ETH',
            orderType: 'scale',
          });

          const { orderId: groupId, ...placement } = placed;
          expect(groupId).toMatch(/^scale:/u);
          expect(placement).toStrictEqual({
            success: false,
            error: PERPS_ERROR_CODES.ORDER_STRATEGY_CANCEL_INCOMPLETE,
            acceptedChildren: [
              { state: 'waitingForFill' },
              { state: 'waitingForFill' },
            ],
            acceptedSize: '1',
            submittedSize: '1',
            weightedAverageLimitPrice: '2500',
            childOrderIds: [],
          });
          expect(result).toStrictEqual({
            success: false,
            orderId: placed.orderId,
            error: PERPS_ERROR_CODES.KEYRING_LOCKED,
          });
          const cloidCancels = {
            cancels: orders.map(({ c }) => ({ asset: 1, cloid: c })),
          };
          // The placement's cleanup, then the cancel.
          expect(cancelByCloid.mock.calls).toStrictEqual([
            [cloidCancels],
            [cloidCancels],
          ]);
          expect(onAgentRejected.mock.calls).toStrictEqual(rejectedAgents);
          expect(loggerError).not.toHaveBeenCalled();
        },
      );

      it.each(SIGNER_FAILURES)(
        'fails a chase cancel with KEYRING_LOCKED without logging it, for $name',
        async ({ failure, rejectedAgents }) => {
          const { provider, cancel, onAgentRejected, failSigning } =
            createStrategyProvider(failure);
          const placed = await provider.placeOrder({
            ...ETH_ORDER,
            orderType: 'chase',
          });
          failSigning();

          const result = await provider.cancelOrder({
            orderId: orderIdOf(placed),
            symbol: 'ETH',
            orderType: 'chase',
          });

          expect(result).toStrictEqual({
            success: false,
            orderId: placed.orderId,
            error: PERPS_ERROR_CODES.KEYRING_LOCKED,
          });
          expect(cancel.mock.calls).toStrictEqual([
            [{ cancels: [{ a: 1, o: RESTING_ORDER_ID }] }],
          ]);
          expect(onAgentRejected.mock.calls).toStrictEqual(rejectedAgents);
          expect(loggerError).not.toHaveBeenCalled();
        },
      );

      it.each([
        [
          'thrown',
          (): Promise<never> =>
            Promise.reject(unknownWalletError(AGENT_ADDRESS)),
        ],
        [
          'in its status entry',
          async (): Promise<Record<string, unknown>> => ({
            status: 'ok',
            response: {
              type: 'twapCancel',
              data: {
                status: { error: unknownWalletError(AGENT_ADDRESS).message },
              },
            },
          }),
        ],
      ])(
        'drops an agent the venue rejects while retracting a stale TWAP (%s)',
        async (_how, answerCancel) => {
          const {
            provider,
            twapOrder,
            twapCancel,
            getAgentSigner,
            onAgentRejected,
            signL1Action,
          } = createStrategyProvider('rejected');
          let disconnected: Promise<unknown> | undefined;
          // The provider is torn down while the TWAP is placed, so it
          // retracts it.
          twapOrder.mockImplementation(async () => {
            await signL1Action();
            disconnected = provider.disconnect();
            return {
              status: 'ok',
              response: {
                type: 'twapOrder',
                data: { status: { running: { twapId: 987 } } },
              },
            };
          });
          twapCancel.mockImplementation(async () => {
            await signL1Action();
            return await answerCancel();
          });

          const placed = await provider.placeOrder({
            ...ETH_ORDER,
            orderType: 'twap',
            twapDuration: 30,
          });
          await disconnected;
          await signL1Action();

          // The retraction was refused, so the TWAP is reported as live.
          expect(placed).toStrictEqual({
            success: false,
            error: PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
            submittedSize: '1',
            orderId: '987',
          });
          expect(twapCancel.mock.calls).toStrictEqual([[{ a: 1, t: 987 }]]);
          expect(onAgentRejected.mock.calls).toStrictEqual([
            [MAINNET_ACCOUNT, AGENT_ADDRESS],
          ]);
          // Dropped, so the next L1 action asks again.
          expect(getAgentSigner.mock.calls).toStrictEqual([
            [MAINNET_ACCOUNT],
            [MAINNET_ACCOUNT],
          ]);
          expect(loggerError).not.toHaveBeenCalled();
        },
      );

      it.each([
        [
          'thrown',
          (): Promise<never> =>
            Promise.reject(unknownWalletError(AGENT_ADDRESS)),
        ],
        [
          'in its status entry',
          async (): Promise<Record<string, unknown>> =>
            withStatuses({ error: unknownWalletError(AGENT_ADDRESS).message }),
        ],
      ])(
        'drops an agent the venue rejects while retracting an abandoned chase order (%s)',
        async (_how, answerCancel) => {
          const {
            provider,
            order,
            cancel,
            getAgentSigner,
            onAgentRejected,
            signL1Action,
          } = createStrategyProvider('rejected');
          let disconnected: Promise<unknown> | undefined;
          // The provider is torn down while the chase order is placed, so it
          // retracts it.
          order.mockImplementation(async () => {
            await signL1Action();
            disconnected = provider.disconnect();
            return withStatuses({ resting: { oid: RESTING_ORDER_ID } });
          });
          cancel.mockImplementation(async () => {
            await signL1Action();
            return await answerCancel();
          });

          const placed = await provider.placeOrder({
            ...ETH_ORDER,
            orderType: 'chase',
          });
          await disconnected;
          await signL1Action();

          // The retraction was refused, so the order is reported as resting.
          expect(placed).toStrictEqual({
            success: false,
            error: PERPS_ERROR_CODES.ORDER_CHASE_ABANDONED,
            submittedSize: '1',
            childOrderIds: [String(RESTING_ORDER_ID)],
          });
          expect(cancel.mock.calls).toStrictEqual([
            [{ cancels: [{ a: 1, o: RESTING_ORDER_ID }] }],
          ]);
          expect(onAgentRejected.mock.calls).toStrictEqual([
            [MAINNET_ACCOUNT, AGENT_ADDRESS],
          ]);
          // Dropped, so the next L1 action asks again.
          expect(getAgentSigner.mock.calls).toStrictEqual([
            [MAINNET_ACCOUNT],
            [MAINNET_ACCOUNT],
          ]);
          expect(loggerError).not.toHaveBeenCalled();
        },
      );

      describe('during a chase re-price', () => {
        beforeEach(() => {
          jest.useFakeTimers();
        });

        afterEach(() => {
          jest.useRealTimers();
        });

        it('drops an agent the venue rejects, so the next L1 action asks again', async () => {
          const {
            provider,
            cancel,
            l2Book,
            getAgentSigner,
            onAgentRejected,
            signL1Action,
            failSigning,
          } = createStrategyProvider('rejected');
          await provider.placeOrder({
            ...ETH_ORDER,
            orderType: 'chase',
            chaseIntervalMs: 1000,
          });
          // The touch moves, so the next tick cancels to re-price.
          l2Book.mockResolvedValue(bookAt('2998'));
          failSigning();

          await jest.advanceTimersByTimeAsync(1000);
          await signL1Action();

          expect(cancel.mock.calls).toStrictEqual([
            [{ cancels: [{ a: 1, o: RESTING_ORDER_ID }] }],
          ]);
          expect(onAgentRejected.mock.calls).toStrictEqual([
            [MAINNET_ACCOUNT, AGENT_ADDRESS],
          ]);
          // Resolved for the placement, then asked again after the rejection.
          expect(getAgentSigner.mock.calls).toStrictEqual([
            [MAINNET_ACCOUNT],
            [MAINNET_ACCOUNT],
          ]);
          expect(loggerError).not.toHaveBeenCalled();
        });
      });
    });
  });
});
