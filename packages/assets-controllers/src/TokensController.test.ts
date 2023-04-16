import * as sinon from 'sinon';
import nock from 'nock';
import {
  AcceptRequest as AcceptApprovalRequest,
  AddApprovalRequest,
  RejectRequest as RejectApprovalRequest,
} from '@metamask/approval-controller';
import { ControllerMessenger } from '@metamask/base-controller';
import contractMaps from '@metamask/contract-metadata';
import { PreferencesController } from '@metamask/preferences-controller';
import { NetworksChainId, NetworkType } from '@metamask/controller-utils';
import {
  NetworkState,
  ProviderConfig,
  defaultState as defaultNetworkState,
} from '@metamask/network-controller';
import {
  TokensController,
  TokensControllerMessenger,
} from './TokensController';
import { Token } from './TokenRatesController';
import { TOKEN_END_POINT_API } from './token-service';

jest.mock('uuid', () => {
  return {
    ...jest.requireActual('uuid'),
    v1: () => '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
  };
});

const stubCreateEthers = (ctrl: TokensController, res: boolean) => {
  return sinon.stub(ctrl, '_createEthersContract').callsFake(() => {
    return {
      supportsInterface: sinon.stub().returns(res),
    } as any;
  });
};

const SEPOLIA = { chainId: '11155111', type: NetworkType.sepolia };
const GOERLI = { chainId: '5', type: NetworkType.goerli };

const ORIGIN_METAMASK = 'metamask';
const WATCH_ASSET_METHOD_NAME = 'wallet_watchAssets';

const controllerName = 'TokensController' as const;

type ApprovalActions =
  | AddApprovalRequest
  | AcceptApprovalRequest
  | RejectApprovalRequest;

