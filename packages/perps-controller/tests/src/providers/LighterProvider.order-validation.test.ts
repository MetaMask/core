import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { TradingService } from '../../../src/services/TradingService.js';
import type {
  CandleData,
  OrderBookData,
  Position,
} from '../../../src/types/index.js';
import type { LighterWasmCall } from '../../../src/types/lighter-types.js';
import {
  ACCOUNT,
  BTC_MARKET,
  buildProvider,
  ensureWebCrypto,
  fakeStreamCtor,
  finishPendingTimersAfterEach,
  getLoggerErrorMock,
  setupTriggerVenue,
  StreamFakeWebSocket,
} from '../../helpers/lighterProvider.js';
import type { BuiltProvider } from '../../helpers/lighterProvider.js';
import {
  createMockInfrastructure,
  createMockServiceContext,
} from '../../helpers/serviceMocks.js';

vi.mock(
  import('../../../src/services/LighterClientService'),
  async (importOriginal) => ({
    ...(await importOriginal()),
    // Only the service class is doubled; convertKeysToCamelCase stays real so
    // the WebSocket message router operates on faithfully camelized payloads.
    LighterClientService: vi.fn(),
  }),
);
vi.mock('../../../src/services/LighterWalletService');

describe('LighterProvider', () => {
  finishPendingTimersAfterEach();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('round-11 TP/SL local preflight', () => {
    it('malformed live position sizes abort TP/SL replacement before any cancellation or signer call', async () => {
      const { provider, calls, clientInstance } = buildProvider();
      // getPositions does not reject these; integerizing the cover size
      // after the existing triggers were cancelled would strip protection
      // and then fail locally.
      for (const badSize of ['Infinity', 'NaN', '1e-9']) {
        clientInstance.getAccountByIndex.mockResolvedValue({
          code: 200,
          accounts: [
            {
              ...ACCOUNT,
              positions: [{ ...ACCOUNT.positions[0], position: badSize }],
            },
          ],
        });
        const result = await provider.updatePositionTPSL({
          symbol: 'BTC',
          takeProfitPrice: '110000',
        });
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      }
      // Zero bridge calls: no signer setup, no cancels, no grouped signing.
      expect(calls).toHaveLength(0);
    });

    it.each([
      ['increases', { position: '0.2', sign: 1 }],
      ['flips side', { position: '0.1', sign: -1 }],
    ])(
      'aborts with zero create/cancel signatures when the position %s before TP/SL signing',
      async (_label, livePosition) => {
        const { provider, calls, clientInstance, bridge } = buildProvider();
        const venue = setupTriggerVenue(clientInstance, bridge);
        venue.seedTrigger('stop-loss', '80000');
        let accountReads = 0;
        clientInstance.getAccountByIndex.mockImplementation(async () => {
          accountReads += 1;
          return {
            code: 200,
            accounts: [
              {
                ...ACCOUNT,
                positions: [
                  {
                    ...ACCOUNT.positions[0],
                    ...(accountReads >= 3 ? livePosition : {}),
                  },
                ],
              },
            ],
          };
        });

        const result = await provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '85000',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('position changed before TP/SL signing');
        expect(
          calls.filter(
            (call) =>
              call.function === '_signCreateOrder' ||
              call.function === '_signCreateGroupedOrders' ||
              call.function === '_signCancelOrder',
          ),
        ).toHaveLength(0);
        expect(venue.rawTriggers).toHaveLength(1);
        expect(venue.rawTriggers[0].triggerPrice).toBe('80000');
      },
    );

    it('fails closed without writing an undiscoverable live manual recovery when the index already has 64 keys', async () => {
      const infra = createMockInfrastructure();
      const fullIndex = Array.from(
        { length: 64 },
        (_, index) => `0xother:${String(index)}:7:ETH`,
      );
      await infra.diskCache.setItem(
        'lighterTpslManualIndex:testnet',
        JSON.stringify(fullIndex),
      );
      const built = buildProvider({ platformDependencies: infra });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      venue.seedTrigger('stop-loss', '80000');
      let readsSeen = 0;
      const realActive =
        built.clientInstance.getActiveOrders.getMockImplementation() as () => Promise<unknown>;
      built.clientInstance.getActiveOrders.mockImplementation(async () => {
        readsSeen += 1;
        if (readsSeen === 3) {
          const at = venue.rawTriggers.findIndex(
            (row) => row.triggerPrice === '85000',
          );
          if (at >= 0) {
            const [row] = venue.rawTriggers.splice(at, 1);
            venue.rawInactive.push({ ...row, status: 'canceled' });
          }
        }
        return await realActive();
      });

      const result = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      const settlementKey = `${ACCOUNT.l1Address.toLowerCase()}:28:7:BTC`;
      expect(result.success).toBe(false);
      expect(result.error).toContain('manual-recovery index is full');
      expect(
        JSON.parse(
          (await infra.diskCache.getItem(
            'lighterTpslManualIndex:testnet',
          )) as string,
        ),
      ).toHaveLength(64);
      expect(
        await infra.diskCache.getItem(
          `lighterTpslManual:testnet:${settlementKey}`,
        ),
      ).toBeNull();
      expect(
        JSON.parse(
          (await infra.diskCache.getItem(
            'lighterTpslJournalIndex:testnet',
          )) as string,
        ),
      ).toContain(settlementKey);
    });

    it('retains a startup journal when the 65th manual recovery cannot be indexed', async () => {
      const infra = createMockInfrastructure();
      const settlementKey = `${ACCOUNT.l1Address.toLowerCase()}:28:7:BTC`;
      await infra.diskCache.setItem(
        'lighterTpslManualIndex:testnet',
        JSON.stringify(
          Array.from(
            { length: 64 },
            (_, index) => `0xother:${String(index)}:7:ETH`,
          ),
        ),
      );
      await infra.diskCache.setItem(
        'lighterTpslJournalIndex:testnet',
        JSON.stringify([settlementKey]),
      );
      await infra.diskCache.setItem(
        `lighterTpslJournal:testnet:${settlementKey}`,
        JSON.stringify({
          version: 2,
          recordedAt: 5,
          operationId: 'op-v2-full-index',
          createdAt: 5,
          apiKeyIndex: 7,
          intent: 'replace',
          phase: 'creating',
          priorTriggers: [],
          attempts: [],
        }),
      );
      const built = buildProvider({ platformDependencies: infra });
      setupTriggerVenue(built.clientInstance, built.bridge);

      await built.provider.getOpenOrders();
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const recoveryFailure = (
          infra.debugLogger.log as Mock<
            (message: string, context: { error?: string }) => void
          >
        ).mock.calls.some(
          ([message, context]) =>
            message.includes('journal entry recovery failed') &&
            context.error?.includes('manual-recovery index is full'),
        );
        if (recoveryFailure) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      expect(infra.debugLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('journal entry recovery failed'),
        expect.objectContaining({
          settlementKey,
          error: expect.stringContaining(
            'manual-recovery index is full',
          ) as string,
        }),
      );
      expect(
        await infra.diskCache.getItem(
          `lighterTpslManual:testnet:${settlementKey}`,
        ),
      ).toBeNull();
      expect(
        JSON.parse(
          (await infra.diskCache.getItem(
            'lighterTpslJournalIndex:testnet',
          )) as string,
        ),
      ).toContain(settlementKey);
      expect(
        await infra.diskCache.getItem(
          `lighterTpslJournal:testnet:${settlementKey}`,
        ),
      ).not.toBeNull();
    });

    it('degenerate randomness aborts TP/SL replacement before any cancellation', async () => {
      const { provider, calls } = buildProvider();
      // The bounded allocator throws after 100 attempts per id; that
      // exhaustion must land BEFORE signer setup and cancels. Ids draw
      // from WebCrypto now — degenerate CRYPTO output is the seam.
      const cryptoObj = ensureWebCrypto();
      const randomSpy = vi
        .spyOn(cryptoObj, 'getRandomValues')
        .mockImplementation(
          <TView extends ArrayBufferView | null>(array: TView): TView => {
            if (array instanceof Uint8Array) {
              array.fill(0);
            }
            return array;
          },
        );
      try {
        const result = await provider.updatePositionTPSL({
          symbol: 'BTC',
          takeProfitPrice: '110000',
          stopLossPrice: '80000',
        });
        expect(result.success).toBe(false);
        expect(result.error).toContain('client order id');
        expect(calls).toHaveLength(0);
      } finally {
        randomSpy.mockRestore();
      }
    });

    it('a wallet switch during public preflight aborts before any signer setup', async () => {
      const { provider, calls, clientInstance, getUserAddressMock } =
        buildProvider();
      // Stall the fresh-price read; the wallet switches A→B while placeOrder
      // is parked in its PUBLIC preflight. Signer setup afterwards would
      // create/register B's venue key for A's stale intent.
      let releasePrice = (): void => undefined;
      const priceGate = new Promise<void>((resolve) => {
        releasePrice = resolve;
      });
      const details = {
        code: 200,
        orderBookDetails: [{ symbol: 'BTC', lastTradePrice: 100000 }],
      };
      clientInstance.getOrderBookDetails.mockImplementation(async () => {
        await priceGate;
        return details;
      });
      const placement = provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'market',
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      getUserAddressMock.mockReturnValue(`0x${'b'.repeat(40)}`);
      releasePrice();
      const result = await placement;
      expect(result.success).toBe(false);
      // Zero bridge calls: no _createClient / personal_sign / key
      // registration for account B under A's intent.
      expect(calls).toHaveLength(0);
    });

    it('fails leverage validation closed when venue margin metadata is unavailable', async () => {
      // Metadata row present but WITHOUT margin fractions: the global 50x
      // fallback must not validate 26x for what may be a 25x market.
      const missingRow = buildProvider();
      missingRow.clientInstance.getOrderBookDetails.mockResolvedValue({
        code: 200,
        orderBookDetails: [{ symbol: 'BTC', lastTradePrice: 100000 }],
      });
      const request = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit' as const,
        price: '90000',
        leverage: 26,
      };
      const missingValidation =
        await missingRow.provider.validateOrder(request);
      expect(missingValidation.isValid).toBe(false);
      expect(missingValidation.error).toContain('margin metadata');
      const missingPlacement = await missingRow.provider.placeOrder(request);
      expect(missingPlacement.success).toBe(false);
      expect(missingPlacement.error).toContain('margin metadata');
      expect(missingRow.calls).toHaveLength(0);
      // Metadata endpoint failing outright: same fail-closed behavior.
      const failing = buildProvider();
      failing.clientInstance.getOrderBookDetails.mockRejectedValue(
        new Error('venue metadata unavailable'),
      );
      const failingValidation = await failing.provider.validateOrder(request);
      expect(failingValidation.isValid).toBe(false);
      const failingPlacement = await failing.provider.placeOrder(request);
      expect(failingPlacement.success).toBe(false);
      expect(failing.calls).toHaveLength(0);
    });

    it("rejects prefix-numeric strings like '10USD' across every money surface, with zero bridge calls", async () => {
      const { provider, calls } = buildProvider();
      // parseFloat prefix-parses these into plausible numbers; strict
      // full-string parsing must refuse them everywhere.
      const orderCases = [
        { overrides: { size: '0.001BTC' }, error: 'Order size must be' },
        {
          overrides: { size: '0.001', usdAmount: '10USD' },
          error: 'Invalid usdAmount',
        },
        {
          overrides: { size: '0.001', price: '90000USD' },
          error: 'Invalid limit price',
        },
      ];
      for (const testCase of orderCases) {
        const request = {
          symbol: 'BTC',
          isBuy: true,
          orderType: 'limit' as const,
          price: '90000',
          ...testCase.overrides,
        };
        const validation = await provider.validateOrder(request);
        expect(validation.isValid).toBe(false);
        expect(validation.error).toContain(testCase.error);
        const placement = await provider.placeOrder(request);
        expect(placement.success).toBe(false);
        expect(placement.error).toContain(testCase.error);
      }
      const closeValidation = await provider.validateClosePosition({
        symbol: 'BTC',
        size: '0.001BTC',
        currentPrice: 100000,
      });
      expect(closeValidation.isValid).toBe(false);
      const closeExecution = await provider.closePosition({
        symbol: 'BTC',
        size: '0.001BTC',
        currentPrice: 100000,
      });
      expect(closeExecution.success).toBe(false);
      const withdrawValidation = await provider.validateWithdrawal({
        amount: '5USD',
      });
      expect(withdrawValidation.isValid).toBe(false);
      const withdrawExecution = await provider.withdraw({ amount: '5USD' });
      expect(withdrawExecution.success).toBe(false);
      const marginExecution = await provider.updateMargin({
        symbol: 'BTC',
        amount: '5USD',
      });
      expect(marginExecution.success).toBe(false);
      expect(calls).toHaveLength(0);
    });

    it('enforces the advertised withdrawal minimum in validation and execution', async () => {
      const { provider, calls } = buildProvider();
      // Route advertises minWithdrawUsdc '1'; 0.000001 USDC integerizes to
      // wire 1 and previously signed.
      const validation = await provider.validateWithdrawal({
        amount: '0.000001',
      });
      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('below the Lighter minimum');
      const execution = await provider.withdraw({ amount: '0.000001' });
      expect(execution.success).toBe(false);
      expect(execution.error).toContain('below the Lighter minimum');
      expect(calls).toHaveLength(0);
      // Exactly at the minimum is accepted.
      const atMin = await provider.validateWithdrawal({ amount: '1' });
      expect(atMin.isValid).toBe(true);
    });

    it('creates the replacement protection BEFORE cancelling the snapshotted old triggers', async () => {
      const { provider, calls, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);
      // A lone SL is an ordinary CreateOrder trigger (venue rejects
      // grouped type 0), created BEFORE the old trigger is cancelled.
      const createAt = calls.findIndex(
        (call) => call.function === '_signCreateOrder',
      );
      const cancelAt = calls.findIndex(
        (call) => call.function === '_signCancelOrder',
      );
      expect(createAt).toBeGreaterThanOrEqual(0);
      expect(cancelAt).toBeGreaterThanOrEqual(0);
      // Create-first: a signing/submission failure can no longer strip
      // protection that was already cancelled.
      expect(createAt).toBeLessThan(cancelAt);
      // Settlement reconciled: exactly the fresh trigger remains.
      expect(venue.rawTriggers).toHaveLength(1);
      expect(venue.rawTriggers[0].triggerPrice).toBe('85000');
    });

    it('keeps the old protection untouched when creating the replacement fails', async () => {
      const { provider, calls, bridge, clientInstance } = buildProvider();
      clientInstance.getActiveOrders.mockResolvedValue({
        code: 200,
        orders: [
          {
            orderIndex: 778,
            clientOrderIndex: 3,
            marketIndex: 1,
            ownerAccountIndex: 28,
            initialBaseAmount: '0.001',
            remainingBaseAmount: '0.001',
            price: '80000',
            isAsk: true,
            type: 'stop-loss',
            timeInForce: 'immediate-or-cancel',
            reduceOnly: 1,
            status: 'open',
            orderExpiry: 0,
            timestamp: 1700000000000,
            triggerPrice: '80000',
          },
        ],
      });
      const realImplementation = (
        bridge.execute as Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      (bridge.execute as Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          if (call.function === '_signCreateOrder') {
            return { error: 'venue rejected replacement trigger' };
          }
          return realImplementation(call);
        },
      );
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('venue rejected replacement trigger');
      // The snapshotted old trigger was NEVER cancelled: protection stays.
      expect(
        calls.filter((call) => call.function === '_signCancelOrder'),
      ).toHaveLength(0);
    });

    it('a single trigger replacement reserves exactly one client id', async () => {
      const { provider, calls, clientInstance, bridge } = buildProvider();
      setupTriggerVenue(clientInstance, bridge);
      const cryptoObj = ensureWebCrypto();
      const randomSpy = vi.spyOn(cryptoObj, 'getRandomValues');
      try {
        const result = await provider.updatePositionTPSL({
          symbol: 'BTC',
          takeProfitPrice: '110000',
        });
        expect(result.error).toBeUndefined();
        expect(result.success).toBe(true);
        // One uint48 id = exactly ONE 6-byte crypto draw (plus ONE draw
        // for the journal's collision-resistant operation id); reserving
        // an unused second id would waste allocator budget for no order.
        expect(randomSpy).toHaveBeenCalledTimes(2);
        // A lone TP is an ordinary CreateOrder trigger — the venue rejects
        // CreateGroupedOrders with grouping type 0 ('GroupingType is not
        // valid'), and OCO requires two siblings.
        expect(
          calls.filter((call) => call.function === '_signCreateGroupedOrders'),
        ).toHaveLength(0);
        const createCall = calls.find(
          (call) => call.function === '_signCreateOrder',
        );
        expect(createCall).toBeDefined();
        // params: [accountIndex, marketId, clientOrderIndex, size, price,
        // isAsk, orderType, timeInForce, reduceOnly, triggerPrice, expiry,
        // nonce]
        const orderParams = createCall?.params as (string | number)[];
        expect(orderParams[6]).toBe(4); // take-profit wire type
        expect(orderParams[7]).toBe(0); // immediate-or-cancel
        expect(orderParams[8]).toBe(1); // reduce-only
        expect(Number(orderParams[9])).toBeGreaterThan(0); // trigger price
      } finally {
        randomSpy.mockRestore();
      }
    });
  });

  describe('round-9 finite-positive intent parity', () => {
    it('rejects non-finite size, usdAmount, and leverage in validateOrder and placeOrder before any signer call', async () => {
      const { provider, calls } = buildProvider();
      // parseFloat('Infinity') === Infinity and Infinity > 0, so bare
      // positivity checks pass: leverage Infinity becomes IMF
      // Math.round(10000/Infinity) = 0 and reaches _signUpdateLeverage;
      // infinite size/USD integerizes to 'Infinity' inside
      // _signCreateOrder params.
      const cases = [
        { overrides: { size: 'Infinity' }, error: 'Order size must be' },
        { overrides: { size: 'NaN' }, error: 'Order size must be' },
        {
          overrides: { size: '0.001', usdAmount: 'Infinity' },
          error: 'Invalid usdAmount',
        },
        {
          overrides: { size: '0.001', usdAmount: 'NaN' },
          error: 'Invalid usdAmount',
        },
        {
          overrides: { size: '0.001', leverage: Infinity },
          error: 'Invalid leverage',
        },
        {
          overrides: { size: '0.001', leverage: Number.NaN },
          error: 'Invalid leverage',
        },
      ];
      for (const testCase of cases) {
        const request = {
          symbol: 'BTC',
          isBuy: true,
          orderType: 'limit' as const,
          price: '90000',
          ...testCase.overrides,
        };
        const validation = await provider.validateOrder(request);
        expect(validation.isValid).toBe(false);
        expect(validation.error).toContain(testCase.error);
        const placement = await provider.placeOrder(request);
        expect(placement.success).toBe(false);
        expect(placement.error).toContain(testCase.error);
      }
      // Invalid intent must exit before signer/account setup entirely: not
      // just no order/leverage signing, but ZERO bridge calls (no
      // _createClient / key registration side effects either).
      expect(calls).toHaveLength(0);
    });

    it('rejects non-finite close size and usdAmount in validateClosePosition and closePosition before any signer call', async () => {
      const { provider, calls } = buildProvider();
      // Pre-fix, validateClosePosition silently fell back from a
      // non-finite usdAmount to the held size (approving), while
      // closePosition forwarded the infinite USD into placement — a
      // validator/execution split on real money.
      const cases = [
        { overrides: { size: 'Infinity' }, error: 'Order size must be' },
        { overrides: { size: 'NaN' }, error: 'Order size must be' },
        {
          overrides: { usdAmount: 'Infinity' },
          error: 'Invalid usdAmount',
        },
        { overrides: { usdAmount: 'NaN' }, error: 'Invalid usdAmount' },
      ];
      for (const testCase of cases) {
        const request = {
          symbol: 'BTC',
          currentPrice: 100000,
          ...testCase.overrides,
        };
        const validation = await provider.validateClosePosition(request);
        expect(validation.isValid).toBe(false);
        expect(validation.error).toContain(testCase.error);
        const execution = await provider.closePosition(request);
        expect(execution.success).toBe(false);
        expect(execution.error).toContain(testCase.error);
      }
      expect(calls).toHaveLength(0);
    });

    it('fails closed when finite intent cannot be represented as venue wire integers', async () => {
      const { provider, calls } = buildProvider();
      // Finite alone is insufficient: 1e300 * 10^decimals overflows the
      // safe-integer wire format (stringifying as '1e+305') before signing.
      const cases = [
        { overrides: { size: '1e300' } },
        { overrides: { size: '0.001', usdAmount: '1e300' } },
        { overrides: { size: '0.001', price: '1e300' } },
      ];
      for (const testCase of cases) {
        const request = {
          symbol: 'BTC',
          isBuy: true,
          orderType: 'limit' as const,
          price: '90000',
          ...testCase.overrides,
        };
        const validation = await provider.validateOrder(request);
        expect(validation.isValid).toBe(false);
        expect(validation.error).toContain('integer range');
        const placement = await provider.placeOrder(request);
        expect(placement.success).toBe(false);
        expect(placement.error).toContain('integer range');
      }
      // Close-path parity for an unrepresentable explicit size.
      const closeValidation = await provider.validateClosePosition({
        symbol: 'BTC',
        size: '1e300',
        currentPrice: 100000,
      });
      expect(closeValidation.isValid).toBe(false);
      expect(closeValidation.error).toContain('integer range');
      const closeExecution = await provider.closePosition({
        symbol: 'BTC',
        size: '1e300',
        currentPrice: 100000,
      });
      expect(closeExecution.success).toBe(false);
      expect(closeExecution.error).toContain('integer range');
      expect(calls).toHaveLength(0);
    });

    it('safe-checks the slippage-adjusted EXECUTION price a market buy signs, not just the reference', async () => {
      const { provider, clientInstance, calls } = buildProvider();
      // priceDecimals=1: reference 415,000,000 wires to 4.15e9 (within the
      // signer's uint32 price cast), but a BUY signs +5% protection:
      // 4,357,500,000 wire — ABOVE uint32, which the pinned signer would
      // silently wrap. Reference-only validation approves what placement
      // refuses.
      const reference = 415_000_000;
      clientInstance.getOrderBookDetails.mockResolvedValue({
        code: 200,
        orderBookDetails: [
          {
            ...BTC_MARKET,
            lastTradePrice: reference,
            minInitialMarginFraction: 200,
            maintenanceMarginFraction: 120,
          },
        ],
      });
      const buyRequest = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'market' as const,
      };
      const buyValidation = await provider.validateOrder(buyRequest);
      expect(buyValidation.isValid).toBe(false);
      expect(buyValidation.error).toContain('uint32');
      const buyPlacement = await provider.placeOrder(buyRequest);
      expect(buyPlacement.success).toBe(false);
      expect(buyPlacement.error).toContain('uint32');
      // Invalid intent exits before signer/account setup: ZERO bridge calls.
      expect(calls).toHaveLength(0);
      // Discriminating counterpart: a SELL protects at -5% (safe wire), so
      // both surfaces must ACCEPT the same reference price.
      const sellRequest = { ...buyRequest, isBuy: false };
      const sellValidation = await provider.validateOrder(sellRequest);
      expect(sellValidation.isValid).toBe(true);
      const sellPlacement = await provider.placeOrder(sellRequest);
      expect(sellPlacement.success).toBe(true);
    });

    it('safe-checks the buy-to-close execution price when closing a short', async () => {
      const { provider, clientInstance, calls } = buildProvider();
      const reference = 415_000_000;
      clientInstance.getOrderBookDetails.mockResolvedValue({
        code: 200,
        orderBookDetails: [
          {
            ...BTC_MARKET,
            lastTradePrice: reference,
            minInitialMarginFraction: 200,
            maintenanceMarginFraction: 120,
          },
        ],
      });
      // SHORT position (documented venue representation: positive
      // magnitude, sign -1): closing means BUYING, so the +5% protection
      // price overflows exactly like the market-buy case.
      clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [
          {
            ...ACCOUNT,
            positions: [
              { ...ACCOUNT.positions[0], position: '0.001', sign: -1 },
            ],
          },
        ],
      });
      const shortCloseValidation = await provider.validateClosePosition({
        symbol: 'BTC',
      });
      expect(shortCloseValidation.isValid).toBe(false);
      expect(shortCloseValidation.error).toContain('uint32');
      const shortCloseExecution = await provider.closePosition({
        symbol: 'BTC',
      });
      expect(shortCloseExecution.success).toBe(false);
      expect(shortCloseExecution.error).toContain('uint32');
      // Invalid intent exits before signer/account setup: ZERO bridge calls.
      expect(calls).toHaveLength(0);
      // A LONG close SELLS at -5% (safe wire): both surfaces accept.
      clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [
          {
            ...ACCOUNT,
            positions: [{ ...ACCOUNT.positions[0], position: '0.001' }],
          },
        ],
      });
      const longCloseValidation = await provider.validateClosePosition({
        symbol: 'BTC',
      });
      expect(longCloseValidation.isValid).toBe(true);
      const longCloseExecution = await provider.closePosition({
        symbol: 'BTC',
      });
      expect(longCloseExecution.success).toBe(true);
    });

    it('invalid TP/SL replacements are rejected before any cancellation or signer call', async () => {
      const { provider, calls } = buildProvider();
      // Cancelling existing protection FIRST and only then discovering the
      // replacement is unrepresentable would leave the position naked.
      // '0.04' is sub-tick at priceDecimals=1: wire Math.round(0.4) = 0.
      const badPrices = ['Infinity', 'NaN', '-100', '0', '1e300', '0.04'];
      for (const bad of badPrices) {
        const takeProfit = await provider.updatePositionTPSL({
          symbol: 'BTC',
          takeProfitPrice: bad,
        });
        expect(takeProfit.success).toBe(false);
        const stopLoss = await provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: bad,
        });
        expect(stopLoss.success).toBe(false);
      }
      // Zero bridge calls of ANY kind: no signer setup, no cancels, no
      // grouped-order signing.
      expect(calls).toHaveLength(0);
    });

    it('withdraw rejects non-finite and unrepresentable amounts before any signer call, matching validateWithdrawal', async () => {
      const { provider, calls } = buildProvider();
      for (const amount of ['Infinity', 'NaN', '-5', '0', '1e300']) {
        const validation = await provider.validateWithdrawal({ amount });
        expect(validation.isValid).toBe(false);
        const execution = await provider.withdraw({ amount });
        expect(execution.success).toBe(false);
      }
      expect(calls).toHaveLength(0);
    });

    describe('isolated margin settlement', () => {
      describe('bounded exact margin execution polling', () => {
        beforeEach(() => vi.useFakeTimers());
        afterEach(() => vi.useRealTimers());

        function setup(): BuiltProvider & {
          exact: (hash: string, status: number) => Record<string, unknown>;
        } {
          const built = buildProvider({ registeredKey: '9c'.repeat(40) });
          built.clientInstance.getAccountByIndex.mockResolvedValue({
            code: 200,
            accounts: [
              {
                ...ACCOUNT,
                positions: [
                  {
                    ...ACCOUNT.positions[0],
                    marginMode: 1,
                    allocatedMargin: '2000',
                  },
                ],
              },
            ],
          });
          const exact = (
            hash: string,
            status: number,
          ): Record<string, unknown> => ({
            code: 200,
            hash,
            accountIndex: 28,
            apiKeyIndex: 7,
            nonce: built.calls
              .find((call) => call.function === '_signUpdateMargin')
              ?.params.at(-1),
            status,
          });
          return { ...built, exact };
        }

        it('waits for pending then executed without signing or sending twice', async () => {
          const built = setup();
          built.clientInstance.getTx
            .mockImplementationOnce(async (hash: string) =>
              built.exact(hash, 1),
            )
            .mockImplementation(async (hash: string) => built.exact(hash, 2));
          const pending = built.provider.updateMargin({
            symbol: 'BTC',
            amount: '5',
          });
          await vi.advanceTimersByTimeAsync(3000);
          expect(await pending).toStrictEqual({ success: true });
          expect(built.clientInstance.getTx).toHaveBeenCalledTimes(2);
          expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(1);
          expect(
            built.calls.filter((call) => call.function === '_signUpdateMargin'),
          ).toHaveLength(1);
        });

        it('stops on an exact failed outcome after pending without resending', async () => {
          const built = setup();
          built.clientInstance.getTx
            .mockImplementationOnce(async (hash: string) =>
              built.exact(hash, 1),
            )
            .mockImplementation(async (hash: string) => built.exact(hash, 0));
          const pending = built.provider.updateMargin({
            symbol: 'BTC',
            amount: '5',
          });
          await vi.advanceTimersByTimeAsync(3000);
          expect(await pending).toMatchObject({
            success: false,
            error: expect.stringContaining(
              'margin transaction failed',
            ) as string,
          });
          expect(built.clientInstance.getTx).toHaveBeenCalledTimes(2);
          expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(1);
        });

        it.each(['pending', 'missing', 'foreign'])(
          'retains %s uncertainty after bounded reads without resending',
          async (mode) => {
            const built = setup();
            built.clientInstance.getTx.mockImplementation(
              async (hash: string) =>
                mode === 'missing'
                  ? null
                  : {
                      ...built.exact(hash, mode === 'pending' ? 1 : 2),
                      ...(mode === 'foreign' ? { apiKeyIndex: 8 } : {}),
                    },
            );
            const pending = built.provider.updateMargin({
              symbol: 'BTC',
              amount: '5',
            });
            await vi.advanceTimersByTimeAsync(3000);
            expect(await pending).toMatchObject({
              success: false,
              error: expect.stringContaining('remains unresolved') as string,
            });
            expect(built.clientInstance.getTx).toHaveBeenCalledTimes(10);
            expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(1);
            const recovered = await built.provider.getRecoveredDispatches();
            expect(recovered).toHaveLength(1);
            expect(recovered[0]).toMatchObject({ outcome: 'unknown' });
          },
        );

        it('stops reads when the account changes while waiting', async () => {
          const built = setup();
          built.clientInstance.getTx.mockImplementation(
            async (hash: string) => {
              built.getUserAddressMock.mockReturnValue('0xdef');
              return built.exact(hash, 1);
            },
          );
          const pending = built.provider.updateMargin({
            symbol: 'BTC',
            amount: '5',
          });
          await vi.advanceTimersByTimeAsync(3000);
          expect(await pending).toMatchObject({ success: false });
          expect(built.clientInstance.getTx).toHaveBeenCalledTimes(1);
          expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(1);
        });
      });

      it.each([
        ['foreign-account', { index: 99 }, {}],
        ['foreign-wallet', { l1Address: '0xforeign' }, {}],
        ['foreign-market', {}, { marketId: 99 }],
        ['invalid-sign', {}, { sign: 0 }],
        ['flat', {}, { position: '0' }],
        ['missing-allocation', {}, { allocatedMargin: undefined }],
        ['negative-allocation', {}, { allocatedMargin: '-1' }],
      ])(
        'refuses %s removal state before signing',
        async (_name, accountChange, positionChange) => {
          const { provider, clientInstance, calls } = buildProvider();
          clientInstance.getAccountByIndex.mockResolvedValue({
            code: 200,
            accounts: [
              {
                ...ACCOUNT,
                ...accountChange,
                positions: [
                  {
                    ...ACCOUNT.positions[0],
                    marginMode: 1,
                    allocatedMargin: '2000',
                    ...positionChange,
                  },
                ],
              },
            ],
          });
          expect(
            (await provider.updateMargin({ symbol: 'BTC', amount: '-5' }))
              .success,
          ).toBe(false);
          expect(calls).toHaveLength(0);
        },
      );

      it('refuses fractional micro-USDC rather than signing rounded collateral', async () => {
        const deps = createMockInfrastructure();
        const { provider, clientInstance, calls } = buildProvider({
          platformDependencies: deps,
        });
        const logError = getLoggerErrorMock(deps);
        clientInstance.getAccountByIndex.mockResolvedValue({
          code: 200,
          accounts: [
            {
              ...ACCOUNT,
              positions: [
                {
                  ...ACCOUNT.positions[0],
                  marginMode: 1,
                  allocatedMargin: '2000',
                },
              ],
            },
          ],
        });
        expect(
          (await provider.updateMargin({ symbol: 'BTC', amount: '5.0000009' }))
            .success,
        ).toBe(false);
        expect(calls).toHaveLength(0);
        expect(logError).not.toHaveBeenCalled();
      });

      it('reports exact failed margin execution without claiming success or pending acceptance', async () => {
        const deps = createMockInfrastructure();
        const { provider, clientInstance, calls } = buildProvider({
          registeredKey: '9c'.repeat(40),
          platformDependencies: deps,
        });
        const logError = getLoggerErrorMock(deps);
        clientInstance.getAccountByIndex.mockResolvedValue({
          code: 200,
          accounts: [
            {
              ...ACCOUNT,
              positions: [
                {
                  ...ACCOUNT.positions[0],
                  marginMode: 1,
                  allocatedMargin: '2000',
                },
              ],
            },
          ],
        });
        clientInstance.getTx.mockImplementation(async (hash: string) => {
          const call = calls.find(
            (item) => item.function === '_signUpdateMargin',
          );
          return {
            code: 200,
            hash,
            accountIndex: 28,
            apiKeyIndex: 7,
            nonce: call?.params.at(-1),
            status: 0,
          };
        });
        expect(
          await provider.updateMargin({ symbol: 'BTC', amount: '5' }),
        ).toMatchObject({
          success: false,
          error:
            'Lighter margin transaction failed; refresh its exact outcome before retrying',
        });
        expect(logError).toHaveBeenCalledTimes(1);
        const [[reportedError, reportedOptions]] = logError.mock.calls;
        if (!reportedOptions) {
          throw new Error('Expected Lighter margin error context');
        }
        expect(reportedError.message).toBe(
          'Lighter margin transaction failed; refresh its exact outcome before retrying',
        );
        expect(reportedOptions.tags).toMatchObject({
          operation: 'position_management',
          action: 'update_margin',
        });
      });

      it.each(['5', '-5'])(
        'confirms exact transaction execution before reporting margin %s success',
        async (amount) => {
          const { provider, clientInstance, calls } = buildProvider({
            registeredKey: '9c'.repeat(40),
          });
          clientInstance.getAccountByIndex.mockResolvedValue({
            code: 200,
            accounts: [
              {
                ...ACCOUNT,
                positions: [
                  {
                    ...ACCOUNT.positions[0],
                    marginMode: 1,
                    allocatedMargin: '2000',
                  },
                ],
              },
            ],
          });
          clientInstance.getTx.mockImplementation(async (hash: string) => {
            const call = calls.find(
              (item) => item.function === '_signUpdateMargin',
            );
            return {
              code: 200,
              hash,
              accountIndex: 28,
              apiKeyIndex: 7,
              nonce: call?.params.at(-1),
              status: 2,
            };
          });
          expect(
            await provider.updateMargin({ symbol: 'BTC', amount }),
          ).toStrictEqual({ success: true });
          expect(clientInstance.getTx).toHaveBeenCalledTimes(1);
          expect(
            calls.find((item) => item.function === '_signUpdateMargin')
              ?.params[3],
          ).toBe(amount === '5' ? 1 : 0);
        },
      );

      it('keeps accepted margin blocked after expiry and nonce advance across provider restart', async () => {
        const infra = createMockInfrastructure();
        const built = buildProvider({
          registeredKey: '9c'.repeat(40),
          platformDependencies: infra,
        });
        const account = {
          ...ACCOUNT,
          positions: [
            { ...ACCOUNT.positions[0], marginMode: 1, allocatedMargin: '2000' },
          ],
        };
        built.clientInstance.getAccountByIndex.mockResolvedValue({
          code: 200,
          accounts: [account],
        });
        const first = await built.provider.updateMargin({
          symbol: 'BTC',
          amount: '5',
        });
        expect(first.success).toBe(false);
        const clock = vi
          .spyOn(Date, 'now')
          .mockReturnValue(Date.now() + 1_000_000);
        try {
          const restarted = buildProvider({
            registeredKey: '9c'.repeat(40),
            platformDependencies: infra,
          });
          restarted.clientInstance.getAccountByIndex.mockResolvedValue({
            code: 200,
            accounts: [account],
          });
          restarted.clientInstance.getNextNonce.mockResolvedValue({
            code: 200,
            nonce: 1000,
          });
          restarted.clientInstance.getTx.mockResolvedValue(null);
          expect(
            (
              await restarted.provider.updateMargin({
                symbol: 'BTC',
                amount: '5',
              })
            ).success,
          ).toBe(false);
          expect(
            restarted.calls.filter(
              (call) => call.function === '_signUpdateMargin',
            ),
          ).toHaveLength(0);
          expect(restarted.clientInstance.sendTx).not.toHaveBeenCalled();
        } finally {
          clock.mockRestore();
        }
      });

      it('rechecks allocated margin after signing and clears only the unsent attempt', async () => {
        const built = buildProvider({ registeredKey: '9c'.repeat(40) });
        const account = {
          ...ACCOUNT,
          positions: [
            { ...ACCOUNT.positions[0], marginMode: 1, allocatedMargin: '2000' },
          ],
        };
        built.clientInstance.getAccountByIndex.mockResolvedValue({
          code: 200,
          accounts: [account],
        });
        const execute = vi.spyOn(built.bridge, 'execute');
        const sign = execute.getMockImplementation();
        if (!sign) {
          throw new Error('Missing signer fixture');
        }
        execute.mockImplementation(async (call: LighterWasmCall) => {
          const result = await sign(call);
          if (call.function === '_signUpdateMargin') {
            account.positions[0].allocatedMargin = '2';
          }
          return result;
        });
        const result = await built.provider.updateMargin({
          symbol: 'BTC',
          amount: '-5',
        });
        expect(result.success).toBe(false);
        expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
        expect(await built.provider.getRecoveredDispatches()).toStrictEqual([]);
      });

      it('rejects an addition beyond authoritative available balance without signing', async () => {
        const { provider, clientInstance, calls } = buildProvider();
        clientInstance.getAccountByIndex.mockResolvedValue({
          code: 200,
          accounts: [
            {
              ...ACCOUNT,
              availableBalance: '2',
              positions: [
                {
                  ...ACCOUNT.positions[0],
                  marginMode: 1,
                  allocatedMargin: '2000',
                },
              ],
            },
          ],
        });
        expect(
          (await provider.updateMargin({ symbol: 'BTC', amount: '5' })).success,
        ).toBe(false);
        expect(calls).toHaveLength(0);
      });

      it('rejects cross-position margin adjustment before signing', async () => {
        const { provider, calls } = buildProvider();
        expect(
          await provider.updateMargin({ symbol: 'BTC', amount: '5' }),
        ).toMatchObject({
          success: false,
          error: 'Lighter margin adjustment requires an open isolated position',
        });
        expect(calls).toHaveLength(0);
      });

      it('keeps accepted additive margin unresolved across another request', async () => {
        const { provider, clientInstance, calls } = buildProvider({
          registeredKey: '9c'.repeat(40),
        });
        clientInstance.getAccountByIndex.mockResolvedValue({
          code: 200,
          accounts: [
            {
              ...ACCOUNT,
              positions: [
                {
                  ...ACCOUNT.positions[0],
                  marginMode: 1,
                  allocatedMargin: '2000',
                },
              ],
            },
          ],
        });
        const first = await provider.updateMargin({
          symbol: 'BTC',
          amount: '5',
        });
        expect(first.success).toBe(false);
        expect(first.error).toContain('pending');
        expect(
          (await provider.updateMargin({ symbol: 'BTC', amount: '5' })).success,
        ).toBe(false);
        expect(
          calls.filter((call) => call.function === '_signUpdateMargin'),
        ).toHaveLength(1);
      });

      it('refuses removal larger than authoritative allocated margin', async () => {
        const { provider, clientInstance, calls } = buildProvider();
        clientInstance.getAccountByIndex.mockResolvedValue({
          code: 200,
          accounts: [
            {
              ...ACCOUNT,
              positions: [
                {
                  ...ACCOUNT.positions[0],
                  marginMode: 1,
                  allocatedMargin: '2',
                },
              ],
            },
          ],
        });
        expect(
          (await provider.updateMargin({ symbol: 'BTC', amount: '-5' }))
            .success,
        ).toBe(false);
        expect(calls).toHaveLength(0);
      });
    });

    it('updateMargin fails closed on wire-integer overflow before any signer call', async () => {
      const { provider, calls } = buildProvider();
      const overflow = await provider.updateMargin({
        symbol: 'BTC',
        amount: '1e300',
      });
      expect(overflow.success).toBe(false);
      expect(overflow.error).toContain('integer range');
      const infinite = await provider.updateMargin({
        symbol: 'BTC',
        amount: 'Infinity',
      });
      expect(infinite.success).toBe(false);
      expect(calls).toHaveLength(0);
    });

    it('rejects tiny finite leverage whose margin fraction overflows to Infinity', async () => {
      const { provider, calls } = buildProvider();
      // 10000 / Number.MIN_VALUE === Infinity: an IMF-below-one guard alone
      // misses it and Infinity would ride into _signUpdateLeverage.
      const request = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit' as const,
        price: '90000',
        leverage: Number.MIN_VALUE,
      };
      const validation = await provider.validateOrder(request);
      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('Invalid leverage');
      const placement = await provider.placeOrder(request);
      expect(placement.success).toBe(false);
      expect(placement.error).toContain('Invalid leverage');
      expect(calls).toHaveLength(0);
    });

    it('enforces the published per-market max leverage, not only IMF representability', async () => {
      const { provider, clientInstance, calls } = buildProvider();
      // Venue publishes minInitialMarginFraction 400 -> 25x for BTC.
      clientInstance.getOrderBookDetails.mockResolvedValue({
        code: 200,
        orderBookDetails: [
          {
            symbol: 'BTC',
            lastTradePrice: 100000,
            minInitialMarginFraction: 400,
            maintenanceMarginFraction: 240,
          },
        ],
      });
      const request = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit' as const,
        price: '90000',
        leverage: 26,
      };
      const validation = await provider.validateOrder(request);
      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('Invalid leverage');
      expect(validation.error).toContain('25');
      const placement = await provider.placeOrder(request);
      expect(placement.success).toBe(false);
      expect(placement.error).toContain('Invalid leverage');
      expect(calls).toHaveLength(0);
      // 25x exactly is within the published bound: accepted by both.
      const atMax = { ...request, leverage: 25 };
      const atMaxValidation = await provider.validateOrder(atMax);
      expect(atMaxValidation.isValid).toBe(true);
      const atMaxPlacement = await provider.placeOrder(atMax);
      expect(atMaxPlacement.error).toBeUndefined();
      expect(atMaxPlacement.success).toBe(true);
    });

    it('rejects a positive sub-tick limit price that rounds to wire zero, in validation and placement', async () => {
      const { provider, calls } = buildProvider();
      // 0.04 at priceDecimals=1 -> Math.round(0.4) = 0: positive intent,
      // zero on the wire. Size 251 clears the $10 minimum notional (min
      // size 250.00001 after float ceil) so ONLY the wire-zero check can
      // be the rejection.
      const request = {
        symbol: 'BTC',
        isBuy: true,
        size: '251',
        orderType: 'limit' as const,
        price: '0.04',
      };
      const validation = await provider.validateOrder(request);
      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('rounds to zero');
      const placement = await provider.placeOrder(request);
      expect(placement.success).toBe(false);
      expect(placement.error).toContain('rounds to zero');
      expect(calls).toHaveLength(0);
    });

    it('rejects finite leverage that derives a zero venue margin fraction', async () => {
      const { provider, calls } = buildProvider();
      // Math.round(10000/1e6) === 0: an IMF of zero must never be signed.
      const request = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit' as const,
        price: '90000',
        leverage: 1e6,
      };
      const validation = await provider.validateOrder(request);
      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('Invalid leverage');
      const placement = await provider.placeOrder(request);
      expect(placement.success).toBe(false);
      expect(placement.error).toContain('Invalid leverage');
      expect(calls).toHaveLength(0);
    });
  });

  describe('round-8 market validation parity', () => {
    it.each([
      ['limit', undefined],
      ['market', undefined],
      ['limit', 'IOC'],
    ] as const)(
      'rejects an explicit off-grid %s order before signer setup (timeInForce %s)',
      async (orderType, timeInForce) => {
        const { provider, calls } = buildProvider();
        const request = {
          symbol: 'BTC',
          isBuy: true,
          size: '0.000201',
          orderType,
          ...(orderType === 'limit' ? { price: '100000' } : {}),
          ...(timeInForce ? { timeInForce } : {}),
        };
        const validation = await provider.validateOrder(request);
        expect(validation.isValid).toBe(false);
        expect(validation.error).toContain('size grid');
        const placement = await provider.placeOrder(request);
        expect(placement.success).toBe(false);
        expect(placement.error).toContain('size grid');
        expect(calls).toHaveLength(0);
      },
    );

    it('does not apply maker-only minimums to market orders', async () => {
      const { provider, clientInstance, calls } = buildProvider();
      clientInstance.getOrderBookDetails.mockResolvedValue({
        code: 200,
        orderBookDetails: [{ symbol: 'BTC', lastTradePrice: 40000 }],
      });
      const request = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.0002',
        orderType: 'market' as const,
        price: 'Infinity',
      };
      const validation = await provider.validateOrder(request);
      expect(validation.isValid).toBe(true);
      const placement = await provider.placeOrder(request);
      expect(placement.success).toBe(true);
      expect(
        calls.filter((call) => call.function === '_signCreateOrder'),
      ).toHaveLength(1);
    });

    it('rejects a non-finite or non-positive price snapshot before drift math, in validation and execution', async () => {
      const { provider } = buildProvider();
      // Infinity produces NaN drift (bypasses protection); NaN and 0 were
      // silently skipped. All must fail closed now.
      for (const snapshot of [Infinity, NaN, 0, -100]) {
        const request = {
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'market' as const,
          currentPrice: 100000,
          priceAtCalculation: snapshot,
        };
        const validation = await provider.validateOrder(request);
        expect(validation.isValid).toBe(false);
        expect(validation.error).toContain('Invalid price snapshot');
        const placement = await provider.placeOrder(request);
        expect(placement.success).toBe(false);
        expect(placement.error).toContain('Invalid price snapshot');
        const closeValidation = await provider.validateClosePosition({
          symbol: 'BTC',
          currentPrice: 100000,
          priceAtCalculation: snapshot,
        });
        expect(closeValidation.isValid).toBe(false);
        expect(closeValidation.error).toContain('Invalid price snapshot');
      }
    });

    it('rejects out-of-range slippage tolerance consistently across validators and placement', async () => {
      const { provider } = buildProvider();
      // 10,000 bps on a sell derives a zero protection price: placement
      // rejects, so validation must too — and both with the same reason.
      for (const maxSlippageBps of [10_000, -100, Number.NaN]) {
        const request = {
          symbol: 'BTC',
          isBuy: false,
          size: '0.001',
          orderType: 'market' as const,
          currentPrice: 100000,
          maxSlippageBps,
        };
        const validation = await provider.validateOrder(request);
        expect(validation.isValid).toBe(false);
        expect(validation.error).toContain('Invalid slippage tolerance');
        const placement = await provider.placeOrder(request);
        expect(placement.success).toBe(false);
        expect(placement.error).toContain('Invalid slippage tolerance');
        const closeValidation = await provider.validateClosePosition({
          symbol: 'BTC',
          maxSlippageBps,
        });
        expect(closeValidation.isValid).toBe(false);
        expect(closeValidation.error).toContain('Invalid slippage tolerance');
      }
    });
  });

  describe('client order index allocation', () => {
    it('a perpetually colliding or zero draw exhausts with a clear error instead of hanging', async () => {
      const { provider, calls } = buildProvider();
      // Perpetual zero: every candidate is rejected, so a bounded allocator
      // must throw instead of spinning. The mock never falls through.
      const cryptoObj = ensureWebCrypto();
      const fillWith =
        (byte: number) =>
        <TView extends ArrayBufferView | null>(array: TView): TView => {
          if (array instanceof Uint8Array) {
            array.fill(byte);
          }
          return array;
        };
      const randomSpy = vi
        .spyOn(cryptoObj, 'getRandomValues')
        .mockImplementation(fillWith(0));
      try {
        const zeroResult = await provider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit',
          price: '90000',
        });
        expect(zeroResult.success).toBe(false);
        expect(zeroResult.error).toContain('client order id');
        const zeroDraws = randomSpy.mock.calls.length;
        expect(zeroDraws).toBeGreaterThan(0);
        expect(zeroDraws).toBeLessThanOrEqual(200);

        // Perpetual collision: one id issues, then every later candidate
        // collides with it forever (constant crypto output).
        randomSpy.mockClear();
        randomSpy.mockImplementation(fillWith(0x80));
        const first = await provider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit',
          price: '90000',
        });
        expect(first.success).toBe(true);
        const second = await provider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit',
          price: '90001',
        });
        expect(second.success).toBe(false);
        expect(second.error).toContain('client order id');
        expect(
          calls.filter((call) => call.function === '_signCreateOrder'),
        ).toHaveLength(1);
      } finally {
        randomSpy.mockRestore();
      }
    });

    it('parallel placements draw unique random uint48 ids within venue bounds', async () => {
      const { provider, calls } = buildProvider();
      const results = await Promise.all([
        provider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit',
          price: '90000',
        }),
        provider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit',
          price: '90001',
        }),
        provider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit',
          price: '90002',
        }),
      ]);
      for (const result of results) {
        expect(result.success).toBe(true);
      }
      const ids = calls
        .filter((call) => call.function === '_signCreateOrder')
        .map((call) => call.params[2]);
      expect(ids).toHaveLength(3);
      expect(new Set(ids).size).toBe(3);
      for (const id of ids) {
        expect(Number.isSafeInteger(id)).toBe(true);
        expect(id).toBeGreaterThan(0);
        expect(id).toBeLessThan(2 ** 48);
      }
    });

    it('a colliding random draw is retried until the id is unique', async () => {
      const { provider, calls } = buildProvider();
      // One 6-byte crypto draw per candidate. Force the second
      // placement's first candidate to collide with the first
      // placement's id, then verify the allocator retries with a fresh
      // draw instead of reusing the id. The spy falls through to real
      // crypto once the queue is exhausted, so the retry loop cannot
      // spin forever even if this sequence is wrong.
      const cryptoObj = ensureWebCrypto();
      const realRandom = cryptoObj.getRandomValues.bind(cryptoObj);
      const queue: number[] = [0x80, 0x80, 0x40];
      const randomSpy = vi
        .spyOn(cryptoObj, 'getRandomValues')
        .mockImplementation(
          <TView extends ArrayBufferView | null>(array: TView): TView => {
            const next = queue.shift();
            if (next !== undefined && array instanceof Uint8Array) {
              array.fill(next);
              return array;
            }
            return realRandom(array as never);
          },
        );
      try {
        const first = await provider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit',
          price: '90000',
        });
        const second = await provider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit',
          price: '90001',
        });
        expect(first.success).toBe(true);
        expect(second.success).toBe(true);
        const ids = calls
          .filter((call) => call.function === '_signCreateOrder')
          .map((call) => call.params[2]);
        const of = (byte: number): number => {
          const third = byte * 65_536 + byte * 256 + byte;
          return third * 2 ** 24 + third;
        };
        expect(ids).toStrictEqual([of(0x80), of(0x40)]);
        // Three draws prove the colliding candidate was rejected and
        // redrawn.
        expect(randomSpy).toHaveBeenCalledTimes(3);
      } finally {
        randomSpy.mockRestore();
      }
    });

    it('a zero draw is rejected and redrawn, never issued as a client id', async () => {
      const { provider, calls } = buildProvider();
      const cryptoObj = ensureWebCrypto();
      const zeroQueue: number[] = [0x00, 0xc0];
      const randomSpy = vi
        .spyOn(cryptoObj, 'getRandomValues')
        .mockImplementation(
          <TView extends ArrayBufferView | null>(array: TView): TView => {
            const next = zeroQueue.shift();
            if (next !== undefined && array instanceof Uint8Array) {
              array.fill(next);
            }
            return array;
          },
        );
      try {
        const result = await provider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit',
          price: '90000',
        });
        expect(result.success).toBe(true);
        const ids = calls
          .filter((call) => call.function === '_signCreateOrder')
          .map((call) => call.params[2]);
        const third = 0xc0 * 65_536 + 0xc0 * 256 + 0xc0;
        expect(ids).toStrictEqual([third * 2 ** 24 + third]);
        expect(randomSpy).toHaveBeenCalledTimes(2);
      } finally {
        randomSpy.mockRestore();
      }
    });

    it('grouped TP/SL ids are unique against each other and prior placements', async () => {
      const { provider, calls } = buildProvider();
      await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });
      await provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '110000',
        stopLossPrice: '80000',
      });
      const orderId = calls.find((call) => call.function === '_signCreateOrder')
        ?.params[2] as number;
      const groupedCall = calls.find(
        (call) => call.function === '_signCreateGroupedOrders',
      );
      expect(groupedCall).toBeDefined();
      // Grouped params: [accountIndex, groupingType, orderCount, ...orders,
      // nonce] where each order is 10 elements with the client id at offset 1.
      const groupedParams = groupedCall?.params as (string | number)[];
      const takeProfitId = groupedParams[4] as number;
      const stopLossId = groupedParams[14] as number;
      const allIds = [orderId, takeProfitId, stopLossId];
      for (const id of allIds) {
        expect(Number.isSafeInteger(id)).toBe(true);
        expect(id).toBeGreaterThan(0);
        expect(id).toBeLessThan(2 ** 48);
      }
      expect(new Set(allIds).size).toBe(3);
    });
  });

  describe('full-close precision and validate/execute parity', () => {
    const dustPosition = (
      position: string,
    ): { code: number; accounts: (typeof ACCOUNT)[] } => ({
      code: 200,
      accounts: [
        {
          ...ACCOUNT,
          positions: [{ ...ACCOUNT.positions[0], position }],
        },
      ],
    });

    it('rejects an off-grid partial dust close instead of rounding it up', async () => {
      const { provider, clientInstance, calls } = buildProvider();
      clientInstance.getAccountByIndex.mockResolvedValue(
        dustPosition('0.0001'),
      );
      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: false,
        size: '0.000099',
        orderType: 'market',
        reduceOnly: true,
        currentPrice: 90000,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('size grid');
      expect(calls).toHaveLength(0);
    });

    it('an exact-size dust market close is not bumped to the maker minimum', async () => {
      const { provider, calls, clientInstance } = buildProvider();
      clientInstance.getAccountByIndex.mockResolvedValue(
        dustPosition('0.0001'),
      );
      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: false,
        size: '0.0001',
        orderType: 'market',
        reduceOnly: true,
        currentPrice: 90000,
      });
      expect(result.success).toBe(true);
      const orderCall = calls.find(
        (call) => call.function === '_signCreateOrder',
      );
      expect(orderCall?.params[3]).toBe('10');
    });

    it('validateOrder does not apply maker minimums to market opens', async () => {
      const { provider } = buildProvider();
      const result = await provider.validateOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.00001',
        orderType: 'market',
        isFullClose: true,
        currentPrice: 90000,
      });
      expect(result).toStrictEqual({ isValid: true });
    });

    it('validateOrder approves a live-verified reduce-only full close like placement', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getAccountByIndex.mockResolvedValue(
        dustPosition('0.00001'),
      );
      const result = await provider.validateOrder({
        symbol: 'BTC',
        isBuy: false,
        size: '0.00001',
        orderType: 'market',
        reduceOnly: true,
        currentPrice: 90000,
      });
      expect(result).toStrictEqual({ isValid: true });
    });

    it('validateClosePosition rejects the shapes closePosition refuses', async () => {
      const { provider } = buildProvider();
      expect(
        await provider.validateClosePosition({
          symbol: 'BTC',
          orderType: 'limit',
        }),
      ).toMatchObject({
        isValid: false,
        error: 'Limit close requires a price',
      });
      expect(
        (
          await provider.validateClosePosition({
            symbol: 'BTC',
            usdAmount: '-5',
          })
        ).isValid,
      ).toBe(false);
      expect(
        (
          await provider.validateClosePosition({
            symbol: 'BTC',
            size: '0',
          })
        ).isValid,
      ).toBe(false);
      expect(
        await provider.validateClosePosition({ symbol: 'BTC' }),
      ).toStrictEqual({ isValid: true });
    });

    it('validateClosePosition agrees with execution on live sizing', async () => {
      const { provider, clientInstance } = buildProvider();
      const dust = {
        code: 200,
        accounts: [
          {
            ...ACCOUNT,
            positions: [{ ...ACCOUNT.positions[0], position: '0.0001' }],
          },
        ],
      };
      clientInstance.getAccountByIndex.mockResolvedValue(dust);
      // Maker minimums do not apply to a market partial close, but explicit
      // sizes must still land exactly on the base-size grid.
      const partialValidation = await provider.validateClosePosition({
        symbol: 'BTC',
        size: '0.000099',
        currentPrice: 90000,
      });
      expect(partialValidation.isValid).toBe(false);
      expect(partialValidation.error).toContain('size grid');
      const partialExecution = await provider.closePosition({
        symbol: 'BTC',
        size: '0.000099',
        currentPrice: 90000,
      });
      expect(partialExecution.success).toBe(false);
      expect(partialExecution.error).toContain('size grid');
      // Exact dust full close: both approve.
      expect(
        (
          await provider.validateClosePosition({
            symbol: 'BTC',
            size: '0.0001',
            currentPrice: 90000,
          })
        ).isValid,
      ).toBe(true);
      const exactExecution = await provider.closePosition({
        symbol: 'BTC',
        size: '0.0001',
        currentPrice: 90000,
      });
      expect(exactExecution.success).toBe(true);
    });

    it('validates limit closes at the caller price and rejects 0/NaN prices', async () => {
      const { provider } = buildProvider();
      for (const price of ['0', 'abc']) {
        const result = await provider.validateClosePosition({
          symbol: 'BTC',
          orderType: 'limit',
          price,
        });
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Invalid limit price');
      }
    });

    it('uses the fresh venue price for a market close without applying maker minimums', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [
          {
            ...ACCOUNT,
            positions: [{ ...ACCOUNT.positions[0], position: '0.001' }],
          },
        ],
      });
      const result = await provider.validateClosePosition({
        symbol: 'BTC',
        size: '0.00005',
        currentPrice: 1_000_000,
      });
      expect(result.isValid).toBe(true);
      const execution = await provider.closePosition({
        symbol: 'BTC',
        size: '0.00005',
        currentPrice: 1_000_000,
      });
      expect(execution.success).toBe(true);
    });

    it('fails market close validation closed when the fresh venue price is missing or zero', async () => {
      for (const orderBookDetails of [
        [
          {
            ...BTC_MARKET,
            lastTradePrice: undefined,
            minInitialMarginFraction: 200,
            maintenanceMarginFraction: 120,
          },
        ],
        [
          {
            ...BTC_MARKET,
            lastTradePrice: 0,
            minInitialMarginFraction: 200,
            maintenanceMarginFraction: 120,
          },
        ],
      ]) {
        const { provider, clientInstance } = buildProvider();
        clientInstance.getAccountByIndex.mockResolvedValue({
          code: 200,
          accounts: [
            {
              ...ACCOUNT,
              positions: [{ ...ACCOUNT.positions[0], position: '0.001' }],
            },
          ],
        });
        clientInstance.getOrderBookDetails.mockResolvedValue({
          code: 200,
          orderBookDetails,
        });
        const result = await provider.validateClosePosition({
          symbol: 'BTC',
          size: '0.0005',
          currentPrice: 100000,
        });
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('No live venue price available');
        // Execution parity: closePosition refuses with the same error.
        const execution = await provider.closePosition({
          symbol: 'BTC',
          size: '0.0005',
          currentPrice: 100000,
        });
        expect(execution.success).toBe(false);
        expect(execution.error).toContain('No live venue price available');
      }
    });

    it('rejects a market close when the fresh price drifted beyond tolerance, in validation and execution', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [
          {
            ...ACCOUNT,
            positions: [{ ...ACCOUNT.positions[0], position: '0.001' }],
          },
        ],
      });
      // Sized at 90,000 but the fresh venue price is 100,000: ~11.1% move
      // against a 5% default tolerance. Size $50 at the fresh price, so
      // ONLY the drift check can be the rejection.
      const request = {
        symbol: 'BTC',
        size: '0.0005',
        currentPrice: 90000,
        priceAtCalculation: 90000,
      };
      const result = await provider.validateClosePosition(request);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('slippage tolerance since sizing');
      const execution = await provider.closePosition(request);
      expect(execution.success).toBe(false);
      expect(execution.error).toContain('slippage tolerance since sizing');
    });

    it("rejects an 'Infinity' limit price in validators and placement alike", async () => {
      const { provider, calls } = buildProvider();
      // parseFloat('Infinity') === Infinity, which passes a bare > 0 check;
      // all three surfaces must refuse it before integerization/signing.
      const closeValidation = await provider.validateClosePosition({
        symbol: 'BTC',
        orderType: 'limit',
        price: 'Infinity',
      });
      expect(closeValidation.isValid).toBe(false);
      expect(closeValidation.error).toContain('Invalid limit price');
      const orderValidation = await provider.validateOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: 'Infinity',
      });
      expect(orderValidation.isValid).toBe(false);
      expect(orderValidation.error).toContain('Invalid limit price');
      const placement = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: 'Infinity',
      });
      expect(placement.success).toBe(false);
      // Strict-parse parity: placement now rejects with the SAME message
      // as the validators.
      expect(placement.error).toContain('Invalid limit price');
      expect(
        calls.filter((call) => call.function === '_signCreateOrder'),
      ).toHaveLength(0);
      // Parity in the OTHER direction: a MARKET order ignores params.price
      // (placement sizes at the fresh venue price), so an irrelevant
      // 'Infinity' must not fail validation for an order placement accepts.
      const marketValidation = await provider.validateOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'market',
        price: 'Infinity',
      });
      expect(marketValidation.isValid).toBe(true);
      const marketPlacement = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'market',
        price: 'Infinity',
        currentPrice: 100000,
      });
      expect(marketPlacement.success).toBe(true);
    });

    it('preserves subscriber state when channel setup hits a capability gate', async () => {
      const { provider, clientInstance, getUserAddressMock } = buildProvider({
        webSocketCtor: fakeStreamCtor,
        configuredAccountIndex: null,
      });
      // The bound wallet resolves to a Premium account.
      clientInstance.getAccountsByL1Address.mockResolvedValue({
        code: 200,
        l1Address: ACCOUNT.l1Address,
        subAccounts: [{ ...ACCOUNT, accountType: 1 }],
      });
      getUserAddressMock.mockReturnValue(ACCOUNT.l1Address);
      StreamFakeWebSocket.instances = [];
      const accountCallback = vi.fn();
      const ordersCallback = vi.fn();
      const unsubscribeAccount = provider.subscribeToAccount({
        callback: accountCallback,
      });
      const unsubscribeOrders = provider.subscribeToOrders({
        callback: ordersCallback,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      // Capability gates are not "no data": no false-empty emissions.
      expect(accountCallback).not.toHaveBeenCalled();
      expect(ordersCallback).not.toHaveBeenCalled();
      unsubscribeAccount();
      unsubscribeOrders();
    });

    it('emits order book levels with the full contract shape (cumulative totals, notionals, maxTotal)', async () => {
      // Regression (found live on device): levels were fanned out as bare
      // {price, size}, so the depth chart's parseFloat(level.total) produced
      // NaN Y-coordinates and crashed the native SVG path parser
      // (RNSVGPathParser InvalidNumber).
      const { provider } = buildProvider({ webSocketCtor: fakeStreamCtor });
      const bookCallback = vi.fn<(...args: [OrderBookData]) => void>();
      const unsubscribe = provider.subscribeToOrderBook({
        symbol: 'BTC',
        levels: 5,
        callback: bookCallback,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      const socket =
        StreamFakeWebSocket.instances[StreamFakeWebSocket.instances.length - 1];
      socket.open();
      await new Promise((resolve) => setTimeout(resolve, 0));
      socket.onmessage?.({
        data: JSON.stringify({
          type: 'subscribed/order_book',
          channel: 'order_book:1',
          order_book: {
            nonce: 10,
            bids: [
              { price: '90000', size: '0.5' },
              { price: '89990', size: '1.5' },
            ],
            asks: [
              { price: '90010', size: '0.4' },
              { price: '90020', size: '2.0' },
            ],
          },
        }),
      });
      expect(bookCallback).toHaveBeenCalled();
      const book =
        bookCallback.mock.calls[bookCallback.mock.calls.length - 1][0];
      // Cumulative sizes per side.
      expect(
        book.bids.map((level: { total: string }) => level.total),
      ).toStrictEqual(['0.5', '2']);
      expect(
        book.asks.map((level: { total: string }) => level.total),
      ).toStrictEqual(['0.4', '2.4']);
      // Per-level notional and cumulative notional.
      expect(parseFloat(book.bids[0].notional)).toBeCloseTo(45000);
      expect(parseFloat(book.bids[1].totalNotional)).toBeCloseTo(
        45000 + 89990 * 1.5,
      );
      // Book-level scaling fields the UI depends on.
      expect(parseFloat(book.maxTotal)).toBeCloseTo(2.4);
      expect(typeof book.lastUpdated).toBe('number');
      // No NaN anywhere the depth chart reads.
      for (const side of [book.bids, book.asks]) {
        for (const level of side) {
          for (const field of [
            'price',
            'size',
            'total',
            'notional',
            'totalNotional',
          ] as const) {
            expect(Number.isFinite(parseFloat(level[field]))).toBe(true);
          }
        }
      }
      unsubscribe();
    });

    it('rejects a malformed order book frame without emitting or poisoning its cached nonce', async () => {
      const { provider } = buildProvider({ webSocketCtor: fakeStreamCtor });
      const bookCallback = vi.fn<(...args: [OrderBookData]) => void>();
      const unsubscribe = provider.subscribeToOrderBook({
        symbol: 'BTC',
        callback: bookCallback,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      const socket =
        StreamFakeWebSocket.instances[StreamFakeWebSocket.instances.length - 1];
      socket.open();
      await new Promise((resolve) => setTimeout(resolve, 0));
      socket.onmessage?.({
        data: JSON.stringify({
          type: 'subscribed/order_book',
          channel: 'order_book:1',
          order_book: {
            nonce: 10,
            bids: [{ price: '90000', size: '0.5' }],
            asks: [{ price: '90010', size: '0.4' }],
          },
        }),
      });
      bookCallback.mockClear();
      socket.onmessage?.({
        data: JSON.stringify({
          type: 'update/order_book',
          channel: 'order_book:1',
          order_book: {
            begin_nonce: 10,
            nonce: 11,
            bids: [{ price: '89990', size: '12.5oops' }],
            asks: [],
          },
        }),
      });
      expect(bookCallback).not.toHaveBeenCalled();

      socket.onmessage?.({
        data: JSON.stringify({
          type: 'update/order_book',
          channel: 'order_book:1',
          order_book: {
            begin_nonce: 10,
            nonce: 12,
            bids: [{ price: '89990', size: '1.5' }],
            asks: [],
          },
        }),
      });
      expect(bookCallback).toHaveBeenCalledTimes(1);
      const book = bookCallback.mock.calls[0][0];
      expect(book.bids).toStrictEqual([
        expect.objectContaining({ price: '90000', size: '0.5' }),
        expect.objectContaining({ price: '89990', size: '1.5' }),
      ]);
      unsubscribe();
    });

    it('discards an order book after a nonce gap and requests a fresh snapshot', async () => {
      const { provider } = buildProvider({ webSocketCtor: fakeStreamCtor });
      const callback = vi.fn();
      const unsubscribe = provider.subscribeToOrderBook({
        symbol: 'BTC',
        callback,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      const socket =
        StreamFakeWebSocket.instances[StreamFakeWebSocket.instances.length - 1];
      socket.open();
      await new Promise((resolve) => setTimeout(resolve, 0));
      socket.onmessage?.({
        data: JSON.stringify({
          type: 'subscribed/order_book',
          channel: 'order_book:1',
          order_book: {
            nonce: 10,
            bids: [{ price: '90000', size: '1' }],
            asks: [{ price: '90010', size: '1' }],
          },
        }),
      });
      expect(callback).toHaveBeenCalledTimes(1);

      socket.onmessage?.({
        data: JSON.stringify({
          type: 'update/order_book',
          channel: 'order_book:1',
          order_book: {
            begin_nonce: 12,
            nonce: 13,
            bids: [{ price: '90000', size: '0' }],
            asks: [{ price: '90020', size: '2' }],
          },
        }),
      });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(socket.sent).toContainEqual(
        JSON.stringify({ type: 'unsubscribe', channel: 'order_book/1' }),
      );
      expect(socket.sent).toContainEqual(
        JSON.stringify({ type: 'subscribe', channel: 'order_book/1' }),
      );
      unsubscribe();
    });

    it('drops malformed candles from the REST seed and the WS channel', async () => {
      // Same boundary: a candle with a missing field would be stringified
      // as "undefined" and reach the chart as NaN.
      const { provider, clientInstance } = buildProvider({
        webSocketCtor: fakeStreamCtor,
      });
      vi.spyOn(clientInstance, 'getCandles').mockResolvedValue({
        code: 200,
        c: [
          { t: 1000, o: 1, h: 2, l: 0.5, c: 1.5, v: 10 },
          { t: 1500, o: 1, h: 2, l: 0.5, v: 10 }, // missing close
          {
            t: 1600,
            o: null as unknown as number,
            h: 2,
            l: 0.5,
            c: 1.5,
            v: 10,
          },
          { t: 1700, o: '', h: 2, l: 0.5, c: 1.5, v: 10 },
          {
            t: 1800,
            o: false as unknown as number,
            h: 2,
            l: 0.5,
            c: 1.5,
            v: 10,
          },
        ],
      });
      const candleCallback = vi.fn<(...args: [CandleData]) => void>();
      const unsubscribe = provider.subscribeToCandles({
        symbol: 'BTC',
        interval: '1h',
        callback: candleCallback,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      const seeded =
        candleCallback.mock.calls[candleCallback.mock.calls.length - 1][0];
      expect(seeded.candles).toHaveLength(1);
      const socket =
        StreamFakeWebSocket.instances[StreamFakeWebSocket.instances.length - 1];
      socket.open();
      await new Promise((resolve) => setTimeout(resolve, 0));
      socket.onmessage?.({
        data: JSON.stringify({
          type: 'update/candle',
          channel: 'candle:1:1h',
          candles: [
            { t: 2000, o: 1.5, h: 2.5, l: 1, c: 2, v: 5 },
            { t: 3000, o: 'x', h: 2, l: 1, c: 2, v: 5 },
            { o: 1, h: 2, l: 1, c: 2, v: 5 },
            { t: 4000, o: null, h: 2, l: 1, c: 2, v: 5 },
            { t: 5000, o: '', h: 2, l: 1, c: 2, v: 5 },
            { t: 6000, o: false, h: 2, l: 1, c: 2, v: 5 },
          ],
        }),
      });
      const live =
        candleCallback.mock.calls[candleCallback.mock.calls.length - 1][0];
      expect(
        live.candles.map((candle: { time: number }) => candle.time),
      ).toStrictEqual([1000, 2000]);
      for (const candle of live.candles) {
        for (const field of [
          'open',
          'high',
          'low',
          'close',
          'volume',
        ] as const) {
          expect(Number.isFinite(parseFloat(candle[field]))).toBe(true);
        }
      }
      unsubscribe();
    });

    it('withholds a fills snapshot containing unsupported (nonzero-fee) fills', async () => {
      const { provider, clientInstance, getUserAddressMock } = buildProvider({
        webSocketCtor: fakeStreamCtor,
        configuredAccountIndex: null,
      });
      clientInstance.getAccountsByL1Address.mockResolvedValue({
        code: 200,
        l1Address: ACCOUNT.l1Address,
        subAccounts: [ACCOUNT],
      });
      getUserAddressMock.mockReturnValue(ACCOUNT.l1Address);
      StreamFakeWebSocket.instances = [];
      const fillsCallback = vi.fn();
      const unsubscribe = provider.subscribeToOrderFills({
        callback: fillsCallback,
      });
      await provider.getAccountState();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      const socket =
        StreamFakeWebSocket.instances[StreamFakeWebSocket.instances.length - 1];
      socket.open();
      await new Promise((resolve) => setTimeout(resolve, 0));
      fillsCallback.mockClear();
      // Snapshot with one supported and one unsupported (nonzero-fee) fill:
      // emitting the partial remainder would overwrite valid history.
      socket.onmessage?.({
        data: JSON.stringify({
          type: 'subscribed/account_all_trades',
          channel: 'account_all_trades:28',
          trades: {
            '1': [
              {
                trade_id: 1,
                market_id: 1,
                size: '0.001',
                price: '90000',
                ask_id: 1,
                bid_id: 2,
                ask_account_id: 28,
                bid_account_id: 7,
                is_maker_ask: false,
                timestamp: 1700000000000,
              },
              {
                trade_id: 2,
                market_id: 1,
                size: '0.001',
                price: '90000',
                ask_id: 3,
                bid_id: 4,
                ask_account_id: 28,
                bid_account_id: 7,
                is_maker_ask: false,
                timestamp: 1700000001000,
                taker_fee: 45000,
              },
            ],
          },
        }),
      });
      expect(fillsCallback).not.toHaveBeenCalled();
      unsubscribe();
    });

    it.each([
      ['non-finite size', { size: '1e999' }],
      ['nonparticipant account', { ask_account_id: 7, bid_account_id: 8 }],
      ['wrong maker role type', { is_maker_ask: 1 }],
      ['null fee', { taker_fee: null }],
      ['null counterparty fee', { maker_fee: null }],
      ['unsafe trade id', { trade_id: Number.MAX_SAFE_INTEGER + 1 }],
      ['negative market id', { market_id: -1 }],
      ['negative ask id', { ask_id: -1 }],
      ['unsafe bid id', { bid_id: Number.MAX_SAFE_INTEGER + 1 }],
    ])('drops a WebSocket fill with %s', async (_scenario, overrides) => {
      const { provider, clientInstance } = buildProvider({
        webSocketCtor: fakeStreamCtor,
        configuredAccountIndex: null,
      });
      clientInstance.getAccountsByL1Address.mockResolvedValue({
        code: 200,
        l1Address: ACCOUNT.l1Address,
        subAccounts: [ACCOUNT],
      });
      StreamFakeWebSocket.instances = [];
      const callback = vi.fn();
      const unsubscribe = provider.subscribeToOrderFills({ callback });
      await provider.getAccountState();
      await new Promise((resolve) => setTimeout(resolve, 0));
      const socket =
        StreamFakeWebSocket.instances[StreamFakeWebSocket.instances.length - 1];
      socket.open();
      await new Promise((resolve) => setTimeout(resolve, 0));
      callback.mockClear();

      socket.onmessage?.({
        data: JSON.stringify({
          type: 'update/account_all_trades',
          channel: 'account_all_trades:28',
          trades: {
            '1': [
              {
                trade_id: 1,
                market_id: 1,
                size: '0.001',
                price: '90000',
                ask_id: 1,
                bid_id: 2,
                ask_account_id: 28,
                bid_account_id: 7,
                is_maker_ask: false,
                timestamp: 1700000000000,
                ask_account_pnl: '0',
                bid_account_pnl: '0',
                taker_position_size_before: '0.001',
                taker_position_sign_changed: true,
                maker_position_size_before: '0',
                maker_position_sign_changed: true,
                ...overrides,
              },
            ],
          },
        }),
      });

      expect(callback).not.toHaveBeenCalled();
      unsubscribe();
    });

    it('validateClosePosition rejects a close with no open position', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [{ ...ACCOUNT, positions: [] }],
      });
      const result = await provider.validateClosePosition({ symbol: 'BTC' });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('No open Lighter position');
    });
  });

  describe('round-4 session races', () => {
    const accountB = { ...ACCOUNT, index: 900, l1Address: '0xbbbb' };
    const perAddressLookup =
      () =>
      (
        address: string,
      ): Promise<{
        code: number;
        l1Address: string;
        subAccounts: (typeof ACCOUNT)[];
      }> =>
        Promise.resolve(
          address.toLowerCase() === '0xbbbb'
            ? { code: 200, l1Address: '0xbbbb', subAccounts: [accountB] }
            : {
                code: 200,
                l1Address: ACCOUNT.l1Address,
                subAccounts: [ACCOUNT],
              },
        );

    it('a delayed getAccountState response never surfaces as the new account', async () => {
      const { provider, clientInstance, getUserAddressMock } = buildProvider({
        configuredAccountIndex: null,
      });
      clientInstance.getAccountsByL1Address.mockImplementation(
        perAddressLookup(),
      );
      await provider.getAccountState(); // bind under A
      let releaseResponse: (value: unknown) => void = () => undefined;
      clientInstance.getAccountByIndex.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseResponse = resolve;
          }),
      );
      const delayedRead = provider.getAccountState();
      await new Promise((resolve) => setTimeout(resolve, 0));
      // External switch: nothing else observes it before the response lands.
      getUserAddressMock.mockReturnValue('0xbbbb');
      releaseResponse({ code: 200, accounts: [ACCOUNT] });
      const result = await delayedRead;
      // Cancelled → empty state, never account A's balances.
      expect(result.totalBalance).toBe('0');
    });

    it('a delayed cross margin metadata read never surfaces the old account', async () => {
      const { provider, clientInstance, getUserAddressMock } = buildProvider({
        configuredAccountIndex: null,
      });
      clientInstance.getAccountsByL1Address.mockImplementation(
        perAddressLookup(),
      );
      let releaseMetadata = (): void => undefined;
      let signalMetadataRead = (): void => undefined;
      const metadataReadStarted = new Promise<void>((resolve) => {
        signalMetadataRead = resolve;
      });
      const metadata = await clientInstance.getOrderBookDetails();
      clientInstance.getOrderBookDetails.mockImplementationOnce(
        async (): Promise<unknown> => {
          signalMetadataRead();
          return await new Promise((resolve) => {
            releaseMetadata = (): void => resolve(metadata);
          });
        },
      );
      const delayedRead = provider.getAccountState();
      await metadataReadStarted;
      getUserAddressMock.mockReturnValue('0xbbbb');
      releaseMetadata();
      const result = await delayedRead;
      expect(result.totalBalance).toBe('0');
      expect(result).not.toHaveProperty('crossMarginSummary');
    });

    it('getOpenOrders returns nothing when the account switches between index and token', async () => {
      const { provider, clientInstance, getUserAddressMock, bridge } =
        buildProvider({ configuredAccountIndex: null });
      clientInstance.getAccountsByL1Address.mockImplementation(
        perAddressLookup(),
      );
      await provider.getAccountState(); // bind under A
      // Stall the auth-token mint (the step between index and token use).
      const realImplementation = (
        bridge.execute as Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      let releaseToken: () => void = () => undefined;
      let stallOnce = true;
      (bridge.execute as Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          if (call.function === '_createAuthToken' && stallOnce) {
            stallOnce = false;
            await new Promise<void>((resolve) => {
              releaseToken = resolve;
            });
          }
          return realImplementation(call);
        },
      );
      const readUnderA = provider.getOpenOrders();
      await new Promise((resolve) => setTimeout(resolve, 0));
      getUserAddressMock.mockReturnValue('0xbbbb');
      releaseToken();
      const orders = await readUnderA;
      expect(orders).toStrictEqual([]);
      // The A index + fresh token pairing never reached the venue.
      expect(clientInstance.getActiveOrders).not.toHaveBeenCalled();
    });

    it("getOrders never merges one account's history with another's open orders", async () => {
      const { provider, clientInstance, getUserAddressMock } = buildProvider({
        configuredAccountIndex: null,
      });
      clientInstance.getAccountsByL1Address.mockImplementation(
        perAddressLookup(),
      );
      await provider.getAccountState(); // bind under A
      // Historical leg resolves under A; the OPEN leg stalls and the wallet
      // switches while it is in flight.
      let releaseOpen: (value: unknown) => void = () => undefined;
      clientInstance.getActiveOrders.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseOpen = resolve;
          }),
      );
      const mergedRead = provider.getOrders();
      await new Promise((resolve) => setTimeout(resolve, 0));
      getUserAddressMock.mockReturnValue('0xbbbb');
      releaseOpen({ code: 200, orders: [] });
      const orders = await mergedRead;
      // The merge is refused outright — no A-historical leakage.
      expect(orders).toStrictEqual([]);
    });

    it('a paused write never signs after ALL accounts are deselected', async () => {
      const { provider, clientInstance, getUserAddressMock, calls } =
        buildProvider({ configuredAccountIndex: null });
      clientInstance.getAccountsByL1Address.mockImplementation(
        perAddressLookup(),
      );
      const warmed = await provider.isReadyToTrade();
      expect(warmed.ready).toBe(true);
      // Warming registered the venue key; only post-deselection sends count.
      clientInstance.sendTx.mockClear();
      let releaseNonce: (value: unknown) => void = () => undefined;
      let nonceRequested: () => void = () => undefined;
      const noncePaused = new Promise<void>((resolve) => {
        nonceRequested = resolve;
      });
      clientInstance.getNextNonce.mockImplementationOnce(() => {
        nonceRequested();
        return new Promise((resolve) => {
          releaseNonce = resolve;
        });
      });
      const writeUnderA = provider.cancelOrder({
        orderId: '555',
        symbol: 'BTC',
      });
      await noncePaused;
      // All accounts deselected while the write is paused at its nonce.
      getUserAddressMock.mockImplementation(() => {
        throw new Error('NO_ACCOUNT_SELECTED');
      });
      releaseNonce({ code: 200, nonce: 42 });
      const result = await writeUnderA;
      expect(result.success).toBe(false);
      expect(
        calls.filter((call) => call.function === '_signCancelOrder'),
      ).toHaveLength(0);
      expect(clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it('a paused write never submits after provider disconnect', async () => {
      const { provider, clientInstance, calls } = buildProvider({
        configuredAccountIndex: null,
      });
      clientInstance.getAccountsByL1Address.mockImplementation(
        perAddressLookup(),
      );
      const warmed = await provider.isReadyToTrade();
      expect(warmed.ready).toBe(true);
      clientInstance.sendTx.mockClear();
      let releaseNonce: (value: unknown) => void = () => undefined;
      let nonceRequested: () => void = () => undefined;
      const noncePaused = new Promise<void>((resolve) => {
        nonceRequested = resolve;
      });
      clientInstance.getNextNonce.mockImplementationOnce(() => {
        nonceRequested();
        return new Promise((resolve) => {
          releaseNonce = resolve;
        });
      });
      const writeUnderA = provider.cancelOrder({
        orderId: '555',
        symbol: 'BTC',
      });
      await noncePaused;
      // The provider is disconnected (e.g. venue switch) mid-write.
      await provider.disconnect();
      releaseNonce({ code: 200, nonce: 42 });
      const result = await writeUnderA;
      expect(result.success).toBe(false);
      expect(
        calls.filter((call) => call.function === '_signCancelOrder'),
      ).toHaveLength(0);
      expect(clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it('a configured account index without a bound wallet requests no user channels', async () => {
      const { provider, getUserAddressMock } = buildProvider({
        webSocketCtor: fakeStreamCtor,
        configuredAccountIndex: 28,
      });
      // No wallet account selected at mount time.
      getUserAddressMock.mockImplementation(() => {
        throw new Error('NO_ACCOUNT_SELECTED');
      });
      StreamFakeWebSocket.instances = [];
      const unsubscribe = provider.subscribeToAccount({ callback: vi.fn() });
      await new Promise((resolve) => setTimeout(resolve, 0));
      const socket = StreamFakeWebSocket.instances[0];
      socket?.open();
      await new Promise((resolve) => setTimeout(resolve, 0));
      // The configured index alone must never subscribe user channels.
      expect(
        (socket?.sent ?? []).some((frame) => frame.includes('user_stats/')),
      ).toBe(false);

      // A NON-OWNER wallet is then selected: the configured account (owned
      // by 0x8d7f…) must be rejected, never subscribed for wallet 0xbbbb.
      getUserAddressMock.mockImplementation(() => '0xbbbb');
      await expect(provider.getAccountState()).rejects.toThrow(
        'not owned by the selected wallet',
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      const socketsAfterMismatch = StreamFakeWebSocket.instances.map(
        (instance) => instance.sent,
      );
      expect(
        socketsAfterMismatch
          .flat()
          .some((frame) => frame.includes('user_stats/')),
      ).toBe(false);

      // The OWNER wallet is selected: channels for the account appear.
      getUserAddressMock.mockImplementation(() => ACCOUNT.l1Address);
      await provider.getAccountState();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      const lastSocket =
        StreamFakeWebSocket.instances[StreamFakeWebSocket.instances.length - 1];
      lastSocket.open();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(
        lastSocket.sent.some((frame) => frame.includes('user_stats/28')),
      ).toBe(true);
      unsubscribe();
    });

    it("an aborted setup auth failure never blanks the new session's order subscribers", async () => {
      const { provider, clientInstance, getUserAddressMock, bridge } =
        buildProvider({
          webSocketCtor: fakeStreamCtor,
          configuredAccountIndex: null,
        });
      clientInstance.getAccountsByL1Address.mockImplementation(
        perAddressLookup(),
      );
      StreamFakeWebSocket.instances = [];
      const ordersCallback = vi.fn();
      // Stall then FAIL account A's auth-token mint.
      const realImplementation = (
        bridge.execute as Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      let failAuthA: () => void = () => undefined;
      let stallOnce = true;
      (bridge.execute as Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          if (call.function === '_createAuthToken' && stallOnce) {
            stallOnce = false;
            await new Promise<void>((_resolve, reject) => {
              failAuthA = (): void => reject(new Error('auth backend down'));
            });
          }
          return realImplementation(call);
        },
      );
      const unsubscribe = provider.subscribeToOrders({
        callback: ordersCallback,
      });
      await provider.getAccountState(); // bind under A; channel setup stalls at auth
      await new Promise((resolve) => setTimeout(resolve, 0));
      // Switch to B; its own setup runs with working auth.
      getUserAddressMock.mockReturnValue('0xbbbb');
      await provider.getAccountState();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      ordersCallback.mockClear();
      // A's stalled auth finally FAILS: its inner catch must not blank B.
      failAuthA();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(ordersCallback).not.toHaveBeenCalledWith([], expect.anything());
      expect(ordersCallback).not.toHaveBeenCalledWith([]);
      unsubscribe();
    });

    it('routes no account frame after an unobserved external switch', async () => {
      const { provider, clientInstance, getUserAddressMock } = buildProvider({
        webSocketCtor: fakeStreamCtor,
        configuredAccountIndex: null,
      });
      clientInstance.getAccountsByL1Address.mockImplementation(
        perAddressLookup(),
      );
      StreamFakeWebSocket.instances = [];
      const accountCallback = vi.fn();
      const unsubscribe = provider.subscribeToAccount({
        callback: accountCallback,
      });
      await provider.getAccountState(); // bind under A
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      const socketA =
        StreamFakeWebSocket.instances[StreamFakeWebSocket.instances.length - 1];
      socketA.open();
      await new Promise((resolve) => setTimeout(resolve, 0));
      accountCallback.mockClear();
      // EXTERNAL switch: no provider call observes it before the frame.
      getUserAddressMock.mockReturnValue('0xbbbb');
      socketA.onmessage?.({
        data: JSON.stringify({
          type: 'update/user_stats',
          channel: 'user_stats:28',
          stats: { portfolio_value: '9999', available_balance: '9999' },
        }),
      });
      // The frame itself is the first observer: it must be dropped, and
      // the rebind replaces the socket for account B.
      expect(accountCallback).toHaveBeenCalledWith(
        expect.objectContaining({ totalBalance: '0', providerId: 'lighter' }),
      );
      expect(accountCallback).not.toHaveBeenCalledWith(
        expect.objectContaining({ totalBalance: '9999' }),
      );
      const socketB =
        StreamFakeWebSocket.instances[StreamFakeWebSocket.instances.length - 1];
      expect(socketB).not.toBe(socketA);
      unsubscribe();
    });

    it('a deferred onopen auth continuation never reinserts a stale channel after a switch', async () => {
      const { provider, clientInstance, getUserAddressMock, bridge } =
        buildProvider({
          webSocketCtor: fakeStreamCtor,
          configuredAccountIndex: null,
        });
      clientInstance.getAccountsByL1Address.mockImplementation(
        perAddressLookup(),
      );
      StreamFakeWebSocket.instances = [];
      // Orders subscription wants the authenticated channel.
      const unsubscribe = provider.subscribeToOrders({ callback: vi.fn() });
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      const socketA =
        StreamFakeWebSocket.instances[StreamFakeWebSocket.instances.length - 1];
      // The channel setup cached a fresh (+600s) token; expire it so socket
      // A's onopen genuinely enters the deferred re-mint branch.
      // Restored in the finally below so a failed assertion cannot poison
      // later tests with a frozen clock.
      const nowSpy = vi
        .spyOn(Date, 'now')
        .mockReturnValue(Date.now() + 700_000);
      try {
        const realImplementation = (
          bridge.execute as Mock
        ).getMockImplementation() as (
          call: LighterWasmCall,
        ) => Promise<unknown>;
        let stallNext = true;
        let releaseToken: () => void = () => undefined;
        let stallEntered: () => void = () => undefined;
        const refreshEntered = new Promise<void>((resolve) => {
          stallEntered = resolve;
        });
        (bridge.execute as Mock).mockImplementation(
          async (call: LighterWasmCall) => {
            if (call.function === '_createAuthToken' && stallNext) {
              stallNext = false;
              stallEntered();
              await new Promise<void>((resolve) => {
                releaseToken = resolve;
              });
            }
            return realImplementation(call);
          },
        );
        socketA.open();
        // The deferred re-mint MUST have started, or this test proves nothing.
        await refreshEntered;
        await new Promise((resolve) => setTimeout(resolve, 0));
        // Switch to B: rebind replaces the socket and the channel set.
        getUserAddressMock.mockReturnValue('0xbbbb');
        await provider.getAccountState();
        const socketB =
          StreamFakeWebSocket.instances[
            StreamFakeWebSocket.instances.length - 1
          ];
        expect(socketB).not.toBe(socketA);
        socketB.open();
        await new Promise((resolve) => setTimeout(resolve, 0));
        const framesBefore = socketB.sent.length;
        // The stale continuation resolves AFTER the switch.
        releaseToken();
        await new Promise((resolve) => setTimeout(resolve, 0));
        await new Promise((resolve) => setTimeout(resolve, 0));
        // No account-A channel was sent on B's socket by the stale continuation.
        const framesAfter = socketB.sent.slice(framesBefore);
        expect(
          framesAfter.some((frame) => frame.includes('account_all_orders/28')),
        ).toBe(false);
        expect(
          socketB.sent.some((frame) => frame.includes('account_all_orders/28')),
        ).toBe(false);
        // The deferred mint really ran exactly once through the stall.
        expect(stallNext).toBe(false);
      } finally {
        nowSpy.mockRestore();
      }
      unsubscribe();
    });
  });

  describe('validateOrder usd sizing', () => {
    it('validates a USD-sized order through the min-size calculation', async () => {
      // Regression: this path read `usdAmount` outside its declaring block
      // (a runtime ReferenceError under plain TS) — a valid usdAmount with
      // a positive reference price must reach the min-size check and pass.
      const { provider } = buildProvider();
      const result = await provider.validateOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0',
        usdAmount: '5000',
        orderType: 'limit',
        price: '100000',
      });
      expect(result).toStrictEqual({ isValid: true });
    });

    it('rejects a USD-sized order below the venue minimum', async () => {
      const { provider } = buildProvider();
      const result = await provider.validateOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0',
        // $5 at $100k → 0.00005 BTC, below min base 0.0002.
        usdAmount: '5',
        orderType: 'limit',
        price: '100000',
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('below the Lighter minimum');
    });

    it('rejects an invalid usdAmount before any sizing math', async () => {
      const { provider } = buildProvider();
      const result = await provider.validateOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '1',
        usdAmount: '-5',
        orderType: 'limit',
        price: '100000',
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid usdAmount');
    });
  });

  describe('closePosition semantics', () => {
    it('leaves delegated placement failure reporting to the close service', async () => {
      const deps = createMockInfrastructure();
      const { provider, clientInstance } = buildProvider({
        platformDependencies: deps,
      });
      const logError = getLoggerErrorMock(deps);
      clientInstance.sendTx.mockRejectedValueOnce(
        new Error('Lighter close venue unavailable'),
      );

      const result = await provider.closePosition({ symbol: 'BTC' });

      expect(result).toMatchObject({
        success: false,
        error: 'Lighter close venue unavailable',
      });
      expect(logError).not.toHaveBeenCalled();
    });

    it('reports a failed flip placement exactly once through the service', async () => {
      const deps = createMockInfrastructure();
      const { provider, clientInstance } = buildProvider({
        platformDependencies: deps,
      });
      const service = new TradingService(deps);
      service.setControllerDependencies({
        rewardsIntegrationService: {
          resolveFee: async () => ({
            feeBips: 10,
            source: 'default',
            subscription: { eligible: false, reason: 'no-source' },
          }),
        } as never,
      });
      const logError = getLoggerErrorMock(deps);
      clientInstance.sendTx.mockRejectedValueOnce(
        new Error('Lighter flip venue unavailable'),
      );
      const position: Position = {
        symbol: 'BTC',
        size: '0.001',
        entryPrice: '100000',
        liquidationPrice: '50000',
        leverage: { type: 'cross', value: 1 },
        marginUsed: '100',
        maxLeverage: 20,
        positionValue: '100',
        returnOnEquity: '0',
        unrealizedPnl: '0',
        cumulativeFunding: { allTime: '0', sinceOpen: '0', sinceChange: '0' },
        takeProfitCount: 0,
        stopLossCount: 0,
      };

      const result = await service.flipPosition({
        provider,
        position,
        context: createMockServiceContext(),
      });

      expect(result).toMatchObject({
        success: false,
        error: 'Lighter flip venue unavailable',
      });
      expect(logError).toHaveBeenCalledTimes(1);
      const [[reportedError, reportedOptions]] = logError.mock.calls;
      if (!reportedOptions) {
        throw new Error('Expected flip error context');
      }
      expect(reportedError.message).toBe('Lighter flip venue unavailable');
      expect(reportedOptions.tags).toMatchObject({
        operation: 'position_management',
        action: 'flip_position',
      });
      expect(reportedOptions.context).toMatchObject({
        name: 'TradingService',
        data: { method: 'flipPosition' },
      });
    });

    it('routes a limit close with the requested price, not a market order', async () => {
      const { provider, calls } = buildProvider();
      const result = await provider.closePosition({
        symbol: 'BTC',
        size: '0.05',
        orderType: 'limit',
        price: '120000',
      });
      expect(result.success).toBe(true);
      const orderCall = calls.find(
        (call) => call.function === '_signCreateOrder',
      );
      // Limit type (0), GTT, and the requested price scaled by decimals.
      expect(orderCall?.params[6]).toBe(0);
      expect(orderCall?.params[4]).toBe('1200000');
      expect(orderCall?.params[8]).toBe(1);
    });

    it('rejects a limit close without a price', async () => {
      const { provider } = buildProvider();
      const result = await provider.closePosition({
        symbol: 'BTC',
        orderType: 'limit',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('requires a price');
    });

    it('honors usdAmount sizing and slippage on a market close', async () => {
      const { provider, calls } = buildProvider();
      const result = await provider.closePosition({
        symbol: 'BTC',
        usdAmount: '5000',
        maxSlippageBps: 100,
        priceAtCalculation: 100000,
      });
      expect(result.success).toBe(true);
      const orderCall = calls.find(
        (call) => call.function === '_signCreateOrder',
      );
      // usdAmount / fresh reference (100000) = 0.05 → sized at reference,
      // not at the protection price.
      expect(orderCall?.params[3]).toBe('5000');
      // Sell-side protection price offset by 1% (100 bps): 99000.
      expect(orderCall?.params[4]).toBe('990000');
    });

    it('refuses drifted market closes beyond the slippage tolerance', async () => {
      const { provider } = buildProvider();
      const result = await provider.closePosition({
        symbol: 'BTC',
        usdAmount: '5000',
        maxSlippageBps: 100,
        // Fresh venue price is 100000; a 90000 snapshot is >1% away.
        priceAtCalculation: 90000,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('slippage tolerance');
    });
  });

  describe('history and routes', () => {
    it('getOrders merges open orders with the historical lifecycle', async () => {
      const { provider, clientInstance } = buildProvider();
      const orders = await provider.getOrders();
      expect(clientInstance.getInactiveOrders).toHaveBeenCalled();
      expect(orders.map((order) => order.status)).toStrictEqual([
        'open',
        'filled',
      ]);
    });

    it('getUserHistory maps deposits and withdrawals with venue statuses', async () => {
      const { provider } = buildProvider();
      const history = await provider.getUserHistory();
      expect(history).toHaveLength(2);
      expect(history[0]).toMatchObject({
        type: 'withdrawal',
        amount: '1.000000',
        status: 'pending',
        asset: 'USDC',
      });
      expect(history[1]).toMatchObject({
        type: 'deposit',
        amount: '10000.000000',
        status: 'completed',
      });
    });

    it('getUserNonFundingLedgerUpdates merges signed flows newest first', async () => {
      const { provider } = buildProvider();
      const updates = await provider.getUserNonFundingLedgerUpdates();
      expect(updates.map((update) => update.delta.type)).toStrictEqual([
        'transferOut',
        'withdraw',
        'deposit',
      ]);
      expect(updates[0].delta.usdc).toBe('-100.000000');
      expect(updates[1].delta.usdc).toBe('-1.000000');
      expect(updates[2].delta.usdc).toBe('10000.000000');
    });

    it('rejects unknown transfer types through the public ledger path', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getTransferHistory.mockResolvedValue({
        code: 200,
        transfers: [
          {
            id: 'bad-transfer',
            assetId: 3,
            amount: '100.000000',
            fee: '0.000000',
            timestamp: 1700000004000,
            type: 'L2TransferRebate',
            fromL1Address: ACCOUNT.l1Address,
            toL1Address: ACCOUNT.l1Address,
            fromAccountIndex: 28,
            toAccountIndex: 999,
            txHash: '0xbad',
          },
        ],
      });

      await expect(provider.getUserNonFundingLedgerUpdates()).rejects.toThrow(
        'Invalid Lighter venue data',
      );
    });

    it('rethrows venue integrity failures from every financial-history API', async () => {
      const integrityError = new Error(
        'Invalid Lighter venue data: malformed financial history',
      );

      const funding = buildProvider();
      funding.clientInstance.getPositionFundings.mockRejectedValue(
        integrityError,
      );
      await expect(funding.provider.getFunding()).rejects.toThrow(
        'Invalid Lighter venue data',
      );

      const ledger = buildProvider();
      ledger.clientInstance.getDepositHistory.mockRejectedValue(integrityError);
      await expect(
        ledger.provider.getUserNonFundingLedgerUpdates(),
      ).rejects.toThrow('Invalid Lighter venue data');

      const history = buildProvider();
      history.clientInstance.getWithdrawHistory.mockRejectedValue(
        integrityError,
      );
      await expect(history.provider.getUserHistory()).rejects.toThrow(
        'Invalid Lighter venue data',
      );
    });

    it('honors fill limit, time range, symbol, and selected-account contracts', async () => {
      const { provider, clientInstance } = buildProvider();
      const matchingTrade = {
        tradeId: 1,
        txHash: '0xtrade',
        type: 'trade',
        marketId: 1,
        size: '0.1',
        price: '90000',
        usdAmount: '9000',
        askId: 10,
        bidId: 11,
        askAccountId: 99,
        bidAccountId: 28,
        isMakerAsk: false,
        timestamp: 1700000000000,
        askAccountPnl: '0',
        bidAccountPnl: '0',
        takerPositionSizeBefore: '0',
        makerPositionSizeBefore: '0',
        takerPositionSignChanged: true,
        makerPositionSignChanged: true,
      };
      clientInstance.getTrades
        .mockResolvedValueOnce({
          code: 200,
          nextCursor: 'page-2',
          trades: [{ ...matchingTrade, tradeId: 2, timestamp: 1700000001000 }],
        })
        .mockResolvedValue({ code: 200, trades: [matchingTrade] });

      expect(
        await provider.getOrderFills({
          startTime: 1699999999999,
          endTime: 1700000000001,
          limit: 7,
        }),
      ).toHaveLength(1);
      expect(clientInstance.getTrades).toHaveBeenCalledWith(
        28,
        expect.any(String),
        { limit: 100, cursor: 'page-2', marketId: undefined },
      );
      expect(
        await provider.getOrderFills({ startTime: 1700000000001 }),
      ).toStrictEqual([]);
      expect(await provider.getOrFetchFills({ symbol: 'ETH' })).toStrictEqual(
        [],
      );

      await expect(
        provider.getOrderFills({
          user: '0x0000000000000000000000000000000000000001',
        }),
      ).rejects.toThrow('selected wallet');
      await expect(
        provider.getOrderFills({ aggregateByTime: true }),
      ).rejects.toThrow('aggregateByTime');
    });

    it('continues fill pagination across pages sharing the start-time boundary', async () => {
      const { provider, clientInstance } = buildProvider();
      const boundaryTrade = {
        tradeId: 1,
        txHash: '0xtrade',
        type: 'trade',
        marketId: 1,
        size: '0.1',
        price: '90000',
        usdAmount: '9000',
        askId: 10,
        bidId: 11,
        askAccountId: 99,
        bidAccountId: 28,
        isMakerAsk: false,
        timestamp: 1700000000000,
        askAccountPnl: '0',
        bidAccountPnl: '0',
        takerPositionSizeBefore: '0',
        makerPositionSizeBefore: '0',
        takerPositionSignChanged: true,
        makerPositionSignChanged: true,
      };
      clientInstance.getTrades
        .mockResolvedValueOnce({
          code: 200,
          nextCursor: 'same-timestamp',
          trades: [boundaryTrade],
        })
        .mockResolvedValueOnce({
          code: 200,
          trades: [{ ...boundaryTrade, tradeId: 2 }],
        });

      const fills = await provider.getOrderFills({
        startTime: boundaryTrade.timestamp,
      });
      expect(fills.map((fill) => fill.orderId)).toStrictEqual(['11', '11']);
      expect(clientInstance.getTrades).toHaveBeenCalledTimes(2);
    });

    it('surfaces fill-history transport and authentication failures', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getTrades.mockRejectedValue(new Error('auth expired'));
      await expect(provider.getOrderFills()).rejects.toThrow('auth expired');
      await expect(provider.getOrFetchFills()).rejects.toThrow('auth expired');
    });

    it('suppresses deposits until the Lighter bridge call is implemented; withdrawals remain mainnet-only', () => {
      // Testnet settles on the venue-hosted devnet chain 123456 that the
      // wallet cannot reach: advertising it made mobile pay-with flows
      // build a deposit transaction on an unknown chain and fail the
      // trade ("Invalid chain ID 0x1e240" — found in device validation).
      const { provider } = buildProvider();
      expect(provider.getDepositRoutes()).toStrictEqual([]);
      expect(provider.getWithdrawalRoutes()).toStrictEqual([]);
      // A caller hint must never override the provider's venue network:
      // DepositService currently asks for mainnet routes, and advertising
      // one here would fund mainnet while trading remains on testnet.
      expect(provider.getDepositRoutes({ isTestnet: false })).toStrictEqual([]);
      expect(provider.getWithdrawalRoutes({ isTestnet: false })).toStrictEqual(
        [],
      );

      const { provider: mainnetProvider } = buildProvider({
        isTestnet: false,
      });
      expect(mainnetProvider.getDepositRoutes()).toStrictEqual([]);
      const [mainnetRoute] = mainnetProvider.getWithdrawalRoutes();
      expect(mainnetRoute.chainId).toBe('eip155:1');
      expect(mainnetRoute.contractAddress).toBe(
        '0x3B4D794a66304F130a4Db8F2551B0070dfCf5ca7',
      );
      expect(mainnetRoute.assetId).toContain(
        'erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      );
      expect(
        mainnetProvider.getDepositRoutes({ isTestnet: true }),
      ).toStrictEqual([]);
    });
  });

  describe('stubs', () => {
    it('returns not-supported results for unimplemented writes', async () => {
      const { provider } = buildProvider();
      const results = await Promise.all([
        provider.editOrder({} as never),
        provider.closePosition({} as never),
        provider.updatePositionTPSL({} as never),
        provider.updateMargin({} as never),
        provider.withdraw({} as never),
      ]);
      for (const result of results) {
        expect(result.success).toBe(false);
      }
      // Batch operations are deliberately absent (optional interface
      // members) so the controller falls back to per-item calls.
      const optionalBatch = provider as unknown as Record<string, unknown>;
      expect(optionalBatch.cancelOrders).toBeUndefined();
      expect(optionalBatch.closePositions).toBeUndefined();
    });

    it('gates the historical portfolio instead of returning false zeros', async () => {
      const { provider } = buildProvider();
      await expect(provider.getHistoricalPortfolio()).rejects.toThrow(
        'unavailable',
      );
    });

    it('validates only simple limit/market orders', async () => {
      const { provider } = buildProvider();
      expect(
        await provider.validateOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit',
          price: '90000',
        }),
      ).toStrictEqual({ isValid: true });
      expect(
        await provider.validateOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit',
        }),
      ).toMatchObject({ isValid: false });
      expect(await provider.validateDeposit({} as never)).toMatchObject({
        isValid: false,
      });
      expect(await provider.validateClosePosition({} as never)).toMatchObject({
        isValid: false,
      });
      expect(await provider.validateWithdrawal({} as never)).toMatchObject({
        isValid: false,
      });
    });

    it('derives estimates instead of returning false zeros', async () => {
      const { provider } = buildProvider();
      await expect(
        provider.calculateMaintenanceMargin({ asset: 'UNKNOWN' }),
      ).rejects.toThrow('maintenance margin metadata unavailable');
      // The liquidation preview uses the ISOLATED formula when the caller
      // requests (or omits) that supported mode, with the venue's own
      // maintenance fraction:
      // BTC fixture maintenance 120 hundredths of a percent -> 1.2%.
      // long: 100 - (0.1 - 0.012)*100/(1 - 0.012) = 91.0931...
      expect(
        parseFloat(
          await provider.calculateLiquidationPrice({
            entryPrice: 100,
            leverage: 10,
            direction: 'long',
            asset: 'BTC',
          }),
        ),
      ).toBeCloseTo(91.0931, 3);
      // short: 100 + (0.1 - 0.012)*100/(1 + 0.012) = 108.6956...
      expect(
        parseFloat(
          await provider.calculateLiquidationPrice({
            entryPrice: 100,
            leverage: 10,
            direction: 'short',
            asset: 'BTC',
          }),
        ),
      ).toBeCloseTo(108.6957, 3);
      await expect(
        provider.calculateLiquidationPrice({
          entryPrice: 100,
          leverage: 10,
          direction: 'long',
          asset: 'UNKNOWN',
        }),
      ).rejects.toThrow('maintenance margin metadata unavailable');
      // Malformed inputs report the explicit zero contract.
      expect(
        await provider.calculateLiquidationPrice({
          entryPrice: 0,
          leverage: 10,
          direction: 'long',
        }),
      ).toBe('0.00');
      await expect(
        provider.calculateLiquidationPrice({
          entryPrice: 100,
          leverage: 10,
          direction: 'long',
          marginType: 'cross',
          asset: 'BTC',
        }),
      ).rejects.toThrow('cross-margin liquidation previews');
      expect(await provider.getMaxLeverage('BTC')).toBeGreaterThan(0);
      await expect(provider.getMaxLeverage('UNKNOWN')).rejects.toThrow(
        'margin metadata unavailable',
      );
      // Fee rates come from the venue's per-market metadata (currently 0).
      const fees = await provider.calculateFees({
        orderType: 'market',
        symbol: 'BTC',
        amount: '100',
      });
      expect(fees.protocolFeeRate).toBe(parseFloat(BTC_MARKET.takerFee));
      expect(fees.feeAmount).toBe(100 * parseFloat(BTC_MARKET.takerFee));
      expect(await provider.previewPositionModify({} as never)).toStrictEqual({
        status: 'unsupported',
        reason: 'provider',
      });
    });

    it('returns immediate empty snapshots from subscriptions', async () => {
      const { provider } = buildProvider();
      const callback = vi.fn();
      // No `as never` here: force-casting subscription params is exactly
      // what hid the missing required `symbol` on subscribeToOrderBook and
      // the bare-level order book payload defect.
      const unsubscribers = [
        provider.subscribeToPrices({ symbols: ['BTC'], callback }),
        provider.subscribeToPositions({ callback }),
        provider.subscribeToOrderFills({ callback }),
        provider.subscribeToOrders({ callback }),
        provider.subscribeToAccount({ callback }),
        provider.subscribeToOICaps({ callback }),
        provider.subscribeToCandles({
          symbol: 'BTC',
          interval: '1h',
          callback,
        }),
        provider.subscribeToOrderBook({ symbol: 'BTC', callback }),
      ];
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(callback).toHaveBeenCalled();
      for (const unsubscribe of unsubscribers) {
        expect(() => unsubscribe()).not.toThrow();
      }
      expect(() => provider.setLiveDataConfig({})).not.toThrow();
    });

    it('returns an explorer URL', () => {
      const { provider } = buildProvider();
      expect(provider.getBlockExplorerUrl('0xabc')).toContain('/address/0xabc');
      expect(provider.getBlockExplorerUrl()).toMatch(/^https:/u);
    });
  });
});
