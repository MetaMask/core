// ============================================================================
// HARNESS — deterministic input generation, timing, parity checks, metrics.
// This section is the bench plumbing. Experiments should not need to touch it.
// ============================================================================

// Deterministic PRNG (mulberry32). No Math.random — parity depends on it.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Structural deep clone (plain objects/arrays/primitives — bench shapes only).
function clone(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) {
    const a = new Array(v.length);
    for (let i = 0; i < v.length; i++) a[i] = clone(v[i]);
    return a;
  }
  const o = {};
  for (const k of Object.keys(v)) o[k] = clone(v[k]);
  return o;
}

// --- Deterministic asset/address generators ---
const CHAINS = ['eip155:1', 'eip155:137', 'eip155:10', 'eip155:8453', 'eip155:42161', 'eip155:56', 'eip155:100', 'solana:5eykt4usocv4vnhflc5zrqur'];
const NATIVE_BY_CHAIN = {
  'eip155:1': 'eip155:1/slip44:60',
  'eip155:137': 'eip155:137/slip44:966',
  'eip155:10': 'eip155:10/slip44:60',
  'eip155:8453': 'eip155:8453/slip44:60',
  'eip155:42161': 'eip155:42161/slip44:60',
  'eip155:56': 'eip155:56/slip44:60',
  'eip155:100': 'eip155:100/slip44:60',
};
const HEX = '0123456789abcdefABCDEF';function fakeAddress(rnd) {
  let s = '0x';
  for (let i = 0; i < 40; i++) s += HEX[Math.floor(rnd() * 16)];
  return s;
}
function fakeBase58(rnd) {
  const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let s = '';
  for (let i = 0; i < 32; i++) s += A[Math.floor(rnd() * A.length)];
  return s;
}

// Amount generators: mostly canonical plain decimals, some odd forms.
function canonAmount(rnd) {
  const whole = Math.floor(rnd() * 100000);
  const fracLen = Math.floor(rnd() * 6);
  let frac = '';
  for (let i = 0; i < fracLen; i++) frac += String(Math.floor(rnd() * 10));
  while (frac.endsWith('0')) frac = frac.slice(0, -1); // canonical: no trailing zeros
  if (fracLen === 0 || frac.length === 0) return String(whole);
  return whole === 0 && frac[0] === '0' ? '0.' + frac : String(whole) + '.' + frac;
}
const ODD_AMOUNTS = ['1.5e-7', '1.500', '00.5', '0.0', '', '1e-18', '2.500000', '1.23456789012345678901234567890123456789012345678901234567890123456789', '999999999999999999999999999999999.123'];

