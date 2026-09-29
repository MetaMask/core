import { getChecksumAddress } from '@metamask/utils';

import {
  PERPS_EVENT_PROPERTY,
  PERPS_EVENT_VALUE,
} from '../../../src/constants/eventNames.js';
import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import { PerpsAnalyticsEvent } from '../../../src/types/index.js';
import {
  AGENT_ADDRESS,
  AGENT_SIGNATURE,
  L1_PAYLOAD,
  OTHER_AGENT_ADDRESS,
  OTHER_AGENT_SIGNATURE,
  OTHER_MAIN_ADDRESS,
  unknownWalletError,
} from '../../helpers/agentFixtures.js';
import {
  ACCOUNT_ADDRESS,
  BTC_MARKET_ORDER,
  MAINNET_ACCOUNT,
  REFERRAL_WRITE,
  SILENT_MIGRATION_WRITE,
  createAccountSignerProvider,
  migrationAttempted,
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

// The agent address as a host may supply it: EIP-55 checksummed, so in
// mixed case.
const CHECKSUMMED_AGENT_ADDRESS = getChecksumAddress(AGENT_ADDRESS);

describe('HyperLiquidProvider with a real wallet service and accountSigner', () => {
  let loggerError: jest.SpyInstance;
  let trackPerpsEvent: jest.SpyInstance;

  beforeEach(() => {
    ({ loggerError, trackPerpsEvent } = setUpAccountSignerSuite());
  });

  describe('with an agent', () => {
    describe('when the venue rejects the agent', () => {
      // The position's take profit, resting on the venue.
      const TAKE_PROFIT_ORDER = createFrontendOpenOrder({
        side: 'A',
        limitPx: '58000',
        oid: 456,
        orderType: 'Take Profit Market',
        tif: null,
        isTrigger: true,
        triggerPx: '58000',
        triggerCondition: 'Price above 58000',
        reduceOnly: true,
        isPositionTpsl: true,
      });

      /**
       * A provider whose L1 writes are signed by the agent, then rejected
       * by the venue as an unknown wallet.
       *
       * @param write - The exchange write that fails.
       * @returns The provider, its mocks and the rejected agent.
       */
      function createRejectingProvider(
        write:
          | 'order'
          | 'cancel'
          | 'modify'
          | 'updateIsolatedMargin'
          | 'agentSetAbstraction'
          | 'setReferrer',
      ): AccountSignerFixture & {
        getAgentSigner: jest.Mock;
        onAgentRejected: jest.Mock;
      } {
        const getAgentSigner = jest.fn();
        const onAgentRejected = jest.fn();
        const built = createAccountSignerProvider({
          abstraction:
            write === 'agentSetAbstraction' ? 'default' : 'unifiedAccount',
          getAgentSigner,
          onAgentRejected,
        });
        getAgentSigner.mockResolvedValue(built.agentSigner);
        built.exchangeClient[write].mockImplementation(async () => {
          await built.sdkWallet().signTypedData(L1_PAYLOAD);
          throw unknownWalletError(built.agentSigner.address);
        });
        return { ...built, getAgentSigner, onAgentRejected };
      }

      it('fails a cancel with KEYRING_LOCKED without logging it', async () => {
        const { accountSignerProvider, onAgentRejected } =
          createRejectingProvider('cancel');
        await accountSignerProvider.getMarketDataWithPrices();

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

      it('drops an agent the venue rejects in a cancel status entry', async () => {
        const {
          accountSignerProvider,
          agentSigner,
          exchangeClient,
          getAgentSigner,
          sdkWallet,
          onAgentRejected,
        } = createRejectingProvider('cancel');
        await accountSignerProvider.getMarketDataWithPrices();
        const wallet = sdkWallet();
        exchangeClient.cancel.mockImplementation(async () => {
          await wallet.signTypedData(L1_PAYLOAD);
          return {
            status: 'ok',
            response: {
              data: {
                statuses: [
                  { error: unknownWalletError(agentSigner.address).message },
                ],
              },
            },
          };
        });

        const result = await accountSignerProvider.cancelOrder({
          orderId: '123',
          symbol: 'BTC',
        });
        await wallet.signTypedData(L1_PAYLOAD);

        expect(result).toStrictEqual({
          success: false,
          orderId: '123',
          error: PERPS_ERROR_CODES.KEYRING_LOCKED,
        });
        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
        ]);
        // Dropped, so the next L1 action asks again.
        expect(getAgentSigner.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT],
          [MAINNET_ACCOUNT],
        ]);
        expect(loggerError).not.toHaveBeenCalled();
      });

      it('drops an agent the venue rejects in batch cancel status entries, and reports it once', async () => {
        const {
          accountSignerProvider,
          exchangeClient,
          getAgentSigner,
          sdkWallet,
          onAgentRejected,
        } = createRejectingProvider('cancel');
        await accountSignerProvider.getMarketDataWithPrices();
        const wallet = sdkWallet();
        exchangeClient.cancel.mockImplementation(async () => {
          await wallet.signTypedData(L1_PAYLOAD);
          return {
            status: 'ok',
            response: {
              data: {
                statuses: [
                  { error: unknownWalletError(AGENT_ADDRESS).message },
                  { error: unknownWalletError(AGENT_ADDRESS).message },
                ],
              },
            },
          };
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
        // One signed write, so the host is told once.
        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
        ]);
        // Dropped, so the next L1 action asks again.
        expect(getAgentSigner.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT],
          [MAINNET_ACCOUNT],
        ]);
        expect(loggerError).not.toHaveBeenCalled();
      });

      it('keeps the entries of a batch cancel that succeeded when another reports a rejected agent', async () => {
        const {
          accountSignerProvider,
          exchangeClient,
          sdkWallet,
          onAgentRejected,
        } = createRejectingProvider('cancel');
        await accountSignerProvider.getMarketDataWithPrices();
        const wallet = sdkWallet();
        exchangeClient.cancel.mockImplementation(async () => {
          await wallet.signTypedData(L1_PAYLOAD);
          return {
            status: 'ok',
            response: {
              data: {
                statuses: [
                  'success',
                  { error: unknownWalletError(AGENT_ADDRESS).message },
                ],
              },
            },
          };
        });

        const result = await accountSignerProvider.cancelOrders([
          { orderId: '123', symbol: 'BTC' },
          { orderId: '124', symbol: 'BTC' },
        ]);

        expect(result).toStrictEqual({
          success: true,
          successCount: 1,
          failureCount: 1,
          results: [
            { orderId: '123', symbol: 'BTC', success: true },
            {
              orderId: '124',
              symbol: 'BTC',
              success: false,
              error: PERPS_ERROR_CODES.KEYRING_LOCKED,
            },
          ],
        });
        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
        ]);
        expect(loggerError).not.toHaveBeenCalled();
      });

      it('fails an order edit with KEYRING_LOCKED without logging it', async () => {
        const { accountSignerProvider, infoClient, onAgentRejected } =
          createRejectingProvider('modify');
        infoClient.frontendOpenOrders.mockResolvedValue([
          createFrontendOpenOrder(),
        ]);
        await accountSignerProvider.getMarketDataWithPrices();

        const result = await accountSignerProvider.editOrder({
          orderId: '123',
          newOrder: {
            symbol: 'BTC',
            isBuy: true,
            size: '0.1',
            orderType: 'limit',
            price: '48000',
          },
        });

        expect(result).toStrictEqual({
          success: false,
          error: PERPS_ERROR_CODES.KEYRING_LOCKED,
        });
        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
        ]);
        expect(loggerError).not.toHaveBeenCalled();
      });

      it('fails closing positions with KEYRING_LOCKED without logging it', async () => {
        const { accountSignerProvider, onAgentRejected } =
          createRejectingProvider('order');
        await accountSignerProvider.getMarketDataWithPrices();

        const result = await accountSignerProvider.closePositions({
          symbols: ['BTC'],
        });

        expect(result).toStrictEqual({
          success: false,
          successCount: 0,
          failureCount: 1,
          error: PERPS_ERROR_CODES.KEYRING_LOCKED,
          results: [
            {
              symbol: 'BTC',
              success: false,
              error: PERPS_ERROR_CODES.KEYRING_LOCKED,
            },
          ],
        });
        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
        ]);
        expect(loggerError).not.toHaveBeenCalled();
      });

      it('fails a TP/SL update with KEYRING_LOCKED without logging it', async () => {
        const { accountSignerProvider, onAgentRejected } =
          createRejectingProvider('order');
        await accountSignerProvider.getMarketDataWithPrices();

        const result = await accountSignerProvider.updatePositionTPSL({
          symbol: 'BTC',
          takeProfitPrice: '60000',
        });

        expect(result).toStrictEqual({
          success: false,
          error: PERPS_ERROR_CODES.KEYRING_LOCKED,
        });
        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
        ]);
        expect(loggerError).not.toHaveBeenCalled();
      });

      it('keeps the old protection and fails with KEYRING_LOCKED when its cancel is rejected', async () => {
        const {
          accountSignerProvider,
          exchangeClient,
          infoClient,
          onAgentRejected,
        } = createRejectingProvider('cancel');
        infoClient.frontendOpenOrders.mockResolvedValue([TAKE_PROFIT_ORDER]);
        await accountSignerProvider.getMarketDataWithPrices();

        const result = await accountSignerProvider.updatePositionTPSL({
          symbol: 'BTC',
          takeProfitPrice: '60000',
        });

        expect(result).toStrictEqual({
          success: false,
          error: PERPS_ERROR_CODES.KEYRING_LOCKED,
        });
        expect(exchangeClient.cancel.mock.calls).toStrictEqual([
          [{ cancels: [{ a: 0, o: 456 }] }],
        ]);
        expect(exchangeClient.order).not.toHaveBeenCalled();
        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
        ]);
        expect(loggerError).not.toHaveBeenCalled();
      });

      it('keeps the protection and fails with KEYRING_LOCKED when clearing it is rejected', async () => {
        const {
          accountSignerProvider,
          exchangeClient,
          infoClient,
          onAgentRejected,
        } = createRejectingProvider('cancel');
        infoClient.frontendOpenOrders.mockResolvedValue([TAKE_PROFIT_ORDER]);
        await accountSignerProvider.getMarketDataWithPrices();

        const result = await accountSignerProvider.updatePositionTPSL({
          symbol: 'BTC',
        });

        expect(result).toStrictEqual({
          success: false,
          error: PERPS_ERROR_CODES.KEYRING_LOCKED,
        });
        expect(exchangeClient.cancel.mock.calls).toStrictEqual([
          [{ cancels: [{ a: 0, o: 456 }] }],
        ]);
        expect(exchangeClient.order).not.toHaveBeenCalled();
        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
        ]);
        expect(loggerError).not.toHaveBeenCalled();
      });

      it('keeps the old protection and fails with KEYRING_LOCKED when its cancel is rejected in a status entry', async () => {
        const {
          accountSignerProvider,
          exchangeClient,
          infoClient,
          sdkWallet,
          onAgentRejected,
        } = createRejectingProvider('cancel');
        infoClient.frontendOpenOrders.mockResolvedValue([TAKE_PROFIT_ORDER]);
        await accountSignerProvider.getMarketDataWithPrices();
        const wallet = sdkWallet();
        exchangeClient.cancel.mockImplementation(async () => {
          await wallet.signTypedData(L1_PAYLOAD);
          return {
            status: 'ok',
            response: {
              data: {
                statuses: [
                  { error: unknownWalletError(AGENT_ADDRESS).message },
                ],
              },
            },
          };
        });

        const result = await accountSignerProvider.updatePositionTPSL({
          symbol: 'BTC',
          takeProfitPrice: '60000',
        });

        expect(result).toStrictEqual({
          success: false,
          error: PERPS_ERROR_CODES.KEYRING_LOCKED,
        });
        expect(exchangeClient.cancel.mock.calls).toStrictEqual([
          [{ cancels: [{ a: 0, o: 456 }] }],
        ]);
        expect(exchangeClient.order).not.toHaveBeenCalled();
        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
        ]);
        expect(loggerError).not.toHaveBeenCalled();
      });

      it('still drops the agent and fails with KEYRING_LOCKED when onAgentRejected throws', async () => {
        const {
          accountSignerProvider,
          getAgentSigner,
          sdkWallet,
          onAgentRejected,
        } = createRejectingProvider('cancel');
        onAgentRejected.mockImplementation(() => {
          throw new Error('host callback failed');
        });
        await accountSignerProvider.getMarketDataWithPrices();

        const result = await accountSignerProvider.cancelOrder({
          orderId: '123',
          symbol: 'BTC',
        });
        await sdkWallet().signTypedData(L1_PAYLOAD);

        expect(result).toStrictEqual({
          success: false,
          orderId: '123',
          error: PERPS_ERROR_CODES.KEYRING_LOCKED,
        });
        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
        ]);
        // Dropped despite the throw, so the next L1 action asks again.
        expect(getAgentSigner.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT],
          [MAINNET_ACCOUNT],
        ]);
        expect(loggerError).not.toHaveBeenCalled();
      });

      it('fails a margin update with KEYRING_LOCKED without logging it', async () => {
        const { accountSignerProvider, onAgentRejected } =
          createRejectingProvider('updateIsolatedMargin');
        await accountSignerProvider.getMarketDataWithPrices();

        const result = await accountSignerProvider.updateMargin({
          symbol: 'BTC',
          amount: '10',
        });

        expect(result).toStrictEqual({
          success: false,
          error: PERPS_ERROR_CODES.KEYRING_LOCKED,
        });
        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
        ]);
        expect(loggerError).not.toHaveBeenCalled();
      });

      it('attributes a rejection to the account the agent signed for after an account switch', async () => {
        const getAgentSigner = jest.fn();
        const onAgentRejected = jest.fn();
        const {
          accountSignerProvider,
          agentSigner,
          exchangeClient,
          sdkWallet,
          selectAccount,
        } = createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          getAgentSigner,
          onAgentRejected,
        });
        getAgentSigner.mockResolvedValue(agentSigner);
        await accountSignerProvider.getMarketDataWithPrices();
        const wallet = sdkWallet();
        const signed = createDeferred<void>();
        const venue = createDeferred<void>();
        exchangeClient.cancel.mockImplementation(async () => {
          await wallet.signTypedData(L1_PAYLOAD);
          signed.resolve();
          await venue.promise;
          throw unknownWalletError(agentSigner.address);
        });

        const cancelling = accountSignerProvider.cancelOrder({
          orderId: '123',
          symbol: 'BTC',
        });
        await signed.promise;
        selectAccount(OTHER_MAIN_ADDRESS);
        venue.resolve();
        const result = await cancelling;
        selectAccount(ACCOUNT_ADDRESS);
        await wallet.signTypedData(L1_PAYLOAD);

        expect(result).toStrictEqual({
          success: false,
          orderId: '123',
          error: PERPS_ERROR_CODES.KEYRING_LOCKED,
        });
        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, agentSigner.address],
        ]);
        // The signing account's agent was dropped, so it is asked again.
        expect(getAgentSigner.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT],
          [MAINNET_ACCOUNT],
        ]);
      });

      it('recognizes the rejection of an agent replaced while its action was in flight, and keeps its replacement', async () => {
        const getAgentSigner = jest.fn();
        const onAgentRejected = jest.fn();
        const {
          accountSignerProvider,
          agentSigner,
          exchangeClient,
          sdkWallet,
        } = createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          getAgentSigner,
          onAgentRejected,
        });
        const replacement = {
          address: OTHER_AGENT_ADDRESS,
          signTypedData: jest.fn().mockResolvedValue(OTHER_AGENT_SIGNATURE),
        };
        getAgentSigner.mockResolvedValue(agentSigner);
        await accountSignerProvider.getMarketDataWithPrices();
        const wallet = sdkWallet();
        const signed = createDeferred<void>();
        const venue = createDeferred<void>();
        exchangeClient.order.mockImplementation(async () => {
          await wallet.signTypedData(L1_PAYLOAD);
          signed.resolve();
          await venue.promise;
          throw unknownWalletError(agentSigner.address);
        });

        const ordering = accountSignerProvider.placeOrder(BTC_MARKET_ORDER);
        await signed.promise;
        // A binding change (setAgentSigner) drops the resolved agents, and the
        // next L1 action resolves the replacement.
        accountSignerProvider.clearAgentSigners();
        getAgentSigner.mockResolvedValue(replacement);
        await wallet.signTypedData(L1_PAYLOAD);
        venue.resolve();
        const order = await ordering;
        await wallet.signTypedData(L1_PAYLOAD);

        expect(order).toStrictEqual({
          success: false,
          error: PERPS_ERROR_CODES.KEYRING_LOCKED,
        });
        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
        ]);
        // The replacement stays resolved: it signs again without a new ask.
        expect(replacement.signTypedData.mock.calls).toStrictEqual([
          [L1_PAYLOAD],
          [L1_PAYLOAD],
        ]);
        expect(getAgentSigner.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT],
          [MAINNET_ACCOUNT],
        ]);
        expect(loggerError).not.toHaveBeenCalled();
      });

      it('keeps the agent when the venue rejects the main account as unknown', async () => {
        const getAgentSigner = jest.fn();
        const onAgentRejected = jest.fn();
        const {
          accountSignerProvider,
          agentSigner,
          exchangeClient,
          sdkWallet,
        } = createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          getAgentSigner,
          onAgentRejected,
        });
        getAgentSigner.mockResolvedValue(agentSigner);
        await accountSignerProvider.getMarketDataWithPrices();
        const wallet = sdkWallet();
        exchangeClient.order.mockImplementation(async () => {
          await wallet.signTypedData(L1_PAYLOAD);
          throw unknownWalletError(ACCOUNT_ADDRESS);
        });

        const order = await accountSignerProvider.placeOrder(BTC_MARKET_ORDER);
        await wallet.signTypedData(L1_PAYLOAD);

        expect(order).toStrictEqual({
          success: false,
          error: PERPS_ERROR_CODES.EXCHANGE_ACCOUNT_NOT_FOUND,
        });
        expect(onAgentRejected).not.toHaveBeenCalled();
        // The referral set up for the first order, the order, then the next
        // L1 action, all with the one resolved agent.
        expect(agentSigner.signTypedData.mock.calls).toStrictEqual([
          [L1_PAYLOAD],
          [L1_PAYLOAD],
          [L1_PAYLOAD],
        ]);
        expect(getAgentSigner.mock.calls).toStrictEqual([[MAINNET_ACCOUNT]]);
      });

      it('fails every in-flight write the venue rejects with KEYRING_LOCKED, after the first drops the agent', async () => {
        const getAgentSigner = jest.fn();
        const onAgentRejected = jest.fn();
        const {
          accountSignerProvider,
          agentSigner,
          exchangeClient,
          sdkWallet,
        } = createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          getAgentSigner,
          onAgentRejected,
        });
        getAgentSigner.mockResolvedValue(agentSigner);
        await accountSignerProvider.getMarketDataWithPrices();
        const wallet = sdkWallet();
        const bothSigned = createDeferred<void>();
        const venue = createDeferred<void>();
        let signedCancels = 0;
        exchangeClient.cancel.mockImplementation(async () => {
          await wallet.signTypedData(L1_PAYLOAD);
          signedCancels += 1;
          if (signedCancels === 2) {
            bothSigned.resolve();
          }
          await venue.promise;
          throw unknownWalletError(agentSigner.address);
        });

        const cancelling = [
          accountSignerProvider.cancelOrder({ orderId: '123', symbol: 'BTC' }),
          accountSignerProvider.cancelOrder({ orderId: '124', symbol: 'BTC' }),
        ];
        await bothSigned.promise;
        venue.resolve();
        const results = await Promise.all(cancelling);
        await wallet.signTypedData(L1_PAYLOAD);

        expect(results).toStrictEqual([
          {
            success: false,
            orderId: '123',
            error: PERPS_ERROR_CODES.KEYRING_LOCKED,
          },
          {
            success: false,
            orderId: '124',
            error: PERPS_ERROR_CODES.KEYRING_LOCKED,
          },
        ]);
        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
        ]);
        // Dropped, so the next L1 action asks again.
        expect(getAgentSigner.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT],
          [MAINNET_ACCOUNT],
        ]);
        expect(loggerError).not.toHaveBeenCalled();
      });

      it('recognizes a rejected agent whatever the case of its address', async () => {
        const getAgentSigner = jest.fn();
        const onAgentRejected = jest.fn();
        const { accountSignerProvider, exchangeClient, sdkWallet } =
          createAccountSignerProvider({
            abstraction: 'unifiedAccount',
            getAgentSigner,
            onAgentRejected,
          });
        // The host returns a mixed-case address; the venue names it lowercased.
        const mixedCaseAgent = {
          address: CHECKSUMMED_AGENT_ADDRESS,
          signTypedData: jest.fn().mockResolvedValue(AGENT_SIGNATURE),
        };
        getAgentSigner.mockResolvedValue(mixedCaseAgent);
        await accountSignerProvider.getMarketDataWithPrices();
        const wallet = sdkWallet();
        exchangeClient.cancel.mockImplementation(async () => {
          await wallet.signTypedData(L1_PAYLOAD);
          throw unknownWalletError(CHECKSUMMED_AGENT_ADDRESS.toLowerCase());
        });

        const result = await accountSignerProvider.cancelOrder({
          orderId: '123',
          symbol: 'BTC',
        });
        await wallet.signTypedData(L1_PAYLOAD);

        expect(result).toStrictEqual({
          success: false,
          orderId: '123',
          error: PERPS_ERROR_CODES.KEYRING_LOCKED,
        });
        // The host gets its agent's address as it supplied it.
        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, CHECKSUMMED_AGENT_ADDRESS],
        ]);
        // Dropped, so the next L1 action asks again.
        expect(getAgentSigner.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT],
          [MAINNET_ACCOUNT],
        ]);
      });

      it('keeps the agent when the venue reports an unknown wallet without an address', async () => {
        const getAgentSigner = jest.fn();
        const onAgentRejected = jest.fn();
        const {
          accountSignerProvider,
          agentSigner,
          exchangeClient,
          sdkWallet,
        } = createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          getAgentSigner,
          onAgentRejected,
        });
        getAgentSigner.mockResolvedValue(agentSigner);
        await accountSignerProvider.getMarketDataWithPrices();
        const wallet = sdkWallet();
        exchangeClient.cancel.mockImplementation(async () => {
          await wallet.signTypedData(L1_PAYLOAD);
          throw new Error('User or API Wallet does not exist.');
        });

        const result = await accountSignerProvider.cancelOrder({
          orderId: '123',
          symbol: 'BTC',
        });
        await wallet.signTypedData(L1_PAYLOAD);

        expect(result).toStrictEqual({
          success: false,
          orderId: '123',
          error: PERPS_ERROR_CODES.EXCHANGE_ACCOUNT_NOT_FOUND,
        });
        expect(onAgentRejected).not.toHaveBeenCalled();
        // Kept, so the next L1 action does not ask again.
        expect(getAgentSigner.mock.calls).toStrictEqual([[MAINNET_ACCOUNT]]);
      });

      it('fails a batch cancel with KEYRING_LOCKED without logging it', async () => {
        const { accountSignerProvider, onAgentRejected } =
          createRejectingProvider('cancel');
        await accountSignerProvider.getMarketDataWithPrices();

        const result = await accountSignerProvider.cancelOrders([
          { orderId: '123', symbol: 'BTC' },
          { orderId: '124', symbol: 'BTC' },
        ]);

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
        // One batch, so one rejection.
        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
        ]);
        expect(loggerError).not.toHaveBeenCalled();
      });

      it('evicts only the agent of the account that signed the rejected action', async () => {
        const getAgentSigner = jest.fn();
        const onAgentRejected = jest.fn();
        const {
          accountSignerProvider,
          agentSigner,
          exchangeClient,
          sdkWallet,
          selectAccount,
        } = createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          getAgentSigner,
          onAgentRejected,
        });
        // The same agent is approved for both accounts.
        getAgentSigner.mockResolvedValue(agentSigner);
        await accountSignerProvider.getMarketDataWithPrices();
        const wallet = sdkWallet();
        selectAccount(OTHER_MAIN_ADDRESS);
        await wallet.signTypedData(L1_PAYLOAD);
        selectAccount(ACCOUNT_ADDRESS);
        exchangeClient.cancel.mockImplementation(async () => {
          await wallet.signTypedData(L1_PAYLOAD);
          throw unknownWalletError(agentSigner.address);
        });

        await accountSignerProvider.cancelOrder({
          orderId: '123',
          symbol: 'BTC',
        });
        selectAccount(OTHER_MAIN_ADDRESS);
        await wallet.signTypedData(L1_PAYLOAD);
        selectAccount(ACCOUNT_ADDRESS);
        await wallet.signTypedData(L1_PAYLOAD);

        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
        ]);
        // The other account's agent stays cached, so it is not asked again;
        // the signing account's was dropped, so it is.
        expect(getAgentSigner.mock.calls).toStrictEqual([
          [{ mainAddress: OTHER_MAIN_ADDRESS, isTestnet: false }],
          [MAINNET_ACCOUNT],
          [MAINNET_ACCOUNT],
        ]);
      });

      it('fails the order with KEYRING_LOCKED, drops the agent and asks again', async () => {
        const {
          accountSignerProvider,
          getAgentSigner,
          onAgentRejected,
          sdkWallet,
        } = createRejectingProvider('order');
        await accountSignerProvider.getMarketDataWithPrices();

        const order = await accountSignerProvider.placeOrder(BTC_MARKET_ORDER);
        await sdkWallet().signTypedData(L1_PAYLOAD);

        expect(order).toStrictEqual({
          success: false,
          error: PERPS_ERROR_CODES.KEYRING_LOCKED,
        });
        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
        ]);
        expect(getAgentSigner.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT],
          [MAINNET_ACCOUNT],
        ]);
        expect(loggerError).not.toHaveBeenCalled();
      });

      it('retries the silent migration instead of recording no HyperLiquid account', async () => {
        const { accountSignerProvider, onAgentRejected, exchangeClient } =
          createRejectingProvider('agentSetAbstraction');

        await accountSignerProvider.getMarketDataWithPrices();
        await accountSignerProvider.getMarketDataWithPrices();

        expect(exchangeClient.agentSetAbstraction.mock.calls).toStrictEqual([
          SILENT_MIGRATION_WRITE,
          SILENT_MIGRATION_WRITE,
        ]);
        // Each connect retries the migration, and the venue rejects it again.
        expect(onAgentRejected.mock.calls).toStrictEqual([
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
          [MAINNET_ACCOUNT, AGENT_ADDRESS],
        ]);
        expect(trackPerpsEvent.mock.calls).toStrictEqual([
          [
            PerpsAnalyticsEvent.AccountSetup,
            {
              [PERPS_EVENT_PROPERTY.ABSTRACTION_MODE]: 'default',
              [PERPS_EVENT_PROPERTY.STATUS]:
                PERPS_EVENT_VALUE.STATUS.MIGRATION_REQUIRED,
            },
          ],
          [
            PerpsAnalyticsEvent.AccountSetup,
            {
              [PERPS_EVENT_PROPERTY.ABSTRACTION_MODE]: 'default',
              [PERPS_EVENT_PROPERTY.STATUS]:
                PERPS_EVENT_VALUE.STATUS.MIGRATION_REQUIRED,
            },
          ],
        ]);
        expect(migrationAttempted()).toBe(false);
        expect(loggerError).not.toHaveBeenCalled();
      });

      it('leaves the referral to retry, unrecorded', async () => {
        const { accountSignerProvider, onAgentRejected, exchangeClient } =
          createRejectingProvider('setReferrer');

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

      it('keeps treating a rejected main account as a wallet with no HyperLiquid account', async () => {
        const getAgentSigner = jest.fn().mockResolvedValue(null);
        const onAgentRejected = jest.fn();
        const { accountSignerProvider, exchangeClient, sdkWallet } =
          createAccountSignerProvider({
            abstraction: 'unifiedAccount',
            getAgentSigner,
            onAgentRejected,
          });
        exchangeClient.order.mockImplementation(async () => {
          await sdkWallet().signTypedData(L1_PAYLOAD);
          throw unknownWalletError(ACCOUNT_ADDRESS);
        });
        await accountSignerProvider.getMarketDataWithPrices();

        const order = await accountSignerProvider.placeOrder(BTC_MARKET_ORDER);

        expect(order).toStrictEqual({
          success: false,
          error: PERPS_ERROR_CODES.EXCHANGE_ACCOUNT_NOT_FOUND,
        });
        expect(onAgentRejected).not.toHaveBeenCalled();
      });
    });
  });
});
