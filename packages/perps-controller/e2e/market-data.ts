/* eslint-disable no-restricted-globals */
/**
 * E2E: Market Data
 * Fetches real market metadata and mid prices from HyperLiquid mainnet.
 * Validates structure, types, and basic sanity (BTC exists, prices > 0).
 */
import { createClient, E2ERunner } from './helpers';

async function main(): Promise<void> {
  const runner = new E2ERunner('market-data');
  const client = createClient();

  // 1. Fetch meta (market universe)
  console.error('[e2e] Fetching meta...');
  const meta = await client.meta();

  runner.assertArray('meta.universe', meta.universe, 1);
  runner.assertGt('market count', meta.universe.length, 10);

  const btc = meta.universe.find((market) => market.name === 'BTC');
  runner.assert('BTC market exists', btc !== undefined);
  if (btc) {
    runner.assertType('BTC szDecimals', btc.szDecimals, 'number');
    runner.assertGt('BTC szDecimals > 0', btc.szDecimals, 0);
  }

  const eth = meta.universe.find((market) => market.name === 'ETH');
  runner.assert('ETH market exists', eth !== undefined);

  // 2. Fetch metaAndAssetCtxs (meta + live context)
  console.error('[e2e] Fetching metaAndAssetCtxs...');
  const [metaResult, assetCtxs] = await client.metaAndAssetCtxs();

  runner.assertArray('metaAndAssetCtxs[0].universe', metaResult.universe, 1);
  runner.assertArray('assetCtxs', assetCtxs, 1);
  runner.assert(
    'meta and assetCtxs same length',
    metaResult.universe.length === assetCtxs.length,
    `meta=${metaResult.universe.length} assetCtxs=${assetCtxs.length}`,
  );

  const btcIdx = metaResult.universe.findIndex((market) => market.name === 'BTC');
  if (btcIdx >= 0) {
    const btcCtx = assetCtxs[btcIdx];
    runner.assertType('BTC markPx is string', btcCtx?.markPx, 'string');
    const markPx = parseFloat(btcCtx?.markPx ?? '0');
    runner.assertGt('BTC markPx > 1000', markPx, 1000);
  }

  // 3. Fetch allMids (mid prices)
  console.error('[e2e] Fetching allMids...');
  const mids = await client.allMids();

  runner.assertType('allMids is object', mids, 'object');
  const btcMid = parseFloat(mids.BTC ?? '0');
  runner.assertGt('BTC mid price > 1000', btcMid, 1000);

  const ethMid = parseFloat(mids.ETH ?? '0');
  runner.assertGt('ETH mid price > 100', ethMid, 100);

  // 4. Fetch spotMeta
  console.error('[e2e] Fetching spotMeta...');
  const spotMeta = await client.spotMeta();
  runner.assertArray('spotMeta.tokens', spotMeta.tokens, 1);
  runner.assertArray('spotMeta.universe', spotMeta.universe, 1);

  const usdcToken = spotMeta.tokens.find((token) => token.name === 'USDC');
  runner.assert('USDC token exists in spotMeta', usdcToken !== undefined);

  const result = runner.finish();
  process.exit(result.status === 'pass' ? 0 : 1);
}

main().catch((caughtError) => {
  console.error(caughtError);
  console.log(JSON.stringify({ scenario: 'market-data', status: 'fail', assertions: 0, failed: 1, durationMs: 0, details: [{ name: 'unhandled', ok: false, error: caughtError instanceof Error ? caughtError.message : String(caughtError) }] }));
  process.exit(1);
});
