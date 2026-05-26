/**
 * Script to audit SPOT_PRICES_SUPPORT_INFO against the live price-api.
 *
 * Reports:
 *   1. Chains supported by price-api (v3) but absent from SPOT_PRICES_SUPPORT_INFO.
 *   2. Chains in SPOT_PRICES_SUPPORT_INFO that price-api returns null for (not actually priced).
 *   3. Chains in SPOT_PRICES_SUPPORT_INFO that are NOT supported by price-api at all.
 */

// ── Inline copy of SPOT_PRICES_SUPPORT_INFO (hex → CAIP-19) ─────────────────
const SPOT_PRICES_SUPPORT_INFO = {
  '0x1': 'eip155:1/slip44:60',
  '0xa': 'eip155:10/slip44:60',
  '0x19': 'eip155:25/slip44:394',
  '0x1e': 'eip155:30/slip44:137',
  '0x2a': 'eip155:42/erc20:0x0000000000000000000000000000000000000000',
  '0x32': 'eip155:50/erc20:0x0000000000000000000000000000000000000000',
  '0x38': 'eip155:56/slip44:714',
  '0x39': 'eip155:57/slip44:57',
  '0x52': 'eip155:82/slip44:18000',
  '0x58': 'eip155:88/slip44:889',
  '0x64': 'eip155:100/slip44:700',
  '0x6a': 'eip155:106/slip44:5655640',
  '0x7a': 'eip155:122/erc20:0x0000000000000000000000000000000000000000',
  '0x80': 'eip155:128/slip44:1010',
  '0x89': 'eip155:137/slip44:966',
  '0x8f': 'eip155:143/slip44:268435779',
  '0x92': 'eip155:146/slip44:10007',
  '0xc4': 'eip155:196/erc20:0x0000000000000000000000000000000000000000',
  '0xe8': 'eip155:232/erc20:0x0000000000000000000000000000000000000000',
  '0xfa': 'eip155:250/slip44:1007',
  '0xfc': 'eip155:252/erc20:0x0000000000000000000000000000000000000000',
  '0x10b3e': 'eip155:68414/erc20:0x0000000000000000000000000000000000000000',
  '0x120': 'eip155:288/slip44:60',
  '0x141': 'eip155:321/slip44:641',
  '0x144': 'eip155:324/slip44:60',
  '0x150': 'eip155:336/slip44:809',
  '0x169': 'eip155:361/slip44:589',
  '0x2eb': 'eip155:747/slip44:539',
  '0x3e7': 'eip155:999/slip44:2457',
  '0x440': 'eip155:1088/erc20:0xdeaddeaddeaddeaddeaddeaddeaddeaddead0000',
  '0x44d': 'eip155:1101/slip44:60',
  '0x504': 'eip155:1284/slip44:1284',
  '0x505': 'eip155:1285/slip44:1285',
  '0x531': 'eip155:1329/slip44:19000118',
  '0x6f0': 'eip155:1776/slip44:22000119',
  '0x74c': 'eip155:1868/erc20:0x0000000000000000000000000000000000000000',
  '0xa729': 'eip155:42793/erc20:0x0000000000000000000000000000000000000000',
  '0xab5': 'eip155:2741/erc20:0x0000000000000000000000000000000000000000',
  '0x1079': 'eip155:4217/slip44:60',
  '0x10e6': 'eip155:4326/erc20:0x0000000000000000000000000000000000000000',
  '0x1388': 'eip155:5000/erc20:0xdeaddeaddeaddeaddeaddeaddeaddeaddead0000',
  '0x2105': 'eip155:8453/slip44:60',
  '0x2611': 'eip155:9745/erc20:0x0000000000000000000000000000000000000000',
  '0x2710': 'eip155:10000/slip44:145',
  '0x8173': 'eip155:33139/erc20:0x0000000000000000000000000000000000000000',
  '0xa3c3': 'eip155:41923/erc20:0x0000000000000000000000000000000000000000',
  '0xa4b1': 'eip155:42161/slip44:60',
  '0xa4ec': 'eip155:42220/slip44:52752',
  '0xa516': 'eip155:42262/slip44:474',
  '0xa867': 'eip155:43111/erc20:0x0000000000000000000000000000000000000000',
  '0xa86a': 'eip155:43114/slip44:9005',
  '0xa5bf': 'eip155:42431/slip44:60',
  '0xe708': 'eip155:59144/slip44:60',
  '0xed88': 'eip155:60808/erc20:0x0000000000000000000000000000000000000000',
  '0x138de': 'eip155:80094/erc20:0x0000000000000000000000000000000000000000',
  '0x13c31': 'eip155:81457/slip44:60',
  '0x15b38': 'eip155:88888/erc20:0x0000000000000000000000000000000000000000',
  '0x17dcd': 'eip155:97741/erc20:0x0000000000000000000000000000000000000000',
  '0x18232': 'eip155:98866/erc20:0x0000000000000000000000000000000000000000',
  '0x28c58': 'eip155:167000/slip44:60',
  '0x518af': 'eip155:333999/slip44:1997',
  '0x82750': 'eip155:534352/slip44:60',
  '0xb67d2': 'eip155:747474/erc20:0x0000000000000000000000000000000000000000',
  '0x15f900': 'eip155:1440000/erc20:0x0000000000000000000000000000000000000000',
  '0x4e454152': 'eip155:1313161554/slip44:60',
  '0x63564c40': 'eip155:1666600000/slip44:1023',
  '0xdef1': 'eip155:57073/slip44:60',
  '0x3dc': 'eip155:988/erc20:0x779ded0c9e1022225f8e0630b35a9b54be713736',
  '0xf043a': 'eip155:984122/slip44:984122',
  '0x1b58': 'eip155:7000/slip44:7000',
};

