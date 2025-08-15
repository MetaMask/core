import { Messenger } from '@metamask/base-controller';
import { HttpError } from '@metamask/controller-utils';
import nock from 'nock';
import { useFakeTimers } from 'sinon';
import type { SinonFakeTimers } from 'sinon';

import type { SampleGasPricesServiceMessenger } from './sample-gas-prices-service';
import { SampleGasPricesService } from './sample-gas-prices-service';
import type {
  ExtractAvailableAction,
  ExtractAvailableEvent,
} from '../../../base-controller/tests/helpers';

describe('SampleGasPricesService', () => {
  let clock: SinonFakeTimers;

  beforeEach(() => {
    clock = useFakeTimers();
  });

  afterEach(() => {
    clock.restore();
  });

  describe('fetchGasPrices', () => {
    it('returns a slightly cleaned up version of the successful response from the API', async () => {
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
      const service = buildService();

      const gasPricesResponse = await service.fetchGasPrices('0x1');

      expect(gasPricesResponse).toStrictEqual({
        low: 5,
        average: 10,
        high: 15,
      });
    });

    it('calls onDegraded listeners if the request takes longer than 5 seconds to resolve', async () => {
      nock('https://api.example.com')
        .get('/gas-prices')
        .query({ chainId: 'eip155:1' })
        .reply(200, () => {
          clock.tick(6000);
          return {
            data: {
              low: 5,
              average: 10,
              high: 15,
            },
          };
        });
      const service = buildService();
      const onDegradedListener = jest.fn();
      service.onDegraded(onDegradedListener);

      await service.fetchGasPrices('0x1');

      expect(onDegradedListener).toHaveBeenCalled();
    });

    it('allows the degradedThreshold to be changed', async () => {
      nock('https://api.example.com')
        .get('/gas-prices')
        .query({ chainId: 'eip155:1' })
        .reply(200, () => {
          clock.tick(1000);
          return {
            data: {
              low: 5,
              average: 10,
              high: 15,
            },
          };
        });
      const service = buildService({
        policyOptions: { degradedThreshold: 500 },
      });
      const onDegradedListener = jest.fn();
      service.onDegraded(onDegradedListener);

      await service.fetchGasPrices('0x1');

      expect(onDegradedListener).toHaveBeenCalled();
    });

    it('attempts a request that responds with non-200 up to 4 times, throwing if it never succeeds', async () => {
      nock('https://api.example.com')
        .get('/gas-prices')
        .query({ chainId: 'eip155:1' })
        .times(4)
        .reply(500);
      const service = buildService();
      service.onRetry(async () => {
        await clock.nextAsync();
      });

      await expect(service.fetchGasPrices('0x1')).rejects.toThrow(
        "Fetching 'https://api.example.com/gas-prices?chainId=eip155%3A1' failed with status '500'",
      );
    });

    it('calls onDegraded listeners when the maximum number of retries is exceeded', async () => {
      nock('https://api.example.com')
        .get('/gas-prices')
        .query({ chainId: 'eip155:1' })
        .times(4)
        .reply(500);
      const service = buildService();
      service.onRetry(async () => {
        await clock.nextAsync();
      });
      const onDegradedListener = jest.fn();
      service.onDegraded(onDegradedListener);

      await expect(service.fetchGasPrices('0x1')).rejects.toThrow(
        "Fetching 'https://api.example.com/gas-prices?chainId=eip155%3A1' failed with status '500'",
      );
      expect(onDegradedListener).toHaveBeenCalled();
    });

    it('intercepts requests and throws a circuit break error after the 4th failed attempt, running onBreak listeners', async () => {
      nock('https://api.example.com')
        .get('/gas-prices')
        .query({ chainId: 'eip155:1' })
        .times(12)
        .reply(500);
      const service = buildService();
      service.onRetry(async () => {
        await clock.nextAsync();
      });
      const onBreakListener = jest.fn();
      service.onBreak(onBreakListener);

      // Should make 4 requests
      await expect(service.fetchGasPrices('0x1')).rejects.toThrow(
        "Fetching 'https://api.example.com/gas-prices?chainId=eip155%3A1' failed with status '500'",
      );
      // Should make 4 requests
      await expect(service.fetchGasPrices('0x1')).rejects.toThrow(
        "Fetching 'https://api.example.com/gas-prices?chainId=eip155%3A1' failed with status '500'",
      );
      // Should make 4 requests
      await expect(service.fetchGasPrices('0x1')).rejects.toThrow(
        "Fetching 'https://api.example.com/gas-prices?chainId=eip155%3A1' failed with status '500'",
      );
      // Should not make an additional request (we only mocked 12 requests
      // above)
      await expect(service.fetchGasPrices('0x1')).rejects.toThrow(
        'Execution prevented because the circuit breaker is open',
      );
      expect(onBreakListener).toHaveBeenCalledWith({
        error: new HttpError(
          500,
          "Fetching 'https://api.example.com/gas-prices?chainId=eip155%3A1' failed with status '500'",
        ),
      });
    });

    it('resumes requests after the circuit break duration passes, returning the API response if the request ultimately succeeds', async () => {
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
      const service = buildService({
        policyOptions: { circuitBreakDuration },
      });
      service.onRetry(async () => {
        await clock.nextAsync();
      });

      await expect(service.fetchGasPrices('0x1')).rejects.toThrow(
        "Fetching 'https://api.example.com/gas-prices?chainId=eip155%3A1' failed with status '500'",
      );
      await expect(service.fetchGasPrices('0x1')).rejects.toThrow(
        "Fetching 'https://api.example.com/gas-prices?chainId=eip155%3A1' failed with status '500'",
      );
      await expect(service.fetchGasPrices('0x1')).rejects.toThrow(
        "Fetching 'https://api.example.com/gas-prices?chainId=eip155%3A1' failed with status '500'",
      );
      await expect(service.fetchGasPrices('0x1')).rejects.toThrow(
        'Execution prevented because the circuit breaker is open',
      );
      await clock.tickAsync(circuitBreakDuration);
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
 * The type of the messenger where all actions and events will be registered.
 */
type UnrestrictedMessenger = Messenger<
  ExtractAvailableAction<SampleGasPricesService>,
  ExtractAvailableEvent<SampleGasPricesService>
>;

/**
 * Constructs the unrestricted messenger for these tests. This is where all
 * actions and events will ultimately be registered.
 *
 * @returns The unrestricted messenger.
 */
function buildUnrestrictedMessenger(): UnrestrictedMessenger {
  const unrestrictedMessenger: UnrestrictedMessenger = new Messenger();
  return unrestrictedMessenger;
}

/**
 * Constructs the messenger suited for SampleGasPricesService.
 *
 * @param unrestrictedMessenger - The messenger from which the controller messenger
 * will be derived.
 * @returns The restricted messenger.
 */
function buildRestrictedMessenger(
  unrestrictedMessenger = buildUnrestrictedMessenger(),
): SampleGasPricesServiceMessenger {
  return unrestrictedMessenger.getRestricted({
    name: 'SampleGasPricesService',
    allowedActions: [],
    allowedEvents: [],
  });
}

/**
 * Constructs a SampleGasPricesService based on the given options, and calls the
 * given function with that service.
 *
 * @param options - The options that SampleGasPricesService takes.
 * @returns The constructed service.
 */
function buildService(
  options: Partial<
    ConstructorParameters<typeof SampleGasPricesService>[0]
  > = {},
): SampleGasPricesService {
  const unrestrictedMessenger = buildUnrestrictedMessenger();
  const restrictedMessenger = buildRestrictedMessenger(unrestrictedMessenger);
  return new SampleGasPricesService({
    fetch,
    messenger: restrictedMessenger,
    ...options,
  });
}
