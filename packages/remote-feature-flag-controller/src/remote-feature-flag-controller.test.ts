import { deriveStateFromMetadata } from '@metamask/base-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';

import type { AbstractClientConfigApiService } from './client-config-api-service/abstract-client-config-api-service';
import {
  RemoteFeatureFlagController,
  controllerName,
  DEFAULT_CACHE_DURATION,
  getDefaultRemoteFeatureFlagControllerState,
} from './remote-feature-flag-controller';
import type {
  RemoteFeatureFlagControllerMessenger,
  RemoteFeatureFlagControllerState,
} from './remote-feature-flag-controller';
import type { FeatureFlags } from './remote-feature-flag-controller-types';

const MOCK_FLAGS: FeatureFlags = {
  feature1: true,
  feature2: { chrome: '<109' },
  feature3: [1, 2, 3],
};

const MOCK_FLAGS_TWO = { different: true };

const MOCK_FLAGS_WITH_THRESHOLD = {
  ...MOCK_FLAGS,
  testFlagForThreshold: [
    {
      name: 'groupA',
      scope: { type: 'threshold', value: 0.3 },
      value: 'valueA',
    },
    {
      name: 'groupB',
      scope: { type: 'threshold', value: 0.5 },
      value: 'valueB',
    },
    { name: 'groupC', scope: { type: 'threshold', value: 1 }, value: 'valueC' },
  ],
};

const MOCK_METRICS_ID = 'f9e8d7c6-b5a4-4210-9876-543210fedcba';
const MOCK_BASE_VERSION = '13.10.0';

/**
 * Creates a controller instance with default parameters for testing
 *
 * @param options - The controller configuration options
 * @param options.messenger - The messenger instance
 * @param options.state - The initial controller state
 * @param options.clientConfigApiService - The client config API service instance
 * @param options.disabled - Whether the controller should start disabled
 * @returns A configured RemoteFeatureFlagController instance
 */
function createController(
  options: Partial<{
    messenger: RemoteFeatureFlagControllerMessenger;
    state: Partial<RemoteFeatureFlagControllerState>;
    clientConfigApiService: AbstractClientConfigApiService;
    disabled: boolean;
    getMetaMetricsId: () => string;
    clientVersion: string;
  }> = {},
) {
  return new RemoteFeatureFlagController({
    messenger: getMessenger(),
    state: options.state,
    clientConfigApiService:
      options.clientConfigApiService ?? buildClientConfigApiService(),
    disabled: options.disabled,
    getMetaMetricsId: options.getMetaMetricsId ?? (() => MOCK_METRICS_ID),
    clientVersion: options.clientVersion ?? MOCK_BASE_VERSION,
  });
}

