import { getChecksumAddress } from '@metamask/utils';

import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import {
  AGENT_ADDRESS,
  L1_PAYLOAD,
  MAINNET_ACCOUNT,
  MAIN_ADDRESS,
  OTHER_MAIN_ADDRESS,
  mustDepositError,
} from '../../helpers/agentFixtures.js';
import {
  BTC_MARKET_ORDER,
  CANCEL_DELIVERIES,
  REFERRAL_WRITE,
  cancelStatusesResponse,
  createAccountSignerProvider,
  referralAttempted,
  setUpAccountSignerSuite,
} from '../../helpers/hyperLiquidAccountSignerFixture.js';
import type { AccountSignerFixture } from '../../helpers/hyperLiquidAccountSignerFixture.js';

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

const HOUR_MS = 60 * 60 * 1000;

type ListedAgent = {
  address: string;
  name: string;
  validUntil: number | null;
};

/**
 * The agent as `extraAgents` lists it.
 *
 * @param validUntil - When the approval ends, in milliseconds, or null for
 * no expiry.
 * @param address - The agent address as the venue reports it.
 * @returns The listing entry.
 */
function listedAgent(
  validUntil: number | null,
  address: string = AGENT_ADDRESS,
): ListedAgent {
  return { address, name: 'agent', validUntil };
}

