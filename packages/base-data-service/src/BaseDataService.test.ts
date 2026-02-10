import { Messenger } from '@metamask/messenger';
import { BaseDataService } from './BaseDataService';

const serviceName = 'ExampleDataService';

type ExampleMessenger = Messenger<typeof serviceName, any, any>;

class ExampleDataService extends BaseDataService<
  typeof serviceName,
  ExampleMessenger
> {
  #baseUrl = 'https://accounts.api.cx.metamask.io';

  constructor(messenger: ExampleMessenger) {
    super({
      name: serviceName,
      messenger,
    });

    messenger.registerActionHandler(
      `${this.name}:getActivity`,
      // @ts-expect-error TODO.
      this.getActivity.bind(this),
    );
  }

  async getActivity(address: string) {
    return this.fetchInfiniteQuery({
      queryKey: [`${this.name}:getActivity`, address],
      queryFn: async ({ pageParam }) => {
        const caipAddress = `eip155:0:${address.toLowerCase()}`;
        const url = new URL(
          `${this.#baseUrl}/v4/multiaccount/transactions?limit=10&accountAddresses=${caipAddress}`,
        );

        if (pageParam) {
          url.searchParams.set('cursor', pageParam);
        }

        const response = await fetch(url);

        return response.json();
      },
      getNextPageParam: ({ pageInfo }: { pageInfo: any }) =>
        pageInfo.hasNextPage ? pageInfo.endCursor : undefined,
    });
  }
}

describe('BaseDataService', () => {
  it('works', async () => {
    const messenger = new Messenger({ namespace: serviceName });
    const service = new ExampleDataService(messenger);

    expect(
      await service.getActivity('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'),
    ).toBe({});
  });
});
