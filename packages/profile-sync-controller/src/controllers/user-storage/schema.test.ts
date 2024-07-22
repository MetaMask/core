import {
  getFeatureAndKeyFromPath,
  USER_STORAGE_SCHEMA,
  validatePath,
} from './schema';

describe('user-storage/schema.ts', () => {
  describe('getFeatureAndKeyFromPath', () => {
    it('should return feature and key from path', () => {
      const path = 'notifications.notificationSettings';
      const result = getFeatureAndKeyFromPath(path);
      expect(result).toStrictEqual({
        feature: 'notifications',
        key: 'notificationSettings',
      });
    });
  });

  describe('validatePath', () => {
    it('should throw error if feature is invalid', () => {
      const path = 'invalid.feature';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => validatePath(path as any)).toThrow(
        'user-storage - invalid feature provided: invalid',
      );
    });

    it('should throw error if key is invalid', () => {
      const feature = 'notifications';
      const path = `${feature}.invalid`;
      const validKeys = USER_STORAGE_SCHEMA[feature].join(', ');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => validatePath(path as any)).toThrow(
        `user-storage - invalid key provided for this feature: invalid. Valid keys: ${validKeys}`,
      );
    });
  });
});