// --- Build initial state, ctx, and response sequence ---
function buildBench() {
  const rnd = mulberry32(0x20261022);
  const ACCOUNTS = ['acc0', 'acc1', 'acc2', 'acc3'];
  const SOL_CHAIN = 'solana:5eykt4usocv4vnhflc5zrqur';

  // Asset universe per account: natives + erc20s across chains + specials.
  function buildAssetList(accountIdx) {
    const list = [];
    const chainsForAccount = [CHAINS[0], CHAINS[1 + (accountIdx % 3)], CHAINS[4], CHAINS[5 + (accountIdx % 2)]];
    for (const chain of chainsForAccount) {
      if (chain === SOL_CHAIN) {
        list.push('solana:' + '5eykt4usocv4vnhflc5zrqur' + '/token:So11111111111111111111111111111111111111112');
        for (let i = 0; i < 6; i++) {
          list.push('solana:5eykt4usocv4vnhflc5zrqur/token:' + fakeBase58(rnd));
        }
      } else {
        list.push(NATIVE_BY_CHAIN[chain]);
        const nErc20 = 30;
        for (let i = 0; i < nErc20; i++) {
          list.push(chain + '/erc20:' + fakeAddress(rnd));
        }
      }
    }
    // Specials on every account's universe:
    if (!list.includes('eip155:1/erc20:0xacA92E438df0B2401fF60dA7E4337B687a2435DA')) {
      list.push('eip155:1/erc20:0xacA92E438df0B2401fF60dA7E4337B687a2435DA'); // mUSD default-tracked
    }
    list.push('eip155:1/erc20:0x4Fef9D741011476750a243ac70b9789a63Dd47DF'.toLowerCase()); // staking vault (mainnet)
    return list;
  }

  const assetsByAccount = {};
  for (let i = 0; i < ACCOUNTS.length; i++) {
    assetsByAccount[ACCOUNTS[i]] = buildAssetList(i);
  }

  // metadata for all assets in the union
  const allAssets = new Set();
  for (const acct of ACCOUNTS) for (const id of assetsByAccount[acct]) allAssets.add(id);
  const assetsInfo = {};
  for (const id of allAssets) {
    const isSol = id.startsWith('solana:');
    assetsInfo[id] = {
      type: isSol ? 'spl' : id.includes('/slip44:') ? 'native' : 'erc20',
      symbol: isSol ? 'SOL' + Math.floor(rnd() * 100) : id.includes('/slip44:') ? 'ETH' + Math.floor(rnd() * 100) : 'TK' + Math.floor(rnd() * 1000),
      name: 'Token ' + Math.floor(rnd() * 10000),
      decimals: Math.floor(rnd() * 19), // 0..18
      image: 'https://example.com/' + Math.floor(rnd() * 1000) + '.png',
      aggregators: ['oneInch', 'paraswap'],
      occurrences: Math.floor(rnd() * 5),
    };
  }
  // One stale-typed entry (erc20 metadata on a native id) to exercise self-heal.
  assetsInfo['eip155:1/slip44:60'] = { ...assetsInfo['eip155:1/slip44:60'], type: 'erc20' };
  // Drop decimals for one asset (natural-precision path).
  assetsInfo[assetsByAccount['acc0'][3]] = { ...assetsInfo[assetsByAccount['acc0'][3]] };
  delete assetsInfo[assetsByAccount['acc0'][3]].decimals;

  // initial balances: canonical amounts; acc3 has no polygon-native entry.
  const assetsBalance = {};
  for (const acct of ACCOUNTS) {
    const map = {};
    for (const id of assetsByAccount[acct]) {
      if (acct === 'acc3' && id === NATIVE_BY_CHAIN['eip155:137']) continue;
      map[id] = { amount: canonAmount(rnd) };
    }
    // a couple of entries carry balance metadata (stellar-style is out of bench scope; generic json)
    const withMeta = assetsByAccount[acct][1];
    map[withMeta] = { ...map[withMeta], metadata: { tag: 'x' } };
    assetsBalance[acct] = map;
  }

  // prices for ~30 assets
  const assetsPrice = {};
  let p = 0;
  for (const id of allAssets) {
    if (p++ < 40) {
      assetsPrice[id] = {
        assetPriceType: 'fungible',
        usdPrice: Math.floor(rnd() * 100000) / 100,
        pricePercentChange1d: Math.floor(rnd() * 1000) / 10,
        pricePercentChange7d: Math.floor(rnd() * 1000) / 10,
        pricePercentChange30d: Math.floor(rnd() * 1000) / 10,
      };
    }
  }

  // customAssets: acc0 pins one polygon erc20 (a chain that later gets chain-slice replaced), acc2 none.
  const polygonAssets = assetsByAccount['acc0'].filter((a) => a.startsWith('eip155:137/erc20:'));
  const customAssets = {
    acc0: [polygonAssets[0], 'eip155:1/erc20:0xacA92E438df0B2401fF60dA7E4337B687a2435DA'],
    acc1: ['eip155:1/erc20:0x4fef9d741011476750a243ac70b9789a63dd47df'],
    acc3: [],
  };

  const state0 = {
    assetsInfo,
    assetsBalance,
    assetsPrice,
    customAssets,
  };

  const ctx = {
    accounts: ACCOUNTS.map((id) => ({ id })),
    nativeAssetIdsByAccount: {
      acc0: ['eip155:1/slip44:60', 'eip155:137/slip44:966', 'eip155:10/slip44:60', 'eip155:8453/slip44:60'],
      acc1: ['eip155:1/slip44:60', 'eip155:137/slip44:966', 'eip155:56/slip44:60'],
      acc2: ['eip155:1/slip44:60', 'eip155:42161/slip44:60'],
      acc3: ['eip155:1/slip44:60', 'eip155:137/slip44:966', 'eip155:100/slip44:60', 'eip155:8453/slip44:60'],
    },
    isBalanceV6Enabled: false,
  };

  // --- Responses: 18 realistic warm-start updates + 5 edge responses ---
  // shadowAmounts tracks the last-written amount per (account, asset) so
  // "unchanged" entries stay unchanged as state evolves (warm poll no-ops).
  const responses = [];
  const shadow = {};
  for (const acct of ACCOUNTS) {
    shadow[acct] = {};
    for (const id of assetsByAccount[acct]) {
      shadow[acct][id] = state0.assetsBalance[acct][id]?.amount ?? '0';
    }
  }
  const R = 30;
  for (let r = 0; r < R; r++) {
    const resp = {};
    // assetsInfo: ~20 entries; ~90% content-equal fresh objects, ~10% changed; 1 in 5 without symbol+name.
    const respInfo = {};
    const infoIds = [...allAssets].slice((r * 7) % 80, (r * 7) % 80 + 24);
    for (const id of infoIds) {
      const base = assetsInfo[id];
      if (base === undefined) continue;
      const fresh = clone(base);
      if (r % 5 === 3 && id.includes('/erc20:')) {
        delete fresh.symbol;
        delete fresh.name;
      } else if ((r + id.length) % 10 === 0) {
        fresh.occurrences = (fresh.occurrences ?? 0) + 1;
      }
      respInfo[id] = fresh;
    }
    resp.assetsInfo = respInfo;

    // assetsBalance: merge-mode full maps; mostly unchanged, some changed/new.
    const respBalances = {};
    for (const acct of ACCOUNTS) {
      const map = {};
      for (const id of assetsByAccount[acct]) {
        const roll = rnd();
        if (roll < 0.85) {
          map[id] = { amount: shadow[acct][id] };
        } else if (roll < 0.95) {
          const amt = canonAmount(rnd);
          shadow[acct][id] = amt;
          map[id] = { amount: amt };
        } else {
          // changed-to-zero (still a change event vs previous amount)
          shadow[acct][id] = '0';
          map[id] = { amount: '0' };
        }
      }
      // 1-2 genuinely new keys per account every 4th response (not in state0,
      // no metadata yet -> natural-precision normalize path).
      if (r % 4 === 1) {
        const newId = 'eip155:1/erc20:' + fakeAddress(rnd);
        shadow[acct][newId] = '0.5';
        map[newId] = { amount: '0.5' };
      }
      // sprinkle odd amounts: ~3 per response per account. Track the
      // normalized result so later "unchanged" entries stay unchanged.
      const ids = Object.keys(map);
      for (let k = 0; k < 3; k++) {
        const id = ids[Math.floor(rnd() * ids.length)];
        const amt = ODD_AMOUNTS[(r + k) % ODD_AMOUNTS.length];
        shadow[acct][id] = normalizeAmountString_ORIG(
          amt,
          assetsInfo[id] ? assetsInfo[id].decimals : undefined,
        );
        map[id] = { amount: amt };
      }
      if (r % 6 === 2) {
        const amt = canonAmount(rnd);
        shadow[acct][assetsByAccount[acct][0]] = normalizeAmountString_ORIG(
          amt,
          assetsInfo[assetsByAccount[acct][0]] ? assetsInfo[assetsByAccount[acct][0]].decimals : undefined,
        );
        map[assetsByAccount[acct][0]] = { amount: amt, metadata: { tag: 'meta' + r } };
      }
      respBalances[acct] = map;
    }
    resp.assetsBalance = respBalances;

    // prices: 10 entries, 80% content-equal fresh objects, 20% changed
    const respPrices = {};
    const priceIds = Object.keys(assetsPrice).slice((r * 3) % 20, (r * 3) % 20 + 12);
    for (const id of priceIds) {
      const fresh = clone(assetsPrice[id]);
      if ((r + id.length) % 5 === 0) fresh.usdPrice = fresh.usdPrice + 1.25;
      respPrices[id] = fresh;
    }
    resp.assetsPrice = respPrices;

    // every 6th response: chain-slice replace on polygon (custom asset + staked
    // asset interplay), with balances only for polygon assets
    if (r % 6 === 2) {
      resp.replaceCoveredChainBalances = true;
      const slice = {};
      for (const acct of ACCOUNTS) {
        const map = {};
        for (const id of assetsByAccount[acct]) {
          if (id.startsWith('eip155:137/')) {
            const amt = canonAmount(rnd);
            shadow[acct][id] = normalizeAmountString_ORIG(
              amt,
              assetsInfo[id] ? assetsInfo[id].decimals : undefined,
            );
            map[id] = { amount: amt };
          }
        }
        slice[acct] = map;
      }
      resp.assetsBalance = slice;
      resp.assetsInfo = {};
    }

    // every 9th response: updateMode 'full' with complete maps
    if (r === 9) {
      resp.updateMode = 'full';
    }

    responses.push(resp);
  }

  // Edge responses (also timed; small).
  responses.push({}); // empty
  responses.push({ assetsInfo: {}, assetsBalance: {}, assetsPrice: {} });
  responses.push({
    assetsBalance: { accNewNoHistory: { 'eip155:1/slip44:60': { amount: '0' } } },
  });
  responses.push({
    assetsBalance: { acc0: { 'eip155:1/erc20:0xacA92E438df0B2401fF60dA7E4337B687a2435DA': { amount: '' } } },
    assetsPrice: { 'eip155:1/slip44:60': { assetPriceType: 'fungible', usdPrice: 1234.56 } },
  });
  responses.push({
    assetsInfo: { 'eip155:42/erc20:0x0000000000000000000000000000000000000000': { type: 'erc20', symbol: 'X', name: 'Y', decimals: 18 } },
    assetsBalance: { acc0: { 'eip155:42/erc20:0x0000000000000000000000000000000000000000': { amount: '42' } } },
  });

  return { state0, ctx, responses };
}

