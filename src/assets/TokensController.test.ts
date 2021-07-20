import sinon from 'sinon';
import contractMaps from '@metamask/contract-metadata';
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

  beforeEach(() => {
    preferences = new PreferencesController();
    network = new NetworkController();
    tokensController = new TokensController({
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      onNetworkStateChange: (listener) => network.subscribe(listener),
    });
    sinon
      .stub(tokensController, '_instantiateNewEthersProvider')
      .callsFake(() => null);
  });

  afterEach(() => {
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

  it('should add a token', async () => {
    const supportsInterfaceStub = sinon.stub().returns(Promise.resolve(false));
    sinon
      .stub(tokensController, '_createEthersContract')
      .callsFake(() =>
        Promise.resolve({ supportsInterface: supportsInterfaceStub }),
      );
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
    const supportsInterfaceStub = sinon.stub().returns(Promise.resolve(false));
    sinon
      .stub(tokensController, '_createEthersContract')
      .callsFake(() =>
        Promise.resolve({ supportsInterface: supportsInterfaceStub }),
      );
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
    const supportsInterfaceStub = sinon.stub().returns(Promise.resolve(false));
    sinon
      .stub(tokensController, '_createEthersContract')
      .callsFake(() =>
        Promise.resolve({ supportsInterface: supportsInterfaceStub }),
      );

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
    const supportsInterfaceStub = sinon.stub().returns(Promise.resolve(false));
    sinon
      .stub(tokensController, '_createEthersContract')
      .callsFake(() =>
        Promise.resolve({ supportsInterface: supportsInterfaceStub }),
      );
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
    const supportsInterfaceStub = sinon.stub().returns(Promise.resolve(false));
    sinon
      .stub(tokensController, '_createEthersContract')
      .callsFake(() =>
        Promise.resolve({ supportsInterface: supportsInterfaceStub }),
      );
    await tokensController.addToken('0x01', 'bar', 2);
    tokensController.removeToken('0x01');
    expect(tokensController.state.tokens).toHaveLength(0);
  });

  it('should remove token by selected address', async () => {
    const supportsInterfaceStub = sinon.stub().returns(Promise.resolve(false));
    sinon
      .stub(tokensController, '_createEthersContract')
      .callsFake(() =>
        Promise.resolve({ supportsInterface: supportsInterfaceStub }),
      );
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
    const supportsInterfaceStub = sinon.stub().returns(Promise.resolve(false));
    sinon
      .stub(tokensController, '_createEthersContract')
      .callsFake(() =>
        Promise.resolve({ supportsInterface: supportsInterfaceStub }),
      );
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

  it('should not add duplicate tokens to the ignoredToken list', async () => {
    const supportsInterfaceStub = sinon.stub().returns(Promise.resolve(false));
    sinon
      .stub(tokensController, '_createEthersContract')
      .callsFake(() =>
        Promise.resolve({ supportsInterface: supportsInterfaceStub }),
      );
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
    const supportsInterfaceStub = sinon.stub().returns(Promise.resolve(false));
    sinon
      .stub(tokensController, '_createEthersContract')
      .callsFake(() =>
        Promise.resolve({ supportsInterface: supportsInterfaceStub }),
      );
    await tokensController.addToken('0x01', 'bar', 2);
    expect(tokensController.state.ignoredTokens).toHaveLength(0);
    tokensController.removeAndIgnoreToken('0x01');
    expect(tokensController.state.tokens).toHaveLength(0);
    expect(tokensController.state.ignoredTokens).toHaveLength(1);
    tokensController.clearIgnoredTokens();
    expect(tokensController.state.ignoredTokens).toHaveLength(0);
  });

  describe('isERC721 flag', function () {
    describe('updateTokenType method', function () {
      it('should add isERC721 = true to token object already in state when token is collectible and in our contract-metadata repo', async function () {
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

      it('should add isERC721 = false to token object already in state when token is not a collectible and is in our contract-metadata repo', async function () {
        const contractAddresses = Object.keys(contractMaps);
        const erc20ContractAddresses = contractAddresses.filter(
          (contractAddress) => contractMaps[contractAddress].erc20 === true,
        );
        const address = erc20ContractAddresses[0];
        const { symbol, decimals } = contractMaps[address];
        tokensController.update({
          tokens: [{ address, symbol, decimals }],
        });
        const result = await tokensController.updateTokenType(address);
        expect(result.isERC721).toBe(false);
      });

      it('should add isERC721 = true to token object already in state when token is collectible and is not in our contract-metadata repo', async function () {
        const supportsInterfaceStub = sinon
          .stub()
          .returns(Promise.resolve(true));
        await sinon
          .stub(tokensController, '_createEthersContract')
          .callsFake(() =>
            Promise.resolve({ supportsInterface: supportsInterfaceStub }),
          );
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

      it('should add isERC721 = false to token object already in state when token is not a collectible and not in our contract-metadata repo', async function () {
        const supportsInterfaceStub = sinon
          .stub()
          .returns(Promise.resolve(false));
        await sinon
          .stub(tokensController, '_createEthersContract')
          .callsFake(() =>
            Promise.resolve({ supportsInterface: supportsInterfaceStub }),
          );
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

        expect(result.isERC721).toBe(false);
      });
    });

    describe('addToken method', function () {
      it('should add isERC721 = true when token is a collectible and is in our contract-metadata repo', async function () {
        const contractAddresses = Object.keys(contractMaps);
        const erc721ContractAddresses = contractAddresses.filter(
          (contractAddress) => contractMaps[contractAddress].erc721 === true,
        );
        const address = erc721ContractAddresses[0];
        const { symbol, decimals } = contractMaps[address];
        await tokensController.addToken(address, symbol, decimals);

        expect(tokensController.state.tokens).toStrictEqual([
          {
            address,
            symbol,
            isERC721: true,
            image: undefined,
            decimals,
          },
        ]);
      });

      it('should add isERC721 = true when the token is a collectible but not in our contract-metadata repo', async function () {
        const supportsInterfaceStub = sinon
          .stub()
          .returns(Promise.resolve(true));
        await sinon
          .stub(tokensController, '_createEthersContract')
          .callsFake(() =>
            Promise.resolve({ supportsInterface: supportsInterfaceStub }),
          );

        const tokenAddress = '0xDA5584Cc586d07c7141aA427224A4Bd58E64aF7D';

        await tokensController.addToken(tokenAddress, 'REST', 4);

        expect(tokensController.state.tokens).toStrictEqual([
          {
            address: tokenAddress,
            symbol: 'REST',
            isERC721: true,
            image: undefined,
            decimals: 4,
          },
        ]);
      });

      it('should add isERC721 = false to token object already in state when token is not a collectible and in our contract-metadata repo', async function () {
        const contractAddresses = Object.keys(contractMaps);
        const erc20ContractAddresses = contractAddresses.filter(
          (contractAddress) => contractMaps[contractAddress].erc20 === true,
        );
        const address = erc20ContractAddresses[0];
        const { symbol, decimals } = contractMaps[address];

        await tokensController.addToken(address, symbol, decimals);

        expect(tokensController.state.tokens).toStrictEqual([
          {
            address,
            symbol,
            isERC721: false,
            image: undefined,
            decimals,
          },
        ]);
      });

      it('should add isERC721 = false when the token is not a collectible and not in our contract-metadata repo', async function () {
        const supportsInterfaceStub = sinon
          .stub()
          .returns(Promise.resolve(false));
        await sinon
          .stub(tokensController, '_createEthersContract')
          .callsFake(() =>
            Promise.resolve({ supportsInterface: supportsInterfaceStub }),
          );
        const tokenAddress = '0xDA5584Cc586d07c7141aA427224A4Bd58E64aF7D';

        await tokensController.addToken(tokenAddress, 'LEST', 5);

        expect(tokensController.state.tokens).toStrictEqual([
          {
            address: tokenAddress,
            symbol: 'LEST',
            isERC721: false,
            image: undefined,
            decimals: 5,
          },
        ]);
      });
    });
  });

  describe('on watchAsset', function () {
    let asset: any, type: any;

    beforeEach(function () {
      type = 'ERC20';
      asset = {
        address: '0x000000000000000000000000000000000000dEaD',
        decimals: 12,
        symbol: 'SES',
        image: 'image',
      };
      const supportsInterfaceStub = sinon
        .stub()
        .returns(Promise.resolve(false));
      sinon
        .stub(tokensController, '_createEthersContract')
        .callsFake(() =>
          Promise.resolve({ supportsInterface: supportsInterfaceStub }),
        );
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

    it('should error if address is not defined', async function () {
      asset.address = undefined;
      const result = tokensController.watchAsset(asset, type);
      await expect(result).rejects.toThrow(
        'Must specify address, symbol, and decimals.',
      );
    });

    it('should error if decimals is not defined', async function () {
      asset.decimals = undefined;
      const result = tokensController.watchAsset(asset, type);
      await expect(result).rejects.toThrow(
        'Must specify address, symbol, and decimals.',
      );
    });

    it('should error if symbol is not defined', async function () {
      asset.symbol = undefined;
      const result = tokensController.watchAsset(asset, type);
      await expect(result).rejects.toThrow(
        'Must specify address, symbol, and decimals.',
      );
    });

    it('should error if symbol is empty', async function () {
      asset.symbol = '';
      const result = tokensController.watchAsset(asset, type);
      await expect(result).rejects.toThrow(
        'Must specify address, symbol, and decimals.',
      );
    });

    it('should error if symbol is too long', async function () {
      asset.symbol = 'ABCDEFGHIJKLM';
      const result = tokensController.watchAsset(asset, type);
      await expect(result).rejects.toThrow(
        'Invalid symbol "ABCDEFGHIJKLM": longer than 11 characters.',
      );
    });

    it('should error if decimals is invalid', async function () {
      asset.decimals = -1;
      const result = tokensController.watchAsset(asset, type);
      await expect(result).rejects.toThrow(
        'Invalid decimals "-1": must be 0 <= 36.',
      );

      asset.decimals = 37;
      const result2 = tokensController.watchAsset(asset, type);
      await expect(result2).rejects.toThrow(
        'Invalid decimals "37": must be 0 <= 36.',
      );
    });

    it('should error if address is invalid', async function () {
      asset.address = '0x123';
      const result = tokensController.watchAsset(asset, type);
      await expect(result).rejects.toThrow('Invalid address "0x123".');
    });

    it('should handle ERC20 type and add to suggestedAssets', async function () {
      const clock = sinon.useFakeTimers(1);
      sinon
        .stub(tokensController, '_generateRandomId')
        .callsFake(() => '12345');
      type = 'ERC20';
      await tokensController.watchAsset(asset, type);
      await expect(tokensController.state.suggestedAssets).toStrictEqual([
        {
          id: '12345',
          status: 'pending',
          time: 1, // uses the fakeTimers clock
          type: 'ERC20',
          asset,
        },
      ]);
      clock.restore();
    });

    it('should add token correctly if user confirms', async function () {
      sinon
        .stub(tokensController, '_generateRandomId')
        .callsFake(() => '12345');
      type = 'ERC20';
      await tokensController.watchAsset(asset, type);

      await tokensController.acceptWatchAsset('12345');
      await expect(tokensController.state.suggestedAssets).toStrictEqual([]);
      await expect(tokensController.state.tokens).toHaveLength(1);
      await expect(tokensController.state.tokens).toStrictEqual([
        {
          isERC721: false,
          ...asset,
        },
      ]);
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
            expect(error.message).toContain(
              'Asset of type ERC721 not supported',
            );
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
      await expect(result).rejects.toThrow(
        'Asset of type ERC721 not supported',
      );
    });
  });

  describe('onPreferencesStateChange', function () {
    it('should update tokens list when set address changes', async function () {
      const supportsInterfaceStub = sinon
        .stub()
        .returns(Promise.resolve(false));
      await sinon
        .stub(tokensController, '_createEthersContract')
        .callsFake(() =>
          Promise.resolve({ supportsInterface: supportsInterfaceStub }),
        );
      preferences.setSelectedAddress('0x1');
      await tokensController.addToken('0x01', 'A', 4);
      await tokensController.addToken('0x02', 'B', 5);
      preferences.setSelectedAddress('0x2');
      expect(tokensController.state.tokens).toStrictEqual([]);
      await tokensController.addToken('0x03', 'C', 6);
      preferences.setSelectedAddress('0x1');
      expect(tokensController.state.tokens).toStrictEqual([
        {
          address: '0x01',
          decimals: 4,
          image: undefined,
          isERC721: false,
          symbol: 'A',
        },
        {
          address: '0x02',
          decimals: 5,
          image: undefined,
          isERC721: false,
          symbol: 'B',
        },
      ]);
      preferences.setSelectedAddress('0x2');
      expect(tokensController.state.tokens).toStrictEqual([
        {
          address: '0x03',
          decimals: 6,
          image: undefined,
          isERC721: false,
          symbol: 'C',
        },
      ]);
    });
  });

  describe('onNetworkStateChange', function () {
    it('should remove a token from its state on corresponding network', async function () {
      const supportsInterfaceStub = sinon
        .stub()
        .returns(Promise.resolve(false));
      await sinon
        .stub(tokensController, '_createEthersContract')
        .callsFake(() =>
          Promise.resolve({ supportsInterface: supportsInterfaceStub }),
        );
      const firstNetworkType = 'rinkeby';
      const secondNetworkType = 'ropsten';
      network.update({
        provider: {
          type: firstNetworkType,
          chainId: NetworksChainId[firstNetworkType],
        },
      });

      await tokensController.addToken('0x01', 'A', 4);
      await tokensController.addToken('0x02', 'B', 5);
      const initialTokensFirst = tokensController.state.tokens;

      network.update({
        provider: {
          type: secondNetworkType,
          chainId: NetworksChainId[secondNetworkType],
        },
      });

      await tokensController.addToken('0x03', 'C', 4);
      await tokensController.addToken('0x04', 'D', 5);

      const initialTokensSecond = tokensController.state.tokens;

      expect(initialTokensFirst).not.toStrictEqual(initialTokensSecond);

      expect(initialTokensFirst).toStrictEqual([
        {
          address: '0x01',
          decimals: 4,
          image: undefined,
          isERC721: false,
          symbol: 'A',
        },
        {
          address: '0x02',
          decimals: 5,
          image: undefined,
          isERC721: false,
          symbol: 'B',
        },
      ]);

      expect(initialTokensSecond).toStrictEqual([
        {
          address: '0x03',
          decimals: 4,
          image: undefined,
          isERC721: false,
          symbol: 'C',
        },
        {
          address: '0x04',
          decimals: 5,
          image: undefined,
          isERC721: false,
          symbol: 'D',
        },
      ]);

      network.update({
        provider: {
          type: firstNetworkType,
          chainId: NetworksChainId[firstNetworkType],
        },
      });

      expect(initialTokensFirst).toStrictEqual(tokensController.state.tokens);

      network.update({
        provider: {
          type: secondNetworkType,
          chainId: NetworksChainId[secondNetworkType],
        },
      });

      expect(initialTokensSecond).toStrictEqual(tokensController.state.tokens);
    });
  });
});
