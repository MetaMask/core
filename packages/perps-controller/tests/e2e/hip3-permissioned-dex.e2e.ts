import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type { MockAnyNamespace } from '@metamask/messenger';
/**
 * Permissioned HIP-3 dex proof on HyperLiquid testnet (`ignp` by default).
 *
 * Drives PerpsController through its public API the way a client does: real
 * messenger, HIP-3 enabled through `clientConfig`, signing with a recipe
 * wallet-fixture account. Only the testnet API is reachable; every request to
 * `/exchange` and its raw response is recorded as evidence.
 *
 * Usage (from the Core checkout root):
 *   npx tsx packages/perps-controller/tests/e2e/hip3-permissioned-dex.e2e.ts \
 *     --phase=reads|markets|open|trade|global-order|isolation \
 *     [--account=dev1] [--index=0] [--dex=ignp] [--market=BTC] --out=FILE
 *
 * Each phase writes one JSON report with an `ok` field and exits non-zero when
 * it is false.
 */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import type { LocalAccount } from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';

import { HYPERLIQUID_TWAP_LIMITS } from '../../src/constants/perpsConfig.js';
import { PerpsController } from '../../src/PerpsController.js';
import type {
  PerpsControllerActions,
  PerpsControllerEvents,
} from '../../src/PerpsController.js';
import type {
  OrderParams,
  OrderResult,
  PerpsPlatformDependencies,
} from '../../src/types/index.js';
import type {
  PerpsControllerAllowedActions,
  PerpsControllerAllowedEvents,
} from '../../src/types/messenger.js';
import { calculateHip3AssetId } from '../../src/utils/hyperLiquidAdapter.js';

type Json = Record<string, unknown>;

const API = 'https://api.hyperliquid-testnet.xyz';
const ORDER_NOTIONAL_USD = 12;
const ORDER_LEVERAGE = 3;
const FILL_WAIT_MS = 75_000;

const { values } = parseArgs({
  options: {
    phase: { type: 'string' },
    account: { type: 'string', default: 'dev1' },
    index: { type: 'string', default: '0' },
    dex: { type: 'string', default: 'ignp' },
    market: { type: 'string', default: 'BTC' },
    wallets: { type: 'string', default: '' },
    out: { type: 'string' },
  },
});
assert(values.out, 'Missing --out');
assert(values.phase, 'Missing --phase');
const dex = String(values.dex);
const symbol = `${dex}:${String(values.market)}`;

/**
 * POST to the testnet info endpoint.
 *
 * @param body - Info request body.
 * @returns The parsed response.
 */
