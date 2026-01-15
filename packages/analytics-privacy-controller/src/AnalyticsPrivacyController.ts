import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';

import type { AnalyticsControllerGetStateAction } from '@metamask/analytics-controller';
import type { AnalyticsPrivacyServiceActions } from './AnalyticsPrivacyService';
import { projectLogger as log } from './AnalyticsPrivacyLogger';
import type { AnalyticsPrivacyControllerMethodActions } from './AnalyticsPrivacyController-method-action-types';
import {
  DataDeleteResponseStatus,
  DataDeleteStatus,
  type IDeleteRegulationResponse,
  type IDeleteRegulationStatus,
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
   * Segment's data deletion regulation creation date.
   * The date when the deletion request was created, in DD/MM/YYYY format.
   */
  deleteRegulationDate: string | null;
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
    deleteRegulationDate: null,
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
  deleteRegulationDate: {
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
  'getDeleteRegulationCreationDate',
  'getDeleteRegulationId',
  'isDataRecorded',
  'updateDataRecordingFlag',
] as const;

/**
 * Returns the state of the {@link AnalyticsPrivacyController}.
 */
export type AnalyticsPrivacyControllerGetStateAction =
  ControllerGetStateAction<
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
  constructor({
    state = {},
    messenger,
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

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );

    log('AnalyticsPrivacyController initialized', {
      dataRecorded: this.state.dataRecorded,
      hasDeleteRegulationId: !!this.state.deleteRegulationId,
      deleteRegulationDate: this.state.deleteRegulationDate,
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
      const analyticsControllerState = await this.messenger.call(
        'AnalyticsController:getState',
      );
      const analyticsId = analyticsControllerState.analyticsId;

      if (!analyticsId || analyticsId.trim() === '') {
        log('Analytics Deletion Task Error', new Error('Analytics ID not found'));
        return {
          status: DataDeleteResponseStatus.error,
          error: 'Analytics ID not found',
        };
      }

      const response = await this.messenger.call(
        'AnalyticsPrivacyService:createDataDeletionTask',
        analyticsId,
      );

      if (
        response.status === DataDeleteResponseStatus.ok &&
        response.regulateId &&
        typeof response.regulateId === 'string' &&
        response.regulateId.trim() !== ''
      ) {
        const currentDate = new Date();
        const day = currentDate.getUTCDate().toString().padStart(2, '0');
        const month = (currentDate.getUTCMonth() + 1).toString().padStart(2, '0');
        const year = currentDate.getUTCFullYear();
        const deletionDate = `${day}/${month}/${year}`;

        this.update((state) => {
          state.deleteRegulationId = response.regulateId as string;
          state.deleteRegulationDate = deletionDate;
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
      return {
        status: DataDeleteResponseStatus.error,
        error: 'Analytics Deletion Task Error',
      };
    }
  }

  /**
   * Check the latest delete regulation status.
   *
   * @returns Promise containing the date, delete status and collected data flag
   */
  async checkDataDeleteStatus(): Promise<IDeleteRegulationStatus> {
    const status: IDeleteRegulationStatus = {
      deletionRequestDate: undefined,
      dataDeletionRequestStatus: DataDeleteStatus.unknown,
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
      status.dataDeletionRequestStatus = DataDeleteStatus.unknown;
    }

    status.deletionRequestDate = this.state.deleteRegulationDate ?? undefined;
    status.hasCollectedDataSinceDeletionRequest = this.state.dataRecorded;

    return status;
  }

  /**
   * Get the latest delete regulation request date.
   *
   * @returns The date as a DD/MM/YYYY string, or undefined
   */
  getDeleteRegulationCreationDate(): string | undefined {
    return this.state.deleteRegulationDate ?? undefined;
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
