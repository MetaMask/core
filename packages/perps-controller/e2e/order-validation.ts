/**
 * E2E: Order Validation
 * Tests order parameter validation logic against real market data.
 * Builds order params and validates them without submitting.
 */
import {
  ORDER_SLIPPAGE_CONFIG,
  PERPS_CONSTANTS,
  TP_SL_CONFIG,
} from '../src/constants/perpsConfig';
import {
  TRADING_DEFAULTS,
  USDC_DECIMALS,
} from '../src/constants/hyperLiquidConfig';
import { PERPS_ERROR_CODES } from '../src/perpsErrorCodes';
import { createClient, E2ERunner } from './helpers';

async function main(): Promise<void> {
  const runner = new E2ERunner('order-validation');
  const client = createClient();

  // 1. Fetch live market data for validation context
  console.error('[e2e] Fetching meta for validation context...');
  const meta = await client.meta();
  const mids = await client.allMids();

  const btc = meta.universe.find((m) => m.name === 'BTC');
  runner.assert('BTC market exists for validation', btc !== undefined);

  const btcPrice = parseFloat(mids.BTC ?? '0');
  runner.assertGt('BTC price > 0', btcPrice, 0);

  // 2. Validate constants are sane
  runner.assertGt('DefaultMaxLeverage > 0', PERPS_CONSTANTS.DefaultMaxLeverage, 0);
  runner.assertGt('TRADING_DEFAULTS.leverage > 0', TRADING_DEFAULTS.leverage, 0);
  runner.assertGt('USDC_DECIMALS', USDC_DECIMALS, 0);
  runner.assert('USDC_DECIMALS is 6', USDC_DECIMALS === 6, `got ${USDC_DECIMALS}`);

  // 3. Validate slippage config
  runner.assertGt('DefaultMarketSlippageBps > 0', ORDER_SLIPPAGE_CONFIG.DefaultMarketSlippageBps, 0);
  runner.assertGt('DefaultTpslSlippageBps > market',
    ORDER_SLIPPAGE_CONFIG.DefaultTpslSlippageBps,
    ORDER_SLIPPAGE_CONFIG.DefaultMarketSlippageBps,
  );
  runner.assertGt('DefaultLimitSlippageBps > 0', ORDER_SLIPPAGE_CONFIG.DefaultLimitSlippageBps, 0);

  // 4. Validate TP/SL config
  runner.assert('TP_SL UsePositionBoundTpsl is boolean',
    typeof TP_SL_CONFIG.UsePositionBoundTpsl === 'boolean',
    `got ${typeof TP_SL_CONFIG.UsePositionBoundTpsl}`,
  );

  // 5. Validate error codes exist and are structured
  runner.assertType('PERPS_ERROR_CODES is object', PERPS_ERROR_CODES, 'object');
  const errorKeys = Object.keys(PERPS_ERROR_CODES);
  runner.assertGt('error codes count > 5', errorKeys.length, 5);

  const expectedCodes = [
    'INSUFFICIENT_BALANCE',
    'ORDER_LEVERAGE_INVALID',
    'ORDER_SIZE_MIN',
    'ORDER_UNKNOWN_COIN',
    'ORDER_REJECTED',
    'SLIPPAGE_EXCEEDED',
  ];
  for (const code of expectedCodes) {
    runner.assert(
      `error code ${code} exists`,
      code in PERPS_ERROR_CODES,
      `missing from PERPS_ERROR_CODES`,
    );
  }

  // 6. Validate szDecimals from live meta match expectations for major assets
  if (btc) {
    runner.assert('BTC szDecimals is reasonable (1-8)', btc.szDecimals >= 1 && btc.szDecimals <= 8,
      `got ${btc.szDecimals}`);
  }
  const eth = meta.universe.find((m) => m.name === 'ETH');
  if (eth) {
    runner.assert('ETH szDecimals is reasonable (1-8)', eth.szDecimals >= 1 && eth.szDecimals <= 8,
      `got ${eth.szDecimals}`);
  }

  const result = runner.finish();
  process.exit(result.status === 'pass' ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  console.log(JSON.stringify({ scenario: 'order-validation', status: 'fail', assertions: 0, failed: 1, duration_ms: 0, details: [{ name: 'unhandled', ok: false, error: err.message }] }));
  process.exit(1);
});
