/**
 * Lighter POC e2e driver (TAT-3766).
 *
 * Runs REAL calls against Lighter testnet through the Go/WASM signer built
 * from source. Phased so a recipe can compose each step as its own command
 * node with per-phase assertions:
 *
 *   yarn workspace @metamask/perps-controller exec tsx tests/e2e/lighter.e2e.ts \
 *     --phase=sign-only|register|order-lifecycle|controller [--out=DIR] [--market=SOL]
 *
 * Optional flags:
 *   --eth-key=0x…        L1 private key (default: lighter-python's PUBLIC
 *                        dummy testnet key — accountIndex 28, funded).
 *   --account-index=N    Lighter account index (default 28).
 *   --api-key-index=N    API key slot (default 7).
 *   --wasm-dir=DIR       Cache dir from build-wasm.sh (default
 *                        <repo>/temp/lighter-wasm).
 *
 * Each phase writes <out>/<phase>.json and prints PASS/FAIL lines;
 * process.exitCode = 1 on failure (advanced-orders e2e conventions).
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { privateKeyToAccount } from 'viem/accounts';

import {
  buildLighterKeyDerivationMessage,
  computeLighterMinOrderSize,
  LIGHTER_TESTNET_CHAIN_ID,
} from '../../src/constants/lighterConfig.js';
import { LighterProvider } from '../../src/providers/LighterProvider.js';
import { LighterClientService } from '../../src/services/LighterClientService.js';
import { LighterWalletService } from '../../src/services/LighterWalletService.js';
import type { PerpsPlatformDependencies } from '../../src/types/index.js';
import type {
  LighterCreateAuthTokenResult,
  LighterCreateClientResult,
  LighterTxResult,
} from '../../src/types/lighter-types.js';
import { createNodeWasmBridge } from './lighter/nodeWasmBridge.js';

// lighter-python's public dummy testnet key (examples/system_setup.py) —
// accountIndex 28 on testnet, pre-funded. NOT a secret.
const DEFAULT_DUMMY_ETH_KEY =
  '0x1234567812345678123456781234567812345678123456781234567812345678';

const PACKAGE_ROOT = resolve(__dirname, '..', '..');
const REPO_ROOT = resolve(PACKAGE_ROOT, '..', '..');

type PhaseResult = {
  phase: string;
  ok: boolean;
  checks: { name: string; ok: boolean; detail?: string }[];
  [key: string]: unknown;
};

const args = new Map<string, string>();
for (const arg of process.argv.slice(2)) {
  const match = /^--([^=]+)(?:=(.*))?$/u.exec(arg);
  if (match) {
    args.set(match[1], match[2] ?? 'true');
  }
}

const PHASE = args.get('phase') ?? 'sign-only';
const OUT_DIR = resolve(
  args.get('out') ?? join(REPO_ROOT, 'temp', 'lighter-e2e'),
);
const MARKET = args.get('market') ?? 'SOL';
const WASM_DIR = resolve(
  args.get('wasm-dir') ?? join(REPO_ROOT, 'temp', 'lighter-wasm'),
);
const ETH_KEY = (args.get('eth-key') ?? DEFAULT_DUMMY_ETH_KEY) as `0x${string}`;
const ACCOUNT_INDEX = Number(args.get('account-index') ?? 28);
const API_KEY_INDEX = Number(args.get('api-key-index') ?? 7);

const viemAccount = privateKeyToAccount(ETH_KEY);

/**
 * Minimal faithful PerpsPlatformDependencies (mirrors the mm-harness core
 * adapter's buildInfrastructure — read/write paths only touch loggers and
 * formatters).
 *
 * @returns Infrastructure object.
 */
function buildInfrastructure(): PerpsPlatformDependencies {
  const noop = (): undefined => undefined;
  return {
    logger: {
      error: (error: unknown, meta?: unknown) =>
        process.stderr.write(
          `[lighter-e2e][error] ${String((error as Error)?.message ?? error)}${meta ? ` ${JSON.stringify(meta)}` : ''}\n`,
        ),
    },
    debugLogger: {
      log: (message: unknown, meta?: unknown) =>
        process.stderr.write(
          `[lighter-e2e] ${String(message)}${meta ? ` ${JSON.stringify(meta)}` : ''}\n`,
        ),
    },
    metrics: {
      trackEvent: noop,
      isEnabled: () => false,
      trackPerpsEvent: noop,
    },
    performance: { now: () => Date.now() },
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
      formatVolume: (value: number) => `$${value}`,
      formatPerpsFiat: (value: number) => `$${value}`,
      formatPercentage: (value: number) => `${value}%`,
      priceRangesUniversal: [],
    },
    cacheInvalidator: { invalidate: noop, invalidateAll: noop },
    diskCache: {
      getItem: async () => null,
      getItemSync: () => null,
      setItem: async () => undefined,
      removeItem: async () => undefined,
    },
    rewards: { getPerpsDiscountForAccount: async () => null },
  } as unknown as PerpsPlatformDependencies;
}

/**
 * Sign an EIP-191 personal message with the headless viem account.
 *
 * @param message - Plaintext to sign.
 * @returns 0x signature hex.
 */
async function personalSigner(message: string): Promise<string> {
  return await viemAccount.signMessage({ message });
}

/**
 * Assign summary fields onto the phase result (indirection keeps
 * require-atomic-updates satisfied for post-await assignments).
 *
 * @param target - Phase result accumulator.
 * @param fields - Summary fields to record.
 */
function record(target: PhaseResult, fields: Record<string, unknown>): void {
  Object.assign(target, fields);
}

