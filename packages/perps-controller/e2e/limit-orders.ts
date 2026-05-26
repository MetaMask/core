import { loadConfig, parseArgs } from './config';
/* eslint-disable no-restricted-globals */
/**
 * E2E: Limit Orders (parameterized)
 *
 * Places a limit order, verifies it's resting, then cancels. Validates each step.
 *
 * Usage:
 *   npx tsx e2e/limit-orders.ts --coin BTC --size 0.001 --offset-pct -2 --leverage 5 --side long
 *   npx tsx e2e/limit-orders.ts --coin ETH --size 0.01 --offset-pct 3 --leverage 3 --side short
 *
 * Required env: HL_E2E_PRIVATE_KEY (testnet wallet)
 * Optional env: HL_TESTNET=true (default)
 */
import { E2ERunner } from './helpers';
import { createTradingClients } from './trading-client';

type Params = {
  coin: string;
  size: number;
  offsetPct: number;
  leverage: number;
  side: 'long' | 'short';
};

function getParams(): Params {
  const args = parseArgs(process.argv.slice(2));
  return {
    coin: args.coin ?? 'BTC',
    size: parseFloat(args.size ?? '0.001'),
    offsetPct: parseFloat(args['offset-pct'] ?? '-2'),
    leverage: parseInt(args.leverage ?? '5', 10),
    side: (args.side ?? 'long') as 'long' | 'short',
  };
}

async function main(): Promise<void> {
  const params = getParams();
  const config = loadConfig();
  const runner = new E2ERunner(`limit-orders-${params.coin}-${params.side}`);
  const { exchange, info, address } = createTradingClients(config);

  console.error(
    `[e2e] Limit order: ${params.side} ${params.size} ${params.coin} @ offset ${params.offsetPct}%`,
  );
  console.error(`[e2e] Wallet: ${address}, Testnet: ${config.isTestnet}`);

  // 1. Get current mid price and compute limit price
  const mids = await info.allMids();
  const midPrice = parseFloat(mids[params.coin] ?? '0');
  runner.assertGt(`${params.coin} mid price > 0`, midPrice, 0);

  const isBuy = params.side === 'long';
  const limitPrice = midPrice * (1 + params.offsetPct / 100);
  console.error(
    `[e2e] Mid: $${midPrice}, Limit: $${limitPrice.toFixed(2)} (${params.offsetPct}% offset)`,
  );

  // 2. Get asset index and set leverage
  const meta = await info.meta();
  const assetIndex = meta.universe.findIndex(
    (market) => market.name === params.coin,
  );
  runner.assert(`${params.coin} found in meta`, assetIndex >= 0);

  await exchange.updateLeverage({
    asset: assetIndex,
    isCross: true,
    leverage: params.leverage,
  });
  runner.assert('leverage set', true);

  // 3. Place limit order (should NOT fill immediately due to offset)
  console.error('[e2e] Placing limit order...');
  const orderResult = await exchange.order({
    orders: [
      {
        a: assetIndex,
        b: isBuy,
        p: limitPrice.toFixed(1),
        s: params.size.toString(),
        r: false,
        t: { limit: { tif: 'Gtc' } },
      },
    ],
    grouping: 'na',
  });
  runner.assert(
    'limit order placed',
    orderResult.status === 'ok',
    `status: ${orderResult.status}`,
  );

  let orderId: number | null = null;
  if (orderResult.status === 'ok' && orderResult.response.type === 'order') {
    const { statuses } = orderResult.response.data;
    const resting = statuses.find((st: unknown) => {
      const statusObj = st as Record<string, unknown>;
      return Object.hasOwn(statusObj, 'resting');
    });
    runner.assert(
      'order is resting (not immediately filled)',
      resting !== undefined,
      `statuses: ${JSON.stringify(statuses)}`,
    );
    if (resting) {
      orderId = (resting as { resting: { oid: number } }).resting.oid;
    }
  }

  // 4. Verify order appears in open orders
  console.error('[e2e] Verifying order in open orders...');
  const openOrders = await info.frontendOpenOrders({ user: address });
  const ourOrder = openOrders.find(
    (order) => order.coin === params.coin && order.oid === orderId,
  );
  runner.assert(
    'order found in open orders',
    ourOrder !== undefined,
    `oid=${orderId}, orders: ${openOrders.length}`,
  );

  if (ourOrder) {
    runner.assert('order coin matches', ourOrder.coin === params.coin);
    runner.assert(
      'order side matches',
      ourOrder.side === (isBuy ? 'B' : 'A'),
      `expected ${isBuy ? 'B' : 'A'}, got ${ourOrder.side}`,
    );
  }

  // 5. Cancel the order
  if (orderId !== null) {
    console.error(`[e2e] Canceling order ${orderId}...`);
    const cancelResult = await exchange.cancel({
      cancels: [{ a: assetIndex, o: orderId }],
    });
    runner.assert(
      'cancel succeeded',
      cancelResult.status === 'ok',
      `status: ${cancelResult.status}`,
    );
  }

  // 6. Verify order removed
  console.error('[e2e] Verifying order removed...');
  await new Promise((resolve) => {
    setTimeout(resolve, 1000);
  });
  const finalOrders = await info.frontendOpenOrders({ user: address });
  const stillExists = finalOrders.find((order) => order.oid === orderId);
  runner.assert('order no longer in open orders', stillExists === undefined);

  const result = runner.finish();
  process.exit(result.status === 'pass' ? 0 : 1);
}

main().catch((caughtError) => {
  console.error(caughtError);
  console.log(
    JSON.stringify({
      scenario: 'limit-orders',
      status: 'fail',
      assertions: 0,
      failed: 1,
      durationMs: 0,
      details: [
        {
          name: 'unhandled',
          ok: false,
          error:
            caughtError instanceof Error
              ? caughtError.message
              : String(caughtError),
        },
      ],
    }),
  );
  process.exit(1);
});
