import Web3 from 'web3';
import HttpProvider from 'ethjs-provider-http';
import abiERC1155 from 'human-standard-multi-collectible-abi';
import { ERC1155Standard } from './ERC1155Standard';

const MAINNET_PROVIDER = new HttpProvider(
  'https://mainnet.infura.io/v3/341eacb578dd44a1a049cbc5f6fd4035',
);

const COLLECTIBLE_ADDRESS = '0x495f947276749ce646f68ac8c248420045cb7b5e';
const COLLECTIBLE_ID =
  '40815311521795738946686668571398122012172359753720345430028676522525371400193';
const OWNER_ADDRESS = '0x5a3CA5cD63807Ce5e4d7841AB32Ce6B6d9BbBa2D';

describe('ERC721Standard', () => {
  let erc1155Standard: ERC1155Standard;
  let web3: Web3;

  beforeEach(() => {
    erc1155Standard = new ERC1155Standard();
    web3 = new Web3(MAINNET_PROVIDER);
  });

  it('should get the balance of a ERC-1155 collectible', async () => {
    const contract = web3.eth.contract(abiERC1155).at(COLLECTIBLE_ADDRESS);
    const balance = await erc1155Standard.getBalanceOf(
      contract,
      OWNER_ADDRESS,
      COLLECTIBLE_ID,
    );
    expect(balance).toBeGreaterThan(0);
  });
});
