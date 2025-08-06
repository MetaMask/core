import { Web3Provider } from '@ethersproject/providers';
import HttpProvider from '@metamask/ethjs-provider-http';
import BN from 'bn.js';
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
    const maticDecimals =
      await erc20Standard.getTokenDecimals(ERC20_MATIC_ADDRESS);
    expect(maticDecimals.toString()).toBe('18');
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
      'Value must be a hexadecimal string, starting with "0x".',
    );

    await expect(
      erc20Standard.getTokenDecimals(AMBIRE_ADDRESS),
    ).rejects.toThrow('Failed to parse token decimals');
  });

  it('should get correct token balance for a given ERC20 contract address', async () => {
    nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 7,
        method: 'eth_call',
        params: [
          {
            to: '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0',
            data: '0x70a082310000000000000000000000001234567890123456789012345678901234567890',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 7,
        result:
          '0x00000000000000000000000000000000000000000000003635c9adc5dea00000',
      });

    const balance = await erc20Standard.getBalanceOf(
      ERC20_MATIC_ADDRESS,
      '0x1234567890123456789012345678901234567890',
    );
    expect(balance).toBeInstanceOf(BN);
    expect(balance.toString()).toBe('1000000000000000000000');
  });

  it('should get correct token name for a given ERC20 contract address', async () => {
    nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 8,
        method: 'eth_call',
        params: [
          {
            to: '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0',
            data: '0x06fdde03',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 8,
        result:
          '0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000054d41544943000000000000000000000000000000000000000000000000000000',
      });

    const name = await erc20Standard.getTokenName(ERC20_MATIC_ADDRESS);
    expect(name).toBe('MATIC');
  });

  it('should create instance with provider', () => {
    const MAINNET_PROVIDER = new Web3Provider(MAINNET_PROVIDER_HTTP, 1);
    const instance = new ERC20Standard(MAINNET_PROVIDER);
    expect(instance).toBeInstanceOf(ERC20Standard);
  });

  it('should handle getTokenSymbol with malformed result', async () => {
    const mockProvider = {
      call: jest.fn().mockResolvedValue('0x'),
      detectNetwork: jest
        .fn()
        .mockResolvedValue({ name: 'mainnet', chainId: 1 }),
    };

    const testInstance = new ERC20Standard(
      mockProvider as unknown as Web3Provider,
    );

    await expect(
      testInstance.getTokenSymbol('0x1234567890123456789012345678901234567890'),
    ).rejects.toThrow('Value must be a hexadecimal string');
  });

  it('should get complete details with user address', async () => {
    const mockAddress = '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0';
    const mockUserAddress = '0x1234567890123456789012345678901234567890';

    // Create a new provider for this test
    const MAINNET_PROVIDER = new Web3Provider(MAINNET_PROVIDER_HTTP, 1);
    MAINNET_PROVIDER.detectNetwork = async () => ({
      name: 'mainnet',
      chainId: 1,
    });

    const testInstance = new ERC20Standard(MAINNET_PROVIDER);

    jest.spyOn(testInstance, 'getTokenDecimals').mockResolvedValue('18');
    jest.spyOn(testInstance, 'getTokenSymbol').mockResolvedValue('TEST');
    jest.spyOn(testInstance, 'getBalanceOf').mockResolvedValue(new BN('1000'));

    const details = await testInstance.getDetails(mockAddress, mockUserAddress);

    expect(details.standard).toBe('ERC20');
    expect(details.decimals).toBe('18');
    expect(details.symbol).toBe('TEST');
    expect(details.balance).toBeInstanceOf(BN);
    expect(details.balance?.toString()).toBe('1000');

    // Restore mocks
    jest.restoreAllMocks();
  });

  it('should get details without user address (no balance)', async () => {
    const mockAddress = '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0';

    // Create a new provider for this test
    const MAINNET_PROVIDER = new Web3Provider(MAINNET_PROVIDER_HTTP, 1);
    MAINNET_PROVIDER.detectNetwork = async () => ({
      name: 'mainnet',
      chainId: 1,
    });

    const testInstance = new ERC20Standard(MAINNET_PROVIDER);

    jest.spyOn(testInstance, 'getTokenDecimals').mockResolvedValue('18');
    jest.spyOn(testInstance, 'getTokenSymbol').mockResolvedValue('TEST');

    const details = await testInstance.getDetails(mockAddress);

    expect(details.standard).toBe('ERC20');
    expect(details.decimals).toBe('18');
    expect(details.symbol).toBe('TEST');
    expect(details.balance).toBeUndefined();

    jest.restoreAllMocks();
  });

  // it('should handle getTokenName non-revert exception rethrow', async () => {
  //   const mockProvider = {
  //     call: jest.fn(),
  //     detectNetwork: jest
  //       .fn()
  //       .mockResolvedValue({ name: 'mainnet', chainId: 1 }),
  //   };

  //   const testInstance = new ERC20Standard(mockProvider as any);

  //   // Mock Contract to throw a non-revert error (should be rethrown on line 74)
  //   jest
  //     .spyOn(require('@ethersproject/contracts'), 'Contract')
  //     .mockImplementation(() => ({
  //       name: jest.fn().mockRejectedValue(new Error('Network timeout')),
  //     }));

  //   await expect(
  //     testInstance.getTokenName('0x1234567890123456789012345678901234567890'),
  //   ).rejects.toThrow('Network timeout');

  //   require('@ethersproject/contracts').Contract.mockRestore();
  // });

  it('should handle getTokenSymbol parsing failure', async () => {
    const mockProvider = {
      call: jest
        .fn()
        .mockResolvedValue(
          '0x0000000000000000000000000000000000000000000000000000000000000000',
        ),
      detectNetwork: jest
        .fn()
        .mockResolvedValue({ name: 'mainnet', chainId: 1 }),
    };

    const testInstance = new ERC20Standard(
      mockProvider as unknown as Web3Provider,
    );

    await expect(
      testInstance.getTokenSymbol('0x1234567890123456789012345678901234567890'),
    ).rejects.toThrow('Failed to parse token symbol');
  });
});
