import { Messenger } from '@metamask/messenger';

import { ExampleDataService, serviceName } from '../tests/ExampleDataService';
import { mockAssets, mockTransactions } from '../tests/mocks';

describe('BaseDataService', () => {
  beforeEach(() => {
    mockAssets();
    mockTransactions();
  });

  it('handles basic queries', async () => {
    const messenger = new Messenger({ namespace: serviceName });
    const service = new ExampleDataService(messenger);

    expect(
      await service.getAssets([
        'eip155:1/slip44:60',
        'bip122:000000000019d6689c085ae165831e93/slip44:0',
        'eip155:1/erc20:0x6b175474e89094c44da98b954eedeac495271d0f',
      ]),
    ).toStrictEqual([
      {
        assetId: 'eip155:1/erc20:0x6b175474e89094c44da98b954eedeac495271d0f',
        decimals: 18,
        name: 'Dai Stablecoin',
        symbol: 'DAI',
      },
      {
        assetId: 'bip122:000000000019d6689c085ae165831e93/slip44:0',
        decimals: 8,
        name: 'Bitcoin',
        symbol: 'BTC',
      },
      {
        assetId: 'eip155:1/slip44:60',
        decimals: 18,
        name: 'Ethereum',
        symbol: 'ETH',
      },
    ]);
  });

  it('handles paginated queries', async () => {
    const messenger = new Messenger({ namespace: serviceName });
    const service = new ExampleDataService(messenger);

    const page1 = await service.getActivity(
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    );

    // expect(page1.data).toStrictEqual([]);

    const page2 = await service.getActivity(
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      page1.pageInfo.endCursor,
    );

    expect(page2.data).not.toStrictEqual(page1.data);
  });
});
