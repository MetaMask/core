import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type { MockAnyNamespace } from '@metamask/messenger';
/**
 * Permissioned HIP-3 dex proof on HyperLiquid testnet (`ignp` by default).
 *
 * Drives PerpsController through its public API the way a client does: real
 * messenger, HIP-3 enabled through `clientConfig`, signing with a recipe
 * wallet-fixture account. Only the testnet API is reachable. Each `/exchange`
 * call is summarised in the reports: action type, asset ids, builder field and
 * the venue's parsed reply.
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
import { mkdir, open, readFile, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
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

// Every /exchange action the controller sends, with the venue's parsed reply.
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

// Ids the venue assigned to this run's orders and TWAPs. Trigger orders come
// back as `waitingForTrigger` without an id; `adoptTriggers` adds those.
const runOrderIds = new Set<string>();
const runTwapIds = new Set<string>();
const filledOrderIds = new Set<string>();

/**
 * Collect order, fill and TWAP ids from the venue replies logged so far.
 */
function collectRunIds(): void {
  for (const { response } of exchangeLog) {
    const data = (
      (response as Json).response as
        | { data?: { statuses?: unknown[]; status?: unknown } }
        | undefined
    )?.data;
    for (const status of data?.statuses ?? []) {
      if (typeof status === 'object' && status !== null) {
        const placed = status as {
          resting?: { oid?: number };
          filled?: { oid?: number };
        };
        const oid = placed.resting?.oid ?? placed.filled?.oid;
        if (oid !== undefined) {
          runOrderIds.add(String(oid));
        }
        if (placed.filled?.oid !== undefined) {
          filledOrderIds.add(String(placed.filled.oid));
        }
      }
    }
    const twapId = (data?.status as { running?: { twapId?: number } })?.running
      ?.twapId;
    if (twapId !== undefined) {
      runTwapIds.add(String(twapId));
    }
  }
}

/**
 * Refuse to sign on a market where the wallet already holds anything, so every
 * position or order found there afterwards comes from this run.
 *
 * @param user - Wallet address.
 * @param coin - Venue coin name.
 */
async function assertFlat(user: string, coin: string): Promise<void> {
  const existing = {
    size: await venueSize(user, coin),
    orders: await venueOrderIds(user, coin),
    twaps: await runningTwapIds(user, coin),
  };
  assert(
    existing.size === 0 &&
      existing.orders.length === 0 &&
      existing.twaps.length === 0,
    `${user} already has ${JSON.stringify(existing)} on ${coin}; pick another --market`,
  );
}

/**
 * Net signed size of this run's fills on a market.
 *
 * @param fills - Venue fills.
 * @param coin - Venue coin name.
 * @returns Buys minus sells, rounded to 8 decimals.
 */
function runNetSize(fills: Json[], coin: string): number {
  const net = fills
    .filter((fill) => fill.coin === coin && runOrderIds.has(String(fill.oid)))
    .reduce(
      (sum, fill) => sum + (fill.side === 'B' ? 1 : -1) * Number(fill.sz),
      0,
    );
  return Number(net.toFixed(8));
}

/**
 * Remove whatever an attempt the venue should have refused left behind. The
 * phase starts flat (`assertFlat`). Every order the venue acknowledged is
 * followed to a final status within the fill deadline, open ones are
 * cancelled, and only the size the run's own fills opened is closed, in the
 * opposite direction.
 *
 * @param controller - The controller.
 * @param user - Wallet address.
 * @param coin - Venue coin name.
 * @param since - Phase start in ms.
 * @returns What was found and removed; `clean` is false if anything was left
 * or an acknowledged order never reached a final status.
 */
