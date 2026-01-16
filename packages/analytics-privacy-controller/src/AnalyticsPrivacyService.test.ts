import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import nock, { cleanAll, disableNetConnect, enableNetConnect } from 'nock';
import { useFakeTimers } from 'sinon';
import type { SinonFakeTimers } from 'sinon';

import type { AnalyticsPrivacyServiceMessenger } from './AnalyticsPrivacyService';
import { AnalyticsPrivacyService } from './AnalyticsPrivacyService';
import { DataDeleteResponseStatus, DataDeleteStatus } from './types';

describe('AnalyticsPrivacyService', () => {
  let clock: SinonFakeTimers;
  const segmentSourceId = 'test-source-id';
  const segmentRegulationsEndpoint = 'https://proxy.example.com/v1beta';

  beforeEach(() => {
    clock = useFakeTimers();
    cleanAll();
    disableNetConnect();
  });

  afterEach(() => {
    clock.restore();
    cleanAll();
    enableNetConnect();
  });

  describe('AnalyticsPrivacyService:createDataDeletionTask', () => {
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
        'AnalyticsPrivacyService:createDataDeletionTask',
        analyticsId,
      );

      expect(response).toStrictEqual({
        status: DataDeleteResponseStatus.Success,
        regulateId,
      });
    });

    it('returns error response when segmentSourceId is empty string', async () => {
      const analyticsId = 'test-analytics-id';

      const { rootMessenger } = getService({
        options: {
          segmentSourceId: '',
          segmentRegulationsEndpoint,
        },
      });

      const response = await rootMessenger.call(
        'AnalyticsPrivacyService:createDataDeletionTask',
        analyticsId,
      );

      expect(response).toStrictEqual({
        status: DataDeleteResponseStatus.Failure,
        error: 'Segment API source ID or endpoint not found',
      });
    });

    it('returns error response when segmentRegulationsEndpoint is empty string', async () => {
      const analyticsId = 'test-analytics-id';

      const { rootMessenger } = getService({
        options: {
          segmentSourceId,
          segmentRegulationsEndpoint: '',
        },
      });

      const response = await rootMessenger.call(
        'AnalyticsPrivacyService:createDataDeletionTask',
        analyticsId,
      );

      expect(response).toStrictEqual({
        status: DataDeleteResponseStatus.Failure,
        error: 'Segment API source ID or endpoint not found',
      });
    });

    it('returns error response when API returns 500 status', async () => {
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

      const response = await rootMessenger.call(
        'AnalyticsPrivacyService:createDataDeletionTask',
        analyticsId,
      );

      expect(response).toStrictEqual({
        status: DataDeleteResponseStatus.Failure,
        error: 'Analytics Deletion Task Error',
      });
    });

    it('returns error response when API response is missing regulateId', async () => {
      const analyticsId = 'test-analytics-id';

      nock(segmentRegulationsEndpoint)
        .post(`/regulations/sources/${segmentSourceId}`)
        .reply(200, {
          data: {
            // Missing data.regulateId
          },
        });

      const { rootMessenger } = getService();

      const response = await rootMessenger.call(
        'AnalyticsPrivacyService:createDataDeletionTask',
        analyticsId,
      );

      expect(response).toStrictEqual({
        status: DataDeleteResponseStatus.Failure,
        error: 'Analytics Deletion Task Error',
      });
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
        'AnalyticsPrivacyService:createDataDeletionTask',
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
        'AnalyticsPrivacyService:createDataDeletionTask',
        analyticsId,
      );

      expect(scope.isDone()).toBe(true);
    });
  });

  describe('AnalyticsPrivacyService:checkDataDeleteStatus', () => {
    it('returns dataDeleteStatus when regulation status is retrieved', async () => {
      const regulationId = 'test-regulation-id';
      const status = DataDeleteStatus.Finished;

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
        'AnalyticsPrivacyService:checkDataDeleteStatus',
        regulationId,
      );

      expect(response).toStrictEqual({
        status: DataDeleteResponseStatus.Success,
        dataDeleteStatus: status,
      });
    });

    it('returns unknown status when regulationId is empty string', async () => {
      const { rootMessenger } = getService();

      const response = await rootMessenger.call(
        'AnalyticsPrivacyService:checkDataDeleteStatus',
        '',
      );

      expect(response).toStrictEqual({
        status: DataDeleteResponseStatus.Failure,
        dataDeleteStatus: DataDeleteStatus.Unknown,
      });
    });

    it('returns unknown status when segmentRegulationsEndpoint is empty string', async () => {
      const regulationId = 'test-regulation-id';

      const { rootMessenger } = getService({
        options: {
          segmentSourceId,
          segmentRegulationsEndpoint: '',
        },
      });

      const response = await rootMessenger.call(
        'AnalyticsPrivacyService:checkDataDeleteStatus',
        regulationId,
      );

      expect(response).toStrictEqual({
        status: DataDeleteResponseStatus.Failure,
        dataDeleteStatus: DataDeleteStatus.Unknown,
      });
    });

    it('returns unknown status when API returns 500 status', async () => {
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

      const response = await rootMessenger.call(
        'AnalyticsPrivacyService:checkDataDeleteStatus',
        regulationId,
      );

      expect(response).toStrictEqual({
        status: DataDeleteResponseStatus.Failure,
        dataDeleteStatus: DataDeleteStatus.Unknown,
      });
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
        'AnalyticsPrivacyService:checkDataDeleteStatus',
        regulationId,
      );

      expect(response).toStrictEqual({
        status: DataDeleteResponseStatus.Success,
        dataDeleteStatus: DataDeleteStatus.Unknown,
      });
    });

    it('sends GET request with application/vnd.segment.v1+json Content-Type header', async () => {
      const regulationId = 'test-regulation-id';
      const status = DataDeleteStatus.Running;

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
        'AnalyticsPrivacyService:checkDataDeleteStatus',
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
        clock.nextAsync().catch(console.error);
        onRetryListener();
      });

      expect(
        await rootMessenger.call(
          'AnalyticsPrivacyService:createDataDeletionTask',
          'test-analytics-id',
        ),
      ).toMatchObject({
        status: DataDeleteResponseStatus.Failure,
      });

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
        clock.nextAsync().catch(console.error);
      });

      const onBreakListener = jest.fn();
      service.onBreak(onBreakListener);

      // Make 3 failed requests to trigger circuit breaker
      for (let i = 0; i < 3; i++) {
        expect(
          await rootMessenger.call(
            'AnalyticsPrivacyService:createDataDeletionTask',
            'test-analytics-id',
          ),
        ).toMatchObject({
          status: DataDeleteResponseStatus.Failure,
        });
      }

      // 4th request should trigger circuit breaker - service catches and returns error
      expect(
        await rootMessenger.call(
          'AnalyticsPrivacyService:createDataDeletionTask',
          'test-analytics-id',
        ),
      ).toMatchObject({
        status: DataDeleteResponseStatus.Failure,
      });

      expect(onBreakListener).toHaveBeenCalled();
    });
  });

  describe('onDegraded', () => {
    it('calls onDegraded listener when request takes longer than 5 seconds', async () => {
      nock(segmentRegulationsEndpoint)
        .post(`/regulations/sources/${segmentSourceId}`)
        .reply(200, () => {
          clock.tick(6000);
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
        'AnalyticsPrivacyService:createDataDeletionTask',
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
        clock.nextAsync().catch(console.error);
      });
      const onDegradedListener = jest.fn();
      service.onDegraded(onDegradedListener);

      expect(
        await rootMessenger.call(
          'AnalyticsPrivacyService:createDataDeletionTask',
          'test-analytics-id',
        ),
      ).toMatchObject({
        status: DataDeleteResponseStatus.Failure,
      });

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
  MessengerActions<AnalyticsPrivacyServiceMessenger>,
  MessengerEvents<AnalyticsPrivacyServiceMessenger>
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
): AnalyticsPrivacyServiceMessenger {
  return new Messenger({
    namespace: 'AnalyticsPrivacyService',
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
  options?: Partial<ConstructorParameters<typeof AnalyticsPrivacyService>[0]>;
} = {}): {
  service: AnalyticsPrivacyService;
  rootMessenger: RootMessenger;
  messenger: AnalyticsPrivacyServiceMessenger;
} {
  const rootMessenger = getRootMessenger();
  const messenger = getMessenger(rootMessenger);
  const defaultSegmentSourceId = 'test-source-id';
  const defaultSegmentRegulationsEndpoint = 'https://proxy.example.com/v1beta';

  const service = new AnalyticsPrivacyService({
    fetch,
    messenger,
    segmentSourceId: options.segmentSourceId ?? defaultSegmentSourceId,
    segmentRegulationsEndpoint:
      options.segmentRegulationsEndpoint ?? defaultSegmentRegulationsEndpoint,
    ...options,
  });

  return { service, rootMessenger, messenger };
}
