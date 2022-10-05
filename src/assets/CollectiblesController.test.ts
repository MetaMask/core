import sinon from 'sinon';
import nock from 'nock';
import HttpProvider from 'ethjs-provider-http';
import { PreferencesController } from '../user/PreferencesController';
import {
  NetworkController,
  NetworksChainId,
  NetworkControllerMessenger,
} from '../network/NetworkController';
import { getFormattedIpfsUrl } from '../util';
import {
  OPENSEA_PROXY_URL,
  IPFS_DEFAULT_GATEWAY_URL,
  ERC1155,
  OPENSEA_API_URL,
  ERC721,
} from '../constants';
import { ControllerMessenger } from '../ControllerMessenger';
import { AssetsContractController } from './AssetsContractController';
import { CollectiblesController } from './CollectiblesController';

const CRYPTOPUNK_ADDRESS = '0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB';
const ERC721_KUDOSADDRESS = '0x2aEa4Add166EBf38b63d09a75dE1a7b94Aa24163';
const ERC721_KUDOS_TOKEN_ID = '1203';
const ERC721_COLLECTIBLE_ADDRESS = '0x60F80121C31A0d46B5279700f9DF786054aa5eE5';
const ERC721_COLLECTIBLE_ID = '1144858';
const ERC1155_COLLECTIBLE_ADDRESS =
  '0x495f947276749Ce646f68AC8c248420045cb7b5e';
const ERC1155_COLLECTIBLE_ID =
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

/**
 * Setup a test controller instance.
 *
 * @param options - Controller options.
 * @param options.includeOnCollectibleAdded - Whether to include the "onCollectibleAdded" parameter.
 * @returns A collection of test controllers and stubs.
 */
function setupController({
  includeOnCollectibleAdded = false,
}: { includeOnCollectibleAdded?: boolean } = {}) {
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
  const onCollectibleAddedSpy = includeOnCollectibleAdded
    ? jest.fn()
    : undefined;

  const collectiblesController = new CollectiblesController({
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
    onCollectibleAdded: onCollectibleAddedSpy,
  });

  preferences.update({
    selectedAddress: OWNER_ADDRESS,
    openSeaEnabled: true,
  });

  return {
    assetsContract,
    collectiblesController,
    network,
    onCollectibleAddedSpy,
    preferences,
    messenger,
  };
}

