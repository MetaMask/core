import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import type { HyperLiquidProvider } from '../../../src/providers/HyperLiquidProvider.js';
import type {
  AccountState,
  MarginAdjustmentLimits,
  PerpsTradingAgentValidity,
  Position,
  SubscribeAccountParams,
  SubscribePositionsParams,
} from '../../../src/types/index.js';
import { calculateMaxRemovableMargin } from '../../../src/utils/marginAdjustment.js';
import {
  AGENT_ADDRESS,
  L1_PAYLOAD,
  unknownWalletError,
} from '../../helpers/agentFixtures.js';
import {
  NOW,
  createAccountSignerProvider,
  setUpAccountSignerSuite,
} from '../../helpers/hyperLiquidAccountSignerFixture.js';
import type { AccountSignerFixture } from '../../helpers/hyperLiquidAccountSignerFixture.js';
import { createMockPosition } from '../../helpers/providerMocks.js';

vi.mock('@nktkas/hyperliquid', () => ({
  HyperliquidError: class MockHyperliquidError extends Error {},
}));
vi.mock('../../../src/services/HyperLiquidClientService');
vi.mock('../../../src/services/HyperLiquidSubscriptionService');

/**
 * Let pending promise chains settle; setImmediate is not faked.
 *
 * @returns Resolves once queued work ran.
 */
const flush = async (): Promise<void> =>
  await new Promise((resolve) => setImmediate(resolve));

