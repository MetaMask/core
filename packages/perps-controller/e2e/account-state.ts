/**
 * E2E: Account State
 * Queries clearinghouseState for a known public address on HyperLiquid mainnet.
 * Validates the response shape matches what the controller expects.
 */
import { createClient, E2ERunner } from './helpers';

const KNOWN_PUBLIC_ADDRESS = '0x0000000000000000000000000000000000000001';

async function main(): Promise<void> {
  const runner = new E2ERunner('account-state');
  const client = createClient();

  // 1. Fetch clearinghouseState for a public address (empty account is fine — validates shape)
  console.error('[e2e] Fetching clearinghouseState...');
  const state = await client.clearinghouseState({ user: KNOWN_PUBLIC_ADDRESS });

  runner.assertType('state is object', state, 'object');
  runner.assert('state has marginSummary', 'marginSummary' in state);
  runner.assert('state has crossMarginSummary', 'crossMarginSummary' in state);
  runner.assert('state has assetPositions', 'assetPositions' in state);

  if (state.marginSummary) {
    runner.assertType('marginSummary.accountValue is string', state.marginSummary.accountValue, 'string');
    runner.assertType('marginSummary.totalRawUsd is string', state.marginSummary.totalRawUsd, 'string');
  }

  runner.assertArray('assetPositions', state.assetPositions, 0);

  // 2. Fetch frontendOpenOrders (should be empty for this address)
  console.error('[e2e] Fetching frontendOpenOrders...');
  const orders = await client.frontendOpenOrders({ user: KNOWN_PUBLIC_ADDRESS });
  runner.assertArray('frontendOpenOrders', orders, 0);

  // 3. Validate predictedFundings shape
  console.error('[e2e] Fetching predictedFundings...');
  const fundings = await client.predictedFundings();
  runner.assertArray('predictedFundings', fundings, 1);

  if (fundings.length > 0) {
    const first = fundings[0];
    runner.assertArray('funding entry is tuple', first, 2);
  }

  const result = runner.finish();
  process.exit(result.status === 'pass' ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  console.log(JSON.stringify({ scenario: 'account-state', status: 'fail', assertions: 0, failed: 1, duration_ms: 0, details: [{ name: 'unhandled', ok: false, error: err.message }] }));
  process.exit(1);
});