async function info<Result = unknown>(body: Json): Promise<Result> {
  const response = await fetch(`${API}/info`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert(response.ok, `info ${String(body.type)} returned ${response.status}`);
  return (await response.json()) as Result;
}

/**
 * Derive a signer from the recipe harness wallet fixture without printing it.
 *
 * @param name - Fixture account name.
 * @param index - BIP-44 address index for mnemonic accounts.
 * @returns The viem account.
 */
async function fixtureSigner(
  name: string,
  index: number,
): Promise<LocalAccount> {
  const fixture = JSON.parse(
    await readFile('temp/recipe/runtime/wallet-fixture.json', 'utf8'),
  ) as { accounts?: { name?: string; type?: string; value?: string }[] };
  const entry = fixture.accounts?.find((item) => item.name === name);
  assert(entry?.value, `wallet fixture has no account named "${name}"`);
  if (entry.type === 'mnemonic') {
    return mnemonicToAccount(entry.value.trim(), { addressIndex: index });
  }
  const raw = entry.value.trim();
  return privateKeyToAccount(
    (raw.startsWith('0x') ? raw : `0x${raw}`) as `0x${string}`,
  );
}

const noop = (): undefined => undefined;
const controllerErrors: string[] = [];
const infrastructure: PerpsPlatformDependencies = {
  logger: {
    error: (error) => {
      controllerErrors.push(
        error instanceof Error ? error.message : String(error),
      );
    },
  },
  debugLogger: { log: noop },
  metrics: { isEnabled: () => false, trackPerpsEvent: noop },
  performance: { now: () => performance.now() },
  tracer: {
    trace: noop,
    endTrace: noop,
    setMeasurement: noop,
    addBreadcrumb: noop,
  },
  streamManager: {
    pauseChannel: noop,
    resumeChannel: noop,
    clearAllChannels: noop,
  },
  featureFlags: { validateVersionGated: () => undefined },
  marketDataFormatters: {
    formatVolume: String,
    formatPerpsFiat: String,
    formatPercentage: String,
    priceRangesUniversal: [],
  },
  cacheInvalidator: { invalidate: noop, invalidateAll: noop },
  diskCache: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
  rewards: { getPerpsDiscountForAccount: async () => null },
};

/**
 * Build a testnet PerpsController for one fixture account, HIP-3 enabled.
 *
 * @param signer - The account that signs.
 * @returns The controller.
 */
function buildController(signer: LocalAccount): PerpsController {
  const root = new Messenger<
    MockAnyNamespace,
    PerpsControllerActions | PerpsControllerAllowedActions,
    PerpsControllerEvents | PerpsControllerAllowedEvents
  >({ namespace: MOCK_ANY_NAMESPACE });
  const messenger = new Messenger<
    'PerpsController',
    PerpsControllerActions | PerpsControllerAllowedActions,
    PerpsControllerEvents | PerpsControllerAllowedEvents,
    typeof root
  >({ namespace: 'PerpsController', parent: root });
  root.registerActionHandler('AccountsController:getSelectedAccount', () => ({
    id: 'hip3-permissioned-dex-proof',
    address: signer.address,
    type: 'eip155:eoa',
    metadata: {
      name: 'proof',
      importTime: 0,
      keyring: { type: 'HD Key Tree' },
    },
    options: {},
    methods: [],
    scopes: ['eip155:0'],
  }));
  // No remote flags: HIP-3 comes from the clientConfig fallback below.
  root.registerActionHandler('RemoteFeatureFlagController:getState', () => ({
    remoteFeatureFlags: {},
    cacheTimestamp: 0,
  }));
  root.registerActionHandler('KeyringController:getState', () => ({
    isUnlocked: true,
    keyrings: [],
  }));
  root.registerActionHandler(
    'KeyringController:signTypedMessage',
    async (params: { from: string; data: unknown }) => {
      assert.equal(params.from.toLowerCase(), signer.address.toLowerCase());
      const typed = (
        typeof params.data === 'string' ? JSON.parse(params.data) : params.data
      ) as { types: Json } & Json;
      // viem derives the domain type itself and rejects a duplicate entry.
      const { EIP712Domain: _domainType, ...types } = typed.types;
      return signer.signTypedData({
        ...typed,
        types,
      } as Parameters<LocalAccount['signTypedData']>[0]);
    },
  );
  root.delegate({
    actions: [
      'AccountsController:getSelectedAccount',
      'RemoteFeatureFlagController:getState',
      'KeyringController:getState',
      'KeyringController:signTypedMessage',
    ],
    messenger,
  });
  return new PerpsController({
    messenger,
    state: { isTestnet: true },
    clientConfig: {
      fallbackHip3Enabled: true,
      fallbackHip3AllowlistMarkets: [],
    },
    infrastructure,
    deferEligibilityCheck: true,
  });
}

// Every /exchange request the controller sends, with the venue's raw reply.
const exchangeLog: { action: Json; response: unknown }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init): Promise<Response> => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  assert(
    !url.hostname.endsWith('hyperliquid.xyz') ||
      url.hostname.includes('testnet'),
    `Mainnet request refused: ${url.href}`,
  );
  if (request.method !== 'POST' || !url.pathname.endsWith('/exchange')) {
    return realFetch(request);
  }
  const body = (await request.clone().json()) as { action: Json };
  const response = await realFetch(request);
  exchangeLog.push({
    action: body.action,
    response: await response.clone().json(),
  });
  return response;
};

/**
 * Current mid price for a market from the venue.
 *
 * @param coin - Venue coin name.
 * @returns The mid price.
 */
async function midPrice(coin: string): Promise<number> {
  const coinDex = coin.includes(':') ? coin.split(':')[0] : '';
  const mids = await info<Record<string, string>>({
    type: 'allMids',
    dex: coinDex,
  });
  const mid = Number(mids[coin]);
  assert(Number.isFinite(mid) && mid > 0, `No mid price for ${coin}`);
  return mid;
}

/**
 * Market order params for a small notional.
 *
 * @param coin - Market symbol.
 * @param isBuy - Side.
 * @param extra - Extra order fields.
 * @returns Order params.
 */
