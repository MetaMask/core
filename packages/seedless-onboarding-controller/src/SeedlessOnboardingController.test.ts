import { SeedlessOnboardingController } from './SeedlessOnboardingController';
import type { SeedlessOnboardingControllerMessenger } from './types';

/**
 * Creates a mock user operation messenger.
 *
 * @returns The mock user operation messenger.
 */
function buildSeedlessOnboardingControllerMessenger() {
  return {
    call: jest.fn(),
    publish: jest.fn(),
    registerActionHandler: jest.fn(),
    registerInitialEventPayload: jest.fn(),
    subscribe: jest.fn(),
  } as unknown as jest.Mocked<SeedlessOnboardingControllerMessenger>;
}

describe('SeedlessOnboardingController', () => {
  describe('constructor', () => {
    it('should use the default encryptor if none is provided', () => {
      const messenger = buildSeedlessOnboardingControllerMessenger();
      expect(
        () =>
          new SeedlessOnboardingController({
            messenger,
          }),
      ).not.toThrow();
    });

    it('should be able to overwrite the default encryptor', () => {
      const messenger = buildSeedlessOnboardingControllerMessenger();
      const encryptor = {
        encrypt: jest.fn(),
        decrypt: jest.fn(),
      };

      expect(
        () =>
          new SeedlessOnboardingController({
            messenger,
            encryptor,
          }),
      ).not.toThrow();
    });

    it('should be able to overwrite the default state', () => {
      const messenger = buildSeedlessOnboardingControllerMessenger();
      const controller = new SeedlessOnboardingController({
        messenger,
        state: { isNewUser: false, vault: 'test' },
      });

      expect(controller.state).toStrictEqual({
        isNewUser: false,
        vault: 'test',
      });
    });
  });
});
