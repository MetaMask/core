import type { Network } from '@ethersproject/providers';
import type { ApprovalControllerMessenger } from '@metamask/approval-controller';
import { ApprovalController } from '@metamask/approval-controller';
import { ControllerMessenger } from '@metamask/base-controller';
import {
  IPFS_DEFAULT_GATEWAY_URL,
  ERC1155,
  ERC721,
  ChainId,
  NetworkType,
  toHex,
  ApprovalType,
  ERC20,
  NetworksTicker,
  NFT_API_BASE_URL,
  InfuraNetworkType,
} from '@metamask/controller-utils';
import type {
  NetworkClientConfiguration,
  NetworkClientId,
} from '@metamask/network-controller';
import { defaultState as defaultNetworkState } from '@metamask/network-controller';
import {
  getDefaultPreferencesState,
  type PreferencesState,
} from '@metamask/preferences-controller';
import BN from 'bn.js';
import nock from 'nock';
import * as sinon from 'sinon';
import { v4 } from 'uuid';

import type {
  ExtractAvailableAction,
  ExtractAvailableEvent,
} from '../../base-controller/tests/helpers';
import {
  buildCustomNetworkClientConfiguration,
  buildMockGetNetworkClientById,
} from '../../network-controller/tests/helpers';
import { getFormattedIpfsUrl } from './assetsUtil';
import { Source } from './constants';
import type {
  Nft,
  NftControllerState,
  NftControllerMessenger,
} from './NftController';
import {
  NftController,
  type AllowedActions,
  type AllowedEvents,
} from './NftController';

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
const OWNER_ADDRESS = '0x5a3CA5cD63807Ce5e4d7841AB32Ce6B6d9BbBa2D';
const SECOND_OWNER_ADDRESS = '0x500017171kasdfbou081';

const DEPRESSIONIST_CID_V1 =
  'bafybeidf7aw7bmnmewwj4ayq3she2jfk5jrdpp24aaucf6fddzb3cfhrvm';

const DEPRESSIONIST_CLOUDFLARE_IPFS_SUBDOMAIN_PATH = getFormattedIpfsUrl(
  IPFS_DEFAULT_GATEWAY_URL,
  `ipfs://${DEPRESSIONIST_CID_V1}`,
  true,
);

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

const controllerName = 'NftController' as const;

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

jest.mock('uuid', () => {
  const actual = jest.requireActual('uuid');

  return {
    ...actual,
    v4: jest.fn(),
  };
});

/**
 * Setup a test controller instance.
 *
 * @param args - Arguments to this function.
 * @param args.options - Controller options.
 * @param args.mockNetworkClientConfigurationsByNetworkClientId - Used to construct
 * mock versions of network clients and ultimately mock the
 * `NetworkController:getNetworkClientById` action.
 * @returns A collection of test controllers and mocks.
 */
function setupController({
  options = {},
  mockNetworkClientConfigurationsByNetworkClientId = {},
}: {
  options?: Partial<ConstructorParameters<typeof NftController>[0]>;
  mockNetworkClientConfigurationsByNetworkClientId?: Record<
    NetworkClientId,
    NetworkClientConfiguration
  >;
} = {}) {
  const messenger = new ControllerMessenger<
    | ExtractAvailableAction<NftControllerMessenger>
    | AllowedActions
    | ExtractAvailableAction<ApprovalControllerMessenger>,
    | ExtractAvailableEvent<NftControllerMessenger>
    | AllowedEvents
    | ExtractAvailableEvent<ApprovalControllerMessenger>
  >();

  const getNetworkClientById = buildMockGetNetworkClientById(
    mockNetworkClientConfigurationsByNetworkClientId,
  );
  messenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    getNetworkClientById,
  );

  const approvalControllerMessenger = messenger.getRestricted({
    name: 'ApprovalController',
    allowedActions: [],
    allowedEvents: [],
  });

  const approvalController = new ApprovalController({
    messenger: approvalControllerMessenger,
    showApprovalRequest: jest.fn(),
  });

  const nftControllerMessenger = messenger.getRestricted({
    name: controllerName,
    allowedActions: [
      'ApprovalController:addRequest',
      'NetworkController:getNetworkClientById',
    ],
    allowedEvents: [
      'NetworkController:networkDidChange',
      'PreferencesController:stateChange',
    ],
  });

  const nftController = new NftController({
    chainId: ChainId.mainnet,
    getERC721AssetName: jest.fn(),
    getERC721AssetSymbol: jest.fn(),
    getERC721TokenURI: jest.fn(),
    getERC721OwnerOf: jest.fn(),
    getERC1155BalanceOf: jest.fn(),
    getERC1155TokenURI: jest.fn(),
    onNftAdded: jest.fn(),
    messenger: nftControllerMessenger,
    ...options,
  });

  const triggerPreferencesStateChange = (state: PreferencesState) => {
    messenger.publish('PreferencesController:stateChange', state, []);
  };

  const changeNetwork = ({
    selectedNetworkClientId,
  }: {
    selectedNetworkClientId: NetworkClientId;
  }) => {
    messenger.publish('NetworkController:networkDidChange', {
      ...defaultNetworkState,
      selectedNetworkClientId,
    });
  };

  triggerPreferencesStateChange({
    ...getDefaultPreferencesState(),
    openSeaEnabled: true,
    selectedAddress: OWNER_ADDRESS,
  });

  return {
    nftController,
    messenger,
    approvalController,
    changeNetwork,
    triggerPreferencesStateChange,
  };
}

