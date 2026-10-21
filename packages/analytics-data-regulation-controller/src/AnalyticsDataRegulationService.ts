import { BaseDataService } from '@metamask/base-data-service';
import type {
  CreateServicePolicyOptions,
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
} from '@metamask/base-data-service';
import { HttpError } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import { refine, string, type } from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

import type { AnalyticsDataRegulationServiceMethodActions } from './AnalyticsDataRegulationService-method-action-types.js';
import {
  DATA_DELETE_RESPONSE_STATUSES,
  DATA_DELETE_STATUSES,
} from './types.js';
import type { DataDeleteStatus } from './types.js';

/**
 * Segment API regulation type for DELETE_ONLY operations.
 */
const SEGMENT_REGULATION_TYPE_DELETE_ONLY = 'DELETE_ONLY';

/**
 * Segment API subject type for user ID operations.
 */
const SEGMENT_SUBJECT_TYPE_USER_ID = 'USER_ID';

/**
 * Segment API Content-Type header value.
 */
const SEGMENT_CONTENT_TYPE = 'application/vnd.segment.v1+json';

// === GENERAL ===

/**
 * The name of the {@link AnalyticsDataRegulationService}, used to namespace the
 * service's actions and events.
 */
export const serviceName = 'AnalyticsDataRegulationService';

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = [
  'createDataDeletionTask',
  'checkDataDeleteStatus',
] as const;

/**
 * Invalidates cached queries for {@link AnalyticsDataRegulationService}.
 */
export type AnalyticsDataRegulationServiceInvalidateQueriesAction =
  DataServiceInvalidateQueriesAction<typeof serviceName>;

/**
 * Actions that {@link AnalyticsDataRegulationService} exposes to other consumers.
 */
export type AnalyticsDataRegulationServiceActions =
  | AnalyticsDataRegulationServiceMethodActions
  | AnalyticsDataRegulationServiceInvalidateQueriesAction;

/**
 * Actions from other messengers that {@link AnalyticsDataRegulationServiceMessenger} calls.
 */
type AllowedActions = never;

/**
 * Published when {@link AnalyticsDataRegulationService}'s cache is updated.
 */
export type AnalyticsDataRegulationServiceCacheUpdatedEvent =
  DataServiceCacheUpdatedEvent<typeof serviceName>;

/**
 * Published when a key within {@link AnalyticsDataRegulationService}'s cache is
 * updated.
 */
export type AnalyticsDataRegulationServiceGranularCacheUpdatedEvent =
  DataServiceGranularCacheUpdatedEvent<typeof serviceName>;

/**
 * Events that {@link AnalyticsDataRegulationService} exposes to other consumers.
 */
export type AnalyticsDataRegulationServiceEvents =
  | AnalyticsDataRegulationServiceCacheUpdatedEvent
  | AnalyticsDataRegulationServiceGranularCacheUpdatedEvent;

/**
 * Events from other messengers that {@link AnalyticsDataRegulationService} subscribes to.
 */
type AllowedEvents = never;

/**
 * The messenger which is restricted to actions and events accessed by
 * {@link AnalyticsDataRegulationService}.
 */
export type AnalyticsDataRegulationServiceMessenger = Messenger<
  typeof serviceName,
  AnalyticsDataRegulationServiceActions | AllowedActions,
  AnalyticsDataRegulationServiceEvents | AllowedEvents
>;

// === SERVICE DEFINITION ===

/**
 * A string that is non-empty once trimmed.
 */
const NonEmptyStringStruct = refine(
  string(),
  'NonEmptyString',
  (value) => value.trim() !== '',
);

/**
 * Response structure from Segment API for creating a regulation.
 */
const CreateRegulationResponseStruct = type({
  data: type({
    data: type({
      regulateId: NonEmptyStringStruct,
    }),
  }),
});

/**
 * Validated response from Segment API for creating a regulation.
 */
