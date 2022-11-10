import { Web3Provider } from '@ethersproject/providers';
import HttpProvider from 'ethjs-provider-http';
import nock from 'nock';
import { ERC20Standard } from './ERC20Standard';

const MAINNET_PROVIDER_HTTP = new HttpProvider(
  'https://mainnet.infura.io/v3/341eacb578dd44a1a049cbc5f6fd4035',
);
const ERC20_MATIC_ADDRESS = '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0';
const MKR_ADDRESS = '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2';
const AMBIRE_ADDRESS = '0xa07D75aacEFd11b425AF7181958F0F85c312f143';

describe('ERC20Standard', () => {
  let erc20Standard: ERC20Standard;

  beforeAll(() => {
    const MAINNET_PROVIDER = new Web3Provider(MAINNET_PROVIDER_HTTP, 1);
    // Mock out detectNetwork function for cleaner tests, Ethers calls this a bunch of times because the Web3Provider is paranoid.
    MAINNET_PROVIDER.detectNetwork = async () => ({
      name: 'mainnet',
      chainId: 1,
    });
    erc20Standard = new ERC20Standard(MAINNET_PROVIDER);
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
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
        method: 'eth_call',
        params: [
          {
            to: MKR_ADDRESS.toLowerCase(),
            data: '0x313ce567',
          },
          'latest',
        ],
        id: 3,
        jsonrpc: '2.0',
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 3,
        result:
          '0x0000000000000000000000000000000000000000000000000000000000000012',
      })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        method: 'eth_call',
        params: [
          {
            to: MKR_ADDRESS.toLowerCase(),
            data: '0x95d89b41',
          },
          'latest',
        ],
        id: 4,
        jsonrpc: '2.0',
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

  it('should fail on on empty responses', async () => {
    nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 5,
        method: 'eth_call',
        params: [
          {
            to: AMBIRE_ADDRESS.toLowerCase(),
            data: '0x95d89b41',
          },
          'latest',
        ],
      })
      .reply(200, { jsonrpc: '2.0', id: 5, result: '0x' })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 6,
        method: 'eth_call',
        params: [
          {
            to: AMBIRE_ADDRESS.toLowerCase(),
            data: '0x313ce567',
          },
          'latest',
        ],
      })
      .reply(200, { jsonrpc: '2.0', id: 6, result: '0x' });

    // Some proxy contracts don't revert when requesting symbol() and decimals(), this test makes sure we handle those cases.
    await expect(erc20Standard.getTokenSymbol(AMBIRE_ADDRESS)).rejects.toThrow(
      'Failed to parse token symbol',
    );

    await expect(
      erc20Standard.getTokenDecimals(AMBIRE_ADDRESS),
    ).rejects.toThrow('Failed to parse token decimals');
  });
});