async function settleAttempt(
  controller: PerpsController,
  user: string,
  coin: string,
  since: number,
): Promise<Json> {
  const cancels: Json[] = [];
  const cancelled = new Set<string>();
  const { fills, orders, mismatched } = await reconcileOrders(
    user,
    since,
    coin,
    async (orderId) => {
      if (cancelled.has(orderId)) {
        return;
      }
      cancelled.add(orderId);
      const result = await controller.cancelOrder({ orderId, symbol: coin });
      cancels.push({ orderId, success: result.success, error: result.error });
    },
  );
  const runNet = runNetSize(fills, coin);
  // Close only exposure the run's fills explain, never more and never against
  // the position's direction. Position reads can lag the fills, so wait for
  // that exposure to appear before closing.
  const explains = (signed: number): boolean =>
    Math.sign(signed) === Math.sign(runNet) &&
    Math.abs(signed) >= Math.abs(runNet);
  let size = await venueSize(user, coin);
  const sizeDeadline = Date.now() + 15_000;
  if (runNet !== 0) {
    while (!explains(size) && Date.now() < sizeDeadline) {
      await sleep(3_000);
      size = await venueSize(user, coin);
    }
  }
  const close =
    runNet !== 0 && explains(size)
      ? await controller.closePosition({
          symbol: coin,
          size: String(Math.abs(runNet)),
        })
      : undefined;
  let leftSize = await venueSize(user, coin);
  const deadline = Date.now() + 15_000;
  if (close?.success === true) {
    while (leftSize !== 0 && Date.now() < deadline) {
      await sleep(3_000);
      leftSize = await venueSize(user, coin);
    }
  }
  collectRunIds();
  const leftOrders = (await venueOrderIds(user, coin)).filter((orderId) =>
    runOrderIds.has(orderId),
  );
  return {
    executed:
      cancels.length > 0 ||
      orders.some((order) => Number(order.executedSz) > 0) ||
      runNet !== 0 ||
      size !== 0,
    clean:
      cancels.every((cancel) => cancel.success === true) &&
      mismatched.length === 0 &&
      (runNet === 0 || close?.success === true) &&
      leftOrders.length === 0 &&
      leftSize === 0,
    orders,
    unresolved: mismatched,
    cancels,
    runNet,
    size,
    close,
    leftOrders,
    leftSize,
  };
}

/**
 * Hold a per-wallet lock file for a signed phase. The file lives in the OS
 * user's home directory, not the checkout or `TMPDIR`, so every checkout run
 * by that user on this host contends for the same lock. Runs from other hosts
 * or OS users are not covered.
 *
 * @param user - Wallet address.
 * @returns A release function.
 */
async function lockWallet(user: string): Promise<() => Promise<void>> {
  const lockPath = join(
    homedir(),
    '.cache',
    'metamask-recipe-locks',
    `hip3-permissioned-dex-${user.toLowerCase()}.lock`,
  );
  await mkdir(dirname(lockPath), { recursive: true });
  const handle = await open(lockPath, 'wx').catch(() => {
    throw new Error(
      `${lockPath} exists: another signed run holds this wallet. Remove it only when no run is active.`,
    );
  });
  try {
    await handle.writeFile(`${process.pid}\n`);
  } catch (error) {
    await handle.close().catch(() => undefined);
    await unlink(lockPath);
    throw error;
  }
  await handle.close().catch(() => undefined);
  return async () => unlink(lockPath);
}

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
 * Venue position size on one market.
 *
 * @param user - Wallet address.
 * @param coin - Venue coin name.
 * @returns Signed size, 0 when flat.
 */
async function venueSize(user: string, coin: string): Promise<number> {
  const state = await info<{ assetPositions: { position: Json }[] }>({
    type: 'clearinghouseState',
    user,
    dex: coin.includes(':') ? coin.split(':')[0] : '',
  });
  const entry = state.assetPositions.find(
    (item) => item.position.coin === coin,
  );
  return entry ? Number(entry.position.szi) : 0;
}

/**
 * Venue resting order ids on one market, trigger orders included.
 *
 * @param user - Wallet address.
 * @param coin - Venue coin name.
 * @returns Order ids.
 */
async function venueOrderIds(user: string, coin: string): Promise<string[]> {
  const orders = await info<Json[]>({
    type: 'frontendOpenOrders',
    user,
    dex: coin.includes(':') ? coin.split(':')[0] : '',
  });
  return orders
    .filter((order) => order.coin === coin)
    .map((order) => String(order.oid));
}

/**
 * TWAP ids still running on one market.
 *
 * @param user - Wallet address.
 * @param coin - Venue coin name.
 * @returns TWAP ids whose latest status is `activated`.
 */
async function runningTwapIds(user: string, coin: string): Promise<string[]> {
  const history = await info<
    { time: number; twapId: number; state: Json; status: { status: string } }[]
  >({ type: 'twapHistory', user });
  const latest = new Map<string, string>();
  for (const entry of [...history].sort((a, b) => a.time - b.time)) {
    if (entry.state.coin === coin) {
      latest.set(String(entry.twapId), entry.status.status);
    }
  }
  return [...latest]
    .filter(([, status]) => status === 'activated')
    .map(([twapId]) => twapId);
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
 * Open attempt; the report carries the venue's parsed reply.
 *
 * @param controller - The controller.
 * @param user - Wallet address.
 * @returns Phase report.
 */
async function openPhase(
  controller: PerpsController,
  user: string,
): Promise<Json> {
  await assertFlat(user, symbol);
  const since = Date.now();
  const result = await controller.placeOrder(await orderParams(symbol, true));
  // An open the venue should refuse must leave nothing behind.
  const settlement = await settleAttempt(controller, user, symbol, since);
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
    ok:
      result.success !== true &&
      venueErrors.length > 0 &&
      settlement.executed === false &&
      settlement.clean === true,
    symbol,
    controllerResult: result,
    venueErrors,
    settlement,
    exchange: wireOrders(),
  };
}

