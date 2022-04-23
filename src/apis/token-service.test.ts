import nock from 'nock';
import { NetworksChainId } from '../network/NetworkController';
import { fetchTokenList, fetchTokenMetadata } from './token-service';

const TOKEN_END_POINT_API = 'https://token-api.metaswap.codefi.network';

const ONE_MILLISECOND = 1;
const ONE_SECOND_IN_MILLISECONDS = 1_000;

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
    name: 'Synthetix',
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
    name: 'Chainlink',
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
    name: 'Bancor',
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
  name: 'Chainlink',
};

describe('Token service', () => {
  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('fetchTokenList', () => {
    it('should call the tokens api and return the list of tokens', async () => {
      const { signal } = new AbortController();
      nock(TOKEN_END_POINT_API)
        .get(`/tokens/${NetworksChainId.mainnet}`)
        .reply(200, sampleTokenList)
        .persist();

      const tokens = await fetchTokenList(NetworksChainId.mainnet, signal);

      expect(tokens).toStrictEqual(sampleTokenList);
    });

    it('should return undefined if the fetch is aborted', async () => {
      const abortController = new AbortController();
      nock(TOKEN_END_POINT_API)
        .get(`/tokens/${NetworksChainId.mainnet}`)
        // well beyond time it will take to abort
        .delay(ONE_SECOND_IN_MILLISECONDS)
        .reply(200, sampleTokenList)
        .persist();

      const fetchPromise = fetchTokenList(
        NetworksChainId.mainnet,
        abortController.signal,
      );
      abortController.abort();

      expect(await fetchPromise).toBeUndefined();
    });

    it('should return undefined if the fetch fails with a network error', async () => {
      const { signal } = new AbortController();
      nock(TOKEN_END_POINT_API)
        .get(`/tokens/${NetworksChainId.mainnet}`)
        .replyWithError('Example network error')
        .persist();

      const result = await fetchTokenList(NetworksChainId.mainnet, signal);

      expect(result).toBeUndefined();
    });

    it('should return undefined if the fetch fails with an unsuccessful status code', async () => {
      const { signal } = new AbortController();
      nock(TOKEN_END_POINT_API)
        .get(`/tokens/${NetworksChainId.mainnet}`)
        .reply(500)
        .persist();

      const result = await fetchTokenList(NetworksChainId.mainnet, signal);

      expect(result).toBeUndefined();
    });

    it('should return undefined if the fetch fails with a timeout', async () => {
      const { signal } = new AbortController();
      nock(TOKEN_END_POINT_API)
        .get(`/tokens/${NetworksChainId.mainnet}`)
        // well beyond timeout
        .delay(ONE_SECOND_IN_MILLISECONDS)
        .reply(200, sampleTokenList)
        .persist();

      const result = await fetchTokenList(NetworksChainId.mainnet, signal, {
        timeout: ONE_MILLISECOND,
      });

      expect(result).toBeUndefined();
    });
  });

  describe('fetchTokenMetadata', () => {
    it('should call the api to return the token metadata for eth address provided', async () => {
      const { signal } = new AbortController();
      nock(TOKEN_END_POINT_API)
        .get(
          `/token/${NetworksChainId.mainnet}?address=0x514910771af9ca656af840dff83e8264ecf986ca`,
        )
        .reply(200, sampleToken)
        .persist();

      const token = await fetchTokenMetadata(
        NetworksChainId.mainnet,
        '0x514910771af9ca656af840dff83e8264ecf986ca',
        signal,
      );

      expect(token).toStrictEqual(sampleToken);
    });

    it('should return undefined if the fetch is aborted', async () => {
      const abortController = new AbortController();
      nock(TOKEN_END_POINT_API)
        .get(`/tokens/${NetworksChainId.mainnet}`)
        // well beyond time it will take to abort
        .delay(ONE_SECOND_IN_MILLISECONDS)
        .reply(200, sampleTokenList)
        .persist();

      const fetchPromise = fetchTokenMetadata(
        NetworksChainId.mainnet,
        '0x514910771af9ca656af840dff83e8264ecf986ca',
        abortController.signal,
      );
      abortController.abort();

      expect(await fetchPromise).toBeUndefined();
    });

    it('should return undefined if the fetch fails with a network error', async () => {
      const { signal } = new AbortController();
      nock(TOKEN_END_POINT_API)
        .get(`/tokens/${NetworksChainId.mainnet}`)
        .replyWithError('Example network error')
        .persist();

      const result = await fetchTokenMetadata(
        NetworksChainId.mainnet,
        '0x514910771af9ca656af840dff83e8264ecf986ca',
        signal,
      );

      expect(result).toBeUndefined();
    });

    it('should return undefined if the fetch fails with an unsuccessful status code', async () => {
      const { signal } = new AbortController();
      nock(TOKEN_END_POINT_API)
        .get(`/tokens/${NetworksChainId.mainnet}`)
        .reply(500)
        .persist();

      const result = await fetchTokenMetadata(
        NetworksChainId.mainnet,
        '0x514910771af9ca656af840dff83e8264ecf986ca',
        signal,
      );

      expect(result).toBeUndefined();
    });

    it('should return undefined if the fetch fails with a timeout', async () => {
      const { signal } = new AbortController();
      nock(TOKEN_END_POINT_API)
        .get(`/tokens/${NetworksChainId.mainnet}`)
        // well beyond timeout
        .delay(ONE_SECOND_IN_MILLISECONDS)
        .reply(200, sampleTokenList)
        .persist();

      const result = await fetchTokenMetadata(
        NetworksChainId.mainnet,
        '0x514910771af9ca656af840dff83e8264ecf986ca',
        signal,
        { timeout: ONE_MILLISECOND },
      );

      expect(result).toBeUndefined();
    });
  });
});
