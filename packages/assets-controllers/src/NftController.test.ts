import * as sinon from 'sinon';
import nock from 'nock';
import HttpProvider from 'ethjs-provider-http';
import { PreferencesController } from '@metamask/preferences-controller';
import {
  NetworkController,
  NetworkControllerMessenger,
} from '@metamask/network-controller';
import {
  OPENSEA_PROXY_URL,
  IPFS_DEFAULT_GATEWAY_URL,
  ERC1155,
  OPENSEA_API_URL,
  ERC721,
  NetworksChainId,
} from '@metamask/controller-utils';
import { ControllerMessenger } from '@metamask/base-controller';
import { Network } from '@ethersproject/providers';
import { AssetsContractController } from './AssetsContractController';
import { NftController } from './NftController';
import { getFormattedIpfsUrl } from './assetsUtil';

const CRYPTOPUNK_ADDRESS = '0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB';
const ERC721_KUDOSADDRESS = '0x2aEa4Add166EBf38b63d09a75dE1a7b94Aa24163';
const ERC721_KUDOS_TOKEN_ID = '1203';
const ERC721_NFT_ADDRESS = '0x60F80121C31A0d46B5279700f9DF786054aa5eE5';
const ERC721_NFT_ID = '1144858';
const ERC1155_NFT_ADDRESS = '0x495f947276749Ce646f68AC8c248420045cb7b5e';
const ERC1155_NFT_ID =
  '40815311521795738946686668571398122012172359753720345430028676522525371400193';
const ERC721_DEPRESSIONIST_ADDRESS =
  '0x18E8E76aeB9E2d9FA2A2b88DD9CF3C8ED45c3660';
const ERC721_DEPRESSIONIST_ID = '36';
const MAINNET_PROVIDER = new HttpProvider(
  'https://mainnet.infura.io/v3/ad3a368836ff4596becc3be8e2f137ac',
);
const OWNER_ADDRESS = '0x5a3CA5cD63807Ce5e4d7841AB32Ce6B6d9BbBa2D';
const SECOND_OWNER_ADDRESS = '0x500017171kasdfbou081';

const DEPRESSIONIST_CID_V1 =
  'bafybeidf7aw7bmnmewwj4ayq3she2jfk5jrdpp24aaucf6fddzb3cfhrvm';

const DEPRESSIONIST_CLOUDFLARE_IPFS_SUBDOMAIN_PATH = getFormattedIpfsUrl(
  IPFS_DEFAULT_GATEWAY_URL,
  `ipfs://${DEPRESSIONIST_CID_V1}`,
  true,
);

// Mock out detectNetwork function for cleaner tests, Ethers calls this a bunch of times because the Web3Provider is paranoid.
jest.mock('@ethersproject/providers', () => {
  const providers = jest.requireActual('@ethersproject/providers');
  const MockWeb3Provider = class extends providers.Web3Provider {
    detectNetwork(): Promise<Network> {
      return Promise.resolve({
        name: 'mainnet',
        chainId: 1,
      });
    }
  };
  return {
    ...providers,
    Web3Provider: MockWeb3Provider,
  };
});

/**
 * Setup a test controller instance.
 *
 * @param options - Controller options.
 * @param options.includeOnNftAdded - Whether to include the "onNftAdded" parameter.
 * @returns A collection of test controllers and stubs.
 */
function setupController({
  includeOnNftAdded = false,
}: { includeOnNftAdded?: boolean } = {}) {
  const messenger: NetworkControllerMessenger =
    new ControllerMessenger().getRestricted({
      name: 'NetworkController',
      allowedEvents: ['NetworkController:stateChange'],
      allowedActions: [],
    });
  const preferences = new PreferencesController();
  const network = new NetworkController({
    messenger,
    infuraProjectId: 'potato',
  });
  const assetsContract = new AssetsContractController({
    onPreferencesStateChange: (listener) => preferences.subscribe(listener),
    onNetworkStateChange: (listener) =>
      messenger.subscribe('NetworkController:stateChange', listener),
  });
  const onNftAddedSpy = includeOnNftAdded ? jest.fn() : undefined;

  const nftController = new NftController({
    onPreferencesStateChange: (listener) => preferences.subscribe(listener),
    onNetworkStateChange: (listener) =>
      messenger.subscribe('NetworkController:stateChange', listener),
    getERC721AssetName: assetsContract.getERC721AssetName.bind(assetsContract),
    getERC721AssetSymbol:
      assetsContract.getERC721AssetSymbol.bind(assetsContract),
    getERC721TokenURI: assetsContract.getERC721TokenURI.bind(assetsContract),
    getERC721OwnerOf: assetsContract.getERC721OwnerOf.bind(assetsContract),
    getERC1155BalanceOf:
      assetsContract.getERC1155BalanceOf.bind(assetsContract),
    getERC1155TokenURI: assetsContract.getERC1155TokenURI.bind(assetsContract),
    onNftAdded: onNftAddedSpy,
  });

  preferences.update({
    selectedAddress: OWNER_ADDRESS,
    openSeaEnabled: true,
  });

  return {
    assetsContract,
    nftController,
    network,
    onNftAddedSpy,
    preferences,
    messenger,
  };
}