function check(
  result: PhaseResult,
  name: string,
  ok: boolean,
  detail?: string,
): void {
  result.checks.push({ name, ok, ...(detail ? { detail } : {}) });
  process.stdout.write(
    `${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}\n`,
  );
  if (!ok) {
    result.ok = false;
  }
}

async function poll<Value>(
  label: string,
  fetcher: () => Promise<Value>,
  predicate: (value: Value) => boolean,
  timeoutMs = 30_000,
  intervalMs = 1500,
): Promise<Value> {
  const startedAt = Date.now();
  let last: Value = await fetcher();
  while (!predicate(last)) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timed out polling: ${label}`);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, intervalMs));
    last = await fetcher();
  }
  return last;
}

// ============================================================================
// Phases
// ============================================================================

/**
 * Offline signer validation: WASM loads in Node, key derivation is
 * deterministic, ChangePubKey plaintext matches the documented template,
 * auth token and order signatures are produced. No account mutation.
 *
 * @param result - Phase result accumulator.
 */
async function phaseSignOnly(result: PhaseResult): Promise<void> {
  const bridge = await createNodeWasmBridge(WASM_DIR);
  check(result, 'wasm loads in node', true);

  const wallet = new LighterWalletService(buildInfrastructure(), {
    isTestnet: true,
    personalSigner,
    l1Address: viemAccount.address,
  });

  const seedA = await wallet.deriveKeySeedPlain(API_KEY_INDEX);
  const seedB = await wallet.deriveKeySeedPlain(API_KEY_INDEX);
  check(
    result,
    'seed derivation deterministic (64 hex chars)',
    seedA === seedB && /^[0-9a-f]{64}$/u.test(seedA),
  );
  check(
    result,
    'derivation message binds address/chain/slot',
    buildLighterKeyDerivationMessage({
      address: viemAccount.address,
      chainId: LIGHTER_TESTNET_CHAIN_ID,
      apiKeyIndex: API_KEY_INDEX,
    }).includes(viemAccount.address.toLowerCase()),
  );

  const client = new LighterClientService(buildInfrastructure(), {
    isTestnet: true,
  });
  const { nonce } = await client.getNextNonce(ACCOUNT_INDEX, API_KEY_INDEX);

  const created = await bridge.execute<LighterCreateClientResult>({
    function: '_createClient',
    params: [
      seedA,
      LIGHTER_TESTNET_CHAIN_ID,
      ACCOUNT_INDEX,
      nonce,
      API_KEY_INDEX,
    ],
  });
  check(
    result,
    'createClient returns 80-hex venue pubkey',
    Boolean(created.success) && /^[0-9a-f]{80}$/u.test(created.pk),
    created.error,
  );
  check(
    result,
    'ChangePubKey body matches documented template',
    typeof created.body === 'string' &&
      created.body.includes('Register Lighter Account') &&
      created.body.includes(created.pk) &&
      created.body.includes('Only sign this message for a trusted client!'),
  );
  result.venuePublicKey = created.pk;

  const token = await bridge.execute<LighterCreateAuthTokenResult>({
    function: '_createAuthToken',
    params: [ACCOUNT_INDEX, API_KEY_INDEX],
  });
  check(
    result,
    'auth token minted with future deadline',
    typeof token.token === 'string' &&
      token.token.length > 0 &&
      token.deadline > Math.floor(Date.now() / 1000),
    token.error,
  );

  const signed = await bridge.execute<LighterTxResult>({
    function: '_signCreateOrder',
    params: [
      ACCOUNT_INDEX,
      1,
      424242,
      '100',
      '900000',
      0,
      0,
      1,
      0,
      '0',
      -1,
      nonce,
    ],
  });
  const parsedTx = signed.txInfo ? JSON.parse(signed.txInfo) : null;
  check(
    result,
    'order signature produced (txInfo has venue Sig)',
    Boolean(parsedTx) &&
      typeof parsedTx.Sig === 'string' &&
      parsedTx.Sig.length > 0,
    signed.error,
  );
}

/**
 * Register the derived venue key on the testnet account via ChangePubKey
 * (personal_sign injection path), then prove it landed via /apikeys.
 *
 * @param result - Phase result accumulator.
 */
async function phaseRegister(result: PhaseResult): Promise<void> {
  const bridge = await createNodeWasmBridge(WASM_DIR);
  const provider = new LighterProvider({
    isTestnet: true,
    platformDependencies: buildInfrastructure(),
    signerBridge: bridge,
    lighterAuthConfig: {
      accountIndex: ACCOUNT_INDEX,
      apiKeyIndex: API_KEY_INDEX,
      l1Address: viemAccount.address,
      personalSigner,
    },
  });

  const ready = await provider.isReadyToTrade();
  check(result, 'provider isReadyToTrade', ready.ready, ready.error);
  check(
    result,
    'authenticated address matches L1 account',
    ready.authenticatedAddress?.toLowerCase() ===
      viemAccount.address.toLowerCase(),
  );

  // Independent read-back: the registered pubkey at our slot must equal the
  // deterministically derived one.
  const wallet = new LighterWalletService(buildInfrastructure(), {
    isTestnet: true,
    personalSigner,
    l1Address: viemAccount.address,
  });
  const seed = await wallet.deriveKeySeedPlain(API_KEY_INDEX);
  const client = new LighterClientService(buildInfrastructure(), {
    isTestnet: true,
  });
  const { nonce } = await client.getNextNonce(ACCOUNT_INDEX, API_KEY_INDEX);
  const created = await bridge.execute<LighterCreateClientResult>({
    function: '_createClient',
    params: [
      seed,
      LIGHTER_TESTNET_CHAIN_ID,
      ACCOUNT_INDEX,
      nonce,
      API_KEY_INDEX,
    ],
  });

  const keys = await poll(
    'apikeys shows derived venue key',
    async () => await client.getApiKeys(ACCOUNT_INDEX, API_KEY_INDEX),
    (response) =>
      response.apiKeys.some(
        (key) =>
          key.apiKeyIndex === API_KEY_INDEX && key.publicKey === created.pk,
      ),
    60_000,
  );
  check(
    result,
    'venue key registered at api key slot (strict pubkey equality)',
    keys.apiKeys.some(
      (key) =>
        key.apiKeyIndex === API_KEY_INDEX && key.publicKey === created.pk,
    ),
  );
  result.venuePublicKey = created.pk;
  result.accountIndex = ACCOUNT_INDEX;
  result.apiKeyIndex = API_KEY_INDEX;
}

/**
 * Place a REAL resting limit order on testnet through LighterProvider,
 * prove it is visible via the authenticated open-orders read, cancel it,
 * prove it is gone.
 *
 * @param result - Phase result accumulator.
 */
async function phaseOrderLifecycle(result: PhaseResult): Promise<void> {
  const bridge = await createNodeWasmBridge(WASM_DIR);
  const provider = new LighterProvider({
    isTestnet: true,
    platformDependencies: buildInfrastructure(),
    signerBridge: bridge,
    lighterAuthConfig: {
      accountIndex: ACCOUNT_INDEX,
      apiKeyIndex: API_KEY_INDEX,
      l1Address: viemAccount.address,
      personalSigner,
    },
  });

  const init = await provider.initialize();
  check(
    result,
    'provider initializes with live markets',
    init.success,
    init.error,
  );

  const markets = await provider.getMarkets();
  const market = markets.find((entry) => entry.name === MARKET);
  check(result, `market ${MARKET} exists on testnet`, Boolean(market));
  if (!market) {
    return;
  }

  const client = new LighterClientService(buildInfrastructure(), {
    isTestnet: true,
  });
  const details = await client.getOrderBookDetails();
  const detail = details.orderBookDetails.find(
    (entry) => entry.symbol === MARKET,
  );
  const lastPrice = detail?.lastTradePrice ?? 0;
  check(result, 'live last trade price available', lastPrice > 0);

  // Resting far below the market so the limit order cannot fill.
  const meta = (await client.getOrderBooks()).find(
    (entry) => entry.symbol === MARKET,
  );
  if (!meta) {
    check(result, 'market metadata available', false);
    return;
  }
  const priceDecimals = meta.supportedPriceDecimals;
  const restingPrice = Number(
    (lastPrice * 0.6).toFixed(Math.max(priceDecimals, 0)),
  );
  const size = computeLighterMinOrderSize(meta, restingPrice);

  const placed = await provider.placeOrder({
    symbol: MARKET,
    isBuy: true,
    size: String(size),
    orderType: 'limit',
    price: String(restingPrice),
  });
  check(result, 'placeOrder succeeds', Boolean(placed.success), placed.error);
  result.placedOrder = { price: restingPrice, size, orderId: placed.orderId };

  // The resting order must become visible through the authenticated read.
  let restingOrderId: string | null = null;
  const matchesOurs = (
    orders: Awaited<ReturnType<typeof provider.getOpenOrders>>,
  ): boolean =>
    orders.some((order) => {
      const priceMatches =
        Math.abs(parseFloat(order.price) - restingPrice) <
        10 ** -Math.max(priceDecimals - 1, 0);
      if (order.symbol === MARKET && order.side === 'buy' && priceMatches) {
        restingOrderId = order.orderId;
        return true;
      }
      return false;
    });

  await poll(
    'open orders shows the resting order',
    async () => await provider.getOpenOrders(),
    matchesOurs,
    45_000,
  );
  check(
    result,
    'resting order visible in open orders',
    restingOrderId !== null,
  );
  result.restingOrderId = restingOrderId;

  if (!restingOrderId) {
    return;
  }

  const canceled = await provider.cancelOrder({
    orderId: restingOrderId,
    symbol: MARKET,
  });
  check(result, 'cancelOrder succeeds', canceled.success, canceled.error);

  await poll(
    'open orders no longer shows the order',
    async () => await provider.getOpenOrders(),
    (orders) => !orders.some((order) => order.orderId === restingOrderId),
    45_000,
  );
  check(result, 'order gone after cancel', true);
}

/**
 * Abstraction-path proof: a real PerpsController (headless messenger pair,
 * same wiring as the mm-harness core adapter) with the Lighter provider
 * enabled through providerCredentials surfaces Lighter markets through the
 * aggregated provider with providerId stamping.
 *
 * @param result - Phase result accumulator.
 */
async function phaseController(result: PhaseResult): Promise<void> {
  const { PerpsController } = await import('../../src/PerpsController.js');
  const { Messenger, MOCK_ANY_NAMESPACE } = await import('@metamask/messenger');

  const rootMessenger = new Messenger({ namespace: MOCK_ANY_NAMESPACE });
  const messenger = new Messenger({
    namespace: 'PerpsController',
    parent: rootMessenger,
  });
  rootMessenger.registerActionHandler(
    'AccountsController:getSelectedAccount',
    () => ({
      id: 'lighter-e2e-account',
      address: viemAccount.address,
      type: 'eip155:eoa',
      metadata: { keyring: { type: 'HD Key Tree' } },
    }),
  );
  rootMessenger.registerActionHandler('KeyringController:getState', () => ({
    isUnlocked: true,
  }));
  rootMessenger.registerActionHandler(
    'KeyringController:signPersonalMessage',
    async (msgParams: { from: string; data: string }) => {
      const bytes = Buffer.from(msgParams.data.replace(/^0x/u, ''), 'hex');
      return await viemAccount.signMessage({ message: bytes.toString('utf8') });
    },
  );
  rootMessenger.delegate({
    actions: [
      'AccountsController:getSelectedAccount',
      'KeyringController:getState',
      'KeyringController:signPersonalMessage',
    ],
    messenger,
  });

  const controller = new PerpsController({
    messenger: messenger as never,
    state: { isTestnet: true, activeProvider: 'aggregated' },
    clientConfig: {
      providerCredentials: {
        lighter: {
          enabled: true,
          accountIndexTestnet: ACCOUNT_INDEX,
          apiKeyIndex: API_KEY_INDEX,
        },
      },
    },
    infrastructure: buildInfrastructure(),
    deferEligibilityCheck: true,
  } as never);

  await controller.init();
  check(result, 'controller initializes with aggregated provider', true);

  const markets = await controller.getMarkets();
  const lighterMarkets = (markets ?? []).filter(
    (market: { providerId?: string }) => market.providerId === 'lighter',
  );
  const hyperliquidMarkets = (markets ?? []).filter(
    (market: { providerId?: string }) => market.providerId === 'hyperliquid',
  );
  check(
    result,
    'aggregated getMarkets returns lighter-stamped markets',
    lighterMarkets.length > 0,
    `lighter=${lighterMarkets.length} hyperliquid=${hyperliquidMarkets.length}`,
  );
  check(
    result,
    'aggregation preserves other providers (hyperliquid present)',
    hyperliquidMarkets.length > 0,
  );
  result.lighterMarketCount = lighterMarkets.length;
  result.hyperliquidMarketCount = hyperliquidMarkets.length;

  await controller.disconnect?.();
}

/**
 * Prove the price-stream subscription surface: subscribeToPrices polls the
 * live testnet REST feed and fans out repeated PriceUpdate cycles.
 *
 * @param result - Phase result accumulator.
 */
async function phasePriceStream(result: PhaseResult): Promise<void> {
  const provider = new LighterProvider({
    isTestnet: true,
    platformDependencies: buildInfrastructure(),
    lighterAuthConfig: {},
  });

  const cycles: { count: number; btcPrice: string | undefined }[] = [];
  const unsubscribe = provider.subscribeToPrices({
    symbols: [],
    callback: (updates) => {
      cycles.push({
        count: updates.length,
        btcPrice: updates.find((update) => update.symbol === 'BTC')?.price,
      });
    },
  });

  // Immediate snapshot + at least two poll cycles (5s interval).
  const deadline = Date.now() + 20_000;
  while (cycles.length < 3 && Date.now() < deadline) {
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 500));
  }
  unsubscribe();
  await provider.disconnect();

  check(
    result,
    'price stream emitted at least 3 cycles (snapshot + live updates)',
    cycles.length >= 3,
    `cycles=${cycles.length}`,
  );
  check(
    result,
    'every cycle carries live markets',
    cycles.every((cycle) => cycle.count > 0),
  );
  // The first cycle is the full channel snapshot; later cycles are partial
  // per-market deltas, so BTC is only guaranteed in the snapshot.
  check(
    result,
    'BTC price present and numeric in the snapshot cycle',
    cycles[0]?.btcPrice !== undefined &&
      Number.isFinite(parseFloat(cycles[0].btcPrice)) &&
      parseFloat(cycles[0].btcPrice) > 0,
    `snapshotBtc=${cycles[0]?.btcPrice}`,
  );
  check(
    result,
    'every BTC price seen is numeric and positive',
    cycles.every(
      (cycle) =>
        cycle.btcPrice === undefined ||
        (Number.isFinite(parseFloat(cycle.btcPrice)) &&
          parseFloat(cycle.btcPrice) > 0),
    ),
  );
  result.priceStreamCycles = cycles.length;
  result.priceStreamBtcPrices = cycles.map((cycle) => cycle.btcPrice);
}

/**
 * Prove the account stream (user_stats WS channel): live collateral and
 * portfolio value for the configured testnet account.
 *
 * @param result - Phase result accumulator.
 */
async function phaseAccountStream(result: PhaseResult): Promise<void> {
  const provider = new LighterProvider({
    isTestnet: true,
    platformDependencies: buildInfrastructure(),
    lighterAuthConfig: {
      accountIndex: ACCOUNT_INDEX,
      apiKeyIndex: API_KEY_INDEX,
      l1Address: viemAccount.address,
      personalSigner,
    },
  });

  const emissions: { totalBalance: string; spendableBalance: string }[] = [];
  const unsubscribe = provider.subscribeToAccount({
    callback: (account) => {
      if (account) {
        emissions.push({
          totalBalance: account.totalBalance,
          spendableBalance: account.spendableBalance,
        });
      }
    },
  });

  const deadline = Date.now() + 20_000;
  while (emissions.length < 1 && Date.now() < deadline) {
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 500));
  }
  unsubscribe();
  await provider.disconnect();

  check(
    result,
    'account stream emitted at least one AccountState',
    emissions.length >= 1,
    `emissions=${emissions.length}`,
  );
  const first = emissions[0];
  check(
    result,
    'live total balance is numeric and positive',
    first !== undefined && parseFloat(first.totalBalance) > 0,
    `totalBalance=${first?.totalBalance}`,
  );
  check(
    result,
    'live spendable balance is numeric and non-negative',
    first !== undefined && parseFloat(first.spendableBalance) >= 0,
    `spendableBalance=${first?.spendableBalance}`,
  );
  result.accountEmissions = emissions.length;
  result.accountFirstEmission = first;
}

/**
 * Prove the positions stream (account_all_positions WS channel): the funded
 * shared testnet account holds live positions the channel must deliver.
 *
 * @param result - Phase result accumulator.
 */
async function phasePositionsStream(result: PhaseResult): Promise<void> {
  const provider = new LighterProvider({
    isTestnet: true,
    platformDependencies: buildInfrastructure(),
    lighterAuthConfig: {
      accountIndex: ACCOUNT_INDEX,
      apiKeyIndex: API_KEY_INDEX,
      l1Address: viemAccount.address,
      personalSigner,
    },
  });

  const snapshots: { count: number; symbols: string[] }[] = [];
  const unsubscribe = provider.subscribeToPositions({
    callback: (positions) => {
      snapshots.push({
        count: positions.length,
        symbols: positions.map((position) => position.symbol),
      });
    },
  });

  const deadline = Date.now() + 20_000;
  while (snapshots.length < 1 && Date.now() < deadline) {
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 500));
  }
  // Cross-check against the REST read the recipe already trusts.
  const restPositions = await provider.getPositions();
  unsubscribe();
  await provider.disconnect();

  check(
    result,
    'positions stream emitted at least one snapshot',
    snapshots.length >= 1,
    `snapshots=${snapshots.length}`,
  );
  check(
    result,
    'stream snapshot position count matches REST getPositions',
    snapshots[0]?.count === restPositions.length,
    `ws=${snapshots[0]?.count} rest=${restPositions.length}`,
  );
  result.positionsStreamSnapshots = snapshots;
  result.positionsRestCount = restPositions.length;
}

/**
 * Prove the authenticated orders stream (account_all_orders WS channel):
 * subscribe, place a real resting order, watch it arrive over the socket,
 * cancel it, and watch it leave.
 *
 * @param result - Phase result accumulator.
 */
async function phaseOrdersStream(result: PhaseResult): Promise<void> {
  const bridge = await createNodeWasmBridge(WASM_DIR);
  const provider = new LighterProvider({
    isTestnet: true,
    platformDependencies: buildInfrastructure(),
    signerBridge: bridge,
    lighterAuthConfig: {
      accountIndex: ACCOUNT_INDEX,
      apiKeyIndex: API_KEY_INDEX,
      l1Address: viemAccount.address,
      personalSigner,
    },
  });
  await provider.initialize();

  const snapshots: string[][] = [];
  const unsubscribe = provider.subscribeToOrders({
    callback: (orders) => {
      snapshots.push(orders.map((order) => order.orderId));
    },
  });
  const waitForStream = async (
    label: string,
    predicate: () => boolean,
  ): Promise<boolean> => {
    const deadline = Date.now() + 45_000;
    while (!predicate() && Date.now() < deadline) {
      await new Promise((resolveSleep) => setTimeout(resolveSleep, 500));
    }
    const ok = predicate();
    check(result, label, ok, `snapshots=${snapshots.length}`);
    return ok;
  };

  await waitForStream(
    'orders stream delivered its snapshot',
    () => snapshots.length >= 1,
  );

  const client = new LighterClientService(buildInfrastructure(), {
    isTestnet: true,
  });
  const details = await client.getOrderBookDetails();
  const lastPrice =
    details.orderBookDetails.find((entry) => entry.symbol === MARKET)
      ?.lastTradePrice ?? 0;
  const meta = (await client.getOrderBooks()).find(
    (entry) => entry.symbol === MARKET,
  );
  if (!meta || lastPrice <= 0) {
    check(result, 'live market metadata available', false);
    unsubscribe();
    await provider.disconnect();
    return;
  }
  const restingPrice = Number(
    (lastPrice * 0.6).toFixed(Math.max(meta.supportedPriceDecimals, 0)),
  );
  const size = computeLighterMinOrderSize(meta, restingPrice);
  const baselineIds = new Set(snapshots.at(-1) ?? []);

  const placed = await provider.placeOrder({
    symbol: MARKET,
    isBuy: true,
    size: String(size),
    orderType: 'limit',
    price: String(restingPrice),
  });
  check(result, 'placeOrder succeeds', Boolean(placed.success), placed.error);

  let streamedOrderId: string | null = null;
  await waitForStream('placed order arrives over the ws stream', () => {
    const latest = snapshots.at(-1) ?? [];
    streamedOrderId =
      latest.find((orderId) => !baselineIds.has(orderId)) ?? null;
    return streamedOrderId !== null;
  });

  if (streamedOrderId) {
    const canceled = await provider.cancelOrder({
      orderId: streamedOrderId,
      symbol: MARKET,
    });
    check(result, 'cancelOrder succeeds', canceled.success, canceled.error);
    const canceledId = streamedOrderId;
    await waitForStream(
      'canceled order leaves the ws stream',
      () => !(snapshots.at(-1) ?? []).includes(canceledId),
    );
  }

  unsubscribe();
  await provider.disconnect();
  record(result, { ordersStreamSnapshots: snapshots.length });
}

/**
 * Prove the candles endpoint: live OHLCV history for the target market with
 * sane values, plus the subscription seed path.
 *
 * @param result - Phase result accumulator.
 */
async function phaseCandles(result: PhaseResult): Promise<void> {
  const provider = new LighterProvider({
    isTestnet: true,
    platformDependencies: buildInfrastructure(),
    lighterAuthConfig: {},
  });

  const data = await provider.fetchHistoricalCandles({
    symbol: MARKET,
    interval: '15m' as never,
    limit: 50,
  });
  check(
    result,
    'historical candles returned a non-empty series',
    data.candles.length > 0,
    `count=${data.candles.length}`,
  );
  const last = data.candles.at(-1);
  check(
    result,
    'last candle has numeric OHLC and close > 0',
    last !== undefined &&
      ['open', 'high', 'low', 'close'].every((key) =>
        Number.isFinite(parseFloat(last[key as keyof typeof last] as string)),
      ) &&
      parseFloat(last.close) > 0,
    `close=${last?.close}`,
  );
  check(
    result,
    'candles are time-ascending',
    data.candles.every(
      (candle, index) =>
        index === 0 || candle.time >= data.candles[index - 1].time,
    ),
  );

  const seeded = await new Promise<number>((resolveSeed) => {
    const unsubscribe = provider.subscribeToCandles({
      symbol: MARKET,
      interval: '15m' as never,
      callback: (candleData) => {
        unsubscribe();
        resolveSeed(candleData.candles.length);
      },
    });
    setTimeout(() => {
      unsubscribe();
      resolveSeed(-1);
    }, 15_000);
  });
  check(
    result,
    'candle subscription seeds with history',
    seeded > 0,
    `seeded=${seeded}`,
  );
  await provider.disconnect();
  record(result, { candleCount: data.candles.length, lastClose: last?.close });
}

/**
 * Prove closePosition + the fills stream together: a real market order opens
 * a tiny position (fill #1 on the account_all_trades stream), closePosition
 * flattens it (fill #2), and the position list ends without the symbol delta.
 *
 * @param result - Phase result accumulator.
 */
async function phaseClosePosition(result: PhaseResult): Promise<void> {
  const bridge = await createNodeWasmBridge(WASM_DIR);
  const provider = new LighterProvider({
    isTestnet: true,
    platformDependencies: buildInfrastructure(),
    signerBridge: bridge,
    lighterAuthConfig: {
      accountIndex: ACCOUNT_INDEX,
      apiKeyIndex: API_KEY_INDEX,
      l1Address: viemAccount.address,
      personalSigner,
    },
  });
  await provider.initialize();

  const fills: { side: string; symbol: string }[] = [];
  const unsubscribeFills = provider.subscribeToOrderFills({
    callback: (incoming, isSnapshot) => {
      if (!isSnapshot) {
        fills.push(
          ...incoming.map((fill) => ({ side: fill.side, symbol: fill.symbol })),
        );
      }
    },
  });
  // Allow the trades channel to attach before trading.
  await new Promise((resolveWait) => setTimeout(resolveWait, 3000));

  const startPositions = await provider.getPositions();
  const startSize = parseFloat(
    startPositions.find((entry) => entry.symbol === MARKET)?.size ?? '0',
  );

  const client = new LighterClientService(buildInfrastructure(), {
    isTestnet: true,
  });
  const meta = (await client.getOrderBooks()).find(
    (entry) => entry.symbol === MARKET,
  );
  const lastPrice =
    (await client.getOrderBookDetails()).orderBookDetails.find(
      (entry) => entry.symbol === MARKET,
    )?.lastTradePrice ?? 0;
  if (!meta || lastPrice <= 0) {
    check(result, 'live market metadata available', false);
    unsubscribeFills();
    await provider.disconnect();
    return;
  }
  const size = computeLighterMinOrderSize(meta, lastPrice);

  const opened = await provider.placeOrder({
    symbol: MARKET,
    isBuy: true,
    size: String(size),
    orderType: 'market',
  });
  check(result, 'market order opens', Boolean(opened.success), opened.error);

  await poll(
    'position grows by the opened size',
    async () => await provider.getPositions(),
    (positions) => {
      const current = parseFloat(
        positions.find((entry) => entry.symbol === MARKET)?.size ?? '0',
      );
      return Math.abs(current - startSize - size) < size * 0.2;
    },
    45_000,
  );
  check(result, 'position visible after open', true);

  const closed = await provider.closePosition({
    symbol: MARKET,
    size: String(size),
  });
  check(
    result,
    'closePosition succeeds',
    Boolean(closed.success),
    closed.error,
  );

  await poll(
    'position returns to the starting size',
    async () => await provider.getPositions(),
    (positions) => {
      const current = parseFloat(
        positions.find((entry) => entry.symbol === MARKET)?.size ?? '0',
      );
      return Math.abs(current - startSize) < size * 0.2;
    },
    45_000,
  );
  check(result, 'position flat after close', true);

  await poll(
    'both fills arrive on the account_all_trades stream',
    async () => fills,
    (list) => list.length >= 2,
    30_000,
  );
  check(
    result,
    'fills stream delivered open+close fills',
    fills.length >= 2 && fills.every((fill) => fill.symbol === MARKET),
    `fills=${JSON.stringify(fills)}`,
  );
  unsubscribeFills();
  await provider.disconnect();
  record(result, { fillCount: fills.length });
}

/**
 * Prove the order-book stream: live sorted levels with a sane spread.
 *
 * @param result - Phase result accumulator.
 */
async function phaseOrderBookStream(result: PhaseResult): Promise<void> {
  const provider = new LighterProvider({
    isTestnet: true,
    platformDependencies: buildInfrastructure(),
    lighterAuthConfig: {},
  });

  const books: { bids: number; asks: number; mid: number; spread: number }[] =
    [];
  const unsubscribe = provider.subscribeToOrderBook({
    symbol: MARKET,
    levels: 5,
    callback: (book) => {
      books.push({
        bids: book.bids.length,
        asks: book.asks.length,
        mid: parseFloat(book.midPrice),
        spread: parseFloat(book.spread),
      });
    },
  });
  const deadline = Date.now() + 20_000;
  while (books.length < 3 && Date.now() < deadline) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  unsubscribe();
  await provider.disconnect();

  check(
    result,
    'order book emitted at least 3 updates',
    books.length >= 3,
    `updates=${books.length}`,
  );
  const first = books[0];
  check(
    result,
    'book has populated bid and ask sides',
    first !== undefined && first.bids > 0 && first.asks > 0,
    `bids=${first?.bids} asks=${first?.asks}`,
  );
  check(
    result,
    'mid price positive and spread non-negative',
    first !== undefined && first.mid > 0 && first.spread >= 0,
    `mid=${first?.mid} spread=${first?.spread}`,
  );
  record(result, { orderBookUpdates: books.length });
}

/**
 * Prove the live candle stream: seeded history plus at least one WS update.
 *
 * @param result - Phase result accumulator.
 */
async function phaseCandlesStream(result: PhaseResult): Promise<void> {
  const provider = new LighterProvider({
    isTestnet: true,
    platformDependencies: buildInfrastructure(),
    lighterAuthConfig: {},
  });

  const emissions: number[] = [];
  const unsubscribe = provider.subscribeToCandles({
    symbol: MARKET,
    interval: '1m' as never,
    callback: (data) => {
      emissions.push(data.candles.length);
    },
  });
  const deadline = Date.now() + 45_000;
  while (emissions.length < 2 && Date.now() < deadline) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  unsubscribe();
  await provider.disconnect();

  check(
    result,
    'candle stream seeded and delivered at least one live update',
    emissions.length >= 2,
    `emissions=${emissions.length}`,
  );
  check(
    result,
    'seed carries a full history window',
    (emissions[0] ?? 0) >= 50,
    `seedCount=${emissions[0]}`,
  );
  record(result, { candleEmissions: emissions.length });
}

/**
 * Prove editOrder: reprice a real resting order and verify the new price.
 *
 * @param result - Phase result accumulator.
 */
async function phaseEditOrder(result: PhaseResult): Promise<void> {
  const bridge = await createNodeWasmBridge(WASM_DIR);
  const provider = new LighterProvider({
    isTestnet: true,
    platformDependencies: buildInfrastructure(),
    signerBridge: bridge,
    lighterAuthConfig: {
      accountIndex: ACCOUNT_INDEX,
      apiKeyIndex: API_KEY_INDEX,
      l1Address: viemAccount.address,
      personalSigner,
    },
  });
  await provider.initialize();

  const client = new LighterClientService(buildInfrastructure(), {
    isTestnet: true,
  });
  const meta = (await client.getOrderBooks()).find(
    (entry) => entry.symbol === MARKET,
  );
  const lastPrice =
    (await client.getOrderBookDetails()).orderBookDetails.find(
      (entry) => entry.symbol === MARKET,
    )?.lastTradePrice ?? 0;
  if (!meta || lastPrice <= 0) {
    check(result, 'live market metadata available', false);
    await provider.disconnect();
    return;
  }
  const priceDecimals = meta.supportedPriceDecimals;
  const restingPrice = Number((lastPrice * 0.6).toFixed(priceDecimals));
  const editedPrice = Number((lastPrice * 0.55).toFixed(priceDecimals));
  const size = computeLighterMinOrderSize(meta, restingPrice);

  const placed = await provider.placeOrder({
    symbol: MARKET,
    isBuy: true,
    size: String(size),
    orderType: 'limit',
    price: String(restingPrice),
  });
  check(result, 'resting order placed', Boolean(placed.success), placed.error);

  let orderId: string | null = null;
  await poll(
    'resting order visible',
    async () => await provider.getOpenOrders(),
    (orders) =>
      orders.some((order) => {
        if (
          order.symbol === MARKET &&
          Math.abs(parseFloat(order.price) - restingPrice) < 0.01 * restingPrice
        ) {
          orderId = order.orderId;
          return true;
        }
        return false;
      }),
    45_000,
  );
  if (!orderId) {
    check(result, 'resting order id resolved', false);
    await provider.disconnect();
    return;
  }

  const edited = await provider.editOrder({
    orderId,
    newOrder: {
      symbol: MARKET,
      isBuy: true,
      size: String(size),
      orderType: 'limit',
      price: String(editedPrice),
    },
  });
  check(result, 'editOrder succeeds', Boolean(edited.success), edited.error);

  let editedOrderId: string | null = null;
  await poll(
    'order shows the edited price',
    async () => await provider.getOpenOrders(),
    (orders) =>
      orders.some((order) => {
        if (
          order.symbol === MARKET &&
          Math.abs(parseFloat(order.price) - editedPrice) < 0.01 * editedPrice
        ) {
          editedOrderId = order.orderId;
          return true;
        }
        return false;
      }),
    45_000,
  );
  check(result, 'edited price visible in open orders', editedOrderId !== null);

  if (editedOrderId) {
    const canceled = await provider.cancelOrder({
      orderId: editedOrderId,
      symbol: MARKET,
    });
    check(result, 'cleanup cancel succeeds', canceled.success, canceled.error);
  }
  await provider.disconnect();
}

/**
 * Prove the withdraw SIGNING path only — produces a valid signed L2 withdraw
 * without submitting it (no funds move on the shared account).
 *
 * @param result - Phase result accumulator.
 */
async function phaseWithdrawSign(result: PhaseResult): Promise<void> {
  const bridge = await createNodeWasmBridge(WASM_DIR);
  const wallet = new LighterWalletService(buildInfrastructure(), {
    isTestnet: true,
    personalSigner,
    l1Address: viemAccount.address,
  });
  const seed = await wallet.deriveKeySeedPlain(API_KEY_INDEX);
  const client = new LighterClientService(buildInfrastructure(), {
    isTestnet: true,
  });
  const { nonce } = await client.getNextNonce(ACCOUNT_INDEX, API_KEY_INDEX);
  const created = await bridge.execute<LighterCreateClientResult>({
    function: '_createClient',
    params: [
      seed,
      LIGHTER_TESTNET_CHAIN_ID,
      ACCOUNT_INDEX,
      nonce,
      API_KEY_INDEX,
    ],
  });
  check(
    result,
    'signer client created',
    Boolean(created.success),
    created.error,
  );

  const signed = await bridge.execute<LighterTxResult>({
    function: '_signWithdraw',
    params: [ACCOUNT_INDEX, 1, 0, '1000000', nonce],
  });
  check(
    result,
    'withdraw transaction signs (1 USDC, NOT submitted)',
    !signed.error &&
      typeof signed.txInfo === 'string' &&
      signed.txInfo.length > 0,
    signed.error,
  );
  record(result, { withdrawTxInfoLength: signed.txInfo?.length });
}

/**
 * Prove mainnet read paths: full market catalog, live WS prices, candles.
 * Read-only — no account, no writes.
 *
 * @param result - Phase result accumulator.
 */
async function phaseMainnetReads(result: PhaseResult): Promise<void> {
  const provider = new LighterProvider({
    isTestnet: false,
    platformDependencies: buildInfrastructure(),
    lighterAuthConfig: {},
  });

  const markets = await provider.getMarkets();
  check(
    result,
    'mainnet serves a large active perp catalog (>=100 markets)',
    markets.length >= 100,
    `markets=${markets.length}`,
  );

  const cycles: number[] = [];
  const unsubscribe = provider.subscribeToPrices({
    symbols: [],
    callback: (updates) => {
      cycles.push(updates.length);
    },
  });
  const deadline = Date.now() + 20_000;
  while (cycles.length < 3 && Date.now() < deadline) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  unsubscribe();
  check(
    result,
    'mainnet WS price stream delivers snapshot + live updates',
    cycles.length >= 3,
    `cycles=${cycles.length}`,
  );
  check(
    result,
    'mainnet snapshot covers the catalog',
    (cycles[0] ?? 0) >= 100,
    `snapshotSize=${cycles[0]}`,
  );

  const candles = await provider.fetchHistoricalCandles({
    symbol: 'BTC',
    interval: '15m' as never,
    limit: 30,
  });
  check(
    result,
    'mainnet candles return live history',
    candles.candles.length >= 20 &&
      parseFloat(candles.candles.at(-1)?.close ?? '0') > 0,
    `count=${candles.candles.length} close=${candles.candles.at(-1)?.close}`,
  );
  await provider.disconnect();
  record(result, {
    mainnetMarkets: markets.length,
    mainnetSnapshotSize: cycles[0],
  });
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const result: PhaseResult = { phase: PHASE, ok: true, checks: [] };

  try {
    switch (PHASE) {
      case 'sign-only':
        await phaseSignOnly(result);
        break;
      case 'register':
        await phaseRegister(result);
        break;
      case 'order-lifecycle':
        await phaseOrderLifecycle(result);
        break;
      case 'controller':
        await phaseController(result);
        break;
      case 'price-stream':
        await phasePriceStream(result);
        break;
      case 'account-stream':
        await phaseAccountStream(result);
        break;
      case 'positions-stream':
        await phasePositionsStream(result);
        break;
      case 'orders-stream':
        await phaseOrdersStream(result);
        break;
      case 'candles':
        await phaseCandles(result);
        break;
      case 'close-position':
        await phaseClosePosition(result);
        break;
      case 'order-book-stream':
        await phaseOrderBookStream(result);
        break;
      case 'candles-stream':
        await phaseCandlesStream(result);
        break;
      case 'edit-order':
        await phaseEditOrder(result);
        break;
      case 'withdraw-sign':
        await phaseWithdrawSign(result);
        break;
      case 'mainnet-reads':
        await phaseMainnetReads(result);
        break;
      default:
        throw new Error(`Unknown phase: ${PHASE}`);
    }
  } catch (error) {
    check(result, `${PHASE} completed without exception`, false, String(error));
  }

  await writeFile(
    join(OUT_DIR, `${PHASE}.json`),
    JSON.stringify(result, null, 2),
  );
  process.stdout.write(
    `${result.ok ? 'PHASE_PASS' : 'PHASE_FAIL'}: ${PHASE} (${result.checks.filter((entry) => entry.ok).length}/${result.checks.length} checks)\n`,
  );
  process.exitCode = result.ok ? 0 : 1;
}

main().catch((error) => {
  process.stderr.write(`FATAL: ${String(error)}\n`);
  process.exitCode = 1;
});
