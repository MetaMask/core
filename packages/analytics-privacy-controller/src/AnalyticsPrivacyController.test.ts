import type { AnalyticsControllerState } from '@metamask/analytics-controller';
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
import { DataDeleteResponseStatus, DataDeleteStatus } from './types';

type SetupControllerOptions = {
  state?: Partial<AnalyticsPrivacyControllerState>;
};

type SetupControllerReturn = {
  controller: AnalyticsPrivacyController;
  messenger: AnalyticsPrivacyControllerMessenger;
  rootMessenger: Messenger<
    MockAnyNamespace,
    | AnalyticsPrivacyControllerActions
    | AnalyticsPrivacyServiceActions
    | {
        type: 'AnalyticsController:getState';
        handler: () => { analyticsId: string; optedIn: boolean };
      },
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
    | AnalyticsPrivacyControllerActions
    | AnalyticsPrivacyServiceActions
    | {
        type: 'AnalyticsController:getState';
        handler: () => { analyticsId: string; optedIn: boolean };
      },
    AnalyticsPrivacyControllerEvents
  >({ namespace: MOCK_ANY_NAMESPACE });

  const analyticsPrivacyControllerMessenger = new Messenger<
    'AnalyticsPrivacyController',
    | AnalyticsPrivacyControllerActions
    | AnalyticsPrivacyServiceActions
    | {
        type: 'AnalyticsController:getState';
        handler: () => { analyticsId: string; optedIn: boolean };
      },
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
        deleteRegulationTimestamp: null,
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
        deleteRegulationTimestamp: new Date('2026-01-15T12:00:00Z').getTime(),
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
      expect(controller.state.deleteRegulationTimestamp).toBeNull();
    });
  });

  describe('AnalyticsPrivacyController:createDataDeletionTask', () => {
    it('creates a data deletion task and updates state', async () => {
      const { controller, rootMessenger } = setupController();

      const fixedTimestamp = new Date('2026-01-15T12:00:00Z').getTime();
      jest.useFakeTimers();
      jest.setSystemTime(new Date(fixedTimestamp));

      const response = await rootMessenger.call(
        'AnalyticsPrivacyController:createDataDeletionTask',
      );

      expect(response.status).toBe(DataDeleteResponseStatus.ok);
      expect(response.regulateId).toBe('test-regulate-id');
      expect(controller.state.deleteRegulationId).toBe('test-regulate-id');
      expect(controller.state.deleteRegulationTimestamp).toBe(fixedTimestamp);
      expect(controller.state.dataRecorded).toBe(false);

      jest.useRealTimers();
    });

    it('stores deletion timestamp correctly', async () => {
      const rootMessenger = new Messenger<
        MockAnyNamespace,
        | AnalyticsPrivacyControllerActions
        | AnalyticsPrivacyServiceActions
        | {
            type: 'AnalyticsController:getState';
            handler: () => { analyticsId: string; optedIn: boolean };
          },
        AnalyticsPrivacyControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const analyticsPrivacyControllerMessenger = new Messenger<
        'AnalyticsPrivacyController',
        | AnalyticsPrivacyControllerActions
        | AnalyticsPrivacyServiceActions
        | {
            type: 'AnalyticsController:getState';
            handler: () => { analyticsId: string; optedIn: boolean };
          },
        AnalyticsPrivacyControllerEvents,
        typeof rootMessenger
      >({
        namespace: 'AnalyticsPrivacyController',
        parent: rootMessenger,
      });

      rootMessenger.registerActionHandler(
        'AnalyticsController:getState',
        () => ({
          analyticsId: 'test-analytics-id',
          optedIn: true,
        }),
      );

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

      const fixedTimestamp = new Date('2026-01-15T12:00:00Z').getTime();
      jest.useFakeTimers();
      jest.setSystemTime(new Date(fixedTimestamp));

      await rootMessenger.call(
        'AnalyticsPrivacyController:createDataDeletionTask',
      );

      expect(controller.state.deleteRegulationTimestamp).toBe(fixedTimestamp);
      expect(typeof controller.state.deleteRegulationTimestamp).toBe('number');

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
        | AnalyticsPrivacyControllerActions
        | AnalyticsPrivacyServiceActions
        | {
            type: 'AnalyticsController:getState';
            handler: () => AnalyticsControllerState;
          },
        AnalyticsPrivacyControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const analyticsPrivacyControllerMessenger = new Messenger<
        'AnalyticsPrivacyController',
        | AnalyticsPrivacyControllerActions
        | AnalyticsPrivacyServiceActions
        | {
            type: 'AnalyticsController:getState';
            handler: () => AnalyticsControllerState;
          },
        AnalyticsPrivacyControllerEvents,
        typeof rootMessenger
      >({
        namespace: 'AnalyticsPrivacyController',
        parent: rootMessenger,
      });

      rootMessenger.registerActionHandler(
        'AnalyticsController:getState',
        () => ({
          analyticsId: '', // Empty string to test the !analyticsId check
          optedIn: true,
        }),
      );

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

      // Controller is instantiated to register action handlers
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _controller = new AnalyticsPrivacyController({
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
        | AnalyticsPrivacyControllerActions
        | AnalyticsPrivacyServiceActions
        | {
            type: 'AnalyticsController:getState';
            handler: () => AnalyticsControllerState;
          },
        AnalyticsPrivacyControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const analyticsPrivacyControllerMessenger = new Messenger<
        'AnalyticsPrivacyController',
        | AnalyticsPrivacyControllerActions
        | AnalyticsPrivacyServiceActions
        | {
            type: 'AnalyticsController:getState';
            handler: () => AnalyticsControllerState;
          },
        AnalyticsPrivacyControllerEvents,
        typeof rootMessenger
      >({
        namespace: 'AnalyticsPrivacyController',
        parent: rootMessenger,
      });

      rootMessenger.registerActionHandler(
        'AnalyticsController:getState',
        () => ({
          analyticsId: 'test-analytics-id',
          optedIn: true,
        }),
      );

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

      // Controller is instantiated to register action handlers
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _controller = new AnalyticsPrivacyController({
        messenger: analyticsPrivacyControllerMessenger,
      });

      const response = await rootMessenger.call(
        'AnalyticsPrivacyController:createDataDeletionTask',
      );

      expect(response.status).toBe(DataDeleteResponseStatus.ok);
      expect(response.regulateId).toBeUndefined();
    });

    it('handles empty string regulateId (falsy but not null/undefined)', async () => {
      const rootMessenger = new Messenger<
        MockAnyNamespace,
        | AnalyticsPrivacyControllerActions
        | AnalyticsPrivacyServiceActions
        | {
            type: 'AnalyticsController:getState';
            handler: () => AnalyticsControllerState;
          },
        AnalyticsPrivacyControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const analyticsPrivacyControllerMessenger = new Messenger<
        'AnalyticsPrivacyController',
        | AnalyticsPrivacyControllerActions
        | AnalyticsPrivacyServiceActions
        | {
            type: 'AnalyticsController:getState';
            handler: () => AnalyticsControllerState;
          },
        AnalyticsPrivacyControllerEvents,
        typeof rootMessenger
      >({
        namespace: 'AnalyticsPrivacyController',
        parent: rootMessenger,
      });

      rootMessenger.registerActionHandler(
        'AnalyticsController:getState',
        () => ({
          analyticsId: 'test-analytics-id',
          optedIn: true,
        }),
      );

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

    it('handles null deleteRegulationTimestamp in status', async () => {
      const rootMessenger = new Messenger<
        MockAnyNamespace,
        | AnalyticsPrivacyControllerActions
        | AnalyticsPrivacyServiceActions
        | {
            type: 'AnalyticsController:getState';
            handler: () => AnalyticsControllerState;
          },
        AnalyticsPrivacyControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const analyticsPrivacyControllerMessenger = new Messenger<
        'AnalyticsPrivacyController',
        | AnalyticsPrivacyControllerActions
        | AnalyticsPrivacyServiceActions
        | {
            type: 'AnalyticsController:getState';
            handler: () => AnalyticsControllerState;
          },
        AnalyticsPrivacyControllerEvents,
        typeof rootMessenger
      >({
        namespace: 'AnalyticsPrivacyController',
        parent: rootMessenger,
      });

      rootMessenger.registerActionHandler(
        'AnalyticsController:getState',
        () => ({
          analyticsId: 'test-analytics-id',
          optedIn: true,
        }),
      );

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
        | AnalyticsPrivacyControllerActions
        | AnalyticsPrivacyServiceActions
        | {
            type: 'AnalyticsController:getState';
            handler: () => { analyticsId: string; optedIn: boolean };
          },
        AnalyticsPrivacyControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const analyticsPrivacyControllerMessenger = new Messenger<
        'AnalyticsPrivacyController',
        | AnalyticsPrivacyControllerActions
        | AnalyticsPrivacyServiceActions
        | {
            type: 'AnalyticsController:getState';
            handler: () => { analyticsId: string; optedIn: boolean };
          },
        AnalyticsPrivacyControllerEvents,
        typeof rootMessenger
      >({
        namespace: 'AnalyticsPrivacyController',
        parent: rootMessenger,
      });

      rootMessenger.registerActionHandler(
        'AnalyticsController:getState',
        () => {
          throw new Error('Analytics ID not found');
        },
      );

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

      // Controller is instantiated to register action handlers
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _controller = new AnalyticsPrivacyController({
        messenger: analyticsPrivacyControllerMessenger,
      });

      const response = await rootMessenger.call(
        'AnalyticsPrivacyController:createDataDeletionTask',
      );

      expect(response.status).toBe(DataDeleteResponseStatus.error);
      expect(response.error).toBe('Analytics ID not found');
    });

    it('returns error if service call fails', async () => {
      const rootMessenger = new Messenger<
        MockAnyNamespace,
        | AnalyticsPrivacyControllerActions
        | AnalyticsPrivacyServiceActions
        | {
            type: 'AnalyticsController:getState';
            handler: () => { analyticsId: string; optedIn: boolean };
          },
        AnalyticsPrivacyControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const analyticsPrivacyControllerMessenger = new Messenger<
        'AnalyticsPrivacyController',
        | AnalyticsPrivacyControllerActions
        | AnalyticsPrivacyServiceActions
        | {
            type: 'AnalyticsController:getState';
            handler: () => { analyticsId: string; optedIn: boolean };
          },
        AnalyticsPrivacyControllerEvents,
        typeof rootMessenger
      >({
        namespace: 'AnalyticsPrivacyController',
        parent: rootMessenger,
      });

      rootMessenger.registerActionHandler(
        'AnalyticsController:getState',
        () => ({
          analyticsId: 'test-analytics-id',
          optedIn: true,
        }),
      );

      rootMessenger.registerActionHandler(
        'AnalyticsPrivacyService:createDataDeletionTask',
        jest.fn().mockResolvedValue({
          status: DataDeleteResponseStatus.error,
          error: 'Service error',
        }),
      );

      rootMessenger.delegate({
        messenger: analyticsPrivacyControllerMessenger,
        actions: [
          'AnalyticsPrivacyService:createDataDeletionTask',
          'AnalyticsController:getState',
        ],
      });

      // Controller is instantiated to register action handlers
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _controller = new AnalyticsPrivacyController({
        messenger: analyticsPrivacyControllerMessenger,
      });

      const response = await rootMessenger.call(
        'AnalyticsPrivacyController:createDataDeletionTask',
      );

      expect(response.status).toBe(DataDeleteResponseStatus.error);
      expect(response.error).toBe('Service error');
    });

    it('does not update state if service returns error', async () => {
      const rootMessenger = new Messenger<
        MockAnyNamespace,
        | AnalyticsPrivacyControllerActions
        | AnalyticsPrivacyServiceActions
        | {
            type: 'AnalyticsController:getState';
            handler: () => { analyticsId: string; optedIn: boolean };
          },
        AnalyticsPrivacyControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const analyticsPrivacyControllerMessenger = new Messenger<
        'AnalyticsPrivacyController',
        | AnalyticsPrivacyControllerActions
        | AnalyticsPrivacyServiceActions
        | {
            type: 'AnalyticsController:getState';
            handler: () => { analyticsId: string; optedIn: boolean };
          },
        AnalyticsPrivacyControllerEvents,
        typeof rootMessenger
      >({
        namespace: 'AnalyticsPrivacyController',
        parent: rootMessenger,
      });

      rootMessenger.registerActionHandler(
        'AnalyticsController:getState',
        () => ({
          analyticsId: 'test-analytics-id',
          optedIn: true,
        }),
      );

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
      const testTimestamp = new Date('2026-01-15T12:00:00Z').getTime();
      const { rootMessenger } = setupController({
        state: {
          deleteRegulationId: 'test-regulation-id',
          deleteRegulationTimestamp: testTimestamp,
          dataRecorded: true,
        },
      });

      const status = await rootMessenger.call(
        'AnalyticsPrivacyController:checkDataDeleteStatus',
      );

      expect(status).toStrictEqual({
        deletionRequestTimestamp: testTimestamp,
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
        deletionRequestTimestamp: undefined,
        dataDeletionRequestStatus: DataDeleteStatus.unknown,
        hasCollectedDataSinceDeletionRequest: false,
      });
    });

    it('handles null deleteRegulationTimestamp in status', async () => {
      const rootMessenger = new Messenger<
        MockAnyNamespace,
        | AnalyticsPrivacyControllerActions
        | AnalyticsPrivacyServiceActions
        | {
            type: 'AnalyticsController:getState';
            handler: () => AnalyticsControllerState;
          },
        AnalyticsPrivacyControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const analyticsPrivacyControllerMessenger = new Messenger<
        'AnalyticsPrivacyController',
        | AnalyticsPrivacyControllerActions
        | AnalyticsPrivacyServiceActions
        | {
            type: 'AnalyticsController:getState';
            handler: () => AnalyticsControllerState;
          },
        AnalyticsPrivacyControllerEvents,
        typeof rootMessenger
      >({
        namespace: 'AnalyticsPrivacyController',
        parent: rootMessenger,
      });

      rootMessenger.registerActionHandler(
        'AnalyticsController:getState',
        () => ({
          analyticsId: 'test-analytics-id',
          optedIn: true,
        }),
      );

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

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _controller = new AnalyticsPrivacyController({
        messenger: analyticsPrivacyControllerMessenger,
        state: {
          deleteRegulationId: 'test-regulation-id',
          deleteRegulationTimestamp: null, // null timestamp
          dataRecorded: false,
        },
      });

      const status = await rootMessenger.call(
        'AnalyticsPrivacyController:checkDataDeleteStatus',
      );

      expect(status.deletionRequestTimestamp).toBeUndefined();
      expect(status.dataDeletionRequestStatus).toBe(DataDeleteStatus.finished);
    });

    it('handles service errors gracefully', async () => {
      const rootMessenger = new Messenger<
        MockAnyNamespace,
        | AnalyticsPrivacyControllerActions
        | AnalyticsPrivacyServiceActions
        | {
            type: 'AnalyticsController:getState';
            handler: () => { analyticsId: string; optedIn: boolean };
          },
        AnalyticsPrivacyControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const analyticsPrivacyControllerMessenger = new Messenger<
        'AnalyticsPrivacyController',
        | AnalyticsPrivacyControllerActions
        | AnalyticsPrivacyServiceActions
        | {
            type: 'AnalyticsController:getState';
            handler: () => { analyticsId: string; optedIn: boolean };
          },
        AnalyticsPrivacyControllerEvents,
        typeof rootMessenger
      >({
        namespace: 'AnalyticsPrivacyController',
        parent: rootMessenger,
      });

      rootMessenger.registerActionHandler(
        'AnalyticsController:getState',
        () => ({
          analyticsId: 'test-analytics-id',
          optedIn: true,
        }),
      );

      rootMessenger.registerActionHandler(
        'AnalyticsPrivacyService:checkDataDeleteStatus',
        jest.fn().mockRejectedValue(new Error('Service error')),
      );

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const testTimestamp = new Date('2026-01-15T12:00:00Z').getTime();
      const _controller = new AnalyticsPrivacyController({
        messenger: analyticsPrivacyControllerMessenger,
        state: {
          deleteRegulationId: 'test-regulation-id',
          deleteRegulationTimestamp: testTimestamp,
          dataRecorded: false,
        },
      });

      const status = await rootMessenger.call(
        'AnalyticsPrivacyController:checkDataDeleteStatus',
      );

      expect(status.dataDeletionRequestStatus).toBe(DataDeleteStatus.unknown);
      expect(status.deletionRequestTimestamp).toBe(testTimestamp);
      expect(status.hasCollectedDataSinceDeletionRequest).toBe(false);
    });
  });

  describe('AnalyticsPrivacyController:getDeleteRegulationCreationTimestamp', () => {
    it('returns the deletion timestamp when set', () => {
      const testTimestamp = new Date('2026-01-15T12:00:00Z').getTime();
      const { rootMessenger } = setupController({
        state: {
          deleteRegulationTimestamp: testTimestamp,
        },
      });

      const timestamp = rootMessenger.call(
        'AnalyticsPrivacyController:getDeleteRegulationCreationTimestamp',
      );

      expect(timestamp).toBe(testTimestamp);
    });

    it('returns undefined when deletion timestamp is not set', () => {
      const { rootMessenger } = setupController();

      const timestamp = rootMessenger.call(
        'AnalyticsPrivacyController:getDeleteRegulationCreationTimestamp',
      );

      expect(timestamp).toBeUndefined();
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

      rootMessenger.call('AnalyticsPrivacyController:updateDataRecordingFlag');

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
      const { rootMessenger, messenger } = setupController();

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