describe('NftController', () => {
  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  beforeEach(() => {
    nock(OPENSEA_PROXY_URL)
      .get(`/asset_contract/0x01`)
      .reply(200, {
        description: 'Description',
        symbol: 'FOO',
        total_supply: 0,
        collection: {
          name: 'Name',
          image_url: 'url',
        },
      })
      .get(`/asset_contract/0x02`)
      .reply(200, {
        description: 'Description',
        image_url: 'url',
        name: 'Name',
        symbol: 'FOU',
        total_supply: 10,
        collection: {
          name: 'Name',
          image_url: 'url',
        },
      })
      .get(`/asset/0x01/1`)
      .reply(200, {
        description: 'Description',
        image_original_url: 'url',
        image_url: 'url',
        name: 'Name',
        asset_contract: {
          schema_name: 'ERC1155',
        },
      })
      .get(`/asset/0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab/798958393`)
      .replyWithError(new TypeError('Failed to fetch'))
      .get(`/asset_contract/0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab`)
      .replyWithError(new TypeError('Failed to fetch'));

    nock(OPENSEA_PROXY_URL)
      .get(`/asset/${ERC1155_NFT_ADDRESS}/${ERC1155_NFT_ID}`)
      .reply(200, {
        num_sales: 1,
        image_original_url: 'image.uri',
        name: 'name',
        image: 'image',
        description: 'description',
        asset_contract: { schema_name: 'ERC1155' },
      });

    nock(DEPRESSIONIST_CLOUDFLARE_IPFS_SUBDOMAIN_PATH).get('/').reply(200, {
      name: 'name',
      image: 'image',
      description: 'description',
    });
  });

  afterEach(() => {
    nock.cleanAll();
    sinon.restore();
  });

  it('should set default state', () => {
    const { nftController, messenger } = setupController();

    expect(nftController.state).toStrictEqual({
      allNftContracts: {},
      allNfts: {},
      ignoredNfts: [],
    });
    messenger.clearEventSubscriptions('NetworkController:stateChange');
  });

  describe('addNft', () => {
    it('should add NFT and NFT contract', async () => {
      const { nftController, messenger } = setupController();

      const { selectedAddress, chainId } = nftController.config;
      await nftController.addNft('0x01', '1', {
        name: 'name',
        image: 'image',
        description: 'description',
        standard: 'standard',
        favorite: false,
      });

      expect(
        nftController.state.allNfts[selectedAddress][chainId][0],
      ).toStrictEqual({
        address: '0x01',
        description: 'description',
        image: 'image',
        name: 'name',
        tokenId: '1',
        standard: 'standard',
        favorite: false,
        isCurrentlyOwned: true,
      });

      expect(
        nftController.state.allNftContracts[selectedAddress][chainId][0],
      ).toStrictEqual({
        address: '0x01',
        description: 'Description',
        logo: 'url',
        name: 'Name',
        symbol: 'FOO',
        totalSupply: 0,
      });

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should call onNftAdded callback correctly when NFT is manually added', async () => {
      const { nftController, onNftAddedSpy, messenger } = setupController({
        includeOnNftAdded: true,
      });

      await nftController.addNft('0x01', '1', {
        name: 'name',
        image: 'image',
        description: 'description',
        standard: 'ERC1155',
        favorite: false,
      });

      expect(onNftAddedSpy).toHaveBeenCalledWith({
        source: 'custom',
        tokenId: '1',
        address: '0x01',
        standard: 'ERC1155',
        symbol: 'FOO',
      });

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should call onNftAdded callback correctly when NFT is added via detection', async () => {
      const { nftController, onNftAddedSpy, messenger } = setupController({
        includeOnNftAdded: true,
      });

      const detectedUserAddress = '0x123';
      await nftController.addNft(
        '0x01',
        '2',
        {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'ERC721',
          favorite: false,
        },
        // this object in the third argument slot is only defined when the NFT is added via detection
        { userAddress: detectedUserAddress, chainId: '0x2' },
      );

      expect(onNftAddedSpy).toHaveBeenCalledWith({
        source: 'detected',
        tokenId: '2',
        address: '0x01',
        standard: 'ERC721',
        symbol: 'FOO',
      });

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should add NFT by selected address', async () => {
      const { nftController, preferences, messenger } = setupController();
      const { chainId } = nftController.config;
      const firstAddress = '0x123';
      const secondAddress = '0x321';

      sinon
        .stub(nftController, 'getNftInformation' as any)
        .returns({ name: 'name', image: 'url', description: 'description' });
      preferences.update({ selectedAddress: firstAddress });
      await nftController.addNft('0x01', '1234');
      preferences.update({ selectedAddress: secondAddress });
      await nftController.addNft('0x02', '4321');
      preferences.update({ selectedAddress: firstAddress });
      expect(
        nftController.state.allNfts[firstAddress][chainId][0],
      ).toStrictEqual({
        address: '0x01',
        description: 'description',
        image: 'url',
        name: 'name',
        tokenId: '1234',
        favorite: false,
        isCurrentlyOwned: true,
      });

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should update NFT if image is different', async () => {
      const { nftController, messenger } = setupController();
      const { selectedAddress, chainId } = nftController.config;

      await nftController.addNft('0x01', '1', {
        name: 'name',
        image: 'image',
        description: 'description',
        standard: 'standard',
        favorite: false,
      });

      expect(
        nftController.state.allNfts[selectedAddress][chainId][0],
      ).toStrictEqual({
        address: '0x01',
        description: 'description',
        image: 'image',
        name: 'name',
        standard: 'standard',
        tokenId: '1',
        favorite: false,
        isCurrentlyOwned: true,
      });

      await nftController.addNft('0x01', '1', {
        name: 'name',
        image: 'image-updated',
        description: 'description',
        standard: 'standard',
        favorite: false,
      });

      expect(
        nftController.state.allNfts[selectedAddress][chainId][0],
      ).toStrictEqual({
        address: '0x01',
        description: 'description',
        image: 'image-updated',
        name: 'name',
        tokenId: '1',
        standard: 'standard',
        favorite: false,
        isCurrentlyOwned: true,
      });

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should not duplicate NFT nor NFT contract if already added', async () => {
      const { nftController, messenger } = setupController();
      const { selectedAddress, chainId } = nftController.config;
      await nftController.addNft('0x01', '1', {
        name: 'name',
        image: 'image',
        description: 'description',
        standard: 'standard',
        favorite: false,
      });

      await nftController.addNft('0x01', '1', {
        name: 'name',
        image: 'image',
        description: 'description',
        standard: 'standard',
        favorite: false,
      });

      expect(
        nftController.state.allNfts[selectedAddress][chainId],
      ).toHaveLength(1);

      expect(
        nftController.state.allNftContracts[selectedAddress][chainId],
      ).toHaveLength(1);

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should add NFT and get information from OpenSea', async () => {
      const { nftController, messenger } = setupController();

      const { selectedAddress, chainId } = nftController.config;
      await nftController.addNft('0x01', '1');
      expect(
        nftController.state.allNfts[selectedAddress][chainId][0],
      ).toStrictEqual({
        address: '0x01',
        description: 'Description',
        imageOriginal: 'url',
        image: 'url',
        name: 'Name',
        standard: 'ERC1155',
        tokenId: '1',
        favorite: false,
        isCurrentlyOwned: true,
      });

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should add NFT erc721 and aggregate NFT data from both contract and OpenSea', async () => {
      const { assetsContract, nftController, messenger } = setupController();
      nock(OPENSEA_PROXY_URL)
        .get(`/asset/${ERC721_KUDOSADDRESS}/${ERC721_KUDOS_TOKEN_ID}`)
        .reply(200, {
          image_original_url: 'Kudos image (from proxy API)',
          name: 'Kudos Name',
          description: 'Kudos Description',
          asset_contract: {
            schema_name: 'ERC721',
          },
        })
        .get(`/asset_contract/${ERC721_KUDOSADDRESS}`)
        .reply(200, {
          description: 'Kudos Description',
          symbol: 'KDO',
          total_supply: 10,
          collection: {
            name: 'Kudos',
            image_url: 'Kudos logo (from proxy API)',
          },
        });

      nock('https://ipfs.gitcoin.co:443')
        .get('/api/v0/cat/QmPmt6EAaioN78ECnW5oCL8v2YvVSpoBjLCjrXhhsAvoov')
        .reply(200, {
          image: 'Kudos Image (directly from tokenURI)',
          name: 'Kudos Name (directly from tokenURI)',
          description: 'Kudos Description (directly from tokenURI)',
        });

      nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_call',
          params: [
            {
              to: ERC721_KUDOSADDRESS.toLowerCase(),
              data: '0x06fdde03',
            },
            'latest',
          ],
        })
        .reply(200, {
          jsonrpc: '2.0',
          id: 1,
          result:
            '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000a4b75646f73546f6b656e00000000000000000000000000000000000000000000',
        })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 2,
          method: 'eth_call',
          params: [
            {
              to: ERC721_KUDOSADDRESS.toLowerCase(),
              data: '0x95d89b41',
            },
            'latest',
          ],
        })
        .reply(200, {
          jsonrpc: '2.0',
          id: 2,
          result:
            '0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000034b444f0000000000000000000000000000000000000000000000000000000000',
        })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 3,
          method: 'eth_call',
          params: [
            {
              to: ERC721_KUDOSADDRESS.toLowerCase(),
              data: '0x01ffc9a75b5e139f00000000000000000000000000000000000000000000000000000000',
            },
            'latest',
          ],
        })
        .reply(200, {
          jsonrpc: '2.0',
          id: 3,
          result:
            '0x0000000000000000000000000000000000000000000000000000000000000001',
        })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 4,
          method: 'eth_call',
          params: [
            {
              to: ERC721_KUDOSADDRESS.toLowerCase(),
              data: '0xc87b56dd00000000000000000000000000000000000000000000000000000000000004b3',
            },
            'latest',
          ],
        })
        .reply(200, {
          jsonrpc: '2.0',
          id: 4,
          result:
            '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000005568747470733a2f2f697066732e676974636f696e2e636f3a3434332f6170692f76302f6361742f516d506d7436454161696f4e373845436e57356f434c38763259765653706f426a4c436a725868687341766f6f760000000000000000000000',
        });

      assetsContract.configure({ provider: MAINNET_PROVIDER });
      const { selectedAddress, chainId } = nftController.config;
      sinon
        .stub(nftController, 'getNftContractInformationFromApi' as any)
        .returns(undefined);

      await nftController.addNft(ERC721_KUDOSADDRESS, ERC721_KUDOS_TOKEN_ID);

      expect(
        nftController.state.allNfts[selectedAddress][chainId][0],
      ).toStrictEqual({
        address: ERC721_KUDOSADDRESS,
        image: 'Kudos Image (directly from tokenURI)',
        name: 'Kudos Name (directly from tokenURI)',
        description: 'Kudos Description (directly from tokenURI)',
        tokenId: ERC721_KUDOS_TOKEN_ID,
        imageOriginal: 'Kudos image (from proxy API)',
        standard: 'ERC721',
        favorite: false,
        isCurrentlyOwned: true,
      });

      expect(
        nftController.state.allNftContracts[selectedAddress][chainId][0],
      ).toStrictEqual({
        address: ERC721_KUDOSADDRESS,
        name: 'KudosToken',
        symbol: 'KDO',
      });

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should add NFT erc1155 and get NFT information from contract when OpenSea Proxy API fails to fetch and no OpenSeaAPI key is set', async () => {
      const { assetsContract, nftController, messenger } = setupController();
      nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 5,
          method: 'eth_call',
          params: [
            {
              to: ERC1155_NFT_ADDRESS.toLowerCase(),
              data: '0x06fdde03',
            },
            'latest',
          ],
        })
        .reply(200, {
          jsonrpc: '2.0',
          id: 5,
          result:
            '0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000194f70656e536561205368617265642053746f726566726f6e7400000000000000',
        })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 6,
          method: 'eth_call',
          params: [
            {
              to: ERC1155_NFT_ADDRESS.toLowerCase(),
              data: '0x95d89b41',
            },
            'latest',
          ],
        })
        .reply(200, {
          jsonrpc: '2.0',
          id: 6,
          result:
            '0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000094f50454e53544f52450000000000000000000000000000000000000000000000',
        })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 7,
          method: 'eth_call',
          params: [
            {
              to: ERC1155_NFT_ADDRESS.toLowerCase(),
              data: '0x01ffc9a75b5e139f00000000000000000000000000000000000000000000000000000000',
            },
            'latest',
          ],
        })
        .reply(200, {
          jsonrpc: '2.0',
          id: 7,
          result:
            '0x0000000000000000000000000000000000000000000000000000000000000000',
        })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 8,
          method: 'eth_call',
          params: [
            {
              to: ERC1155_NFT_ADDRESS.toLowerCase(),
              data: '0x0e89341c5a3ca5cd63807ce5e4d7841ab32ce6b6d9bbba2d000000000000010000000001',
            },
            'latest',
          ],
        })
        .reply(200, {
          jsonrpc: '2.0',
          id: 8,
          result:
            '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000005868747470733a2f2f6170692e6f70656e7365612e696f2f6170692f76312f6d657461646174612f3078343935663934373237363734394365363436663638414338633234383432303034356362376235652f30787b69647d0000000000000000',
        });

      nock(OPENSEA_PROXY_URL)
        .get(`/asset_contract/${ERC1155_NFT_ADDRESS}`)
        .replyWithError(new TypeError('Failed to fetch'));

      // the tokenURI for ERC1155_NFT_ADDRESS + ERC1155_NFT_ID
      nock('https://api.opensea.io')
        .get(
          `/api/v1/metadata/${ERC1155_NFT_ADDRESS}/0x5a3ca5cd63807ce5e4d7841ab32ce6b6d9bbba2d000000000000010000000001`,
        )
        .reply(200, {
          name: 'name (directly from tokenURI)',
          description: 'description (direclty from tokenURI)',
          external_link: null,
          image: 'image (directly from tokenURI)',
          animation_url: null,
        });

      assetsContract.configure({ provider: MAINNET_PROVIDER });
      const { selectedAddress, chainId } = nftController.config;

      expect(nftController.openSeaApiKey).toBeUndefined();

      await nftController.addNft(ERC1155_NFT_ADDRESS, ERC1155_NFT_ID);

      expect(
        nftController.state.allNfts[selectedAddress][chainId][0],
      ).toStrictEqual({
        address: ERC1155_NFT_ADDRESS,
        image: 'image (directly from tokenURI)',
        name: 'name (directly from tokenURI)',
        description: 'description (direclty from tokenURI)',
        tokenId: ERC1155_NFT_ID,
        standard: ERC1155,
        favorite: false,
        isCurrentlyOwned: true,
        imageOriginal: 'image.uri',
        numberOfSales: 1,
      });

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should add NFT erc721 and get NFT information only from contract', async () => {
      const { assetsContract, nftController, messenger } = setupController();
      nock('https://ipfs.gitcoin.co:443')
        .get('/api/v0/cat/QmPmt6EAaioN78ECnW5oCL8v2YvVSpoBjLCjrXhhsAvoov')
        .reply(200, {
          image: 'Kudos Image (directly from tokenURI)',
          name: 'Kudos Name (directly from tokenURI)',
          description: 'Kudos Description (directly from tokenURI)',
        });

      nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 9,
          method: 'eth_call',
          params: [
            {
              to: ERC721_KUDOSADDRESS.toLowerCase(),
              data: '0x06fdde03',
            },
            'latest',
          ],
        })
        .reply(200, {
          jsonrpc: '2.0',
          id: 9,
          result:
            '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000a4b75646f73546f6b656e00000000000000000000000000000000000000000000',
        })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 10,
          method: 'eth_call',
          params: [
            {
              to: ERC721_KUDOSADDRESS.toLowerCase(),
              data: '0x95d89b41',
            },
            'latest',
          ],
        })
        .reply(200, {
          jsonrpc: '2.0',
          id: 10,
          result:
            '0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000034b444f0000000000000000000000000000000000000000000000000000000000',
        })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 11,
          method: 'eth_call',
          params: [
            {
              to: ERC721_KUDOSADDRESS.toLowerCase(),
              data: '0x01ffc9a75b5e139f00000000000000000000000000000000000000000000000000000000',
            },
            'latest',
          ],
        })
        .reply(200, {
          jsonrpc: '2.0',
          id: 11,
          result:
            '0x0000000000000000000000000000000000000000000000000000000000000001',
        })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 12,
          method: 'eth_call',
          params: [
            {
              to: ERC721_KUDOSADDRESS.toLowerCase(),
              data: '0xc87b56dd00000000000000000000000000000000000000000000000000000000000004b3',
            },
            'latest',
          ],
        })
        .reply(200, {
          jsonrpc: '2.0',
          id: 12,
          result:
            '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000005568747470733a2f2f697066732e676974636f696e2e636f3a3434332f6170692f76302f6361742f516d506d7436454161696f4e373845436e57356f434c38763259765653706f426a4c436a725868687341766f6f760000000000000000000000',
        });

      assetsContract.configure({ provider: MAINNET_PROVIDER });
      const { selectedAddress, chainId } = nftController.config;
      sinon
        .stub(nftController, 'getNftContractInformationFromApi' as any)
        .returns(undefined);

      sinon
        .stub(nftController, 'getNftInformationFromApi' as any)
        .returns(undefined);

      await nftController.addNft(ERC721_KUDOSADDRESS, ERC721_KUDOS_TOKEN_ID);

      expect(
        nftController.state.allNfts[selectedAddress][chainId][0],
      ).toStrictEqual({
        address: ERC721_KUDOSADDRESS,
        image: 'Kudos Image (directly from tokenURI)',
        name: 'Kudos Name (directly from tokenURI)',
        description: 'Kudos Description (directly from tokenURI)',
        tokenId: ERC721_KUDOS_TOKEN_ID,
        standard: 'ERC721',
        favorite: false,
        isCurrentlyOwned: true,
      });

      expect(
        nftController.state.allNftContracts[selectedAddress][chainId][0],
      ).toStrictEqual({
        address: ERC721_KUDOSADDRESS,
        name: 'KudosToken',
        symbol: 'KDO',
      });

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should add NFT by provider type', async () => {
      const { nftController, network, messenger } = setupController();
      const firstNetworkType = 'rinkeby';
      const secondNetworkType = 'ropsten';
      const { selectedAddress } = nftController.config;
      sinon
        .stub(nftController, 'getNftInformation' as any)
        .returns({ name: 'name', image: 'url', description: 'description' });

      network.setProviderType(firstNetworkType);
      await nftController.addNft('0x01', '1234');
      network.setProviderType(secondNetworkType);
      network.setProviderType(firstNetworkType);

      expect(
        nftController.state.allNfts[selectedAddress]?.[
          NetworksChainId[secondNetworkType]
        ],
      ).toBeUndefined();

      expect(
        nftController.state.allNfts[selectedAddress][
          NetworksChainId[firstNetworkType]
        ][0],
      ).toStrictEqual({
        address: '0x01',
        description: 'description',
        image: 'url',
        name: 'name',
        tokenId: '1234',
        favorite: false,
        isCurrentlyOwned: true,
      });

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should not add NFTs with no contract information when auto detecting', async () => {
      const { nftController, messenger } = setupController();
      nock(OPENSEA_PROXY_URL)
        .get(`/asset/${ERC721_KUDOSADDRESS}/${ERC721_KUDOS_TOKEN_ID}`)
        .reply(200, {
          image_original_url: 'Kudos image (from proxy API)',
          name: 'Kudos Name',
          description: 'Kudos Description',
          asset_contract: {
            schema_name: 'ERC721',
          },
        })
        .get(`/asset_contract/${ERC721_KUDOSADDRESS}`)
        .reply(200, {
          description: 'Kudos Description',
          symbol: 'KDO',
          total_supply: 10,
          collection: {
            name: 'Kudos',
            image_url: 'Kudos logo (from proxy API)',
          },
        });

      const { selectedAddress, chainId } = nftController.config;
      await nftController.addNft(
        '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab',
        '123',
        undefined,
        {
          userAddress: selectedAddress,
          chainId,
        },
      );

      expect(
        nftController.state.allNfts[selectedAddress]?.[chainId],
      ).toBeUndefined();

      expect(
        nftController.state.allNftContracts[selectedAddress]?.[chainId],
      ).toBeUndefined();

      await nftController.addNft(
        ERC721_KUDOSADDRESS,
        ERC721_KUDOS_TOKEN_ID,
        undefined,
        {
          userAddress: selectedAddress,
          chainId,
        },
      );

      expect(
        nftController.state.allNfts[selectedAddress][chainId],
      ).toStrictEqual([
        {
          address: ERC721_KUDOSADDRESS,
          description: 'Kudos Description',
          imageOriginal: 'Kudos image (from proxy API)',
          name: 'Kudos Name',
          image: null,
          standard: 'ERC721',
          tokenId: ERC721_KUDOS_TOKEN_ID,
          favorite: false,
          isCurrentlyOwned: true,
        },
      ]);

      expect(
        nftController.state.allNftContracts[selectedAddress][chainId],
      ).toStrictEqual([
        {
          address: ERC721_KUDOSADDRESS,
          description: 'Kudos Description',
          logo: 'Kudos logo (from proxy API)',
          name: 'Kudos',
          symbol: 'KDO',
          totalSupply: 10,
        },
      ]);

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should not add duplicate NFTs to the ignoredNfts list', async () => {
      const { nftController, messenger } = setupController();
      const { selectedAddress, chainId } = nftController.config;

      await nftController.addNft('0x01', '1', {
        name: 'name',
        image: 'image',
        description: 'description',
        standard: 'standard',
      });

      await nftController.addNft('0x01', '2', {
        name: 'name',
        image: 'image',
        description: 'description',
        standard: 'standard',
      });

      expect(
        nftController.state.allNfts[selectedAddress][chainId],
      ).toHaveLength(2);
      expect(nftController.state.ignoredNfts).toHaveLength(0);

      nftController.removeAndIgnoreNft('0x01', '1');
      expect(
        nftController.state.allNfts[selectedAddress][chainId],
      ).toHaveLength(1);
      expect(nftController.state.ignoredNfts).toHaveLength(1);

      await nftController.addNft('0x01', '1', {
        name: 'name',
        image: 'image',
        description: 'description',
        standard: 'standard',
      });

      expect(
        nftController.state.allNfts[selectedAddress][chainId],
      ).toHaveLength(2);
      expect(nftController.state.ignoredNfts).toHaveLength(1);

      nftController.removeAndIgnoreNft('0x01', '1');
      expect(
        nftController.state.allNfts[selectedAddress][chainId],
      ).toHaveLength(1);
      expect(nftController.state.ignoredNfts).toHaveLength(1);

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should add NFT with metadata hosted in IPFS', async () => {
      const { assetsContract, nftController, messenger } = setupController();
      nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 13,
          method: 'eth_call',
          params: [
            {
              to: ERC721_DEPRESSIONIST_ADDRESS.toLowerCase(),
              data: '0x06fdde03',
            },
            'latest',
          ],
        })
        .reply(200, {
          jsonrpc: '2.0',
          id: 13,
          result:
            '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000001c4d616c746a696b2e6a706727732044657072657373696f6e6973747300000000',
        })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 14,
          method: 'eth_call',
          params: [
            {
              to: ERC721_DEPRESSIONIST_ADDRESS.toLowerCase(),
              data: '0x95d89b41',
            },
            'latest',
          ],
        })
        .reply(200, {
          jsonrpc: '2.0',
          id: 14,
          result:
            '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000444504e5300000000000000000000000000000000000000000000000000000000',
        });

      nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 15,
          method: 'eth_call',
          params: [
            {
              to: ERC721_DEPRESSIONIST_ADDRESS.toLowerCase(),
              data: '0x01ffc9a75b5e139f00000000000000000000000000000000000000000000000000000000',
            },
            'latest',
          ],
        })
        .reply(200, {
          jsonrpc: '2.0',
          id: 15,
          result:
            '0x0000000000000000000000000000000000000000000000000000000000000001',
        })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 16,
          method: 'eth_call',
          params: [
            {
              to: ERC721_DEPRESSIONIST_ADDRESS.toLowerCase(),
              data: '0xc87b56dd0000000000000000000000000000000000000000000000000000000000000024',
            },
            'latest',
          ],
        })
        .reply(200, {
          jsonrpc: '2.0',
          id: 16,
          result:
            '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000003a697066733a2f2f697066732f516d5643684e7453745a66507956384a664b70756265336569675168357255587159636850674c63393174574c4a000000000000',
        });

      assetsContract.configure({ provider: MAINNET_PROVIDER });
      nftController.configure({
        ipfsGateway: IPFS_DEFAULT_GATEWAY_URL,
      });
      const { selectedAddress, chainId } = nftController.config;
      await nftController.addNft(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
      );

      expect(
        nftController.state.allNftContracts[selectedAddress][chainId][0],
      ).toStrictEqual({
        address: ERC721_DEPRESSIONIST_ADDRESS,
        name: "Maltjik.jpg's Depressionists",
        symbol: 'DPNS',
      });

      expect(
        nftController.state.allNfts[selectedAddress][chainId][0],
      ).toStrictEqual({
        address: ERC721_DEPRESSIONIST_ADDRESS,
        tokenId: '36',
        image: 'image',
        name: 'name',
        description: 'description',
        standard: 'ERC721',
        favorite: false,
        isCurrentlyOwned: true,
      });

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should add NFT erc721 and get NFT information directly from OpenSea API when OpenSeaAPIkey is set and queries to OpenSea proxy fail', async () => {
      const { assetsContract, nftController, messenger } = setupController();
      nock(OPENSEA_PROXY_URL)
        .get(`/asset_contract/${ERC721_NFT_ADDRESS}`)
        .replyWithError(new Error('Failed to fetch'))
        .get(`/asset/${ERC721_NFT_ADDRESS}/${ERC721_NFT_ID}`)
        .replyWithError(new Error('Failed to fetch'));

      nock(OPENSEA_API_URL, {
        encodedQueryParams: true,
      })
        .get(`/asset_contract/${ERC721_NFT_ADDRESS}`)
        .reply(200, {
          description: 'description (from opensea)',
          symbol: 'KDO',
          total_supply: 10,
          collection: {
            name: 'name (from opensea)',
            image_url: 'logo (from opensea)',
          },
        })
        .get(`/asset/${ERC721_NFT_ADDRESS}/${ERC721_NFT_ID}`)
        .reply(200, {
          image_original_url: 'image (directly from opensea)',
          name: 'name (directly from opensea)',
          description: 'description (directly from opensea)',
          asset_contract: {
            schema_name: 'ERC721',
          },
        });

      nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 17,
          method: 'eth_call',
          params: [
            {
              to: ERC721_NFT_ADDRESS.toLowerCase(),
              data: '0x06fdde03',
            },
            'latest',
          ],
        })
        .reply(200, {
          jsonrpc: '2.0',
          id: 17,
          result:
            '0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000194f70656e536561205368617265642053746f726566726f6e7400000000000000',
        });

      nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 18,
          method: 'eth_call',
          params: [
            {
              to: ERC721_NFT_ADDRESS.toLowerCase(),
              data: '0x95d89b41',
            },
            'latest',
          ],
        })
        .reply(200, {
          jsonrpc: '2.0',
          id: 18,
          result:
            '0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000094f50454e53544f52450000000000000000000000000000000000000000000000',
        })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 19,
          method: 'eth_call',
          params: [
            {
              to: ERC721_NFT_ADDRESS.toLowerCase(),
              data: '0x0e89341c5a3ca5cd63807ce5e4d7841ab32ce6b6d9bbba2d000000000000010000000001',
            },
            'latest',
          ],
        })
        .reply(200, {
          jsonrpc: '2.0',
          id: 19,
          result:
            '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000005868747470733a2f2f6170692e6f70656e7365612e696f2f6170692f76312f6d657461646174612f3078343935663934373237363734394365363436663638414338633234383432303034356362376235652f30787b69647d0000000000000000',
        });

      nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 21,
          method: 'eth_call',
          params: [
            {
              to: ERC721_NFT_ADDRESS.toLowerCase(),
              data: '0xc87b56dd000000000000000000000000000000000000000000000000000000000011781a',
            },
            'latest',
          ],
        })
        .reply(200, {
          jsonrpc: '2.0',
          id: 21,
          result:
            '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000003a697066733a2f2f697066732f516d6266617037397677663241513533417a554846426e426b6776337643525579726e736e5034726968314c6158000000000000',
        });

      nock('https://api.opensea.io:443', { encodedQueryParams: true })
        .get(`/api/v1/metadata/${ERC721_NFT_ADDRESS}/${ERC721_NFT_ID}`)
        .reply(200, [
          '1f8b080000000000000334ce5d6f82301480e1ffd26b1015a3913bcdd8d4c1b20f9dc31bd274b51c3d3d85b664a0f1bf2f66d9ed9bbcc97365c4b564095be440e3e168ce02f62d9db0507b30c4126a1103263b2f2d712c11e8fc1f4173755f2bef6b97441156f14019a350b64e5a61c84bf203617494ef8aed27e5611cea7836f5fdfe510dc561cf9fcb23d8d364ed8a99cd2e4db30a1fb2d57184d9d9c6c547caab27dc35cbf779dd6bdfbfa88d5abca1b079d77ea5cbf4f24a6b389c5c2f4074d39fb16201e3049adfe1656bf1cf79fb050000ffff03002c5b5b9be3000000',
        ]);

      assetsContract.configure({ provider: MAINNET_PROVIDER });
      const { selectedAddress, chainId } = nftController.config;

      nftController.setApiKey('fake-api-key');
      expect(nftController.openSeaApiKey).toBe('fake-api-key');

      await nftController.addNft(ERC721_NFT_ADDRESS, ERC721_NFT_ID);

      expect(
        nftController.state.allNfts[selectedAddress][chainId][0],
      ).toStrictEqual({
        address: ERC721_NFT_ADDRESS,
        image: null,
        imageOriginal: 'image (directly from opensea)',
        name: 'name (directly from opensea)',
        description: 'description (directly from opensea)',
        tokenId: ERC721_NFT_ID,
        standard: ERC721,
        favorite: false,
        isCurrentlyOwned: true,
      });

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });
  });

  describe('addNftVerifyOwnership', () => {
    it('should verify ownership by selected address and add NFT', async () => {
      const { nftController, preferences, messenger } = setupController();
      const firstAddress = '0x123';
      const secondAddress = '0x321';
      const { chainId } = nftController.config;

      sinon.stub(nftController, 'isNftOwner' as any).returns(true);

      sinon
        .stub(nftController, 'getNftInformation' as any)
        .returns({ name: 'name', image: 'url', description: 'description' });
      preferences.update({ selectedAddress: firstAddress });
      await nftController.addNftVerifyOwnership('0x01', '1234');
      preferences.update({ selectedAddress: secondAddress });
      await nftController.addNftVerifyOwnership('0x02', '4321');
      preferences.update({ selectedAddress: firstAddress });
      expect(
        nftController.state.allNfts[firstAddress][chainId][0],
      ).toStrictEqual({
        address: '0x01',
        description: 'description',
        image: 'url',
        name: 'name',
        tokenId: '1234',
        favorite: false,
        isCurrentlyOwned: true,
      });

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should throw an error if selected address is not owner of input NFT', async () => {
      const { nftController, preferences, messenger } = setupController();
      sinon.stub(nftController, 'isNftOwner' as any).returns(false);
      const firstAddress = '0x123';
      preferences.update({ selectedAddress: firstAddress });
      const result = async () =>
        await nftController.addNftVerifyOwnership('0x01', '1234');
      const error = 'This NFT is not owned by the user';
      await expect(result).rejects.toThrow(error);

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });
  });

  describe('removeNft', () => {
    it('should remove NFT and NFT contract', async () => {
      const { nftController, messenger } = setupController();
      const { selectedAddress, chainId } = nftController.config;

      await nftController.addNft('0x01', '1', {
        name: 'name',
        image: 'image',
        description: 'description',
        standard: 'standard',
      });
      nftController.removeNft('0x01', '1');
      expect(
        nftController.state.allNfts[selectedAddress][chainId],
      ).toHaveLength(0);

      expect(
        nftController.state.allNftContracts[selectedAddress][chainId],
      ).toHaveLength(0);

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should not remove NFT contract if NFT still exists', async () => {
      const { nftController, messenger } = setupController();
      const { selectedAddress, chainId } = nftController.config;

      await nftController.addNft('0x01', '1', {
        name: 'name',
        image: 'image',
        description: 'description',
        standard: 'standard',
      });

      await nftController.addNft('0x01', '2', {
        name: 'name',
        image: 'image',
        description: 'description',
        standard: 'standard',
      });
      nftController.removeNft('0x01', '1');
      expect(
        nftController.state.allNfts[selectedAddress][chainId],
      ).toHaveLength(1);

      expect(
        nftController.state.allNftContracts[selectedAddress][chainId],
      ).toHaveLength(1);

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should remove NFT by selected address', async () => {
      const { nftController, preferences, messenger } = setupController();
      const { chainId } = nftController.config;
      sinon
        .stub(nftController, 'getNftInformation' as any)
        .returns({ name: 'name', image: 'url', description: 'description' });
      const firstAddress = '0x123';
      const secondAddress = '0x321';
      preferences.update({ selectedAddress: firstAddress });
      await nftController.addNft('0x02', '4321');
      preferences.update({ selectedAddress: secondAddress });
      await nftController.addNft('0x01', '1234');
      nftController.removeNft('0x01', '1234');
      expect(nftController.state.allNfts[secondAddress][chainId]).toHaveLength(
        0,
      );
      preferences.update({ selectedAddress: firstAddress });
      expect(
        nftController.state.allNfts[firstAddress][chainId][0],
      ).toStrictEqual({
        address: '0x02',
        description: 'description',
        image: 'url',
        name: 'name',
        tokenId: '4321',
        favorite: false,
        isCurrentlyOwned: true,
      });

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should remove NFT by provider type', async () => {
      const { nftController, network, messenger } = setupController();
      const { selectedAddress } = nftController.config;

      sinon
        .stub(nftController, 'getNftInformation' as any)
        .returns({ name: 'name', image: 'url', description: 'description' });
      const firstNetworkType = 'rinkeby';
      const secondNetworkType = 'ropsten';
      network.setProviderType(firstNetworkType);
      await nftController.addNft('0x02', '4321');
      network.setProviderType(secondNetworkType);
      await nftController.addNft('0x01', '1234');
      // nftController.removeToken('0x01');
      nftController.removeNft('0x01', '1234');
      expect(
        nftController.state.allNfts[selectedAddress][
          NetworksChainId[secondNetworkType]
        ],
      ).toHaveLength(0);

      network.setProviderType(firstNetworkType);

      expect(
        nftController.state.allNfts[selectedAddress][
          NetworksChainId[firstNetworkType]
        ][0],
      ).toStrictEqual({
        address: '0x02',
        description: 'description',
        image: 'url',
        name: 'name',
        tokenId: '4321',
        favorite: false,
        isCurrentlyOwned: true,
      });

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });
  });

  it('should be able to clear the ignoredNfts list', async () => {
    const { nftController, messenger } = setupController();
    const { selectedAddress, chainId } = nftController.config;

    await nftController.addNft('0x02', '1', {
      name: 'name',
      image: 'image',
      description: 'description',
      standard: 'standard',
      favorite: false,
    });

    expect(nftController.state.allNfts[selectedAddress][chainId]).toHaveLength(
      1,
    );
    expect(nftController.state.ignoredNfts).toHaveLength(0);

    nftController.removeAndIgnoreNft('0x02', '1');
    expect(nftController.state.allNfts[selectedAddress][chainId]).toHaveLength(
      0,
    );
    expect(nftController.state.ignoredNfts).toHaveLength(1);

    nftController.clearIgnoredNfts();
    expect(nftController.state.ignoredNfts).toHaveLength(0);

    messenger.clearEventSubscriptions('NetworkController:stateChange');
  });

  it('should set api key correctly', () => {
    const { nftController, messenger } = setupController();
    nftController.setApiKey('new-api-key');
    expect(nftController.openSeaApiKey).toBe('new-api-key');
    messenger.clearEventSubscriptions('NetworkController:stateChange');
  });

  describe('isNftOwner', () => {
    it('should verify the ownership of an ERC-721 NFT with the correct owner address', async () => {
      const { assetsContract, nftController, messenger } = setupController();
      nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 21,
          method: 'eth_call',
          params: [
            {
              to: ERC721_NFT_ADDRESS.toLowerCase(),
              data: '0x6352211e000000000000000000000000000000000000000000000000000000000011781a',
            },
            'latest',
          ],
        })
        .reply(200, {
          jsonrpc: '2.0',
          id: 21,
          result:
            '0x0000000000000000000000005a3ca5cd63807ce5e4d7841ab32ce6b6d9bbba2d',
        });

      assetsContract.configure({ provider: MAINNET_PROVIDER });
      const isOwner = await nftController.isNftOwner(
        OWNER_ADDRESS,
        ERC721_NFT_ADDRESS,
        String(ERC721_NFT_ID),
      );
      expect(isOwner).toBe(true);

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should not verify the ownership of an ERC-721 NFT with the wrong owner address', async () => {
      const { assetsContract, nftController, messenger } = setupController();
      nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 22,
          method: 'eth_call',
          params: [
            {
              to: ERC721_NFT_ADDRESS.toLowerCase(),
              data: '0x6352211e000000000000000000000000000000000000000000000000000000000011781a',
            },
            'latest',
          ],
        })
        .reply(200, {
          jsonrpc: '2.0',
          id: 22,
          result:
            '0x0000000000000000000000005a3ca5cd63807ce5e4d7841ab32ce6b6d9bbba2d',
        });

      assetsContract.configure({ provider: MAINNET_PROVIDER });
      const isOwner = await nftController.isNftOwner(
        '0x0000000000000000000000000000000000000000',
        ERC721_NFT_ADDRESS,
        String(ERC721_NFT_ID),
      );
      expect(isOwner).toBe(false);

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should verify the ownership of an ERC-1155 NFT with the correct owner address', async () => {
      const { assetsContract, nftController, messenger } = setupController();
      nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 23,
          method: 'eth_call',
          params: [
            {
              to: ERC1155_NFT_ADDRESS.toLowerCase(),
              data: '0x6352211e5a3ca5cd63807ce5e4d7841ab32ce6b6d9bbba2d000000000000010000000001',
            },
            'latest',
          ],
        })
        .reply(200, {
          jsonrpc: '2.0',
          id: 23,
          error: { code: -32000, message: 'execution reverted' },
        })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 24,
          method: 'eth_call',
          params: [
            {
              to: ERC1155_NFT_ADDRESS.toLowerCase(),
              data: '0x00fdd58e0000000000000000000000005a3ca5cd63807ce5e4d7841ab32ce6b6d9bbba2d5a3ca5cd63807ce5e4d7841ab32ce6b6d9bbba2d000000000000010000000001',
            },
            'latest',
          ],
        })
        .reply(200, {
          jsonrpc: '2.0',
          id: 24,
          result:
            '0x0000000000000000000000000000000000000000000000000000000000000001',
        });
      assetsContract.configure({ provider: MAINNET_PROVIDER });
      const isOwner = await nftController.isNftOwner(
        OWNER_ADDRESS,
        ERC1155_NFT_ADDRESS,
        ERC1155_NFT_ID,
      );
      expect(isOwner).toBe(true);

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should not verify the ownership of an ERC-1155 NFT with the wrong owner address', async () => {
      const { assetsContract, nftController, messenger } = setupController();
      nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 25,
          method: 'eth_call',
          params: [
            {
              to: ERC1155_NFT_ADDRESS.toLowerCase(),
              data: '0x6352211e5a3ca5cd63807ce5e4d7841ab32ce6b6d9bbba2d000000000000010000000001',
            },
            'latest',
          ],
        })
        .reply(200, {
          jsonrpc: '2.0',
          id: 25,
          error: { code: -32000, message: 'execution reverted' },
        })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 26,
          method: 'eth_call',
          params: [
            {
              to: ERC1155_NFT_ADDRESS.toLowerCase(),
              data: '0x00fdd58e00000000000000000000000000000000000000000000000000000000000000005a3ca5cd63807ce5e4d7841ab32ce6b6d9bbba2d000000000000010000000001',
            },
            'latest',
          ],
        })
        .reply(200, {
          jsonrpc: '2.0',
          id: 26,
          result:
            '0x0000000000000000000000000000000000000000000000000000000000000000',
        });

      assetsContract.configure({ provider: MAINNET_PROVIDER });
      const isOwner = await nftController.isNftOwner(
        '0x0000000000000000000000000000000000000000',
        ERC1155_NFT_ADDRESS,
        ERC1155_NFT_ID,
      );
      expect(isOwner).toBe(false);

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should throw an error for an unsupported standard', async () => {
      const { assetsContract, nftController, messenger } = setupController();
      assetsContract.configure({ provider: MAINNET_PROVIDER });
      const error =
        'Unable to verify ownership. Probably because the standard is not supported or the chain is incorrect';
      const result = async () => {
        await nftController.isNftOwner(
          '0x0000000000000000000000000000000000000000',
          CRYPTOPUNK_ADDRESS,
          '0',
        );
      };
      await expect(result).rejects.toThrow(error);

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });
  });

  describe('updateNftFavoriteStatus', () => {
    it('should set NFT as favorite', async () => {
      const { assetsContract, nftController, messenger } = setupController();
      assetsContract.configure({ provider: MAINNET_PROVIDER });
      const { selectedAddress, chainId } = nftController.config;
      await nftController.addNft(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
      );

      nftController.updateNftFavoriteStatus(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
        true,
      );

      expect(
        nftController.state.allNfts[selectedAddress][chainId][0],
      ).toStrictEqual(
        expect.objectContaining({
          address: ERC721_DEPRESSIONIST_ADDRESS,
          tokenId: ERC721_DEPRESSIONIST_ID,
          favorite: true,
        }),
      );

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should set NFT as favorite and then unset it', async () => {
      const { assetsContract, nftController, messenger } = setupController();
      assetsContract.configure({ provider: MAINNET_PROVIDER });
      const { selectedAddress, chainId } = nftController.config;
      await nftController.addNft(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
      );

      nftController.updateNftFavoriteStatus(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
        true,
      );

      expect(
        nftController.state.allNfts[selectedAddress][chainId][0],
      ).toStrictEqual(
        expect.objectContaining({
          address: ERC721_DEPRESSIONIST_ADDRESS,
          tokenId: ERC721_DEPRESSIONIST_ID,
          favorite: true,
        }),
      );

      nftController.updateNftFavoriteStatus(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
        false,
      );

      expect(
        nftController.state.allNfts[selectedAddress][chainId][0],
      ).toStrictEqual(
        expect.objectContaining({
          address: ERC721_DEPRESSIONIST_ADDRESS,
          tokenId: ERC721_DEPRESSIONIST_ID,
          favorite: false,
        }),
      );

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should keep the favorite status as true after updating metadata', async () => {
      const { assetsContract, nftController, messenger } = setupController();
      assetsContract.configure({ provider: MAINNET_PROVIDER });
      const { selectedAddress, chainId } = nftController.config;
      await nftController.addNft(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
      );

      nftController.updateNftFavoriteStatus(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
        true,
      );

      expect(
        nftController.state.allNfts[selectedAddress][chainId][0],
      ).toStrictEqual(
        expect.objectContaining({
          address: ERC721_DEPRESSIONIST_ADDRESS,
          tokenId: ERC721_DEPRESSIONIST_ID,
          favorite: true,
        }),
      );

      await nftController.addNft(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
        {
          image: 'new_image',
          name: 'new_name',
          description: 'new_description',
          standard: 'ERC721',
        },
      );

      expect(
        nftController.state.allNfts[selectedAddress][chainId][0],
      ).toStrictEqual(
        expect.objectContaining({
          image: 'new_image',
          name: 'new_name',
          description: 'new_description',
          address: ERC721_DEPRESSIONIST_ADDRESS,
          tokenId: ERC721_DEPRESSIONIST_ID,
          favorite: true,
          isCurrentlyOwned: true,
        }),
      );

      expect(
        nftController.state.allNfts[selectedAddress][chainId],
      ).toHaveLength(1);

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should keep the favorite status as false after updating metadata', async () => {
      const { assetsContract, nftController, messenger } = setupController();
      assetsContract.configure({ provider: MAINNET_PROVIDER });
      const { selectedAddress, chainId } = nftController.config;
      await nftController.addNft(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
      );

      expect(
        nftController.state.allNfts[selectedAddress][chainId][0],
      ).toStrictEqual(
        expect.objectContaining({
          address: ERC721_DEPRESSIONIST_ADDRESS,
          tokenId: ERC721_DEPRESSIONIST_ID,
          favorite: false,
        }),
      );

      await nftController.addNft(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
        {
          image: 'new_image',
          name: 'new_name',
          description: 'new_description',
          standard: 'ERC721',
        },
      );

      expect(
        nftController.state.allNfts[selectedAddress][chainId][0],
      ).toStrictEqual(
        expect.objectContaining({
          image: 'new_image',
          name: 'new_name',
          description: 'new_description',
          address: ERC721_DEPRESSIONIST_ADDRESS,
          tokenId: ERC721_DEPRESSIONIST_ID,
          favorite: false,
          isCurrentlyOwned: true,
        }),
      );

      expect(
        nftController.state.allNfts[selectedAddress][chainId],
      ).toHaveLength(1);

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    describe('checkAndUpdateNftsOwnershipStatus', () => {
      describe('checkAndUpdateAllNftsOwnershipStatus', () => {
        it('should check whether NFTs for the current selectedAddress/chainId combination are still owned by the selectedAddress and update the isCurrentlyOwned value to false when NFT is not still owned', async () => {
          const { nftController, messenger } = setupController();
          sinon.stub(nftController, 'isNftOwner' as any).returns(false);

          const { selectedAddress, chainId } = nftController.config;
          await nftController.addNft('0x02', '1', {
            name: 'name',
            image: 'image',
            description: 'description',
            standard: 'standard',
            favorite: false,
          });

          expect(
            nftController.state.allNfts[selectedAddress][chainId][0]
              .isCurrentlyOwned,
          ).toBe(true);

          await nftController.checkAndUpdateAllNftsOwnershipStatus();
          expect(
            nftController.state.allNfts[selectedAddress][chainId][0]
              .isCurrentlyOwned,
          ).toBe(false);

          messenger.clearEventSubscriptions('NetworkController:stateChange');
        });
      });

      it('should check whether NFTs for the current selectedAddress/chainId combination are still owned by the selectedAddress and leave/set the isCurrentlyOwned value to true when NFT is still owned', async () => {
        const { nftController, messenger } = setupController();
        sinon.stub(nftController, 'isNftOwner' as any).returns(true);

        const { selectedAddress, chainId } = nftController.config;
        await nftController.addNft('0x02', '1', {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
          favorite: false,
        });

        expect(
          nftController.state.allNfts[selectedAddress][chainId][0]
            .isCurrentlyOwned,
        ).toBe(true);

        await nftController.checkAndUpdateAllNftsOwnershipStatus();
        expect(
          nftController.state.allNfts[selectedAddress][chainId][0]
            .isCurrentlyOwned,
        ).toBe(true);

        messenger.clearEventSubscriptions('NetworkController:stateChange');
      });

      it('should check whether NFTs for the current selectedAddress/chainId combination are still owned by the selectedAddress and leave the isCurrentlyOwned value as is when NFT ownership check fails', async () => {
        const { nftController, messenger } = setupController();
        sinon
          .stub(nftController, 'isNftOwner' as any)
          .throws(new Error('Unable to verify ownership'));

        const { selectedAddress, chainId } = nftController.config;
        await nftController.addNft('0x02', '1', {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
          favorite: false,
        });

        expect(
          nftController.state.allNfts[selectedAddress][chainId][0]
            .isCurrentlyOwned,
        ).toBe(true);

        await nftController.checkAndUpdateAllNftsOwnershipStatus();
        expect(
          nftController.state.allNfts[selectedAddress][chainId][0]
            .isCurrentlyOwned,
        ).toBe(true);

        messenger.clearEventSubscriptions('NetworkController:stateChange');
      });

      describe('checkAndUpdateSingleNftOwnershipStatus', () => {
        it('should check whether the passed NFT is still owned by the the current selectedAddress/chainId combination and update its isCurrentlyOwned property in state if batch is false and isNftOwner returns false', async () => {
          const { nftController, messenger } = setupController();
          const { selectedAddress, chainId } = nftController.config;
          const nft = {
            address: '0x02',
            tokenId: '1',
            name: 'name',
            image: 'image',
            description: 'description',
            standard: 'standard',
            favorite: false,
          };

          await nftController.addNft(nft.address, nft.tokenId, nft);

          expect(
            nftController.state.allNfts[selectedAddress][chainId][0]
              .isCurrentlyOwned,
          ).toBe(true);

          sinon.stub(nftController, 'isNftOwner' as any).returns(false);

          await nftController.checkAndUpdateSingleNftOwnershipStatus(
            nft,
            false,
          );

          expect(
            nftController.state.allNfts[selectedAddress][chainId][0]
              .isCurrentlyOwned,
          ).toBe(false);

          messenger.clearEventSubscriptions('NetworkController:stateChange');
        });
      });

      it('should check whether the passed NFT is still owned by the the current selectedAddress/chainId combination and return the updated NFT object without updating state if batch is true', async () => {
        const { nftController, messenger } = setupController();
        const { selectedAddress, chainId } = nftController.config;
        const nft = {
          address: '0x02',
          tokenId: '1',
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
          favorite: false,
        };

        await nftController.addNft(nft.address, nft.tokenId, nft);

        expect(
          nftController.state.allNfts[selectedAddress][chainId][0]
            .isCurrentlyOwned,
        ).toBe(true);

        sinon.stub(nftController, 'isNftOwner' as any).returns(false);

        const updatedNft =
          await nftController.checkAndUpdateSingleNftOwnershipStatus(nft, true);

        expect(
          nftController.state.allNfts[selectedAddress][chainId][0]
            .isCurrentlyOwned,
        ).toBe(true);

        expect(updatedNft.isCurrentlyOwned).toBe(false);

        messenger.clearEventSubscriptions('NetworkController:stateChange');
      });

      it('should check whether the passed NFT is still owned by the the selectedAddress/chainId combination passed in the accountParams argument and update its isCurrentlyOwned property in state, when the currently configured selectedAddress/chainId are different from those passed', async () => {
        const { nftController, network, preferences, messenger } =
          setupController();
        const firstNetworkType = 'rinkeby';
        const secondNetworkType = 'ropsten';

        preferences.update({ selectedAddress: OWNER_ADDRESS });
        network.setProviderType(firstNetworkType);

        const { selectedAddress, chainId } = nftController.config;
        const nft = {
          address: '0x02',
          tokenId: '1',
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
          favorite: false,
        };

        await nftController.addNft(nft.address, nft.tokenId, nft);

        expect(
          nftController.state.allNfts[selectedAddress][chainId][0]
            .isCurrentlyOwned,
        ).toBe(true);

        sinon.stub(nftController, 'isNftOwner' as any).returns(false);

        preferences.update({ selectedAddress: SECOND_OWNER_ADDRESS });
        network.setProviderType(secondNetworkType);

        await nftController.checkAndUpdateSingleNftOwnershipStatus(nft, false, {
          userAddress: OWNER_ADDRESS,
          chainId: NetworksChainId[firstNetworkType],
        });

        expect(
          nftController.state.allNfts[OWNER_ADDRESS][
            NetworksChainId[firstNetworkType]
          ][0].isCurrentlyOwned,
        ).toBe(false);

        messenger.clearEventSubscriptions('NetworkController:stateChange');
      });
    });
  });

  describe('findNftByAddressAndTokenId', () => {
    const mockNft = {
      address: '0x02',
      tokenId: '1',
      name: 'name',
      image: 'image',
      description: 'description',
      standard: 'standard',
      favorite: false,
    };
    const { nftController, messenger } = setupController();
    const { selectedAddress, chainId } = nftController.config;

    afterAll(() => {
      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should return null if the NFT does not exist in the state', async () => {
      expect(
        nftController.findNftByAddressAndTokenId(
          mockNft.address,
          mockNft.tokenId,
          selectedAddress,
          chainId,
        ),
      ).toBeNull();
    });

    it('should return the NFT by the address and tokenId', () => {
      nftController.state.allNfts = {
        [selectedAddress]: { [chainId]: [mockNft] },
      };

      expect(
        nftController.findNftByAddressAndTokenId(
          mockNft.address,
          mockNft.tokenId,
          selectedAddress,
          chainId,
        ),
      ).toStrictEqual({ nft: mockNft, index: 0 });
    });
  });

  describe('updateNftByAddressAndTokenId', () => {
    const { nftController, messenger } = setupController();

    const mockTransactionId = '60d36710-b150-11ec-8a49-c377fbd05e27';
    const mockNft = {
      address: '0x02',
      tokenId: '1',
      name: 'name',
      image: 'image',
      description: 'description',
      standard: 'standard',
      favorite: false,
    };

    const expectedMockNft = {
      address: '0x02',
      description: 'description',
      favorite: false,
      image: 'image',
      name: 'name',
      standard: 'standard',
      tokenId: '1',
      transactionId: mockTransactionId,
    };

    const { selectedAddress, chainId } = nftController.config;

    afterAll(() => {
      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should update the NFT if the NFT exist', async () => {
      nftController.state.allNfts = {
        [selectedAddress]: { [chainId]: [mockNft] },
      };

      nftController.updateNft(
        mockNft,
        {
          transactionId: mockTransactionId,
        },
        selectedAddress,
        chainId,
      );

      expect(
        nftController.state.allNfts[selectedAddress][chainId][0],
      ).toStrictEqual(expectedMockNft);
    });

    it('should return undefined if the NFT does not exist', () => {
      expect(
        nftController.updateNft(
          mockNft,
          {
            transactionId: mockTransactionId,
          },
          selectedAddress,
          chainId,
        ),
      ).toBeUndefined();
    });
  });

  describe('resetNftTransactionStatusByTransactionId', () => {
    const { nftController, messenger } = setupController();

    const mockTransactionId = '60d36710-b150-11ec-8a49-c377fbd05e27';
    const nonExistTransactionId = '0123';

    const mockNft = {
      address: '0x02',
      tokenId: '1',
      name: 'name',
      image: 'image',
      description: 'description',
      standard: 'standard',
      favorite: false,
      transactionId: mockTransactionId,
    };

    const { selectedAddress, chainId } = nftController.config;

    afterAll(() => {
      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should not update any NFT state and should return false when passed a transaction id that does not match that of any NFT', async () => {
      expect(
        nftController.resetNftTransactionStatusByTransactionId(
          nonExistTransactionId,
          selectedAddress,
          chainId,
        ),
      ).toBe(false);
    });

    it('should set the transaction id of an NFT in state to undefined, and return true when it has successfully updated this state', async () => {
      nftController.state.allNfts = {
        [selectedAddress]: { [chainId]: [mockNft] },
      };

      expect(
        nftController.state.allNfts[selectedAddress][chainId][0].transactionId,
      ).toBe(mockTransactionId);

      expect(
        nftController.resetNftTransactionStatusByTransactionId(
          mockTransactionId,
          selectedAddress,
          chainId,
        ),
      ).toBe(true);

      expect(
        nftController.state.allNfts[selectedAddress][chainId][0].transactionId,
      ).toBeUndefined();
    });
  });
});
