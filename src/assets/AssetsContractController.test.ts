import HttpProvider from 'ethjs-provider-http';
import { AssetsContractController } from './AssetsContractController';

const MAINNET_PROVIDER = new HttpProvider(
  'https://mainnet.infura.io/v3/341eacb578dd44a1a049cbc5f6fd4035',
);
const GODSADDRESS = '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab';
const CKADDRESS = '0x06012c8cf97BEaD5deAe237070F9587f8E7A266d';
const SAI_ADDRESS = '0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359';

const ERC1155_ADDRESS = '0x495f947276749ce646f68ac8c248420045cb7b5e';
const COLLECTIBLE_ID =
  '40815311521795738946686668571398122012172359753720345430028676522525371400193';
const OWNER_ADDRESS = '0x5a3CA5cD63807Ce5e4d7841AB32Ce6B6d9BbBa2D';

describe('AssetsContractController', () => {
  let assetsContract: AssetsContractController;

  beforeEach(() => {
    assetsContract = new AssetsContractController();
  });

  it('should set default config', () => {
    expect(assetsContract.config).toStrictEqual({
      provider: undefined,
    });
  });

  it('should throw when provider property is accessed', () => {
    expect(() => console.log(assetsContract.provider)).toThrow(
      'Property only used for setting',
    );
  });

  it('should get balance of ERC-20 token contract correctly', async () => {
    assetsContract.configure({ provider: MAINNET_PROVIDER });
    const CKBalance = await assetsContract.getBalanceOf(
      CKADDRESS,
      '0xb1690c08e213a35ed9bab7b318de14420fb57d8c',
    );
    const CKNoBalance = await assetsContract.getBalanceOf(
      CKADDRESS,
      '0xb1690c08e213a35ed9bab7b318de14420fb57d81',
    );
    expect(CKBalance.toNumber()).not.toStrictEqual(0);
    expect(CKNoBalance.toNumber()).toStrictEqual(0);
  });

  it('should get ERC-721 collectible tokenId correctly', async () => {
    assetsContract.configure({ provider: MAINNET_PROVIDER });
    const tokenId = await assetsContract.getCollectibleTokenId(
      GODSADDRESS,
      '0x9a90bd8d1149a88b42a99cf62215ad955d6f498a',
      0,
    );
    expect(tokenId).not.toStrictEqual(0);
  });

  it('should get ERC-721 collectible tokenURI correctly', async () => {
    assetsContract.configure({ provider: MAINNET_PROVIDER });
    const tokenId = await assetsContract.getCollectibleTokenURI(GODSADDRESS, 0);
    expect(tokenId).toStrictEqual('https://api.godsunchained.com/card/0');
  });

  it('should return empty string as URI when address given is not an ERC-721 NFT', async () => {
    assetsContract.configure({ provider: MAINNET_PROVIDER });
    const tokenId = await assetsContract.getCollectibleTokenURI(
      '0x0000000000000000000000000000000000000000',
      0,
    );
    expect(tokenId).toStrictEqual('');
  });

  it('should get ERC-721 collectible name', async () => {
    assetsContract.configure({ provider: MAINNET_PROVIDER });
    const name = await assetsContract.getAssetName(GODSADDRESS);
    expect(name).toStrictEqual('Gods Unchained');
  });

  it('should get ERC-721 collectible symbol', async () => {
    assetsContract.configure({ provider: MAINNET_PROVIDER });
    const symbol = await assetsContract.getAssetSymbol(GODSADDRESS);
    expect(symbol).toStrictEqual('GODS');
  });

  it('should get ERC-20 token decimals', async () => {
    assetsContract.configure({ provider: MAINNET_PROVIDER });
    const symbol = await assetsContract.getTokenDecimals(SAI_ADDRESS);
    expect(Number(symbol)).toStrictEqual(18);
  });

  it('should get ERC-721 collectible ownership', async () => {
    assetsContract.configure({ provider: MAINNET_PROVIDER });
    const tokenId = await assetsContract.getOwnerOf(GODSADDRESS, 148332);
    expect(tokenId).not.toStrictEqual('');
  });

  it('should get balances in a single call', async () => {
    assetsContract.configure({ provider: MAINNET_PROVIDER });
    const balances = await assetsContract.getBalancesInSingleCall(SAI_ADDRESS, [
      SAI_ADDRESS,
    ]);
    expect(balances[SAI_ADDRESS]).not.toStrictEqual(0);
  });

  it('should get the balance of a ERC-1155 collectible for a given address', async () => {
    assetsContract.configure({ provider: MAINNET_PROVIDER });
    const balance = await assetsContract.balanceOfERC1155Collectible(
      OWNER_ADDRESS,
      ERC1155_ADDRESS,
      COLLECTIBLE_ID,
    );
    expect(Number(balance)).toBeGreaterThan(0);
  });

  it('should get the URI of a ERC-1155 collectible', async () => {
    assetsContract.configure({ provider: MAINNET_PROVIDER });
    const expectedUri = `https://api.opensea.io/api/v1/metadata/${ERC1155_ADDRESS}/0x{id}`;
    const uri = await assetsContract.uriERC1155Collectible(
      ERC1155_ADDRESS,
      COLLECTIBLE_ID,
    );
    expect(uri.toLowerCase()).toStrictEqual(expectedUri);
  });
});
