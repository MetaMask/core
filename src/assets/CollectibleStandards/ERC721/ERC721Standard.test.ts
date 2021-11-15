import Web3 from 'web3';
import HttpProvider from 'ethjs-provider-http';
import { abiERC721 } from 'metamask-eth-abis';
import { ERC721Standard } from './ERC721Standard';

const MAINNET_PROVIDER = new HttpProvider(
  'https://mainnet.infura.io/v3/341eacb578dd44a1a049cbc5f6fd4035',
);
const ERC721_GODSADDRESS = '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab';
const ERC721_CKADDRESS = '0x06012c8cf97BEaD5deAe237070F9587f8E7A266d';

describe('ERC721Standard', () => {
  let erc721Standard: ERC721Standard;
  let web3: any;

  beforeEach(() => {
    erc721Standard = new ERC721Standard();
    web3 = new Web3(MAINNET_PROVIDER);
  });

  it('should determine if contract supports interface correctly', async () => {
    const ckContract = web3.eth.contract(abiERC721).at(ERC721_CKADDRESS);
    const CKSupportsEnumerable = await erc721Standard.contractSupportsEnumerableInterface(
      ckContract,
    );
    const godsContract = web3.eth.contract(abiERC721).at(ERC721_GODSADDRESS);
    const GODSSupportsEnumerable = await erc721Standard.contractSupportsEnumerableInterface(
      godsContract,
    );
    expect(CKSupportsEnumerable).toBe(false);
    expect(GODSSupportsEnumerable).toBe(true);
  });
});
