import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type { MockAnyNamespace } from '@metamask/messenger';

import {
  AnalyticsPrivacyController,
  getDefaultAnalyticsPrivacyControllerState,
} from '.';
import type {
  AnalyticsPrivacyControllerMessenger,
  AnalyticsPrivacyControllerActions,
  AnalyticsPrivacyControllerEvents,
  AnalyticsPrivacyControllerState,
} from '.';
import type { AnalyticsPrivacyServiceActions } from './AnalyticsPrivacyService';
import type { AnalyticsControllerState } from '@metamask/analytics-controller';
import { DataDeleteResponseStatus, DataDeleteStatus } from './types';

type SetupControllerOptions = {
  state?: Partial<AnalyticsPrivacyControllerState>;
};

type SetupControllerReturn = {
  controller: AnalyticsPrivacyController;
  messenger: AnalyticsPrivacyControllerMessenger;
  rootMessenger: Messenger<
    MockAnyNamespace,
    AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions | { type: 'AnalyticsController:getState'; handler: () => { analyticsId: string; optedIn: boolean } },
    AnalyticsPrivacyControllerEvents
  >;
};

/**
 * Sets up an AnalyticsPrivacyController for testing.
 *
 * @param options - Controller options
 * @param options.state - Optional partial controller state
 * @returns The controller, messenger, and root messenger
 */
function setupController(
  options: SetupControllerOptions = {},
): SetupControllerReturn {
  const { state = {} } = options;

  const rootMessenger = new Messenger<
    MockAnyNamespace,
    AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions | { type: 'AnalyticsController:getState'; handler: () => { analyticsId: string; optedIn: boolean } },
    AnalyticsPrivacyControllerEvents
  >({ namespace: MOCK_ANY_NAMESPACE });

  const analyticsPrivacyControllerMessenger = new Messenger<
    'AnalyticsPrivacyController',
    AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions | { type: 'AnalyticsController:getState'; handler: () => { analyticsId: string; optedIn: boolean } },
    AnalyticsPrivacyControllerEvents,
    typeof rootMessenger
  >({
    namespace: 'AnalyticsPrivacyController',
    parent: rootMessenger,
  });

  // Mock AnalyticsController:getState action
  rootMessenger.registerActionHandler('AnalyticsController:getState', () => ({
    analyticsId: 'test-analytics-id',
    optedIn: true,
  }));

  // Mock AnalyticsPrivacyService actions (can be overridden in individual tests)
  rootMessenger.registerActionHandler(
    'AnalyticsPrivacyService:createDataDeletionTask',
    jest.fn().mockResolvedValue({
      status: DataDeleteResponseStatus.ok,
      regulateId: 'test-regulate-id',
    }),
  );

  rootMessenger.registerActionHandler(
    'AnalyticsPrivacyService:checkDataDeleteStatus',
    jest.fn().mockResolvedValue({
      status: DataDeleteResponseStatus.ok,
      dataDeleteStatus: DataDeleteStatus.finished,
    }),
  );

  // Delegate service actions and AnalyticsController actions to controller messenger
  rootMessenger.delegate({
    messenger: analyticsPrivacyControllerMessenger,
    actions: [
      'AnalyticsPrivacyService:createDataDeletionTask',
      'AnalyticsPrivacyService:checkDataDeleteStatus',
      'AnalyticsController:getState',
    ],
  });

  const controller = new AnalyticsPrivacyController({
    messenger: analyticsPrivacyControllerMessenger,
    state,
  });

  return {
    controller,
    messenger: analyticsPrivacyControllerMessenger,
    rootMessenger,
  };
}

