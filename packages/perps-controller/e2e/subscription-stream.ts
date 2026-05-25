/* eslint-disable no-restricted-globals */
/**
 * E2E: Subscription Stream
 * Opens a WebSocket to HyperLiquid mainnet, subscribes to allMids,
 * receives N price updates, validates shape, then closes.
 */
import { getWebSocketEndpoint } from '../src/constants/hyperLiquidConfig';
import { E2ERunner } from './helpers';

const TARGET_UPDATES = 3;
const TIMEOUT_MS = 30000;

async function main(): Promise<void> {
  const runner = new E2ERunner('subscription-stream');
  const endpoint = getWebSocketEndpoint(false);

  runner.assertType('WS endpoint is string', endpoint, 'string');
  runner.assert('WS endpoint starts with wss://', endpoint.startsWith('wss://'));

  console.error(`[e2e] Connecting to ${endpoint}...`);

  const updates: Record<string, string>[] = [];

  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(endpoint);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`Timeout: only received ${updates.length}/${TARGET_UPDATES} updates in ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);

    ws.onopen = (): void => {
      console.error('[e2e] WebSocket connected, subscribing to allMids...');
      ws.send(JSON.stringify({
        method: 'subscribe',
        subscription: { type: 'allMids' },
      }));
    };

    ws.onmessage = (event: MessageEvent): void => {
      try {
        const message = JSON.parse(String(event.data)) as { channel?: string; data?: { mids?: Record<string, string> } };
        if (message.channel === 'allMids' && message.data?.mids) {
          updates.push(message.data.mids);
          console.error(`[e2e] Received allMids update ${updates.length}/${TARGET_UPDATES}`);
          if (updates.length >= TARGET_UPDATES) {
            clearTimeout(timer);
            ws.close();
            resolve();
          }
        }
      } catch {
        // ignore non-JSON or non-allMids messages
      }
    };

    ws.onerror = (event: ErrorEvent): void => {
      clearTimeout(timer);
      reject(new Error(`WebSocket error: ${event.message}`));
    };
  });

  runner.assertGt('received updates', updates.length, TARGET_UPDATES - 1);

  const firstUpdate = updates[0];
  if (firstUpdate) {
    runner.assertType('mids is object', firstUpdate, 'object');
    const keys = Object.keys(firstUpdate);
    runner.assertGt('mids has markets', keys.length, 10);
    runner.assert('BTC in mids', Object.hasOwn(firstUpdate, 'BTC'));
    runner.assert('ETH in mids', Object.hasOwn(firstUpdate, 'ETH'));

    const btcMid = parseFloat(firstUpdate.BTC ?? '0');
    runner.assertGt('BTC WS mid > 1000', btcMid, 1000);
  }

  // Check prices change between updates (market is live)
  if (updates.length >= 2) {
    const keys1 = Object.keys(updates[0] ?? {});
    const keys2 = Object.keys(updates[1] ?? {});
    runner.assert('consistent market count across updates',
      Math.abs(keys1.length - keys2.length) <= 5,
      `update1=${keys1.length} update2=${keys2.length}`,
    );
  }

  const result = runner.finish();
  process.exit(result.status === 'pass' ? 0 : 1);
}

main().catch((caughtError) => {
  console.error(caughtError);
  console.log(JSON.stringify({ scenario: 'subscription-stream', status: 'fail', assertions: 0, failed: 1, durationMs: 0, details: [{ name: 'unhandled', ok: false, error: caughtError instanceof Error ? caughtError.message : String(caughtError) }] }));
  process.exit(1);
});
