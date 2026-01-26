import type {
  CreateServicePolicyOptions,
  ServicePolicy,
} from '@metamask/controller-utils';
import { createServicePolicy, HttpError } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import type { IDisposable } from 'cockatiel';

import type { AnalyticsPrivacyServiceMethodActions } from './AnalyticsPrivacyService-method-action-types';
import { DATA_DELETE_RESPONSE_STATUSES, DATA_DELETE_STATUSES } from './types';
import type { DataDeleteStatus } from './types';
import type {
  IDeleteRegulationResponse,
  IDeleteRegulationStatusResponse,
} from './types';

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
 * The name of the {@link AnalyticsPrivacyService}, used to namespace the
 * service's actions and events.
 */
export const serviceName = 'AnalyticsPrivacyService';

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = [
  'createDataDeletionTask',
  'checkDataDeleteStatus',
] as const;

/**
 * Actions that {@link AnalyticsPrivacyService} exposes to other consumers.
 */
export type AnalyticsPrivacyServiceActions =
  AnalyticsPrivacyServiceMethodActions;

/**
 * Actions from other messengers that {@link AnalyticsPrivacyServiceMessenger} calls.
 */
type AllowedActions = never;

/**
 * Events that {@link AnalyticsPrivacyService} exposes to other consumers.
 */
export type AnalyticsPrivacyServiceEvents = never;

/**
 * Events from other messengers that {@link AnalyticsPrivacyService} subscribes to.
 */
type AllowedEvents = never;

/**
 * The messenger which is restricted to actions and events accessed by
 * {@link AnalyticsPrivacyService}.
 */
export type AnalyticsPrivacyServiceMessenger = Messenger<
  typeof serviceName,
  AnalyticsPrivacyServiceActions | AllowedActions,
  AnalyticsPrivacyServiceEvents | AllowedEvents
>;

// === SERVICE DEFINITION ===

/**
 * Response structure from Segment API for creating a regulation.
 */
type CreateRegulationResponse = {
  data: {
    data: {
      regulateId: string;
    };
  };
};

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
 * Options for constructing {@link AnalyticsPrivacyService}.
 */