// --- Run one sequence through a producer impl; returns timings + outputs ---
function runSequence(producerFn, state0, responses, ctx) {
  let state = clone(state0);
  const perResponse = [];
  let totalMs = 0;
  for (const response of responses) {
    const mode = response.updateMode ?? 'merge';
    const previousState = state;
    const previousPrices = { ...state.assetsPrice };
    const draft = clone(state);
    const changedBalances = [];
    const changedMetadata = [];
    const t0 = Date.now();
    producerFn(draft, response, mode, previousState, previousPrices, changedBalances, changedMetadata, ctx);
    const t1 = Date.now();
    totalMs += t1 - t0;
    state = draft;
    // state chain after each response (for per-step parity)
    perResponse.push({ changedBalances, changedMetadata, stateAfter: state });
  }
  return { totalMs, perResponse, finalState: state };
}

// --- Parity battery: small targeted cases (parity-only, untimed) ---
function buildEdgeCases() {
  const s0 = {
    assetsInfo: { 'eip155:1/slip44:60': { type: 'native', symbol: 'ETH', name: 'Ether', decimals: 18 } },
    assetsBalance: { acc0: { 'eip155:1/slip44:60': { amount: '1.5' } } },
    assetsPrice: {},
    customAssets: {},
  };
  const ctx = {
    accounts: [{ id: 'acc0' }],
    nativeAssetIdsByAccount: { acc0: ['eip155:1/slip44:60', 'eip155:137/slip44:966'] },
    isBalanceV6Enabled: false,
  };
  return [
    { label: 'empty', state: { assetsInfo: {}, assetsBalance: {}, assetsPrice: {}, customAssets: {} }, resp: {} },
    { label: 'empty-maps', state: s0, resp: { assetsInfo: {}, assetsBalance: {}, assetsPrice: {} } },
    { label: 'new-account-zero-native', state: s0, resp: { assetsBalance: { accNew: { 'eip155:1/slip44:60': { amount: '0' } } } } },
    { label: 'native-seed-zero', state: { assetsInfo: { 'eip155:137/slip44:966': { type: 'native', symbol: 'POL', name: 'Polygon', decimals: 18 } }, assetsBalance: { acc0: {} }, assetsPrice: {}, customAssets: {} }, resp: { assetsBalance: { acc0: {} } } },
    { label: 'odd-amounts', state: s0, resp: { assetsBalance: { acc0: { 'eip155:1/slip44:60': { amount: '1.500' }, 'eip155:1/erc20:0xAbC': { amount: '00.5' }, 'eip155:1/erc20:0xDeF': { amount: 42 } } } } },
    { label: 'no-metadata-decimals', state: { assetsInfo: {}, assetsBalance: { acc0: { 'eip155:1/erc20:0xAbC': { amount: '1e-18' } } }, assetsPrice: {}, customAssets: {} }, resp: {} },
    { label: 'metadata-churn-preserve', state: { assetsInfo: { 'eip155:1/erc20:0xAbC': { type: 'erc20', symbol: 'ABC', name: 'Abc', decimals: 18, image: 'https://x/1.png' } }, assetsBalance: { acc0: { 'eip155:1/erc20:0xAbC': { amount: '1' } } }, assetsPrice: {}, customAssets: {} }, resp: { assetsInfo: { 'eip155:1/erc20:0xAbC': { type: 'erc20', decimals: 18 } } } },
    { label: 'type-fix-native', state: { assetsInfo: { 'eip155:1/slip44:60': { type: 'erc20', symbol: 'ETH', name: 'Ether', decimals: 18 } }, assetsBalance: {}, assetsPrice: {}, customAssets: {} }, resp: { assetsBalance: { acc0: { 'eip155:1/slip44:60': { amount: '2' } } } } },
    { label: 'staked-survives-replace', state: { assetsInfo: { 'eip155:1/erc20:0x4fef9d741011476750a243ac70b9789a63dd47df': { type: 'erc20', symbol: 'STK', name: 'Staked', decimals: 18 } }, assetsBalance: { acc0: { 'eip155:1/erc20:0x4fef9d741011476750a243ac70b9789a63dd47df': { amount: '3.5' }, 'eip155:1/erc20:0xDeAd': { amount: '9' } } }, assetsPrice: {}, customAssets: {} }, resp: { assetsBalance: { acc0: { 'eip155:1/erc20:0xBeEf': { amount: '1' } } }, replaceCoveredChainBalances: true } },
    { label: 'custom-survives-replace', state: { assetsInfo: { 'eip155:1/erc20:0xAbC': { type: 'erc20', symbol: 'ABC', name: 'Abc', decimals: 18 } }, assetsBalance: { acc0: { 'eip155:1/erc20:0xAbC': { amount: '7' } } }, assetsPrice: {}, customAssets: { acc0: ['eip155:1/erc20:0xAbC'] } }, resp: { assetsBalance: { acc0: { 'eip155:1/erc20:0xDeAd': { amount: '1' } } }, replaceCoveredChainBalances: true } },
    { label: 'full-mode', state: s0, resp: { updateMode: 'full', assetsBalance: { acc0: { 'eip155:1/erc20:0xAbC': { amount: '1' } } } } },
    { label: 'balance-metadata-fallback', state: { assetsInfo: {}, assetsBalance: { acc0: { 'eip155:1/erc20:0xAbC': { amount: '1', metadata: { tag: 'prev' } } } }, assetsPrice: {}, customAssets: {} }, resp: { assetsBalance: { acc0: { 'eip155:1/erc20:0xAbC': { amount: '2' } } } } },
    { label: 'prices-identical-vs-changed', state: s0, resp: { assetsPrice: { 'eip155:1/slip44:60': { assetPriceType: 'fungible', usdPrice: 1234.56 } } } },
  ].map((c) => ({ ...c, ctx }));
}

