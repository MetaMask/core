import { Messenger } from '@metamask/messenger';
import { ConstantBackoff } from 'cockatiel';

import {
  BaseDataService,
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
} from './BaseDataService.js';

/**
 * These tests exercise `fetchInfiniteQuery` in isolation, using an in-memory
 * paginator instead of HTTP mocks. The point is to pin down the pagination
 * behaviour that has to stay identical to query-core v4: fetching an arbitrary
 * page by explicit page param, in both directions, whether or not the consumer
 * provides `getNextPageParam` / `getPreviousPageParam`.
 */

const serviceName = 'PaginatedService';

// A cursor encodes the offset of a page's first item.
type Cursor = string;
type PageParam = { after?: Cursor; before?: Cursor };

type Page = {
  data: string[];
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: Cursor | null;
    endCursor: Cursor | null;
  };
};

const PAGE_SIZE = 3;
// 9 items => three pages: [item-0..2], [item-3..5], [item-6..8].
const DATASET = Array.from({ length: 9 }, (_, index) => `item-${index}`);

/**
 * Serve a single page from the in-memory dataset.
 *
 * @param pageParam - The requested page. `undefined` or an `after`/`before`
 * cursor. `after` fetches the page starting at the cursor offset; `before`
 * fetches the page ending just before the cursor offset.
 * @returns The requested page with cursor metadata.
 */
function fetchPage(pageParam?: PageParam): Page {
  let offset = 0;
  if (pageParam?.after !== undefined) {
    offset = Number(pageParam.after);
  } else if (pageParam?.before !== undefined) {
    offset = Number(pageParam.before) - PAGE_SIZE;
  }

  const data = DATASET.slice(offset, offset + PAGE_SIZE);
  const hasNextPage = offset + PAGE_SIZE < DATASET.length;
  const hasPreviousPage = offset > 0;

  return {
    data,
    pageInfo: {
      hasNextPage,
      hasPreviousPage,
      startCursor: hasPreviousPage ? String(offset) : null,
      endCursor: hasNextPage ? String(offset + PAGE_SIZE) : null,
    },
  };
}

type PaginatedServiceActions = DataServiceInvalidateQueriesAction<
  typeof serviceName
>;
type PaginatedServiceEvents =
  | DataServiceCacheUpdatedEvent<typeof serviceName>
  | DataServiceGranularCacheUpdatedEvent<typeof serviceName>;
type PaginatedServiceMessenger = Messenger<
  typeof serviceName,
  PaginatedServiceActions,
  PaginatedServiceEvents
>;

class PaginatedService extends BaseDataService<
  typeof serviceName,
  PaginatedServiceMessenger
> {
  // Records every page param the query function is actually invoked with.
  readonly queryFnCalls: (PageParam | undefined)[] = [];

  constructor(
    messenger: PaginatedServiceMessenger,
    { staleTime = Infinity }: { staleTime?: number } = {},
  ) {
    super({
      name: serviceName,
      messenger,
      policyOptions: { maxRetries: 0, backoff: new ConstantBackoff(0) },
    });
    this.#staleTime = staleTime;
  }

  readonly #staleTime: number;

  /**
   * Paginate using page-param callbacks, the way a well-behaved consumer would.
   *
   * @param pageParam - The page to fetch.
   * @returns The requested page.
   */
  async withCallbacks(pageParam?: PageParam): Promise<Page> {
    return this.fetchInfiniteQuery<Page, unknown, Page, [string], PageParam>(
      {
        queryKey: [`${this.name}:withCallbacks`],
        queryFn: async ({ pageParam: param }) => {
          this.queryFnCalls.push(param);
          return fetchPage(param);
        },
        getNextPageParam: (lastPage) =>
          lastPage.pageInfo.hasNextPage && lastPage.pageInfo.endCursor
            ? { after: lastPage.pageInfo.endCursor }
            : undefined,
        getPreviousPageParam: (firstPage) =>
          firstPage.pageInfo.hasPreviousPage && firstPage.pageInfo.startCursor
            ? { before: firstPage.pageInfo.startCursor }
            : undefined,
        staleTime: this.#staleTime,
      },
      pageParam,
    );
  }

  /**
   * Paginate without any page-param callbacks, relying purely on the explicit
   * page param passed to the base method (the `MoneyAccountApiDataService`
   * shape).
   *
   * @param pageParam - The page to fetch.
   * @returns The requested page.
   */
  async withoutCallbacks(pageParam?: PageParam): Promise<Page> {
    return this.fetchInfiniteQuery<Page, unknown, Page, [string], PageParam>(
      {
        queryKey: [`${this.name}:withoutCallbacks`],
        queryFn: async ({ pageParam: param }) => {
          this.queryFnCalls.push(param);
          return fetchPage(param);
        },
        staleTime: this.#staleTime,
      },
      pageParam,
    );
  }
}

