import { Messenger } from '@metamask/base-controller';
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
      nock('https://example.com/gas-prices')
        .get('/0x1.json')
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

    it('retries a request that responds with non-200 up to 3 times, throwing if it never succeeds', async () => {
      nock('https://example.com/gas-prices')
        .get('/0x1.json')
        .times(4)
        .reply(500);
      const service = buildService();
      service.onRetry(async () => {
        await clock.nextAsync();
      });

      await expect(service.fetchGasPrices('0x1')).rejects.toThrow(
        'Error fetching gas prices (HTTP status 500)',
      );
    });

    it('pauses requests and throws a circuit break error after fetchGasPrices is called 4 times and the request never succeeds', async () => {
      nock('https://example.com/gas-prices')
        .get('/0x1.json')
        .times(12)
        .reply(500);
      const service = buildService();
      service.onRetry(async () => {
        await clock.nextAsync();
      });

      // Should make 4 requests
      await expect(service.fetchGasPrices('0x1')).rejects.toThrow(
        'Error fetching gas prices (HTTP status 500)',
      );
      // Should make 4 requests
      await expect(service.fetchGasPrices('0x1')).rejects.toThrow(
        'Error fetching gas prices (HTTP status 500)',
      );
      // Should make 4 requests
      await expect(service.fetchGasPrices('0x1')).rejects.toThrow(
        'Error fetching gas prices (HTTP status 500)',
      );
      // Should not make an additional request (we only mocked 12 requests
      // above)
      await expect(service.fetchGasPrices('0x1')).rejects.toThrow(
        'Execution prevented because the circuit breaker is open',
      );
    });

    it('resumes requests after the circuit break duration passes, ultimately returning the API response if the request succeeds', async () => {
      const circuitBreakDuration = 5_000;
      nock('https://example.com/gas-prices')
        .get('/0x1.json')
        .times(12)
        .reply(500)
        .get('/0x1.json')
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
        'Error fetching gas prices (HTTP status 500)',
      );
      await expect(service.fetchGasPrices('0x1')).rejects.toThrow(
        'Error fetching gas prices (HTTP status 500)',
      );
      await expect(service.fetchGasPrices('0x1')).rejects.toThrow(
        'Error fetching gas prices (HTTP status 500)',
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