/**
 * Reconcile every run-owned order on a market with the fill history. Each poll
 * refreshes the status of orders not yet final, so a late status index does
 * not cause a false timeout. The venue's `origSz - sz` is the executed size,
 * which covers orders that rested first and filled later.
 *
 * @param user - Wallet address.
 * @param since - Phase start in ms.
 * @param coin - Venue coin name.
 * @param onOpen - Called for each run order still open on a poll.
 * @returns Market fills and one row per run order; `mismatched` lists rows
 * whose fills do not add up to the executed size or that are not final.
 */
async function reconcileOrders(
  user: string,
  since: number,
  coin: string,
  onOpen?: (orderId: string) => Promise<void>,
): Promise<{ fills: Json[]; orders: Json[]; mismatched: Json[] }> {
  const pending = ['open', 'triggered', 'unknownOid'];
  const rows = new Map<
    string,
    { oid: string; coin: unknown; status: string; executedSz: number }
  >();
  const deadline = Date.now() + FILL_WAIT_MS;
  for (;;) {
    collectRunIds();
    for (const oid of runOrderIds) {
      const known = rows.get(oid);
      if (known && !pending.includes(known.status)) {
        continue;
      }
      const reply = await info<{
        status: string;
        order?: { status: string; order: Json };
      }>({ type: 'orderStatus', user, oid: Number(oid) });
      const order = reply.order?.order ?? {};
      const row = {
        oid,
        coin: order.coin,
        status: reply.order?.status ?? reply.status,
        executedSz: Number(
          (Number(order.origSz) - Number(order.sz)).toFixed(8),
        ),
      };
      rows.set(oid, row);
      if (row.status === 'open' && row.coin === coin) {
        await onOpen?.(oid);
      }
    }
    const fills = (
      await info<Json[]>({ type: 'userFillsByTime', user, startTime: since })
    ).filter((fill) => fill.coin === coin);
    const orders = [...rows.values()]
      .filter((row) => row.coin === coin || row.coin === undefined)
      .map((row) => {
        const filledSz = fills
          .filter((fill) => String(fill.oid) === row.oid)
          .reduce((sum, fill) => sum + Number(fill.sz), 0);
        return { ...row, filledSz: Number(filledSz.toFixed(8)) };
      });
    const mismatched = orders.filter(
      (row) =>
        !Number.isFinite(row.executedSz) ||
        row.filledSz !== row.executedSz ||
        pending.includes(row.status),
    );
    if (mismatched.length === 0 || Date.now() > deadline) {
      return { fills, orders, mismatched };
    }
    await sleep(3_000);
  }
}

/**
 * Register the TP/SL children of the run's last order placement. Their venue
 * reply is `waitingForTrigger` without an id, so they are taken from the book.
 * That is only safe while the run has the market to itself: the phase started
 * with no orders on it (`assertFlat`, under the wallet lock), and children are
 * adopted only when the market's trigger orders are exactly the accepted
 * children at the trigger prices the run sent. Anything else adopts nothing
 * and is reported as `foreign`.
 *
 * @param user - Wallet address.
 * @param exchangeFrom - Exchange log index before the placement.
 * @returns Accepted children, the order ids adopted for them, and any trigger
 * orders that did not fit.
 */
