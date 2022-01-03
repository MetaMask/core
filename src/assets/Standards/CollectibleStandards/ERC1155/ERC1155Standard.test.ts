import Web3 from 'web3';
import HttpProvider from 'ethjs-provider-http';

import { ERC1155Standard } from './ERC1155Standard';

const MAINNET_PROVIDER = new HttpProvider(
  'https://mainnet.infura.io/v3/341eacb578dd44a1a049cbc5f6fd4035',
);

const ERC1155_ADDRESS = '0xfaaFDc07907ff5120a76b34b731b278c38d6043C';

describe('ERC1155Standard', () => {
  let erc1155Standard: ERC1155Standard;
  let web3: any;

  beforeEach(() => {
    web3 = new Web3(MAINNET_PROVIDER);
    erc1155Standard = new ERC1155Standard(web3);
  });

  it('should determine if contract supports URI metadata interface correctly', async () => {
    const contractSupportsUri = await erc1155Standard.contractSupportsURIMetadataInterface(
      ERC1155_ADDRESS,
    );
    expect(contractSupportsUri).toBe(true);
  });
});
