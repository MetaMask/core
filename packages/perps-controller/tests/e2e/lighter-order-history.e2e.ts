import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type { MockAnyNamespace } from '@metamask/messenger';
/**
 * Read one existing Lighter testnet cancellation through PerpsController.getOrders.
 * Run with tsx, not Jest. The injected signer module must export signerBridge and
 * restore an existing client-owned key. HTTP writes and transaction signing are
 * blocked; no orders or venue keys are registered by this driver.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { PerpsController } from '../../src/PerpsController.js';
import type {
  PerpsControllerMessenger,
  PerpsControllerActions,
  PerpsControllerEvents,
} from '../../src/PerpsController.js';
import type { PerpsPlatformDependencies } from '../../src/types/index.js';
import type { LighterSignerBridge } from '../../src/types/lighter-types.js';
import type {
  PerpsControllerAllowedActions,
  PerpsControllerAllowedEvents,
} from '../../src/types/messenger.js';

const { values } = parseArgs({
  options: Object.fromEntries(
    [
      'address',
      'account-index',
      'api-key-index',
      'market',
      'order-id',
      'client-order-id',
      'filled-size',
      'signer-module',
      'out',
    ].map((name) => [name, { type: 'string' as const }]),
  ),
});
for (const name of [
  'address',
  'account-index',
  'api-key-index',
  'market',
  'order-id',
  'client-order-id',
  'filled-size',
  'signer-module',
  'out',
]) {
  assert.equal(typeof values[name], 'string', `Missing --${name}`);
}
const address = String(values.address).toLowerCase();
const accountIndex = Number(values['account-index']);
const apiKeyIndex = Number(values['api-key-index']);
assert.match(address, /^0x[0-9a-f]{40}$/u);
assert(Number.isSafeInteger(accountIndex) && accountIndex >= 0);
assert(
  Number.isSafeInteger(apiKeyIndex) && apiKeyIndex >= 0 && apiKeyIndex < 255,
);
assert.match(String(values['filled-size']), /^\d+(?:\.\d+)?$/u);

const { signerBridge: injectedSigner } = (await import(
  pathToFileURL(resolve(String(values['signer-module']))).href
)) as { signerBridge: LighterSignerBridge };
const signerBridge: LighterSignerBridge = {
  async createClient(params) {
    assert.equal(params.chainId, 300);
    assert.equal(params.accountIndex, accountIndex);
    assert.equal(params.apiKeyIndex, apiKeyIndex);
    return await injectedSigner.createClient(params);
  },
  async execute(call) {
    assert.equal(
      call.function,
      '_createAuthToken',
      'Transaction signing is forbidden',
    );
    return await injectedSigner.execute(call);
  },
};

// Only platform integrations are inert. Controller, provider, validation,
// normalization, signer and HTTP reads use their real implementations.
const providerErrors: string[] = [];
const noop = (): undefined => undefined;
const infrastructure: PerpsPlatformDependencies = {
  logger: { error: noop },
  debugLogger: {
    log: (_message, meta) => {
      if (meta && typeof meta === 'object' && 'error' in meta) {
        providerErrors.push(String(meta.error));
      }
    },
  },
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
  id: 'lighter-read-proof',
  address,
  type: 'eip155:eoa',
  metadata: {
    name: 'Lighter read proof',
    importTime: 0,
    keyring: { type: 'HD Key Tree' },
  },
  options: {},
  methods: [],
  scopes: ['eip155:0'],
}));
root.delegate({
  actions: ['AccountsController:getSelectedAccount'],
  messenger,
});
const controller = new PerpsController({
  messenger: messenger as PerpsControllerMessenger,
  state: { isTestnet: true, activeProvider: 'lighter' },
  clientConfig: {
    providerCredentials: {
      lighter: {
        enabled: true,
        accountIndexTestnet: accountIndex,
        apiKeyIndex,
        signerBridge,
      },
    },
  },
  infrastructure,
  deferEligibilityCheck: true,
});

const { fetch } = globalThis;
const requests: string[] = [];
let wireOrder: Record<string, unknown> | undefined;
globalThis.fetch = async (input, init): Promise<Response> => {
  const request = new globalThis.Request(input, init);
  const url = new URL(request.url);
  assert.equal(request.method, 'GET', 'Venue writes are forbidden');
  assert.equal(url.origin, 'https://testnet.zklighter.elliot.ai');
  requests.push(url.pathname);
  const response = await fetch(request);
  if (url.pathname === '/api/v1/accountInactiveOrders') {
    assert.equal(url.searchParams.get('account_index'), String(accountIndex));
    const payload = (await response.clone().json()) as {
      orders?: Record<string, unknown>[];
    };
    const matches =
      payload.orders?.filter(
        (order) => String(order.order_index) === values['order-id'],
      ) ?? [];
    assert.equal(
      matches.length,
      1,
      'Exact canceled receipt must be present in live history',
    );
    [wireOrder] = matches;
  }
  return response;
};

const outputPath = resolve(String(values.out));
try {
  await controller.init();
  assert.equal(controller.state.activeProvider, 'lighter');
  const orders = await controller.getOrders(undefined, { forceRefresh: true });
  assert(
    wireOrder,
    `Controller must read live Lighter inactive orders: ${JSON.stringify({ requests, providerErrors })}`,
  );
  assert.equal(String(wireOrder.client_order_index), values['client-order-id']);
  assert.equal(Number(wireOrder.owner_account_index), accountIndex);
  assert.equal(wireOrder.status, 'canceled');
  assert.equal(Number(wireOrder.remaining_base_amount), 0);
  assert.equal(
    Number(wireOrder.filled_base_amount),
    Number(values['filled-size']),
  );
  const matches = orders.filter(
    (order) => order.orderId === values['order-id'],
  );
  assert.equal(matches.length, 1);
  const [order] = matches;
  assert.equal(order.providerId, 'lighter');
  assert.equal(order.symbol, values.market);
  assert.equal(order.status, 'canceled');
  const report = {
    endpoint: 'PerpsController.getOrders',
    network: 'testnet',
    provider: 'lighter',
    account: address,
    accountIndex,
    apiKeyIndex,
    orderId: order.orderId,
    clientOrderId: values['client-order-id'],
    symbol: order.symbol,
    venue: {
      original: wireOrder.initial_base_amount,
      remaining: wireOrder.remaining_base_amount,
      filled: wireOrder.filled_base_amount,
    },
    normalized: {
      original: order.originalSize,
      remaining: order.remainingSize,
      filled: order.filledSize,
      status: order.status,
    },
    expectedFilledSize: values['filled-size'],
    requests,
    ok: Number(order.filledSize) === Number(values['filled-size']),
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  assert.equal(
    report.ok,
    true,
    `Controller filled size ${order.filledSize} differs from venue ${String(wireOrder.filled_base_amount)}`,
  );
  process.stdout.write(`${JSON.stringify(report)}\n`);
} finally {
  await controller.disconnect();
  globalThis.fetch = fetch;
}
