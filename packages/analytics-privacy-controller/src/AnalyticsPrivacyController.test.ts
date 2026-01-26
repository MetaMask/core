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
import { DATA_DELETE_RESPONSE_STATUSES, DATA_DELETE_STATUSES } from './types';

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
      status: DATA_DELETE_RESPONSE_STATUSES.Success,
      regulateId: 'test-regulate-id',
    }),
  );

  rootMessenger.registerActionHandler(
    'AnalyticsPrivacyService:checkDataDeleteStatus',
    jest.fn().mockResolvedValue({
      status: DATA_DELETE_RESPONSE_STATUSES.Success,
      dataDeleteStatus: DATA_DELETE_STATUSES.Finished,
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
    it('returns default state with hasCollectedDataSinceDeletionRequest false and null regulation fields', () => {
      const defaults = getDefaultAnalyticsPrivacyControllerState();

      expect(defaults).toStrictEqual({
        hasCollectedDataSinceDeletionRequest: false,
        deleteRegulationId: null,
        deleteRegulationTimestamp: null,
      });
    });

    it('returns identical values on each call', () => {
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
        hasCollectedDataSinceDeletionRequest: true,
        deleteRegulationId: 'existing-id',
        deleteRegulationTimestamp: new Date('2026-01-15T12:00:00Z').getTime(),
      };

      const { controller } = setupController({ state: initialState });

      expect(controller.state).toStrictEqual(initialState);
    });

    it('merges provided partial state with default values', () => {
      const partialState = {
        hasCollectedDataSinceDeletionRequest: true,
      };

      const { controller } = setupController({ state: partialState });

      expect(controller.state.hasCollectedDataSinceDeletionRequest).toBe(true);
      expect(controller.state.deleteRegulationId).toBeNull();
      expect(controller.state.deleteRegulationTimestamp).toBeNull();
    });
  });

  describe('AnalyticsPrivacyController:createDataDeletionTask', () => {
    it('creates data deletion task and updates state with regulation ID and timestamp', async () => {
      const { controller, rootMessenger } = setupController();

      const fixedTimestamp = new Date('2026-01-15T12:00:00Z').getTime();
      jest.useFakeTimers();
      jest.setSystemTime(new Date(fixedTimestamp));

      const response = await rootMessenger.call(
        'AnalyticsPrivacyController:createDataDeletionTask',
      );

      expect(response.status).toBe(DATA_DELETE_RESPONSE_STATUSES.Success);
      expect(response.regulateId).toBe('test-regulate-id');
      expect(controller.state.deleteRegulationId).toBe('test-regulate-id');
      expect(controller.state.deleteRegulationTimestamp).toBe(fixedTimestamp);
      expect(controller.state.hasCollectedDataSinceDeletionRequest).toBe(false);

      jest.useRealTimers();
    });

    it('stores deletion timestamp as number when task is created', async () => {
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
          status: DATA_DELETE_RESPONSE_STATUSES.Success,
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

    it('emits dataDeletionTaskCreated event with response payload', async () => {
      const { rootMessenger, messenger } = setupController();
      const eventListener = jest.fn();

      messenger.subscribe(
        'AnalyticsPrivacyController:dataDeletionTaskCreated',
        eventListener,
      );

      const response = await rootMessenger.call(
        'AnalyticsPrivacyController:createDataDeletionTask',
      );

      expect(response.status).toBe(DATA_DELETE_RESPONSE_STATUSES.Success);
      expect(response.regulateId).toBe('test-regulate-id');

      expect(eventListener).toHaveBeenCalledWith({
        status: DATA_DELETE_RESPONSE_STATUSES.Success,
        regulateId: 'test-regulate-id',
      });
    });

    it('returns error response when analyticsId is empty string', async () => {
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
          status: DATA_DELETE_RESPONSE_STATUSES.Success,
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

      expect(response.status).toBe(DATA_DELETE_RESPONSE_STATUSES.Failure);
      expect(response.error).toBe(
        'Analytics ID not found. You need to set up AnalyticsController with an analytics ID. You can do this by initializing the AnalyticsController with a valid analytics ID before creating a data deletion task.',
      );
    });

    it('returns error response without updating state when service throws error for missing regulateId', async () => {
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
        jest
          .fn()
          .mockRejectedValue(
            new Error(
              'Malformed response from Segment API: missing or invalid regulateId',
            ),
          ),
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

      expect(response.status).toBe(DATA_DELETE_RESPONSE_STATUSES.Failure);
      expect(response.error).toBe(
        'Malformed response from Segment API: missing or invalid regulateId',
      );
    });

    it('returns error response without updating state when service throws error for empty regulateId', async () => {
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
        jest
          .fn()
          .mockRejectedValue(
            new Error(
              'Malformed response from Segment API: missing or invalid regulateId',
            ),
          ),
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

      expect(response.status).toBe(DATA_DELETE_RESPONSE_STATUSES.Failure);
      expect(response.error).toBe(
        'Malformed response from Segment API: missing or invalid regulateId',
      );
      // State should not be updated when service throws error
      expect(controller.state.deleteRegulationId).toBeNull();
    });

    it('returns error response and does not update state when service throws error for undefined regulateId', async () => {
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
        jest
          .fn()
          .mockRejectedValue(
            new Error(
              'Malformed response from Segment API: missing or invalid regulateId',
            ),
          ),
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

      expect(response.status).toBe(DATA_DELETE_RESPONSE_STATUSES.Failure);
      expect(response.error).toBe(
        'Malformed response from Segment API: missing or invalid regulateId',
      );
      expect(controller.state.deleteRegulationId).toBeNull();
    });

    it('returns error response when AnalyticsController:getState throws Error', async () => {
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
          status: DATA_DELETE_RESPONSE_STATUSES.Success,
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

      expect(response.status).toBe(DATA_DELETE_RESPONSE_STATUSES.Failure);
      expect(response.error).toBe('Analytics ID not found');
    });

    it('returns error response with default message when service throws non-Error value', async () => {
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
        jest.fn().mockRejectedValue('String error'),
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

      expect(response.status).toBe(DATA_DELETE_RESPONSE_STATUSES.Failure);
      expect(response.error).toBe('Analytics Deletion Task Error');
    });

    it('returns error response when service throws error', async () => {
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
        jest.fn().mockRejectedValue(new Error('Service error')),
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

      expect(response.status).toBe(DATA_DELETE_RESPONSE_STATUSES.Failure);
      expect(response.error).toBe('Service error');
    });

    it('preserves initial state when service throws error', async () => {
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
        jest.fn().mockRejectedValue(new Error('Service error')),
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
    it('returns status with timestamp, deletion status, and data recorded flag when regulationId exists', async () => {
      const testTimestamp = new Date('2026-01-15T12:00:00Z').getTime();
      const { rootMessenger } = setupController({
        state: {
          deleteRegulationId: 'test-regulation-id',
          deleteRegulationTimestamp: testTimestamp,
          hasCollectedDataSinceDeletionRequest: true,
        },
      });

      const status = await rootMessenger.call(
        'AnalyticsPrivacyController:checkDataDeleteStatus',
      );

      expect(status).toStrictEqual({
        deletionRequestTimestamp: testTimestamp,
        dataDeletionRequestStatus: DATA_DELETE_STATUSES.Finished,
        hasCollectedDataSinceDeletionRequest: true,
      });
    });

    it('returns status with unknown deletion status when regulationId is null', async () => {
      const { rootMessenger } = setupController();

      const status = await rootMessenger.call(
        'AnalyticsPrivacyController:checkDataDeleteStatus',
      );

      expect(status).toStrictEqual({
        deletionRequestTimestamp: undefined,
        dataDeletionRequestStatus: DATA_DELETE_STATUSES.Unknown,
        hasCollectedDataSinceDeletionRequest: false,
      });
    });

    it('returns undefined timestamp when deleteRegulationTimestamp is null', async () => {
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
          status: DATA_DELETE_RESPONSE_STATUSES.Success,
          dataDeleteStatus: DATA_DELETE_STATUSES.Finished,
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
          hasCollectedDataSinceDeletionRequest: false,
        },
      });

      const status = await rootMessenger.call(
        'AnalyticsPrivacyController:checkDataDeleteStatus',
      );

      expect(status.deletionRequestTimestamp).toBeUndefined();
      expect(status.dataDeletionRequestStatus).toBe(
        DATA_DELETE_STATUSES.Finished,
      );
    });

    it('returns unknown deletion status when service throws Error', async () => {
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

      const testTimestamp = new Date('2026-01-15T12:00:00Z').getTime();
      // Controller is instantiated to register action handlers
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _controller = new AnalyticsPrivacyController({
        messenger: analyticsPrivacyControllerMessenger,
        state: {
          deleteRegulationId: 'test-regulation-id',
          deleteRegulationTimestamp: testTimestamp,
          hasCollectedDataSinceDeletionRequest: false,
        },
      });

      const status = await rootMessenger.call(
        'AnalyticsPrivacyController:checkDataDeleteStatus',
      );

      expect(status.dataDeletionRequestStatus).toBe(
        DATA_DELETE_STATUSES.Unknown,
      );
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
          hasCollectedDataSinceDeletionRequest: true,
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
    it('sets hasCollectedDataSinceDeletionRequest to true when saveDataRecording is true', () => {
      const { controller, rootMessenger } = setupController({
        state: {
          hasCollectedDataSinceDeletionRequest: false,
        },
      });

      rootMessenger.call(
        'AnalyticsPrivacyController:updateDataRecordingFlag',
        true,
      );

      expect(controller.state.hasCollectedDataSinceDeletionRequest).toBe(true);
    });

    it('preserves hasCollectedDataSinceDeletionRequest value when saveDataRecording is false', () => {
      const { controller, rootMessenger } = setupController({
        state: {
          hasCollectedDataSinceDeletionRequest: false,
        },
      });

      rootMessenger.call(
        'AnalyticsPrivacyController:updateDataRecordingFlag',
        false,
      );

      expect(controller.state.hasCollectedDataSinceDeletionRequest).toBe(false);
    });

    it('preserves hasCollectedDataSinceDeletionRequest value when already true', () => {
      const { controller, rootMessenger } = setupController({
        state: {
          hasCollectedDataSinceDeletionRequest: true,
        },
      });

      rootMessenger.call(
        'AnalyticsPrivacyController:updateDataRecordingFlag',
        true,
      );

      expect(controller.state.hasCollectedDataSinceDeletionRequest).toBe(true);
    });

    it('sets hasCollectedDataSinceDeletionRequest to true when saveDataRecording is omitted', () => {
      const { controller, rootMessenger } = setupController({
        state: {
          hasCollectedDataSinceDeletionRequest: false,
        },
      });

      rootMessenger.call('AnalyticsPrivacyController:updateDataRecordingFlag');

      expect(controller.state.hasCollectedDataSinceDeletionRequest).toBe(true);
    });

    it('emits dataRecordingFlagUpdated event with true when hasCollectedDataSinceDeletionRequest changes from false to true', () => {
      const { rootMessenger } = setupController({
        state: {
          hasCollectedDataSinceDeletionRequest: false,
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

    it('does not emit event when saveDataRecording is false', () => {
      const { rootMessenger } = setupController({
        state: {
          hasCollectedDataSinceDeletionRequest: false,
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
    it('emits stateChange event with new state when hasCollectedDataSinceDeletionRequest is updated', () => {
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
      expect(newState.hasCollectedDataSinceDeletionRequest).toBe(true);
    });
  });
});
