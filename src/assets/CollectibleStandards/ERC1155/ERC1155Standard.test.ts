import Web3 from 'web3';
import HttpProvider from 'ethjs-provider-http';
import abiERC1155 from 'human-standard-multi-collectible-abi';
import { ERC1155Standard } from './ERC1155Standard';

const MAINNET_PROVIDER = new HttpProvider(
  'https://mainnet.infura.io/v3/341eacb578dd44a1a049cbc5f6fd4035',
);

describe('ERC721Standard', () => {
  let erc721Standard: ERC1155Standard;
  let web3: Web3;

  beforeEach(() => {
    erc721Standard = new ERC1155Standard();
    web3 = new Web3(MAINNET_PROVIDER);
  });
});