async function orderParams(
  coin: string,
  isBuy: boolean,
  extra: Partial<OrderParams> = {},
): Promise<OrderParams> {
  const price = await midPrice(coin);
  return {
    symbol: coin,
    isBuy,
    orderType: 'market',
    size: (ORDER_NOTIONAL_USD / price).toString(),
    usdAmount: String(ORDER_NOTIONAL_USD),
    currentPrice: price,
    priceAtCalculation: price,
    leverage: ORDER_LEVERAGE,
    maxSlippageBps: 300,
    ...extra,
  };
}

/**
 * Venue state for one wallet.
 *
 * @param user - Wallet address.
 * @returns Star state, abstraction, spot and per-dex clearinghouse reads.
 */
async function walletState(user: string): Promise<Json> {
  const [star, abstraction, spot, main, hip3] = await Promise.all([
    info({ type: 'userStarState', user }),
    info({ type: 'userAbstraction', user }),
    info<{ balances: Json[] }>({ type: 'spotClearinghouseState', user }),
    info<Json>({ type: 'clearinghouseState', user }),
    info<Json>({ type: 'clearinghouseState', user, dex }),
  ]);
  return {
    user,
    userStarState: star,
    userAbstraction: abstraction,
    spotBalances: spot.balances,
    mainDex: {
      marginSummary: main.marginSummary,
      assetPositions: main.assetPositions,
    },
    [dex]: {
      marginSummary: hip3.marginSummary,
      assetPositions: hip3.assetPositions,
    },
  };
}

/**
 * Public reads: the dex entry, its asset ids and each wallet's star state.
 *
 * @returns Phase report.
 */
async function readsPhase(): Promise<Json> {
  const perpDexs = await info<(Json | null)[]>({ type: 'perpDexs' });
  const perpDexIndex = perpDexs.findIndex((entry) => entry?.name === dex);
  assert(perpDexIndex > 0, `${dex} is not in perpDexs`);
  const meta = await info<{ universe: Json[]; collateralToken: number }>({
    type: 'meta',
    dex,
  });
  const assets = meta.universe.map((asset, indexInMeta) => ({
    name: asset.name,
    indexInMeta,
    assetId: calculateHip3AssetId(perpDexIndex, indexInMeta),
    venueFormulaAssetId: 100000 + perpDexIndex * 10000 + indexInMeta,
    maxLeverage: asset.maxLeverage,
    marginMode: asset.marginMode ?? 'normal',
    isDelisted: asset.isDelisted ?? false,
  }));
  const wallets = await Promise.all(
    String(values.wallets)
      .split(',')
      .filter(Boolean)
      .map(async (user) => walletState(user)),
  );
  const starFields = new Set(
    wallets.flatMap((wallet) =>
      (
        (wallet.userStarState as { dexToState: [string, Json][] }).dexToState ??
        []
      ).flatMap(([, state]) => Object.keys(state)),
    ),
  );
  return {
    ok:
      assets.length > 0 &&
      assets.every((asset) => asset.assetId === asset.venueFormulaAssetId),
    dex,
    perpDexIndex,
    perpDexEntry: perpDexs[perpDexIndex],
    collateralToken: meta.collateralToken,
    assets,
    wallets,
    userStarStateFields: [...starFields],
  };
}

/**
 * Controller market load for the dex.
 *
 * @param controller - The controller.
 * @returns Phase report.
 */
async function marketsPhase(controller: PerpsController): Promise<Json> {
  const meta = await info<{ universe: Json[] }>({ type: 'meta', dex });
  const expected = meta.universe
    .filter((asset) => !asset.isDelisted)
    .map((asset) => String(asset.name));
  const markets = await controller.getMarkets();
  const loaded = markets
    .filter((market) => market.name.startsWith(`${dex}:`))
    .map((market) => ({
      name: market.name,
      szDecimals: market.szDecimals,
      maxLeverage: market.maxLeverage,
    }));
  const missing = expected.filter(
    (name) => !loaded.some((market) => market.name === name),
  );
  return { ok: missing.length === 0, dex, expected, loaded, missing };
}

/**
 * Wire-level summary of the orders the controller sent.
 *
 * @returns Asset ids, builder field and raw responses per exchange call.
 */