describe('TokensController', () => {
  let tokensController: TokensController;
  let preferences: PreferencesController;

  const messenger = new ControllerMessenger<
    ApprovalActions,
    never
  >().getRestricted<typeof controllerName, ApprovalActions['type'], never>({
    name: controllerName,
    allowedActions: [
      'ApprovalController:addRequest',
      'ApprovalController:acceptRequest',
      'ApprovalController:rejectRequest',
    ],
  }) as TokensControllerMessenger;

  let onNetworkStateChangeListener: (state: NetworkState) => void;
  const changeNetwork = (providerConfig: ProviderConfig) => {
    onNetworkStateChangeListener({
      ...defaultNetworkState,
      providerConfig,
    });
  };

  beforeEach(() => {
    const defaultSelectedAddress = '0x1';
    preferences = new PreferencesController();
    tokensController = new TokensController({
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      onNetworkStateChange: (listener) =>
        (onNetworkStateChangeListener = listener),
      config: {
        chainId: NetworksChainId.mainnet,
        selectedAddress: defaultSelectedAddress,
      },
      messenger,
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
      allIgnoredTokens: {},
      ignoredTokens: [],
      suggestedAssets: [],
      tokens: [],
      detectedTokens: [],
      allDetectedTokens: {},
    });
  });

  it('should add a token', async () => {
    const stub = stubCreateEthers(tokensController, false);
    await tokensController.addToken('0x01', 'bar', 2);
    expect(tokensController.state.tokens[0]).toStrictEqual({
      address: '0x01',
      decimals: 2,
      image:
        'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x01.png',
      symbol: 'bar',
      isERC721: false,
      aggregators: [],
    });
    await tokensController.addToken('0x01', 'baz', 2);
    expect(tokensController.state.tokens[0]).toStrictEqual({
      address: '0x01',
      decimals: 2,
      image:
        'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x01.png',
      symbol: 'baz',
      isERC721: false,
      aggregators: [],
    });
    stub.restore();
  });

  it('should add tokens', async () => {
    const stub = stubCreateEthers(tokensController, false);

    await tokensController.addTokens([
      { address: '0x01', symbol: 'barA', decimals: 2, aggregators: [] },
      { address: '0x02', symbol: 'barB', decimals: 2, aggregators: [] },
    ]);

    expect(tokensController.state.tokens[0]).toStrictEqual({
      address: '0x01',
      decimals: 2,
      image: undefined,
      symbol: 'barA',
      aggregators: [],
    });

    expect(tokensController.state.tokens[1]).toStrictEqual({
      address: '0x02',
      decimals: 2,
      image: undefined,
      symbol: 'barB',
      aggregators: [],
    });

    await tokensController.addTokens([
      {
        address: '0x01',
        symbol: 'bazA',
        decimals: 2,
        aggregators: [],
      },
      {
        address: '0x02',
        symbol: 'bazB',
        decimals: 2,
        aggregators: [],
      },
    ]);

    expect(tokensController.state.tokens[0]).toStrictEqual({
      address: '0x01',
      decimals: 2,
      image: undefined,
      symbol: 'bazA',
      aggregators: [],
    });

    expect(tokensController.state.tokens[1]).toStrictEqual({
      address: '0x02',
      decimals: 2,
      image: undefined,
      symbol: 'bazB',
      aggregators: [],
    });

    stub.restore();
  });

  it('should add detected tokens', async () => {
    const stub = stubCreateEthers(tokensController, false);

    await tokensController.addDetectedTokens([
      { address: '0x01', symbol: 'barA', decimals: 2, aggregators: [] },
      { address: '0x02', symbol: 'barB', decimals: 2, aggregators: [] },
    ]);

    expect(tokensController.state.detectedTokens[0]).toStrictEqual({
      address: '0x01',
      decimals: 2,
      image: undefined,
      symbol: 'barA',
      aggregators: [],
      isERC721: undefined,
    });

    expect(tokensController.state.detectedTokens[1]).toStrictEqual({
      address: '0x02',
      decimals: 2,
      image: undefined,
      symbol: 'barB',
      aggregators: [],
      isERC721: undefined,
    });

    await tokensController.addDetectedTokens([
      {
        address: '0x01',
        symbol: 'bazA',
        decimals: 2,
        aggregators: [],
        isERC721: undefined,
      },
      {
        address: '0x02',
        symbol: 'bazB',
        decimals: 2,
        aggregators: [],
        isERC721: undefined,
      },
    ]);

    expect(tokensController.state.detectedTokens[0]).toStrictEqual({
      address: '0x01',
      decimals: 2,
      image: undefined,
      symbol: 'bazA',
      aggregators: [],
      isERC721: undefined,
    });

    expect(tokensController.state.detectedTokens[1]).toStrictEqual({
      address: '0x02',
      decimals: 2,
      image: undefined,
      symbol: 'bazB',
      aggregators: [],
      isERC721: undefined,
    });

    stub.restore();
  });

  it('should add token by selected address', async () => {
    const stub = stubCreateEthers(tokensController, false);

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
      image:
        'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x01.png',
      symbol: 'bar',
      isERC721: false,
      aggregators: [],
    });

    stub.restore();
  });

  it('should add token by network', async () => {
    const stub = stubCreateEthers(tokensController, false);
    changeNetwork(SEPOLIA);
    await tokensController.addToken('0x01', 'bar', 2);
    changeNetwork(GOERLI);
    expect(tokensController.state.tokens).toHaveLength(0);

    changeNetwork(SEPOLIA);

    expect(tokensController.state.tokens[0]).toStrictEqual({
      address: '0x01',
      decimals: 2,
      image:
        'https://static.metafi.codefi.network/api/v1/tokenIcons/11155111/0x01.png',
      symbol: 'bar',
      isERC721: false,
      aggregators: [],
    });

    stub.restore();
  });

  it('should remove token', async () => {
    const stub = stubCreateEthers(tokensController, false);
    await tokensController.addToken('0x01', 'bar', 2);
    tokensController.ignoreTokens(['0x01']);
    expect(tokensController.state.tokens).toHaveLength(0);
    stub.restore();
  });

  it('should remove token by selected address', async () => {
    const stub = stubCreateEthers(tokensController, false);
    const firstAddress = '0x123';
    const secondAddress = '0x321';
    preferences.update({ selectedAddress: firstAddress });
    await tokensController.addToken('0x02', 'baz', 2);
    preferences.update({ selectedAddress: secondAddress });
    await tokensController.addToken('0x01', 'bar', 2);
    tokensController.ignoreTokens(['0x01']);
    expect(tokensController.state.tokens).toHaveLength(0);
    preferences.update({ selectedAddress: firstAddress });
    expect(tokensController.state.tokens[0]).toStrictEqual({
      address: '0x02',
      decimals: 2,
      image:
        'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x02.png',
      symbol: 'baz',
      isERC721: false,
      aggregators: [],
    });
    stub.restore();
  });

  it('should remove token by provider type', async () => {
    const stub = stubCreateEthers(tokensController, false);
    changeNetwork(SEPOLIA);
    await tokensController.addToken('0x02', 'baz', 2);
    changeNetwork(GOERLI);
    await tokensController.addToken('0x01', 'bar', 2);
    tokensController.ignoreTokens(['0x01']);
    expect(tokensController.state.tokens).toHaveLength(0);
    changeNetwork(SEPOLIA);

    expect(tokensController.state.tokens[0]).toStrictEqual({
      address: '0x02',
      decimals: 2,
      image:
        'https://static.metafi.codefi.network/api/v1/tokenIcons/11155111/0x02.png',
      symbol: 'baz',
      isERC721: false,
      aggregators: [],
    });
    stub.restore();
  });

  it('should subscribe to new sibling preference controllers', async () => {
    const address = '0x123';
    preferences.update({ selectedAddress: address });
    changeNetwork(SEPOLIA);
    expect(preferences.state.selectedAddress).toStrictEqual(address);
  });

  describe('ignoredTokens', () => {
    const defaultSelectedAddress = '0x0001';

    let createEthersStub: sinon.SinonStub;
    beforeEach(() => {
      preferences.setSelectedAddress(defaultSelectedAddress);
      changeNetwork(SEPOLIA);

      createEthersStub = stubCreateEthers(tokensController, false);
    });

    afterEach(() => {
      createEthersStub.restore();
    });

    it('should remove token from ignoredTokens/allIgnoredTokens lists if added back via addToken', async () => {
      await tokensController.addToken('0x01', 'foo', 2);
      await tokensController.addToken('0xFAa', 'bar', 3);
      expect(tokensController.state.ignoredTokens).toHaveLength(0);
      expect(tokensController.state.tokens).toHaveLength(2);
      tokensController.ignoreTokens(['0x01']);
      expect(tokensController.state.tokens).toHaveLength(1);
      expect(tokensController.state.ignoredTokens).toHaveLength(1);
      await tokensController.addToken('0x01', 'baz', 2);
      expect(tokensController.state.tokens).toHaveLength(2);
      expect(tokensController.state.ignoredTokens).toHaveLength(0);
    });

    it('should remove a token from the ignoredTokens/allIgnoredTokens lists if re-added as part of a bulk addTokens add', async () => {
      const selectedAddress = '0x0001';
      preferences.setSelectedAddress(selectedAddress);
      changeNetwork(SEPOLIA);
      await tokensController.addToken('0x01', 'bar', 2);
      await tokensController.addToken('0xFAa', 'bar', 3);
      expect(tokensController.state.ignoredTokens).toHaveLength(0);
      expect(tokensController.state.tokens).toHaveLength(2);
      tokensController.ignoreTokens(['0x01']);
      tokensController.ignoreTokens(['0xFAa']);
      expect(tokensController.state.tokens).toHaveLength(0);
      expect(tokensController.state.ignoredTokens).toHaveLength(2);
      await tokensController.addTokens([
        { address: '0x01', decimals: 3, symbol: 'bar', aggregators: [] },
        { address: '0x02', decimals: 4, symbol: 'baz', aggregators: [] },
        { address: '0x04', decimals: 4, symbol: 'foo', aggregators: [] },
      ]);
      expect(tokensController.state.tokens).toHaveLength(3);
      expect(tokensController.state.ignoredTokens).toHaveLength(1);
      expect(tokensController.state.allIgnoredTokens).toStrictEqual({
        [SEPOLIA.chainId]: {
          [selectedAddress]: ['0xFAa'],
        },
      });
    });

    it('should be able to clear the ignoredToken list', async () => {
      await tokensController.addToken('0x01', 'bar', 2);
      expect(tokensController.state.ignoredTokens).toHaveLength(0);
      tokensController.ignoreTokens(['0x01']);
      expect(tokensController.state.tokens).toHaveLength(0);
      expect(tokensController.state.allIgnoredTokens).toStrictEqual({
        [SEPOLIA.chainId]: {
          [defaultSelectedAddress]: ['0x01'],
        },
      });
      tokensController.clearIgnoredTokens();
      expect(tokensController.state.ignoredTokens).toHaveLength(0);
      expect(Object.keys(tokensController.state.allIgnoredTokens)).toHaveLength(
        0,
      );
    });

    it('should ignore tokens by [chainID][accountAddress]', async () => {
      const selectedAddress1 = '0x0001';
      const selectedAddress2 = '0x0002';

      preferences.setSelectedAddress(selectedAddress1);
      changeNetwork(SEPOLIA);

      await tokensController.addToken('0x01', 'bar', 2);
      expect(tokensController.state.ignoredTokens).toHaveLength(0);
      tokensController.ignoreTokens(['0x01']);
      expect(tokensController.state.tokens).toHaveLength(0);

      expect(tokensController.state.ignoredTokens).toStrictEqual(['0x01']);
      changeNetwork(GOERLI);

      expect(tokensController.state.ignoredTokens).toHaveLength(0);
      await tokensController.addToken('0x02', 'bazz', 3);
      tokensController.ignoreTokens(['0x02']);
      expect(tokensController.state.ignoredTokens).toStrictEqual(['0x02']);

      preferences.setSelectedAddress(selectedAddress2);
      expect(tokensController.state.ignoredTokens).toHaveLength(0);
      await tokensController.addToken('0x03', 'foo', 4);
      tokensController.ignoreTokens(['0x03']);
      expect(tokensController.state.ignoredTokens).toStrictEqual(['0x03']);

      expect(tokensController.state.allIgnoredTokens).toStrictEqual({
        [SEPOLIA.chainId]: {
          [selectedAddress1]: ['0x01'],
        },
        [GOERLI.chainId]: {
          [selectedAddress1]: ['0x02'],
          [selectedAddress2]: ['0x03'],
        },
      });
    });
  });

  it('should ignore multiple tokens with single ignoreTokens call', async () => {
    const stub = stubCreateEthers(tokensController, false);
    await tokensController.addToken('0x01', 'A', 4);
    await tokensController.addToken('0x02', 'B', 5);
    expect(tokensController.state.tokens).toStrictEqual([
      {
        address: '0x01',
        decimals: 4,
        image:
          'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x01.png',
        isERC721: false,
        symbol: 'A',
        aggregators: [],
      },
      {
        address: '0x02',
        decimals: 5,
        image:
          'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x02.png',
        isERC721: false,
        symbol: 'B',
        aggregators: [],
      },
    ]);

    tokensController.ignoreTokens(['0x01', '0x02']);
    expect(tokensController.state.tokens).toStrictEqual([]);
    stub.restore();
  });

  describe('isERC721 flag', function () {
    describe('updateTokenType method', function () {
      it('should add isERC721 = true to token object already in state when token is NFT and in our contract-metadata repo', async function () {
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

      it('should add isERC721 = false to token object already in state when token is not an NFT and is in our contract-metadata repo', async function () {
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

      it('should add isERC721 = true to token object already in state when token is NFT and is not in our contract-metadata repo', async function () {
        const stub = stubCreateEthers(tokensController, true);
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
        stub.restore();
      });

      it('should add isERC721 = false to token object already in state when token is not an NFT and not in our contract-metadata repo', async function () {
        const stub = stubCreateEthers(tokensController, false);
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
        stub.restore();
      });
    });

    describe('addToken method', function () {
      it('should add isERC721 = true when token is an NFT and is in our contract-metadata repo', async function () {
        const contractAddresses = Object.keys(contractMaps);
        const erc721ContractAddresses = contractAddresses.filter(
          (contractAddress) => contractMaps[contractAddress].erc721 === true,
        );
        const address = erc721ContractAddresses[0];
        const { symbol, decimals } = contractMaps[address];
        await tokensController.addToken(address, symbol, decimals);

        expect(tokensController.state.tokens).toStrictEqual([
          expect.objectContaining({
            address,
            symbol,
            isERC721: true,
            decimals,
          }),
        ]);
      });

      it('should add isERC721 = true when the token is an NFT but not in our contract-metadata repo', async function () {
        const stub = stubCreateEthers(tokensController, true);
        const tokenAddress = '0xDA5584Cc586d07c7141aA427224A4Bd58E64aF7D';

        await tokensController.addToken(tokenAddress, 'REST', 4);

        expect(tokensController.state.tokens).toStrictEqual([
          {
            address: tokenAddress,
            symbol: 'REST',
            isERC721: true,
            image:
              'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0xda5584cc586d07c7141aa427224a4bd58e64af7d.png',
            decimals: 4,
            aggregators: [],
          },
        ]);

        stub.restore();
      });

      it('should add isERC721 = false to token object already in state when token is not an NFT and in our contract-metadata repo', async function () {
        const contractAddresses = Object.keys(contractMaps);
        const erc20ContractAddresses = contractAddresses.filter(
          (contractAddress) => contractMaps[contractAddress].erc20 === true,
        );
        const address = erc20ContractAddresses[0];
        const { symbol, decimals } = contractMaps[address];

        await tokensController.addToken(address, symbol, decimals);

        expect(tokensController.state.tokens).toStrictEqual([
          expect.objectContaining({
            address,
            symbol,
            isERC721: false,
            decimals,
          }),
        ]);
      });

      it('should add isERC721 = false when the token is not an NFT and not in our contract-metadata repo', async function () {
        const stub = stubCreateEthers(tokensController, false);
        const tokenAddress = '0xDA5584Cc586d07c7141aA427224A4Bd58E64aF7D';

        await tokensController.addToken(tokenAddress, 'LEST', 5);

        expect(tokensController.state.tokens).toStrictEqual([
          {
            address: tokenAddress,
            symbol: 'LEST',
            isERC721: false,
            image:
              'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0xda5584cc586d07c7141aa427224a4bd58e64af7d.png',
            decimals: 5,
            aggregators: [],
          },
        ]);

        stub.restore();
      });

      it('should throw error if switching networks while adding token', async function () {
        const dummyTokenAddress = '0x514910771AF9Ca656af840dff83E8264EcF986CA';
        const addTokenPromise = tokensController.addToken(
          dummyTokenAddress,
          'LINK',
          18,
        );
        changeNetwork(GOERLI);
        await expect(addTokenPromise).rejects.toThrow(
          'TokensController Error: Switched networks while adding token',
        );
      });
    });

    it('should throw TokenService error if fetchTokenMetadata returns a response with an error', async () => {
      const dummyTokenAddress = '0x514910771AF9Ca656af840dff83E8264EcF986CA';
      const error = 'An error occured';
      const fullErrorMessage = `TokenService Error: ${error}`;
      nock(TOKEN_END_POINT_API)
        .get(`/token/${NetworksChainId.mainnet}?address=${dummyTokenAddress}`)
        .reply(200, { error })
        .persist();

      await expect(
        tokensController.addToken(dummyTokenAddress, 'LINK', 18),
      ).rejects.toThrow(fullErrorMessage);
    });

    it('should add token that was previously a detected token', async () => {
      const stub = stubCreateEthers(tokensController, false);
      const dummyDetectedToken: Token = {
        address: '0x01',
        symbol: 'barA',
        decimals: 2,
        aggregators: [],
        image: undefined,
        isERC721: false,
      };
      const dummyAddedToken: Token = {
        ...dummyDetectedToken,
        image:
          'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x01.png',
      };

      await tokensController.addDetectedTokens([dummyDetectedToken]);

      expect(tokensController.state.detectedTokens).toStrictEqual([
        dummyDetectedToken,
      ]);

      await tokensController.addToken(
        dummyDetectedToken.address,
        dummyDetectedToken.symbol,
        dummyDetectedToken.decimals,
      );

      expect(tokensController.state.detectedTokens).toStrictEqual([]);
      expect(tokensController.state.tokens).toStrictEqual([dummyAddedToken]);

      stub.restore();
    });

    it('should add tokens to the correct chainId/selectedAddress on which they were detected even if its not the currently configured chainId/selectedAddress', async () => {
      const stub = stubCreateEthers(tokensController, false);

      const DETECTED_ADDRESS = '0xDetectedAddress';
      const DETECTED_CHAINID = '0xDetectedChainId';

      const CONFIGURED_ADDRESS = '0xabc';
      preferences.update({ selectedAddress: CONFIGURED_ADDRESS });
      changeNetwork(SEPOLIA);

      const detectedToken: Token = {
        address: '0x01',
        symbol: 'barA',
        decimals: 2,
        aggregators: [],
        isERC721: false,
        image:
          'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x01.png',
      };

      const directlyAddedToken: Token = {
        address: '0x02',
        decimals: 5,
        symbol: 'B',
        image:
          'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x02.png',
        isERC721: false,
        aggregators: [],
      };

      // detectionDetails object is passed as second arg with details about where token was detected
      await tokensController.addDetectedTokens([detectedToken], {
        selectedAddress: DETECTED_ADDRESS,
        chainId: DETECTED_CHAINID,
      });

      // will add token to currently configured chainId/selectedAddress
      await tokensController.addToken(
        directlyAddedToken.address,
        directlyAddedToken.symbol,
        directlyAddedToken.decimals,
        directlyAddedToken.image,
      );

      expect(tokensController.state.allDetectedTokens).toStrictEqual({
        [DETECTED_CHAINID]: {
          [DETECTED_ADDRESS]: [detectedToken],
        },
      });

      expect(tokensController.state.allTokens).toStrictEqual({
        [SEPOLIA.chainId]: {
          [CONFIGURED_ADDRESS]: [directlyAddedToken],
        },
      });
      stub.restore();
    });
  });

  describe('addTokens method', function () {
    it('should add tokens that were previously detected tokens', async () => {
      const dummyAddedTokens: Token[] = [
        {
          address: '0x01',
          symbol: 'barA',
          decimals: 2,
          aggregators: [],
          image: undefined,
        },
        {
          address: '0x02',
          symbol: 'barB',
          decimals: 2,
          aggregators: [],
          image: undefined,
        },
      ];
      const dummyDetectedTokens: Token[] = [
        {
          ...dummyAddedTokens[0],
          isERC721: false,
        },
        {
          ...dummyAddedTokens[1],
          isERC721: false,
        },
      ];

      await tokensController.addDetectedTokens(dummyDetectedTokens);

      expect(tokensController.state.detectedTokens).toStrictEqual(
        dummyDetectedTokens,
      );

      await tokensController.addTokens(dummyDetectedTokens);

      expect(tokensController.state.detectedTokens).toStrictEqual([]);
      expect(tokensController.state.tokens).toStrictEqual(dummyAddedTokens);
    });
  });

  describe('_getNewAllTokensState method', () => {
    const dummySelectedAddress = '0x1';
    const dummyTokens: Token[] = [
      {
        address: '0x01',
        symbol: 'barA',
        decimals: 2,
        aggregators: [],
        image: undefined,
      },
    ];

    it('should nest newTokens under chain ID and selected address when provided with newTokens as input', () => {
      tokensController.configure({
        selectedAddress: dummySelectedAddress,
        chainId: NetworksChainId.mainnet,
      });
      const processedTokens = tokensController._getNewAllTokensState({
        newTokens: dummyTokens,
      });
      expect(
        processedTokens.newAllTokens[NetworksChainId.mainnet][
          dummySelectedAddress
        ],
      ).toStrictEqual(dummyTokens);
    });

    it('should nest detectedTokens under chain ID and selected address when provided with detectedTokens as input', () => {
      tokensController.configure({
        selectedAddress: dummySelectedAddress,
        chainId: NetworksChainId.mainnet,
      });
      const processedTokens = tokensController._getNewAllTokensState({
        newDetectedTokens: dummyTokens,
      });
      expect(
        processedTokens.newAllDetectedTokens[NetworksChainId.mainnet][
          dummySelectedAddress
        ],
      ).toStrictEqual(dummyTokens);
    });

    it('should nest ignoredTokens under chain ID and selected address when provided with ignoredTokens as input', () => {
      tokensController.configure({
        selectedAddress: dummySelectedAddress,
        chainId: NetworksChainId.mainnet,
      });
      const dummyIgnoredTokens = [dummyTokens[0].address];
      const processedTokens = tokensController._getNewAllTokensState({
        newIgnoredTokens: dummyIgnoredTokens,
      });
      expect(
        processedTokens.newAllIgnoredTokens[NetworksChainId.mainnet][
          dummySelectedAddress
        ],
      ).toStrictEqual(dummyIgnoredTokens);
    });
  });

  describe('on watchAsset', function () {
    let asset: any, type: any;
    const interactingAddress = '0x2';
    const requestId = '12345';

    let createEthersStub: sinon.SinonStub;
    beforeEach(function () {
      type = 'ERC20';
      asset = {
        address: '0x000000000000000000000000000000000000dEaD',
        decimals: 12,
        symbol: 'SES',
        image: 'image',
      };
      createEthersStub = stubCreateEthers(tokensController, false);
    });

    afterEach(() => {
      createEthersStub.restore();
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
      const generateRandomIdStub = sinon
        .stub(tokensController, '_generateRandomId')
        .callsFake(() => requestId);
      type = 'ERC20';

      const callActionSpy = jest.spyOn(messenger, 'call').mockResolvedValue({});

      await tokensController.watchAsset(asset, type);
      expect(tokensController.state.suggestedAssets).toStrictEqual([
        {
          id: requestId,
          status: 'pending',
          time: 1, // uses the fakeTimers clock
          type: 'ERC20',
          asset,
          interactingAddress: '0x1',
        },
      ]);
      expect(callActionSpy).toHaveBeenCalledTimes(1);
      expect(callActionSpy).toHaveBeenCalledWith(
        'ApprovalController:addRequest',
        {
          id: requestId,
          origin: ORIGIN_METAMASK,
          type: WATCH_ASSET_METHOD_NAME,
          requestData: {
            id: requestId,
            interactingAddress: '0x1',
            asset: {
              address: asset.address,
              decimals: asset.decimals,
              symbol: asset.symbol,
              image: asset.image,
            },
          },
        },
        true,
      );

      generateRandomIdStub.restore();
      clock.restore();
    });

    it('should handle ERC20 type and add to suggestedAssets with interacting address', async function () {
      const clock = sinon.useFakeTimers(1);
      const generateRandomIdStub = sinon
        .stub(tokensController, '_generateRandomId')
        .callsFake(() => requestId);
      type = 'ERC20';

      const callActionSpy = jest.spyOn(messenger, 'call').mockResolvedValue({});

      await tokensController.watchAsset(asset, type, interactingAddress);
      expect(tokensController.state.suggestedAssets).toStrictEqual([
        {
          id: requestId,
          status: 'pending',
          interactingAddress,
          time: 1, // uses the fakeTimers clock
          type: 'ERC20',
          asset,
        },
      ]);
      expect(callActionSpy).toHaveBeenCalledTimes(1);
      expect(callActionSpy).toHaveBeenCalledWith(
        'ApprovalController:addRequest',
        {
          id: requestId,
          origin: ORIGIN_METAMASK,
          type: WATCH_ASSET_METHOD_NAME,
          requestData: {
            id: requestId,
            interactingAddress,
            asset: {
              address: asset.address,
              decimals: asset.decimals,
              symbol: asset.symbol,
              image: asset.image,
            },
          },
        },
        true,
      );

      generateRandomIdStub.restore();
      clock.restore();
    });

    it.each([
      ['resolves', true],
      ['rejects', false],
    ])(
      'should add token correctly if user confirms and message to ApprovalController %s',
      async function (_, approvalControllerCallResolves: boolean) {
        const generateRandomIdStub = sinon
          .stub(tokensController, '_generateRandomId')
          .callsFake(() => requestId);
        type = 'ERC20';

        let calledOnce = false;
        const callActionSpy = approvalControllerCallResolves
          ? jest.spyOn(messenger, 'call').mockResolvedValue({})
          : jest.spyOn(messenger, 'call').mockImplementation(() => {
              if (!calledOnce) {
                calledOnce = true;
                return Promise.resolve({});
              }

              throw new Error();
            });

        await tokensController.watchAsset(asset, type);
        await tokensController.acceptWatchAsset(requestId);

        expect(tokensController.state.suggestedAssets).toStrictEqual([]);
        expect(tokensController.state.tokens).toHaveLength(1);
        expect(tokensController.state.tokens).toStrictEqual([
          {
            isERC721: false,
            aggregators: [],
            ...asset,
            image: 'image',
          },
        ]);
        expect(callActionSpy).toHaveBeenCalledTimes(2);
        expect(callActionSpy).toHaveBeenCalledWith(
          'ApprovalController:addRequest',
          {
            id: requestId,
            origin: ORIGIN_METAMASK,
            type: WATCH_ASSET_METHOD_NAME,
            requestData: {
              id: requestId,
              interactingAddress: '0x1',
              asset: {
                address: asset.address,
                decimals: asset.decimals,
                symbol: asset.symbol,
                image: asset.image,
              },
            },
          },
          true,
        );
        expect(callActionSpy).toHaveBeenCalledWith(
          'ApprovalController:acceptRequest',
          expect.any(String),
        );

        generateRandomIdStub.restore();
      },
    );

    it('should store token correctly under interacting address if user confirms', async function () {
      const generateRandomIdStub = sinon
        .stub(tokensController, '_generateRandomId')
        .callsFake(() => requestId);
      type = 'ERC20';

      const callActionSpy = jest.spyOn(messenger, 'call').mockResolvedValue({});

      await tokensController.watchAsset(asset, type, interactingAddress);
      await tokensController.acceptWatchAsset(requestId);

      expect(tokensController.state.suggestedAssets).toStrictEqual([]);
      expect(tokensController.state.tokens).toHaveLength(0);
      expect(tokensController.state.tokens).toStrictEqual([]);
      expect(
        tokensController.state.allTokens[NetworksChainId.mainnet][
          interactingAddress
        ],
      ).toHaveLength(1);
      expect(
        tokensController.state.allTokens[NetworksChainId.mainnet][
          interactingAddress
        ],
      ).toStrictEqual([
        {
          isERC721: false,
          aggregators: [],
          ...asset,
          image: 'image',
        },
      ]);
      expect(callActionSpy).toHaveBeenCalledTimes(2);
      expect(callActionSpy).toHaveBeenCalledWith(
        'ApprovalController:addRequest',
        {
          id: requestId,
          origin: ORIGIN_METAMASK,
          type: WATCH_ASSET_METHOD_NAME,
          requestData: {
            id: requestId,
            interactingAddress,
            asset: {
              address: asset.address,
              decimals: asset.decimals,
              symbol: asset.symbol,
              image: asset.image,
            },
          },
        },
        true,
      );
      expect(callActionSpy).toHaveBeenCalledWith(
        'ApprovalController:acceptRequest',
        expect.any(String),
      );

      generateRandomIdStub.restore();
    });

    it('should fail an invalid type suggested asset via watchAsset', async () => {
      await expect(
        tokensController.watchAsset(
          {
            address: '0xe9f786dfdd9ae4d57e830acb52296837765f0e5b',
            decimals: 18,
            symbol: 'TKN',
          },
          'ERC721',
        ),
      ).rejects.toThrow('Asset of type ERC721 not supported');
    });

    it.each([
      ['resolves', true],
      ['rejects', false],
    ])(
      'should reject a valid suggested asset via watchAsset and message to ApprovalController %s',
      async function (_, approvalControllerCallResolves: boolean) {
        let calledOnce = false;
        const callActionSpy = approvalControllerCallResolves
          ? jest.spyOn(messenger, 'call').mockResolvedValue({})
          : jest.spyOn(messenger, 'call').mockImplementation(() => {
              if (!calledOnce) {
                calledOnce = true;
                return Promise.resolve({});
              }

              throw new Error();
            });

        const { result, suggestedAssetMeta } =
          await tokensController.watchAsset(
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
        await expect(result).rejects.toThrow(
          'User rejected to watch the asset.',
        );
        expect(callActionSpy).toHaveBeenCalledTimes(2);
        expect(callActionSpy).toHaveBeenCalledWith(
          'ApprovalController:addRequest',
          {
            id: suggestedAssetMeta.id,
            origin: ORIGIN_METAMASK,
            type: WATCH_ASSET_METHOD_NAME,
            requestData: {
              id: suggestedAssetMeta.id,
              interactingAddress: suggestedAssetMeta.interactingAddress,
              asset: {
                address: suggestedAssetMeta.asset.address,
                decimals: suggestedAssetMeta.asset.decimals,
                symbol: suggestedAssetMeta.asset.symbol,
                image: null,
              },
            },
          },
          true,
        );
        expect(callActionSpy).toHaveBeenCalledWith(
          'ApprovalController:rejectRequest',
          expect.any(String),
          expect.any(Error),
        );
      },
    );

    it('should accept a valid suggested asset via watchAsset', async () => {
      const callActionSpy = jest.spyOn(messenger, 'call').mockResolvedValue({});
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
      expect(callActionSpy).toHaveBeenCalledTimes(2);
      expect(callActionSpy).toHaveBeenCalledWith(
        'ApprovalController:addRequest',
        {
          id: suggestedAssetMeta.id,
          origin: ORIGIN_METAMASK,
          type: WATCH_ASSET_METHOD_NAME,
          requestData: {
            id: suggestedAssetMeta.id,
            interactingAddress: suggestedAssetMeta.interactingAddress,
            asset: {
              address: suggestedAssetMeta.asset.address,
              decimals: suggestedAssetMeta.asset.decimals,
              symbol: suggestedAssetMeta.asset.symbol,
              image: null,
            },
          },
        },
        true,
      );
      expect(callActionSpy).toHaveBeenCalledWith(
        'ApprovalController:acceptRequest',
        expect.any(String),
      );
    });

    it.each([
      ['resolves', true],
      ['rejects', false],
    ])(
      'should fail a valid suggested asset via watchAsset with wrong type and message to ApprovalController %s',
      async function (_, approvalControllerCallResolves: boolean) {
        let calledOnce = false;
        const callActionSpy = approvalControllerCallResolves
          ? jest.spyOn(messenger, 'call').mockResolvedValue({})
          : jest.spyOn(messenger, 'call').mockImplementation(() => {
              if (!calledOnce) {
                calledOnce = true;
                return Promise.resolve({});
              }

              throw new Error();
            });

        const { result, suggestedAssetMeta } =
          await tokensController.watchAsset(
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
        expect(callActionSpy).toHaveBeenCalledTimes(2);
        expect(callActionSpy).toHaveBeenCalledWith(
          'ApprovalController:addRequest',
          {
            id: suggestedAssetMeta.id,
            origin: ORIGIN_METAMASK,
            type: WATCH_ASSET_METHOD_NAME,
            requestData: {
              id: suggestedAssetMeta.id,
              interactingAddress: suggestedAssetMeta.interactingAddress,
              asset: {
                address: suggestedAssetMeta.asset.address,
                decimals: suggestedAssetMeta.asset.decimals,
                symbol: suggestedAssetMeta.asset.symbol,
                image: null,
              },
            },
          },
          true,
        );
        expect(callActionSpy).toHaveBeenCalledWith(
          'ApprovalController:rejectRequest',
          expect.any(String),
          expect.any(Error),
        );
      },
    );
  });

  describe('onPreferencesStateChange', function () {
    it('should update tokens list when set address changes', async function () {
      const stub = stubCreateEthers(tokensController, false);
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
          image:
            'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x01.png',
          isERC721: false,
          symbol: 'A',
          aggregators: [],
        },
        {
          address: '0x02',
          decimals: 5,
          image:
            'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x02.png',
          isERC721: false,
          symbol: 'B',
          aggregators: [],
        },
      ]);
      preferences.setSelectedAddress('0x2');
      expect(tokensController.state.tokens).toStrictEqual([
        {
          address: '0x03',
          decimals: 6,
          image:
            'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x03.png',
          isERC721: false,
          symbol: 'C',
          aggregators: [],
        },
      ]);

      stub.restore();
    });
  });

  describe('onNetworkStateChange', function () {
    it('should remove a token from its state on corresponding network', async function () {
      const stub = stubCreateEthers(tokensController, false);

      changeNetwork(SEPOLIA);

      await tokensController.addToken('0x01', 'A', 4);
      await tokensController.addToken('0x02', 'B', 5);
      const initialTokensFirst = tokensController.state.tokens;

      changeNetwork(GOERLI);

      await tokensController.addToken('0x03', 'C', 4);
      await tokensController.addToken('0x04', 'D', 5);

      const initialTokensSecond = tokensController.state.tokens;

      expect(initialTokensFirst).not.toStrictEqual(initialTokensSecond);

      expect(initialTokensFirst).toStrictEqual([
        {
          address: '0x01',
          decimals: 4,
          image:
            'https://static.metafi.codefi.network/api/v1/tokenIcons/11155111/0x01.png',
          isERC721: false,
          symbol: 'A',
          aggregators: [],
        },
        {
          address: '0x02',
          decimals: 5,
          image:
            'https://static.metafi.codefi.network/api/v1/tokenIcons/11155111/0x02.png',
          isERC721: false,
          symbol: 'B',
          aggregators: [],
        },
      ]);

      expect(initialTokensSecond).toStrictEqual([
        {
          address: '0x03',
          decimals: 4,
          image:
            'https://static.metafi.codefi.network/api/v1/tokenIcons/5/0x03.png',
          isERC721: false,
          symbol: 'C',
          aggregators: [],
        },
        {
          address: '0x04',
          decimals: 5,
          image:
            'https://static.metafi.codefi.network/api/v1/tokenIcons/5/0x04.png',
          isERC721: false,
          symbol: 'D',
          aggregators: [],
        },
      ]);

      changeNetwork(SEPOLIA);
      expect(initialTokensFirst).toStrictEqual(tokensController.state.tokens);
      changeNetwork(GOERLI);
      expect(initialTokensSecond).toStrictEqual(tokensController.state.tokens);

      stub.restore();
    });
  });

  describe('Clearing nested lists', function () {
    const dummyTokens: Token[] = [
      {
        address: '0x01',
        symbol: 'barA',
        decimals: 2,
        aggregators: [],
        image: undefined,
      },
    ];
    const selectedAddress = '0x1';
    const tokenAddress = '0x01';

    it('should clear nest allTokens under chain ID and selected address when an added token is ignored', async () => {
      tokensController.configure({
        selectedAddress,
        chainId: NetworksChainId.mainnet,
      });
      await tokensController.addTokens(dummyTokens);
      tokensController.ignoreTokens(['0x01']);
      expect(
        tokensController.state.allTokens[NetworksChainId.mainnet][
          selectedAddress
        ],
      ).toStrictEqual([]);
    });

    it('should clear nest allIgnoredTokens under chain ID and selected address when an ignored token is re-added', async () => {
      tokensController.configure({
        selectedAddress,
        chainId: NetworksChainId.mainnet,
      });
      await tokensController.addTokens(dummyTokens);
      tokensController.ignoreTokens([tokenAddress]);
      await tokensController.addTokens(dummyTokens);

      expect(
        tokensController.state.allIgnoredTokens[NetworksChainId.mainnet][
          selectedAddress
        ],
      ).toStrictEqual([]);
    });

    it('should clear nest allDetectedTokens under chain ID and selected address when an detected token is added to tokens list', async () => {
      tokensController.configure({
        selectedAddress,
        chainId: NetworksChainId.mainnet,
      });
      await tokensController.addDetectedTokens(dummyTokens);
      await tokensController.addTokens(dummyTokens);

      expect(
        tokensController.state.allDetectedTokens[NetworksChainId.mainnet][
          selectedAddress
        ],
      ).toStrictEqual([]);
    });
  });
});
