import { BigNumber } from '@ethersproject/bignumber';
import { BUILT_IN_NETWORKS } from '@metamask/controller-utils';
import { NetworkClientType } from '@metamask/network-controller';

import {
  setupAssetContractControllers,
  mockNetworkWithDefaultChainId,
} from './AssetsContractController.test';
import { SECONDS } from '../../../tests/constants';

const ERC20_UNI_ADDRESS = '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984';
const ERC20_SAI_ADDRESS = '0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359';
const ERC20_DAI_ADDRESS = '0x6b175474e89094c44da98b954eedeac495271d0f';
const ERC721_GODS_ADDRESS = '0x6ebeaf8e8e946f0716e6533a6f2cefc83f60e8ab';
const ERC1155_ADDRESS = '0x495f947276749ce646f68ac8c248420045cb7b5e';
const ERC1155_ID =
  '40815311521795738946686668571398122012172359753720345430028676522525371400193';

const TEST_ACCOUNT_PUBLIC_ADDRESS =
  '0x5a3CA5cD63807Ce5e4d7841AB32Ce6B6d9BbBa2D';

describe('AssetsContractController with NetworkClientId', () => {
  it('should throw when getting ERC-20 token balance when networkClientId is invalid', async () => {
    const { messenger } = await setupAssetContractControllers();
    await expect(
      async () =>
        await messenger.call(
          `AssetsContractController:getERC20BalanceOf`,
          ERC20_UNI_ADDRESS,
          TEST_ACCOUNT_PUBLIC_ADDRESS,
          'invalidNetworkClientId',
        ),
    ).rejects.toThrow(
      `No custom network client was found with the ID "invalidNetworkClientId".`,
    );
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should throw when getting ERC-20 token decimal when networkClientId is invalid', async () => {
    const { messenger } = await setupAssetContractControllers();
    await expect(
      async () =>
        await messenger.call(
          `AssetsContractController:getERC20TokenDecimals`,
          ERC20_UNI_ADDRESS,
          'invalidNetworkClientId',
        ),
    ).rejects.toThrow(
      `No custom network client was found with the ID "invalidNetworkClientId".`,
    );
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should get balance of ERC-20 token contract correctly', async () => {
    const { messenger, networkClientConfiguration } =
      await setupAssetContractControllers();
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
    const UNIBalance = await messenger.call(
      `AssetsContractController:getERC20BalanceOf`,
      ERC20_UNI_ADDRESS,
      TEST_ACCOUNT_PUBLIC_ADDRESS,
      'mainnet',
    );
    const UNINoBalance = await messenger.call(
      `AssetsContractController:getERC20BalanceOf`,
      ERC20_UNI_ADDRESS,
      '0x202637dAAEfbd7f131f90338a4A6c69F6Cd5CE91',
      'mainnet',
    );
    expect(UNIBalance.toString(16)).not.toBe('0');
    expect(UNINoBalance.toString(16)).toBe('0');
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should get ERC-721 NFT tokenId correctly', async () => {
    const { messenger, networkClientConfiguration } =
      await setupAssetContractControllers();
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
    const tokenId = await messenger.call(
      `AssetsContractController:getERC721NftTokenId`,
      ERC721_GODS_ADDRESS,
      '0x9a90bd8d1149a88b42a99cf62215ad955d6f498a',
      0,
      'mainnet',
    );
    expect(tokenId).not.toBe(0);
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should throw error when getting ERC-721 token standard and details when networkClientId is invalid', async () => {
    const { messenger } = await setupAssetContractControllers();
    await expect(
      async () =>
        await messenger.call(
          `AssetsContractController:getTokenStandardAndDetails`,
          ERC20_UNI_ADDRESS,
          TEST_ACCOUNT_PUBLIC_ADDRESS,
          undefined,
          'invalidNetworkClientId',
        ),
    ).rejects.toThrow('No custom network client was found');
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should throw contract standard error when getting ERC-20 token standard and details when provided with invalid ERC-20 address', async () => {
    const { messenger } = await setupAssetContractControllers();
    const error = 'Unable to determine contract standard';
    await expect(
      async () =>
        await messenger.call(
          `AssetsContractController:getTokenStandardAndDetails`,
          'BaDeRc20AdDrEsS',
          TEST_ACCOUNT_PUBLIC_ADDRESS,
          undefined,
          'mainnet',
        ),
    ).rejects.toThrow(error);
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should get ERC-721 token standard and details', async () => {
    const { messenger, networkClientConfiguration } =
      await setupAssetContractControllers();
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
    const standardAndDetails = await messenger.call(
      `AssetsContractController:getTokenStandardAndDetails`,
      ERC721_GODS_ADDRESS,
      TEST_ACCOUNT_PUBLIC_ADDRESS,
      undefined,
      'mainnet',
    );
    expect(standardAndDetails.standard).toBe('ERC721');
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it(
    'should get ERC-1155 token standard and details',
    async () => {
      const { messenger, networkClientConfiguration } =
        await setupAssetContractControllers();
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
      const standardAndDetails = await messenger.call(
        `AssetsContractController:getTokenStandardAndDetails`,
        ERC1155_ADDRESS,
        TEST_ACCOUNT_PUBLIC_ADDRESS,
        undefined,
        'mainnet',
      );
      expect(standardAndDetails.standard).toBe('ERC1155');
      messenger.clearEventSubscriptions('NetworkController:networkDidChange');
    },
    10 * SECONDS,
  );

  it(
    'should get ERC-20 token standard and details',
    async () => {
      const { messenger, networkClientConfiguration } =
        await setupAssetContractControllers();
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
      const standardAndDetails = await messenger.call(
        `AssetsContractController:getTokenStandardAndDetails`,
        ERC20_UNI_ADDRESS,
        TEST_ACCOUNT_PUBLIC_ADDRESS,
        undefined,
        'mainnet',
      );
      expect(standardAndDetails.standard).toBe('ERC20');
      messenger.clearEventSubscriptions('NetworkController:networkDidChange');
    },
    10 * SECONDS,
  );

  it('should get ERC-721 NFT tokenURI correctly', async () => {
    const { messenger, networkClientConfiguration } =
      await setupAssetContractControllers();
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
    const tokenId = await messenger.call(
      `AssetsContractController:getERC721TokenURI`,
      ERC721_GODS_ADDRESS,
      '0',
      'mainnet',
    );
    expect(tokenId).toBe('https://api.godsunchained.com/card/0');
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should not throw an error when address given is does not support NFT Metadata interface', async () => {
    const { messenger, networkClientConfiguration } =
      await setupAssetContractControllers();
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
    const errorLogSpy = jest
      .spyOn(console, 'error')
      .mockImplementationOnce(() => {
        /**/
      });
    const uri = await messenger.call(
      `AssetsContractController:getERC721TokenURI`,
      '0x0000000000000000000000000000000000000000',
      '0',
      'mainnet',
    );
    expect(uri).toBe('https://api.godsunchained.com/card/0');
    expect(errorLogSpy).toHaveBeenCalledTimes(1);
    expect(errorLogSpy.mock.calls).toContainEqual([
      'Contract does not support ERC721 metadata interface.',
    ]);
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should get ERC-721 NFT name', async () => {
    const { messenger, networkClientConfiguration } =
      await setupAssetContractControllers();
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
    const name = await messenger.call(
      `AssetsContractController:getERC721AssetName`,
      ERC721_GODS_ADDRESS,
      'mainnet',
    );
    expect(name).toBe('Gods Unchained');
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should get ERC-721 NFT symbol', async () => {
    const { messenger, networkClientConfiguration } =
      await setupAssetContractControllers();
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
    const symbol = await messenger.call(
      `AssetsContractController:getERC721AssetSymbol`,
      ERC721_GODS_ADDRESS,
      'mainnet',
    );
    expect(symbol).toBe('GODS');
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should throw error when getting ERC-721 NFT symbol when networkClientId is invalid', async () => {
    const { messenger } = await setupAssetContractControllers();
    await expect(
      async () =>
        await messenger.call(
          `AssetsContractController:getERC721AssetSymbol`,
          ERC721_GODS_ADDRESS,
          'invalidNetworkClientId',
        ),
    ).rejects.toThrow('No custom network client was found');
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should get ERC-20 token decimals', async () => {
    const { messenger, networkClientConfiguration } =
      await setupAssetContractControllers();
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
    const decimals = await messenger.call(
      `AssetsContractController:getERC20TokenDecimals`,
      ERC20_SAI_ADDRESS,
      'mainnet',
    );
    expect(Number(decimals)).toBe(18);
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should get ERC-20 token name', async () => {
    const { messenger, networkClientConfiguration } =
      await setupAssetContractControllers();
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

    const name = await messenger.call(
      `AssetsContractController:getERC20TokenName`,
      ERC20_DAI_ADDRESS,
      'mainnet',
    );

    expect(name).toBe('Dai Stablecoin');
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should get ERC-721 NFT ownership', async () => {
    const { messenger, networkClientConfiguration } =
      await setupAssetContractControllers();
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
    const tokenId = await messenger.call(
      `AssetsContractController:getERC721OwnerOf`,
      ERC721_GODS_ADDRESS,
      '148332',
      'mainnet',
    );
    expect(tokenId).not.toBe('');
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should throw error when getting ERC-721 NFT ownership using networkClientId that is invalid', async () => {
    const { messenger } = await setupAssetContractControllers();
    await expect(
      async () =>
        await messenger.call(
          `AssetsContractController:getERC721OwnerOf`,
          ERC721_GODS_ADDRESS,
          '148332',
          'invalidNetworkClientId',
        ),
    ).rejects.toThrow('No custom network client was found');
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should throw error when transferring single ERC-1155 when networkClientId is invalid', async () => {
    const { messenger } = await setupAssetContractControllers();
    await expect(
      async () =>
        await messenger.call(
          `AssetsContractController:transferSingleERC1155`,
          ERC1155_ADDRESS,
          TEST_ACCOUNT_PUBLIC_ADDRESS,
          TEST_ACCOUNT_PUBLIC_ADDRESS,
          ERC1155_ID,
          '1',
          'invalidNetworkClientId',
        ),
    ).rejects.toThrow('No custom network client was found');
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should get the balance of a ERC-1155 NFT for a given address', async () => {
    const { messenger, networkClientConfiguration } =
      await setupAssetContractControllers();
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
    const balance = await messenger.call(
      `AssetsContractController:getERC1155BalanceOf`,
      TEST_ACCOUNT_PUBLIC_ADDRESS,
      ERC1155_ADDRESS,
      ERC1155_ID,
      'mainnet',
    );
    expect(Number(balance)).toBeGreaterThan(0);
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should throw error when getting the balance of a ERC-1155 NFT when networkClientId is invalid', async () => {
    const { messenger } = await setupAssetContractControllers();
    await expect(
      async () =>
        await messenger.call(
          `AssetsContractController:getERC1155BalanceOf`,
          TEST_ACCOUNT_PUBLIC_ADDRESS,
          ERC1155_ADDRESS,
          ERC1155_ID,
          'invalidNetworkClientId',
        ),
    ).rejects.toThrow('No custom network client was found');
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should get the URI of a ERC-1155 NFT', async () => {
    const { messenger, networkClientConfiguration } =
      await setupAssetContractControllers();
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
    const uri = await messenger.call(
      `AssetsContractController:getERC1155TokenURI`,
      ERC1155_ADDRESS,
      ERC1155_ID,
      'mainnet',
    );
    expect(uri.toLowerCase()).toStrictEqual(expectedUri);
    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should get the staked ethereum balance for an address', async () => {
    const { assetsContract, messenger, provider, networkClientConfiguration } =
      await setupAssetContractControllers();
    assetsContract.setProvider(provider);

    mockNetworkWithDefaultChainId({
      networkClientConfiguration,
      mocks: [
        // getShares
        {
          request: {
            method: 'eth_call',
            params: [
              {
                to: '0xca11bde05977b3631167028862be2a173976ca11',
                data: '0xbce38bd700000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000200000000000000000000000004fef9d741011476750a243ac70b9789a63dd47df00000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000024f04da65b0000000000000000000000005a3ca5cd63807ce5e4d7841ab32ce6b6d9bbba2d00000000000000000000000000000000000000000000000000000000',
              },
              'latest',
            ],
          },
          response: {
            result:
              '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000007de0ff9d7304a', // de0b6b3a7640000
          },
        },
        // convertToAssets
        {
          request: {
            method: 'eth_call',
            params: [
              {
                to: '0xca11bde05977b3631167028862be2a173976ca11',
                data: '0xbce38bd700000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000200000000000000000000000004fef9d741011476750a243ac70b9789a63dd47df0000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000002407a2d13a0000000000000000000000000000000000000000000000000007de0ff9d7304a00000000000000000000000000000000000000000000000000000000',
              },
              'latest',
            ],
          },
          response: {
            result:
              '0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000081f495b33d2df',
          },
        },
      ],
    });

    const balance = await assetsContract.getStakedBalanceForChain(
      [TEST_ACCOUNT_PUBLIC_ADDRESS],
      'mainnet',
    );

    // Shares: 2214485034479690
    // Assets: 2286199736881887 (0.002286199736881887 ETH)

    expect(balance).toBeDefined();
    expect(balance[TEST_ACCOUNT_PUBLIC_ADDRESS]).toBe('0x081f495b33d2df');
    expect(
      BigNumber.from(balance[TEST_ACCOUNT_PUBLIC_ADDRESS]).toString(),
    ).toBe('2286199736881887');

    messenger.clearEventSubscriptions('NetworkController:networkDidChange');
  });

  it('should default staked ethereum balance to empty if network is not supported', async () => {
    const { assetsContract, provider } = await setupAssetContractControllers();
    assetsContract.setProvider(provider);

    const balance = await assetsContract.getStakedBalanceForChain(
      [TEST_ACCOUNT_PUBLIC_ADDRESS],
      'sepolia',
    );

    expect(balance).toStrictEqual({});
  });
});
