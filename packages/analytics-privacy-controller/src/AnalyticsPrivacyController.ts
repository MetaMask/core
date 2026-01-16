import type { AnalyticsControllerGetStateAction } from '@metamask/analytics-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';

import type { AnalyticsPrivacyControllerMethodActions } from './AnalyticsPrivacyController-method-action-types';
import { projectLogger as log } from './AnalyticsPrivacyLogger';
import type { AnalyticsPrivacyServiceActions } from './AnalyticsPrivacyService';
import { DataDeleteResponseStatus, DataDeleteStatus } from './types';
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
  dataRecorded: boolean;

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
    dataRecorded: false,
    deleteRegulationId: null,
    deleteRegulationTimestamp: null,
  };
}

/**
 * The metadata for each property in {@link AnalyticsPrivacyControllerState}.
 */
const analyticsPrivacyControllerMetadata = {
  dataRecorded: {
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
type AllowedActions =
  | AnalyticsControllerGetStateAction
  | AnalyticsPrivacyServiceActions;

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
   * Constructs an AnalyticsPrivacyController instance.
   *
   * @param options - Controller options
   * @param options.state - Initial controller state. Use `getDefaultAnalyticsPrivacyControllerState()` for defaults.
   * @param options.messenger - Messenger used to communicate with BaseController
   */
  constructor({ state = {}, messenger }: AnalyticsPrivacyControllerOptions) {
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

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );

    log('AnalyticsPrivacyController initialized', {
      dataRecorded: this.state.dataRecorded,
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
      const analyticsControllerState = this.messenger.call(
        'AnalyticsController:getState',
      );
      const { analyticsId } = analyticsControllerState;

      if (!analyticsId || analyticsId.trim() === '') {
        const error = new Error('Analytics ID not found');
        log('Analytics Deletion Task Error', error);
        return {
          status: DataDeleteResponseStatus.Failure,
          error: 'Analytics ID not found',
        };
      }

      const response = await this.messenger.call(
        'AnalyticsPrivacyService:createDataDeletionTask',
        analyticsId,
      );

      if (
        response.status === DataDeleteResponseStatus.Success &&
        response.regulateId &&
        typeof response.regulateId === 'string' &&
        response.regulateId.trim() !== ''
      ) {
        const deletionTimestamp = Date.now();
        // Already validated as non-empty string above
        const { regulateId } = response;

        this.update((state) => {
          state.deleteRegulationId = regulateId;
          state.deleteRegulationTimestamp = deletionTimestamp;
          state.dataRecorded = false;
        });

        this.messenger.publish(
          `${controllerName}:dataDeletionTaskCreated`,
          response,
        );
      }

      return response;
    } catch (error) {
      log('Analytics Deletion Task Error', error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Analytics Deletion Task Error';
      return {
        status: DataDeleteResponseStatus.Failure,
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
      dataDeletionRequestStatus: DataDeleteStatus.Unknown,
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
      status.dataDeletionRequestStatus = DataDeleteStatus.Unknown;
    }

    status.deletionRequestTimestamp =
      this.state.deleteRegulationTimestamp ?? undefined;
    status.hasCollectedDataSinceDeletionRequest = this.state.dataRecorded;

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
    return this.state.dataRecorded;
  }

  /**
   * Update the data recording flag if needed.
   * This method should be called after tracking events to ensure
   * the data recording flag is properly updated for data deletion workflows.
   *
   * @param saveDataRecording - Whether to save the data recording flag (default: true)
   */
  updateDataRecordingFlag(saveDataRecording: boolean = true): void {
    if (saveDataRecording && !this.state.dataRecorded) {
      this.update((state) => {
        state.dataRecorded = true;
      });

      this.messenger.publish(
        `${controllerName}:dataRecordingFlagUpdated`,
        true,
      );
    }
  }
}
