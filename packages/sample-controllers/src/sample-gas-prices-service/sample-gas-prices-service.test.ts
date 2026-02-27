import {
  DEFAULT_DEGRADED_THRESHOLD,
  HttpError,
} from '@metamask/controller-utils';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import nock from 'nock';

import type { SampleGasPricesServiceMessenger } from './sample-gas-prices-service';
import { SampleGasPricesService } from './sample-gas-prices-service';

describe('SampleGasPricesService', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('SampleGasPricesService:fetchGasPrices', () => {
    it('returns the low, average, and high gas prices from the API', async () => {
      nock('https://api.example.com')
        .get('/gas-prices')
        .query({ chainId: 'eip155:1' })
        .reply(200, {
          data: {
            low: 5,
            average: 10,
            high: 15,
          },
        });
      const { rootMessenger } = getService();

      const gasPricesResponse = await rootMessenger.call(
        'SampleGasPricesService:fetchGasPrices',
        '0x1',
      );

      expect(gasPricesResponse).toStrictEqual({
        low: 5,
        average: 10,
        high: 15,
      });
    });

    it.each([
      'not an object',
      { missing: 'data' },
      { data: 'not an object' },
      { data: { missing: 'low', average: 2, high: 3 } },
      { data: { low: 1, missing: 'average', high: 3 } },
      { data: { low: 1, average: 2, missing: 'high' } },
      { data: { low: 'not a number', average: 2, high: 3 } },
      { data: { low: 1, average: 'not a number', high: 3 } },
      { data: { low: 1, average: 2, high: 'not a number' } },
    ])(
      'throws if the API returns a malformed response %o',
      async (response) => {
        nock('https://api.example.com')
          .get('/gas-prices')
          .query({ chainId: 'eip155:1' })
          .reply(200, JSON.stringify(response));
        const { rootMessenger } = getService();

        await expect(
          rootMessenger.call('SampleGasPricesService:fetchGasPrices', '0x1'),
        ).rejects.toThrow('Malformed response received from gas prices API');
      },
    );

    it('calls onDegraded listeners if the request responds with 2xx but takes longer than the degraded threshold to complete', async () => {
      nock('https://api.example.com')
        .get('/gas-prices')
        .query({ chainId: 'eip155:1' })
        .reply(200, () => {
          jest.advanceTimersByTime(DEFAULT_DEGRADED_THRESHOLD + 1);
          return {
            data: {
              low: 5,
              average: 10,
              high: 15,
            },
          };
        });
      const { service, rootMessenger } = getService();
      const onDegradedListener = jest.fn();
      service.onDegraded(onDegradedListener);

      await rootMessenger.call('SampleGasPricesService:fetchGasPrices', '0x1');

      expect(onDegradedListener).toHaveBeenCalled();
    });

    it('throws if the request responds with non-200, even after the maximum number of retries is reached', async () => {
      nock('https://api.example.com')
        .get('/gas-prices')
        .query({ chainId: 'eip155:1' })
        .times(4)
        .reply(500);
      const { service, rootMessenger } = getService();
      service.onRetry(() => {
        jest.advanceTimersToNextTimer();
      });

      await expect(
        rootMessenger.call('SampleGasPricesService:fetchGasPrices', '0x1'),
      ).rejects.toThrow(
        "Fetching 'https://api.example.com/gas-prices?chainId=eip155%3A1' failed with status '500'",
      );
    });

    it('calls onDegraded listeners if the request responds with non-200, even after the maximum number of retries is reached', async () => {
      nock('https://api.example.com')
        .get('/gas-prices')
        .query({ chainId: 'eip155:1' })
        .times(4)
        .reply(500);
      const { service, rootMessenger } = getService();
      service.onRetry(() => {
        jest.advanceTimersToNextTimer();
      });
      const onDegradedListener = jest.fn();
      service.onDegraded(onDegradedListener);

      await expect(
        rootMessenger.call('SampleGasPricesService:fetchGasPrices', '0x1'),
      ).rejects.toThrow(
        "Fetching 'https://api.example.com/gas-prices?chainId=eip155%3A1' failed with status '500'",
      );
      expect(onDegradedListener).toHaveBeenCalled();
    });

    it('calls onBreak listeners upon reaching the maximum number of consecutive non-200 responses', async () => {
      nock('https://api.example.com')
        .get('/gas-prices')
        .query({ chainId: 'eip155:1' })
        .times(12)
        .reply(500);
      const { service, rootMessenger } = getService();
      service.onRetry(() => {
        jest.advanceTimersToNextTimer();
      });
      const onBreakListener = jest.fn();
      service.onBreak(onBreakListener);

      // Attempt a request, reach the maximum number of retries
      await expect(
        rootMessenger.call('SampleGasPricesService:fetchGasPrices', '0x1'),
      ).rejects.toThrow(
        "Fetching 'https://api.example.com/gas-prices?chainId=eip155%3A1' failed with status '500'",
      );
      // Attempt a request, reach the maximum number of retries
      await expect(
        rootMessenger.call('SampleGasPricesService:fetchGasPrices', '0x1'),
      ).rejects.toThrow(
        "Fetching 'https://api.example.com/gas-prices?chainId=eip155%3A1' failed with status '500'",
      );
      // Attempt a request, reach the maximum number of retries, break the circuit
      await expect(
        rootMessenger.call('SampleGasPricesService:fetchGasPrices', '0x1'),
      ).rejects.toThrow(
        "Fetching 'https://api.example.com/gas-prices?chainId=eip155%3A1' failed with status '500'",
      );
      expect(onBreakListener).toHaveBeenCalledWith({
        error: new HttpError(
          500,
          "Fetching 'https://api.example.com/gas-prices?chainId=eip155%3A1' failed with status '500'",
        ),
      });
    });

    it('throws a circuit break error while the circuit is open and resumes requests after the circuit break duration passes', async () => {
      const circuitBreakDuration = 5_000;
      nock('https://api.example.com')
        .get('/gas-prices')
        .query({ chainId: 'eip155:1' })
        .times(12)
        .reply(500)
        .get('/gas-prices')
        .query({ chainId: 'eip155:1' })
        .reply(200, {
          data: {
            low: 5,
            average: 10,
            high: 15,
          },
        });
      const { service, rootMessenger } = getService({
        options: {
          policyOptions: { circuitBreakDuration },
        },
      });
      service.onRetry(() => {
        jest.advanceTimersToNextTimer();
      });

      // Attempt a request, reach the maximum number of retries
      await expect(
        rootMessenger.call('SampleGasPricesService:fetchGasPrices', '0x1'),
      ).rejects.toThrow(
        "Fetching 'https://api.example.com/gas-prices?chainId=eip155%3A1' failed with status '500'",
      );
      // Attempt a request, reach the maximum number of retries
      await expect(
        rootMessenger.call('SampleGasPricesService:fetchGasPrices', '0x1'),
      ).rejects.toThrow(
        "Fetching 'https://api.example.com/gas-prices?chainId=eip155%3A1' failed with status '500'",
      );
      // Attempt a request, reach the maximum number of retries, break the circuit
      await expect(
        rootMessenger.call('SampleGasPricesService:fetchGasPrices', '0x1'),
      ).rejects.toThrow(
        "Fetching 'https://api.example.com/gas-prices?chainId=eip155%3A1' failed with status '500'",
      );
      await expect(
        rootMessenger.call('SampleGasPricesService:fetchGasPrices', '0x1'),
      ).rejects.toThrow(
        'Execution prevented because the circuit breaker is open',
      );
      jest.advanceTimersByTime(circuitBreakDuration);
      const gasPricesResponse = await service.fetchGasPrices('0x1');
      expect(gasPricesResponse).toStrictEqual({
        low: 5,
        average: 10,
        high: 15,
      });
    });

    it('allows the degraded threshold to be changed', async () => {
      const degradedThreshold = 500;
      nock('https://api.example.com')
        .get('/gas-prices')
        .query({ chainId: 'eip155:1' })
        .reply(200, () => {
          jest.advanceTimersByTime(degradedThreshold + 1);
          return {
            data: {
              low: 5,
              average: 10,
              high: 15,
            },
          };
        });
      const { service, rootMessenger } = getService({
        options: {
          policyOptions: {
            degradedThreshold,
          },
        },
      });
      const onDegradedListener = jest.fn();
      service.onDegraded(onDegradedListener);

      await rootMessenger.call('SampleGasPricesService:fetchGasPrices', '0x1');

      expect(onDegradedListener).toHaveBeenCalled();
    });

    it('allows the maximum number of retries and consecutive failures to be changed', async () => {
      const maxRetries = 2;
      const maxConsecutiveFailures = 6;
      nock('https://api.example.com')
        .get('/gas-prices')
        .query({ chainId: 'eip155:1' })
        .times(maxConsecutiveFailures)
        .reply(500);
      const { service, rootMessenger } = getService({
        options: {
          policyOptions: {
            maxRetries,
            maxConsecutiveFailures,
          },
        },
      });
      service.onRetry(() => {
        jest.advanceTimersToNextTimer();
      });
      const onBreakListener = jest.fn();
      service.onBreak(onBreakListener);

      // Attempt a request, reach the maximum number of retries
      await expect(
        rootMessenger.call('SampleGasPricesService:fetchGasPrices', '0x1'),
      ).rejects.toThrow(
        "Fetching 'https://api.example.com/gas-prices?chainId=eip155%3A1' failed with status '500'",
      );
      // Attempt a request, reach the maximum number of retries, break the circuit
      await expect(
        rootMessenger.call('SampleGasPricesService:fetchGasPrices', '0x1'),
      ).rejects.toThrow(
        "Fetching 'https://api.example.com/gas-prices?chainId=eip155%3A1' failed with status '500'",
      );
      expect(onBreakListener).toHaveBeenCalledWith({
        error: new HttpError(
          500,
          "Fetching 'https://api.example.com/gas-prices?chainId=eip155%3A1' failed with status '500'",
        ),
      });
    });
  });

  describe('fetchGasPrices', () => {
    it('does the same thing as the messenger action', async () => {
      nock('https://api.example.com')
        .get('/gas-prices')
        .query({ chainId: 'eip155:1' })
        .reply(200, {
          data: {
            low: 5,
            average: 10,
            high: 15,
          },
        });
      const { service } = getService();

      const gasPricesResponse = await service.fetchGasPrices('0x1');

      expect(gasPricesResponse).toStrictEqual({
        low: 5,
        average: 10,
        high: 15,
      });
    });
  });
});