describe('RemoteFeatureFlagController', () => {
  describe('constructor', () => {
    it('initializes with default state', () => {
      const controller = createController();

      expect(controller.state).toStrictEqual({
        remoteFeatureFlags: {},
        localOverrides: {},
        rawProcessedRemoteFeatureFlags: {},
        cacheTimestamp: 0,
      });
    });

    it('initializes with default state if the disabled parameter is provided', () => {
      const controller = createController({ disabled: true });

      expect(controller.state).toStrictEqual({
        remoteFeatureFlags: {},
        localOverrides: {},
        rawProcessedRemoteFeatureFlags: {},
        cacheTimestamp: 0,
      });
    });

    it('initializes with custom state', () => {
      const customState = {
        remoteFeatureFlags: MOCK_FLAGS_TWO,
        cacheTimestamp: 123456789,
        rawProcessedRemoteFeatureFlags: {},
        localOverrides: {},
      };

      const controller = createController({ state: customState });

      expect(controller.state).toStrictEqual(customState);
    });

    it('accepts valid 3-part SemVer clientVersion', () => {
      expect(() =>
        createController({ clientVersion: MOCK_BASE_VERSION }),
      ).not.toThrow();
      expect(() => createController({ clientVersion: '1.0.0' })).not.toThrow();
      expect(() => createController({ clientVersion: '14.5.2' })).not.toThrow();
    });

    it('throws error for invalid clientVersion formats', () => {
      expect(() => createController({ clientVersion: '13.10' })).toThrow(
        'Invalid clientVersion: "13.10". Must be a valid 3-part SemVer version string',
      );

      expect(() => createController({ clientVersion: '13' })).toThrow(
        'Invalid clientVersion: "13". Must be a valid 3-part SemVer version string',
      );

      expect(() => createController({ clientVersion: '13.10.0.1' })).toThrow(
        'Invalid clientVersion: "13.10.0.1". Must be a valid 3-part SemVer version string',
      );

      expect(() =>
        createController({ clientVersion: 'invalid-version' }),
      ).toThrow(
        'Invalid clientVersion: "invalid-version". Must be a valid 3-part SemVer version string',
      );

      expect(() => createController({ clientVersion: '' })).toThrow(
        'Invalid clientVersion: "". Must be a valid 3-part SemVer version string',
      );
    });
  });

  describe('updateRemoteFeatureFlags', () => {
    it('does not make a network request and does not modify state if disabled is true', async () => {
      const clientConfigApiService = buildClientConfigApiService();
      const controller = createController({
        state: {
          remoteFeatureFlags: MOCK_FLAGS,
        },
        clientConfigApiService,
        disabled: true,
      });

      await controller.updateRemoteFeatureFlags();

      expect(controller.state.remoteFeatureFlags).toStrictEqual(MOCK_FLAGS);
      expect(
        clientConfigApiService.fetchRemoteFeatureFlags,
      ).not.toHaveBeenCalled();
    });

    it('does not make a network request and does not modify state when cache is not expired', async () => {
      const clientConfigApiService = buildClientConfigApiService();
      const controller = createController({
        state: {
          remoteFeatureFlags: MOCK_FLAGS,
          cacheTimestamp: Date.now() - 10,
        },
        clientConfigApiService,
      });
      await controller.updateRemoteFeatureFlags();

      expect(
        clientConfigApiService.fetchRemoteFeatureFlags,
      ).not.toHaveBeenCalled();
      expect(controller.state.remoteFeatureFlags).toStrictEqual(MOCK_FLAGS);
    });

    it('makes a network request to fetch when cache is expired, and then updates the cache', async () => {
      const clientConfigApiService = buildClientConfigApiService({
        cacheTimestamp: Date.now() - 10000,
      });
      const controller = createController({
        clientConfigApiService,
        disabled: false,
      });

      // Mock different response
      jest
        .spyOn(clientConfigApiService, 'fetchRemoteFeatureFlags')
        .mockImplementation(async () => ({
          remoteFeatureFlags: MOCK_FLAGS_TWO,
          cacheTimestamp: Date.now(),
        }));

      await controller.updateRemoteFeatureFlags();
      expect(
        clientConfigApiService.fetchRemoteFeatureFlags,
      ).toHaveBeenCalledTimes(1);
      expect(controller.state.remoteFeatureFlags).toStrictEqual(MOCK_FLAGS_TWO);
    });

    it('uses previously cached flags when cache is valid', async () => {
      const clientConfigApiService = buildClientConfigApiService();
      const controller = createController({
        clientConfigApiService,
        state: {
          remoteFeatureFlags: MOCK_FLAGS,
          cacheTimestamp: Date.now() - 10,
        },
      });

      // Mock different response
      jest
        .spyOn(clientConfigApiService, 'fetchRemoteFeatureFlags')
        .mockImplementation(() =>
          buildClientConfigApiService({
            remoteFeatureFlags: { differentFlag: true },
          }).fetchRemoteFeatureFlags(),
        );

      await controller.updateRemoteFeatureFlags();

      expect(controller.state.remoteFeatureFlags).toStrictEqual(MOCK_FLAGS);
    });

    it('makes one network request, and only one state update, when there are concurrent calls', async () => {
      const clientConfigApiService = buildClientConfigApiService();
      const controller = createController({ clientConfigApiService });

      await Promise.all([
        controller.updateRemoteFeatureFlags(),
        controller.updateRemoteFeatureFlags(),
      ]);

      expect(
        clientConfigApiService.fetchRemoteFeatureFlags,
      ).toHaveBeenCalledTimes(1);

      expect(controller.state.remoteFeatureFlags).toStrictEqual(MOCK_FLAGS);
    });

    it('creates a new fetch, and correctly updates state, when called sequentially with awaiting and sufficient delay', async () => {
      jest.useFakeTimers();
      const initialTime = Date.now();
      const fetchSpy = jest
        .fn()
        .mockResolvedValueOnce({
          remoteFeatureFlags: MOCK_FLAGS,
          cacheTimestamp: Date.now(),
        })
        .mockResolvedValueOnce({
          remoteFeatureFlags: MOCK_FLAGS_TWO,
          cacheTimestamp: Date.now(),
        });

      const clientConfigApiService = {
        fetchRemoteFeatureFlags: fetchSpy,
      } as AbstractClientConfigApiService;

      const controller = createController({
        clientConfigApiService,
        state: { remoteFeatureFlags: {}, cacheTimestamp: 0 },
      });

      let currentState;

      // First call - should fetch new data
      await controller.updateRemoteFeatureFlags();
      currentState = controller.state;
      expect(currentState.remoteFeatureFlags).toStrictEqual(MOCK_FLAGS);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Advance time past cache duration
      jest.setSystemTime(initialTime + 2 * DEFAULT_CACHE_DURATION);

      // Second call - should fetch new data again
      await controller.updateRemoteFeatureFlags();
      currentState = controller.state;
      expect(currentState.remoteFeatureFlags).toStrictEqual(MOCK_FLAGS_TWO);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('throws an API error to the caller, while leaving cached state unchanged', async () => {
      const clientConfigApiService = buildClientConfigApiService({
        error: new Error('API Error'),
      });

      const controller = createController({
        clientConfigApiService,
        state: {
          remoteFeatureFlags: MOCK_FLAGS,
        },
      });

      await expect(
        async () => await controller.updateRemoteFeatureFlags(),
      ).rejects.toThrow('API Error');
      expect(controller.state.remoteFeatureFlags).toStrictEqual(MOCK_FLAGS);
    });
  });

  describe('threshold feature flags', () => {
    it('processes threshold feature flags based on provided metaMetricsId', async () => {
      const clientConfigApiService = buildClientConfigApiService({
        remoteFeatureFlags: MOCK_FLAGS_WITH_THRESHOLD,
      });
      const controller = createController({
        clientConfigApiService,
        getMetaMetricsId: () => MOCK_METRICS_ID,
      });
      await controller.updateRemoteFeatureFlags();

      expect(
        controller.state.remoteFeatureFlags.testFlagForThreshold,
      ).toStrictEqual({
        name: 'groupC',
        value: 'valueC',
      });
    });

    it('preserves non-threshold feature flags unchanged', async () => {
      const clientConfigApiService = buildClientConfigApiService({
        remoteFeatureFlags: MOCK_FLAGS_WITH_THRESHOLD,
      });
      const controller = createController({
        clientConfigApiService,
        getMetaMetricsId: () => MOCK_METRICS_ID,
      });
      await controller.updateRemoteFeatureFlags();

      const { testFlagForThreshold, ...nonThresholdFlags } =
        controller.state.remoteFeatureFlags;
      expect(nonThresholdFlags).toStrictEqual(MOCK_FLAGS);
    });
  });

  describe('enable and disable', () => {
    it('enables the controller and makes a network request to fetch', async () => {
      const clientConfigApiService = buildClientConfigApiService();
      const controller = createController({
        clientConfigApiService,
        disabled: true,
      });

      controller.enable();
      await controller.updateRemoteFeatureFlags();
      expect(clientConfigApiService.fetchRemoteFeatureFlags).toHaveBeenCalled();
    });

    it('preserves cached flags and returns cached data when disabled', async () => {
      const clientConfigApiService = buildClientConfigApiService();
      const controller = createController({
        clientConfigApiService,
        disabled: false,
        state: { remoteFeatureFlags: MOCK_FLAGS, cacheTimestamp: 0 },
      });

      // Verify cache is preserved
      expect(controller.state.remoteFeatureFlags).toStrictEqual(MOCK_FLAGS);

      // Disable the controller
      controller.disable();

      // Verify disabled behavior,
      // cache should be preserved, but updateRemoteFeatureFlags should return empty array
      await controller.updateRemoteFeatureFlags();
      expect(controller.state.remoteFeatureFlags).toStrictEqual(MOCK_FLAGS);
      expect(controller.state.remoteFeatureFlags).toStrictEqual(MOCK_FLAGS);
    });
  });

  describe('Multi-version feature flags', () => {
    it('handles single version in versions array', async () => {
      const mockApiService = buildClientConfigApiService();
      const mockFlags = {
        singleVersionInArray: {
          versions: { '13.1.0': { x: '12' } },
        },
      };

      jest.spyOn(mockApiService, 'fetchRemoteFeatureFlags').mockResolvedValue({
        remoteFeatureFlags: mockFlags,
        cacheTimestamp: Date.now(),
      });

      const controller = createController({
        clientConfigApiService: mockApiService,
        clientVersion: '13.2.0',
      });

      await controller.updateRemoteFeatureFlags();

      const { singleVersionInArray } = controller.state.remoteFeatureFlags;
      expect(singleVersionInArray).toStrictEqual({ x: '12' });
    });

    it('selects highest version when app version qualifies for multiple', async () => {
      const mockApiService = buildClientConfigApiService();
      const mockFlags = {
        multiVersionFeature: {
          versions: {
            '13.2.0': { x: '13' },
            '13.1.0': { x: '12' },
            '13.0.5': { x: '11' },
          },
        },
      };

      jest.spyOn(mockApiService, 'fetchRemoteFeatureFlags').mockResolvedValue({
        remoteFeatureFlags: mockFlags,
        cacheTimestamp: Date.now(),
      });

      const controller = createController({
        clientConfigApiService: mockApiService,
        clientVersion: '13.2.5',
      });

      await controller.updateRemoteFeatureFlags();

      const { multiVersionFeature } = controller.state.remoteFeatureFlags;
      // Should get version 13.2.0 (highest version that 13.2.5 qualifies for)
      expect(multiVersionFeature).toStrictEqual({ x: '13' });
    });

    it('selects appropriate version based on app version', async () => {
      const mockApiService = buildClientConfigApiService();
      const mockFlags = {
        multiVersionFeature: {
          versions: {
            '13.2.0': { x: '13' },
            '13.1.0': { x: '12' },
            '13.0.5': { x: '11' },
          },
        },
        regularFeature: true,
      };

      jest.spyOn(mockApiService, 'fetchRemoteFeatureFlags').mockResolvedValue({
        remoteFeatureFlags: mockFlags,
        cacheTimestamp: Date.now(),
      });

      const controller = createController({
        clientConfigApiService: mockApiService,
        clientVersion: '13.1.5',
      });

      await controller.updateRemoteFeatureFlags();

      const { multiVersionFeature, regularFeature } =
        controller.state.remoteFeatureFlags;
      // Should get version 13.1.0 (highest version that 13.1.5 qualifies for)
      expect(multiVersionFeature).toStrictEqual({ x: '12' });
      expect(regularFeature).toBe(true);
    });

    it('excludes multi-version feature when no versions qualify', async () => {
      const mockApiService = buildClientConfigApiService();
      const mockFlags = {
        multiVersionFeature: {
          versions: {
            '13.2.0': { x: '13' },
            '13.1.0': { x: '12' },
          },
        },
        regularFeature: true,
      };

      jest.spyOn(mockApiService, 'fetchRemoteFeatureFlags').mockResolvedValue({
        remoteFeatureFlags: mockFlags,
        cacheTimestamp: Date.now(),
      });

      const controller = createController({
        clientConfigApiService: mockApiService,
        clientVersion: '13.0.0',
      });

      await controller.updateRemoteFeatureFlags();

      const { multiVersionFeature, regularFeature } =
        controller.state.remoteFeatureFlags;
      // Multi-version feature should be excluded (app version too low)
      expect(multiVersionFeature).toBeUndefined();
      // Regular feature should still be included
      expect(regularFeature).toBe(true);
    });

    it('handles mixed regular and multi-version flags', async () => {
      const mockApiService = buildClientConfigApiService();
      const mockFlags = {
        multiVersionFeature: {
          versions: {
            '13.2.0': { x: '13' },
            '13.0.0': { x: '11' },
          },
        },
        regularFeature: { enabled: true },
        simpleFeature: true,
      };

      jest.spyOn(mockApiService, 'fetchRemoteFeatureFlags').mockResolvedValue({
        remoteFeatureFlags: mockFlags,
        cacheTimestamp: Date.now(),
      });

      const controller = createController({
        clientConfigApiService: mockApiService,
        clientVersion: '13.1.5',
      });

      await controller.updateRemoteFeatureFlags();

      const { multiVersionFeature, regularFeature, simpleFeature } =
        controller.state.remoteFeatureFlags;
      expect(multiVersionFeature).toStrictEqual({ x: '11' });
      expect(regularFeature).toStrictEqual({ enabled: true });
      expect(simpleFeature).toBe(true);
    });

    it('excludes feature flags with invalid version structure and processes valid ones', async () => {
      const mockApiService = buildClientConfigApiService();
      const mockFlags = {
        invalidVersionFlag: {
          versions: 'not-an-object', // Invalid: versions should be an object
        },
        validVersionFlag: {
          versions: {
            '13.1.0': { x: '12' },
            '13.2.0': { x: '13' },
          },
        },
        validFlag: {
          versions: { '13.1.0': { x: '14' } },
        },
        regularFeature: true,
      };

      jest.spyOn(mockApiService, 'fetchRemoteFeatureFlags').mockResolvedValue({
        remoteFeatureFlags: mockFlags,
        cacheTimestamp: Date.now(),
      });

      const controller = createController({
        clientConfigApiService: mockApiService,
        clientVersion: '13.2.0',
      });

      await controller.updateRemoteFeatureFlags();

      const {
        invalidVersionFlag,
        validVersionFlag,
        validFlag,
        regularFeature,
      } = controller.state.remoteFeatureFlags;
      expect(invalidVersionFlag).toStrictEqual({
        versions: 'not-an-object', // Should remain unprocessed
      });
      // Valid version flag should be processed and return highest eligible version
      expect(validVersionFlag).toStrictEqual({ x: '13' });
      // Valid version flag should be processed
      expect(validFlag).toStrictEqual({ x: '14' });
      // Regular flag should remain unchanged
      expect(regularFeature).toBe(true);
    });

    it('combines multi-version flags with A/B testing (threshold-based scoped values)', async () => {
      const mockApiService = buildClientConfigApiService();
      const mockFlags = {
        multiVersionABFlag: {
          versions: {
            '13.1.0': [
              {
                name: 'groupA',
                scope: { type: 'threshold', value: 0.3 },
                value: { feature: 'A', enabled: true },
              },
              {
                name: 'groupB',
                scope: { type: 'threshold', value: 0.7 },
                value: { feature: 'B', enabled: false },
              },
              {
                name: 'groupC',
                scope: { type: 'threshold', value: 1.0 },
                value: { feature: 'C', enabled: true },
              },
            ],
            '13.2.0': [
              {
                name: 'newGroupA',
                scope: { type: 'threshold', value: 0.5 },
                value: { feature: 'NewA', enabled: false },
              },
              {
                name: 'newGroupB',
                scope: { type: 'threshold', value: 1.0 },
                value: { feature: 'NewB', enabled: true },
              },
            ],
          },
        },
        regularFlag: true,
      };

      jest.spyOn(mockApiService, 'fetchRemoteFeatureFlags').mockResolvedValue({
        remoteFeatureFlags: mockFlags,
        cacheTimestamp: Date.now(),
      });

      const controller = createController({
        clientConfigApiService: mockApiService,
        clientVersion: '13.1.5', // Qualifies for 13.1.0 version but not 13.2.0
        getMetaMetricsId: () => MOCK_METRICS_ID, // This generates threshold > 0.7
      });

      await controller.updateRemoteFeatureFlags();

      const { multiVersionABFlag, regularFlag } =
        controller.state.remoteFeatureFlags;
      // Should select 13.1.0 version and then apply A/B testing to that array
      // With MOCK_METRICS_ID threshold, should select groupC (threshold 1.0)
      expect(multiVersionABFlag).toStrictEqual({
        name: 'groupC',
        value: { feature: 'C', enabled: true },
      });
      expect(regularFlag).toBe(true);
    });
  });

  describe('getDefaultRemoteFeatureFlagControllerState', () => {
    it('should return default state', () => {
      expect(getDefaultRemoteFeatureFlagControllerState()).toStrictEqual({
        remoteFeatureFlags: {},
        localOverrides: {},
        rawProcessedRemoteFeatureFlags: {},
        cacheTimestamp: 0,
      });
    });
  });

  describe('override functionality', () => {
    describe('setFlagOverride', () => {
      it('sets a local override for a feature flag', () => {
        const controller = createController();

        controller.setFlagOverride('testFlag', true);

        expect(controller.state.localOverrides).toStrictEqual({
          testFlag: true,
        });
      });

      it('overwrites existing override for the same flag', () => {
        const controller = createController();

        controller.setFlagOverride('testFlag', true);
        controller.setFlagOverride('testFlag', false);

        expect(controller.state.localOverrides).toStrictEqual({
          testFlag: false,
        });
      });

      it('preserves other overrides when setting a new one', () => {
        const controller = createController();

        controller.setFlagOverride('flag1', 'value1');
        controller.setFlagOverride('flag2', 'value2');

        expect(controller.state.localOverrides).toStrictEqual({
          flag1: 'value1',
          flag2: 'value2',
        });
      });
    });

    describe('clearFlagOverride', () => {
      it('removes a specific override', () => {
        const controller = createController();

        controller.setFlagOverride('flag1', 'value1');
        controller.setFlagOverride('flag2', 'value2');
        controller.clearFlagOverride('flag1');

        expect(controller.state.localOverrides).toStrictEqual({
          flag2: 'value2',
        });
      });

      it('does not affect state when clearing non-existent override', () => {
        const controller = createController();

        controller.setFlagOverride('flag1', 'value1');
        controller.clearFlagOverride('nonExistentFlag');

        expect(controller.state.localOverrides).toStrictEqual({
          flag1: 'value1',
        });
      });
    });

    describe('clearAllOverrides', () => {
      it('removes all overrides', () => {
        const controller = createController();

        controller.setFlagOverride('flag1', 'value1');
        controller.setFlagOverride('flag2', 'value2');
        controller.clearAllOverrides();

        expect(controller.state.localOverrides).toStrictEqual({});
      });

      it('does not affect state when no overrides exist', () => {
        const controller = createController();

        controller.clearAllOverrides();

        expect(controller.state.localOverrides).toStrictEqual({});
      });
    });

    describe('integration with remote flags', () => {
      it('preserves overrides when remote flags are updated', async () => {
        const clientConfigApiService = buildClientConfigApiService({
          remoteFeatureFlags: { remoteFlag: 'initialRemoteValue' },
        });
        const controller = createController({ clientConfigApiService });

        // Set override before fetching remote flags
        controller.setFlagOverride('overrideFlag', 'overrideValue');

        await controller.updateRemoteFeatureFlags();

        // Mock different remote response for second fetch
        jest
          .spyOn(clientConfigApiService, 'fetchRemoteFeatureFlags')
          .mockResolvedValueOnce({
            remoteFeatureFlags: { remoteFlag: 'updatedRemoteValue' },
            cacheTimestamp: Date.now(),
          });

        // Force cache expiration and update
        jest
          .spyOn(Date, 'now')
          .mockReturnValue(Date.now() + DEFAULT_CACHE_DURATION + 1000);
        await controller.updateRemoteFeatureFlags();

        // Overrides should be preserved
        expect(controller.state.localOverrides).toStrictEqual({
          overrideFlag: 'overrideValue',
        });

        // Remote flags should be updated
        expect(controller.state.remoteFeatureFlags).toStrictEqual({
          remoteFlag: 'updatedRemoteValue',
        });
      });

      it('overrides work with threshold-based feature flags', async () => {
        const clientConfigApiService = buildClientConfigApiService({
          remoteFeatureFlags: MOCK_FLAGS_WITH_THRESHOLD,
        });
        const controller = createController({
          clientConfigApiService,
          getMetaMetricsId: () => MOCK_METRICS_ID,
        });

        await controller.updateRemoteFeatureFlags();

        // Override the threshold flag
        controller.setFlagOverride('testFlagForThreshold', 'overriddenValue');

        // Access flag value with override taking precedence
        const flagValue =
          controller.state.localOverrides.testFlagForThreshold ??
          controller.state.remoteFeatureFlags.testFlagForThreshold;
        expect(flagValue).toBe('overriddenValue');
      });
    });
  });

  describe('A/B Test visibility functionality', () => {
    describe('getAvailableABTestGroups', () => {
      it('returns available A/B test groups for threshold flags', async () => {
        const clientConfigApiService = buildClientConfigApiService({
          remoteFeatureFlags: MOCK_FLAGS_WITH_THRESHOLD,
        });
        const controller = createController({ clientConfigApiService });

        await controller.updateRemoteFeatureFlags();

        const groups =
          controller.state.rawProcessedRemoteFeatureFlags.testFlagForThreshold;

        expect(groups).toStrictEqual([
          {
            name: 'groupA',
            scope: { type: 'threshold', value: 0.3 },
            value: 'valueA',
          },
          {
            name: 'groupB',
            scope: { type: 'threshold', value: 0.5 },
            value: 'valueB',
          },
          {
            name: 'groupC',
            scope: { type: 'threshold', value: 1 },
            value: 'valueC',
          },
        ]);
      });

      it('returns undefined for non-array flags', async () => {
        const clientConfigApiService = buildClientConfigApiService({
          remoteFeatureFlags: { simpleFlag: true },
        });
        const controller = createController({ clientConfigApiService });

        await controller.updateRemoteFeatureFlags();

        expect(
          controller.state.rawProcessedRemoteFeatureFlags.simpleFlag,
        ).toBeUndefined();
      });

      it('returns undefined for non-existent flags', () => {
        const controller = createController();

        expect(
          controller.state.rawProcessedRemoteFeatureFlags.nonExistentFlag,
        ).toBeUndefined();
      });
    });

    describe('getAllABTestFlags', () => {
      it('returns all flags that have A/B test groups', async () => {
        const clientConfigApiService = buildClientConfigApiService({
          remoteFeatureFlags: {
            ...MOCK_FLAGS,
            testFlagForThreshold:
              MOCK_FLAGS_WITH_THRESHOLD.testFlagForThreshold,
            anotherThresholdFlag: [
              {
                name: 'optionA',
                scope: { type: 'threshold', value: 0.5 },
                value: 'A',
              },
              {
                name: 'optionB',
                scope: { type: 'threshold', value: 1 },
                value: 'B',
              },
            ],
          },
        });
        const controller = createController({ clientConfigApiService });

        await controller.updateRemoteFeatureFlags();

        const abTestFlags = controller.state.rawProcessedRemoteFeatureFlags;

        expect(Object.keys(abTestFlags)).toContain('testFlagForThreshold');
        expect(Object.keys(abTestFlags)).toContain('anotherThresholdFlag');
        expect(Object.keys(abTestFlags)).not.toContain('feature1'); // Simple flag, not A/B test
        expect(abTestFlags.testFlagForThreshold).toHaveLength(3);
        expect(abTestFlags.anotherThresholdFlag).toHaveLength(2);
      });

      it('returns empty object when no A/B test flags exist', async () => {
        const clientConfigApiService = buildClientConfigApiService({
          remoteFeatureFlags: MOCK_FLAGS, // No A/B test flags
        });
        const controller = createController({ clientConfigApiService });

        await controller.updateRemoteFeatureFlags();

        expect(controller.state.rawProcessedRemoteFeatureFlags).toStrictEqual(
          {},
        );
      });

      it('returns empty object when no flags exist', () => {
        const controller = createController();

        expect(controller.state.rawProcessedRemoteFeatureFlags).toStrictEqual(
          {},
        );
      });
    });

    describe('A/B test storage efficiency', () => {
      it('only stores raw values for A/B test flags, not simple flags', async () => {
        const clientConfigApiService = buildClientConfigApiService({
          remoteFeatureFlags: {
            simpleFlag: true,
            anotherSimpleFlag: 'value',
            testFlagForThreshold:
              MOCK_FLAGS_WITH_THRESHOLD.testFlagForThreshold,
          },
        });
        const controller = createController({ clientConfigApiService });

        await controller.updateRemoteFeatureFlags();

        // Only A/B test flags should be stored in rawProcessedRemoteFeatureFlags
        expect(
          Object.keys(controller.state.rawProcessedRemoteFeatureFlags),
        ).toStrictEqual(['testFlagForThreshold']);
        expect(
          controller.state.rawProcessedRemoteFeatureFlags.testFlagForThreshold,
        ).toStrictEqual(MOCK_FLAGS_WITH_THRESHOLD.testFlagForThreshold);

        // Simple flags should not be in rawProcessedRemoteFeatureFlags
        expect(
          controller.state.rawProcessedRemoteFeatureFlags.simpleFlag,
        ).toBeUndefined();
        expect(
          controller.state.rawProcessedRemoteFeatureFlags.anotherSimpleFlag,
        ).toBeUndefined();
      });
    });

    describe('integration with overrides', () => {
      it('allows overriding with specific A/B test group values', async () => {
        const clientConfigApiService = buildClientConfigApiService({
          remoteFeatureFlags: MOCK_FLAGS_WITH_THRESHOLD,
        });
        const controller = createController({
          clientConfigApiService,
          getMetaMetricsId: () => MOCK_METRICS_ID,
        });

        await controller.updateRemoteFeatureFlags();

        // Get available groups
        const groups =
          controller.state.rawProcessedRemoteFeatureFlags.testFlagForThreshold;
        expect(groups).toBeDefined();
        // Ensure groups is not undefined before accessing array elements
        if (!groups) {
          throw new Error('Expected groups to be defined');
        }
        expect(groups).toHaveLength(3); // Expecting 3 groups based on MOCK_FLAGS_WITH_THRESHOLD

        // Override with a specific group value
        const firstGroup =
          Array.isArray(groups) && groups.length > 0 ? groups[0] : null;
        const groupValue =
          firstGroup && typeof firstGroup === 'object' && 'value' in firstGroup
            ? firstGroup.value
            : 'valueA';
        controller.setFlagOverride('testFlagForThreshold', groupValue); // groupA value

        // Access flag value with override taking precedence
        const flagValue =
          controller.state.localOverrides.testFlagForThreshold ??
          controller.state.remoteFeatureFlags.testFlagForThreshold;
        expect(flagValue).toBe('valueA');
      });

      it('preserves A/B test raw flags when overrides are set', async () => {
        const clientConfigApiService = buildClientConfigApiService({
          remoteFeatureFlags: MOCK_FLAGS_WITH_THRESHOLD,
        });
        const controller = createController({ clientConfigApiService });

        await controller.updateRemoteFeatureFlags();
        controller.setFlagOverride('testFlagForThreshold', 'overrideValue');

        // A/B test raw flags should still be available
        const groups =
          controller.state.rawProcessedRemoteFeatureFlags.testFlagForThreshold;
        expect(groups).toHaveLength(3);
        expect(
          controller.state.rawProcessedRemoteFeatureFlags.testFlagForThreshold,
        ).toStrictEqual(MOCK_FLAGS_WITH_THRESHOLD.testFlagForThreshold);
      });
    });
  });

  describe('metadata', () => {
    it('includes expected state in debug snapshots', () => {
      const controller = createController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInDebugSnapshot',
        ),
      ).toMatchInlineSnapshot(`
        Object {
          "rawProcessedRemoteFeatureFlags": Object {},
          "cacheTimestamp": 0,
          "localOverrides": Object {},
          "remoteFeatureFlags": Object {},
        }
      `);
    });

    it('includes expected state in state logs', () => {
      const controller = createController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInStateLogs',
        ),
      ).toMatchInlineSnapshot(`
        Object {
          "rawProcessedRemoteFeatureFlags": Object {},
          "cacheTimestamp": 0,
          "localOverrides": Object {},
          "remoteFeatureFlags": Object {},
        }
      `);
    });

    it('persists expected state', () => {
      const controller = createController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'persist',
        ),
      ).toMatchInlineSnapshot(`
        Object {
          "rawProcessedRemoteFeatureFlags": Object {},
          "cacheTimestamp": 0,
          "localOverrides": Object {},
          "remoteFeatureFlags": Object {},
        }
      `);
    });

    it('exposes expected state to UI', () => {
      const controller = createController();

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'usedInUi',
        ),
      ).toMatchInlineSnapshot(`
        Object {
          "localOverrides": Object {},
          "remoteFeatureFlags": Object {},
        }
      `);
    });
  });
});

