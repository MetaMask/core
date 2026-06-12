import {
  PerpsMarketCollectionTag,
} from '../types';
import type {
  PerpsMarketDefinition,
} from '../types';

const T = PerpsMarketCollectionTag;

/**
 * Ordered list of all market collection tags for UI filter pills.
 * The order here determines display order in the consumer UI.
 */
export const PERPS_MARKET_COLLECTION_TAGS: readonly PerpsMarketCollectionTag[] =
  [
    T.L1,
    T.L2Scaling,
    T.BitcoinEcosystem,
    T.SolanaEcosystem,
    T.CosmosEcosystem,
    T.TonEcosystem,
    T.HyperliquidEcosystem,
    T.MoveEcosystem,
    T.SmartContractPlatform,
    T.DeFi,
    T.ExchangeToken,
    T.Memecoin,
    T.GamingNft,
    T.AiDepin,
    T.Infrastructure,
    T.Oracle,
    T.Interoperability,
    T.Payments,
    T.LiquidStaking,
    T.RwaStablecoin,
    T.ZkModular,
    T.Privacy,
    T.StorageData,
    T.StoreOfValue,
    T.Metaverse,
    T.IotInfrastructure,
    T.Political,
  ] as const;

/**
 * Canonical registry of all supported perps markets.
 * Each entry defines the ticker and thematic collections.
 */
