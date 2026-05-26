import { loadConfig, parseArgs } from './config';
/* eslint-disable no-restricted-globals */
/**
 * E2E: Trading Lifecycle (parameterized)
 *
 * Opens a position, optionally sets TP/SL, then closes. Validates each step.
 *
 * Usage:
 *   npx tsx e2e/trading-lifecycle.ts --coin BTC --size 0.001 --leverage 5 --side long --tp-pct 5 --sl-pct 3
 *   npx tsx e2e/trading-lifecycle.ts --coin ETH --size 0.01 --leverage 3 --side short --tp-pct 10 --sl-pct 5
 *
 * Required env: HL_E2E_PRIVATE_KEY (testnet wallet)
 * Optional env: HL_TESTNET=true (default)
 */
import { E2ERunner } from './helpers';
import { createTradingClients } from './trading-client';

type Params = {
  coin: string;
  size: number;
  leverage: number;
  side: 'long' | 'short';
  tpPct: number | null;
  slPct: number | null;
};

function getParams(): Params {
  const args = parseArgs(process.argv.slice(2));
  return {
    coin: args.coin ?? 'BTC',
    size: parseFloat(args.size ?? '0.001'),
    leverage: parseInt(args.leverage ?? '5', 10),
    side: (args.side ?? 'long') as 'long' | 'short',
    tpPct: args['tp-pct'] ? parseFloat(args['tp-pct']) : null,
    slPct: args['sl-pct'] ? parseFloat(args['sl-pct']) : null,
  };
}