describe('AnalyticsPrivacyController', () => {
  describe('getDefaultAnalyticsPrivacyControllerState', () => {
    it('returns default state with all fields undefined/false', () => {
      const defaults = getDefaultAnalyticsPrivacyControllerState();

      expect(defaults).toStrictEqual({
        dataRecorded: false,
        deleteRegulationId: null,
        deleteRegulationDate: null,
      });
    });

    it('returns the same values on each call (deterministic)', () => {
      const defaults1 = getDefaultAnalyticsPrivacyControllerState();
      const defaults2 = getDefaultAnalyticsPrivacyControllerState();

      expect(defaults1).toStrictEqual(defaults2);
    });
  });

  describe('constructor', () => {
    it('initializes with default state when no state provided', () => {
      const { controller } = setupController();

      expect(controller.state).toStrictEqual(
        getDefaultAnalyticsPrivacyControllerState(),
      );
    });

    it('initializes with provided state', () => {
      const initialState = {
        dataRecorded: true,
        deleteRegulationId: 'existing-id',
        deleteRegulationDate: '01/01/2024',
      };

      const { controller } = setupController({ state: initialState });

      expect(controller.state).toStrictEqual(initialState);
    });

    it('merges provided state with defaults', () => {
      const partialState = {
        dataRecorded: true,
      };

      const { controller } = setupController({ state: partialState });

      expect(controller.state.dataRecorded).toBe(true);
      expect(controller.state.deleteRegulationId).toBeNull();
      expect(controller.state.deleteRegulationDate).toBeNull();
    });
  });

  describe('AnalyticsPrivacyController:createDataDeletionTask', () => {
    it('creates a data deletion task and updates state', async () => {
      const { controller, rootMessenger } = setupController();

      const response = await rootMessenger.call(
        'AnalyticsPrivacyController:createDataDeletionTask',
      );

      expect(response.status).toBe(DataDeleteResponseStatus.ok);
      expect(response.regulateId).toBe('test-regulate-id');
      expect(controller.state.deleteRegulationId).toBe('test-regulate-id');
      expect(controller.state.deleteRegulationDate).toMatch(
        /^\d{1,2}\/\d{1,2}\/\d{4}$/,
      );
      expect(controller.state.dataRecorded).toBe(false);
    });

    it('formats deletion date in DD/MM/YYYY format', async () => {
      const rootMessenger = new Messenger<
        MockAnyNamespace,
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions | { type: 'AnalyticsController:getState'; handler: () => { analyticsId: string; optedIn: boolean } },
        AnalyticsPrivacyControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const analyticsPrivacyControllerMessenger = new Messenger<
        'AnalyticsPrivacyController',
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions | { type: 'AnalyticsController:getState'; handler: () => { analyticsId: string; optedIn: boolean } },
        AnalyticsPrivacyControllerEvents,
        typeof rootMessenger
      >({
        namespace: 'AnalyticsPrivacyController',
        parent: rootMessenger,
      });

      rootMessenger.registerActionHandler('AnalyticsController:getState', () => ({
        analyticsId: 'test-analytics-id',
        optedIn: true,
      }));

      rootMessenger.registerActionHandler(
        'AnalyticsPrivacyService:createDataDeletionTask',
        jest.fn().mockResolvedValue({
          status: DataDeleteResponseStatus.ok,
          regulateId: 'test-regulate-id',
        }),
      );

      rootMessenger.delegate({
        messenger: analyticsPrivacyControllerMessenger,
        actions: [
          'AnalyticsPrivacyService:createDataDeletionTask',
          'AnalyticsController:getState',
        ],
      });

      const controller = new AnalyticsPrivacyController({
        messenger: analyticsPrivacyControllerMessenger,
      });
      
      const fixedDate = new Date('2024-01-15T12:00:00Z');
      jest.useFakeTimers();
      jest.setSystemTime(fixedDate);

      await rootMessenger.call(
        'AnalyticsPrivacyController:createDataDeletionTask',
      );

      // Note: getUTCDate() returns 15, getUTCMonth() returns 0 (January), so +1 = 1
      expect(controller.state.deleteRegulationDate).toBe('15/01/2024');

      jest.useRealTimers();
    });

    it('emits dataDeletionTaskCreated event', async () => {
      const { rootMessenger, messenger } = setupController();
      const eventListener = jest.fn();

      messenger.subscribe(
        'AnalyticsPrivacyController:dataDeletionTaskCreated',
        eventListener,
      );

      const response = await rootMessenger.call(
        'AnalyticsPrivacyController:createDataDeletionTask',
      );

      // Verify the response is correct first
      expect(response.status).toBe(DataDeleteResponseStatus.ok);
      expect(response.regulateId).toBe('test-regulate-id');
      
      // Then verify the event was emitted
      expect(eventListener).toHaveBeenCalledWith({
        status: DataDeleteResponseStatus.ok,
        regulateId: 'test-regulate-id',
      });
    });

    it('returns error if analyticsId is missing from AnalyticsController state', async () => {
      const rootMessenger = new Messenger<
        MockAnyNamespace,
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions | { type: 'AnalyticsController:getState'; handler: () => AnalyticsControllerState },
        AnalyticsPrivacyControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const analyticsPrivacyControllerMessenger = new Messenger<
        'AnalyticsPrivacyController',
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions | { type: 'AnalyticsController:getState'; handler: () => AnalyticsControllerState },
        AnalyticsPrivacyControllerEvents,
        typeof rootMessenger
      >({
        namespace: 'AnalyticsPrivacyController',
        parent: rootMessenger,
      });

      rootMessenger.registerActionHandler('AnalyticsController:getState', () => ({
        analyticsId: '', // Empty string to test the !analyticsId check
        optedIn: true,
      }));

      rootMessenger.registerActionHandler(
        'AnalyticsPrivacyService:createDataDeletionTask',
        jest.fn().mockResolvedValue({
          status: DataDeleteResponseStatus.ok,
          regulateId: 'test-regulate-id',
        }),
      );

      rootMessenger.delegate({
        messenger: analyticsPrivacyControllerMessenger,
        actions: [
          'AnalyticsPrivacyService:createDataDeletionTask',
          'AnalyticsController:getState',
        ],
      });

      const controller = new AnalyticsPrivacyController({
        messenger: analyticsPrivacyControllerMessenger,
      });

      const response = await rootMessenger.call(
        'AnalyticsPrivacyController:createDataDeletionTask',
      );

      expect(response.status).toBe(DataDeleteResponseStatus.error);
      expect(response.error).toBe('Analytics ID not found');
    });

    it('handles service response with undefined regulateId', async () => {
      const rootMessenger = new Messenger<
        MockAnyNamespace,
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions | { type: 'AnalyticsController:getState'; handler: () => AnalyticsControllerState },
        AnalyticsPrivacyControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const analyticsPrivacyControllerMessenger = new Messenger<
        'AnalyticsPrivacyController',
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions | { type: 'AnalyticsController:getState'; handler: () => AnalyticsControllerState },
        AnalyticsPrivacyControllerEvents,
        typeof rootMessenger
      >({
        namespace: 'AnalyticsPrivacyController',
        parent: rootMessenger,
      });

      rootMessenger.registerActionHandler('AnalyticsController:getState', () => ({
        analyticsId: 'test-analytics-id',
        optedIn: true,
      }));

      rootMessenger.registerActionHandler(
        'AnalyticsPrivacyService:createDataDeletionTask',
        jest.fn().mockResolvedValue({
          status: DataDeleteResponseStatus.ok,
          // regulateId is undefined
        }),
      );

      rootMessenger.delegate({
        messenger: analyticsPrivacyControllerMessenger,
        actions: [
          'AnalyticsPrivacyService:createDataDeletionTask',
          'AnalyticsController:getState',
        ],
      });

      const controller = new AnalyticsPrivacyController({
        messenger: analyticsPrivacyControllerMessenger,
      });

      const response = await rootMessenger.call(
        'AnalyticsPrivacyController:createDataDeletionTask',
      );

      expect(response.status).toBe(DataDeleteResponseStatus.ok);
      expect(response.regulateId).toBeUndefined();
      // State should not be updated when regulateId is missing (condition fails)
      expect(controller.state.deleteRegulationId).toBeNull();
    });

    it('handles empty string regulateId (falsy but not null/undefined)', async () => {
      const rootMessenger = new Messenger<
        MockAnyNamespace,
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions | { type: 'AnalyticsController:getState'; handler: () => AnalyticsControllerState },
        AnalyticsPrivacyControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const analyticsPrivacyControllerMessenger = new Messenger<
        'AnalyticsPrivacyController',
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions | { type: 'AnalyticsController:getState'; handler: () => AnalyticsControllerState },
        AnalyticsPrivacyControllerEvents,
        typeof rootMessenger
      >({
        namespace: 'AnalyticsPrivacyController',
        parent: rootMessenger,
      });

      rootMessenger.registerActionHandler('AnalyticsController:getState', () => ({
        analyticsId: 'test-analytics-id',
        optedIn: true,
      }));

      // Empty string is falsy, so condition fails and we don't enter the block
      // But this tests the edge case
      rootMessenger.registerActionHandler(
        'AnalyticsPrivacyService:createDataDeletionTask',
        jest.fn().mockResolvedValue({
          status: DataDeleteResponseStatus.ok,
          regulateId: '', // Empty string is falsy
        }),
      );

      rootMessenger.delegate({
        messenger: analyticsPrivacyControllerMessenger,
        actions: [
          'AnalyticsPrivacyService:createDataDeletionTask',
          'AnalyticsController:getState',
        ],
      });

      const controller = new AnalyticsPrivacyController({
        messenger: analyticsPrivacyControllerMessenger,
      });

      const response = await rootMessenger.call(
        'AnalyticsPrivacyController:createDataDeletionTask',
      );

      expect(response.status).toBe(DataDeleteResponseStatus.ok);
      // Empty string is falsy, so condition fails and state is not updated
      expect(controller.state.deleteRegulationId).toBeNull();
    });

    it('handles null deleteRegulationDate in status', async () => {
      const rootMessenger = new Messenger<
        MockAnyNamespace,
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions | { type: 'AnalyticsController:getState'; handler: () => AnalyticsControllerState },
        AnalyticsPrivacyControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const analyticsPrivacyControllerMessenger = new Messenger<
        'AnalyticsPrivacyController',
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions | { type: 'AnalyticsController:getState'; handler: () => AnalyticsControllerState },
        AnalyticsPrivacyControllerEvents,
        typeof rootMessenger
      >({
        namespace: 'AnalyticsPrivacyController',
        parent: rootMessenger,
      });

      rootMessenger.registerActionHandler('AnalyticsController:getState', () => ({
        analyticsId: 'test-analytics-id',
        optedIn: true,
      }));

      // Mock a response where regulateId is explicitly undefined (to test ?? null)
      rootMessenger.registerActionHandler(
        'AnalyticsPrivacyService:createDataDeletionTask',
        jest.fn().mockResolvedValue({
          status: DataDeleteResponseStatus.ok,
          regulateId: undefined as string | undefined,
        }),
      );

      rootMessenger.delegate({
        messenger: analyticsPrivacyControllerMessenger,
        actions: [
          'AnalyticsPrivacyService:createDataDeletionTask',
          'AnalyticsController:getState',
        ],
      });

      const controller = new AnalyticsPrivacyController({
        messenger: analyticsPrivacyControllerMessenger,
      });

      const response = await rootMessenger.call(
        'AnalyticsPrivacyController:createDataDeletionTask',
      );

      expect(response.status).toBe(DataDeleteResponseStatus.ok);
      // When regulateId is undefined, the condition fails, so state is not updated
      expect(controller.state.deleteRegulationId).toBeNull();
    });

    it('returns error if AnalyticsController:getState fails', async () => {
      const rootMessenger = new Messenger<
        MockAnyNamespace,
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions | { type: 'AnalyticsController:getState'; handler: () => { analyticsId: string; optedIn: boolean } },
        AnalyticsPrivacyControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const analyticsPrivacyControllerMessenger = new Messenger<
        'AnalyticsPrivacyController',
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions | { type: 'AnalyticsController:getState'; handler: () => { analyticsId: string; optedIn: boolean } },
        AnalyticsPrivacyControllerEvents,
        typeof rootMessenger
      >({
        namespace: 'AnalyticsPrivacyController',
        parent: rootMessenger,
      });

      rootMessenger.registerActionHandler('AnalyticsController:getState', () => {
        throw new Error('Analytics ID not found');
      });

      rootMessenger.registerActionHandler(
        'AnalyticsPrivacyService:createDataDeletionTask',
        jest.fn().mockResolvedValue({
          status: DataDeleteResponseStatus.ok,
          regulateId: 'test-regulate-id',
        }),
      );

      const controller = new AnalyticsPrivacyController({
        messenger: analyticsPrivacyControllerMessenger,
      });

      const response = await rootMessenger.call(
        'AnalyticsPrivacyController:createDataDeletionTask',
      );

      expect(response.status).toBe(DataDeleteResponseStatus.error);
      expect(response.error).toBe('Analytics Deletion Task Error');
      
    });

    it('returns error if service call fails', async () => {
      const rootMessenger = new Messenger<
        MockAnyNamespace,
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions | { type: 'AnalyticsController:getState'; handler: () => { analyticsId: string; optedIn: boolean } },
        AnalyticsPrivacyControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const analyticsPrivacyControllerMessenger = new Messenger<
        'AnalyticsPrivacyController',
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions | { type: 'AnalyticsController:getState'; handler: () => { analyticsId: string; optedIn: boolean } },
        AnalyticsPrivacyControllerEvents,
        typeof rootMessenger
      >({
        namespace: 'AnalyticsPrivacyController',
        parent: rootMessenger,
      });

      rootMessenger.registerActionHandler('AnalyticsController:getState', () => ({
        analyticsId: 'test-analytics-id',
        optedIn: true,
      }));

      rootMessenger.registerActionHandler(
        'AnalyticsPrivacyService:createDataDeletionTask',
        jest.fn().mockResolvedValue({
          status: DataDeleteResponseStatus.error,
          error: 'Service error',
        }),
      );

      const controller = new AnalyticsPrivacyController({
        messenger: analyticsPrivacyControllerMessenger,
      });

      const response = await rootMessenger.call(
        'AnalyticsPrivacyController:createDataDeletionTask',
      );

      expect(response.status).toBe(DataDeleteResponseStatus.error);
      expect(response.error).toBe('Analytics Deletion Task Error');
    });

    it('does not update state if service returns error', async () => {
      const rootMessenger = new Messenger<
        MockAnyNamespace,
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions | { type: 'AnalyticsController:getState'; handler: () => { analyticsId: string; optedIn: boolean } },
        AnalyticsPrivacyControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const analyticsPrivacyControllerMessenger = new Messenger<
        'AnalyticsPrivacyController',
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions | { type: 'AnalyticsController:getState'; handler: () => { analyticsId: string; optedIn: boolean } },
        AnalyticsPrivacyControllerEvents,
        typeof rootMessenger
      >({
        namespace: 'AnalyticsPrivacyController',
        parent: rootMessenger,
      });

      rootMessenger.registerActionHandler('AnalyticsController:getState', () => ({
        analyticsId: 'test-analytics-id',
        optedIn: true,
      }));

      rootMessenger.registerActionHandler(
        'AnalyticsPrivacyService:createDataDeletionTask',
        jest.fn().mockResolvedValue({
          status: DataDeleteResponseStatus.error,
          error: 'Service error',
        }),
      );

      const controller = new AnalyticsPrivacyController({
        messenger: analyticsPrivacyControllerMessenger,
      });
      const initialState = controller.state;

      await rootMessenger.call(
        'AnalyticsPrivacyController:createDataDeletionTask',
      );

      expect(controller.state).toStrictEqual(initialState);
    });
  });

  describe('AnalyticsPrivacyController:checkDataDeleteStatus', () => {
    it('returns status with all fields when regulationId exists', async () => {
      const { controller, rootMessenger } = setupController({
        state: {
          deleteRegulationId: 'test-regulation-id',
          deleteRegulationDate: '15/01/2024',
          dataRecorded: true,
        },
      });

      const status = await rootMessenger.call(
        'AnalyticsPrivacyController:checkDataDeleteStatus',
      );

      expect(status).toStrictEqual({
        deletionRequestDate: '15/01/2024',
        dataDeletionRequestStatus: DataDeleteStatus.finished,
        hasCollectedDataSinceDeletionRequest: true,
      });
    });

    it('returns unknown status when regulationId is missing', async () => {
      const { rootMessenger } = setupController();

      const status = await rootMessenger.call(
        'AnalyticsPrivacyController:checkDataDeleteStatus',
      );

      expect(status).toStrictEqual({
        deletionRequestDate: undefined,
        dataDeletionRequestStatus: DataDeleteStatus.unknown,
        hasCollectedDataSinceDeletionRequest: false,
      });
    });

    it('handles null deleteRegulationDate in status', async () => {
      const rootMessenger = new Messenger<
        MockAnyNamespace,
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions | { type: 'AnalyticsController:getState'; handler: () => AnalyticsControllerState },
        AnalyticsPrivacyControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const analyticsPrivacyControllerMessenger = new Messenger<
        'AnalyticsPrivacyController',
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions | { type: 'AnalyticsController:getState'; handler: () => AnalyticsControllerState },
        AnalyticsPrivacyControllerEvents,
        typeof rootMessenger
      >({
        namespace: 'AnalyticsPrivacyController',
        parent: rootMessenger,
      });

      rootMessenger.registerActionHandler('AnalyticsController:getState', () => ({
        analyticsId: 'test-analytics-id',
        optedIn: true,
      }));

      rootMessenger.registerActionHandler(
        'AnalyticsPrivacyService:checkDataDeleteStatus',
        jest.fn().mockResolvedValue({
          status: DataDeleteResponseStatus.ok,
          dataDeleteStatus: DataDeleteStatus.finished,
        }),
      );

      rootMessenger.delegate({
        messenger: analyticsPrivacyControllerMessenger,
        actions: [
          'AnalyticsPrivacyService:checkDataDeleteStatus',
          'AnalyticsController:getState',
        ],
      });

      const controller = new AnalyticsPrivacyController({
        messenger: analyticsPrivacyControllerMessenger,
        state: {
          deleteRegulationId: 'test-regulation-id',
          deleteRegulationDate: null, // null date
          dataRecorded: false,
        },
      });

      const status = await rootMessenger.call(
        'AnalyticsPrivacyController:checkDataDeleteStatus',
      );

      expect(status.deletionRequestDate).toBeUndefined();
      expect(status.dataDeletionRequestStatus).toBe(DataDeleteStatus.finished);
    });

    it('handles service errors gracefully', async () => {
      const rootMessenger = new Messenger<
        MockAnyNamespace,
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions | { type: 'AnalyticsController:getState'; handler: () => { analyticsId: string; optedIn: boolean } },
        AnalyticsPrivacyControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const analyticsPrivacyControllerMessenger = new Messenger<
        'AnalyticsPrivacyController',
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions | { type: 'AnalyticsController:getState'; handler: () => { analyticsId: string; optedIn: boolean } },
        AnalyticsPrivacyControllerEvents,
        typeof rootMessenger
      >({
        namespace: 'AnalyticsPrivacyController',
        parent: rootMessenger,
      });

      rootMessenger.registerActionHandler('AnalyticsController:getState', () => ({
        analyticsId: 'test-analytics-id',
        optedIn: true,
      }));

      rootMessenger.registerActionHandler(
        'AnalyticsPrivacyService:checkDataDeleteStatus',
        jest.fn().mockRejectedValue(new Error('Service error')),
      );

      const controller = new AnalyticsPrivacyController({
        messenger: analyticsPrivacyControllerMessenger,
        state: {
          deleteRegulationId: 'test-regulation-id',
          deleteRegulationDate: '15/01/2024',
          dataRecorded: false,
        },
      });

      const status = await rootMessenger.call(
        'AnalyticsPrivacyController:checkDataDeleteStatus',
      );

      expect(status.dataDeletionRequestStatus).toBe(DataDeleteStatus.unknown);
      expect(status.deletionRequestDate).toBe('15/01/2024');
      expect(status.hasCollectedDataSinceDeletionRequest).toBe(false);
    });
  });

  describe('AnalyticsPrivacyController:getDeleteRegulationCreationDate', () => {
    it('returns the deletion date when set', () => {
      const { controller, rootMessenger } = setupController({
        state: {
          deleteRegulationDate: '15/01/2024',
        },
      });

      const date = rootMessenger.call(
        'AnalyticsPrivacyController:getDeleteRegulationCreationDate',
      );

      expect(date).toBe('15/01/2024');
    });

    it('returns undefined when deletion date is not set', () => {
      const { rootMessenger } = setupController();

      const date = rootMessenger.call(
        'AnalyticsPrivacyController:getDeleteRegulationCreationDate',
      );

      expect(date).toBeUndefined();
    });
  });

  describe('AnalyticsPrivacyController:getDeleteRegulationId', () => {
    it('returns the regulation ID when set', () => {
      const { rootMessenger } = setupController({
        state: {
          deleteRegulationId: 'test-regulation-id',
        },
      });

      const id = rootMessenger.call(
        'AnalyticsPrivacyController:getDeleteRegulationId',
      );

      expect(id).toBe('test-regulation-id');
    });

    it('returns undefined when regulation ID is not set', () => {
      const { rootMessenger } = setupController();

      const id = rootMessenger.call(
        'AnalyticsPrivacyController:getDeleteRegulationId',
      );

      expect(id).toBeUndefined();
    });
  });

  describe('AnalyticsPrivacyController:isDataRecorded', () => {
    it('returns true when data has been recorded', () => {
      const { rootMessenger } = setupController({
        state: {
          dataRecorded: true,
        },
      });

      const isRecorded = rootMessenger.call(
        'AnalyticsPrivacyController:isDataRecorded',
      );

      expect(isRecorded).toBe(true);
    });

    it('returns false when data has not been recorded', () => {
      const { rootMessenger } = setupController();

      const isRecorded = rootMessenger.call(
        'AnalyticsPrivacyController:isDataRecorded',
      );

      expect(isRecorded).toBe(false);
    });
  });

  describe('AnalyticsPrivacyController:updateDataRecordingFlag', () => {
    it('updates dataRecorded to true when saveDataRecording is true', () => {
      const { controller, rootMessenger } = setupController({
        state: {
          dataRecorded: false,
        },
      });

      rootMessenger.call(
        'AnalyticsPrivacyController:updateDataRecordingFlag',
        true,
      );

      expect(controller.state.dataRecorded).toBe(true);
    });

    it('does not update when saveDataRecording is false', () => {
      const { controller, rootMessenger } = setupController({
        state: {
          dataRecorded: false,
        },
      });

      rootMessenger.call(
        'AnalyticsPrivacyController:updateDataRecordingFlag',
        false,
      );

      expect(controller.state.dataRecorded).toBe(false);
    });

    it('does not update when dataRecorded is already true', () => {
      const { controller, rootMessenger } = setupController({
        state: {
          dataRecorded: true,
        },
      });

      rootMessenger.call(
        'AnalyticsPrivacyController:updateDataRecordingFlag',
        true,
      );

      expect(controller.state.dataRecorded).toBe(true);
    });

    it('defaults saveDataRecording to true', () => {
      const { controller, rootMessenger } = setupController({
        state: {
          dataRecorded: false,
        },
      });

      rootMessenger.call(
        'AnalyticsPrivacyController:updateDataRecordingFlag',
      );

      expect(controller.state.dataRecorded).toBe(true);
    });

    it('emits dataRecordingFlagUpdated event when flag is updated', () => {
      const { rootMessenger } = setupController({
        state: {
          dataRecorded: false,
        },
      });

      const eventListener = jest.fn();
      rootMessenger.subscribe(
        'AnalyticsPrivacyController:dataRecordingFlagUpdated',
        eventListener,
      );

      rootMessenger.call(
        'AnalyticsPrivacyController:updateDataRecordingFlag',
        true,
      );

      expect(eventListener).toHaveBeenCalledWith(true);
    });

    it('does not emit event when flag is not updated', () => {
      const { rootMessenger } = setupController({
        state: {
          dataRecorded: false,
        },
      });

      const eventListener = jest.fn();
      rootMessenger.subscribe(
        'AnalyticsPrivacyController:dataRecordingFlagUpdated',
        eventListener,
      );

      rootMessenger.call(
        'AnalyticsPrivacyController:updateDataRecordingFlag',
        false,
      );

      expect(eventListener).not.toHaveBeenCalled();
    });
  });

  describe('stateChange event', () => {
    it('emits stateChange event when state is updated', () => {
      const { controller, rootMessenger, messenger } = setupController();

      const eventListener = jest.fn();
      messenger.subscribe(
        'AnalyticsPrivacyController:stateChange',
        eventListener,
      );

      rootMessenger.call(
        'AnalyticsPrivacyController:updateDataRecordingFlag',
        true,
      );

      expect(eventListener).toHaveBeenCalled();
      const [newState] = eventListener.mock.calls[0];
      expect(newState.dataRecorded).toBe(true);
    });
  });
});
