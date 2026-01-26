import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';

import type { AnalyticsPrivacyControllerMethodActions } from './AnalyticsPrivacyController-method-action-types';
import type { AnalyticsPrivacyServiceActions } from './AnalyticsPrivacyService';
import { projectLogger as log } from './logger';
import { DATA_DELETE_RESPONSE_STATUSES, DATA_DELETE_STATUSES } from './types';
import type {
  IDeleteRegulationResponse,
  IDeleteRegulationStatus,
} from './types';

// === GENERAL ===

/**
 * The name of the {@link AnalyticsPrivacyController}, used to namespace the
 * controller's actions and events and to namespace the controller's state data
 * when composed with other controllers.
 */
export const controllerName = 'AnalyticsPrivacyController';

// === STATE ===

/**
 * Describes the shape of the state object for {@link AnalyticsPrivacyController}.
 */
export type AnalyticsPrivacyControllerState = {
  /**
   * Indicates if data has been recorded since the last deletion request.
   */
  hasCollectedDataSinceDeletionRequest: boolean;

  /**
   * Segment's data deletion regulation ID.
   * The ID returned by the Segment delete API which allows checking the status of the deletion request.
   */
  deleteRegulationId: string | null;

  /**
   * Segment's data deletion regulation creation timestamp.
   * The timestamp (in milliseconds since epoch) when the deletion request was created.
   */
  deleteRegulationTimestamp: number | null;
};

/**
 * Returns default values for AnalyticsPrivacyController state.
 *
 * @returns Default state
 */
export function getDefaultAnalyticsPrivacyControllerState(): AnalyticsPrivacyControllerState {
  return {
    hasCollectedDataSinceDeletionRequest: false,
    deleteRegulationId: null,
    deleteRegulationTimestamp: null,
  };
}

/**
 * The metadata for each property in {@link AnalyticsPrivacyControllerState}.
 */
const analyticsPrivacyControllerMetadata = {
  hasCollectedDataSinceDeletionRequest: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  deleteRegulationId: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  deleteRegulationTimestamp: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
} satisfies StateMetadata<AnalyticsPrivacyControllerState>;

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = [
  'createDataDeletionTask',
  'checkDataDeleteStatus',
  'getDeleteRegulationCreationTimestamp',
  'getDeleteRegulationId',
  'isDataRecorded',
  'updateDataRecordingFlag',
] as const;

/**
 * Returns the state of the {@link AnalyticsPrivacyController}.
 */
export type AnalyticsPrivacyControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  AnalyticsPrivacyControllerState
>;

/**
 * Actions that {@link AnalyticsPrivacyControllerMessenger} exposes to other consumers.
 */
export type AnalyticsPrivacyControllerActions =
  | AnalyticsPrivacyControllerGetStateAction
  | AnalyticsPrivacyControllerMethodActions;

/**
 * Actions from other messengers that {@link AnalyticsPrivacyControllerMessenger} calls.
 */
type AllowedActions = AnalyticsPrivacyServiceActions;

/**
 * Event emitted when a data deletion task is created.
 */
export type DataDeletionTaskCreatedEvent = {
  type: `${typeof controllerName}:dataDeletionTaskCreated`;
  payload: [IDeleteRegulationResponse];
};

/**
 * Event emitted when the data recording flag is updated.
 */
export type DataRecordingFlagUpdatedEvent = {
  type: `${typeof controllerName}:dataRecordingFlagUpdated`;
  payload: [boolean];
};

/**
 * Event emitted when the state of the {@link AnalyticsPrivacyController} changes.
 */
export type AnalyticsPrivacyControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    AnalyticsPrivacyControllerState
  >;

/**
 * Events that {@link AnalyticsPrivacyControllerMessenger} exposes to other consumers.
 */
export type AnalyticsPrivacyControllerEvents =
  | AnalyticsPrivacyControllerStateChangeEvent
  | DataDeletionTaskCreatedEvent
  | DataRecordingFlagUpdatedEvent;

/**
 * Events from other messengers that {@link AnalyticsPrivacyControllerMessenger} subscribes to.
 */
type AllowedEvents = never;

/**
 * The messenger restricted to actions and events accessed by
 * {@link AnalyticsPrivacyController}.
 */
export type AnalyticsPrivacyControllerMessenger = Messenger<
  typeof controllerName,
  AnalyticsPrivacyControllerActions | AllowedActions,
  AnalyticsPrivacyControllerEvents | AllowedEvents
>;

// === CONTROLLER DEFINITION ===

/**
 * The options that AnalyticsPrivacyController takes.
 */
export type AnalyticsPrivacyControllerOptions = {
  /**
   * Initial controller state.
   */
  state?: Partial<AnalyticsPrivacyControllerState>;
  /**
   * Messenger used to communicate with BaseController and other controllers.
   */
  messenger: AnalyticsPrivacyControllerMessenger;
  /**
   * Analytics ID used for data deletion requests.
   */
  analyticsId: string;
};

/**
 * The AnalyticsPrivacyController manages analytics privacy and GDPR/CCPA data deletion functionality.
 * It communicates with Segment's Regulations API via a proxy to create and monitor data deletion requests.
 *
 * This controller follows the MetaMask controller pattern and integrates with the
 * messenger system to allow other controllers and components to manage data deletion tasks.
 */
export class AnalyticsPrivacyController extends BaseController<
  typeof controllerName,
  AnalyticsPrivacyControllerState,
  AnalyticsPrivacyControllerMessenger