// --- Main ---
function main() {
  const { state0, ctx, responses } = buildBench();

  // Parity: main sequence
  const origOut = runSequence(updateStateProducer_ORIG, state0, responses, ctx);
  const candOut = runSequence(updateStateProducer_CAND, state0, responses, ctx);

  let parityOk = true;
  let parityMsg = '';
  if (!isEqual(origOut.finalState, candOut.finalState)) {
    parityOk = false;
    parityMsg = 'final state diverged';
  }
  for (let i = 0; i < responses.length; i++) {
    const o = origOut.perResponse[i];
    const c = candOut.perResponse[i];
    if (!isEqual(o.changedBalances, c.changedBalances)) {
      parityOk = false;
      parityMsg = 'changedBalances diverged at response ' + i;
      break;
    }
    if (!isEqual(o.changedMetadata, c.changedMetadata)) {
      parityOk = false;
      parityMsg = 'changedMetadata diverged at response ' + i;
      break;
    }
    if (!isEqual(o.stateAfter, c.stateAfter)) {
      parityOk = false;
      parityMsg = 'state diverged at response ' + i;
      break;
    }
  }

  // Parity battery
  for (const c of buildEdgeCases()) {
    const o = runSequence(updateStateProducer_ORIG, c.state, [c.resp], c.ctx);
    const k = runSequence(updateStateProducer_CAND, c.state, [c.resp], c.ctx);
    if (!isEqual(o.finalState, k.finalState) || !isEqual(o.perResponse[0].changedBalances, k.perResponse[0].changedBalances) || !isEqual(o.perResponse[0].changedMetadata, k.perResponse[0].changedMetadata)) {
      parityOk = false;
      parityMsg = 'edge case "' + c.label + '" diverged';
      break;
    }
  }

  if (!parityOk) {
    print('SELF_CHECK=FAIL ' + parityMsg);
    globalThis.__result = 1;
    return;
  }

  // Timing: 3 reps each, median. Original timed too (secondary metric).
  const REPS = 3;
  const candTimes = [];
  const origTimes = [];
  for (let i = 0; i < REPS; i++) {
    candTimes.push(runSequence(updateStateProducer_CAND, state0, responses, ctx).totalMs);
    origTimes.push(runSequence(updateStateProducer_ORIG, state0, responses, ctx).totalMs);
  }
  candTimes.sort((a, b) => a - b);
  origTimes.sort((a, b) => a - b);
  const median = (a) => a[Math.floor(a.length / 2)];

  print('METRIC primary_ms=' + median(candTimes));
  print('METRIC orig_ms=' + median(origTimes));
  print('DET reps_cand=' + candTimes.join(',') + ' reps_orig=' + origTimes.join(','));
  const totalChanges = origOut.perResponse.reduce((n, p) => n + p.changedBalances.length, 0);
  const totalMetaChanges = origOut.perResponse.reduce((n, p) => n + p.changedMetadata.length, 0);
  print('DET responses=' + responses.length + ' balance_changes=' + totalChanges + ' metadata_changes=' + totalMetaChanges);
  print('SELF_CHECK=OK');
  globalThis.__result = 0;
}

main();
