import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';

import type { AnalyticsDataRegulationControllerMethodActions } from './AnalyticsDataRegulationController-method-action-types';
import type { AnalyticsDataRegulationServiceActions } from './AnalyticsDataRegulationService';
import { projectLogger as log } from './logger';
import { DATA_DELETE_RESPONSE_STATUSES, DATA_DELETE_STATUSES } from './types';
import type { DeleteRegulationResponse, DeleteRegulationStatus } from './types';

// === GENERAL ===

/**
 * The name of the {@link AnalyticsDataRegulationController}, used to namespace the
 * controller's actions and events and to namespace the controller's state data
 * when composed with other controllers.
 */
export const controllerName = 'AnalyticsDataRegulationController';

// === STATE ===

/**
 * Describes the shape of the state object for {@link AnalyticsDataRegulationController}.
 */
export type AnalyticsDataRegulationControllerState = {
  /**
   * Indicates if data has been recorded since the last deletion request.
   */
  hasCollectedDataSinceDeletionRequest: boolean;

  /**
   * Segment's data deletion regulation ID.
   * The ID returned by the Segment delete API which allows checking the status of the deletion request.
   */
  deleteRegulationId?: string;

  /**
   * Segment's data deletion regulation creation timestamp.
   * The timestamp (in milliseconds since epoch) when the deletion request was created.
   */
  deleteRegulationTimestamp?: number;
};

/**
 * Returns default values for AnalyticsDataRegulationController state.
 *
 * @returns Default state
 */
export function getDefaultAnalyticsDataRegulationControllerState(): AnalyticsDataRegulationControllerState {
  return {
    hasCollectedDataSinceDeletionRequest: false,
  };
}

/**
 * The metadata for each property in {@link AnalyticsDataRegulationControllerState}.
 */
const analyticsDataRegulationControllerMetadata = {
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
} satisfies StateMetadata<AnalyticsDataRegulationControllerState>;

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = [
  'createDataDeletionTask',
  'checkDataDeleteStatus',
  'updateDataRecordingFlag',
] as const;

/**
 * Returns the state of the {@link AnalyticsDataRegulationController}.
 */
export type AnalyticsDataRegulationControllerGetStateAction =
  ControllerGetStateAction<
    typeof controllerName,
    AnalyticsDataRegulationControllerState
  >;

/**
 * Actions that {@link AnalyticsDataRegulationControllerMessenger} exposes to other consumers.
 */
export type AnalyticsDataRegulationControllerActions =
  | AnalyticsDataRegulationControllerGetStateAction
  | AnalyticsDataRegulationControllerMethodActions;

/**
 * Actions from other messengers that {@link AnalyticsDataRegulationControllerMessenger} calls.
 */
type AllowedActions = AnalyticsDataRegulationServiceActions;

/**
 * Event emitted when a data deletion task is created.
 */
export type DataDeletionTaskCreatedEvent = {
  type: `${typeof controllerName}:dataDeletionTaskCreated`;
  payload: [DeleteRegulationResponse];
};

/**
 * Event emitted when the data recording flag is updated.
 */
export type DataRecordingFlagUpdatedEvent = {
  type: `${typeof controllerName}:dataRecordingFlagUpdated`;
  payload: [boolean];
};

/**
 * Event emitted when the state of the {@link AnalyticsDataRegulationController} changes.
 */
export type AnalyticsDataRegulationControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    AnalyticsDataRegulationControllerState
  >;

/**
 * Events that {@link AnalyticsDataRegulationControllerMessenger} exposes to other consumers.
 */
export type AnalyticsDataRegulationControllerEvents =
  | AnalyticsDataRegulationControllerStateChangeEvent
  | DataDeletionTaskCreatedEvent
  | DataRecordingFlagUpdatedEvent;

/**
 * Events from other messengers that {@link AnalyticsDataRegulationControllerMessenger} subscribes to.
 */
type AllowedEvents = never;

/**
 * The messenger restricted to actions and events accessed by
 * {@link AnalyticsDataRegulationController}.
 */
export type AnalyticsDataRegulationControllerMessenger = Messenger<
  typeof controllerName,
  AnalyticsDataRegulationControllerActions | AllowedActions,
  AnalyticsDataRegulationControllerEvents | AllowedEvents
>;

// === CONTROLLER DEFINITION ===

/**
 * The options that AnalyticsDataRegulationController takes.
 */