describe('CollectiblesController', () => {
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
      .get(`/asset/${ERC1155_COLLECTIBLE_ADDRESS}/${ERC1155_COLLECTIBLE_ID}`)
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
    const { collectiblesController, messenger } = setupController();

    expect(collectiblesController.state).toStrictEqual({
      allCollectibleContracts: {},
      allCollectibles: {},
      ignoredCollectibles: [],
    });
    messenger.clearEventSubscriptions('NetworkController:stateChange');
  });

  describe('addCollectible', () => {
    it('should add collectible and collectible contract', async () => {
      const { collectiblesController, messenger } = setupController();

      const { selectedAddress, chainId } = collectiblesController.config;
      await collectiblesController.addCollectible('0x01', '1', {
        name: 'name',
        image: 'image',
        description: 'description',
        standard: 'standard',
        favorite: false,
      });

      expect(
        collectiblesController.state.allCollectibles[selectedAddress][
          chainId
        ][0],
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
        collectiblesController.state.allCollectibleContracts[selectedAddress][
          chainId
        ][0],
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

    it('should call onCollectibleAdded callback correctly when collectible is manually added', async () => {
      const { collectiblesController, onCollectibleAddedSpy, messenger } =
        setupController({ includeOnCollectibleAdded: true });

      await collectiblesController.addCollectible('0x01', '1', {
        name: 'name',
        image: 'image',
        description: 'description',
        standard: 'ERC1155',
        favorite: false,
      });

      expect(onCollectibleAddedSpy).toHaveBeenCalledWith({
        source: 'custom',
        tokenId: '1',
        address: '0x01',
        standard: 'ERC1155',
        symbol: 'FOO',
      });

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should call onCollectibleAdded callback correctly when collectible is added via detection', async () => {
      const { collectiblesController, onCollectibleAddedSpy, messenger } =
        setupController({ includeOnCollectibleAdded: true });

      const detectedUserAddress = '0x123';
      await collectiblesController.addCollectible(
        '0x01',
        '2',
        {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'ERC721',
          favorite: false,
        },
        // this object in the third argument slot is only defined when the collectible is added via detection
        { userAddress: detectedUserAddress, chainId: '0x2' },
      );

      expect(onCollectibleAddedSpy).toHaveBeenCalledWith({
        source: 'detected',
        tokenId: '2',
        address: '0x01',
        standard: 'ERC721',
        symbol: 'FOO',
      });

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should add collectible by selected address', async () => {
      const { collectiblesController, preferences, messenger } =
        setupController();
      const { chainId } = collectiblesController.config;
      const firstAddress = '0x123';
      const secondAddress = '0x321';

      sinon
        .stub(collectiblesController, 'getCollectibleInformation' as any)
        .returns({ name: 'name', image: 'url', description: 'description' });
      preferences.update({ selectedAddress: firstAddress });
      await collectiblesController.addCollectible('0x01', '1234');
      preferences.update({ selectedAddress: secondAddress });
      await collectiblesController.addCollectible('0x02', '4321');
      preferences.update({ selectedAddress: firstAddress });
      expect(
        collectiblesController.state.allCollectibles[firstAddress][chainId][0],
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

    it('should update collectible if image is different', async () => {
      const { collectiblesController, messenger } = setupController();
      const { selectedAddress, chainId } = collectiblesController.config;

      await collectiblesController.addCollectible('0x01', '1', {
        name: 'name',
        image: 'image',
        description: 'description',
        standard: 'standard',
        favorite: false,
      });

      expect(
        collectiblesController.state.allCollectibles[selectedAddress][
          chainId
        ][0],
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

      await collectiblesController.addCollectible('0x01', '1', {
        name: 'name',
        image: 'image-updated',
        description: 'description',
        standard: 'standard',
        favorite: false,
      });

      expect(
        collectiblesController.state.allCollectibles[selectedAddress][
          chainId
        ][0],
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

    it('should not duplicate collectible nor collectible contract if already added', async () => {
      const { collectiblesController, messenger } = setupController();
      const { selectedAddress, chainId } = collectiblesController.config;
      await collectiblesController.addCollectible('0x01', '1', {
        name: 'name',
        image: 'image',
        description: 'description',
        standard: 'standard',
        favorite: false,
      });

      await collectiblesController.addCollectible('0x01', '1', {
        name: 'name',
        image: 'image',
        description: 'description',
        standard: 'standard',
        favorite: false,
      });

      expect(
        collectiblesController.state.allCollectibles[selectedAddress][chainId],
      ).toHaveLength(1);

      expect(
        collectiblesController.state.allCollectibleContracts[selectedAddress][
          chainId
        ],
      ).toHaveLength(1);

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should add collectible and get information from OpenSea', async () => {
      const { collectiblesController, messenger } = setupController();

      const { selectedAddress, chainId } = collectiblesController.config;
      await collectiblesController.addCollectible('0x01', '1');
      expect(
        collectiblesController.state.allCollectibles[selectedAddress][
          chainId
        ][0],
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

    it('should add collectible erc721 and aggregate collectible data from both contract and OpenSea', async () => {
      const { assetsContract, collectiblesController, messenger } =
        setupController();
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
              to: '0x2aEa4Add166EBf38b63d09a75dE1a7b94Aa24163',
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
              to: '0x2aEa4Add166EBf38b63d09a75dE1a7b94Aa24163',
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
              to: '0x2aEa4Add166EBf38b63d09a75dE1a7b94Aa24163',
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
              to: '0x2aEa4Add166EBf38b63d09a75dE1a7b94Aa24163',
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
      const { selectedAddress, chainId } = collectiblesController.config;
      sinon
        .stub(
          collectiblesController,
          'getCollectibleContractInformationFromApi' as any,
        )
        .returns(undefined);

      await collectiblesController.addCollectible(
        ERC721_KUDOSADDRESS,
        ERC721_KUDOS_TOKEN_ID,
      );

      expect(
        collectiblesController.state.allCollectibles[selectedAddress][
          chainId
        ][0],
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
        collectiblesController.state.allCollectibleContracts[selectedAddress][
          chainId
        ][0],
      ).toStrictEqual({
        address: ERC721_KUDOSADDRESS,
        name: 'KudosToken',
        symbol: 'KDO',
      });

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should add collectible erc1155 and get collectible information from contract when OpenSea Proxy API fails to fetch and no OpenSeaAPI key is set', async () => {
      const { assetsContract, collectiblesController, messenger } =
        setupController();
      nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 5,
          method: 'eth_call',
          params: [
            {
              to: '0x495f947276749Ce646f68AC8c248420045cb7b5e',
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
              to: '0x495f947276749Ce646f68AC8c248420045cb7b5e',
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
              to: '0x495f947276749Ce646f68AC8c248420045cb7b5e',
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
              to: '0x495f947276749Ce646f68AC8c248420045cb7b5e',
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
        .get(`/asset_contract/${ERC1155_COLLECTIBLE_ADDRESS}`)
        .replyWithError(new TypeError('Failed to fetch'));

      // the tokenURI for ERC1155_COLLECTIBLE_ADDRESS + ERC1155_COLLECTIBLE_ID
      nock('https://api.opensea.io')
        .get(
          `/api/v1/metadata/${ERC1155_COLLECTIBLE_ADDRESS}/0x5a3ca5cd63807ce5e4d7841ab32ce6b6d9bbba2d000000000000010000000001`,
        )
        .reply(200, {
          name: 'name (directly from tokenURI)',
          description: 'description (direclty from tokenURI)',
          external_link: null,
          image: 'image (directly from tokenURI)',
          animation_url: null,
        });

      assetsContract.configure({ provider: MAINNET_PROVIDER });
      const { selectedAddress, chainId } = collectiblesController.config;

      expect(collectiblesController.openSeaApiKey).toBeUndefined();

      await collectiblesController.addCollectible(
        ERC1155_COLLECTIBLE_ADDRESS,
        ERC1155_COLLECTIBLE_ID,
      );

      expect(
        collectiblesController.state.allCollectibles[selectedAddress][
          chainId
        ][0],
      ).toStrictEqual({
        address: ERC1155_COLLECTIBLE_ADDRESS,
        image: 'image (directly from tokenURI)',
        name: 'name (directly from tokenURI)',
        description: 'description (direclty from tokenURI)',
        tokenId: ERC1155_COLLECTIBLE_ID,
        standard: ERC1155,
        favorite: false,
        isCurrentlyOwned: true,
        imageOriginal: 'image.uri',
        numberOfSales: 1,
      });

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should add collectible erc721 and get collectible information only from contract', async () => {
      const { assetsContract, collectiblesController, messenger } =
        setupController();
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
              to: '0x2aEa4Add166EBf38b63d09a75dE1a7b94Aa24163',
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
              to: '0x2aEa4Add166EBf38b63d09a75dE1a7b94Aa24163',
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
              to: '0x2aEa4Add166EBf38b63d09a75dE1a7b94Aa24163',
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
              to: '0x2aEa4Add166EBf38b63d09a75dE1a7b94Aa24163',
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
      const { selectedAddress, chainId } = collectiblesController.config;
      sinon
        .stub(
          collectiblesController,
          'getCollectibleContractInformationFromApi' as any,
        )
        .returns(undefined);

      sinon
        .stub(collectiblesController, 'getCollectibleInformationFromApi' as any)
        .returns(undefined);

      await collectiblesController.addCollectible(
        ERC721_KUDOSADDRESS,
        ERC721_KUDOS_TOKEN_ID,
      );

      expect(
        collectiblesController.state.allCollectibles[selectedAddress][
          chainId
        ][0],
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
        collectiblesController.state.allCollectibleContracts[selectedAddress][
          chainId
        ][0],
      ).toStrictEqual({
        address: ERC721_KUDOSADDRESS,
        name: 'KudosToken',
        symbol: 'KDO',
      });

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should add collectible by provider type', async () => {
      const { collectiblesController, network, messenger } = setupController();
      const firstNetworkType = 'rinkeby';
      const secondNetworkType = 'ropsten';
      const { selectedAddress } = collectiblesController.config;
      sinon
        .stub(collectiblesController, 'getCollectibleInformation' as any)
        .returns({ name: 'name', image: 'url', description: 'description' });

      network.setProviderType(firstNetworkType);
      await collectiblesController.addCollectible('0x01', '1234');
      network.setProviderType(secondNetworkType);
      network.setProviderType(firstNetworkType);

      expect(
        collectiblesController.state.allCollectibles[selectedAddress]?.[
          NetworksChainId[secondNetworkType]
        ],
      ).toBeUndefined();

      expect(
        collectiblesController.state.allCollectibles[selectedAddress][
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

    it('should not add collectibles with no contract information when auto detecting', async () => {
      const { collectiblesController, messenger } = setupController();
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

      const { selectedAddress, chainId } = collectiblesController.config;
      await collectiblesController.addCollectible(
        '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab',
        '123',
        undefined,
        {
          userAddress: selectedAddress,
          chainId,
        },
      );

      expect(
        collectiblesController.state.allCollectibles[selectedAddress]?.[
          chainId
        ],
      ).toBeUndefined();

      expect(
        collectiblesController.state.allCollectibleContracts[selectedAddress]?.[
          chainId
        ],
      ).toBeUndefined();

      await collectiblesController.addCollectible(
        ERC721_KUDOSADDRESS,
        ERC721_KUDOS_TOKEN_ID,
        undefined,
        {
          userAddress: selectedAddress,
          chainId,
        },
      );

      expect(
        collectiblesController.state.allCollectibles[selectedAddress][chainId],
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
        collectiblesController.state.allCollectibleContracts[selectedAddress][
          chainId
        ],
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

    it('should not add duplicate collectibles to the ignoredCollectibles list', async () => {
      const { collectiblesController, messenger } = setupController();
      const { selectedAddress, chainId } = collectiblesController.config;

      await collectiblesController.addCollectible('0x01', '1', {
        name: 'name',
        image: 'image',
        description: 'description',
        standard: 'standard',
      });

      await collectiblesController.addCollectible('0x01', '2', {
        name: 'name',
        image: 'image',
        description: 'description',
        standard: 'standard',
      });

      expect(
        collectiblesController.state.allCollectibles[selectedAddress][chainId],
      ).toHaveLength(2);
      expect(collectiblesController.state.ignoredCollectibles).toHaveLength(0);

      collectiblesController.removeAndIgnoreCollectible('0x01', '1');
      expect(
        collectiblesController.state.allCollectibles[selectedAddress][chainId],
      ).toHaveLength(1);
      expect(collectiblesController.state.ignoredCollectibles).toHaveLength(1);

      await collectiblesController.addCollectible('0x01', '1', {
        name: 'name',
        image: 'image',
        description: 'description',
        standard: 'standard',
      });

      expect(
        collectiblesController.state.allCollectibles[selectedAddress][chainId],
      ).toHaveLength(2);
      expect(collectiblesController.state.ignoredCollectibles).toHaveLength(1);

      collectiblesController.removeAndIgnoreCollectible('0x01', '1');
      expect(
        collectiblesController.state.allCollectibles[selectedAddress][chainId],
      ).toHaveLength(1);
      expect(collectiblesController.state.ignoredCollectibles).toHaveLength(1);

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should add collectible with metadata hosted in IPFS', async () => {
      const { assetsContract, collectiblesController, messenger } =
        setupController();
      nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 13,
          method: 'eth_call',
          params: [
            {
              to: '0x18E8E76aeB9E2d9FA2A2b88DD9CF3C8ED45c3660',
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
              to: '0x18E8E76aeB9E2d9FA2A2b88DD9CF3C8ED45c3660',
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
              to: '0x18E8E76aeB9E2d9FA2A2b88DD9CF3C8ED45c3660',
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
              to: '0x18E8E76aeB9E2d9FA2A2b88DD9CF3C8ED45c3660',
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
      collectiblesController.configure({
        ipfsGateway: IPFS_DEFAULT_GATEWAY_URL,
      });
      const { selectedAddress, chainId } = collectiblesController.config;
      await collectiblesController.addCollectible(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
      );

      expect(
        collectiblesController.state.allCollectibleContracts[selectedAddress][
          chainId
        ][0],
      ).toStrictEqual({
        address: '0x18E8E76aeB9E2d9FA2A2b88DD9CF3C8ED45c3660',
        name: "Maltjik.jpg's Depressionists",
        symbol: 'DPNS',
      });

      expect(
        collectiblesController.state.allCollectibles[selectedAddress][
          chainId
        ][0],
      ).toStrictEqual({
        address: '0x18E8E76aeB9E2d9FA2A2b88DD9CF3C8ED45c3660',
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

    it('should add collectible erc721 and get collectible information directly from OpenSea API when OpenSeaAPIkey is set and queries to OpenSea proxy fail', async () => {
      const { assetsContract, collectiblesController, messenger } =
        setupController();
      nock(OPENSEA_PROXY_URL)
        .get(`/asset_contract/${ERC721_COLLECTIBLE_ADDRESS}`)
        .replyWithError(new Error('Failed to fetch'))
        .get(`/asset/${ERC721_COLLECTIBLE_ADDRESS}/${ERC721_COLLECTIBLE_ID}`)
        .replyWithError(new Error('Failed to fetch'));

      nock(OPENSEA_API_URL, {
        encodedQueryParams: true,
      })
        .get(`/asset_contract/${ERC721_COLLECTIBLE_ADDRESS}`)
        .reply(200, {
          description: 'description (from opensea)',
          symbol: 'KDO',
          total_supply: 10,
          collection: {
            name: 'name (from opensea)',
            image_url: 'logo (from opensea)',
          },
        })
        .get(`/asset/${ERC721_COLLECTIBLE_ADDRESS}/${ERC721_COLLECTIBLE_ID}`)
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
              to: ERC721_COLLECTIBLE_ADDRESS,
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
              to: ERC721_COLLECTIBLE_ADDRESS,
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
              to: ERC721_COLLECTIBLE_ADDRESS,
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
              to: ERC721_COLLECTIBLE_ADDRESS,
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
        .get(
          `/api/v1/metadata/${ERC721_COLLECTIBLE_ADDRESS}/${ERC721_COLLECTIBLE_ID}`,
        )
        .reply(200, [
          '1f8b080000000000000334ce5d6f82301480e1ffd26b1015a3913bcdd8d4c1b20f9dc31bd274b51c3d3d85b664a0f1bf2f66d9ed9bbcc97365c4b564095be440e3e168ce02f62d9db0507b30c4126a1103263b2f2d712c11e8fc1f4173755f2bef6b97441156f14019a350b64e5a61c84bf203617494ef8aed27e5611cea7836f5fdfe510dc561cf9fcb23d8d364ed8a99cd2e4db30a1fb2d57184d9d9c6c547caab27dc35cbf779dd6bdfbfa88d5abca1b079d77ea5cbf4f24a6b389c5c2f4074d39fb16201e3049adfe1656bf1cf79fb050000ffff03002c5b5b9be3000000',
        ]);

      assetsContract.configure({ provider: MAINNET_PROVIDER });
      const { selectedAddress, chainId } = collectiblesController.config;

      collectiblesController.setApiKey('fake-api-key');
      expect(collectiblesController.openSeaApiKey).toBe('fake-api-key');

      await collectiblesController.addCollectible(
        ERC721_COLLECTIBLE_ADDRESS,
        ERC721_COLLECTIBLE_ID,
      );

      expect(
        collectiblesController.state.allCollectibles[selectedAddress][
          chainId
        ][0],
      ).toStrictEqual({
        address: ERC721_COLLECTIBLE_ADDRESS,
        image: null,
        imageOriginal: 'image (directly from opensea)',
        name: 'name (directly from opensea)',
        description: 'description (directly from opensea)',
        tokenId: ERC721_COLLECTIBLE_ID,
        standard: ERC721,
        favorite: false,
        isCurrentlyOwned: true,
      });

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });
  });

  describe('addCollectibleVerifyOwnership', () => {
    it('should verify ownership by selected address and add collectible', async () => {
      const { collectiblesController, preferences, messenger } =
        setupController();
      const firstAddress = '0x123';
      const secondAddress = '0x321';
      const { chainId } = collectiblesController.config;

      sinon
        .stub(collectiblesController, 'isCollectibleOwner' as any)
        .returns(true);

      sinon
        .stub(collectiblesController, 'getCollectibleInformation' as any)
        .returns({ name: 'name', image: 'url', description: 'description' });
      preferences.update({ selectedAddress: firstAddress });
      await collectiblesController.addCollectibleVerifyOwnership(
        '0x01',
        '1234',
      );
      preferences.update({ selectedAddress: secondAddress });
      await collectiblesController.addCollectibleVerifyOwnership(
        '0x02',
        '4321',
      );
      preferences.update({ selectedAddress: firstAddress });
      expect(
        collectiblesController.state.allCollectibles[firstAddress][chainId][0],
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

    it('should throw an error if selected address is not owner of input collectible', async () => {
      const { collectiblesController, preferences, messenger } =
        setupController();
      sinon
        .stub(collectiblesController, 'isCollectibleOwner' as any)
        .returns(false);
      const firstAddress = '0x123';
      preferences.update({ selectedAddress: firstAddress });
      const result = async () =>
        await collectiblesController.addCollectibleVerifyOwnership(
          '0x01',
          '1234',
        );
      const error = 'This collectible is not owned by the user';
      await expect(result).rejects.toThrow(error);

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });
  });

  describe('removeCollectible', () => {
    it('should remove collectible and collectible contract', async () => {
      const { collectiblesController, messenger } = setupController();
      const { selectedAddress, chainId } = collectiblesController.config;

      await collectiblesController.addCollectible('0x01', '1', {
        name: 'name',
        image: 'image',
        description: 'description',
        standard: 'standard',
      });
      collectiblesController.removeCollectible('0x01', '1');
      expect(
        collectiblesController.state.allCollectibles[selectedAddress][chainId],
      ).toHaveLength(0);

      expect(
        collectiblesController.state.allCollectibleContracts[selectedAddress][
          chainId
        ],
      ).toHaveLength(0);

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should not remove collectible contract if collectible still exists', async () => {
      const { collectiblesController, messenger } = setupController();
      const { selectedAddress, chainId } = collectiblesController.config;

      await collectiblesController.addCollectible('0x01', '1', {
        name: 'name',
        image: 'image',
        description: 'description',
        standard: 'standard',
      });

      await collectiblesController.addCollectible('0x01', '2', {
        name: 'name',
        image: 'image',
        description: 'description',
        standard: 'standard',
      });
      collectiblesController.removeCollectible('0x01', '1');
      expect(
        collectiblesController.state.allCollectibles[selectedAddress][chainId],
      ).toHaveLength(1);

      expect(
        collectiblesController.state.allCollectibleContracts[selectedAddress][
          chainId
        ],
      ).toHaveLength(1);

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should remove collectible by selected address', async () => {
      const { collectiblesController, preferences, messenger } =
        setupController();
      const { chainId } = collectiblesController.config;
      sinon
        .stub(collectiblesController, 'getCollectibleInformation' as any)
        .returns({ name: 'name', image: 'url', description: 'description' });
      const firstAddress = '0x123';
      const secondAddress = '0x321';
      preferences.update({ selectedAddress: firstAddress });
      await collectiblesController.addCollectible('0x02', '4321');
      preferences.update({ selectedAddress: secondAddress });
      await collectiblesController.addCollectible('0x01', '1234');
      collectiblesController.removeCollectible('0x01', '1234');
      expect(
        collectiblesController.state.allCollectibles[secondAddress][chainId],
      ).toHaveLength(0);
      preferences.update({ selectedAddress: firstAddress });
      expect(
        collectiblesController.state.allCollectibles[firstAddress][chainId][0],
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

    it('should remove collectible by provider type', async () => {
      const { collectiblesController, network, messenger } = setupController();
      const { selectedAddress } = collectiblesController.config;

      sinon
        .stub(collectiblesController, 'getCollectibleInformation' as any)
        .returns({ name: 'name', image: 'url', description: 'description' });
      const firstNetworkType = 'rinkeby';
      const secondNetworkType = 'ropsten';
      network.setProviderType(firstNetworkType);
      await collectiblesController.addCollectible('0x02', '4321');
      network.setProviderType(secondNetworkType);
      await collectiblesController.addCollectible('0x01', '1234');
      // collectiblesController.removeToken('0x01');
      collectiblesController.removeCollectible('0x01', '1234');
      expect(
        collectiblesController.state.allCollectibles[selectedAddress][
          NetworksChainId[secondNetworkType]
        ],
      ).toHaveLength(0);

      network.setProviderType(firstNetworkType);

      expect(
        collectiblesController.state.allCollectibles[selectedAddress][
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

  it('should be able to clear the ignoredCollectibles list', async () => {
    const { collectiblesController, messenger } = setupController();
    const { selectedAddress, chainId } = collectiblesController.config;

    await collectiblesController.addCollectible('0x02', '1', {
      name: 'name',
      image: 'image',
      description: 'description',
      standard: 'standard',
      favorite: false,
    });

    expect(
      collectiblesController.state.allCollectibles[selectedAddress][chainId],
    ).toHaveLength(1);
    expect(collectiblesController.state.ignoredCollectibles).toHaveLength(0);

    collectiblesController.removeAndIgnoreCollectible('0x02', '1');
    expect(
      collectiblesController.state.allCollectibles[selectedAddress][chainId],
    ).toHaveLength(0);
    expect(collectiblesController.state.ignoredCollectibles).toHaveLength(1);

    collectiblesController.clearIgnoredCollectibles();
    expect(collectiblesController.state.ignoredCollectibles).toHaveLength(0);

    messenger.clearEventSubscriptions('NetworkController:stateChange');
  });

  it('should set api key correctly', () => {
    const { collectiblesController, messenger } = setupController();
    collectiblesController.setApiKey('new-api-key');
    expect(collectiblesController.openSeaApiKey).toBe('new-api-key');
    messenger.clearEventSubscriptions('NetworkController:stateChange');
  });

  describe('isCollectibleOwner', () => {
    it('should verify the ownership of an ERC-721 collectible with the correct owner address', async () => {
      const { assetsContract, collectiblesController, messenger } =
        setupController();
      nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 21,
          method: 'eth_call',
          params: [
            {
              to: ERC721_COLLECTIBLE_ADDRESS,
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
      const isOwner = await collectiblesController.isCollectibleOwner(
        OWNER_ADDRESS,
        ERC721_COLLECTIBLE_ADDRESS,
        String(ERC721_COLLECTIBLE_ID),
      );
      expect(isOwner).toBe(true);

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should not verify the ownership of an ERC-721 collectible with the wrong owner address', async () => {
      const { assetsContract, collectiblesController, messenger } =
        setupController();
      nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 22,
          method: 'eth_call',
          params: [
            {
              to: ERC721_COLLECTIBLE_ADDRESS,
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
      const isOwner = await collectiblesController.isCollectibleOwner(
        '0x0000000000000000000000000000000000000000',
        ERC721_COLLECTIBLE_ADDRESS,
        String(ERC721_COLLECTIBLE_ID),
      );
      expect(isOwner).toBe(false);

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should verify the ownership of an ERC-1155 collectible with the correct owner address', async () => {
      const { assetsContract, collectiblesController, messenger } =
        setupController();
      nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 23,
          method: 'eth_call',
          params: [
            {
              to: '0x495f947276749Ce646f68AC8c248420045cb7b5e',
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
              to: '0x495f947276749Ce646f68AC8c248420045cb7b5e',
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
      const isOwner = await collectiblesController.isCollectibleOwner(
        OWNER_ADDRESS,
        ERC1155_COLLECTIBLE_ADDRESS,
        ERC1155_COLLECTIBLE_ID,
      );
      expect(isOwner).toBe(true);

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should not verify the ownership of an ERC-1155 collectible with the wrong owner address', async () => {
      const { assetsContract, collectiblesController, messenger } =
        setupController();
      nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 25,
          method: 'eth_call',
          params: [
            {
              to: '0x495f947276749Ce646f68AC8c248420045cb7b5e',
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
              to: '0x495f947276749Ce646f68AC8c248420045cb7b5e',
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
      const isOwner = await collectiblesController.isCollectibleOwner(
        '0x0000000000000000000000000000000000000000',
        ERC1155_COLLECTIBLE_ADDRESS,
        ERC1155_COLLECTIBLE_ID,
      );
      expect(isOwner).toBe(false);

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should throw an error for an unsupported standard', async () => {
      const { assetsContract, collectiblesController, messenger } =
        setupController();
      assetsContract.configure({ provider: MAINNET_PROVIDER });
      const error =
        'Unable to verify ownership. Probably because the standard is not supported or the chain is incorrect';
      const result = async () => {
        await collectiblesController.isCollectibleOwner(
          '0x0000000000000000000000000000000000000000',
          CRYPTOPUNK_ADDRESS,
          '0',
        );
      };
      await expect(result).rejects.toThrow(error);

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });
  });

  describe('updateCollectibleFavoriteStatus', () => {
    it('should set collectible as favorite', async () => {
      const { assetsContract, collectiblesController, messenger } =
        setupController();
      assetsContract.configure({ provider: MAINNET_PROVIDER });
      const { selectedAddress, chainId } = collectiblesController.config;
      await collectiblesController.addCollectible(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
      );

      collectiblesController.updateCollectibleFavoriteStatus(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
        true,
      );

      expect(
        collectiblesController.state.allCollectibles[selectedAddress][
          chainId
        ][0],
      ).toStrictEqual(
        expect.objectContaining({
          address: ERC721_DEPRESSIONIST_ADDRESS,
          tokenId: ERC721_DEPRESSIONIST_ID,
          favorite: true,
        }),
      );

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should set collectible as favorite and then unset it', async () => {
      const { assetsContract, collectiblesController, messenger } =
        setupController();
      assetsContract.configure({ provider: MAINNET_PROVIDER });
      const { selectedAddress, chainId } = collectiblesController.config;
      await collectiblesController.addCollectible(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
      );

      collectiblesController.updateCollectibleFavoriteStatus(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
        true,
      );

      expect(
        collectiblesController.state.allCollectibles[selectedAddress][
          chainId
        ][0],
      ).toStrictEqual(
        expect.objectContaining({
          address: ERC721_DEPRESSIONIST_ADDRESS,
          tokenId: ERC721_DEPRESSIONIST_ID,
          favorite: true,
        }),
      );

      collectiblesController.updateCollectibleFavoriteStatus(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
        false,
      );

      expect(
        collectiblesController.state.allCollectibles[selectedAddress][
          chainId
        ][0],
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
      const { assetsContract, collectiblesController, messenger } =
        setupController();
      assetsContract.configure({ provider: MAINNET_PROVIDER });
      const { selectedAddress, chainId } = collectiblesController.config;
      await collectiblesController.addCollectible(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
      );

      collectiblesController.updateCollectibleFavoriteStatus(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
        true,
      );

      expect(
        collectiblesController.state.allCollectibles[selectedAddress][
          chainId
        ][0],
      ).toStrictEqual(
        expect.objectContaining({
          address: ERC721_DEPRESSIONIST_ADDRESS,
          tokenId: ERC721_DEPRESSIONIST_ID,
          favorite: true,
        }),
      );

      await collectiblesController.addCollectible(
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
        collectiblesController.state.allCollectibles[selectedAddress][
          chainId
        ][0],
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
        collectiblesController.state.allCollectibles[selectedAddress][chainId],
      ).toHaveLength(1);

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should keep the favorite status as false after updating metadata', async () => {
      const { assetsContract, collectiblesController, messenger } =
        setupController();
      assetsContract.configure({ provider: MAINNET_PROVIDER });
      const { selectedAddress, chainId } = collectiblesController.config;
      await collectiblesController.addCollectible(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
      );

      expect(
        collectiblesController.state.allCollectibles[selectedAddress][
          chainId
        ][0],
      ).toStrictEqual(
        expect.objectContaining({
          address: ERC721_DEPRESSIONIST_ADDRESS,
          tokenId: ERC721_DEPRESSIONIST_ID,
          favorite: false,
        }),
      );

      await collectiblesController.addCollectible(
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
        collectiblesController.state.allCollectibles[selectedAddress][
          chainId
        ][0],
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
        collectiblesController.state.allCollectibles[selectedAddress][chainId],
      ).toHaveLength(1);

      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    describe('checkAndUpdateCollectiblesOwnershipStatus', () => {
      describe('checkAndUpdateAllCollectiblesOwnershipStatus', () => {
        it('should check whether collectibles for the current selectedAddress/chainId combination are still owned by the selectedAddress and update the isCurrentlyOwned value to false when collectible is not still owned', async () => {
          const { collectiblesController, messenger } = setupController();
          sinon
            .stub(collectiblesController, 'isCollectibleOwner' as any)
            .returns(false);

          const { selectedAddress, chainId } = collectiblesController.config;
          await collectiblesController.addCollectible('0x02', '1', {
            name: 'name',
            image: 'image',
            description: 'description',
            standard: 'standard',
            favorite: false,
          });

          expect(
            collectiblesController.state.allCollectibles[selectedAddress][
              chainId
            ][0].isCurrentlyOwned,
          ).toBe(true);

          await collectiblesController.checkAndUpdateAllCollectiblesOwnershipStatus();
          expect(
            collectiblesController.state.allCollectibles[selectedAddress][
              chainId
            ][0].isCurrentlyOwned,
          ).toBe(false);

          messenger.clearEventSubscriptions('NetworkController:stateChange');
        });
      });

      it('should check whether collectibles for the current selectedAddress/chainId combination are still owned by the selectedAddress and leave/set the isCurrentlyOwned value to true when collectible is still owned', async () => {
        const { collectiblesController, messenger } = setupController();
        sinon
          .stub(collectiblesController, 'isCollectibleOwner' as any)
          .returns(true);

        const { selectedAddress, chainId } = collectiblesController.config;
        await collectiblesController.addCollectible('0x02', '1', {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
          favorite: false,
        });

        expect(
          collectiblesController.state.allCollectibles[selectedAddress][
            chainId
          ][0].isCurrentlyOwned,
        ).toBe(true);

        await collectiblesController.checkAndUpdateAllCollectiblesOwnershipStatus();
        expect(
          collectiblesController.state.allCollectibles[selectedAddress][
            chainId
          ][0].isCurrentlyOwned,
        ).toBe(true);

        messenger.clearEventSubscriptions('NetworkController:stateChange');
      });

      it('should check whether collectibles for the current selectedAddress/chainId combination are still owned by the selectedAddress and leave the isCurrentlyOwned value as is when collectible ownership check fails', async () => {
        const { collectiblesController, messenger } = setupController();
        sinon
          .stub(collectiblesController, 'isCollectibleOwner' as any)
          .throws(new Error('Unable to verify ownership'));

        const { selectedAddress, chainId } = collectiblesController.config;
        await collectiblesController.addCollectible('0x02', '1', {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
          favorite: false,
        });

        expect(
          collectiblesController.state.allCollectibles[selectedAddress][
            chainId
          ][0].isCurrentlyOwned,
        ).toBe(true);

        await collectiblesController.checkAndUpdateAllCollectiblesOwnershipStatus();
        expect(
          collectiblesController.state.allCollectibles[selectedAddress][
            chainId
          ][0].isCurrentlyOwned,
        ).toBe(true);

        messenger.clearEventSubscriptions('NetworkController:stateChange');
      });

      describe('checkAndUpdateSingleCollectibleOwnershipStatus', () => {
        it('should check whether the passed collectible is still owned by the the current selectedAddress/chainId combination and update its isCurrentlyOwned property in state if batch is false and isCollectibleOwner returns false', async () => {
          const { collectiblesController, messenger } = setupController();
          const { selectedAddress, chainId } = collectiblesController.config;
          const collectible = {
            address: '0x02',
            tokenId: '1',
            name: 'name',
            image: 'image',
            description: 'description',
            standard: 'standard',
            favorite: false,
          };

          await collectiblesController.addCollectible(
            collectible.address,
            collectible.tokenId,
            collectible,
          );

          expect(
            collectiblesController.state.allCollectibles[selectedAddress][
              chainId
            ][0].isCurrentlyOwned,
          ).toBe(true);

          sinon
            .stub(collectiblesController, 'isCollectibleOwner' as any)
            .returns(false);

          await collectiblesController.checkAndUpdateSingleCollectibleOwnershipStatus(
            collectible,
            false,
          );

          expect(
            collectiblesController.state.allCollectibles[selectedAddress][
              chainId
            ][0].isCurrentlyOwned,
          ).toBe(false);

          messenger.clearEventSubscriptions('NetworkController:stateChange');
        });
      });

      it('should check whether the passed collectible is still owned by the the current selectedAddress/chainId combination and return the updated collectible object without updating state if batch is true', async () => {
        const { collectiblesController, messenger } = setupController();
        const { selectedAddress, chainId } = collectiblesController.config;
        const collectible = {
          address: '0x02',
          tokenId: '1',
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
          favorite: false,
        };

        await collectiblesController.addCollectible(
          collectible.address,
          collectible.tokenId,
          collectible,
        );

        expect(
          collectiblesController.state.allCollectibles[selectedAddress][
            chainId
          ][0].isCurrentlyOwned,
        ).toBe(true);

        sinon
          .stub(collectiblesController, 'isCollectibleOwner' as any)
          .returns(false);

        const updatedCollectible =
          await collectiblesController.checkAndUpdateSingleCollectibleOwnershipStatus(
            collectible,
            true,
          );

        expect(
          collectiblesController.state.allCollectibles[selectedAddress][
            chainId
          ][0].isCurrentlyOwned,
        ).toBe(true);

        expect(updatedCollectible.isCurrentlyOwned).toBe(false);

        messenger.clearEventSubscriptions('NetworkController:stateChange');
      });

      it('should check whether the passed collectible is still owned by the the selectedAddress/chainId combination passed in the accountParams argument and update its isCurrentlyOwned property in state, when the currently configured selectedAddress/chainId are different from those passed', async () => {
        const { collectiblesController, network, preferences, messenger } =
          setupController();
        const firstNetworkType = 'rinkeby';
        const secondNetworkType = 'ropsten';

        preferences.update({ selectedAddress: OWNER_ADDRESS });
        network.setProviderType(firstNetworkType);

        const { selectedAddress, chainId } = collectiblesController.config;
        const collectible = {
          address: '0x02',
          tokenId: '1',
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
          favorite: false,
        };

        await collectiblesController.addCollectible(
          collectible.address,
          collectible.tokenId,
          collectible,
        );

        expect(
          collectiblesController.state.allCollectibles[selectedAddress][
            chainId
          ][0].isCurrentlyOwned,
        ).toBe(true);

        sinon
          .stub(collectiblesController, 'isCollectibleOwner' as any)
          .returns(false);

        preferences.update({ selectedAddress: SECOND_OWNER_ADDRESS });
        network.setProviderType(secondNetworkType);

        await collectiblesController.checkAndUpdateSingleCollectibleOwnershipStatus(
          collectible,
          false,
          {
            userAddress: OWNER_ADDRESS,
            chainId: NetworksChainId[firstNetworkType],
          },
        );

        expect(
          collectiblesController.state.allCollectibles[OWNER_ADDRESS][
            NetworksChainId[firstNetworkType]
          ][0].isCurrentlyOwned,
        ).toBe(false);

        messenger.clearEventSubscriptions('NetworkController:stateChange');
      });
    });
  });

  describe('findCollectibleByAddressAndTokenId', () => {
    const mockCollectible = {
      address: '0x02',
      tokenId: '1',
      name: 'name',
      image: 'image',
      description: 'description',
      standard: 'standard',
      favorite: false,
    };
    const { collectiblesController, messenger } = setupController();
    const { selectedAddress, chainId } = collectiblesController.config;

    afterAll(() => {
      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should return null if the collectible does not exist in the state', async () => {
      expect(
        collectiblesController.findCollectibleByAddressAndTokenId(
          mockCollectible.address,
          mockCollectible.tokenId,
          selectedAddress,
          chainId,
        ),
      ).toBeNull();
    });

    it('should return the collectible by the address and tokenId', () => {
      collectiblesController.state.allCollectibles = {
        [selectedAddress]: { [chainId]: [mockCollectible] },
      };

      expect(
        collectiblesController.findCollectibleByAddressAndTokenId(
          mockCollectible.address,
          mockCollectible.tokenId,
          selectedAddress,
          chainId,
        ),
      ).toStrictEqual({ collectible: mockCollectible, index: 0 });
    });
  });

  describe('updateCollectibleByAddressAndTokenId', () => {
    const { collectiblesController, messenger } = setupController();

    const mockTransactionId = '60d36710-b150-11ec-8a49-c377fbd05e27';
    const mockCollectible = {
      address: '0x02',
      tokenId: '1',
      name: 'name',
      image: 'image',
      description: 'description',
      standard: 'standard',
      favorite: false,
    };

    const expectedMockCollectible = {
      address: '0x02',
      description: 'description',
      favorite: false,
      image: 'image',
      name: 'name',
      standard: 'standard',
      tokenId: '1',
      transactionId: mockTransactionId,
    };

    const { selectedAddress, chainId } = collectiblesController.config;

    afterAll(() => {
      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should update the collectible if the collectible exist', async () => {
      collectiblesController.state.allCollectibles = {
        [selectedAddress]: { [chainId]: [mockCollectible] },
      };

      collectiblesController.updateCollectible(
        mockCollectible,
        {
          transactionId: mockTransactionId,
        },
        selectedAddress,
        chainId,
      );

      expect(
        collectiblesController.state.allCollectibles[selectedAddress][
          chainId
        ][0],
      ).toStrictEqual(expectedMockCollectible);
    });

    it('should return undefined if the collectible does not exist', () => {
      expect(
        collectiblesController.updateCollectible(
          mockCollectible,
          {
            transactionId: mockTransactionId,
          },
          selectedAddress,
          chainId,
        ),
      ).toBeUndefined();
    });
  });

  describe('resetCollectibleTransactionStatusByTransactionId', () => {
    const { collectiblesController, messenger } = setupController();

    const mockTransactionId = '60d36710-b150-11ec-8a49-c377fbd05e27';
    const nonExistTransactionId = '0123';

    const mockCollectible = {
      address: '0x02',
      tokenId: '1',
      name: 'name',
      image: 'image',
      description: 'description',
      standard: 'standard',
      favorite: false,
      transactionId: mockTransactionId,
    };

    const { selectedAddress, chainId } = collectiblesController.config;

    afterAll(() => {
      messenger.clearEventSubscriptions('NetworkController:stateChange');
    });

    it('should not update any collectible state and should return false when passed a transaction id that does not match that of any collectible', async () => {
      expect(
        collectiblesController.resetCollectibleTransactionStatusByTransactionId(
          nonExistTransactionId,
          selectedAddress,
          chainId,
        ),
      ).toBe(false);
    });

    it('should set the transaction id of a collectible in state to undefined, and return true when it has successfully updated this state', async () => {
      collectiblesController.state.allCollectibles = {
        [selectedAddress]: { [chainId]: [mockCollectible] },
      };

      expect(
        collectiblesController.state.allCollectibles[selectedAddress][
          chainId
        ][0].transactionId,
      ).toBe(mockTransactionId);

      expect(
        collectiblesController.resetCollectibleTransactionStatusByTransactionId(
          mockTransactionId,
          selectedAddress,
          chainId,
        ),
      ).toBe(true);

      expect(
        collectiblesController.state.allCollectibles[selectedAddress][
          chainId
        ][0].transactionId,
      ).toBeUndefined();
    });
  });
});
