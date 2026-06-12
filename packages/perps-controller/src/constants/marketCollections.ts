import { PerpsMarketCollectionTag } from '../types';
import type { PerpsMarketDefinition } from '../types';

const Tag = PerpsMarketCollectionTag;

/**
 * All market collection tags derived from the enum.
 * Order follows the enum declaration order.
 */
export const PERPS_MARKET_COLLECTION_TAGS: readonly PerpsMarketCollectionTag[] =
  Object.values(PerpsMarketCollectionTag);

/**
 * Canonical registry of all supported perps markets.
 * Each entry defines the ticker and thematic collections.
 */
export const PERPS_MARKET_DEFINITIONS: readonly PerpsMarketDefinition[] = [
  {
    ticker: 'BTC',
    collections: [Tag.L1, Tag.BitcoinEcosystem, Tag.StoreOfValue],
  },
  { ticker: 'ETH', collections: [Tag.L1, Tag.SmartContractPlatform] },
  {
    ticker: 'ATOM',
    collections: [Tag.L1, Tag.CosmosEcosystem, Tag.Interoperability],
  },
  {
    ticker: 'DYDX',
    collections: [Tag.DeFi, Tag.CosmosEcosystem, Tag.ExchangeToken],
  },
  { ticker: 'SOL', collections: [Tag.L1, Tag.SolanaEcosystem] },
  { ticker: 'AVAX', collections: [Tag.L1, Tag.SmartContractPlatform] },
  {
    ticker: 'BNB',
    collections: [Tag.L1, Tag.ExchangeToken, Tag.SmartContractPlatform],
  },
  { ticker: 'APE', collections: [Tag.GamingNft] },
  { ticker: 'OP', collections: [Tag.L2Scaling] },
  { ticker: 'LTC', collections: [Tag.L1, Tag.BitcoinEcosystem, Tag.Payments] },
  { ticker: 'ARB', collections: [Tag.L2Scaling] },
  { ticker: 'DOGE', collections: [Tag.L1, Tag.Memecoin, Tag.Payments] },
  { ticker: 'INJ', collections: [Tag.L1, Tag.CosmosEcosystem, Tag.DeFi] },
  { ticker: 'SUI', collections: [Tag.L1, Tag.MoveEcosystem] },
  { ticker: 'kPEPE', collections: [Tag.Memecoin] },
  { ticker: 'CRV', collections: [Tag.DeFi] },
  { ticker: 'LDO', collections: [Tag.DeFi, Tag.LiquidStaking] },
  { ticker: 'LINK', collections: [Tag.Infrastructure, Tag.Oracle] },
  { ticker: 'STX', collections: [Tag.L2Scaling, Tag.BitcoinEcosystem] },
  { ticker: 'CFX', collections: [Tag.L1, Tag.SmartContractPlatform] },
  { ticker: 'GMX', collections: [Tag.DeFi, Tag.ExchangeToken] },
  { ticker: 'SNX', collections: [Tag.DeFi] },
  { ticker: 'XRP', collections: [Tag.L1, Tag.Payments] },
  { ticker: 'BCH', collections: [Tag.L1, Tag.BitcoinEcosystem, Tag.Payments] },
  { ticker: 'APT', collections: [Tag.L1, Tag.MoveEcosystem] },
  { ticker: 'AAVE', collections: [Tag.DeFi] },
  { ticker: 'COMP', collections: [Tag.DeFi] },
  { ticker: 'WLD', collections: [Tag.AiDepin] },
  { ticker: 'YGG', collections: [Tag.GamingNft] },
  { ticker: 'TRX', collections: [Tag.L1, Tag.SmartContractPlatform] },
  { ticker: 'kSHIB', collections: [Tag.Memecoin] },
  { ticker: 'UNI', collections: [Tag.DeFi, Tag.ExchangeToken] },
  { ticker: 'SEI', collections: [Tag.L1, Tag.CosmosEcosystem, Tag.DeFi] },
  { ticker: 'RUNE', collections: [Tag.BitcoinEcosystem, Tag.DeFi] },
  { ticker: 'ZRO', collections: [Tag.Infrastructure, Tag.Interoperability] },
  { ticker: 'DOT', collections: [Tag.L1, Tag.Interoperability] },
  { ticker: 'BANANA', collections: [Tag.Memecoin, Tag.DeFi] },
  { ticker: 'TRB', collections: [Tag.Infrastructure, Tag.Oracle] },
  { ticker: 'FTT', collections: [Tag.ExchangeToken] },
  { ticker: 'ARK', collections: [Tag.L1] },
  { ticker: 'BIGTIME', collections: [Tag.GamingNft] },
  { ticker: 'KAS', collections: [Tag.L1, Tag.BitcoinEcosystem] },
  { ticker: 'BLUR', collections: [Tag.GamingNft, Tag.DeFi] },
  { ticker: 'TIA', collections: [Tag.L1, Tag.ZkModular, Tag.CosmosEcosystem] },
  { ticker: 'BSV', collections: [Tag.L1, Tag.BitcoinEcosystem] },
  { ticker: 'ADA', collections: [Tag.L1, Tag.SmartContractPlatform] },
  { ticker: 'TON', collections: [Tag.L1, Tag.TonEcosystem] },
  { ticker: 'MINA', collections: [Tag.L1, Tag.ZkModular] },
  { ticker: 'POLYX', collections: [Tag.RwaStablecoin, Tag.Infrastructure] },
  { ticker: 'GAS', collections: [Tag.Infrastructure] },
  { ticker: 'PENDLE', collections: [Tag.DeFi, Tag.LiquidStaking] },
  { ticker: 'FET', collections: [Tag.AiDepin, Tag.Infrastructure] },
  { ticker: 'NEAR', collections: [Tag.L1, Tag.SmartContractPlatform] },
  { ticker: 'MEME', collections: [Tag.Memecoin] },
  { ticker: 'ORDI', collections: [Tag.BitcoinEcosystem] },
  { ticker: 'NEO', collections: [Tag.L1, Tag.SmartContractPlatform] },
  { ticker: 'ZEN', collections: [Tag.L1, Tag.Privacy] },
  { ticker: 'FIL', collections: [Tag.L1, Tag.StorageData] },
  {
    ticker: 'PYTH',
    collections: [Tag.Infrastructure, Tag.Oracle, Tag.SolanaEcosystem],
  },
  { ticker: 'SUSHI', collections: [Tag.DeFi, Tag.ExchangeToken] },
  { ticker: 'IMX', collections: [Tag.GamingNft, Tag.L2Scaling] },
  { ticker: 'kBONK', collections: [Tag.Memecoin, Tag.SolanaEcosystem] },
  { ticker: 'GMT', collections: [Tag.GamingNft] },
  { ticker: 'SUPER', collections: [Tag.GamingNft] },
  {
    ticker: 'JUP',
    collections: [Tag.DeFi, Tag.SolanaEcosystem, Tag.ExchangeToken],
  },
  { ticker: 'kLUNC', collections: [Tag.Memecoin] },
  { ticker: 'RSR', collections: [Tag.DeFi, Tag.RwaStablecoin] },
  { ticker: 'GALA', collections: [Tag.GamingNft] },
  {
    ticker: 'JTO',
    collections: [Tag.DeFi, Tag.SolanaEcosystem, Tag.LiquidStaking],
  },
  { ticker: 'ACE', collections: [Tag.GamingNft] },
  { ticker: 'WIF', collections: [Tag.Memecoin, Tag.SolanaEcosystem] },
  { ticker: 'CAKE', collections: [Tag.DeFi, Tag.ExchangeToken] },
  { ticker: 'PEOPLE', collections: [Tag.Memecoin] },
  { ticker: 'ENS', collections: [Tag.Infrastructure] },
  { ticker: 'ETC', collections: [Tag.L1, Tag.BitcoinEcosystem] },
  { ticker: 'XAI', collections: [Tag.GamingNft, Tag.L2Scaling] },
  { ticker: 'MANTA', collections: [Tag.L2Scaling, Tag.ZkModular] },
  { ticker: 'UMA', collections: [Tag.Infrastructure, Tag.Oracle, Tag.DeFi] },
  { ticker: 'ONDO', collections: [Tag.RwaStablecoin, Tag.DeFi] },
  { ticker: 'ALT', collections: [Tag.L2Scaling, Tag.ZkModular] },
  { ticker: 'ZETA', collections: [Tag.L1, Tag.Interoperability] },
  { ticker: 'DYM', collections: [Tag.L1, Tag.ZkModular] },
  { ticker: 'W', collections: [Tag.L1, Tag.Interoperability] },
  { ticker: 'STRK', collections: [Tag.L2Scaling, Tag.ZkModular] },
  { ticker: 'TAO', collections: [Tag.L1, Tag.AiDepin] },
  { ticker: 'AR', collections: [Tag.L1, Tag.StorageData] },
  { ticker: 'kFLOKI', collections: [Tag.Memecoin] },
  { ticker: 'BOME', collections: [Tag.Memecoin, Tag.SolanaEcosystem] },
  { ticker: 'ETHFI', collections: [Tag.DeFi, Tag.LiquidStaking] },
  { ticker: 'ENA', collections: [Tag.DeFi, Tag.RwaStablecoin] },
  { ticker: 'MNT', collections: [Tag.L2Scaling, Tag.ExchangeToken] },
  { ticker: 'TNSR', collections: [Tag.GamingNft, Tag.SolanaEcosystem] },
  { ticker: 'SAGA', collections: [Tag.L1, Tag.GamingNft] },
  { ticker: 'MERL', collections: [Tag.L2Scaling, Tag.BitcoinEcosystem] },
  { ticker: 'HBAR', collections: [Tag.L1, Tag.SmartContractPlatform] },
  { ticker: 'POPCAT', collections: [Tag.Memecoin, Tag.SolanaEcosystem] },
  { ticker: 'EIGEN', collections: [Tag.Infrastructure, Tag.LiquidStaking] },
  { ticker: 'REZ', collections: [Tag.DeFi, Tag.LiquidStaking] },
  { ticker: 'NOT', collections: [Tag.Memecoin, Tag.TonEcosystem] },
  { ticker: 'TURBO', collections: [Tag.AiDepin, Tag.Memecoin] },
  { ticker: 'BRETT', collections: [Tag.Memecoin] },
  { ticker: 'IO', collections: [Tag.AiDepin] },
  { ticker: 'ZK', collections: [Tag.L2Scaling, Tag.ZkModular] },
  { ticker: 'BLAST', collections: [Tag.L2Scaling, Tag.DeFi] },
  { ticker: 'RENDER', collections: [Tag.AiDepin] },
  { ticker: 'POL', collections: [Tag.L2Scaling] },
  { ticker: 'CELO', collections: [Tag.L1, Tag.Payments] },
  { ticker: 'HMSTR', collections: [Tag.Memecoin, Tag.TonEcosystem] },
  { ticker: 'kNEIRO', collections: [Tag.Memecoin] },
  { ticker: 'GOAT', collections: [Tag.AiDepin, Tag.Memecoin] },
  { ticker: 'MOODENG', collections: [Tag.Memecoin] },
  { ticker: 'GRASS', collections: [Tag.AiDepin] },
  { ticker: 'PURR', collections: [Tag.Memecoin, Tag.HyperliquidEcosystem] },
  { ticker: 'PNUT', collections: [Tag.Memecoin, Tag.SolanaEcosystem] },
  { ticker: 'XLM', collections: [Tag.L1, Tag.Payments] },
  { ticker: 'CHILLGUY', collections: [Tag.Memecoin, Tag.SolanaEcosystem] },
  { ticker: 'SAND', collections: [Tag.GamingNft, Tag.Metaverse] },
  { ticker: 'IOTA', collections: [Tag.L1, Tag.IotInfrastructure] },
  { ticker: 'ALGO', collections: [Tag.L1, Tag.SmartContractPlatform] },
  {
    ticker: 'HYPE',
    collections: [Tag.L1, Tag.ExchangeToken, Tag.HyperliquidEcosystem],
  },
  { ticker: 'ME', collections: [Tag.GamingNft, Tag.SolanaEcosystem] },
  { ticker: 'MOVE', collections: [Tag.L1, Tag.MoveEcosystem] },
  { ticker: 'VIRTUAL', collections: [Tag.AiDepin] },
  {
    ticker: 'PENGU',
    collections: [Tag.Memecoin, Tag.GamingNft, Tag.SolanaEcosystem],
  },
  { ticker: 'USUAL', collections: [Tag.DeFi, Tag.RwaStablecoin] },
  { ticker: 'FARTCOIN', collections: [Tag.Memecoin] },
  { ticker: 'AIXBT', collections: [Tag.AiDepin, Tag.Memecoin] },
  { ticker: 'BIO', collections: [Tag.AiDepin] },
  { ticker: 'GRIFFAIN', collections: [Tag.AiDepin, Tag.Memecoin] },
  { ticker: 'SPX', collections: [Tag.AiDepin, Tag.Memecoin] },
  { ticker: 'S', collections: [Tag.L1, Tag.SmartContractPlatform] },
  { ticker: 'MORPHO', collections: [Tag.DeFi] },
  { ticker: 'TRUMP', collections: [Tag.Memecoin, Tag.Political] },
  { ticker: 'MELANIA', collections: [Tag.Memecoin, Tag.Political] },
  { ticker: 'ANIME', collections: [Tag.GamingNft, Tag.Memecoin] },
  { ticker: 'VINE', collections: [Tag.Memecoin] },
  { ticker: 'VVV', collections: [Tag.DeFi] },
  { ticker: 'BERA', collections: [Tag.L1, Tag.DeFi] },
  { ticker: 'TST', collections: [Tag.Memecoin] },
  { ticker: 'LAYER', collections: [Tag.LiquidStaking, Tag.SolanaEcosystem] },
  { ticker: 'IP', collections: [Tag.Infrastructure] },
  { ticker: 'KAITO', collections: [Tag.AiDepin, Tag.Infrastructure] },
  { ticker: 'NIL', collections: [Tag.L1, Tag.ZkModular] },
  { ticker: 'PAXG', collections: [Tag.RwaStablecoin] },
  { ticker: 'BABY', collections: [Tag.Memecoin] },
  { ticker: 'WCT', collections: [Tag.Infrastructure] },
  { ticker: 'HYPER', collections: [Tag.AiDepin] },
  { ticker: 'ZORA', collections: [Tag.GamingNft, Tag.L2Scaling] },
  { ticker: 'INIT', collections: [Tag.L1, Tag.SmartContractPlatform] },
  { ticker: 'DOOD', collections: [Tag.GamingNft, Tag.Memecoin] },

  { ticker: 'SOPH', collections: [Tag.L2Scaling, Tag.AiDepin] },
  { ticker: 'RESOLV', collections: [Tag.DeFi, Tag.RwaStablecoin] },
  { ticker: 'SYRUP', collections: [Tag.DeFi] },
  { ticker: 'PUMP', collections: [Tag.Memecoin, Tag.SolanaEcosystem] },
  { ticker: 'PROVE', collections: [Tag.ZkModular, Tag.Infrastructure] },

  { ticker: 'WLFI', collections: [Tag.DeFi] },
  { ticker: 'LINEA', collections: [Tag.L2Scaling, Tag.ZkModular] },
  { ticker: 'SKY', collections: [Tag.DeFi, Tag.RwaStablecoin] },
  { ticker: 'ASTER', collections: [Tag.DeFi, Tag.ExchangeToken] },

  { ticker: 'STBL', collections: [Tag.RwaStablecoin] },
  { ticker: '0G', collections: [Tag.AiDepin, Tag.StorageData] },
  { ticker: 'HEMI', collections: [Tag.L2Scaling, Tag.BitcoinEcosystem] },
  { ticker: 'APEX', collections: [Tag.DeFi, Tag.ExchangeToken] },

  { ticker: 'ZEC', collections: [Tag.L1, Tag.Privacy] },
  { ticker: 'MON', collections: [Tag.L1, Tag.SmartContractPlatform] },
  { ticker: 'MET', collections: [Tag.L2Scaling] },
  { ticker: 'MEGA', collections: [Tag.L2Scaling] },

  { ticker: 'ICP', collections: [Tag.L1, Tag.Infrastructure] },
  { ticker: 'AERO', collections: [Tag.DeFi, Tag.ExchangeToken] },
  { ticker: 'STABLE', collections: [Tag.RwaStablecoin] },

  { ticker: 'LIT', collections: [Tag.Infrastructure, Tag.Privacy] },
  { ticker: 'XMR', collections: [Tag.L1, Tag.Privacy] },
  { ticker: 'AXS', collections: [Tag.GamingNft] },
  { ticker: 'DASH', collections: [Tag.L1, Tag.Privacy, Tag.Payments] },

  { ticker: 'AZTEC', collections: [Tag.L2Scaling, Tag.ZkModular, Tag.Privacy] },
] as const;

const marketsByTicker = new Map<string, PerpsMarketDefinition>(
  PERPS_MARKET_DEFINITIONS.map((market) => [market.ticker, market]),
);

/**
 * Look up a single market definition by its ticker symbol.
 * O(1) via pre-built Map.
 *
 * @param ticker - The ticker to look up (e.g. 'BTC', 'ETH').
 * @returns The matching definition, or `undefined` if not found.
 */
export function getMarketDefinitionByTicker(
  ticker: string,
): PerpsMarketDefinition | undefined {
  return marketsByTicker.get(ticker);
}

/**
 * Return all market definitions that belong to a given collection tag.
 *
 * @param collection - The collection tag to filter by.
 * @returns Array of matching market definitions (may be empty).
 */
export function getMarketDefinitionsByCollection(
  collection: PerpsMarketCollectionTag,
): PerpsMarketDefinition[] {
  return PERPS_MARKET_DEFINITIONS.filter((market) =>
    market.collections.includes(collection),
  );
}
