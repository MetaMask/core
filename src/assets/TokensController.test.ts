import sinon, { SinonFakeTimers } from 'sinon';
import contractMaps from '@metamask/contract-metadata';
import { PreferencesController } from '../user/PreferencesController';
import {
  NetworkController,
  NetworksChainId,
} from '../network/NetworkController';
import { TokensController } from './TokensController';
import type { Token } from './TokenRatesController';

describe('TokensController', () => {
  let tokensController: TokensController;
  let preferences: PreferencesController;
  let network: NetworkController;
  let supportsInterfaceStub: () => Promise<any>;
  let clock: SinonFakeTimers;

  beforeEach(() => {
    preferences = new PreferencesController();
    network = new NetworkController();
    tokensController = new TokensController({
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      onNetworkStateChange: (listener) => network.subscribe(listener),
    });

    clock = sinon.useFakeTimers(1);
    sinon
      .stub(tokensController, '_createEthersContract')
      .callsFake(() =>
        Promise.resolve({ supportsInterface: supportsInterfaceStub }),
      );
    sinon
      .stub(tokensController, '_instantiateNewEthersProvider')
      .callsFake(() => null);
  });

  afterEach(() => {
    clock.restore();
    sinon.restore();
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
    supportsInterfaceStub = sinon.stub().returns(Promise.resolve(false));
    await tokensController.addToken('0x01', 'bar', 2);
    expect(tokensController.state.tokens[0]).toStrictEqual({
      address: '0x01',
      decimals: 2,
      image: undefined,
      symbol: 'bar',
      isERC721: false,
    });
    await tokensController.addToken('0x01', 'baz', 2);
    expect(tokensController.state.tokens[0]).toStrictEqual({
      address: '0x01',
      decimals: 2,
      image: undefined,
      symbol: 'baz',
      isERC721: false,
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
      isERC721: false,
    });
    expect(tokensController.state.tokens[1]).toStrictEqual({
      address: '0x02',
      decimals: 2,
      image: undefined,
      symbol: 'barB',
      isERC721: false,
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
      isERC721: false,
    });
    expect(tokensController.state.tokens[1]).toStrictEqual({
      address: '0x02',
      decimals: 2,
      image: undefined,
      symbol: 'bazB',
      isERC721: false,
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
      isERC721: false,
    });
  });

  it('should add token by network', async () => {
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
      isERC721: false,
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
      isERC721: false,
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
      isERC721: false,
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

  it('should add isERC721 = true to token object in state when token is collectible and in our contract-metadata repo', async function () {
    supportsInterfaceStub = sinon.stub().returns(Promise.resolve(true));
    const contractAddresses = Object.keys(contractMaps);
    const erc721ContractAddresses = contractAddresses.filter(
      (contractAddress) => contractMaps[contractAddress].erc721 === true,
    );
    const address = erc721ContractAddresses[0];
    const { symbol, decimals } = contractMaps[address];
    tokensController.update({
      tokens: [{ address, symbol, decimals }],
    });
    const result = await tokensController.updateTokenType(address);
    expect(result.isERC721).toBe(true);
  });

  it('should add isERC721 = true to token object in state when token is collectible and not in our contract-metadata repo', async function () {
    const tokenAddress = '0xda5584cc586d07c7141aa427224a4bd58e64af7d';
    tokensController.update({
      tokens: [
        {
          address: tokenAddress,
          symbol: 'TESTNFT',
          decimals: 0,
        },
      ],
    });

    const result = await tokensController.updateTokenType(tokenAddress);

    expect(result.isERC721).toBe(true);
  });

  it('should return true when token is in our contract-metadata repo', async function () {
    const tokenAddress = '0x06012c8cf97BEaD5deAe237070F9587f8E7A266d';

    const result = await tokensController._detectIsERC721(tokenAddress);
    expect(result).toBe(true);
  });

  it('should return true when the token is not in our contract-metadata repo but tokenContract.supportsInterface returns true', async function () {
    const tokenAddress = '0xda5584cc586d07c7141aa427224a4bd58e64af7d';

    const result = await tokensController._detectIsERC721(tokenAddress);

    expect(result).toBe(true);
  });

  it('should return false when the token is not in our contract-metadata repo and tokenContract.supportsInterface returns false', async function () {
    supportsInterfaceStub = sinon.stub().returns(Promise.resolve(false));
    const tokenAddress = '0xda5584cc586d07c7141aa427224a4bd58e64af7d';

    const result = await tokensController._detectIsERC721(tokenAddress);
    expect(result).toBe(false);
  });

  describe('on watchAsset', function () {
    let asset: Token, type: any;

    beforeEach(function () {
      type = 'ERC20';
      asset = {
        address: '0x000000000000000000000000000000000000dEaD',
        decimals: 12,
        symbol: 'SES',
      };
    });

    afterEach(function () {
      sinon.restore();
    });

    it('should error if passed no type', async function () {
      type = undefined;
      const result = tokensController.watchAsset(asset, type);
      await expect(result).rejects.toThrow(
        'Asset of type undefined not supported',
      );
    });

    it('should error if asset type is not supported', async function () {
      type = 'ERC721';
      const result = tokensController.watchAsset(asset, type);
      await expect(result).rejects.toThrow(
        'Asset of type ERC721 not supported',
      );
    });

    it('should handle ERC20 type and add to suggestedAssets', async function () {
      sinon
        .stub(tokensController, '_generateRandomId')
        .callsFake(() => '12345');
      type = 'ERC20';
      tokensController.watchAsset(asset, type);
      await expect(tokensController.state.suggestedAssets).toStrictEqual([
        {
          id: '12345',
          status: 'pending',
          time: 1,
          type: 'ERC20',
          asset,
        },
      ]);
    });
  });
});
