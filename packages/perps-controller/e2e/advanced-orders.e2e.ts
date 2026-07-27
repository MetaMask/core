/**
 * Advanced order types — end-to-end contract proof (TAT-3511).
 *
 * For every advanced order type this script proves the full round trip:
 *
 *   place -> visible in open-orders state with the correct trigger data
 *         -> cancel -> absent from open-orders state
 *
 * The case matrix, exchange doubles, and assertions live in
 * `e2e/lib/advancedOrders.ts` and are shared with the Jest contract guard
 * (`tests/src/e2e/advanced-orders.contract.test.ts`), so this script and CI can
 * never drift apart. Only the transport differs per mode:
 *
 * - `simulated` (default): an in-process HyperLiquid double that stores the
 *   submitted payloads and renders them back in HyperLiquid's
 *   `frontendOpenOrders` shape. Deterministic, needs no credentials, and runs
 *   from a clean checkout.
 * - `testnet`: the real HyperLiquid testnet through `@nktkas/hyperliquid`.
 *   Requires `PERPS_E2E_PRIVATE_KEY` and `PERPS_E2E_ADDRESS`.
 *
 * Usage:
 *   npx tsx e2e/advanced-orders.e2e.ts [--mode=simulated|testnet] [--out=DIR] [--symbol=BTC]
 *
 * Exit code is non-zero if any case fails.
 */
import fs from 'fs/promises';
import path from 'path';

import type { CaseEvidence, Mode } from './lib/advancedOrders.js';
import {
  buildCases,
  createSimulatedRunner,
  createTestnetRunner,
  runCase,
  runTypedErrorCase,
} from './lib/advancedOrders.js';
import { isTriggerOrderType } from '../src/utils/orderTypes.js';

/**
 * Parses `--key=value` CLI arguments.
 *
 * @param argv - Raw process arguments.
 * @returns The parsed options.
 */
function parseArgs(argv: string[]): {
  mode: Mode;
  out: string;
  symbol: string;
} {
  const read = (key: string): string | undefined =>
    argv
      .find((arg) => arg.startsWith(`--${key}=`))
      ?.slice(`--${key}=`.length);

  const requestedMode = read('mode');
  if (requestedMode && requestedMode !== 'simulated' && requestedMode !== 'testnet') {
    throw new Error(`Unknown --mode: ${requestedMode}`);
  }

  return {
    mode: (requestedMode as Mode | undefined) ?? 'simulated',
    // eslint-disable-next-line n/no-process-env
    out: read('out') ?? process.env.PERPS_E2E_OUT ?? 'e2e/artifacts',
    // eslint-disable-next-line n/no-process-env
    symbol: read('symbol') ?? process.env.PERPS_E2E_SYMBOL ?? 'BTC',
  };
}

/**
 * Renders the human-readable summary table.
 *
 * @param params - Summary inputs.
 * @param params.mode - Run mode.
 * @param params.symbol - Market symbol.
 * @param params.results - Case evidence.
 * @param params.errorCase - Typed-error case evidence.
 * @returns The markdown summary.
 */
function renderSummary(params: {
  mode: Mode;
  symbol: string;
  results: CaseEvidence[];
  errorCase: ReturnType<typeof runTypedErrorCase>;
}): string {
  const { mode, symbol, results, errorCase } = params;

  const rows = results.map((result) => {
    const trigger =
      result.readBack?.triggerOrderType ?? result.readBack?.orderType ?? '—';
    return `| ${result.case} | ${mode} | yes | ${trigger} @ ${
      result.readBack?.triggerPrice ?? '—'
    } | ${result.cancelled ? 'cancelled' : 'STILL OPEN'} | ${
      result.pass ? 'PASS' : 'FAIL'
    } |`;
  });

  return [
    `# Advanced order types — e2e evidence (${mode})`,
    '',
    `Market: \`${symbol}\``,
    '',
    '| type | mode | placed | visible in open orders (trigger data) | cancelled/triggered | result |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
    `| ${errorCase.case} | ${mode} | n/a | typed error \`${errorCase.actualError}\` | n/a | ${
      errorCase.pass ? 'PASS' : 'FAIL'
    } |`,
    '',
    '## Per-check detail',
    '',
    ...results.flatMap((result) => [
      `### ${result.case}`,
      '',
      result.description,
      '',
      ...result.checks.map(
        (check) =>
          `- ${check.pass ? 'PASS' : 'FAIL'} — ${check.name}: expected \`${JSON.stringify(
            check.expected,
          )}\`, got \`${JSON.stringify(check.actual)}\``,
      ),
      '',
    ]),
  ].join('\n');
}

/**
 * Runs the whole matrix and writes the evidence artifacts.
 */
async function main(): Promise<void> {
  const { mode, out, symbol } = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(process.cwd(), out);
  await fs.mkdir(outDir, { recursive: true });

  const runner =
    mode === 'testnet' ? await createTestnetRunner() : createSimulatedRunner();

  const cases = buildCases(symbol);
  const results: CaseEvidence[] = [];

  for (const testCase of cases) {
    // Sanity check on the case matrix itself: every trigger placement must
    // carry a trigger price, otherwise the case proves nothing.
    if (
      isTriggerOrderType(testCase.params.orderType) &&
      !testCase.params.triggerPrice
    ) {
      throw new Error(`Case ${testCase.name} is missing a trigger price`);
    }

    const result = await runCase({ testCase, runner, mode, symbol });
    results.push(result);
    await fs.writeFile(
      path.join(outDir, `${result.case}.json`),
      `${JSON.stringify(result, null, 2)}\n`,
    );
    process.stdout.write(
      `${result.pass ? 'PASS' : 'FAIL'} ${result.case}: ${result.description}\n`,
    );
  }

  const errorCase = runTypedErrorCase();
  await fs.writeFile(
    path.join(outDir, `${errorCase.case}.json`),
    `${JSON.stringify(errorCase, null, 2)}\n`,
  );
  process.stdout.write(
    `${errorCase.pass ? 'PASS' : 'FAIL'} ${errorCase.case}: ${errorCase.actualError}\n`,
  );

  const allPass = results.every((result) => result.pass) && errorCase.pass;

  await fs.writeFile(
    path.join(outDir, 'summary.json'),
    `${JSON.stringify({ mode, symbol, allPass, results, errorCase }, null, 2)}\n`,
  );
  await fs.writeFile(
    path.join(outDir, 'summary.md'),
    renderSummary({ mode, symbol, results, errorCase }),
  );

  process.stdout.write(
    `\n${allPass ? 'All cases passed' : 'Some cases FAILED'} — evidence written to ${outDir}\n`,
  );

  if (!allPass) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exitCode = 1;
});