describe('HyperLiquidProvider with accountSigner: an agent the venue answers with "Must deposit"', () => {
  let loggerError: jest.SpyInstance;

  beforeEach(() => {
    ({ loggerError } = setUpAccountSignerSuite());
  });

  /**
   * A provider whose L1 writes are signed by the agent, then refused by the
   * venue as an account that must deposit.
   *
   * @param write - The exchange write that fails.
   * @param agents - Answers `extraAgents` for the main account.
   * @param user - The main account the venue names.
   * @returns The provider, its mocks and the rejected agent.
   */
  function createMustDepositProvider(
    write: 'order' | 'cancel' | 'setReferrer',
    agents: () => Promise<ListedAgent[]>,
    user: string = MAIN_ADDRESS,
  ): AccountSignerFixture & {
    getAgentSigner: jest.Mock;
    onAgentRejected: jest.Mock;
    extraAgents: jest.Mock;
  } {
    const getAgentSigner = jest.fn();
    const onAgentRejected = jest.fn();
    const extraAgents = jest.fn(agents);
    const built = createAccountSignerProvider({
      abstraction: 'unifiedAccount',
      getAgentSigner,
      onAgentRejected,
      info: { extraAgents },
    });
    getAgentSigner.mockResolvedValue(built.agentSigner);
    built.exchangeClient[write].mockImplementation(async () => {
      await built.sdkWallet().signTypedData(L1_PAYLOAD);
      throw mustDepositError(user);
    });
    return { ...built, getAgentSigner, onAgentRejected, extraAgents };
  }

  describe.each([
    {
      venue: 'no longer lists the agent',
      agents: async (): Promise<ListedAgent[]> => [],
    },
    {
      venue: 'lists the agent as expired',
      agents: async (): Promise<ListedAgent[]> => [listedAgent(Date.now() - 1)],
    },
  ])('when the venue $venue', ({ agents }) => {
    it('fails the order with KEYRING_LOCKED, drops the agent and asks again', async () => {
      const {
        accountSignerProvider,
        extraAgents,
        getAgentSigner,
        onAgentRejected,
        sdkWallet,
      } = createMustDepositProvider('order', agents);
      await accountSignerProvider.getMarketDataWithPrices();

      const order = await accountSignerProvider.placeOrder(BTC_MARKET_ORDER);
      await sdkWallet().signTypedData(L1_PAYLOAD);

      expect(order).toStrictEqual({
        success: false,
        error: PERPS_ERROR_CODES.KEYRING_LOCKED,
      });
      expect(extraAgents.mock.calls).toStrictEqual([[{ user: MAIN_ADDRESS }]]);
      expect(onAgentRejected.mock.calls).toStrictEqual([
        [MAINNET_ACCOUNT, AGENT_ADDRESS],
      ]);
      expect(getAgentSigner.mock.calls).toStrictEqual([
        [MAINNET_ACCOUNT],
        [MAINNET_ACCOUNT],
      ]);
      expect(loggerError).not.toHaveBeenCalled();
    });

    it.each(CANCEL_DELIVERIES)(
      'drops the agent named in batch cancel status entries, checking the venue once ($label)',
      async ({ delivery }) => {
        const {
          accountSignerProvider,
          exchangeClient,
          extraAgents,
          getAgentSigner,
          onAgentRejected,
          sdkWallet,
        } = createMustDepositProvider('cancel', agents);
        await accountSignerProvider.getMarketDataWithPrices();
        const wallet = sdkWallet();
        exchangeClient.cancel.mockImplementation(async () => {
          await wallet.signTypedData(L1_PAYLOAD);
          return cancelStatusesResponse(
            [
              { error: mustDepositError(MAIN_ADDRESS).message },
              { error: mustDepositError(MAIN_ADDRESS).message },
            ],
            delivery,
          );
        });

        const result = await accountSignerProvider.cancelOrders([
          { orderId: '123', symbol: 'BTC' },
          { orderId: '124', symbol: 'BTC' },
        ]);
        await wallet.signTypedData(L1_PAYLOAD);

        expect(result).toStrictEqual({
          success: false,
          successCount: 0,
          failureCount: 2,
          results: [
            {
              orderId: '123',
              symbol: 'BTC',
              success: false,
              error: PERPS_ERROR_CODES.KEYRING_LOCKED,
            },
            {
              orderId: '124',
              symbol: 'BTC',
              success: false,
              error: PERPS_ERROR_CODES.KEYRING_LOCKED,
            },
          ],
        });
        // One signed write: one check, and the host is told once.
        expect(extraAgents.mock.calls).toStrictEqual([
          [{ user: MAIN_ADDRESS }],
        ]);
        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
        ]);
        expect(getAgentSigner.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT],
          [MAINNET_ACCOUNT],
        ]);
        expect(loggerError).not.toHaveBeenCalled();
      },
    );

    it('fails a cancel with KEYRING_LOCKED when the venue reports it in a status entry', async () => {
      const {
        accountSignerProvider,
        exchangeClient,
        onAgentRejected,
        sdkWallet,
      } = createMustDepositProvider('cancel', agents);
      await accountSignerProvider.getMarketDataWithPrices();
      const wallet = sdkWallet();
      exchangeClient.cancel.mockImplementation(async () => {
        await wallet.signTypedData(L1_PAYLOAD);
        return {
          status: 'ok',
          response: {
            data: {
              statuses: [{ error: mustDepositError(MAIN_ADDRESS).message }],
            },
          },
        };
      });

      const result = await accountSignerProvider.cancelOrder({
        orderId: '123',
        symbol: 'BTC',
      });

      expect(result).toStrictEqual({
        success: false,
        orderId: '123',
        error: PERPS_ERROR_CODES.KEYRING_LOCKED,
      });
      expect(onAgentRejected.mock.calls).toStrictEqual([
        [MAINNET_ACCOUNT, AGENT_ADDRESS],
      ]);
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('leaves the referral to retry, unrecorded, without logging', async () => {
      const { accountSignerProvider, exchangeClient, onAgentRejected } =
        createMustDepositProvider('setReferrer', agents);

      const result = await accountSignerProvider.prepareTradingWallet();

      expect(result).toStrictEqual({ ready: false });
      expect(exchangeClient.setReferrer.mock.calls).toStrictEqual([
        REFERRAL_WRITE,
      ]);
      expect(onAgentRejected.mock.calls).toStrictEqual([
        [MAINNET_ACCOUNT, AGENT_ADDRESS],
      ]);
      expect(referralAttempted()).toBe(false);
      expect(loggerError).not.toHaveBeenCalled();
    });
  });

  describe.each([
    {
      venue: 'still lists the agent',
      agents: async (): Promise<ListedAgent[]> => [
        listedAgent(Date.now() + HOUR_MS),
      ],
    },
    {
      venue: 'lists the agent without an expiry',
      agents: async (): Promise<ListedAgent[]> => [listedAgent(null)],
    },
    {
      venue: 'lists the agent in another case',
      agents: async (): Promise<ListedAgent[]> => [
        listedAgent(Date.now() + HOUR_MS, getChecksumAddress(AGENT_ADDRESS)),
      ],
    },
    {
      venue: 'cannot list the agents',
      agents: async (): Promise<ListedAgent[]> => {
        throw new Error('network down');
      },
    },
  ])('when the venue $venue', ({ agents }) => {
    it('fails the order with the venue error and keeps the agent', async () => {
      const {
        accountSignerProvider,
        extraAgents,
        getAgentSigner,
        onAgentRejected,
        sdkWallet,
      } = createMustDepositProvider('order', agents);
      await accountSignerProvider.getMarketDataWithPrices();

      const order = await accountSignerProvider.placeOrder(BTC_MARKET_ORDER);
      await sdkWallet().signTypedData(L1_PAYLOAD);

      expect(order).toStrictEqual({
        success: false,
        error: mustDepositError(MAIN_ADDRESS).message,
      });
      expect(extraAgents.mock.calls).toStrictEqual([[{ user: MAIN_ADDRESS }]]);
      expect(onAgentRejected).not.toHaveBeenCalled();
      expect(getAgentSigner.mock.calls).toStrictEqual([[MAINNET_ACCOUNT]]);
    });
  });

  it('does not check the agents of a main account the agent did not sign for', async () => {
    const { accountSignerProvider, extraAgents, onAgentRejected } =
      createMustDepositProvider('order', async () => [], OTHER_MAIN_ADDRESS);
    await accountSignerProvider.getMarketDataWithPrices();

    const order = await accountSignerProvider.placeOrder(BTC_MARKET_ORDER);

    expect(order).toStrictEqual({
      success: false,
      error: mustDepositError(OTHER_MAIN_ADDRESS).message,
    });
    expect(extraAgents).not.toHaveBeenCalled();
    expect(onAgentRejected).not.toHaveBeenCalled();
  });

  it('checks the agent list again after the agent signs again', async () => {
    const { accountSignerProvider, extraAgents } = createMustDepositProvider(
      'order',
      async () => [listedAgent(Date.now() + HOUR_MS)],
    );
    await accountSignerProvider.getMarketDataWithPrices();

    await accountSignerProvider.placeOrder(BTC_MARKET_ORDER);
    await accountSignerProvider.placeOrder(BTC_MARKET_ORDER);

    expect(extraAgents.mock.calls).toStrictEqual([
      [{ user: MAIN_ADDRESS }],
      [{ user: MAIN_ADDRESS }],
    ]);
  });

  it('fails with the venue error once the main account signs after the agent was dropped', async () => {
    const {
      accountSignerProvider,
      extraAgents,
      getAgentSigner,
      onAgentRejected,
    } = createMustDepositProvider('order', async () => []);
    await accountSignerProvider.getMarketDataWithPrices();

    const rejected = await accountSignerProvider.placeOrder(BTC_MARKET_ORDER);
    // The host now signs with the main account, whose account has no funds.
    getAgentSigner.mockResolvedValue(null);
    const unfunded = await accountSignerProvider.placeOrder(BTC_MARKET_ORDER);

    expect(rejected).toStrictEqual({
      success: false,
      error: PERPS_ERROR_CODES.KEYRING_LOCKED,
    });
    expect(unfunded).toStrictEqual({
      success: false,
      error: mustDepositError(MAIN_ADDRESS).message,
    });
    expect(extraAgents).toHaveBeenCalledTimes(1);
    expect(onAgentRejected.mock.calls).toStrictEqual([
      [MAINNET_ACCOUNT, AGENT_ADDRESS],
    ]);
  });

  describe('without an agent', () => {
    it('fails the order with the venue error without checking the agents', async () => {
      const getAgentSigner = jest.fn().mockResolvedValue(null);
      const onAgentRejected = jest.fn();
      const extraAgents = jest.fn().mockResolvedValue([]);
      const { accountSignerProvider, exchangeClient, sdkWallet } =
        createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          getAgentSigner,
          onAgentRejected,
          info: { extraAgents },
        });
      exchangeClient.order.mockImplementation(async () => {
        await sdkWallet().signTypedData(L1_PAYLOAD);
        throw mustDepositError(MAIN_ADDRESS);
      });
      await accountSignerProvider.getMarketDataWithPrices();

      const order = await accountSignerProvider.placeOrder(BTC_MARKET_ORDER);

      expect(order).toStrictEqual({
        success: false,
        error: mustDepositError(MAIN_ADDRESS).message,
      });
      expect(extraAgents).not.toHaveBeenCalled();
      expect(onAgentRejected).not.toHaveBeenCalled();
    });
  });
});
