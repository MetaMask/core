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
  analyticsId?: string;
};

type SetupControllerReturn = {
  controller: AnalyticsPrivacyController;
  messenger: AnalyticsPrivacyControllerMessenger;
  rootMessenger: Messenger<
    MockAnyNamespace,
    AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions,
    AnalyticsPrivacyControllerEvents
  >;
};

/**
 * Sets up an AnalyticsPrivacyController for testing.
 *
 * @param options - Controller options
 * @param options.state - Optional partial controller state
 * @param options.analyticsId - Optional analytics ID (defaults to 'test-analytics-id')
 * @returns The controller, messenger, and root messenger
 */
function setupController(
  options: SetupControllerOptions = {},
): SetupControllerReturn {
  const { state = {}, analyticsId = 'test-analytics-id' } = options;

  const rootMessenger = new Messenger<
    MockAnyNamespace,
    AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions,
    AnalyticsPrivacyControllerEvents
  >({ namespace: MOCK_ANY_NAMESPACE });

  const analyticsPrivacyControllerMessenger = new Messenger<
    'AnalyticsPrivacyController',
    AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions,
    AnalyticsPrivacyControllerEvents,
    typeof rootMessenger
  >({
    namespace: 'AnalyticsPrivacyController',
    parent: rootMessenger,
  });

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

  // Delegate service actions to controller messenger
  rootMessenger.delegate({
    messenger: analyticsPrivacyControllerMessenger,
    actions: [
      'AnalyticsPrivacyService:createDataDeletionTask',
      'AnalyticsPrivacyService:checkDataDeleteStatus',
    ],
  });

  const controller = new AnalyticsPrivacyController({
    messenger: analyticsPrivacyControllerMessenger,
    state,
    analyticsId,
  });

  return {
    controller,
    messenger: analyticsPrivacyControllerMessenger,
    rootMessenger,
  };
}

