import { createSandbox } from 'sinon';
import nock from 'nock';
import HttpProvider from 'ethjs-provider-http';
import PreferencesController from '../user/PreferencesController';
import { NetworkController, NetworksChainId } from '../network/NetworkController';
import { AssetsContractController } from './AssetsContractController';
import AssetsController from './AssetsController';

const KUDOSADDRESS = '0x2aea4add166ebf38b63d09a75de1a7b94aa24163';
const MAINNET_PROVIDER = new HttpProvider('https://mainnet.infura.io/v3/341eacb578dd44a1a049cbc5f6fd4035');
const OPEN_SEA_HOST = 'https://api.opensea.io';
const OPEN_SEA_PATH = '/api/v1';

describe('AssetsController', () => {
  let assetsController: AssetsController;
  let preferences: PreferencesController;
  let network: NetworkController;
  let assetsContract: AssetsContractController;
  const sandbox = createSandbox();

  beforeEach(() => {
    preferences = new PreferencesController();
    network = new NetworkController();
    assetsContract = new AssetsContractController();
    assetsController = new AssetsController({
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      onNetworkStateChange: (listener) => network.subscribe(listener),
      getAssetName: assetsContract.getAssetName.bind(assetsContract),
      getAssetSymbol: assetsContract.getAssetSymbol.bind(assetsContract),
      getCollectibleTokenURI: assetsContract.getCollectibleTokenURI.bind(assetsContract),
    });

    nock(OPEN_SEA_HOST)
      .get(`${OPEN_SEA_PATH}/asset_contract/0xfoO`)
      .reply(200, {
        description: 'Description',
        image_url: 'url',
        name: 'Name',
        symbol: 'FOO',
        total_supply: 0,
      })
      .get(`${OPEN_SEA_PATH}/asset_contract/0xFOu`)
      .reply(200, {
        description: 'Description',
        image_url: 'url',
        name: 'Name',
        symbol: 'FOU',
        total_supply: 10,
      })
      .get(`${OPEN_SEA_PATH}/asset/0xfoO/1`)
      .reply(200, {
        description: 'Description',
        image_original_url: 'url',
        name: 'Name',
      })
      .get(`${OPEN_SEA_PATH}/asset/0x2aEa4Add166EBf38b63d09a75dE1a7b94Aa24163/1203`)
      .reply(200, {
        description: 'Kudos Description',
        image_original_url: 'Kudos url',
        name: 'Kudos Name',
      })
      .get(`${OPEN_SEA_PATH}/asset/0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab/798958393`)
      .replyWithError(new TypeError('Failed to fetch'))
      .get(`${OPEN_SEA_PATH}/asset_contract/0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab`)
      .replyWithError(new TypeError('Failed to fetch'))
      .get(`${OPEN_SEA_PATH}/asset_contract/0x2aEa4Add166EBf38b63d09a75dE1a7b94Aa24163`)
      .reply(200, {
        description: 'Kudos Description',
        image_url: 'Kudos url',
        name: 'Kudos',
        symbol: 'KDO',
        total_supply: 10,
      });

    nock('https://ipfs.gitcoin.co:443').get('/api/v0/cat/QmPmt6EAaioN78ECnW5oCL8v2YvVSpoBjLCjrXhhsAvoov').reply(200, {
      image: 'Kudos Image',
      name: 'Kudos Name',
    });
  });

  afterEach(() => {
    nock.cleanAll();
    sandbox.reset();
  });

  it('should set default state', () => {
    expect(assetsController.state).toStrictEqual({
      allCollectibleContracts: {},
      allCollectibles: {},
      allTokens: {},
      collectibleContracts: [],
      collectibles: [],
      ignoredCollectibles: [],
      ignoredTokens: [],
      suggestedAssets: [],
      tokens: [],
    });
  });

  it('should add token', async () => {
    await assetsController.addToken('foo', 'bar', 2);
    expect(assetsController.state.tokens[0]).toStrictEqual({
      address: '0xfoO',
      decimals: 2,
      symbol: 'bar',
    });
    await assetsController.addToken('foo', 'baz', 2);
    expect(assetsController.state.tokens[0]).toStrictEqual({
      address: '0xfoO',
      decimals: 2,
      symbol: 'baz',
    });
  });

  it('should add tokens', async () => {
    await assetsController.addTokens([
      { address: 'addressA', symbol: 'barA', decimals: 2 },
      { address: 'addressB', symbol: 'barB', decimals: 2 },
    ]);
    expect(assetsController.state.tokens[0]).toStrictEqual({
      address: '0xAdDRessA',
      decimals: 2,
      symbol: 'barA',
    });
    expect(assetsController.state.tokens[1]).toStrictEqual({
      address: '0xAddReSSB',
      decimals: 2,
      symbol: 'barB',
    });
    await assetsController.addTokens([
      { address: 'addressA', symbol: 'bazA', decimals: 2 },
      { address: 'addressB', symbol: 'bazB', decimals: 2 },
    ]);
    expect(assetsController.state.tokens[0]).toStrictEqual({
      address: '0xAdDRessA',
      decimals: 2,
      symbol: 'bazA',
    });
    expect(assetsController.state.tokens[1]).toStrictEqual({
      address: '0xAddReSSB',
      decimals: 2,
      symbol: 'bazB',
    });
  });

  it('should add token by selected address', async () => {
    const firstAddress = '0x123';
    const secondAddress = '0x321';

    preferences.update({ selectedAddress: firstAddress });
    await assetsController.addToken('foo', 'bar', 2);
    preferences.update({ selectedAddress: secondAddress });
    expect(assetsController.state.tokens).toHaveLength(0);
    preferences.update({ selectedAddress: firstAddress });
    expect(assetsController.state.tokens[0]).toStrictEqual({
      address: '0xfoO',
      decimals: 2,
      symbol: 'bar',
    });
  });

  it('should add token by provider type', async () => {
    const firstNetworkType = 'rinkeby';
    const secondNetworkType = 'ropsten';
    network.update({ provider: { type: firstNetworkType, chainId: NetworksChainId[firstNetworkType] } });
    await assetsController.addToken('foo', 'bar', 2);
    network.update({ provider: { type: secondNetworkType, chainId: NetworksChainId[secondNetworkType] } });
    expect(assetsController.state.tokens).toHaveLength(0);
    network.update({ provider: { type: firstNetworkType, chainId: NetworksChainId[firstNetworkType] } });
    expect(assetsController.state.tokens[0]).toStrictEqual({
      address: '0xfoO',
      decimals: 2,
      symbol: 'bar',
    });
  });

  it('should remove token', async () => {
    await assetsController.addToken('foo', 'bar', 2);
    assetsController.removeToken('0xfoO');
    expect(assetsController.state.tokens).toHaveLength(0);
  });

  it('should remove token by selected address', async () => {
    const firstAddress = '0x123';
    const secondAddress = '0x321';
    preferences.update({ selectedAddress: firstAddress });
    await assetsController.addToken('fou', 'baz', 2);
    preferences.update({ selectedAddress: secondAddress });
    await assetsController.addToken('foo', 'bar', 2);
    assetsController.removeToken('0xfoO');
    expect(assetsController.state.tokens).toHaveLength(0);
    preferences.update({ selectedAddress: firstAddress });
    expect(assetsController.state.tokens[0]).toStrictEqual({
      address: '0xFOu',
      decimals: 2,
      symbol: 'baz',
    });
  });

  it('should remove token by provider type', async () => {
    const firstNetworkType = 'rinkeby';
    const secondNetworkType = 'ropsten';
    network.update({ provider: { type: firstNetworkType, chainId: NetworksChainId[firstNetworkType] } });
    await assetsController.addToken('fou', 'baz', 2);
    network.update({ provider: { type: secondNetworkType, chainId: NetworksChainId[secondNetworkType] } });
    await assetsController.addToken('foo', 'bar', 2);
    assetsController.removeToken('0xfoO');
    expect(assetsController.state.tokens).toHaveLength(0);
    network.update({ provider: { type: firstNetworkType, chainId: NetworksChainId[firstNetworkType] } });
    expect(assetsController.state.tokens[0]).toStrictEqual({
      address: '0xFOu',
      decimals: 2,
      symbol: 'baz',
    });
  });

  it('should add collectible and collectible contract', async () => {
    await assetsController.addCollectible('foo', 1, { name: 'name', image: 'image', description: 'description' });
    expect(assetsController.state.collectibles[0]).toStrictEqual({
      address: '0xfoO',
      description: 'description',
      image: 'image',
      name: 'name',
      tokenId: 1,
    });
    expect(assetsController.state.collectibleContracts[0]).toStrictEqual({
      address: '0xfoO',
      description: 'Description',
      logo: 'url',
      name: 'Name',
      symbol: 'FOO',
      totalSupply: 0,
    });
  });

  it('should not duplicate collectible nor collectible contract if already added', async () => {
    await assetsController.addCollectible('foo', 1, { name: 'name', image: 'image', description: 'description' });
    await assetsController.addCollectible('foo', 1, { name: 'name', image: 'image', description: 'description' });
    expect(assetsController.state.collectibles).toHaveLength(1);
    expect(assetsController.state.collectibleContracts).toHaveLength(1);
  });

  it('should not add collectible contract if collectible contract already exists', async () => {
    await assetsController.addCollectible('foo', 1, { name: 'name', image: 'image', description: 'description' });
    await assetsController.addCollectible('foo', 2, { name: 'name', image: 'image', description: 'description' });
    expect(assetsController.state.collectibles).toHaveLength(2);
    expect(assetsController.state.collectibleContracts).toHaveLength(1);
  });

  it('should add collectible and get information from OpenSea', async () => {
    await assetsController.addCollectible('foo', 1);
    expect(assetsController.state.collectibles[0]).toStrictEqual({
      address: '0xfoO',
      description: 'Description',
      image: 'url',
      name: 'Name',
      tokenId: 1,
    });
  });

  it('should add collectible and get collectible contract information from contract', async () => {
    assetsContract.configure({ provider: MAINNET_PROVIDER });
    sandbox.stub(assetsController, 'getCollectibleContractInformationFromApi' as any).returns(undefined);
    sandbox.stub(assetsController, 'getCollectibleInformationFromApi' as any).returns(undefined);
    await assetsController.addCollectible(KUDOSADDRESS, 1203);
    expect(assetsController.state.collectibles[0]).toStrictEqual({
      address: '0x2aEa4Add166EBf38b63d09a75dE1a7b94Aa24163',
      description: undefined,
      image: 'Kudos Image',
      name: 'Kudos Name',
      tokenId: 1203,
    });
    expect(assetsController.state.collectibleContracts[0]).toStrictEqual({
      address: '0x2aEa4Add166EBf38b63d09a75dE1a7b94Aa24163',
      description: undefined,
      logo: undefined,
      name: 'KudosToken',
      symbol: 'KDO',
      totalSupply: undefined,
    });
  });

  it('should add collectible by selected address', async () => {
    const firstAddress = '0x123';
    const secondAddress = '0x321';
    sandbox
      .stub(assetsController, 'getCollectibleInformation' as any)
      .returns({ name: 'name', image: 'url', description: 'description' });
    preferences.update({ selectedAddress: firstAddress });
    await assetsController.addCollectible('foo', 1234);
    preferences.update({ selectedAddress: secondAddress });
    await assetsController.addCollectible('fou', 4321);
    preferences.update({ selectedAddress: firstAddress });
    expect(assetsController.state.collectibles[0]).toStrictEqual({
      address: '0xfoO',
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
      .stub(assetsController, 'getCollectibleInformation' as any)
      .returns({ name: 'name', image: 'url', description: 'description' });
    network.update({ provider: { type: firstNetworkType, chainId: NetworksChainId[firstNetworkType] } });
    await assetsController.addCollectible('foo', 1234);
    network.update({ provider: { type: secondNetworkType, chainId: NetworksChainId[secondNetworkType] } });
    expect(assetsController.state.collectibles).toHaveLength(0);
    network.update({ provider: { type: firstNetworkType, chainId: NetworksChainId[firstNetworkType] } });
    expect(assetsController.state.collectibles[0]).toStrictEqual({
      address: '0xfoO',
      description: 'description',
      image: 'url',
      name: 'name',
      tokenId: 1234,
    });
  });

  it('should not add collectibles with no contract information when auto detecting', async () => {
    await assetsController.addCollectible('0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab', 123, undefined, true);
    expect(assetsController.state.collectibles).toStrictEqual([]);
    expect(assetsController.state.collectibleContracts).toStrictEqual([]);
    await assetsController.addCollectible('0x2aEa4Add166EBf38b63d09a75dE1a7b94Aa24163', 1203, undefined, true);
    expect(assetsController.state.collectibles).toStrictEqual([
      {
        address: '0x2aEa4Add166EBf38b63d09a75dE1a7b94Aa24163',
        description: 'Kudos Description',
        image: 'Kudos url',
        name: 'Kudos Name',
        tokenId: 1203,
      },
    ]);
    expect(assetsController.state.collectibleContracts).toStrictEqual([
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
    await assetsController.addCollectible('foo', 1, { name: 'name', image: 'image', description: 'description' });
    assetsController.removeCollectible('0xfoO', 1);
    expect(assetsController.state.collectibles).toHaveLength(0);
    expect(assetsController.state.collectibleContracts).toHaveLength(0);
  });

  it('should not remove collectible contract if collectible still exists', async () => {
    await assetsController.addCollectible('foo', 1, { name: 'name', image: 'image', description: 'description' });
    await assetsController.addCollectible('foo', 2, { name: 'name', image: 'image', description: 'description' });
    assetsController.removeCollectible('0xfoO', 1);
    expect(assetsController.state.collectibles).toHaveLength(1);
    expect(assetsController.state.collectibleContracts).toHaveLength(1);
  });

  it('should remove collectible by selected address', async () => {
    sandbox
      .stub(assetsController, 'getCollectibleInformation' as any)
      .returns({ name: 'name', image: 'url', description: 'description' });
    const firstAddress = '0x123';
    const secondAddress = '0x321';
    preferences.update({ selectedAddress: firstAddress });
    await assetsController.addCollectible('fou', 4321);
    preferences.update({ selectedAddress: secondAddress });
    await assetsController.addCollectible('foo', 1234);
    assetsController.removeCollectible('0xfoO', 1234);
    expect(assetsController.state.collectibles).toHaveLength(0);
    preferences.update({ selectedAddress: firstAddress });
    expect(assetsController.state.collectibles[0]).toStrictEqual({
      address: '0xFOu',
      description: 'description',
      image: 'url',
      name: 'name',
      tokenId: 4321,
    });
  });

  it('should remove collectible by provider type', async () => {
    sandbox
      .stub(assetsController, 'getCollectibleInformation' as any)
      .returns({ name: 'name', image: 'url', description: 'description' });
    const firstNetworkType = 'rinkeby';
    const secondNetworkType = 'ropsten';
    network.update({ provider: { type: firstNetworkType, chainId: NetworksChainId[firstNetworkType] } });
    await assetsController.addCollectible('fou', 4321);
    network.update({ provider: { type: secondNetworkType, chainId: NetworksChainId[secondNetworkType] } });
    await assetsController.addCollectible('foo', 1234);
    assetsController.removeToken('0xfoO');
    assetsController.removeCollectible('0xfoO', 1234);
    expect(assetsController.state.collectibles).toHaveLength(0);
    network.update({ provider: { type: firstNetworkType, chainId: NetworksChainId[firstNetworkType] } });
    expect(assetsController.state.collectibles[0]).toStrictEqual({
      address: '0xFOu',
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
    expect(preferences.state.selectedAddress).toEqual(address);
    network.update({ provider: { type: networkType, chainId: NetworksChainId[networkType] } });
    expect(network.state.provider.type).toEqual(networkType);
  });

  it('should add a valid suggested asset via watchAsset', async () => {
    await assetsController.watchAsset(
      {
        address: '0xe9f786dfdd9ae4d57e830acb52296837765f0e5b',
        decimals: 18,
        symbol: 'TKN',
      },
      'ERC20',
    );
    expect(assetsController.state.suggestedAssets[0].asset.address).toBe('0xe9f786dfdd9ae4d57e830acb52296837765f0e5b');
    expect(assetsController.state.suggestedAssets[0].status).toBe('pending');
  });

  it('should fail an invalid type suggested asset via watchAsset', async () => {
    await new Promise(async (resolve) => {
      await assetsController
        .watchAsset(
          {
            address: '0xe9f786dfdd9ae4d57e830acb52296837765f0e5b',
            decimals: 18,
            symbol: 'TKN',
          },
          'ERC721',
        )
        .catch((error) => {
          expect(error.message).toContain('Asset of type ERC721 not supported');
          resolve('');
        });
    });
  });

  it('should reject a valid suggested asset via watchAsset', async () => {
    const { result, suggestedAssetMeta } = await assetsController.watchAsset(
      {
        address: '0xe9f786dfdd9ae4d57e830acb52296837765f0e5b',
        decimals: 18,
        symbol: 'TKN',
      },
      'ERC20',
    );
    assetsController.rejectWatchAsset('foo');
    assetsController.rejectWatchAsset(suggestedAssetMeta.id);
    assetsController.hub.once(`${suggestedAssetMeta.id}:finished`, () => {
      expect(assetsController.state.suggestedAssets).toHaveLength(0);
    });
    await expect(result).rejects.toThrow('User rejected to watch the asset.');
  });

  it('should accept a valid suggested asset via watchAsset', async () => {
    const { result, suggestedAssetMeta } = await assetsController.watchAsset(
      {
        address: '0xe9f786dfdd9ae4d57e830acb52296837765f0e5b',
        decimals: 18,
        symbol: 'TKN',
      },
      'ERC20',
    );
    await assetsController.acceptWatchAsset(suggestedAssetMeta.id);
    const res = await result;
    expect(assetsController.state.suggestedAssets).toHaveLength(0);
    expect(res).toBe('0xe9f786dfdd9ae4d57e830acb52296837765f0e5b');
  });

  it('should fail a valid suggested asset via watchAsset with wrong type', async () => {
    const { result, suggestedAssetMeta } = await assetsController.watchAsset(
      {
        address: '0xe9f786dfdd9be4d57e830acb52296837765f0e5b',
        decimals: 18,
        symbol: 'TKN',
      },
      'ERC20',
    );
    const { suggestedAssets } = assetsController.state;
    const index = suggestedAssets.findIndex(({ id }) => suggestedAssetMeta.id === id);
    const newSuggestedAssetMeta = suggestedAssets[index];
    suggestedAssetMeta.type = 'ERC721';
    assetsController.update({ suggestedAssets: [...suggestedAssets, newSuggestedAssetMeta] });
    await assetsController.acceptWatchAsset(suggestedAssetMeta.id);
    await expect(result).rejects.toThrow('Asset of type ERC721 not supported');
  });

  it('should not add duplicate tokens to the ignoredToken list', async () => {
    await assetsController.addToken('0xfoO', 'bar', 2);
    await assetsController.addToken('0xfAA', 'bar', 3);
    expect(assetsController.state.ignoredTokens).toHaveLength(0);
    expect(assetsController.state.tokens).toHaveLength(2);
    assetsController.removeAndIgnoreToken('0xfoO');
    expect(assetsController.state.tokens).toHaveLength(1);
    expect(assetsController.state.ignoredTokens).toHaveLength(1);
    await assetsController.addToken('0xfoO', 'bar', 2);
    expect(assetsController.state.ignoredTokens).toHaveLength(1);
    assetsController.removeAndIgnoreToken('0xfoO');
    expect(assetsController.state.ignoredTokens).toHaveLength(1);
  });

  it('should not add duplicate collectibles to the ignoredCollectibles list', async () => {
    await assetsController.addCollectible('foo', 1, { name: 'name', image: 'image', description: 'description' });
    await assetsController.addCollectible('foo', 2, { name: 'name', image: 'image', description: 'description' });

    expect(assetsController.state.collectibles).toHaveLength(2);
    expect(assetsController.state.ignoredCollectibles).toHaveLength(0);

    assetsController.removeAndIgnoreCollectible('0xfoO', 1);
    expect(assetsController.state.collectibles).toHaveLength(1);
    expect(assetsController.state.ignoredCollectibles).toHaveLength(1);

    await assetsController.addCollectible('foo', 1, { name: 'name', image: 'image', description: 'description' });
    expect(assetsController.state.collectibles).toHaveLength(2);
    expect(assetsController.state.ignoredCollectibles).toHaveLength(1);

    assetsController.removeAndIgnoreCollectible('0xfoO', 1);
    expect(assetsController.state.collectibles).toHaveLength(1);
    expect(assetsController.state.ignoredCollectibles).toHaveLength(1);
  });

  it('should be able to clear the ignoredToken list', async () => {
    await assetsController.addToken('0xfoO', 'bar', 2);
    expect(assetsController.state.ignoredTokens).toHaveLength(0);
    assetsController.removeAndIgnoreToken('0xfoO');
    expect(assetsController.state.tokens).toHaveLength(0);
    expect(assetsController.state.ignoredTokens).toHaveLength(1);
    assetsController.clearIgnoredTokens();
    expect(assetsController.state.ignoredTokens).toHaveLength(0);
  });

  it('should be able to clear the ignoredCollectibles list', async () => {
    await assetsController.addCollectible('0xfoO', 1, { name: 'name', image: 'image', description: 'description' });

    expect(assetsController.state.collectibles).toHaveLength(1);
    expect(assetsController.state.ignoredCollectibles).toHaveLength(0);

    assetsController.removeAndIgnoreCollectible('0xfoO', 1);
    expect(assetsController.state.collectibles).toHaveLength(0);
    expect(assetsController.state.ignoredCollectibles).toHaveLength(1);

    assetsController.clearIgnoredCollectibles();
    expect(assetsController.state.ignoredCollectibles).toHaveLength(0);
  });

  it('should set api key correctly', () => {
    assetsController.setApiKey('new-api-key');
    expect(assetsController.openSeaApiKey).toBe('new-api-key');
  });
});
