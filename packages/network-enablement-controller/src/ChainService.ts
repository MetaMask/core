import { handleFetch } from '@metamask/controller-utils';
// @ts-expect-error - JSON imports need resolveJsonModule
import slip44 from '@metamask/slip44/slip44.json';
import { toCaipAssetType } from '@metamask/utils';

/** ---- Types ---- */
type ChainsJsonItem = {
  chainId: number;
  name: string;
  nativeCurrency?: { symbol?: string; name?: string; decimals?: number };
};

type Slip44Entry = {
  index: number; // the coin type (e.g., 60)
  symbol?: string; // e.g., 'ETH', 'BNB'
  name?: string; // e.g., 'Ethereum'
};

/** ---- Constants / Cache ---- */
const CHAINS_JSON_URL = 'https://chainid.network/chains.json';
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 min

let chainsCache: ChainsJsonItem[] | null = null;
let chainsFetchedAt = 0;
let inflight: Promise<ChainsJsonItem[]> | null = null;

/** Build a quick symbol -> coinType map from slip44 dataset */
const SLIP44_BY_SYMBOL: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  (slip44 as Slip44Entry[]).forEach((e) => {
    const sym = e.symbol?.toUpperCase();
    if (sym && typeof e.index === 'number' && !(sym in map)) {
      map[sym] = e.index;
    }
  });
  return map;
})();

/** Fallbacks for common native symbols */
const COMMON_SYMBOL_DEFAULTS: Record<string, number> = {
  SOL: 501,
  BTC: 0,
  ETH: 60,
  POL: 966,
  MATIC: 966,
  BNB: 714,
  AVAX: 9000,
  SEI: 19000118,
  MON: 268435779,
  FTM: 1007,
  XDAI: 700,
};

/**
 * Fetch with cache + in-flight dedupe.
 *
 * @returns The chains JSON data.
 */
async function fetchChains(): Promise<ChainsJsonItem[]> {
  const now = Date.now();
  if (chainsCache && now - chainsFetchedAt < CACHE_DURATION_MS) {
    return chainsCache;
  }
  if (inflight) {
    return inflight;
  }

  inflight = (async () => {
    const data = (await handleFetch(CHAINS_JSON_URL)) as unknown;
    if (!Array.isArray(data)) {
      throw new Error('chains.json: unexpected shape');
    }
    // Minimal validation; keep what we need
    const parsed = data
      .filter((x) => x && typeof x === 'object')
      .map((x: Record<string, unknown>): ChainsJsonItem => {
        const nativeCurrency = x.nativeCurrency as
          | { symbol?: string; name?: string; decimals?: number }
          | undefined;
        return {
          chainId: Number(x.chainId),
          name: x.name as string,
          nativeCurrency,
        };
      })
      .filter((x) => Number.isFinite(x.chainId));

    chainsCache = parsed;
    chainsFetchedAt = now;
    inflight = null; // clear in-flight marker
    return parsed;
  })();

  try {
    return await inflight;
  } catch (e) {
    inflight = null;
    throw e;
  }
}

/**
 * Resolve SLIP-44 coinType for a given chainId (EVM only).
 *
 * @param chainId - The chain ID to resolve.
 * @returns The SLIP-44 coin type as a string, or null if not found.
 */
export async function getSlip44ByChainId(
  chainId: number,
): Promise<string | null> {
  try {
    // 1) Lookup by native symbol from chains.json
    const chains = await fetchChains();
    const chain = chains.find((c) => c.chainId === chainId);
    const symbol = chain?.nativeCurrency?.symbol?.toUpperCase();

    if (symbol) {
      // Exact symbol match from slip44 dataset
      const coinType =
        SLIP44_BY_SYMBOL[symbol] ?? COMMON_SYMBOL_DEFAULTS[symbol];
      if (coinType !== undefined) {
        return String(coinType);
      }
    }

    // 2) Heuristic for ETH-based L2s: default to ETH coin type
    // Many L2s (Arbitrum, Optimism, Base, Linea, Scroll, zkSync, etc.) use ETH as native
    return '60';
  } catch (err) {
    // Prefer null for ergonomics (callers can fallback silently)
    console.error(`getSlip44ByChainId(${chainId}) failed:`, err);
    return null;
  }
}

/**
 * Convenience: native CAIP-19 for an EVM chain.
 *
 * @param chainId - The chain ID to generate CAIP-19 for.
 * @returns The CAIP-19 asset type string, or null if not found.
 */
export async function getNativeCaip19(chainId: number): Promise<string | null> {
  const coinType = await getSlip44ByChainId(chainId);
  return coinType
    ? toCaipAssetType('eip155', String(chainId), 'slip44', coinType)
    : null;
}
