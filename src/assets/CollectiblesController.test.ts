import { createSandbox } from 'sinon';
import nock from 'nock';
import HttpProvider from 'ethjs-provider-http';
import { PreferencesController } from '../user/PreferencesController';
import {
  NetworkController,
  NetworksChainId,
} from '../network/NetworkController';
import { getFormattedIpfsUrl } from '../util';
import { AssetsContractController } from './AssetsContractController';
import { CollectiblesController } from './CollectiblesController';

const CRYPTOPUNK_ADDRESS = '0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB';
const ERC721_KUDOSADDRESS = '0x2aEa4Add166EBf38b63d09a75dE1a7b94Aa24163';
const ERC721_COLLECTIBLE_ADDRESS = '0x60f80121c31a0d46b5279700f9df786054aa5ee5';
const ERC721_COLLECTIBLE_ID = '1144858';
const ERC1155_COLLECTIBLE_ADDRESS =
  '0x495f947276749Ce646f68AC8c248420045cb7b5e';
const ERC1155_COLLECTIBLE_ID =
  '40815311521795738946686668571398122012172359753720345430028676522525371400193';
const ERC721_DEPRESSIONIST_ADDRESS =
  '0x18E8E76aeB9E2d9FA2A2b88DD9CF3C8ED45c3660';
const ERC721_DEPRESSIONIST_ID = '36';
const OWNER_ADDRESS = '0x5a3CA5cD63807Ce5e4d7841AB32Ce6B6d9BbBa2D';
const MAINNET_PROVIDER = new HttpProvider(
  'https://mainnet.infura.io/v3/341eacb578dd44a1a049cbc5f6fd4035',
);

const OPEN_SEA_HOST = 'https://api.opensea.io';
const OPEN_SEA_PATH = '/api/v1';

const CLOUDFARE_PATH = 'https://cloudflare-ipfs.com/ipfs/';

const DEPRESSIONIST_CID_V1 =
  'bafybeidf7aw7bmnmewwj4ayq3she2jfk5jrdpp24aaucf6fddzb3cfhrvm';

const DEPRESSIONIST_CLOUDFLARE_IPFS_SUBDOMAIN_PATH = getFormattedIpfsUrl(
  CLOUDFARE_PATH,
  `ipfs://${DEPRESSIONIST_CID_V1}`,
  true,
);

