import {
  PERPS_EVENT_PROPERTY,
  PERPS_EVENT_VALUE,
} from '../../../src/constants/eventNames.js';
import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import {
  AgentBindings,
  AgentSignerUnavailableError,
} from '../../../src/services/agentSigner.js';
import type { HyperLiquidClientService } from '../../../src/services/HyperLiquidClientService.js';
import { PerpsAnalyticsEvent } from '../../../src/types/index.js';
import type { PerpsAgentAccount } from '../../../src/types/index.js';
import {
  APPROVE_BUILDER_FEE_PAYLOAD,
  L1_PAYLOAD,
  MAIN_ADDRESS,
  MAINNET_ACCOUNT,
  OTHER_MAIN_ADDRESS,
  unknownWalletError,
  USER_SIGNED_PAYLOAD,
} from '../../helpers/agentFixtures.js';
import {
  BTC_MARKET_ORDER,
  BUILDER_FEE_WRITE,
  REFERRAL_WRITE,
  SILENT_MIGRATION_WRITE,
  bind,
  createAccountSignerProvider,
  createPendingResolver,
  referralAttempted,
  setUpAccountSignerSuite,
} from '../../helpers/hyperLiquidAccountSignerFixture.js';

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

describe('HyperLiquidProvider with accountSigner: agents', () => {
  let mockClientService: jest.Mocked<HyperLiquidClientService>;
  let loggerError: jest.SpyInstance;
  let trackPerpsEvent: jest.SpyInstance;

  beforeEach(() => {
    ({ mockClientService, loggerError, trackPerpsEvent } =
      setUpAccountSignerSuite());
  });

  describe('with an agent', () => {
    it('resolves the agent at the first L1 signature and signs with it', async () => {
      const getAgentSigner = jest.fn();
      const { accountSignerProvider, accountSigner, agentSigner, sdkWallet } =
        createAccountSignerProvider({
          abstraction: 'default',
          getAgentSigner,
        });
      getAgentSigner.mockResolvedValue(agentSigner);

      await accountSignerProvider.getMarketDataWithPrices();

      expect(getAgentSigner.mock.calls).toStrictEqual([[MAINNET_ACCOUNT]]);
      expect(sdkWallet().address).toBe(MAIN_ADDRESS);
      expect(agentSigner.signTypedData.mock.calls).toStrictEqual([
        [L1_PAYLOAD],
      ]);
      expect(accountSigner.signTypedData).not.toHaveBeenCalled();
    });

    it('keeps a resolved agent for later L1 actions', async () => {
      const getAgentSigner = jest.fn();
      const { accountSignerProvider, agentSigner } =
        createAccountSignerProvider({
          abstraction: 'default',
          getAgentSigner,
        });
      getAgentSigner.mockResolvedValue(agentSigner);

      await accountSignerProvider.getMarketDataWithPrices();
      await accountSignerProvider.prepareTradingWallet();

      // Migration at connect, then referral setup.
      expect(getAgentSigner.mock.calls).toStrictEqual([[MAINNET_ACCOUNT]]);
      expect(agentSigner.signTypedData.mock.calls).toStrictEqual([
        [L1_PAYLOAD],
        [L1_PAYLOAD],
      ]);
    });

    it('asks again after a null answer', async () => {
      const getAgentSigner = jest.fn();
      const { accountSignerProvider, accountSigner, agentSigner } =
        createAccountSignerProvider({
          abstraction: 'default',
          getAgentSigner,
        });
      getAgentSigner
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(agentSigner);

      await accountSignerProvider.getMarketDataWithPrices();
      await accountSignerProvider.prepareTradingWallet();

      expect(getAgentSigner.mock.calls).toStrictEqual([
        [MAINNET_ACCOUNT],
        [MAINNET_ACCOUNT],
      ]);
      expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
        [MAIN_ADDRESS, L1_PAYLOAD],
      ]);
      expect(agentSigner.signTypedData.mock.calls).toStrictEqual([
        [L1_PAYLOAD],
      ]);
    });

    it('does not ask for an agent when nothing is signed', async () => {
      const getAgentSigner = jest.fn();
      const { accountSignerProvider, infoClient } = createAccountSignerProvider(
        {
          abstraction: 'unifiedAccount',
          getAgentSigner,
        },
      );

      await accountSignerProvider.getMarketDataWithPrices();

      // Connect reached the migration step and found nothing to sign.
      expect(infoClient.userAbstraction.mock.calls).toStrictEqual([
        [{ user: MAIN_ADDRESS }],
      ]);
      expect(getAgentSigner).not.toHaveBeenCalled();
    });

    it('keeps user-signed actions on the main account', async () => {
      const getAgentSigner = jest.fn();
      const { accountSignerProvider, accountSigner, agentSigner } =
        createAccountSignerProvider({ getAgentSigner });
      getAgentSigner.mockResolvedValue(agentSigner);

      await accountSignerProvider.getMarketDataWithPrices();

      expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
        [MAIN_ADDRESS, USER_SIGNED_PAYLOAD],
      ]);
      expect(agentSigner.signTypedData).not.toHaveBeenCalled();
      expect(getAgentSigner).not.toHaveBeenCalled();
    });

    it('fails only the L1 actions and asks again when getAgentSigner rejects', async () => {
      const getAgentSigner = jest
        .fn()
        .mockRejectedValue(new Error('agent store unavailable'));
      const {
        accountSignerProvider,
        accountSigner,
        exchangeClient,
        infoClient,
      } = createAccountSignerProvider({
        abstraction: 'default',
        getAgentSigner,
      });
      // Not approved yet: the approval is a user-signed write.
      infoClient.maxBuilderFee.mockResolvedValueOnce(0);

      const marketData = await accountSignerProvider.getMarketDataWithPrices();
      const result = await accountSignerProvider.prepareTradingWallet();

      expect(marketData.map(({ symbol }) => symbol)).toStrictEqual([
        'BTC',
        'ETH',
      ]);
      // A failed silent migration is retried: at connect, when prepare
      // re-runs the connect steps, and once more by the trading setup; the
      // referral write is the fourth L1 action. Each asks getAgentSigner.
      expect(exchangeClient.agentSetAbstraction.mock.calls).toStrictEqual([
        SILENT_MIGRATION_WRITE,
        SILENT_MIGRATION_WRITE,
        SILENT_MIGRATION_WRITE,
      ]);
      expect(exchangeClient.setReferrer.mock.calls).toStrictEqual([
        REFERRAL_WRITE,
      ]);
      expect(getAgentSigner.mock.calls).toStrictEqual([
        [MAINNET_ACCOUNT],
        [MAINNET_ACCOUNT],
        [MAINNET_ACCOUNT],
        [MAINNET_ACCOUNT],
      ]);
      // The user-signed builder fee approval still signs on the main account.
      expect(exchangeClient.approveBuilderFee.mock.calls).toStrictEqual([
        BUILDER_FEE_WRITE,
      ]);
      expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
        [MAIN_ADDRESS, APPROVE_BUILDER_FEE_PAYLOAD],
      ]);
      expect(result).toStrictEqual({ ready: false });
      // Retryable like a locked keyring: no failure metric, nothing logged.
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
        [
          PerpsAnalyticsEvent.AccountSetup,
          {
            [PERPS_EVENT_PROPERTY.ABSTRACTION_MODE]: 'default',
            [PERPS_EVENT_PROPERTY.STATUS]:
              PERPS_EVENT_VALUE.STATUS.MIGRATION_REQUIRED,
          },
        ],
      ]);
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('signs with the agent bound to the selected account', async () => {
      const bindings = new AgentBindings(undefined);
      const { accountSignerProvider, agentSigner } =
        createAccountSignerProvider({
          abstraction: 'default',
          getAgentSigner: bindings.resolve,
        });

      bindings.set(MAINNET_ACCOUNT, agentSigner);
      await accountSignerProvider.getMarketDataWithPrices();

      expect(agentSigner.signTypedData.mock.calls).toStrictEqual([
        [L1_PAYLOAD],
      ]);
    });

    it('binds the agent to the account it names, not the selected one', async () => {
      const bindings = new AgentBindings(undefined);
      const {
        accountSignerProvider,
        accountSigner,
        agentSigner,
        selectAccount,
      } = createAccountSignerProvider({
        abstraction: 'default',
        getAgentSigner: bindings.resolve,
      });

      bindings.set(
        { mainAddress: OTHER_MAIN_ADDRESS, isTestnet: false },
        agentSigner,
      );
      await accountSignerProvider.getMarketDataWithPrices();
      selectAccount(OTHER_MAIN_ADDRESS);
      await accountSignerProvider.prepareTradingWallet();

      // The selected account's migration signs on the main account; the
      // other account's L1 actions sign with its agent.
      expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
        [MAIN_ADDRESS, L1_PAYLOAD],
      ]);
      expect(agentSigner.signTypedData.mock.calls).toStrictEqual([
        [L1_PAYLOAD],
        [L1_PAYLOAD],
      ]);
    });

    it('never signs on another network with the agent bound for mainnet', async () => {
      const bindings = new AgentBindings(undefined);
      // A testnet provider, over a testnet client service.
      mockClientService.isTestnetMode.mockReturnValue(true);
      const { accountSignerProvider, accountSigner, agentSigner } =
        createAccountSignerProvider({
          abstraction: 'default',
          getAgentSigner: bindings.resolve,
          isTestnet: true,
        });
      bindings.set(MAINNET_ACCOUNT, agentSigner);

      await accountSignerProvider.getMarketDataWithPrices();

      expect(agentSigner.signTypedData).not.toHaveBeenCalled();
      expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
        [MAIN_ADDRESS, L1_PAYLOAD],
      ]);
    });

    it('pins the main account with a null binding without asking getAgentSigner', async () => {
      const getAgentSigner = jest.fn();
      const bindings = new AgentBindings(getAgentSigner);
      const { accountSignerProvider, accountSigner, agentSigner } =
        createAccountSignerProvider({
          abstraction: 'default',
          getAgentSigner: bindings.resolve,
        });
      getAgentSigner.mockResolvedValue(agentSigner);

      bindings.set(MAINNET_ACCOUNT, null);
      await accountSignerProvider.getMarketDataWithPrices();
      await accountSignerProvider.prepareTradingWallet();

      expect(getAgentSigner).not.toHaveBeenCalled();
      expect(agentSigner.signTypedData).not.toHaveBeenCalled();
      // Migration, then referral.
      expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
        [MAIN_ADDRESS, L1_PAYLOAD],
        [MAIN_ADDRESS, L1_PAYLOAD],
      ]);
    });

    it('lets a pin made while getAgentSigner is pending win', async () => {
      const { getAgentSigner, answer, asked } = createPendingResolver();
      const bindings = new AgentBindings(getAgentSigner);
      const { accountSignerProvider, accountSigner, agentSigner } =
        createAccountSignerProvider({
          abstraction: 'default',
          getAgentSigner: bindings.resolve,
        });

      const reading = accountSignerProvider.getMarketDataWithPrices();
      await asked;
      bind(accountSignerProvider, bindings, MAINNET_ACCOUNT, null);
      answer.resolve(agentSigner);
      await reading;

      expect(agentSigner.signTypedData).not.toHaveBeenCalled();
      expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
        [MAIN_ADDRESS, L1_PAYLOAD],
      ]);
    });

    it('keeps an agent bound while a failing getAgentSigner answer is pending', async () => {
      const { getAgentSigner, answer, asked } = createPendingResolver();
      const bindings = new AgentBindings(getAgentSigner);
      const { accountSignerProvider, agentSigner, exchangeClient } =
        createAccountSignerProvider({
          abstraction: 'default',
          getAgentSigner: bindings.resolve,
        });

      const reading = accountSignerProvider.getMarketDataWithPrices();
      await asked;
      bind(accountSignerProvider, bindings, MAINNET_ACCOUNT, agentSigner);
      answer.reject(new Error('agent store unavailable'));
      await reading;
      // The connect-time migration signed with the bound agent, at once.
      const migrationsAtConnect =
        exchangeClient.agentSetAbstraction.mock.calls.slice();
      const agentSignaturesAtConnect =
        agentSigner.signTypedData.mock.calls.slice();
      await accountSignerProvider.prepareTradingWallet();

      expect(migrationsAtConnect).toStrictEqual([SILENT_MIGRATION_WRITE]);
      expect(agentSignaturesAtConnect).toStrictEqual([[L1_PAYLOAD]]);
      expect(getAgentSigner.mock.calls).toStrictEqual([[MAINNET_ACCOUNT]]);
      expect(agentSigner.signTypedData.mock.calls).toStrictEqual([
        [L1_PAYLOAD],
        [L1_PAYLOAD],
      ]);
    });

    it('asks getAgentSigner with the network of the provider', async () => {
      const getAgentSigner = jest.fn().mockResolvedValue(null);
      // A testnet provider, over a testnet client service.
      mockClientService.isTestnetMode.mockReturnValue(true);
      const { accountSignerProvider } = createAccountSignerProvider({
        abstraction: 'default',
        getAgentSigner,
        isTestnet: true,
      });

      await accountSignerProvider.getMarketDataWithPrices();

      expect(getAgentSigner.mock.calls).toStrictEqual([
        [{ mainAddress: MAIN_ADDRESS, isTestnet: true }],
      ]);
    });

    it('does not reuse the mainnet agent after the provider switches to testnet', async () => {
      const getAgentSigner = jest.fn();
      const { accountSignerProvider, accountSigner, agentSigner, sdkWallet } =
        createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          getAgentSigner,
        });
      // An agent is approved on mainnet only.
      getAgentSigner.mockImplementation(async (account: PerpsAgentAccount) =>
        account.isTestnet ? null : agentSigner,
      );
      await accountSignerProvider.getMarketDataWithPrices();
      const wallet = sdkWallet();
      await wallet.signTypedData(L1_PAYLOAD);

      mockClientService.isTestnetMode.mockReturnValue(true);
      await wallet.signTypedData(L1_PAYLOAD);

      expect(getAgentSigner.mock.calls).toStrictEqual([
        [MAINNET_ACCOUNT],
        [{ mainAddress: MAIN_ADDRESS, isTestnet: true }],
      ]);
      expect(agentSigner.signTypedData.mock.calls).toStrictEqual([
        [L1_PAYLOAD],
      ]);
      // The testnet action signs on the main account.
      expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
        [MAIN_ADDRESS, L1_PAYLOAD],
      ]);
    });

    it('signs with the main account while getAgentSigner answers null, and with the agent once it answers again', async () => {
      const getAgentSigner = jest.fn();
      const { accountSignerProvider, accountSigner, agentSigner, sdkWallet } =
        createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          getAgentSigner,
        });
      getAgentSigner.mockResolvedValue(agentSigner);
      await accountSignerProvider.getMarketDataWithPrices();
      const wallet = sdkWallet();

      await wallet.signTypedData(L1_PAYLOAD);
      getAgentSigner.mockResolvedValue(null);
      accountSignerProvider.clearAgentSigners();
      await wallet.signTypedData(L1_PAYLOAD);
      getAgentSigner.mockResolvedValue(agentSigner);
      await wallet.signTypedData(L1_PAYLOAD);

      expect(agentSigner.signTypedData.mock.calls).toStrictEqual([
        [L1_PAYLOAD],
        [L1_PAYLOAD],
      ]);
      expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
        [MAIN_ADDRESS, L1_PAYLOAD],
      ]);
      expect(getAgentSigner.mock.calls).toStrictEqual([
        [MAINNET_ACCOUNT],
        [MAINNET_ACCOUNT],
        [MAINNET_ACCOUNT],
      ]);
    });

    it('asks getAgentSigner again once the bindings are cleared', async () => {
      const getAgentSigner = jest.fn();
      const bindings = new AgentBindings(getAgentSigner);
      const { accountSignerProvider, accountSigner, agentSigner, sdkWallet } =
        createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          getAgentSigner: bindings.resolve,
        });
      getAgentSigner.mockResolvedValue(agentSigner);
      bindings.set(MAINNET_ACCOUNT, null);
      await accountSignerProvider.getMarketDataWithPrices();
      const wallet = sdkWallet();
      // Pinned to the main account while the null binding holds.
      await wallet.signTypedData(L1_PAYLOAD);
      const pinnedSignatures = accountSigner.signTypedData.mock.calls.slice();

      bindings.clear();
      accountSignerProvider.clearAgentSigners();
      await wallet.signTypedData(L1_PAYLOAD);

      expect(pinnedSignatures).toStrictEqual([[MAIN_ADDRESS, L1_PAYLOAD]]);
      expect(getAgentSigner.mock.calls).toStrictEqual([[MAINNET_ACCOUNT]]);
      expect(agentSigner.signTypedData.mock.calls).toStrictEqual([
        [L1_PAYLOAD],
      ]);
      expect(accountSigner.signTypedData.mock.calls).toStrictEqual(
        pinnedSignatures,
      );
    });

    it('leaves the referral to retry, unrecorded, when the agent fails to sign', async () => {
      const getAgentSigner = jest.fn();
      const { accountSignerProvider, agentSigner, exchangeClient, sdkWallet } =
        createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          getAgentSigner,
        });
      agentSigner.signTypedData.mockRejectedValue(
        new Error('agent key locked'),
      );
      getAgentSigner.mockResolvedValue(agentSigner);

      const result = await accountSignerProvider.prepareTradingWallet();
      const wallet = sdkWallet();
      const nextSigning = await wallet
        .signTypedData(L1_PAYLOAD)
        .catch((error: unknown) => error);

      expect(result).toStrictEqual({ ready: false });
      expect(exchangeClient.setReferrer.mock.calls).toStrictEqual([
        REFERRAL_WRITE,
      ]);
      expect(referralAttempted()).toBe(false);
      // The agent stays in use: the next L1 action asks it again, not the host.
      expect(nextSigning).toBeInstanceOf(AgentSignerUnavailableError);
      expect(agentSigner.signTypedData.mock.calls).toStrictEqual([
        [L1_PAYLOAD],
        [L1_PAYLOAD],
      ]);
      expect(getAgentSigner.mock.calls).toStrictEqual([[MAINNET_ACCOUNT]]);
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('treats a getAgentSigner that throws synchronously like a rejection', async () => {
      const getAgentSigner = jest.fn(() => {
        throw new Error('agent store unavailable');
      });
      const { accountSignerProvider, accountSigner, sdkWallet } =
        createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          getAgentSigner,
        });
      await accountSignerProvider.getMarketDataWithPrices();
      const wallet = sdkWallet();

      await expect(wallet.signTypedData(L1_PAYLOAD)).rejects.toBeInstanceOf(
        AgentSignerUnavailableError,
      );
      await expect(wallet.signTypedData(L1_PAYLOAD)).rejects.toBeInstanceOf(
        AgentSignerUnavailableError,
      );
      expect(getAgentSigner.mock.calls).toStrictEqual([
        [MAINNET_ACCOUNT],
        [MAINNET_ACCOUNT],
      ]);
      expect(accountSigner.signTypedData).not.toHaveBeenCalled();
    });

    it('discards an answer pending across clearAgentSigners and asks again', async () => {
      const { getAgentSigner, answer, asked } = createPendingResolver();
      const { accountSignerProvider, accountSigner, agentSigner } =
        createAccountSignerProvider({
          abstraction: 'default',
          getAgentSigner,
        });

      const reading = accountSignerProvider.getMarketDataWithPrices();
      await asked;
      getAgentSigner.mockResolvedValue(null);
      accountSignerProvider.clearAgentSigners();
      answer.resolve(agentSigner);
      await reading;

      expect(getAgentSigner.mock.calls).toStrictEqual([
        [MAINNET_ACCOUNT],
        [MAINNET_ACCOUNT],
      ]);
      expect(agentSigner.signTypedData).not.toHaveBeenCalled();
      expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
        [MAIN_ADDRESS, L1_PAYLOAD],
      ]);
    });

    it('keeps trading setup retryable until the referral succeeds after getAgentSigner rejected', async () => {
      const getAgentSigner = jest
        .fn()
        .mockRejectedValueOnce(new Error('agent store unavailable'))
        .mockResolvedValue(null);
      const { accountSignerProvider, exchangeClient } =
        createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          getAgentSigner,
        });

      const firstResult = await accountSignerProvider.prepareTradingWallet();
      const recordedAfterFailure = referralAttempted();
      const secondResult = await accountSignerProvider.prepareTradingWallet();

      // The failed attempt is left to retry, unrecorded and unreported.
      expect(firstResult).toStrictEqual({ ready: false });
      expect(recordedAfterFailure).toBe(false);
      expect(secondResult).toStrictEqual({ ready: true });
      expect(exchangeClient.setReferrer.mock.calls).toStrictEqual([
        REFERRAL_WRITE,
        REFERRAL_WRITE,
      ]);
      expect(referralAttempted()).toBe(true);
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('fails an order with KEYRING_LOCKED without reporting it when getAgentSigner rejects', async () => {
      const getAgentSigner = jest.fn().mockResolvedValue(null);
      const { accountSignerProvider } = createAccountSignerProvider({
        abstraction: 'unifiedAccount',
        getAgentSigner,
      });
      await accountSignerProvider.getMarketDataWithPrices();
      getAgentSigner.mockRejectedValue(new Error('agent store unavailable'));

      const order = await accountSignerProvider.placeOrder(BTC_MARKET_ORDER);

      expect(order).toStrictEqual({
        success: false,
        error: PERPS_ERROR_CODES.KEYRING_LOCKED,
      });
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('drops an agent the venue rejects, and asks again, for a host without onAgentRejected', async () => {
      const getAgentSigner = jest.fn();
      const { accountSignerProvider, agentSigner, exchangeClient, sdkWallet } =
        createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          getAgentSigner,
        });
      getAgentSigner.mockResolvedValue(agentSigner);
      await accountSignerProvider.getMarketDataWithPrices();
      exchangeClient.cancel.mockImplementation(async () => {
        await sdkWallet().signTypedData(L1_PAYLOAD);
        throw unknownWalletError(agentSigner.address);
      });

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
      // Dropped, so the next L1 action asks again.
      expect(getAgentSigner.mock.calls).toStrictEqual([
        [MAINNET_ACCOUNT],
        [MAINNET_ACCOUNT],
      ]);
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('reports a failed answer asked again after a clear as unavailable', async () => {
      const { getAgentSigner, answer, asked } = createPendingResolver();
      const { accountSignerProvider, agentSigner, sdkWallet } =
        createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          getAgentSigner,
        });
      await accountSignerProvider.getMarketDataWithPrices();
      const wallet = sdkWallet();

      const signing = wallet.signTypedData(L1_PAYLOAD);
      await asked;
      getAgentSigner.mockRejectedValue(new Error('agent store unavailable'));
      accountSignerProvider.clearAgentSigners();
      answer.resolve(agentSigner);

      await expect(signing).rejects.toBeInstanceOf(AgentSignerUnavailableError);
      // Asked again after the clear, and that answer failed.
      expect(getAgentSigner.mock.calls).toStrictEqual([
        [MAINNET_ACCOUNT],
        [MAINNET_ACCOUNT],
      ]);
      expect(agentSigner.signTypedData).not.toHaveBeenCalled();
    });
  });
});