describe('AnalyticsPrivacyController', () => {
  describe('getDefaultAnalyticsPrivacyControllerState', () => {
    it('returns default state with hasCollectedDataSinceDeletionRequest false and undefined regulation fields', () => {
      const defaults = getDefaultAnalyticsPrivacyControllerState();

      expect(defaults).toStrictEqual({
        hasCollectedDataSinceDeletionRequest: false,
      });
      expect(defaults.deleteRegulationId).toBeUndefined();
      expect(defaults.deleteRegulationTimestamp).toBeUndefined();
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
      expect(controller.state.deleteRegulationId).toBeUndefined();
      expect(controller.state.deleteRegulationTimestamp).toBeUndefined();
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
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions,
        AnalyticsPrivacyControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const analyticsPrivacyControllerMessenger = new Messenger<
        'AnalyticsPrivacyController',
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions,
        AnalyticsPrivacyControllerEvents,
        typeof rootMessenger
      >({
        namespace: 'AnalyticsPrivacyController',
        parent: rootMessenger,
      });

      rootMessenger.registerActionHandler(
        'AnalyticsPrivacyService:createDataDeletionTask',
        jest.fn().mockResolvedValue({
          status: DATA_DELETE_RESPONSE_STATUSES.Success,
          regulateId: 'test-regulate-id',
        }),
      );

      rootMessenger.delegate({
        messenger: analyticsPrivacyControllerMessenger,
        actions: ['AnalyticsPrivacyService:createDataDeletionTask'],
      });

      const controller = new AnalyticsPrivacyController({
        messenger: analyticsPrivacyControllerMessenger,
        analyticsId: 'test-analytics-id',
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

    it('throws error when analyticsId is empty string', async () => {
      const rootMessenger = new Messenger<
        MockAnyNamespace,
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions,
        AnalyticsPrivacyControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const analyticsPrivacyControllerMessenger = new Messenger<
        'AnalyticsPrivacyController',
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions,
        AnalyticsPrivacyControllerEvents,
        typeof rootMessenger
      >({
        namespace: 'AnalyticsPrivacyController',
        parent: rootMessenger,
      });

      rootMessenger.registerActionHandler(
        'AnalyticsPrivacyService:createDataDeletionTask',
        jest.fn().mockResolvedValue({
          status: DATA_DELETE_RESPONSE_STATUSES.Success,
          regulateId: 'test-regulate-id',
        }),
      );

      rootMessenger.delegate({
        messenger: analyticsPrivacyControllerMessenger,
        actions: ['AnalyticsPrivacyService:createDataDeletionTask'],
      });

      // Controller is instantiated to register action handlers
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _controller = new AnalyticsPrivacyController({
        messenger: analyticsPrivacyControllerMessenger,
        analyticsId: '', // Empty string to test the !analyticsId check
      });

      await expect(
        rootMessenger.call('AnalyticsPrivacyController:createDataDeletionTask'),
      ).rejects.toThrow(
        'Analytics ID not found. You need to provide a valid analytics ID when initializing the AnalyticsPrivacyController.',
      );
    });

    it('throws error without updating state when service throws error for missing regulateId', async () => {
      const rootMessenger = new Messenger<
        MockAnyNamespace,
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions,
        AnalyticsPrivacyControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const analyticsPrivacyControllerMessenger = new Messenger<
        'AnalyticsPrivacyController',
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions,
        AnalyticsPrivacyControllerEvents,
        typeof rootMessenger
      >({
        namespace: 'AnalyticsPrivacyController',
        parent: rootMessenger,
      });

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
        actions: ['AnalyticsPrivacyService:createDataDeletionTask'],
      });

      // Controller is instantiated to register action handlers
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _controller = new AnalyticsPrivacyController({
        messenger: analyticsPrivacyControllerMessenger,
        analyticsId: 'test-analytics-id',
      });

      await expect(
        rootMessenger.call('AnalyticsPrivacyController:createDataDeletionTask'),
      ).rejects.toThrow(
        'Malformed response from Segment API: missing or invalid regulateId',
      );
    });

    it('throws error without updating state when service throws error for empty regulateId', async () => {
      const rootMessenger = new Messenger<
        MockAnyNamespace,
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions,
        AnalyticsPrivacyControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const analyticsPrivacyControllerMessenger = new Messenger<
        'AnalyticsPrivacyController',
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions,
        AnalyticsPrivacyControllerEvents,
        typeof rootMessenger
      >({
        namespace: 'AnalyticsPrivacyController',
        parent: rootMessenger,
      });

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
        actions: ['AnalyticsPrivacyService:createDataDeletionTask'],
      });

      const controller = new AnalyticsPrivacyController({
        messenger: analyticsPrivacyControllerMessenger,
        analyticsId: 'test-analytics-id',
      });

      await expect(
        rootMessenger.call('AnalyticsPrivacyController:createDataDeletionTask'),
      ).rejects.toThrow(
        'Malformed response from Segment API: missing or invalid regulateId',
      );
      // State should not be updated when service throws error
      expect(controller.state.deleteRegulationId).toBeUndefined();
    });

    it('throws error and does not update state when service throws error for undefined regulateId', async () => {
      const rootMessenger = new Messenger<
        MockAnyNamespace,
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions,
        AnalyticsPrivacyControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const analyticsPrivacyControllerMessenger = new Messenger<
        'AnalyticsPrivacyController',
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions,
        AnalyticsPrivacyControllerEvents,
        typeof rootMessenger
      >({
        namespace: 'AnalyticsPrivacyController',
        parent: rootMessenger,
      });

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
        actions: ['AnalyticsPrivacyService:createDataDeletionTask'],
      });

      const controller = new AnalyticsPrivacyController({
        messenger: analyticsPrivacyControllerMessenger,
        analyticsId: 'test-analytics-id',
      });

      await expect(
        rootMessenger.call('AnalyticsPrivacyController:createDataDeletionTask'),
      ).rejects.toThrow(
        'Malformed response from Segment API: missing or invalid regulateId',
      );
      expect(controller.state.deleteRegulationId).toBeUndefined();
    });

    it('throws error when service throws non-Error value', async () => {
      const rootMessenger = new Messenger<
        MockAnyNamespace,
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions,
        AnalyticsPrivacyControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const analyticsPrivacyControllerMessenger = new Messenger<
        'AnalyticsPrivacyController',
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions,
        AnalyticsPrivacyControllerEvents,
        typeof rootMessenger
      >({
        namespace: 'AnalyticsPrivacyController',
        parent: rootMessenger,
      });

      rootMessenger.registerActionHandler(
        'AnalyticsPrivacyService:createDataDeletionTask',
        jest.fn().mockRejectedValue('String error'),
      );

      rootMessenger.delegate({
        messenger: analyticsPrivacyControllerMessenger,
        actions: ['AnalyticsPrivacyService:createDataDeletionTask'],
      });

      // Controller is instantiated to register action handlers
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _controller = new AnalyticsPrivacyController({
        messenger: analyticsPrivacyControllerMessenger,
        analyticsId: 'test-analytics-id',
      });

      await expect(
        rootMessenger.call('AnalyticsPrivacyController:createDataDeletionTask'),
      ).rejects.toBe('String error');
    });

    it('throws error when service throws error', async () => {
      const rootMessenger = new Messenger<
        MockAnyNamespace,
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions,
        AnalyticsPrivacyControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const analyticsPrivacyControllerMessenger = new Messenger<
        'AnalyticsPrivacyController',
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions,
        AnalyticsPrivacyControllerEvents,
        typeof rootMessenger
      >({
        namespace: 'AnalyticsPrivacyController',
        parent: rootMessenger,
      });

      rootMessenger.registerActionHandler(
        'AnalyticsPrivacyService:createDataDeletionTask',
        jest.fn().mockRejectedValue(new Error('Service error')),
      );

      rootMessenger.delegate({
        messenger: analyticsPrivacyControllerMessenger,
        actions: ['AnalyticsPrivacyService:createDataDeletionTask'],
      });

      // Controller is instantiated to register action handlers
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _controller = new AnalyticsPrivacyController({
        messenger: analyticsPrivacyControllerMessenger,
        analyticsId: 'test-analytics-id',
      });

      await expect(
        rootMessenger.call('AnalyticsPrivacyController:createDataDeletionTask'),
      ).rejects.toThrow('Service error');
    });

    it('preserves initial state when service throws error', async () => {
      const rootMessenger = new Messenger<
        MockAnyNamespace,
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions,
        AnalyticsPrivacyControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const analyticsPrivacyControllerMessenger = new Messenger<
        'AnalyticsPrivacyController',
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions,
        AnalyticsPrivacyControllerEvents,
        typeof rootMessenger
      >({
        namespace: 'AnalyticsPrivacyController',
        parent: rootMessenger,
      });

      rootMessenger.registerActionHandler(
        'AnalyticsPrivacyService:createDataDeletionTask',
        jest.fn().mockRejectedValue(new Error('Service error')),
      );

      rootMessenger.delegate({
        messenger: analyticsPrivacyControllerMessenger,
        actions: ['AnalyticsPrivacyService:createDataDeletionTask'],
      });

      const controller = new AnalyticsPrivacyController({
        messenger: analyticsPrivacyControllerMessenger,
        analyticsId: 'test-analytics-id',
      });
      const initialState = controller.state;

      await expect(
        rootMessenger.call('AnalyticsPrivacyController:createDataDeletionTask'),
      ).rejects.toThrow('Service error');

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

    it('returns undefined timestamp when deleteRegulationTimestamp is not set', async () => {
      const rootMessenger = new Messenger<
        MockAnyNamespace,
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions,
        AnalyticsPrivacyControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const analyticsPrivacyControllerMessenger = new Messenger<
        'AnalyticsPrivacyController',
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions,
        AnalyticsPrivacyControllerEvents,
        typeof rootMessenger
      >({
        namespace: 'AnalyticsPrivacyController',
        parent: rootMessenger,
      });

      rootMessenger.registerActionHandler(
        'AnalyticsPrivacyService:checkDataDeleteStatus',
        jest.fn().mockResolvedValue({
          status: DATA_DELETE_RESPONSE_STATUSES.Success,
          dataDeleteStatus: DATA_DELETE_STATUSES.Finished,
        }),
      );

      rootMessenger.delegate({
        messenger: analyticsPrivacyControllerMessenger,
        actions: ['AnalyticsPrivacyService:checkDataDeleteStatus'],
      });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _controller = new AnalyticsPrivacyController({
        messenger: analyticsPrivacyControllerMessenger,
        analyticsId: 'test-analytics-id',
        state: {
          deleteRegulationId: 'test-regulation-id',
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

    it('throws error when service throws Error', async () => {
      const rootMessenger = new Messenger<
        MockAnyNamespace,
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions,
        AnalyticsPrivacyControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const analyticsPrivacyControllerMessenger = new Messenger<
        'AnalyticsPrivacyController',
        AnalyticsPrivacyControllerActions | AnalyticsPrivacyServiceActions,
        AnalyticsPrivacyControllerEvents,
        typeof rootMessenger
      >({
        namespace: 'AnalyticsPrivacyController',
        parent: rootMessenger,
      });

      rootMessenger.registerActionHandler(
        'AnalyticsPrivacyService:checkDataDeleteStatus',
        jest.fn().mockRejectedValue(new Error('Service error')),
      );

      rootMessenger.delegate({
        messenger: analyticsPrivacyControllerMessenger,
        actions: ['AnalyticsPrivacyService:checkDataDeleteStatus'],
      });

      // Controller is instantiated to register action handlers
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _controller = new AnalyticsPrivacyController({
        messenger: analyticsPrivacyControllerMessenger,
        analyticsId: 'test-analytics-id',
        state: {
          deleteRegulationId: 'test-regulation-id',
          deleteRegulationTimestamp: new Date('2026-01-15T12:00:00Z').getTime(),
          hasCollectedDataSinceDeletionRequest: false,
        },
      });

      await expect(
        rootMessenger.call('AnalyticsPrivacyController:checkDataDeleteStatus'),
      ).rejects.toThrow('Service error');
    });
  });

  describe('AnalyticsPrivacyController:updateDataRecordingFlag', () => {
    it('sets hasCollectedDataSinceDeletionRequest to true', () => {
      const { controller, rootMessenger } = setupController({
        state: {
          hasCollectedDataSinceDeletionRequest: false,
        },
      });

      rootMessenger.call('AnalyticsPrivacyController:updateDataRecordingFlag');

      expect(controller.state.hasCollectedDataSinceDeletionRequest).toBe(true);
    });

    it('preserves hasCollectedDataSinceDeletionRequest value when already true', () => {
      const { controller, rootMessenger } = setupController({
        state: {
          hasCollectedDataSinceDeletionRequest: true,
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

      rootMessenger.call('AnalyticsPrivacyController:updateDataRecordingFlag');

      expect(eventListener).toHaveBeenCalledWith(true);
    });

    it('does not emit dataRecordingFlagUpdated event when hasCollectedDataSinceDeletionRequest is already true', () => {
      const { rootMessenger } = setupController({
        state: {
          hasCollectedDataSinceDeletionRequest: true,
        },
      });

      const eventListener = jest.fn();
      rootMessenger.subscribe(
        'AnalyticsPrivacyController:dataRecordingFlagUpdated',
        eventListener,
      );

      rootMessenger.call('AnalyticsPrivacyController:updateDataRecordingFlag');

      expect(eventListener).not.toHaveBeenCalled();
    });
  });

  describe('stateChange event', () => {
    it('emits stateChange event with new state when hasCollectedDataSinceDeletionRequest is updated', () => {
      const { rootMessenger, messenger } = setupController({
        state: {
          hasCollectedDataSinceDeletionRequest: false,
        },
      });

      const eventListener = jest.fn();
      messenger.subscribe(
        'AnalyticsPrivacyController:stateChange',
        eventListener,
      );

      rootMessenger.call('AnalyticsPrivacyController:updateDataRecordingFlag');

      expect(eventListener).toHaveBeenCalled();
      const [newState] = eventListener.mock.calls[0];
      expect(newState.hasCollectedDataSinceDeletionRequest).toBe(true);
    });

    it('does not emit stateChange event when hasCollectedDataSinceDeletionRequest is already true', () => {
      const { rootMessenger, messenger } = setupController({
        state: {
          hasCollectedDataSinceDeletionRequest: true,
        },
      });

      const eventListener = jest.fn();
      messenger.subscribe(
        'AnalyticsPrivacyController:stateChange',
        eventListener,
      );

      rootMessenger.call('AnalyticsPrivacyController:updateDataRecordingFlag');

      expect(eventListener).not.toHaveBeenCalled();
    });
  });
});