async function adoptTriggers(
  user: string,
  exchangeFrom: number,
): Promise<{ accepted: string[]; matched: Json[]; foreign: Json[] }> {
  const placement = exchangeLog
    .slice(exchangeFrom)
    .find(({ action }) => action.type === 'order');
  const sent = (placement?.action.orders as Json[] | undefined) ?? [];
  const statuses =
    (
      (placement?.response as Json | undefined)?.response as
        | { data?: { statuses?: unknown[] } }
        | undefined
    )?.data?.statuses ?? [];
  const accepted = sent
    .map((order, index) => ({
      triggerPx: (order.t as { trigger?: { triggerPx?: string } } | undefined)
        ?.trigger?.triggerPx,
      status: statuses[index],
    }))
    .filter(
      (child): child is { triggerPx: string; status: unknown } =>
        child.triggerPx !== undefined && child.status === 'waitingForTrigger',
    )
    .map((child) => child.triggerPx);
  const wanted = accepted.map(Number).sort((a, b) => a - b);
  let triggers: Json[] = [];
  const deadline = Date.now() + 15_000;
  for (;;) {
    triggers = (
      await info<Json[]>({ type: 'frontendOpenOrders', user, dex })
    ).filter((item) => item.coin === symbol && item.isTrigger === true);
    const prices = triggers
      .map((item) => Number(item.triggerPx))
      .sort((a, b) => a - b);
    const exact =
      prices.length === wanted.length &&
      prices.every((price, index) => price === wanted[index]);
    if (exact && wanted.length > 0) {
      for (const item of triggers) {
        runOrderIds.add(String(item.oid));
      }
      return {
        accepted,
        matched: triggers.map((item) => ({
          oid: item.oid,
          triggerPx: item.triggerPx,
          orderType: item.orderType,
        })),
        foreign: [],
      };
    }
    if (prices.length > wanted.length || Date.now() > deadline) {
      return {
        accepted,
        matched: [],
        foreign: triggers.map((item) => ({
          oid: item.oid,
          triggerPx: item.triggerPx,
        })),
      };
    }
    await sleep(2_000);
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
 * Cancel this run's orders and TWAPs on the market, close the position, then
 * confirm from venue reads that none of it is left. The trade phase starts flat
 * with no orders on the market, so the whole position is the run's.
 *
 * @param controller - The controller.
 * @param user - Wallet address.
 * @returns What was cancelled and closed. Throws when anything is left.
 */
async function cleanup(
  controller: PerpsController,
  user: string,
): Promise<Json> {
  collectRunIds();
  const cancels: Json[] = [];
  for (const twapId of await runningTwapIds(user, symbol)) {
    if (runTwapIds.has(twapId)) {
      const result = await controller.cancelOrder({
        orderId: twapId,
        symbol,
        orderType: 'twap',
      });
      cancels.push({ twapId, success: result.success, error: result.error });
    }
  }
  for (const orderId of await venueOrderIds(user, symbol)) {
    if (runOrderIds.has(orderId)) {
      const result = await controller.cancelOrder({ orderId, symbol });
      cancels.push({ orderId, success: result.success, error: result.error });
    }
  }
  const size = await venueSize(user, symbol);
  const close =
    size === 0 ? undefined : await controller.closePosition({ symbol });
  collectRunIds();
  // Venue reads catch up with the replies shortly after.
  await sleep(3_000);
  const report = {
    cancels,
    close: close && {
      success: close.success,
      orderId: close.orderId,
      filledSize: close.filledSize,
      error: close.error,
    },
    // Any order on the market now is new since the phase started.
    leftOrders: await venueOrderIds(user, symbol),
    leftTwaps: (await runningTwapIds(user, symbol)).filter((twapId) =>
      runTwapIds.has(twapId),
    ),
    leftSize: await venueSize(user, symbol),
  };
  assert(
    cancels.every((cancel) => cancel.success === true) &&
      close?.success !== false &&
      report.leftOrders.length === 0 &&
      report.leftTwaps.length === 0 &&
      report.leftSize === 0,
    `cleanup left orders or exposure: ${JSON.stringify(report)}`,
  );
  return report;
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
  // Cleanup closes the whole position on the market, so start only where the
  // wallet holds nothing: no position, no resting order, no running TWAP.
  await assertFlat(user, symbol);
  const steps: Json[] = [];

  await step(steps, 'open-with-tpsl', async () => {
    const mid = await midPrice(symbol);
    const exchangeFrom = exchangeLog.length;
    const result = await controller.placeOrder(
      await orderParams(symbol, true, {
        takeProfitPrice: String(Math.round(mid * 1.5)),
        stopLossPrice: String(Math.round(mid * 0.6)),
      }),
    );
    // Register accepted children before any check can fail, so cleanup owns
    // them whatever happens next.
    const triggers = await adoptTriggers(user, exchangeFrom);
    succeeded(result);
    assert(
      triggers.accepted.length === 2 &&
        triggers.matched.length === triggers.accepted.length,
      `expected TP and SL matched to the placement: ${JSON.stringify(triggers)}`,
    );
    return {
      orderId: result.orderId,
      filledSize: result.filledSize,
      averagePrice: result.averagePrice,
      triggers: triggers.matched,
    };
  });
  await step(steps, 'close', async () => {
    const result = succeeded(await controller.closePosition({ symbol }));
    return { orderId: result.orderId, filledSize: result.filledSize };
  });
  await step(steps, 'cancel-leftover-tpsl', async () =>
    cleanup(controller, user),
  );

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
    assert(cancel.success, `scale cancel failed: ${cancel.error}`);
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
    assert(cancel.success, `TWAP cancel failed: ${cancel.error}`);
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
  await step(steps, 'close-twap-position', async () =>
    cleanup(controller, user),
  );

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
    assert(cancel.success, `chase cancel failed: ${cancel.error}`);
    return { handle: result.orderId, chase, cancel };
  });
  await step(steps, 'final-cleanup', async () => cleanup(controller, user));

  // Every run order's executed size must match its fills, including orders
  // that rested first, and only fills of this run's orders count as proof.
  const {
    fills: marketFills,
    orders: runOrders,
    mismatched: mismatchedOrders,
  } = await reconcileOrders(user, start, symbol);
  const seenOrderIds = new Set(marketFills.map((fill) => String(fill.oid)));
  const missingFills = [...filledOrderIds].filter(
    (orderId) => !seenOrderIds.has(orderId),
  );
  const summary = (fill: Json): Json => ({
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
  });
  const fills = marketFills
    .filter((fill) => runOrderIds.has(String(fill.oid)))
    .map(summary);
  const otherFills = marketFills
    .filter((fill) => !runOrderIds.has(String(fill.oid)))
    .map(summary);
  const fillsWithoutBuilderFee = fills.filter(
    (fill) => !(Number(fill.builderFee) > 0),
  );
  const ordersWithoutBuilder = exchangeLog
    .filter(({ action }) => action.type === 'order' && !action.builder)
    .map(({ response }) => response);
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
      filledOrderIds.size > 0 &&
      missingFills.length === 0 &&
      mismatchedOrders.length === 0 &&
      fills.length > 0 &&
      fillsWithoutBuilderFee.length === 0 &&
      ordersWithoutBuilder.length === 0,
    filledOrderIds: [...filledOrderIds],
    missingFills,
    runOrders,
    mismatchedOrders,
    fillsWithoutBuilderFee,
    ordersWithoutBuilder,
    twapSliceFills,
    twapSlicesWithBuilderFee: twapSliceFills.filter(
      (fill) => fill.builderFee !== undefined,
    ).length,
    symbol,
    user,
    steps,
    fills,
    otherFills,
    builders,
    before,
    after: await walletState(user),
  };
}

