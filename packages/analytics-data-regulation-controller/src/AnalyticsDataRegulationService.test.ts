import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import nock from 'nock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AnalyticsDataRegulationServiceMessenger } from './AnalyticsDataRegulationService.js';
import { AnalyticsDataRegulationService } from './AnalyticsDataRegulationService.js';
import {
  DATA_DELETE_RESPONSE_STATUSES,
  DATA_DELETE_STATUSES,
} from './types.js';

describe('AnalyticsDataRegulationService', () => {
  const segmentSourceId = 'test-source-id';
  const segmentRegulationsEndpoint = 'https://proxy.example.com/v1beta';

  beforeEach(() => {
    nock.cleanAll();
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  describe('AnalyticsDataRegulationService:createDataDeletionTask', () => {
    it('returns regulateId when deletion task is created', async () => {
      const analyticsId = 'test-analytics-id';
      const regulateId = 'test-regulate-id';

      nock(segmentRegulationsEndpoint)
        .post(`/regulations/sources/${segmentSourceId}`)
        .reply(200, {
          data: {
            data: {
              regulateId,
            },
          },
        });

      const { rootMessenger } = getService();

      const response = await rootMessenger.call(
        'AnalyticsDataRegulationService:createDataDeletionTask',
        analyticsId,
      );

      expect(response).toStrictEqual({
        status: DATA_DELETE_RESPONSE_STATUSES.Success,
        regulateId,
      });
    });

    it('throws error when segmentSourceId is empty string', async () => {
      const analyticsId = 'test-analytics-id';

      const { rootMessenger } = getService({
        options: {
          segmentSourceId: '',
          segmentRegulationsEndpoint,
        },
      });

      await expect(
        rootMessenger.call(
          'AnalyticsDataRegulationService:createDataDeletionTask',
          analyticsId,
        ),
      ).rejects.toThrow('Segment API source ID or endpoint not found');
    });

    it('throws error when segmentRegulationsEndpoint is empty string', async () => {
      const analyticsId = 'test-analytics-id';

      const { rootMessenger } = getService({
        options: {
          segmentSourceId,
          segmentRegulationsEndpoint: '',
        },
      });

      await expect(
        rootMessenger.call(
          'AnalyticsDataRegulationService:createDataDeletionTask',
          analyticsId,
        ),
      ).rejects.toThrow('Segment API source ID or endpoint not found');
    });

    it('throws error when API returns 500 status', async () => {
      const analyticsId = 'test-analytics-id';

      const scope = nock(segmentRegulationsEndpoint)
        .post(`/regulations/sources/${segmentSourceId}`)
        .once()
        .reply(500);

      const { rootMessenger } = getService();

      await expect(
        rootMessenger.call(
          'AnalyticsDataRegulationService:createDataDeletionTask',
          analyticsId,
        ),
      ).rejects.toThrow('Creating data deletion task failed');
      expect(scope.isDone()).toBe(true);
    });

    it('throws error when API response is missing regulateId', async () => {
      const analyticsId = 'test-analytics-id';

      nock(segmentRegulationsEndpoint)
        .post(`/regulations/sources/${segmentSourceId}`)
        .reply(200, {
          data: {
            // Missing data.regulateId
          },
        });

      const { rootMessenger } = getService();

      await expect(
        rootMessenger.call(
          'AnalyticsDataRegulationService:createDataDeletionTask',
          analyticsId,
        ),
      ).rejects.toThrow(
        /Mutation function for "AnalyticsDataRegulationService:createDataDeletionTask" returned an unexpected response/u,
      );
    });

    it('sends request body with DELETE_ONLY regulation type and analyticsId in subjectIds', async () => {
      const analyticsId = 'test-analytics-id';
      const regulateId = 'test-regulate-id';

      const scope = nock(segmentRegulationsEndpoint)
        .post(`/regulations/sources/${segmentSourceId}`, (body: unknown) => {
          const parsedBody = typeof body === 'string' ? JSON.parse(body) : body;
          return (
            parsedBody.regulationType === 'DELETE_ONLY' &&
            parsedBody.subjectType === 'USER_ID' &&
            Array.isArray(parsedBody.subjectIds) &&
            parsedBody.subjectIds.length === 1 &&
            parsedBody.subjectIds[0] === analyticsId
          );
        })
        .reply(200, {
          data: {
            data: {
              regulateId,
            },
          },
        });

      const { rootMessenger } = getService();

      await rootMessenger.call(
        'AnalyticsDataRegulationService:createDataDeletionTask',
        analyticsId,
      );

      expect(scope.isDone()).toBe(true);
    });

    it('sends POST request with application/vnd.segment.v1+json Content-Type header', async () => {
      const analyticsId = 'test-analytics-id';
      const regulateId = 'test-regulate-id';

      const scope = nock(segmentRegulationsEndpoint, {
        reqheaders: {
          'Content-Type': 'application/vnd.segment.v1+json',
        },
      })
        .post(`/regulations/sources/${segmentSourceId}`)
        .reply(200, {
          data: {
            data: {
              regulateId,
            },
          },
        });

      const { rootMessenger } = getService();

      await rootMessenger.call(
        'AnalyticsDataRegulationService:createDataDeletionTask',
        analyticsId,
      );

      expect(scope.isDone()).toBe(true);
    });
  });

  describe('AnalyticsDataRegulationService:checkDataDeleteStatus', () => {
    it('returns dataDeleteStatus when regulation status is retrieved', async () => {
      const regulationId = 'test-regulation-id';
      const status = DATA_DELETE_STATUSES.Finished;

      nock(segmentRegulationsEndpoint)
        .get(`/regulations/${regulationId}`)
        .reply(200, {
          data: {
            data: {
              regulation: {
                overallStatus: status,
              },
            },
          },
        });

      const { rootMessenger } = getService();

      const response = await rootMessenger.call(
        'AnalyticsDataRegulationService:checkDataDeleteStatus',
        regulationId,
      );

      expect(response).toStrictEqual({
        status: DATA_DELETE_RESPONSE_STATUSES.Success,
        dataDeleteStatus: status,
      });
    });

    it('throws error when regulationId is empty string', async () => {
      const { rootMessenger } = getService();

      await expect(
        rootMessenger.call(
          'AnalyticsDataRegulationService:checkDataDeleteStatus',
          '',
        ),
      ).rejects.toThrow('Regulation ID or endpoint not configured');
    });

    it('throws error when segmentRegulationsEndpoint is empty string', async () => {
      const regulationId = 'test-regulation-id';

      const { rootMessenger } = getService({
        options: {
          segmentSourceId,
          segmentRegulationsEndpoint: '',
        },
      });

      await expect(
        rootMessenger.call(
          'AnalyticsDataRegulationService:checkDataDeleteStatus',
          regulationId,
        ),
      ).rejects.toThrow('Regulation ID or endpoint not configured');
    });

    it('throws error when API returns 500 status', async () => {
      const regulationId = 'test-regulation-id';

      nock(segmentRegulationsEndpoint)
        .get(`/regulations/${regulationId}`)
        .reply(500);

      const { rootMessenger } = getService({
        options: {
          policyOptions: {
            maxRetries: 0, // Disable retries for faster test execution
          },
        },
      });

      await expect(
        rootMessenger.call(
          'AnalyticsDataRegulationService:checkDataDeleteStatus',
          regulationId,
        ),
      ).rejects.toThrow('Checking data deletion status failed');
    });

    it('retries a 5xx response and returns the eventual successful result', async () => {
      const regulationId = 'test-regulation-id';

      nock(segmentRegulationsEndpoint)
        .get(`/regulations/${regulationId}`)
        .times(2)
        .reply(500);
      nock(segmentRegulationsEndpoint)
        .get(`/regulations/${regulationId}`)
        .reply(200, {
          data: {
            data: {
              regulation: {
                overallStatus: DATA_DELETE_STATUSES.Finished,
              },
            },
          },
        });

      const { rootMessenger } = getService();

      const promise = rootMessenger.call(
        'AnalyticsDataRegulationService:checkDataDeleteStatus',
        regulationId,
      );
      expect(await promise).toStrictEqual({
        status: DATA_DELETE_RESPONSE_STATUSES.Success,
        dataDeleteStatus: DATA_DELETE_STATUSES.Finished,
      });
    });

    it('throws after exhausting retries on repeated 5xx responses', async () => {
      const regulationId = 'test-regulation-id';

      const scope = nock(segmentRegulationsEndpoint)
        .get(`/regulations/${regulationId}`)
        .times(4)
        .reply(500);

      const { rootMessenger } = getService();

      const promise = rootMessenger.call(
        'AnalyticsDataRegulationService:checkDataDeleteStatus',
        regulationId,
      );
      await expect(promise).rejects.toThrow(
        "Checking data deletion status failed with status '500'",
      );
      expect(scope.isDone()).toBe(true);
    });

    it('returns unknown status when API response is missing overallStatus', async () => {
      const regulationId = 'test-regulation-id';

      nock(segmentRegulationsEndpoint)
        .get(`/regulations/${regulationId}`)
        .reply(200, {
          data: {
            data: {
              regulation: {
                // Missing overallStatus
              },
            },
          },
        });

      const { rootMessenger } = getService();

      const response = await rootMessenger.call(
        'AnalyticsDataRegulationService:checkDataDeleteStatus',
        regulationId,
      );

      expect(response).toStrictEqual({
        status: DATA_DELETE_RESPONSE_STATUSES.Success,
        dataDeleteStatus: DATA_DELETE_STATUSES.Unknown,
      });
    });

    it('sends GET request with application/vnd.segment.v1+json Content-Type header', async () => {
      const regulationId = 'test-regulation-id';
      const status = DATA_DELETE_STATUSES.Running;

      const scope = nock(segmentRegulationsEndpoint, {
        reqheaders: {
          'Content-Type': 'application/vnd.segment.v1+json',
        },
      })
        .get(`/regulations/${regulationId}`)
        .reply(200, {
          data: {
            data: {
              regulation: {
                overallStatus: status,
              },
            },
          },
        });

      const { rootMessenger } = getService();

      await rootMessenger.call(
        'AnalyticsDataRegulationService:checkDataDeleteStatus',
        regulationId,
      );

      expect(scope.isDone()).toBe(true);
    });
  });

  describe('BaseDataService integration', () => {
    const createPath = `/regulations/sources/${segmentSourceId}`;
    const validCreateBody = { data: { data: { regulateId: 'reg-1' } } };
    const statusBody = (overallStatus: string): object => ({
      data: { data: { regulation: { overallStatus } } },
    });

    it('registers the invalidateQueries action', async () => {
      const { rootMessenger } = getService();

      expect(
        await rootMessenger.call(
          'AnalyticsDataRegulationService:invalidateQueries',
        ),
      ).toBeUndefined();
    });

    it('publishes cacheUpdated after checking a deletion status', async () => {
      nock(segmentRegulationsEndpoint)
        .get('/regulations/reg-1')
        .reply(200, statusBody(DATA_DELETE_STATUSES.Finished));
      const { service, messenger } = getService();
      const publishSpy = vi.spyOn(messenger, 'publish');

      await service.checkDataDeleteStatus('reg-1');

      expect(publishSpy).toHaveBeenCalledWith(
        'AnalyticsDataRegulationService:cacheUpdated',
        expect.objectContaining({ objectType: 'query' }),
      );
    });

    it('does not publish the analytics ID in events after createDataDeletionTask', async () => {
      nock(segmentRegulationsEndpoint)
        .post(createPath)
        .reply(200, validCreateBody);
      const { service, messenger } = getService();
      const publishSpy = vi.spyOn(messenger, 'publish');

      await service.createDataDeletionTask('SECRET-ANALYTICS-ID');

      expect(publishSpy).toHaveBeenCalled();
      expect(JSON.stringify(publishSpy.mock.calls)).not.toContain(
        'SECRET-ANALYTICS-ID',
      );
    });

    it('sends a request for each concurrent createDataDeletionTask call', async () => {
      const first = nock(segmentRegulationsEndpoint)
        .post(createPath)
        .reply(200, validCreateBody);
      const second = nock(segmentRegulationsEndpoint)
        .post(createPath)
        .reply(200, validCreateBody);
      const { service } = getService();

      await Promise.all([
        service.createDataDeletionTask('analytics-id-1'),
        service.createDataDeletionTask('analytics-id-1'),
      ]);

      expect(first.isDone()).toBe(true);
      expect(second.isDone()).toBe(true);
    });

    it('deduplicates concurrent checkDataDeleteStatus calls', async () => {
      nock(segmentRegulationsEndpoint)
        .get('/regulations/reg-1')
        .reply(200, statusBody(DATA_DELETE_STATUSES.Finished));
      const secondRequest = nock(segmentRegulationsEndpoint)
        .get('/regulations/reg-1')
        .reply(200, statusBody(DATA_DELETE_STATUSES.Failed));
      const { service } = getService();

      const [first, second] = await Promise.all([
        service.checkDataDeleteStatus('reg-1'),
        service.checkDataDeleteStatus('reg-1'),
      ]);

      expect(first).toStrictEqual(second);
      expect(secondRequest.isDone()).toBe(false);
    });

    it('refetches checkDataDeleteStatus on every sequential call', async () => {
      nock(segmentRegulationsEndpoint)
        .get('/regulations/reg-1')
        .reply(200, statusBody(DATA_DELETE_STATUSES.Running));
      nock(segmentRegulationsEndpoint)
        .get('/regulations/reg-1')
        .reply(200, statusBody(DATA_DELETE_STATUSES.Finished));
      const { service } = getService();

      const first = await service.checkDataDeleteStatus('reg-1');
      const second = await service.checkDataDeleteStatus('reg-1');

      expect(first.dataDeleteStatus).toBe(DATA_DELETE_STATUSES.Running);
      expect(second.dataDeleteStatus).toBe(DATA_DELETE_STATUSES.Finished);
    });

    it('does not retry createDataDeletionTask on a 5xx response', async () => {
      nock(segmentRegulationsEndpoint).post(createPath).reply(500);
      const retry = nock(segmentRegulationsEndpoint)
        .post(createPath)
        .reply(200, validCreateBody);
      const { service } = getService();

      await expect(service.createDataDeletionTask('user-1')).rejects.toThrow(
        "Creating data deletion task failed with status '500'",
      );
      expect(retry.isDone()).toBe(false);
    });

    it('rejects a malformed create response without retrying', async () => {
      nock(segmentRegulationsEndpoint)
        .post(createPath)
        .reply(200, { data: { data: { regulateId: '   ' } } });
      const retry = nock(segmentRegulationsEndpoint)
        .post(createPath)
        .reply(200, validCreateBody);
      const { service } = getService();

      await expect(service.createDataDeletionTask('user-1')).rejects.toThrow(
        /Mutation function for "AnalyticsDataRegulationService:createDataDeletionTask" returned an unexpected response/u,
      );
      expect(retry.isDone()).toBe(false);
    });
  });
});

/**
 * The type of the messenger populated with all external actions and events
 * required by the service under test.
 */
type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<AnalyticsDataRegulationServiceMessenger>,
  MessengerEvents<AnalyticsDataRegulationServiceMessenger>
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
 * events required by the service's messenger.
 * @returns The service-specific messenger.
 */
function getMessenger(
  rootMessenger: RootMessenger,
): AnalyticsDataRegulationServiceMessenger {
  return new Messenger({
    namespace: 'AnalyticsDataRegulationService',
    parent: rootMessenger,
  });
}

/**
 * Constructs the service under test.
 *
 * @param args - The arguments to this function.
 * @param args.options - The options that the service constructor takes. All are
 * optional and will be filled in with defaults as needed (including
 * `messenger`).
 * @returns The new service, root messenger, and service messenger.
 */
function getService({
  options = {},
}: {
  options?: Partial<
    ConstructorParameters<typeof AnalyticsDataRegulationService>[0]
  >;
} = {}): {
  service: AnalyticsDataRegulationService;
  rootMessenger: RootMessenger;
  messenger: AnalyticsDataRegulationServiceMessenger;
} {
  const rootMessenger = getRootMessenger();
  const messenger = getMessenger(rootMessenger);
  const defaultSegmentSourceId = 'test-source-id';
  const defaultSegmentRegulationsEndpoint = 'https://proxy.example.com/v1beta';

  const service = new AnalyticsDataRegulationService({
    fetch,
    messenger,
    segmentSourceId: options.segmentSourceId ?? defaultSegmentSourceId,
    segmentRegulationsEndpoint:
      options.segmentRegulationsEndpoint ?? defaultSegmentRegulationsEndpoint,
    ...options,
  });

  return { service, rootMessenger, messenger };
}
