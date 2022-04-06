import { Collectible, CollectibleMetadata } from './CollectiblesController';

/**
 * Compares collectible metadata entries to any collectible entry.
 * We need this method when comparing a new fetched collectible metadata, in case a entry changed to a defined value,
 * there's a need to update the collectible in state.
 *
 * @param newCollectibleMetadata - Collectible metadata object.
 * @param collectible - Collectible object to compare with.
 * @returns Whether there are differences.
 */
export function compareCollectiblesMetadata(
  newCollectibleMetadata: CollectibleMetadata,
  collectible: Collectible,
) {
  const keys: (keyof CollectibleMetadata)[] = [
    'image',
    'backgroundColor',
    'imagePreview',
    'imageThumbnail',
    'imageOriginal',
    'animation',
    'animationOriginal',
    'externalLink',
  ];
  const differentValues = keys.reduce((value, key) => {
    if (
      newCollectibleMetadata[key] &&
      newCollectibleMetadata[key] !== collectible[key]
    ) {
      return value + 1;
    }
    return value;
  }, 0);
  return differentValues > 0;
}

export type AggregatorKey =
  | 'aave'
  | 'bancor'
  | 'cmc'
  | 'cryptocom'
  | 'coinGecko'
  | 'oneInch'
  | 'paraswap'
  | 'pmm'
  | 'zapper'
  | 'zerion'
  | 'zeroEx'
  | 'synthetix'
  | 'yearn'
  | 'apeswap'
  | 'binanceDex'
  | 'pancakeTop100'
  | 'pancakeExtended'
  | 'balancer'
  | 'quickswap'
  | 'matcha'
  | 'pangolinDex'
  | 'pangolinDexStableCoin'
  | 'pangolinDexAvaxBridge'
  | 'traderJoe'
  | 'airswapLight'
  | 'kleros';

type AggregatorNameByKey = {
  [key in AggregatorKey]: string;
};

const aggregatorNameByKey: AggregatorNameByKey = {
  aave: 'Aave',
  bancor: 'Bancor',
  cmc: 'CMC',
  cryptocom: 'Crypto.com',
  coinGecko: 'CoinGecko',
  oneInch: '1inch',
  paraswap: 'Paraswap',
  pmm: 'PMM',
  zapper: 'Zapper',
  zerion: 'Zerion',
  zeroEx: '0x',
  synthetix: 'Synthetix',
  yearn: 'Yearn',
  apeswap: 'ApeSwap',
  binanceDex: 'BinanceDex',
  pancakeTop100: 'PancakeTop100',
  pancakeExtended: 'PancakeExtended',
  balancer: 'Balancer',
  quickswap: 'QuickSwap',
  matcha: 'Matcha',
  pangolinDex: 'PangolinDex',
  pangolinDexStableCoin: 'PangolinDexStableCoin',
  pangolinDexAvaxBridge: 'PangolinDexAvaxBridge',
  traderJoe: 'TraderJoe',
  airswapLight: 'AirswapLight',
  kleros: 'Kleros',
};

/**
 * Formats aggregator names to presentable format
 *
 * @param aggregators - List of token list names in camelcase
 * @returns - Formatted aggregator names
 */
export const formatAggregatorNames = (aggregators: AggregatorKey[]) => {
  return aggregators.map(
    (key) =>
      aggregatorNameByKey[key] ||
      `${key[0].toUpperCase()}${key.substring(1, key.length)}`,
  );
};

/**
 * Format token list assets to use image proxy from Codefi
 *
 * @param params.chainId - ChainID of network
 * @param params.tokenAddress - Address of token in lowercase
 * @returns - Formatted image url
 */
export const formatIconUrlWithProxy = ({
  chainId,
  tokenAddress,
}: {
  chainId: string;
  tokenAddress: string;
}) => {
  return `https://static.metaswap.codefi.network/api/v1/tokenIcons/${chainId}/${tokenAddress}.png`;
};