export type AnalyticsPrivacyServiceOptions = {
  /**
   * The messenger suited for this service.
   */
  messenger: AnalyticsPrivacyServiceMessenger;

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
 * import { Messenger } from '@metamask/messenger';
 * import type {
 *   AnalyticsPrivacyServiceActions,
 *   AnalyticsPrivacyServiceEvents,
 * } from '@metamask/analytics-privacy-controller';
 *
 * const rootMessenger = new Messenger<
 *   'Root',
 *   AnalyticsPrivacyServiceActions,
 *   AnalyticsPrivacyServiceEvents
 * >({ namespace: 'Root' });
 * const serviceMessenger = new Messenger<
 *   'AnalyticsPrivacyService',
 *   AnalyticsPrivacyServiceActions,
 *   AnalyticsPrivacyServiceEvents,
 *   typeof rootMessenger,
 * >({
 *   namespace: 'AnalyticsPrivacyService',
 *   parent: rootMessenger,
 * });
 * // Instantiate the service to register its actions on the messenger
 * new AnalyticsPrivacyService({
 *   messenger: serviceMessenger,
 *   fetch,
 *   segmentSourceId: 'abc123',
 *   segmentRegulationsEndpoint: 'https://proxy.example.com/v1beta',
 * });
 *
 * // Later...
 * // Create a data deletion task
 * const response = await rootMessenger.call(
 *   'AnalyticsPrivacyService:createDataDeletionTask',
 *   'user-analytics-id',
 * );
 * ```
 */
export class AnalyticsPrivacyService {
  /**
   * The name of the service.
   */
  readonly name: typeof serviceName;

  /**
   * The messenger suited for this service.
   */
  readonly #messenger: AnalyticsPrivacyServiceMessenger;

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
   * The policy that wraps the request.
   *
   * @see {@link createServicePolicy}
   */
  readonly #policy: ServicePolicy;

  /**
   * Constructs a new AnalyticsPrivacyService object.
   *
   * @param options - The constructor options.
   */
  constructor(options: AnalyticsPrivacyServiceOptions) {
    this.name = serviceName;
    this.#messenger = options.messenger;
    this.#fetch = options.fetch;
    this.#segmentSourceId = options.segmentSourceId;
    this.#segmentRegulationsEndpoint = options.segmentRegulationsEndpoint;
    this.#policy = createServicePolicy(options.policyOptions ?? {});

    this.#messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Registers a handler that will be called after a request returns a non-500
   * response, causing a retry. Primarily useful in tests where timers are being
   * mocked.
   *
   * @param listener - The handler to be called.
   * @returns An object that can be used to unregister the handler.
   * @see {@link createServicePolicy}
   */
  onRetry(listener: Parameters<ServicePolicy['onRetry']>[0]): IDisposable {
    return this.#policy.onRetry(listener);
  }

  /**
   * Registers a handler that will be called after a set number of retry rounds
   * prove that requests to the API endpoint consistently return a 5xx response.
   *
   * @param listener - The handler to be called.
   * @returns An object that can be used to unregister the handler.
   * @see {@link createServicePolicy}
   */
  onBreak(listener: Parameters<ServicePolicy['onBreak']>[0]): IDisposable {
    return this.#policy.onBreak(listener);
  }

  /**
   * Registers a handler that will be called under one of two circumstances:
   *
   * 1. After a set number of retries prove that requests to the API
   * consistently result in failures.
   * 2. After a successful request is made to the API, but the response takes
   * longer than a set duration to return.
   *
   * @param listener - The handler to be called.
   * @returns An object that can be used to unregister the handler.
   */
  onDegraded(
    listener: Parameters<ServicePolicy['onDegraded']>[0],
  ): IDisposable {
    return this.#policy.onDegraded(listener);
  }

  /**
   * Creates a DELETE_ONLY regulation for the given analyticsId.
   *
   * @param analyticsId - The analytics ID of the user for whom to create the deletion task.
   * @returns Promise resolving to the deletion regulation response.
   */
  async createDataDeletionTask(
    analyticsId: string,
  ): Promise<IDeleteRegulationResponse> {
    if (!this.#segmentSourceId || !this.#segmentRegulationsEndpoint) {
      throw new Error('Segment API source ID or endpoint not found');
    }

    const url = `${this.#segmentRegulationsEndpoint}/regulations/sources/${this.#segmentSourceId}`;
    const body = JSON.stringify({
      regulationType: SEGMENT_REGULATION_TYPE_DELETE_ONLY,
      subjectType: SEGMENT_SUBJECT_TYPE_USER_ID,
      subjectIds: [analyticsId],
    });

    const response = await this.#policy.execute(async () => {
      const localResponse = await this.#fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': SEGMENT_CONTENT_TYPE,
        },
        body,
      });

      if (!localResponse.ok) {
        throw new HttpError(
          localResponse.status,
          `Creating data deletion task failed with status '${localResponse.status}'`,
        );
      }

      return localResponse;
    });

    const jsonResponse = (await response.json()) as CreateRegulationResponse;

    if (
      !jsonResponse?.data?.data?.regulateId ||
      typeof jsonResponse.data.data.regulateId !== 'string' ||
      jsonResponse.data.data.regulateId.trim() === ''
    ) {
      throw new Error(
        'Malformed response from Segment API: missing or invalid regulateId',
      );
    }

    return {
      status: DATA_DELETE_RESPONSE_STATUSES.Success,
      regulateId: jsonResponse.data.data.regulateId,
    };
  }

  /**
   * Checks the status of a regulation by ID.
   *
   * @param regulationId - The regulation ID to check.
   * @returns Promise resolving to the regulation status response.
   */
  async checkDataDeleteStatus(
    regulationId: string,
  ): Promise<IDeleteRegulationStatusResponse> {
    if (!regulationId || !this.#segmentRegulationsEndpoint) {
      throw new Error('Regulation ID or endpoint not configured');
    }

    const url = `${this.#segmentRegulationsEndpoint}/regulations/${regulationId}`;

    const response = await this.#policy.execute(async () => {
      const localResponse = await this.#fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': SEGMENT_CONTENT_TYPE,
        },
      });

      if (!localResponse.ok) {
        throw new HttpError(
          localResponse.status,
          `Checking data deletion status failed with status '${localResponse.status}'`,
        );
      }

      return localResponse;
    });

    const jsonResponse = (await response.json()) as GetRegulationStatusResponse;

    const rawStatus = jsonResponse?.data?.data?.regulation?.overallStatus;
    const dataDeleteStatus = isDataDeleteStatus(rawStatus)
      ? rawStatus
      : DATA_DELETE_STATUSES.Unknown;

    return {
      status: DATA_DELETE_RESPONSE_STATUSES.Success,
      dataDeleteStatus,
    };
  }
}
