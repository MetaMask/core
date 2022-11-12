import HttpProvider from 'ethjs-provider-http';
import nock from 'nock';
import { IPFS_DEFAULT_GATEWAY_URL } from '@metamask/controller-utils';
import { Web3Provider } from '@ethersproject/providers';
import { ERC721Standard } from './ERC721Standard';

const MAINNET_PROVIDER_HTTP = new HttpProvider(
  'https://mainnet.infura.io/v3/341eacb578dd44a1a049cbc5f6fd4035',
);
const ERC721_GODSADDRESS = '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab';
const CRYPTO_KITTIES_ADDRESS = '0x06012c8cf97BEaD5deAe237070F9587f8E7A266d';
const ERC721_ENSADDRESS = '0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85';
const ERC721_DECENTRALAND_ADDRESS =
  '0xF87E31492Faf9A91B02Ee0dEAAd50d51d56D5d4d';

describe('ERC721Standard', () => {
  let erc721Standard: ERC721Standard;

  beforeAll(() => {
    const MAINNET_PROVIDER = new Web3Provider(MAINNET_PROVIDER_HTTP, 1);
    // Mock out detectNetwork function for cleaner tests, Ethers calls this a bunch of times because the Web3Provider is paranoid.
    MAINNET_PROVIDER.detectNetwork = async () => ({
      name: 'mainnet',
      chainId: 1,
    });
    erc721Standard = new ERC721Standard(MAINNET_PROVIDER);
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.restore();
    nock.enableNetConnect();
  });

  it('should determine if contract supports interface correctly', async () => {
    nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        method: 'eth_call',
        params: [
          {
            to: '0x06012c8cf97bead5deae237070f9587f8e7a266d',
            data: '0x01ffc9a7780e9d6300000000000000000000000000000000000000000000000000000000',
          },
          'latest',
        ],
        id: 1,
        jsonrpc: '2.0',
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 1,
        result:
          '0x0000000000000000000000000000000000000000000000000000000000000000',
      })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        method: 'eth_call',
        params: [
          {
            to: '0x6ebeaf8e8e946f0716e6533a6f2cefc83f60e8ab',
            data: '0x01ffc9a7780e9d6300000000000000000000000000000000000000000000000000000000',
          },
          'latest',
        ],
        id: 2,
        jsonrpc: '2.0',
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 2,
        result:
          '0x0000000000000000000000000000000000000000000000000000000000000001',
      });
    const CKSupportsEnumerable =
      await erc721Standard.contractSupportsEnumerableInterface(
        CRYPTO_KITTIES_ADDRESS,
      );
    const GODSSupportsEnumerable =
      await erc721Standard.contractSupportsEnumerableInterface(
        ERC721_GODSADDRESS,
      );
    expect(CKSupportsEnumerable).toBe(false);
    expect(GODSSupportsEnumerable).toBe(true);
  });

  it('should get correct details excluding tokenURI for a given contract (that supports the ERC721 metadata interface) without a tokenID provided', async () => {
    nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 3,
        method: 'eth_call',
        params: [
          {
            to: '0x6ebeaf8e8e946f0716e6533a6f2cefc83f60e8ab',
            data: '0x01ffc9a780ac58cd00000000000000000000000000000000000000000000000000000000',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 3,
        result:
          '0x0000000000000000000000000000000000000000000000000000000000000001',
      })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 4,
        method: 'eth_call',
        params: [
          {
            to: '0x6ebeaf8e8e946f0716e6533a6f2cefc83f60e8ab',
            data: '0x95d89b41',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 4,
        result:
          '0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000004474f445300000000000000000000000000000000000000000000000000000000',
      })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 5,
        method: 'eth_call',
        params: [
          {
            to: '0x6ebeaf8e8e946f0716e6533a6f2cefc83f60e8ab',
            data: '0x06fdde03',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 5,
        result:
          '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000e476f647320556e636861696e6564000000000000000000000000000000000000',
      });

    const expectedResult = {
      name: 'Gods Unchained',
      standard: 'ERC721',
      symbol: 'GODS',
      tokenURI: undefined,
    };
    const details = await erc721Standard.getDetails(
      ERC721_GODSADDRESS,
      IPFS_DEFAULT_GATEWAY_URL,
    );
    expect(details).toMatchObject(expectedResult);
  });

  it('should get correct details including tokenURI and image for a given contract (that supports the ERC721 metadata interface) with a tokenID provided when the tokenURI content is not hosted on IPFS', async () => {
    nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 6,
        method: 'eth_call',
        params: [
          {
            to: '0x6ebeaf8e8e946f0716e6533a6f2cefc83f60e8ab',
            data: '0x01ffc9a780ac58cd00000000000000000000000000000000000000000000000000000000',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 6,
        result:
          '0x0000000000000000000000000000000000000000000000000000000000000001',
      })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 7,
        method: 'eth_call',
        params: [
          {
            to: '0x6ebeaf8e8e946f0716e6533a6f2cefc83f60e8ab',
            data: '0x95d89b41',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 7,
        result:
          '0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000004474f445300000000000000000000000000000000000000000000000000000000',
      });

    nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 8,
        method: 'eth_call',
        params: [
          {
            to: '0x6ebeaf8e8e946f0716e6533a6f2cefc83f60e8ab',
            data: '0x06fdde03',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 8,
        result:
          '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000e476f647320556e636861696e6564000000000000000000000000000000000000',
      })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 9,
        method: 'eth_call',
        params: [
          {
            to: '0x6ebeaf8e8e946f0716e6533a6f2cefc83f60e8ab',
            data: '0x01ffc9a75b5e139f00000000000000000000000000000000000000000000000000000000',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 9,
        result:
          '0x0000000000000000000000000000000000000000000000000000000000000001',
      })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 10,
        method: 'eth_call',
        params: [
          {
            to: '0x6ebeaf8e8e946f0716e6533a6f2cefc83f60e8ab',
            data: '0xc87b56dd0000000000000000000000000000000000000000000000000000000000000004',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 10,
        result:
          '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000002468747470733a2f2f6170692e676f6473756e636861696e65642e636f6d2f636172642f3400000000000000000000000000000000000000000000000000000000',
      });

    nock('https://api.godsunchained.com', { encodedQueryParams: true })
      .get('/card/4')
      .reply(200, () => {
        return {
          image: 'https://card.godsunchained.com/?id=1329&q=4',
        };
      });

    const expectedResult = {
      name: 'Gods Unchained',
      standard: 'ERC721',
      symbol: 'GODS',
      tokenURI: 'https://api.godsunchained.com/card/4',
      image: 'https://card.godsunchained.com/?id=1329&q=4',
    };

    const details = await erc721Standard.getDetails(
      ERC721_GODSADDRESS,
      IPFS_DEFAULT_GATEWAY_URL,
      '4',
    );
    expect(details).toMatchObject(expectedResult);
  });

  it('should get correct details including tokenURI and image for a given contract (that supports the ERC721 metadata interface) with a tokenID provided when the tokenURI content is hosted on IPFS', async () => {
    nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 11,
        method: 'eth_call',
        params: [
          {
            to: '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d',
            data: '0x01ffc9a780ac58cd00000000000000000000000000000000000000000000000000000000',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 11,
        result:
          '0x0000000000000000000000000000000000000000000000000000000000000001',
      })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 12,
        method: 'eth_call',
        params: [
          {
            to: '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d',
            data: '0x95d89b41',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 12,
        result:
          '0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000044241594300000000000000000000000000000000000000000000000000000000',
      })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 13,
        method: 'eth_call',
        params: [
          {
            to: '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d',
            data: '0x06fdde03',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 13,
        result:
          '0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000011426f7265644170655961636874436c7562000000000000000000000000000000',
      })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 14,
        method: 'eth_call',
        params: [
          {
            to: '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d',
            data: '0x01ffc9a75b5e139f00000000000000000000000000000000000000000000000000000000',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 14,
        result:
          '0x0000000000000000000000000000000000000000000000000000000000000001',
      });

    nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 15,
        method: 'eth_call',
        params: [
          {
            to: '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d',
            data: '0xc87b56dd0000000000000000000000000000000000000000000000000000000000000003',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 15,
        result:
          '0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000037697066733a2f2f516d65536a53696e4870506e6d586d73704d6a776958794e367a533445397a63636172694752336a7863615774712f33000000000000000000',
      });

    nock(
      'https://bafybeihpjhkeuiq3k6nqa3fkgeigeri7iebtrsuyuey5y6vy36n345xmbi.ipfs.cloudflare-ipfs.com',
    )
      .get('/3')
      .reply(200, () => {
        return {
          image:
            'https://bafybeie5ycnlx5ukzhlecakrbjeqnkpanuolobatuqooaeguptulganq6u.ipfs.cloudflare-ipfs.com',
        };
      });

    const expectedResult = {
      name: 'BoredApeYachtClub',
      standard: 'ERC721',
      symbol: 'BAYC',
      tokenURI:
        'https://bafybeihpjhkeuiq3k6nqa3fkgeigeri7iebtrsuyuey5y6vy36n345xmbi.ipfs.cloudflare-ipfs.com/3',
      image:
        'https://bafybeie5ycnlx5ukzhlecakrbjeqnkpanuolobatuqooaeguptulganq6u.ipfs.cloudflare-ipfs.com',
    };

    const details = await erc721Standard.getDetails(
      '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D',
      IPFS_DEFAULT_GATEWAY_URL,
      '3',
    );
    expect(details).toMatchObject(expectedResult);
  });

  it('should return an object with all fields undefined except standard for a given contract (that does not support the ERC721 metadata interface) with or without a tokenID provided', async () => {
    nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 16,
        method: 'eth_call',
        params: [
          {
            to: '0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85',
            data: '0x01ffc9a780ac58cd00000000000000000000000000000000000000000000000000000000',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 16,
        result:
          '0x0000000000000000000000000000000000000000000000000000000000000001',
      })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 17,
        method: 'eth_call',
        params: [
          {
            to: '0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85',
            data: '0x06fdde03',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 17,
        error: { code: -32000, message: 'execution reverted' },
      });

    const expectedResult = {
      name: undefined,
      standard: 'ERC721',
      symbol: undefined,
      tokenURI: undefined,
    };
    const details = await erc721Standard.getDetails(
      ERC721_ENSADDRESS,
      IPFS_DEFAULT_GATEWAY_URL,
      '4',
    );
    expect(details).toMatchObject(expectedResult);
  });

  it('should reject when passed a contract that does not support ERC721 Interface ID to getDetails method', async () => {
    nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 20,
        method: 'eth_call',
        params: [
          {
            to: '0x06012c8cf97bead5deae237070f9587f8e7a266d',
            data: '0x01ffc9a780ac58cd00000000000000000000000000000000000000000000000000000000',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 20,
        result:
          '0x0000000000000000000000000000000000000000000000000000000000000000',
      });

    const result = async () => {
      await erc721Standard.getDetails(CRYPTO_KITTIES_ADDRESS, '4');
    };
    await expect(result).rejects.toThrow("This isn't a valid ERC721 contract");
  });

  it('should return an object with any or all of name, tokenURI or symbol for a given contract that supports these methods even if it does not support the metadata interface', async () => {
    nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 21,
        method: 'eth_call',
        params: [
          {
            to: '0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d',
            data: '0x01ffc9a780ac58cd00000000000000000000000000000000000000000000000000000000',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 21,
        result:
          '0x0000000000000000000000000000000000000000000000000000000000000001',
      })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 22,
        method: 'eth_call',
        params: [
          {
            to: '0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d',
            data: '0x95d89b41',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 22,
        result:
          '0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000044c414e4400000000000000000000000000000000000000000000000000000000',
      })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 23,
        method: 'eth_call',
        params: [
          {
            to: '0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d',
            data: '0x06fdde03',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 23,
        result:
          '0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000011446563656e7472616c616e64204c414e44000000000000000000000000000000',
      });
    const expectedResult = {
      name: 'Decentraland LAND',
      standard: 'ERC721',
      symbol: 'LAND',
      tokenURI: undefined,
    };
    const details = await erc721Standard.getDetails(
      ERC721_DECENTRALAND_ADDRESS,
      IPFS_DEFAULT_GATEWAY_URL,
      '2381976568446569244243622252022377480050',
    );
    expect(details).toMatchObject(expectedResult);
  });
});
