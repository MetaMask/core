import { ControllerMessenger } from '@metamask/base-controller';
import type { Json } from '@metamask/utils';

import type { HasPermissions } from './PermissionController';
import type {
  SubjectMetadataControllerActions,
  SubjectMetadataControllerEvents,
} from './SubjectMetadataController';
import {
  SubjectMetadataController,
  SubjectType,
} from './SubjectMetadataController';

const controllerName = 'SubjectMetadataController';

/**
 * Utility function for creating a controller messenger.
 *
 * @returns A tuple containing the messenger and a spy for the "hasPermission" action handler
 */
function getSubjectMetadataControllerMessenger() {
  const controllerMessenger = new ControllerMessenger<
    SubjectMetadataControllerActions | HasPermissions,
    SubjectMetadataControllerEvents
  >();

  const hasPermissionsSpy = jest.fn();
  controllerMessenger.registerActionHandler(
    'PermissionController:hasPermissions',
    hasPermissionsSpy,
  );

  return [
    controllerMessenger.getRestricted<
      typeof controllerName,
      HasPermissions['type']
    >({
      name: controllerName,
      allowedActions: ['PermissionController:hasPermissions'],
      allowedEvents: [],
    }),
    hasPermissionsSpy,
  ] as const;
}

/**
 * Utility function for building subject metadata.
 *
 * @param origin - The subject's origin
 * @param name - Optional subject name
 * @param subjectType - Optional subject type
 * @param opts - Optional extra options for the metadata
 * @returns The created metadata object
 */
function getSubjectMetadata(
  origin: string,
  name: string | null = null,
  subjectType: SubjectType | null = null,
  opts?: Record<string, Json>,
) {
  return {
    origin,
    name,
    subjectType,
    iconUrl: null,
    extensionId: null,
    ...opts,
  };
}