describe('NftController', () => {
  beforeEach(() => {
    nock(NFT_API_BASE_URL)
      .get(
        `/tokens?chainIds=1&tokens=0x01%3A1&includeTopBid=true&includeAttributes=true&includeLastSale=true`,
      )
      .reply(200, {
        tokens: [
          {
            token: {
              kind: 'erc1155',
              name: 'Name',
              description: 'Description',
              image: 'url',
              collection: {
                creator: 'Oxaddress',
                tokenCount: 0,
              },
            },
          },
        ],
      });

    nock(DEPRESSIONIST_CLOUDFLARE_IPFS_SUBDOMAIN_PATH).get('/').reply(200, {
      name: 'name',
      image: 'image',
      description: 'description',
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should set default state', () => {
    const { nftController } = setupController();

    expect(nftController.state).toStrictEqual({
      allNftContracts: {},
      allNfts: {},
      ignoredNfts: [],
    });
  });

  it('should set api key', async () => {
    const { nftController } = setupController();

    nftController.setApiKey('testkey');
    expect(nftController.openSeaApiKey).toBe('testkey');
  });

  describe('watchNft', function () {
    const ERC721_NFT = {
      address: ERC721_NFT_ADDRESS,
      tokenId: ERC721_NFT_ID,
    };

    const ERC1155_NFT = {
      address: ERC1155_NFT_ADDRESS,
      tokenId: ERC1155_NFT_ID,
    };

    it('should error if passed no type', async function () {
      const { nftController } = setupController();
      const type = undefined;

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore-next-line
      const erc721Result = nftController.watchNft(ERC721_NFT, type);
      await expect(erc721Result).rejects.toThrow('Asset type is required');

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore-next-line
      const erc1155Result = nftController.watchNft(ERC1155_NFT, type);
      await expect(erc1155Result).rejects.toThrow('Asset type is required');
    });

    it('should error if asset type is not supported', async function () {
      const { nftController } = setupController();

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore-next-line
      const erc721Result = nftController.watchNft(ERC721_NFT, ERC20);
      await expect(erc721Result).rejects.toThrow(
        `Non NFT asset type ${ERC20} not supported by watchNft`,
      );

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore-next-line
      const erc1155Result = nftController.watchNft(ERC1155_NFT, ERC20);
      await expect(erc1155Result).rejects.toThrow(
        `Non NFT asset type ${ERC20} not supported by watchNft`,
      );
    });

    it('should error if passed NFT does not match type passed', async function () {
      nock('https://testtokenuri.com')
        .get('/')
        .reply(
          200,
          JSON.stringify({
            image: 'testERC721Image',
            name: 'testERC721Name',
            description: 'testERC721Description',
          }),
        );
      const { nftController } = setupController({
        options: {
          getERC721TokenURI: jest
            .fn()
            .mockImplementation(() => 'https://testtokenuri.com'),
          getERC721OwnerOf: jest.fn().mockImplementation(() => OWNER_ADDRESS),
        },
      });

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore-next-line
      const erc721Result = nftController.watchNft(ERC721_NFT, ERC1155);
      await expect(erc721Result).rejects.toThrow(
        `Suggested NFT of type ${ERC721} does not match received type ${ERC1155}`,
      );
    });

    it('should error if address is not defined', async function () {
      const { nftController } = setupController();
      const assetWithNoAddress = {
        address: undefined,
        tokenId: ERC721_NFT_ID,
      };

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore-next-line
      const result = nftController.watchNft(assetWithNoAddress, ERC721);
      await expect(result).rejects.toThrow(
        'Both address and tokenId are required',
      );
    });

    it('should error if tokenId is not defined', async function () {
      const { nftController } = setupController();
      const assetWithNoAddress = {
        address: ERC721_NFT_ADDRESS,
        tokenId: undefined,
      };

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore-next-line
      const result = nftController.watchNft(assetWithNoAddress, ERC721);
      await expect(result).rejects.toThrow(
        'Both address and tokenId are required',
      );
    });

    it('should error if tokenId is not a valid stringified decimal number', async function () {
      const { nftController } = setupController();
      const assetWithNumericTokenId = {
        address: ERC721_NFT_ADDRESS,
        tokenId: '123abc',
      };

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore-next-line
      const result = nftController.watchNft(assetWithNumericTokenId, ERC721);
      await expect(result).rejects.toThrow('Invalid tokenId');
    });

    it('should error if address is invalid', async function () {
      const { nftController } = setupController();
      const assetWithInvalidAddress = {
        address: '0x123',
        tokenId: ERC721_NFT_ID,
      };
      const result = nftController.watchNft(
        assetWithInvalidAddress,
        ERC721,
        'https://test-dapp.com',
      );
      await expect(result).rejects.toThrow('Invalid address');
    });

    it('should error if the user does not own the suggested ERC721 NFT', async function () {
      const { nftController, messenger } = setupController({
        options: {
          getERC721OwnerOf: jest.fn().mockImplementation(() => '0x12345abcefg'),
        },
      });

      const callActionSpy = jest.spyOn(messenger, 'call').mockResolvedValue({});

      await expect(() =>
        nftController.watchNft(ERC721_NFT, ERC721, 'https://test-dapp.com'),
      ).rejects.toThrow('Suggested NFT is not owned by the selected account');
      expect(callActionSpy).toHaveBeenCalledTimes(0);
    });

    it('should error if the call to isNftOwner fail', async function () {
      const { nftController } = setupController();
      jest.spyOn(nftController, 'isNftOwner').mockRejectedValue('Random error');
      try {
        await nftController.watchNft(
          ERC721_NFT,
          ERC721,
          'https://test-dapp.com',
        );
      } catch (err) {
        // eslint-disable-next-line jest/no-conditional-expect
        expect(err).toBe('Random error');
      }
    });

    it('should error if the user does not own the suggested ERC1155 NFT', async function () {
      const { nftController, messenger } = setupController({
        options: {
          getERC1155BalanceOf: jest.fn().mockImplementation(() => new BN(0)),
        },
      });

      const callActionSpy = jest.spyOn(messenger, 'call').mockResolvedValue({});

      await expect(() =>
        nftController.watchNft(ERC1155_NFT, ERC1155, 'https://test-dapp.com'),
      ).rejects.toThrow('Suggested NFT is not owned by the selected account');
      expect(callActionSpy).toHaveBeenCalledTimes(0);
    });

    it('should handle ERC721 type and add pending request to ApprovalController with the OpenSea API disabled and IPFS gateway enabled', async function () {
      nock('https://testtokenuri.com')
        .get('/')
        .reply(
          200,
          JSON.stringify({
            image: 'testERC721Image',
            name: 'testERC721Name',
            description: 'testERC721Description',
          }),
        );
      const { nftController, messenger, triggerPreferencesStateChange } =
        setupController({
          options: {
            getERC721TokenURI: jest
              .fn()
              .mockImplementation(() => 'https://testtokenuri.com'),
            getERC721OwnerOf: jest.fn().mockImplementation(() => OWNER_ADDRESS),
          },
        });
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        isIpfsGatewayEnabled: true,
        openSeaEnabled: false,
        selectedAddress: OWNER_ADDRESS,
      });

      const requestId = 'approval-request-id-1';

      const clock = sinon.useFakeTimers(1);

      (v4 as jest.Mock).mockImplementationOnce(() => requestId);

      const callActionSpy = jest.spyOn(messenger, 'call').mockResolvedValue({});

      await nftController.watchNft(ERC721_NFT, ERC721, 'https://test-dapp.com');
      expect(callActionSpy).toHaveBeenCalledTimes(1);
      expect(callActionSpy).toHaveBeenCalledWith(
        'ApprovalController:addRequest',
        {
          id: requestId,
          origin: 'https://test-dapp.com',
          type: ApprovalType.WatchAsset,
          requestData: {
            id: requestId,
            interactingAddress: OWNER_ADDRESS,
            asset: {
              ...ERC721_NFT,
              description: null,
              image: null,
              name: null,
              standard: ERC721,
            },
          },
        },
        true,
      );

      clock.restore();
    });

    it('should handle ERC721 type and add pending request to ApprovalController with the OpenSea API enabled and IPFS gateway enabled', async function () {
      nock('https://testtokenuri.com')
        .get('/')
        .reply(
          200,
          JSON.stringify({
            image: 'testERC721Image',
            name: 'testERC721Name',
            description: 'testERC721Description',
          }),
        );
      const { nftController, messenger, triggerPreferencesStateChange } =
        setupController({
          options: {
            getERC721TokenURI: jest
              .fn()
              .mockImplementation(() => 'https://testtokenuri.com'),
            getERC721OwnerOf: jest.fn().mockImplementation(() => OWNER_ADDRESS),
          },
        });
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        isIpfsGatewayEnabled: true,
        openSeaEnabled: true,
        selectedAddress: OWNER_ADDRESS,
      });

      const requestId = 'approval-request-id-1';

      const clock = sinon.useFakeTimers(1);

      (v4 as jest.Mock).mockImplementationOnce(() => requestId);

      const callActionSpy = jest.spyOn(messenger, 'call').mockResolvedValue({});

      await nftController.watchNft(ERC721_NFT, ERC721, 'https://test-dapp.com');
      expect(callActionSpy).toHaveBeenCalledTimes(1);
      expect(callActionSpy).toHaveBeenCalledWith(
        'ApprovalController:addRequest',
        {
          id: requestId,
          origin: 'https://test-dapp.com',
          type: ApprovalType.WatchAsset,
          requestData: {
            id: requestId,
            interactingAddress: OWNER_ADDRESS,
            asset: {
              ...ERC721_NFT,
              description: 'testERC721Description',
              image: 'testERC721Image',
              name: 'testERC721Name',
              standard: ERC721,
            },
          },
        },
        true,
      );

      clock.restore();
    });

    it('should handle ERC721 type and add pending request to ApprovalController with the OpenSea API disabled and IPFS gateway disabled', async function () {
      nock('https://testtokenuri.com')
        .get('/')
        .reply(
          200,
          JSON.stringify({
            image: 'testERC721Image',
            name: 'testERC721Name',
            description: 'testERC721Description',
          }),
        );
      const { nftController, messenger, triggerPreferencesStateChange } =
        setupController({
          options: {
            getERC721TokenURI: jest
              .fn()
              .mockImplementation(() => 'ipfs://testtokenuri.com'),
            getERC721OwnerOf: jest.fn().mockImplementation(() => OWNER_ADDRESS),
          },
        });
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        isIpfsGatewayEnabled: false,
        openSeaEnabled: false,
        selectedAddress: OWNER_ADDRESS,
      });

      const requestId = 'approval-request-id-1';

      const clock = sinon.useFakeTimers(1);

      (v4 as jest.Mock).mockImplementationOnce(() => requestId);

      const callActionSpy = jest.spyOn(messenger, 'call').mockResolvedValue({});

      await nftController.watchNft(ERC721_NFT, ERC721, 'https://test-dapp.com');
      expect(callActionSpy).toHaveBeenCalledTimes(1);
      expect(callActionSpy).toHaveBeenCalledWith(
        'ApprovalController:addRequest',
        {
          id: requestId,
          origin: 'https://test-dapp.com',
          type: ApprovalType.WatchAsset,
          requestData: {
            id: requestId,
            interactingAddress: OWNER_ADDRESS,
            asset: {
              ...ERC721_NFT,
              description: null,
              image: null,
              name: null,
              standard: ERC721,
            },
          },
        },
        true,
      );

      clock.restore();
    });

    it('should handle ERC721 type and add pending request to ApprovalController with the OpenSea API enabled and IPFS gateway disabled', async function () {
      nock('https://testtokenuri.com')
        .get('/')
        .reply(
          200,
          JSON.stringify({
            image: 'testERC721Image',
            name: 'testERC721Name',
            description: 'testERC721Description',
          }),
        );
      const { nftController, messenger, triggerPreferencesStateChange } =
        setupController({
          options: {
            getERC721TokenURI: jest
              .fn()
              .mockImplementation(() => 'ipfs://testtokenuri.com'),
            getERC721OwnerOf: jest.fn().mockImplementation(() => OWNER_ADDRESS),
          },
        });
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        isIpfsGatewayEnabled: false,
        openSeaEnabled: true,
        selectedAddress: OWNER_ADDRESS,
      });

      const requestId = 'approval-request-id-1';

      const clock = sinon.useFakeTimers(1);

      (v4 as jest.Mock).mockImplementationOnce(() => requestId);

      const callActionSpy = jest.spyOn(messenger, 'call').mockResolvedValue({});

      await nftController.watchNft(ERC721_NFT, ERC721, 'https://test-dapp.com');
      expect(callActionSpy).toHaveBeenCalledTimes(1);
      expect(callActionSpy).toHaveBeenCalledWith(
        'ApprovalController:addRequest',
        {
          id: requestId,
          origin: 'https://test-dapp.com',
          type: ApprovalType.WatchAsset,
          requestData: {
            id: requestId,
            interactingAddress: OWNER_ADDRESS,
            asset: {
              ...ERC721_NFT,
              description: null,
              image: null,
              name: null,
              standard: ERC721,
            },
          },
        },
        true,
      );

      clock.restore();
    });

    it('should handle ERC1155 type and add to suggestedNfts with the OpenSea API disabled', async function () {
      nock('https://testtokenuri.com')
        .get('/')
        .reply(
          200,
          JSON.stringify({
            image: 'testERC1155Image',
            name: 'testERC1155Name',
            description: 'testERC1155Description',
          }),
        );

      const { nftController, messenger, triggerPreferencesStateChange } =
        setupController({
          options: {
            getERC721TokenURI: jest
              .fn()
              .mockRejectedValue(new Error('Not an ERC721 contract')),
            getERC1155TokenURI: jest
              .fn()
              .mockImplementation(() => 'https://testtokenuri.com'),
            getERC1155BalanceOf: jest.fn().mockImplementation(() => new BN(1)),
          },
        });
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        isIpfsGatewayEnabled: true,
        openSeaEnabled: false,
        selectedAddress: OWNER_ADDRESS,
      });
      const requestId = 'approval-request-id-1';

      const clock = sinon.useFakeTimers(1);

      (v4 as jest.Mock).mockImplementationOnce(() => requestId);

      const callActionSpy = jest.spyOn(messenger, 'call').mockResolvedValue({});

      await nftController.watchNft(
        ERC1155_NFT,
        ERC1155,
        'https://etherscan.io',
      );
      expect(callActionSpy).toHaveBeenCalledTimes(1);
      expect(callActionSpy).toHaveBeenCalledWith(
        'ApprovalController:addRequest',
        {
          id: requestId,
          origin: 'https://etherscan.io',
          type: ApprovalType.WatchAsset,
          requestData: {
            id: requestId,
            interactingAddress: OWNER_ADDRESS,
            asset: {
              ...ERC1155_NFT,
              description: null,
              image: null,
              name: null,
              standard: ERC1155,
            },
          },
        },
        true,
      );

      clock.restore();
    });

    it('should handle ERC1155 type and add to suggestedNfts with the OpenSea API enabled', async function () {
      nock('https://testtokenuri.com')
        .get('/')
        .reply(
          200,
          JSON.stringify({
            image: 'testERC1155Image',
            name: 'testERC1155Name',
            description: 'testERC1155Description',
          }),
        );

      const { nftController, messenger, triggerPreferencesStateChange } =
        setupController({
          options: {
            getERC721TokenURI: jest
              .fn()
              .mockRejectedValue(new Error('Not an ERC721 contract')),
            getERC1155TokenURI: jest
              .fn()
              .mockImplementation(() => 'https://testtokenuri.com'),
            getERC1155BalanceOf: jest.fn().mockImplementation(() => new BN(1)),
          },
        });
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        isIpfsGatewayEnabled: true,
        openSeaEnabled: true,
        selectedAddress: OWNER_ADDRESS,
      });
      const requestId = 'approval-request-id-1';

      const clock = sinon.useFakeTimers(1);

      (v4 as jest.Mock).mockImplementationOnce(() => requestId);

      const callActionSpy = jest.spyOn(messenger, 'call').mockResolvedValue({});

      await nftController.watchNft(
        ERC1155_NFT,
        ERC1155,
        'https://etherscan.io',
      );
      expect(callActionSpy).toHaveBeenCalledTimes(1);
      expect(callActionSpy).toHaveBeenCalledWith(
        'ApprovalController:addRequest',
        {
          id: requestId,
          origin: 'https://etherscan.io',
          type: ApprovalType.WatchAsset,
          requestData: {
            id: requestId,
            interactingAddress: OWNER_ADDRESS,
            asset: {
              ...ERC1155_NFT,
              description: 'testERC1155Description',
              image: 'testERC1155Image',
              name: 'testERC1155Name',
              standard: ERC1155,
            },
          },
        },
        true,
      );

      clock.restore();
    });

    it('should add the NFT to the correct chainId/selectedAddress in state when passed a userAddress in the options argument', async function () {
      nock('https://testtokenuri.com')
        .get('/')
        .reply(
          200,
          JSON.stringify({
            image: 'testERC721Image',
            name: 'testERC721Name',
            description: 'testERC721Description',
          }),
        );

      const {
        nftController,
        messenger,
        approvalController,
        changeNetwork,
        triggerPreferencesStateChange,
      } = setupController({
        options: {
          getERC721OwnerOf: jest
            .fn()
            .mockImplementation(() => SECOND_OWNER_ADDRESS),
          getERC721TokenURI: jest
            .fn()
            .mockImplementation(() => 'https://testtokenuri.com'),
          getERC721AssetName: jest
            .fn()
            .mockImplementation(() => 'testERC721Name'),
          getERC721AssetSymbol: jest
            .fn()
            .mockImplementation(() => 'testERC721Symbol'),
        },
      });

      const requestId = 'approval-request-id-1';

      sinon.useFakeTimers(1);

      (v4 as jest.Mock).mockImplementationOnce(() => requestId);

      const pendingRequest = new Promise<void>((resolve) => {
        messenger.subscribe('ApprovalController:stateChange', () => {
          resolve();
        });
      });

      const acceptedRequest = new Promise<void>((resolve) => {
        messenger.subscribe(
          'NftController:stateChange',
          (state: NftControllerState) => {
            if (state.allNfts?.[SECOND_OWNER_ADDRESS]?.[GOERLI.chainId]) {
              resolve();
            }
          },
        );
      });

      // check that the NFT is not in state to begin with
      expect(nftController.state.allNfts).toStrictEqual({});

      // this is our account and network status when the watchNFT request is made
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
        selectedAddress: OWNER_ADDRESS,
      });
      changeNetwork({ selectedNetworkClientId: InfuraNetworkType.goerli });

      nftController.watchNft(ERC721_NFT, ERC721, 'https://etherscan.io', {
        userAddress: SECOND_OWNER_ADDRESS,
      });

      await pendingRequest;

      // now accept the request
      approvalController.accept(requestId);
      await acceptedRequest;

      // check that the NFT was added to the correct chainId/selectedAddress in state
      const {
        state: { allNfts },
      } = nftController;

      expect(allNfts).toStrictEqual({
        [SECOND_OWNER_ADDRESS]: {
          [GOERLI.chainId]: [
            {
              ...ERC721_NFT,
              favorite: false,
              isCurrentlyOwned: true,
              description: 'testERC721Description',
              image: 'testERC721Image',
              name: 'testERC721Name',
              standard: ERC721,
            },
          ],
        },
      });
    });

    it('should add the NFT to the correct chainId/selectedAddress (when passed a networkClientId) in state even if the user changes network and account before accepting the request', async function () {
      nock('https://testtokenuri.com')
        .get('/')
        .reply(
          200,
          JSON.stringify({
            image: 'testERC721Image',
            name: 'testERC721Name',
            description: 'testERC721Description',
          }),
        );

      const {
        nftController,
        messenger,
        approvalController,
        triggerPreferencesStateChange,
        changeNetwork,
      } = setupController({
        options: {
          getERC721OwnerOf: jest.fn().mockImplementation(() => OWNER_ADDRESS),
          getERC721TokenURI: jest
            .fn()
            .mockImplementation(() => 'https://testtokenuri.com'),
          getERC721AssetName: jest
            .fn()
            .mockImplementation(() => 'testERC721Name'),
          getERC721AssetSymbol: jest
            .fn()
            .mockImplementation(() => 'testERC721Symbol'),
        },
      });

      const requestId = 'approval-request-id-1';

      const clock = sinon.useFakeTimers(1);

      (v4 as jest.Mock).mockImplementationOnce(() => requestId);

      const pendingRequest = new Promise<void>((resolve) => {
        messenger.subscribe('ApprovalController:stateChange', () => {
          resolve();
        });
      });

      const acceptedRequest = new Promise<void>((resolve) => {
        messenger.subscribe(
          'NftController:stateChange',
          (state: NftControllerState) => {
            if (state.allNfts?.[OWNER_ADDRESS]?.[GOERLI.chainId].length) {
              resolve();
            }
          },
        );
      });

      // check that the NFT is not in state to begin with
      expect(nftController.state.allNfts).toStrictEqual({});

      // this is our account and network status when the watchNFT request is made
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
        selectedAddress: OWNER_ADDRESS,
      });

      nftController.watchNft(ERC721_NFT, ERC721, 'https://etherscan.io', {
        networkClientId: 'goerli',
      });

      await pendingRequest;

      // change the network and selectedAddress before accepting the request
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
        selectedAddress: '0xDifferentAddress',
      });
      changeNetwork({ selectedNetworkClientId: InfuraNetworkType.sepolia });
      // now accept the request
      approvalController.accept(requestId);
      await acceptedRequest;

      // check that the NFT was added to the correct chainId/selectedAddress in state
      const {
        state: { allNfts },
      } = nftController;
      expect(allNfts).toStrictEqual({
        // this is the selectedAddress when the request was made
        [OWNER_ADDRESS]: {
          // this is the chainId when the request was made
          [GOERLI.chainId]: [
            {
              ...ERC721_NFT,
              favorite: false,
              isCurrentlyOwned: true,
              description: 'testERC721Description',
              image: 'testERC721Image',
              name: 'testERC721Name',
              standard: ERC721,
            },
          ],
        },
      });

      clock.restore();
    });

    it('should throw an error when calls to `ownerOf` and `balanceOf` revert', async function () {
      const { nftController, changeNetwork } = setupController();
      // getERC721OwnerOf not mocked
      // getERC1155BalanceOf not mocked

      changeNetwork({ selectedNetworkClientId: InfuraNetworkType.sepolia });

      const requestId = 'approval-request-id-1';
      (v4 as jest.Mock).mockImplementationOnce(() => requestId);

      const result = nftController.watchNft(
        ERC721_NFT,
        ERC721,
        'https://test-dapp.com',
      );
      await expect(result).rejects.toThrow(
        "Unable to verify ownership. Possibly because the standard is not supported or the user's currently selected network does not match the chain of the asset in question.",
      );
    });
  });

  describe('addNft', () => {
    it('should add NFT and NFT contract', async () => {
      const selectedAddress = OWNER_ADDRESS;
      const { nftController } = setupController({
        options: {
          chainId: ChainId.mainnet,
          selectedAddress,
          getERC721AssetName: jest.fn().mockResolvedValue('Name'),
        },
      });

      await nftController.addNft('0x01', '1', {
        nftMetadata: {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
          favorite: false,
          collection: {
            tokenCount: '0',
            image: 'url',
          },
        },
      });

      expect(
        nftController.state.allNfts[selectedAddress][ChainId.mainnet][0],
      ).toStrictEqual({
        address: '0x01',
        description: 'description',
        image: 'image',
        name: 'name',
        tokenId: '1',
        standard: 'standard',
        favorite: false,
        isCurrentlyOwned: true,
        collection: {
          tokenCount: '0',
          image: 'url',
        },
      });

      expect(
        nftController.state.allNftContracts[selectedAddress][
          ChainId.mainnet
        ][0],
      ).toStrictEqual({
        address: '0x01',
        logo: 'url',
        name: 'Name',
        totalSupply: '0',
        schemaName: 'standard',
      });
    });

    it('should call onNftAdded callback correctly when NFT is manually added', async () => {
      const mockOnNftAdded = jest.fn();
      const { nftController } = setupController({
        options: {
          onNftAdded: mockOnNftAdded,
        },
      });

      await nftController.addNft('0x01', '1', {
        nftMetadata: {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'ERC1155',
          favorite: false,
        },
      });

      expect(mockOnNftAdded).toHaveBeenCalledWith({
        source: Source.Custom,
        tokenId: '1',
        address: '0x01',
        standard: 'ERC1155',
      });
    });

    it('should call onNftAdded callback correctly when NFT is added via detection', async () => {
      const mockOnNftAdded = jest.fn();
      const { nftController } = setupController({
        options: {
          onNftAdded: mockOnNftAdded,
        },
      });

      const detectedUserAddress = '0x123';
      await nftController.addNft('0x01', '2', {
        nftMetadata: {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: ERC721,
          favorite: false,
        },
        userAddress: detectedUserAddress,
        source: Source.Detected,
      });

      expect(mockOnNftAdded).toHaveBeenCalledWith({
        source: 'detected',
        tokenId: '2',
        address: '0x01',
        standard: ERC721,
      });
    });

    it('should add NFT by selected address', async () => {
      const tokenURI = 'https://url/';
      const mockGetERC721TokenURI = jest.fn().mockResolvedValue(tokenURI);
      const mockGetERC1155TokenURI = jest.fn().mockRejectedValue('');

      const { nftController, triggerPreferencesStateChange } = setupController({
        options: {
          getERC721TokenURI: mockGetERC721TokenURI,
          getERC1155TokenURI: mockGetERC1155TokenURI,
        },
      });
      const firstAddress = '0x123';
      const secondAddress = '0x321';

      nock('https://url').get('/').reply(200, {
        name: 'name',
        image: 'url',
        description: 'description',
      });
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
        selectedAddress: firstAddress,
      });
      await nftController.addNft('0x01', '1234');
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
        selectedAddress: secondAddress,
      });
      await nftController.addNft('0x02', '4321');
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
        selectedAddress: firstAddress,
      });
      expect(
        nftController.state.allNfts[firstAddress][ChainId.mainnet][0],
      ).toStrictEqual({
        address: '0x01',
        description: 'description',
        image: 'url',
        name: 'name',
        standard: ERC721,
        tokenURI,
        tokenId: '1234',
        favorite: false,
        isCurrentlyOwned: true,
      });
    });

    it('should update NFT if image is different', async () => {
      const selectedAddress = OWNER_ADDRESS;
      const { nftController } = setupController({
        options: {
          selectedAddress,
        },
      });

      await nftController.addNft('0x01', '1', {
        nftMetadata: {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
          favorite: false,
        },
      });

      expect(
        nftController.state.allNfts[selectedAddress][ChainId.mainnet][0],
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
        nftMetadata: {
          name: 'name',
          image: 'image-updated',
          description: 'description',
          standard: 'standard',
          favorite: false,
        },
      });

      expect(
        nftController.state.allNfts[selectedAddress][ChainId.mainnet][0],
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
    });

    it('should not duplicate NFT nor NFT contract if already added', async () => {
      const selectedAddress = OWNER_ADDRESS;
      const { nftController } = setupController({
        options: {
          selectedAddress,
        },
      });

      await nftController.addNft('0x01', '1', {
        nftMetadata: {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
          favorite: false,
        },
      });

      await nftController.addNft('0x01', '1', {
        nftMetadata: {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
          favorite: false,
        },
      });

      expect(
        nftController.state.allNfts[selectedAddress][ChainId.mainnet],
      ).toHaveLength(1);

      expect(
        nftController.state.allNftContracts[selectedAddress][ChainId.mainnet],
      ).toHaveLength(1);
    });

    it('should add NFT and get information from NFT-API', async () => {
      const selectedAddress = OWNER_ADDRESS;
      const { nftController } = setupController({
        options: {
          selectedAddress,
          getERC721TokenURI: jest
            .fn()
            .mockRejectedValue(new Error('Not an ERC721 contract')),
          getERC1155TokenURI: jest
            .fn()
            .mockRejectedValue(new Error('Not an ERC1155 contract')),
        },
      });

      await nftController.addNft('0x01', '1');
      expect(
        nftController.state.allNfts[selectedAddress][ChainId.mainnet][0],
      ).toStrictEqual({
        address: '0x01',
        description: 'Description',
        image: 'url',
        name: 'Name',
        standard: 'ERC1155',
        tokenId: '1',
        favorite: false,
        isCurrentlyOwned: true,
        tokenURI: '',
        creator: 'Oxaddress',
        collection: { creator: 'Oxaddress', tokenCount: 0 },
      });
    });

    it('should add NFT erc721 and aggregate NFT data from both contract and NFT-API', async () => {
      const selectedAddress = OWNER_ADDRESS;
      const { nftController } = setupController({
        options: {
          selectedAddress,
          getERC721AssetName: jest.fn().mockResolvedValue('KudosToken'),
          getERC721AssetSymbol: jest.fn().mockResolvedValue('KDO'),
          getERC721TokenURI: jest
            .fn()
            .mockResolvedValue(
              'https://ipfs.gitcoin.co:443/api/v0/cat/QmPmt6EAaioN78ECnW5oCL8v2YvVSpoBjLCjrXhhsAvoov',
            ),
        },
      });
      nock(NFT_API_BASE_URL)
        .get(
          `/tokens?chainIds=1&tokens=${ERC721_KUDOSADDRESS}%3A${ERC721_KUDOS_TOKEN_ID}&includeTopBid=true&includeAttributes=true&includeLastSale=true`,
        )
        .reply(200, {
          tokens: [
            {
              token: {
                kind: 'erc721',
                name: 'Kudos Name',
                description: 'Kudos Description',
                image: 'url',
              },
            },
          ],
        });

      nock('https://ipfs.gitcoin.co:443')
        .get('/api/v0/cat/QmPmt6EAaioN78ECnW5oCL8v2YvVSpoBjLCjrXhhsAvoov')
        .reply(200, {
          image: 'Kudos Image (directly from tokenURI)',
          name: 'Kudos Name (directly from tokenURI)',
          description: 'Kudos Description (directly from tokenURI)',
        });

      await nftController.addNft(ERC721_KUDOSADDRESS, ERC721_KUDOS_TOKEN_ID);

      expect(
        nftController.state.allNfts[selectedAddress][ChainId.mainnet][0],
      ).toStrictEqual({
        address: ERC721_KUDOSADDRESS,
        image: 'url',
        name: 'Kudos Name (directly from tokenURI)',
        description: 'Kudos Description (directly from tokenURI)',
        tokenId: ERC721_KUDOS_TOKEN_ID,
        standard: ERC721,
        favorite: false,
        isCurrentlyOwned: true,
        tokenURI:
          'https://ipfs.gitcoin.co:443/api/v0/cat/QmPmt6EAaioN78ECnW5oCL8v2YvVSpoBjLCjrXhhsAvoov',
      });

      expect(
        nftController.state.allNftContracts[selectedAddress][
          ChainId.mainnet
        ][0],
      ).toStrictEqual({
        address: ERC721_KUDOSADDRESS,
        name: 'KudosToken',
        symbol: 'KDO',
        schemaName: ERC721,
      });
    });

    it('should add NFT erc1155 and get NFT information from contract when NFT API call fail', async () => {
      const selectedAddress = OWNER_ADDRESS;
      const { nftController } = setupController({
        options: {
          selectedAddress,
          getERC721TokenURI: jest
            .fn()
            .mockRejectedValue(new Error('Not a 721 contract')),
          getERC1155TokenURI: jest
            .fn()
            .mockResolvedValue(
              'https://api.opensea.io/api/v1/metadata/0x495f947276749Ce646f68AC8c248420045cb7b5e/0x{id}',
            ),
        },
      });
      nock('https://api.opensea.io')
        .get(
          `/api/v1/metadata/${ERC1155_NFT_ADDRESS}/0x5a3ca5cd63807ce5e4d7841ab32ce6b6d9bbba2d000000000000010000000001`,
        )
        .reply(200, {
          name: 'name (directly from tokenURI)',
          description: 'description (directly from tokenURI)',
          external_link: null,
          image: 'image (directly from tokenURI)',
          animation_url: null,
        });

      await nftController.addNft(ERC1155_NFT_ADDRESS, ERC1155_NFT_ID);

      expect(
        nftController.state.allNfts[selectedAddress][ChainId.mainnet][0],
      ).toStrictEqual({
        address: ERC1155_NFT_ADDRESS,
        image: 'image (directly from tokenURI)',
        name: 'name (directly from tokenURI)',
        description: 'description (directly from tokenURI)',
        tokenId: ERC1155_NFT_ID,
        standard: ERC1155,
        favorite: false,
        isCurrentlyOwned: true,
        tokenURI:
          'https://api.opensea.io/api/v1/metadata/0x495f947276749Ce646f68AC8c248420045cb7b5e/0x5a3ca5cd63807ce5e4d7841ab32ce6b6d9bbba2d000000000000010000000001',
      });
    });

    it('should add NFT erc721 and get NFT information only from contract', async () => {
      const selectedAddress = OWNER_ADDRESS;
      const { nftController } = setupController({
        options: {
          selectedAddress,
          getERC721AssetName: jest.fn().mockResolvedValue('KudosToken'),
          getERC721AssetSymbol: jest.fn().mockResolvedValue('KDO'),
          getERC721TokenURI: jest.fn().mockImplementation((tokenAddress) => {
            switch (tokenAddress) {
              case ERC721_KUDOSADDRESS:
                return 'https://ipfs.gitcoin.co:443/api/v0/cat/QmPmt6EAaioN78ECnW5oCL8v2YvVSpoBjLCjrXhhsAvoov';
              default:
                throw new Error('Not an ERC721 token');
            }
          }),
        },
      });
      nock('https://ipfs.gitcoin.co:443')
        .get('/api/v0/cat/QmPmt6EAaioN78ECnW5oCL8v2YvVSpoBjLCjrXhhsAvoov')
        .reply(200, {
          image: 'Kudos Image (directly from tokenURI)',
          name: 'Kudos Name (directly from tokenURI)',
          description: 'Kudos Description (directly from tokenURI)',
        });

      nock('https://nft.api.cx.metamask.io')
        .get(
          '/tokens?chainIds=1&tokens=0x2aEa4Add166EBf38b63d09a75dE1a7b94Aa24163%3A1203&includeTopBid=true&includeAttributes=true&includeLastSale=true',
        )
        .reply(404, { error: 'Not found' });

      await nftController.addNft(ERC721_KUDOSADDRESS, ERC721_KUDOS_TOKEN_ID);

      expect(
        nftController.state.allNfts[selectedAddress][ChainId.mainnet][0],
      ).toStrictEqual({
        address: ERC721_KUDOSADDRESS,
        image: 'Kudos Image (directly from tokenURI)',
        name: 'Kudos Name (directly from tokenURI)',
        description: 'Kudos Description (directly from tokenURI)',
        tokenId: ERC721_KUDOS_TOKEN_ID,
        standard: ERC721,
        favorite: false,
        isCurrentlyOwned: true,
        tokenURI:
          'https://ipfs.gitcoin.co:443/api/v0/cat/QmPmt6EAaioN78ECnW5oCL8v2YvVSpoBjLCjrXhhsAvoov',
      });

      expect(
        nftController.state.allNftContracts[selectedAddress][
          ChainId.mainnet
        ][0],
      ).toStrictEqual({
        address: ERC721_KUDOSADDRESS,
        name: 'KudosToken',
        symbol: 'KDO',
        schemaName: ERC721,
      });
    });

    it('should add NFT by provider type', async () => {
      const selectedAddress = OWNER_ADDRESS;
      const tokenURI = 'https://url/';
      const mockGetERC721TokenURI = jest.fn().mockResolvedValue(tokenURI);
      const { nftController, changeNetwork } = setupController({
        options: {
          selectedAddress,
          getERC721TokenURI: mockGetERC721TokenURI,
        },
      });
      nock('https://url').get('/').reply(200, {
        name: 'name',
        image: 'url',
        description: 'description',
      });

      changeNetwork({ selectedNetworkClientId: InfuraNetworkType.sepolia });
      await nftController.addNft('0x01', '1234');
      changeNetwork({ selectedNetworkClientId: InfuraNetworkType.goerli });
      changeNetwork({ selectedNetworkClientId: InfuraNetworkType.sepolia });

      expect(
        nftController.state.allNfts[selectedAddress]?.[ChainId[GOERLI.type]],
      ).toBeUndefined();

      expect(
        nftController.state.allNfts[selectedAddress][ChainId[SEPOLIA.type]][0],
      ).toStrictEqual({
        address: '0x01',
        description: 'description',
        image: 'url',
        name: 'name',
        standard: ERC721,
        tokenId: '1234',
        favorite: false,
        isCurrentlyOwned: true,
        tokenURI,
      });
    });

    it('should add an nft and nftContract to state when all contract information is falsy and the source is left empty (defaults to "custom")', async () => {
      const tokenURI = 'https://url/';
      const mockOnNftAdded = jest.fn();
      const mockGetERC721AssetSymbol = jest.fn().mockResolvedValue('');
      const mockGetERC721AssetName = jest.fn().mockResolvedValue('');
      const mockGetERC721TokenURI = jest.fn().mockResolvedValue(tokenURI);
      const selectedAddress = OWNER_ADDRESS;
      const { nftController } = setupController({
        options: {
          selectedAddress,
          onNftAdded: mockOnNftAdded,
          getERC721AssetSymbol: mockGetERC721AssetSymbol,
          getERC721AssetName: mockGetERC721AssetName,
          getERC721TokenURI: mockGetERC721TokenURI,
        },
      });

      nock('https://url').get('/').reply(200, {
        name: 'name',
        image: 'url',
        description: 'description',
      });

      await nftController.addNft('0x01234abcdefg', '1234');

      expect(nftController.state.allNftContracts).toStrictEqual({
        [selectedAddress]: {
          [ChainId.mainnet]: [
            {
              address: '0x01234abcdefg',
              schemaName: ERC721,
            },
          ],
        },
      });

      expect(nftController.state.allNfts).toStrictEqual({
        [selectedAddress]: {
          [ChainId.mainnet]: [
            {
              address: '0x01234abcdefg',
              description: 'description',
              image: 'url',
              name: 'name',
              tokenId: '1234',
              standard: ERC721,
              tokenURI,
              favorite: false,
              isCurrentlyOwned: true,
            },
          ],
        },
      });

      expect(mockOnNftAdded).toHaveBeenCalledWith({
        address: '0x01234abcdefg',
        tokenId: '1234',
        standard: ERC721,
        symbol: undefined,
        source: Source.Custom,
      });
    });

    it('should add an nft and nftContract to state when all contract information is falsy and the source is "dapp"', async () => {
      const tokenURI = 'https://url/';
      const mockOnNftAdded = jest.fn();
      const mockGetERC721AssetSymbol = jest.fn().mockResolvedValue('');
      const mockGetERC721AssetName = jest.fn().mockResolvedValue('');
      const mockGetERC721TokenURI = jest.fn().mockResolvedValue(tokenURI);
      const { nftController, changeNetwork } = setupController({
        options: {
          onNftAdded: mockOnNftAdded,
          getERC721AssetSymbol: mockGetERC721AssetSymbol,
          getERC721AssetName: mockGetERC721AssetName,
          getERC721TokenURI: mockGetERC721TokenURI,
        },
      });
      nock('https://url').get('/').reply(200, {
        name: 'name',
        image: 'url',
        description: 'description',
      });
      changeNetwork({ selectedNetworkClientId: InfuraNetworkType.goerli });

      await nftController.addNft('0x01234abcdefg', '1234', {
        userAddress: '0x123',
        source: Source.Dapp,
      });

      expect(nftController.state.allNftContracts).toStrictEqual({
        '0x123': {
          [GOERLI.chainId]: [
            {
              address: '0x01234abcdefg',
              schemaName: ERC721,
            },
          ],
        },
      });

      expect(nftController.state.allNfts).toStrictEqual({
        '0x123': {
          [GOERLI.chainId]: [
            {
              address: '0x01234abcdefg',
              description: 'description',
              image: 'url',
              name: 'name',
              tokenId: '1234',
              favorite: false,
              standard: ERC721,
              isCurrentlyOwned: true,
              tokenURI,
            },
          ],
        },
      });

      expect(mockOnNftAdded).toHaveBeenCalledWith({
        address: '0x01234abcdefg',
        tokenId: '1234',
        standard: ERC721,
        symbol: undefined,
        source: Source.Dapp,
      });
    });

    it('should add an nft and nftContract when there is valid contract information and source is "detected"', async () => {
      const selectedAddress = OWNER_ADDRESS;
      const mockOnNftAdded = jest.fn();
      const { nftController } = setupController({
        options: {
          selectedAddress,
          onNftAdded: mockOnNftAdded,
          getERC721AssetName: jest
            .fn()
            .mockRejectedValue(new Error('Failed to fetch')),
          getERC721AssetSymbol: jest
            .fn()
            .mockRejectedValue(new Error('Failed to fetch')),
        },
      });
      nock(NFT_API_BASE_URL)
        .get(
          `/tokens?chainIds=1&tokens=${ERC721_KUDOSADDRESS}%3A${ERC721_KUDOS_TOKEN_ID}&includeTopBid=true&includeAttributes=true&includeLastSale=true`,
        )
        .reply(200, {
          tokens: [
            {
              token: {
                kind: 'erc721',
                name: 'Kudos Name',
                description: 'Kudos Description',
                image: 'Kudos image (from proxy API)',
                collection: {
                  name: 'Kudos',
                  tokenCount: '10',
                  image: 'Kudos logo (from proxy API)',
                },
              },
            },
          ],
        });

      await nftController.addNft(
        '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab',
        '123',
        {
          userAddress: selectedAddress,
          source: Source.Detected,
        },
      );

      expect(
        nftController.state.allNfts[selectedAddress]?.[ChainId.mainnet],
      ).toBeUndefined();

      expect(
        nftController.state.allNftContracts[selectedAddress]?.[ChainId.mainnet],
      ).toBeUndefined();

      await nftController.addNft(ERC721_KUDOSADDRESS, ERC721_KUDOS_TOKEN_ID, {
        userAddress: selectedAddress,
        source: Source.Detected,
      });

      expect(
        nftController.state.allNfts[selectedAddress][ChainId.mainnet],
      ).toStrictEqual([
        {
          address: ERC721_KUDOSADDRESS,
          description: 'Kudos Description',
          image: 'Kudos image (from proxy API)',
          name: 'Kudos Name',
          standard: ERC721,
          tokenId: ERC721_KUDOS_TOKEN_ID,
          favorite: false,
          isCurrentlyOwned: true,
          tokenURI: null,
          collection: {
            tokenCount: '10',
            image: 'Kudos logo (from proxy API)',
            name: 'Kudos',
          },
        },
      ]);

      expect(
        nftController.state.allNftContracts[selectedAddress][ChainId.mainnet],
      ).toStrictEqual([
        {
          address: ERC721_KUDOSADDRESS,
          logo: 'Kudos logo (from proxy API)',
          name: 'Kudos',
          totalSupply: '10',
          schemaName: ERC721,
        },
      ]);

      expect(mockOnNftAdded).toHaveBeenCalledWith({
        address: ERC721_KUDOSADDRESS,
        tokenId: ERC721_KUDOS_TOKEN_ID,
        standard: ERC721,
        source: Source.Detected,
      });
    });

    it('should not add an nft and nftContract when there is not valid contract information (or an issue fetching it) and source is "detected"', async () => {
      const selectedAddress = OWNER_ADDRESS;
      const mockOnNftAdded = jest.fn();
      const { nftController } = setupController({
        options: {
          selectedAddress,
          onNftAdded: mockOnNftAdded,
          getERC721AssetName: jest
            .fn()
            .mockRejectedValue(new Error('Failed to fetch')),
          getERC721AssetSymbol: jest
            .fn()
            .mockRejectedValue(new Error('Failed to fetch')),
        },
      });
      nock(NFT_API_BASE_URL)
        .get(
          `/tokens?chainIds=1&tokens=${ERC721_KUDOSADDRESS}%3A${ERC721_KUDOS_TOKEN_ID}&includeTopBid=true&includeAttributes=true&includeLastSale=true`,
        )
        .replyWithError(new Error('Failed to fetch'));
      await nftController.addNft(
        '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab',
        '123',
        {
          userAddress: selectedAddress,
          source: Source.Detected,
        },
      );
      await nftController.addNft(ERC721_KUDOSADDRESS, ERC721_KUDOS_TOKEN_ID, {
        userAddress: selectedAddress,
        source: Source.Detected,
      });

      expect(nftController.state.allNfts).toStrictEqual({});
      expect(nftController.state.allNftContracts).toStrictEqual({});
      expect(mockOnNftAdded).not.toHaveBeenCalled();
    });

    it('should not add duplicate NFTs to the ignoredNfts list', async () => {
      const selectedAddress = OWNER_ADDRESS;
      const { nftController } = setupController({
        options: {
          selectedAddress,
        },
      });

      await nftController.addNft('0x01', '1', {
        nftMetadata: {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
        },
      });

      await nftController.addNft('0x01', '2', {
        nftMetadata: {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
        },
      });

      expect(
        nftController.state.allNfts[selectedAddress][ChainId.mainnet],
      ).toHaveLength(2);
      expect(nftController.state.ignoredNfts).toHaveLength(0);

      nftController.removeAndIgnoreNft('0x01', '1');
      expect(
        nftController.state.allNfts[selectedAddress][ChainId.mainnet],
      ).toHaveLength(1);
      expect(nftController.state.ignoredNfts).toHaveLength(1);

      await nftController.addNft('0x01', '1', {
        nftMetadata: {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
        },
      });

      expect(
        nftController.state.allNfts[selectedAddress][ChainId.mainnet],
      ).toHaveLength(2);
      expect(nftController.state.ignoredNfts).toHaveLength(1);

      nftController.removeAndIgnoreNft('0x01', '1');
      expect(
        nftController.state.allNfts[selectedAddress][ChainId.mainnet],
      ).toHaveLength(1);
      expect(nftController.state.ignoredNfts).toHaveLength(1);
    });

    it('should add NFT with metadata hosted in IPFS', async () => {
      const selectedAddress = OWNER_ADDRESS;
      const { nftController, triggerPreferencesStateChange } = setupController({
        options: {
          getERC721AssetName: jest
            .fn()
            .mockResolvedValue("Maltjik.jpg's Depressionists"),
          getERC721AssetSymbol: jest.fn().mockResolvedValue('DPNS'),
          getERC721TokenURI: jest.fn().mockImplementation((tokenAddress) => {
            switch (tokenAddress) {
              case ERC721_DEPRESSIONIST_ADDRESS:
                return `ipfs://${DEPRESSIONIST_CID_V1}`;
              default:
                throw new Error('Not an ERC721 token');
            }
          }),
          getERC1155TokenURI: jest
            .fn()
            .mockRejectedValue(new Error('Not an ERC1155 token')),
        },
      });
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        selectedAddress,
        ipfsGateway: IPFS_DEFAULT_GATEWAY_URL,
      });

      await nftController.addNft(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
      );

      expect(
        nftController.state.allNftContracts[selectedAddress][
          ChainId.mainnet
        ][0],
      ).toStrictEqual({
        address: ERC721_DEPRESSIONIST_ADDRESS,
        name: "Maltjik.jpg's Depressionists",
        symbol: 'DPNS',
        schemaName: ERC721,
      });
      expect(
        nftController.state.allNfts[selectedAddress][ChainId.mainnet][0],
      ).toStrictEqual({
        address: ERC721_DEPRESSIONIST_ADDRESS,
        tokenId: '36',
        image: 'image',
        name: 'name',
        description: 'description',
        standard: ERC721,
        favorite: false,
        isCurrentlyOwned: true,
        tokenURI:
          'https://bafybeidf7aw7bmnmewwj4ayq3she2jfk5jrdpp24aaucf6fddzb3cfhrvm.ipfs.cloudflare-ipfs.com',
      });
    });

    it('should add NFT erc721 when call to NFT API fail', async () => {
      const selectedAddress = OWNER_ADDRESS;
      const { nftController } = setupController();
      nock(NFT_API_BASE_URL)
        .get(
          `/tokens?chainIds=1&tokens=${ERC721_NFT_ADDRESS}%3A${ERC721_NFT_ID}&includeTopBid=true&includeAttributes=true&includeLastSale=true`,
        )
        .replyWithError(new Error('Failed to fetch'));

      await nftController.addNft(ERC721_NFT_ADDRESS, ERC721_NFT_ID);

      expect(
        nftController.state.allNfts[selectedAddress][ChainId.mainnet][0],
      ).toStrictEqual({
        address: ERC721_NFT_ADDRESS,
        image: null,
        name: null,
        description: null,
        tokenId: ERC721_NFT_ID,
        standard: null,
        favorite: false,
        isCurrentlyOwned: true,
        tokenURI: null,
      });
    });

    it('should add an NFT with the correct chainId and metadata when passed a networkClientId', async () => {
      nock('https://testtokenuri-1.com')
        .get('/')
        .reply(
          200,
          JSON.stringify({
            image: 'test-image-1',
            name: 'test-name-1',
            description: 'test-description-1',
          }),
        );

      nock('https://testtokenuri-2.com')
        .get('/')
        .reply(
          200,
          JSON.stringify({
            image: 'test-image-2',
            name: 'test-name-2',
            description: 'test-description-2',
          }),
        );

      nock('https://testtokenuri-3.com')
        .get('/')
        .reply(
          200,
          JSON.stringify({
            image: 'test-image-3',
            name: 'test-name-3',
            description: 'test-description-3',
          }),
        );

      const { nftController } = setupController({
        options: {
          getERC721TokenURI: jest.fn().mockImplementation((tokenAddress) => {
            switch (tokenAddress) {
              case '0x01':
                return 'https://testtokenuri-1.com';
              case '0x02':
                return 'https://testtokenuri-2.com';
              default:
                throw new Error('Not an ERC721 token');
            }
          }),
          getERC1155TokenURI: jest.fn().mockImplementation((tokenAddress) => {
            switch (tokenAddress) {
              case '0x03':
                return 'https://testtokenuri-3.com';
              default:
                throw new Error('Not an ERC1155 token');
            }
          }),
        },
        mockNetworkClientConfigurationsByNetworkClientId: {
          'customNetworkClientId-1': buildCustomNetworkClientConfiguration({
            chainId: '0xa',
          }),
        },
      });

      await nftController.addNft('0x01', '1234', {
        networkClientId: 'sepolia',
      });
      await nftController.addNft('0x02', '4321', {
        networkClientId: 'goerli',
      });
      await nftController.addNft('0x03', '5678', {
        networkClientId: 'customNetworkClientId-1',
      });

      expect(
        nftController.state.allNfts[OWNER_ADDRESS][SEPOLIA.chainId],
      ).toStrictEqual([
        {
          address: '0x01',
          description: 'test-description-1',
          image: 'test-image-1',
          name: 'test-name-1',
          tokenId: '1234',
          favorite: false,
          standard: ERC721,
          tokenURI: 'https://testtokenuri-1.com',
          isCurrentlyOwned: true,
        },
      ]);

      expect(
        nftController.state.allNfts[OWNER_ADDRESS][GOERLI.chainId],
      ).toStrictEqual([
        {
          address: '0x02',
          description: 'test-description-2',
          image: 'test-image-2',
          name: 'test-name-2',
          tokenId: '4321',
          favorite: false,
          standard: ERC721,
          tokenURI: 'https://testtokenuri-2.com',
          isCurrentlyOwned: true,
        },
      ]);

      expect(nftController.state.allNfts[OWNER_ADDRESS]['0xa']).toStrictEqual([
        {
          address: '0x03',
          description: 'test-description-3',
          image: 'test-image-3',
          name: 'test-name-3',
          tokenId: '5678',
          favorite: false,
          standard: ERC1155,
          tokenURI: 'https://testtokenuri-3.com',
          isCurrentlyOwned: true,
        },
      ]);
    });

    it('should add an NFT with the correct chainId/userAddress and metadata when passed a userAddress', async () => {
      const userAddress = '0x123ABC';
      nock('https://testtokenuri-1.com')
        .get('/')
        .reply(
          200,
          JSON.stringify({
            image: 'test-image-1',
            name: 'test-name-1',
            description: 'test-description-1',
          }),
        );

      nock('https://testtokenuri-2.com')
        .get('/')
        .reply(
          200,
          JSON.stringify({
            image: 'test-image-2',
            name: 'test-name-2',
            description: 'test-description-2',
          }),
        );

      nock('https://testtokenuri-3.com')
        .get('/')
        .reply(
          200,
          JSON.stringify({
            image: 'test-image-3',
            name: 'test-name-3',
            description: 'test-description-3',
          }),
        );

      const { nftController, changeNetwork } = setupController({
        options: {
          getERC721TokenURI: jest.fn().mockImplementation((tokenAddress) => {
            switch (tokenAddress) {
              case '0x01':
                return 'https://testtokenuri-1.com';
              case '0x02':
                return 'https://testtokenuri-2.com';
              default:
                throw new Error('Not an ERC721 token');
            }
          }),
          getERC1155TokenURI: jest.fn().mockImplementation((tokenAddress) => {
            switch (tokenAddress) {
              case '0x03':
                return 'https://testtokenuri-3.com';
              default:
                throw new Error('Not an ERC1155 token');
            }
          }),
        },
      });

      await nftController.addNft('0x01', '1234', {
        userAddress,
      });

      changeNetwork({ selectedNetworkClientId: InfuraNetworkType.goerli });

      await nftController.addNft('0x02', '4321', {
        userAddress,
      });
      changeNetwork({ selectedNetworkClientId: InfuraNetworkType.sepolia });

      await nftController.addNft('0x03', '5678', {
        userAddress,
      });

      expect(nftController.state.allNfts[userAddress]['0x1']).toStrictEqual([
        {
          address: '0x01',
          description: 'test-description-1',
          image: 'test-image-1',
          name: 'test-name-1',
          tokenId: '1234',
          favorite: false,
          standard: ERC721,
          tokenURI: 'https://testtokenuri-1.com',
          isCurrentlyOwned: true,
        },
      ]);
      expect(
        nftController.state.allNfts[userAddress][GOERLI.chainId],
      ).toStrictEqual([
        {
          address: '0x02',
          description: 'test-description-2',
          image: 'test-image-2',
          name: 'test-name-2',
          tokenId: '4321',
          favorite: false,
          standard: ERC721,
          tokenURI: 'https://testtokenuri-2.com',
          isCurrentlyOwned: true,
        },
      ]);
      expect(
        nftController.state.allNfts[userAddress][SEPOLIA.chainId],
      ).toStrictEqual([
        {
          address: '0x03',
          description: 'test-description-3',
          image: 'test-image-3',
          name: 'test-name-3',
          tokenId: '5678',
          favorite: false,
          standard: ERC1155,
          tokenURI: 'https://testtokenuri-3.com',
          isCurrentlyOwned: true,
        },
      ]);
    });
  });

  describe('addNftVerifyOwnership', () => {
    it('should verify ownership by selected address and add NFT', async () => {
      const tokenURI = 'https://url/';
      const mockGetERC721TokenURI = jest.fn().mockResolvedValue(tokenURI);

      const { nftController, triggerPreferencesStateChange } = setupController({
        options: {
          getERC721TokenURI: mockGetERC721TokenURI,
        },
      });
      const firstAddress = '0x123';
      const secondAddress = '0x321';

      jest.spyOn(nftController, 'isNftOwner').mockResolvedValue(true);
      nock('https://url').get('/').reply(200, {
        name: 'name',
        image: 'url',
        description: 'description',
      });
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
        selectedAddress: firstAddress,
      });
      await nftController.addNftVerifyOwnership('0x01', '1234');
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
        selectedAddress: secondAddress,
      });
      await nftController.addNftVerifyOwnership('0x02', '4321');
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
        selectedAddress: firstAddress,
      });
      expect(
        nftController.state.allNfts[firstAddress][ChainId.mainnet][0],
      ).toStrictEqual({
        address: '0x01',
        description: 'description',
        image: 'url',
        name: 'name',
        tokenId: '1234',
        standard: ERC721,
        tokenURI,
        favorite: false,
        isCurrentlyOwned: true,
      });
    });

    it('should throw an error if selected address is not owner of input NFT', async () => {
      const { nftController, triggerPreferencesStateChange } =
        setupController();
      jest.spyOn(nftController, 'isNftOwner').mockResolvedValue(false);
      const firstAddress = '0x123';
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
        selectedAddress: firstAddress,
      });
      const result = async () =>
        await nftController.addNftVerifyOwnership('0x01', '1234');
      const error = 'This NFT is not owned by the user';
      await expect(result).rejects.toThrow(error);
    });

    it('should verify ownership by selected address and add NFT by the correct chainId when passed networkClientId', async () => {
      const tokenURI = 'https://url/';
      const mockGetERC721TokenURI = jest.fn().mockResolvedValue(tokenURI);
      const { nftController, triggerPreferencesStateChange } = setupController({
        options: {
          getERC721TokenURI: mockGetERC721TokenURI,
        },
      });

      const firstAddress = '0x123';
      const secondAddress = '0x321';

      jest.spyOn(nftController, 'isNftOwner').mockResolvedValue(true);

      nock('https://url')
        .get('/')
        .reply(200, {
          name: 'name',
          image: 'url',
          description: 'description',
        })
        .persist();
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
        selectedAddress: firstAddress,
      });
      await nftController.addNftVerifyOwnership('0x01', '1234', {
        networkClientId: 'sepolia',
      });
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
        selectedAddress: secondAddress,
      });
      await nftController.addNftVerifyOwnership('0x02', '4321', {
        networkClientId: 'goerli',
      });

      expect(
        nftController.state.allNfts[firstAddress][SEPOLIA.chainId][0],
      ).toStrictEqual({
        address: '0x01',
        description: 'description',
        image: 'url',
        name: 'name',
        standard: ERC721,
        tokenId: '1234',
        favorite: false,
        isCurrentlyOwned: true,
        tokenURI,
      });
      expect(
        nftController.state.allNfts[secondAddress][GOERLI.chainId][0],
      ).toStrictEqual({
        address: '0x02',
        description: 'description',
        image: 'url',
        name: 'name',
        standard: ERC721,
        tokenId: '4321',
        favorite: false,
        isCurrentlyOwned: true,
        tokenURI,
      });
    });

    it('should verify ownership by selected address and add NFT by the correct userAddress when passed userAddress', async () => {
      const tokenURI = 'https://url/';
      const mockGetERC721TokenURI = jest.fn().mockResolvedValue(tokenURI);
      const { nftController, changeNetwork, triggerPreferencesStateChange } =
        setupController({
          options: {
            getERC721TokenURI: mockGetERC721TokenURI,
          },
        });
      // Ensure that the currently selected address is not the same as either of the userAddresses
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
        selectedAddress: OWNER_ADDRESS,
      });

      const firstAddress = '0x123';
      const secondAddress = '0x321';

      jest.spyOn(nftController, 'isNftOwner').mockResolvedValue(true);

      nock('https://url')
        .get('/')
        .reply(200, {
          name: 'name',
          image: 'url',
          description: 'description',
        })
        .persist();
      changeNetwork({ selectedNetworkClientId: InfuraNetworkType.sepolia });
      await nftController.addNftVerifyOwnership('0x01', '1234', {
        userAddress: firstAddress,
      });
      changeNetwork({ selectedNetworkClientId: InfuraNetworkType.goerli });
      await nftController.addNftVerifyOwnership('0x02', '4321', {
        userAddress: secondAddress,
      });

      expect(
        nftController.state.allNfts[firstAddress][SEPOLIA.chainId][0],
      ).toStrictEqual({
        address: '0x01',
        description: 'description',
        image: 'url',
        name: 'name',
        tokenId: '1234',
        favorite: false,
        standard: ERC721,
        isCurrentlyOwned: true,
        tokenURI,
      });
      expect(
        nftController.state.allNfts[secondAddress][GOERLI.chainId][0],
      ).toStrictEqual({
        address: '0x02',
        description: 'description',
        image: 'url',
        name: 'name',
        tokenId: '4321',
        standard: ERC721,
        favorite: false,
        isCurrentlyOwned: true,
        tokenURI,
      });
    });
  });

  describe('removeNft', () => {
    it('should remove NFT and NFT contract', async () => {
      const selectedAddress = OWNER_ADDRESS;
      const { nftController } = setupController({
        options: {
          selectedAddress,
        },
      });

      await nftController.addNft('0x01', '1', {
        nftMetadata: {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
        },
      });
      nftController.removeNft('0x01', '1');
      expect(
        nftController.state.allNfts[selectedAddress][ChainId.mainnet],
      ).toHaveLength(0);

      expect(
        nftController.state.allNftContracts[selectedAddress][ChainId.mainnet],
      ).toHaveLength(0);
    });

    it('should not remove NFT contract if NFT still exists', async () => {
      const selectedAddress = OWNER_ADDRESS;
      const { nftController } = setupController();

      await nftController.addNft('0x01', '1', {
        nftMetadata: {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
        },
      });

      await nftController.addNft('0x01', '2', {
        nftMetadata: {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
        },
      });
      nftController.removeNft('0x01', '1');
      expect(
        nftController.state.allNfts[selectedAddress][ChainId.mainnet],
      ).toHaveLength(1);

      expect(
        nftController.state.allNftContracts[selectedAddress][ChainId.mainnet],
      ).toHaveLength(1);
    });

    it('should remove NFT by selected address', async () => {
      const tokenURI = 'https://url/';
      const mockGetERC721TokenURI = jest.fn().mockResolvedValue(tokenURI);
      const { nftController, triggerPreferencesStateChange } = setupController({
        options: {
          getERC721TokenURI: mockGetERC721TokenURI,
        },
      });
      nock('https://url').get('/').reply(200, {
        name: 'name',
        image: 'url',
        description: 'description',
      });
      const firstAddress = '0x123';
      const secondAddress = '0x321';
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
        selectedAddress: firstAddress,
      });
      await nftController.addNft('0x02', '4321');
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
        selectedAddress: secondAddress,
      });
      await nftController.addNft('0x01', '1234');
      nftController.removeNft('0x01', '1234');
      expect(
        nftController.state.allNfts[secondAddress][ChainId.mainnet],
      ).toHaveLength(0);
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
        selectedAddress: firstAddress,
      });
      expect(
        nftController.state.allNfts[firstAddress][ChainId.mainnet][0],
      ).toStrictEqual({
        address: '0x02',
        description: 'description',
        image: 'url',
        name: 'name',
        tokenId: '4321',
        favorite: false,
        isCurrentlyOwned: true,
        tokenURI,
        standard: ERC721,
      });
    });

    it('should remove NFT by provider type', async () => {
      const selectedAddress = OWNER_ADDRESS;
      const tokenURI = 'https://url/';
      const mockGetERC721TokenURI = jest.fn().mockResolvedValue(tokenURI);
      const { nftController, changeNetwork } = setupController({
        options: {
          selectedAddress,
          getERC721TokenURI: mockGetERC721TokenURI,
        },
      });

      nock('https://url').get('/').reply(200, {
        name: 'name',
        image: 'url',
        description: 'description',
      });
      changeNetwork({ selectedNetworkClientId: InfuraNetworkType.sepolia });
      await nftController.addNft('0x02', '4321');
      changeNetwork({ selectedNetworkClientId: InfuraNetworkType.goerli });
      await nftController.addNft('0x01', '1234');
      nftController.removeNft('0x01', '1234');
      expect(
        nftController.state.allNfts[selectedAddress][GOERLI.chainId],
      ).toHaveLength(0);

      changeNetwork({ selectedNetworkClientId: InfuraNetworkType.sepolia });

      expect(
        nftController.state.allNfts[selectedAddress][SEPOLIA.chainId][0],
      ).toStrictEqual({
        address: '0x02',
        description: 'description',
        image: 'url',
        name: 'name',
        tokenId: '4321',
        favorite: false,
        isCurrentlyOwned: true,
        tokenURI,
        standard: ERC721,
      });
    });

    it('should remove correct NFT and NFT contract when passed networkClientId and userAddress in options', async () => {
      const { nftController, changeNetwork, triggerPreferencesStateChange } =
        setupController();

      const userAddress1 = '0x123';
      const userAddress2 = '0x321';

      changeNetwork({ selectedNetworkClientId: InfuraNetworkType.sepolia });
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
        selectedAddress: userAddress1,
      });

      await nftController.addNft('0x01', '1', {
        nftMetadata: {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
        },
      });

      expect(
        nftController.state.allNfts[userAddress1][SEPOLIA.chainId][0],
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

      changeNetwork({ selectedNetworkClientId: InfuraNetworkType.goerli });
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
        selectedAddress: userAddress2,
      });

      // now remove the nft after changing to a different network and account from the one where it was added
      nftController.removeNft('0x01', '1', {
        networkClientId: SEPOLIA.type,
        userAddress: userAddress1,
      });

      expect(
        nftController.state.allNfts[userAddress1][SEPOLIA.chainId],
      ).toHaveLength(0);

      expect(
        nftController.state.allNftContracts[userAddress1][SEPOLIA.chainId],
      ).toHaveLength(0);
    });
  });

  it('should be able to clear the ignoredNfts list', async () => {
    const selectedAddress = OWNER_ADDRESS;
    const { nftController } = setupController({
      options: {
        selectedAddress,
      },
    });

    await nftController.addNft('0x02', '1', {
      nftMetadata: {
        name: 'name',
        image: 'image',
        description: 'description',
        standard: 'standard',
        favorite: false,
      },
    });

    expect(
      nftController.state.allNfts[selectedAddress][ChainId.mainnet],
    ).toHaveLength(1);
    expect(nftController.state.ignoredNfts).toHaveLength(0);

    nftController.removeAndIgnoreNft('0x02', '1');
    expect(
      nftController.state.allNfts[selectedAddress][ChainId.mainnet],
    ).toHaveLength(0);
    expect(nftController.state.ignoredNfts).toHaveLength(1);

    nftController.clearIgnoredNfts();
    expect(nftController.state.ignoredNfts).toHaveLength(0);
  });

  describe('isNftOwner', () => {
    it('should verify the ownership of an NFT when passed a networkClientId', async () => {
      const mockGetERC721OwnerOf = jest.fn().mockResolvedValue(OWNER_ADDRESS);
      const mockGetERC1155BalanceOf = jest
        .fn()
        .mockRejectedValue(new Error('ERC1155 error'));
      const { nftController } = setupController({
        options: {
          getERC721OwnerOf: mockGetERC721OwnerOf,
          getERC1155BalanceOf: mockGetERC1155BalanceOf,
        },
      });

      const isOwner = await nftController.isNftOwner(
        OWNER_ADDRESS,
        '0x2b26675403a063d92ccad0293d387485471a7d3a',
        String(1),
        { networkClientId: 'sepolia' },
      );
      expect(isOwner).toBe(true);
    });

    it('should verify the ownership of an ERC-721 NFT with the correct owner address', async () => {
      const mockGetERC721OwnerOf = jest.fn().mockResolvedValue(OWNER_ADDRESS);
      const mockGetERC1155BalanceOf = jest
        .fn()
        .mockRejectedValue(new Error('ERC1155 error'));
      const { nftController } = setupController({
        options: {
          getERC721OwnerOf: mockGetERC721OwnerOf,
          getERC1155BalanceOf: mockGetERC1155BalanceOf,
        },
      });

      const isOwner = await nftController.isNftOwner(
        OWNER_ADDRESS,
        ERC721_NFT_ADDRESS,
        String(ERC721_NFT_ID),
      );
      expect(isOwner).toBe(true);
    });

    it('should not verify the ownership of an ERC-721 NFT with the wrong owner address', async () => {
      const mockGetERC721OwnerOf = jest.fn().mockResolvedValue(OWNER_ADDRESS);
      const mockGetERC1155BalanceOf = jest
        .fn()
        .mockRejectedValue(new Error('ERC1155 error'));
      const { nftController } = setupController({
        options: {
          getERC721OwnerOf: mockGetERC721OwnerOf,
          getERC1155BalanceOf: mockGetERC1155BalanceOf,
        },
      });

      const isOwner = await nftController.isNftOwner(
        '0x0000000000000000000000000000000000000000',
        ERC721_NFT_ADDRESS,
        String(ERC721_NFT_ID),
      );
      expect(isOwner).toBe(false);
    });

    it('should verify the ownership of an ERC-1155 NFT with the correct owner address', async () => {
      const mockGetERC721OwnerOf = jest
        .fn()
        .mockRejectedValue(new Error('ERC721 error'));
      const mockGetERC1155BalanceOf = jest.fn().mockResolvedValue(new BN(1));
      const { nftController } = setupController({
        options: {
          getERC721OwnerOf: mockGetERC721OwnerOf,
          getERC1155BalanceOf: mockGetERC1155BalanceOf,
        },
      });

      const isOwner = await nftController.isNftOwner(
        OWNER_ADDRESS,
        ERC1155_NFT_ADDRESS,
        ERC1155_NFT_ID,
      );
      expect(isOwner).toBe(true);
    });

    it('should not verify the ownership of an ERC-1155 NFT with the wrong owner address', async () => {
      const mockGetERC721OwnerOf = jest
        .fn()
        .mockRejectedValue(new Error('ERC721 error'));
      const mockGetERC1155BalanceOf = jest.fn().mockResolvedValue(new BN(0));
      const { nftController } = setupController({
        options: {
          getERC721OwnerOf: mockGetERC721OwnerOf,
          getERC1155BalanceOf: mockGetERC1155BalanceOf,
        },
      });

      const isOwner = await nftController.isNftOwner(
        '0x0000000000000000000000000000000000000000',
        ERC1155_NFT_ADDRESS,
        ERC1155_NFT_ID,
      );

      expect(isOwner).toBe(false);
    });

    it('should throw an error for an unsupported standard', async () => {
      const mockGetERC721OwnerOf = jest
        .fn()
        .mockRejectedValue(new Error('ERC721 error'));
      const mockGetERC1155BalanceOf = jest
        .fn()
        .mockRejectedValue(new Error('ERC1155 error'));
      const { nftController } = setupController({
        options: {
          getERC721OwnerOf: mockGetERC721OwnerOf,
          getERC1155BalanceOf: mockGetERC1155BalanceOf,
        },
      });
      const error =
        "Unable to verify ownership. Possibly because the standard is not supported or the user's currently selected network does not match the chain of the asset in question.";
      const result = async () => {
        await nftController.isNftOwner(
          '0x0000000000000000000000000000000000000000',
          CRYPTOPUNK_ADDRESS,
          '0',
        );
      };
      await expect(result).rejects.toThrow(error);
    });

    it('should add NFT with null metadata if the ipfs gateway is disabled and opensea is disabled', async () => {
      const selectedAddress = OWNER_ADDRESS;
      const { nftController, triggerPreferencesStateChange } = setupController({
        options: {
          getERC721TokenURI: jest.fn().mockRejectedValue(''),
          getERC1155TokenURI: jest.fn().mockResolvedValue('ipfs://*'),
        },
      });

      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        selectedAddress,
        isIpfsGatewayEnabled: false,
        openSeaEnabled: false,
      });

      await nftController.addNft(ERC1155_NFT_ADDRESS, ERC1155_NFT_ID);

      expect(
        nftController.state.allNfts[selectedAddress][ChainId.mainnet][0],
      ).toStrictEqual({
        address: ERC1155_NFT_ADDRESS,
        name: null,
        description: null,
        image: null,
        tokenId: ERC1155_NFT_ID,
        standard: ERC1155,
        favorite: false,
        isCurrentlyOwned: true,
        tokenURI: 'ipfs://*',
      });
    });
  });

  describe('updateNftFavoriteStatus', () => {
    it('should not set NFT as favorite if nft not found', async () => {
      const selectedAddress = OWNER_ADDRESS;
      const { nftController } = setupController({
        options: {
          selectedAddress,
        },
      });

      await nftController.addNft(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
        { nftMetadata: { name: '', description: '', image: '', standard: '' } },
      );

      nftController.updateNftFavoriteStatus(
        ERC721_DEPRESSIONIST_ADDRESS,
        '666',
        true,
      );

      expect(
        nftController.state.allNfts[selectedAddress][ChainId.mainnet][0],
      ).toStrictEqual(
        expect.objectContaining({
          address: ERC721_DEPRESSIONIST_ADDRESS,
          tokenId: ERC721_DEPRESSIONIST_ID,
          favorite: false,
        }),
      );
    });
    it('should set NFT as favorite', async () => {
      const selectedAddress = OWNER_ADDRESS;
      const { nftController } = setupController({
        options: {
          selectedAddress,
        },
      });

      await nftController.addNft(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
        { nftMetadata: { name: '', description: '', image: '', standard: '' } },
      );

      nftController.updateNftFavoriteStatus(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
        true,
      );

      expect(
        nftController.state.allNfts[selectedAddress][ChainId.mainnet][0],
      ).toStrictEqual(
        expect.objectContaining({
          address: ERC721_DEPRESSIONIST_ADDRESS,
          tokenId: ERC721_DEPRESSIONIST_ID,
          favorite: true,
        }),
      );
    });

    it('should set NFT as favorite and then unset it', async () => {
      const selectedAddress = OWNER_ADDRESS;
      const { nftController } = setupController({
        options: {
          selectedAddress,
        },
      });

      await nftController.addNft(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
        { nftMetadata: { name: '', description: '', image: '', standard: '' } },
      );

      nftController.updateNftFavoriteStatus(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
        true,
      );

      expect(
        nftController.state.allNfts[selectedAddress][ChainId.mainnet][0],
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
        nftController.state.allNfts[selectedAddress][ChainId.mainnet][0],
      ).toStrictEqual(
        expect.objectContaining({
          address: ERC721_DEPRESSIONIST_ADDRESS,
          tokenId: ERC721_DEPRESSIONIST_ID,
          favorite: false,
        }),
      );
    });

    it('should keep the favorite status as true after updating metadata', async () => {
      const selectedAddress = OWNER_ADDRESS;
      const { nftController } = setupController({
        options: {
          selectedAddress,
        },
      });

      await nftController.addNft(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
        { nftMetadata: { name: '', description: '', image: '', standard: '' } },
      );

      nftController.updateNftFavoriteStatus(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
        true,
      );

      expect(
        nftController.state.allNfts[selectedAddress][ChainId.mainnet][0],
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
          nftMetadata: {
            image: 'new_image',
            name: 'new_name',
            description: 'new_description',
            standard: ERC721,
          },
        },
      );

      expect(
        nftController.state.allNfts[selectedAddress][ChainId.mainnet][0],
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
        nftController.state.allNfts[selectedAddress][ChainId.mainnet],
      ).toHaveLength(1);
    });

    it('should keep the favorite status as false after updating metadata', async () => {
      const selectedAddress = OWNER_ADDRESS;
      const { nftController } = setupController({
        options: {
          selectedAddress,
        },
      });

      await nftController.addNft(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
        { nftMetadata: { name: '', description: '', image: '', standard: '' } },
      );

      expect(
        nftController.state.allNfts[selectedAddress][ChainId.mainnet][0],
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
          nftMetadata: {
            image: 'new_image',
            name: 'new_name',
            description: 'new_description',
            standard: ERC721,
          },
        },
      );

      expect(
        nftController.state.allNfts[selectedAddress][ChainId.mainnet][0],
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
        nftController.state.allNfts[selectedAddress][ChainId.mainnet],
      ).toHaveLength(1);
    });

    it('should set NFT as favorite when passed networkClientId and userAddress in options', async () => {
      const { nftController, triggerPreferencesStateChange, changeNetwork } =
        setupController();

      const userAddress1 = '0x123';
      const userAddress2 = '0x321';

      changeNetwork({ selectedNetworkClientId: InfuraNetworkType.sepolia });
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
        selectedAddress: userAddress1,
      });

      await nftController.addNft(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
        { nftMetadata: { name: '', description: '', image: '', standard: '' } },
      );

      expect(
        nftController.state.allNfts[userAddress1][SEPOLIA.chainId][0],
      ).toStrictEqual(
        expect.objectContaining({
          address: ERC721_DEPRESSIONIST_ADDRESS,
          tokenId: ERC721_DEPRESSIONIST_ID,
          favorite: false,
        }),
      );

      changeNetwork({ selectedNetworkClientId: InfuraNetworkType.goerli });
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        openSeaEnabled: true,
        selectedAddress: userAddress2,
      });

      // now favorite the nft after changing to a different account from the one where it was added
      nftController.updateNftFavoriteStatus(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
        true,
        {
          networkClientId: SEPOLIA.type,
          userAddress: userAddress1,
        },
      );

      expect(
        nftController.state.allNfts[userAddress1][SEPOLIA.chainId][0],
      ).toStrictEqual(
        expect.objectContaining({
          address: ERC721_DEPRESSIONIST_ADDRESS,
          tokenId: ERC721_DEPRESSIONIST_ID,
          favorite: true,
        }),
      );
    });
  });

  describe('checkAndUpdateNftsOwnershipStatus', () => {
    describe('checkAndUpdateAllNftsOwnershipStatus', () => {
      it('should check whether NFTs for the current selectedAddress/chainId combination are still owned by the selectedAddress and update the isCurrentlyOwned value to false when NFT is not still owned', async () => {
        const selectedAddress = OWNER_ADDRESS;
        const { nftController } = setupController({
          options: {
            selectedAddress,
          },
        });
        jest.spyOn(nftController, 'isNftOwner').mockResolvedValue(false);

        await nftController.addNft('0x02', '1', {
          nftMetadata: {
            name: 'name',
            image: 'image',
            description: 'description',
            standard: 'standard',
            favorite: false,
          },
        });
        expect(
          nftController.state.allNfts[selectedAddress][ChainId.mainnet][0]
            .isCurrentlyOwned,
        ).toBe(true);

        await nftController.checkAndUpdateAllNftsOwnershipStatus();

        expect(
          nftController.state.allNfts[selectedAddress][ChainId.mainnet][0]
            .isCurrentlyOwned,
        ).toBe(false);
      });

      it('should check whether NFTs for the current selectedAddress/chainId combination are still owned by the selectedAddress and leave/set the isCurrentlyOwned value to true when NFT is still owned', async () => {
        const selectedAddress = OWNER_ADDRESS;
        const { nftController } = setupController({
          options: {
            selectedAddress,
          },
        });
        jest.spyOn(nftController, 'isNftOwner').mockResolvedValue(true);

        await nftController.addNft('0x02', '1', {
          nftMetadata: {
            name: 'name',
            image: 'image',
            description: 'description',
            standard: 'standard',
            favorite: false,
          },
        });

        expect(
          nftController.state.allNfts[selectedAddress][ChainId.mainnet][0]
            .isCurrentlyOwned,
        ).toBe(true);

        await nftController.checkAndUpdateAllNftsOwnershipStatus();
        expect(
          nftController.state.allNfts[selectedAddress][ChainId.mainnet][0]
            .isCurrentlyOwned,
        ).toBe(true);
      });

      it('should check whether NFTs for the current selectedAddress/chainId combination are still owned by the selectedAddress and leave the isCurrentlyOwned value as is when NFT ownership check fails', async () => {
        const selectedAddress = OWNER_ADDRESS;
        const { nftController } = setupController({
          options: {
            selectedAddress,
          },
        });
        jest
          .spyOn(nftController, 'isNftOwner')
          .mockRejectedValue('Unable to verify ownership');

        await nftController.addNft('0x02', '1', {
          nftMetadata: {
            name: 'name',
            image: 'image',
            description: 'description',
            standard: 'standard',
            favorite: false,
          },
        });

        expect(
          nftController.state.allNfts[selectedAddress][ChainId.mainnet][0]
            .isCurrentlyOwned,
        ).toBe(true);

        await nftController.checkAndUpdateAllNftsOwnershipStatus();
        expect(
          nftController.state.allNfts[selectedAddress][ChainId.mainnet][0]
            .isCurrentlyOwned,
        ).toBe(true);
      });

      it('should check whether NFTs for the current selectedAddress/chainId combination are still owned by the selectedAddress and update the isCurrentlyOwned value to false when NFT is not still owned, when the currently configured selectedAddress/chainId are different from those passed', async () => {
        const selectedAddress = OWNER_ADDRESS;
        const { nftController, changeNetwork, triggerPreferencesStateChange } =
          setupController();

        triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          openSeaEnabled: true,
          selectedAddress,
        });
        changeNetwork({ selectedNetworkClientId: InfuraNetworkType.sepolia });

        await nftController.addNft('0x02', '1', {
          nftMetadata: {
            name: 'name',
            image: 'image',
            description: 'description',
            standard: 'standard',
            favorite: false,
          },
        });

        expect(
          nftController.state.allNfts[selectedAddress][ChainId.sepolia][0]
            .isCurrentlyOwned,
        ).toBe(true);

        jest.spyOn(nftController, 'isNftOwner').mockResolvedValue(false);

        triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          openSeaEnabled: true,
          selectedAddress: SECOND_OWNER_ADDRESS,
        });
        changeNetwork({ selectedNetworkClientId: InfuraNetworkType.goerli });

        await nftController.checkAndUpdateAllNftsOwnershipStatus({
          userAddress: OWNER_ADDRESS,
          networkClientId: 'sepolia',
        });

        expect(
          nftController.state.allNfts[OWNER_ADDRESS][SEPOLIA.chainId][0]
            .isCurrentlyOwned,
        ).toBe(false);
      });
    });

    describe('checkAndUpdateSingleNftOwnershipStatus', () => {
      it('should check whether the passed NFT is still owned by the the current selectedAddress/chainId combination and update its isCurrentlyOwned property in state if batch is false and isNftOwner returns false', async () => {
        const selectedAddress = OWNER_ADDRESS;
        const { nftController } = setupController({
          options: {
            selectedAddress,
          },
        });

        const nft = {
          address: '0x02',
          tokenId: '1',
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
          favorite: false,
        };

        await nftController.addNft(nft.address, nft.tokenId, {
          nftMetadata: nft,
        });

        expect(
          nftController.state.allNfts[selectedAddress][ChainId.mainnet][0]
            .isCurrentlyOwned,
        ).toBe(true);

        jest.spyOn(nftController, 'isNftOwner').mockResolvedValue(false);

        await nftController.checkAndUpdateSingleNftOwnershipStatus(nft, false);

        expect(
          nftController.state.allNfts[selectedAddress][ChainId.mainnet][0]
            .isCurrentlyOwned,
        ).toBe(false);
      });

      it('should check whether the passed NFT is still owned by the the current selectedAddress/chainId combination and return the updated NFT object without updating state if batch is true', async () => {
        const selectedAddress = OWNER_ADDRESS;
        const { nftController } = setupController({
          options: {
            selectedAddress,
          },
        });

        const nft = {
          address: '0x02',
          tokenId: '1',
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
          favorite: false,
        };

        await nftController.addNft(nft.address, nft.tokenId, {
          nftMetadata: nft,
        });

        expect(
          nftController.state.allNfts[selectedAddress][ChainId.mainnet][0]
            .isCurrentlyOwned,
        ).toBe(true);

        jest.spyOn(nftController, 'isNftOwner').mockResolvedValue(false);

        const updatedNft =
          await nftController.checkAndUpdateSingleNftOwnershipStatus(nft, true);

        expect(
          nftController.state.allNfts[selectedAddress][ChainId.mainnet][0]
            .isCurrentlyOwned,
        ).toBe(true);

        expect(updatedNft.isCurrentlyOwned).toBe(false);
      });

      it('should check whether the passed NFT is still owned by the the selectedAddress/chainId combination passed in the accountParams argument and update its isCurrentlyOwned property in state, when the currently configured selectedAddress/chainId are different from those passed', async () => {
        const firstSelectedAddress = OWNER_ADDRESS;
        const { nftController, changeNetwork, triggerPreferencesStateChange } =
          setupController();

        triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          openSeaEnabled: true,
          selectedAddress: firstSelectedAddress,
        });
        changeNetwork({ selectedNetworkClientId: InfuraNetworkType.sepolia });

        const nft = {
          address: '0x02',
          tokenId: '1',
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
          favorite: false,
        };

        await nftController.addNft(nft.address, nft.tokenId, {
          nftMetadata: nft,
        });

        expect(
          nftController.state.allNfts[firstSelectedAddress][ChainId.sepolia][0]
            .isCurrentlyOwned,
        ).toBe(true);

        jest.spyOn(nftController, 'isNftOwner').mockResolvedValue(false);

        triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          openSeaEnabled: true,
          selectedAddress: SECOND_OWNER_ADDRESS,
        });
        changeNetwork({ selectedNetworkClientId: InfuraNetworkType.goerli });

        await nftController.checkAndUpdateSingleNftOwnershipStatus(nft, false, {
          userAddress: OWNER_ADDRESS,
          networkClientId: 'sepolia',
        });

        expect(
          nftController.state.allNfts[OWNER_ADDRESS][SEPOLIA.chainId][0]
            .isCurrentlyOwned,
        ).toBe(false);
      });

      it('should check whether the passed NFT is still owned by the the selectedAddress/chainId combination passed in the accountParams argument and return the updated NFT object without updating state, when the currently configured selectedAddress/chainId are different from those passed and batch is true', async () => {
        const firstSelectedAddress = OWNER_ADDRESS;
        const { nftController, changeNetwork, triggerPreferencesStateChange } =
          setupController();

        triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          openSeaEnabled: true,
          selectedAddress: OWNER_ADDRESS,
        });
        changeNetwork({ selectedNetworkClientId: InfuraNetworkType.sepolia });

        const nft = {
          address: '0x02',
          tokenId: '1',
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'standard',
          favorite: false,
        };

        await nftController.addNft(nft.address, nft.tokenId, {
          nftMetadata: nft,
        });

        expect(
          nftController.state.allNfts[firstSelectedAddress][ChainId.sepolia][0]
            .isCurrentlyOwned,
        ).toBe(true);

        jest.spyOn(nftController, 'isNftOwner').mockResolvedValue(false);

        triggerPreferencesStateChange({
          ...getDefaultPreferencesState(),
          openSeaEnabled: true,
          selectedAddress: SECOND_OWNER_ADDRESS,
        });
        changeNetwork({ selectedNetworkClientId: InfuraNetworkType.goerli });

        const updatedNft =
          await nftController.checkAndUpdateSingleNftOwnershipStatus(
            nft,
            false,
            {
              userAddress: OWNER_ADDRESS,
              networkClientId: SEPOLIA.type,
            },
          );

        expect(updatedNft).toStrictEqual({
          ...nft,
          isCurrentlyOwned: false,
        });

        expect(
          nftController.state.allNfts[OWNER_ADDRESS][SEPOLIA.chainId][0]
            .isCurrentlyOwned,
        ).toBe(false);
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

    it('should return null if the NFT does not exist in the state', async () => {
      const selectedAddress = OWNER_ADDRESS;
      const { nftController } = setupController({
        options: {
          selectedAddress,
        },
      });

      expect(
        nftController.findNftByAddressAndTokenId(
          mockNft.address,
          mockNft.tokenId,
          selectedAddress,
          ChainId.mainnet,
        ),
      ).toBeNull();
    });

    it('should return the NFT by the address and tokenId', () => {
      const selectedAddress = OWNER_ADDRESS;
      const { nftController } = setupController({
        options: {
          selectedAddress,
          state: {
            allNfts: {
              [OWNER_ADDRESS]: { [ChainId.mainnet]: [mockNft] },
            },
          },
        },
      });

      expect(
        nftController.findNftByAddressAndTokenId(
          mockNft.address,
          mockNft.tokenId,
          selectedAddress,
          ChainId.mainnet,
        ),
      ).toStrictEqual({ nft: mockNft, index: 0 });
    });
  });

  describe('updateNftByAddressAndTokenId', () => {
    const selectedAddress = OWNER_ADDRESS;
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

    it('should update the NFT if the NFT exist', async () => {
      const { nftController } = setupController({
        options: {
          selectedAddress,
          state: {
            allNfts: {
              [OWNER_ADDRESS]: { [ChainId.mainnet]: [mockNft] },
            },
          },
        },
      });

      nftController.updateNft(
        mockNft,
        {
          transactionId: mockTransactionId,
        },
        selectedAddress,
        ChainId.mainnet,
      );

      expect(
        nftController.state.allNfts[selectedAddress][ChainId.mainnet][0],
      ).toStrictEqual(expectedMockNft);
    });

    it('should return undefined if the NFT does not exist', () => {
      const { nftController } = setupController({
        options: {
          selectedAddress,
        },
      });

      expect(
        nftController.updateNft(
          mockNft,
          {
            transactionId: mockTransactionId,
          },
          selectedAddress,
          ChainId.mainnet,
        ),
      ).toBeUndefined();
    });
  });

  describe('resetNftTransactionStatusByTransactionId', () => {
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

    it('should not update any NFT state and should return false when passed a transaction id that does not match that of any NFT', async () => {
      const selectedAddress = OWNER_ADDRESS;
      const { nftController } = setupController({
        options: {
          selectedAddress,
        },
      });

      expect(
        nftController.resetNftTransactionStatusByTransactionId(
          nonExistTransactionId,
          selectedAddress,
          ChainId.mainnet,
        ),
      ).toBe(false);
    });

    it('should set the transaction id of an NFT in state to undefined, and return true when it has successfully updated this state', async () => {
      const selectedAddress = OWNER_ADDRESS;
      const { nftController } = setupController({
        options: {
          selectedAddress,
          state: {
            allNfts: {
              [OWNER_ADDRESS]: { [ChainId.mainnet]: [mockNft] },
            },
          },
        },
      });

      expect(
        nftController.state.allNfts[selectedAddress][ChainId.mainnet][0]
          .transactionId,
      ).toBe(mockTransactionId);

      expect(
        nftController.resetNftTransactionStatusByTransactionId(
          mockTransactionId,
          selectedAddress,
          ChainId.mainnet,
        ),
      ).toBe(true);

      expect(
        nftController.state.allNfts[selectedAddress][ChainId.mainnet][0]
          .transactionId,
      ).toBeUndefined();
    });
  });

  describe('updateNftMetadata', () => {
    it('should update Nft metadata successfully', async () => {
      const selectedAddress = OWNER_ADDRESS;
      const tokenURI = 'https://api.pudgypenguins.io/lil/4';
      const mockGetERC721TokenURI = jest.fn().mockResolvedValue(tokenURI);
      const { nftController } = setupController({
        options: {
          selectedAddress,
          getERC721TokenURI: mockGetERC721TokenURI,
        },
      });
      const spy = jest.spyOn(nftController, 'updateNft');
      const testNetworkClientId = 'sepolia';
      await nftController.addNft('0xtest', '3', {
        nftMetadata: { name: '', description: '', image: '', standard: '' },
        networkClientId: testNetworkClientId,
      });

      nock('https://api.pudgypenguins.io').get('/lil/4').reply(200, {
        name: 'name pudgy',
        image: 'url pudgy',
        description: 'description pudgy',
      });
      const testInputNfts: Nft[] = [
        {
          address: '0xtest',
          description: null,
          favorite: false,
          image: null,
          isCurrentlyOwned: true,
          name: null,
          standard: ERC721,
          tokenId: '3',
          tokenURI,
        },
      ];

      await nftController.updateNftMetadata({
        nfts: testInputNfts,
        networkClientId: testNetworkClientId,
      });
      expect(spy).toHaveBeenCalledTimes(1);

      expect(
        nftController.state.allNfts[selectedAddress][SEPOLIA.chainId][0],
      ).toStrictEqual({
        address: '0xtest',
        description: 'description pudgy',
        image: 'url pudgy',
        name: 'name pudgy',
        tokenId: '3',
        standard: ERC721,
        favorite: false,
        isCurrentlyOwned: true,
        tokenURI: 'https://api.pudgypenguins.io/lil/4',
      });
    });

    it('should not update metadata when state nft and fetched nft are the same', async () => {
      const selectedAddress = OWNER_ADDRESS;
      const tokenURI = 'https://url/';
      const mockGetERC721TokenURI = jest.fn().mockResolvedValue(tokenURI);
      const { nftController } = setupController({
        options: {
          selectedAddress,
          getERC721TokenURI: mockGetERC721TokenURI,
        },
      });
      const updateNftSpy = jest.spyOn(nftController, 'updateNft');
      const testNetworkClientId = 'sepolia';
      await nftController.addNft('0xtest', '3', {
        nftMetadata: {
          name: 'toto',
          description: 'description',
          image: 'image.png',
          standard: ERC721,
          tokenURI,
        },
        networkClientId: testNetworkClientId,
      });

      nock('https://url')
        .get('/')
        .reply(200, {
          name: 'toto',
          image: 'image.png',
          description: 'description',
        })
        .persist();
      const testInputNfts: Nft[] = [
        {
          address: '0xtest',
          description: 'description',
          favorite: false,
          image: 'image.png',
          isCurrentlyOwned: true,
          name: 'toto',
          standard: ERC721,
          tokenId: '3',
        },
      ];

      await nftController.updateNftMetadata({
        nfts: testInputNfts,
        networkClientId: testNetworkClientId,
      });

      expect(updateNftSpy).toHaveBeenCalledTimes(0);
      expect(
        nftController.state.allNfts[selectedAddress][SEPOLIA.chainId][0],
      ).toStrictEqual({
        address: '0xtest',
        description: 'description',
        favorite: false,
        image: 'image.png',
        isCurrentlyOwned: true,
        name: 'toto',
        standard: ERC721,
        tokenId: '3',
        tokenURI,
      });
    });

    it('should trigger update metadata when state nft and fetched nft are not the same', async () => {
      const selectedAddress = OWNER_ADDRESS;
      const tokenURI = 'https://url/';
      const mockGetERC721TokenURI = jest.fn().mockResolvedValue(tokenURI);
      const { nftController } = setupController({
        options: {
          selectedAddress,
          getERC721TokenURI: mockGetERC721TokenURI,
        },
      });
      const spy = jest.spyOn(nftController, 'updateNft');
      const testNetworkClientId = 'sepolia';
      await nftController.addNft('0xtest', '3', {
        nftMetadata: {
          name: 'toto',
          description: 'description',
          image: 'image.png',
          standard: ERC721,
        },
        networkClientId: testNetworkClientId,
      });

      nock('https://url').get('/').reply(200, {
        name: 'toto',
        image: 'image-updated.png',
        description: 'description',
      });
      const testInputNfts: Nft[] = [
        {
          address: '0xtest',
          description: 'description',
          favorite: false,
          image: 'image.png',
          isCurrentlyOwned: true,
          name: 'toto',
          standard: ERC721,
          tokenId: '3',
        },
      ];

      await nftController.updateNftMetadata({
        nfts: testInputNfts,
        networkClientId: testNetworkClientId,
      });

      expect(spy).toHaveBeenCalledTimes(1);
      expect(
        nftController.state.allNfts[selectedAddress][SEPOLIA.chainId][0],
      ).toStrictEqual({
        address: '0xtest',
        description: 'description',
        favorite: false,
        image: 'image-updated.png',
        isCurrentlyOwned: true,
        name: 'toto',
        standard: ERC721,
        tokenId: '3',
        tokenURI,
      });
    });

    it('should not update metadata when nfts has image/name/description already', async () => {
      const { nftController, triggerPreferencesStateChange } =
        setupController();
      const spy = jest.spyOn(nftController, 'updateNftMetadata');
      const testNetworkClientId = 'sepolia';

      // Add nfts
      await nftController.addNft('0xtest', '3', {
        nftMetadata: {
          name: 'test name',
          description: 'test description',
          image: 'test image',
          standard: ERC721,
        },
        userAddress: OWNER_ADDRESS,
        networkClientId: testNetworkClientId,
      });

      // trigger preference change
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        isIpfsGatewayEnabled: false,
        openSeaEnabled: true,
        selectedAddress: OWNER_ADDRESS,
      });

      expect(spy).toHaveBeenCalledTimes(0);
    });

    it('should trigger calling updateNftMetadata when preferences change - openseaEnabled', async () => {
      const tokenURI = 'https://url/';
      const mockGetERC721TokenURI = jest.fn().mockResolvedValue(tokenURI);
      const { nftController, triggerPreferencesStateChange, changeNetwork } =
        setupController({
          options: {
            getERC721TokenURI: mockGetERC721TokenURI,
          },
        });
      changeNetwork({ selectedNetworkClientId: InfuraNetworkType.sepolia });
      const spy = jest.spyOn(nftController, 'updateNftMetadata');

      const testNetworkClientId = 'sepolia';
      // Add nfts
      await nftController.addNft('0xtest', '1', {
        nftMetadata: {
          name: '',
          description: '',
          image: '',
          standard: ERC721,
        },
        userAddress: OWNER_ADDRESS,
        networkClientId: testNetworkClientId,
      });

      expect(
        nftController.state.allNfts[OWNER_ADDRESS][SEPOLIA.chainId][0]
          .isCurrentlyOwned,
      ).toBe(true);

      nock('https://url').get('/').reply(200, {
        name: 'name pudgy',
        image: 'url pudgy',
        description: 'description pudgy',
      });

      // trigger preference change
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        isIpfsGatewayEnabled: false,
        openSeaEnabled: true,
        selectedAddress: OWNER_ADDRESS,
      });

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('should trigger calling updateNftMetadata when preferences change - ipfs enabled', async () => {
      const tokenURI = 'https://url/';
      const mockGetERC721TokenURI = jest.fn().mockResolvedValue(tokenURI);
      const { nftController, triggerPreferencesStateChange, changeNetwork } =
        setupController({
          options: {
            getERC721TokenURI: mockGetERC721TokenURI,
          },
        });
      changeNetwork({ selectedNetworkClientId: InfuraNetworkType.sepolia });
      const spy = jest.spyOn(nftController, 'updateNftMetadata');

      const testNetworkClientId = 'sepolia';
      // Add nfts
      await nftController.addNft('0xtest', '1', {
        nftMetadata: {
          name: '',
          description: '',
          image: '',
          standard: ERC721,
        },
        userAddress: OWNER_ADDRESS,
        networkClientId: testNetworkClientId,
      });

      expect(
        nftController.state.allNfts[OWNER_ADDRESS][SEPOLIA.chainId][0]
          .isCurrentlyOwned,
      ).toBe(true);

      nock('https://url').get('/').reply(200, {
        name: 'name pudgy',
        image: 'url pudgy',
        description: 'description pudgy',
      });

      // trigger preference change
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        isIpfsGatewayEnabled: true,
        openSeaEnabled: false,
        selectedAddress: OWNER_ADDRESS,
      });

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('should call getNftInformation only one time per interval', async () => {
      const tokenURI = 'https://api.pudgypenguins.io/lil/4';
      const mockGetERC721TokenURI = jest.fn().mockResolvedValue(tokenURI);
      const { nftController, triggerPreferencesStateChange } = setupController({
        options: {
          getERC721TokenURI: mockGetERC721TokenURI,
        },
      });
      const selectedAddress = OWNER_ADDRESS;
      const spy = jest.spyOn(nftController, 'updateNft');
      const testNetworkClientId = 'sepolia';
      await nftController.addNft('0xtest', '3', {
        nftMetadata: { name: '', description: '', image: '', standard: '' },
        networkClientId: testNetworkClientId,
      });

      nock('https://api.pudgypenguins.io/lil').get('/4').reply(200, {
        name: 'name pudgy',
        image: 'url pudgy',
        description: 'description pudgy',
      });
      const testInputNfts: Nft[] = [
        {
          address: '0xtest',
          description: null,
          favorite: false,
          image: null,
          isCurrentlyOwned: true,
          name: null,
          standard: 'ERC721',
          tokenId: '3',
          tokenURI: 'https://api.pudgypenguins.io/lil/4',
        },
      ];

      // Make first call to updateNftMetadata should trigger state update
      await nftController.updateNftMetadata({
        nfts: testInputNfts,
        networkClientId: testNetworkClientId,
      });
      expect(spy).toHaveBeenCalledTimes(1);

      expect(
        nftController.state.allNfts[selectedAddress][SEPOLIA.chainId][0],
      ).toStrictEqual({
        address: '0xtest',
        description: 'description pudgy',
        image: 'url pudgy',
        name: 'name pudgy',
        tokenId: '3',
        standard: 'ERC721',
        favorite: false,
        isCurrentlyOwned: true,
        tokenURI: 'https://api.pudgypenguins.io/lil/4',
      });

      spy.mockClear();

      // trigger calling updateNFTMetadata again on the same account should not trigger state update
      const spy2 = jest.spyOn(nftController, 'updateNft');
      await nftController.updateNftMetadata({
        nfts: testInputNfts,
        networkClientId: testNetworkClientId,
      });
      // No updates to state should be made
      expect(spy2).toHaveBeenCalledTimes(0);

      // trigger preference change and change selectedAccount
      const testNewAccountAddress = 'OxDifferentAddress';
      triggerPreferencesStateChange({
        ...getDefaultPreferencesState(),
        selectedAddress: testNewAccountAddress,
      });

      spy.mockClear();
      await nftController.addNft('0xtest', '4', {
        nftMetadata: { name: '', description: '', image: '', standard: '' },
        networkClientId: testNetworkClientId,
      });

      const testInputNfts2: Nft[] = [
        {
          address: '0xtest',
          description: null,
          favorite: false,
          image: null,
          isCurrentlyOwned: true,
          name: null,
          standard: 'ERC721',
          tokenId: '4',
          tokenURI: 'https://api.pudgypenguins.io/lil/4',
        },
      ];

      const spy3 = jest.spyOn(nftController, 'updateNft');
      await nftController.updateNftMetadata({
        nfts: testInputNfts2,
        networkClientId: testNetworkClientId,
      });
      // When the account changed, and updateNftMetadata is called state update should be triggered
      expect(spy3).toHaveBeenCalledTimes(1);
    });
  });
});
