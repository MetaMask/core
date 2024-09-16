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
          'notifications.notificationSettings',
          'dbdc994804e591f7bef6695e525543712358dd5c952bd257560b629887972588',
        ),
      ).toBe(
        'notifications/2072257b71d53b6cb8e72bab8e801e3d66faa0d5e1b822c88af466127e5e763b',
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
      const path = 'notifications.notificationSettings';
      const result = getFeatureAndKeyFromPath(path);
      expect(result).toStrictEqual({
        feature: 'notifications',
        key: 'notificationSettings',
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
