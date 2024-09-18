import {
  createEntryPath,
  getFeatureAndKeyFromPath,
  USER_STORAGE_SCHEMA,
} from './schema';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ErroneousUserStoragePath = any;

describe('user-storage/schema.ts', () => {
  describe('getFeatureAndKeyFromPath', () => {
    it('should correctly construct user storage url', () => {
      expect(
        createEntryPath(
          'notifications.notification_settings',
          'dbdc994804e591f7bef6695e525543712358dd5c952bd257560b629887972588',
        ),
      ).toBe(
        'notifications/94739860a3472f61e0802706abbbbf7c8d843f8ec0ad0bef3964e52fb9b72132',
      );
    });

    it('should throw error if the feature.key format is incorrect', () => {
      const path = 'feature/key';
      expect(() =>
        getFeatureAndKeyFromPath(path as ErroneousUserStoragePath),
      ).toThrow(
        "user-storage - path is not in the correct format. Correct format: 'feature.key'",
      );
    });

    it('should throw error if feature is invalid', () => {
      const path = 'invalid.feature';
      expect(() =>
        getFeatureAndKeyFromPath(path as ErroneousUserStoragePath),
      ).toThrow('user-storage - invalid feature provided: invalid');
    });

    it('should throw error if key is invalid', () => {
      const feature = 'notifications';
      const path = `${feature}.invalid`;
      const validKeys = USER_STORAGE_SCHEMA[feature].join(', ');

      expect(() =>
        getFeatureAndKeyFromPath(path as ErroneousUserStoragePath),
      ).toThrow(
        `user-storage - invalid key provided for this feature: invalid. Valid keys: ${validKeys}`,
      );
    });

    it('should return feature and key from path', () => {
      const path = 'notifications.notification_settings';
      const result = getFeatureAndKeyFromPath(path);
      expect(result).toStrictEqual({
        feature: 'notifications',
        key: 'notification_settings',
      });
    });

    it('should return feature and key from path with arbitrary key', () => {
      const path = 'accounts.0x123';
      const result = getFeatureAndKeyFromPath(path);
      expect(result).toStrictEqual({
        feature: 'accounts',
        key: '0x123',
      });
    });
  });
});
