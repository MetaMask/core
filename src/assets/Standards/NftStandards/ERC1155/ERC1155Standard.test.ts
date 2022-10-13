import Web3 from 'web3';
import HttpProvider from 'ethjs-provider-http';
import nock from 'nock';
import { ERC1155Standard } from './ERC1155Standard';

const MAINNET_PROVIDER = new HttpProvider(
  'https://mainnet.infura.io/v3/341eacb578dd44a1a049cbc5f6fd4035',
);

const ERC1155_ADDRESS = '0xfaaFDc07907ff5120a76b34b731b278c38d6043C';

describe('ERC1155Standard', () => {
  let erc1155Standard: ERC1155Standard;
  let web3: any;
  nock.disableNetConnect();

  beforeAll(() => {
    web3 = new Web3(MAINNET_PROVIDER);
    erc1155Standard = new ERC1155Standard(web3);
  });

  afterAll(() => {
    nock.restore();
  });

  it('should determine if contract supports URI metadata interface correctly', async () => {
    nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
      .post('/v3/341eacb578dd44a1a049cbc5f6fd4035', {
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [
          {
            to: '0xfaaFDc07907ff5120a76b34b731b278c38d6043C',
            data: '0x01ffc9a70e89341c00000000000000000000000000000000000000000000000000000000',
          },
          'latest',
        ],
      })
      .reply(200, {
        jsonrpc: '2.0',
        id: 1,
        result:
          '0x0000000000000000000000000000000000000000000000000000000000000001',
      });
    const contractSupportsUri =
      await erc1155Standard.contractSupportsURIMetadataInterface(
        ERC1155_ADDRESS,
      );
    expect(contractSupportsUri).toBe(true);
  });
});