> {
  /**
   * Analytics ID used for data deletion requests.
   */
  readonly #analyticsId: string;

  /**
   * Constructs an AnalyticsPrivacyController instance.
   *
   * @param options - Controller options
   * @param options.state - Initial controller state. Use `getDefaultAnalyticsPrivacyControllerState()` for defaults.
   * @param options.messenger - Messenger used to communicate with BaseController
   * @param options.analyticsId - Analytics ID used for data deletion requests
   */
  constructor({
    state = {},
    messenger,
    analyticsId,
  }: AnalyticsPrivacyControllerOptions) {
    const initialState: AnalyticsPrivacyControllerState = {
      ...getDefaultAnalyticsPrivacyControllerState(),
      ...state,
    };

    super({
      name: controllerName,
      metadata: analyticsPrivacyControllerMetadata,
      state: initialState,
      messenger,
    });

    this.#analyticsId = analyticsId;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );

    log('AnalyticsPrivacyController initialized', {
      hasCollectedDataSinceDeletionRequest:
        this.state.hasCollectedDataSinceDeletionRequest,
      hasDeleteRegulationId: Boolean(this.state.deleteRegulationId),
      deleteRegulationTimestamp: this.state.deleteRegulationTimestamp,
    });
  }

  /**
   * Creates a new delete regulation for the user.
   * This is necessary to respect the GDPR and CCPA regulations.
   *
   * @returns Promise containing the status of the request
   */
  async createDataDeletionTask(): Promise<IDeleteRegulationResponse> {
    try {
      if (!this.#analyticsId || this.#analyticsId.trim() === '') {
        const error = new Error(
          'Analytics ID not found. You need to provide a valid analytics ID when initializing the AnalyticsPrivacyController.',
        );
        log('Analytics Deletion Task Error', error);
        return {
          status: DATA_DELETE_RESPONSE_STATUSES.Failure,
          error: error.message,
        };
      }

      const response = await this.messenger.call(
        'AnalyticsPrivacyService:createDataDeletionTask',
        this.#analyticsId,
      );

      const deletionTimestamp = Date.now();
      // Service validates and throws if regulateId is missing, so it's always defined here
      const { regulateId } = response;
      // Type assertion is safe because service throws if regulateId is missing
      const validRegulateId: string = regulateId as string;

      this.update((state) => {
        state.deleteRegulationId = validRegulateId;
        state.deleteRegulationTimestamp = deletionTimestamp;
        state.hasCollectedDataSinceDeletionRequest = false;
      });

      this.messenger.publish(
        `${controllerName}:dataDeletionTaskCreated`,
        response,
      );

      return response;
    } catch (error) {
      log('Analytics Deletion Task Error', error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Analytics Deletion Task Error';
      return {
        status: DATA_DELETE_RESPONSE_STATUSES.Failure,
        error: errorMessage,
      };
    }
  }

  /**
   * Check the latest delete regulation status.
   *
   * @returns Promise containing the timestamp, delete status and collected data flag
   */
  async checkDataDeleteStatus(): Promise<IDeleteRegulationStatus> {
    const status: IDeleteRegulationStatus = {
      deletionRequestTimestamp: undefined,
      dataDeletionRequestStatus: DATA_DELETE_STATUSES.Unknown,
      hasCollectedDataSinceDeletionRequest: false,
    };

    if (!this.state.deleteRegulationId) {
      return status;
    }

    try {
      const dataDeletionTaskStatus = await this.messenger.call(
        'AnalyticsPrivacyService:checkDataDeleteStatus',
        this.state.deleteRegulationId,
      );

      status.dataDeletionRequestStatus =
        dataDeletionTaskStatus.dataDeleteStatus;
    } catch (error) {
      log('Error checkDataDeleteStatus', error);
      status.dataDeletionRequestStatus = DATA_DELETE_STATUSES.Unknown;
    }

    status.deletionRequestTimestamp =
      this.state.deleteRegulationTimestamp ?? undefined;
    status.hasCollectedDataSinceDeletionRequest =
      this.state.hasCollectedDataSinceDeletionRequest;

    return status;
  }

  /**
   * Get the latest delete regulation request timestamp.
   *
   * @returns The timestamp (in milliseconds since epoch), or undefined
   */
  getDeleteRegulationCreationTimestamp(): number | undefined {
    return this.state.deleteRegulationTimestamp ?? undefined;
  }

  /**
   * Get the latest delete regulation request id.
   *
   * @returns The id string, or undefined
   */
  getDeleteRegulationId(): string | undefined {
    return this.state.deleteRegulationId ?? undefined;
  }

  /**
   * Indicate if events have been recorded since the last deletion request.
   *
   * @returns true if events have been recorded since the last deletion request
   */
  isDataRecorded(): boolean {
    return this.state.hasCollectedDataSinceDeletionRequest;
  }

  /**
   * Update the data recording flag if needed.
   * This method should be called after tracking events to ensure
   * the data recording flag is properly updated for data deletion workflows.
   *
   * The flag can only be set to `true` (indicating data has been collected).
   * It cannot be explicitly set to `false` - it is only reset to `false` when
   * a new deletion task is created via `createDataDeletionTask`.
   *
   * If `saveDataRecording` is `false` or the flag is already `true`, this method
   * does nothing. This design ensures the flag only moves from `false` to `true`
   * and cannot be manually reset, maintaining data integrity for compliance tracking.
   *
   * @param saveDataRecording - Whether to save the data recording flag (default: true).
   *   When `false`, this method is a no-op regardless of current state.
   */
  updateDataRecordingFlag(saveDataRecording: boolean = true): void {
    if (saveDataRecording && !this.state.hasCollectedDataSinceDeletionRequest) {
      this.update((state) => {
        state.hasCollectedDataSinceDeletionRequest = true;
      });

      this.messenger.publish(
        `${controllerName}:dataRecordingFlagUpdated`,
        true,
      );
    }
  }
}
