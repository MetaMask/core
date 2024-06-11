import { BigNumber } from '@ethersproject/bignumber';
import { ControllerMessenger } from '@metamask/base-controller';
import {
  BUILT_IN_NETWORKS,
  ChainId,
  InfuraNetworkType,
  IPFS_DEFAULT_GATEWAY_URL,
  NetworkType,
} from '@metamask/controller-utils';
import HttpProvider from '@metamask/ethjs-provider-http';
import type {
  Provider,
  NetworkClientId,
  NetworkControllerEvents,
  NetworkControllerActions,
} from '@metamask/network-controller';
import {
  NetworkController,
  NetworkClientType,
} from '@metamask/network-controller';
import { getDefaultPreferencesState } from '@metamask/preferences-controller';
import assert from 'assert';

import { mockNetwork } from '../../../tests/mock-network';
import { buildInfuraNetworkClientConfiguration } from '../../network-controller/tests/helpers';
import type {
  AllowedActions as AssetsContractAllowedActions,
  AllowedEvents as AssetsContractAllowedEvents,
} from './AssetsContractController';
import {
  AssetsContractController,
  MISSING_PROVIDER_ERROR,
} from './AssetsContractController';
import { SupportedTokenDetectionNetworks } from './assetsUtil';

const ERC20_UNI_ADDRESS = '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984';
const ERC20_SAI_ADDRESS = '0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359';
const ERC20_DAI_ADDRESS = '0x6b175474e89094c44da98b954eedeac495271d0f';
const ERC721_GODS_ADDRESS = '0x6ebeaf8e8e946f0716e6533a6f2cefc83f60e8ab';
const ERC1155_ADDRESS = '0x495f947276749ce646f68ac8c248420045cb7b5e';
const ERC1155_ID =
  '40815311521795738946686668571398122012172359753720345430028676522525371400193';

const TEST_ACCOUNT_PUBLIC_ADDRESS =
  '0x5a3CA5cD63807Ce5e4d7841AB32Ce6B6d9BbBa2D';

/**
 * Creates the assets contract controller along with the dependencies necessary
 * to use it effectively in tests.
 *
 * @param args - The arguments to this function.
 * @param args.options - AssetsContractController options.
 * @param args.useNetworkControllerProvider - Whether to use the initial
 * provider that the network controller creates or to create a new one.
 * @param args.infuraProjectId - The Infura project ID to use when initializing
 * the network controller.
 * @returns the objects.
 */
async function setupAssetContractControllers({
  options,
  useNetworkControllerProvider,
  infuraProjectId = '341eacb578dd44a1a049cbc5f6fd4035',
}: {
  options?: Partial<ConstructorParameters<typeof AssetsContractController>[0]>;
  useNetworkControllerProvider?: boolean;
  infuraProjectId?: string;
} = {}) {
  const networkClientConfiguration = {
    type: NetworkClientType.Infura,
    network: NetworkType.mainnet,
    infuraProjectId,
    chainId: BUILT_IN_NETWORKS.mainnet.chainId,
    ticker: BUILT_IN_NETWORKS.mainnet.ticker,
  } as const;
  let provider: Provider;

  const controllerMessenger = new ControllerMessenger<
    NetworkControllerActions | AssetsContractAllowedActions,
    NetworkControllerEvents | AssetsContractAllowedEvents
  >();
  const networkMessenger = controllerMessenger.getRestricted({
    name: 'NetworkController',
    allowedActions: [],
    allowedEvents: [],
  });
  const networkController = new NetworkController({
    infuraProjectId,
    messenger: networkMessenger,
    trackMetaMetricsEvent: jest.fn(),
  });
  if (useNetworkControllerProvider) {
    await networkController.initializeProvider();
    const selectedNetworkClient = networkController.getSelectedNetworkClient();
    assert(selectedNetworkClient, 'No network is selected');
    provider = selectedNetworkClient.provider;

    controllerMessenger.unregisterActionHandler(
      'NetworkController:getNetworkClientById',
    );
    controllerMessenger.registerActionHandler(
      'NetworkController:getNetworkClientById',
      // @ts-expect-error TODO: remove this annotation once the `Eip1193Provider` class is released
      (networkClientId: NetworkClientId) => {
        return {
          ...networkController.getNetworkClientById(networkClientId),
          provider,
        };
      },
    );
  } else {
    provider = new HttpProvider(
      `https://mainnet.infura.io/v3/${infuraProjectId}`,
    );
  }

  const assetsContractMessenger = controllerMessenger.getRestricted({
    name: 'AssetsContractController',
    allowedActions: ['NetworkController:getNetworkClientById'],
    allowedEvents: [
      'PreferencesController:stateChange',
      'NetworkController:networkDidChange',
    ],
  });
  const assetsContract = new AssetsContractController({
    chainId: ChainId.mainnet,
    messenger: assetsContractMessenger,
    ...options,
  });

  return {
    messenger: controllerMessenger,
    network: networkController,
    assetsContract,
    provider,
    networkClientConfiguration,
    infuraProjectId,
  };
}

/**
 * Mocks request to the network.
 *
 * @param args - The arguments.
 * @param args.networkClientConfiguration - Specifies the network to mock
 * (either an Infura network or a custom network).
 * @param args.mocks - Objects which specify the requests to mock and the
 * responses to use for those requests. (See {@link JsonRpcRequestMock}.)
 * @returns The mocked network.
 */