export const PERPS_MARKET_DEFINITIONS: readonly PerpsMarketDefinition[] = [
  { ticker: 'BTC', collections: [T.L1, T.BitcoinEcosystem, T.StoreOfValue] },
  { ticker: 'ETH', collections: [T.L1, T.SmartContractPlatform] },
  { ticker: 'ATOM', collections: [T.L1, T.CosmosEcosystem, T.Interoperability] },
  { ticker: 'DYDX', collections: [T.DeFi, T.CosmosEcosystem, T.ExchangeToken] },
  { ticker: 'SOL', collections: [T.L1, T.SolanaEcosystem] },
  { ticker: 'AVAX', collections: [T.L1, T.SmartContractPlatform] },
  { ticker: 'BNB', collections: [T.L1, T.ExchangeToken, T.SmartContractPlatform] },
  { ticker: 'APE', collections: [T.GamingNft] },
  { ticker: 'OP', collections: [T.L2Scaling] },
  { ticker: 'LTC', collections: [T.L1, T.BitcoinEcosystem, T.Payments] },
  { ticker: 'ARB', collections: [T.L2Scaling] },
  { ticker: 'DOGE', collections: [T.L1, T.Memecoin, T.Payments] },
  { ticker: 'INJ', collections: [T.L1, T.CosmosEcosystem, T.DeFi] },
  { ticker: 'SUI', collections: [T.L1, T.MoveEcosystem] },
  { ticker: 'kPEPE', collections: [T.Memecoin] },
  { ticker: 'CRV', collections: [T.DeFi] },
  { ticker: 'LDO', collections: [T.DeFi, T.LiquidStaking] },
  { ticker: 'LINK', collections: [T.Infrastructure, T.Oracle] },
  { ticker: 'STX', collections: [T.L2Scaling, T.BitcoinEcosystem] },
  { ticker: 'CFX', collections: [T.L1, T.SmartContractPlatform] },
  { ticker: 'GMX', collections: [T.DeFi, T.ExchangeToken] },
  { ticker: 'SNX', collections: [T.DeFi] },
  { ticker: 'XRP', collections: [T.L1, T.Payments] },
  { ticker: 'BCH', collections: [T.L1, T.BitcoinEcosystem, T.Payments] },
  { ticker: 'APT', collections: [T.L1, T.MoveEcosystem] },
  { ticker: 'AAVE', collections: [T.DeFi] },
  { ticker: 'COMP', collections: [T.DeFi] },
  { ticker: 'WLD', collections: [T.AiDepin] },
  { ticker: 'YGG', collections: [T.GamingNft] },
  { ticker: 'TRX', collections: [T.L1, T.SmartContractPlatform] },
  { ticker: 'kSHIB', collections: [T.Memecoin] },
  { ticker: 'UNI', collections: [T.DeFi, T.ExchangeToken] },
  { ticker: 'SEI', collections: [T.L1, T.CosmosEcosystem, T.DeFi] },
  { ticker: 'RUNE', collections: [T.BitcoinEcosystem, T.DeFi] },
  { ticker: 'ZRO', collections: [T.Infrastructure, T.Interoperability] },
  { ticker: 'DOT', collections: [T.L1, T.Interoperability] },
  { ticker: 'BANANA', collections: [T.Memecoin, T.DeFi] },
  { ticker: 'TRB', collections: [T.Infrastructure, T.Oracle] },
  { ticker: 'FTT', collections: [T.ExchangeToken] },
  { ticker: 'ARK', collections: [T.L1] },
  { ticker: 'BIGTIME', collections: [T.GamingNft] },
  { ticker: 'KAS', collections: [T.L1, T.BitcoinEcosystem] },
  { ticker: 'BLUR', collections: [T.GamingNft, T.DeFi] },
  { ticker: 'TIA', collections: [T.L1, T.ZkModular, T.CosmosEcosystem] },
  { ticker: 'BSV', collections: [T.L1, T.BitcoinEcosystem] },
  { ticker: 'ADA', collections: [T.L1, T.SmartContractPlatform] },
  { ticker: 'TON', collections: [T.L1, T.TonEcosystem] },
  { ticker: 'MINA', collections: [T.L1, T.ZkModular] },
  { ticker: 'POLYX', collections: [T.RwaStablecoin, T.Infrastructure] },
  { ticker: 'GAS', collections: [T.Infrastructure] },
  { ticker: 'PENDLE', collections: [T.DeFi, T.LiquidStaking] },
  { ticker: 'FET', collections: [T.AiDepin, T.Infrastructure] },
  { ticker: 'NEAR', collections: [T.L1, T.SmartContractPlatform] },
  { ticker: 'MEME', collections: [T.Memecoin] },
  { ticker: 'ORDI', collections: [T.BitcoinEcosystem] },
  { ticker: 'NEO', collections: [T.L1, T.SmartContractPlatform] },
  { ticker: 'ZEN', collections: [T.L1, T.Privacy] },
  { ticker: 'FIL', collections: [T.L1, T.StorageData] },
  { ticker: 'PYTH', collections: [T.Infrastructure, T.Oracle, T.SolanaEcosystem] },
  { ticker: 'SUSHI', collections: [T.DeFi, T.ExchangeToken] },
  { ticker: 'IMX', collections: [T.GamingNft, T.L2Scaling] },
  { ticker: 'kBONK', collections: [T.Memecoin, T.SolanaEcosystem] },
  { ticker: 'GMT', collections: [T.GamingNft] },
  { ticker: 'SUPER', collections: [T.GamingNft] },
  { ticker: 'JUP', collections: [T.DeFi, T.SolanaEcosystem, T.ExchangeToken] },
  { ticker: 'kLUNC', collections: [T.Memecoin] },
  { ticker: 'RSR', collections: [T.DeFi, T.RwaStablecoin] },
  { ticker: 'GALA', collections: [T.GamingNft] },
  { ticker: 'JTO', collections: [T.DeFi, T.SolanaEcosystem, T.LiquidStaking] },
  { ticker: 'ACE', collections: [T.GamingNft] },
  { ticker: 'WIF', collections: [T.Memecoin, T.SolanaEcosystem] },
  { ticker: 'CAKE', collections: [T.DeFi, T.ExchangeToken] },
  { ticker: 'PEOPLE', collections: [T.Memecoin] },
  { ticker: 'ENS', collections: [T.Infrastructure] },
  { ticker: 'ETC', collections: [T.L1, T.BitcoinEcosystem] },
  { ticker: 'XAI', collections: [T.GamingNft, T.L2Scaling] },
  { ticker: 'MANTA', collections: [T.L2Scaling, T.ZkModular] },
  { ticker: 'UMA', collections: [T.Infrastructure, T.Oracle, T.DeFi] },
  { ticker: 'ONDO', collections: [T.RwaStablecoin, T.DeFi] },
  { ticker: 'ALT', collections: [T.L2Scaling, T.ZkModular] },
  { ticker: 'ZETA', collections: [T.L1, T.Interoperability] },
  { ticker: 'DYM', collections: [T.L1, T.ZkModular] },
  { ticker: 'W', collections: [T.L1, T.Interoperability] },
  { ticker: 'STRK', collections: [T.L2Scaling, T.ZkModular] },
  { ticker: 'TAO', collections: [T.L1, T.AiDepin] },
  { ticker: 'AR', collections: [T.L1, T.StorageData] },
  { ticker: 'kFLOKI', collections: [T.Memecoin] },
  { ticker: 'BOME', collections: [T.Memecoin, T.SolanaEcosystem] },
  { ticker: 'ETHFI', collections: [T.DeFi, T.LiquidStaking] },
  { ticker: 'ENA', collections: [T.DeFi, T.RwaStablecoin] },
  { ticker: 'MNT', collections: [T.L2Scaling, T.ExchangeToken] },
  { ticker: 'TNSR', collections: [T.GamingNft, T.SolanaEcosystem] },
  { ticker: 'SAGA', collections: [T.L1, T.GamingNft] },
  { ticker: 'MERL', collections: [T.L2Scaling, T.BitcoinEcosystem] },
  { ticker: 'HBAR', collections: [T.L1, T.SmartContractPlatform] },
  { ticker: 'POPCAT', collections: [T.Memecoin, T.SolanaEcosystem] },
  { ticker: 'EIGEN', collections: [T.Infrastructure, T.LiquidStaking] },
  { ticker: 'REZ', collections: [T.DeFi, T.LiquidStaking] },
  { ticker: 'NOT', collections: [T.Memecoin, T.TonEcosystem] },
  { ticker: 'TURBO', collections: [T.AiDepin, T.Memecoin] },
  { ticker: 'BRETT', collections: [T.Memecoin] },
  { ticker: 'IO', collections: [T.AiDepin] },
  { ticker: 'ZK', collections: [T.L2Scaling, T.ZkModular] },
  { ticker: 'BLAST', collections: [T.L2Scaling, T.DeFi] },
  { ticker: 'RENDER', collections: [T.AiDepin] },
  { ticker: 'POL', collections: [T.L2Scaling] },
  { ticker: 'CELO', collections: [T.L1, T.Payments] },
  { ticker: 'HMSTR', collections: [T.Memecoin, T.TonEcosystem] },
  { ticker: 'kNEIRO', collections: [T.Memecoin] },
  { ticker: 'GOAT', collections: [T.AiDepin, T.Memecoin] },
  { ticker: 'MOODENG', collections: [T.Memecoin] },
  { ticker: 'GRASS', collections: [T.AiDepin] },
  { ticker: 'PURR', collections: [T.Memecoin, T.HyperliquidEcosystem] },
  { ticker: 'PNUT', collections: [T.Memecoin, T.SolanaEcosystem] },
  { ticker: 'XLM', collections: [T.L1, T.Payments] },
  { ticker: 'CHILLGUY', collections: [T.Memecoin, T.SolanaEcosystem] },
  { ticker: 'SAND', collections: [T.GamingNft, T.Metaverse] },
  { ticker: 'IOTA', collections: [T.L1, T.IotInfrastructure] },
  { ticker: 'ALGO', collections: [T.L1, T.SmartContractPlatform] },
  { ticker: 'HYPE', collections: [T.L1, T.ExchangeToken, T.HyperliquidEcosystem] },
  { ticker: 'ME', collections: [T.GamingNft, T.SolanaEcosystem] },
  { ticker: 'MOVE', collections: [T.L1, T.MoveEcosystem] },
  { ticker: 'VIRTUAL', collections: [T.AiDepin] },
  { ticker: 'PENGU', collections: [T.Memecoin, T.GamingNft, T.SolanaEcosystem] },
  { ticker: 'USUAL', collections: [T.DeFi, T.RwaStablecoin] },
  { ticker: 'FARTCOIN', collections: [T.Memecoin] },
  { ticker: 'AIXBT', collections: [T.AiDepin, T.Memecoin] },
  { ticker: 'BIO', collections: [T.AiDepin] },
  { ticker: 'GRIFFAIN', collections: [T.AiDepin, T.Memecoin] },
  { ticker: 'SPX', collections: [T.AiDepin, T.Memecoin] },
  { ticker: 'S', collections: [T.L1, T.SmartContractPlatform] },
  { ticker: 'MORPHO', collections: [T.DeFi] },
  { ticker: 'TRUMP', collections: [T.Memecoin, T.Political] },
  { ticker: 'MELANIA', collections: [T.Memecoin, T.Political] },
  { ticker: 'ANIME', collections: [T.GamingNft, T.Memecoin] },
  { ticker: 'VINE', collections: [T.Memecoin] },
  { ticker: 'VVV', collections: [T.DeFi] },
  { ticker: 'BERA', collections: [T.L1, T.DeFi] },
  { ticker: 'TST', collections: [T.Memecoin] },
  { ticker: 'LAYER', collections: [T.LiquidStaking, T.SolanaEcosystem] },
  { ticker: 'IP', collections: [T.Infrastructure] },
  { ticker: 'KAITO', collections: [T.AiDepin, T.Infrastructure] },
  { ticker: 'NIL', collections: [T.L1, T.ZkModular] },
  { ticker: 'PAXG', collections: [T.RwaStablecoin] },
  { ticker: 'BABY', collections: [T.Memecoin] },
  { ticker: 'WCT', collections: [T.Infrastructure] },
  { ticker: 'HYPER', collections: [T.AiDepin] },
  { ticker: 'ZORA', collections: [T.GamingNft, T.L2Scaling] },
  { ticker: 'INIT', collections: [T.L1, T.SmartContractPlatform] },
  { ticker: 'DOOD', collections: [T.GamingNft, T.Memecoin] },

  { ticker: 'SOPH', collections: [T.L2Scaling, T.AiDepin] },
  { ticker: 'RESOLV', collections: [T.DeFi, T.RwaStablecoin] },
  { ticker: 'SYRUP', collections: [T.DeFi] },
  { ticker: 'PUMP', collections: [T.Memecoin, T.SolanaEcosystem] },
  { ticker: 'PROVE', collections: [T.ZkModular, T.Infrastructure] },

  { ticker: 'WLFI', collections: [T.DeFi] },
  { ticker: 'LINEA', collections: [T.L2Scaling, T.ZkModular] },
  { ticker: 'SKY', collections: [T.DeFi, T.RwaStablecoin] },
  { ticker: 'ASTER', collections: [T.DeFi, T.ExchangeToken] },

  { ticker: 'STBL', collections: [T.RwaStablecoin] },
  { ticker: '0G', collections: [T.AiDepin, T.StorageData] },
  { ticker: 'HEMI', collections: [T.L2Scaling, T.BitcoinEcosystem] },
  { ticker: 'APEX', collections: [T.DeFi, T.ExchangeToken] },

  { ticker: 'ZEC', collections: [T.L1, T.Privacy] },
  { ticker: 'MON', collections: [T.L1, T.SmartContractPlatform] },
  { ticker: 'MET', collections: [T.L2Scaling] },
  { ticker: 'MEGA', collections: [T.L2Scaling] },

  { ticker: 'ICP', collections: [T.L1, T.Infrastructure] },
  { ticker: 'AERO', collections: [T.DeFi, T.ExchangeToken] },
  { ticker: 'STABLE', collections: [T.RwaStablecoin] },

  { ticker: 'LIT', collections: [T.Infrastructure, T.Privacy] },
  { ticker: 'XMR', collections: [T.L1, T.Privacy] },
  { ticker: 'AXS', collections: [T.GamingNft] },
  { ticker: 'DASH', collections: [T.L1, T.Privacy, T.Payments] },

  { ticker: 'AZTEC', collections: [T.L2Scaling, T.ZkModular, T.Privacy] },

] as const;

const marketsByTicker = new Map<string, PerpsMarketDefinition>(
  PERPS_MARKET_DEFINITIONS.map((m) => [m.ticker, m]),
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
  return PERPS_MARKET_DEFINITIONS.filter((m) =>
    m.collections.includes(collection),
  );
}