/**
 * After trading the HIP-3 dex, try a resting order on the global book.
 *
 * @param controller - The controller.
 * @param user - Wallet address.
 * @returns Phase report.
 */
async function globalOrderPhase(
  controller: PerpsController,
  user: string,
): Promise<Json> {
  const coin = String(values.market);
  await assertFlat(user, coin);
  const since = Date.now();
  const mid = await midPrice(coin);
  const result = await controller.placeOrder({
    ...(await orderParams(coin, true)),
    orderType: 'limit',
    price: String(Math.round(mid * 0.8)),
    timeInForce: 'GTC',
    maxSlippageBps: undefined,
  });
  // An accepted order rests or fills; remove whatever it left.
  const settlement = await settleAttempt(controller, user, coin, since);
  return {
    ok: settlement.clean === true,
    rejected: result.success !== true && settlement.executed === false,
    symbol: coin,
    controllerResult: result,
    settlement,
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
  const globalMargin = (state.mainDex as { marginSummary: Json }).marginSummary
    .totalMarginUsed;
  // Venue amounts are decimal strings; anything else is not an observation.
  const amount = (value: unknown): number =>
    typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  const hold = amount(usdc?.hold);
  const margin = amount(hip3Margin);
  const globalBook = amount(globalMargin);
  const spotHoldMatchesHip3Margin =
    Number.isFinite(margin) && margin > 0 && hold === margin;
  return {
    ok:
      state.userAbstraction === 'unifiedAccount' &&
      spotHoldMatchesHip3Margin &&
      globalBook === 0,
    spotUsdcHold: usdc?.hold,
    hip3MarginUsed: hip3Margin,
    globalMarginUsed: globalMargin,
    spotHoldMatchesHip3Margin,
    ...state,
  };
}

const outPath = resolve(String(values.out));
let report: Json;
let controller: PerpsController | undefined;
let release: (() => Promise<void>) | undefined;
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
    if (['open', 'trade', 'global-order'].includes(phase)) {
      release = await lockWallet(user);
    }
    const run = {
      markets: async (): Promise<Json> => marketsPhase(live),
      open: async (): Promise<Json> => openPhase(live, user),
      trade: async (): Promise<Json> => tradePhase(live, user),
      'global-order': async (): Promise<Json> => globalOrderPhase(live, user),
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
  try {
    await controller?.disconnect();
  } finally {
    await release?.();
    globalThis.fetch = realFetch;
  }
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
