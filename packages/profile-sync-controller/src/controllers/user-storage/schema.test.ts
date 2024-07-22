import { getFeatureAndKeyFromPath, USER_STORAGE_SCHEMA } from './schema';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ErroneousUserStoragePath = any;

describe('user-storage/schema.ts', () => {
  describe('getFeatureAndKeyFromPath', () => {
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
  });
});
