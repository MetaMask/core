import {
  BUILDER_FEE_CONFIG,
  REFERRAL_CONFIG,
} from '../../../src/constants/hyperLiquidConfig.js';
import { PERPS_CONSTANTS } from '../../../src/constants/perpsConfig.js';
import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import {
  PerpsSigningCache,
  TradingReadinessCache,
} from '../../../src/services/TradingReadinessCache.js';
import type { PerpsTypedDataPayload } from '../../../src/types/index.js';
import {
  APPROVE_BUILDER_FEE_PAYLOAD,
  L1_PAYLOAD,
  MAIN_SIGNATURE,
  USER_SIGNED_PAYLOAD,
  unknownWalletError,
} from '../../helpers/agentFixtures.js';
import {
  ACCOUNT_ADDRESS,
  BTC_MARKET_ORDER,
  BUILDER_FEE_WRITE,
  BUILDER_REFERRAL_LOOKUP,
  MIGRATION_WRITE,
  NOW,
  REFERRAL_WRITE,
  createAccountSignerProvider,
  migrationAttempted,
  referralAttempted,
  setUpAccountSignerSuite,
} from '../../helpers/hyperLiquidAccountSignerFixture.js';
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

describe('HyperLiquidProvider with a real wallet service and accountSigner', () => {
  let loggerError: jest.SpyInstance;

  beforeEach(() => {
    ({ loggerError } = setUpAccountSignerSuite());
  });

  describe('prepareTradingWallet', () => {
    it('runs the deferred migration and referral, finds the builder fee approved, and reports ready', async () => {
      const {
        accountSignerProvider,
        accountSigner,
        exchangeClient,
        infoClient,
      } = createAccountSignerProvider({
        signer: { requiresSignatureConfirmation: () => true },
      });
      await accountSignerProvider.getMarketDataWithPrices();

      const result = await accountSignerProvider.prepareTradingWallet();

      expect(result).toStrictEqual({ ready: true });
      expect(exchangeClient.userSetAbstraction.mock.calls).toStrictEqual([
        MIGRATION_WRITE,
      ]);
      expect(exchangeClient.setReferrer.mock.calls).toStrictEqual([
        REFERRAL_WRITE,
      ]);
      expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
        [ACCOUNT_ADDRESS, USER_SIGNED_PAYLOAD],
        [ACCOUNT_ADDRESS, L1_PAYLOAD],
      ]);
      // Already approved, so nothing is signed for it.
      expect(infoClient.maxBuilderFee.mock.calls).toStrictEqual([
        [{ user: ACCOUNT_ADDRESS, builder: BUILDER_FEE_CONFIG.MainnetBuilder }],
      ]);
      expect(exchangeClient.approveBuilderFee).not.toHaveBeenCalled();
    });

    it('signs every setup step, so the first order signs only itself', async () => {
      const {
        accountSignerProvider,
        accountSigner,
        exchangeClient,
        infoClient,
      } = createAccountSignerProvider({
        signer: { requiresSignatureConfirmation: () => true },
      });
      await accountSignerProvider.getMarketDataWithPrices();
      // Not approved yet; the venue reports the approval once signed.
      infoClient.maxBuilderFee.mockResolvedValueOnce(0);

      const result = await accountSignerProvider.prepareTradingWallet();
      const setupSignatures = accountSigner.signTypedData.mock.calls.slice();
      accountSigner.signTypedData.mockClear();
      const order = await accountSignerProvider.placeOrder(BTC_MARKET_ORDER);

      expect(result).toStrictEqual({ ready: true });
      // Migration, referral, builder fee approval.
      expect(setupSignatures).toStrictEqual([
        [ACCOUNT_ADDRESS, USER_SIGNED_PAYLOAD],
        [ACCOUNT_ADDRESS, L1_PAYLOAD],
        [ACCOUNT_ADDRESS, APPROVE_BUILDER_FEE_PAYLOAD],
      ]);
      expect(order).toStrictEqual({
        success: true,
        orderId: '123',
        submittedSize: '0.1',
        averagePrice: undefined,
        filledSize: undefined,
      });
      expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
        [ACCOUNT_ADDRESS, L1_PAYLOAD],
      ]);
      expect(exchangeClient.userSetAbstraction.mock.calls).toStrictEqual([
        MIGRATION_WRITE,
      ]);
      expect(exchangeClient.approveBuilderFee.mock.calls).toStrictEqual([
        BUILDER_FEE_WRITE,
      ]);
      expect(exchangeClient.setReferrer.mock.calls).toStrictEqual([
        REFERRAL_WRITE,
      ]);
    });

    /**
     * Have another provider hold the real referral lock until released.
     *
     * @param waiters - How many lookups must find the lock before `waiting`
     * resolves.
     * @returns Resolves once that many providers found the lock and wait on
     * it, the number of lookups that found it, and the release.
     */
    function holdReferralLock(waiters = 1): {
      waiting: Promise<void>;
      lookupsWhileHeld: () => number;
      release: () => void;
    } {
      const release = PerpsSigningCache.setInFlight(
        'referral',
        'mainnet',
        ACCOUNT_ADDRESS,
      );
      const waiting = createDeferred<void>();
      let lookupsWhileHeld = 0;
      const isInFlight = PerpsSigningCache.isInFlight.bind(PerpsSigningCache);
      // Only observes the lookup: the lock and its answer are real.
      jest
        .spyOn(PerpsSigningCache, 'isInFlight')
        .mockImplementation((operationType, network, userAddress) => {
          const pending = isInFlight(operationType, network, userAddress);
          if (operationType === 'referral' && pending) {
            lookupsWhileHeld += 1;
            if (lookupsWhileHeld >= waiters) {
              waiting.resolve();
            }
          }
          return pending;
        });
      return {
        waiting: waiting.promise,
        lookupsWhileHeld: (): number => lookupsWhileHeld,
        release,
      };
    }

    it('makes its own referral attempt when another provider ended without a result', async () => {
      const { accountSignerProvider, exchangeClient } =
        createAccountSignerProvider({ abstraction: 'unifiedAccount' });
      const lock = holdReferralLock();

      // Whether the other provider's lock was released at each referral write.
      let released = false;
      const releasedAtWrite: boolean[] = [];
      exchangeClient.setReferrer.mockImplementation(async () => {
        releasedAtWrite.push(released);
        return { status: 'ok' };
      });
      let result;
      try {
        const preparing = accountSignerProvider.prepareTradingWallet();
        await lock.waiting;
        released = true;
        lock.release();
        result = await preparing;
      } finally {
        // Never leak the global lock into later tests.
        lock.release();
      }

      expect(releasedAtWrite).toStrictEqual([true]);
      expect(exchangeClient.setReferrer.mock.calls).toStrictEqual([
        REFERRAL_WRITE,
      ]);
      expect(
        PerpsSigningCache.getReferral('mainnet', ACCOUNT_ADDRESS),
      ).toStrictEqual({
        attempted: true,
        success: true,
      });
      expect(result).toStrictEqual({ ready: true });
    });

    it('uses the referral result another provider cached while it waited', async () => {
      const { accountSignerProvider, exchangeClient } =
        createAccountSignerProvider({ abstraction: 'unifiedAccount' });
      const lock = holdReferralLock();

      let result;
      try {
        const preparing = accountSignerProvider.prepareTradingWallet();
        await lock.waiting;
        PerpsSigningCache.setReferral('mainnet', ACCOUNT_ADDRESS, {
          attempted: true,
          success: true,
        });
        lock.release();
        result = await preparing;
      } finally {
        lock.release();
      }

      expect(exchangeClient.setReferrer).not.toHaveBeenCalled();
      expect(result).toStrictEqual({ ready: true });
    });

    it('lets only one of several waiting providers make the referral attempt', async () => {
      const first = createAccountSignerProvider({
        abstraction: 'unifiedAccount',
      });
      const second = createAccountSignerProvider({
        abstraction: 'unifiedAccount',
      });
      const lock = holdReferralLock(2);

      let results;
      let waitersAtRelease;
      try {
        const preparing = [
          first.accountSignerProvider.prepareTradingWallet(),
          second.accountSignerProvider.prepareTradingWallet(),
        ];
        // Both providers found the lock and wait on it.
        await lock.waiting;
        waitersAtRelease = lock.lookupsWhileHeld();
        lock.release();
        results = await Promise.all(preparing);
      } finally {
        lock.release();
      }

      expect(waitersAtRelease).toBe(2);

      // One referral write across both providers.
      expect(
        [first, second].flatMap(
          ({ exchangeClient }): unknown[] =>
            exchangeClient.setReferrer.mock.calls,
        ),
      ).toStrictEqual([REFERRAL_WRITE]);
      expect(results).toStrictEqual([{ ready: true }, { ready: true }]);
    });

    it('signs nothing more when called again', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(NOW);
      const { accountSignerProvider, accountSigner } =
        createAccountSignerProvider({
          signer: { requiresSignatureConfirmation: () => true },
        });
      await accountSignerProvider.prepareTradingWallet();
      const firstSignatures = accountSigner.signTypedData.mock.calls.slice();

      const result = await accountSignerProvider.prepareTradingWallet();

      expect(result).toStrictEqual({ ready: true });
      expect(
        TradingReadinessCache.get('mainnet', ACCOUNT_ADDRESS),
      ).toStrictEqual({
        attempted: true,
        enabled: true,
        reason: undefined,
        timestamp: NOW,
      });
      // Migration, then referral; nothing on the second call.
      expect(firstSignatures).toStrictEqual([
        [ACCOUNT_ADDRESS, USER_SIGNED_PAYLOAD],
        [ACCOUNT_ADDRESS, L1_PAYLOAD],
      ]);
      expect(accountSigner.signTypedData.mock.calls).toStrictEqual(
        firstSignatures,
      );
    });

    it('reports ready after the user declines the migration, since it is not asked again', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(NOW);
      const { accountSignerProvider, accountSigner } =
        createAccountSignerProvider({
          signer: { requiresSignatureConfirmation: () => true },
        });
      accountSigner.signTypedData.mockImplementation(
        async (_address: string, payload: PerpsTypedDataPayload) => {
          if (payload === USER_SIGNED_PAYLOAD) {
            throw new Error('User rejected the request.');
          }
          return MAIN_SIGNATURE;
        },
      );

      const result = await accountSignerProvider.prepareTradingWallet();
      const secondResult = await accountSignerProvider.prepareTradingWallet();

      expect(result).toStrictEqual({ ready: true });
      expect(secondResult).toStrictEqual({ ready: true });
      expect(
        TradingReadinessCache.get('mainnet', ACCOUNT_ADDRESS),
      ).toStrictEqual({
        attempted: true,
        enabled: false,
        reason: undefined,
        timestamp: NOW,
      });
      // Declined once, not asked again.
      expect(
        accountSigner.signTypedData.mock.calls.filter(
          ([, payload]) => payload === USER_SIGNED_PAYLOAD,
        ),
      ).toHaveLength(1);
    });

    it('reports not ready without logging when the builder fee approval is rejected, and asks again at the next preparation', async () => {
      const { accountSignerProvider, exchangeClient, infoClient } =
        createAccountSignerProvider({ abstraction: 'unifiedAccount' });
      infoClient.maxBuilderFee.mockResolvedValue(0);
      exchangeClient.approveBuilderFee.mockRejectedValue(
        new Error('User rejected the request.'),
      );

      const rejected = await accountSignerProvider.prepareTradingWallet();
      const rejectedAgain = await accountSignerProvider.prepareTradingWallet();

      expect(rejected).toStrictEqual({ ready: false });
      expect(rejectedAgain).toStrictEqual({ ready: false });
      expect(exchangeClient.approveBuilderFee.mock.calls).toStrictEqual([
        BUILDER_FEE_WRITE,
        BUILDER_FEE_WRITE,
      ]);
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('reports KEYRING_LOCKED when accountSigner is not ready, without running or logging setup', async () => {
      const {
        accountSignerProvider,
        accountSigner,
        exchangeClient,
        initialize,
      } = createAccountSignerProvider({
        signer: { isReady: () => false },
      });

      const result = await accountSignerProvider.prepareTradingWallet();

      expect(result).toStrictEqual({
        ready: false,
        error: PERPS_ERROR_CODES.KEYRING_LOCKED,
      });
      expect(initialize).not.toHaveBeenCalled();
      expect(accountSigner.signTypedData).not.toHaveBeenCalled();
      expect(exchangeClient.userSetAbstraction).not.toHaveBeenCalled();
      expect(exchangeClient.setReferrer).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
      expect(migrationAttempted()).toBe(false);
      expect(referralAttempted()).toBe(false);
    });

    it('reports and logs the error when the clients cannot initialize', async () => {
      const { accountSignerProvider, initialize } =
        createAccountSignerProvider();
      const failure = new Error('transport unavailable');
      initialize.mockRejectedValue(failure);

      const result = await accountSignerProvider.prepareTradingWallet();

      expect(result).toStrictEqual({
        ready: false,
        error: 'transport unavailable',
      });
      expect(loggerError.mock.calls).toStrictEqual([
        [
          failure,
          {
            tags: {
              feature: PERPS_CONSTANTS.FeatureName,
              provider: 'hyperliquid',
              network: 'mainnet',
            },
            context: {
              name: 'HyperLiquidProvider',
              data: { method: 'prepareTradingWallet' },
            },
          },
        ],
      ]);
    });

    it('does not log a provider replaced during preparation', async () => {
      const { accountSignerProvider, initialize } =
        createAccountSignerProvider();
      initialize.mockRejectedValue(
        new Error(PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE),
      );

      const result = await accountSignerProvider.prepareTradingWallet();

      expect(result).toStrictEqual({
        ready: false,
        error: PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
      });
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('signs the migration at connect and the referral in preparation through the keyring without accountSigner', async () => {
      const { accountSignerProvider, call, exchangeClient } =
        createAccountSignerProvider({ keyring: true });
      const typedDataSignatures = (): unknown[] =>
        call.mock.calls.filter(
          ([action]) => action === 'KeyringController:signTypedMessage',
        );

      // A software keyring is not deferred: the migration signs at connect.
      await accountSignerProvider.getMarketDataWithPrices();
      const connectSignatures = typedDataSignatures();
      call.mockClear();
      const result = await accountSignerProvider.prepareTradingWallet();

      expect(result).toStrictEqual({ ready: true });
      expect(exchangeClient.userSetAbstraction.mock.calls).toStrictEqual([
        MIGRATION_WRITE,
      ]);
      expect(exchangeClient.setReferrer.mock.calls).toStrictEqual([
        REFERRAL_WRITE,
      ]);
      expect(connectSignatures).toStrictEqual([
        [
          'KeyringController:signTypedMessage',
          { from: ACCOUNT_ADDRESS, data: USER_SIGNED_PAYLOAD },
          'V4',
        ],
      ]);
      expect(typedDataSignatures()).toStrictEqual([
        [
          'KeyringController:signTypedMessage',
          { from: ACCOUNT_ADDRESS, data: L1_PAYLOAD },
          'V4',
        ],
      ]);
    });

    it('attempts the referral again when the signer locks while signing it', async () => {
      let signerReady = true;
      const { accountSignerProvider, accountSigner, exchangeClient } =
        createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          signer: { isReady: () => signerReady },
        });
      // The host's signer locks while signing and throws its own error.
      accountSigner.signTypedData.mockImplementationOnce(async () => {
        signerReady = false;
        throw new Error('Wallet is locked');
      });

      const lockedResult = await accountSignerProvider.prepareTradingWallet();
      const referralAfterLock = referralAttempted();
      signerReady = true;
      const retriedResult = await accountSignerProvider.prepareTradingWallet();

      expect(lockedResult).toStrictEqual({
        ready: false,
        error: PERPS_ERROR_CODES.KEYRING_LOCKED,
      });
      expect(referralAfterLock).toBe(false);
      expect(retriedResult).toStrictEqual({ ready: true });
      expect(exchangeClient.setReferrer.mock.calls).toStrictEqual([
        REFERRAL_WRITE,
        REFERRAL_WRITE,
      ]);
      expect(referralAttempted()).toBe(true);
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('reports KEYRING_LOCKED without logging when the signer locks while a step fails', async () => {
      let signerReady = true;
      const { accountSignerProvider, initialize } = createAccountSignerProvider(
        { signer: { isReady: () => signerReady } },
      );
      initialize.mockImplementation(async () => {
        signerReady = false;
        throw new Error('wallet disconnected');
      });

      const result = await accountSignerProvider.prepareTradingWallet();

      expect(result).toStrictEqual({
        ready: false,
        error: PERPS_ERROR_CODES.KEYRING_LOCKED,
      });
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('reports KEYRING_LOCKED when the signer locks while setup signs', async () => {
      let signerReady = true;
      const { accountSignerProvider, accountSigner } =
        createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          signer: { isReady: () => signerReady },
        });
      // The referral signs, then the signer locks before setup ends.
      accountSigner.signTypedData.mockImplementation(async () => {
        signerReady = false;
        return MAIN_SIGNATURE;
      });

      const result = await accountSignerProvider.prepareTradingWallet();

      expect(result).toStrictEqual({
        ready: false,
        error: PERPS_ERROR_CODES.KEYRING_LOCKED,
      });
      expect(accountSigner.signTypedData.mock.calls).toStrictEqual([
        [ACCOUNT_ADDRESS, L1_PAYLOAD],
      ]);
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('reports not ready, without an error, while only the migration needs another attempt', async () => {
      const { accountSignerProvider, exchangeClient } =
        createAccountSignerProvider({ abstraction: 'default' });
      exchangeClient.agentSetAbstraction.mockRejectedValue(
        new Error(PERPS_ERROR_CODES.KEYRING_LOCKED),
      );

      const result = await accountSignerProvider.prepareTradingWallet();

      expect(result).toStrictEqual({ ready: false });
      expect(migrationAttempted()).toBe(false);
      expect(referralAttempted()).toBe(true);
      expect(exchangeClient.setReferrer.mock.calls).toStrictEqual([
        REFERRAL_WRITE,
      ]);
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('reports EXCHANGE_ACCOUNT_NOT_FOUND without signing for a wallet with no HyperLiquid account yet', async () => {
      const { accountSignerProvider, accountSigner, exchangeClient } =
        createAccountSignerProvider({
          abstraction: 'default',
          info: {
            userNonFundingLedgerUpdates: jest.fn().mockResolvedValue([]),
            // Not approved: the venue would reject the approval anyway.
            maxBuilderFee: jest.fn().mockResolvedValue(0),
          },
        });

      const result = await accountSignerProvider.prepareTradingWallet();

      expect(result).toStrictEqual({
        ready: false,
        error: PERPS_ERROR_CODES.EXCHANGE_ACCOUNT_NOT_FOUND,
      });
      expect(exchangeClient.agentSetAbstraction).not.toHaveBeenCalled();
      expect(exchangeClient.setReferrer).not.toHaveBeenCalled();
      expect(exchangeClient.approveBuilderFee).not.toHaveBeenCalled();
      expect(accountSigner.signTypedData).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('sets the referral once a wallet prepared before its first deposit has deposited', async () => {
      let deposited = false;
      const { accountSignerProvider, exchangeClient } =
        createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          info: {
            userNonFundingLedgerUpdates: jest.fn(async () =>
              deposited
                ? [{ delta: { type: 'deposit', usdc: '100' }, time: NOW }]
                : [],
            ),
          },
        });

      const beforeDeposit = await accountSignerProvider.prepareTradingWallet();
      deposited = true;
      const afterDeposit = await accountSignerProvider.prepareTradingWallet();

      expect(beforeDeposit).toStrictEqual({
        ready: false,
        error: PERPS_ERROR_CODES.EXCHANGE_ACCOUNT_NOT_FOUND,
      });
      expect(afterDeposit).toStrictEqual({ ready: true });
      expect(exchangeClient.setReferrer.mock.calls).toStrictEqual([
        REFERRAL_WRITE,
      ]);
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('reports KEYRING_LOCKED for a wallet with no HyperLiquid account when the signer locks during setup', async () => {
      let signerReady = true;
      const { accountSignerProvider, accountSigner } =
        createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          signer: { isReady: () => signerReady },
          info: {
            // The signer locks while the account is being looked up.
            userNonFundingLedgerUpdates: jest.fn(async () => {
              signerReady = false;
              return [];
            }),
          },
        });

      const result = await accountSignerProvider.prepareTradingWallet();

      expect(result).toStrictEqual({
        ready: false,
        error: PERPS_ERROR_CODES.KEYRING_LOCKED,
      });
      expect(accountSigner.signTypedData).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('attempts the referral again when the venue rejects the wallet as unknown despite the probe', async () => {
      const { accountSignerProvider, exchangeClient } =
        createAccountSignerProvider({ abstraction: 'unifiedAccount' });
      // The probe sees a deposit, but the venue has not caught up yet.
      exchangeClient.setReferrer.mockRejectedValueOnce(
        unknownWalletError(ACCOUNT_ADDRESS),
      );

      const rejected = await accountSignerProvider.prepareTradingWallet();
      const referralAfterRejection = referralAttempted();
      const retried = await accountSignerProvider.prepareTradingWallet();

      expect(rejected).toStrictEqual({ ready: false });
      expect(referralAfterRejection).toBe(false);
      expect(retried).toStrictEqual({ ready: true });
      expect(exchangeClient.setReferrer.mock.calls).toStrictEqual([
        REFERRAL_WRITE,
        REFERRAL_WRITE,
      ]);
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('reports ready while the referral code is not ready, and sets the referral at a later preparation once it is', async () => {
      let codeReady = false;
      const { accountSignerProvider, exchangeClient } =
        createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          info: {
            referral: jest.fn(async () => ({
              referrerState: codeReady
                ? {
                    stage: 'ready',
                    data: { code: REFERRAL_CONFIG.MainnetCode },
                  }
                : { stage: 'not_ready', data: null },
            })),
          },
        });

      const beforeReady = await accountSignerProvider.prepareTradingWallet();
      codeReady = true;
      const afterReady = await accountSignerProvider.prepareTradingWallet();

      expect(beforeReady).toStrictEqual({ ready: true });
      expect(afterReady).toStrictEqual({ ready: true });
      expect(exchangeClient.setReferrer.mock.calls).toStrictEqual([
        REFERRAL_WRITE,
      ]);
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('checks a referral code that is not ready again at the next preparation, not before every order', async () => {
      const referral = jest.fn().mockResolvedValue({
        referrerState: { stage: 'not_ready', data: null },
      });
      const { accountSignerProvider, exchangeClient } =
        createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          info: { referral },
        });

      await accountSignerProvider.prepareTradingWallet();
      const orders = [
        await accountSignerProvider.placeOrder(BTC_MARKET_ORDER),
        await accountSignerProvider.placeOrder(BTC_MARKET_ORDER),
        await accountSignerProvider.placeOrder(BTC_MARKET_ORDER),
      ];
      const lookupsAfterOrders = referral.mock.calls.slice();
      await accountSignerProvider.prepareTradingWallet();

      expect(orders.map(({ success }) => success)).toStrictEqual([
        true,
        true,
        true,
      ]);
      expect(lookupsAfterOrders).toStrictEqual([BUILDER_REFERRAL_LOOKUP]);
      expect(referral.mock.calls).toStrictEqual([
        BUILDER_REFERRAL_LOOKUP,
        BUILDER_REFERRAL_LOOKUP,
      ]);
      expect(exchangeClient.setReferrer).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('logs a failed referral code lookup once, without looking it up again before orders or preparation', async () => {
      const lookupError = new Error('Network request failed');
      const referral = jest.fn().mockRejectedValue(lookupError);
      const { accountSignerProvider, exchangeClient } =
        createAccountSignerProvider({
          abstraction: 'unifiedAccount',
          info: { referral },
        });

      const prepared = await accountSignerProvider.prepareTradingWallet();
      const orders = [
        await accountSignerProvider.placeOrder(BTC_MARKET_ORDER),
        await accountSignerProvider.placeOrder(BTC_MARKET_ORDER),
      ];
      const preparedAgain = await accountSignerProvider.prepareTradingWallet();

      expect(prepared).toStrictEqual({ ready: true });
      expect(preparedAgain).toStrictEqual({ ready: true });
      expect(orders.map(({ success }) => success)).toStrictEqual([true, true]);
      expect(referral.mock.calls).toStrictEqual([BUILDER_REFERRAL_LOOKUP]);
      expect(exchangeClient.setReferrer).not.toHaveBeenCalled();
      expect(
        loggerError.mock.calls.map((args: unknown[]) => args[0]),
      ).toStrictEqual([lookupError]);
    });

    it('reports KEYRING_LOCKED without logging when the builder fee signature is rejected as locked', async () => {
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

      const result = await accountSignerProvider.prepareTradingWallet();

      expect(result).toStrictEqual({
        ready: false,
        error: PERPS_ERROR_CODES.KEYRING_LOCKED,
      });
      expect(exchangeClient.approveBuilderFee.mock.calls).toStrictEqual([
        BUILDER_FEE_WRITE,
      ]);
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('reports NO_ACCOUNT_SELECTED without logging when no account is selected', async () => {
      const { accountSignerProvider, accountSigner, deselectAccount } =
        createAccountSignerProvider({ abstraction: 'unifiedAccount' });
      await accountSignerProvider.getMarketDataWithPrices();
      deselectAccount();

      const result = await accountSignerProvider.prepareTradingWallet();

      expect(result).toStrictEqual({
        ready: false,
        error: PERPS_ERROR_CODES.NO_ACCOUNT_SELECTED,
      });
      expect(accountSigner.signTypedData).not.toHaveBeenCalled();
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('reports KEYRING_LOCKED once the signer locks, even after setup completed', async () => {
      let signerReady = true;
      const { accountSignerProvider } = createAccountSignerProvider({
        abstraction: 'unifiedAccount',
        signer: { isReady: () => signerReady },
      });
      const firstResult = await accountSignerProvider.prepareTradingWallet();

      signerReady = false;
      const lockedResult = await accountSignerProvider.prepareTradingWallet();

      expect(firstResult).toStrictEqual({ ready: true });
      expect(lockedResult).toStrictEqual({
        ready: false,
        error: PERPS_ERROR_CODES.KEYRING_LOCKED,
      });
    });
  });
});
