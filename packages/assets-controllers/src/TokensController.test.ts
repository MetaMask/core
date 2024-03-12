import type { ApprovalControllerEvents } from '@metamask/approval-controller';
import {
  ApprovalController,
  type ApprovalControllerState,
} from '@metamask/approval-controller';
import { ControllerMessenger } from '@metamask/base-controller';
import contractMaps from '@metamask/contract-metadata';
import {
  ApprovalType,
  ChainId,
  ERC20,
  NetworkType,
  NetworksTicker,
  ORIGIN_METAMASK,
  convertHexToDecimal,
  toHex,
} from '@metamask/controller-utils';
import type {
  BlockTrackerProxy,
  NetworkController,
  ProviderConfig,
  ProviderProxy,
} from '@metamask/network-controller';
import {
  defaultState as defaultNetworkState,
  NetworkClientType,
} from '@metamask/network-controller';
import type { PreferencesState } from '@metamask/preferences-controller';
import { getDefaultPreferencesState } from '@metamask/preferences-controller';
import nock from 'nock';
import * as sinon from 'sinon';

import { FakeBlockTracker } from '../../../tests/fake-block-tracker';
import { FakeProvider } from '../../../tests/fake-provider';
import { ERC20Standard } from './Standards/ERC20Standard';
import { ERC1155Standard } from './Standards/NftStandards/ERC1155/ERC1155Standard';
import { TOKEN_END_POINT_API } from './token-service';
import type { TokenListState } from './TokenListController';
import type { Token } from './TokenRatesController';
import { TokensController } from './TokensController';
import type { AllowedActions, AllowedEvents } from './TokensController';

jest.mock('uuid', () => {
  return {
    ...jest.requireActual('uuid'),
    v1: () => '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
  };
});

