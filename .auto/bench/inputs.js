// Deterministic input factory for the getAssetIdsForMetadataFetch bench.
// No randomness beyond a fixed-seed PRNG so every process run sees identical
// inputs. Shapes mirror AssetsController state on a realistic multi-account,
// multi-chain mobile client:
//   - checksummed (mixed-case) ERC-20 asset IDs, so toLowerCase does real work
//   - the same popular assets held by every account (cross-account duplicates)
//   - a mix of complete / partial / missing metadata
//   - hidden asset preferences, staking-contract IDs, and a few malformed IDs
//   - request scope that filters accounts and chains
//   - a response that overlaps state balances and adds new ones

const HEX = '0123456789abcdefABCDEF';

/** Deterministic PRNG (mulberry32). */
function makeRandom(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CHAINS = [
  'eip155:1',
  'eip155:137',
  'eip155:10',
  'eip155:8453',
  'eip155:42161',
];

const CHAIN_REFS = ['1', '137', '10', '8453', '42161'];

const STAKING_MAINNET = 'eip155:1/erc20:0x4fef9d741011476750a243ac70b9789a63dd47df';
const STAKING_HOODI = 'eip155:560048/erc20:0xe96ac18cfe5a7af8fe1fe7bc37ff110d88bc67ff';

/** Deterministic checksummed-looking 40-char hex address. */
function makeAddress(random) {
  let out = '0x';
  for (let i = 0; i < 40; i++) {
    // Bias toward lowercase but keep some uppercase so casing is mixed.
    const upper = random() < 0.35;
    const idx = Math.floor(random() * 16);
    const lowerChar = HEX[idx];
    out += upper ? lowerChar.toUpperCase() : lowerChar;
  }
  return out;
}

function erc20Id(chainIdx, address) {
  return `eip155:${CHAIN_REFS[chainIdx]}/erc20:${address}`;
}

function nativeId(chainIdx) {
  return `eip155:${CHAIN_REFS[chainIdx]}/slip44:60`;
}

/** Metadata variants exercising hasMetadataUsedByClients branches. */
function completeMetadata(random) {
  return {
    type: 'erc20',
    symbol: 'TK' + Math.floor(random() * 900 + 100),
    name: 'Token ' + Math.floor(random() * 900 + 100),
    decimals: Math.floor(random() * 20),
    image: 'https://example.com/t.png',
    aggregators: ['metamask'],
    occurrences: Math.floor(random() * 40),
  };
}

function partialNoAggregators(random) {
  const m = completeMetadata(random);
  delete m.aggregators;
  delete m.occurrences;
  return m;
}

function partialNoImage(random) {
  const m = completeMetadata(random);
  m.image = '';
  return m;
}

function symbolOnly(random) {
  return { type: 'erc20', symbol: 'S' + Math.floor(random() * 90 + 9) };
}

const ZERO_BALANCE = { amount: '0' };

/**
 * Build the shared popular-asset pool and per-account unique assets.
 *
 * @param {number} accounts - Number of accounts in state.
 * @param {number} popularPerAccount - Shared assets every account holds.
 * @param {number} uniquePerAccount - Assets unique to each account.
 * @param {number} seed - PRNG seed.
 * @returns State-shaped balance/info/preference maps plus bookkeeping.
 */
function buildStateShape(accounts, popularPerAccount, uniquePerAccount, seed) {
  const random = makeRandom(seed);
  const sharedIds = [];
  for (let c = 0; c < CHAINS.length && sharedIds.length < popularPerAccount; c++) {
    sharedIds.push(nativeId(c));
  }
  while (sharedIds.length < popularPerAccount) {
    const c = Math.floor(random() * CHAINS.length);
    sharedIds.push(erc20Id(c, makeAddress(random)));
  }

  const assetsBalance = {};
  const perAccountUnique = [];
  for (let a = 0; a < accounts; a++) {
    const balances = {};
    for (const id of sharedIds) {
      balances[id] = ZERO_BALANCE;
    }
    const uniques = [];
    for (let u = 0; u < uniquePerAccount; u++) {
      const c = Math.floor(random() * CHAINS.length);
      const id = erc20Id(c, makeAddress(random));
      // Keep uniqueness deterministic per account.
      if (!(id in balances)) {
        balances[id] = ZERO_BALANCE;
        uniques.push(id);
      }
    }
    // A couple of malformed IDs per account exercise the parse failure path.
    if (a === 0) {
      balances['not-a-caip-asset-type'] = ZERO_BALANCE;
      balances['eip155:1/erc20:'] = ZERO_BALANCE;
    }
    if (a === 1) {
      balances[''] = ZERO_BALANCE;
    }
    assetsBalance['account-' + a] = balances;
    perAccountUnique.push(uniques);
  }

  // Metadata: complete for a third of shared assets, partial for most of the
  // rest, so both hasMetadataUsedByClients outcomes are hot.
  const assetsInfo = {};
  const allIds = Object.values(assetsBalance).flatMap((b) => Object.keys(b));
  for (const id of allIds) {
    const roll = random();
    if (roll < 0.3) {
      assetsInfo[id] = completeMetadata(random);
    } else if (roll < 0.6) {
      assetsInfo[id] = partialNoAggregators(random);
    } else if (roll < 0.7) {
      assetsInfo[id] = partialNoImage(random);
    }
  }
  // Staking contracts must be present with incomplete metadata (the branch
  // that actually consults isStakingContractAssetId).
  assetsBalance['account-0'][STAKING_MAINNET] = ZERO_BALANCE;
  delete assetsInfo[STAKING_MAINNET];
  assetsBalance['account-1'][STAKING_HOODI] = ZERO_BALANCE;
  delete assetsInfo[STAKING_HOODI];

  // Hidden preferences, mixed-case keys, some hidden assets also complete.
  const assetPreferences = {};
  const hiddenTargets = sharedIds.slice(0, Math.max(4, Math.floor(sharedIds.length / 8)));
  for (const id of hiddenTargets) {
    assetPreferences[id] = { hidden: true };
  }
  if (perAccountUnique[0] && perAccountUnique[0].length > 0) {
    assetPreferences[perAccountUnique[0][0].toUpperCase()] = { hidden: true };
  }
  assetPreferences['eip155:1/erc20:0xunknownhidden'] = { hidden: true };

  return { assetsBalance, assetsInfo, assetPreferences, sharedIds, perAccountUnique };
}

/** Request scoping two accounts and three chains (filters active). */
function buildRequest(scopeAccounts, scopeChains) {
  const chainIds = CHAINS.slice(0, scopeChains);
  return {
    chainIds,
    accountsWithSupportedChains: ['account-0', 'account-1']
      .slice(0, scopeAccounts)
      .map((id) => ({
        account: { id, address: '0xabc', options: {}, methods: [], type: 'eip155:eoa', scopes: ['eip155:0'], metadata: {} },
        supportedChains: chainIds,
      })),
  };
}

/** Response overlapping state (heals) plus new assets (spam-filtered path). */
function buildResponse(shape, seed, accounts, overlapCount, newCount) {
  const random = makeRandom(seed);
  const assetsBalance = {};
  const assetsInfo = {};
  const stateIds = Object.keys(shape.assetsBalance['account-0']).slice(overlapCount, overlapCount * 2);
  for (let a = 0; a < accounts; a++) {
    const balances = {};
    for (const id of stateIds) {
      balances[id] = ZERO_BALANCE;
    }
    for (let n = 0; n < newCount; n++) {
      const c = Math.floor(random() * CHAINS.length);
      balances[erc20Id(c, makeAddress(random))] = ZERO_BALANCE;
    }
    assetsBalance['account-' + a] = balances;
  }
  for (const id of stateIds.slice(0, Math.floor(stateIds.length / 2))) {
    assetsInfo[id] = partialNoImage(random);
  }
  return { assetsBalance, assetsInfo };
}

/** The main timed input: 4 accounts, 60 shared + 110 unique each. */
function buildMainInput() {
  const shape = buildStateShape(4, 60, 110, 0x5eed1);
  const request = buildRequest(2, 3);
  const response = buildResponse(shape, 0x5eed2, 3, 25, 30);
  return {
    name: 'main',
    state: {
      assetsBalance: shape.assetsBalance,
      assetsInfo: shape.assetsInfo,
      assetPreferences: shape.assetPreferences,
    },
    request,
    response,
  };
}

/** Small and large sweep inputs with identical structure. */
function buildSweepInputs() {
  const smallShape = buildStateShape(2, 20, 15, 0x5eed3);
  const small = {
    name: 'small',
    state: {
      assetsBalance: smallShape.assetsBalance,
      assetsInfo: smallShape.assetsInfo,
      assetPreferences: smallShape.assetPreferences,
    },
    request: buildRequest(1, 2),
    response: buildResponse(smallShape, 0x5eed4, 1, 8, 10),
  };
  const largeShape = buildStateShape(8, 80, 260, 0x5eed5);
  const large = {
    name: 'large',
    state: {
      assetsBalance: largeShape.assetsBalance,
      assetsInfo: largeShape.assetsInfo,
      assetPreferences: largeShape.assetPreferences,
    },
    request: buildRequest(4, 5),
    response: buildResponse(largeShape, 0x5eed6, 6, 40, 60),
  };
  return [small, large];
}

/** Edge cases that must stay byte-for-byte identical between impls. */
function buildEdgeCases() {
  const cases = [];
  const push = (name, state, request, response) =>
    cases.push({ name, state, request, response });

  push('empty-all', {}, { chainIds: [], accountsWithSupportedChains: [] }, {});
  push(
    'empty-state-values',
    { assetsBalance: undefined, assetsInfo: undefined, assetPreferences: undefined },
    { chainIds: [], accountsWithSupportedChains: [] },
    { assetsBalance: undefined, assetsInfo: undefined },
  );
  push(
    'no-filters',
    {
      assetsBalance: {
        'a-1': {
          'eip155:1/erc20:0x4fef9d741011476750a243ac70b9789a63dd47df': { amount: '1' },
          'eip155:137/erc20:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': { amount: '2' },
          'eip155:1/slip44:60': { amount: '3' },
        },
      },
      assetsInfo: {},
      assetPreferences: {},
    },
    { chainIds: [], accountsWithSupportedChains: [] },
    {},
  );
  push(
    'hidden-and-staking',
    {
      assetsBalance: {
        'a-1': {
          'eip155:1/erc20:0x4fef9d741011476750a243ac70b9789a63dd47df': { amount: '1' },
          'eip155:560048/erc20:0xe96ac18cfe5a7af8fe1fe7bc37ff110d88bc67ff': { amount: '1' },
          'eip155:1/erc20:0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { amount: '2' },
        },
      },
      assetsInfo: {},
      assetPreferences: {
        'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { hidden: true },
      },
    },
    { chainIds: ['eip155:1', 'eip155:560048'], accountsWithSupportedChains: [] },
    {},
  );
  push(
    'metadata-edges',
    {
      assetsBalance: {
        'a-1': {
          'eip155:1/erc20:0xDecimalsZero': { amount: '1' },
          'eip155:1/erc20:0xDecimalsNeg': { amount: '1' },
          'eip155:1/erc20:0xDecimalsNaN': { amount: '1' },
          'eip155:1/erc20:0xOccZero': { amount: '1' },
          'eip155:1/erc20:0xOccString': { amount: '1' },
          'eip155:1/erc20:0xAggEmpty': { amount: '1' },
          'eip155:1/erc20:0xSymbolEmpty': { amount: '1' },
          'eip155:1/erc20:0xSymbolMissing': { amount: '1' },
          'eip155:1/erc20:0xNoAggregators': { amount: '1' },
          'eip155:1/erc20:0xNoOccurrences': { amount: '1' },
          'eip155:1/erc20:0xOddLength': { amount: '1' },
        },
      },
      assetsInfo: {
        'eip155:1/erc20:0xdecimalszero': {
          type: 'erc20', symbol: 'D0', name: 'D0', decimals: 0, image: 'https://e.com/a.png', aggregators: [], occurrences: 0,
        },
        'eip155:1/erc20:0xdecimalsneg': {
          type: 'erc20', symbol: 'DN', name: 'DN', decimals: -1, image: 'https://e.com/a.png', aggregators: [], occurrences: 3,
        },
        'eip155:1/erc20:0xdecimalsnan': {
          type: 'erc20', symbol: 'DN', name: 'DN', decimals: NaN, image: 'https://e.com/a.png', aggregators: [], occurrences: 3,
        },
        'eip155:1/erc20:0xocczero': {
          type: 'erc20', symbol: 'O0', name: 'O0', decimals: 2, image: 'https://e.com/a.png', aggregators: [], occurrences: 0,
        },
        'eip155:1/erc20:0xoccstring': {
          type: 'erc20', symbol: 'OS', name: 'OS', decimals: 2, image: 'https://e.com/a.png', aggregators: [], occurrences: '5',
        },
        'eip155:1/erc20:0xaggempty': {
          type: 'erc20', symbol: 'AE', name: 'AE', decimals: 2, image: 'https://e.com/a.png', aggregators: [], occurrences: 2,
        },
        'eip155:1/erc20:0xsymbolempty': {
          type: 'erc20', symbol: '', name: 'SE', decimals: 2, image: 'https://e.com/a.png', aggregators: [], occurrences: 2,
        },
        'eip155:1/erc20:0xsymbolmissing': {
          type: 'erc20', name: 'SM', decimals: 2, image: 'https://e.com/a.png', aggregators: [], occurrences: 2,
        },
        'eip155:1/erc20:0xnoaggregators': {
          type: 'erc20', symbol: 'NA', name: 'NA', decimals: 2, image: 'https://e.com/a.png', occurrences: 2,
        },
        'eip155:1/erc20:0xnooccurrences': {
          type: 'erc20', symbol: 'NO', name: 'NO', decimals: 2, image: 'https://e.com/a.png', aggregators: [],
        },
        'eip155:1/erc20:0xoddlength': {
          type: 'erc20', symbol: 'OL', name: 'OL', decimals: 2, image: 'https://e.com/a.png', aggregators: [], occurrences: 1,
        },
      },
      assetPreferences: {},
    },
    { chainIds: ['eip155:1'], accountsWithSupportedChains: [] },
    {},
  );
  push(
    'response-heal-matrix',
    {
      assetsBalance: {
        'a-1': { 'eip155:1/erc20:0xInStateBalance': { amount: '1' } },
      },
      assetsInfo: { 'eip155:1/erc20:0xInStateMetadata': { type: 'erc20', symbol: 'IM' } },
      assetPreferences: {},
    },
    { chainIds: ['eip155:1'], accountsWithSupportedChains: [] },
    {
      assetsBalance: {
        'a-1': {
          'eip155:1/erc20:0xInStateBalance': { amount: '1' },
          'eip155:1/erc20:0xInStateMetadata': { amount: '1' },
          'eip155:1/erc20:0xBrandNew': { amount: '1' },
        },
      },
      assetsInfo: {
        'eip155:1/erc20:0xinstatebalance': {
          type: 'erc20', symbol: 'IB', name: 'IB', decimals: 1, image: 'https://e.com/b.png', aggregators: [], occurrences: 1,
        },
      },
    },
  );
  push(
    'case-duplicates',
    {
      assetsBalance: {
        'a-1': { 'eip155:1/erc20:0xAaA': { amount: '1' } },
        'a-2': { 'eip155:1/erc20:0xaaa': { amount: '1' } },
      },
      assetsInfo: {},
      assetPreferences: { 'eip155:1/erc20:0xAAA': { hidden: true } },
    },
    { chainIds: ['eip155:1'], accountsWithSupportedChains: [] },
    {
      assetsBalance: {
        'a-1': { 'eip155:1/erc20:0xAaA': { amount: '1' } },
      },
    },
  );
  push(
    'chain-scope-excludes',
    {
      assetsBalance: {
        'a-1': {
          'eip155:137/erc20:0xPolygonOnly': { amount: '1' },
          'eip155:1/erc20:0xMainnet': { amount: '1' },
        },
      },
      assetsInfo: {},
      assetPreferences: {},
    },
    { chainIds: ['eip155:1'], accountsWithSupportedChains: [] },
    {},
  );
  push(
    'odd-and-invalid-ids',
    {
      assetsBalance: {
        'a-1': {
          '': { amount: '1' },
          'x': { amount: '1' },
          'eip155:1': { amount: '1' },
          'eip155:1/erc20': { amount: '1' },
          'eip155:1/erc20:': { amount: '1' },
          'eip155:1/erc20:0xok': { amount: '1' },
          'bogus:1/erc20:0xok': { amount: '1' },
          'eip155:1/erc20:0xUPPER': { amount: '1' },
          'eip155:999999999/erc20:0xChainRef': { amount: '1' },
        },
      },
      assetsInfo: {},
      assetPreferences: {},
    },
    { chainIds: ['eip155:1'], accountsWithSupportedChains: [] },
    {},
  );
  return cases;
}

/**
 * Assemble the full bench input set.
 *
 * @returns Object with main/sweep inputs and edge cases.
 */
export function buildInputSet() {
  const main = buildMainInput();
  const sweep = buildSweepInputs();
  const edges = buildEdgeCases();
  let occurrences = 0;
  let uniqueIds = new Set();
  for (const balances of Object.values(main.state.assetsBalance)) {
    occurrences += Object.keys(balances).length;
    for (const id of Object.keys(balances)) uniqueIds.add(id);
  }
  for (const balances of Object.values(main.response.assetsBalance)) {
    occurrences += Object.keys(balances).length;
    for (const id of Object.keys(balances)) uniqueIds.add(id);
  }
  return {
    main,
    sweep,
    edges,
    stats: { occurrences, uniques: uniqueIds.size },
  };
}
