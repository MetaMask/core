import { createSandbox } from 'sinon';
import { PreferencesController } from '../user/PreferencesController';
import {
  NetworkController,
  NetworksChainId,
} from '../network/NetworkController';
import { TokensController } from './TokensController';

describe('TokensController', () => {
  let tokensController: TokensController;
  let preferences: PreferencesController;
  let network: NetworkController;
  const sandbox = createSandbox();

  beforeEach(() => {
    preferences = new PreferencesController();
    network = new NetworkController();
    tokensController = new TokensController({
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      onNetworkStateChange: (listener) => network.subscribe(listener),
    });
  });

  afterEach(() => {
    sandbox.reset();
  });

  it('should set default state', () => {
    expect(tokensController.state).toStrictEqual({
      allTokens: {},
      ignoredTokens: [],
      suggestedAssets: [],
      tokens: [],
    });
  });

  it('should add token', async () => {
    await tokensController.addToken('0x01', 'bar', 2);
    expect(tokensController.state.tokens[0]).toStrictEqual({
      address: '0x01',
      decimals: 2,
      image: undefined,
      symbol: 'bar',
    });
    await tokensController.addToken('0x01', 'baz', 2);
    expect(tokensController.state.tokens[0]).toStrictEqual({
      address: '0x01',
      decimals: 2,
      image: undefined,
      symbol: 'baz',
    });
  });

  it('should add tokens', async () => {
    await tokensController.addTokens([
      { address: '0x01', symbol: 'barA', decimals: 2 },
      { address: '0x02', symbol: 'barB', decimals: 2 },
    ]);
    expect(tokensController.state.tokens[0]).toStrictEqual({
      address: '0x01',
      decimals: 2,
      image: undefined,
      symbol: 'barA',
    });
    expect(tokensController.state.tokens[1]).toStrictEqual({
      address: '0x02',
      decimals: 2,
      image: undefined,
      symbol: 'barB',
    });
    await tokensController.addTokens([
      { address: '0x01', symbol: 'bazA', decimals: 2 },
      { address: '0x02', symbol: 'bazB', decimals: 2 },
    ]);
    expect(tokensController.state.tokens[0]).toStrictEqual({
      address: '0x01',
      decimals: 2,
      image: undefined,
      symbol: 'bazA',
    });
    expect(tokensController.state.tokens[1]).toStrictEqual({
      address: '0x02',
      decimals: 2,
      image: undefined,
      symbol: 'bazB',
    });
  });

  it('should add token by selected address', async () => {
    const firstAddress = '0x123';
    const secondAddress = '0x321';

    preferences.update({ selectedAddress: firstAddress });
    await tokensController.addToken('0x01', 'bar', 2);
    preferences.update({ selectedAddress: secondAddress });
    expect(tokensController.state.tokens).toHaveLength(0);
    preferences.update({ selectedAddress: firstAddress });
    expect(tokensController.state.tokens[0]).toStrictEqual({
      address: '0x01',
      decimals: 2,
      image: undefined,
      symbol: 'bar',
    });
  });

  it('should add token by provider type', async () => {
    const firstNetworkType = 'rinkeby';
    const secondNetworkType = 'ropsten';
    network.update({
      provider: {
        type: firstNetworkType,
        chainId: NetworksChainId[firstNetworkType],
      },
    });
    await tokensController.addToken('0x01', 'bar', 2);
    network.update({
      provider: {
        type: secondNetworkType,
        chainId: NetworksChainId[secondNetworkType],
      },
    });
    expect(tokensController.state.tokens).toHaveLength(0);
    network.update({
      provider: {
        type: firstNetworkType,
        chainId: NetworksChainId[firstNetworkType],
      },
    });
    expect(tokensController.state.tokens[0]).toStrictEqual({
      address: '0x01',
      decimals: 2,
      image: undefined,
      symbol: 'bar',
    });
  });

  it('should remove token', async () => {
    await tokensController.addToken('0x01', 'bar', 2);
    tokensController.removeToken('0x01');
    expect(tokensController.state.tokens).toHaveLength(0);
  });

  it('should remove token by selected address', async () => {
    const firstAddress = '0x123';
    const secondAddress = '0x321';
    preferences.update({ selectedAddress: firstAddress });
    await tokensController.addToken('0x02', 'baz', 2);
    preferences.update({ selectedAddress: secondAddress });
    await tokensController.addToken('0x01', 'bar', 2);
    tokensController.removeToken('0x01');
    expect(tokensController.state.tokens).toHaveLength(0);
    preferences.update({ selectedAddress: firstAddress });
    expect(tokensController.state.tokens[0]).toStrictEqual({
      address: '0x02',
      decimals: 2,
      image: undefined,
      symbol: 'baz',
    });
  });

  it('should remove token by provider type', async () => {
    const firstNetworkType = 'rinkeby';
    const secondNetworkType = 'ropsten';
    network.update({
      provider: {
        type: firstNetworkType,
        chainId: NetworksChainId[firstNetworkType],
      },
    });
    await tokensController.addToken('0x02', 'baz', 2);
    network.update({
      provider: {
        type: secondNetworkType,
        chainId: NetworksChainId[secondNetworkType],
      },
    });
    await tokensController.addToken('0x01', 'bar', 2);
    tokensController.removeToken('0x01');
    expect(tokensController.state.tokens).toHaveLength(0);
    network.update({
      provider: {
        type: firstNetworkType,
        chainId: NetworksChainId[firstNetworkType],
      },
    });
    expect(tokensController.state.tokens[0]).toStrictEqual({
      address: '0x02',
      decimals: 2,
      image: undefined,
      symbol: 'baz',
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

  it('should add a valid suggested asset via watchAsset', async () => {
    await tokensController.watchAsset(
      {
        address: '0xe9f786dfdd9ae4d57e830acb52296837765f0e5b',
        decimals: 18,
        symbol: 'TKN',
      },
      'ERC20',
    );
    expect(tokensController.state.suggestedAssets[0].asset.address).toBe(
      '0xe9f786dfdd9ae4d57e830acb52296837765f0e5b',
    );
    expect(tokensController.state.suggestedAssets[0].status).toBe('pending');
  });

  it('should fail an invalid type suggested asset via watchAsset', async () => {
    await new Promise(async (resolve) => {
      await tokensController
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
    const { result, suggestedAssetMeta } = await tokensController.watchAsset(
      {
        address: '0xe9f786dfdd9ae4d57e830acb52296837765f0e5b',
        decimals: 18,
        symbol: 'TKN',
      },
      'ERC20',
    );
    tokensController.rejectWatchAsset('0x01');
    tokensController.rejectWatchAsset(suggestedAssetMeta.id);
    tokensController.hub.once(`${suggestedAssetMeta.id}:finished`, () => {
      expect(tokensController.state.suggestedAssets).toHaveLength(0);
    });
    await expect(result).rejects.toThrow('User rejected to watch the asset.');
  });

  it('should accept a valid suggested asset via watchAsset', async () => {
    const { result, suggestedAssetMeta } = await tokensController.watchAsset(
      {
        address: '0xe9f786dfdd9ae4d57e830acb52296837765f0e5b',
        decimals: 18,
        symbol: 'TKN',
      },
      'ERC20',
    );
    await tokensController.acceptWatchAsset(suggestedAssetMeta.id);
    const res = await result;
    expect(tokensController.state.suggestedAssets).toHaveLength(0);
    expect(res).toBe('0xe9f786dfdd9ae4d57e830acb52296837765f0e5b');
  });

  it('should fail a valid suggested asset via watchAsset with wrong type', async () => {
    const { result, suggestedAssetMeta } = await tokensController.watchAsset(
      {
        address: '0xe9f786dfdd9be4d57e830acb52296837765f0e5b',
        decimals: 18,
        symbol: 'TKN',
      },
      'ERC20',
    );
    const { suggestedAssets } = tokensController.state;
    const index = suggestedAssets.findIndex(
      ({ id }) => suggestedAssetMeta.id === id,
    );
    const newSuggestedAssetMeta = suggestedAssets[index];
    suggestedAssetMeta.type = 'ERC721';
    tokensController.update({
      suggestedAssets: [...suggestedAssets, newSuggestedAssetMeta],
    });
    await tokensController.acceptWatchAsset(suggestedAssetMeta.id);
    await expect(result).rejects.toThrow('Asset of type ERC721 not supported');
  });

  it('should not add duplicate tokens to the ignoredToken list', async () => {
    await tokensController.addToken('0x01', 'bar', 2);
    await tokensController.addToken('0xfAA', 'bar', 3);
    expect(tokensController.state.ignoredTokens).toHaveLength(0);
    expect(tokensController.state.tokens).toHaveLength(2);
    tokensController.removeAndIgnoreToken('0x01');
    expect(tokensController.state.tokens).toHaveLength(1);
    expect(tokensController.state.ignoredTokens).toHaveLength(1);
    await tokensController.addToken('0x01', 'bar', 2);
    expect(tokensController.state.ignoredTokens).toHaveLength(1);
    tokensController.removeAndIgnoreToken('0x01');
    expect(tokensController.state.ignoredTokens).toHaveLength(1);
  });

  it('should be able to clear the ignoredToken list', async () => {
    await tokensController.addToken('0x01', 'bar', 2);
    expect(tokensController.state.ignoredTokens).toHaveLength(0);
    tokensController.removeAndIgnoreToken('0x01');
    expect(tokensController.state.tokens).toHaveLength(0);
    expect(tokensController.state.ignoredTokens).toHaveLength(1);
    tokensController.clearIgnoredTokens();
    expect(tokensController.state.ignoredTokens).toHaveLength(0);
  });
});