type AllRemoteFeatureFlagControllerActions =
  MessengerActions<RemoteFeatureFlagControllerMessenger>;

type AllRemoteFeatureFlagControllerEvents =
  MessengerEvents<RemoteFeatureFlagControllerMessenger>;

type RootMessenger = Messenger<
  MockAnyNamespace,
  AllRemoteFeatureFlagControllerActions,
  AllRemoteFeatureFlagControllerEvents
>;

/**
 * Creates and returns a root messenger for testing
 *
 * @returns A messenger instance
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });
}

/**
 * Creates a messenger for the RemoteFeatureFlagController
 *
 * @returns A messenger instance
 */
function getMessenger(): RemoteFeatureFlagControllerMessenger {
  const rootMessenger = getRootMessenger();
  return new Messenger<
    typeof controllerName,
    AllRemoteFeatureFlagControllerActions,
    AllRemoteFeatureFlagControllerEvents,
    RootMessenger
  >({
    namespace: controllerName,
    parent: rootMessenger,
  });
}

/**
 * Builds a mock client config API service for testing
 *
 * @param options - The options object
 * @param options.remoteFeatureFlags - Optional feature flags data to return
 * @param options.cacheTimestamp - Optional timestamp to use for the cache
 * @param options.error - Optional error to simulate API failure
 * @returns A mock client config API service
 */
function buildClientConfigApiService({
  remoteFeatureFlags,
  cacheTimestamp,
  error,
}: {
  remoteFeatureFlags?: FeatureFlags;
  cacheTimestamp?: number;
  error?: Error;
} = {}): AbstractClientConfigApiService {
  return {
    fetchRemoteFeatureFlags: jest.fn().mockImplementation(() => {
      if (error) {
        return Promise.reject(error);
      }
      return Promise.resolve({
        remoteFeatureFlags: remoteFeatureFlags ?? MOCK_FLAGS,
        cacheTimestamp: cacheTimestamp ?? Date.now(),
      });
    }),
  };
}