function wireOrders(): Json[] {
  return exchangeLog.map(({ action, response }) => ({
    type: action.type,
    assetIds: Array.isArray(action.orders)
      ? (action.orders as Json[]).map((order) => order.a)
      : [action.asset, (action.twap as Json | undefined)?.a].filter(
          (asset) => asset !== undefined,
        ),
    builder: action.builder,
    response,
  }));
}

/**
 * Open attempt; the report carries the venue's raw reply.
 *
 * @param controller - The controller.
 * @returns Phase report.
 */
async function openPhase(controller: PerpsController): Promise<Json> {
  const result = await controller.placeOrder(await orderParams(symbol, true));
  // The venue refuses either the whole action (`status: 'err'`) or one order
  // inside an `ok` batch (`statuses[i].error`).
  const venueErrors = exchangeLog.flatMap(({ response }) => {
    const reply = response as {
      status?: string;
      response?: string | { data?: { statuses?: Json[] } };
    };
    if (reply.status === 'err') {
      return [
        typeof reply.response === 'string'
          ? reply.response
          : JSON.stringify(reply.response),
      ];
    }
    const statuses =
      typeof reply.response === 'object'
        ? (reply.response.data?.statuses ?? [])
        : [];
    return statuses
      .map((status) => status.error)
      .filter((error): error is string => typeof error === 'string');
  });
  return {
    ok: result.success !== true && venueErrors.length > 0,
    symbol,
    controllerResult: result,
    venueErrors,
    exchange: wireOrders(),
  };
}

/**
 * Wait until the venue reports fills for this wallet after a time.
 *
 * @param user - Wallet address.
 * @param since - Start time in ms.
 * @param minimum - Fills to wait for.
 * @returns The fills.
 */
async function fillsSince(
  user: string,
  since: number,
  minimum = 1,
): Promise<Json[]> {
  const deadline = Date.now() + FILL_WAIT_MS;
  for (;;) {
    const fills = (
      await info<Json[]>({ type: 'userFillsByTime', user, startTime: since })
    ).filter((fill) => fill.coin === symbol);
    if (fills.length >= minimum || Date.now() > deadline) {
      return fills;
    }
    await sleep(3_000);
  }
}

/**
 * Run one trade step and keep its outcome.
 *
 * @param steps - Step log.
 * @param name - Step name.
 * @param run - Step body.
 */
