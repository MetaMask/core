import Web3 from 'web3';
import HttpProvider from 'ethjs-provider-http';
import nock from 'nock';
import { ERC20Standard } from './ERC20Standard';

const MAINNET_PROVIDER = new HttpProvider(
  'https://mainnet.infura.io/v3/341eacb578dd44a1a049cbc5f6fd4035',
);
const ERC20_MATIC_ADDRESS = '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0';
const MKR_ADDRESS = '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2';

describe('ERC20Standard', () => {
  let erc20Standard: ERC20Standard;
  let web3: any;
  nock.disableNetConnect();

  beforeAll(() => {
    web3 = new Web3(MAINNET_PROVIDER);
    erc20Standard = new ERC20Standard(web3);
  });

  afterAll(() => {
    nock.restore();
  });

  it('should get correct token symbol for a given ERC20 contract address', async () => {
    nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [
          {
            to: '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0',
            data: '0x95d89b41',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 1,
        result:
          '0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000054d41544943000000000000000000000000000000000000000000000000000000',
      });
    const maticSymbol = await erc20Standard.getTokenSymbol(ERC20_MATIC_ADDRESS);
    expect(maticSymbol).toBe('MATIC');
  });

  it('should get correct token decimals for a given ERC20 contract address', async () => {
    nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 2,
        method: 'eth_call',
        params: [
          {
            to: '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0',
            data: '0x313ce567',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 2,
        result:
          '0x0000000000000000000000000000000000000000000000000000000000000012',
      });
    const maticDecimals = await erc20Standard.getTokenDecimals(
      ERC20_MATIC_ADDRESS,
    );
    expect(maticDecimals.toString()).toStrictEqual('18');
  });

  it('should support non-standard ERC20 symbols and decimals', async () => {
    nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 3,
        method: 'eth_call',
        params: [
          {
            to: MKR_ADDRESS,
            data: '0x313ce567',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 3,
        result:
          '0x0000000000000000000000000000000000000000000000000000000000000012',
      })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 4,
        method: 'eth_call',
        params: [
          {
            to: MKR_ADDRESS,
            data: '0x95d89b41',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 4,
        result:
          '0x4d4b520000000000000000000000000000000000000000000000000000000000',
      });
    const decimals = await erc20Standard.getTokenDecimals(MKR_ADDRESS);
    const symbol = await erc20Standard.getTokenSymbol(MKR_ADDRESS);
    expect(decimals).toBe('18');
    expect(symbol).toBe('MKR');
  });
});
