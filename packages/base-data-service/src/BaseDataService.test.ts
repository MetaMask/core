import { Messenger } from '@metamask/messenger';

import { ExampleDataService, serviceName } from '../tests/ExampleDataService';
import {
  mockAssets,
  mockTransactionsPage1,
  mockTransactionsPage2,
} from '../tests/mocks';

const TEST_ADDRESS = '0x4bbeEB066eD09B7AEd07bF39EEe0460DFa261520';

describe('BaseDataService', () => {
  beforeEach(() => {
    mockAssets();
    mockTransactionsPage1();
    mockTransactionsPage2();
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

    const page1 = await service.getActivity(TEST_ADDRESS);

    expect(page1.data).toHaveLength(3);

    const page2 = await service.getActivity(
      TEST_ADDRESS,
      page1.pageInfo.endCursor,
    );

    expect(page2.data).toHaveLength(3);

    expect(page2.data).not.toStrictEqual(page1.data);
  });
});
