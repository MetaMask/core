import type { Env } from './constants';
import { getEnvUrls, controllerName } from './constants';

describe('constants', () => {
  describe('getEnvUrls', () => {
    it('should throw error for invalid environment', () => {
      // Type assertion to test invalid environment
      const invalidEnv = 'invalid' as Env;

      expect(() => getEnvUrls(invalidEnv)).toThrow(
        'invalid environment configuration',
      );
    });
  });

  describe('controllerName', () => {
    it('should be defined and equal to expected value', () => {
      expect(controllerName).toBe('SubscriptionController');
    });
  });
});
