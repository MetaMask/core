import nock from 'nock';
import { NetworksChainId } from '../network/NetworkController';
import {
  fetchTokenList,
  syncTokens,
  fetchTopAssets,
  fetchTokenMetadata,
} from './token-service';

const TOKEN_END_POINT_API = 'https://token-api.airswap-prod.codefi.network';

const sampleTokenList = [
  {
    address: '0xbbbbca6a901c926f240b89eacb641d8aec7aeafd',
    symbol: 'LRC',
    decimals: 18,
    occurances: 11,
    aggregators: [
      'paraswap',
      'pmm',
      'airswapLight',
      'zeroEx',
      'bancor',
      'coinGecko',
      'zapper',
      'kleros',
      'zerion',
      'cmc',
      'oneInch',
    ],
  },
  {
    address: '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f',
    symbol: 'SNX',
    decimals: 18,
    occurances: 11,
    aggregators: [
      'paraswap',
      'pmm',
      'airswapLight',
      'zeroEx',
      'bancor',
      'coinGecko',
      'zapper',
      'kleros',
      'zerion',
      'cmc',
      'oneInch',
    ],
  },
  {
    address: '0x408e41876cccdc0f92210600ef50372656052a38',
    symbol: 'REN',
    decimals: 18,
    occurances: 11,
    aggregators: [
      'paraswap',
      'pmm',
      'airswapLight',
      'zeroEx',
      'bancor',
      'coinGecko',
      'zapper',
      'kleros',
      'zerion',
      'cmc',
      'oneInch',
    ],
  },
  {
    address: '0x514910771af9ca656af840dff83e8264ecf986ca',
    symbol: 'LINK',
    decimals: 18,
    occurances: 11,
    aggregators: [
      'paraswap',
      'pmm',
      'airswapLight',
      'zeroEx',
      'bancor',
      'coinGecko',
      'zapper',
      'kleros',
      'zerion',
      'cmc',
      'oneInch',
    ],
  },
  {
    address: '0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c',
    symbol: 'BNT',
    decimals: 18,
    occurances: 11,
    aggregators: [
      'paraswap',
      'pmm',
      'airswapLight',
      'zeroEx',
      'bancor',
      'coinGecko',
      'zapper',
      'kleros',
      'zerion',
      'cmc',
      'oneInch',
    ],
  },
];
const sampleTopAssets = [
  {
    address: '0xbbbbca6a901c926f240b89eacb641d8aec7aeafd',
    symbol: 'LRC',
  },
  {
    address: '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f',
    symbol: 'SNX',
  },
  {
    address: '0x408e41876cccdc0f92210600ef50372656052a38',
    symbol: 'REN',
  },
  {
    address: '0x514910771af9ca656af840dff83e8264ecf986ca',
    symbol: 'LINK',
  },
  {
    address: '0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c',
    symbol: 'BNT',
  },
];
const sampleToken = {
  address: '0x514910771af9ca656af840dff83e8264ecf986ca',
  symbol: 'LINK',
  decimals: 18,
  occurances: 11,
  aggregators: [
    'paraswap',
    'pmm',
    'airswapLight',
    'zeroEx',
    'bancor',
    'coinGecko',
    'zapper',
    'kleros',
    'zerion',
    'cmc',
    'oneInch',
  ],
};

describe('FetchtokenList', () => {
  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('should call the tokens api and return the list of tokens', async () => {
    nock(TOKEN_END_POINT_API)
      .get(`/tokens/${NetworksChainId.mainnet}`)
      .reply(200, sampleTokenList)
      .persist();

    const tokens = await fetchTokenList(NetworksChainId.mainnet);

    expect(tokens).toStrictEqual(sampleTokenList);
  });
  it('should call the api to sync tokens and returns nothing', async () => {
    nock(TOKEN_END_POINT_API)
      .get(`/sync/${NetworksChainId.mainnet}`)
      .reply(200)
      .persist();

    expect(await syncTokens(NetworksChainId.mainnet)).toBeUndefined();
  });
  it('should call api for topAssets and return the list of address and symbol of topAssets', async () => {
    nock(TOKEN_END_POINT_API)
      .get(`/topAssets/${NetworksChainId.mainnet}`)
      .reply(200, sampleTopAssets)
      .persist();

    const topAssets = await fetchTopAssets(NetworksChainId.mainnet);

    expect(topAssets).toStrictEqual(sampleTopAssets);
  });
  it('should call the api to return the token metadata for eth address provided', async () => {
    nock(TOKEN_END_POINT_API)
      .get(
        `/tokens/${NetworksChainId.mainnet}?address=0x514910771af9ca656af840dff83e8264ecf986ca`,
      )
      .reply(200, sampleToken)
      .persist();

    const token = await fetchTokenMetadata(
      NetworksChainId.mainnet,
      '0x514910771af9ca656af840dff83e8264ecf986ca',
    );

    expect(token).toStrictEqual(sampleToken);
  });
});
