import type { Network } from '@ethersproject/providers';
import type {
  AddApprovalRequest,
  ApprovalStateChange,
} from '@metamask/approval-controller';
import { ApprovalController } from '@metamask/approval-controller';
import { ControllerMessenger } from '@metamask/base-controller';
import {
  OPENSEA_PROXY_URL,
  IPFS_DEFAULT_GATEWAY_URL,
  ERC1155,
  ERC721,
  ChainId,
  NetworkType,
  toHex,
  ApprovalType,
  ERC20,
  NetworksTicker,
} from '@metamask/controller-utils';
import HttpProvider from '@metamask/ethjs-provider-http';
import type {
  NetworkState,
  ProviderConfig,
} from '@metamask/network-controller';
import { defaultState as defaultNetworkState } from '@metamask/network-controller';
import { PreferencesController } from '@metamask/preferences-controller';
import { BN } from 'ethereumjs-util';
import nock from 'nock';
import * as sinon from 'sinon';
import { v4 } from 'uuid';

import { AssetsContractController } from './AssetsContractController';
import { getFormattedIpfsUrl } from './assetsUtil';
import { Source } from './constants';
import { NftController } from './NftController';

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
const MAINNET_PROVIDER = new HttpProvider(
  'https://mainnet.infura.io/v3/ad3a368836ff4596becc3be8e2f137ac',
);
const SEPOLIA_PROVIDER = new HttpProvider(
  'https://sepolia.infura.io/v3/ad3a368836ff4596becc3be8e2f137ac',
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

type ApprovalActions = AddApprovalRequest;
type ApprovalEvents = ApprovalStateChange;

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
 * @param options - Controller options.
 * @param options.includeOnNftAdded - Whether to include the "onNftAdded" parameter.
 * @param options.getERC721OwnerOfStub - Stub for the "getERC721OwnerOf" method.
 * @param options.getERC721AssetNameStub - Stub for the "getERC721AssetName" method.
 * @param options.getERC721AssetSymbolStub - Stub for the "getERC721AssetSymbol" method.
 * @param options.getERC1155BalanceOfStub - Stub for the "getERC1155BalanceOf" method.
 * @param options.getERC721TokenURIStub - Stub for the "getERC721TokenURI" method.
 * @param options.getERC1155TokenURIStub - Stub for the "getERC1155TokenURI" method.
 * @returns A collection of test controllers and stubs.
 */
function setupController({
  includeOnNftAdded = false,
  getERC721OwnerOfStub,
  getERC721AssetNameStub,
  getERC721AssetSymbolStub,
  getERC721TokenURIStub,
  getERC1155TokenURIStub,
  getERC1155BalanceOfStub,
}: {
  includeOnNftAdded?: boolean;
  getERC721OwnerOfStub?: (
    tokenAddress: string,
    tokenId: string,
  ) => Promise<string>;
  getERC721AssetNameStub?: (tokenAddress: string) => Promise<string>;
  getERC721AssetSymbolStub?: (tokenAddress: string) => Promise<string>;
  getERC721TokenURIStub?: (
    tokenAddress: string,
    tokenId: string,
  ) => Promise<string>;
  getERC1155TokenURIStub?: (
    tokenAddress: string,
    tokenId: string,
  ) => Promise<string>;

  getERC1155BalanceOfStub?: (
    tokenAddress: string,
    tokenId: string,
    userAddress: string,
  ) => Promise<BN>;
} = {}) {
  const preferences = new PreferencesController();
  const onNetworkDidChangeListeners: ((state: NetworkState) => void)[] = [];
  const changeNetwork = (providerConfig: ProviderConfig) => {
    onNetworkDidChangeListeners.forEach((listener) => {
      listener({
        ...defaultNetworkState,
        providerConfig,
      });
    });
  };

  const messenger = new ControllerMessenger<ApprovalActions, ApprovalEvents>();

  const approvalControllerMessenger = messenger.getRestricted({
    name: 'ApprovalController',
  });

  const approvalController = new ApprovalController({
    messenger: approvalControllerMessenger,
    showApprovalRequest: jest.fn(),
  });

  const getNetworkClientByIdSpy = jest
    .fn()
    .mockImplementation((networkClientId) => {
      switch (networkClientId) {
        case 'sepolia':
          return {
            configuration: {
              chainId: SEPOLIA.chainId,
            },
          };
        case 'goerli':
          return {
            configuration: {
              chainId: GOERLI.chainId,
            },
          };
        case 'customNetworkClientId-1':
          return {
            configuration: {
              chainId: '0xa',
            },
          };
        default:
          throw new Error('Invalid network client id');
      }
    });

  const assetsContract = new AssetsContractController({
    chainId: ChainId.mainnet,
    onPreferencesStateChange: (listener) => preferences.subscribe(listener),
    onNetworkDidChange: (listener) =>
      onNetworkDidChangeListeners.push(listener),
    getNetworkClientById: getNetworkClientByIdSpy,
  });

  const onNftAddedSpy = includeOnNftAdded ? jest.fn() : undefined;

  const nftControllerMessenger = messenger.getRestricted<
    typeof controllerName,
    ApprovalActions['type'],
    never
  >({
    name: controllerName,
    allowedActions: ['ApprovalController:addRequest'],
  });

  const nftController = new NftController({
    chainId: ChainId.mainnet,
    onPreferencesStateChange: (listener) => preferences.subscribe(listener),
    onNetworkStateChange: (listener) =>
      onNetworkDidChangeListeners.push(listener),
    getERC721AssetName:
      getERC721AssetNameStub ??
      assetsContract.getERC721AssetName.bind(assetsContract),
    getERC721AssetSymbol:
      getERC721AssetSymbolStub ??
      assetsContract.getERC721AssetSymbol.bind(assetsContract),
    getERC721TokenURI:
      getERC721TokenURIStub ??
      assetsContract.getERC721TokenURI.bind(assetsContract),
    getERC721OwnerOf:
      getERC721OwnerOfStub ??
      assetsContract.getERC721OwnerOf.bind(assetsContract),
    getERC1155BalanceOf:
      getERC1155BalanceOfStub ??
      assetsContract.getERC1155BalanceOf.bind(assetsContract),
    getERC1155TokenURI:
      getERC1155TokenURIStub ??
      assetsContract.getERC1155TokenURI.bind(assetsContract),
    getNetworkClientById: getNetworkClientByIdSpy,
    onNftAdded: onNftAddedSpy,
    messenger: nftControllerMessenger,
  });

  preferences.update({
    selectedAddress: OWNER_ADDRESS,
    openSeaEnabled: true,
  });

  return {
    assetsContract,
    nftController,
    onNftAddedSpy,
    getNetworkClientByIdSpy,
    preferences,
    changeNetwork,
    messenger,
    approvalController,
  };
}

describe('NftController', () => {
  beforeEach(() => {
    nock(OPENSEA_PROXY_URL)
      .get(`/chain/ethereum/contract/0x01`)
      .reply(200, {
        address: '0x01',
        chain: 'ethereum',
        collection: 'FOO',
        contract_standard: 'erc721',
        name: 'Name',
        total_supply: 0,
      })
      .get(`/collections/FOO`)
      .reply(200, {
        description: 'Description',
        image_url: 'url',
      })
      .get(`/chain/ethereum/contract/0x02`)
      .reply(200, {
        address: '0x02',
        chain: 'ethereum',
        collection: 'FOU',
        contract_standard: 'erc721',
        name: 'FOU',
        total_supply: 0,
      })
      .get(`/collections/FOO`)
      .reply(200, {
        description: 'Description',
        image_url: 'url',
      })
      .get(`/chain/ethereum/contract/0x01/nfts/1`)
      .reply(200, {
        nft: {
          token_standard: 'erc1155',
          name: 'Name',
          description: 'Description',
          image_url: 'url',
        },
      })
      .get(
        `/chain/ethereum/contract/0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab/nfts/798958393`,
      )
      .replyWithError(new TypeError('Failed to fetch'))
      .get(
        `/chain/ethereum/contract/0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab`,
      )
      .replyWithError(new TypeError('Failed to fetch'));

    nock(OPENSEA_PROXY_URL)
      .get(
        `/chain/ethereum/contract/${ERC1155_NFT_ADDRESS}/nfts/${ERC1155_NFT_ID}`,
      )
      .reply(200, {
        nft: {
          token_standard: 'erc1155',
          name: 'name',
          description: 'description',
        },
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
        getERC721TokenURIStub: jest
          .fn()
          .mockImplementation(() => 'https://testtokenuri.com'),
        getERC721OwnerOfStub: jest.fn().mockImplementation(() => OWNER_ADDRESS),
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
        getERC721OwnerOfStub: jest
          .fn()
          .mockImplementation(() => '0x12345abcefg'),
      });

      const callActionSpy = jest.spyOn(messenger, 'call').mockResolvedValue({});

      await expect(() =>
        nftController.watchNft(ERC721_NFT, ERC721, 'https://test-dapp.com'),
      ).rejects.toThrow('Suggested NFT is not owned by the selected account');
      expect(callActionSpy).toHaveBeenCalledTimes(0);
    });

    it('should error if the user does not own the suggested ERC1155 NFT', async function () {
      const { nftController, messenger } = setupController({
        getERC1155BalanceOfStub: jest.fn().mockImplementation(() => new BN(0)),
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
      const { nftController, messenger, preferences } = setupController({
        getERC721TokenURIStub: jest
          .fn()
          .mockImplementation(() => 'https://testtokenuri.com'),
        getERC721OwnerOfStub: jest.fn().mockImplementation(() => OWNER_ADDRESS),
      });
      preferences.setIsIpfsGatewayEnabled(true);
      preferences.setOpenSeaEnabled(false);

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
      const { nftController, messenger, preferences } = setupController({
        getERC721TokenURIStub: jest
          .fn()
          .mockImplementation(() => 'https://testtokenuri.com'),
        getERC721OwnerOfStub: jest.fn().mockImplementation(() => OWNER_ADDRESS),
      });
      preferences.setIsIpfsGatewayEnabled(true);
      preferences.setOpenSeaEnabled(true);

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
      const { nftController, messenger, preferences } = setupController({
        getERC721TokenURIStub: jest
          .fn()
          .mockImplementation(() => 'ipfs://testtokenuri.com'),
        getERC721OwnerOfStub: jest.fn().mockImplementation(() => OWNER_ADDRESS),
      });
      preferences.setIsIpfsGatewayEnabled(false);
      preferences.setOpenSeaEnabled(false);

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
      const { nftController, messenger, preferences } = setupController({
        getERC721TokenURIStub: jest
          .fn()
          .mockImplementation(() => 'ipfs://testtokenuri.com'),
        getERC721OwnerOfStub: jest.fn().mockImplementation(() => OWNER_ADDRESS),
      });
      preferences.setIsIpfsGatewayEnabled(false);
      preferences.setOpenSeaEnabled(true);

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

      const { nftController, messenger, preferences } = setupController({
        getERC1155TokenURIStub: jest
          .fn()
          .mockImplementation(() => 'https://testtokenuri.com'),
        getERC1155BalanceOfStub: jest.fn().mockImplementation(() => new BN(1)),
      });
      preferences.setOpenSeaEnabled(false);
      preferences.setIsIpfsGatewayEnabled(true);
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

      const { nftController, messenger, preferences } = setupController({
        getERC1155TokenURIStub: jest
          .fn()
          .mockImplementation(() => 'https://testtokenuri.com'),
        getERC1155BalanceOfStub: jest.fn().mockImplementation(() => new BN(1)),
      });
      preferences.setOpenSeaEnabled(true);
      preferences.setIsIpfsGatewayEnabled(true);
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
        preferences,
        changeNetwork,
      } = setupController({
        getERC721OwnerOfStub: jest
          .fn()
          .mockImplementation(() => SECOND_OWNER_ADDRESS),
        getERC721TokenURIStub: jest
          .fn()
          .mockImplementation(() => 'https://testtokenuri.com'),
        getERC721AssetNameStub: jest
          .fn()
          .mockImplementation(() => 'testERC721Name'),
        getERC721AssetSymbolStub: jest
          .fn()
          .mockImplementation(() => 'testERC721Symbol'),
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
        nftController.subscribe((state) => {
          if (state.allNfts?.[SECOND_OWNER_ADDRESS]?.[GOERLI.chainId]) {
            resolve();
          }
        });
      });

      // check that the NFT is not in state to begin with
      expect(nftController.state.allNfts).toStrictEqual({});

      // this is our account and network status when the watchNFT request is made
      preferences.setSelectedAddress(OWNER_ADDRESS);
      changeNetwork(GOERLI);

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
        preferences,
        changeNetwork,
      } = setupController({
        getERC721OwnerOfStub: jest.fn().mockImplementation(() => OWNER_ADDRESS),
        getERC721TokenURIStub: jest
          .fn()
          .mockImplementation(() => 'https://testtokenuri.com'),
        getERC721AssetNameStub: jest
          .fn()
          .mockImplementation(() => 'testERC721Name'),
        getERC721AssetSymbolStub: jest
          .fn()
          .mockImplementation(() => 'testERC721Symbol'),
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
        nftController.subscribe((state) => {
          if (state.allNfts?.[OWNER_ADDRESS]?.[GOERLI.chainId].length) {
            resolve();
          }
        });
      });

      // check that the NFT is not in state to begin with
      expect(nftController.state.allNfts).toStrictEqual({});

      // this is our account and network status when the watchNFT request is made
      preferences.setSelectedAddress(OWNER_ADDRESS);

      nftController.watchNft(ERC721_NFT, ERC721, 'https://etherscan.io', {
        networkClientId: 'goerli',
      });

      await pendingRequest;

      // change the network and selectedAddress before accepting the request
      preferences.setSelectedAddress('0xDifferentAddress');
      changeNetwork(SEPOLIA);
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

      changeNetwork(SEPOLIA);

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
      const { nftController } = setupController();

      const { selectedAddress, chainId } = nftController.config;
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
        nftController.state.allNfts[selectedAddress][chainId][0],
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
        nftController.state.allNftContracts[selectedAddress][chainId][0],
      ).toStrictEqual({
        address: '0x01',
        description: 'Description',
        logo: 'url',
        name: 'Name',
        totalSupply: '0',
        schemaName: 'ERC721',
      });
    });

    it('should call onNftAdded callback correctly when NFT is manually added', async () => {
      const { nftController, onNftAddedSpy } = setupController({
        includeOnNftAdded: true,
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

      expect(onNftAddedSpy).toHaveBeenCalledWith({
        source: Source.Custom,
        tokenId: '1',
        address: '0x01',
        standard: 'ERC1155',
      });
    });

    it('should call onNftAdded callback correctly when NFT is added via detection', async () => {
      const { nftController, onNftAddedSpy } = setupController({
        includeOnNftAdded: true,
      });

      const detectedUserAddress = '0x123';
      await nftController.addNft('0x01', '2', {
        nftMetadata: {
          name: 'name',
          image: 'image',
          description: 'description',
          standard: 'ERC721',
          favorite: false,
        },
        userAddress: detectedUserAddress,
        source: Source.Detected,
      });

      expect(onNftAddedSpy).toHaveBeenCalledWith({
        source: 'detected',
        tokenId: '2',
        address: '0x01',
        standard: 'ERC721',
      });
    });

    it('should add NFT by selected address', async () => {
      const { nftController, preferences } = setupController();
      const { chainId } = nftController.config;
      const firstAddress = '0x123';
      const secondAddress = '0x321';

      sinon
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .stub(nftController, 'getNftInformation' as any)
        .returns({ name: 'name', image: 'url', description: 'description' });
      preferences.update({ selectedAddress: firstAddress });
      await nftController.addNft('0x01', '1234');
      preferences.update({ selectedAddress: secondAddress });
      await nftController.addNft('0x02', '4321');
      preferences.update({ selectedAddress: firstAddress });
      expect(
        nftController.state.allNfts[firstAddress][chainId][0],
      ).toStrictEqual({
        address: '0x01',
        description: 'description',
        image: 'url',
        name: 'name',
        tokenId: '1234',
        favorite: false,
        isCurrentlyOwned: true,
      });
    });

    it('should update NFT if image is different', async () => {
      const { nftController } = setupController();
      const { selectedAddress, chainId } = nftController.config;

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
        nftController.state.allNfts[selectedAddress][chainId][0],
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
        nftController.state.allNfts[selectedAddress][chainId][0],
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
      const { nftController } = setupController();
      const { selectedAddress, chainId } = nftController.config;
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
        nftController.state.allNfts[selectedAddress][chainId],
      ).toHaveLength(1);

      expect(
        nftController.state.allNftContracts[selectedAddress][chainId],
      ).toHaveLength(1);
    });

    it('should add NFT and get information from OpenSea', async () => {
      const { nftController } = setupController();

      const { selectedAddress, chainId } = nftController.config;
      await nftController.addNft('0x01', '1');
      expect(
        nftController.state.allNfts[selectedAddress][chainId][0],
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
        creator: {
          address: undefined,
          profile_img_url: '',
          user: {
            username: '',
          },
        },
      });
    });

    it('should add NFT erc721 and aggregate NFT data from both contract and OpenSea', async () => {
      const { assetsContract, nftController } = setupController();
      nock(OPENSEA_PROXY_URL)
        .get(
          `/chain/ethereum/contract/${ERC721_KUDOSADDRESS}/nfts/${ERC721_KUDOS_TOKEN_ID}`,
        )
        .reply(200, {
          nft: {
            token_standard: 'erc721',
            name: 'Kudos Name',
            description: 'Kudos Description',
            image_url: 'url',
          },
        })
        .get(`/chain/ethereum/contract/${ERC721_KUDOSADDRESS}`)
        .reply(200, {
          address: ERC721_KUDOSADDRESS,
          chain: 'ethereum',
          collection: 'Kudos',
          contract_standard: 'erc721',
          name: 'Name',
          total_supply: 10,
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
              to: ERC721_KUDOSADDRESS.toLowerCase(),
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
              to: ERC721_KUDOSADDRESS.toLowerCase(),
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
              to: ERC721_KUDOSADDRESS.toLowerCase(),
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
              to: ERC721_KUDOSADDRESS.toLowerCase(),
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
      const { selectedAddress, chainId } = nftController.config;
      sinon
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .stub(nftController, 'getNftContractInformationFromApi' as any)
        .returns(undefined);

      await nftController.addNft(ERC721_KUDOSADDRESS, ERC721_KUDOS_TOKEN_ID);

      expect(
        nftController.state.allNfts[selectedAddress][chainId][0],
      ).toStrictEqual({
        address: ERC721_KUDOSADDRESS,
        image: 'Kudos Image (directly from tokenURI)',
        name: 'Kudos Name (directly from tokenURI)',
        description: 'Kudos Description (directly from tokenURI)',
        tokenId: ERC721_KUDOS_TOKEN_ID,
        standard: 'ERC721',
        favorite: false,
        isCurrentlyOwned: true,
        tokenURI:
          'https://ipfs.gitcoin.co:443/api/v0/cat/QmPmt6EAaioN78ECnW5oCL8v2YvVSpoBjLCjrXhhsAvoov',
        creator: {
          address: undefined,
          profile_img_url: '',
          user: {
            username: '',
          },
        },
      });

      expect(
        nftController.state.allNftContracts[selectedAddress][chainId][0],
      ).toStrictEqual({
        address: ERC721_KUDOSADDRESS,
        name: 'KudosToken',
        symbol: 'KDO',
      });
    });

    it('should add NFT erc1155 and get NFT information from contract when OpenSea Proxy API fails to fetch and no OpenSeaAPI key is set', async () => {
      const { assetsContract, nftController } = setupController();
      nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 5,
          method: 'eth_call',
          params: [
            {
              to: ERC1155_NFT_ADDRESS.toLowerCase(),
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
              to: ERC1155_NFT_ADDRESS.toLowerCase(),
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
              to: ERC1155_NFT_ADDRESS.toLowerCase(),
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
              to: ERC1155_NFT_ADDRESS.toLowerCase(),
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
        .get(`/chain/ethereum/contract/${ERC1155_NFT_ADDRESS}`)
        .replyWithError(new TypeError('Failed to fetch'));

      // the tokenURI for ERC1155_NFT_ADDRESS + ERC1155_NFT_ID
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

      assetsContract.configure({ provider: MAINNET_PROVIDER });
      const { selectedAddress, chainId } = nftController.config;

      expect(nftController.openSeaApiKey).toBeUndefined();

      await nftController.addNft(ERC1155_NFT_ADDRESS, ERC1155_NFT_ID);

      expect(
        nftController.state.allNfts[selectedAddress][chainId][0],
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
        creator: {
          address: undefined,
          profile_img_url: '',
          user: {
            username: '',
          },
        },
      });
    });

    it('should add NFT erc721 and get NFT information only from contract', async () => {
      const { assetsContract, nftController } = setupController();
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
              to: ERC721_KUDOSADDRESS.toLowerCase(),
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
              to: ERC721_KUDOSADDRESS.toLowerCase(),
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
              to: ERC721_KUDOSADDRESS.toLowerCase(),
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
              to: ERC721_KUDOSADDRESS.toLowerCase(),
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
      const { selectedAddress, chainId } = nftController.config;
      sinon
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .stub(nftController, 'getNftContractInformationFromApi' as any)
        .returns(undefined);

      sinon
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .stub(nftController, 'getNftInformationFromApi' as any)
        .returns(undefined);

      await nftController.addNft(ERC721_KUDOSADDRESS, ERC721_KUDOS_TOKEN_ID);

      expect(
        nftController.state.allNfts[selectedAddress][chainId][0],
      ).toStrictEqual({
        address: ERC721_KUDOSADDRESS,
        image: 'Kudos Image (directly from tokenURI)',
        name: 'Kudos Name (directly from tokenURI)',
        description: 'Kudos Description (directly from tokenURI)',
        tokenId: ERC721_KUDOS_TOKEN_ID,
        standard: 'ERC721',
        favorite: false,
        isCurrentlyOwned: true,
        tokenURI:
          'https://ipfs.gitcoin.co:443/api/v0/cat/QmPmt6EAaioN78ECnW5oCL8v2YvVSpoBjLCjrXhhsAvoov',
      });

      expect(
        nftController.state.allNftContracts[selectedAddress][chainId][0],
      ).toStrictEqual({
        address: ERC721_KUDOSADDRESS,
        name: 'KudosToken',
        symbol: 'KDO',
      });
    });

    it('should add NFT by provider type', async () => {
      const { nftController, changeNetwork } = setupController();
      const { selectedAddress } = nftController.config;
      sinon
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .stub(nftController, 'getNftInformation' as any)
        .returns({ name: 'name', image: 'url', description: 'description' });

      changeNetwork(SEPOLIA);
      await nftController.addNft('0x01', '1234');
      changeNetwork(GOERLI);
      changeNetwork(SEPOLIA);

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
        tokenId: '1234',
        favorite: false,
        isCurrentlyOwned: true,
      });
    });

    it('should add an nft and nftContract to state when all contract information is falsy and the source is left empty (defaults to "custom")', async () => {
      const { nftController, onNftAddedSpy } = setupController({
        includeOnNftAdded: true,
      });
      const { selectedAddress, chainId } = nftController.config;
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sinon.stub(nftController, 'getNftContractInformation' as any).returns({
        asset_contract_type: null,
        created_date: null,
        schema_name: null,
        symbol: null,
        total_supply: null,
        description: null,
        external_link: null,
        collection: { name: null, image_url: null },
      });

      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sinon.stub(nftController, 'getNftInformation' as any).returns({
        name: 'name',
        image: 'url',
        description: 'description',
      });

      await nftController.addNft('0x01234abcdefg', '1234');

      expect(nftController.state.allNftContracts).toStrictEqual({
        [selectedAddress]: {
          [chainId]: [
            {
              address: '0x01234abcdefg',
            },
          ],
        },
      });

      expect(nftController.state.allNfts).toStrictEqual({
        [selectedAddress]: {
          [chainId]: [
            {
              address: '0x01234abcdefg',
              description: 'description',
              image: 'url',
              name: 'name',
              tokenId: '1234',
              favorite: false,
              isCurrentlyOwned: true,
            },
          ],
        },
      });

      expect(onNftAddedSpy).toHaveBeenCalledWith({
        address: '0x01234abcdefg',
        tokenId: '1234',
        standard: undefined,
        symbol: undefined,
        source: Source.Custom,
      });
    });

    it('should add an nft and nftContract to state when all contract information is falsy and the source is "dapp"', async () => {
      const { nftController, onNftAddedSpy, changeNetwork } = setupController({
        includeOnNftAdded: true,
      });
      changeNetwork(GOERLI);

      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sinon.stub(nftController, 'getNftContractInformation' as any).returns({
        asset_contract_type: null,
        created_date: null,
        schema_name: null,
        symbol: null,
        total_supply: null,
        description: null,
        external_link: null,
        collection: { name: null, image_url: null },
      });

      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sinon.stub(nftController, 'getNftInformation' as any).returns({
        name: 'name',
        image: 'url',
        description: 'description',
      });

      await nftController.addNft('0x01234abcdefg', '1234', {
        userAddress: '0x123',
        source: Source.Dapp,
      });

      expect(nftController.state.allNftContracts).toStrictEqual({
        '0x123': {
          [GOERLI.chainId]: [
            {
              address: '0x01234abcdefg',
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
              isCurrentlyOwned: true,
            },
          ],
        },
      });

      expect(onNftAddedSpy).toHaveBeenCalledWith({
        address: '0x01234abcdefg',
        tokenId: '1234',
        standard: undefined,
        symbol: undefined,
        source: Source.Dapp,
      });
    });

    it('should add an nft and nftContract when there is valid contract information and source is "detected"', async () => {
      const { nftController, onNftAddedSpy } = setupController({
        includeOnNftAdded: true,
      });
      nock(OPENSEA_PROXY_URL)
        .get(
          `/chain/ethereum/contract/${ERC721_KUDOSADDRESS}/nfts/${ERC721_KUDOS_TOKEN_ID}`,
        )
        .reply(200, {
          nft: {
            token_standard: 'erc721',
            name: 'Kudos Name',
            description: 'Kudos Description',
            image_url: 'Kudos image (from proxy API)',
          },
        })
        .get(`/chain/ethereum/contract/${ERC721_KUDOSADDRESS}`)
        .reply(200, {
          address: ERC721_KUDOSADDRESS,
          chain: 'ethereum',
          collection: 'KDO',
          contract_standard: 'erc721',
          name: 'Kudos',
          total_supply: 10,
        })
        .get(`/collections/KDO`)
        .reply(200, {
          description: 'Kudos Description',
          image_url: 'Kudos logo (from proxy API)',
        });

      const { selectedAddress, chainId } = nftController.config;
      await nftController.addNft(
        '0x6EbeAf8e8E946F0716E6533A6f2cefc83f60e8Ab',
        '123',
        {
          userAddress: selectedAddress,
          source: Source.Detected,
        },
      );

      expect(
        nftController.state.allNfts[selectedAddress]?.[chainId],
      ).toBeUndefined();

      expect(
        nftController.state.allNftContracts[selectedAddress]?.[chainId],
      ).toBeUndefined();

      await nftController.addNft(ERC721_KUDOSADDRESS, ERC721_KUDOS_TOKEN_ID, {
        userAddress: selectedAddress,
        source: Source.Detected,
      });

      expect(
        nftController.state.allNfts[selectedAddress][chainId],
      ).toStrictEqual([
        {
          address: ERC721_KUDOSADDRESS,
          description: 'Kudos Description',
          image: 'Kudos image (from proxy API)',
          name: 'Kudos Name',
          standard: 'ERC721',
          tokenId: ERC721_KUDOS_TOKEN_ID,
          favorite: false,
          isCurrentlyOwned: true,
          tokenURI: '',
          creator: {
            address: undefined,
            profile_img_url: '',
            user: {
              username: '',
            },
          },
        },
      ]);

      expect(
        nftController.state.allNftContracts[selectedAddress][chainId],
      ).toStrictEqual([
        {
          address: ERC721_KUDOSADDRESS,
          description: 'Kudos Description',
          logo: 'Kudos logo (from proxy API)',
          name: 'Kudos',
          totalSupply: '10',
          schemaName: 'ERC721',
        },
      ]);

      expect(onNftAddedSpy).toHaveBeenCalledWith({
        address: ERC721_KUDOSADDRESS,
        tokenId: ERC721_KUDOS_TOKEN_ID,
        standard: 'ERC721',
        source: Source.Detected,
      });
    });

    it('should not add an nft and nftContract when there is not valid contract information (or an issue fetching it) and source is "detected"', async () => {
      const { nftController, onNftAddedSpy } = setupController({
        includeOnNftAdded: true,
      });
      nock(OPENSEA_PROXY_URL)
        .get(
          `/chain/ethereum/contract/${ERC721_KUDOSADDRESS}/nfts/${ERC721_KUDOS_TOKEN_ID}`,
        )
        .reply(200, {
          nft: {
            token_standard: 'erc721',
            name: 'Kudos Name',
            description: 'Kudos Description',
            image_url: 'Kudos image (from proxy API)',
          },
        })
        .get(`/chain/ethereum/contract${ERC721_KUDOSADDRESS}`)
        .replyWithError(new Error('Failed to fetch'));

      const { selectedAddress } = nftController.config;
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

      expect(onNftAddedSpy).not.toHaveBeenCalled();
    });

    it('should not add duplicate NFTs to the ignoredNfts list', async () => {
      const { nftController } = setupController();
      const { selectedAddress, chainId } = nftController.config;

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
        nftController.state.allNfts[selectedAddress][chainId],
      ).toHaveLength(2);
      expect(nftController.state.ignoredNfts).toHaveLength(0);

      nftController.removeAndIgnoreNft('0x01', '1');
      expect(
        nftController.state.allNfts[selectedAddress][chainId],
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
        nftController.state.allNfts[selectedAddress][chainId],
      ).toHaveLength(2);
      expect(nftController.state.ignoredNfts).toHaveLength(1);

      nftController.removeAndIgnoreNft('0x01', '1');
      expect(
        nftController.state.allNfts[selectedAddress][chainId],
      ).toHaveLength(1);
      expect(nftController.state.ignoredNfts).toHaveLength(1);
    });

    it('should add NFT with metadata hosted in IPFS', async () => {
      const { assetsContract, nftController } = setupController();
      nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 13,
          method: 'eth_call',
          params: [
            {
              to: ERC721_DEPRESSIONIST_ADDRESS.toLowerCase(),
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
              to: ERC721_DEPRESSIONIST_ADDRESS.toLowerCase(),
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
              to: ERC721_DEPRESSIONIST_ADDRESS.toLowerCase(),
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
              to: ERC721_DEPRESSIONIST_ADDRESS.toLowerCase(),
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
      nftController.configure({
        ipfsGateway: IPFS_DEFAULT_GATEWAY_URL,
      });
      const { selectedAddress, chainId } = nftController.config;
      await nftController.addNft(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
      );

      expect(
        nftController.state.allNftContracts[selectedAddress][chainId][0],
      ).toStrictEqual({
        address: ERC721_DEPRESSIONIST_ADDRESS,
        name: "Maltjik.jpg's Depressionists",
        symbol: 'DPNS',
      });

      expect(
        nftController.state.allNfts[selectedAddress][chainId][0],
      ).toStrictEqual({
        address: ERC721_DEPRESSIONIST_ADDRESS,
        tokenId: '36',
        image: 'image',
        name: 'name',
        description: 'description',
        standard: 'ERC721',
        favorite: false,
        isCurrentlyOwned: true,
        tokenURI:
          'https://bafybeidf7aw7bmnmewwj4ayq3she2jfk5jrdpp24aaucf6fddzb3cfhrvm.ipfs.cloudflare-ipfs.com',
      });
    });

    it('should add NFT erc721 and not get NFT information directly from OpenSea API when OpenSeaAPIkey is set and queries to OpenSea proxy fail', async () => {
      const { assetsContract, nftController } = setupController();
      nock(OPENSEA_PROXY_URL)
        .get(`/chain/ethereum/contract/${ERC721_NFT_ADDRESS}`)
        .replyWithError(new Error('Failed to fetch'))
        .get(
          `/chain/ethereum/contract/${ERC721_NFT_ADDRESS}/nfts/${ERC721_NFT_ID}`,
        )
        .replyWithError(new Error('Failed to fetch'));

      nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 17,
          method: 'eth_call',
          params: [
            {
              to: ERC721_NFT_ADDRESS.toLowerCase(),
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
              to: ERC721_NFT_ADDRESS.toLowerCase(),
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
              to: ERC721_NFT_ADDRESS.toLowerCase(),
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
              to: ERC721_NFT_ADDRESS.toLowerCase(),
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
        .get(`/api/v1/metadata/${ERC721_NFT_ADDRESS}/${ERC721_NFT_ID}`)
        .reply(200, [
          '1f8b080000000000000334ce5d6f82301480e1ffd26b1015a3913bcdd8d4c1b20f9dc31bd274b51c3d3d85b664a0f1bf2f66d9ed9bbcc97365c4b564095be440e3e168ce02f62d9db0507b30c4126a1103263b2f2d712c11e8fc1f4173755f2bef6b97441156f14019a350b64e5a61c84bf203617494ef8aed27e5611cea7836f5fdfe510dc561cf9fcb23d8d364ed8a99cd2e4db30a1fb2d57184d9d9c6c547caab27dc35cbf779dd6bdfbfa88d5abca1b079d77ea5cbf4f24a6b389c5c2f4074d39fb16201e3049adfe1656bf1cf79fb050000ffff03002c5b5b9be3000000',
        ]);

      assetsContract.configure({ provider: MAINNET_PROVIDER });
      const { selectedAddress, chainId } = nftController.config;

      nftController.setApiKey('fake-api-key');
      expect(nftController.openSeaApiKey).toBe('fake-api-key');

      await nftController.addNft(ERC721_NFT_ADDRESS, ERC721_NFT_ID);

      expect(
        nftController.state.allNfts[selectedAddress][chainId][0],
      ).toStrictEqual({
        address: ERC721_NFT_ADDRESS,
        image: null,
        name: null,
        description: null,
        tokenId: ERC721_NFT_ID,
        standard: null,
        favorite: false,
        isCurrentlyOwned: true,
        tokenURI: '',
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
        getERC721TokenURIStub: jest.fn().mockImplementation((tokenAddress) => {
          switch (tokenAddress) {
            case '0x01':
              return 'https://testtokenuri-1.com';
            case '0x02':
              return 'https://testtokenuri-2.com';
            default:
              throw new Error('Not an ERC721 token');
          }
        }),
        getERC1155TokenURIStub: jest.fn().mockImplementation((tokenAddress) => {
          switch (tokenAddress) {
            case '0x03':
              return 'https://testtokenuri-3.com';
            default:
              throw new Error('Not an ERC1155 token');
          }
        }),
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

      const { nftController, preferences, changeNetwork } = setupController({
        getERC721TokenURIStub: jest.fn().mockImplementation((tokenAddress) => {
          switch (tokenAddress) {
            case '0x01':
              return 'https://testtokenuri-1.com';
            case '0x02':
              return 'https://testtokenuri-2.com';
            default:
              throw new Error('Not an ERC721 token');
          }
        }),
        getERC1155TokenURIStub: jest.fn().mockImplementation((tokenAddress) => {
          switch (tokenAddress) {
            case '0x03':
              return 'https://testtokenuri-3.com';
            default:
              throw new Error('Not an ERC1155 token');
          }
        }),
      });

      await nftController.addNft('0x01', '1234', {
        userAddress,
      });

      changeNetwork(GOERLI);

      await nftController.addNft('0x02', '4321', {
        userAddress,
      });
      changeNetwork(SEPOLIA);

      await nftController.addNft('0x03', '5678', {
        userAddress,
      });

      // check that the currently selected address is not the same as userAddress
      // to which the NFTs were added
      expect(preferences.state.selectedAddress).toStrictEqual(OWNER_ADDRESS);

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
      const { nftController, preferences } = setupController();
      const firstAddress = '0x123';
      const secondAddress = '0x321';
      const { chainId } = nftController.config;

      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sinon.stub(nftController, 'isNftOwner' as any).returns(true);

      sinon
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .stub(nftController, 'getNftInformation' as any)
        .returns({ name: 'name', image: 'url', description: 'description' });
      preferences.update({ selectedAddress: firstAddress });
      await nftController.addNftVerifyOwnership('0x01', '1234');
      preferences.update({ selectedAddress: secondAddress });
      await nftController.addNftVerifyOwnership('0x02', '4321');
      preferences.update({ selectedAddress: firstAddress });
      expect(
        nftController.state.allNfts[firstAddress][chainId][0],
      ).toStrictEqual({
        address: '0x01',
        description: 'description',
        image: 'url',
        name: 'name',
        tokenId: '1234',
        favorite: false,
        isCurrentlyOwned: true,
      });
    });

    it('should throw an error if selected address is not owner of input NFT', async () => {
      const { nftController, preferences } = setupController();
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sinon.stub(nftController, 'isNftOwner' as any).returns(false);
      const firstAddress = '0x123';
      preferences.update({ selectedAddress: firstAddress });
      const result = async () =>
        await nftController.addNftVerifyOwnership('0x01', '1234');
      const error = 'This NFT is not owned by the user';
      await expect(result).rejects.toThrow(error);
    });

    it('should verify ownership by selected address and add NFT by the correct chainId when passed networkClientId', async () => {
      const { nftController, preferences } = setupController();

      const firstAddress = '0x123';
      const secondAddress = '0x321';

      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sinon.stub(nftController, 'isNftOwner' as any).returns(true);

      sinon
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .stub(nftController, 'getNftInformation' as any)
        .returns({ name: 'name', image: 'url', description: 'description' });
      preferences.update({ selectedAddress: firstAddress });
      await nftController.addNftVerifyOwnership('0x01', '1234', {
        networkClientId: 'sepolia',
      });
      preferences.update({ selectedAddress: secondAddress });
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
        tokenId: '1234',
        favorite: false,
        isCurrentlyOwned: true,
      });
      expect(
        nftController.state.allNfts[secondAddress][GOERLI.chainId][0],
      ).toStrictEqual({
        address: '0x02',
        description: 'description',
        image: 'url',
        name: 'name',
        tokenId: '4321',
        favorite: false,
        isCurrentlyOwned: true,
      });
    });

    it('should verify ownership by selected address and add NFT by the correct userAddress when passed userAddress', async () => {
      const { nftController, changeNetwork, preferences } = setupController();

      const firstAddress = '0x123';
      const secondAddress = '0x321';

      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sinon.stub(nftController, 'isNftOwner' as any).returns(true);

      sinon
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .stub(nftController, 'getNftInformation' as any)
        .returns({ name: 'name', image: 'url', description: 'description' });
      changeNetwork(SEPOLIA);
      await nftController.addNftVerifyOwnership('0x01', '1234', {
        userAddress: firstAddress,
      });
      changeNetwork(GOERLI);
      await nftController.addNftVerifyOwnership('0x02', '4321', {
        userAddress: secondAddress,
      });

      // check that the currently selected address is not the same as either of the userAddresses
      expect(preferences.state.selectedAddress).toStrictEqual(OWNER_ADDRESS);

      expect(
        nftController.state.allNfts[firstAddress][SEPOLIA.chainId][0],
      ).toStrictEqual({
        address: '0x01',
        description: 'description',
        image: 'url',
        name: 'name',
        tokenId: '1234',
        favorite: false,
        isCurrentlyOwned: true,
      });
      expect(
        nftController.state.allNfts[secondAddress][GOERLI.chainId][0],
      ).toStrictEqual({
        address: '0x02',
        description: 'description',
        image: 'url',
        name: 'name',
        tokenId: '4321',
        favorite: false,
        isCurrentlyOwned: true,
      });
    });
  });

  describe('removeNft', () => {
    it('should remove NFT and NFT contract', async () => {
      const { nftController } = setupController();
      const { selectedAddress, chainId } = nftController.config;

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
        nftController.state.allNfts[selectedAddress][chainId],
      ).toHaveLength(0);

      expect(
        nftController.state.allNftContracts[selectedAddress][chainId],
      ).toHaveLength(0);
    });

    it('should not remove NFT contract if NFT still exists', async () => {
      const { nftController } = setupController();
      const { selectedAddress, chainId } = nftController.config;

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
        nftController.state.allNfts[selectedAddress][chainId],
      ).toHaveLength(1);

      expect(
        nftController.state.allNftContracts[selectedAddress][chainId],
      ).toHaveLength(1);
    });

    it('should remove NFT by selected address', async () => {
      const { nftController, preferences } = setupController();
      const { chainId } = nftController.config;
      sinon
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .stub(nftController, 'getNftInformation' as any)
        .returns({ name: 'name', image: 'url', description: 'description' });
      const firstAddress = '0x123';
      const secondAddress = '0x321';
      preferences.update({ selectedAddress: firstAddress });
      await nftController.addNft('0x02', '4321');
      preferences.update({ selectedAddress: secondAddress });
      await nftController.addNft('0x01', '1234');
      nftController.removeNft('0x01', '1234');
      expect(nftController.state.allNfts[secondAddress][chainId]).toHaveLength(
        0,
      );
      preferences.update({ selectedAddress: firstAddress });
      expect(
        nftController.state.allNfts[firstAddress][chainId][0],
      ).toStrictEqual({
        address: '0x02',
        description: 'description',
        image: 'url',
        name: 'name',
        tokenId: '4321',
        favorite: false,
        isCurrentlyOwned: true,
      });
    });

    it('should remove NFT by provider type', async () => {
      const { nftController, changeNetwork } = setupController();
      const { selectedAddress } = nftController.config;

      sinon
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .stub(nftController, 'getNftInformation' as any)
        .returns({ name: 'name', image: 'url', description: 'description' });
      changeNetwork(SEPOLIA);
      await nftController.addNft('0x02', '4321');
      changeNetwork(GOERLI);
      await nftController.addNft('0x01', '1234');
      nftController.removeNft('0x01', '1234');
      expect(
        nftController.state.allNfts[selectedAddress][GOERLI.chainId],
      ).toHaveLength(0);

      changeNetwork(SEPOLIA);

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
      });
    });

    it('should remove correct NFT and NFT contract when passed networkClientId and userAddress in options', async () => {
      const { nftController, changeNetwork, preferences } = setupController();

      const userAddress1 = '0x123';
      const userAddress2 = '0x321';

      changeNetwork(SEPOLIA);
      preferences.update({ selectedAddress: userAddress1 });

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

      changeNetwork(GOERLI);
      preferences.update({ selectedAddress: userAddress2 });

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
    const { nftController } = setupController();
    const { selectedAddress, chainId } = nftController.config;

    await nftController.addNft('0x02', '1', {
      nftMetadata: {
        name: 'name',
        image: 'image',
        description: 'description',
        standard: 'standard',
        favorite: false,
      },
    });

    expect(nftController.state.allNfts[selectedAddress][chainId]).toHaveLength(
      1,
    );
    expect(nftController.state.ignoredNfts).toHaveLength(0);

    nftController.removeAndIgnoreNft('0x02', '1');
    expect(nftController.state.allNfts[selectedAddress][chainId]).toHaveLength(
      0,
    );
    expect(nftController.state.ignoredNfts).toHaveLength(1);

    nftController.clearIgnoredNfts();
    expect(nftController.state.ignoredNfts).toHaveLength(0);
  });

  it('should set api key correctly', () => {
    const { nftController } = setupController();
    nftController.setApiKey('new-api-key');
    expect(nftController.openSeaApiKey).toBe('new-api-key');
  });

  describe('isNftOwner', () => {
    it('should verify the ownership of an NFT when passed a networkClientId', async () => {
      nock('https://sepolia.infura.io:443', { encodedQueryParams: true })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          method: 'eth_call',
          params: [
            {
              to: '0x2b26675403a063d92ccad0293d387485471a7d3a',
              data: '0x6352211e0000000000000000000000000000000000000000000000000000000000000001',
            },
            'latest',
          ],
          id: 21,
          jsonrpc: '2.0',
        })
        .reply(200, {
          jsonrpc: '2.0',
          id: 21,
          result:
            '0x0000000000000000000000005a3CA5cD63807Ce5e4d7841AB32Ce6B6d9BbBa2D',
        });
      const { nftController, getNetworkClientByIdSpy } = setupController();
      getNetworkClientByIdSpy.mockImplementation(() => ({
        provider: SEPOLIA_PROVIDER,
      }));

      const isOwner = await nftController.isNftOwner(
        OWNER_ADDRESS,
        '0x2b26675403a063d92ccad0293d387485471a7d3a',
        String(1),
        { networkClientId: 'sepolia' },
      );
      expect(isOwner).toBe(true);
    });

    it('should verify the ownership of an ERC-721 NFT with the correct owner address', async () => {
      const { assetsContract, nftController } = setupController();
      nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 22,
          method: 'eth_call',
          params: [
            {
              to: ERC721_NFT_ADDRESS.toLowerCase(),
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
      const isOwner = await nftController.isNftOwner(
        OWNER_ADDRESS,
        ERC721_NFT_ADDRESS,
        String(ERC721_NFT_ID),
      );
      expect(isOwner).toBe(true);
    });

    it('should not verify the ownership of an ERC-721 NFT with the wrong owner address', async () => {
      const { assetsContract, nftController } = setupController();
      nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 23,
          method: 'eth_call',
          params: [
            {
              to: ERC721_NFT_ADDRESS.toLowerCase(),
              data: '0x6352211e000000000000000000000000000000000000000000000000000000000011781a',
            },
            'latest',
          ],
        })
        .reply(200, {
          jsonrpc: '2.0',
          id: 23,
          result:
            '0x0000000000000000000000005a3ca5cd63807ce5e4d7841ab32ce6b6d9bbba2d',
        });

      assetsContract.configure({ provider: MAINNET_PROVIDER });
      const isOwner = await nftController.isNftOwner(
        '0x0000000000000000000000000000000000000000',
        ERC721_NFT_ADDRESS,
        String(ERC721_NFT_ID),
      );
      expect(isOwner).toBe(false);
    });

    it('should verify the ownership of an ERC-1155 NFT with the correct owner address', async () => {
      const { assetsContract, nftController } = setupController();
      nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 24,
          method: 'eth_call',
          params: [
            {
              to: ERC1155_NFT_ADDRESS.toLowerCase(),
              data: '0x6352211e5a3ca5cd63807ce5e4d7841ab32ce6b6d9bbba2d000000000000010000000001',
            },
            'latest',
          ],
        })
        .reply(200, {
          jsonrpc: '2.0',
          id: 24,
          error: { code: -32000, message: 'execution reverted' },
        })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 25,
          method: 'eth_call',
          params: [
            {
              to: ERC1155_NFT_ADDRESS.toLowerCase(),
              data: '0x00fdd58e0000000000000000000000005a3ca5cd63807ce5e4d7841ab32ce6b6d9bbba2d5a3ca5cd63807ce5e4d7841ab32ce6b6d9bbba2d000000000000010000000001',
            },
            'latest',
          ],
        })
        .reply(200, {
          jsonrpc: '2.0',
          id: 25,
          result:
            '0x0000000000000000000000000000000000000000000000000000000000000001',
        });
      assetsContract.configure({ provider: MAINNET_PROVIDER });
      const isOwner = await nftController.isNftOwner(
        OWNER_ADDRESS,
        ERC1155_NFT_ADDRESS,
        ERC1155_NFT_ID,
      );
      expect(isOwner).toBe(true);
    });

    it('should not verify the ownership of an ERC-1155 NFT with the wrong owner address', async () => {
      const { assetsContract, nftController } = setupController();
      nock('https://mainnet.infura.io:443', { encodedQueryParams: true })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 26,
          method: 'eth_call',
          params: [
            {
              to: ERC1155_NFT_ADDRESS.toLowerCase(),
              data: '0x6352211e5a3ca5cd63807ce5e4d7841ab32ce6b6d9bbba2d000000000000010000000001',
            },
            'latest',
          ],
        })
        .reply(200, {
          jsonrpc: '2.0',
          id: 26,
          error: { code: -32000, message: 'execution reverted' },
        })
        .post('/v3/ad3a368836ff4596becc3be8e2f137ac', {
          jsonrpc: '2.0',
          id: 27,
          method: 'eth_call',
          params: [
            {
              to: ERC1155_NFT_ADDRESS.toLowerCase(),
              data: '0x00fdd58e00000000000000000000000000000000000000000000000000000000000000005a3ca5cd63807ce5e4d7841ab32ce6b6d9bbba2d000000000000010000000001',
            },
            'latest',
          ],
        })
        .reply(200, {
          jsonrpc: '2.0',
          id: 27,
          result:
            '0x0000000000000000000000000000000000000000000000000000000000000000',
        });

      assetsContract.configure({ provider: MAINNET_PROVIDER });
      const isOwner = await nftController.isNftOwner(
        '0x0000000000000000000000000000000000000000',
        ERC1155_NFT_ADDRESS,
        ERC1155_NFT_ID,
      );
      expect(isOwner).toBe(false);
    });

    it('should throw an error for an unsupported standard', async () => {
      const { assetsContract, nftController } = setupController();
      assetsContract.configure({ provider: MAINNET_PROVIDER });
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
      const { assetsContract, nftController, preferences } = setupController();

      preferences.update({
        isIpfsGatewayEnabled: false,
        openSeaEnabled: false,
      });

      sinon
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .stub(nftController, 'getNftURIAndStandard' as any)
        .returns(['ipfs://*', ERC1155]);

      assetsContract.configure({ provider: MAINNET_PROVIDER });
      const { selectedAddress, chainId } = nftController.config;

      await nftController.addNft(ERC1155_NFT_ADDRESS, ERC1155_NFT_ID);

      expect(
        nftController.state.allNfts[selectedAddress][chainId][0],
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
    it('should set NFT as favorite', async () => {
      const { assetsContract, nftController } = setupController();
      assetsContract.configure({ provider: MAINNET_PROVIDER });
      const { selectedAddress, chainId } = nftController.config;
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
        nftController.state.allNfts[selectedAddress][chainId][0],
      ).toStrictEqual(
        expect.objectContaining({
          address: ERC721_DEPRESSIONIST_ADDRESS,
          tokenId: ERC721_DEPRESSIONIST_ID,
          favorite: true,
        }),
      );
    });

    it('should set NFT as favorite and then unset it', async () => {
      const { assetsContract, nftController } = setupController();
      assetsContract.configure({ provider: MAINNET_PROVIDER });
      const { selectedAddress, chainId } = nftController.config;
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
        nftController.state.allNfts[selectedAddress][chainId][0],
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
        nftController.state.allNfts[selectedAddress][chainId][0],
      ).toStrictEqual(
        expect.objectContaining({
          address: ERC721_DEPRESSIONIST_ADDRESS,
          tokenId: ERC721_DEPRESSIONIST_ID,
          favorite: false,
        }),
      );
    });

    it('should keep the favorite status as true after updating metadata', async () => {
      const { assetsContract, nftController } = setupController();
      assetsContract.configure({ provider: MAINNET_PROVIDER });
      const { selectedAddress, chainId } = nftController.config;
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
        nftController.state.allNfts[selectedAddress][chainId][0],
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
            standard: 'ERC721',
          },
        },
      );

      expect(
        nftController.state.allNfts[selectedAddress][chainId][0],
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
        nftController.state.allNfts[selectedAddress][chainId],
      ).toHaveLength(1);
    });

    it('should keep the favorite status as false after updating metadata', async () => {
      const { assetsContract, nftController } = setupController();
      assetsContract.configure({ provider: MAINNET_PROVIDER });
      const { selectedAddress, chainId } = nftController.config;
      await nftController.addNft(
        ERC721_DEPRESSIONIST_ADDRESS,
        ERC721_DEPRESSIONIST_ID,
        { nftMetadata: { name: '', description: '', image: '', standard: '' } },
      );

      expect(
        nftController.state.allNfts[selectedAddress][chainId][0],
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
            standard: 'ERC721',
          },
        },
      );

      expect(
        nftController.state.allNfts[selectedAddress][chainId][0],
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
        nftController.state.allNfts[selectedAddress][chainId],
      ).toHaveLength(1);
    });

    it('should set NFT as favorite when passed networkClientId and userAddress in options', async () => {
      const { nftController, preferences, changeNetwork } = setupController();

      const userAddress1 = '0x123';
      const userAddress2 = '0x321';

      changeNetwork(SEPOLIA);
      preferences.update({ selectedAddress: userAddress1 });

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

      changeNetwork(GOERLI);
      preferences.update({ selectedAddress: userAddress2 });

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
        const { nftController } = setupController();
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sinon.stub(nftController, 'isNftOwner' as any).returns(false);

        const { selectedAddress, chainId } = nftController.config;
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
          nftController.state.allNfts[selectedAddress][chainId][0]
            .isCurrentlyOwned,
        ).toBe(true);

        await nftController.checkAndUpdateAllNftsOwnershipStatus();
        expect(
          nftController.state.allNfts[selectedAddress][chainId][0]
            .isCurrentlyOwned,
        ).toBe(false);
      });

      it('should check whether NFTs for the current selectedAddress/chainId combination are still owned by the selectedAddress and leave/set the isCurrentlyOwned value to true when NFT is still owned', async () => {
        const { nftController } = setupController();
        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sinon.stub(nftController, 'isNftOwner' as any).returns(true);

        const { selectedAddress, chainId } = nftController.config;
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
          nftController.state.allNfts[selectedAddress][chainId][0]
            .isCurrentlyOwned,
        ).toBe(true);

        await nftController.checkAndUpdateAllNftsOwnershipStatus();
        expect(
          nftController.state.allNfts[selectedAddress][chainId][0]
            .isCurrentlyOwned,
        ).toBe(true);
      });

      it('should check whether NFTs for the current selectedAddress/chainId combination are still owned by the selectedAddress and leave the isCurrentlyOwned value as is when NFT ownership check fails', async () => {
        const { nftController } = setupController();
        sinon
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .stub(nftController, 'isNftOwner' as any)
          .throws(new Error('Unable to verify ownership'));

        const { selectedAddress, chainId } = nftController.config;
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
          nftController.state.allNfts[selectedAddress][chainId][0]
            .isCurrentlyOwned,
        ).toBe(true);

        await nftController.checkAndUpdateAllNftsOwnershipStatus();
        expect(
          nftController.state.allNfts[selectedAddress][chainId][0]
            .isCurrentlyOwned,
        ).toBe(true);
      });

      it('should check whether NFTs for the current selectedAddress/chainId combination are still owned by the selectedAddress and update the isCurrentlyOwned value to false when NFT is not still owned, when the currently configured selectedAddress/chainId are different from those passed', async () => {
        const { nftController, changeNetwork, preferences } = setupController();

        preferences.update({ selectedAddress: OWNER_ADDRESS });
        changeNetwork(SEPOLIA);

        const { selectedAddress, chainId } = nftController.config;
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
          nftController.state.allNfts[selectedAddress][chainId][0]
            .isCurrentlyOwned,
        ).toBe(true);

        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sinon.stub(nftController, 'isNftOwner' as any).returns(false);

        preferences.update({ selectedAddress: SECOND_OWNER_ADDRESS });
        changeNetwork(GOERLI);

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
        const { nftController } = setupController();
        const { selectedAddress, chainId } = nftController.config;
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
          nftController.state.allNfts[selectedAddress][chainId][0]
            .isCurrentlyOwned,
        ).toBe(true);

        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sinon.stub(nftController, 'isNftOwner' as any).returns(false);

        await nftController.checkAndUpdateSingleNftOwnershipStatus(nft, false);

        expect(
          nftController.state.allNfts[selectedAddress][chainId][0]
            .isCurrentlyOwned,
        ).toBe(false);
      });

      it('should check whether the passed NFT is still owned by the the current selectedAddress/chainId combination and return the updated NFT object without updating state if batch is true', async () => {
        const { nftController } = setupController();
        const { selectedAddress, chainId } = nftController.config;
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
          nftController.state.allNfts[selectedAddress][chainId][0]
            .isCurrentlyOwned,
        ).toBe(true);

        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sinon.stub(nftController, 'isNftOwner' as any).returns(false);

        const updatedNft =
          await nftController.checkAndUpdateSingleNftOwnershipStatus(nft, true);

        expect(
          nftController.state.allNfts[selectedAddress][chainId][0]
            .isCurrentlyOwned,
        ).toBe(true);

        expect(updatedNft.isCurrentlyOwned).toBe(false);
      });

      it('should check whether the passed NFT is still owned by the the selectedAddress/chainId combination passed in the accountParams argument and update its isCurrentlyOwned property in state, when the currently configured selectedAddress/chainId are different from those passed', async () => {
        const { nftController, changeNetwork, preferences } = setupController();

        preferences.update({ selectedAddress: OWNER_ADDRESS });
        changeNetwork(SEPOLIA);

        const { selectedAddress, chainId } = nftController.config;
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
          nftController.state.allNfts[selectedAddress][chainId][0]
            .isCurrentlyOwned,
        ).toBe(true);

        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sinon.stub(nftController, 'isNftOwner' as any).returns(false);

        preferences.update({ selectedAddress: SECOND_OWNER_ADDRESS });
        changeNetwork(GOERLI);

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
        const { nftController, changeNetwork, preferences } = setupController();

        preferences.update({ selectedAddress: OWNER_ADDRESS });
        changeNetwork(SEPOLIA);

        const { selectedAddress, chainId } = nftController.config;
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
          nftController.state.allNfts[selectedAddress][chainId][0]
            .isCurrentlyOwned,
        ).toBe(true);

        // TODO: Replace `any` with type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sinon.stub(nftController, 'isNftOwner' as any).returns(false);

        preferences.update({ selectedAddress: SECOND_OWNER_ADDRESS });
        changeNetwork(GOERLI);

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
    const { nftController } = setupController();
    const { selectedAddress, chainId } = nftController.config;

    it('should return null if the NFT does not exist in the state', async () => {
      expect(
        nftController.findNftByAddressAndTokenId(
          mockNft.address,
          mockNft.tokenId,
          selectedAddress,
          chainId,
        ),
      ).toBeNull();
    });

    it('should return the NFT by the address and tokenId', () => {
      nftController.state.allNfts = {
        [selectedAddress]: { [chainId]: [mockNft] },
      };

      expect(
        nftController.findNftByAddressAndTokenId(
          mockNft.address,
          mockNft.tokenId,
          selectedAddress,
          chainId,
        ),
      ).toStrictEqual({ nft: mockNft, index: 0 });
    });
  });

  describe('updateNftByAddressAndTokenId', () => {
    const { nftController } = setupController();

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

    const { selectedAddress, chainId } = nftController.config;

    it('should update the NFT if the NFT exist', async () => {
      nftController.state.allNfts = {
        [selectedAddress]: { [chainId]: [mockNft] },
      };

      nftController.updateNft(
        mockNft,
        {
          transactionId: mockTransactionId,
        },
        selectedAddress,
        chainId,
      );

      expect(
        nftController.state.allNfts[selectedAddress][chainId][0],
      ).toStrictEqual(expectedMockNft);
    });

    it('should return undefined if the NFT does not exist', () => {
      expect(
        nftController.updateNft(
          mockNft,
          {
            transactionId: mockTransactionId,
          },
          selectedAddress,
          chainId,
        ),
      ).toBeUndefined();
    });
  });

  describe('resetNftTransactionStatusByTransactionId', () => {
    const { nftController } = setupController();

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

    const { selectedAddress, chainId } = nftController.config;

    it('should not update any NFT state and should return false when passed a transaction id that does not match that of any NFT', async () => {
      expect(
        nftController.resetNftTransactionStatusByTransactionId(
          nonExistTransactionId,
          selectedAddress,
          chainId,
        ),
      ).toBe(false);
    });

    it('should set the transaction id of an NFT in state to undefined, and return true when it has successfully updated this state', async () => {
      nftController.state.allNfts = {
        [selectedAddress]: { [chainId]: [mockNft] },
      };

      expect(
        nftController.state.allNfts[selectedAddress][chainId][0].transactionId,
      ).toBe(mockTransactionId);

      expect(
        nftController.resetNftTransactionStatusByTransactionId(
          mockTransactionId,
          selectedAddress,
          chainId,
        ),
      ).toBe(true);

      expect(
        nftController.state.allNfts[selectedAddress][chainId][0].transactionId,
      ).toBeUndefined();
    });
  });
});