describe('CollectiblesController', () => {
  let collectiblesController: CollectiblesController;
  let preferences: PreferencesController;
  let network: NetworkController;
  let assetsContract: AssetsContractController;
  const sandbox = createSandbox();

  beforeEach(() => {
    preferences = new PreferencesController();
    network = new NetworkController();
    assetsContract = new AssetsContractController();
    collectiblesController = new CollectiblesController({
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      onNetworkStateChange: (listener) => network.subscribe(listener),
      getAssetName: assetsContract.getAssetName.bind(assetsContract),
      getAssetSymbol: assetsContract.getAssetSymbol.bind(assetsContract),
      getCollectibleTokenURI: assetsContract.getCollectibleTokenURI.bind(
        assetsContract,
      ),
      getOwnerOf: assetsContract.getOwnerOf.bind(assetsContract),
      balanceOfERC1155Collectible: assetsContract.balanceOfERC1155Collectible.bind(
        assetsContract,
      ),
      uriERC1155Collectible: assetsContract.uriERC1155Collectible.bind(
        assetsContract,
      ),
    });

    preferences.update({
      selectedAddress: OWNER_ADDRESS,
      openSeaEnabled: true,
    });

    sandbox
      .stub(collectiblesController, 'isCollectibleOwner' as any)
      .returns(true);

    nock(OPEN_SEA_HOST)
      .get(`${OPEN_SEA_PATH}/asset_contract/0x01`)
      .reply(200, {
        description: 'Description',
        symbol: 'FOO',
        total_supply: 0,
        collection: {
          name: 'Name',
          image_url: 'url',
        },
      })
      .get(`${OPEN_SEA_PATH}/asset_contract/0x02`)
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
      .get(`${OPEN_SEA_PATH}/asset/0x01/1`)
      .reply(200, {
        description: 'Description',
        image_original_url: 'url',
        image_url: 'url',
        name: 'Name',
        asset_contract: {
          schema_name: 'ERC1155',
        },
      })
      .get(
        `${OPEN_SEA_PATH}/asset/0x2aEa4Add166EBf38b63d09a75dE1a7b94Aa24163/1203`,
      )
      .reply(200, {
        image_original_url: 'Kudos url',
        name: 'Kudos Name',
        description: 'Kudos Description',
        asset_contract: {
          schema_name: 'ERC721',
        },
      })
      .get(
        `${OPEN_SEA_PATH}/asset/0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab/798958393`,
      )
      .replyWithError(new TypeError('Failed to fetch'))
      .get(
        `${OPEN_SEA_PATH}/asset_contract/0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab`,
      )
      .replyWithError(new TypeError('Failed to fetch'))
      .get(
        `${OPEN_SEA_PATH}/asset_contract/0x2aEa4Add166EBf38b63d09a75dE1a7b94Aa24163`,
      )
      .reply(200, {
        description: 'Kudos Description',
        symbol: 'KDO',
        total_supply: 10,
        collection: {
          name: 'Kudos',
          image_url: 'Kudos url',
        },
      });

    nock('https://ipfs.gitcoin.co:443')
      .get('/api/v0/cat/QmPmt6EAaioN78ECnW5oCL8v2YvVSpoBjLCjrXhhsAvoov')
      .reply(200, {
        image: 'Kudos Image (from uri)',
        name: 'Kudos Name (from uri)',
        description: 'Kudos Description (from uri)',
      });

    nock(OPEN_SEA_HOST)
      .get(
        '/api/v1/metadata/0x495f947276749Ce646f68AC8c248420045cb7b5e/0x5a3ca5cd63807ce5e4d7841ab32ce6b6d9bbba2d000000000000010000000001',
      )
      .reply(200, {
        name: 'name (from contract uri)',
        description: null,
        external_link: null,
        image: 'image (from contract uri)',
        animation_url: null,
      });

    nock(OPEN_SEA_HOST)
      .get(
        '/api/v1/asset/0x495f947276749Ce646f68AC8c248420045cb7b5e/40815311521795738946686668571398122012172359753720345430028676522525371400193',
      )
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
    sandbox.reset();
  });

  it('should set default state', () => {
    expect(collectiblesController.state).toStrictEqual({
      allCollectibleContracts: {},
      allCollectibles: {},
      ignoredCollectibles: [],
    });
  });

  describe('addCollectible', () => {
    it('should add collectible and collectible contract', async () => {
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
    });

    it('should add collectible by selected address', async () => {
      const { chainId } = collectiblesController.config;
      const firstAddress = '0x123';
      const secondAddress = '0x321';

      sandbox
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
      });
    });

    it('should update collectible if image is different', async () => {
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
      });
    });

    it('should not duplicate collectible nor collectible contract if already added', async () => {
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
    });

    it('should add collectible and get information from OpenSea', async () => {
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
      });
    });

    it('should add collectible erc1155 and get collectible contract information from contract', async () => {
      assetsContract.configure({ provider: MAINNET_PROVIDER });
      const { selectedAddress, chainId } = collectiblesController.config;

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
        image: 'image (from contract uri)',
        name: 'name (from contract uri)',
        description: 'description',
        tokenId:
          '40815311521795738946686668571398122012172359753720345430028676522525371400193',
        imageOriginal: 'image.uri',
        numberOfSales: 1,
        standard: 'ERC1155',
        favorite: false,
      });
    });

    it('should add collectible erc721 and get collectible contract information from contract and OpenSea', async () => {
      assetsContract.configure({ provider: MAINNET_PROVIDER });
      const { selectedAddress, chainId } = collectiblesController.config;
      sandbox
        .stub(
          collectiblesController,
          'getCollectibleContractInformationFromApi' as any,
        )
        .returns(undefined);

      await collectiblesController.addCollectible(ERC721_KUDOSADDRESS, '1203');
      expect(
        collectiblesController.state.allCollectibles[selectedAddress][
          chainId
        ][0],
      ).toStrictEqual({
        address: ERC721_KUDOSADDRESS,
        image: 'Kudos Image (from uri)',
        name: 'Kudos Name (from uri)',
        description: 'Kudos Description (from uri)',
        tokenId: '1203',
        imageOriginal: 'Kudos url',
        standard: 'ERC721',
        favorite: false,
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
    });

    it('should add collectible erc721 and get collectible contract information only from contract', async () => {
      assetsContract.configure({ provider: MAINNET_PROVIDER });
      const { selectedAddress, chainId } = collectiblesController.config;
      sandbox
        .stub(
          collectiblesController,
          'getCollectibleContractInformationFromApi' as any,
        )
        .returns(undefined);

      sandbox
        .stub(collectiblesController, 'getCollectibleInformationFromApi' as any)
        .returns(undefined);
      await collectiblesController.addCollectible(ERC721_KUDOSADDRESS, '1203');
      expect(
        collectiblesController.state.allCollectibles[selectedAddress][
          chainId
        ][0],
      ).toStrictEqual({
        address: ERC721_KUDOSADDRESS,
        image: 'Kudos Image (from uri)',
        name: 'Kudos Name (from uri)',
        description: 'Kudos Description (from uri)',
        tokenId: '1203',
        standard: 'ERC721',
        favorite: false,
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
    });

    it('should add collectible by provider type', async () => {
      const firstNetworkType = 'rinkeby';
      const secondNetworkType = 'ropsten';
      const { selectedAddress } = collectiblesController.config;
      sandbox
        .stub(collectiblesController, 'getCollectibleInformation' as any)
        .returns({ name: 'name', image: 'url', description: 'description' });

      network.update({
        provider: {
          type: firstNetworkType,
          chainId: NetworksChainId[firstNetworkType],
        },
      });
      await collectiblesController.addCollectible('0x01', '1234');
      network.update({
        provider: {
          type: secondNetworkType,
          chainId: NetworksChainId[secondNetworkType],
        },
      });

      network.update({
        provider: {
          type: firstNetworkType,
          chainId: NetworksChainId[firstNetworkType],
        },
      });

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
      });
    });

    it('should not add collectibles with no contract information when auto detecting', async () => {
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
        '1203',
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
          imageOriginal: 'Kudos url',
          name: 'Kudos Name',
          image: null,
          standard: 'ERC721',
          tokenId: '1203',
          favorite: false,
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
          logo: 'Kudos url',
          name: 'Kudos',
          symbol: 'KDO',
          totalSupply: 10,
        },
      ]);
    });

    it('should not add duplicate collectibles to the ignoredCollectibles list', async () => {
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
    });

    it('should add collectible with metadata hosted in IPFS', async () => {
      assetsContract.configure({ provider: MAINNET_PROVIDER });
      collectiblesController.configure({ ipfsGateway: CLOUDFARE_PATH });
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
      });
    });
  });

  describe('addCollectibleVerifyOwnership', () => {
    it('should verify ownership by selected address and add collectible', async () => {
      const firstAddress = '0x123';
      const secondAddress = '0x321';
      const { chainId } = collectiblesController.config;

      sandbox
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
      });
    });

    it('should throw an error if selected address is not owner of input collectible', async () => {
      sandbox.restore();
      sandbox
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
    });
  });

  describe('RemoveCollectible', () => {
    it('should remove collectible and collectible contract', async () => {
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
    });

    it('should not remove collectible contract if collectible still exists', async () => {
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
    });

    it('should remove collectible by selected address', async () => {
      const { chainId } = collectiblesController.config;
      sandbox
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
      });
    });

    it('should remove collectible by provider type', async () => {
      const { selectedAddress } = collectiblesController.config;

      sandbox
        .stub(collectiblesController, 'getCollectibleInformation' as any)
        .returns({ name: 'name', image: 'url', description: 'description' });
      const firstNetworkType = 'rinkeby';
      const secondNetworkType = 'ropsten';
      network.update({
        provider: {
          type: firstNetworkType,
          chainId: NetworksChainId[firstNetworkType],
        },
      });
      await collectiblesController.addCollectible('0x02', '4321');
      network.update({
        provider: {
          type: secondNetworkType,
          chainId: NetworksChainId[secondNetworkType],
        },
      });
      await collectiblesController.addCollectible('0x01', '1234');
      // collectiblesController.removeToken('0x01');
      collectiblesController.removeCollectible('0x01', '1234');
      expect(
        collectiblesController.state.allCollectibles[selectedAddress][
          NetworksChainId[secondNetworkType]
        ],
      ).toHaveLength(0);

      network.update({
        provider: {
          type: firstNetworkType,
          chainId: NetworksChainId[firstNetworkType],
        },
      });

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
      });
    });
  });

  it('should subscribe to new sibling preference controllers', async () => {
    const networkType = 'rinkeby';
    const address = '0x123';
    preferences.update({ selectedAddress: address });
    expect(preferences.state.selectedAddress).toStrictEqual(address);
    network.update({
      provider: { type: networkType, chainId: NetworksChainId[networkType] },
    });
    expect(network.state.provider.type).toStrictEqual(networkType);
  });

  it('should be able to clear the ignoredCollectibles list', async () => {
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
  });

  it('should set api key correctly', () => {
    collectiblesController.setApiKey('new-api-key');
    expect(collectiblesController.openSeaApiKey).toBe('new-api-key');
  });

  describe('isCollectibleOwner', () => {
    it('should verify the ownership of an ERC-721 collectible with the correct owner address', async () => {
      assetsContract.configure({ provider: MAINNET_PROVIDER });
      const isOwner = await collectiblesController.isCollectibleOwner(
        OWNER_ADDRESS,
        ERC721_COLLECTIBLE_ADDRESS,
        String(ERC721_COLLECTIBLE_ID),
      );
      expect(isOwner).toBe(true);
    });

    it('should not verify the ownership of an ERC-721 collectible with the wrong owner address', async () => {
      sandbox.restore();
      assetsContract.configure({ provider: MAINNET_PROVIDER });
      const isOwner = await collectiblesController.isCollectibleOwner(
        '0x0000000000000000000000000000000000000000',
        ERC721_COLLECTIBLE_ADDRESS,
        String(ERC721_COLLECTIBLE_ID),
      );
      expect(isOwner).toBe(false);
    });

    it('should verify the ownership of an ERC-1155 collectible with the correct owner address', async () => {
      assetsContract.configure({ provider: MAINNET_PROVIDER });
      const isOwner = await collectiblesController.isCollectibleOwner(
        OWNER_ADDRESS,
        ERC1155_COLLECTIBLE_ADDRESS,
        ERC1155_COLLECTIBLE_ID,
      );
      expect(isOwner).toBe(true);
    });

    it('should not verify the ownership of an ERC-1155 collectible with the wrong owner address', async () => {
      sandbox.restore();
      assetsContract.configure({ provider: MAINNET_PROVIDER });
      const isOwner = await collectiblesController.isCollectibleOwner(
        '0x0000000000000000000000000000000000000000',
        ERC1155_COLLECTIBLE_ADDRESS,
        ERC1155_COLLECTIBLE_ID,
      );
      expect(isOwner).toBe(false);
    });

    it('should throw an error for an unsupported standard', async () => {
      sandbox.restore();
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
    });
  });

  describe('updateCollectibleFavoriteStatus', () => {
    it('should set collectible as favorite', async () => {
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
    });

    it('should set collectible as favorite and then unset it', async () => {
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
    });

    it('should keep the favorite status as true after updating metadata', async () => {
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
        }),
      );

      expect(
        collectiblesController.state.allCollectibles[selectedAddress][chainId],
      ).toHaveLength(1);
    });

    it('should keep the favorite status as false after updating metadata', async () => {
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
        }),
      );

      expect(
        collectiblesController.state.allCollectibles[selectedAddress][chainId],
      ).toHaveLength(1);
    });
  });
});
