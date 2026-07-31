import { hasProperty } from '@metamask/utils';
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
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';

import type { FrontendOrder } from '../../src/types/hyperliquid-types.js';
import {
  formatHyperLiquidPrice,
  formatHyperLiquidSize,
} from '../../src/utils/hyperLiquidAdapter.js';
import { isTriggerOrderType } from '../../src/utils/orderTypes.js';
import type {
  CaseContext,
  CaseEvidence,
  ExchangeRunner,
  Mode,
  PremiseEvidence,
} from '../helpers/advancedOrders.js';
import {
  buildCases,
  buildPremiseCases,
  caseContext,
  createSimulatedRunner,
  runCase,
  runPremiseCase,
  runTypedErrorCase,
} from '../helpers/advancedOrders.js';

/**
 * Locate the wallet fixture the recipe harness already uses.
 *
 * The harness resolves it as `<projectRoot>/temp/recipe/runtime/wallet-fixture.json`
 * (see walletFixturePath in the harness). This script runs from inside the
 * checkout, so walk up from the working directory to find the same file rather
 * than asking the caller to configure a second copy of the same secret.
 *
 * @returns The fixture path, or null when no checkout above the cwd has one.
 */
async function findWalletFixture(): Promise<string | null> {
  const { access } = await import('node:fs/promises');
  const nodePath = await import('node:path');

  let dir = process.cwd();
  for (;;) {
    const candidate = nodePath.join(
      dir,
      'temp',
      'recipe',
      'runtime',
      'wallet-fixture.json',
    );
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Not in this directory; keep walking up.
    }
    const parent = nodePath.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

/**
 * Derive the testnet signer from the recipe harness's wallet fixture.
 *
 * Mirrors the harness's own derivation exactly — account selected by `name`,
 * mnemonics at BIP-44 address index 0 — so a premise probe signs as the very
 * same account the recipes trade with. One funded account, one place to rotate
 * it, and evidence from both paths that refers to the same address.
 *
 * @param accountName - Fixture account `name` to use.
 * @returns The viem account, or null when no fixture is reachable.
 */
async function signerFromWalletFixture(
  accountName: string,
): Promise<{ account: unknown; address: `0x${string}` } | null> {
  const fixturePath = await findWalletFixture();
  if (!fixturePath) {
    return null;
  }

  const { readFile } = await import('node:fs/promises');
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8')) as {
    accounts?: { type?: string; value?: string; name?: string }[];
  };

  const entry = fixture.accounts?.find((item) => item?.name === accountName);
  if (!entry?.value) {
    const names = (fixture.accounts ?? [])
      .map((item) => item?.name)
      .filter(Boolean)
      .join(', ');
    throw new Error(
      `wallet-fixture.json at ${fixturePath} has no account named "${accountName}". Available: ${names}.`,
    );
  }

  if (entry.type === 'mnemonic') {
    const account = mnemonicToAccount(entry.value.trim(), { addressIndex: 0 });
    return { account, address: account.address };
  }
  if (entry.type === 'privateKey') {
    const raw = entry.value.trim();
    const account = privateKeyToAccount(
      (raw.startsWith('0x') ? raw : `0x${raw}`) as `0x${string}`,
    );
    return { account, address: account.address };
  }
  throw new Error(
    `wallet-fixture.json account "${accountName}" must be type mnemonic or privateKey, got "${entry.type}".`,
  );
}

