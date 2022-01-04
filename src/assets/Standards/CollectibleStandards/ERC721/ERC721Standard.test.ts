import Web3 from 'web3';
import HttpProvider from 'ethjs-provider-http';
import { ERC721Standard } from './ERC721Standard';

const MAINNET_PROVIDER = new HttpProvider(
  'https://mainnet.infura.io/v3/341eacb578dd44a1a049cbc5f6fd4035',
);
const ERC721_GODSADDRESS = '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab';
const ERC721_ENSADDRESS = '0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85';
const CRYPTO_KITTIES_ADDRESS = '0x06012c8cf97BEaD5deAe237070F9587f8E7A266d';

describe('ERC721Standard', () => {
  let erc721Standard: ERC721Standard;
  let web3: any;

  beforeEach(() => {
    web3 = new Web3(MAINNET_PROVIDER);
    erc721Standard = new ERC721Standard(web3);
  });

  it('should determine if contract supports interface correctly', async () => {
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
    const result = async () => {
      await erc721Standard.getDetails(CRYPTO_KITTIES_ADDRESS, '4');
    };
    await expect(result).rejects.toThrow("This isn't a valid ERC721 contract");
  });
});