const stubCreateEthers = (ctrl: TokensController, res: () => boolean) => {
  return sinon.stub(ctrl, '_createEthersContract').callsFake(() => {
    return {
      supportsInterface: sinon.stub().returns(res()),
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  });
};
const MAINNET = {
  chainId: ChainId.mainnet,
  type: NetworkType.mainnet,
  ticker: NetworksTicker.mainnet,
};
const mockMainnetClient = {
  configuration: {
    network: 'mainnet',
    ...MAINNET,
    type: NetworkClientType.Infura,
  },
  provider: {} as ProviderProxy,
  blockTracker: {} as BlockTrackerProxy,
  destroy: jest.fn(),
};
const SEPOLIA = {
  chainId: toHex(11155111),
  type: NetworkType.sepolia,
  ticker: NetworksTicker.sepolia,
};
const GOERLI = {
  chainId: toHex(5),
  type: NetworkType.goerli,
  ticker: NetworksTicker.goerli,
};

const controllerName = 'TokensController' as const;

describe('TokensController', () => {
  let tokensController: TokensController;
  let approvalController: ApprovalController;
  let messenger: ControllerMessenger<
    AllowedActions,
    AllowedEvents | ApprovalControllerEvents
  >;
  let tokensControllerMessenger;
  let approvalControllerMessenger;
  let getNetworkClientByIdHandler: jest.Mock<
    ReturnType<NetworkController['getNetworkClientById']>,
    Parameters<NetworkController['getNetworkClientById']>
  >;

  const changeNetwork = (providerConfig: ProviderConfig) => {
    messenger.publish(`NetworkController:networkDidChange`, {
      ...defaultNetworkState,
      providerConfig,
    });
  };

  const triggerPreferencesStateChange = (state: PreferencesState) => {
    messenger.publish('PreferencesController:stateChange', state, []);
  };

  const fakeProvider = new FakeProvider();

  beforeEach(async () => {
    const defaultSelectedAddress = '0x1';
    messenger = new ControllerMessenger();

    approvalControllerMessenger = messenger.getRestricted({
      name: 'ApprovalController',
      allowedActions: [],
      allowedEvents: [],
    });

    tokensControllerMessenger = messenger.getRestricted<
      typeof controllerName,
      AllowedActions['type'],
      AllowedEvents['type']
    >({
      name: controllerName,
      allowedActions: [
        'ApprovalController:addRequest',
        'NetworkController:getNetworkClientById',
      ],
      allowedEvents: [
        'NetworkController:networkDidChange',
        'PreferencesController:stateChange',
        'TokenListController:stateChange',
      ],
    });
    tokensController = new TokensController({
      chainId: ChainId.mainnet,
      config: {
        selectedAddress: defaultSelectedAddress,
        provider: fakeProvider,
      },
      messenger: tokensControllerMessenger,
    });

    approvalController = new ApprovalController({
      messenger: approvalControllerMessenger,
      showApprovalRequest: jest.fn(),
      typesExcludedFromRateLimiting: [ApprovalType.WatchAsset],
    });

    getNetworkClientByIdHandler = jest.fn();
    messenger.registerActionHandler(
      `NetworkController:getNetworkClientById`,
      getNetworkClientByIdHandler.mockReturnValue(
        mockMainnetClient as unknown as ReturnType<
          NetworkController['getNetworkClientById']
        >,
      ),
    );
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should set default state', () => {
    expect(tokensController.state).toStrictEqual({
      allTokens: {},
      allIgnoredTokens: {},
      ignoredTokens: [],
      tokens: [],
      detectedTokens: [],
      allDetectedTokens: {},
    });
  });

  it('should add a token', async () => {
    const stub = stubCreateEthers(tokensController, () => false);
    await tokensController.addToken({
      address: '0x01',
      symbol: 'bar',
      decimals: 2,
    });
    expect(tokensController.state.tokens[0]).toStrictEqual({
      address: '0x01',
      decimals: 2,
      image:
        'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x01.png',
      symbol: 'bar',
      isERC721: false,
      aggregators: [],
      name: undefined,
    });
    await tokensController.addToken({
      address: '0x01',
      symbol: 'baz',
      decimals: 2,
    });
    expect(tokensController.state.tokens[0]).toStrictEqual({
      address: '0x01',
      decimals: 2,
      image:
        'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x01.png',
      symbol: 'baz',
      isERC721: false,
      aggregators: [],
      name: undefined,
    });
    stub.restore();
  });

  it('should add tokens', async () => {
    const stub = stubCreateEthers(tokensController, () => false);

    await tokensController.addTokens([
      {
        address: '0x01',
        symbol: 'barA',
        decimals: 2,
        aggregators: [],
        name: 'Token1',
      },
      {
        address: '0x02',
        symbol: 'barB',
        decimals: 2,
        aggregators: [],
        name: 'Token2',
      },
    ]);

    expect(tokensController.state.tokens[0]).toStrictEqual({
      address: '0x01',
      decimals: 2,
      image: undefined,
      symbol: 'barA',
      aggregators: [],
      name: 'Token1',
    });

    expect(tokensController.state.tokens[1]).toStrictEqual({
      address: '0x02',
      decimals: 2,
      image: undefined,
      symbol: 'barB',
      aggregators: [],
      name: 'Token2',
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
      name: undefined,
    });

    expect(tokensController.state.tokens[1]).toStrictEqual({
      address: '0x02',
      decimals: 2,
      image: undefined,
      symbol: 'bazB',
      aggregators: [],
      name: undefined,
    });

    stub.restore();
  });

  it('should add detected tokens', async () => {
    const stub = stubCreateEthers(tokensController, () => false);

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
      name: undefined,
    });

    expect(tokensController.state.detectedTokens[1]).toStrictEqual({
      address: '0x02',
      decimals: 2,
      image: undefined,
      symbol: 'barB',
      aggregators: [],
      isERC721: undefined,
      name: undefined,
    });

    await tokensController.addDetectedTokens([
      {
        address: '0x01',
        symbol: 'bazA',
        decimals: 2,
        aggregators: [],
        isERC721: undefined,
        name: undefined,
      },
      {
        address: '0x02',
        symbol: 'bazB',
        decimals: 2,
        aggregators: [],
        isERC721: undefined,
        name: undefined,
      },
    ]);

    expect(tokensController.state.detectedTokens[0]).toStrictEqual({
      address: '0x01',
      decimals: 2,
      image: undefined,
      symbol: 'bazA',
      aggregators: [],
      isERC721: undefined,
      name: undefined,
    });

    expect(tokensController.state.detectedTokens[1]).toStrictEqual({
      address: '0x02',
      decimals: 2,
      image: undefined,
      symbol: 'bazB',
      aggregators: [],
      isERC721: undefined,
      name: undefined,
    });

    stub.restore();
  });

  it('should add token by selected address', async () => {
    const stub = stubCreateEthers(tokensController, () => false);

    const firstAddress = '0x123';
    const secondAddress = '0x321';

    triggerPreferencesStateChange({
      ...getDefaultPreferencesState(),
      selectedAddress: firstAddress,
    });
    await tokensController.addToken({
      address: '0x01',
      symbol: 'bar',
      decimals: 2,
    });
    triggerPreferencesStateChange({
      ...getDefaultPreferencesState(),
      selectedAddress: secondAddress,
    });
    expect(tokensController.state.tokens).toHaveLength(0);
    triggerPreferencesStateChange({
      ...getDefaultPreferencesState(),
      selectedAddress: firstAddress,
    });
    expect(tokensController.state.tokens[0]).toStrictEqual({
      address: '0x01',
      decimals: 2,
      image:
        'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x01.png',
      symbol: 'bar',
      isERC721: false,
      aggregators: [],
      name: undefined,
    });

    stub.restore();
  });

  it('should add token by network', async () => {
    const stub = stubCreateEthers(tokensController, () => false);
    changeNetwork(SEPOLIA);
    await tokensController.addToken({
      address: '0x01',
      symbol: 'bar',
      decimals: 2,
    });
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
      name: undefined,
    });

    stub.restore();
  });

  it('should add token to the correct chainId when passed a networkClientId', async () => {
    const stub = stubCreateEthers(tokensController, () => false);
    getNetworkClientByIdHandler.mockReturnValue({
      configuration: { chainId: '0x5' },
    } as unknown as ReturnType<NetworkController['getNetworkClientById']>);
    await tokensController.addToken({
      address: '0x01',
      symbol: 'bar',
      decimals: 2,
      networkClientId: 'networkClientId1',
    });
    expect(tokensController.state.tokens[0]).toStrictEqual({
      address: '0x01',
      decimals: 2,
      image:
        'https://static.metafi.codefi.network/api/v1/tokenIcons/5/0x01.png',
      symbol: 'bar',
      isERC721: false,
      aggregators: [],
      name: undefined,
    });
    expect(tokensController.state.allTokens['0x5']['0x1']).toStrictEqual([
      {
        address: '0x01',
        decimals: 2,
        image:
          'https://static.metafi.codefi.network/api/v1/tokenIcons/5/0x01.png',
        symbol: 'bar',
        isERC721: false,
        aggregators: [],
        name: undefined,
      },
    ]);

    expect(getNetworkClientByIdHandler).toHaveBeenCalledWith(
      'networkClientId1',
    );
    stub.restore();
  });

  it('should remove token', async () => {
    const stub = stubCreateEthers(tokensController, () => false);
    await tokensController.addToken({
      address: '0x01',
      symbol: 'bar',
      decimals: 2,
    });
    tokensController.ignoreTokens(['0x01']);
    expect(tokensController.state.tokens).toHaveLength(0);
    stub.restore();
  });

  it('should remove detected token', async () => {
    const stub = stubCreateEthers(tokensController, () => false);
    await tokensController.addDetectedTokens([
      {
        address: '0x01',
        symbol: 'bar',
        decimals: 2,
      },
    ]);
    tokensController.ignoreTokens(['0x01']);
    expect(tokensController.state.detectedTokens).toHaveLength(0);
    stub.restore();
  });

  it('should remove token by selected address', async () => {
    const stub = stubCreateEthers(tokensController, () => false);
    const firstAddress = '0x123';
    const secondAddress = '0x321';
    triggerPreferencesStateChange({
      ...getDefaultPreferencesState(),
      selectedAddress: firstAddress,
    });
    await tokensController.addToken({
      address: '0x02',
      symbol: 'baz',
      decimals: 2,
    });
    triggerPreferencesStateChange({
      ...getDefaultPreferencesState(),
      selectedAddress: secondAddress,
    });
    await tokensController.addToken({
      address: '0x01',
      symbol: 'bar',
      decimals: 2,
    });
    tokensController.ignoreTokens(['0x01']);
    expect(tokensController.state.tokens).toHaveLength(0);
    triggerPreferencesStateChange({
      ...getDefaultPreferencesState(),
      selectedAddress: firstAddress,
    });
    expect(tokensController.state.tokens[0]).toStrictEqual({
      address: '0x02',
      decimals: 2,
      image:
        'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x02.png',
      symbol: 'baz',
      isERC721: false,
      aggregators: [],
      name: undefined,
    });
    stub.restore();
  });

  it('should remove token by provider type', async () => {
    const stub = stubCreateEthers(tokensController, () => false);
    changeNetwork(SEPOLIA);
    await tokensController.addToken({
      address: '0x02',
      symbol: 'baz',
      decimals: 2,
    });
    changeNetwork(GOERLI);
    await tokensController.addToken({
      address: '0x01',
      symbol: 'bar',
      decimals: 2,
    });
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
      name: undefined,
    });
    stub.restore();
  });

  describe('ignoredTokens', () => {
    const defaultSelectedAddress = '0x0001';

    let createEthersStub: sinon.SinonStub;
    beforeEach(() => {
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        selectedAddress: defaultSelectedAddress,
      });
      changeNetwork(SEPOLIA);

      createEthersStub = stubCreateEthers(tokensController, () => false);
    });

    afterEach(() => {
      createEthersStub.restore();
    });

    it('should remove token from ignoredTokens/allIgnoredTokens lists if added back via addToken', async () => {
      await tokensController.addToken({
        address: '0x01',
        symbol: 'foo',
        decimals: 2,
      });
      await tokensController.addToken({
        address: '0xFAa',
        symbol: 'bar',
        decimals: 3,
      });
      expect(tokensController.state.ignoredTokens).toHaveLength(0);
      expect(tokensController.state.tokens).toHaveLength(2);
      tokensController.ignoreTokens(['0x01']);
      expect(tokensController.state.tokens).toHaveLength(1);
      expect(tokensController.state.ignoredTokens).toHaveLength(1);
      await tokensController.addToken({
        address: '0x01',
        symbol: 'baz',
        decimals: 2,
      });
      expect(tokensController.state.tokens).toHaveLength(2);
      expect(tokensController.state.ignoredTokens).toHaveLength(0);
    });

    it('should remove a token from the ignoredTokens/allIgnoredTokens lists if re-added as part of a bulk addTokens add', async () => {
      const selectedAddress = '0x0001';
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        selectedAddress,
      });
      changeNetwork(SEPOLIA);
      await tokensController.addToken({
        address: '0x01',
        symbol: 'bar',
        decimals: 2,
      });
      await tokensController.addToken({
        address: '0xFAa',
        symbol: 'bar',
        decimals: 3,
      });
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
      await tokensController.addToken({
        address: '0x01',
        symbol: 'bar',
        decimals: 2,
      });
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

      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        selectedAddress: selectedAddress1,
      });
      changeNetwork(SEPOLIA);

      await tokensController.addToken({
        address: '0x01',
        symbol: 'bar',
        decimals: 2,
      });
      expect(tokensController.state.ignoredTokens).toHaveLength(0);
      tokensController.ignoreTokens(['0x01']);
      expect(tokensController.state.tokens).toHaveLength(0);

      expect(tokensController.state.ignoredTokens).toStrictEqual(['0x01']);
      changeNetwork(GOERLI);

      expect(tokensController.state.ignoredTokens).toHaveLength(0);
      await tokensController.addToken({
        address: '0x02',
        symbol: 'bazz',
        decimals: 3,
      });
      tokensController.ignoreTokens(['0x02']);
      expect(tokensController.state.ignoredTokens).toStrictEqual(['0x02']);

      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        selectedAddress: selectedAddress2,
      });
      expect(tokensController.state.ignoredTokens).toHaveLength(0);
      await tokensController.addToken({
        address: '0x03',
        symbol: 'foo',
        decimals: 4,
      });
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
    const stub = stubCreateEthers(tokensController, () => false);
    await tokensController.addToken({
      address: '0x01',
      symbol: 'A',
      decimals: 4,
    });
    await tokensController.addToken({
      address: '0x02',
      symbol: 'B',
      decimals: 5,
    });
    expect(tokensController.state.tokens).toStrictEqual([
      {
        address: '0x01',
        decimals: 4,
        image:
          'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x01.png',
        isERC721: false,
        symbol: 'A',
        aggregators: [],
        name: undefined,
      },
      {
        address: '0x02',
        decimals: 5,
        image:
          'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x02.png',
        isERC721: false,
        symbol: 'B',
        aggregators: [],
        name: undefined,
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
        const stub = stubCreateEthers(tokensController, () => true);
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
        const stub = stubCreateEthers(tokensController, () => false);
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
        await tokensController.addToken({ address, symbol, decimals });

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
        const stub = stubCreateEthers(tokensController, () => true);
        const tokenAddress = '0xDA5584Cc586d07c7141aA427224A4Bd58E64aF7D';

        await tokensController.addToken({
          address: tokenAddress,
          symbol: 'REST',
          decimals: 4,
        });

        expect(tokensController.state.tokens).toStrictEqual([
          {
            address: tokenAddress,
            symbol: 'REST',
            isERC721: true,
            image:
              'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0xda5584cc586d07c7141aa427224a4bd58e64af7d.png',
            decimals: 4,
            aggregators: [],
            name: undefined,
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

        await tokensController.addToken({ address, symbol, decimals });

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
        const stub = stubCreateEthers(tokensController, () => false);
        const tokenAddress = '0xDA5584Cc586d07c7141aA427224A4Bd58E64aF7D';

        await tokensController.addToken({
          address: tokenAddress,
          symbol: 'LEST',
          decimals: 5,
        });

        expect(tokensController.state.tokens).toStrictEqual([
          {
            address: tokenAddress,
            symbol: 'LEST',
            isERC721: false,
            image:
              'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0xda5584cc586d07c7141aa427224a4bd58e64af7d.png',
            decimals: 5,
            aggregators: [],
            name: undefined,
          },
        ]);

        stub.restore();
      });

      it('should throw error if switching networks while adding token', async function () {
        const dummyTokenAddress = '0x514910771AF9Ca656af840dff83E8264EcF986CA';
        const addTokenPromise = tokensController.addToken({
          address: dummyTokenAddress,
          symbol: 'LINK',
          decimals: 18,
        });
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
        .get(
          `/token/${convertHexToDecimal(
            ChainId.mainnet,
          )}?address=${dummyTokenAddress}`,
        )
        .reply(200, { error })
        .persist();

      await expect(
        tokensController.addToken({
          address: dummyTokenAddress,
          symbol: 'LINK',
          decimals: 18,
        }),
      ).rejects.toThrow(fullErrorMessage);
    });

    it('should add token that was previously a detected token', async () => {
      const stub = stubCreateEthers(tokensController, () => false);
      const dummyDetectedToken: Token = {
        address: '0x01',
        symbol: 'barA',
        decimals: 2,
        aggregators: [],
        image: undefined,
        isERC721: false,
        name: undefined,
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

      await tokensController.addToken({
        address: dummyDetectedToken.address,
        symbol: dummyDetectedToken.symbol,
        decimals: dummyDetectedToken.decimals,
      });

      expect(tokensController.state.detectedTokens).toStrictEqual([]);
      expect(tokensController.state.tokens).toStrictEqual([dummyAddedToken]);

      stub.restore();
    });

    it('should add tokens to the correct chainId/selectedAddress on which they were detected even if its not the currently configured chainId/selectedAddress', async () => {
      const stub = stubCreateEthers(tokensController, () => false);

      // The currently configured chain + address
      const CONFIGURED_CHAIN = SEPOLIA;
      const CONFIGURED_ADDRESS = '0xConfiguredAddress';
      changeNetwork(CONFIGURED_CHAIN);
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        selectedAddress: CONFIGURED_ADDRESS,
      });

      // A different chain + address
      const OTHER_CHAIN = '0xOtherChainId';
      const OTHER_ADDRESS = '0xOtherAddress';

      // Mock some tokens to add
      const generateTokens = (len: number) =>
        [...Array(len)].map((_, i) => ({
          address: `0x${i}`,
          symbol: String.fromCharCode(65 + i),
          decimals: 2,
          aggregators: [],
          name: undefined,
          isERC721: false,
          image: `https://static.metafi.codefi.network/api/v1/tokenIcons/11155111/0x${i}.png`,
        }));

      const [
        addedTokenConfiguredAccount,
        detectedTokenConfiguredAccount,
        detectedTokenOtherAccount,
      ] = generateTokens(3);

      // Run twice to ensure idempotency
      for (let i = 0; i < 2; i++) {
        // Add and detect some tokens on the configured chain + account
        await tokensController.addToken(addedTokenConfiguredAccount);
        await tokensController.addDetectedTokens([
          detectedTokenConfiguredAccount,
        ]);

        // Detect a token on the other chain + account
        await tokensController.addDetectedTokens([detectedTokenOtherAccount], {
          selectedAddress: OTHER_ADDRESS,
          chainId: OTHER_CHAIN,
        });

        // Expect tokens on the configured account
        expect(tokensController.state.tokens).toStrictEqual([
          addedTokenConfiguredAccount,
        ]);
        expect(tokensController.state.detectedTokens).toStrictEqual([
          detectedTokenConfiguredAccount,
        ]);

        // Expect tokens under the correct chain + account
        expect(tokensController.state.allTokens).toStrictEqual({
          [CONFIGURED_CHAIN.chainId]: {
            [CONFIGURED_ADDRESS]: [addedTokenConfiguredAccount],
          },
        });
        expect(tokensController.state.allDetectedTokens).toStrictEqual({
          [CONFIGURED_CHAIN.chainId]: {
            [CONFIGURED_ADDRESS]: [detectedTokenConfiguredAccount],
          },
          [OTHER_CHAIN]: {
            [OTHER_ADDRESS]: [detectedTokenOtherAccount],
          },
        });
      }

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
          name: undefined,
        },
        {
          address: '0x02',
          symbol: 'barB',
          decimals: 2,
          aggregators: [],
          image: undefined,
          name: undefined,
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

    it('should add tokens to the correct chainId when passed a networkClientId', async () => {
      getNetworkClientByIdHandler.mockReturnValue({
        configuration: { chainId: '0x5' },
      } as unknown as ReturnType<NetworkController['getNetworkClientById']>);
      const dummyTokens: Token[] = [
        {
          address: '0x01',
          symbol: 'barA',
          decimals: 2,
          aggregators: [],
          image: undefined,
          name: undefined,
        },
        {
          address: '0x02',
          symbol: 'barB',
          decimals: 2,
          aggregators: [],
          image: undefined,
          name: undefined,
        },
      ];

      await tokensController.addTokens(dummyTokens, 'networkClientId1');

      expect(tokensController.state.tokens).toStrictEqual(dummyTokens);
      expect(tokensController.state.allTokens['0x5']['0x1']).toStrictEqual(
        dummyTokens,
      );
      expect(getNetworkClientByIdHandler).toHaveBeenCalledWith(
        'networkClientId1',
      );
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
        chainId: ChainId.mainnet,
      });
      const processedTokens = tokensController._getNewAllTokensState({
        newTokens: dummyTokens,
      });
      expect(
        processedTokens.newAllTokens[ChainId.mainnet][dummySelectedAddress],
      ).toStrictEqual(dummyTokens);
    });

    it('should nest detectedTokens under chain ID and selected address when provided with detectedTokens as input', () => {
      tokensController.configure({
        selectedAddress: dummySelectedAddress,
        chainId: ChainId.mainnet,
      });
      const processedTokens = tokensController._getNewAllTokensState({
        newDetectedTokens: dummyTokens,
      });
      expect(
        processedTokens.newAllDetectedTokens[ChainId.mainnet][
          dummySelectedAddress
        ],
      ).toStrictEqual(dummyTokens);
    });

    it('should nest ignoredTokens under chain ID and selected address when provided with ignoredTokens as input', () => {
      tokensController.configure({
        selectedAddress: dummySelectedAddress,
        chainId: ChainId.mainnet,
      });
      const dummyIgnoredTokens = [dummyTokens[0].address];
      const processedTokens = tokensController._getNewAllTokensState({
        newIgnoredTokens: dummyIgnoredTokens,
      });
      expect(
        processedTokens.newAllIgnoredTokens[ChainId.mainnet][
          dummySelectedAddress
        ],
      ).toStrictEqual(dummyIgnoredTokens);
    });
  });

  describe('watchAsset', function () {
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let asset: any, type: any;
    const interactingAddress = '0x2';
    const requestId = '12345';
    let isERC721: boolean, isERC1155: boolean;

    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockContract = (mockAssets: any[]) =>
      mockAssets.forEach((a) => {
        jest
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .spyOn(ERC20Standard.prototype as any, 'getTokenName')
          .mockImplementationOnce(() => a.name);
        jest
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .spyOn(ERC20Standard.prototype as any, 'getTokenSymbol')
          .mockImplementationOnce(() => a.symbol);
        jest
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .spyOn(ERC20Standard.prototype as any, 'getTokenDecimals')
          .mockImplementationOnce(() => a.decimals?.toString());
      });
    let createEthersStub: sinon.SinonStub;
    beforeEach(function () {
      type = ERC20;
      asset = {
        address: '0x000000000000000000000000000000000000dEaD',
        decimals: 12,
        symbol: 'SES',
        image: 'image',
        name: undefined,
      };

      isERC721 = false;
      isERC1155 = false;
      createEthersStub = stubCreateEthers(tokensController, () => isERC721);
      jest
        .spyOn(
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ERC1155Standard.prototype as any,
          'contractSupportsBase1155Interface',
        )
        .mockImplementation(() => isERC1155);
    });

    afterEach(() => {
      createEthersStub.restore();
    });

    it('should error if passed no type', async function () {
      type = undefined;
      const result = tokensController.watchAsset({ asset, type });
      await expect(result).rejects.toThrow(
        'Asset of type undefined not supported',
      );
    });

    it('should error if asset type is not supported', async function () {
      type = 'ERC721';
      const result = tokensController.watchAsset({ asset, type });
      await expect(result).rejects.toThrow(
        'Asset of type ERC721 not supported',
      );
    });

    it('should error if the contract is ERC721', async function () {
      isERC721 = true;
      const result = tokensController.watchAsset({ asset, type });
      await expect(result).rejects.toThrow(
        'Contract 0x000000000000000000000000000000000000dEaD must match type ERC20, but was detected as ERC721',
      );
    });

    it('should error if the contract is ERC1155', async function () {
      isERC1155 = true;
      const result = tokensController.watchAsset({ asset, type });
      await expect(result).rejects.toThrow(
        'Contract 0x000000000000000000000000000000000000dEaD must match type ERC20, but was detected as ERC1155',
      );
    });

    it('should error if address is not defined', async function () {
      asset.address = undefined;
      const result = tokensController.watchAsset({ asset, type });
      await expect(result).rejects.toThrow('Address must be specified');
    });

    it('should error if decimals is not defined', async function () {
      asset.decimals = undefined;
      const result = tokensController.watchAsset({ asset, type });
      await expect(result).rejects.toThrow(
        'Decimals are required, but were not found in either the request or contract',
      );
    });

    it('should error if symbol is not defined', async function () {
      asset.symbol = { foo: 'bar' };
      const result = tokensController.watchAsset({ asset, type });
      await expect(result).rejects.toThrow('Invalid symbol: not a string');
    });

    it('should error if symbol is not a string', async function () {
      asset.symbol = undefined;
      const result = tokensController.watchAsset({ asset, type });
      await expect(result).rejects.toThrow(
        'A symbol is required, but was not found in either the request or contract',
      );
    });

    it('should error if symbol is empty', async function () {
      asset.symbol = '';
      const result = tokensController.watchAsset({ asset, type });
      await expect(result).rejects.toThrow(
        'A symbol is required, but was not found in either the request or contract',
      );
    });

    it('should error if symbol is too long', async function () {
      asset.symbol = 'ABCDEFGHIJKLM';
      const result = tokensController.watchAsset({ asset, type });
      await expect(result).rejects.toThrow(
        'Invalid symbol "ABCDEFGHIJKLM": longer than 11 characters',
      );
    });

    it('should error if decimals is invalid', async function () {
      asset.decimals = -1;
      const result = tokensController.watchAsset({ asset, type });
      await expect(result).rejects.toThrow(
        'Invalid decimals "-1": must be an integer 0 <= 36',
      );

      asset.decimals = 37;
      const result2 = tokensController.watchAsset({ asset, type });
      await expect(result2).rejects.toThrow(
        'Invalid decimals "37": must be an integer 0 <= 36',
      );
    });

    it('should error if address is invalid', async function () {
      asset.address = '0x123';
      const result = tokensController.watchAsset({ asset, type });
      await expect(result).rejects.toThrow('Invalid address "0x123"');
    });

    it('fails with an invalid type suggested', async () => {
      await expect(
        tokensController.watchAsset({
          asset: {
            address: '0xe9f786dfdd9ae4d57e830acb52296837765f0e5b',
            decimals: 18,
            symbol: 'TKN',
          },
          type: 'ERC721',
        }),
      ).rejects.toThrow('Asset of type ERC721 not supported');
    });

    it("should error if the asset's symbol or decimals don't match the contract", async function () {
      mockContract([asset, asset]);

      // Symbol
      let result = tokensController.watchAsset({
        asset: { ...asset, symbol: 'OTHER' },
        type,
      });
      await expect(result).rejects.toThrow(
        'The symbol in the request (OTHER) does not match the symbol in the contract (SES)',
      );

      // Decimals
      result = tokensController.watchAsset({
        asset: { ...asset, decimals: 1 },
        type,
      });
      await expect(result).rejects.toThrow(
        'The decimals in the request (1) do not match the decimals in the contract (12)',
      );
    });

    it('should use symbols/decimals from contract, and allow them to be optional in the request', async function () {
      mockContract([asset]);

      jest.spyOn(messenger, 'call').mockResolvedValue(undefined);
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const reqAsset: any = {
        ...asset,
        symbol: undefined,
        decimals: undefined,
      };
      await tokensController.watchAsset({ asset: reqAsset, type });
      expect(tokensController.state.tokens).toStrictEqual([
        {
          isERC721: false,
          aggregators: [],
          ...asset,
        },
      ]);
    });

    it('should use symbols/decimals from request, and allow them to be optional in the contract', async function () {
      jest.spyOn(messenger, 'call').mockResolvedValue(undefined);
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const reqAsset: any = { ...asset, symbol: 'MYSYMBOL', decimals: 13 };
      await tokensController.watchAsset({ asset: reqAsset, type });
      expect(tokensController.state.tokens).toStrictEqual([
        {
          isERC721: false,
          aggregators: [],
          ...reqAsset,
        },
      ]);
    });

    it("should validate that symbol and decimals match if they're defined in both the request and contract", async function () {
      mockContract([asset, asset]);

      let result = tokensController.watchAsset({
        asset: { ...asset, symbol: 'DIFFERENT' },
        type,
      });
      await expect(result).rejects.toThrow(
        'The symbol in the request (DIFFERENT) does not match the symbol in the contract (SES)',
      );

      result = tokensController.watchAsset({
        asset: { ...asset, decimals: 2 },
        type,
      });
      await expect(result).rejects.toThrow(
        'The decimals in the request (2) do not match the decimals in the contract (12)',
      );
    });

    it('should perform case insensitive validation of symbols', async function () {
      asset.symbol = 'ABC';
      mockContract([asset, asset]);
      jest.spyOn(messenger, 'call').mockResolvedValue(undefined);

      await tokensController.watchAsset({
        asset: { ...asset, symbol: 'abc' },
        type,
      });
      expect(tokensController.state.tokens).toStrictEqual([
        {
          isERC721: false,
          aggregators: [],
          ...asset, // but use the casing from the contract
        },
      ]);
    });

    it('should be lenient when accepting string vs integer for decimals', async () => {
      jest.spyOn(messenger, 'call').mockResolvedValue(undefined);
      for (const decimals of [6, '6']) {
        asset.decimals = decimals;
        mockContract([asset]);

        await tokensController.watchAsset({ asset, type });
        expect(tokensController.state.tokens).toStrictEqual([
          {
            isERC721: false,
            aggregators: [],
            ...asset,
            // But it should get parsed to a number
            decimals: parseInt(decimals as string),
          },
        ]);
      }
    });

    it('stores token correctly if user confirms', async () => {
      const generateRandomIdStub = jest
        .spyOn(tokensController, '_generateRandomId')
        .mockReturnValue(requestId);

      const callActionSpy = jest
        .spyOn(messenger, 'call')
        .mockResolvedValue(undefined);

      await tokensController.watchAsset({ asset, type });

      expect(tokensController.state.tokens).toHaveLength(1);
      expect(tokensController.state.tokens).toStrictEqual([
        {
          isERC721: false,
          aggregators: [],
          ...asset,
        },
      ]);
      expect(callActionSpy).toHaveBeenCalledTimes(1);
      expect(callActionSpy).toHaveBeenCalledWith(
        'ApprovalController:addRequest',
        {
          id: requestId,
          origin: ORIGIN_METAMASK,
          type: ApprovalType.WatchAsset,
          requestData: {
            id: requestId,
            interactingAddress: '0x1',
            asset,
          },
        },
        true,
      );

      generateRandomIdStub.mockRestore();
    });

    it('stores token correctly under interacting address if user confirms', async function () {
      const generateRandomIdStub = jest
        .spyOn(tokensController, '_generateRandomId')
        .mockReturnValue(requestId);

      const callActionSpy = jest
        .spyOn(messenger, 'call')
        .mockResolvedValue(undefined);

      await tokensController.watchAsset({ asset, type, interactingAddress });

      expect(tokensController.state.tokens).toHaveLength(0);
      expect(tokensController.state.tokens).toStrictEqual([]);
      expect(
        tokensController.state.allTokens[ChainId.mainnet][interactingAddress],
      ).toHaveLength(1);
      expect(
        tokensController.state.allTokens[ChainId.mainnet][interactingAddress],
      ).toStrictEqual([
        {
          isERC721: false,
          aggregators: [],
          ...asset,
        },
      ]);
      expect(callActionSpy).toHaveBeenCalledTimes(1);
      expect(callActionSpy).toHaveBeenCalledWith(
        'ApprovalController:addRequest',
        {
          id: requestId,
          origin: ORIGIN_METAMASK,
          type: ApprovalType.WatchAsset,
          requestData: {
            id: requestId,
            interactingAddress,
            asset,
          },
        },
        true,
      );

      generateRandomIdStub.mockRestore();
    });

    it('stores token correctly when passed a networkClientId', async function () {
      getNetworkClientByIdHandler.mockImplementation((networkClientId) => {
        expect(networkClientId).toBe('networkClientId1');
        return {
          configuration: { chainId: '0x5' },
          provider: fakeProvider,
          blockTracker: new FakeBlockTracker(),
          destroy: jest.fn(),
        } as unknown as ReturnType<NetworkController['getNetworkClientById']>;
      });

      const addRequestHandler = jest.fn();
      messenger.unregisterActionHandler(`ApprovalController:addRequest`);
      messenger.registerActionHandler(
        `ApprovalController:addRequest`,
        addRequestHandler,
      );

      const generateRandomIdStub = jest
        .spyOn(tokensController, '_generateRandomId')
        .mockReturnValue(requestId);

      await tokensController.watchAsset({
        asset,
        type,
        interactingAddress,
        networkClientId: 'networkClientId1',
      });

      expect(addRequestHandler).toHaveBeenCalledWith(
        {
          id: requestId,
          origin: ORIGIN_METAMASK,
          type: ApprovalType.WatchAsset,
          requestData: {
            id: requestId,
            interactingAddress,
            asset,
          },
        },
        true,
      );

      expect(tokensController.state.tokens).toHaveLength(0);
      expect(tokensController.state.tokens).toStrictEqual([]);
      expect(
        tokensController.state.allTokens['0x5'][interactingAddress],
      ).toHaveLength(1);
      expect(
        tokensController.state.allTokens['0x5'][interactingAddress],
      ).toStrictEqual([
        {
          isERC721: false,
          aggregators: [],
          ...asset,
        },
      ]);
      generateRandomIdStub.mockRestore();
    });

    it('throws and token is not added if pending approval fails', async function () {
      const generateRandomIdStub = jest
        .spyOn(tokensController, '_generateRandomId')
        .mockReturnValue(requestId);

      const errorMessage = 'Mock Error Message';
      const callActionSpy = jest
        .spyOn(messenger, 'call')
        .mockRejectedValue(new Error(errorMessage));

      await expect(
        tokensController.watchAsset({ asset, type }),
      ).rejects.toThrow(errorMessage);

      expect(tokensController.state.tokens).toHaveLength(0);
      expect(tokensController.state.tokens).toStrictEqual([]);
      expect(callActionSpy).toHaveBeenCalledTimes(1);
      expect(callActionSpy).toHaveBeenCalledWith(
        'ApprovalController:addRequest',
        {
          id: requestId,
          origin: ORIGIN_METAMASK,
          type: ApprovalType.WatchAsset,
          requestData: {
            id: requestId,
            interactingAddress: '0x1',
            asset,
          },
        },
        true,
      );

      generateRandomIdStub.mockRestore();
    });

    it('stores multiple tokens from a batched watchAsset confirmation screen correctly when user confirms', async () => {
      const generateRandomIdStub = jest
        .spyOn(tokensController, '_generateRandomId')
        .mockImplementationOnce(() => requestId)
        .mockImplementationOnce(() => '67890');

      const acceptedRequest = new Promise<void>((resolve) => {
        tokensController.subscribe((state) => {
          if (
            state.allTokens?.[ChainId.mainnet]?.[interactingAddress].length ===
            2
          ) {
            resolve();
          }
        });
      });

      const anotherAsset = {
        address: '0x000000000000000000000000000000000000ABcD',
        decimals: 18,
        symbol: 'TEST',
        image: 'image2',
        name: undefined,
      };

      mockContract([asset, anotherAsset]);

      const promiseForApprovals = new Promise<void>((resolve) => {
        const listener = (state: ApprovalControllerState) => {
          if (state.pendingApprovalCount === 2) {
            messenger.unsubscribe('ApprovalController:stateChange', listener);
            resolve();
          }
        };
        messenger.subscribe('ApprovalController:stateChange', listener);
      });

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      tokensController.watchAsset({ asset, type, interactingAddress });

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      tokensController.watchAsset({
        asset: anotherAsset,
        type,
        interactingAddress,
      });

      await promiseForApprovals;

      await approvalController.accept(requestId);
      await approvalController.accept('67890');
      await acceptedRequest;

      expect(
        tokensController.state.allTokens[ChainId.mainnet][interactingAddress],
      ).toStrictEqual([
        {
          isERC721: false,
          aggregators: [],
          ...asset,
        },
        {
          isERC721: false,
          aggregators: [],
          ...anotherAsset,
        },
      ]);
      generateRandomIdStub.mockRestore();
    });
  });

  describe('onPreferencesStateChange', function () {
    it('should update tokens list when set address changes', async function () {
      const stub = stubCreateEthers(tokensController, () => false);
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        selectedAddress: '0x1',
      });
      await tokensController.addToken({
        address: '0x01',
        symbol: 'A',
        decimals: 4,
      });
      await tokensController.addToken({
        address: '0x02',
        symbol: 'B',
        decimals: 5,
      });
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        selectedAddress: '0x2',
      });
      expect(tokensController.state.tokens).toStrictEqual([]);
      await tokensController.addToken({
        address: '0x03',
        symbol: 'C',
        decimals: 6,
      });
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        selectedAddress: '0x1',
      });
      expect(tokensController.state.tokens).toStrictEqual([
        {
          address: '0x01',
          decimals: 4,
          image:
            'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x01.png',
          isERC721: false,
          symbol: 'A',
          aggregators: [],
          name: undefined,
        },
        {
          address: '0x02',
          decimals: 5,
          image:
            'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x02.png',
          isERC721: false,
          symbol: 'B',
          aggregators: [],
          name: undefined,
        },
      ]);
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        selectedAddress: '0x2',
      });
      expect(tokensController.state.tokens).toStrictEqual([
        {
          address: '0x03',
          decimals: 6,
          image:
            'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x03.png',
          isERC721: false,
          symbol: 'C',
          aggregators: [],
          name: undefined,
        },
      ]);

      stub.restore();
    });
  });

  describe('onNetworkDidChange', function () {
    it('should remove a token from its state on corresponding network', async function () {
      const stub = stubCreateEthers(tokensController, () => false);

      changeNetwork(SEPOLIA);

      await tokensController.addToken({
        address: '0x01',
        symbol: 'A',
        decimals: 4,
      });
      await tokensController.addToken({
        address: '0x02',
        symbol: 'B',
        decimals: 5,
      });
      const initialTokensFirst = tokensController.state.tokens;

      changeNetwork(GOERLI);

      await tokensController.addToken({
        address: '0x03',
        symbol: 'C',
        decimals: 4,
      });
      await tokensController.addToken({
        address: '0x04',
        symbol: 'D',
        decimals: 5,
      });

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
          name: undefined,
        },
        {
          address: '0x02',
          decimals: 5,
          image:
            'https://static.metafi.codefi.network/api/v1/tokenIcons/11155111/0x02.png',
          isERC721: false,
          symbol: 'B',
          aggregators: [],
          name: undefined,
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
          name: undefined,
        },
        {
          address: '0x04',
          decimals: 5,
          image:
            'https://static.metafi.codefi.network/api/v1/tokenIcons/5/0x04.png',
          isERC721: false,
          symbol: 'D',
          aggregators: [],
          name: undefined,
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
        chainId: ChainId.mainnet,
      });
      await tokensController.addTokens(dummyTokens);
      tokensController.ignoreTokens(['0x01']);
      expect(
        tokensController.state.allTokens[ChainId.mainnet][selectedAddress],
      ).toStrictEqual([]);
    });

    it('should clear nest allIgnoredTokens under chain ID and selected address when an ignored token is re-added', async () => {
      tokensController.configure({
        selectedAddress,
        chainId: ChainId.mainnet,
      });
      await tokensController.addTokens(dummyTokens);
      tokensController.ignoreTokens([tokenAddress]);
      await tokensController.addTokens(dummyTokens);

      expect(
        tokensController.state.allIgnoredTokens[ChainId.mainnet][
          selectedAddress
        ],
      ).toStrictEqual([]);
    });

    it('should clear nest allDetectedTokens under chain ID and selected address when an detected token is added to tokens list', async () => {
      tokensController.configure({
        selectedAddress,
        chainId: ChainId.mainnet,
      });
      await tokensController.addDetectedTokens(dummyTokens);
      await tokensController.addTokens(dummyTokens);

      expect(
        tokensController.state.allDetectedTokens[ChainId.mainnet][
          selectedAddress
        ],
      ).toStrictEqual([]);
    });
  });

  describe('onTokenListStateChange', () => {
    it('onTokenListChange', async () => {
      const stub = stubCreateEthers(tokensController, () => false);
      await tokensController.addToken({
        address: '0x01',
        symbol: 'bar',
        decimals: 2,
      });
      expect(tokensController.state.tokens[0]).toStrictEqual({
        address: '0x01',
        decimals: 2,
        image:
          'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x01.png',
        symbol: 'bar',
        isERC721: false,
        aggregators: [],
        name: undefined,
      });

      const sampleMainnetTokenList = {
        '0x01': {
          address: '0x01',
          symbol: 'bar',
          decimals: 2,
          occurrences: 1,
          name: 'BarName',
          iconUrl:
            'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x01.png',
          aggregators: ['Aave'],
        },
      };
      messenger.publish(
        'TokenListController:stateChange',
        {
          tokenList: sampleMainnetTokenList,
        } as unknown as TokenListState,
        [],
      );

      expect(tokensController.state.tokens[0]).toStrictEqual({
        address: '0x01',
        decimals: 2,
        image:
          'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x01.png',
        symbol: 'bar',
        isERC721: false,
        aggregators: [],
        name: 'BarName',
      });
      stub.restore();
    });
  });
});
