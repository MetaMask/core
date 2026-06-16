/* eslint-disable no-console */
import { TerminalMarketService } from '../src/services/TerminalMarketService';
import type { PerpsPlatformDependencies } from '../src/types';

const ENDPOINTS: Record<string, string> = {
  dev: 'https://terminal.dev-api.cx.metamask.io',
  uat: 'https://terminal.uat-api.cx.metamask.io',
  prd: 'https://terminal.api.cx.metamask.io',
};

const env = process.argv[2] || 'dev';
const baseUrl = ENDPOINTS[env];

if (!baseUrl) {
  console.error(`Unknown environment "${env}". Use: dev, uat, or prd`);
  process.exit(1);
}

const noop = (): void => undefined;

const deps = {
  terminalApiBaseUrl: baseUrl,
  logger: {
    error: (err: Error, meta: unknown) => {
      console.warn('[validation error]', err.message, meta);
    },
  },
  debugLogger: { log: noop },
  metrics: { trackEvent: noop },
  performance: { now: () => performance.now() },
  tracer: { trace: noop, endTrace: noop, setMeasurement: noop, addBreadcrumb: noop },
} as unknown as PerpsPlatformDependencies;

const service = new TerminalMarketService(deps);

async function main(): Promise<void> {
  console.log(`Fetching from ${baseUrl} via TerminalMarketService...\n`);

  const { markets, metadata } = await service.fetchMarkets();

  console.log(`Total markets: ${markets.length}`);
  console.log(`Metadata entries: ${metadata.size}\n`);

  // Response shape from first market
  if (markets.length > 0) {
    console.log('=== MarketInfo shape (first item) ===');
    console.log(JSON.stringify(markets[0], null, 2));
    console.log();
  }

  // First 5 markets
  console.log('=== First 5 MarketInfo items ===');
  for (const m of markets.slice(0, 5)) {
    console.log(JSON.stringify(m, null, 2));
    console.log('---');
  }

  // All symbols
  console.log('\n=== All symbols ===');
  console.log(markets.map((m) => m.name).join(', '));

  // Metadata enrichment stats
  const withName = [...metadata.values()].filter((m) => m.name);
  const withKeywords = [...metadata.values()].filter((m) => m.keywords?.length);
  const withTags = [...metadata.values()].filter((m) => m.tags?.length);
  const withCategories = [...metadata.values()].filter((m) => m.categories?.length);
  const marketTypes = [
    ...new Set([...metadata.values()].map((m) => m.marketType).filter(Boolean)),
  ];

  console.log('\n=== Metadata enrichment stats ===');
  console.log(`Entries with name:       ${withName.length} / ${metadata.size}`);
  console.log(`Entries with keywords:   ${withKeywords.length} / ${metadata.size}`);
  console.log(`Entries with tags:       ${withTags.length} / ${metadata.size}`);
  console.log(`Entries with categories: ${withCategories.length} / ${metadata.size}`);
  console.log(`Distinct marketTypes:    ${marketTypes.join(', ') || '(none)'}`);

  // Sample fully-enriched metadata entry
  const enrichedEntry = [...metadata.entries()].find(
    ([, m]) => m.keywords?.length && m.marketType,
  );
  if (enrichedEntry) {
    console.log(`\n=== Sample enriched metadata (${enrichedEntry[0]}) ===`);
    console.log(JSON.stringify(enrichedEntry[1], null, 2));
  }
}

main().catch((err) => {
  console.error('Service error:', (err as Error).message);
  process.exit(1);
});