export type AnalyticsDataRegulationControllerOptions = {
  /**
   * Initial controller state.
   */
  state?: Partial<AnalyticsDataRegulationControllerState>;
  /**
   * Messenger used to communicate with BaseController and other controllers.
   */
  messenger: AnalyticsDataRegulationControllerMessenger;
  /**
   * Analytics ID used for data deletion requests.
   */
  analyticsId: string;
};

/**
 * The AnalyticsDataRegulationController manages analytics privacy and GDPR/CCPA data deletion functionality.
 * It communicates with Segment's Regulations API via a proxy to create and monitor data deletion requests.
 *
 * This controller follows the MetaMask controller pattern and integrates with the
 * messenger system to allow other controllers and components to manage data deletion tasks.
 */
export class AnalyticsDataRegulationController extends BaseController<
  typeof controllerName,
  AnalyticsDataRegulationControllerState,
  AnalyticsDataRegulationControllerMessenger
> {
  /**
   * Analytics ID used for data deletion requests.
   */
  readonly #analyticsId: string;

  /**
   * Constructs an AnalyticsDataRegulationController instance.
   *
   * @param options - Controller options
   * @param options.state - Initial controller state. Use `getDefaultAnalyticsDataRegulationControllerState()` for defaults.
   * @param options.messenger - Messenger used to communicate with BaseController
   * @param options.analyticsId - Analytics ID used for data deletion requests
   */
  constructor({
    state = {},
    messenger,
    analyticsId,
  }: AnalyticsDataRegulationControllerOptions) {
    const initialState: AnalyticsDataRegulationControllerState = {
      ...getDefaultAnalyticsDataRegulationControllerState(),
      ...state,
    };

    super({
      name: controllerName,
      metadata: analyticsDataRegulationControllerMetadata,
      state: initialState,
      messenger,
    });

    this.#analyticsId = analyticsId;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );

    log('AnalyticsDataRegulationController initialized', {
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
   * @returns Promise containing the status of the request with regulateId
   * @throws Error if analytics ID is missing or if the service call fails
   */
  async createDataDeletionTask(): Promise<{
    status: typeof DATA_DELETE_RESPONSE_STATUSES.Success;
    regulateId: string;
  }> {
    if (!this.#analyticsId || this.#analyticsId.trim() === '') {
      const error = new Error(
        'Analytics ID not found. You need to provide a valid analytics ID when initializing the AnalyticsDataRegulationController.',
      );
      log('Analytics Deletion Task Error', error);
      throw error;
    }

    const response = await this.messenger.call(
      'AnalyticsDataRegulationService:createDataDeletionTask',
      this.#analyticsId,
    );

    const deletionTimestamp = Date.now();
    // Service validates and throws on all errors, so if we reach here, the response
    // is guaranteed to be a success response with regulateId present
    this.update((state) => {
      state.deleteRegulationId = response.regulateId;
      state.deleteRegulationTimestamp = deletionTimestamp;
      state.hasCollectedDataSinceDeletionRequest = false;
    });

    this.messenger.publish(
      `${controllerName}:dataDeletionTaskCreated`,
      response,
    );

    return response;
  }

  /**
   * Check the latest delete regulation status.
   *
   * @returns Promise containing the timestamp, delete status and collected data flag
   */
  async checkDataDeleteStatus(): Promise<DeleteRegulationStatus> {
    // Capture all state values before async call to ensure consistency
    // in case createDataDeletionTask() completes concurrently
    const { deleteRegulationId } = this.state;
    const { deleteRegulationTimestamp } = this.state;
    const { hasCollectedDataSinceDeletionRequest } = this.state;

    const status: DeleteRegulationStatus = {
      deletionRequestTimestamp: deleteRegulationTimestamp,
      dataDeletionRequestStatus: DATA_DELETE_STATUSES.Unknown,
      hasCollectedDataSinceDeletionRequest,
    };

    if (!deleteRegulationId) {
      return status;
    }

    // Service validates and throws on all errors, so if we reach here, the response
    // is guaranteed to be a success response with dataDeleteStatus present
    const dataDeletionTaskStatus = await this.messenger.call(
      'AnalyticsDataRegulationService:checkDataDeleteStatus',
      deleteRegulationId,
    );

    status.dataDeletionRequestStatus = dataDeletionTaskStatus.dataDeleteStatus;

    return status;
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
   */
  updateDataRecordingFlag(): void {
    if (!this.state.hasCollectedDataSinceDeletionRequest) {
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