describe('SubjectMetadataController', () => {
  describe('constructor', () => {
    it('initializes a subject metadata controller', () => {
      const controller = new SubjectMetadataController({
        messenger: getSubjectMetadataControllerMessenger()[0],
        subjectCacheLimit: 10,
      });
      expect(controller.state).toStrictEqual({ subjectMetadata: {} });
    });

    it('trims subject metadata state on startup', () => {
      const [messenger, hasPermissionsSpy] =
        getSubjectMetadataControllerMessenger();
      hasPermissionsSpy.mockImplementationOnce(() => false);
      hasPermissionsSpy.mockImplementationOnce(() => true);

      const controller = new SubjectMetadataController({
        messenger,
        subjectCacheLimit: 10,
        state: {
          subjectMetadata: {
            'foo.com': getSubjectMetadata('foo.com', 'foo'),
            'bar.io': getSubjectMetadata('bar.io', 'bar'),
          },
        },
      });

      expect(controller.state).toStrictEqual({
        subjectMetadata: { 'bar.io': getSubjectMetadata('bar.io', 'bar') },
      });
    });

    it('throws if the subject cache limit is invalid', () => {
      [0, -1, 1.1].forEach((subjectCacheLimit) => {
        expect(
          () =>
            new SubjectMetadataController({
              messenger: getSubjectMetadataControllerMessenger()[0],
              subjectCacheLimit,
            }),
        ).toThrow(
          `subjectCacheLimit must be a positive integer. Received: "${subjectCacheLimit}"`,
        );
      });
    });
  });

  describe('clearState', () => {
    it('clears the controller state, and continues to function normally afterwards', () => {
      const [messenger, hasPermissionsSpy] =
        getSubjectMetadataControllerMessenger();
      const controller = new SubjectMetadataController({
        messenger,
        subjectCacheLimit: 3,
      });

      // No subject will have permissions.
      hasPermissionsSpy.mockImplementation(() => false);

      // Add subjects up to the cache limit
      controller.addSubjectMetadata(getSubjectMetadata('foo.com', 'foo'));
      controller.addSubjectMetadata(getSubjectMetadata('bar.com', 'bar'));
      controller.addSubjectMetadata(getSubjectMetadata('baz.com', 'baz'));

      expect(Object.keys(controller.state.subjectMetadata)).toHaveLength(3);

      // Clear the state
      controller.clearState();
      expect(Object.keys(controller.state.subjectMetadata)).toHaveLength(0);

      // Add another subject, which also does not have any permissions
      controller.addSubjectMetadata(getSubjectMetadata('fizz.com', 'fizz'));

      // Observe that the subject was added normally
      expect(controller.state).toStrictEqual({
        subjectMetadata: { 'fizz.com': getSubjectMetadata('fizz.com', 'fizz') },
      });
    });
  });

  describe('addSubjectMetadata', () => {
    it('adds subject metadata', () => {
      const controller = new SubjectMetadataController({
        messenger: getSubjectMetadataControllerMessenger()[0],
        subjectCacheLimit: 10,
      });

      controller.addSubjectMetadata(getSubjectMetadata('foo.com', 'foo'));
      controller.addSubjectMetadata(getSubjectMetadata('bar.com'));
      expect(controller.state).toStrictEqual({
        subjectMetadata: {
          'foo.com': getSubjectMetadata('foo.com', 'foo'),
          'bar.com': getSubjectMetadata('bar.com'),
        },
      });
    });

    it('fills in missing fields of added subject metadata', () => {
      const controller = new SubjectMetadataController({
        messenger: getSubjectMetadataControllerMessenger()[0],
        subjectCacheLimit: 10,
      });

      controller.addSubjectMetadata({ origin: 'foo.com', name: 'foo' });
      expect(controller.state).toStrictEqual({
        subjectMetadata: { 'foo.com': getSubjectMetadata('foo.com', 'foo') },
      });
    });

    it('does not delete metadata for subjects with permissions if cache size is exceeded', () => {
      const [messenger, hasPermissionsSpy] =
        getSubjectMetadataControllerMessenger();
      const controller = new SubjectMetadataController({
        messenger,
        subjectCacheLimit: 1,
      });
      hasPermissionsSpy.mockImplementationOnce(() => true);

      controller.addSubjectMetadata({ origin: 'foo.com', name: 'foo' });
      controller.addSubjectMetadata({ origin: 'bar.io', name: 'bar' });
      expect(controller.state).toStrictEqual({
        subjectMetadata: {
          'foo.com': getSubjectMetadata('foo.com', 'foo'),
          'bar.io': getSubjectMetadata('bar.io', 'bar'),
        },
      });
    });

    it('deletes metadata for subjects without permissions if cache size is exceeded', () => {
      const [messenger, hasPermissionsSpy] =
        getSubjectMetadataControllerMessenger();
      const controller = new SubjectMetadataController({
        messenger,
        subjectCacheLimit: 1,
      });
      hasPermissionsSpy.mockImplementationOnce(() => false);

      controller.addSubjectMetadata({ origin: 'foo.com', name: 'foo' });
      controller.addSubjectMetadata({ origin: 'bar.io', name: 'bar' });
      expect(controller.state).toStrictEqual({
        subjectMetadata: {
          'bar.io': getSubjectMetadata('bar.io', 'bar'),
        },
      });
    });
  });

  describe('getSubjectMetadata', () => {
    it('returns the subject metadata for the given origin', () => {
      const [messenger, hasPermissionsSpy] =
        getSubjectMetadataControllerMessenger();
      const controller = new SubjectMetadataController({
        messenger,
        subjectCacheLimit: 1,
      });
      hasPermissionsSpy.mockImplementationOnce(() => true);

      controller.addSubjectMetadata(
        getSubjectMetadata('foo.com', 'foo', SubjectType.Snap),
      );

      controller.addSubjectMetadata(
        getSubjectMetadata('bar.io', 'bar', SubjectType.Website),
      );

      expect(controller.getSubjectMetadata('foo.com')).toStrictEqual(
        getSubjectMetadata('foo.com', 'foo', SubjectType.Snap),
      );

      expect(controller.getSubjectMetadata('bar.io')).toStrictEqual(
        getSubjectMetadata('bar.io', 'bar', SubjectType.Website),
      );
    });
  });

  describe('trimMetadataState', () => {
    it('deletes all subjects without permissions from state', () => {
      const [messenger, hasPermissionsSpy] =
        getSubjectMetadataControllerMessenger();
      const controller = new SubjectMetadataController({
        messenger,
        subjectCacheLimit: 4,
      });

      controller.addSubjectMetadata({ origin: 'A', name: 'a' });
      controller.addSubjectMetadata({ origin: 'B', name: 'b' });
      controller.addSubjectMetadata({ origin: 'C', name: 'c' });
      controller.addSubjectMetadata({ origin: 'D', name: 'd' });
      expect(controller.state).toStrictEqual({
        subjectMetadata: {
          A: getSubjectMetadata('A', 'a'),
          B: getSubjectMetadata('B', 'b'),
          C: getSubjectMetadata('C', 'c'),
          D: getSubjectMetadata('D', 'd'),
        },
      });

      hasPermissionsSpy.mockImplementationOnce(() => true);
      hasPermissionsSpy.mockImplementationOnce(() => false);
      hasPermissionsSpy.mockImplementationOnce(() => false);
      hasPermissionsSpy.mockImplementationOnce(() => true);

      controller.trimMetadataState();
      expect(controller.state).toStrictEqual({
        subjectMetadata: {
          A: getSubjectMetadata('A', 'a'),
          D: getSubjectMetadata('D', 'd'),
        },
      });
    });
  });

  describe('controller actions', () => {
    it(':getSubjectMetadata returns the subject metadata', () => {
      const [messenger, hasPermissionsSpy] =
        getSubjectMetadataControllerMessenger();
      const controller = new SubjectMetadataController({
        messenger,
        subjectCacheLimit: 100,
      });
      hasPermissionsSpy.mockImplementationOnce(() => true);

      controller.addSubjectMetadata(
        getSubjectMetadata('foo.com', 'foo', SubjectType.Snap),
      );

      controller.addSubjectMetadata(
        getSubjectMetadata('bar.io', 'bar', SubjectType.Website),
      );

      expect(
        messenger.call(
          'SubjectMetadataController:getSubjectMetadata',
          'foo.com',
        ),
      ).toStrictEqual(getSubjectMetadata('foo.com', 'foo', SubjectType.Snap));

      expect(
        messenger.call(
          'SubjectMetadataController:getSubjectMetadata',
          'bar.io',
        ),
      ).toStrictEqual(getSubjectMetadata('bar.io', 'bar', SubjectType.Website));
    });

    it(':addSubjectMetadata adds passed subject metadata', () => {
      const [messenger, hasPermissionsSpy] =
        getSubjectMetadataControllerMessenger();
      const controller = new SubjectMetadataController({
        messenger,
        subjectCacheLimit: 100,
      });
      hasPermissionsSpy.mockImplementationOnce(() => true);

      messenger.call(
        'SubjectMetadataController:addSubjectMetadata',
        getSubjectMetadata('foo.com', 'foo', SubjectType.Snap),
      );

      messenger.call(
        'SubjectMetadataController:addSubjectMetadata',
        getSubjectMetadata('bar.io', 'bar', SubjectType.Website),
      );

      expect(controller.getSubjectMetadata('foo.com')).toStrictEqual(
        getSubjectMetadata('foo.com', 'foo', SubjectType.Snap),
      );

      expect(controller.getSubjectMetadata('bar.io')).toStrictEqual(
        getSubjectMetadata('bar.io', 'bar', SubjectType.Website),
      );
    });
  });
});
