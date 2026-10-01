import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import {
  APPROVE_BUILDER_FEE_PAYLOAD,
  signThroughWallet,
} from '../../helpers/agentFixtures.js';
import {
  BTC_MARKET_ORDER,
  BUILDER_FEE_WRITE,
  createAccountSignerProvider,
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

// The venue refuses every approval of a builder without funds the same way,
// whoever signs it.
const BUILDER_REFUSAL = 'Builder has insufficient balance to be approved.';

describe('HyperLiquidProvider with accountSigner: a builder fee approval the venue refuses', () => {
  let loggerError: jest.SpyInstance;

  beforeEach(() => {
    ({ loggerError } = setUpAccountSignerSuite());
  });

  /**
   * A provider whose builder fee is not approved yet, and whose approval the
   * venue refuses once signed.
   *
   * @param refusal - The venue's answer to the signed approval.
   * @returns The provider and its mocks.
   */
  function createRefusingProvider(
    refusal: string = BUILDER_REFUSAL,
  ): AccountSignerFixture {
    const built = createAccountSignerProvider({
      abstraction: 'unifiedAccount',
    });
    built.infoClient.maxBuilderFee.mockResolvedValue(0);
    built.exchangeClient.approveBuilderFee.mockImplementation(async () => {
      await signThroughWallet(built.sdkWallet(), APPROVE_BUILDER_FEE_PAYLOAD);
      throw new Error(refusal);
    });
    return built;
  }

  it('reports the refusal from preparation without logging it, asking for the approval once', async () => {
    const { accountSignerProvider, exchangeClient } = createRefusingProvider();
    await accountSignerProvider.getMarketDataWithPrices();

    const prepared = [
      await accountSignerProvider.prepareTradingWallet(),
      await accountSignerProvider.prepareTradingWallet(),
    ];

    expect(prepared).toStrictEqual([
      { ready: false, error: BUILDER_REFUSAL },
      { ready: false, error: BUILDER_REFUSAL },
    ]);
    expect(exchangeClient.approveBuilderFee.mock.calls).toStrictEqual([
      BUILDER_FEE_WRITE,
    ]);
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('sends later orders without asking for the approval again', async () => {
    const { accountSignerProvider, accountSigner, exchangeClient } =
      createRefusingProvider();
    await accountSignerProvider.getMarketDataWithPrices();

    await accountSignerProvider.prepareTradingWallet();
    const orders = [
      await accountSignerProvider.placeOrder(BTC_MARKET_ORDER),
      await accountSignerProvider.placeOrder(BTC_MARKET_ORDER),
    ];

    // The venue decides on each order, as after any failed approval.
    expect(orders.map(({ success }) => success)).toStrictEqual([true, true]);
    expect(exchangeClient.order).toHaveBeenCalledTimes(2);
    expect(exchangeClient.approveBuilderFee.mock.calls).toStrictEqual([
      BUILDER_FEE_WRITE,
    ]);
    expect(
      accountSigner.signTypedData.mock.calls.filter(
        ([, payload]) => payload === APPROVE_BUILDER_FEE_PAYLOAD,
      ),
    ).toHaveLength(1);
  });

  it('fails a TP/SL update with its own error code without asking for the approval again', async () => {
    const { accountSignerProvider, exchangeClient } = createRefusingProvider();
    await accountSignerProvider.getMarketDataWithPrices();

    await accountSignerProvider.prepareTradingWallet();
    const update = await accountSignerProvider.updatePositionTPSL({
      symbol: 'BTC',
      takeProfitPrice: '60000',
      stopLossPrice: '40000',
    });

    expect(update).toStrictEqual({
      success: false,
      error: PERPS_ERROR_CODES.TPSL_UPDATE_FAILED,
    });
    expect(exchangeClient.approveBuilderFee.mock.calls).toStrictEqual([
      BUILDER_FEE_WRITE,
    ]);
  });

  it('asks for the approval again after the provider reconnects', async () => {
    const { accountSignerProvider, exchangeClient } = createRefusingProvider();
    await accountSignerProvider.getMarketDataWithPrices();
    await accountSignerProvider.prepareTradingWallet();

    await accountSignerProvider.toggleTestnet();
    await accountSignerProvider.toggleTestnet();
    const prepared = await accountSignerProvider.prepareTradingWallet();

    expect(prepared).toStrictEqual({ ready: false, error: BUILDER_REFUSAL });
    expect(exchangeClient.approveBuilderFee.mock.calls).toStrictEqual([
      BUILDER_FEE_WRITE,
      BUILDER_FEE_WRITE,
    ]);
  });

  it('asks for the approval again at the next preparation after a failure the venue may not repeat', async () => {
    const { accountSignerProvider, exchangeClient } =
      createRefusingProvider('fetch failed');
    await accountSignerProvider.getMarketDataWithPrices();

    await accountSignerProvider.prepareTradingWallet();
    await accountSignerProvider.placeOrder(BTC_MARKET_ORDER);

    expect(exchangeClient.approveBuilderFee.mock.calls).toStrictEqual([
      BUILDER_FEE_WRITE,
      BUILDER_FEE_WRITE,
    ]);
  });
});