type CreateRegulationResponse = Infer<typeof CreateRegulationResponseStruct>;

/**
 * Response structure from Segment API for getting regulation status.
 */
type GetRegulationStatusResponse = {
  data: {
    data: {
      regulation: {
        overallStatus: string;
      };
    };
  };
};

/**
 * Options for constructing {@link AnalyticsDataRegulationService}.
 */
export type AnalyticsDataRegulationServiceOptions = {
  /**
   * The messenger suited for this service.
   */
  messenger: AnalyticsDataRegulationServiceMessenger;

  /**
   * A function that can be used to make an HTTP request.
   */
  fetch: typeof fetch;

  /**
   * Segment API source ID (required for creating regulations).
   */
  segmentSourceId: string;

  /**
   * Base URL for the proxy endpoint that communicates with Segment's Regulations API.
   * This is a proxy endpoint (not Segment API directly) that forwards requests to Segment's
   * Regulations API and adds authentication tokens. The endpoint URL varies by environment
   * (e.g., development, staging, production) and should be configured accordingly.
   * Example: 'https://proxy.example.com/v1beta'
   */
  segmentRegulationsEndpoint: string;

  /**
   * Options to pass to `createServicePolicy`, which is used to wrap each request.
   */
  policyOptions?: CreateServicePolicyOptions;
};

/**
 * Type guard to check if a value is a valid DataDeleteStatus.
 *
 * @param status - The value to check.
 * @returns True if the value is a valid DataDeleteStatus.
 */
function isDataDeleteStatus(status: unknown): status is DataDeleteStatus {
  const dataDeleteStatuses: string[] = Object.values(DATA_DELETE_STATUSES);
  return dataDeleteStatuses.includes(status as string);
}

/**
 * This service object is responsible for making requests to the Segment Regulations API
 * via a proxy endpoint for GDPR/CCPA data deletion functionality.
 *
 * @example
 *
 * ```ts
 * import type { MessengerActions, MessengerEvents } from '@metamask/messenger';
 * import { Messenger } from '@metamask/messenger';
 * import type {
 *   AnalyticsDataRegulationServiceActions,
 *   AnalyticsDataRegulationServiceEvents,
 *   AnalyticsDataRegulationServiceMessenger,
 * } from '@metamask/analytics-data-regulation-controller';
 *
 * const rootMessenger = new Messenger<
 *   'Root',
 *   AnalyticsDataRegulationServiceActions,
 *   AnalyticsDataRegulationServiceEvents
 * >({ namespace: 'Root' });
 * const serviceMessenger = new Messenger<
 *   'AnalyticsDataRegulationService',
 *   MessengerActions<AnalyticsDataRegulationServiceMessenger>,
 *   MessengerEvents<AnalyticsDataRegulationServiceMessenger>,
 *   typeof rootMessenger,
 * >({
 *   namespace: 'AnalyticsDataRegulationService',
 *   parent: rootMessenger,
 * });
 * // Instantiate the service to register its actions on the messenger
 * new AnalyticsDataRegulationService({
 *   messenger: serviceMessenger,
 *   fetch,
 *   segmentSourceId: 'abc123',
 *   segmentRegulationsEndpoint: 'https://proxy.example.com/v1beta',
 * });
 *
 * // Later...
 * // Create a data deletion task
 * const response = await rootMessenger.call(
 *   'AnalyticsDataRegulationService:createDataDeletionTask',
 *   'user-analytics-id',
 * );
 * ```
 */
export class AnalyticsDataRegulationService extends BaseDataService<
  typeof serviceName,
  AnalyticsDataRegulationServiceMessenger
