import {
  Env,
  getEnvUrls,
  controllerName,
  SubscriptionControllerErrorMessage,
} from './constants';

describe('constants', () => {
  describe('getEnvUrls', () => {
    it('should return correct URLs for dev environment', () => {
      const result = getEnvUrls(Env.DEV);
      expect(result).toStrictEqual({
        subscriptionApiUrl:
          'https://subscription-service.dev-api.cx.metamask.io',
      });
    });

    it('should return correct URLs for uat environment', () => {
      const result = getEnvUrls(Env.UAT);
      expect(result).toStrictEqual({
        subscriptionApiUrl:
          'https://subscription-service.uat-api.cx.metamask.io',
      });
    });

    it('should return correct URLs for prd environment', () => {
      const result = getEnvUrls(Env.PRD);
      expect(result).toStrictEqual({
        subscriptionApiUrl: 'https://subscription-service.api.cx.metamask.io',
      });
    });

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

  describe('Env enum', () => {
    it('should have correct values', () => {
      expect(Env.DEV).toBe('dev');
      expect(Env.UAT).toBe('uat');
      expect(Env.PRD).toBe('prd');
    });
  });

  describe('SubscriptionControllerErrorMessage', () => {
    it('should have correct error messages', () => {
      expect(SubscriptionControllerErrorMessage.UserAlreadySubscribed).toBe(
        'SubscriptionController - User is already subscribed',
      );
      expect(SubscriptionControllerErrorMessage.UserNotSubscribed).toBe(
        'SubscriptionController - User is not subscribed',
      );
    });
  });
});