function mockNetworkWithDefaultChainId({
  networkClientConfiguration,
  mocks = [],
}: Parameters<typeof mockNetwork>[0]) {
  return mockNetwork({
    networkClientConfiguration,
    mocks: [
      {
        request: {
          method: 'eth_chainId',
          params: [],
        },
        response: {
          result: '0x1',
        },
        discardAfterMatching: false,
      },
      ...mocks,
    ],
  });
}

// eslint-disable-next-line jest/no-export
export { setupAssetContractControllers, mockNetworkWithDefaultChainId };

describe('AssetsContractController', () => {
  it('should set default config', async () => {
    const { assetsContract, messenger } = await setupAssetContractControllers();
    expect({
      chainId: assetsContract.chainId,
      ipfsGateway: assetsContract.ipfsGateway,
    }).toStrictEqual({
      chainId: SupportedTokenDetectionNetworks.mainnet,
      ipfsGateway: IPFS_DEFAULT_GATEWAY_URL,
    });
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should update the ipfsGateWay config value when this value is changed in the preferences controller', async () => {
    const { assetsContract, messenger } = await setupAssetContractControllers();
    expect({
      chainId: assetsContract.chainId,
      ipfsGateway: assetsContract.ipfsGateway,
    }).toStrictEqual({
      chainId: SupportedTokenDetectionNetworks.mainnet,
      ipfsGateway: IPFS_DEFAULT_GATEWAY_URL,
    });

    messenger.publish(
      'PreferencesController:stateChange',
      {
        ...getDefaultPreferencesState(),
        ipfsGateway: 'newIPFSGateWay',
      },
      [],
    );

    expect({
      chainId: assetsContract.chainId,
      ipfsGateway: assetsContract.ipfsGateway,
    }).toStrictEqual({
      ipfsGateway: 'newIPFSGateWay',
      chainId: SupportedTokenDetectionNetworks.mainnet,
    });

    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should throw when provider property is accessed', async () => {
    const { assetsContract, messenger } = await setupAssetContractControllers();
    expect(() => console.log(assetsContract.provider)).toThrow(
      'Property only used for setting',
    );
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should throw missing provider error when getting ERC-20 token balance when missing provider', async () => {
    const { assetsContract, messenger } = await setupAssetContractControllers();
    assetsContract.provider = undefined;
    await expect(
      assetsContract.getERC20BalanceOf(
        ERC20_UNI_ADDRESS,
        TEST_ACCOUNT_PUBLIC_ADDRESS,
      ),
    ).rejects.toThrow(MISSING_PROVIDER_ERROR);
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should throw missing provider error when getting ERC-20 token decimal when missing provider', async () => {
    const { assetsContract, messenger } = await setupAssetContractControllers();
    assetsContract.provider = undefined;
    await expect(
      assetsContract.getERC20TokenDecimals(ERC20_UNI_ADDRESS),
    ).rejects.toThrow(MISSING_PROVIDER_ERROR);
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should get balance of ERC-20 token contract correctly', async () => {
    const { assetsContract, messenger, provider, networkClientConfiguration } =
      await setupAssetContractControllers();
    assetsContract.provider = provider;
    mockNetworkWithDefaultChainId({
      networkClientConfiguration,
      mocks: [
        {
          request: {
            method: 'eth_call',
            params: [
              {
                to: ERC20_UNI_ADDRESS,
                data: '0x70a082310000000000000000000000005a3ca5cd63807ce5e4d7841ab32ce6b6d9bbba2d',
              },
              'latest',
            ],
          },
          response: {
            result:
              '0x0000000000000000000000000000000000000000000000001765caf344a06d0a',
          },
        },
        {
          request: {
            method: 'eth_call',
            params: [
              {
                to: ERC20_UNI_ADDRESS,
                data: '0x70a08231000000000000000000000000202637daaefbd7f131f90338a4a6c69f6cd5ce91',
              },
              'latest',
            ],
          },
          response: {
            result:
              '0x0000000000000000000000000000000000000000000000000000000000000000',
          },
        },
      ],
    });
    const UNIBalance = await assetsContract.getERC20BalanceOf(
      ERC20_UNI_ADDRESS,
      TEST_ACCOUNT_PUBLIC_ADDRESS,
    );
    const UNINoBalance = await assetsContract.getERC20BalanceOf(
      ERC20_UNI_ADDRESS,
      '0x202637dAAEfbd7f131f90338a4A6c69F6Cd5CE91',
    );
    expect(UNIBalance.toString(16)).not.toBe('0');
    expect(UNINoBalance.toString(16)).toBe('0');
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should get ERC-721 NFT tokenId correctly', async () => {
    const { assetsContract, messenger, provider, networkClientConfiguration } =
      await setupAssetContractControllers();
    assetsContract.provider = provider;
    mockNetworkWithDefaultChainId({
      networkClientConfiguration,
      mocks: [
        {
          request: {
            method: 'eth_call',
            params: [
              {
                to: ERC721_GODS_ADDRESS,
                data: '0x2f745c590000000000000000000000009a90bd8d1149a88b42a99cf62215ad955d6f498a0000000000000000000000000000000000000000000000000000000000000000',
              },
              'latest',
            ],
          },
          response: {
            result:
              '0x00000000000000000000000000000000000000000000000000000000000025a2',
          },
        },
      ],
    });
    const tokenId = await assetsContract.getERC721NftTokenId(
      ERC721_GODS_ADDRESS,
      '0x9a90bd8d1149a88b42a99cf62215ad955d6f498a',
      0,
    );
    expect(tokenId).not.toBe(0);
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should throw missing provider error when getting ERC-721 token standard and details when missing provider', async () => {
    const { assetsContract, messenger } = await setupAssetContractControllers();
    assetsContract.provider = undefined;
    await expect(
      assetsContract.getTokenStandardAndDetails(
        ERC20_UNI_ADDRESS,
        TEST_ACCOUNT_PUBLIC_ADDRESS,
      ),
    ).rejects.toThrow(MISSING_PROVIDER_ERROR);
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should throw contract standard error when getting ERC-20 token standard and details when provided with invalid ERC-20 address', async () => {
    const { assetsContract, messenger, provider } =
      await setupAssetContractControllers();
    assetsContract.provider = provider;
    const error = 'Unable to determine contract standard';
    await expect(
      assetsContract.getTokenStandardAndDetails(
        'BaDeRc20AdDrEsS',
        TEST_ACCOUNT_PUBLIC_ADDRESS,
      ),
    ).rejects.toThrow(error);
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should get ERC-721 token standard and details', async () => {
    const { assetsContract, messenger, provider, networkClientConfiguration } =
      await setupAssetContractControllers();
    assetsContract.provider = provider;
    mockNetworkWithDefaultChainId({
      networkClientConfiguration,
      mocks: [
        {
          request: {
            method: 'eth_call',
            params: [
              {
                to: ERC721_GODS_ADDRESS,
                data: '0x01ffc9a780ac58cd00000000000000000000000000000000000000000000000000000000',
              },
              'latest',
            ],
          },
          response: {
            result:
              '0x0000000000000000000000000000000000000000000000000000000000000001',
          },
        },
        {
          request: {
            method: 'eth_call',
            params: [
              {
                to: ERC721_GODS_ADDRESS,
                data: '0x95d89b41',
              },
              'latest',
            ],
          },
          response: {
            result:
              '0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000004474f445300000000000000000000000000000000000000000000000000000000',
          },
        },
        {
          request: {
            method: 'eth_call',
            params: [
              {
                to: ERC721_GODS_ADDRESS,
                data: '0x06fdde03',
              },
              'latest',
            ],
          },
          response: {
            result:
              '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000e476f647320556e636861696e6564000000000000000000000000000000000000',
          },
        },
      ],
    });
    const standardAndDetails = await assetsContract.getTokenStandardAndDetails(
      ERC721_GODS_ADDRESS,
      TEST_ACCOUNT_PUBLIC_ADDRESS,
    );
    expect(standardAndDetails.standard).toBe('ERC721');
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should get ERC-1155 token standard and details', async () => {
    const { assetsContract, messenger, provider, networkClientConfiguration } =
      await setupAssetContractControllers();
    assetsContract.provider = provider;
    mockNetworkWithDefaultChainId({
      networkClientConfiguration,
      mocks: [
        {
          request: {
            method: 'eth_call',
            params: [
              {
                to: ERC1155_ADDRESS,
                data: '0x01ffc9a780ac58cd00000000000000000000000000000000000000000000000000000000',
              },
              'latest',
            ],
          },
          response: {
            result:
              '0x0000000000000000000000000000000000000000000000000000000000000000',
          },
        },
        {
          request: {
            method: 'eth_call',
            params: [
              {
                to: ERC1155_ADDRESS,
                data: '0x06fdde03',
              },
              'latest',
            ],
          },
          response: {
            result:
              '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000001c41706569726f6e20476f6469766572736520436f6c6c656374696f6e00000000',
          },
        },
        {
          request: {
            method: 'eth_call',
            params: [
              {
                to: ERC1155_ADDRESS,
                data: '0x95d89b41',
              },
              'latest',
            ],
          },
          response: {
            result:
              '0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000054150454743000000000000000000000000000000000000000000000000000000',
          },
        },
        {
          request: {
            method: 'eth_call',
            params: [
              {
                to: ERC1155_ADDRESS,
                data: '0x01ffc9a7d9b67a2600000000000000000000000000000000000000000000000000000000',
              },
              'latest',
            ],
          },
          response: {
            result:
              '0x0000000000000000000000000000000000000000000000000000000000000001',
          },
        },
      ],
    });
    const standardAndDetails = await assetsContract.getTokenStandardAndDetails(
      ERC1155_ADDRESS,
      TEST_ACCOUNT_PUBLIC_ADDRESS,
    );

    expect(standardAndDetails.standard).toBe('ERC1155');
    expect(standardAndDetails.name).toBe('Apeiron Godiverse Collection');
    expect(standardAndDetails.symbol).toBe('APEGC');

    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should get ERC-20 token standard and details', async () => {
    const { assetsContract, messenger, provider, networkClientConfiguration } =
      await setupAssetContractControllers();
    assetsContract.provider = provider;
    mockNetworkWithDefaultChainId({
      networkClientConfiguration,
      mocks: [
        {
          request: {
            method: 'eth_call',
            params: [
              {
                to: ERC20_UNI_ADDRESS,
                data: '0x01ffc9a780ac58cd00000000000000000000000000000000000000000000000000000000',
              },
              'latest',
            ],
          },
          error: {
            code: -32000,
            message: 'execution reverted',
          },
        },
        {
          request: {
            method: 'eth_call',
            params: [
              {
                to: ERC20_UNI_ADDRESS,
                data: '0x01ffc9a7d9b67a2600000000000000000000000000000000000000000000000000000000',
              },
              'latest',
            ],
          },
          error: {
            code: -32000,
            message: 'execution reverted',
          },
        },
        {
          request: {
            method: 'eth_call',
            params: [
              {
                to: ERC20_UNI_ADDRESS,
                data: '0x95d89b41',
              },
              'latest',
            ],
          },
          response: {
            result:
              '0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000003554e490000000000000000000000000000000000000000000000000000000000',
          },
        },
        {
          request: {
            method: 'eth_call',
            params: [
              {
                to: ERC20_UNI_ADDRESS,
                data: '0x313ce567',
              },
              'latest',
            ],
          },
          response: {
            result:
              '0x0000000000000000000000000000000000000000000000000000000000000012',
          },
        },
        {
          request: {
            method: 'eth_call',
            params: [
              {
                to: ERC20_UNI_ADDRESS,
                data: '0x70a082310000000000000000000000005a3ca5cd63807ce5e4d7841ab32ce6b6d9bbba2d',
              },
              'latest',
            ],
          },
          response: {
            result:
              '0x0000000000000000000000000000000000000000000000001765caf344a06d0a',
          },
        },
      ],
    });
    const standardAndDetails = await assetsContract.getTokenStandardAndDetails(
      ERC20_UNI_ADDRESS,
      TEST_ACCOUNT_PUBLIC_ADDRESS,
    );
    expect(standardAndDetails.standard).toBe('ERC20');
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should get ERC-721 NFT tokenURI correctly', async () => {
    const { assetsContract, messenger, provider, networkClientConfiguration } =
      await setupAssetContractControllers();
    assetsContract.provider = provider;
    mockNetworkWithDefaultChainId({
      networkClientConfiguration,
      mocks: [
        {
          request: {
            method: 'eth_call',
            params: [
              {
                to: ERC721_GODS_ADDRESS,
                data: '0x01ffc9a75b5e139f00000000000000000000000000000000000000000000000000000000',
              },
              'latest',
            ],
          },
          response: {
            result:
              '0x0000000000000000000000000000000000000000000000000000000000000001',
          },
        },
        {
          request: {
            method: 'eth_call',
            params: [
              {
                to: ERC721_GODS_ADDRESS,
                data: '0xc87b56dd0000000000000000000000000000000000000000000000000000000000000000',
              },
              'latest',
            ],
          },
          response: {
            result:
              '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000002468747470733a2f2f6170692e676f6473756e636861696e65642e636f6d2f636172642f3000000000000000000000000000000000000000000000000000000000',
          },
        },
      ],
    });
    const tokenId = await assetsContract.getERC721TokenURI(
      ERC721_GODS_ADDRESS,
      '0',
    );
    expect(tokenId).toBe('https://api.godsunchained.com/card/0');
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should not throw an error when address given does not support NFT Metadata interface', async () => {
    const { assetsContract, messenger, provider, networkClientConfiguration } =
      await setupAssetContractControllers();
    assetsContract.provider = provider;
    const errorLogSpy = jest
      .spyOn(console, 'error')
      .mockImplementationOnce(() => {
        /**/
      });
    mockNetworkWithDefaultChainId({
      networkClientConfiguration,
      mocks: [
        {
          request: {
            method: 'eth_call',
            params: [
              {
                to: '0x0000000000000000000000000000000000000000',
                data: '0x01ffc9a75b5e139f00000000000000000000000000000000000000000000000000000000',
              },
              'latest',
            ],
          },
          response: {
            result: '0x',
          },
        },
        {
          request: {
            method: 'eth_call',
            params: [
              {
                to: '0x0000000000000000000000000000000000000000',
                data: '0xc87b56dd0000000000000000000000000000000000000000000000000000000000000000',
              },
              'latest',
            ],
          },
          response: {
            result:
              '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000002468747470733a2f2f6170692e676f6473756e636861696e65642e636f6d2f636172642f3000000000000000000000000000000000000000000000000000000000',
          },
        },
      ],
    });
    const uri = await assetsContract.getERC721TokenURI(
      '0x0000000000000000000000000000000000000000',
      '0',
    );
    expect(uri).toBe('https://api.godsunchained.com/card/0');
    expect(errorLogSpy).toHaveBeenCalledTimes(1);
    expect(errorLogSpy.mock.calls).toContainEqual([
      'Contract does not support ERC721 metadata interface.',
    ]);

    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should get ERC-721 NFT name', async () => {
    const { assetsContract, messenger, provider, networkClientConfiguration } =
      await setupAssetContractControllers();
    assetsContract.provider = provider;
    mockNetworkWithDefaultChainId({
      networkClientConfiguration,
      mocks: [
        {
          request: {
            method: 'eth_call',
            params: [
              {
                to: ERC721_GODS_ADDRESS,
                data: '0x06fdde03',
              },
              'latest',
            ],
          },
          response: {
            result:
              '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000e476f647320556e636861696e6564000000000000000000000000000000000000',
          },
        },
      ],
    });
    const name = await assetsContract.getERC721AssetName(ERC721_GODS_ADDRESS);
    expect(name).toBe('Gods Unchained');
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should get ERC-721 NFT symbol', async () => {
    const { assetsContract, messenger, provider, networkClientConfiguration } =
      await setupAssetContractControllers();
    assetsContract.provider = provider;
    mockNetworkWithDefaultChainId({
      networkClientConfiguration,
      mocks: [
        {
          request: {
            method: 'eth_call',
            params: [
              {
                to: ERC721_GODS_ADDRESS,
                data: '0x95d89b41',
              },
              'latest',
            ],
          },
          response: {
            result:
              '0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000004474f445300000000000000000000000000000000000000000000000000000000',
          },
        },
      ],
    });
    const symbol = await assetsContract.getERC721AssetSymbol(
      ERC721_GODS_ADDRESS,
    );
    expect(symbol).toBe('GODS');
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should throw missing provider error when getting ERC-721 NFT symbol when missing provider', async () => {
    const { assetsContract, messenger } = await setupAssetContractControllers();
    await expect(
      assetsContract.getERC721AssetSymbol(ERC721_GODS_ADDRESS),
    ).rejects.toThrow(MISSING_PROVIDER_ERROR);
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should get ERC-20 token decimals', async () => {
    const { assetsContract, messenger, provider, networkClientConfiguration } =
      await setupAssetContractControllers();
    assetsContract.provider = provider;
    mockNetworkWithDefaultChainId({
      networkClientConfiguration,
      mocks: [
        {
          request: {
            method: 'eth_call',
            params: [
              {
                to: ERC20_SAI_ADDRESS,
                data: '0x313ce567',
              },
              'latest',
            ],
          },
          response: {
            result:
              '0x0000000000000000000000000000000000000000000000000000000000000012',
          },
        },
      ],
    });
    const decimals = await assetsContract.getERC20TokenDecimals(
      ERC20_SAI_ADDRESS,
    );
    expect(Number(decimals)).toBe(18);
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should get ERC-20 token name', async () => {
    const { assetsContract, messenger, provider, networkClientConfiguration } =
      await setupAssetContractControllers();
    assetsContract.provider = provider;
    mockNetworkWithDefaultChainId({
      networkClientConfiguration,
      mocks: [
        {
          request: {
            method: 'eth_call',
            params: [
              {
                to: ERC20_DAI_ADDRESS,
                data: '0x06fdde03',
              },
              'latest',
            ],
          },
          response: {
            result:
              '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000e44616920537461626c65636f696e000000000000000000000000000000000000',
          },
        },
      ],
    });

    const name = await assetsContract.getERC20TokenName(ERC20_DAI_ADDRESS);

    expect(name).toBe('Dai Stablecoin');
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should get ERC-721 NFT ownership', async () => {
    const { assetsContract, messenger, provider, networkClientConfiguration } =
      await setupAssetContractControllers();
    assetsContract.provider = provider;
    mockNetworkWithDefaultChainId({
      networkClientConfiguration,
      mocks: [
        {
          request: {
            method: 'eth_call',
            params: [
              {
                to: ERC721_GODS_ADDRESS,
                data: '0x6352211e000000000000000000000000000000000000000000000000000000000002436c',
              },
              'latest',
            ],
          },
          response: {
            result:
              '0x00000000000000000000000017f88211f9648cd2cc9f04874153a12371629acc',
          },
        },
      ],
    });
    const tokenId = await assetsContract.getERC721OwnerOf(
      ERC721_GODS_ADDRESS,
      '148332',
    );
    expect(tokenId).not.toBe('');
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should throw missing provider error when getting ERC-721 NFT ownership', async () => {
    const { assetsContract, messenger } = await setupAssetContractControllers();
    await expect(
      assetsContract.getERC721OwnerOf(ERC721_GODS_ADDRESS, '148332'),
    ).rejects.toThrow(MISSING_PROVIDER_ERROR);
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should get balance of ERC-20 token in a single call on network with token detection support', async () => {
    const { assetsContract, messenger, provider, networkClientConfiguration } =
      await setupAssetContractControllers();
    assetsContract.provider = provider;
    mockNetworkWithDefaultChainId({
      networkClientConfiguration,
      mocks: [
        {
          request: {
            method: 'eth_call',
            params: [
              {
                to: '0xb1f8e55c7f64d203c1400b9d8555d050f94adf39',
                data: '0xf0002ea900000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000100000000000000000000000089d24a6b4ccb1b6faa2625fe562bdd9a23260359000000000000000000000000000000000000000000000000000000000000000100000000000000000000000089d24a6b4ccb1b6faa2625fe562bdd9a23260359',
              },
              'latest',
            ],
          },
          response: {
            result:
              '0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000733ed8ef4c4a0155d09',
          },
        },
      ],
    });
    const balances = await assetsContract.getBalancesInSingleCall(
      ERC20_SAI_ADDRESS,
      [ERC20_SAI_ADDRESS],
    );
    expect(balances[ERC20_SAI_ADDRESS]).toBeDefined();
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should track and use the currently selected chain ID and provider when getting balances in a single call', async () => {
    const infuraProjectId = 'some-infura-project-id';
    mockNetwork({
      networkClientConfiguration: buildInfuraNetworkClientConfiguration(
        InfuraNetworkType.mainnet,
        { infuraProjectId },
      ),
      mocks: [
        {
          request: {
            method: 'eth_blockNumber',
            params: [],
          },
          response: {
            result: '0x3b3301',
          },
        },
        {
          request: {
            method: 'eth_call',
            params: [
              {
                to: '0xb1f8e55c7f64d203c1400b9d8555d050f94adf39',
                data: '0xf0002ea900000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000100000000000000000000000089d24a6b4ccb1b6faa2625fe562bdd9a23260359000000000000000000000000000000000000000000000000000000000000000100000000000000000000000089d24a6b4ccb1b6faa2625fe562bdd9a23260359',
              },
              '0x3b3301',
            ],
          },
          response: {
            result:
              '0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000733ed8ef4c4a0155d09',
          },
        },
      ],
    });
    mockNetwork({
      networkClientConfiguration: buildInfuraNetworkClientConfiguration(
        InfuraNetworkType['linea-mainnet'],
        { infuraProjectId },
      ),
      mocks: [
        {
          request: {
            method: 'eth_blockNumber',
            params: [],
          },
          response: {
            result: '0x3b3301',
          },
        },
        {
          request: {
            method: 'eth_call',
            params: [
              {
                to: '0xf62e6a41561b3650a69bb03199c735e3e3328c0d',
                data: '0xf0002ea900000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000100000000000000000000000089d24a6b4ccb1b6faa2625fe562bdd9a23260359000000000000000000000000000000000000000000000000000000000000000100000000000000000000000089d24a6b4ccb1b6faa2625fe562bdd9a23260359',
              },
              '0x3b3301',
            ],
          },
          response: {
            result:
              '0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000a0155d09733ed8ef4c4',
          },
        },
      ],
    });
    const { assetsContract, network, provider } =
      await setupAssetContractControllers({
        options: {
          chainId: ChainId.mainnet,
        },
        useNetworkControllerProvider: true,
        infuraProjectId,
      });
    assetsContract.provider = provider;

    const balancesOnMainnet = await assetsContract.getBalancesInSingleCall(
      ERC20_SAI_ADDRESS,
      [ERC20_SAI_ADDRESS],
    );
    expect(balancesOnMainnet).toStrictEqual({
      [ERC20_SAI_ADDRESS]: BigNumber.from('0x0733ed8ef4c4a0155d09'),
    });

    await network.setActiveNetwork(InfuraNetworkType['linea-mainnet']);

    const balancesOnLineaMainnet = await assetsContract.getBalancesInSingleCall(
      ERC20_SAI_ADDRESS,
      [ERC20_SAI_ADDRESS],
    );
    expect(balancesOnLineaMainnet).toStrictEqual({
      [ERC20_SAI_ADDRESS]: BigNumber.from('0xa0155d09733ed8ef4c4'),
    });
  });

  it('should not have balance in a single call after switching to network without token detection support', async () => {
    const {
      assetsContract,
      messenger,
      network,
      provider,
      networkClientConfiguration,
    } = await setupAssetContractControllers();
    assetsContract.provider = provider;
    mockNetworkWithDefaultChainId({
      networkClientConfiguration,
      mocks: [
        {
          request: {
            method: 'eth_call',
            params: [
              {
                to: '0xb1f8e55c7f64d203c1400b9d8555d050f94adf39',
                data: '0xf0002ea900000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000100000000000000000000000089d24a6b4ccb1b6faa2625fe562bdd9a23260359000000000000000000000000000000000000000000000000000000000000000100000000000000000000000089d24a6b4ccb1b6faa2625fe562bdd9a23260359',
              },
              'latest',
            ],
          },
          response: {
            result:
              '0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000733ed8ef4c4a0155d09',
          },
        },
      ],
    });
    mockNetworkWithDefaultChainId({
      networkClientConfiguration: {
        chainId: BUILT_IN_NETWORKS.sepolia.chainId,
        ticker: BUILT_IN_NETWORKS.sepolia.ticker,
        type: NetworkClientType.Infura,
        network: 'sepolia',
        infuraProjectId: networkClientConfiguration.infuraProjectId,
      },
      mocks: [
        {
          request: {
            method: 'eth_blockNumber',
            params: [],
          },
          response: {
            result: '0x3b3301',
          },
        },
        {
          request: {
            method: 'eth_getBlockByNumber',
            params: ['0x3b3301'],
          },
          response: {
            result:
              '1f8b08000000000000ffb4784dab5d598ee57fb963d3e85bda316c92fe801e340d394a7220696b67b871d881df8bcaa84ae2bf17fb5d674016f6ccf1060fee39f76ae9682f2d2d9d7f3cfeffcba78f9f7feec70f0ffa6ff078f778bf1f3f182106e89220b2507bf7f83c2fbf7c787dfcf08f47e5cbfc8f99ff3b9fff67be3c7e78c0affe78f7d8efcf79dfbf7c78fdf7b74b37d0fcfafa39ff94aff97665473020146888b9a98b4584b91d461a2686fb3fd4da968dabc7e3dde36ff9f27fdefff4fef52d02f66a0e785efef3cbec2f57a5d8e7f1eef163befcf804b72c858283403996284b77837a07e1de75784042fd1c2baba1dca347912a8ad44f3ede3d3e7cfadbcb7ffff0e9d34f6f01491510d616dc6d0e905520001c68828002ba2a09a8383241a0e12c927005e0054511690b51241a122170903b8382e204b4300b9009bb6f615cbaa0e62c68e4ea0029508b850202a8b8023a082a38d1445320ef37f781b5783674c48a5b6c58410204b06498571f6482c60d34a92b8d150e1224181c6b808316dd2148b8a60111a6945712086d4a5060b514819508404d04444b004bee8f041b919745546f290e48912222212829cc8cd1015880ac28b0e070d06e4b206868760900588894b04001066447d36a025f484082042d1b49a25953a821415d30e01e0b8bc126a0458b17b67942808982ec2dda09f0f6c02bc08901e850024224ec869b2440c800219d4c0f38806b48c72fe57e7aff713ebf91a16d4874ad857586bc3b6d8739d161dd499c38d2b5fced47bffeaf7f92b2975cc613982c4346c6341c415db26b8909b1c91a863d5b5720fbb9748a8eb2a0bce13e7efad8f364f87ff9bb377ff9a9be64c8c50cf878f7f8393fcfc7d7df5300d7f1132cdb85a26ec55c8ed1e64c37d3b3706d56176f3845066bf991044c3e86721bf2f3f4bcfff9f5e5ff7dfaf46ccacd0eb3e2a47886069ced195e6b8982b6f90e3f2d21aa1cb750d22b0417642d67a69be5cb8fc97ffed81fe6a926b8bb654fec69d7ed99155a6a5ed6bd0573339228d6924817e4038942670b6c592cb7502fefffe35927f7bcb57979cdd7f93de5643b9c45a87a9477aded65513ba5d7042f0241f1c8b5a07784b28def2eefd24d58fa78f7787dffd3bcbce64f3fbf0534c94375fadef8f49a1ffef4af5ac86d6afb0adccabae9bc7ece8f2fd9afef3f7d7c79fcf097fbcc59a5e48620d83d79aa76c58aa1d6dd22ec2827669f592ab8e7c819a336b7b82c5a8f770ff8b52c7b86672ba763eef2cd3d23236b2f9c0d8c9a9b548cc1d6ae91a8955dc00910996f416c14a57d7275c22217a76db2fbc0716f097631f71558e336768e1459368355eca96710e05dc6834bfd829e4ef02e775d72d6b0a2b293878bcce0060199124e319b157de84b260bfcc4de6cb2294678ebe8a91cdb950b44270859c7053a4a107accd0e2b652e3339376188e3e6b83876f94845683ec72b28a5e3b51b3ba040a90aaf56c3eea78562ffa67907189e8f6b0708eb5958cc00e56ab8396ea248b6df7e3cb6620e270862dc0da09f216642a4f801ef743e3477a1a43e49c66aba41e5a790527d73a9db5c20e526f950170157c1ef19c5cba632d3c8ba73727b1e5aa9ebd76eb38b7230dcc9d2a1a6a462e66541e52616f417816c33a038600bd0096794084c09d89bde38c6e25f60a24a253769c67348cc1b73fc9363dda4cc15813458d7b49b8953929561d6958576c1583f114c47ecb53259843d4df82ec26f2cd3b214fe158385eba5b9a8de1de60ab36dcf9167e92f37440a9af25e81833cf20214265b94bba767b92572ce839630ce7c4c8c1c0bd9adf7209983d628bf7dedefb19c4c5ce8995d875f2c421b14067d8bae8f0aef68c339e95c59b30d5d15c3ceb4c52723f197b34adc3598aaf9581125dc845cd88a7a2c3a3b6a2ac39dbdb04c420330c5bd517bc05512d27ce00ef60a448184f5f039cd3ee53cbb6c094c38ac21d4b9193aa140db8de5c13fcca6b04652bc239db4374c54c4c3278931f06a39058c7f1e072eaa9a3b319b53573213f0b2b934e5048726fdbd892c92bc3245ecbce9a144561a78310bd14a71279c6bc259f8f73986c55495025c40a4bd88710ba3c37a10385cf395404becf9c2d167a96cbdc3ef067905b84f5a679dc5744d07755994c6a05b8d91c8f6acd657eee2caff2b3ab029dc0e379c484b06dc66feb5622904f6ace3ef75322a3ef8d52e81481c0ce50d09405809d66e7793a2c8bcf66d8e8b67347c9f8aea8b2898100d1eee658dddbbc77d159e53e7972117d61ec64558aa1a0bb6e06a83ce25ccdbbde481e6219d3da5657e64e6b8bb35d283cf0ec1d4a75c873aa44671d9b025a9c4bac49ce62d2eb4ef7e4c15c00682ae75abbab4133f54563b7c1907afa00c42add7bea36211955faacd377b44f9945c13e185e568c23be80e8cbe314c695b045b9e21cd561395c7c45da74ca5775988e68afc2bb4f9c3ab4930fd5f5816f41d0b1f646d33a4a090c385751fa6c276350b8edd8b580afd1c0663949dc077dd6707fc924d6fdaea243e2cce985e3b6012a645de7cc8d0871bdf0baf6863978417a43659a7d517b896c2d0795c540b188113a54b16ed323ef5dc2dc89c961d790ef961e2ce56cde4f29e80d93b855927a1bd7414e5e875186f2a8fad1d856b88ac3ef3ab2e836fe69385baaeba9f6c4b9d61d778a72a6f3305fc6a45bb5011af275d47e333a73e54ba268db54f4b03d7bc74f6dd83e0641807529d78e682bbce0ec1962c8f0cb178ebaf93593d8a4dd896ecfb9e3add9b2d5afa2274a6c9cd45e870ae8ba3d636a877d9db1f7b81d85d47df48876807d918274e073467adf67590ee8c00ab46074b6a649b4c6eab04619950562c5d2d6c3ac4f29304533ec3629a54159b8e520f059e2a6e177ecdef1b9ef8ab37a89135557dc19bdec99899788541a3afada7bf3ac1e0eb71623d9a67eb0ccf388e23a7b980ed915b1a52bd617bb45b8cfd6eab62da47186eb9e2c86acabc3864781296eb1b8976ebf3b2d1905edb4bd9f5d2c357a0542a8c6f49e860fe9a113da6206836b13abaa01017a03d3ba2a7bd5b4e89fca1649a27db6eea93e4d7de58c02246b520ed24e3ab00837979d3a4be898373216ce7ad2be5032ceb603475316425b39509eeeed29dadc4cc938fb8adc1a155db47455679f96276391a61175c48a746ba41d93d9749a0edd5540ee70aeaca0ccd39b0d783a0ef03658f8d458baa419a7b3b2272d7d91f28674be7c32a555d5748e4af70ee04815b20d8e367cbe0caf409decdd7a37fd61374294f2d82ea12878e7978e071323f6610e95139104da924d8fbffeab4fff7d7b98c547ba7876c4cee5bca7ae375f79ae7538332a8c6fb6bb76e49ea463456b925a3b6e9d7ef9b2ecfce5afef1e7f7ffffae3fe9c7fcf0ff7c23f1eb9f7e77979f9f2daa125fd6e1f88e1a0e39334ab7c47eb5a0c3bb237df90f9d3a75f3e3e1364e8b7d7381ff7fcfae5cdcbf89b7ffcb7fcf07ee7eba7cffffbf77bb8e0f1dbbb3f0e96be054bdf0996367c0596bf056b7f28ac7c0bb6fe5058fd16ecfe4361ed5bb0f3bd60977c05d6bf019bfa87c2c6b760f30f855ddf82fd6e67fb55d8fc16ec773b5b8dafc0d63760cbff50d8fe16ec77ebdbafc2ee6fc0f6771347fc9a26cfb760bf5b037d15f67c0bf6bb69f2d76015be05db8fdffe75fefe3ee26b6d645456b59aa377ef6c44769c24573b543abee5002ad7388b2c4bf3544baa107efcf6db7f060000ffff40acd52957190000',
          },
        },
      ],
    });

    const balances = await assetsContract.getBalancesInSingleCall(
      ERC20_SAI_ADDRESS,
      [ERC20_SAI_ADDRESS],
    );
    expect(balances[ERC20_SAI_ADDRESS]).toBeDefined();

    await network.setActiveNetwork(NetworkType.sepolia);

    const noBalances = await assetsContract.getBalancesInSingleCall(
      ERC20_SAI_ADDRESS,
      [ERC20_SAI_ADDRESS],
    );
    expect(noBalances).toStrictEqual({});
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should throw missing provider error when transferring single ERC-1155 when missing provider', async () => {
    const { assetsContract, messenger } = await setupAssetContractControllers();
    assetsContract.provider = undefined;
    await expect(
      assetsContract.transferSingleERC1155(
        ERC1155_ADDRESS,
        TEST_ACCOUNT_PUBLIC_ADDRESS,
        TEST_ACCOUNT_PUBLIC_ADDRESS,
        ERC1155_ID,
        '1',
      ),
    ).rejects.toThrow(MISSING_PROVIDER_ERROR);
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should throw when ERC1155 function transferSingle is not defined', async () => {
    const { assetsContract, messenger, provider, networkClientConfiguration } =
      await setupAssetContractControllers();
    assetsContract.provider = provider;
    mockNetworkWithDefaultChainId({
      networkClientConfiguration,
      mocks: [
        {
          request: {
            method: 'eth_call',
            params: [
              {
                to: ERC1155_ADDRESS,
                data: '0x00fdd58e0000000000000000000000005a3ca5cd63807ce5e4d7841ab32ce6b6d9bbba2d5a3ca5cd63807ce5e4d7841ab32ce6b6d9bbba2d000000000000010000000001',
              },
              'latest',
            ],
          },
          response: {
            result:
              '0x0000000000000000000000000000000000000000000000000000000000000001',
          },
        },
      ],
    });
    await expect(
      assetsContract.transferSingleERC1155(
        ERC1155_ADDRESS,
        '0x0',
        TEST_ACCOUNT_PUBLIC_ADDRESS,
        ERC1155_ID,
        '1',
      ),
    ).rejects.toThrow('contract.transferSingle is not a function');
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should get the balance of a ERC-1155 NFT for a given address', async () => {
    const { assetsContract, messenger, provider, networkClientConfiguration } =
      await setupAssetContractControllers();
    assetsContract.provider = provider;
    mockNetworkWithDefaultChainId({
      networkClientConfiguration,
      mocks: [
        {
          request: {
            method: 'eth_call',
            params: [
              {
                to: ERC1155_ADDRESS,
                data: '0x00fdd58e0000000000000000000000005a3ca5cd63807ce5e4d7841ab32ce6b6d9bbba2d5a3ca5cd63807ce5e4d7841ab32ce6b6d9bbba2d000000000000010000000001',
              },
              'latest',
            ],
          },
          response: {
            result:
              '0x0000000000000000000000000000000000000000000000000000000000000001',
          },
        },
      ],
    });
    const balance = await assetsContract.getERC1155BalanceOf(
      TEST_ACCOUNT_PUBLIC_ADDRESS,
      ERC1155_ADDRESS,
      ERC1155_ID,
    );
    expect(Number(balance)).toBeGreaterThan(0);
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should throw missing provider error when getting the balance of a ERC-1155 NFT when missing provider', async () => {
    const { assetsContract, messenger } = await setupAssetContractControllers();
    await expect(
      assetsContract.getERC1155BalanceOf(
        TEST_ACCOUNT_PUBLIC_ADDRESS,
        ERC1155_ADDRESS,
        ERC1155_ID,
      ),
    ).rejects.toThrow(MISSING_PROVIDER_ERROR);
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should get the URI of a ERC-1155 NFT', async () => {
    const { assetsContract, messenger, provider, networkClientConfiguration } =
      await setupAssetContractControllers();
    assetsContract.provider = provider;
    mockNetworkWithDefaultChainId({
      networkClientConfiguration,
      mocks: [
        {
          request: {
            method: 'eth_call',
            params: [
              {
                to: ERC1155_ADDRESS,
                data: '0x0e89341c5a3ca5cd63807ce5e4d7841ab32ce6b6d9bbba2d000000000000010000000001',
              },
              'latest',
            ],
          },
          response: {
            result:
              '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000005868747470733a2f2f6170692e6f70656e7365612e696f2f6170692f76312f6d657461646174612f3078343935663934373237363734394365363436663638414338633234383432303034356362376235652f30787b69647d0000000000000000',
          },
        },
      ],
    });
    const expectedUri = `https://api.opensea.io/api/v1/metadata/${ERC1155_ADDRESS}/0x{id}`;
    const uri = await assetsContract.getERC1155TokenURI(
      ERC1155_ADDRESS,
      ERC1155_ID,
    );
    expect(uri.toLowerCase()).toStrictEqual(expectedUri);
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });
});
