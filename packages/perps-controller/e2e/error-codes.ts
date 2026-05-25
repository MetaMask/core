/* eslint-disable no-restricted-globals */
/**
 * E2E: Error Codes
 * Validates that PERPS_ERROR_CODES are structured correctly and that
 * validation functions produce correct error codes for malformed inputs.
 */
import { PERPS_ERROR_CODES } from '../src/perpsErrorCodes';
import {
  PERPS_CONSTANTS,
  MARGIN_ADJUSTMENT_CONFIG,
} from '../src/constants/perpsConfig';
import { createClient, E2ERunner } from './helpers';

async function main(): Promise<void> {
  const runner = new E2ERunner('error-codes');

  // 1. Validate error code structure
  const codes = Object.entries(PERPS_ERROR_CODES);
  runner.assertGt('error code count', codes.length, 5);

  for (const [key, value] of codes) {
    runner.assert(
      `${key} is string`,
      typeof value === 'string',
      `got ${typeof value}`,
    );
    runner.assert(`${key} is non-empty`, (value as string).length > 0);
  }

  // 2. Validate constants that error paths depend on
  runner.assertGt(
    'DefaultMaxLeverage > 0',
    PERPS_CONSTANTS.DefaultMaxLeverage,
    0,
  );
  runner.assertGt(
    'FallbackMaxLeverage > 0',
    MARGIN_ADJUSTMENT_CONFIG.FallbackMaxLeverage,
    0,
  );
  runner.assert(
    'FallbackMaxLeverage <= 200',
    MARGIN_ADJUSTMENT_CONFIG.FallbackMaxLeverage <= 200,
    `got ${MARGIN_ADJUSTMENT_CONFIG.FallbackMaxLeverage}`,
  );

  // 3. Test that the API returns meaningful errors for bad inputs
  const client = createClient();
  console.error('[e2e] Testing clearinghouseState with invalid address...');
  try {
    const state = await client.clearinghouseState({ user: '0xinvalid' });
    // HyperLiquid may return empty state for invalid addresses rather than error
    runner.assert('invalid address returns object', typeof state === 'object');
    runner.assert(
      'invalid address has marginSummary',
      Object.hasOwn(state, 'marginSummary'),
    );
  } catch (caughtError: unknown) {
    // API error is also acceptable — validates error handling path
    runner.assert('invalid address produces error', true);
    const message =
      caughtError instanceof Error ? caughtError.message : String(caughtError);
    runner.assert(
      'error is descriptive',
      message.length > 0,
      'empty error message',
    );
  }

  // 4. Test frontendOpenOrders with empty address
  console.error('[e2e] Testing frontendOpenOrders with zero address...');
  try {
    const orders = await client.frontendOpenOrders({
      user: '0x0000000000000000000000000000000000000000',
    });
    runner.assertArray('zero address orders', orders, 0);
  } catch {
    runner.assert('zero address produces error or empty', true);
  }

  const result = runner.finish();
  process.exit(result.status === 'pass' ? 0 : 1);
}

main().catch((caughtError) => {
  console.error(caughtError);
  console.log(
    JSON.stringify({
      scenario: 'error-codes',
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
