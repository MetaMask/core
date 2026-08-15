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
