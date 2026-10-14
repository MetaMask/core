import { getChecksumAddress } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import type { PerpsAgentAccount } from '../../../src/types/index.js';
import {
  AGENT_ADDRESS,
  APPROVE_BUILDER_FEE_PAYLOAD,
  L1_PAYLOAD,
  MAINNET_ACCOUNT,
  MAIN_ADDRESS,
  OTHER_AGENT_ADDRESS,
  OTHER_AGENT_SIGNATURE,
  OTHER_MAIN_ADDRESS,
  TESTNET_ACCOUNT,
  mustDepositError,
  unknownWalletError,
} from '../../helpers/agentFixtures.js';
import {
  BTC_MARKET_ORDER,
  CANCEL_DELIVERIES,
  REFERRAL_WRITE,
  apiRequestError,
  createAccountSignerProvider,
  referralAttempted,
  setUpAccountSignerSuite,
} from '../../helpers/hyperLiquidAccountSignerFixture.js';
import type { AccountSignerFixture } from '../../helpers/hyperLiquidAccountSignerFixture.js';
import { createFrontendOpenOrder } from '../../helpers/providerMocks.js';
import { createDeferred } from '../../helpers/serviceMocks.js';

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

// The agent's signature of a mainnet order, distinct from AGENT_SIGNATURE.
const MAINNET_ORDER_SIGNATURE = `0x${'1f'.repeat(65)}` as const;

/**
 * The venue's answer to a write for an account that must deposit.
 *
 * @param user - The main account the venue names.
 * @returns The answer.
 */
function mustDepositAnswer(user: string): Record<string, unknown> {
  return { status: 'err', response: mustDepositError(user).message };
}

/**
 * The venue's answer to a cancel, one status per entry.
 *
 * @param statuses - The entries' statuses.
 * @returns The answer.
 */