async function step(
  steps: Json[],
  name: string,
  run: () => Promise<Json>,
): Promise<void> {
  const exchangeBefore = exchangeLog.length;
  try {
    steps.push({ name, ok: true, ...(await run()) });
  } catch (error) {
    steps.push({
      name,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const last = steps[steps.length - 1];
  last.exchange = wireOrders().slice(exchangeBefore);
}

/**
 * Require a successful controller result.
 *
 * @param result - Order result.
 * @returns The result.
 */
function succeeded(result: OrderResult): OrderResult {
  assert.equal(result.success, true, result.error ?? 'order failed');
  return result;
}

/**
 * Close this phase's position and cancel its orders on the market.
 *
 * @param controller - The controller.
 * @returns What was cleaned up.
 */
async function cleanup(controller: PerpsController): Promise<Json> {
  const open = (await controller.getOpenOrders()).filter(
    (order) => order.symbol === symbol,
  );
  for (const order of open) {
    await controller.cancelOrder({ orderId: order.orderId, symbol });
  }
  const position = (await controller.getPositions()).find(
    (item) => item.symbol === symbol,
  );
  const close = position
    ? await controller.closePosition({ symbol })
    : undefined;
  return { cancelled: open.map((order) => order.orderId), close };
}

/**
 * Allowlisted wallet: open, TP/SL, close, scale, TWAP and chase on the dex.
 *
 * @param controller - The controller.
 * @param user - Wallet address.
 * @returns Phase report.
 */
async function tradePhase(
  controller: PerpsController,
  user: string,
): Promise<Json> {
  const start = Date.now();
  const before = await walletState(user);
  // Cleanup closes the whole position on the market, so never start on one
  // the wallet already holds.
  const existing = (await controller.getPositions()).find(
    (item) => item.symbol === symbol,
  );
  assert(!existing, `${user} already holds ${symbol}; pick another --market`);
  const steps: Json[] = [];

  await step(steps, 'open-with-tpsl', async () => {
    const mid = await midPrice(symbol);
    const result = succeeded(
      await controller.placeOrder(
        await orderParams(symbol, true, {
          takeProfitPrice: String(Math.round(mid * 1.5)),
          stopLossPrice: String(Math.round(mid * 0.6)),
        }),
      ),
    );
    const triggers = (await controller.getOpenOrders()).filter(
      (order) => order.symbol === symbol && order.isTrigger,
    );
    assert(triggers.length >= 2, `expected TP and SL, got ${triggers.length}`);
    return {
      orderId: result.orderId,
      filledSize: result.filledSize,
      averagePrice: result.averagePrice,
      triggers: triggers.map((order) => ({
        orderId: order.orderId,
        detailedOrderType: order.detailedOrderType,
        triggerPrice: order.triggerPrice,
      })),
    };
  });
  await step(steps, 'close', async () => {
    const result = succeeded(await controller.closePosition({ symbol }));
    return { orderId: result.orderId, filledSize: result.filledSize };
  });
  await step(steps, 'cancel-leftover-tpsl', async () => cleanup(controller));

  await step(steps, 'scale', async () => {
    const mid = await midPrice(symbol);
    const result = succeeded(
      await controller.placeOrder({
        ...(await orderParams(symbol, true)),
        orderType: 'scale',
        usdAmount: String(ORDER_NOTIONAL_USD * 2),
        size: ((ORDER_NOTIONAL_USD * 2) / mid).toString(),
        scaleMinPrice: String(Math.round(mid * 0.9)),
        scaleMaxPrice: String(Math.round(mid * 0.95)),
        scaleNumOrders: 2,
        maxSlippageBps: undefined,
      }),
    );
    const cancel = await controller.cancelOrder({
      orderId: String(result.orderId),
      symbol,
      orderType: 'scale',
    });
    return {
      handle: result.orderId,
      childOrderIds: result.childOrderIds,
      cancel,
    };
  });

  await step(steps, 'twap', async () => {
    const twapStart = Date.now();
    const mid = await midPrice(symbol);
    const usdAmount = HYPERLIQUID_TWAP_LIMITS.MinNotionalUsd + 5;
    const market = (await controller.getMarkets()).find(
      (item) => item.name === symbol,
    );
    const result = succeeded(
      await controller.placeOrder({
        ...(await orderParams(symbol, true)),
        orderType: 'twap',
        usdAmount: String(usdAmount),
        size: (usdAmount / mid).toString(),
        leverage: market?.maxLeverage ?? ORDER_LEVERAGE,
        twapDuration: HYPERLIQUID_TWAP_LIMITS.MinDurationMinutes,
        maxSlippageBps: undefined,
      }),
    );
    // TWAP slices are reported by their own endpoint, not userFillsByTime.
    let sliceFills: Json[] = [];
    while (sliceFills.length === 0 && Date.now() < twapStart + FILL_WAIT_MS) {
      await sleep(5_000);
      sliceFills = (
        await info<{ fill: Json; twapId: number }[]>({
          type: 'userTwapSliceFills',
          user,
        })
      )
        .filter((slice) => String(slice.twapId) === result.orderId)
        .map((slice) => slice.fill);
    }
    const twap = (await controller.getTwapOrders()).find(
      (order) => order.orderId === result.orderId,
    );
    const cancel = await controller.cancelOrder({
      orderId: String(result.orderId),
      symbol,
      orderType: 'twap',
    });
    assert(sliceFills.length > 0, 'no TWAP slice filled in time');
    return {
      twapId: result.orderId,
      twap,
      sliceFills: sliceFills.map((fill) => ({
        tid: fill.tid,
        oid: fill.oid,
        px: fill.px,
        sz: fill.sz,
        fee: fill.fee,
        builderFee: fill.builderFee,
      })),
      cancel,
    };
  });
  await step(steps, 'close-twap-position', async () => cleanup(controller));

  await step(steps, 'chase', async () => {
    const result = succeeded(
      await controller.placeOrder({
        ...(await orderParams(symbol, true)),
        orderType: 'chase',
        chaseIntervalMs: 2_000,
        chaseMaxDurationMs: 20_000,
        maxSlippageBps: undefined,
      }),
    );
    await sleep(8_000);
    const chase = (await controller.getChaseOrders()).find(
      (order) => order.handle === result.orderId,
    );
    const cancel = await controller.cancelOrder({
      orderId: String(result.orderId),
      symbol,
      orderType: 'chase',
    });
    return { handle: result.orderId, chase, cancel };
  });
  await step(steps, 'final-cleanup', async () => cleanup(controller));

  const venueFills = exchangeLog.flatMap(({ response }) =>
    (
      ((response as Json).response as { data?: { statuses?: Json[] } })?.data
        ?.statuses ?? []
    ).filter((status) => typeof status === 'object' && 'filled' in status),
  );
  await fillsSince(user, start, venueFills.length);
  // Fills index shortly after the reply; one more read picks up stragglers.
  await sleep(5_000);
  const fills = (await fillsSince(user, start)).map((fill) => ({
    tid: fill.tid,
    oid: fill.oid,
    hash: fill.hash,
    side: fill.side,
    px: fill.px,
    sz: fill.sz,
    dir: fill.dir,
    fee: fill.fee,
    builderFee: fill.builderFee,
    time: fill.time,
  }));
  const builders = [
    ...new Set(
      exchangeLog
        .map(({ action }) => (action.builder as Json | undefined)?.b)
        .filter(Boolean),
    ),
  ];
  const twapSliceFills =
    (steps.find((item) => item.name === 'twap')?.sliceFills as
      | Json[]
      | undefined) ?? [];
  return {
    ok:
      steps.every((item) => item.ok === true) &&
      fills.length > 0 &&
      fills.every((fill) => fill.builderFee !== undefined),
    twapSliceFills,
    twapSlicesWithBuilderFee: twapSliceFills.filter(
      (fill) => fill.builderFee !== undefined,
    ).length,
    symbol,
    user,
    steps,
    fills,
    builders,
    before,
    after: await walletState(user),
  };
}

/**
 * After trading the HIP-3 dex, try a resting order on the global book.
 *
 * @param controller - The controller.
 * @returns Phase report.
 */
async function globalOrderPhase(controller: PerpsController): Promise<Json> {
  const coin = String(values.market);
  const mid = await midPrice(coin);
  const result = await controller.placeOrder({
    ...(await orderParams(coin, true)),
    orderType: 'limit',
    price: String(Math.round(mid * 0.8)),
    timeInForce: 'GTC',
    maxSlippageBps: undefined,
  });
  // A resting order means the venue accepted it; remove it again.
  const cancel =
    result.success && result.orderId
      ? await controller.cancelOrder({ orderId: result.orderId, symbol: coin })
      : undefined;
  return {
    ok: true,
    rejected: result.success !== true,
    symbol: coin,
    controllerResult: result,
    cancel,
    exchange: wireOrders(),
  };
}

/**
 * Collateral reads: under a unified account the dex's margin is held on spot
 * USDC and the global book carries none of it.
 *
 * @param user - Wallet address.
 * @returns Phase report.
 */
async function isolationPhase(user: string): Promise<Json> {
  const state = await walletState(user);
  const usdc = (state.spotBalances as Json[]).find(
    (balance) => balance.coin === 'USDC',
  );
  const hip3Margin = (state[dex] as { marginSummary: Json }).marginSummary
    .totalMarginUsed;
  return {
    ok: true,
    spotUsdcHold: usdc?.hold,
    hip3MarginUsed: hip3Margin,
    spotHoldMatchesHip3Margin: Number(usdc?.hold) === Number(hip3Margin),
    ...state,
  };
}

const outPath = resolve(String(values.out));
let report: Json;
let controller: PerpsController | undefined;
try {
  const phase = String(values.phase);
  if (phase === 'reads') {
    report = await readsPhase();
  } else {
    const signer = await fixtureSigner(
      String(values.account),
      Number(values.index),
    );
    const live = buildController(signer);
    controller = live;
    await live.init();
    const user = signer.address;
    const run = {
      markets: async (): Promise<Json> => marketsPhase(live),
      open: async (): Promise<Json> => openPhase(live),
      trade: async (): Promise<Json> => tradePhase(live, user),
      'global-order': async (): Promise<Json> => globalOrderPhase(live),
      isolation: async (): Promise<Json> => isolationPhase(user),
    }[phase];
    assert(run, `Unknown --phase ${phase}`);
    report = { account: user, ...(await run()) };
  }
} catch (error) {
  report = {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  };
} finally {
  await controller?.disconnect();
  globalThis.fetch = realFetch;
}
report = {
  phase: values.phase,
  network: 'testnet',
  controllerErrors,
  ...report,
};
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(
  `${JSON.stringify({ phase: values.phase, ok: report.ok })}\n`,
);
process.exitCode = report.ok === true ? 0 : 1;