export async function createTestnetRunner(options: {
  assetId: number;
  accountName?: string;
}): Promise<ExchangeRunner> {
  // Precedence: an explicit key in the environment, otherwise the wallet
  // fixture the recipes already sign with. Sharing that one source is what lets
  // a premise probe and a recipe run prove things about the same account.
  // eslint-disable-next-line n/no-process-env
  const envKey = process.env.PERPS_E2E_PRIVATE_KEY;
  // eslint-disable-next-line n/no-process-env
  const envAddress = process.env.PERPS_E2E_ADDRESS as `0x${string}` | undefined;

  let wallet: unknown = envKey;
  let address = envAddress;

  if (envKey && !envAddress) {
    throw new Error(
      'PERPS_E2E_ADDRESS is required alongside PERPS_E2E_PRIVATE_KEY (address of that key)',
    );
  }

  if (!envKey) {
    const accountName =
      options.accountName ??
      // eslint-disable-next-line n/no-process-env
      process.env.PERPS_E2E_ACCOUNT ??
      'dev1';
    const fixtureSigner = await signerFromWalletFixture(accountName);
    if (!fixtureSigner) {
      throw new Error(
        'No testnet signer: set PERPS_E2E_PRIVATE_KEY and PERPS_E2E_ADDRESS, or run from a checkout with temp/recipe/runtime/wallet-fixture.json (the fixture the recipes use).',
      );
    }
    wallet = fixtureSigner.account;
    address = fixtureSigner.address;
  }

  if (!address) {
    throw new Error(
      'No testnet address resolved: set PERPS_E2E_ADDRESS, or use a wallet fixture account.',
    );
  }
  const userAddress: `0x${string}` = address;

  const hyperliquid = await import('@nktkas/hyperliquid');
  const transport = new hyperliquid.HttpTransport({ isTestnet: true });
  // The SDK accepts either a raw private key or a viem account as its wallet;
  // the declared union is wider than what is needed here.
  const exchangeClient = new hyperliquid.ExchangeClient({
    transport,
    wallet,
  } as unknown as ConstructorParameters<typeof hyperliquid.ExchangeClient>[0]);
  const infoClient = new hyperliquid.InfoClient({ transport });

  return {
    submit: async ({ orders, grouping, symbol }): Promise<string[]> => {
      // A resting trigger comes back as a bare "waitingForTrigger" with no
      // order id, so the ids it did not give us are recovered by diffing open
      // orders either side of the submission.
      const before = new Set(
        (await infoClient.frontendOpenOrders({ user: userAddress }))
          .filter((order: FrontendOrder) => order.coin === symbol)
          .map((order: FrontendOrder) => String(order.oid)),
      );

      const result = await exchangeClient.order({ orders, grouping });
      if (result.status !== 'ok') {
        throw new Error(`Order submission failed: ${JSON.stringify(result)}`);
      }

      const acknowledged = result.response.data.statuses.map(
        (status: unknown): string | null => {
          if (status && typeof status === 'object') {
            if (hasProperty(status, 'resting')) {
              return String(
                (status as { resting: { oid: number } }).resting.oid,
              );
            }
            if (hasProperty(status, 'filled')) {
              return String((status as { filled: { oid: number } }).filled.oid);
            }
          }
          if (status === 'waitingForTrigger') {
            return null;
          }
          throw new Error(`Unexpected order status: ${JSON.stringify(status)}`);
        },
      );

      if (!acknowledged.includes(null)) {
        return acknowledged as string[];
      }

      const appeared = (
        await infoClient.frontendOpenOrders({ user: userAddress })
      )
        .filter((order: FrontendOrder) => order.coin === symbol)
        .filter((order: FrontendOrder) => !before.has(String(order.oid)));

      // The venue lists new orders in its own order, not the order they were
      // submitted in, so match each unacknowledged slot to the resting order
      // carrying its trigger price rather than pairing them off by position.
      const claimed = new Set<string>();
      return acknowledged.map((oid, index) => {
        if (oid !== null) {
          return oid;
        }
        const submittedTrigger = hasProperty(orders[index].t, 'trigger')
          ? (orders[index].t as { trigger: { triggerPx: string } }).trigger
              .triggerPx
          : undefined;
        const match = appeared.find(
          (order: FrontendOrder) =>
            !claimed.has(String(order.oid)) &&
            (submittedTrigger === undefined ||
              parseFloat(String(order.triggerPx)) ===
                parseFloat(submittedTrigger)),
        );
        if (!match) {
          return '';
        }
        claimed.add(String(match.oid));
        return String(match.oid);
      });
    },
    openOrders: async (symbol): Promise<FrontendOrder[]> => {
      const orders = await infoClient.frontendOpenOrders({ user: userAddress });
      return orders.filter((order: FrontendOrder) => order.coin === symbol);
    },
    cancel: async ({ orderIds }): Promise<void> => {
      // Cancel one at a time and tolerate an order that is already gone. A
      // market order in the matrix fills on submission, so it is no longer
      // cancellable — that is the expected outcome, not a proof failure. But
      // "nothing left resting" is not the whole contract: a filled parent
      // leaves a POSITION, which `flatten` below is what actually clears.
      for (const orderId of orderIds) {
        if (!orderId) {
          continue;
        }
        try {
          const result = await exchangeClient.cancel({
            cancels: [{ a: options.assetId, o: Number(orderId) }],
          });
          if (result.status !== 'ok') {
            throw new Error(`Cancel failed: ${JSON.stringify(result)}`);
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          if (!message.includes('never placed, already canceled, or filled')) {
            throw error;
          }
        }
      }
    },

    flatten: async (symbol): Promise<void> => {
      // A market parent fills instead of resting, so cancelling leaves real
      // exposure behind. The venue premises run later against this same
      // account and at least one reasons about the position, so the case must
      // hand the account back flat rather than merely order-free.
      const state = await infoClient.clearinghouseState({ user: userAddress });
      const held = state.assetPositions.find(
        (entry: { position: { coin: string; szi: string } }) =>
          entry.position.coin === symbol,
      );
      const signedSize = parseFloat(held?.position.szi ?? '0');
      if (!signedSize) {
        return;
      }

      const meta = await infoClient.meta();
      const asset = meta.universe.find(
        (entry: { name: string }) => entry.name === symbol,
      );
      const szDecimals = asset?.szDecimals ?? 0;
      const mids = await infoClient.allMids();
      const mid = parseFloat(mids[symbol]);

      // Close by crossing the book: buy back a short, sell off a long. The
      // limit is deliberately aggressive so an IOC fills rather than rests.
      const isBuy = signedSize < 0;
      const result = await exchangeClient.order({
        orders: [
          {
            a: options.assetId,
            b: isBuy,
            p: formatHyperLiquidPrice({
              price: mid * (isBuy ? 1.05 : 0.95),
              szDecimals,
            }),
            s: formatHyperLiquidSize({
              size: Math.abs(signedSize),
              szDecimals,
            }),
            r: true,
            t: { limit: { tif: 'Ioc' } },
          },
        ],
        grouping: 'na',
      });
      if (result.status !== 'ok') {
        throw new Error(
          `Failed to flatten ${symbol}: ${JSON.stringify(result)}`,
        );
      }
    },
  };
}

// The simulated exchange has no market, so its context describes the double.
// These are the double's reference values, not an assumption about any asset.
const SIMULATED_MID = 50_000;
const SIMULATED_SZ_DECIMALS = 3;
// The double has a single market, so its index is arbitrary.
const SIMULATED_ASSET_ID = 0;

/**
 * Read the venue's live mid and size precision for a market.
 *
 * Everything the matrix submits is derived from these, so the same cases hold
 * whatever the asset is worth on the day they run.
 *
 * @param symbol - Market symbol.
 * @returns The market's index, mid and size precision.
 */
async function readVenueContext(symbol: string): Promise<{
  symbol: string;
  mid: number;
  szDecimals: number;
  assetId: number;
}> {
  const hyperliquid = await import('@nktkas/hyperliquid');
  const infoClient = new hyperliquid.InfoClient({
    transport: new hyperliquid.HttpTransport({ isTestnet: true }),
  });

  const [mids, meta] = await Promise.all([
    infoClient.allMids(),
    infoClient.meta(),
  ]);

  const mid = Number(mids[symbol]);
  if (!Number.isFinite(mid) || mid <= 0) {
    throw new Error(`No live mid for ${symbol} on HyperLiquid testnet.`);
  }

  const assetId = meta.universe.findIndex((item) => item.name === symbol);
  if (assetId < 0) {
    throw new Error(`${symbol} is not in the HyperLiquid testnet universe.`);
  }

  return {
    symbol,
    mid,
    szDecimals: meta.universe[assetId].szDecimals,
    assetId,
  };
}

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
  requirePremises: boolean;
  overrides: Partial<CaseContext>;
} {
  const read = (key: string): string | undefined =>
    argv.find((arg) => arg.startsWith(`--${key}=`))?.slice(`--${key}=`.length);

  const requestedMode = read('mode');
  if (
    requestedMode &&
    requestedMode !== 'simulated' &&
    requestedMode !== 'testnet'
  ) {
    throw new Error(`Unknown --mode: ${requestedMode}`);
  }

  return {
    mode: (requestedMode as Mode | undefined) ?? 'simulated',
    // eslint-disable-next-line n/no-process-env
    out: read('out') ?? process.env.PERPS_E2E_OUT ?? 'e2e/artifacts',
    // eslint-disable-next-line n/no-process-env
    symbol: read('symbol') ?? process.env.PERPS_E2E_SYMBOL ?? 'BTC',
    requirePremises: argv.includes('--require-premises'),
    // Every knob the matrix derives from is overridable, so a market that needs
    // a bigger probe or a different resting distance needs no code change.
    overrides: Object.fromEntries(
      (
        [
          'notional',
          'stopOffsetPct',
          'takeProfitOffsetPct',
          'limitSlipPct',
          'partialFraction',
        ] as const
      )
        .map((key) => [
          key,
          read(key.replace(/[A-Z]/gu, (char) => `-${char.toLowerCase()}`)),
        ])
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, Number(value)]),
    ),
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
 * @param params.premises - Venue-premise evidence.
 * @returns The markdown summary.
 */