> {
  /**
   * A function that can be used to make an HTTP request.
   */
  readonly #fetch: typeof fetch;

  /**
   * Segment API source ID.
   */
  readonly #segmentSourceId: string;

  /**
   * Base URL for the proxy endpoint that communicates with Segment's Regulations API.
   * This endpoint varies by environment and forwards requests to Segment API with authentication.
   */
  readonly #segmentRegulationsEndpoint: string;

  /**
   * Constructs a new AnalyticsDataRegulationService object.
   *
   * @param options - The constructor options.
   */
  constructor(options: AnalyticsDataRegulationServiceOptions) {
    super({
      name: serviceName,
      messenger: options.messenger,
      policyOptions: options.policyOptions,
    });
    this.#fetch = options.fetch;
    this.#segmentSourceId = options.segmentSourceId;
    this.#segmentRegulationsEndpoint = options.segmentRegulationsEndpoint;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Creates a DELETE_ONLY regulation for the given analyticsId.
   *
   * @param analyticsId - The analytics ID of the user for whom to create the deletion task.
   * @returns Promise resolving to a successful deletion regulation response.
   * @throws Error if the request fails or the response is invalid.
   */
  async createDataDeletionTask(analyticsId: string): Promise<{
    status: typeof DATA_DELETE_RESPONSE_STATUSES.Success;
    regulateId: string;
  }> {
    if (!this.#segmentSourceId || !this.#segmentRegulationsEndpoint) {
      throw new Error('Segment API source ID or endpoint not found');
    }

    const url = `${this.#segmentRegulationsEndpoint}/regulations/sources/${this.#segmentSourceId}`;

    const jsonResponse = await this.executeMutation({
      mutationKey: [`${this.name}:createDataDeletionTask`, analyticsId],
      responseStruct: CreateRegulationResponseStruct,
      mutationFn: async () => {
        const response = await this.#fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': SEGMENT_CONTENT_TYPE,
          },
          body: JSON.stringify({
            regulationType: SEGMENT_REGULATION_TYPE_DELETE_ONLY,
            subjectType: SEGMENT_SUBJECT_TYPE_USER_ID,
            subjectIds: [analyticsId],
          }),
        });

        if (!response.ok) {
          throw new HttpError(
            response.status,
            `Creating data deletion task failed with status '${response.status}'`,
          );
        }

        // The body is validated against `CreateRegulationResponseStruct`
        // before it is returned to the caller.
        return (await response.json()) as CreateRegulationResponse;
      },
    });

    return {
      status: DATA_DELETE_RESPONSE_STATUSES.Success,
      regulateId: jsonResponse.data.data.regulateId,
    };
  }

  /**
   * Checks the status of a regulation by ID.
   *
   * @param regulationId - The regulation ID to check.
   * @returns Promise resolving to a successful regulation status response.
   * @throws Error if the request fails or the response is invalid.
   */
  async checkDataDeleteStatus(regulationId: string): Promise<{
    status: typeof DATA_DELETE_RESPONSE_STATUSES.Success;
    dataDeleteStatus: DataDeleteStatus;
  }> {
    if (!regulationId || !this.#segmentRegulationsEndpoint) {
      throw new Error('Regulation ID or endpoint not configured');
    }

    const url = `${this.#segmentRegulationsEndpoint}/regulations/${regulationId}`;

    return this.fetchQuery({
      queryKey: [`${this.name}:checkDataDeleteStatus`, regulationId],
      staleTime: 0,
      queryFn: async () => {
        const response = await this.#fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': SEGMENT_CONTENT_TYPE,
          },
        });

        if (!response.ok) {
          throw new HttpError(
            response.status,
            `Checking data deletion status failed with status '${response.status}'`,
          );
        }

        const jsonResponse =
          (await response.json()) as GetRegulationStatusResponse;
        const rawStatus = jsonResponse?.data?.data?.regulation?.overallStatus;

        return {
          status: DATA_DELETE_RESPONSE_STATUSES.Success,
          dataDeleteStatus: isDataDeleteStatus(rawStatus)
            ? rawStatus
            : DATA_DELETE_STATUSES.Unknown,
        };
      },
    });
  }
}
