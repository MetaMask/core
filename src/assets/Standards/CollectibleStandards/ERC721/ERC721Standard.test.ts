import Web3 from 'web3';
import HttpProvider from 'ethjs-provider-http';
import nock from 'nock';
import { ERC721Standard } from './ERC721Standard';

const MAINNET_PROVIDER = new HttpProvider(
  'https://mainnet.infura.io/v3/341eacb578dd44a1a049cbc5f6fd4035',
);
const ERC721_GODSADDRESS = '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab';
const CRYPTO_KITTIES_ADDRESS = '0x06012c8cf97BEaD5deAe237070F9587f8E7A266d';
const ERC721_ENSADDRESS = '0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85';

describe('ERC721Standard', () => {
  let erc721Standard: ERC721Standard;
  let web3: any;

  beforeAll(() => {
    web3 = new Web3(MAINNET_PROVIDER);
    erc721Standard = new ERC721Standard(web3);
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.restore();
  });

  it('should determine if contract supports interface correctly', async () => {
    nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [
          {
            to: '0x06012c8cf97BEaD5deAe237070F9587f8E7A266d',
            data:
              '0x01ffc9a7780e9d6300000000000000000000000000000000000000000000000000000000',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 1,
        result:
          '0x0000000000000000000000000000000000000000000000000000000000000000',
      })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 2,
        method: 'eth_call',
        params: [
          {
            to: '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab',
            data:
              '0x01ffc9a7780e9d6300000000000000000000000000000000000000000000000000000000',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 2,
        result:
          '0x0000000000000000000000000000000000000000000000000000000000000001',
      });

    const CKSupportsEnumerable = await erc721Standard.contractSupportsEnumerableInterface(
      CRYPTO_KITTIES_ADDRESS,
    );
    const GODSSupportsEnumerable = await erc721Standard.contractSupportsEnumerableInterface(
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
            to: '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab',
            data:
              '0x01ffc9a780ac58cd00000000000000000000000000000000000000000000000000000000',
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
            to: '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab',
            data:
              '0x01ffc9a75b5e139f00000000000000000000000000000000000000000000000000000000',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 4,
        result:
          '0x0000000000000000000000000000000000000000000000000000000000000001',
      })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 5,
        method: 'eth_call',
        params: [
          {
            to: '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab',
            data: '0x95d89b41',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 5,
        result:
          '0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000004474f445300000000000000000000000000000000000000000000000000000000',
      })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 6,
        method: 'eth_call',
        params: [
          {
            to: '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab',
            data: '0x06fdde03',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 6,
        result:
          '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000e476f647320556e636861696e6564000000000000000000000000000000000000',
      });
    const expectedResult = {
      name: 'Gods Unchained',
      standard: 'ERC721',
      symbol: 'GODS',
      tokenURI: undefined,
    };
    const details = await erc721Standard.getDetails(ERC721_GODSADDRESS);
    expect(details).toMatchObject(expectedResult);
  });

  it('should get correct details including tokenURI for a given contract (that supports the ERC721 metadata interface) with a tokenID provided', async () => {
    nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 7,
        method: 'eth_call',
        params: [
          {
            to: '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab',
            data:
              '0x01ffc9a780ac58cd00000000000000000000000000000000000000000000000000000000',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 7,
        result:
          '0x0000000000000000000000000000000000000000000000000000000000000001',
      })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 8,
        method: 'eth_call',
        params: [
          {
            to: '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab',
            data:
              '0x01ffc9a75b5e139f00000000000000000000000000000000000000000000000000000000',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 8,
        result:
          '0x0000000000000000000000000000000000000000000000000000000000000001',
      })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 9,
        method: 'eth_call',
        params: [
          {
            to: '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab',
            data: '0x95d89b41',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 9,
        result:
          '0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000004474f445300000000000000000000000000000000000000000000000000000000',
      })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 10,
        method: 'eth_call',
        params: [
          {
            to: '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab',
            data: '0x06fdde03',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 10,
        result:
          '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000e476f647320556e636861696e6564000000000000000000000000000000000000',
      })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 11,
        method: 'eth_call',
        params: [
          {
            to: '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab',
            data:
              '0x01ffc9a75b5e139f00000000000000000000000000000000000000000000000000000000',
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
            to: '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab',
            data:
              '0xc87b56dd0000000000000000000000000000000000000000000000000000000000000004',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 12,
        result:
          '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000002468747470733a2f2f6170692e676f6473756e636861696e65642e636f6d2f636172642f3400000000000000000000000000000000000000000000000000000000',
      });

    const expectedResult = {
      name: 'Gods Unchained',
      standard: 'ERC721',
      symbol: 'GODS',
      tokenURI: 'https://api.godsunchained.com/card/4',
    };
    const details = await erc721Standard.getDetails(ERC721_GODSADDRESS, '4');
    expect(details).toMatchObject(expectedResult);
  });

  it('should return an object with all fields undefined except standard for a given contract (that does not support the ERC721 metadata interface) with or without a tokenID provided', async () => {
    nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 13,
        method: 'eth_call',
        params: [
          {
            to: '0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85',
            data:
              '0x01ffc9a780ac58cd00000000000000000000000000000000000000000000000000000000',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 13,
        result:
          '0x0000000000000000000000000000000000000000000000000000000000000001',
      })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 14,
        method: 'eth_call',
        params: [
          {
            to: '0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85',
            data:
              '0x01ffc9a75b5e139f00000000000000000000000000000000000000000000000000000000',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 14,
        result:
          '0x0000000000000000000000000000000000000000000000000000000000000000',
      });

    const expectedResult = {
      name: undefined,
      standard: 'ERC721',
      symbol: undefined,
      tokenURI: undefined,
    };
    const details = await erc721Standard.getDetails(ERC721_ENSADDRESS, '4');
    expect(details).toMatchObject(expectedResult);
  });

  it('should reject when passed a contract that does not support ERC721 Interface ID to getDetails method', async () => {
    nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 15,
        method: 'eth_call',
        params: [
          {
            to: '0x06012c8cf97BEaD5deAe237070F9587f8E7A266d',
            data:
              '0x01ffc9a780ac58cd00000000000000000000000000000000000000000000000000000000',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 15,
        result:
          '0x0000000000000000000000000000000000000000000000000000000000000000',
      })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 16,
        method: 'eth_call',
        params: [
          {
            to: '0x06012c8cf97BEaD5deAe237070F9587f8E7A266d',
            data:
              '0x01ffc9a75b5e139f00000000000000000000000000000000000000000000000000000000',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 16,
        result:
          '0x0000000000000000000000000000000000000000000000000000000000000000',
      });

    const result = async () => {
      await erc721Standard.getDetails(CRYPTO_KITTIES_ADDRESS, '4');
    };
    await expect(result).rejects.toThrow("This isn't a valid ERC721 contract");
  });
});