describe('HyperLiquidProvider stream subscriptions', () => {
  let mockClientService: ReturnType<
    typeof setUpAccountSignerSuite
  >['mockClientService'];

  beforeEach(() => {
    ({ mockClientService } = setUpAccountSignerSuite());
    vi.useFakeTimers({
      now: NOW,
      toFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'Date',
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('subscribeToMarginAdjustmentLimits', () => {
    const isolatedEth = createMockPosition({
      symbol: 'ETH',
      positionValue: '15.02664',
      marginUsed: '3.285646',
      leverage: { type: 'isolated', value: 5 },
    }) as Position;
    const ethMaxRemove = (
      Math.floor(
        calculateMaxRemovableMargin({
          currentMargin: 3.285646,
          positionLeverage: 5,
          notionalValue: 15.02664,
        }) * 1e6,
      ) / 1e6
    ).toString();
    const account = (overrides: Partial<AccountState>): AccountState => ({
      totalBalance: '300',
      spendableBalance: '271.427458',
      withdrawableBalance: '271.427458',
      marginUsed: '0',
      unrealizedPnl: '0',
      returnOnEquity: '0',
      ...overrides,
    });

    /**
     * A provider whose account and position streams the test pushes.
     *
     * @returns The provider, its info client and the push functions.
     */
    function createStreamingProvider(): {
      provider: HyperLiquidProvider;
      infoClient: AccountSignerFixture['infoClient'];
      pushAccount: (state: AccountState | null) => void;
      pushPositions: (positions: Position[]) => void;
      stopAccount: Mock;
      stopPositions: Mock;
    } {
      const { accountSignerProvider: provider, infoClient } =
        createAccountSignerProvider();
      let accountParams: SubscribeAccountParams | undefined;
      let positionParams: SubscribePositionsParams | undefined;
      const stopAccount = vi.fn();
      const stopPositions = vi.fn();
      vi.spyOn(provider, 'subscribeToAccount').mockImplementation((params) => {
        accountParams = params;
        return stopAccount;
      });
      vi.spyOn(provider, 'subscribeToPositions').mockImplementation(
        (params) => {
          positionParams = params;
          return stopPositions;
        },
      );
      return {
        provider,
        infoClient,
        pushAccount: (state) => accountParams?.callback(state),
        pushPositions: (positions) => positionParams?.callback(positions),
        stopAccount,
        stopPositions,
      };
    }

    it('computes the limits from the streams, with no venue reads and no timer', async () => {
      const { provider, infoClient, pushAccount, pushPositions } =
        createStreamingProvider();
      const timers = vi.getTimerCount();
      const callback = vi.fn<(limits: MarginAdjustmentLimits) => void>();

      provider.subscribeToMarginAdjustmentLimits({ symbol: 'ETH', callback });
      await flush();
      pushAccount(account({ accountMode: 'unifiedAccount' }));
      pushPositions([isolatedEth]);

      expect(callback.mock.calls).toStrictEqual([
        [{ status: 'unavailable', reason: 'account_unknown' }],
        [
          {
            status: 'available',
            maxAdd: '271.427458',
            maxRemove: ethMaxRemove,
          },
        ],
      ]);
      expect(infoClient.clearinghouseState).not.toHaveBeenCalled();
      expect(infoClient.userAbstraction).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(timers);
    });

    it('adds from the DEX withdrawable in Standard mode and follows position changes', async () => {
      const { provider, pushAccount, pushPositions } =
        createStreamingProvider();
      const callback = vi.fn<(limits: MarginAdjustmentLimits) => void>();
      provider.subscribeToMarginAdjustmentLimits({ symbol: 'ETH', callback });
      await flush();

      pushAccount(
        account({
          accountMode: 'default',
          subAccountBreakdown: {
            main: {
              spendableBalance: '0.019288',
              withdrawableBalance: '0.019288',
              totalBalance: '13.37',
            },
          },
        }),
      );
      pushPositions([isolatedEth]);
      pushPositions([isolatedEth]);
      pushPositions([]);

      expect(callback.mock.calls.slice(1)).toStrictEqual([
        [{ status: 'available', maxAdd: '0.019288', maxRemove: ethMaxRemove }],
        [{ status: 'unavailable', reason: 'no_isolated_position' }],
      ]);
    });

    it('reports an account mode without isolated limits as provider', async () => {
      const { provider, pushAccount, pushPositions } =
        createStreamingProvider();
      const callback = vi.fn<(limits: MarginAdjustmentLimits) => void>();
      provider.subscribeToMarginAdjustmentLimits({ symbol: 'ETH', callback });
      await flush();

      pushAccount(account({ accountMode: 'dexAbstraction' }));
      pushPositions([isolatedEth]);

      expect(callback).toHaveBeenLastCalledWith({
        status: 'unavailable',
        reason: 'provider',
      });
    });

    it('stops both streams on unsubscribe', async () => {
      const { provider, stopAccount, stopPositions, pushAccount } =
        createStreamingProvider();
      const callback = vi.fn();
      const unsubscribe = provider.subscribeToMarginAdjustmentLimits({
        symbol: 'ETH',
        callback,
      });
      await flush();
      unsubscribe();
      pushAccount(account({ accountMode: 'unifiedAccount' }));

      expect(stopAccount).toHaveBeenCalledTimes(1);
      expect(stopPositions).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('subscribeToConnectionLatency', () => {
    it('streams the client service keepalive round trip', () => {
      const unsubscribe = vi.fn();
      const subscribeToLatency = vi.fn(
        (listener: (latencyMs: number) => void) => {
          listener(87);
          return unsubscribe;
        },
      );
      Object.assign(mockClientService, { subscribeToLatency });
      const { accountSignerProvider: provider } = createAccountSignerProvider();
      const callback = vi.fn();

      provider.subscribeToConnectionLatency({ callback })();

      expect(callback.mock.calls).toStrictEqual([[87]]);
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe('subscribeToTradingAgentValidity', () => {
    /**
     * A provider whose getAgentSigner answers the fixture agent and whose
     * venue lists agents as `extraAgents` answers.
     *
     * @param listed - The agents the venue lists.
     * @returns The provider and its mocks.
     */
    function createAgentProvider(
      listed: { address: string; validUntil: number | null }[],
    ): AccountSignerFixture & { extraAgents: Mock; getAgentSigner: Mock } {
      const getAgentSigner = vi.fn();
      const extraAgents = vi
        .fn()
        .mockResolvedValue(
          listed.map((agent) => ({ ...agent, name: 'agent' })),
        );
      const built = createAccountSignerProvider({
        abstraction: 'unifiedAccount',
        getAgentSigner,
        info: { extraAgents },
      });
      getAgentSigner.mockResolvedValue(built.agentSigner);
      return { ...built, extraAgents, getAgentSigner };
    }

    it('reports a listed agent as valid, then expired at its validUntil with one timeout', async () => {
      const { accountSignerProvider: provider } = createAgentProvider([
        { address: AGENT_ADDRESS, validUntil: NOW + 60_000 },
      ]);
      const callback = vi.fn<(validity: PerpsTradingAgentValidity) => void>();
      const timers = vi.getTimerCount();

      const unsubscribe = provider.subscribeToTradingAgentValidity({
        callback,
      });
      await flush();
      expect(vi.getTimerCount()).toBe(timers + 1);
      vi.advanceTimersByTime(60_000);

      expect(callback.mock.calls).toStrictEqual([
        [
          {
            status: 'valid',
            agentAddress: AGENT_ADDRESS,
            validUntil: NOW + 60_000,
          },
        ],
        [{ status: 'invalid', reason: 'expired', agentAddress: AGENT_ADDRESS }],
      ]);
      expect(vi.getTimerCount()).toBe(timers);
      unsubscribe();
    });

    it('arms no timer for an agent without expiry, and clears the deadline on unsubscribe', async () => {
      const { accountSignerProvider: provider } = createAgentProvider([
        { address: AGENT_ADDRESS, validUntil: null },
      ]);
      const timers = vi.getTimerCount();
      const callback = vi.fn();

      const unsubscribe = provider.subscribeToTradingAgentValidity({
        callback,
      });
      await flush();
      unsubscribe();

      expect(callback.mock.calls).toStrictEqual([
        [{ status: 'valid', agentAddress: AGENT_ADDRESS, validUntil: null }],
      ]);
      expect(vi.getTimerCount()).toBe(timers);
    });

    it('reads again when agents are set or cleared', async () => {
      const {
        accountSignerProvider: provider,
        extraAgents,
        getAgentSigner,
      } = createAgentProvider([]);
      const callback = vi.fn();
      provider.subscribeToTradingAgentValidity({ callback });
      await flush();

      getAgentSigner.mockResolvedValue(null);
      provider.clearAgentSigners();
      await flush();

      expect(callback.mock.calls).toStrictEqual([
        [
          {
            status: 'invalid',
            reason: 'not_approved',
            agentAddress: AGENT_ADDRESS,
          },
        ],
        [{ status: 'invalid', reason: 'no_agent' }],
      ]);
      expect(extraAgents).toHaveBeenCalledTimes(1);
    });

    it('pushes rejected when the venue rejects the agent', async () => {
      const {
        accountSignerProvider: provider,
        agentSigner,
        exchangeClient,
        sdkWallet,
      } = createAgentProvider([{ address: AGENT_ADDRESS, validUntil: null }]);
      await provider.getMarketDataWithPrices();
      exchangeClient.cancel.mockImplementation(async () => {
        await sdkWallet().signTypedData(L1_PAYLOAD);
        throw unknownWalletError(agentSigner.address);
      });
      const callback = vi.fn();
      provider.subscribeToTradingAgentValidity({ callback });
      await flush();

      await provider.cancelOrder({ orderId: '123', symbol: 'BTC' });

      expect(callback).toHaveBeenLastCalledWith({
        status: 'invalid',
        reason: 'rejected',
        agentAddress: AGENT_ADDRESS,
      });
    });

    it('reports not_required when the account signs without an agent', async () => {
      const extraAgents = vi.fn();
      const { accountSignerProvider: provider } = createAccountSignerProvider({
        info: { extraAgents },
      });
      const callback = vi.fn();

      provider.subscribeToTradingAgentValidity({ callback });
      await flush();

      expect(callback.mock.calls).toStrictEqual([[{ status: 'not_required' }]]);
      expect(extraAgents).not.toHaveBeenCalled();
    });

    it('reports a failed agent list read as unknown', async () => {
      const built = createAgentProvider([]);
      built.extraAgents.mockRejectedValue(new Error('network'));
      const callback = vi.fn();

      built.accountSignerProvider.subscribeToTradingAgentValidity({ callback });
      await flush();

      expect(callback.mock.calls).toStrictEqual([
        [{ status: 'unknown', reason: 'read_failed' }],
      ]);
    });
  });
});