async function main(): Promise<void> {
  const params = getParams();
  const config = loadConfig();
  const runner = new E2ERunner(
    `trading-lifecycle-${params.coin}-${params.side}`,
  );
  const { exchange, info, address } = createTradingClients(config);

  console.error(
    `[e2e] Trading lifecycle: ${params.side} ${params.size} ${params.coin} @ ${params.leverage}x`,
  );
  console.error(
    `[e2e] TP: ${params.tpPct ?? 'none'}%, SL: ${params.slPct ?? 'none'}%`,
  );
  console.error(`[e2e] Wallet: ${address}, Testnet: ${config.isTestnet}`);

  // 1. Get current mid price
  const mids = await info.allMids();
  const midPrice = parseFloat(mids[params.coin] ?? '0');
  runner.assertGt(`${params.coin} mid price > 0`, midPrice, 0);
  console.error(`[e2e] ${params.coin} mid: $${midPrice}`);

  // 2. Set leverage
  console.error(`[e2e] Setting leverage to ${params.leverage}x...`);
  const meta = await info.meta();
  const assetIndex = meta.universe.findIndex(
    (market) => market.name === params.coin,
  );
  runner.assert(`${params.coin} found in meta`, assetIndex >= 0, `not found`);

  await exchange.updateLeverage({
    asset: assetIndex,
    isCross: true,
    leverage: params.leverage,
  });
  runner.assert('leverage set', true);

  // 3. Place market order
  const isBuy = params.side === 'long';
  const slippagePrice = isBuy ? midPrice * 1.03 : midPrice * 0.97;

  console.error(
    `[e2e] Placing ${params.side} market order: ${params.size} ${params.coin}...`,
  );
  const orderResult = await exchange.order({
    orders: [
      {
        a: assetIndex,
        b: isBuy,
        p: slippagePrice.toFixed(1),
        s: params.size.toString(),
        r: false,
        t: { limit: { tif: 'Ioc' } },
      },
    ],
    grouping: 'na',
  });
  runner.assert(
    'order placed',
    orderResult.status === 'ok',
    `status: ${orderResult.status}`,
  );

  if (orderResult.status === 'ok') {
    const { response } = orderResult;
    runner.assert(
      'order response type',
      response.type === 'order',
      `got ${response.type}`,
    );
    if (response.type === 'order') {
      const { statuses } = response.data;
      const filled = statuses.some((st: unknown) => {
        const statusObj = st as Record<string, unknown>;
        return Object.hasOwn(statusObj, 'filled');
      });
      runner.assert(
        'order filled',
        filled,
        `statuses: ${JSON.stringify(statuses)}`,
      );
    }
  }

  // 4. Verify position exists
  console.error('[e2e] Verifying position...');
  const state = await info.clearinghouseState({ user: address });
  const position = state.assetPositions.find((pos) => {
    const item = pos.position;
    return item.coin === params.coin && parseFloat(item.szi) !== 0;
  });
  runner.assert(
    'position exists',
    position !== undefined,
    'no open position found',
  );

  if (position) {
    const posSize = parseFloat(position.position.szi);
    const expectedSign = isBuy ? 1 : -1;
    runner.assert(
      'position side correct',
      Math.sign(posSize) === expectedSign,
      `expected ${params.side}, got size=${posSize}`,
    );
  }

  // 5. Set TP/SL if requested
  if (params.tpPct !== null || params.slPct !== null) {
    console.error(
      `[e2e] Setting TP/SL: tp=${params.tpPct}% sl=${params.slPct}%...`,
    );
    const entryPrice = position
      ? parseFloat(position.position.entryPx)
      : midPrice;

    let tpPrice: number | null = null;
    if (params.tpPct !== null) {
      tpPrice = isBuy
        ? entryPrice * (1 + params.tpPct / 100)
        : entryPrice * (1 - params.tpPct / 100);
    }
    let slPrice: number | null = null;
    if (params.slPct !== null) {
      slPrice = isBuy
        ? entryPrice * (1 - params.slPct / 100)
        : entryPrice * (1 + params.slPct / 100);
    }

    const tpSlOrders: {
      a: number;
      b: boolean;
      p: string;
      s: string;
      r: boolean;
      t: { trigger: { triggerPx: string; isMarket: boolean; tpsl: string } };
    }[] = [];

    if (tpPrice !== null) {
      tpSlOrders.push({
        a: assetIndex,
        b: !isBuy,
        p: tpPrice.toFixed(1),
        s: params.size.toString(),
        r: true,
        t: {
          trigger: {
            triggerPx: tpPrice.toFixed(1),
            isMarket: true,
            tpsl: 'tp',
          },
        },
      });
    }
    if (slPrice !== null) {
      tpSlOrders.push({
        a: assetIndex,
        b: !isBuy,
        p: slPrice.toFixed(1),
        s: params.size.toString(),
        r: true,
        t: {
          trigger: {
            triggerPx: slPrice.toFixed(1),
            isMarket: true,
            tpsl: 'sl',
          },
        },
      });
    }

    if (tpSlOrders.length > 0) {
      const tpslResult = await exchange.order({
        orders: tpSlOrders,
        grouping: 'na',
      });
      runner.assert(
        'tp/sl orders placed',
        tpslResult.status === 'ok',
        `status: ${tpslResult.status}`,
      );
    }
  }

  // 6. Close position
  console.error('[e2e] Closing position...');
  const closePrice = isBuy ? midPrice * 0.97 : midPrice * 1.03;
  const closeResult = await exchange.order({
    orders: [
      {
        a: assetIndex,
        b: !isBuy,
        p: closePrice.toFixed(1),
        s: params.size.toString(),
        r: true,
        t: { limit: { tif: 'Ioc' } },
      },
    ],
    grouping: 'na',
  });
  runner.assert(
    'close order placed',
    closeResult.status === 'ok',
    `status: ${closeResult.status}`,
  );

  // 7. Verify position closed
  console.error('[e2e] Verifying position closed...');
  await new Promise((resolve) => {
    setTimeout(resolve, 2000);
  });
  const finalState = await info.clearinghouseState({ user: address });
  const remainingPosition = finalState.assetPositions.find((pos) => {
    const item = pos.position;
    return item.coin === params.coin && parseFloat(item.szi) !== 0;
  });
  runner.assert(
    'position closed',
    remainingPosition === undefined,
    remainingPosition
      ? `remaining size: ${remainingPosition.position.szi}`
      : undefined,
  );

  const result = runner.finish();
  process.exit(result.status === 'pass' ? 0 : 1);
}

main().catch((caughtError) => {
  console.error(caughtError);
  console.log(
    JSON.stringify({
      scenario: 'trading-lifecycle',
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
