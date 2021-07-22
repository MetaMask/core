import { createSandbox } from 'sinon';
import nock from 'nock';
import HttpProvider from 'ethjs-provider-http';
import { PreferencesController } from '../user/PreferencesController';
import {
  NetworkController,
  NetworksChainId,
} from '../network/NetworkController';
import { AssetsContractController } from './AssetsContractController';
import { CollectiblesController } from './CollectiblesController';

const KUDOSADDRESS = '0x2aea4add166ebf38b63d09a75de1a7b94aa24163';
const MAINNET_PROVIDER = new HttpProvider(
  'https://mainnet.infura.io/v3/341eacb578dd44a1a049cbc5f6fd4035',
);
const OPEN_SEA_HOST = 'https://api.opensea.io';
const OPEN_SEA_PATH = '/api/v1';

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
    });

    nock(OPEN_SEA_HOST)
      .get(`${OPEN_SEA_PATH}/asset_contract/0x01`)
      .reply(200, {
        description: 'Description',
        image_url: 'url',
        name: 'Name',
        symbol: 'FOO',
        total_supply: 0,
      })
      .get(`${OPEN_SEA_PATH}/asset_contract/0x02`)
      .reply(200, {
        description: 'Description',
        image_url: 'url',
        name: 'Name',
        symbol: 'FOU',
        total_supply: 10,
      })
      .get(`${OPEN_SEA_PATH}/asset/0x01/1`)
      .reply(200, {
        description: 'Description',
        image_original_url: 'url',
        name: 'Name',
      })
      .get(
        `${OPEN_SEA_PATH}/asset/0x2aEa4Add166EBf38b63d09a75dE1a7b94Aa24163/1203`,
      )
      .reply(200, {
        description: 'Kudos Description',
        image_original_url: 'Kudos url',
        name: 'Kudos Name',
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
        image_url: 'Kudos url',
        name: 'Kudos',
        symbol: 'KDO',
        total_supply: 10,
      });

    nock('https://ipfs.gitcoin.co:443')
      .get('/api/v0/cat/QmPmt6EAaioN78ECnW5oCL8v2YvVSpoBjLCjrXhhsAvoov')
      .reply(200, {
        image: 'Kudos Image',
        name: 'Kudos Name',
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
      collectibleContracts: [],
      collectibles: [],
      ignoredCollectibles: [],
    });
  });

  it('should add collectible and collectible contract', async () => {
    await collectiblesController.addCollectible('0x01', 1, {
      name: 'name',
      image: 'image',
      description: 'description',
    });
    expect(collectiblesController.state.collectibles[0]).toStrictEqual({
      address: '0x01',
      description: 'description',
      image: 'image',
      name: 'name',
      tokenId: 1,
    });
    expect(collectiblesController.state.collectibleContracts[0]).toStrictEqual({
      address: '0x01',
      description: 'Description',
      logo: 'url',
      name: 'Name',
      symbol: 'FOO',
      totalSupply: 0,
    });
  });

  it('should update collectible if image is different', async () => {
    await collectiblesController.addCollectible('0x01', 1, {
      name: 'name',
      image: 'image',
      description: 'description',
    });
    expect(collectiblesController.state.collectibles[0]).toStrictEqual({
      address: '0x01',
      description: 'description',
      image: 'image',
      name: 'name',
      tokenId: 1,
    });
    await collectiblesController.addCollectible('0x01', 1, {
      name: 'name',
      image: 'image-updated',
      description: 'description',
    });
    expect(collectiblesController.state.collectibles[0]).toStrictEqual({
      address: '0x01',
      description: 'description',
      image: 'image-updated',
      name: 'name',
      tokenId: 1,
    });
  });

  it('should not duplicate collectible nor collectible contract if already added', async () => {
    await collectiblesController.addCollectible('0x01', 1, {
      name: 'name',
      image: 'image',
      description: 'description',
    });
    await collectiblesController.addCollectible('0x01', 1, {
      name: 'name',
      image: 'image',
      description: 'description',
    });
    expect(collectiblesController.state.collectibles).toHaveLength(1);
    expect(collectiblesController.state.collectibleContracts).toHaveLength(1);
  });

  it('should not add collectible contract if collectible contract already exists', async () => {
    await collectiblesController.addCollectible('0x01', 1, {
      name: 'name',
      image: 'image',
      description: 'description',
    });
    await collectiblesController.addCollectible('0x01', 2, {
      name: 'name',
      image: 'image',
      description: 'description',
    });
    expect(collectiblesController.state.collectibles).toHaveLength(2);
    expect(collectiblesController.state.collectibleContracts).toHaveLength(1);
  });

  it('should add collectible and get information from OpenSea', async () => {
    await collectiblesController.addCollectible('0x01', 1);
    expect(collectiblesController.state.collectibles[0]).toStrictEqual({
      address: '0x01',
      description: 'Description',
      imageOriginal: 'url',
      name: 'Name',
      tokenId: 1,
    });
  });

  it('should add collectible and get collectible contract information from contract', async () => {
    assetsContract.configure({ provider: MAINNET_PROVIDER });
    sandbox
      .stub(
        collectiblesController,
        'getCollectibleContractInformationFromApi' as any,
      )
      .returns(undefined);
    sandbox
      .stub(collectiblesController, 'getCollectibleInformationFromApi' as any)
      .returns(undefined);
    await collectiblesController.addCollectible(KUDOSADDRESS, 1203);
    expect(collectiblesController.state.collectibles[0]).toStrictEqual({
      address: '0x2aEa4Add166EBf38b63d09a75dE1a7b94Aa24163',
      image: 'Kudos Image',
      name: 'Kudos Name',
      tokenId: 1203,
    });
    expect(collectiblesController.state.collectibleContracts[0]).toStrictEqual({
      address: '0x2aEa4Add166EBf38b63d09a75dE1a7b94Aa24163',
      name: 'KudosToken',
      symbol: 'KDO',
    });
  });

  it('should add collectible by selected address', async () => {
    const firstAddress = '0x123';
    const secondAddress = '0x321';
    sandbox
      .stub(collectiblesController, 'getCollectibleInformation' as any)
      .returns({ name: 'name', image: 'url', description: 'description' });
    preferences.update({ selectedAddress: firstAddress });
    await collectiblesController.addCollectible('0x01', 1234);
    preferences.update({ selectedAddress: secondAddress });
    await collectiblesController.addCollectible('0x02', 4321);
    preferences.update({ selectedAddress: firstAddress });
    expect(collectiblesController.state.collectibles[0]).toStrictEqual({
      address: '0x01',
      description: 'description',
      image: 'url',
      name: 'name',
      tokenId: 1234,
    });
  });

  it('should add collectible by provider type', async () => {
    const firstNetworkType = 'rinkeby';
    const secondNetworkType = 'ropsten';
    sandbox
      .stub(collectiblesController, 'getCollectibleInformation' as any)
      .returns({ name: 'name', image: 'url', description: 'description' });
    network.update({
      provider: {
        type: firstNetworkType,
        chainId: NetworksChainId[firstNetworkType],
      },
    });
    await collectiblesController.addCollectible('0x01', 1234);
    network.update({
      provider: {
        type: secondNetworkType,
        chainId: NetworksChainId[secondNetworkType],
      },
    });
    expect(collectiblesController.state.collectibles).toHaveLength(0);
    network.update({
      provider: {
        type: firstNetworkType,
        chainId: NetworksChainId[firstNetworkType],
      },
    });
    expect(collectiblesController.state.collectibles[0]).toStrictEqual({
      address: '0x01',
      description: 'description',
      image: 'url',
      name: 'name',
      tokenId: 1234,
    });
  });

  it('should not add collectibles with no contract information when auto detecting', async () => {
    await collectiblesController.addCollectible(
      '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab',
      123,
      undefined,
      true,
    );
    expect(collectiblesController.state.collectibles).toStrictEqual([]);
    expect(collectiblesController.state.collectibleContracts).toStrictEqual([]);
    await collectiblesController.addCollectible(
      '0x2aEa4Add166EBf38b63d09a75dE1a7b94Aa24163',
      1203,
      undefined,
      true,
    );
    expect(collectiblesController.state.collectibles).toStrictEqual([
      {
        address: '0x2aEa4Add166EBf38b63d09a75dE1a7b94Aa24163',
        description: 'Kudos Description',
        imageOriginal: 'Kudos url',
        name: 'Kudos Name',
        tokenId: 1203,
      },
    ]);
    expect(collectiblesController.state.collectibleContracts).toStrictEqual([
      {
        address: '0x2aEa4Add166EBf38b63d09a75dE1a7b94Aa24163',
        description: 'Kudos Description',
        logo: 'Kudos url',
        name: 'Kudos',
        symbol: 'KDO',
        totalSupply: 10,
      },
    ]);
  });

  it('should remove collectible and collectible contract', async () => {
    await collectiblesController.addCollectible('0x01', 1, {
      name: 'name',
      image: 'image',
      description: 'description',
    });
    collectiblesController.removeCollectible('0x01', 1);
    expect(collectiblesController.state.collectibles).toHaveLength(0);
    expect(collectiblesController.state.collectibleContracts).toHaveLength(0);
  });

  it('should not remove collectible contract if collectible still exists', async () => {
    await collectiblesController.addCollectible('0x01', 1, {
      name: 'name',
      image: 'image',
      description: 'description',
    });
    await collectiblesController.addCollectible('0x01', 2, {
      name: 'name',
      image: 'image',
      description: 'description',
    });
    collectiblesController.removeCollectible('0x01', 1);
    expect(collectiblesController.state.collectibles).toHaveLength(1);
    expect(collectiblesController.state.collectibleContracts).toHaveLength(1);
  });

  it('should remove collectible by selected address', async () => {
    sandbox
      .stub(collectiblesController, 'getCollectibleInformation' as any)
      .returns({ name: 'name', image: 'url', description: 'description' });
    const firstAddress = '0x123';
    const secondAddress = '0x321';
    preferences.update({ selectedAddress: firstAddress });
    await collectiblesController.addCollectible('0x02', 4321);
    preferences.update({ selectedAddress: secondAddress });
    await collectiblesController.addCollectible('0x01', 1234);
    collectiblesController.removeCollectible('0x01', 1234);
    expect(collectiblesController.state.collectibles).toHaveLength(0);
    preferences.update({ selectedAddress: firstAddress });
    expect(collectiblesController.state.collectibles[0]).toStrictEqual({
      address: '0x02',
      description: 'description',
      image: 'url',
      name: 'name',
      tokenId: 4321,
    });
  });

  it('should remove collectible by provider type', async () => {
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
    await collectiblesController.addCollectible('0x02', 4321);
    network.update({
      provider: {
        type: secondNetworkType,
        chainId: NetworksChainId[secondNetworkType],
      },
    });
    await collectiblesController.addCollectible('0x01', 1234);
    // collectiblesController.removeToken('0x01');
    collectiblesController.removeCollectible('0x01', 1234);
    expect(collectiblesController.state.collectibles).toHaveLength(0);
    network.update({
      provider: {
        type: firstNetworkType,
        chainId: NetworksChainId[firstNetworkType],
      },
    });
    expect(collectiblesController.state.collectibles[0]).toStrictEqual({
      address: '0x02',
      description: 'description',
      image: 'url',
      name: 'name',
      tokenId: 4321,
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

  it('should not add duplicate collectibles to the ignoredCollectibles list', async () => {
    await collectiblesController.addCollectible('0x01', 1, {
      name: 'name',
      image: 'image',
      description: 'description',
    });
    await collectiblesController.addCollectible('0x01', 2, {
      name: 'name',
      image: 'image',
      description: 'description',
    });

    expect(collectiblesController.state.collectibles).toHaveLength(2);
    expect(collectiblesController.state.ignoredCollectibles).toHaveLength(0);

    collectiblesController.removeAndIgnoreCollectible('0x01', 1);
    expect(collectiblesController.state.collectibles).toHaveLength(1);
    expect(collectiblesController.state.ignoredCollectibles).toHaveLength(1);

    await collectiblesController.addCollectible('0x01', 1, {
      name: 'name',
      image: 'image',
      description: 'description',
    });
    expect(collectiblesController.state.collectibles).toHaveLength(2);
    expect(collectiblesController.state.ignoredCollectibles).toHaveLength(1);

    collectiblesController.removeAndIgnoreCollectible('0x01', 1);
    expect(collectiblesController.state.collectibles).toHaveLength(1);
    expect(collectiblesController.state.ignoredCollectibles).toHaveLength(1);
  });

  it('should be able to clear the ignoredCollectibles list', async () => {
    await collectiblesController.addCollectible('0x02', 1, {
      name: 'name',
      image: 'image',
      description: 'description',
    });

    expect(collectiblesController.state.collectibles).toHaveLength(1);
    expect(collectiblesController.state.ignoredCollectibles).toHaveLength(0);

    collectiblesController.removeAndIgnoreCollectible('0x02', 1);
    expect(collectiblesController.state.collectibles).toHaveLength(0);
    expect(collectiblesController.state.ignoredCollectibles).toHaveLength(1);

    collectiblesController.clearIgnoredCollectibles();
    expect(collectiblesController.state.ignoredCollectibles).toHaveLength(0);
  });

  it('should set api key correctly', () => {
    collectiblesController.setApiKey('new-api-key');
    expect(collectiblesController.openSeaApiKey).toBe('new-api-key');
  });
});
