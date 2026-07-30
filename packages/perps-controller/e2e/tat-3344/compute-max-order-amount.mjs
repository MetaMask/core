// TAT-3344 — compute a max order amount through the CHANGED code path.
//
// This is the first half of the live proof for
// `getMaxAllowedAmount` (packages/perps-controller/src/utils/orderCalculations.ts).
// A fixed-notional live order proves nothing about max sizing, so this step
// derives the notional the way the client does:
//
//   live spendableBalance + live mid + live szDecimals
//     -> getMaxAllowedAmount(...)            <-- the changed function
//     -> stdout
//
// The recipe feeds that stdout straight into metamask.perps.place_order as
// `amount`, which the provider uses as `usdAmount`:
//
//   calculateFinalPositionSize -> finalPositionSize = usdAmount / currentPrice
//   calculateOrderPriceAndSize -> orderPrice = currentPrice * (1 + slippage)
//
// so the exchange charges initial margin against `orderPrice` — the exact
// mismatch TAT-3344 is about.
//
// mode=fixed   emits the current (fixed) getMaxAllowedAmount result.
// mode=prefix  emits the pre-fix formula (no slippage haircut) recomputed from
//              the SAME live inputs, so the counterfactual is a controlled A/B
//              rather than a remembered number.
//
// Only the amount goes to stdout. Diagnostics go to stderr and the full record
// is written to --out as JSON evidence.
//
// This is a standalone proof script run by the harness's `command` action, not
// library code: it reads its runtime location from the environment and must exit
// explicitly because the controller holds a HyperLiquid WebSocket open.
/* eslint-disable n/no-process-env, n/no-process-exit */

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function arg(name, fallback) {
  const hit = process.argv.find((entry) => entry.startsWith(`--${name}=`));
  return hit === undefined ? fallback : hit.slice(name.length + 3);
}

const projectRoot = path.resolve(arg('project-root', process.cwd()));
const network = arg('network', 'testnet');
const market = arg('market', 'BTC');
const leverage = Number(arg('leverage', '3'));
const mode = arg('mode', 'fixed');
const outPath = arg('out', '');

if (network !== 'testnet') {
  throw new Error(
    `TAT-3344 proof is testnet-only; refusing network=${network}.`,
  );
}
if (!['fixed', 'prefix'].includes(mode)) {
  throw new Error(`mode must be fixed | prefix, got ${mode}.`);
}

// The headless controller bootstrap lives in the harness, keyed off the
// provisioned MM_HARNESS_BIN so this stays pinned to the same runtime the
// recipe uses.
const harnessBin =
  process.env.MM_HARNESS_BIN ?? process.env.METAMASK_HARNESS_BIN;
if (!harnessBin) {
  throw new Error('MM_HARNESS_BIN (or METAMASK_HARNESS_BIN) must be set.');
}
const harnessRoot = path.dirname(path.dirname(harnessBin));
const controllerHelpers = pathToFileURL(
  path.join(harnessRoot, 'library/actions/core/perps/_controller.mjs'),
).href;

// The signer-bound controller, exactly as metamask.perps.place_order builds it:
// getMarketDataWithPrices goes through the provider's client init, which needs a
// wallet adapter even for a read.
const { getCoreControllerWithSigner, currentMarketPrice } = await import(
  controllerHelpers
);

// The changed function, imported from the checkout entrypoint the harness's own
// core adapter imports — same source tree, same module instance.
const { getMaxAllowedAmount } = await import(
  pathToFileURL(
    path.join(projectRoot, 'packages/perps-controller/src/index.ts'),
  ).href
);

const input = {
  action: 'tat-3344.compute-max',
  context: { projectRoot },
  node: { network },
};
const { controller, accountAddress } = await getCoreControllerWithSigner(input);

const accountState = await controller.getAccountState({
  standalone: true,
  userAddress: accountAddress,
});
const spendableBalance = Number(accountState?.spendableBalance);
if (!Number.isFinite(spendableBalance) || spendableBalance <= 0) {
  throw new Error(
    `Unusable spendableBalance from the controller: ${accountState?.spendableBalance}.`,
  );
}

const assetPrice = await currentMarketPrice(controller, market);

const markets = await controller.getMarkets({ standalone: true });
const meta = (Array.isArray(markets) ? markets : []).find(
  (item) => String(item?.name ?? '').toUpperCase() === market.toUpperCase(),
);
if (!meta || typeof meta.szDecimals !== 'number') {
  throw new Error(`No szDecimals for ${market} on ${network}.`);
}
const assetSzDecimals = meta.szDecimals;

const fixedMax = getMaxAllowedAmount({
  spendableBalance,
  assetPrice,
  assetSzDecimals,
  leverage,
});

// Pre-fix formula, verbatim from the parent commit of the fix: theoretical max
// off the MID price with only MAX_ORDER_MARGIN_BUFFER (0.5%) shaved, and no
// slippage haircut.
const MAX_ORDER_MARGIN_BUFFER = 0.005;
const prefixMax = Math.max(
  0,
  Math.floor(
    Math.floor(spendableBalance * leverage) * (1 - MAX_ORDER_MARGIN_BUFFER),
  ),
);

const amount = mode === 'fixed' ? fixedMax : prefixMax;

const record = {
  ticket: 'TAT-3344',
  mode,
  network,
  market,
  account: accountAddress,
  leverage,
  inputs: { spendableBalance, assetPrice, assetSzDecimals },
  fixedMax,
  prefixMax,
  emittedAmount: amount,
  // What the exchange will be asked for, at the default 300 bps market slippage.
  projectedMarginAtOrderPrice: {
    fixed: (fixedMax * 1.03) / leverage,
    prefix: (prefixMax * 1.03) / leverage,
    spendableBalance,
  },
  computedVia:
    'packages/perps-controller/src/utils/orderCalculations.ts#getMaxAllowedAmount',
};

process.stderr.write(`[tat-3344] ${JSON.stringify(record)}\n`);
if (outPath) {
  await writeFile(
    path.resolve(outPath),
    `${JSON.stringify(record, null, 2)}\n`,
    'utf-8',
  );
}

process.stdout.write(String(amount));

// The controller opens a persistent HyperLiquid WebSocket; exit explicitly so
// the command node does not hang on an idle socket.
process.exit(0);
