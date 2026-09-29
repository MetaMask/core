import {
  PERPS_EVENT_PROPERTY,
  PERPS_EVENT_VALUE,
} from '../../../src/constants/eventNames.js';
import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import { PerpsSigningCache } from '../../../src/services/TradingReadinessCache.js';
import { PerpsAnalyticsEvent } from '../../../src/types/index.js';
import type { PerpsTypedDataPayload } from '../../../src/types/index.js';
import {
  APPROVE_BUILDER_FEE_PAYLOAD,
  MAIN_SIGNATURE,
  USER_SIGNED_PAYLOAD,
} from '../../helpers/agentFixtures.js';
import {
  ACCOUNT_ADDRESS,
  BTC_MARKET_ORDER,
  BUILDER_FEE_WRITE,
  MIGRATION_WRITE,
  createAccountSignerProvider,
  migrationAttempted,
  referralAttempted,
  setUpAccountSignerSuite,
} from '../../helpers/hyperLiquidAccountSignerFixture.js';
import type { AccountSignerFixture } from '../../helpers/hyperLiquidAccountSignerFixture.js';
import { keyringCalls } from '../../helpers/serviceMocks.js';

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

describe('HyperLiquidProvider with a real wallet service and accountSigner', () => {
  let loggerError: jest.SpyInstance;
  let trackPerpsEvent: jest.SpyInstance;

  beforeEach(() => {
    ({ loggerError, trackPerpsEvent } = setUpAccountSignerSuite());
  });

  it('signs the init-time unified-account migration through accountSigner', async () => {
    const { accountSignerProvider, accountSigner, call, exchangeClient } =
      createAccountSignerProvider();

    await accountSignerProvider.getMarketDataWithPrices();

    expect(exchangeClient.userSetAbstraction.mock.calls).toStrictEqual([
      MIGRATION_WRITE,
    ]);
    expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
      [ACCOUNT_ADDRESS, USER_SIGNED_PAYLOAD],
    ]);
    expect(keyringCalls(call)).toStrictEqual([]);
  });

  it('defers the init-time migration when accountSigner requires signature confirmation', async () => {
    const { accountSignerProvider, accountSigner, call, exchangeClient } =
      createAccountSignerProvider({
        signer: { requiresSignatureConfirmation: () => true },
      });

    await accountSignerProvider.getMarketDataWithPrices();

    expect(exchangeClient.userSetAbstraction).not.toHaveBeenCalled();
    expect(accountSigner.signTypedData).not.toHaveBeenCalled();
    expect(keyringCalls(call)).toStrictEqual([]);
  });

  it('treats a not-ready accountSigner as a locked keyring and caches nothing', async () => {
    const { accountSignerProvider, accountSigner, call, exchangeClient } =
      createAccountSignerProvider({ signer: { isReady: () => false } });

    await accountSignerProvider.getMarketDataWithPrices();

    expect(exchangeClient.userSetAbstraction.mock.calls).toStrictEqual([
      MIGRATION_WRITE,
    ]);
    expect(accountSigner.signTypedData).not.toHaveBeenCalled();
    expect(migrationAttempted()).toBe(false);
    expect(keyringCalls(call)).toStrictEqual([]);
    expect(loggerError).not.toHaveBeenCalled();
    // The migration is only reported as required, never as failed.
    expect(trackPerpsEvent.mock.calls).toStrictEqual([
      [
        PerpsAnalyticsEvent.AccountSetup,
        {
          [PERPS_EVENT_PROPERTY.ABSTRACTION_MODE]: 'dexAbstraction',
          [PERPS_EVENT_PROPERTY.STATUS]:
            PERPS_EVENT_VALUE.STATUS.MIGRATION_REQUIRED,
        },
      ],
    ]);
  });

  it('fails an order with KEYRING_LOCKED without logging while accountSigner is not ready', async () => {
    const { accountSignerProvider, accountSigner } =
      createAccountSignerProvider({
        abstraction: 'unifiedAccount',
        signer: { isReady: () => false },
      });

    const order = await accountSignerProvider.placeOrder(BTC_MARKET_ORDER);

    expect(order).toStrictEqual({
      success: false,
      error: PERPS_ERROR_CODES.KEYRING_LOCKED,
    });
    expect(accountSigner.signTypedData).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
    expect(referralAttempted()).toBe(false);
  });

  it('fails a TP/SL update with KEYRING_LOCKED without logging while the builder fee cannot be approved', async () => {
    const { accountSignerProvider, accountSigner, exchangeClient } =
      createAccountSignerProvider({
        abstraction: 'unifiedAccount',
        signer: { isReady: () => false },
        // Not approved yet, and the locked signer cannot approve it.
        info: { maxBuilderFee: jest.fn().mockResolvedValue(0) },
      });

    const result = await accountSignerProvider.updatePositionTPSL({
      symbol: 'BTC',
      takeProfitPrice: '60000',
    });

    expect(result).toStrictEqual({
      success: false,
      error: PERPS_ERROR_CODES.KEYRING_LOCKED,
    });
    expect(accountSigner.signTypedData).not.toHaveBeenCalled();
    expect(exchangeClient.order).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('fails a TP/SL update with KEYRING_LOCKED without logging when the builder fee signature is rejected as locked', async () => {
    const { accountSignerProvider, accountSigner, exchangeClient } =
      createAccountSignerProvider({
        abstraction: 'unifiedAccount',
        // Not approved yet.
        info: { maxBuilderFee: jest.fn().mockResolvedValue(0) },
      });
    // The signer reports ready, but rejects the approval as locked.
    accountSigner.signTypedData.mockImplementation(
      async (_address: string, payload: PerpsTypedDataPayload) => {
        if (payload === APPROVE_BUILDER_FEE_PAYLOAD) {
          throw new Error(PERPS_ERROR_CODES.KEYRING_LOCKED);
        }
        return MAIN_SIGNATURE;
      },
    );

    const result = await accountSignerProvider.updatePositionTPSL({
      symbol: 'BTC',
      takeProfitPrice: '60000',
    });

    expect(result).toStrictEqual({
      success: false,
      error: PERPS_ERROR_CODES.KEYRING_LOCKED,
    });
    expect(exchangeClient.approveBuilderFee.mock.calls).toStrictEqual([
      BUILDER_FEE_WRITE,
    ]);
    expect(exchangeClient.order).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('fails a TP/SL update with KEYRING_LOCKED when the builder fee approval of another provider ended without one while the signer is locked', async () => {
    const { accountSignerProvider, exchangeClient } =
      createAccountSignerProvider({
        abstraction: 'unifiedAccount',
        signer: { isReady: () => false },
        // Not approved yet.
        info: { maxBuilderFee: jest.fn().mockResolvedValue(0) },
      });
    // Another provider holds the approval and ends without caching one.
    const release = PerpsSigningCache.setInFlight(
      'builderFee',
      'mainnet',
      ACCOUNT_ADDRESS,
    );
    const isInFlight = PerpsSigningCache.isInFlight.bind(PerpsSigningCache);
    jest
      .spyOn(PerpsSigningCache, 'isInFlight')
      .mockImplementation((operationType, network, userAddress) => {
        const pending = isInFlight(operationType, network, userAddress);
        if (operationType === 'builderFee' && pending) {
          release();
        }
        return pending;
      });

    let result;
    try {
      result = await accountSignerProvider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '60000',
      });
    } finally {
      release();
    }

    expect(result).toStrictEqual({
      success: false,
      error: PERPS_ERROR_CODES.KEYRING_LOCKED,
    });
    expect(exchangeClient.approveBuilderFee).not.toHaveBeenCalled();
    expect(exchangeClient.order).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  describe('when the signer locks before a user-signed write', () => {
    /**
     * A provider whose withdrawals and DEX transfers sign through the SDK
     * wallet, with a switch that locks the signer.
     *
     * @returns The provider, the two endpoints and the lock switch.
     */
    function createLockingProvider(): AccountSignerFixture & {
      withdraw3: jest.Mock;
      lock: () => void;
    } {
      let signerReady = true;
      const fixture = createAccountSignerProvider({
        abstraction: 'unifiedAccount',
        signer: { isReady: () => signerReady },
      });
      const signUserAction = async (): Promise<Record<string, unknown>> => {
        await fixture.sdkWallet().signTypedData(USER_SIGNED_PAYLOAD);
        return { status: 'ok' };
      };
      const withdraw3 = jest.fn(signUserAction);
      Object.assign(fixture.exchangeClient, { withdraw3 });
      fixture.exchangeClient.sendAsset.mockImplementation(signUserAction);
      return {
        ...fixture,
        withdraw3,
        lock: (): void => {
          signerReady = false;
        },
      };
    }

    it('fails a withdrawal with KEYRING_LOCKED without logging it', async () => {
      const { accountSignerProvider, accountSigner, withdraw3, lock } =
        createLockingProvider();
      await accountSignerProvider.getMarketDataWithPrices();
      const [{ assetId }] = accountSignerProvider.getWithdrawalRoutes();
      lock();

      const result = await accountSignerProvider.withdraw({
        amount: '10',
        destination: ACCOUNT_ADDRESS,
        assetId,
      });

      expect(result).toStrictEqual({
        success: false,
        error: PERPS_ERROR_CODES.KEYRING_LOCKED,
      });
      expect(withdraw3.mock.calls).toStrictEqual([
        [{ destination: ACCOUNT_ADDRESS, amount: '10' }],
      ]);
      expect(accountSigner.signTypedData).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('fails a transfer between DEXs with KEYRING_LOCKED without logging it', async () => {
      const { accountSignerProvider, accountSigner, exchangeClient, lock } =
        createLockingProvider();
      await accountSignerProvider.getMarketDataWithPrices();
      lock();

      const result = await accountSignerProvider.transferBetweenDexs({
        sourceDex: '',
        destinationDex: 'xyz',
        amount: '10',
      });

      expect(result).toStrictEqual({
        success: false,
        error: PERPS_ERROR_CODES.KEYRING_LOCKED,
      });
      expect(exchangeClient.sendAsset.mock.calls).toStrictEqual([
        [
          {
            destination: ACCOUNT_ADDRESS,
            sourceDex: '',
            destinationDex: 'xyz',
            token: 'USDC:0xdef456',
            amount: '10',
          },
        ],
      ]);
      expect(accountSigner.signTypedData).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });
  });
});