const BASE_URL_V2 = 'https://price.api.cx.metamask.io/v2';
const BASE_URL_V3 = 'https://price.api.cx.metamask.io/v3';

/**
 * Convert a decimal chain ID string to a hex string (e.g. "1" → "0x1").
 *
 * @param decimal
 */
function decimalToHex(decimal) {
  return `0x${parseInt(decimal, 10).toString(16)}`;
}

/**
 * Extract the decimal chain ID from a CAIP-2 chain ID (e.g. "eip155:1" → "1").
 *
 * @param caipChainId
 */
function caipChainToDecimal(caipChainId) {
  const match = caipChainId.match(/^eip155:(\d+)$/u);
  return match ? match[1] : null;
}

/**
 * Fetch JSON from a URL, returning the parsed object or throwing on error.
 *
 * @param url
 */
async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${url}`);
  }
  return res.json();
}

/**
 * Batch an array into chunks of `size`.
 *
 * @param arr
 * @param size
 */
function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function main() {
  // ── 1. Fetch supported networks from price-api ──────────────────────────────
  console.log('Fetching supported networks from price-api…');
  const supportedNetworks = await fetchJson(`${BASE_URL_V2}/supportedNetworks`);

  const apiV3CaipChains = new Set([
    ...supportedNetworks.fullSupport,
    ...supportedNetworks.partialSupport.spotPricesV3,
  ]);

  // Build a set of decimal chain IDs and their hex equivalents from the API.
  const apiV3HexChains = new Set();
  const apiChainDecimalToHex = {};
  for (const caip of apiV3CaipChains) {
    const decimal = caipChainToDecimal(caip);
    if (decimal) {
      const hex = decimalToHex(decimal);
      apiV3HexChains.add(hex);
      apiChainDecimalToHex[decimal] = hex;
    }
  }

  console.log(
    `  price-api supports ${apiV3HexChains.size} EVM chains (v3 spot prices)\n`,
  );

  // ── 2. Build sets for comparison ────────────────────────────────────────────
  const localHexChains = new Set(Object.keys(SPOT_PRICES_SUPPORT_INFO));

  // Chains in price-api but NOT in local map
  const inApiNotLocal = [...apiV3HexChains].filter(
    (h) => !localHexChains.has(h),
  );

  // Chains in local map but NOT in price-api
  const inLocalNotApi = [...localHexChains].filter(
    (h) => !apiV3HexChains.has(h),
  );

  // Chains in both — we need to test whether price-api actually returns a price
  const inBoth = [...localHexChains].filter((h) => apiV3HexChains.has(h));

  // ── 3. Probe price-api for each local asset ID ──────────────────────────────
  console.log(
    `Probing price-api for ${inBoth.length} chains that appear in both lists…`,
  );

  const BATCH_SIZE = 50;
  const batches = chunk(inBoth, BATCH_SIZE);
  const nullResults = [];

  for (const batch of batches) {
    const assetIds = batch.map((hex) => SPOT_PRICES_SUPPORT_INFO[hex]);
    const url = `${BASE_URL_V3}/spot-prices?assetIds=${encodeURIComponent(assetIds.join(','))}`;

    let data;
    try {
      data = await fetchJson(url);
    } catch (err) {
      console.error(`  Error fetching batch: ${err.message}`);
      continue;
    }

    for (const hex of batch) {
      const assetId = SPOT_PRICES_SUPPORT_INFO[hex];
      if (
        Object.prototype.hasOwnProperty.call(data, assetId) &&
        data[assetId] === null
      ) {
        nullResults.push({ hex, assetId });
      }
    }
  }

  // ── 4. Print report ─────────────────────────────────────────────────────────
  console.log(
    '\n══════════════════════════════════════════════════════════════',
  );
  console.log('AUDIT REPORT');
  console.log(
    '══════════════════════════════════════════════════════════════\n',
  );

  // Section A: supported by price-api but missing from local map
  console.log(
    `[A] Chains supported by price-api (v3) but NOT in SPOT_PRICES_SUPPORT_INFO (${inApiNotLocal.length}):`,
  );
  if (inApiNotLocal.length === 0) {
    console.log('    (none)');
  } else {
    for (const hex of inApiNotLocal.sort()) {
      const decimal = parseInt(hex, 16);
      const caip = `eip155:${decimal}`;
      console.log(`  hex=${hex}  decimal=${decimal}  caip=${caip}`);
    }
  }

  console.log();

  // Section B: in both, but price-api returns null
  console.log(
    `[B] Chains in SPOT_PRICES_SUPPORT_INFO AND price-api, but price-api returns null (${nullResults.length}):`,
  );
  if (nullResults.length === 0) {
    console.log('    (none)');
  } else {
    for (const { hex, assetId } of nullResults) {
      console.log(`  hex=${hex}  assetId=${assetId}`);
    }
  }

  console.log();

  // Section C: in local map but NOT in price-api
  console.log(
    `[C] Chains in SPOT_PRICES_SUPPORT_INFO but NOT supported by price-api (${inLocalNotApi.length}):`,
  );
  if (inLocalNotApi.length === 0) {
    console.log('    (none)');
  } else {
    for (const hex of inLocalNotApi.sort()) {
      const assetId = SPOT_PRICES_SUPPORT_INFO[hex];
      console.log(`  hex=${hex}  assetId=${assetId}`);
    }
  }

  console.log(
    '\n══════════════════════════════════════════════════════════════\n',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
