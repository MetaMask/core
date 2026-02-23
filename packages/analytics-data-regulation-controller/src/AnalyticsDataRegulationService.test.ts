import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import nock, { cleanAll, disableNetConnect, enableNetConnect } from 'nock';

import type { AnalyticsDataRegulationServiceMessenger } from './AnalyticsDataRegulationService';
import { AnalyticsDataRegulationService } from './AnalyticsDataRegulationService';
import { DATA_DELETE_RESPONSE_STATUSES, DATA_DELETE_STATUSES } from './types';

describe('AnalyticsDataRegulationService', () => {
  const segmentSourceId = 'test-source-id';
  const segmentRegulationsEndpoint = 'https://proxy.example.com/v1beta';

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    cleanAll();
    disableNetConnect();
  });

  afterEach(() => {
    jest.useRealTimers();
    cleanAll();
    enableNetConnect();
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

      nock(segmentRegulationsEndpoint)
        .post(`/regulations/sources/${segmentSourceId}`)
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
          'AnalyticsDataRegulationService:createDataDeletionTask',
          analyticsId,
        ),
      ).rejects.toThrow('Creating data deletion task failed');
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
        'Malformed response from Segment API: missing or invalid regulateId',
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

  describe('onRetry', () => {
    it('calls retry listener when request is retried', async () => {
      nock(segmentRegulationsEndpoint)
        .post(`/regulations/sources/${segmentSourceId}`)
        .times(2)
        .reply(500);

      const { service, rootMessenger } = getService({
        options: {
          policyOptions: {
            maxRetries: 1,
          },
        },
      });

      const onRetryListener = jest.fn();
      service.onRetry(() => {
        jest.advanceTimersToNextTimerAsync().catch(console.error);
        onRetryListener();
      });

      await expect(
        rootMessenger.call(
          'AnalyticsDataRegulationService:createDataDeletionTask',
          'test-analytics-id',
        ),
      ).rejects.toThrow('Creating data deletion task failed');

      expect(onRetryListener).toHaveBeenCalled();
    });
  });

  describe('onBreak', () => {
    it('calls break listener when circuit breaker opens after multiple failures', async () => {
      nock(segmentRegulationsEndpoint)
        .post(`/regulations/sources/${segmentSourceId}`)
        .times(12)
        .reply(500);

      const { service, rootMessenger } = getService();
      service.onRetry(() => {
        jest.advanceTimersToNextTimerAsync().catch(console.error);
      });

      const onBreakListener = jest.fn();
      service.onBreak(onBreakListener);

      // Make 3 failed requests to trigger circuit breaker
      for (let i = 0; i < 3; i++) {
        await expect(
          rootMessenger.call(
            'AnalyticsDataRegulationService:createDataDeletionTask',
            'test-analytics-id',
          ),
        ).rejects.toThrow('Creating data deletion task failed');
      }

      // 4th request should trigger circuit breaker - service throws error
      await expect(
        rootMessenger.call(
          'AnalyticsDataRegulationService:createDataDeletionTask',
          'test-analytics-id',
        ),
      ).rejects.toThrow(
        'Execution prevented because the circuit breaker is open',
      );

      expect(onBreakListener).toHaveBeenCalled();
    });
  });

  describe('onDegraded', () => {
    it('calls onDegraded listener when request takes longer than 5 seconds', async () => {
      nock(segmentRegulationsEndpoint)
        .post(`/regulations/sources/${segmentSourceId}`)
        .reply(200, () => {
          jest.advanceTimersByTime(6000);
          return {
            data: {
              data: {
                regulateId: 'test-regulate-id',
              },
            },
          };
        });

      const { service, rootMessenger } = getService();
      const onDegradedListener = jest.fn();
      service.onDegraded(onDegradedListener);

      await rootMessenger.call(
        'AnalyticsDataRegulationService:createDataDeletionTask',
        'test-analytics-id',
      );

      expect(onDegradedListener).toHaveBeenCalled();
    });

    it('calls onDegraded listener when maximum number of retries is exceeded', async () => {
      nock(segmentRegulationsEndpoint)
        .post(`/regulations/sources/${segmentSourceId}`)
        .times(4)
        .reply(500);

      const { service, rootMessenger } = getService();
      service.onRetry(() => {
        jest.advanceTimersToNextTimerAsync().catch(console.error);
      });
      const onDegradedListener = jest.fn();
      service.onDegraded(onDegradedListener);

      await expect(
        rootMessenger.call(
          'AnalyticsDataRegulationService:createDataDeletionTask',
          'test-analytics-id',
        ),
      ).rejects.toThrow('Creating data deletion task failed');

      expect(onDegradedListener).toHaveBeenCalled();
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