/**
 * The type of the messenger populated with all external actions and events
 * required by the service under test.
 */
type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<SampleGasPricesServiceMessenger>,
  MessengerEvents<SampleGasPricesServiceMessenger>
>;

/**
 * Constructs the messenger populated with all external actions and events
 * required by the service under test.
 *
 * @returns The root messenger.
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

/**
 * Constructs the messenger for the service under test.
 *
 * @param rootMessenger - The root messenger, with all external actions and
 * events required by the controller's messenger.
 * @returns The service-specific messenger.
 */
function getMessenger(
  rootMessenger: RootMessenger,
): SampleGasPricesServiceMessenger {
  return new Messenger({
    namespace: 'SampleGasPricesService',
    parent: rootMessenger,
  });
}

/**
 * Constructs the service under test.
 *
 * @param args - The arguments to this function.
 * @param args.options - The options that the service constructor takes. All are
 * optional and will be filled in with defaults in as needed (including
 * `messenger`).
 * @returns The new service, root messenger, and service messenger.
 */
function getService({
  options = {},
}: {
  options?: Partial<ConstructorParameters<typeof SampleGasPricesService>[0]>;
} = {}): {
  service: SampleGasPricesService;
  rootMessenger: RootMessenger;
  messenger: SampleGasPricesServiceMessenger;
} {
  const rootMessenger = getRootMessenger();
  const messenger = getMessenger(rootMessenger);
  const service = new SampleGasPricesService({
    fetch,
    messenger,
    ...options,
  });

  return { service, rootMessenger, messenger };
}
