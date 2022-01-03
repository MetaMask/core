import Web3 from 'web3';
import HttpProvider from 'ethjs-provider-http';
import { ERC20Standard } from './ERC20Standard';

const MAINNET_PROVIDER = new HttpProvider(
  'https://mainnet.infura.io/v3/341eacb578dd44a1a049cbc5f6fd4035',
);
const ERC20_MATIC_ADDRESS = '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0';

describe('ERC20Standard', () => {
  let erc20Standard: ERC20Standard;
  let web3: any;

  beforeEach(() => {
    web3 = new Web3(MAINNET_PROVIDER);
    erc20Standard = new ERC20Standard(web3);
  });

  it('should get correct token symbol for a given ERC20 contract address', async () => {
    const maticSymbol = await erc20Standard.getTokenSymbol(ERC20_MATIC_ADDRESS);
    expect(maticSymbol).toBe('MATIC');
  });

  it('should get correct token decimals for a given ERC20 contract address', async () => {
    const maticDecimals = await erc20Standard.getTokenDecimals(
      ERC20_MATIC_ADDRESS,
    );
    expect(maticDecimals.toString()).toStrictEqual('18');
  });
});