function cancelAnswer(statuses: unknown[]): Record<string, unknown> {
  return { status: 'ok', response: { type: 'cancel', data: { statuses } } };
}

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
  let mockClientService: ReturnType<
    typeof setUpAccountSignerSuite
  >['mockClientService'];

  beforeEach(() => {
    ({ loggerError, mockClientService } = setUpAccountSignerSuite());
  });

  /**
   * Let `toggleTestnet` switch the mocked client service's network.
   */
  function useSwitchableNetwork(): void {
    let isTestnet = false;
    mockClientService.isTestnetMode.mockImplementation(() => isTestnet);
    mockClientService.setTestnetMode.mockImplementation((value: boolean) => {
      isTestnet = value;
    });
  }

  /**
   * A provider whose L1 actions an agent signs on either network, with its
   * trading setup (and the referral the agent signs) done.
   *
   * @param agents - Answers `extraAgents` for the main account.
   * @returns The provider and its mocks.
   */
  async function createPreparedAgentProvider(
    agents: () => Promise<ListedAgent[]> = async () => [],
  ): Promise<
    AccountSignerFixture & {
      getAgentSigner: jest.Mock;
      onAgentRejected: jest.Mock;
      extraAgents: jest.Mock;
    }
  > {
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
    await built.accountSignerProvider.prepareTradingWallet();
    return { ...built, getAgentSigner, onAgentRejected, extraAgents };
  }

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
    built.exchangeClient[write].mockImplementation(
      async () => await built.signAndSend(L1_PAYLOAD, mustDepositAnswer(user)),
    );
    return { ...built, getAgentSigner, onAgentRejected, extraAgents };
  }

  it.each([false, true])(
    'awaits replacement signer classification before restoration, accountChanged=%s',
    async (accountChanged) => {
      const asked = createDeferred<void>();
      const listing = createDeferred<ListedAgent[]>();
      const built = await createPreparedAgentProvider(async () => {
        asked.resolve();
        return await listing.promise;
      });
      const replacementAgent = {
        address: OTHER_AGENT_ADDRESS,
        signTypedData: jest.fn().mockResolvedValue(OTHER_AGENT_SIGNATURE),
      };
      built.getAgentSigner.mockResolvedValue(replacementAgent);
      built.infoClient.frontendOpenOrders.mockResolvedValue([
        createFrontendOpenOrder({
          side: 'A',
          oid: 456,
          orderType: 'Take Profit Market',
          isTrigger: true,
          triggerPx: '58000',
          triggerCondition: 'Price above 58000',
          reduceOnly: true,
          isPositionTpsl: true,
        }),
      ]);
      built.exchangeClient.cancel.mockResolvedValue(cancelAnswer(['success']));
      built.exchangeClient.order.mockImplementationOnce(
        async () =>
          await built.signAndSend(L1_PAYLOAD, mustDepositAnswer(MAIN_ADDRESS)),
      );

      const updating = built.accountSignerProvider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '60000',
      });
      await asked.promise;
      await new Promise<void>((resolve) => setImmediate(resolve));
      const writesWhileClassifying =
        built.exchangeClient.order.mock.calls.length;
      const restorationSignedEarly =
        replacementAgent.signTypedData.mock.calls.length;
      if (accountChanged) {
        built.selectAccount(OTHER_MAIN_ADDRESS);
      }
      listing.resolve([]);
      const result = await updating;

      expect(writesWhileClassifying).toBe(1);
      expect(restorationSignedEarly).toBe(0);
      expect(result).toStrictEqual(
        accountChanged
          ? {
              success: false,
              error: PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
            }
          : {
              success: false,
              error: PERPS_ERROR_CODES.KEYRING_LOCKED,
              childOrderIds: ['123'],
            },
      );
      expect(built.exchangeClient.order).toHaveBeenCalledTimes(
        accountChanged ? 1 : 2,
      );
      expect(replacementAgent.signTypedData).toHaveBeenCalledTimes(
        accountChanged ? 0 : 1,
      );
      expect(built.onAgentRejected.mock.calls).toStrictEqual([
        [MAINNET_ACCOUNT, AGENT_ADDRESS],
      ]);
    },
  );

  it('awaits the cancellation error callback before returning a mixed multisig and agent rejection', async () => {
    const asked = createDeferred<void>();
    const listing = createDeferred<ListedAgent[]>();
    const built = await createPreparedAgentProvider(async () => {
      asked.resolve();
      return await listing.promise;
    });
    built.infoClient.frontendOpenOrders.mockResolvedValue(
      [456, 457].map((oid) =>
        createFrontendOpenOrder({
          side: 'A',
          oid,
          orderType: 'Take Profit Market',
          isTrigger: true,
          triggerPx: '58000',
          triggerCondition: 'Price above 58000',
          reduceOnly: true,
          isPositionTpsl: true,
        }),
      ),
    );
    built.exchangeClient.cancel.mockImplementation(
      async () =>
        await built.signAndSend(
          L1_PAYLOAD,
          cancelAnswer([
            { error: 'Multi-sig required' },
            { error: mustDepositError(MAIN_ADDRESS).message },
          ]),
        ),
    );
    let settled = false;

    const updating = built.accountSignerProvider
      .updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '60000',
      })
      .then((result) => {
        settled = true;
        return result;
      });
    await asked.promise;
    await new Promise<void>((resolve) => setImmediate(resolve));
    const settledWhileClassifying = settled;
    listing.resolve([]);
    const result = await updating;

    expect(settledWhileClassifying).toBe(false);
    expect(result).toStrictEqual({
      success: false,
      error: PERPS_ERROR_CODES.KEYRING_LOCKED,
    });
    expect(built.exchangeClient.order).not.toHaveBeenCalled();
    expect(built.extraAgents).toHaveBeenCalledTimes(1);
    expect(built.onAgentRejected.mock.calls).toStrictEqual([
      [MAINNET_ACCOUNT, AGENT_ADDRESS],
    ]);
    expect(loggerError).not.toHaveBeenCalled();
  });

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
          signAndSend,
        } = createMustDepositProvider('cancel', agents);
        await accountSignerProvider.getMarketDataWithPrices();
        exchangeClient.cancel.mockImplementation(
          async () =>
            await signAndSend(
              L1_PAYLOAD,
              cancelAnswer([
                { error: mustDepositError(MAIN_ADDRESS).message },
                { error: mustDepositError(MAIN_ADDRESS).message },
              ]),
              delivery,
            ),
        );

        const result = await accountSignerProvider.cancelOrders([
          { orderId: '123', symbol: 'BTC' },
          { orderId: '124', symbol: 'BTC' },
        ]);
        await sdkWallet().signTypedData(L1_PAYLOAD);

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
        signAndSend,
      } = createMustDepositProvider('cancel', agents);
      await accountSignerProvider.getMarketDataWithPrices();
      exchangeClient.cancel.mockImplementation(
        async () =>
          await signAndSend(
            L1_PAYLOAD,
            cancelAnswer([{ error: mustDepositError(MAIN_ADDRESS).message }]),
            'returned',
          ),
      );

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

  it('does not check the agent when the main account signed the answered request', async () => {
    const getAgentSigner = jest.fn();
    const onAgentRejected = jest.fn();
    const extraAgents = jest.fn().mockResolvedValue([]);
    const built = createAccountSignerProvider({
      abstraction: 'unifiedAccount',
      getAgentSigner,
      onAgentRejected,
      info: { extraAgents },
    });
    getAgentSigner.mockResolvedValue(built.agentSigner);
    built.infoClient.maxBuilderFee.mockResolvedValue(0);
    // The builder fee approval is user-signed: the main account signs it.
    built.exchangeClient.approveBuilderFee.mockImplementation(
      async () =>
        await built.signAndSend(
          APPROVE_BUILDER_FEE_PAYLOAD,
          mustDepositAnswer(MAIN_ADDRESS),
        ),
    );

    // The referral, an L1 action the agent signs, comes first.
    const prepared = await built.accountSignerProvider.prepareTradingWallet();

    expect(built.agentSigner.signTypedData).toHaveBeenCalledWith(L1_PAYLOAD);
    expect(prepared).toStrictEqual({ ready: false });
    expect(extraAgents).not.toHaveBeenCalled();
    expect(onAgentRejected).not.toHaveBeenCalled();
    expect(getAgentSigner.mock.calls).toStrictEqual([[MAINNET_ACCOUNT]]);
  });

  it('checks the agent that signed the answered request after the host switched agents', async () => {
    const getAgentSigner = jest.fn();
    const onAgentRejected = jest.fn();
    const replacement = {
      address: OTHER_AGENT_ADDRESS,
      signTypedData: jest.fn().mockResolvedValue(OTHER_AGENT_SIGNATURE),
    };
    // The venue lists the replacement only.
    const extraAgents = jest
      .fn()
      .mockResolvedValue([listedAgent(null, OTHER_AGENT_ADDRESS)]);
    const built = createAccountSignerProvider({
      abstraction: 'unifiedAccount',
      getAgentSigner,
      onAgentRejected,
      info: { extraAgents },
    });
    getAgentSigner.mockResolvedValue(built.agentSigner);
    await built.accountSignerProvider.getMarketDataWithPrices();
    const signed = createDeferred<void>();
    const venue = createDeferred<void>();
    const answer = mustDepositAnswer(MAIN_ADDRESS);
    built.exchangeClient.order.mockImplementationOnce(async () => {
      const signature = await built.sdkWallet().signTypedData(L1_PAYLOAD);
      signed.resolve();
      await venue.promise;
      built.reportAnswer(signature, answer);
      throw apiRequestError(answer);
    });

    const ordering = built.accountSignerProvider.placeOrder(BTC_MARKET_ORDER);
    await signed.promise;
    built.accountSignerProvider.clearAgentSigners();
    getAgentSigner.mockResolvedValue(replacement);
    // The replacement signs a request the venue accepts, then the first
    // request's answer arrives.
    await built.signAndSend(L1_PAYLOAD, { status: 'ok' });
    venue.resolve();
    const order = await ordering;
    await built.sdkWallet().signTypedData(L1_PAYLOAD);

    expect(order).toStrictEqual({
      success: false,
      error: PERPS_ERROR_CODES.KEYRING_LOCKED,
    });
    expect(extraAgents.mock.calls).toStrictEqual([[{ user: MAIN_ADDRESS }]]);
    expect(onAgentRejected.mock.calls).toStrictEqual([
      [MAINNET_ACCOUNT, AGENT_ADDRESS],
    ]);
    // The replacement stays in use.
    expect(replacement.signTypedData).toHaveBeenCalledTimes(2);
    expect(getAgentSigner.mock.calls).toStrictEqual([
      [MAINNET_ACCOUNT],
      [MAINNET_ACCOUNT],
    ]);
  });

  it('does not check a request signed before the provider switched networks', async () => {
    useSwitchableNetwork();
    const getAgentSigner = jest.fn();
    const onAgentRejected = jest.fn();
    const extraAgents = jest.fn().mockResolvedValue([]);
    const built = createAccountSignerProvider({
      abstraction: 'unifiedAccount',
      getAgentSigner,
      onAgentRejected,
      info: { extraAgents },
    });
    const testnetAgent = {
      address: OTHER_AGENT_ADDRESS,
      signTypedData: jest.fn().mockResolvedValue(OTHER_AGENT_SIGNATURE),
    };
    getAgentSigner.mockImplementation(async (account: PerpsAgentAccount) =>
      account.isTestnet ? testnetAgent : built.agentSigner,
    );
    await built.accountSignerProvider.getMarketDataWithPrices();
    const signed = createDeferred<void>();
    const venue = createDeferred<void>();
    const answer = mustDepositAnswer(MAIN_ADDRESS);
    built.exchangeClient.order.mockImplementationOnce(async () => {
      // The mainnet client's wallet, which the request is signed with.
      const wallet = built.sdkWallet();
      const signature = await wallet.signTypedData(L1_PAYLOAD);
      signed.resolve();
      await venue.promise;
      built.reportAnswer(signature, answer, wallet);
      throw apiRequestError(answer);
    });

    const ordering = built.accountSignerProvider.placeOrder(BTC_MARKET_ORDER);
    await signed.promise;
    const toggled = await built.accountSignerProvider.toggleTestnet();
    const testnetOrder =
      await built.accountSignerProvider.placeOrder(BTC_MARKET_ORDER);
    venue.resolve();
    await ordering;
    await built.sdkWallet().signTypedData(L1_PAYLOAD);

    expect(toggled).toStrictEqual({ success: true, isTestnet: true });
    expect(testnetOrder.success).toBe(true);
    expect(extraAgents).not.toHaveBeenCalled();
    expect(onAgentRejected).not.toHaveBeenCalled();
    // The testnet agent stays in use.
    expect(
      (getAgentSigner.mock.calls as [PerpsAgentAccount][]).filter(
        ([account]) => account.isTestnet,
      ),
    ).toStrictEqual([[TESTNET_ACCOUNT]]);
  });

  it('does not check a request whose agent signature finished after the provider switched networks', async () => {
    useSwitchableNetwork();
    // The host reuses its agent on both networks.
    const {
      accountSignerProvider,
      agentSigner,
      exchangeClient,
      extraAgents,
      getAgentSigner,
      onAgentRejected,
      sdkWallet,
      signAndSend,
    } = await createPreparedAgentProvider();
    const signingStarted = createDeferred<void>();
    const signing = createDeferred<Hex>();
    agentSigner.signTypedData.mockImplementationOnce(async () => {
      signingStarted.resolve();
      return await signing.promise;
    });
    exchangeClient.order.mockImplementationOnce(
      async () =>
        await signAndSend(L1_PAYLOAD, mustDepositAnswer(MAIN_ADDRESS)),
    );

    const ordering = accountSignerProvider.placeOrder(BTC_MARKET_ORDER);
    await signingStarted.promise;
    await accountSignerProvider.toggleTestnet();
    // The agent signs on testnet, then the mainnet signature finishes and
    // the venue answers it.
    await sdkWallet().signTypedData(L1_PAYLOAD);
    signing.resolve(MAINNET_ORDER_SIGNATURE);
    await ordering;
    await sdkWallet().signTypedData(L1_PAYLOAD);

    expect(extraAgents).not.toHaveBeenCalled();
    expect(onAgentRejected).not.toHaveBeenCalled();
    // The agent stays bound on testnet.
    expect(
      (getAgentSigner.mock.calls as [PerpsAgentAccount][]).filter(
        ([account]) => account.isTestnet,
      ),
    ).toStrictEqual([[TESTNET_ACCOUNT]]);
  });

  it('does not check a write queued on mainnet that signs after the provider switched to testnet', async () => {
    useSwitchableNetwork();
    // The host reuses its agent on both networks.
    const {
      accountSignerProvider,
      exchangeClient,
      extraAgents,
      getAgentSigner,
      onAgentRejected,
      sdkWallet,
      signAndSend,
    } = await createPreparedAgentProvider();
    const queued = createDeferred<void>();
    const ahead = createDeferred<void>();
    exchangeClient.order.mockImplementationOnce(async () => {
      // The mainnet client's wallet. The SDK queues the write behind another
      // one, so it signs later.
      const wallet = sdkWallet();
      queued.resolve();
      await ahead.promise;
      return await signAndSend(
        L1_PAYLOAD,
        mustDepositAnswer(MAIN_ADDRESS),
        'thrown',
        wallet,
      );
    });

    const ordering = accountSignerProvider.placeOrder(BTC_MARKET_ORDER);
    await queued.promise;
    await accountSignerProvider.toggleTestnet();
    // The agent signs on testnet, then the queued mainnet write signs and
    // the venue answers it.
    await sdkWallet().signTypedData(L1_PAYLOAD);
    ahead.resolve();
    await ordering;
    await sdkWallet().signTypedData(L1_PAYLOAD);

    expect(extraAgents).not.toHaveBeenCalled();
    expect(onAgentRejected).not.toHaveBeenCalled();
    // The queued write resolved the mainnet agent, and the agent stays bound
    // on testnet.
    expect(getAgentSigner.mock.calls).toStrictEqual([
      [MAINNET_ACCOUNT],
      [TESTNET_ACCOUNT],
    ]);
  });

  it('signs a write queued on mainnet with the mainnet agent after the provider switched to testnet', async () => {
    useSwitchableNetwork();
    const getAgentSigner = jest.fn();
    const built = createAccountSignerProvider({
      abstraction: 'unifiedAccount',
      getAgentSigner,
    });
    const testnetAgent = {
      address: OTHER_AGENT_ADDRESS,
      signTypedData: jest.fn().mockResolvedValue(OTHER_AGENT_SIGNATURE),
    };
    getAgentSigner.mockImplementation(async (account: PerpsAgentAccount) =>
      account.isTestnet ? testnetAgent : built.agentSigner,
    );
    await built.accountSignerProvider.prepareTradingWallet();
    const queued = createDeferred<void>();
    const ahead = createDeferred<void>();
    built.exchangeClient.order.mockImplementationOnce(async () => {
      // The mainnet client's wallet. The SDK queues the write behind another
      // one, so it signs later.
      const wallet = built.sdkWallet();
      queued.resolve();
      await ahead.promise;
      return await built.signAndSend(
        L1_PAYLOAD,
        { status: 'ok', response: { data: { statuses: ['success'] } } },
        'thrown',
        wallet,
      );
    });

    const ordering = built.accountSignerProvider.placeOrder(BTC_MARKET_ORDER);
    await queued.promise;
    await built.accountSignerProvider.toggleTestnet();
    await built.sdkWallet().signTypedData(L1_PAYLOAD);
    built.agentSigner.signTypedData.mockClear();
    testnetAgent.signTypedData.mockClear();
    ahead.resolve();
    await ordering;

    expect(built.agentSigner.signTypedData.mock.calls).toStrictEqual([
      [L1_PAYLOAD],
    ]);
    expect(testnetAgent.signTypedData).not.toHaveBeenCalled();
  });

  it('does not check a request whose agent signature finished after the provider reconnected on the same network', async () => {
    useSwitchableNetwork();
    const {
      accountSignerProvider,
      agentSigner,
      exchangeClient,
      extraAgents,
      onAgentRejected,
      signAndSend,
    } = await createPreparedAgentProvider();
    const signingStarted = createDeferred<void>();
    const signing = createDeferred<Hex>();
    agentSigner.signTypedData.mockImplementationOnce(async () => {
      signingStarted.resolve();
      return await signing.promise;
    });
    exchangeClient.order.mockImplementationOnce(
      async () =>
        await signAndSend(L1_PAYLOAD, mustDepositAnswer(MAIN_ADDRESS)),
    );

    const ordering = accountSignerProvider.placeOrder(BTC_MARKET_ORDER);
    await signingStarted.promise;
    // Back on mainnet, in a new session.
    await accountSignerProvider.toggleTestnet();
    await accountSignerProvider.toggleTestnet();
    signing.resolve(MAINNET_ORDER_SIGNATURE);
    await ordering;

    expect(extraAgents).not.toHaveBeenCalled();
    expect(onAgentRejected).not.toHaveBeenCalled();
  });

  it('keeps the agent when the provider disconnects while the agent list is read', async () => {
    const asked = createDeferred<void>();
    const listing = createDeferred<ListedAgent[]>();
    const {
      accountSignerProvider,
      exchangeClient,
      extraAgents,
      onAgentRejected,
      signAndSend,
    } = await createPreparedAgentProvider(async () => {
      asked.resolve();
      return await listing.promise;
    });
    exchangeClient.order.mockImplementationOnce(
      async () =>
        await signAndSend(L1_PAYLOAD, mustDepositAnswer(MAIN_ADDRESS)),
    );

    const ordering = accountSignerProvider.placeOrder(BTC_MARKET_ORDER);
    await asked.promise;
    const disconnecting = accountSignerProvider.disconnect();
    listing.resolve([]);
    await disconnecting;
    const order = await ordering;

    expect(order).toStrictEqual({
      success: false,
      error: mustDepositError(MAIN_ADDRESS).message,
    });
    expect(extraAgents).toHaveBeenCalledTimes(1);
    expect(onAgentRejected).not.toHaveBeenCalled();
  });

  it('does not attribute an answer to a request that carries no signature', async () => {
    const {
      accountSignerProvider,
      exchangeClient,
      extraAgents,
      onAgentRejected,
      reportExchangeRequest,
      sdkWallet,
    } = await createPreparedAgentProvider();
    const answer = mustDepositAnswer(MAIN_ADDRESS);
    exchangeClient.order.mockImplementationOnce(async () => {
      await sdkWallet().signTypedData(L1_PAYLOAD);
      reportExchangeRequest({ action: { type: 'order' } }, answer);
      throw apiRequestError(answer);
    });

    const order = await accountSignerProvider.placeOrder(BTC_MARKET_ORDER);

    expect(order).toStrictEqual({
      success: false,
      error: mustDepositError(MAIN_ADDRESS).message,
    });
    expect(extraAgents).not.toHaveBeenCalled();
    expect(onAgentRejected).not.toHaveBeenCalled();
  });

  it('keeps the agent when its request fails without an answer', async () => {
    const {
      accountSignerProvider,
      exchangeClient,
      extraAgents,
      getAgentSigner,
      onAgentRejected,
      reportAnswer,
      sdkWallet,
    } = await createPreparedAgentProvider();
    exchangeClient.order.mockImplementationOnce(async () => {
      const signature = await sdkWallet().signTypedData(L1_PAYLOAD);
      reportAnswer(signature, undefined);
      throw new Error('fetch failed');
    });

    const order = await accountSignerProvider.placeOrder(BTC_MARKET_ORDER);
    await sdkWallet().signTypedData(L1_PAYLOAD);

    expect(order).toStrictEqual({ success: false, error: 'fetch failed' });
    expect(extraAgents).not.toHaveBeenCalled();
    expect(onAgentRejected).not.toHaveBeenCalled();
    expect(getAgentSigner.mock.calls).toStrictEqual([[MAINNET_ACCOUNT]]);
  });

  it('does not track an agent signature the SDK would refuse', async () => {
    const {
      accountSignerProvider,
      agentSigner,
      exchangeClient,
      extraAgents,
      onAgentRejected,
      reportAnswer,
      sdkWallet,
    } = await createPreparedAgentProvider();
    // Not a 65-byte signature: the SDK refuses it before sending.
    agentSigner.signTypedData.mockResolvedValueOnce('0x1234');
    const answer = mustDepositAnswer(MAIN_ADDRESS);
    exchangeClient.order.mockImplementationOnce(async () => {
      reportAnswer(await sdkWallet().signTypedData(L1_PAYLOAD), answer);
      throw apiRequestError(answer);
    });

    const order = await accountSignerProvider.placeOrder(BTC_MARKET_ORDER);

    expect(order).toStrictEqual({
      success: false,
      error: mustDepositError(MAIN_ADDRESS).message,
    });
    expect(extraAgents).not.toHaveBeenCalled();
    expect(onAgentRejected).not.toHaveBeenCalled();
  });

  it('drops the agent of the network whose request the venue rejected as an unknown wallet, when a queued write of the other network signed after it', async () => {
    useSwitchableNetwork();
    // The host reuses its agent on both networks.
    const {
      accountSignerProvider,
      exchangeClient,
      getAgentSigner,
      onAgentRejected,
      reportAnswer,
      sdkWallet,
      signAndSend,
    } = await createPreparedAgentProvider();
    const mainnetQueued = createDeferred<void>();
    const mainnetAhead = createDeferred<void>();
    exchangeClient.order.mockImplementationOnce(async () => {
      // The mainnet client's wallet; the SDK queues the write.
      const wallet = sdkWallet();
      mainnetQueued.resolve();
      await mainnetAhead.promise;
      return await signAndSend(
        L1_PAYLOAD,
        { status: 'ok', response: { data: { statuses: ['success'] } } },
        'thrown',
        wallet,
      );
    });
    const mainnetOrdering = accountSignerProvider.placeOrder(BTC_MARKET_ORDER);
    await mainnetQueued.promise;
    await accountSignerProvider.toggleTestnet();
    const testnetSigned = createDeferred<void>();
    const testnetVenue = createDeferred<void>();
    const answer = {
      status: 'err',
      response: unknownWalletError(AGENT_ADDRESS).message,
    };
    exchangeClient.order.mockImplementationOnce(async () => {
      const wallet = sdkWallet();
      const signature = await wallet.signTypedData(L1_PAYLOAD);
      testnetSigned.resolve();
      await testnetVenue.promise;
      reportAnswer(signature, answer, wallet);
      throw apiRequestError(answer);
    });

    // The testnet request signs, the queued mainnet write signs, then the
    // venue rejects the testnet request.
    const testnetOrdering = accountSignerProvider.placeOrder(BTC_MARKET_ORDER);
    await testnetSigned.promise;
    mainnetAhead.resolve();
    await mainnetOrdering;
    testnetVenue.resolve();
    const testnetOrder = await testnetOrdering;
    // Testnet asks for an agent again; mainnet keeps its agent.
    await sdkWallet().signTypedData(L1_PAYLOAD);
    await accountSignerProvider.toggleTestnet();
    await sdkWallet().signTypedData(L1_PAYLOAD);

    expect(testnetOrder).toStrictEqual({
      success: false,
      error: PERPS_ERROR_CODES.KEYRING_LOCKED,
    });
    expect(onAgentRejected.mock.calls).toStrictEqual([
      [TESTNET_ACCOUNT, AGENT_ADDRESS],
    ]);
    expect(getAgentSigner.mock.calls).toStrictEqual([
      [MAINNET_ACCOUNT],
      [TESTNET_ACCOUNT],
      [TESTNET_ACCOUNT],
    ]);
  });

  describe('without an agent', () => {
    it('fails the order with the venue error without checking the agents', async () => {
      const getAgentSigner = jest.fn().mockResolvedValue(null);
      const onAgentRejected = jest.fn();
      const extraAgents = jest.fn().mockResolvedValue([]);
      const { accountSignerProvider, exchangeClient, signAndSend } =
        createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          getAgentSigner,
          onAgentRejected,
          info: { extraAgents },
        });
      exchangeClient.order.mockImplementation(
        async () =>
          await signAndSend(L1_PAYLOAD, mustDepositAnswer(MAIN_ADDRESS)),
      );
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