function renderSummary(params: {
  mode: Mode;
  symbol: string;
  results: CaseEvidence[];
  errorCase: ReturnType<typeof runTypedErrorCase>;
  premises: PremiseEvidence[];
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
  const { mode, out, symbol, requirePremises, overrides } = parseArgs(
    process.argv.slice(2),
  );
  const outDir = path.resolve(process.cwd(), out);
  await fs.mkdir(outDir, { recursive: true });

  // On testnet the matrix is described against the venue's own index, mid and
  // size precision, read live. Simulated has no market, so the context
  // describes the in-process double instead. Either way nothing below names a
  // price, a size, or an asset index.
  const ctx =
    mode === 'testnet'
      ? caseContext({ ...(await readVenueContext(symbol)), ...overrides })
      : caseContext({
          symbol,
          mid: SIMULATED_MID,
          szDecimals: SIMULATED_SZ_DECIMALS,
          assetId: SIMULATED_ASSET_ID,
          ...overrides,
        });

  const runner =
    mode === 'testnet'
      ? await createTestnetRunner({ assetId: ctx.assetId })
      : createSimulatedRunner();

  process.stdout.write(
    `context: ${symbol} assetId=${ctx.assetId} mid=${ctx.mid} szDecimals=${ctx.szDecimals} notional=${ctx.notional}\n`,
  );

  const cases = buildCases(ctx);
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

    const result = await runCase({ testCase, runner, mode, ctx });
    results.push(result);
    await fs.writeFile(
      path.join(outDir, `${result.case}.json`),
      `${JSON.stringify(result, null, 2)}\n`,
    );
    process.stdout.write(
      `${result.pass ? 'PASS' : 'FAIL'} ${result.case}: ${result.description}\n`,
    );
  }

  const errorCase = runTypedErrorCase(ctx);
  await fs.writeFile(
    path.join(outDir, `${errorCase.case}.json`),
    `${JSON.stringify(errorCase, null, 2)}\n`,
  );
  process.stdout.write(
    `${errorCase.pass ? 'PASS' : 'FAIL'} ${errorCase.case}: ${errorCase.actualError}\n`,
  );

  // The premises the controller's guards rest on. Only testnet can settle
  // them; simulated records them as skipped so a run without credentials never
  // reads as having proven them.
  const premises: PremiseEvidence[] = [];
  for (const premiseCase of buildPremiseCases(ctx)) {
    const result = await runPremiseCase({ premiseCase, runner, mode, symbol });
    premises.push(result);
    await fs.writeFile(
      path.join(outDir, `premise-${result.case}.json`),
      `${JSON.stringify(result, null, 2)}\n`,
    );
    let label = 'FAIL';
    if (result.outcome === 'skipped') {
      label = 'SKIP';
    } else if (result.pass) {
      label = 'PASS';
    }
    process.stdout.write(
      `${label} premise ${result.case}: ${result.premise}\n`,
    );
  }

  const premisesSettled = premises.filter(
    (premise) => premise.outcome !== 'skipped',
  );
  // An acceptance run cannot claim a guard is justified while the premise it
  // rests on is unsettled, so --require-premises turns a skip into a failure.
  // Without it a credential-less simulated run still reports on everything else.
  const premisesComplete =
    !requirePremises || premisesSettled.length === premises.length;
  const allPass =
    results.every((result) => result.pass) &&
    errorCase.pass &&
    premisesComplete &&
    premisesSettled.every((premise) => premise.pass);

  if (!premisesComplete) {
    process.stdout.write(
      `\n--require-premises was set but ${premises.length - premisesSettled.length} premise(s) were skipped; only --mode=testnet can settle them.\n`,
    );
  }

  await fs.writeFile(
    path.join(outDir, 'summary.json'),
    `${JSON.stringify({ mode, symbol, allPass, results, errorCase, premises }, null, 2)}\n`,
  );
  await fs.writeFile(
    path.join(outDir, 'summary.md'),
    renderSummary({ mode, symbol, results, errorCase, premises }),
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