describe('BaseDataService: fetchInfiniteQuery', () => {
  let service: PaginatedService;

  const createService = (options?: {
    staleTime?: number;
  }): PaginatedService => {
    const messenger = new Messenger({ namespace: serviceName });
    service = new PaginatedService(messenger, options);
    return service;
  };

  afterEach(() => {
    service?.destroy();
  });

  describe('with page-param callbacks', () => {
    it('returns the first page on a cold fetch', async () => {
      createService();

      const page = await service.withCallbacks();

      expect(page.data).toStrictEqual(['item-0', 'item-1', 'item-2']);
      expect(page.pageInfo.hasPreviousPage).toBe(false);
    });

    it('jumps directly to a page by cursor on a cold cache', async () => {
      createService();

      const page = await service.withCallbacks({ after: '6' });

      expect(page.data).toStrictEqual(['item-6', 'item-7', 'item-8']);
    });

    it('paginates forward across every page', async () => {
      createService();

      const page1 = await service.withCallbacks();
      const page2 = await service.withCallbacks({
        after: page1.pageInfo.endCursor as string,
      });
      const page3 = await service.withCallbacks({
        after: page2.pageInfo.endCursor as string,
      });

      expect(page1.data).toStrictEqual(['item-0', 'item-1', 'item-2']);
      expect(page2.data).toStrictEqual(['item-3', 'item-4', 'item-5']);
      expect(page3.data).toStrictEqual(['item-6', 'item-7', 'item-8']);
    });

    it('paginates backward to the previous page', async () => {
      createService();

      // Start in the middle so there is a previous page to go back to.
      const middle = await service.withCallbacks({ after: '3' });
      expect(middle.data).toStrictEqual(['item-3', 'item-4', 'item-5']);

      const previous = await service.withCallbacks({
        before: middle.pageInfo.startCursor as string,
      });

      expect(previous.data).toStrictEqual(['item-0', 'item-1', 'item-2']);
    });

    it('returns only the requested page, not the accumulated data', async () => {
      createService();

      await service.withCallbacks();
      await service.withCallbacks({ after: '3' });
      const page3 = await service.withCallbacks({ after: '6' });

      expect(page3.data).toHaveLength(PAGE_SIZE);
      expect(page3.data).toStrictEqual(['item-6', 'item-7', 'item-8']);
    });

    it('does not refetch a fresh cached page', async () => {
      createService({ staleTime: Infinity });

      await service.withCallbacks();
      await service.withCallbacks();

      expect(service.queryFnCalls).toHaveLength(1);
    });

    it('keeps navigation correct after refetching stale pages', async () => {
      createService({ staleTime: 0 });

      await service.withCallbacks();
      await service.withCallbacks({ after: '3' });
      await service.withCallbacks({ after: '6' });

      // A param-less call is stale, so query-core rebuilds all cached pages.
      // This exercises the full-rebuild path, which must use the consumer's
      // page-param callbacks and not any resolvers injected while paging.
      const rebuilt = await service.withCallbacks();
      expect(rebuilt.data).toStrictEqual(['item-0', 'item-1', 'item-2']);

      const page2Again = await service.withCallbacks({ after: '3' });
      expect(page2Again.data).toStrictEqual(['item-3', 'item-4', 'item-5']);
    });
  });

  describe('without page-param callbacks', () => {
    it('fetches an arbitrary page by explicit cursor (forward)', async () => {
      createService();

      const page1 = await service.withoutCallbacks();
      expect(page1.data).toStrictEqual(['item-0', 'item-1', 'item-2']);

      const page2 = await service.withoutCallbacks({ after: '3' });
      expect(page2.data).toStrictEqual(['item-3', 'item-4', 'item-5']);
    });

    it('fetches the correct page content for a `before` cursor', async () => {
      createService();

      // Cold jump into the middle, then ask for the page before it.
      const middle = await service.withoutCallbacks({ after: '3' });
      expect(middle.data).toStrictEqual(['item-3', 'item-4', 'item-5']);

      const previous = await service.withoutCallbacks({ before: '3' });
      expect(previous.data).toStrictEqual(['item-0', 'item-1', 'item-2']);
    });

    it('refetches stale multi-page state without page-param callbacks', async () => {
      createService({ staleTime: 0 });

      await service.withoutCallbacks();
      await service.withoutCallbacks({ after: '3' });
      await service.withoutCallbacks({ after: '6' });

      // Stale, so query-core rebuilds every cached page by walking forward from
      // the first one. With no consumer `getNextPageParam`, that walk must not
      // throw (the base service supplies a no-op resolver).
      const rebuilt = await service.withoutCallbacks();
      expect(rebuilt.data).toStrictEqual(['item-0', 'item-1', 'item-2']);

      // Navigation still works after the rebuild.
      const page2Again = await service.withoutCallbacks({ after: '3' });
      expect(page2Again.data).toStrictEqual(['item-3', 'item-4', 'item-5']);
    });
  });
});
